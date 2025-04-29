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

// Typ wejściowy dla logEntry
type LogEntryInput = Omit<LogInfo, 'timestamp'> & { timestamp?: Date };

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

  private exitOnError: boolean; // Czy kończyć proces po błędzie
  private exceptionHandler?: (err: Error) => void; // Listener dla uncaughtException
  private rejectionHandler?: (reason: any, promise: Promise<any>) => void; // Listener dla unhandledRejection

  constructor(options: LoggerOptions = {}) {
    this.options = { ...options }; // Zapisz kopię opcji
    this.levels = options.levels || standardLevels;
    this.level = options.level || 'info';
    this.transports =
      options.transports && options.transports.length > 0
        ? options.transports
        : [new ConsoleTransport()]; // Domyślnie ConsoleTransport
    // Użyj formatu z opcji lub domyślnego simple (który teraz zawiera errors())
    this.format = options.format || format.defaultSimpleFormat;
    this.defaultMeta = options.defaultMeta;

    // Ustaw flagę exitOnError
    this.exitOnError = options.exitOnError !== false;

    // Konfiguracja obsługi nieprzechwyconych wyjątków
    if (options.handleExceptions) {
      this.exceptionHandler = (err: Error) => {
        // Wywołaj logError, przekazując callback do ewentualnego wyjścia
        this.logError('uncaughtException', err, () => {
          if (this.exitOnError) {
            _internalExit(1); // Użyj _internalExit
          }
        });
      };
      // Ostrożnie z removeAllListeners w produkcji!
      process.removeAllListeners('uncaughtException');
      process.on('uncaughtException', this.exceptionHandler);
    }

    // Konfiguracja obsługi nieprzechwyconych odrzuceń promisów
    if (options.handleRejections) {
      this.rejectionHandler = (reason: any, _promise: Promise<any>) => {
        // Stwórz obiekt Error, nawet jeśli reason nim nie jest
        const error =
          reason instanceof Error
            ? reason
            : new Error(String(reason ?? 'Unhandled Rejection'));
        if (!(reason instanceof Error)) {
          (error as any).originalReason = reason;
        }
        // Wywołaj logError, przekazując callback
        this.logError('unhandledRejection', error, () => {
          if (this.exitOnError) {
            _internalExit(1); // Użyj _internalExit
          }
        });
      };
      // Ostrożnie z removeAllListeners w produkcji!
      process.removeAllListeners('unhandledRejection');
      process.on('unhandledRejection', this.rejectionHandler);
    }
  }

  // Metody poziomów (delegują do log)
  public error(message: string, meta?: Record<string, any>): void {
    this.log('error', message, meta);
  }
  public warn(message: string, meta?: Record<string, any>): void {
    this.log('warn', message, meta);
  }
  public info(message: string, meta?: Record<string, any>): void {
    this.log('info', message, meta);
  }
  public http(message: string, meta?: Record<string, any>): void {
    this.log('http', message, meta);
  }
  public verbose(message: string, meta?: Record<string, any>): void {
    this.log('verbose', message, meta);
  }
  public debug(message: string, meta?: Record<string, any>): void {
    this.log('debug', message, meta);
  }
  public silly(message: string, meta?: Record<string, any>): void {
    this.log('silly', message, meta);
  }

  // Metoda log (główna logika dla standardowych wywołań)
  public log(
    level: LogLevel,
    message: string,
    meta?: Record<string, any>
  ): void {
    // Sprawdź najpierw poziom głównego loggera
    if (!this.isLevelEnabled(level)) return;
    const timestamp = new Date();
    // Połącz metadane
    const metaData = { ...(this.defaultMeta || {}), ...(meta || {}) };
    // Stwórz podstawowy obiekt LogInfo
    const logEntry: LogInfo = { level, message, timestamp, ...metaData };
    // Przekaż do przetworzenia i wysłania
    this.processAndTransport(logEntry);
  }

  // Metoda logEntry (dla przekazywania gotowych obiektów)
  public logEntry(entry: LogEntryInput): void {
    const { level, message, timestamp: inputTimestamp, ...rest } = entry;
    // Sprawdź poziom głównego loggera
    if (!this.isLevelEnabled(level)) return;
    const timestamp =
      inputTimestamp instanceof Date ? inputTimestamp : new Date();
    // Połącz metadane
    const metaData = { ...(this.defaultMeta || {}), ...rest };
    // Stwórz obiekt LogInfo
    const logEntry: LogInfo = { level, message, timestamp, ...metaData };
    // Przekaż do przetworzenia i wysłania
    this.processAndTransport(logEntry);
  }

  // Metoda sprawdzająca poziom głównego loggera
  public isLevelEnabled(level: LogLevel): boolean {
    const targetLevelValue = this.levels[level];
    const currentLevelValue = this.levels[this.level];
    if (targetLevelValue === undefined || currentLevelValue === undefined)
      return false;
    return targetLevelValue <= currentLevelValue;
  }

  // Metoda dodająca transport
  public addTransport(transport: Transport): void {
    this.transports.push(transport);
  }

  // Metoda tworząca logger potomny
  public child(childMeta: Record<string, any>): LoggerInterface {
    const newDefaultMeta = { ...(this.defaultMeta || {}), ...childMeta };
    // Tworzy nową instancję z odziedziczonymi opcjami i nowymi meta
    const childLogger = new Scribelog({
      ...this.options,
      transports: this.transports, // Współdzielone transporty
      defaultMeta: newDefaultMeta,
    });
    return childLogger;
  }

  /**
   * Metoda do logowania błędów przechwyconych przez listenery process.on.
   * Tworzy specjalny obiekt LogInfo z metadanymi błędu.
   */
  private logError(
    eventType: 'uncaughtException' | 'unhandledRejection',
    error: Error,
    callback: () => void
  ): void {
    try {
      // Stwórz podstawowy obiekt LogInfo
      // Formater `errors()` (używany w domyślnych formatach) zajmie się rozpakowaniem 'error'
      const logEntry: LogInfo = {
        level: 'error', // Zawsze loguj jako błąd
        // Wiadomość teraz będzie pochodzić z format.message(), który weźmie error.message
        message: error.message || 'Unknown error',
        timestamp: new Date(),
        // Dodaj metadane specyficzne dla błędu, aby format.errors() je znalazł
        error: error, // Przekaż oryginalny obiekt błędu
        exception: true, // Flaga wskazująca na wyjątek/odrzucenie
        eventType: eventType, // Typ zdarzenia
        ...(this.defaultMeta || {}), // Dołącz domyślne metadane loggera
      };

      // processAndTransport zastosuje odpowiedni format (np. defaultSimpleFormat),
      // który zawiera format.errors() przetwarzający pole 'error'.
      this.processAndTransport(logEntry);
    } catch (logErr) {
      // Awaryjne logowanie, jeśli główny mechanizm zawiedzie
      console.error('[scribelog] Error occurred during error logging:', logErr);
      console.error('[scribelog] Original error was:', error);
    } finally {
      // Zawsze wywołaj callback, który może zawierać logikę wyjścia
      callback();
    }
  }

  /**
   * Usuwa listenery wyjątków dodane przez ten logger.
   */
  public removeExceptionHandlers(): void {
    if (this.exceptionHandler) {
      process.removeListener('uncaughtException', this.exceptionHandler);
      this.exceptionHandler = undefined; // Wyczyść referencję
    }
    if (this.rejectionHandler) {
      process.removeListener('unhandledRejection', this.rejectionHandler);
      this.rejectionHandler = undefined; // Wyczyść referencję
    }
  }

  // Metoda przetwarzająca i wysyłająca log do transportów
  private processAndTransport(logEntry: LogInfo): void {
    // Iteruj przez transporty
    for (const transport of this.transports) {
      // Sprawdź, czy poziom logu jest wystarczający dla TEGO transportu
      if (this.isTransportLevelEnabled(transport, logEntry.level)) {
        // Wybierz format: transportu lub domyślny loggera
        const formatToUse = transport.format || this.format;
        // Zastosuj format do KOPII obiektu logEntry
        const processedOutput = formatToUse({ ...logEntry });
        // Wywołaj metodę log transportu
        try {
          transport.log(processedOutput);
        } catch (err) {
          // Loguj błąd transportu do konsoli
          console.error('[scribelog] Error in transport:', err);
        }
      }
    }
  }

  // Metoda sprawdzająca poziom transportu
  private isTransportLevelEnabled(
    transport: Transport,
    entryLevel: LogLevel
  ): boolean {
    const transportLevel = transport.level;
    if (!transportLevel) return true; // Jeśli transport nie ma limitu, przepuść
    const transportLevelValue = this.levels[transportLevel];
    const entryLevelValue = this.levels[entryLevel];
    if (transportLevelValue === undefined || entryLevelValue === undefined)
      return false; // Nieznany poziom
    // Przepuść, jeśli poziom logu <= poziom transportu
    return entryLevelValue <= transportLevelValue;
  }
}

// Fabryka do tworzenia loggera
export function createLogger(options?: LoggerOptions): LoggerInterface {
  return new Scribelog(options);
}
