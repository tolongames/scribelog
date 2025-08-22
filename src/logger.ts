// src/logger.ts
import { standardLevels, LogLevels } from './levels'; // Usunięto LogLevel as DefaultLogLevels
// Importuj zaktualizowane typy z ./types
import type {
  LoggerOptions,
  LogInfo,
  Transport,
  LogFormat,
  LoggerInterface as _LoggerInterface,
  LogLevel, // Zaktualizowany LogLevel = string
} from './types';
import { ConsoleTransport } from './transports/console';
import * as format from './format';
import { _internalExit } from './utils';
import { getRequestId } from './requestContext';
// Nie potrzebujemy już utilFormat tutaj, bo jest w format.ts
// import { format as utilFormat } from 'util';

// Typ wejściowy dla logEntry - używa zaktualizowanego LogLevel
type LogEntryInput = Omit<LogInfo, 'timestamp' | 'level' | 'message'> &
  Partial<Pick<LogInfo, 'level' | 'message' | 'splat'>> & { timestamp?: Date };

// Re-eksport typu LoggerInterface (który teraz jest dynamiczny)
export type LoggerInterface = _LoggerInterface;

// Klasa Scribelog implementująca dynamiczny interfejs LoggerInterface
export class Scribelog implements LoggerInterface {
  public levels: LogLevels;
  public level: LogLevel;
  private transports: Transport[];
  private profilerOptions: LoggerOptions['profiler'];
  private profiles = new Map<string, bigint>();
  private format: LogFormat;
  private defaultMeta?: Record<string, any>;
  private options: LoggerOptions;

  private profileStartMeta = new Map<string, Record<string, any>>();
  // --- POCZĄTEK ZMIANY: obsługa współbieżności/kolizji ---
  private profileSeq = 0;
  private labelStacks = new Map<string, string[]>(); // label -> stos kluczy
  private keyToLabel = new Map<string, string>(); // key -> label (odwrotna mapa)
  private cleanupTimer?: NodeJS.Timeout; // interwał sprzątania osieroconych wpisów

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
      console.warn(
        `[scribelog] Unknown log level "${defaultLogLevel}" provided in options. Defaulting to "info".`
      );
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
        console.warn(
          `[scribelog] Default level "${defaultLogLevel}" or fallback "info" not found in defined levels. Defaulting to first available level: "${this.level}".`
        );
      } else {
        // Krytyczna sytuacja - brak jakichkolwiek poziomów
        this.levels = { error: 0 }; // Dodaj 'error' jako minimum
        this.level = 'error';
        console.error(
          '[scribelog] No log levels defined. Defaulting to error level only.'
        );
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
    this.profilerOptions = options.profiler || {};

    const ttlMs = this.profilerOptions.ttlMs;
    const cleanupEvery = this.profilerOptions.cleanupIntervalMs ?? 60_000; // domyślnie 60s
    const hasCleanup = typeof ttlMs === 'number' && ttlMs > 0;
    if (hasCleanup) {
      this.cleanupTimer = setInterval(() => {
        try {
          this.cleanupProfiles();
        } catch (e) {
          console.warn('[scribelog] cleanupProfiles failed:', e);
        }
      }, cleanupEvery);
      // Nie blokuj procesu
      if (typeof (this.cleanupTimer as any)?.unref === 'function') {
        (this.cleanupTimer as any).unref();
      }
    }

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
        console.warn(
          `[scribelog] Could not create logging method for level "${levelName}":`,
          e
        );
      }
    });

    // Konfiguracja obsługi błędów
    if (options.handleExceptions) {
      this.exceptionHandler = (err: Error) => {
        this.logError('uncaughtException', err, () => {
          if (this.exitOnError) {
            _internalExit(1);
          }
        });
      };
      process.removeAllListeners('uncaughtException');
      process.on('uncaughtException', this.exceptionHandler);
    }
    if (options.handleRejections) {
      this.rejectionHandler = (reason: any, _promise: Promise<any>) => {
        const error =
          reason instanceof Error
            ? reason
            : new Error(String(reason ?? 'Unhandled Rejection'));
        if (!(reason instanceof Error)) {
          (error as any).originalReason = reason;
        }
        this.logError('unhandledRejection', error, () => {
          if (this.exitOnError) {
            _internalExit(1);
          }
        });
      };
      process.removeAllListeners('unhandledRejection');
      process.on('unhandledRejection', this.rejectionHandler);
    }
  }

  private emitProfileEvent(params: {
    label: string;
    durationMs: number;
    success?: boolean;
    level: LogLevel;
    metaOut: Record<string, any>;
    key?: string;
  }): void {
    const cb = this.profilerOptions?.onMeasure;
    if (typeof cb !== 'function') return;
    try {
      const { label, durationMs, success, level, metaOut, key } = params;
      const event = {
        label,
        durationMs,
        success,
        level,
        tags: Array.isArray(metaOut.tags) ? metaOut.tags : undefined,
        requestId:
          (metaOut &&
            typeof metaOut.requestId === 'string' &&
            metaOut.requestId) ||
          getRequestId(),
        meta: { ...metaOut },
        key,
      };
      cb(event);
    } catch (e) {
      // Nigdy nie przerywaj logowania przez błąd hooka
      console.warn('[scribelog] profiler.onMeasure hook threw:', e);
    }
  }

  private composeProfileTags(existing?: any): string[] {
    const profiler = this.profilerOptions || {};
    const base = ['profile'];
    const def = Array.isArray(profiler.tagsDefault) ? profiler.tagsDefault : [];
    const provided = Array.isArray(existing) ? existing : [];
    const mode = profiler.tagsMode || 'append';

    let ordered: string[];
    switch (mode) {
      case 'replace':
        ordered = provided.length ? provided : def.length ? def : base;
        break;
      case 'prepend':
        ordered = [...base, ...def, ...provided];
        break;
      case 'append':
      default:
        ordered = [...provided, ...base, ...def];
        break;
    }
    // deduplikacja z zachowaniem kolejności
    const seen = new Set<string>();
    const out: string[] = [];
    for (const t of ordered) {
      if (typeof t === 'string' && !seen.has(t)) {
        seen.add(t);
        out.push(t);
      }
    }
    return out;
  }

  private applyDefaultProfileFields(metaOut: Record<string, any>): void {
    const fields = this.profilerOptions?.fieldsDefault;
    if (fields && typeof fields === 'object') {
      for (const key of Object.keys(fields)) {
        if (metaOut[key] === undefined) {
          metaOut[key] = (fields as any)[key];
        }
      }
    }
  }

  private shouldStartProfile(): boolean {
    const p = this.profilerOptions || {};
    // Jeśli użytkownik podał getLevel, nie możemy z góry określić poziomu -> profiluj
    if (typeof p.getLevel === 'function') return true;

    const baseLevel = (p.level || 'debug') as LogLevel;
    if (this.isLevelEnabled(baseLevel)) return true;

    // Jeżeli zdefiniowane progi, sprawdź czy wyższe poziomy są włączone
    if (
      p.thresholdErrorMs !== undefined &&
      this.isLevelEnabled('error' as LogLevel)
    ) {
      return true;
    }
    if (
      p.thresholdWarnMs !== undefined &&
      this.isLevelEnabled('warn' as LogLevel)
    ) {
      return true;
    }
    return false;
  }

  private makeProfileKey(label: string, meta?: Record<string, any>): string {
    const profiler = this.profilerOptions || {};
    try {
      if (typeof profiler?.keyFactory === 'function') {
        const k = profiler.keyFactory(label, meta);
        if (k && typeof k === 'string') return k;
      }
    } catch (e) {
      console.warn('[scribelog] profiler.keyFactory threw:', e);
    }
    const rid =
      profiler?.namespaceWithRequestId && typeof getRequestId === 'function'
        ? getRequestId()
        : undefined;
    this.profileSeq = (this.profileSeq + 1) % Number.MAX_SAFE_INTEGER;
    const prefix = rid ? `${rid}:` : '';
    return `${prefix}${label}#${this.profileSeq}`;
  }

  private pushLabelKey(label: string, key: string): void {
    const stack = this.labelStacks.get(label) || [];
    stack.push(key);
    this.labelStacks.set(label, stack);
  }

  private popLabelKey(label: string): string | undefined {
    const stack = this.labelStacks.get(label);
    if (!stack || stack.length === 0) return undefined;
    const key = stack.pop()!;
    if (stack.length === 0) this.labelStacks.delete(label);
    else this.labelStacks.set(label, stack);
    return key;
  }

  private removeLabelKey(label: string, key: string): void {
    const stack = this.labelStacks.get(label);
    if (!stack || stack.length === 0) return;
    const idx = stack.lastIndexOf(key);
    if (idx >= 0) {
      stack.splice(idx, 1);
      if (stack.length === 0) this.labelStacks.delete(label);
      else this.labelStacks.set(label, stack);
    }
  }

  private removeProfileByKey(key: string): void {
    // Usuń z profiles i powiązanych struktur
    this.profiles.delete(key);
    this.profileStartMeta.delete(key);
    const label = this.keyToLabel.get(key);
    if (label) {
      this.removeLabelKey(label, key);
      this.keyToLabel.delete(key);
    }
  }

  private cleanupProfiles(): void {
    const ttlMs = this.profilerOptions?.ttlMs;
    if (typeof ttlMs === 'number' && ttlMs > 0) {
      const now = process.hrtime.bigint();
      const ttlNs = BigInt(Math.floor(ttlMs * 1e6)); // ms -> ns
      // profiles: Map<key, startNs>
      for (const [key, startNs] of this.profiles) {
        const ageNs = now - startNs;
        if (ageNs > ttlNs) {
          // Orphan cleanup
          this.removeProfileByKey(key);
          // Uwaga: używamy console.warn aby uniknąć rekurencji loggera
          console.warn(
            `[scribelog] Removed orphaned profile "${key}" after exceeding TTL ${ttlMs}ms`
          );
        }
      }
    }

    const maxActive = this.profilerOptions?.maxActiveProfiles;
    if (typeof maxActive === 'number' && maxActive > 0) {
      while (this.profiles.size > maxActive) {
        // Usuń najstarszy (Map zachowuje kolejność wstawiania)
        const oldestKey = this.profiles.keys().next().value as
          | string
          | undefined;
        if (!oldestKey) break;
        this.removeProfileByKey(oldestKey);
        console.warn(
          `[scribelog] Removed oldest active profile "${oldestKey}" due to maxActiveProfiles=${maxActive}`
        );
      }
    }
  }

  // Metody logowania poziomów (error, warn, info itd.) są generowane dynamicznie.

  // Metoda log
  // ...existing code...
  public log(level: LogLevel, message: any, ...args: any[]): void {
    if (!this.isLevelEnabled(level)) return;
    const timestamp = new Date();
    let meta: Record<string, any> | undefined = undefined;
    let splatArgs: any[] = args;
    if (args.length > 0) {
      const lastArg = args[args.length - 1];
      if (
        typeof lastArg === 'object' &&
        lastArg !== null &&
        !Array.isArray(lastArg) &&
        !(lastArg instanceof Error) &&
        !(lastArg instanceof Date)
      ) {
        meta = lastArg;
        splatArgs = args.slice(0, -1);
      }
    }
    // --- POCZĄTEK ZMIANY: obsługa tags ---
    const metaData = { ...(this.defaultMeta || {}), ...(meta || {}) };
    let tags: string[] | undefined = undefined;
    if (Array.isArray(metaData.tags)) {
      tags = metaData.tags;
    }
    const requestId = getRequestId();
    if (requestId && !metaData.requestId) {
      metaData.requestId = requestId;
    }
    // --- KONIEC ZMIANY ---
    let messageToSend: any = message;
    let errorToLog: Error | undefined = undefined;
    if (message instanceof Error) {
      messageToSend = message.message;
      errorToLog = message;
    }
    const logEntry: LogInfo = {
      level,
      message: messageToSend,
      timestamp,
      splat: splatArgs.length > 0 ? splatArgs : undefined,
      ...metaData,
      ...(tags ? { tags } : {}),
    };
    if (errorToLog && !logEntry.error) {
      logEntry.error = errorToLog;
    }
    this.processAndTransport(logEntry);
  }
  // ...existing code...
  public profile(
    label: string,
    meta?: Record<string, any>
  ): { key: string; label: string } {
    // Fast‑path: jeśli profilowanie wyłączone (np. brak debug i progów), nie zakładaj Map
    if (!this.shouldStartProfile()) {
      return { key: '', label }; // no-op handle
    }

    const key = this.makeProfileKey(label, meta);
    this.profiles.set(key, process.hrtime.bigint());
    if (meta && typeof meta === 'object') {
      this.profileStartMeta.set(key, meta);
    }
    this.pushLabelKey(label, key);
    this.keyToLabel.set(key, label);

    // Egzekwuj maxActiveProfiles “na gorąco”
    const maxActive = this.profilerOptions?.maxActiveProfiles;
    if (typeof maxActive === 'number' && maxActive > 0) {
      while (this.profiles.size > maxActive) {
        const oldestKey = this.profiles.keys().next().value as
          | string
          | undefined;
        if (!oldestKey || oldestKey === key) break;
        this.removeProfileByKey(oldestKey);
        console.warn(
          `[scribelog] Removed oldest active profile "${oldestKey}" due to maxActiveProfiles=${maxActive}`
        );
      }
    }
    return { key, label };
  }

  public profileEnd(
    labelOrHandle: string | { key: string; label: string },
    meta?: Record<string, any>
  ): void {
    const isHandle =
      typeof labelOrHandle === 'object' && labelOrHandle !== null;
    const label = isHandle
      ? (labelOrHandle as any).label
      : (labelOrHandle as string);
    const key = isHandle ? (labelOrHandle as any).key : this.popLabelKey(label);

    if (!key) {
      return;
    }
    if (isHandle) {
      this.removeLabelKey(label, key);
    }
    this.keyToLabel.delete(key);

    const start = this.profiles.get(key);
    // NEW: jeśli start nie istnieje (profil usunięty przez TTL/limit), nie loguj
    if (start === undefined) {
      this.profileStartMeta.delete(key);
      return;
    }

    const end = process.hrtime.bigint();
    const durationMs = Number(end - start) / 1e6;
    this.profiles.delete(key);

    const startMeta = this.profileStartMeta.get(key);
    if (startMeta) this.profileStartMeta.delete(key);

    const metaOut: Record<string, any> = {
      ...(startMeta || {}),
      ...(meta || {}),
      profileLabel: label,
      durationMs: Math.round(durationMs),
    };

    metaOut.tags = this.composeProfileTags(metaOut.tags);
    this.applyDefaultProfileFields(metaOut);

    // Ustal poziom wg opcji/heurystyki
    const profiler = this.profilerOptions || {};
    let level: LogLevel =
      (metaOut.level as LogLevel) || profiler.level || 'debug';
    if (typeof profiler.getLevel === 'function') {
      level = profiler.getLevel(durationMs, metaOut);
    } else if (
      profiler.thresholdErrorMs !== undefined &&
      durationMs >= profiler.thresholdErrorMs
    ) {
      level = 'error';
    } else if (
      profiler.thresholdWarnMs !== undefined &&
      durationMs >= profiler.thresholdWarnMs
    ) {
      level = 'warn';
    }

    if ('level' in metaOut) delete (metaOut as any).level;

    this.emitProfileEvent({
      label,
      durationMs: Math.round(durationMs),
      level,
      metaOut,
      key,
    });

    // Poprawka: użyj wyliczonego poziomu
    this.log(level, label, metaOut);
  }

  // Alias: time/timeEnd
  public time(label: string, meta?: Record<string, any>): void {
    this.profile(label, meta);
  }
  public timeEnd(
    labelOrHandle: string | { key: string; label: string },
    meta?: Record<string, any>
  ): void {
    this.profileEnd(labelOrHandle as any, meta);
  }

  // Wygodne pomiary bloków sync/async
  public timeSync<T>(
    label: string,
    fn: () => T,
    meta?: Record<string, any>
  ): T {
    // Fast‑path: wyłączone profilowanie -> bez logowania
    if (!this.shouldStartProfile()) {
      return fn();
    }
    const start = process.hrtime.bigint();
    try {
      return fn();
    } finally {
      const durationMs = Number(process.hrtime.bigint() - start) / 1e6;
      const metaOut: Record<string, any> = {
        ...(meta || {}),
        profileLabel: label,
        durationMs: Math.round(durationMs),
        success: true,
        tags: Array.isArray(meta?.tags) ? [...meta!.tags] : undefined,
      };

      metaOut.tags = this.composeProfileTags(metaOut.tags);
      this.applyDefaultProfileFields(metaOut);

      const profiler = this.profilerOptions || {};
      let level: LogLevel =
        (metaOut.level as LogLevel) || profiler.level || 'debug';
      if (typeof profiler.getLevel === 'function') {
        level = profiler.getLevel(durationMs, metaOut);
      } else if (
        profiler.thresholdErrorMs !== undefined &&
        durationMs >= profiler.thresholdErrorMs
      ) {
        level = 'error';
      } else if (
        profiler.thresholdWarnMs !== undefined &&
        durationMs >= profiler.thresholdWarnMs
      ) {
        level = 'warn';
      }
      if ('level' in metaOut) delete (metaOut as any).level;

      this.emitProfileEvent({
        label,
        durationMs: Math.round(durationMs),
        success: true,
        level,
        metaOut,
      });

      this.log(level, label, metaOut);
    }
  }

  public async timeAsync<T>(
    label: string,
    fn: () => Promise<T>,
    meta?: Record<string, any>
  ): Promise<T> {
    // Fast‑path: wyłączone profilowanie -> bez logowania
    if (!this.shouldStartProfile()) {
      return fn();
    }
    const start = process.hrtime.bigint();
    try {
      const result = await fn();
      const durationMs = Number(process.hrtime.bigint() - start) / 1e6;
      const metaOut: Record<string, any> = {
        ...(meta || {}),
        profileLabel: label,
        durationMs: Math.round(durationMs),
        success: true,
        tags: Array.isArray(meta?.tags) ? [...meta!.tags] : undefined,
      };

      metaOut.tags = this.composeProfileTags(metaOut.tags);
      this.applyDefaultProfileFields(metaOut);

      const profiler = this.profilerOptions || {};
      let level: LogLevel =
        (metaOut.level as LogLevel) || profiler.level || 'debug';
      if (typeof profiler.getLevel === 'function') {
        level = profiler.getLevel(durationMs, metaOut);
      } else if (
        profiler.thresholdErrorMs !== undefined &&
        durationMs >= profiler.thresholdErrorMs
      ) {
        level = 'error';
      } else if (
        profiler.thresholdWarnMs !== undefined &&
        durationMs >= profiler.thresholdWarnMs
      ) {
        level = 'warn';
      }
      if ('level' in metaOut) delete (metaOut as any).level;

      this.emitProfileEvent({
        label,
        durationMs: Math.round(durationMs),
        success: true,
        level,
        metaOut,
      });

      this.log(level, label, metaOut);
      return result;
    } catch (error) {
      const durationMs = Number(process.hrtime.bigint() - start) / 1e6;
      const metaOut: Record<string, any> = {
        ...(meta || {}),
        profileLabel: label,
        durationMs: Math.round(durationMs),
        success: false,
        error,
        tags: Array.isArray(meta?.tags) ? [...meta!.tags] : undefined,
      };
      metaOut.tags = this.composeProfileTags(metaOut.tags);
      this.applyDefaultProfileFields(metaOut);

      const profiler = this.profilerOptions || {};
      let level: LogLevel =
        (metaOut.level as LogLevel) || profiler.level || 'debug';
      if (typeof profiler.getLevel === 'function') {
        level = profiler.getLevel(durationMs, metaOut);
      } else if (
        profiler.thresholdErrorMs !== undefined &&
        durationMs >= profiler.thresholdErrorMs
      ) {
        level = 'error';
      } else if (
        profiler.thresholdWarnMs !== undefined &&
        durationMs >= profiler.thresholdWarnMs
      ) {
        level = 'warn';
      }
      if ('level' in metaOut) delete (metaOut as any).level;

      // FIX: emit success=false w evencie
      this.emitProfileEvent({
        label,
        durationMs: Math.round(durationMs),
        success: false,
        level,
        metaOut,
      });

      this.log(level, label, metaOut);
      throw error;
    }
  }
  // Metoda logEntry
  public logEntry(entry: LogEntryInput): void {
    const level = entry.level || 'info';
    if (!this.isLevelEnabled(level)) return;
    const message = entry.message ?? '';
    const { timestamp: inputTimestamp, splat, ...rest } = entry;
    const timestamp =
      inputTimestamp instanceof Date ? inputTimestamp : new Date();
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
  public addTransport(transport: Transport): void {
    this.transports.push(transport);
  }

  // Metoda child (przekazuje this.levels)
  public child(childMeta: Record<string, any>): LoggerInterface {
    const newDefaultMeta = { ...(this.defaultMeta || {}), ...childMeta };
    const childLogger = new Scribelog(
      {
        // Opcje dla dziecka - kopiujemy z rodzica, ale BEZ levels
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
  private logError(
    eventType: 'uncaughtException' | 'unhandledRejection',
    error: Error,
    callback: () => void
  ): void {
    try {
      const errorMeta = this.formatError(error);
      const logEntry: LogInfo = {
        level: 'error',
        message: error.message || 'Unknown error',
        timestamp: new Date(),
        error: error,
        exception: true,
        eventType: eventType,
        ...errorMeta,
        ...(this.defaultMeta || {}),
      };
      this.processAndTransport(logEntry);
    } catch (logErr) {
      console.error('[scribelog] Error occurred during error logging:', logErr);
      console.error('[scribelog] Original error was:', error);
    } finally {
      callback();
    }
  }

  // Metoda formatError
  private formatError(err: Error): Record<string, any> {
    const standardKeys = ['message', 'name', 'stack'];
    const properties = Object.getOwnPropertyNames(err).reduce(
      (acc, key) => {
        if (!standardKeys.includes(key)) {
          acc[key] = (err as any)[key];
        }
        return acc;
      },
      {} as Record<string, any>
    );
    return {
      name: err.name,
      stack: err.stack,
      ...properties,
      ...((err as any).originalReason
        ? { originalReason: (err as any).originalReason }
        : {}),
    };
  }

  // Metoda removeExceptionHandlers
  public removeExceptionHandlers(): void {
    if (this.exceptionHandler) {
      process.removeListener('uncaughtException', this.exceptionHandler);
      this.exceptionHandler = undefined;
    }
    if (this.rejectionHandler) {
      process.removeListener('unhandledRejection', this.rejectionHandler);
      this.rejectionHandler = undefined;
    }
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = undefined;
    }
  }

  public dispose(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = undefined;
    }
  }

  // Metoda processAndTransport
  private processAndTransport(logEntry: LogInfo): void {
    for (const transport of this.transports) {
      if (this.isTransportLevelEnabled(transport, logEntry.level)) {
        const formatToUse = transport.format || this.format;
        const processedOutput = formatToUse({ ...logEntry });
        try {
          transport.log(processedOutput);
        } catch (err) {
          console.error('[scribelog] Error in transport:', err);
        }
      }
    }
  }

  // Metoda isTransportLevelEnabled
  private isTransportLevelEnabled(
    transport: Transport,
    entryLevel: LogLevel
  ): boolean {
    const transportLevel = transport.level;
    if (!transportLevel) return true;
    const transportLevelValue = this.levels[transportLevel];
    const entryLevelValue = this.levels[entryLevel];
    if (transportLevelValue === undefined || entryLevelValue === undefined)
      return false;
    return entryLevelValue <= transportLevelValue;
  }
}

// Fabryka loggera
export function createLogger(options?: LoggerOptions): LoggerInterface {
  // Wywołuje konstruktor bez drugiego argumentu (parentLevels)
  return new Scribelog(options);
}
