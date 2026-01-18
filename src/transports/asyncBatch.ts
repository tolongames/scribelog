import type { Transport, LogLevel, LogFormat } from '../types';

export interface AsyncBatchTransportOptions {
  target: Transport;
  batchSize?: number;
  flushIntervalMs?: number;
  immediate?: boolean;
  level?: LogLevel;
  format?: LogFormat;
  highWaterMark?: number; // max buffer size before applying overflow policy
  overflowPolicy?: 'block' | 'drop-oldest' | 'drop-newest'; // default: 'drop-oldest'
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
  private highWaterMark: number;
  private overflowPolicy: 'block' | 'drop-oldest' | 'drop-newest';
  private _droppedCount = 0;

  constructor(options: AsyncBatchTransportOptions) {
    this.target = options.target;
    this.level = options.level;
    this.format = options.format;
    this.batchSize = options.batchSize ?? 10;
    this.flushIntervalMs = options.flushIntervalMs ?? 1000;
    this.immediate = !!options.immediate;
    this.highWaterMark = options.highWaterMark ?? 1000;
    this.overflowPolicy = options.overflowPolicy ?? 'drop-oldest';
  }

  get droppedCount(): number {
    return this._droppedCount;
  }

  log(entry: Record<string, any> | string): void {
    if (this.closed) return;
    if (this.immediate) {
      this.target.log(entry);
      return;
    }

    // Check if we're at highWaterMark
    if (this.buffer.length >= this.highWaterMark) {
      if (this.overflowPolicy === 'drop-oldest') {
        this.buffer.shift(); // remove oldest
        this._droppedCount++;
      } else if (this.overflowPolicy === 'drop-newest') {
        this._droppedCount++;
        return; // drop the new entry
      }
      // 'block' policy: we still push (effectively unbounded growth)
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
