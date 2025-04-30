// test/file.transport.test.ts
import {
  createLogger,
  transports,
  format,
  Transport,
  FileTransportOptions,
} from '../src/index';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
// Nie potrzebujemy już chalka w tym pliku testowym
// import chalk from 'chalk';

const LOG_DIR = path.join(os.tmpdir(), 'scribelog-test-logs');

jest.setTimeout(15000);

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

describe('FileTransport', () => {
  beforeAll(() => {
    if (!fs.existsSync(LOG_DIR)) {
      fs.mkdirSync(LOG_DIR, { recursive: true });
    }
  });

  afterEach(async () => {
    try {
      const files = fs.readdirSync(LOG_DIR);
      for (const file of files) {
        if (file.startsWith('test-') || file.startsWith('rotate-')) {
          try {
            fs.unlinkSync(path.join(LOG_DIR, file));
          } catch (unlinkErr) {
            await delay(50);
            try {
              fs.unlinkSync(path.join(LOG_DIR, file));
            } catch {
              /* Explicitly ignore second error */
            }
          }
        }
      }
    } catch (e) {
      /* Ignoruj */
    }
  });

  it('should create a log file and write JSON entries by default', async () => {
    const logFile = path.join(LOG_DIR, 'test-default.log');
    const fileTransport = new transports.File({ filename: logFile });
    const logger = createLogger({ level: 'info', transports: [fileTransport] });
    const message = 'Testing default file log';
    const meta = { userId: 123 };
    logger.info(message, meta);
    await delay(150);
    await new Promise<void>((resolve) => {
      fileTransport?.close?.();
      (fileTransport as any).stream.once('finish', () => resolve());
      setTimeout(resolve, 500);
    });
    await delay(50);
    expect(fs.existsSync(logFile)).toBe(true);
    const content = fs.readFileSync(logFile, 'utf-8');
    expect(content).toBeTruthy();
    const lines = content.trim().split('\n');
    expect(lines.length).toBe(1);
    const parsed = JSON.parse(lines[0]);
    expect(parsed).toHaveProperty('level', 'info');
    expect(parsed).toHaveProperty('message', message);
    expect(parsed).toHaveProperty('userId', meta.userId);
    expect(parsed).toHaveProperty('timestamp');
  });

  it('should use the specified format (e.g., simple)', async () => {
    const logFile = path.join(LOG_DIR, 'test-simple.log');
    // --- POCZĄTEK POPRAWKI: Użyj simple z colors: false ---
    const simpleFormatNoColor = format.combine(
      format.errors({ stack: true }),
      format.timestamp(),
      format.level(),
      format.message(),
      format.metadata(),
      format.simple({ colors: false }) // JAWNIE WYŁĄCZ KOLORY
    );
    const fileTransport = new transports.File({
      filename: logFile,
      format: simpleFormatNoColor, // Użyj formatu bez kolorów
    });
    // --- KONIEC POPRAWKI ---
    const logger = createLogger({ transports: [fileTransport], level: 'warn' });
    const message = 'Simple format to file';
    logger.warn(message, { simple: true });

    await delay(150);
    await new Promise<void>((resolve) => {
      fileTransport?.close?.();
      (fileTransport as any).stream.once('finish', () => resolve());
      setTimeout(resolve, 500);
    });
    await delay(50);

    const content = fs.readFileSync(logFile, 'utf-8');
    expect(content).toBeTruthy();

    // Sprawdź kluczowe fragmenty - teraz powinno działać, bo nie ma kodów ANSI
    expect(content).toContain('[WARN]:');
    expect(content).toContain('Simple format to file');
    expect(content).toContain('{ simple: true }');
    expect(content).toContain(']: ');

    expect(content).not.toMatch(/^\{.*\}$/);
  });

  it('should respect transport level', async () => {
    const logFile = path.join(LOG_DIR, 'test-level.log');
    const fileTransport = new transports.File({
      filename: logFile,
      level: 'error',
    });
    const logger = createLogger({ level: 'info', transports: [fileTransport] });
    logger.info('This info should NOT be logged to file.');
    logger.error('This error SHOULD be logged.');
    await delay(150);
    await new Promise<void>((resolve) => {
      fileTransport?.close?.();
      (fileTransport as any).stream.once('finish', () => resolve());
      setTimeout(resolve, 500);
    });
    await delay(50);
    const content = fs.readFileSync(logFile, 'utf-8');
    const lines = content.trim().split('\n');
    expect(lines.length).toBe(1);
    const parsed = JSON.parse(lines[0]); // Domyślny format pliku to JSON
    expect(parsed).toHaveProperty('level', 'error');
    expect(parsed).toHaveProperty('message', 'This error SHOULD be logged.');
  });

  it('should accept rotation options without throwing', () => {
    const options: FileTransportOptions = {
      filename: path.join(LOG_DIR, 'rotate-test.log'),
      size: '1K',
      interval: '1s',
      compress: 'gzip',
      maxFiles: 3,
    };
    let transport: Transport | undefined;
    expect(() => {
      transport = new transports.File(options);
    }).not.toThrow();
    transport?.close?.();
  });
});
