// src/transports/file.ts
import type {
  Transport,
  LogLevel,
  LogFormat,
  FileTransportOptions,
} from '../types';
import * as format from '../format'; // Importuj format (dla defaultFileFormat)
// Importuj rotating-file-stream i potrzebne typy
import { createStream, RotatingFileStream } from 'rotating-file-stream';
import * as path from 'path';
import * as fs from 'fs'; // Potrzebne do createPath

export class FileTransport implements Transport {
  public level?: LogLevel;
  public format?: LogFormat;
  private stream: RotatingFileStream;
  private options: FileTransportOptions; // Przechowaj opcje dla metody close

  // Domyślny format dla pliku - JSON
  private static defaultFileFormat: LogFormat = format.defaultJsonFormat;

  constructor(options: FileTransportOptions) {
    if (!options || !options.filename) {
      throw new Error('FileTransport requires a "filename" option.');
    }
    this.options = { ...options }; // Zapisz kopię opcji
    this.level = options.level;
    // Użyj formatu z opcji LUB domyślnego formatu dla plików (JSON)
    this.format = options.format || FileTransport.defaultFileFormat;

    // Utwórz ścieżkę, jeśli wymagane (domyślnie tak)
    if (options.createPath !== false) {
      try {
        const logDirectory = path.dirname(options.filename);
        if (!fs.existsSync(logDirectory)) {
          fs.mkdirSync(logDirectory, { recursive: true });
        }
      } catch (e: any) {
        if (e.code !== 'EEXIST') {
          console.error(
            `[scribelog] Error creating log directory for ${options.filename}:`,
            e
          );
          throw e;
        }
      }
    }

    // Utwórz strumień rotating-file-stream
    try {
      // --- POCZĄTEK ZMIANY: Warunkowe dodawanie WSZYSTKICH opcji RFS ---
      // Typ dla opcji `rotating-file-stream`
      type RfsOptions = Parameters<typeof createStream>[1];
      const streamOptions: RfsOptions = {
        // Użyj typu RfsOptions
        mode: 0o644, // Domyślne uprawnienia
        ...(options.fsWriteStreamOptions || {}), // Rozsmaruj opcje dla fs.createWriteStream
      };

      // Dodawaj opcje RFS tylko jeśli są zdefiniowane w `options`
      if (options.path !== undefined) streamOptions.path = options.path;
      if (options.size !== undefined) streamOptions.size = options.size;
      if (options.interval !== undefined)
        streamOptions.interval = options.interval;
      if (options.compress !== undefined) {
        // Konwertuj boolean na string 'gzip' jeśli trzeba
        streamOptions.compress =
          options.compress === true ? 'gzip' : options.compress;
      }
      if (options.maxFiles !== undefined)
        streamOptions.maxFiles = options.maxFiles;
      if (options.maxSize !== undefined)
        streamOptions.maxSize = options.maxSize;
      // Opcja 'utc' jest zwykle powiązana z 'interval' lub generatorem nazw,
      // biblioteka powinna ją obsłużyć wewnętrznie, nie przekazujemy jej tutaj.

      // --- KONIEC ZMIANY ---

      // Utwórz strumień z przygotowanymi opcjami
      this.stream = createStream(options.filename, streamOptions);

      // Listenery zdarzeń
      this.stream.on('error', (err) => {
        console.error('[scribelog] FileTransport stream error:', err);
      });

      this.stream.on('rotated', (filename: string) => {
        console.log(`[scribelog] FileTransport rotated log to: ${filename}`);
      });

      this.stream.on('warning', (err) => {
        console.warn('[scribelog] FileTransport stream warning:', err);
      });
    } catch (err) {
      console.error(
        `[scribelog] Failed to create rotating file stream for ${options.filename}:`,
        err
      );
      throw err; // Rzuć błąd dalej, jeśli utworzenie strumienia zawiodło
    }
  }

  // Metoda logująca transportu
  log(processedEntry: Record<string, any> | string): void {
    let output: string;

    // Sprawdź, czy strumień jest zapisywalny
    if (!this.stream || !this.stream.writable || this.stream.destroyed) {
      console.error(
        '[scribelog] FileTransport stream is not writable. Log entry dropped.',
        processedEntry
      );
      return;
    }

    // Sformatuj wpis, jeśli to konieczne
    if (typeof processedEntry === 'object' && processedEntry !== null) {
      try {
        // Użyj formatu transportu lub domyślnego formatu plikowego
        output = (this.format || FileTransport.defaultFileFormat)(
          processedEntry
        ) as string;
        if (typeof output !== 'string') {
          console.error(
            '[scribelog] FileTransport formatter did not return a string. Using JSON.stringify fallback.',
            processedEntry
          );
          output = JSON.stringify(processedEntry);
        }
      } catch (formatErr) {
        console.error(
          '[scribelog] Error applying format in FileTransport:',
          formatErr,
          'Original entry:',
          processedEntry
        );
        try {
          output = JSON.stringify(processedEntry);
        } catch {
          output = '[scribelog] Failed to format or stringify log entry.';
        }
      }
    } else if (typeof processedEntry === 'string') {
      output = processedEntry;
    } else {
      console.warn(
        '[scribelog] FileTransport received non-object/non-string data:',
        processedEntry
      );
      return;
    }

    // Zapisz do strumienia z nową linią
    this.stream.write(output + '\n', (err) => {
      if (err) {
        // Unikaj pętli błędów - loguj błąd zapisu tylko do konsoli
        console.error(
          '[scribelog] FileTransport failed to write to stream:',
          err
        );
      }
    });
  }

  /**
   * Zamyka strumień pliku logu. Ważne do wywołania przy zamykaniu aplikacji.
   */
  close(): void {
    if (this.stream && !this.stream.destroyed) {
      this.stream.end(() => {
        // console.log(`[scribelog] FileTransport stream ended for: ${this.options.filename}`);
      });
    }
  }
}
