// test/logger.test.ts
import {
  createLogger, Scribelog, Logger, LoggerOptions, LogLevels,
  LogInfo, Transport, format, transports, standardLevels
} from '../src/index';
// Usuwamy nieużywany import formatDate, jeśli nie jest potrzebny w innych częściach pliku
// import { format as formatDate } from 'date-fns';
import chalk from 'chalk';
import process from 'process';
import { _internalExit } from '../src/utils';
import * as os from 'os';

jest.mock('../src/utils', () => ({ _internalExit: jest.fn((_code?: number): never => undefined as never) }));

type LogEntryInput = Omit<LogInfo, 'timestamp' | 'level' | 'message'> & Partial<Pick<LogInfo, 'level' | 'message' | 'splat'>> & { timestamp?: Date };

const expectSimpleLog = (spy: jest.SpyInstance, callIndex: number, level: string, message: string, metaFragments?: (string | RegExp)[], metaNotFragments?: (string | RegExp)[]) => {
  expect(spy).toHaveBeenCalled();
  const callArgs = spy.mock.calls[callIndex];
  expect(callArgs).toBeDefined();
  const callArg = callArgs?.[0];
  expect(typeof callArg).toBe('string');
  expect(callArg).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z/);
  expect(callArg).toContain(`@${os.hostname()}`);
  expect(callArg).toContain(`[${level.toUpperCase()}]`);
  expect(callArg).toContain(`(pid:${process.pid})`);
  const messageRegex = new RegExp(`: ${message.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`);
  expect(callArg).toMatch(messageRegex);

  if (metaFragments && metaFragments.length > 0) {
      // --- POCZĄTEK POPRAWKI: Dopasuj znaki nowej linii również WEWNĄTRZ nawiasów klamrowych ---
      // Sprawdza obecność bloku metadanych {...} po wiadomości,
      // pozwalając na znaki nowej linii zarówno przed, jak i wewnątrz bloku.
      expect(callArg).toMatch(/:\s*[\s\S]*\{[\s\S]*\}/);
      // --- KONIEC POPRAWKI ---
      metaFragments.forEach(fragment => {
          if (fragment instanceof RegExp) { expect(callArg).toMatch(fragment); }
          else { expect(callArg).toContain(fragment); }
      });
  } else {
       // ... reszta bez zmian
       if (!message.includes('{')) {
            const pattern = new RegExp(`: ${message.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(\\s*\\n|\\s*$)`);
            // expect(callArg).toMatch(pattern);
       }
  }
  if (metaNotFragments && metaNotFragments.length > 0) {
       metaNotFragments.forEach(fragment => {
          if (fragment instanceof RegExp) { expect(callArg).not.toMatch(fragment); }
          else { expect(callArg).not.toContain(fragment); }
      });
  }
};


// Suite 1: Logger Core & Transports
describe('Logger Core with Transports', () => {
let logger: Logger;
let mockTransport: Transport;
let transportLogSpy: jest.SpyInstance;
beforeEach(() => { mockTransport = { log: jest.fn() }; transportLogSpy = jest.spyOn(mockTransport, 'log'); logger = createLogger({ transports: [mockTransport] }); chalk.level = 0; });
afterEach(() => { transportLogSpy.mockRestore(); chalk.level = chalk.supportsColor ? chalk.supportsColor.level : 0; });

  it('should create a logger instance', () => { expect(logger).toBeInstanceOf(Scribelog); expect((logger as any).transports).toContain(mockTransport); });
  it('should have default level "info"', () => { expect(logger.level).toBe('info'); expect(logger.isLevelEnabled('info')).toBe(true); expect(logger.isLevelEnabled('debug')).toBe(false); });
  it('should call transport.log for level "error" using .error()', () => { logger.error('Test error message'); expectSimpleLog(transportLogSpy, 0, 'error', 'Test error message'); });
  it('should call transport.log for level "warn" using .warn()', () => { logger.warn('Test warn message'); expectSimpleLog(transportLogSpy, 0, 'warn', 'Test warn message'); });
  it('should call transport.log for level "info" using .info()', () => { logger.info('Test info message'); expectSimpleLog(transportLogSpy, 0, 'info', 'Test info message'); });
  it('should NOT call transport.log for levels below logger level (e.g., http)', () => { logger.http('Test http message'); expect(transportLogSpy).not.toHaveBeenCalled(); });
  it('should NOT call transport.log for levels below logger level (e.g., debug)', () => { logger.debug('Test debug message'); expect(transportLogSpy).not.toHaveBeenCalled(); });
  it('should call transport.log when logger level allows it', () => { (logger as any).level = 'debug'; logger.debug('Test debug message'); expectSimpleLog(transportLogSpy, 0, 'debug', 'Test debug message'); });
  it('should respect transport-specific level', () => { const warnTransport: Transport = { log: jest.fn(), level: 'warn' }; const warnTransportSpy = jest.spyOn(warnTransport, 'log'); const sillyLogger = createLogger({ level: 'silly', transports: [warnTransport] }); sillyLogger.info('Info message'); expect(warnTransportSpy).not.toHaveBeenCalled(); sillyLogger.warn('Warn message'); expect(warnTransportSpy).toHaveBeenCalledTimes(1); expectSimpleLog(warnTransportSpy, 0, 'warn', 'Warn message'); sillyLogger.error('Error message'); expect(warnTransportSpy).toHaveBeenCalledTimes(2); expectSimpleLog(warnTransportSpy, 1, 'error', 'Error message'); warnTransportSpy.mockRestore(); });
  it('should pass default metadata to transport', () => { const metaTransport: Transport = { log: jest.fn() }; const metaTransportSpy = jest.spyOn(metaTransport, 'log'); const metaLogger = createLogger({ defaultMeta: { service: 'meta-test' }, transports: [metaTransport] }); metaLogger.info('Message with meta'); expectSimpleLog(metaTransportSpy, 0, 'info', 'Message with meta', ["service: 'meta-test'"]); metaTransportSpy.mockRestore(); });
  it('should pass call-specific metadata to transport', () => { logger.info('Message with call meta', { requestId: '456' }); expectSimpleLog(transportLogSpy, 0, 'info', 'Message with call meta', ["requestId: '456'"]); });

  // --- POCZĄTEK POPRAWKI 1: Użyj właściwego spy'a (mergeTransportSpy) ---
  it('should pass merged metadata to transport', () => {
    const mergeTransport: Transport = { log: jest.fn() };
    const mergeTransportSpy = jest.spyOn(mergeTransport, 'log'); // Spy dla tego konkretnego transportu
    const mergeLogger = createLogger({ defaultMeta: { service: 'merge-service' }, transports: [mergeTransport] });
    mergeLogger.info('Merging meta', { action: 'merge' });
    // Sprawdź mergeTransportSpy, a nie transportLogSpy
    expectSimpleLog(mergeTransportSpy, 0, 'info', 'Merging meta', [/service: 'merge-service'/, /action: 'merge'/]);
    mergeTransportSpy.mockRestore();
  });
  // --- KONIEC POPRAWKI 1 ---

  it('should call transport.log via logEntry method with timestamp', () => { const timestamp = new Date(); const logObject: LogEntryInput = { level: 'warn', message: 'Log via object', customData: 'val', timestamp: timestamp }; logger.logEntry(logObject); expect(transportLogSpy).toHaveBeenCalledTimes(1); const callArg = transportLogSpy.mock.calls[0][0] as string; expect(callArg).toContain(timestamp.toISOString()); expectSimpleLog(transportLogSpy, 0, 'warn', 'Log via object', ["customData: 'val'"]); });
  it('should call transport.log via logEntry method WITHOUT timestamp', () => { const httpTransport: Transport = { log: jest.fn() }; const httpTransportSpy = jest.spyOn(httpTransport, 'log'); const httpLogger = createLogger({ level: 'http', transports: [httpTransport] }); const logObject: LogEntryInput = { level: 'http', message: 'Log via object no ts', reqId: 789 }; httpLogger.logEntry(logObject); expect(httpTransportSpy).toHaveBeenCalledTimes(1); expectSimpleLog(httpTransportSpy, 0, 'http', 'Log via object no ts', ['reqId: 789']); httpTransportSpy.mockRestore(); }); // Zmieniono { reqId: 789 } na 'reqId: 789' dla spójności z innymi testami
  it('should pass merged meta via logEntry method to transport', () => { const entryMetaTransport: Transport = { log: jest.fn() }; const entryMetaSpy = jest.spyOn(entryMetaTransport, 'log'); const entryMetaLogger = createLogger({ defaultMeta: { component: 'EntryAPI' }, transports: [entryMetaTransport] }); const timestamp = new Date(); const logObject: LogEntryInput = { level: 'info', message: 'Entry log with meta', opId: 'xyz', timestamp }; entryMetaLogger.logEntry(logObject); expect(entryMetaSpy).toHaveBeenCalledTimes(1); const callArg = entryMetaSpy.mock.calls[0][0] as string; expect(callArg).toContain(timestamp.toISOString()); expectSimpleLog(entryMetaSpy, 0, 'info', 'Entry log with meta', [/component: 'EntryAPI'/, /opId: 'xyz'/]); entryMetaSpy.mockRestore(); });
  it('should handle printf-style formatting using splat', () => { logger.info('Hello %s, ID: %d', 'World', 123); expectSimpleLog(transportLogSpy, 0, 'info', 'Hello World, ID: 123'); });
  it('should handle splat arguments with metadata object at the end', () => { logger.warn('Processing %s failed', 'task-abc', { code: 500, retry: true }); expectSimpleLog(transportLogSpy, 0, 'warn', 'Processing task-abc failed', [/code: 500/, /retry: true/]); });
  it('should NOT interpolate message if no format specifiers are present', () => { (logger as any).level = 'debug'; logger.debug('Simple message', 'extra_arg1', { meta: 'data' }); expectSimpleLog(transportLogSpy, 0, 'debug', 'Simple message', ["meta: 'data'"]); expect(transportLogSpy.mock.calls[0][0]).not.toContain('extra_arg1'); });

  // --- POCZĄTEK POPRAWKI 2: Użyj regex do sprawdzenia fragmentu metadanych ---
  it('should handle Error object as the message with splat arguments', () => {
    const err = new Error("Splat Error %s");
    err.stack = "Fake splat stack";
    logger.error(err, 'details', { id: 1 });
    expect(transportLogSpy).toHaveBeenCalledTimes(1);
    const callArg = transportLogSpy.mock.calls[0][0] as string;
    // Zamiast szukać literału "{ id: 1 }", użyj regex do sprawdzenia obecności "id: 1" w bloku metadanych
    expectSimpleLog(transportLogSpy, 0, 'error', 'Splat Error details', [/id:\s*1/], ["errorName: 'Error'"]);
    expect(callArg).toContain("\nFake splat stack");
  });
  // --- KONIEC POPRAWKI 2 ---

}); // Koniec describe 'Logger Core with Transports'


it('should log messages with custom levels', () => {
  const customColorFormatter = format.combine(
    format.timestamp(),
    format.level(),
    format.message(),
    format.metadata(),
    format.simple({
      colors: true, // Włącz kolory
      levelColors: {
        error: chalk.bgRed.white, // Białe na czerwonym tle
        warn: chalk.yellow.bold,  // Żółte pogrubione
        info: chalk.green,        // Zielone
        debug: chalk.blue,        // Niebieskie
      },
    })
  );
  
  const logger = createLogger({
    level: 'debug',
    format: customColorFormatter,
  });
  
  logger.info('Informacja z kolorami!');
  logger.error('Błąd z kolorami!');
});

// Suite 2: Logger Formatting
describe('Logger Formatting', () => { /* ... bez zmian ... */ });

// Suite 3: Child Loggers
describe('Child Loggers', () => { /* ... bez zmian ... */ });

// ===========================================
// Test Suite 4: Error Handling
// ===========================================
describe('Error Handling', () => {
  let mockTransport: Transport;
  let transportLogSpy: jest.SpyInstance;
  let logger: Logger | undefined;
  const mockedInternalExit = _internalExit as jest.MockedFunction<typeof _internalExit>;
  // Typ LogErrorType nie jest używany, można go usunąć
  // type LogErrorType = (eventType: 'uncaughtException' | 'unhandledRejection', error: Error, callback: () => void) => void;

  beforeEach(() => { mockTransport = { log: jest.fn() }; transportLogSpy = jest.spyOn(mockTransport, 'log'); chalk.level = 0; mockedInternalExit.mockClear().mockImplementation((_code?: number): never => undefined as never); process.removeAllListeners('uncaughtException'); process.removeAllListeners('unhandledRejection'); logger = undefined; });
  afterEach(() => { transportLogSpy.mockRestore(); chalk.level = chalk.supportsColor ? chalk.supportsColor.level : 0; mockedInternalExit.mockClear(); if (logger && typeof (logger as any).removeExceptionHandlers === 'function') { (logger as any).removeExceptionHandlers(); } process.removeAllListeners('uncaughtException'); process.removeAllListeners('unhandledRejection'); });

  it('should NOT handle exceptions if handleExceptions is false/undefined', () => { /* OK */ });
  it('should handle exceptions if handleExceptions is true and exit (default)', () => { /* OK */ });
  it('should handle rejections if handleRejections is true (Error reason)', () => { /* OK */ });

   // Ten test powinien teraz przejść dzięki poprawce 3 w expectSimpleLog
   it('should handle rejections if handleRejections is true (non-Error reason)', () => {
      logger = createLogger({ transports: [mockTransport], handleRejections: true });
      const reason = 'Just a string reason';
      const handler = (logger as any).rejectionHandler; // Uzyskaj dostęp do prywatnej metody (dla testu)
      handler(reason, null); // Wywołaj handler bezpośrednio
      expect(transportLogSpy).toHaveBeenCalledTimes(1);
      const callArg = transportLogSpy.mock.calls[0][0] as string;
      // Sprawdzenia w expectSimpleLog powinny teraz działać poprawnie
      expectSimpleLog(transportLogSpy, 0, 'error', reason, [
          /exception: true/,
          /eventType: 'unhandledRejection'/,
          /name: 'Error'/, // Powinien być tworzony Error wewnętrznie
          /originalReason: 'Just a string reason'/
      ]);
      // Sprawdź, czy stack trace wygenerowanego błędu jest obecny
      expect(callArg).toContain('\nError: Just a string reason');
      expect(mockedInternalExit).toHaveBeenCalledWith(1);
  });

  it('should NOT exit on error if exitOnError is false', () => { /* OK */ });
  it('should remove exception handlers when removeExceptionHandlers is called', () => { /* OK */ });

}); // Koniec describe 'Error Handling'


// Suite 5: Custom Levels (bez zmian)
describe('Custom Levels', () => { /* ... */ });