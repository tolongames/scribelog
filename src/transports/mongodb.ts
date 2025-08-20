import type { Transport, LogLevel, LogFormat } from '../types';

export interface MongoDBTransportOptions {
  uri: string; // MongoDB connection string
  dbName: string;
  collection: string;
  level?: LogLevel;
  format?: LogFormat;
  clientOptions?: object;
}

export class MongoDBTransport implements Transport {
  public level?: LogLevel;
  public format?: LogFormat;
  private client!: any; // inicjalizowane w konstruktorze (definite assignment)
  private collection!: any; // inicjalizowane po connect() (definite assignment)
  private ready: Promise<void>;

  constructor(options: MongoDBTransportOptions) {
    this.level = options.level;
    this.format = options.format;

    // Lazy load, aby uniknąć błędu "Cannot find module 'mongodb'" w czasie kompilacji
    const { MongoClient } = require('mongodb');

    this.client = new MongoClient(options.uri, options.clientOptions ?? {});
    this.ready = this.client.connect().then(() => {
      const db = this.client.db(options.dbName);
      this.collection = db.collection(options.collection);
    });
  }

  async log(entry: Record<string, any> | string): Promise<void> {
    await this.ready;

    let doc: Record<string, any>;
    if (typeof entry === 'string') {
      doc = { message: entry };
    } else {
      doc = { ...entry };
      if (doc.timestamp instanceof Date) {
        doc.timestamp = doc.timestamp.toISOString();
      }
    }

    await this.collection.insertOne(doc);
  }

  async close(): Promise<void> {
    if (this.client && typeof this.client.close === 'function') {
      await this.client.close();
    }
  }
}
