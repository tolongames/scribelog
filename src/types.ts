// src/types.ts
import { LogLevel as _LogLevel, LogLevels } from './levels';

// Re-eksport LogLevel jako typ
export type LogLevel = _LogLevel;

// Interfejs LogInfo - podstawowa struktura danych logu
export interface LogInfo {
  level: LogLevel;
  message: string;
  timestamp: Date;
  [key: string]: any; // Pozwala na dowolne dodatkowe metadane
}

/**
 * Funkcja formatująca. Przyjmuje obiekt (początkowo LogInfo,
 * potem wynik poprzedniego formatera) i zwraca zmodyfikowany obiekt lub string.
 */
export type LogFormat = (
  info: Record<string, any>
) => Record<string, any> | string;

// Interfejs dla Transportu
export interface Transport {
  // Metoda logująca transportu, przyjmuje wynik formatowania
  log(processedEntry: Record<string, any> | string): void;
  level?: LogLevel;
  format?: LogFormat;
}

// --- POCZĄTEK ZMIANY: Dodano opcje obsługi błędów ---
// Opcje konfiguracyjne przy tworzeniu Loggera
export interface LoggerOptions {
  level?: LogLevel;
  levels?: LogLevels;
  format?: LogFormat;
  transports?: Transport[];
  defaultMeta?: Record<string, any>;

  /** Czy logger ma przechwytywać i logować nieobsłużone wyjątki. Domyślnie: false */
  handleExceptions?: boolean;
  /** Czy logger ma przechwytywać i logować nieobsłużone odrzucenia promisów. Domyślnie: false */
  handleRejections?: boolean;
  /** Czy zakończyć proces po nieobsłużonym wyjątku/odrzuceniu (jeśli handleExceptions/handleRejections jest true). Domyślnie: true */
  exitOnError?: boolean;
}
// --- KONIEC ZMIANY ---

// Interfejs Loggera - definiuje publiczne API
// Import _LoggerInterface usunięty, używamy LoggerInterface w definicji child()
export type LoggerInterface = {
  // Metody logowania
  logEntry(entry: Omit<LogInfo, 'timestamp'> & { timestamp?: Date }): void;
  log(level: LogLevel, message: string, meta?: Record<string, any>): void;

  // Metody poziomów
  error(message: string, meta?: Record<string, any>): void;
  warn(message: string, meta?: Record<string, any>): void;
  info(message: string, meta?: Record<string, any>): void;
  http(message: string, meta?: Record<string, any>): void;
  verbose(message: string, meta?: Record<string, any>): void;
  debug(message: string, meta?: Record<string, any>): void;
  silly(message: string, meta?: Record<string, any>): void;

  // Właściwości i metody konfiguracyjne
  level: LogLevel;
  levels: LogLevels;
  isLevelEnabled(level: LogLevel): boolean;
  addTransport(transport: Transport): void;

  /**
   * Tworzy nowy logger potomny.
   * @param defaultMeta - Obiekt z domyślnymi metadanymi dla loggera potomnego.
   */
  child(defaultMeta: Record<string, any>): LoggerInterface; // Zwraca ten sam interfejs
};
