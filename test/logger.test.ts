// test/logger.test.ts
import {
  createLogger,
  Scribelog,
  Logger,
  LogInfo,
  Transport,
} from '../src/index';
import chalk from 'chalk';
import process from 'process';
import { _internalExit } from '../src/utils';

jest.mock('../src/utils', () => ({
  _internalExit: jest.fn((_code?: number): never => undefined as never),
}));

type LogEntryInput = Omit<LogInfo, 'timestamp'> & { timestamp?: Date };

// Suite 1: Logger Core & Transports (bez zmian)
describe('Logger Core with Transports', () => {
  let logger: Logger;
  let mockTransport: Transport;
  let transportLogSpy: jest.SpyInstance;
  beforeEach(() => {
    mockTransport = { log: jest.fn() };
    transportLogSpy = jest.spyOn(mockTransport, 'log');
    logger = createLogger({ transports: [mockTransport] });
    chalk.level = 0;
  });
  afterEach(() => {
    transportLogSpy.mockRestore();
    chalk.level = chalk.supportsColor ? chalk.supportsColor.level : 0;
  });
  it('should create a logger instance', () => {
    expect(logger).toBeInstanceOf(Scribelog);
    expect((logger as any).transports).toContain(mockTransport);
  });
  it('should have default level "info"', () => {
    expect(logger.level).toBe('info');
    expect(logger.isLevelEnabled('info')).toBe(true);
    expect(logger.isLevelEnabled('debug')).toBe(false);
  });
  it('should call transport.log for level "error" using .error()', () => {
    logger.error('Test error message');
    expect(transportLogSpy).toHaveBeenCalledWith(
      expect.stringContaining('[ERROR]: Test error message')
    );
  });
  it('should call transport.log for level "warn" using .warn()', () => {
    logger.warn('Test warn message');
    expect(transportLogSpy).toHaveBeenCalledWith(
      expect.stringContaining('[WARN]: Test warn message')
    );
  });
  it('should call transport.log for level "info" using .info()', () => {
    logger.info('Test info message');
    expect(transportLogSpy).toHaveBeenCalledWith(
      expect.stringContaining('[INFO]: Test info message')
    );
  });
  it('should NOT call transport.log for levels below logger level (e.g., http)', () => {
    logger.http('Test http message');
    expect(transportLogSpy).not.toHaveBeenCalled();
  });
  it('should NOT call transport.log for levels below logger level (e.g., debug)', () => {
    logger.debug('Test debug message');
    expect(transportLogSpy).not.toHaveBeenCalled();
  });
  it('should call transport.log when logger level allows it', () => {
    (logger as any).level = 'debug';
    logger.debug('Test debug message');
    expect(transportLogSpy).toHaveBeenCalledWith(
      expect.stringContaining('[DEBUG]: Test debug message')
    );
  });
  it('should respect transport-specific level', () => {
    const warnTransport: Transport = { log: jest.fn(), level: 'warn' };
    const warnTransportSpy = jest.spyOn(warnTransport, 'log');
    const sillyLogger = createLogger({
      level: 'silly',
      transports: [warnTransport],
    });
    sillyLogger.info('Info message');
    expect(warnTransportSpy).not.toHaveBeenCalled();
    sillyLogger.warn('Warn message');
    expect(warnTransportSpy).toHaveBeenCalledWith(
      expect.stringContaining('[WARN]: Warn message')
    );
    sillyLogger.error('Error message');
    expect(warnTransportSpy).toHaveBeenCalledWith(
      expect.stringContaining('[ERROR]: Error message')
    );
    warnTransportSpy.mockRestore();
  });
  it('should pass default metadata to transport', () => {
    const metaTransport: Transport = { log: jest.fn() };
    const metaTransportSpy = jest.spyOn(metaTransport, 'log');
    const metaLogger = createLogger({
      defaultMeta: { service: 'meta-test' },
      transports: [metaTransport],
    });
    metaLogger.info('Message with meta');
    expect(metaTransportSpy).toHaveBeenCalledWith(
      expect.stringContaining("service: 'meta-test'")
    );
    metaTransportSpy.mockRestore();
  });
  it('should pass call-specific metadata to transport', () => {
    logger.info('Message with call meta', { requestId: '456' });
    expect(transportLogSpy).toHaveBeenCalledWith(
      expect.stringContaining("requestId: '456'")
    );
  });
  it('should pass merged metadata to transport', () => {
    const mergeTransport: Transport = { log: jest.fn() };
    const mergeTransportSpy = jest.spyOn(mergeTransport, 'log');
    const mergeLogger = createLogger({
      defaultMeta: { service: 'merge-service' },
      transports: [mergeTransport],
    });
    mergeLogger.info('Merging meta', { action: 'merge' });
    expect(mergeTransportSpy).toHaveBeenCalledWith(
      expect.stringContaining("service: 'merge-service'")
    );
    expect(mergeTransportSpy).toHaveBeenCalledWith(
      expect.stringContaining("action: 'merge'")
    );
    mergeTransportSpy.mockRestore();
  });
  it('should call transport.log via logEntry method with timestamp', () => {
    const timestamp = new Date();
    const logObject: LogEntryInput = {
      level: 'warn',
      message: 'Log via object',
      customData: 'val',
      timestamp: timestamp,
    };
    logger.logEntry(logObject);
    const callArg = transportLogSpy.mock.calls[0][0] as string;
    expect(callArg).toContain(timestamp.toISOString());
    expect(callArg).toContain("customData: 'val'");
  });
  it('should call transport.log via logEntry method WITHOUT timestamp', () => {
    const httpTransport: Transport = { log: jest.fn() };
    const httpTransportSpy = jest.spyOn(httpTransport, 'log');
    const httpLogger = createLogger({
      level: 'http',
      transports: [httpTransport],
    });
    const logObject: LogEntryInput = {
      level: 'http',
      message: 'Log via object no ts',
      reqId: 789,
    };
    httpLogger.logEntry(logObject);
    const callArg = httpTransportSpy.mock.calls[0][0] as string;
    expect(callArg).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z/);
    expect(callArg).toContain('{ reqId: 789 }');
    httpTransportSpy.mockRestore();
  });
  it('should pass merged meta via logEntry method to transport', () => {
    const entryMetaTransport: Transport = { log: jest.fn() };
    const entryMetaSpy = jest.spyOn(entryMetaTransport, 'log');
    const entryMetaLogger = createLogger({
      defaultMeta: { component: 'EntryAPI' },
      transports: [entryMetaTransport],
    });
    const timestamp = new Date();
    const logObject: LogEntryInput = {
      level: 'info',
      message: 'Entry log with meta',
      opId: 'xyz',
      timestamp,
    };
    entryMetaLogger.logEntry(logObject);
    const callArg = entryMetaSpy.mock.calls[0][0] as string;
    expect(callArg).toContain("component: 'EntryAPI'");
    expect(callArg).toContain("opId: 'xyz'");
    entryMetaSpy.mockRestore();
  });
});

// Suite 2: Logger Formatting (bez zmian)
describe('Logger Formatting', () => {
  let mockTransport: Transport;
  let transportLogSpy: jest.SpyInstance;
  beforeEach(() => {
    mockTransport = { log: jest.fn() };
    transportLogSpy = jest.spyOn(mockTransport, 'log');
    chalk.level = 0;
  });
  afterEach(() => {
    transportLogSpy.mockRestore();
    chalk.level = chalk.supportsColor ? chalk.supportsColor.level : 0;
  });
  it('should use default simple format (defaultSimpleFormat)', () => {
    /*...*/
  });
  it('should use basic json format when specified', () => {
    /*...*/
  });
  it('should use combined format (e.g., defaultJsonFormat)', () => {
    /*...*/
  });
  it('should allow transport-specific format', () => {
    /*...*/
  });
  it('should format object output from logger format using transport default', () => {
    /*...*/
  });
  it('should apply colors using simple format when TTY is detected (mocked)', () => {
    /*...*/
  });
  it('should NOT apply colors using simple format when colors are disabled', () => {
    /*...*/
  });
  it('should NOT apply colors using simple format when TTY is not detected (mocked)', () => {
    /*...*/
  });
  it('ConsoleTransport should pass TTY info to simple format', () => {
    /*...*/
  });
  it('timestamp format should use ISO by default', () => {
    /*...*/
  });
  it('timestamp format should use custom format string (date-fns)', () => {
    /*...*/
  });
  it('timestamp format should use custom format function', () => {
    /*...*/
  });
  it('timestamp format should use custom alias', () => {
    /*...*/
  });
});

// Suite 3: Child Loggers (bez zmian)
describe('Child Loggers', () => {
  beforeEach(() => {
    /*...*/
  });
  afterEach(() => {
    /*...*/
  });
  it('should create a child logger instance', () => {
    /*...*/
  });
  it('should inherit parent level, format, and transports', () => {
    /*...*/
  });
  it('should merge parent and child metadata', () => {
    /*...*/
  });
  it('should allow child metadata to override parent metadata', () => {
    /*...*/
  });
  it('should work with multiple levels of children', () => {
    /*...*/
  });
});

// ===========================================
// Test Suite 4: Error Handling
// ===========================================
describe('Error Handling', () => {
  let mockTransport: Transport;
  let transportLogSpy: jest.SpyInstance;
  let logger: Logger | undefined;
  const mockedInternalExit = _internalExit as jest.MockedFunction<
    typeof _internalExit
  >;

  beforeEach(() => {
    mockTransport = { log: jest.fn() };
    transportLogSpy = jest.spyOn(mockTransport, 'log');
    chalk.level = 0;
    mockedInternalExit
      .mockClear()
      .mockImplementation((_code?: number): never => undefined as never);
    process.removeAllListeners('uncaughtException');
    process.removeAllListeners('unhandledRejection');
    logger = undefined;
  });

  afterEach(() => {
    transportLogSpy.mockRestore();
    chalk.level = chalk.supportsColor ? chalk.supportsColor.level : 0;
    mockedInternalExit.mockClear();
    if (
      logger &&
      typeof (logger as any).removeExceptionHandlers === 'function'
    ) {
      (logger as any).removeExceptionHandlers();
    }
    process.removeAllListeners('uncaughtException');
    process.removeAllListeners('unhandledRejection');
  });

  it('should NOT handle exceptions if handleExceptions is false/undefined', () => {
    /* OK */
  });
  it('should handle exceptions if handleExceptions is true and exit (default)', () => {
    /* OK */
  });
  it('should handle rejections if handleRejections is true (Error reason)', () => {
    /* OK */
  });

  it('should handle rejections if handleRejections is true (non-Error reason)', () => {
    logger = createLogger({
      transports: [mockTransport],
      handleRejections: true,
    });
    const reason = 'Just a string reason';
    const handler = (logger as any).rejectionHandler;
    expect(handler).toBeDefined();
    handler(reason, null); // Wywołaj ręcznie
    expect(transportLogSpy).toHaveBeenCalledTimes(1);
    const callArg = transportLogSpy.mock.calls[0][0] as string;
    expect(callArg).toContain(`[ERROR]: ${reason}`);
    // --- POCZĄTEK ZMIANY: Poprawiona asercja dla stack trace ---
    // Sprawdź, czy zawiera nową linię, a potem początek stack trace'u
    expect(callArg).toContain('\nError: Just a string reason');
    // --- KONIEC ZMIANY ---
    expect(callArg).toContain(`originalReason: '${reason}'`);
    expect(mockedInternalExit).toHaveBeenCalledTimes(1);
    expect(mockedInternalExit).toHaveBeenCalledWith(1);
  });

  it('should NOT exit on error if exitOnError is false', () => {
    /* OK */
  });
  it('should remove exception handlers when removeExceptionHandlers is called', () => {
    /* OK */
  });
}); // Koniec describe 'Error Handling'
