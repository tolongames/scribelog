// src/types.ts
import { LogLevel as _LogLevel, LogLevels } from './levels';

// Re-eksport LogLevel jako typ
export type LogLevel = _LogLevel;

// --- POCZĄTEK ZMIANY: Dodaj pole splat do LogInfo, message może być any ---
// Interfejs LogInfo - podstawowa struktura danych logu
export interface LogInfo {
  level: LogLevel;
  message: any; // Wiadomość może być dowolnego typu, zwłaszcza jeśli przekazano tylko obiekt Error
  timestamp: Date;
  splat?: any[]; // Opcjonalna tablica argumentów dla formatowania printf/splat
  [key: string]: any; // Pozwala na dowolne dodatkowe metadane
}
// --- KONIEC ZMIANY ---

/**
 * Funkcja formatująca. Przyjmuje obiekt (początkowo LogInfo,
 * potem wynik poprzedniego formatera) i zwraca zmodyfikowany obiekt lub string.
 */
export type LogFormat = (
  info: Record<string, any>
) => Record<string, any> | string;

/**
 * Opcje dla FileTransport. Bazują na opcjach `rotating-file-stream`.
 * @see https://github.com/iccicci/rotating-file-stream#options
 */
export interface FileTransportOptions {
  level?: LogLevel;
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
  utc?: boolean; // Chociaż nie używamy bezpośrednio, zostawmy dla kompletności typu
}

// Interfejs dla Transportu
export interface Transport {
  log(processedEntry: Record<string, any> | string): void;
  level?: LogLevel;
  format?: LogFormat;
  close?(): void;
}

// Opcje konfiguracyjne przy tworzeniu Loggera
export interface LoggerOptions {
  level?: LogLevel;
  levels?: LogLevels;
  format?: LogFormat;
  transports?: Transport[];
  defaultMeta?: Record<string, any>;
  handleExceptions?: boolean;
  handleRejections?: boolean;
  exitOnError?: boolean;
}

// --- POCZĄTEK ZMIANY: Zaktualizuj sygnatury metod w LoggerInterface ---
// Interfejs Loggera - definiuje publiczne API
export type LoggerInterface = {
  // Metody logowania
  // logEntry akceptuje teraz opcjonalny splat
  logEntry(
    entry: Omit<LogInfo, 'timestamp' | 'level' | 'message'> &
      Partial<Pick<LogInfo, 'level' | 'message' | 'splat'>> & {
        timestamp?: Date;
      }
  ): void;
  // Metoda log i metody poziomów akceptują teraz `message: any` i `...args: any[]`
  log(level: LogLevel, message: any, ...args: any[]): void;
  error(message: any, ...args: any[]): void;
  warn(message: any, ...args: any[]): void;
  info(message: any, ...args: any[]): void;
  http(message: any, ...args: any[]): void;
  verbose(message: any, ...args: any[]): void;
  debug(message: any, ...args: any[]): void;
  silly(message: any, ...args: any[]): void;

  // Właściwości i metody konfiguracyjne (bez zmian)
  level: LogLevel;
  levels: LogLevels;
  isLevelEnabled(level: LogLevel): boolean;
  addTransport(transport: Transport): void;
  removeExceptionHandlers?(): void;

  // Metoda child (bez zmian)
  child(defaultMeta: Record<string, any>): LoggerInterface;
};
// --- KONIEC ZMIANY ---
