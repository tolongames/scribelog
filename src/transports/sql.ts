import type { Transport, LogLevel, LogFormat } from '../types';

/**
 * Przykładowy transport do bazy SQL (PostgreSQL, SQLite, MySQL).
 * Użytkownik powinien przekazać instancję klienta (np. pg.Pool, sqlite3.Database, itp.)
 */
export interface SQLTransportOptions {
  client: any; // Klient bazy (np. pg.Pool, sqlite3.Database)
  insertQuery: string; // Zapytanie INSERT z placeholderami
  level?: LogLevel;
  format?: LogFormat;
  mapLogToParams?: (log: Record<string, any> | string) => any[];
}

export class SQLTransport implements Transport {
  public level?: LogLevel;
  public format?: LogFormat;
  private client: any;
  private insertQuery: string;
  private mapLogToParams: (log: Record<string, any> | string) => any[];

  constructor(options: SQLTransportOptions) {
    this.level = options.level;
    this.format = options.format;
    this.client = options.client;
    this.insertQuery = options.insertQuery;
    this.mapLogToParams =
      options.mapLogToParams ||
      ((log) => [
        typeof log === 'object' ? log.level : null,
        typeof log === 'object' ? log.message : String(log),
        typeof log === 'object' && log.timestamp instanceof Date
          ? log.timestamp.toISOString()
          : null,
        JSON.stringify(log),
      ]);
  }

  async log(entry: Record<string, any> | string): Promise<void> {
    const params = this.mapLogToParams(entry);
    // Przykład dla pg (PostgreSQL)
    if (typeof this.client.query === 'function') {
      await this.client.query(this.insertQuery, params);
    } else if (typeof this.client.run === 'function') {
      // Przykład dla sqlite3
      await new Promise((resolve, reject) =>
        this.client.run(this.insertQuery, params, (err: any) =>
          err ? reject(err) : resolve(undefined)
        )
      );
    }
    // Dodaj inne silniki wg potrzeb
  }

  async close(): Promise<void> {
    if (typeof this.client.end === 'function') {
      await this.client.end();
    }
    if (typeof this.client.close === 'function') {
      await this.client.close();
    }
  }
}
