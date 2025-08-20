import type { Transport, LogLevel, LogFormat } from '../types';
import * as net from 'net';
import * as format from '../format';

export interface TcpTransportOptions {
  host: string;
  port: number;
  level?: LogLevel;
  format?: LogFormat;
  reconnect?: boolean; // prosty reconnect
}

export class TcpTransport implements Transport {
  public level?: LogLevel;
  public format?: LogFormat;

  private socket: net.Socket;
  private queue: string[] = [];
  private connected = false;
  private reconnect: boolean;
  private host: string;
  private port: number;

  constructor(options: TcpTransportOptions) {
    this.level = options.level;
    this.format = options.format || format.defaultJsonFormat;
    this.reconnect = options.reconnect ?? true;
    this.host = options.host;
    this.port = options.port;

    this.socket = new net.Socket();
    this.attachHandlers();
    this.socket.connect(this.port, this.host);
  }

  private attachHandlers() {
    this.socket.on('connect', () => {
      this.connected = true;
      // flush queue
      for (const line of this.queue) this.socket.write(line + '\n');
      this.queue.length = 0;
    });
    this.socket.on('error', (err) => {
      console.error('[scribelog] TcpTransport error:', err);
    });
    this.socket.on('close', () => {
      this.connected = false;
      if (this.reconnect) {
        setTimeout(() => {
          try {
            this.socket.connect(this.port, this.host);
          } catch {
            /* noop */
          }
        }, 500);
      }
    });
  }

  log(processedEntry: Record<string, any> | string): void {
    let line: string;
    if (typeof processedEntry === 'string') {
      line = processedEntry;
    } else {
      const out = (this.format || format.defaultJsonFormat)(processedEntry);
      line = typeof out === 'string' ? out : JSON.stringify(out);
    }
    if (this.connected) {
      try {
        this.socket.write(line + '\n');
      } catch (e) {
        console.error('[scribelog] TcpTransport write error:', e);
      }
    } else {
      this.queue.push(line);
    }
  }

  close(): void {
    try {
      this.reconnect = false;
      this.socket.end();
      this.socket.destroy();
    } catch {
      /* noop */
    }
  }
}
