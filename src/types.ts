// src/types.ts
import type { LogLevels } from './levels';

// --- POCZĄTEK ZMIANY: LogLevel to teraz string dla elastyczności ---
// Re-eksport LogLevel jako typ - teraz bardziej ogólny string,
// ponieważ użytkownik może definiować własne poziomy.
// Konkretne, znane poziomy będą sprawdzane w czasie wykonania.
export type LogLevel = string; // Zmieniono z _LogLevel
// --- KONIEC ZMIANY ---

// Interfejs LogInfo - używa teraz LogLevel = string
export interface LogInfo {
  level: LogLevel; // Używa teraz ogólnego typu string
  message: any;
  timestamp: Date;
  splat?: any[];
  [key: string]: any;
}

/**
 * Funkcja formatująca.
 */
export type LogFormat = (
  info: Record<string, any>
) => Record<string, any> | string;

/**
 * Opcje dla FileTransport.
 */
export interface FileTransportOptions {
  level?: LogLevel; // Używa teraz ogólnego typu string
  format?: LogFormat;
  filename: string;
  size?: string;
  interval?: string;
  path?: string;
  compress?: string | boolean;
  maxFiles?: number;
  maxSize?: string;
  createPath?: boolean;
  fsWriteStreamOptions?: object;
  utc?: boolean;
}

// Interfejs dla Transportu
export interface Transport {
  log(processedEntry: Record<string, any> | string): void;
  level?: LogLevel; // Używa teraz ogólnego typu string
  format?: LogFormat;
  close?(): void;
}

// --- POCZĄTEK ZMIANY: Modyfikacja LoggerOptions ---
// Opcje konfiguracyjne przy tworzeniu Loggera
export interface LoggerOptions {
  /** Minimalny poziom logowania. Może być stringiem (nazwą poziomu). */
  level?: LogLevel; // Używa teraz ogólnego typu string
  /** Obiekt definiujący dostępne poziomy logowania (nazwa: wartość liczbowa).
   *  Zostanie połączony z poziomami standardowymi. */
  levels?: LogLevels; // Typ LogLevels (Record<string, number>) pozostaje bez zmian
  format?: LogFormat;
  transports?: Transport[];
  defaultMeta?: Record<string, any>;
  handleExceptions?: boolean;
  handleRejections?: boolean;
  exitOnError?: boolean;
}
// --- KONIEC ZMIANY ---

// --- POCZĄTEK ZMIANY: Dynamiczny Interfejs Loggera ---
// Podstawowy interfejs z metodami, które *zawsze* istnieją
interface BaseLoggerInterface {
  logEntry(
    entry: Omit<LogInfo, 'timestamp' | 'level' | 'message'> &
      Partial<Pick<LogInfo, 'level' | 'message' | 'splat'>> & {
        timestamp?: Date;
      }
  ): void;
  log(level: LogLevel, message: any, ...args: any[]): void; // level jest teraz stringiem

  // Właściwości i metody konfiguracyjne
  level: LogLevel; // Poziom jest teraz stringiem
  levels: LogLevels; // Nadal Record<string, number>
  isLevelEnabled(level: LogLevel): boolean; // level jest teraz stringiem
  addTransport(transport: Transport): void;
  removeExceptionHandlers?(): void;
  child(defaultMeta: Record<string, any>): LoggerInterface; // Zwraca pełny interfejs
}

// Typ reprezentujący metody dla poziomów logowania (np. logger.info, logger.debug)
// Kluczem jest string (nazwa poziomu), wartością jest funkcja logująca
type LogLevelMethods = {
  [level: string]: (message: any, ...args: any[]) => void;
};

/**
 * Pełny interfejs Loggera.
 * Łączy podstawowe metody z dynamicznymi metodami dla każdego poziomu logowania.
 * Używa przecięcia typów (`&`) oraz typu mapowanego (`LogLevelMethods`).
 * To pozwala na posiadanie metod jak `logger.info(...)`, `logger.debug(...)`,
 * ale także potencjalnie `logger.customLevel(...)`.
 */
export type LoggerInterface = BaseLoggerInterface & LogLevelMethods;
// --- KONIEC ZMIANY ---
