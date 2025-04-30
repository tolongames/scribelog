// src/logger.ts
import { standardLevels, LogLevel, LogLevels } from './levels';
// Importuj wszystkie potrzebne typy z ./types
import type {
  LoggerOptions,
  LogInfo,
  Transport,
  LogFormat,
  LoggerInterface as _LoggerInterface,
} from './types';
import { ConsoleTransport } from './transports/console';
import * as format from './format';
// Importuj funkcję pomocniczą do wychodzenia z procesu
import { _internalExit } from './utils';

// Typ wejściowy dla logEntry - uwzględnia opcjonalny splat
type LogEntryInput = Omit<LogInfo, 'timestamp' | 'level' | 'message'> & Partial<Pick<LogInfo, 'level' | 'message' | 'splat'>> & { timestamp?: Date };

// Re-eksport typu LoggerInterface
export type LoggerInterface = _LoggerInterface;

// Klasa Scribelog
export class Scribelog implements LoggerInterface {
  public levels: LogLevels;
  public level: LogLevel;
  private transports: Transport[];
  private format: LogFormat; // Główny format loggera
  private defaultMeta?: Record<string, any>;
  private options: LoggerOptions; // Przechowuje oryginalne opcje konfiguracyjne

  private exitOnError: boolean;
  private exceptionHandler?: (err: Error) => void;
  private rejectionHandler?: (reason: any, _promise: Promise<any>) => void; // _promise jest nieużywane

  constructor(options: LoggerOptions = {}) {
    this.options = { ...options }; // Zapisz kopię opcji
    this.levels = options.levels || standardLevels;
    this.level = options.level || 'info';
    this.transports =
      options.transports && options.transports.length > 0
        ? options.transports
        : [new ConsoleTransport()]; // Domyślnie ConsoleTransport
    // Użyj formatu z opcji lub domyślnego simple (który teraz zawiera errors() i splat())
    this.format = options.format || format.defaultSimpleFormat;
    this.defaultMeta = options.defaultMeta;

    // Ustaw flagę exitOnError
    this.exitOnError = options.exitOnError !== false;

    // Konfiguracja obsługi nieprzechwyconych wyjątków
    if (options.handleExceptions) {
      this.exceptionHandler = (err: Error) => {
        this.logError('uncaughtException', err, () => {
          if (this.exitOnError) { _internalExit(1); }
        });
      };
      process.removeAllListeners('uncaughtException');
      process.on('uncaughtException', this.exceptionHandler);
    }

    // Konfiguracja obsługi nieprzechwyconych odrzuceń promisów
    if (options.handleRejections) {
      this.rejectionHandler = (reason: any, _promise: Promise<any>) => {
        const error =
          reason instanceof Error
            ? reason
            : new Error(String(reason ?? 'Unhandled Rejection'));
        if (!(reason instanceof Error)) { (error as any).originalReason = reason; }
        this.logError('unhandledRejection', error, () => {
          if (this.exitOnError) { _internalExit(1); }
        });
      };
      process.removeAllListeners('unhandledRejection');
      process.on('unhandledRejection', this.rejectionHandler);
    }
  }

  // --- POCZĄTEK ZMIANY: Aktualizacja sygnatur metod poziomów ---
  // Metody poziomów delegują teraz do log z ...args
  public error(message: any, ...args: any[]): void { this.log('error', message, ...args); }
  public warn(message: any, ...args: any[]): void { this.log('warn', message, ...args); }
  public info(message: any, ...args: any[]): void { this.log('info', message, ...args); }
  public http(message: any, ...args: any[]): void { this.log('http', message, ...args); }
  public verbose(message: any, ...args: any[]): void { this.log('verbose', message, ...args); }
  public debug(message: any, ...args: any[]): void { this.log('debug', message, ...args); }
  public silly(message: any, ...args: any[]): void { this.log('silly', message, ...args); }
  // --- KONIEC ZMIANY ---

  // --- POCZĄTEK ZMIANY: Aktualizacja głównej metody log ---
  /**
   * Główna metoda logująca.
   * Rozpoznaje, czy ostatni argument to obiekt metadanych, czy część splat.
   */
  public log(level: LogLevel, message: any, ...args: any[]): void {
    // Sprawdź poziom loggera
    if (!this.isLevelEnabled(level)) return;

    const timestamp = new Date();
    let meta: Record<string, any> | undefined = undefined;
    let splatArgs: any[] = args;

    // Poprawiona logika wykrywania obiektu meta na końcu argumentów
    if (args.length > 0) {
        const lastArg = args[args.length - 1];
        // Sprawdź, czy ostatni argument jest "zwykłym" obiektem (nie Error, Date, Array itp.)
        // i nie jest nullem. To bardziej niezawodna heurystyka.
        if (
            typeof lastArg === 'object' &&
            lastArg !== null &&
            !Array.isArray(lastArg) && // Tablice to argumenty splat
            !(lastArg instanceof Error) &&
            !(lastArg instanceof Date)
            // Można dodać więcej sprawdzeń, np. Buffer, Stream
        ) {
            meta = lastArg;
            splatArgs = args.slice(0, -1); // Reszta to splat
        }
    }

    // Połącz metadane domyślne loggera z tymi z wywołania
    const metaData = { ...(this.defaultMeta || {}), ...(meta || {}) };

    // Przygotuj wiadomość i potencjalny błąd
    let messageToSend: any = message;
    let errorToLog: Error | undefined = undefined;

    // Jeśli pierwsza 'wiadomość' jest błędem, użyj jej message i zapisz błąd
    if (message instanceof Error) {
        messageToSend = message.message;
        errorToLog = message;
    }

    // Stwórz obiekt LogInfo
    const logEntry: LogInfo = {
        level,
        message: messageToSend,
        timestamp,
        // Dodaj splat, tylko jeśli istnieją argumenty i wiadomość jest stringiem
        // Formater `splat` i tak sprawdzi typ wiadomości przed użyciem `util.format`
        splat: splatArgs.length > 0 ? splatArgs : undefined,
        ...metaData, // Dołącz połączone metadane
    };

     // Jeśli oryginalna 'message' była błędem, upewnij się, że jest w meta pod kluczem 'error'
     // aby formater `errors` mógł go znaleźć. Nadpisz, jeśli meta już zawiera 'error'.
     if (errorToLog) {
        logEntry.error = errorToLog;
     }

    // Przekaż do przetworzenia i wysłania
    this.processAndTransport(logEntry);
  }
  // --- KONIEC ZMIANY ---


  // Metoda logEntry (aktualizacja typu + przekazanie splat)
  public logEntry(entry: LogEntryInput): void {
    // Zapewnij domyślne wartości dla level i message, jeśli brak
    const level = entry.level || 'info';
    if (!this.isLevelEnabled(level)) return; // Sprawdź poziom

    // message może być opcjonalne w LogEntryInput, więc obsłuż undefined
    const message = entry.message ?? '';
    // Pobierz resztę pól, w tym splat, jeśli istnieje
    const { timestamp: inputTimestamp, splat, ...rest } = entry;
    const timestamp = inputTimestamp instanceof Date ? inputTimestamp : new Date();
    const metaData = { ...(this.defaultMeta || {}), ...rest }; // Łączymy meta z entry i defaultMeta
    // Stwórz obiekt LogInfo, przekazując splat
    const logEntry: LogInfo = { level, message, timestamp, splat, ...metaData };
    this.processAndTransport(logEntry);
  }

  // Metoda sprawdzająca poziom głównego loggera (bez zmian)
  public isLevelEnabled(level: LogLevel): boolean {
    const targetLevelValue = this.levels[level];
    const currentLevelValue = this.levels[this.level];
    if (targetLevelValue === undefined || currentLevelValue === undefined) return false;
    return targetLevelValue <= currentLevelValue;
  }

  // Metoda dodająca transport (bez zmian)
  public addTransport(transport: Transport): void { this.transports.push(transport); }

  // Metoda tworząca logger potomny (bez zmian)
  public child(childMeta: Record<string, any>): LoggerInterface {
    const newDefaultMeta = { ...(this.defaultMeta || {}), ...childMeta };
    const childLogger = new Scribelog({
      ...this.options,
      transports: this.transports,
      defaultMeta: newDefaultMeta,
    });
    return childLogger;
  }

  // Metoda logError (bez zmian)
  private logError(eventType: 'uncaughtException' | 'unhandledRejection', error: Error, callback: () => void): void {
    try {
        const errorMeta = this.formatError(error);
        const logEntry: LogInfo = {
            level: 'error',
            message: error.message || 'Unknown error', // Wiadomość błędu jako główna wiadomość
            timestamp: new Date(),
            error: error, // Przekaż oryginalny błąd do format.errors()
            exception: true,
            eventType: eventType,
            ...errorMeta, // Dodaj name, stack etc.
            ...(this.defaultMeta || {})
        };
        this.processAndTransport(logEntry);
    } catch (logErr) {
         console.error('[scribelog] Error occurred during error logging:', logErr);
         console.error('[scribelog] Original error was:', error);
    } finally {
         callback();
    }
}

  // Metoda formatError (bez zmian)
  private formatError(err: Error): Record<string, any> {
      const standardKeys = ['message', 'name', 'stack'];
      const properties = Object.getOwnPropertyNames(err).reduce((acc, key) => {
          if (!standardKeys.includes(key)) { acc[key] = (err as any)[key]; }
          return acc;
      }, {} as Record<string, any>);
      return {
          // message: err.message, // Nie potrzebujemy duplikować, bo jest w logEntry
          name: err.name,
          stack: err.stack,
          ...properties,
          ...(err as any).originalReason ? { originalReason: (err as any).originalReason } : {}
      };
  }

  // Metoda removeExceptionHandlers (bez zmian)
  public removeExceptionHandlers(): void {
      if (this.exceptionHandler) {
          process.removeListener('uncaughtException', this.exceptionHandler);
          this.exceptionHandler = undefined;
      }
       if (this.rejectionHandler) {
          process.removeListener('unhandledRejection', this.rejectionHandler);
          this.rejectionHandler = undefined;
       }
  }

  // Metoda processAndTransport (bez zmian)
  private processAndTransport(logEntry: LogInfo): void {
    for (const transport of this.transports) {
      if (this.isTransportLevelEnabled(transport, logEntry.level)) {
        const formatToUse = transport.format || this.format;
        const processedOutput = formatToUse({ ...logEntry }); // Przekaż kopię
        try {
          transport.log(processedOutput);
        } catch (err) {
          console.error('[scribelog] Error in transport:', err);
        }
      }
    }
   }

  // Metoda sprawdzająca poziom transportu (bez zmian)
  private isTransportLevelEnabled(transport: Transport, entryLevel: LogLevel): boolean {
    const transportLevel = transport.level;
    if (!transportLevel) return true;
    const transportLevelValue = this.levels[transportLevel];
    const entryLevelValue = this.levels[entryLevel];
    if (transportLevelValue === undefined || entryLevelValue === undefined) return false;
    return entryLevelValue <= transportLevelValue;
   }
}

// Fabryka do tworzenia loggera (bez zmian)
export function createLogger(options?: LoggerOptions): LoggerInterface {
  return new Scribelog(options);
}