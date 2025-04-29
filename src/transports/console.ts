// src/transports/console.ts
import type { Transport, LogLevel, LogFormat } from '../types';
import * as format from '../format';
import chalk from 'chalk';

export interface ConsoleTransportOptions {
  level?: LogLevel;
  format?: LogFormat;
  useStdErrLevels?: LogLevel[];
}

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
    let output: string;
    let entryLevel: LogLevel | undefined = undefined;

    // Ustal, czy używać kolorów dla fallbacku format.simple()
    const useColors = chalk.supportsColor
      ? chalk.supportsColor.hasBasic
      : false;

    if (typeof processedEntry === 'string') {
      output = processedEntry;
      // Prosta próba odgadnięcia poziomu ze stringa
      const upperCaseEntry = output.toUpperCase();
      if (upperCaseEntry.includes('[ERROR]')) entryLevel = 'error';
      else if (upperCaseEntry.includes('[WARN]')) entryLevel = 'warn';
      // ...
    } else if (typeof processedEntry === 'object' && processedEntry !== null) {
      // Odczytaj poziom z obiektu (powinien być dodany przez format.level())
      if (processedEntry.level && typeof processedEntry.level === 'string') {
        entryLevel = processedEntry.level as LogLevel;
      }
      // Zastosuj format.simple jako fallback do konwersji obiektu na string
      output = format.simple({ colors: useColors })(processedEntry) as string;
    } else {
      return; // Ignoruj inne typy
    }

    // Wybierz strumień wyjścia
    if (entryLevel && this.useStdErrLevels.has(entryLevel)) {
      console.error(output);
    } else {
      console.log(output);
    }
  }
}
