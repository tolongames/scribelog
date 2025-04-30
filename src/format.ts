// src/format.ts
import type { LogInfo, LogFormat, LogLevel } from './types';
// Importuj format z util dla splat
import { inspect, format as utilFormat } from 'util';
import chalk from 'chalk';
import { format as formatDate } from 'date-fns';

// Symbole wewnętrzne - Usuwamy nieużywane
// const LEVEL = Symbol.for('level');
// const MESSAGE = Symbol.for('message');
// const SPLAT = Symbol.for('splat'); // Nie używamy symbolu, polegamy na nazwie 'splat'

// --- Podstawowe Formaty ---

interface TimestampOptions { alias?: string; format?: string | ((date: Date) => string); }

export const timestamp = (options: TimestampOptions = {}): LogFormat => {
    const { alias = 'timestamp', format: formatOption } = options;
    return (info: Record<string, any>): Record<string, any> => {
        const ts = info.timestamp instanceof Date ? info.timestamp : new Date();
        let formattedTs: string;
        if (typeof formatOption === 'function') {
            try { formattedTs = formatOption(ts); }
            catch (e) { console.error('[scribelog] Error in custom timestamp format function:', e); formattedTs = ts.toISOString(); }
        } else if (typeof formatOption === 'string') {
            try { formattedTs = formatDate(ts, formatOption); }
            catch (e) { console.error('[scribelog] Invalid date format provided:', formatOption, e); formattedTs = ts.toISOString(); }
        } else { formattedTs = ts.toISOString(); }
        info[alias] = formattedTs;
        if (!(info.originalTimestamp instanceof Date)) { info.originalTimestamp = ts; }
        if (alias !== 'timestamp' && info.timestamp instanceof Date) { delete info.timestamp; }
        return info;
    };
};

export const level = (options: { alias?: string } = {}): LogFormat => {
    const { alias = 'level' } = options;
    return (info: Record<string, any>): Record<string, any> => {
        if (info.level) { info[alias] = info.level; }
        return info;
    }
};

export const message = (options: { alias?: string } = {}): LogFormat => {
    const { alias = 'message' } = options;
    return (info: Record<string, any>): Record<string, any> => {
        // Zapisz wiadomość pod aliasem tylko jeśli istnieje
        if (info.message !== undefined) { info[alias] = info.message; }
        return info;
    }
};

interface ErrorsOptions { stack?: boolean; }

export const errors = (options: ErrorsOptions = {}): LogFormat => {
    const includeStack = options.stack !== false;
    return (info: Record<string, any>): Record<string, any> => {
        let error: Error | undefined = undefined;
        let errorKey: string | undefined = undefined;
        if (info.error instanceof Error) { error = info.error; errorKey = 'error'; }
        else { for (const key in info) { if (info[key] instanceof Error) { error = info[key]; errorKey = key; break; } } }
        if (error && errorKey) {
             // Ustaw główną wiadomość tylko jeśli jeszcze nie istnieje
             if (info.message === undefined || info.message === '') { info.message = error.message; }
             info.errorName = error.name;
             if (includeStack) { info.stack = error.stack; }
             Object.getOwnPropertyNames(error).forEach(key => { if (key !== 'message' && key !== 'name' && key !== 'stack' && !(key in info)) { info[key] = (error as any)[key]; } });
             if ((error as any).originalReason) { info.originalReason = (error as any).originalReason; }
             delete info[errorKey];
        }
        return info;
    };
};

// --- POCZĄTEK ZMIANY: Poprawiony formater splat ---
/**
 * Formater: Interpoluje wiadomość w stylu printf używając argumentów z `info.splat`.
 * Zastępuje oryginalne pole `info.message`, jeśli interpolacja jest możliwa.
 * Powinien być umieszczony w `combine` PRZED `format.message()` i PRZED `format.metadata()`.
 */
export const splat = (): LogFormat => {
  return (info: Record<string, any>): Record<string, any> => {
    // Sprawdź, czy mamy argumenty splat i czy wiadomość jest stringiem
    if (info.splat && Array.isArray(info.splat) && info.splat.length > 0 && typeof info.message === 'string') {
        // Sprawdź, czy wiadomość zawiera jakiekolwiek znaki formatujące '%'
        // (proste sprawdzenie, można ulepszyć, np. ignorując '%%')
        if (info.message.includes('%')) {
             try {
                 // Użyj util.format do interpolacji
                 const formattedMessage = utilFormat(info.message, ...info.splat);
                 // Zaktualizuj wiadomość w obiekcie info
                 info.message = formattedMessage;
             } catch (e) {
                 // W razie błędu formatowania (np. złe placeholdery) loguj ostrzeżenie, ale nie przerywaj
                 console.warn('[scribelog] Error during splat formatting:', e, 'Original message:', info.message, 'Args:', info.splat);
                 // Zostawiamy oryginalną wiadomość
             }
        }
        // Jeśli wiadomość nie zawiera '%', nie robimy interpolacji,
        // argumenty splat zostaną po prostu usunięte poniżej.
    }

    // Zawsze usuwaj pole splat, aby nie trafiło do metadanych
    delete info.splat;

    return info; // Zawsze zwracaj info
  };
};
// --- KONIEC ZMIANY ---


export const metadata = (options: { alias?: string, exclude?: string[] } = {}): LogFormat => {
    const { alias, exclude = [] } = options;
    // Wyklucz standardowe pola, pola błędów ORAZ splat
    const standardAliases = ['timestamp', 'level', 'message', 'originalTimestamp', 'errorName', 'stack', 'originalReason', 'exception', 'eventType', 'splat'];
    if (alias) standardAliases.push(alias);
    const forbidden = new Set([...standardAliases, ...exclude]);
    return (info: Record<string, any>): Record<string, any> => {
        const meta: Record<string, any> = {};
        for (const key in info) {
            if (typeof key !== 'symbol' && !forbidden.has(key) && Object.prototype.hasOwnProperty.call(info, key)) {
                meta[key] = info[key];
            }
        }
        if (alias) {
            info[alias] = meta;
            for (const key in meta) { if (!forbidden.has(key)) { delete info[key]; } }
        }
        return info;
    };
};

// --- Formaty Końcowe ---

export const json = (options?: { space?: string | number }): LogFormat => {
  return (info: Record<string, any>): string => {
    const logObject = { ...info };
    // Usuwamy symbole i pola pomocnicze/przetworzone
    // delete logObject[LEVEL as any]; // Symbole nie są serializowane przez JSON.stringify
    // delete logObject[MESSAGE as any];
    delete logObject.originalTimestamp;
    delete logObject.splat; // Usuń splat
    if (logObject.timestamp instanceof Date) { logObject.timestamp = logObject.timestamp.toISOString(); }
    return JSON.stringify(logObject, null, options?.space);
  };
};

export const simple = (options: { colors?: boolean } = {}): LogFormat => {
    const colorsOption = options.colors;
    const timestampColorFn = chalk.gray;

    return (info: Record<string, any>): string => {
        const supportsColorInfo = chalk.supportsColor;
        const useColors = colorsOption !== undefined ? colorsOption : (supportsColorInfo ? supportsColorInfo.hasBasic : false);
        const shouldUseColors = useColors && chalk.level > 0;
        const levelColorFnMap: Record<LogLevel, chalk.Chalk> = { error: chalk.red, warn: chalk.yellow, info: chalk.green, http: chalk.magenta, verbose: chalk.cyan, debug: chalk.blue, silly: chalk.gray };

        // Pobierz pola, które powinny być ustawione przez poprzednie formaty (level, message, timestamp)
        const levelStr = (info.level || 'unknown') as string;
        const msgStr = (info.message !== undefined) ? String(info.message) : ''; // Konwertuj na string dla pewności
        const timestampStr = typeof info.timestamp === 'string' ? info.timestamp : (info.originalTimestamp instanceof Date ? info.originalTimestamp.toISOString() : new Date().toISOString());

        const coloredLevel = shouldUseColors && levelColorFnMap[levelStr as LogLevel] ? levelColorFnMap[levelStr as LogLevel](`[${levelStr.toUpperCase()}]`) : `[${levelStr.toUpperCase()}]`;
        const coloredTimestamp = shouldUseColors ? timestampColorFn(timestampStr) : timestampStr;

        const meta: Record<string, any> = {};
        // Wyklucz wszystkie znane pola, w tym splat i pola błędów
        const forbidden = new Set(['timestamp', 'level', 'message', 'originalTimestamp', 'errorName', 'stack', 'originalReason', 'exception', 'eventType', 'splat']);
        for (const key in info) {
            if (typeof key !== 'symbol' && !forbidden.has(key) && Object.prototype.hasOwnProperty.call(info, key)) { meta[key] = info[key]; }
        }
        const metaString = Object.keys(meta).length ? ` ${inspect(meta, { colors: shouldUseColors, depth: null })}` : '';
        // Dołącz stack trace, jeśli istnieje i nie jest już w metaString (np. gdy meta jest puste)
        const stackString = info.stack && (!metaString || !metaString.includes(info.stack)) ? `\n${info.stack}` : '';

        return `${coloredTimestamp} ${coloredLevel}: ${msgStr}${metaString}${stackString}`;
    }
};


// --- Funkcja Kompozycyjna ---
export const combine = (...formats: LogFormat[]): LogFormat => {
  return (info: Record<string, any>): Record<string, any> | string => {
    let currentInfo: Record<string, any> = { ...info };
    for (const format of formats) {
      const result = format(currentInfo);
      if (typeof result === 'string') { return result; }
      currentInfo = typeof result === 'object' && result !== null ? result : currentInfo;
    }
    return currentInfo;
  };
};

// --- POCZĄTEK ZMIANY: Aktualizacja predefiniowanych formatów ---
// Dodajemy splat() do domyślnych łańcuchów
export const defaultJsonFormat = combine(
    errors({ stack: true }), // Najpierw obsłuż błędy
    splat(),                 // Następnie sformatuj wiadomość
    timestamp(),
    level(),
    message(),               // message() użyje sformatowanej wiadomości
    metadata(),              // Zbierz resztę meta
    json()
);

export const defaultSimpleFormat = combine(
    errors({ stack: true }), // Najpierw obsłuż błędy
    splat(),                 // Następnie sformatuj wiadomość
    timestamp(),
    level(),
    message(),               // message() użyje sformatowanej wiadomości
    metadata(),              // Zbierz resztę meta
    simple()                 // simple() użyje pól ustawionych przez poprzednie
);
// --- KONIEC ZMIANY ---