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
  level: LogLevel;
  message: any;
  timestamp: Date;
  splat?: any[];
  tags?: string[]; // <-- Dodaj to pole
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

export interface ProfileHandle {
  key: string;
  label: string;
}

// Interfejs dla Transportu
export interface Transport {
  log(processedEntry: Record<string, any> | string): void;
  level?: LogLevel;
  format?: LogFormat;
  close?(): void | Promise<void>; // pozwól na async close
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
  exceptionHandlerMode?: 'prepend' | 'append';
  rejectionHandlerMode?: 'prepend' | 'append';
  autoCloseOnBeforeExit?: boolean;
  shareTransports?: boolean;
  sampler?: (entry: Record<string, any>) => boolean;
  rateLimit?: {
    maxPerSecond: number;
    window?: number; // window size in ms, default 1000
  };
  profiler?: {
    level?: LogLevel;
    thresholdWarnMs?: number;
    thresholdErrorMs?: number;
    getLevel?: (durationMs: number, meta?: Record<string, any>) => LogLevel;
    namespaceWithRequestId?: boolean;
    keyFactory?: (label: string, meta?: Record<string, any>) => string;

    // --- NOWE USTAWIENIA SPRZĄTANIA ---
    ttlMs?: number; // po ilu ms uznać timer za osierocony i usunąć (np. 300000 = 5 min)
    cleanupIntervalMs?: number; // jak często sprzątać (np. 60000 = 60s)
    maxActiveProfiles?: number; // maksymalna liczba aktywnych timerów (np. 1000)

    tagsDefault?: string[]; // domyślne tagi dla logów profilera (poza 'profile')
    tagsMode?: 'append' | 'prepend' | 'replace'; // jak łączyć tagi: domyślnie 'append'
    fieldsDefault?: Record<string, any>; // domyślne pola dokładane do wpisów profilera
    onMeasure?: (event: ProfileEvent) => void;
    onMeasureFilter?: (event: ProfileEvent) => ProfileEvent | null | undefined;
  };
}
// --- KONIEC ZMIANY ---

export interface ProfileEvent {
  label: string;
  durationMs: number;
  success?: boolean; // undefined dla profileEnd (gdy nie wiemy o sukcesie), true/false dla time*
  level: LogLevel; // poziom wyliczony przez heurystykę
  tags?: string[];
  requestId?: string;
  // Metadane sklejone (start + end) po zastosowaniu composeTagów i domyślnych pól
  meta?: Record<string, any>;
  // Wewnętrzny klucz profilu (gdy dostępny)
  key?: string;
}

// --- POCZĄTEK ZMIANY: Dynamiczny Interfejs Loggera ---
// Podstawowy interfejs z metodami, które *zawsze* istnieją
interface BaseLoggerInterface {
  logEntry(
    entry: Omit<LogInfo, 'timestamp' | 'level' | 'message'> &
      Partial<Pick<LogInfo, 'level' | 'message' | 'splat'>> & {
        timestamp?: Date;
      }
  ): void;
  log(level: LogLevel, message: any, ...args: any[]): void;

  level: LogLevel;
  levels: LogLevels;
  isLevelEnabled(level: LogLevel): boolean;
  removeExceptionHandlers?(): void;

  dispose(): void;

  close(): Promise<void>;

  child(defaultMeta: Record<string, any>): LoggerInterface;

  // Runtime reconfiguration
  updateOptions(options: Partial<LoggerOptions>): void;
  updateLevel(level: LogLevel): void;
  addTransport(transport: Transport): void;
  removeTransport(transport: Transport): void;

  // Zwracamy uchwyt, aby uniknąć kolizji
  profile(label: string, meta?: Record<string, any>): ProfileHandle;
  // Przyjmujemy label LUB uchwyt
  profileEnd(
    labelOrHandle: string | ProfileHandle,
    meta?: Record<string, any>
  ): void;

  // Alias do profile/profileEnd
  time(label: string, meta?: Record<string, any>): void;
  timeEnd(
    labelOrHandle: string | ProfileHandle,
    meta?: Record<string, any>
  ): void;

  // Wygodne pomiary bloków
  timeSync<T>(label: string, fn: () => T, meta?: Record<string, any>): T;
  timeAsync<T>(
    label: string,
    fn: () => Promise<T>,
    meta?: Record<string, any>
  ): Promise<T>;
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
