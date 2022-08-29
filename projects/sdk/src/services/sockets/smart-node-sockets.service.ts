import { Injectable } from '@angular/core';
import { Observable, Subject, Subscriber } from 'rxjs';
import { SmartNodeSocket } from './smart-socket/smart-socket.class';
import { Node } from '../network/interfaces/node.interface';
import * as lodash from 'lodash';

@Injectable({
  providedIn: 'root'
})
export class SmartNodeSocketsService {
  private nodesSockets: Array<SmartNodeSocket> = new Array<SmartNodeSocket>();
  private nodesOnline: Map<string, any> = new Map<string, any>();
  
  private socketObserver = new Subject<any>();
  private socketObservable = this.socketObserver.asObservable();

  private mainSocket: SmartNodeSocket;

  constructor() {}

  async init(currentNode: Node, authSession: any, network: Array<Node>): Promise<void> {
    return new Promise(async(resolve, reject) => {
      try {
        let wallet = lodash.get(authSession.accountIds, 0);
        
        await this.initNodes(wallet, network);
        await this.initAuth(wallet, currentNode);
       
        resolve();
      } catch(error) {
        reject(error);
      }
    });   
  }

  getMainSocket(): SmartNodeSocket {
    return this.mainSocket;
  }

  getSocketObserver(): Observable<any> {
    return this.socketObservable;
  }

  getNodesOnline(): Map<string, any> {
    return this.nodesOnline;
  }

  async sendMessageToSmartNodes(payload: any, topic: string) {
    this.mainSocket.emit(topic, payload);
  }

  authorizeWallet(): void {
    this.mainSocket.disconnect();
    this.mainSocket.connect();
  }

  initMainSocket(currentNode: Node): SmartNodeSocket {
    this.nodesSockets.forEach(nodeSocket => {
      let node = nodeSocket.getNode();

      if(node.operator == currentNode.operator) {
        this.mainSocket = nodeSocket;
      }
    });

    return this.mainSocket;
  }

  async reserveNft(tokenId: string, walletId: string): Promise<number> {
    return new Promise(async(resolve, reject) => {
      try {
        this.mainSocket.fromOneTimeEvent('reserveNft').then((response: number) => {
          resolve(response);
        }).catch(error => {
          reject(error);
        });

        this. mainSocket.emit('reserveNft', {
          tokenId: tokenId,
          walletId: walletId
        });
      } catch(error) {
        reject(error);
      }
    });
  }

  async mintLpNft(joinPool: any): Promise<any> {
    return new Promise(async(resolve, reject) => {
      try {
        this.mainSocket.fromOneTimeEvent('mintLpNft').then((response: {status: string, payload: any, error: string}) => {
          if(response.status == 'success') {
            resolve(response.payload);
          } else {
            reject(new Error(response.error));
          }
        }).catch(error => {
          reject(error);
        });

        this.mainSocket.emit('mintLpNft', {
          joinPool: joinPool
        });
      } catch(error) {
        reject(error);
      }
    });
  }
  
  async initAuth(wallet: string | null, currentNode: Node): Promise<boolean> {
    return new Promise(async (resolve, reject) => {
      this.mainSocket = this.initMainSocket(currentNode);

      this.mainSocket.fromEvent('events').subscribe((message: any) => {
        this.socketObserver.next({
          event: 'events',
          content: {
            method: 'events',
            ...message
          }
        });
      });

      this.mainSocket.fromEvent('errors').subscribe(async(message: any) => {
        this.socketObserver.next({
          event: 'errors',
          content: {
            method: 'error',
            ...message
          }
        });
      });

      this.mainSocket.fromEvent('authenticate').subscribe(async (auth: any) => {
        if (auth.isValidSignature) {
          this.socketObserver.next({
            event: 'auth',
            content: {
              message: `You are safely connected to the node ${this.mainSocket.getNode().operator} on Hsuite Network`,
              method: 'authenticate',
              type: 'success'
            }
          });
        } else {
          this.socketObserver.next({
            event: 'auth',
            content: {
              message: `<b>You are now connected to node ${this.mainSocket.getNode().operator}</b> 
              <br />For security reasons, authentication will be required every time the DAPP connects to a different node of the network.`,
              method: 'authenticate',
              type: 'warning'
            }
          });
        }
      });

      this.mainSocket.fromEvent('authentication').subscribe(async (authResponse: any) => {
        this.socketObserver.next({
          event: 'auth',
          content: {
            message: 'Please authenticate your wallet in order to safely use the app...',
            method: 'authentication',
            type: 'loading',
            data: {
              authResponse: authResponse,
              wallet: wallet
            }
          }
        });
      });

      resolve(true);
    });
  }

  async initNodes(wallet: string | null, network: Array<Node>): Promise<Array<SmartNodeSocket>> {
    return new Promise(async (resolve, reject) => {
      try {
        if (this.nodesSockets.length) {
          this.nodesSockets.forEach(socket => {
            socket.disconnect();
          });
        }

        this.nodesSockets = new Array<SmartNodeSocket>();
        this.nodesOnline = new Map<string, any>();
        
        network.forEach(node => {
          let nodeSocket = new SmartNodeSocket(node, wallet);

          this.nodesOnline.set(nodeSocket.getNode().operator, {
            node: nodeSocket.getNode(),
            online: false
          });

          nodeSocket.on("connect", () => {
            this.nodesOnline.set(nodeSocket.getNode().operator, {
              node: nodeSocket.getNode(),
              online: true
            });
          });

          nodeSocket.on("disconnect", () => {
            this.nodesOnline.set(nodeSocket.getNode().operator, {
              node: nodeSocket.getNode(),
              online: false
            });
          });

          nodeSocket.connect();

          this.nodesSockets.push(nodeSocket);
        });

        resolve(this.nodesSockets);
      } catch (error) {
        reject(error);
      }
    });
  }
}