import type { Transport, LogLevel, LogFormat } from '../types';

export interface AsyncBatchTransportOptions {
  target: Transport;
  batchSize?: number;
  flushIntervalMs?: number;
  immediate?: boolean;
  level?: LogLevel;
  format?: LogFormat;
}

export class AsyncBatchTransport implements Transport {
  public level?: LogLevel;
  public format?: LogFormat;
  private target: Transport;
  private batchSize: number;
  private flushIntervalMs: number;
  private immediate: boolean;
  private buffer: (Record<string, any> | string)[] = [];
  private timer: NodeJS.Timeout | null = null;
  private closed = false;

  constructor(options: AsyncBatchTransportOptions) {
    this.target = options.target;
    this.level = options.level;
    this.format = options.format;
    this.batchSize = options.batchSize ?? 10;
    this.flushIntervalMs = options.flushIntervalMs ?? 1000;
    this.immediate = !!options.immediate;
  }

  log(entry: Record<string, any> | string): void {
    if (this.closed) return;
    if (this.immediate) {
      this.target.log(entry);
      return;
    }
    this.buffer.push(entry);
    if (this.buffer.length >= this.batchSize) {
      this.flush();
    } else if (!this.timer) {
      this.timer = setTimeout(() => this.flush(), this.flushIntervalMs);
    }
  }

  flush(): void {
    if (this.closed || this.buffer.length === 0) return;
    const batch = this.buffer.splice(0, this.batchSize);
    for (const entry of batch) {
      this.target.log(entry);
    }
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }

  close(): void {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    this.flush();
    this.closed = true;
    if (typeof (this.target as any).close === 'function') {
      (this.target as any).close();
    }
  }
}
