// src/index.ts
import {
  createLogger as _createLogger,
  Scribelog as _Scribelog,
} from './logger';
// Importuj typy bezpośrednio z ./types
import type {
  LoggerInterface as _LoggerInterface,
  LoggerOptions as _LoggerOptions,
  LogInfo, // Dodaj LogInfo tutaj
  Transport as _Transport,
  LogFormat as _LogFormat,
  FileTransportOptions as _FileTransportOptions, // Importuj opcje FileTransport
} from './types';
import { AsyncBatchTransport } from './transports/asyncBatch';
import { standardLevels, LogLevel, LogLevels } from './levels';
import { ConsoleTransport as _ConsoleTransport } from './transports/console';
import type { ConsoleTransportOptions as _ConsoleTransportOptions } from './transports/console';
// --- POCZĄTEK ZMIANY: Importuj FileTransport ---
import { FileTransport as _FileTransport } from './transports/file';
// --- KONIEC ZMIANY ---
import * as _format from './format';
import { MongoDBTransport } from './transports/mongodb';
import { SQLTransport } from './transports/sql';
import { createExpressMiddleware } from './adapters/express';
import { createKoaMiddleware } from './adapters/koa';
import { createFastifyPlugin } from './adapters/fastify';
import { createNestInterceptor } from './adapters/nest';
import { createNextApiHandler } from './adapters/next';
import { HttpTransport } from './transports/http';
import { WebSocketTransport } from './transports/websocket';
import { TcpTransport } from './transports/tcp';
import { UdpTransport } from './transports/udp';

// Eksportuj główne funkcje i klasy
export const createLogger = _createLogger;
export const Scribelog = _Scribelog;
export * from './requestContext';

// Eksportuj główne typy
export type Logger = _LoggerInterface;
export type LoggerOptions = _LoggerOptions;
export type { AsyncBatchTransportOptions } from './transports/asyncBatch';

// Eksportuj poziomy
export { standardLevels };
export type { LogLevel, LogLevels };

// --- POCZĄTEK ZMIANY: Dodaj FileTransport i jego opcje do eksportów ---
// Eksportuj transporty
export const transports = {
  Console: _ConsoleTransport,
  File: _FileTransport,
  AsyncBatch: AsyncBatchTransport,
  MongoDB: MongoDBTransport,
  SQL: SQLTransport,
  Http: HttpTransport,
  WebSocket: WebSocketTransport,
  Tcp: TcpTransport,
  Udp: UdpTransport,
};
export type Transport = _Transport;
export type ConsoleTransportOptions = _ConsoleTransportOptions;
export type FileTransportOptions = _FileTransportOptions; // Eksportuj typ opcji
// --- KONIEC ZMIANY ---

// Eksportuj formatery
export const format = _format;
export type LogFormat = _LogFormat;
export const maskSensitive = _format.maskSensitive;

// Eksportuj pozostałe typy
export type { LogInfo };

export type { MongoDBTransportOptions } from './transports/mongodb';
export type { SQLTransportOptions } from './transports/sql';
export const adapters = {
  express: { createMiddleware: createExpressMiddleware },
  koa: { createMiddleware: createKoaMiddleware },
  fastify: { createPlugin: createFastifyPlugin },
  nest: { createInterceptor: createNestInterceptor },
  next: { createApiHandler: createNextApiHandler },
};

export type { HttpTransportOptions } from './transports/http';
export type { WebSocketTransportOptions } from './transports/websocket';
export type { TcpTransportOptions } from './transports/tcp';
export type { UdpTransportOptions } from './transports/udp';