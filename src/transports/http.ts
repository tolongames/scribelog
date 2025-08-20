import type { Transport, LogLevel, LogFormat } from '../types';
import * as http from 'http';
import * as https from 'https';
import { URL } from 'url';
import * as zlib from 'zlib';
import * as format from '../format';

export interface HttpTransportOptions {
  url: string;
  method?: 'POST' | 'PUT';
  headers?: Record<string, string>;
  timeoutMs?: number;
  compress?: boolean; // gzip body
  agent?: http.Agent | https.Agent;
  level?: LogLevel;
  format?: LogFormat;
}

export class HttpTransport implements Transport {
  public level?: LogLevel;
  public format?: LogFormat;
  private url: URL;
  private isHttps: boolean;
  private method: 'POST' | 'PUT';
  private headers: Record<string, string>;
  private timeoutMs: number;
  private agent?: http.Agent | https.Agent;
  private compress: boolean;

  constructor(options: HttpTransportOptions) {
    this.level = options.level;
    this.format = options.format || format.defaultJsonFormat;
    this.url = new URL(options.url);
    this.isHttps = this.url.protocol === 'https:';
    this.method = options.method || 'POST';
    this.headers = { 'content-type': 'application/json', ...(options.headers || {}) };
    this.timeoutMs = options.timeoutMs ?? 5000;
    this.agent = options.agent;
    this.compress = !!options.compress;
  }

  log(processedEntry: Record<string, any> | string): void {
    let bodyStr: string;
    if (typeof processedEntry === 'string') {
      bodyStr = processedEntry;
      if (!/application\/json/i.test(this.headers['content-type'] || '')) {
        this.headers['content-type'] = 'text/plain; charset=utf-8';
      }
    } else {
      const out = (this.format || format.defaultJsonFormat)(processedEntry);
      bodyStr =
        typeof out === 'string'
          ? out
          : JSON.stringify(out); // fallback, gdy format zwróci obiekt
      this.headers['content-type'] = 'application/json';
    }

    const send = (payload: Buffer | string, contentEncoding?: string) => {
      const reqHeaders: Record<string, string | number> = {
        ...this.headers,
        'content-length': Buffer.byteLength(payload as any),
      };
      if (contentEncoding) {
        reqHeaders['content-encoding'] = contentEncoding;
      }

      const reqOptions: http.RequestOptions = {
        protocol: this.url.protocol,
        hostname: this.url.hostname,
        port: this.url.port,
        path: this.url.pathname + (this.url.search || ''),
        method: this.method,
        headers: reqHeaders,
        agent: this.agent,
      };

      const client = this.isHttps ? https : http;
      const req = client.request(reqOptions, (res) => {
        // Skonsumuj odpowiedź, aby zwolnić socket
        res.on('data', () => {});
        res.on('end', () => {});
      });
      req.setTimeout(this.timeoutMs, () => {
        req.destroy(new Error('HttpTransport timeout'));
      });
      req.on('error', (err) => {
        console.error('[scribelog] HttpTransport error:', err);
      });
      req.write(payload);
      req.end();
    };

    if (this.compress) {
      zlib.gzip(Buffer.from(bodyStr), (err, buf) => {
        if (err) {
          console.error('[scribelog] HttpTransport gzip error:', err);
          send(bodyStr);
        } else {
          send(buf, 'gzip');
        }
      });
    } else {
      send(bodyStr);
    }
  }

  close(): void {
    // No-op (jeśli używasz custom agent, możesz go tu zamknąć)
  }
}