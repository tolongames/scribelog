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
import { standardLevels, LogLevel, LogLevels } from './levels';
import { ConsoleTransport as _ConsoleTransport } from './transports/console';
import type { ConsoleTransportOptions as _ConsoleTransportOptions } from './transports/console';
// --- POCZĄTEK ZMIANY: Importuj FileTransport ---
import { FileTransport as _FileTransport } from './transports/file';
// --- KONIEC ZMIANY ---
import * as _format from './format';

// Eksportuj główne funkcje i klasy
export const createLogger = _createLogger;
export const Scribelog = _Scribelog;

// Eksportuj główne typy
export type Logger = _LoggerInterface;
export type LoggerOptions = _LoggerOptions;

// Eksportuj poziomy
export { standardLevels };
export type { LogLevel, LogLevels };

// --- POCZĄTEK ZMIANY: Dodaj FileTransport i jego opcje do eksportów ---
// Eksportuj transporty
export const transports = {
  Console: _ConsoleTransport,
  File: _FileTransport, // Dodaj FileTransport
};
export type Transport = _Transport;
export type ConsoleTransportOptions = _ConsoleTransportOptions;
export type FileTransportOptions = _FileTransportOptions; // Eksportuj typ opcji
// --- KONIEC ZMIANY ---

// Eksportuj formatery
export const format = _format;
export type LogFormat = _LogFormat;

// Eksportuj pozostałe typy
export type { LogInfo };
