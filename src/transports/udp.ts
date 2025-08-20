import type { Transport, LogLevel, LogFormat } from '../types';
import * as dgram from 'dgram';
import * as format from '../format';

export interface UdpTransportOptions {
  host: string;
  port: number;
  type?: 'udp4' | 'udp6';
  level?: LogLevel;
  format?: LogFormat;
}

export class UdpTransport implements Transport {
  public level?: LogLevel;
  public format?: LogFormat;

  private socket: dgram.Socket;
  private host: string;
  private port: number;

  constructor(options: UdpTransportOptions) {
    this.level = options.level;
    this.format = options.format || format.defaultJsonFormat;
    this.host = options.host;
    this.port = options.port;
    this.socket = dgram.createSocket(options.type || 'udp4');
    this.socket.on('error', (err) => {
      console.error('[scribelog] UdpTransport socket error:', err);
    });
  }

  log(processedEntry: Record<string, any> | string): void {
    let payload: Buffer;
    if (typeof processedEntry === 'string') {
      payload = Buffer.from(processedEntry);
    } else {
      const out = (this.format || format.defaultJsonFormat)(processedEntry);
      const str = typeof out === 'string' ? out : JSON.stringify(out);
      payload = Buffer.from(str);
    }
    this.socket.send(payload, this.port, this.host, (err) => {
      if (err) console.error('[scribelog] UdpTransport send error:', err);
    });
  }

  close(): void {
    try {
      this.socket.close();
    } catch {
      /* noop */
    }
  }
}
