// src/transports/console.ts
import type { Transport, LogLevel, LogFormat } from '../types';
import * as format from '../format';
import chalk from 'chalk';

export interface ConsoleTransportOptions {
  level?: LogLevel;
  format?: LogFormat;
  useStdErrLevels?: LogLevel[];
}

// ...existing code...
export class ConsoleTransport implements Transport {
  public level?: LogLevel;
  public format?: LogFormat;
  private useStdErrLevels: Set<LogLevel>;

  constructor(options: ConsoleTransportOptions = {}) {
    this.level = options.level;
    this.format = options.format; // Format specyficzny dla tego transportu
    this.useStdErrLevels = new Set(options.useStdErrLevels || ['error']);
  }

  log(processedEntry: Record<string, any> | string): void {
    let output: string | undefined;
    let entryLevel: LogLevel | undefined = undefined;

    const useColors = chalk.supportsColor
      ? chalk.supportsColor.hasBasic
      : false;

    if (processedEntry && typeof processedEntry === 'object') {
      // Preferuj level z obiektu (bez heurystyk)
      if (processedEntry.level && typeof processedEntry.level === 'string') {
        entryLevel = processedEntry.level as LogLevel;
      }

      const formatter = this.format;
      if (formatter) {
        try {
          const res = formatter({ ...processedEntry });
          if (typeof res === 'string') {
            output = res;
          } else if (res && typeof res === 'object') {
            output = format.simple({ colors: useColors })(res) as string;
          } else {
            output = format.simple({ colors: useColors })(
              processedEntry
            ) as string;
          }
        } catch (e) {
          console.error('[scribelog] ConsoleTransport format error:', e);
          output = format.simple({ colors: useColors })(
            processedEntry
          ) as string;
        }
      } else {
        output = format.simple({ colors: useColors })(processedEntry) as string;
      }
    } else if (typeof processedEntry === 'string') {
      // Fallback dla stringów (np. custom transport/formaty zwróciły string)
      output = processedEntry;

      // Minimalna heurystyka tylko awaryjnie
      const upper = output.toUpperCase();
      if (upper.includes('[ERROR]')) entryLevel = 'error';
      else if (upper.includes('[WARN]')) entryLevel = 'warn';
      else if (upper.includes('[INFO]')) entryLevel = 'info';
      else if (upper.includes('[DEBUG]')) entryLevel = 'debug';
      else if (upper.includes('[HTTP]')) entryLevel = 'http';
      else if (upper.includes('[VERBOSE]')) entryLevel = 'verbose';
      else if (upper.includes('[SILLY]')) entryLevel = 'silly';
    } else {
      return;
    }

    if (output === undefined) return;

    if (entryLevel && this.useStdErrLevels.has(entryLevel)) {
      console.error(output);
    } else {
      console.log(output);
    }
  }
}
// ...existing code...
