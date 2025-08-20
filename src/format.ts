// src/format.ts
import type { LogFormat, LogLevel } from './types';
import { inspect, format as utilFormat } from 'util';
import chalk, { Chalk } from 'chalk'; // Importuj typ Chalk
import { format as formatDate } from 'date-fns';
import * as os from 'os';
import * as process from 'process';

// --- Podstawowe Formaty ---

interface TimestampOptions {
  alias?: string;
  format?: string | ((date: Date) => string);
}

export const timestamp = (options: TimestampOptions = {}): LogFormat => {
  const { alias = 'timestamp', format: formatOption } = options;
  return (info: Record<string, any>): Record<string, any> => {
    const ts = info.timestamp instanceof Date ? info.timestamp : new Date();
    let formattedTs: string;
    if (typeof formatOption === 'function') {
      try {
        formattedTs = formatOption(ts);
      } catch (e) {
        console.error(
          '[scribelog] Error in custom timestamp format function:',
          e
        );
        formattedTs = ts.toISOString();
      }
    } else if (typeof formatOption === 'string') {
      try {
        formattedTs = formatDate(ts, formatOption);
      } catch (e) {
        console.error(
          '[scribelog] Invalid date format provided:',
          formatOption,
          e
        );
        formattedTs = ts.toISOString();
      }
    } else {
      formattedTs = ts.toISOString();
    }
    info[alias] = formattedTs;
    if (!(info.originalTimestamp instanceof Date)) {
      info.originalTimestamp = ts;
    }
    if (alias !== 'timestamp' && info.timestamp instanceof Date) {
      delete info.timestamp;
    }
    return info;
  };
};

export const level = (options: { alias?: string } = {}): LogFormat => {
  const { alias = 'level' } = options;
  return (info: Record<string, any>): Record<string, any> => {
    if (info.level) {
      info[alias] = info.level;
    }
    return info;
  };
};

export const message = (options: { alias?: string } = {}): LogFormat => {
  const { alias = 'message' } = options;
  return (info: Record<string, any>): Record<string, any> => {
    if (info.message !== undefined) {
      info[alias] = info.message;
    }
    return info;
  };
};

interface ErrorsOptions {
  stack?: boolean;
}

export const errors = (options: ErrorsOptions = {}): LogFormat => {
  const includeStack = options.stack !== false;
  return (info: Record<string, any>): Record<string, any> => {
    let error: Error | undefined = undefined;
    let errorKey: string | undefined = undefined;
    if (info.error instanceof Error) {
      error = info.error;
      errorKey = 'error';
    } else {
      for (const key in info) {
        if (info[key] instanceof Error) {
          error = info[key];
          errorKey = key;
          break;
        }
      }
    }
    if (error && errorKey) {
      if (info.message === undefined || info.message === '') {
        info.message = error.message;
      }
      info.errorName = error.name;
      if (includeStack) {
        info.stack = error.stack;
      }
      Object.getOwnPropertyNames(error).forEach((key) => {
        if (
          key !== 'message' &&
          key !== 'name' &&
          key !== 'stack' &&
          !(key in info)
        ) {
          info[key] = (error as any)[key];
        }
      });
      // Dodaj te pola do info, aby metadata() i simple() mogły je znaleźć
      if ((error as any).originalReason) {
        info.originalReason = (error as any).originalReason;
      }
      if (info.exception === undefined) info.exception = true; // Dodaj, jeśli nie ma (z logError)
      if (info.eventType === undefined && errorKey === 'error')
        info.eventType = 'caughtError'; // Oznacz błąd złapany przez loggera
      delete info[errorKey];
    }
    return info;
  };
};

export const splat = (): LogFormat => {
  return (info: Record<string, any>): Record<string, any> => {
    if (
      info.splat &&
      Array.isArray(info.splat) &&
      info.splat.length > 0 &&
      typeof info.message === 'string'
    ) {
      if (info.message.includes('%')) {
        try {
          const formattedMessage = utilFormat(info.message, ...info.splat);
          info.message = formattedMessage;
        } catch (e) {
          console.warn(
            '[scribelog] Error during splat formatting:',
            e,
            'Original message:',
            info.message,
            'Args:',
            info.splat
          );
        }
      }
    }
    delete info.splat;
    return info;
  };
};

export const pid = (options: { alias?: string } = {}): LogFormat => {
  const { alias = 'pid' } = options;
  const processPid = process.pid;
  return (info: Record<string, any>): Record<string, any> => {
    info[alias] = processPid;
    return info;
  };
};

export const hostname = (options: { alias?: string } = {}): LogFormat => {
  const { alias = 'hostname' } = options;
  let host: string | undefined;
  try {
    host = os.hostname();
  } catch (e) {
    console.error('[scribelog] Failed to get hostname:', e);
  }
  return (info: Record<string, any>): Record<string, any> => {
    if (host !== undefined) {
      info[alias] = host;
    }
    return info;
  };
};

export const metadata = (
  options: { alias?: string; exclude?: string[] } = {}
): LogFormat => {
  const { alias, exclude = [] } = options;
  // --- POCZĄTEK ZMIANY: Usunięto pola błędów z domyślnych wykluczeń ---
  // Wykluczamy tylko podstawowe pola formatowania i pola specjalne
  const standardAliases = [
    'timestamp',
    'level',
    'message',
    'originalTimestamp', // Pola czasu i podstawowe
    'errorName',
    'stack', // Pola błędu, które nie powinny być w meta, bo są obsługiwane inaczej
    'splat', // Pole robocze splat
    'pid',
    'hostname', // Pola specjalne pid/hostname
    // Usunięto: 'originalReason', 'exception', 'eventType' - chcemy je w metadanych
  ];
  // --- KONIEC ZMIANY ---
  if (alias) standardAliases.push(alias);
  const forbidden = new Set([...standardAliases, ...exclude]);
  return (info: Record<string, any>): Record<string, any> => {
    const meta: Record<string, any> = {};
    for (const key in info) {
      if (
        typeof key !== 'symbol' &&
        !forbidden.has(key) &&
        Object.prototype.hasOwnProperty.call(info, key)
      ) {
        meta[key] = info[key];
      }
    }
    if (alias) {
      info[alias] = meta;
      for (const key in meta) {
        if (!forbidden.has(key)) {
          delete info[key];
        }
      }
    }
    return info;
  };
};

// --- Formaty Końcowe ---

export const json = (options?: { space?: string | number }): LogFormat => {
  return (info: Record<string, any>): string => {
    const logObject = { ...info };
    delete logObject.originalTimestamp;
    delete logObject.splat;
    if (logObject.timestamp instanceof Date) {
      logObject.timestamp = logObject.timestamp.toISOString();
    }
    return JSON.stringify(logObject, null, options?.space);
  };
};

// Typ dla mapowania poziomów na funkcje kolorujące Chalk
type LevelColorMap = Partial<Record<LogLevel, Chalk>>;

/**
 * Opcje dla formatera simple.
 */
interface SimpleOptions {
  colors?: boolean;
  levelColors?: LevelColorMap;
  timestampColor?: Chalk;
  pidColor?: Chalk;
  hostnameColor?: Chalk;
}

export const simple = (options: SimpleOptions = {}): LogFormat => {
  const {
    colors: colorsOption,
    levelColors: customLevelColors,
    timestampColor,
    pidColor,
    hostnameColor,
  } = options;
  const defaultLevelColors: Record<string, Chalk> = {
    // Użyj string jako klucza dla kompatybilności
    error: chalk.red,
    warn: chalk.yellow,
    info: chalk.green,
    http: chalk.magenta,
    verbose: chalk.cyan,
    debug: chalk.blue,
    silly: chalk.gray,
  };
  const defaultTimestampColor = chalk.gray;
  const defaultPidColor = chalk.blue;
  const defaultHostnameColor = chalk.yellow;
  const levelColorMap = { ...defaultLevelColors, ...(customLevelColors || {}) };
  const finalTimestampColor = timestampColor || defaultTimestampColor;
  const finalPidColor = pidColor || defaultPidColor;
  const finalHostnameColor = hostnameColor || defaultHostnameColor;

  return (info: Record<string, any>): string => {
    const supportsColorInfo = chalk.supportsColor;
    const useColors =
      colorsOption !== undefined
        ? colorsOption
        : supportsColorInfo
          ? supportsColorInfo.hasBasic
          : false;
    const shouldUseColors = useColors && chalk.level > 0;

    const levelStr = (info.level || 'unknown') as string;
    const msgStr = info.message !== undefined ? String(info.message) : '';
    const timestampStr =
      typeof info.timestamp === 'string'
        ? info.timestamp
        : info.originalTimestamp instanceof Date
          ? info.originalTimestamp.toISOString()
          : new Date().toISOString();

    const levelColorFn = levelColorMap[levelStr] || ((str: string) => str);
    const timestampColorFn = finalTimestampColor;
    const pidColorFn = finalPidColor;
    const hostnameColorFn = finalHostnameColor;

    const coloredLevel = shouldUseColors
      ? levelColorFn(`[${levelStr.toUpperCase()}]`)
      : `[${levelStr.toUpperCase()}]`;
    const coloredTimestamp = shouldUseColors
      ? timestampColorFn(timestampStr)
      : timestampStr;
    const pidStr = info.pid
      ? shouldUseColors
        ? pidColorFn(`(pid:${info.pid})`)
        : `(pid:${info.pid})`
      : '';
    const hostnameStr = info.hostname
      ? shouldUseColors
        ? hostnameColorFn(`@${info.hostname}`)
        : `@${info.hostname}`
      : '';

    const meta: Record<string, any> = {};
    // --- POCZĄTEK ZMIANY: Usunięto pola błędów z forbidden ---
    const forbidden = new Set([
      'timestamp',
      'level',
      'message',
      'originalTimestamp',
      'errorName',
      'stack',
      'splat',
      'pid',
      'hostname',
      'tags',
    ]);
    const tagsString =
      Array.isArray(info.tags) && info.tags.length
        ? ` [${info.tags.join(', ')}]`
        : '';
    // Usunięto: 'originalReason', 'exception', 'eventType'
    // --- KONIEC ZMIANY ---
    for (const key in info) {
      if (
        typeof key !== 'symbol' &&
        !forbidden.has(key) &&
        Object.prototype.hasOwnProperty.call(info, key)
      ) {
        meta[key] = info[key];
      }
    }
    const metaString = Object.keys(meta).length
      ? ` ${inspect(meta, { colors: shouldUseColors, depth: null })}`
      : '';
    const stackString =
      info.stack && (!metaString || !metaString.includes(info.stack))
        ? `\n${info.stack}`
        : '';

    return `${coloredTimestamp}${hostnameStr} ${coloredLevel}${pidStr}${tagsString}: ${msgStr}${metaString}${stackString}`;
  };
};

// --- Funkcja Kompozycyjna ---
export const combine = (...formats: LogFormat[]): LogFormat => {
  return (info: Record<string, any>): Record<string, any> | string => {
    let currentInfo: Record<string, any> = { ...info };
    for (const format of formats) {
      const result = format(currentInfo);
      if (typeof result === 'string') {
        return result;
      }
      currentInfo =
        typeof result === 'object' && result !== null ? result : currentInfo;
    }
    return currentInfo;
  };
};

// --- Predefiniowane Formaty ---
export const defaultJsonFormat = combine(
  errors({ stack: true }),
  splat(),
  timestamp(),
  pid(),
  hostname(),
  level(),
  message(),
  metadata(),
  json()
);
export const defaultSimpleFormat = combine(
  errors({ stack: true }),
  splat(),
  timestamp(),
  pid(),
  hostname(),
  level(),
  message(),
  metadata(),
  simple()
);

// ...existing code...

/**
 * Formatter maskujący wrażliwe dane w logu.
 * @param fields - Tablica nazw pól do zamaskowania (np. ['password', 'token'])
 * @param mask - Wartość maskująca (np. '***' lub funkcja)
 */
export function maskSensitive(
  fields: string[] = ['password', 'token', 'secret'],
  mask: string | ((value: any, key: string) => any) = '***'
): LogFormat {
  // Rekurencyjnie maskuj pola w obiekcie
  function maskObject(obj: any): any {
    if (obj && typeof obj === 'object') {
      for (const key of Object.keys(obj)) {
        if (fields.includes(key)) {
          obj[key] = typeof mask === 'function' ? mask(obj[key], key) : mask;
        } else if (typeof obj[key] === 'object' && obj[key] !== null) {
          obj[key] = maskObject(obj[key]);
        }
      }
    }
    return obj;
  }
  return (info: Record<string, any>) => {
    // Maskuj tylko w metadanych, nie w level/message/timestamp
    const forbidden = new Set([
      'level',
      'message',
      'timestamp',
      'originalTimestamp',
      'pid',
      'hostname',
      'tags',
      'stack',
      'errorName',
      'splat',
    ]);
    for (const key in info) {
      if (
        Object.prototype.hasOwnProperty.call(info, key) &&
        !forbidden.has(key)
      ) {
        if (typeof info[key] === 'object' && info[key] !== null) {
          info[key] = maskObject(info[key]);
        }
        if (fields.includes(key)) {
          info[key] = typeof mask === 'function' ? mask(info[key], key) : mask;
        }
      }
    }
    return info;
  };
}
// ...existing code...
