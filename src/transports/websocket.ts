import type { Transport, LogLevel, LogFormat } from '../types';
import * as format from '../format';

export interface WebSocketTransportOptions {
  url: string; // ws:// lub wss://
  protocols?: string | string[];
  clientOptions?: any; // przekazywane do new WebSocket(url, protocols, clientOptions)
  level?: LogLevel;
  format?: LogFormat;
  queueMax?: number; // limit bufora przed połączeniem
}

export class WebSocketTransport implements Transport {
  public level?: LogLevel;
  public format?: LogFormat;

  private ws: any;
  private ready = false;
  private queue: string[] = [];
  private queueMax: number;
  private WSClass: any;

  constructor(options: WebSocketTransportOptions) {
    this.level = options.level;
    this.format = options.format || format.defaultJsonFormat;
    this.queueMax = options.queueMax ?? 1000;

    try {
      // Lazy load (unikanie błędów gdy 'ws' nie jest zainstalowany)
      this.WSClass = require('ws');
    } catch {
      console.error(
        '[scribelog] WebSocketTransport requires "ws" package. Please install it: npm i ws'
      );
      this.WSClass = null;
    }

    if (this.WSClass) {
      this.ws = new this.WSClass(
        options.url,
        options.protocols,
        options.clientOptions
      );
      this.ws.on('open', () => {
        this.ready = true;
        // Wyślij zaległą kolejkę
        for (const msg of this.queue) this.ws.send(msg);
        this.queue.length = 0;
      });
      this.ws.on('error', (err: any) => {
        console.error('[scribelog] WebSocketTransport error:', err);
      });
      this.ws.on('close', () => {
        this.ready = false;
      });
    }
  }

  log(processedEntry: Record<string, any> | string): void {
    if (!this.WSClass || !this.ws) return;

    let payload: string;
    if (typeof processedEntry === 'string') {
      payload = processedEntry;
    } else {
      const out = (this.format || format.defaultJsonFormat)(processedEntry);
      payload = typeof out === 'string' ? out : JSON.stringify(out);
    }

    if (this.ready) {
      try {
        this.ws.send(payload);
      } catch (e) {
        console.error('[scribelog] WebSocketTransport send error:', e);
      }
    } else {
      if (this.queue.length < this.queueMax) {
        this.queue.push(payload);
      } else {
        console.warn('[scribelog] WebSocketTransport queue full, dropping log');
      }
    }
  }

  close(): void {
    try {
      this.ws?.close();
    } catch {
      /* noop */
    }
  }
}
