// src/logger.ts
import { standardLevels, LogLevels } from './levels'; // Usunięto LogLevel as DefaultLogLevels
// Importuj zaktualizowane typy z ./types
import type {
  LoggerOptions,
  LogInfo,
  Transport,
  LogFormat,
  LoggerInterface as _LoggerInterface,
  LogLevel // Zaktualizowany LogLevel = string
} from './types';
import { ConsoleTransport } from './transports/console';
import * as format from './format';
import { _internalExit } from './utils';
// Nie potrzebujemy już utilFormat tutaj, bo jest w format.ts
// import { format as utilFormat } from 'util';

// Typ wejściowy dla logEntry - używa zaktualizowanego LogLevel
type LogEntryInput = Omit<LogInfo, 'timestamp' | 'level' | 'message'> & Partial<Pick<LogInfo, 'level' | 'message' | 'splat'>> & { timestamp?: Date };

// Re-eksport typu LoggerInterface (który teraz jest dynamiczny)
export type LoggerInterface = _LoggerInterface;

// Klasa Scribelog implementująca dynamiczny interfejs LoggerInterface
export class Scribelog implements LoggerInterface {
  public levels: LogLevels;         // Nadal Record<string, number>
  public level: LogLevel;           // Teraz string
  private transports: Transport[];
  private format: LogFormat;
  private defaultMeta?: Record<string, any>;
  private options: LoggerOptions; // Przechowuje ORYGINALNE opcje konfiguracyjne

  private exitOnError: boolean;
  private exceptionHandler?: (err: Error) => void;
  private rejectionHandler?: (reason: any, _promise: Promise<any>) => void;

  // Dodajemy sygnaturę indeksu, aby zadowolić dynamiczny interfejs LoggerInterface
  [level: string]: ((message: any, ...args: any[]) => void) | any;

  // Zmieniony konstruktor akceptujący opcjonalne poziomy rodzica
  constructor(options: LoggerOptions = {}, internalParentLevels?: LogLevels) {
    this.options = { ...options }; // Zapisz kopię ORYGINALNYCH opcji

    // --- Użyj poziomów rodzica LUB połącz standardowe z opcjami ---
    if (internalParentLevels) {
        // Jeśli tworzymy dziecko, dziedziczymy DOKŁADNY zestaw poziomów rodzica
        this.levels = internalParentLevels;
        // W tym przypadku ignorujemy `options.levels`, jeśli były przekazane do `child`
        // (chociaż nasza metoda child ich nie przekazuje)
    } else {
        // Dla loggera głównego, połącz standardowe z niestandardowymi z opcji
        this.levels = { ...standardLevels, ...(options.levels || {}) };
    }

    // --- Walidacja poziomu startowego (level) ---
    // Użyj poziomu z opcji LUB domyślnego 'info'
    const defaultLogLevel = options.level || 'info';
    // Sprawdź, czy ten poziom istnieje w *finalnym* zestawie this.levels
    if (this.levels[defaultLogLevel] === undefined) {
        console.warn(`[scribelog] Unknown log level "${defaultLogLevel}" provided in options. Defaulting to "info".`);
        this.level = 'info'; // Spróbuj ustawić 'info'
    } else {
         this.level = defaultLogLevel; // Ustaw poziom z opcji/domyślny
    }
    // Sprawdź, czy poziom 'info' (lub ten ustawiony) faktycznie istnieje
    if (this.levels[this.level] === undefined) {
        // Jeśli nie, znajdź pierwszy dostępny poziom
        const firstAvailableLevel = Object.keys(this.levels)[0];
        if (firstAvailableLevel) {
             this.level = firstAvailableLevel;
             console.warn(`[scribelog] Default level "${defaultLogLevel}" or fallback "info" not found in defined levels. Defaulting to first available level: "${this.level}".`);
        } else {
            // Krytyczna sytuacja - brak jakichkolwiek poziomów
            this.levels = { error: 0 }; // Dodaj 'error' jako minimum
            this.level = 'error';
            console.error('[scribelog] No log levels defined. Defaulting to error level only.');
        }
    }

    // Reszta konfiguracji
    this.transports =
      options.transports && options.transports.length > 0
        ? options.transports
        : [new ConsoleTransport()];
    this.format = options.format || format.defaultSimpleFormat;
    this.defaultMeta = options.defaultMeta;
    this.exitOnError = options.exitOnError !== false;

    // --- Dynamiczne tworzenie metod dla WSZYSTKICH poziomów ---
    Object.keys(this.levels).forEach((levelName) => {
        // Usunięto warunek `if (levelName in this)`, aby umożliwić nadpisywanie
        // i zapewnić tworzenie metod dla niestandardowych poziomów.
        // Ryzyko konfliktu istnieje, ale zakładamy poprawne nazewnictwo poziomów.
        try {
             (this as any)[levelName] = (message: any, ...args: any[]) => {
                 this.log(levelName, message, ...args);
             };
        } catch (e) {
             // Złap błędy, np. przy próbie nadpisania niemodyfikowalnej właściwości
             console.warn(`[scribelog] Could not create logging method for level "${levelName}":`, e);
        }
    });

    // Konfiguracja obsługi błędów
    if (options.handleExceptions) {
      this.exceptionHandler = (err: Error) => { this.logError('uncaughtException', err, () => { if (this.exitOnError) { _internalExit(1); } }); };
      process.removeAllListeners('uncaughtException');
      process.on('uncaughtException', this.exceptionHandler);
    }
    if (options.handleRejections) {
      this.rejectionHandler = (reason: any, _promise: Promise<any>) => { const error = reason instanceof Error ? reason : new Error(String(reason ?? 'Unhandled Rejection')); if (!(reason instanceof Error)) { (error as any).originalReason = reason; } this.logError('unhandledRejection', error, () => { if (this.exitOnError) { _internalExit(1); } }); };
      process.removeAllListeners('unhandledRejection');
      process.on('unhandledRejection', this.rejectionHandler);
    }
  }

  // Metody logowania poziomów (error, warn, info itd.) są generowane dynamicznie.

  // Metoda log
  public log(level: LogLevel, message: any, ...args: any[]): void {
    if (!this.isLevelEnabled(level)) return;
    const timestamp = new Date();
    let meta: Record<string, any> | undefined = undefined;
    let splatArgs: any[] = args;
    if (args.length > 0) { const lastArg = args[args.length - 1]; if ( typeof lastArg === 'object' && lastArg !== null && !Array.isArray(lastArg) && !(lastArg instanceof Error) && !(lastArg instanceof Date) ) { meta = lastArg; splatArgs = args.slice(0, -1); } }
    const metaData = { ...(this.defaultMeta || {}), ...(meta || {}) };
    let messageToSend: any = message;
    let errorToLog: Error | undefined = undefined;
    if (message instanceof Error) { messageToSend = message.message; errorToLog = message; }
    const logEntry: LogInfo = { level, message: messageToSend, timestamp, splat: splatArgs.length > 0 ? splatArgs : undefined, ...metaData, };
    if (errorToLog && !logEntry.error) { logEntry.error = errorToLog; }
    this.processAndTransport(logEntry);
  }

  // Metoda logEntry
  public logEntry(entry: LogEntryInput): void {
    const level = entry.level || 'info';
    if (!this.isLevelEnabled(level)) return;
    const message = entry.message ?? '';
    const { timestamp: inputTimestamp, splat, ...rest } = entry;
    const timestamp = inputTimestamp instanceof Date ? inputTimestamp : new Date();
    const metaData = { ...(this.defaultMeta || {}), ...rest };
    const logEntry: LogInfo = { level, message, timestamp, splat, ...metaData };
    this.processAndTransport(logEntry);
  }

  // Metoda isLevelEnabled
  public isLevelEnabled(level: LogLevel): boolean {
    const targetLevelValue = this.levels[level];
    const currentLevelValue = this.levels[this.level];
    if (targetLevelValue === undefined) return false;
    return targetLevelValue <= currentLevelValue;
   }

  // Metoda addTransport
  public addTransport(transport: Transport): void { this.transports.push(transport); }

  // Metoda child (przekazuje this.levels)
  public child(childMeta: Record<string, any>): LoggerInterface {
    const newDefaultMeta = { ...(this.defaultMeta || {}), ...childMeta };
    const childLogger = new Scribelog(
        { // Opcje dla dziecka - kopiujemy z rodzica, ale BEZ levels
            ...this.options,
            levels: undefined, // Usuwamy levels z opcji, aby konstruktor użył parentLevels
            level: this.level,
            transports: this.transports,
            defaultMeta: newDefaultMeta,
        },
        this.levels // <<< Przekazujemy AKTUALNY zestaw poziomów rodzica
    );
    return childLogger;
  }

  // Metoda logError
  private logError(eventType: 'uncaughtException' | 'unhandledRejection', error: Error, callback: () => void): void {
    try {
        const errorMeta = this.formatError(error);
        const logEntry: LogInfo = {
            level: 'error', message: error.message || 'Unknown error', timestamp: new Date(),
            error: error, exception: true, eventType: eventType,
            ...errorMeta, ...(this.defaultMeta || {})
        };
        this.processAndTransport(logEntry);
    } catch (logErr) { console.error('[scribelog] Error occurred during error logging:', logErr); console.error('[scribelog] Original error was:', error); }
    finally { callback(); }
  }

  // Metoda formatError
  private formatError(err: Error): Record<string, any> {
      const standardKeys = ['message', 'name', 'stack'];
      const properties = Object.getOwnPropertyNames(err).reduce((acc, key) => {
          if (!standardKeys.includes(key)) { acc[key] = (err as any)[key]; }
          return acc;
      }, {} as Record<string, any>);
      return { name: err.name, stack: err.stack, ...properties,
          ...(err as any).originalReason ? { originalReason: (err as any).originalReason } : {} };
  }

  // Metoda removeExceptionHandlers
  public removeExceptionHandlers(): void {
      if (this.exceptionHandler) { process.removeListener('uncaughtException', this.exceptionHandler); this.exceptionHandler = undefined; }
      if (this.rejectionHandler) { process.removeListener('unhandledRejection', this.rejectionHandler); this.rejectionHandler = undefined; }
  }

  // Metoda processAndTransport
  private processAndTransport(logEntry: LogInfo): void {
    for (const transport of this.transports) {
      if (this.isTransportLevelEnabled(transport, logEntry.level)) {
        const formatToUse = transport.format || this.format;
        const processedOutput = formatToUse({ ...logEntry });
        try { transport.log(processedOutput); }
        catch (err) { console.error('[scribelog] Error in transport:', err); }
      }
    }
   }

  // Metoda isTransportLevelEnabled
  private isTransportLevelEnabled(transport: Transport, entryLevel: LogLevel): boolean {
    const transportLevel = transport.level;
    if (!transportLevel) return true;
    const transportLevelValue = this.levels[transportLevel];
    const entryLevelValue = this.levels[entryLevel];
    if (transportLevelValue === undefined || entryLevelValue === undefined) return false;
    return entryLevelValue <= transportLevelValue;
   }
}

// Fabryka loggera
export function createLogger(options?: LoggerOptions): LoggerInterface {
  // Wywołuje konstruktor bez drugiego argumentu (parentLevels)
  return new Scribelog(options);
}