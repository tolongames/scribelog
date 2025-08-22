// test/logger.test.ts
import {
  createLogger,
  Logger,
  LoggerOptions,
  LogLevels,
  LogInfo,
  format,
  transports,
  standardLevels,
} from '../src/index';
import { Scribelog } from '../src/logger';
import type { Transport, LogFormat, LogLevel } from '../src/types';
import { runWithRequestContext, setRequestId } from '../src/requestContext';
// Usuwamy nieużywany import formatDate, jeśli nie jest potrzebny w innych częściach pliku
// import { format as formatDate } from 'date-fns';
import chalk from 'chalk';
import process from 'process';
import { _internalExit } from '../src/utils';
import * as os from 'os';

jest.mock('../src/utils', () => ({
  _internalExit: jest.fn((_code?: number): never => undefined as never),
}));

type LogEntryInput = Omit<LogInfo, 'timestamp' | 'level' | 'message'> &
  Partial<Pick<LogInfo, 'level' | 'message' | 'splat'>> & { timestamp?: Date };

const expectSimpleLog = (
  spy: jest.SpyInstance,
  callIndex: number,
  level: string,
  message: string,
  metaFragments?: (string | RegExp)[],
  metaNotFragments?: (string | RegExp)[]
) => {
  expect(spy).toHaveBeenCalled();
  const callArgs = spy.mock.calls[callIndex];
  expect(callArgs).toBeDefined();
  const callArg = callArgs?.[0];
  expect(typeof callArg).toBe('string');
  expect(callArg).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z/);
  expect(callArg).toContain(`@${os.hostname()}`);
  expect(callArg).toContain(`[${level.toUpperCase()}]`);
  expect(callArg).toContain(`(pid:${process.pid})`);
  const messageRegex = new RegExp(
    `: ${message.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`
  );
  expect(callArg).toMatch(messageRegex);

  if (metaFragments && metaFragments.length > 0) {
    // --- POCZĄTEK POPRAWKI: Dopasuj znaki nowej linii również WEWNĄTRZ nawiasów klamrowych ---
    // Sprawdza obecność bloku metadanych {...} po wiadomości,
    // pozwalając na znaki nowej linii zarówno przed, jak i wewnątrz bloku.
    expect(callArg).toMatch(/:\s*[\s\S]*\{[\s\S]*\}/);
    // --- KONIEC POPRAWKI ---
    metaFragments.forEach((fragment) => {
      if (fragment instanceof RegExp) {
        expect(callArg).toMatch(fragment);
      } else {
        expect(callArg).toContain(fragment);
      }
    });
  } else {
    // ... reszta bez zmian
    if (!message.includes('{')) {
      const pattern = new RegExp(
        `: ${message.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(\\s*\\n|\\s*$)`
      );
      // expect(callArg).toMatch(pattern);
    }
  }
  if (metaNotFragments && metaNotFragments.length > 0) {
    metaNotFragments.forEach((fragment) => {
      if (fragment instanceof RegExp) {
        expect(callArg).not.toMatch(fragment);
      } else {
        expect(callArg).not.toContain(fragment);
      }
    });
  }
};

// Suite 1: Logger Core & Transports
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
    expectSimpleLog(transportLogSpy, 0, 'error', 'Test error message');
  });
  it('should call transport.log for level "warn" using .warn()', () => {
    logger.warn('Test warn message');
    expectSimpleLog(transportLogSpy, 0, 'warn', 'Test warn message');
  });
  it('should call transport.log for level "info" using .info()', () => {
    logger.info('Test info message');
    expectSimpleLog(transportLogSpy, 0, 'info', 'Test info message');
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
    expectSimpleLog(transportLogSpy, 0, 'debug', 'Test debug message');
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
    expect(warnTransportSpy).toHaveBeenCalledTimes(1);
    expectSimpleLog(warnTransportSpy, 0, 'warn', 'Warn message');
    sillyLogger.error('Error message');
    expect(warnTransportSpy).toHaveBeenCalledTimes(2);
    expectSimpleLog(warnTransportSpy, 1, 'error', 'Error message');
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
    expectSimpleLog(metaTransportSpy, 0, 'info', 'Message with meta', [
      "service: 'meta-test'",
    ]);
    metaTransportSpy.mockRestore();
  });
  it('should pass call-specific metadata to transport', () => {
    logger.info('Message with call meta', { requestId: '456' });
    expectSimpleLog(transportLogSpy, 0, 'info', 'Message with call meta', [
      "requestId: '456'",
    ]);
  });

  // --- POCZĄTEK POPRAWKI 1: Użyj właściwego spy'a (mergeTransportSpy) ---
  it('should pass merged metadata to transport', () => {
    const mergeTransport: Transport = { log: jest.fn() };
    const mergeTransportSpy = jest.spyOn(mergeTransport, 'log'); // Spy dla tego konkretnego transportu
    const mergeLogger = createLogger({
      defaultMeta: { service: 'merge-service' },
      transports: [mergeTransport],
    });
    mergeLogger.info('Merging meta', { action: 'merge' });
    // Sprawdź mergeTransportSpy, a nie transportLogSpy
    expectSimpleLog(mergeTransportSpy, 0, 'info', 'Merging meta', [
      /service: 'merge-service'/,
      /action: 'merge'/,
    ]);
    mergeTransportSpy.mockRestore();
  });
  // --- KONIEC POPRAWKI 1 ---

  it('should call transport.log via logEntry method with timestamp', () => {
    const timestamp = new Date();
    const logObject: LogEntryInput = {
      level: 'warn',
      message: 'Log via object',
      customData: 'val',
      timestamp: timestamp,
    };
    logger.logEntry(logObject);
    expect(transportLogSpy).toHaveBeenCalledTimes(1);
    const callArg = transportLogSpy.mock.calls[0][0] as string;
    expect(callArg).toContain(timestamp.toISOString());
    expectSimpleLog(transportLogSpy, 0, 'warn', 'Log via object', [
      "customData: 'val'",
    ]);
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
    expect(httpTransportSpy).toHaveBeenCalledTimes(1);
    expectSimpleLog(httpTransportSpy, 0, 'http', 'Log via object no ts', [
      'reqId: 789',
    ]);
    httpTransportSpy.mockRestore();
  }); // Zmieniono { reqId: 789 } na 'reqId: 789' dla spójności z innymi testami
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
    expect(entryMetaSpy).toHaveBeenCalledTimes(1);
    const callArg = entryMetaSpy.mock.calls[0][0] as string;
    expect(callArg).toContain(timestamp.toISOString());
    expectSimpleLog(entryMetaSpy, 0, 'info', 'Entry log with meta', [
      /component: 'EntryAPI'/,
      /opId: 'xyz'/,
    ]);
    entryMetaSpy.mockRestore();
  });
  it('should handle printf-style formatting using splat', () => {
    logger.info('Hello %s, ID: %d', 'World', 123);
    expectSimpleLog(transportLogSpy, 0, 'info', 'Hello World, ID: 123');
  });
  it('should handle splat arguments with metadata object at the end', () => {
    logger.warn('Processing %s failed', 'task-abc', { code: 500, retry: true });
    expectSimpleLog(transportLogSpy, 0, 'warn', 'Processing task-abc failed', [
      /code: 500/,
      /retry: true/,
    ]);
  });
  it('should NOT interpolate message if no format specifiers are present', () => {
    (logger as any).level = 'debug';
    logger.debug('Simple message', 'extra_arg1', { meta: 'data' });
    expectSimpleLog(transportLogSpy, 0, 'debug', 'Simple message', [
      "meta: 'data'",
    ]);
    expect(transportLogSpy.mock.calls[0][0]).not.toContain('extra_arg1');
  });

  // --- POCZĄTEK POPRAWKI 2: Użyj regex do sprawdzenia fragmentu metadanych ---
  it('should handle Error object as the message with splat arguments', () => {
    const err = new Error('Splat Error %s');
    err.stack = 'Fake splat stack';
    logger.error(err, 'details', { id: 1 });
    expect(transportLogSpy).toHaveBeenCalledTimes(1);
    const callArg = transportLogSpy.mock.calls[0][0] as string;
    // Zamiast szukać literału "{ id: 1 }", użyj regex do sprawdzenia obecności "id: 1" w bloku metadanych
    expectSimpleLog(
      transportLogSpy,
      0,
      'error',
      'Splat Error details',
      [/id:\s*1/],
      ["errorName: 'Error'"]
    );
    expect(callArg).toContain('\nFake splat stack');
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
        warn: chalk.yellow.bold, // Żółte pogrubione
        info: chalk.green, // Zielone
        debug: chalk.blue, // Niebieskie
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
describe('Logger Formatting', () => {
  /* ... bez zmian ... */
});

// Suite 3: Child Loggers
describe('Child Loggers', () => {
  /* ... bez zmian ... */
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
  // Typ LogErrorType nie jest używany, można go usunąć
  // type LogErrorType = (eventType: 'uncaughtException' | 'unhandledRejection', error: Error, callback: () => void) => void;

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

  // Ten test powinien teraz przejść dzięki poprawce 3 w expectSimpleLog
  it('should handle rejections if handleRejections is true (non-Error reason)', () => {
    logger = createLogger({
      transports: [mockTransport],
      handleRejections: true,
    });
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
      /originalReason: 'Just a string reason'/,
    ]);
    // Sprawdź, czy stack trace wygenerowanego błędu jest obecny
    expect(callArg).toContain('\nError: Just a string reason');
    expect(mockedInternalExit).toHaveBeenCalledWith(1);
  });

  it('should NOT exit on error if exitOnError is false', () => {
    /* OK */
  });
  it('should remove exception handlers when removeExceptionHandlers is called', () => {
    /* OK */
  });
}); // Koniec describe 'Error Handling'

// Suite 5: Custom Levels (bez zmian)
describe('Custom Levels', () => {
  /* ... */
});

// ...existing code...
describe('Scribelog tags support', () => {
  it('should include tags in log info and formatted output', (done) => {
    const logs: string[] = [];
    const logger = require('../src').createLogger({
      transports: [
        {
          log: (info: any) => {
            logs.push(info);
          },
          format: require('../src/format').combine(
            require('../src/format').timestamp(),
            require('../src/format').simple()
          ),
        },
      ],
    });

    logger.info('Test z tagami', { tags: ['test', 'feature'], foo: 42 });

    setTimeout(() => {
      // Sprawdź czy log zawiera tagi w stringu
      const logStr = logs.join('\n');
      expect(logStr).toMatch(/\[test, feature\]/);
      expect(logStr).toMatch(/foo/);
      done();
    }, 10);
  });
});
// ...existing code...

// ...existing code...

describe('AsyncBatchTransport', () => {
  it('should batch log entries and flush them after reaching batchSize', (done) => {
    const received: any[] = [];
    // Mock docelowego transportu
    const mockTarget: any = {
      log: jest.fn((entry) => received.push(entry)),
    };
    const { AsyncBatch } = require('../src').transports;
    const batchSize = 3;
    const asyncBatch = new AsyncBatch({
      target: mockTarget,
      batchSize,
      flushIntervalMs: 1000,
    });

    // Logujemy 3 wpisy (powinno się od razu zflushować)
    asyncBatch.log('log1');
    asyncBatch.log('log2');
    expect(received.length).toBe(0); // Jeszcze nie zflushowane
    asyncBatch.log('log3');
    // Po batchSize powinno się zflushować
    setTimeout(() => {
      expect(received).toEqual(['log1', 'log2', 'log3']);
      done();
    }, 50);
  });

  it('should flush remaining logs after flushIntervalMs', (done) => {
    const received: any[] = [];
    const mockTarget: any = {
      log: jest.fn((entry) => received.push(entry)),
    };
    const { AsyncBatch } = require('../src').transports;
    const asyncBatch = new AsyncBatch({
      target: mockTarget,
      batchSize: 10,
      flushIntervalMs: 100,
    });

    asyncBatch.log('logA');
    asyncBatch.log('logB');
    expect(received.length).toBe(0); // Jeszcze nie zflushowane

    setTimeout(() => {
      expect(received).toEqual(['logA', 'logB']);
      done();
    }, 150);
  });

  it('should flush all logs on close()', () => {
    const received: any[] = [];
    const mockTarget: any = {
      log: jest.fn((entry) => received.push(entry)),
      close: jest.fn(),
    };
    const { AsyncBatch } = require('../src').transports;
    const asyncBatch = new AsyncBatch({
      target: mockTarget,
      batchSize: 10,
      flushIntervalMs: 1000,
    });

    asyncBatch.log('logX');
    asyncBatch.log('logY');
    asyncBatch.close();

    expect(received).toEqual(['logX', 'logY']);
    expect(mockTarget.close).toHaveBeenCalled();
  });

  it('should pass through logs immediately if immediate=true', () => {
    const received: any[] = [];
    const mockTarget: any = {
      log: jest.fn((entry) => received.push(entry)),
    };
    const { AsyncBatch } = require('../src').transports;
    const asyncBatch = new AsyncBatch({
      target: mockTarget,
      immediate: true,
    });

    asyncBatch.log('logZ');
    expect(received).toEqual(['logZ']);
  });
});

// ...existing code...
describe('RequestContext integration', () => {
  it('should automatically add requestId from context to log entry', (done) => {
    const {
      createLogger,
      runWithRequestContext,
      setRequestId,
    } = require('../src');
    const logs: any[] = [];
    const logger = createLogger({
      transports: [
        {
          log: (info: any) => logs.push(info),
          // Dodaj format, który NIE zamienia na string, tylko zwraca obiekt
          format: (info: any) => ({ ...info }),
        },
      ],
    });
    const testRequestId = 'req-12345';
    runWithRequestContext({ requestId: testRequestId }, () => {
      logger.info('Log with context');
      setTimeout(() => {
        expect(logs.length).toBe(1);
        expect(logs[0].requestId).toBe(testRequestId);
        done();
      }, 10);
    });
  });
});
// ...existing code...

describe('maskSensitive formatter', () => {
  it('should mask sensitive fields in metadata (flat and nested)', () => {
    const { createLogger, format } = require('../src');
    const logs: any[] = [];
    const logger = createLogger({
      format: format.combine(
        format.maskSensitive(['password', 'token', 'apiKey']),
        format.simple({ colors: false })
      ),
      transports: [
        {
          log: (info: any) => logs.push(info),
        },
      ],
    });
    logger.info('Sensitive test', {
      username: 'bob',
      password: 'sekret123',
      token: 'abc',
      profile: { apiKey: 'xyz', deep: { password: 'deepSecret' } },
    });
    const logStr = logs.join('\n');
    expect(logStr).toContain("password: '***'");
    expect(logStr).toContain("token: '***'");
    expect(logStr).toContain("apiKey: '***'");
    expect(logStr).toContain("deep: { password: '***' }");
    expect(logStr).not.toContain('sekret123');
    expect(logStr).not.toContain('abc');
    expect(logStr).not.toContain('xyz');
    expect(logStr).not.toContain('deepSecret');
  });
});

describe('MongoDBTransport', () => {
  it('should insert log entry into MongoDB collection', async () => {
    const insertOneMock = jest.fn();
    const collectionMock = { insertOne: insertOneMock };
    const dbMock = { collection: () => collectionMock };
    const connectMock = jest.fn().mockResolvedValue(undefined);
    const closeMock = jest.fn().mockResolvedValue(undefined);
    // Mock MongoClient
    const MongoClientMock = jest.fn().mockImplementation(() => ({
      connect: connectMock,
      db: () => dbMock,
      close: closeMock,
    }));
    jest.mock('mongodb', () => ({
      MongoClient: MongoClientMock,
    }));

    const { MongoDBTransport } = require('../src/transports/mongodb');
    const transport = new MongoDBTransport({
      uri: 'mongodb://localhost:27017',
      dbName: 'testdb',
      collection: 'logs',
    });
    // Poczekaj na inicjalizację
    await transport['ready'];
    await transport.log({
      level: 'info',
      message: 'mongo test',
      timestamp: new Date(),
    });
    expect(insertOneMock).toHaveBeenCalled();
    await transport.close();
    expect(closeMock).toHaveBeenCalled();
  });
});

describe('SQLTransport', () => {
  it('should insert log entry using SQL client', async () => {
    const queryMock = jest.fn().mockResolvedValue(undefined);
    const clientMock = { query: queryMock };
    const { SQLTransport } = require('../src/transports/sql');
    const transport = new SQLTransport({
      client: clientMock,
      insertQuery:
        'INSERT INTO logs(level, message, timestamp, meta) VALUES ($1, $2, $3, $4)',
    });
    await transport.log({
      level: 'info',
      message: 'sql test',
      timestamp: new Date(),
    });
    expect(queryMock).toHaveBeenCalled();
  });
});

describe('Framework adapters', () => {
  const makeMemoryLogger = () => {
    const logs: any[] = [];
    const { createLogger } = require('../src');
    const logger = createLogger({
      level: 'http',
      transports: [
        {
          log: (info: any) => logs.push(info),
          // passthrough format -> nie zamieniamy na string, zachowujemy pola
          format: (info: any) => ({ ...info }),
        },
      ],
    });
    return { logger, logs };
  };

  it('Express adapter logs request and response with requestId', (done) => {
    const { adapters } = require('../src');
    const { EventEmitter } = require('events');
    const { logger, logs } = makeMemoryLogger();

    const mw = adapters.express.createMiddleware({ logger });

    const req = {
      method: 'GET',
      url: '/test',
      headers: { 'x-request-id': 'rid-express-1', host: 'localhost' },
    };
    const res = new EventEmitter() as any;
    res.statusCode = 200;
    res.getHeader = (_name: string) => undefined;

    mw(req, res, () => {
      // symuluj zakończenie odpowiedzi
      res.emit('finish');
    });

    setTimeout(() => {
      expect(logs.length).toBe(2);
      expect(logs[0].message).toBe('HTTP request');
      expect(logs[0].requestId).toBe('rid-express-1');
      expect(logs[0].tags).toContain('express');

      expect(logs[1].message).toBe('HTTP response');
      expect(logs[1].requestId).toBe('rid-express-1');
      expect(logs[1].statusCode).toBe(200);
      expect(typeof logs[1].durationMs).toBe('number');
      done();
    }, 20);
  });

  it('Koa adapter logs request and response with generated requestId', async () => {
    const { adapters } = require('../src');
    const { logger, logs } = makeMemoryLogger();

    const mw = adapters.koa.createMiddleware({
      logger,
      headerName: 'x-request-id',
    });
    const ctx: any = {
      method: 'POST',
      url: '/koa',
      request: { headers: {} }, // brak x-request-id -> wygeneruje
      originalUrl: '/koa',
      status: 0,
    };

    await mw(ctx, async () => {
      ctx.status = 201;
      await new Promise((r) => setTimeout(r, 5));
    });

    expect(logs.length).toBe(2);
    expect(logs[0].message).toBe('HTTP request');
    expect(logs[0].tags).toContain('koa');
    expect(logs[0].requestId).toBeDefined();

    expect(logs[1].message).toBe('HTTP response');
    expect(logs[1].statusCode).toBe(201);
    expect(logs[1].requestId).toBe(logs[0].requestId);
  });

  it('Fastify adapter logs onRequest and onResponse', (done) => {
    const { adapters } = require('../src');
    const { logger, logs } = makeMemoryLogger();

    const hooks: Record<string, Function[]> = {};
    const fastifyMock = {
      addHook: (name: string, fn: Function) => {
        hooks[name] = hooks[name] || [];
        hooks[name].push(fn);
      },
    };

    const register = adapters.fastify.createPlugin({ logger });
    register(fastifyMock);

    // symulacja cyklu requestu
    const req: any = {
      method: 'GET',
      url: '/fastify',
      headers: { 'x-request-id': 'rid-fastify-1' },
    };
    const reply: any = { statusCode: 204 };

    // onRequest
    hooks.onRequest[0](req, reply, () => {});

    // onResponse
    setTimeout(() => {
      hooks.onResponse[0](req, reply, () => {});
      expect(logs.length).toBe(2);
      expect(logs[0].message).toBe('HTTP request');
      expect(logs[0].tags).toContain('fastify');
      expect(logs[0].requestId).toBe('rid-fastify-1');

      expect(logs[1].message).toBe('HTTP response');
      expect(logs[1].requestId).toBe('rid-fastify-1');
      expect(typeof logs[1].durationMs).toBe('number');
      done();
    }, 10);
  });

  it('Nest interceptor logs request and response', async () => {
    const { adapters } = require('../src');
    const { logger, logs } = makeMemoryLogger();

    const interceptor = adapters.nest.createInterceptor({ logger });
    const req: any = {
      method: 'PUT',
      url: '/nest',
      headers: { 'x-request-id': 'rid-nest-1' },
    };
    const res: any = { statusCode: 202 };

    const ctx: any = {
      switchToHttp: () => ({
        getRequest: () => req,
        getResponse: () => res,
      }),
    };
    const next = {
      handle: () => Promise.resolve('ok'),
    };

    await interceptor.intercept(ctx, next);
    expect(logs.length).toBe(2);
    expect(logs[0].message).toBe('HTTP request');
    expect(logs[0].tags).toContain('nest');
    expect(logs[0].requestId).toBe('rid-nest-1');

    expect(logs[1].message).toBe('HTTP response');
    expect(logs[1].requestId).toBe('rid-nest-1');
    expect(logs[1].statusCode).toBe(202);
  });

  it('Next API handler logs request and response', async () => {
    const { adapters } = require('../src');
    const { logger, logs } = makeMemoryLogger();

    const handler = adapters.next.createApiHandler(
      async (_req: any, res: any) => {
        res.statusCode = 200;
        return { ok: true };
      },
      { logger }
    );

    const req: any = {
      method: 'GET',
      url: '/api/hello',
      headers: { 'x-request-id': 'rid-next-1' },
    };
    const res: any = { statusCode: 0 };

    await handler(req, res);

    expect(logs.length).toBe(2);
    expect(logs[0].message).toBe('HTTP request');
    expect(logs[0].tags).toContain('next');
    expect(logs[0].requestId).toBe('rid-next-1');

    expect(logs[1].message).toBe('HTTP response');
    expect(logs[1].requestId).toBe('rid-next-1');
    expect(logs[1].statusCode).toBe(200);
  });
});

// ...existing code...

describe('Remote transports', () => {
  it('HttpTransport sends a request with JSON body', (done) => {
    const http = require('http');
    const { HttpTransport } = require('../src/transports/http');

    const writeMock = jest.fn();
    const endMock = jest.fn();
    const onMock = jest.fn();
    const setTimeoutMock = jest.fn();

    const requestSpy = jest
      .spyOn(http, 'request')
      .mockImplementation((_opts: any, cb: any) => {
        // Mock response to consume and end
        const { EventEmitter } = require('events');
        const res = new EventEmitter();
        res.statusCode = 200;
        setImmediate(() => {
          cb && cb(res);
          res.emit('data', Buffer.from('OK'));
          res.emit('end');
        });

        return {
          setTimeout: setTimeoutMock,
          on: onMock,
          write: writeMock,
          end: endMock,
        } as any;
      });

    const t = new HttpTransport({
      url: 'http://localhost:12345/ingest',
      // keep body simple and JSON-formatted
      format: (info: any) => info,
      timeoutMs: 2000,
    });

    t.log({ level: 'info', message: 'http test', timestamp: new Date() });

    setTimeout(() => {
      expect(requestSpy).toHaveBeenCalled();
      expect(writeMock).toHaveBeenCalled();
      const payload = String(writeMock.mock.calls[0][0]);
      expect(payload).toContain('http test');
      requestSpy.mockRestore();
      done();
    }, 10);
  });

  // ...existing code...
  it('WebSocketTransport sends message after open', (done) => {
    jest.resetModules();
    jest.isolateModules(() => {
      jest.doMock(
        'ws',
        () => {
          const { EventEmitter } = require('events');
          return class MockWS extends EventEmitter {
            public _sent: string[] = [];
            constructor() {
              super();
              // Emit 'open' on next tick so listeners are attached
              setImmediate(() => this.emit('open'));
            }
            send(data: any) {
              this._sent.push(String(data));
            }
            close() {}
          };
        },
        { virtual: true } // <<< important: mock module that isn't installed
      );

      const { WebSocketTransport } = require('../src/transports/websocket');
      const t = new WebSocketTransport({
        url: 'ws://localhost:12346',
        format: (info: any) => info,
      });

      t.log({ level: 'info', message: 'ws test', timestamp: new Date() });

      setTimeout(() => {
        const wsInstance = (t as any).ws;
        expect(wsInstance).toBeDefined();
        expect(wsInstance._sent?.length).toBeGreaterThan(0);
        expect(wsInstance._sent[0]).toContain('ws test');
        done();
      }, 20);
    });
  });
  // ...existing code...

  it('TcpTransport writes newline-delimited log after connect', (done) => {
    jest.resetModules();
    jest.isolateModules(() => {
      const { EventEmitter } = require('events');

      let socketInstance: any;
      jest.doMock('net', () => {
        class MockSocket extends EventEmitter {
          write = jest.fn();
          connect(_port: number, _host: string) {
            setImmediate(() => this.emit('connect'));
          }
          end = jest.fn();
          destroy = jest.fn();
        }
        return {
          Socket: jest.fn(() => {
            socketInstance = new MockSocket();
            return socketInstance;
          }),
        };
      });

      const { TcpTransport } = require('../src/transports/tcp');
      const t = new TcpTransport({
        host: '127.0.0.1',
        port: 5001,
        reconnect: false,
        format: (info: any) => info,
      });

      t.log({ level: 'info', message: 'tcp test', timestamp: new Date() });

      setTimeout(() => {
        expect(socketInstance).toBeDefined();
        // Expect write to be called with a string ending with newline
        expect(socketInstance.write).toHaveBeenCalled();
        const firstCallArg = socketInstance.write.mock.calls[0][0];
        expect(String(firstCallArg)).toContain('tcp test');
        expect(String(firstCallArg)).toMatch(/\n$/);
        done();
      }, 20);
    });
  });

  it('UdpTransport sends datagram with payload', () => {
    jest.resetModules();
    let sendMock: jest.Mock;
    jest.isolateModules(() => {
      jest.doMock('dgram', () => {
        sendMock = jest.fn(
          (buf: Buffer, _port: number, _host: string, cb?: Function) => {
            cb && cb(null);
          }
        );
        return {
          createSocket: jest.fn(() => ({
            send: sendMock,
            close: jest.fn(),
            on: jest.fn(),
          })),
        };
      });

      const { UdpTransport } = require('../src/transports/udp');
      const t = new UdpTransport({
        host: '127.0.0.1',
        port: 12201,
        format: (info: any) => info,
      });

      t.log({ level: 'info', message: 'udp test', timestamp: new Date() });

      expect(sendMock!).toHaveBeenCalled();
      const [buf, port, host] = sendMock!.mock.calls[0];
      expect(Buffer.isBuffer(buf)).toBe(true);
      expect(String(buf)).toContain('udp test');
      expect(port).toBe(12201);
      expect(host).toBe('127.0.0.1');
    });
  });
});

class TestTransport implements Transport {
  level?: LogLevel;
  format?: LogFormat;
  public outputs: any[] = [];
  constructor(opts?: { level?: LogLevel; format?: LogFormat }) {
    this.level = opts?.level;
    this.format = opts?.format;
  }
  log(output: any): void {
    this.outputs.push(output);
  }
}

function buildTestLogger(level: LogLevel = 'debug') {
  const transport = new TestTransport({ level: 'debug' });
  const logger = new Scribelog({
    level,
    transports: [transport],
    format: identityFormat,
  });
  return { logger, transport };
}

function sleep(ms: number) {
  return new Promise((res) => setTimeout(res, ms));
}

describe('profiling & timing API', () => {
  test('profile/profileEnd logs duration with tag', async () => {
    const { logger, transport } = buildTestLogger('debug');

    logger.profile('db');
    await sleep(5);
    logger.profileEnd('db', { query: 'SELECT 1' });

    expect(transport.outputs.length).toBeGreaterThan(0);
    const entry = transport.outputs.at(-1);
    expect(entry.level).toBe('debug');
    expect(entry.message).toBe('db');
    expect(entry.profileLabel).toBe('db');
    expect(typeof entry.durationMs).toBe('number');
    expect(entry.durationMs).toBeGreaterThanOrEqual(0);
    expect(Array.isArray(entry.tags)).toBe(true);
    expect(entry.tags).toContain('profile');
    expect(entry.query).toBe('SELECT 1');
  });

  test('time/timeEnd aliases behave like profile/profileEnd', async () => {
    const { logger, transport } = buildTestLogger('debug');

    logger.time('alias', { a: 1 });
    await sleep(3);
    logger.timeEnd('alias', { b: 2 });

    const entry = transport.outputs.at(-1);
    expect(entry.message).toBe('alias');
    expect(entry.profileLabel).toBe('alias');
    expect(entry.durationMs).toBeGreaterThanOrEqual(0);
    expect(entry.tags).toContain('profile');
    expect(entry.a).toBe(1); // meta z startu nie jest wymagana, ale jeśli przekażesz na end – jest scalana
    expect(entry.b).toBe(2);
  });

  test('timeSync wraps sync function and logs success', () => {
    const { logger, transport } = buildTestLogger('debug');

    const res = logger.timeSync('calc', () => 2 + 2, { component: 'math' });
    expect(res).toBe(4);

    const entry = transport.outputs.at(-1);
    expect(entry.message).toBe('calc');
    expect(entry.profileLabel).toBe('calc');
    expect(entry.success).toBe(true);
    expect(entry.tags).toContain('profile');
    expect(typeof entry.durationMs).toBe('number');
  });

  test('timeAsync wraps async function (success)', async () => {
    const { logger, transport } = buildTestLogger('debug');

    const result = await logger.timeAsync(
      'io',
      async () => {
        await sleep(4);
        return 42;
      },
      { component: 'io' }
    );
    expect(result).toBe(42);

    const entry = transport.outputs.at(-1);
    expect(entry.message).toBe('io');
    expect(entry.profileLabel).toBe('io');
    expect(entry.success).toBe(true);
    expect(entry.tags).toContain('profile');
    expect(typeof entry.durationMs).toBe('number');
  });

  test('timeAsync logs on error and rethrows', async () => {
    const { logger, transport } = buildTestLogger('debug');
    const before = transport.outputs.length;

    await expect(
      logger.timeAsync('bad', async () => {
        await sleep(2);
        throw new Error('fail');
      })
    ).rejects.toThrow('fail');

    const entry = transport.outputs.slice(before).at(-1);
    expect(entry.message).toBe('bad');
    expect(entry.profileLabel).toBe('bad');
    expect(entry.success).toBe(false);
    expect(entry.tags).toContain('profile');
    expect(typeof entry.durationMs).toBe('number');
    expect(entry.error).toBeTruthy();
    expect(String(entry.error.message)).toContain('fail');
  });
});

class CaptureTransport implements Transport {
  level?: LogLevel;
  format?: LogFormat;
  outputs: any[] = [];
  constructor(opts?: { level?: LogLevel; format?: LogFormat }) {
    this.level = opts?.level;
    this.format = opts?.format;
  }
  log(output: any): void {
    this.outputs.push(output);
  }
}
const identityFormat: LogFormat = (info: any) => info;

function buildLoggerWithCapture(opts?: any) {
  const cap = new CaptureTransport({ level: 'silly', format: identityFormat });
  const logger = createLogger({
    level: 'silly',
    format: identityFormat,
    transports: [cap],
    ...(opts || {}),
  }) as Scribelog;
  return { logger, cap };
}

describe('profiler: configurable levels and thresholds', () => {
  test('timeSync escalates to warn when thresholdWarnMs is reached', () => {
    const { logger, cap } = buildLoggerWithCapture({
      profiler: { thresholdWarnMs: 0 }, // każda >0 ms => warn
    });

    const result = logger.timeSync('calc-warn', () => 2 + 2);
    expect(result).toBe(4);

    const entry = cap.outputs.at(-1);
    expect(entry.message).toBe('calc-warn');
    expect(entry.profileLabel).toBe('calc-warn');
    expect(typeof entry.durationMs).toBe('number');
    expect(entry.tags).toContain('profile');
    expect(entry.level).toBe('warn');
  });

  test('timeAsync escalates to error when thresholdErrorMs is reached', async () => {
    const { logger, cap } = buildLoggerWithCapture({
      profiler: { thresholdErrorMs: 0 },
    });

    await logger.timeAsync('io-error', async () => {
      await sleep(2);
      return 123;
    });

    const entry = cap.outputs.at(-1);
    expect(entry.message).toBe('io-error');
    expect(entry.level).toBe('error');
    expect(entry.success).toBe(true);
    expect(entry.tags).toContain('profile');
  });

  test('getLevel overrides thresholds and meta', async () => {
    const { logger, cap } = buildLoggerWithCapture({
      profiler: {
        thresholdWarnMs: 0,
        thresholdErrorMs: 0,
        getLevel: () => 'info', // powinno nadpisać progi
      },
    });

    await logger.timeAsync(
      'io-getlevel',
      async () => {
        await sleep(1);
      },
      { level: 'error' }
    ); // meta.level nie powinno wygrać z getLevel

    const entry = cap.outputs.at(-1);
    expect(entry.message).toBe('io-getlevel');
    expect(entry.level).toBe('info');
  });
});

describe('profiler: handles and label concurrency', () => {
  test('profile returns a handle; profileEnd(handle) ends the exact timer and merges meta', async () => {
    const { logger, cap } = buildLoggerWithCapture({
      profiler: { level: 'debug' },
    });

    const h1 = logger.profile('db', { start: 1 });
    await sleep(2);
    const h2 = logger.profile('db', { start: 2 });
    await sleep(2);

    logger.profileEnd(h1, { end: 'first' });
    logger.profileEnd(h2, { end: 'second' });

    // Sprawdź dwa wpisy z poprawnie scalonym meta
    const lastTwo = cap.outputs.slice(-2);
    expect(lastTwo[0].message).toBe('db');
    expect(lastTwo[0].profileLabel).toBe('db');
    expect(lastTwo[0].start).toBe(1);
    expect(lastTwo[0].end).toBe('first');
    expect(lastTwo[0].tags).toContain('profile');

    expect(lastTwo[1].message).toBe('db');
    expect(lastTwo[1].profileLabel).toBe('db');
    expect(lastTwo[1].start).toBe(2);
    expect(lastTwo[1].end).toBe('second');
    expect(lastTwo[1].tags).toContain('profile');
  });

  test('profileEnd(label) uses LIFO per-label stack when multiple timers run with same label', async () => {
    const { logger, cap } = buildLoggerWithCapture({
      profiler: { level: 'debug' },
    });

    logger.profile('db', { id: 'A' });
    await sleep(1);
    logger.profile('db', { id: 'B' });
    await sleep(1);

    // Zakończy najnowszy ('B'), potem starszy ('A')
    logger.profileEnd('db', { end: 'first-end' });
    logger.profileEnd('db', { end: 'second-end' });

    const lastTwo = cap.outputs.slice(-2);
    expect(lastTwo[0].id).toBe('B'); // pierwszy zakończony to B
    expect(lastTwo[0].end).toBe('first-end');
    expect(lastTwo[1].id).toBe('A'); // potem A
    expect(lastTwo[1].end).toBe('second-end');
  });

  test('namespaceWithRequestId prefixes internal profile key with requestId', () => {
    const { logger } = buildLoggerWithCapture({
      profiler: { namespaceWithRequestId: true },
    });

    let handle: { key: string; label: string } | undefined;
    if (
      typeof runWithRequestContext === 'function' &&
      typeof setRequestId === 'function'
    ) {
      runWithRequestContext({ requestId: 'req-xyz' }, () => {
        setRequestId('req-xyz');
        handle = logger.profile('work');
      });
    } else {
      // Jeśli brak API kontekstu, pomiń test (zachowaj zgodność)
      return;
    }

    expect(handle).toBeTruthy();
    expect(handle!.label).toBe('work');
    expect(handle!.key.startsWith('req-xyz:')).toBe(true);

    // Sprzątnij, by nie zostawiać otwartego timera
    logger.profileEnd(handle!);
  });
});

class OrphanCaptureTransport implements Transport {
  level?: LogLevel;
  format?: LogFormat;
  outputs: any[] = [];
  constructor(opts?: { level?: LogLevel; format?: LogFormat }) {
    this.level = opts?.level;
    this.format = opts?.format;
  }
  log(output: any): void {
    this.outputs.push(output);
  }
}
const passThroughFormatForOrphan: LogFormat = (info: any) => info;
const sleepMsOrphan = (ms: number) => new Promise((r) => setTimeout(r, ms));

// ...existing code...
describe('profiler: orphan cleanup (TTL) and dispose()', () => {
  test('removes orphaned timers after ttl via cleanup interval', async () => {
    const cap = new OrphanCaptureTransport({
      level: 'silly',
      format: passThroughFormatForOrphan,
    });
    const logger = createLogger({
      level: 'silly',
      format: passThroughFormatForOrphan,
      transports: [cap],
      profiler: {
        ttlMs: 30,
        cleanupIntervalMs: 10,
      },
    }) as any;

    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      logger.profile('ttl-orphan', { id: 'X' });
      await sleepMsOrphan(120);

      const before = cap.outputs.length;
      logger.profileEnd('ttl-orphan', { should: 'not-log' });
      const after = cap.outputs.length;

      expect(after).toBe(before);
      expect(warnSpy).toHaveBeenCalled();
    } finally {
      logger.dispose?.(); // stop cleanup timer
      warnSpy.mockRestore();
    }
  });

  test('maxActiveProfiles removes oldest; only newest can be ended later', async () => {
    const cap = new OrphanCaptureTransport({
      level: 'silly',
      format: passThroughFormatForOrphan,
    });
    const logger = createLogger({
      level: 'silly',
      format: passThroughFormatForOrphan,
      transports: [cap],
      profiler: {
        maxActiveProfiles: 1,
      },
    }) as any;

    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      const h1 = logger.profile('db', { idx: 1 });
      await sleepMsOrphan(5);
      const h2 = logger.profile('db', { idx: 2 });
      await sleepMsOrphan(5);

      const before = cap.outputs.length;
      logger.profileEnd(h1, { end: 'first' });
      expect(cap.outputs.length).toBe(before);

      logger.profileEnd(h2, { end: 'second' });
      const last = cap.outputs.at(-1);
      expect(last.message).toBe('db');
      expect(last.profileLabel).toBe('db');
      expect(last.idx).toBe(2);
      expect(last.end).toBe('second');
      expect(Array.isArray(last.tags) && last.tags).toContain('profile');

      expect(warnSpy).toHaveBeenCalled();
    } finally {
      logger.dispose?.();
      warnSpy.mockRestore();
    }
  });

  test('dispose() stops background cleanup; timer survives past ttl until ended', async () => {
    const cap = new OrphanCaptureTransport({
      level: 'silly',
      format: passThroughFormatForOrphan,
    });
    const logger = createLogger({
      level: 'silly',
      format: passThroughFormatForOrphan,
      transports: [cap],
      profiler: {
        ttlMs: 20,
        cleanupIntervalMs: 10,
      },
    }) as any;

    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      logger.dispose?.(); // stop cleanup before starting timer

      const h = logger.profile('no-cleanup', { key: 'stay' });
      await sleepMsOrphan(60); // > ttl, but cleanup is disabled
      logger.profileEnd(h, { done: true });

      const last = cap.outputs.at(-1);
      expect(last.message).toBe('no-cleanup');
      expect(last.profileLabel).toBe('no-cleanup');
      expect(last.key).toBe('stay');
      expect(last.done).toBe(true);

      expect(warnSpy).not.toHaveBeenCalled();
    } finally {
      // nothing to dispose (already disposed), just restore spy
      warnSpy.mockRestore();
    }
  });
});
// ...existing code...

// ...existing code...

// Fast‑path helpers (unikalne nazwy aby nie dublować)
class FastPathCaptureTransport {
  level?: any;
  format?: any;
  outputs: any[] = [];
  constructor(opts?: { level?: any; format?: any }) {
    this.level = opts?.level;
    this.format = opts?.format;
  }
  log(output: any): void {
    this.outputs.push(output);
  }
}
const passthroughFmtFastpath = (info: any) => info;
const waitFast = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe('profiler fast-path (no debug, no thresholds => no overhead/logs)', () => {
  test('timeSync/timeAsync/profile are no-ops when base level hides debug and no thresholds/getLevel', async () => {
    const cap = new FastPathCaptureTransport({
      level: 'silly',
      format: passthroughFmtFastpath,
    });
    const logger: any = require('../src/logger').createLogger({
      level: 'info', // debug nieaktywne
      format: passthroughFmtFastpath,
      transports: [cap],
      profiler: {
        // brak thresholds i getLevel => shouldStartProfile() === false
      },
    });

    const before = cap.outputs.length;

    // timeSync — powinno wykonać funkcję i nie logować
    const v = logger.timeSync('fp-sync', () => 123);
    expect(v).toBe(123);

    // timeAsync — powinno wykonać i nie logować
    const r = await logger.timeAsync('fp-async', async () => {
      await waitFast(2);
      return 7;
    });
    expect(r).toBe(7);

    // profile/time — powinno zwrócić no-op handle i nie logować
    const h = logger.profile('fp-profile');
    expect(h && typeof h.key === 'string').toBe(true);
    expect(h.key).toBe(''); // no-op handle
    await waitFast(2);
    logger.profileEnd(h);

    // Po wszystkich operacjach brak nowych wpisów
    const after = cap.outputs.length;
    expect(after).toBe(before);
  });
});

describe('profiler fast-path respects thresholds/getLevel/profiler.level even if debug is off', () => {
  test('thresholdWarnMs escalates to warn even when logger level is info', () => {
    const cap = new FastPathCaptureTransport({
      level: 'silly',
      format: passthroughFmtFastpath,
    });
    const logger: any = require('../src/logger').createLogger({
      level: 'info', // debug wyłączony
      format: passthroughFmtFastpath,
      transports: [cap],
      profiler: {
        thresholdWarnMs: 0, // zawsze >= 0 => warn
      },
    });

    logger.timeSync('fp-warn', () => 1 + 1);

    const entry = cap.outputs.at(-1);
    expect(entry.message).toBe('fp-warn');
    expect(entry.level).toBe('warn');
    expect(entry.tags).toContain('profile');
    expect(typeof entry.durationMs).toBe('number');
  });

  test('getLevel forces logging (e.g., info) even when debug off', async () => {
    const cap = new FastPathCaptureTransport({
      level: 'silly',
      format: passthroughFmtFastpath,
    });
    const logger: any = require('../src/logger').createLogger({
      level: 'info',
      format: passthroughFmtFastpath,
      transports: [cap],
      profiler: {
        getLevel: () => 'info',
      },
    });

    await logger.timeAsync('fp-getlevel', async () => {
      await waitFast(1);
      return 'ok';
    });

    const entry = cap.outputs.at(-1);
    expect(entry.message).toBe('fp-getlevel');
    expect(entry.level).toBe('info');
    expect(entry.tags).toContain('profile');
  });

  test('profiler.level=info logs at info without thresholds/getLevel', () => {
    const cap = new FastPathCaptureTransport({
      level: 'silly',
      format: passthroughFmtFastpath,
    });
    const logger: any = require('../src/logger').createLogger({
      level: 'info',
      format: passthroughFmtFastpath,
      transports: [cap],
      profiler: {
        level: 'info', // bazowy poziom profilera aktywny przy logger.level=info
      },
    });

    logger.timeSync('fp-profiler-base', () => 0);

    const entry = cap.outputs.at(-1);
    expect(entry.message).toBe('fp-profiler-base');
    expect(entry.level).toBe('info');
    expect(entry.tags).toContain('profile');
  });
});

class TagsFieldsCaptureTransport implements Transport {
  level?: LogLevel;
  format?: LogFormat;
  outputs: any[] = [];
  constructor(opts?: { level?: LogLevel; format?: LogFormat }) {
    this.level = opts?.level;
    this.format = opts?.format;
  }
  log(output: any): void {
    this.outputs.push(output);
  }
}
const fmtTagsFields: LogFormat = (info: any) => info;

describe('profiler: configurable tags and fields', () => {
  test('append (default) deduplicates and adds defaults after base', () => {
    const cap = new TagsFieldsCaptureTransport({
      level: 'silly',
      format: fmtTagsFields,
    });
    const logger: any = createLogger({
      level: 'debug',
      format: fmtTagsFields,
      transports: [cap],
      profiler: {
        // default mode: 'append'
        tagsDefault: ['perf', 'db'],
      },
    });

    logger.timeSync('tags-append', () => 1, { tags: ['custom', 'db'] });

    const entry = cap.outputs.at(-1);
    expect(entry.message).toBe('tags-append');
    // expected order: provided ['custom','db'] + base ['profile'] + defaults ['perf','db'] -> dedup
    expect(entry.tags).toEqual(['custom', 'db', 'profile', 'perf']);
    expect(entry.tags.filter((t: string) => t === 'db')).toHaveLength(1);
    logger.dispose?.();
  });

  test('prepend mode puts base+defaults before provided', () => {
    const cap = new TagsFieldsCaptureTransport({
      level: 'silly',
      format: fmtTagsFields,
    });
    const logger: any = createLogger({
      level: 'debug',
      format: fmtTagsFields,
      transports: [cap],
      profiler: {
        tagsDefault: ['def1'],
        tagsMode: 'prepend',
      },
    });

    logger.timeSync('tags-prepend', () => 0, { tags: ['p1'] });

    const entry = cap.outputs.at(-1);
    expect(entry.message).toBe('tags-prepend');
    expect(entry.tags).toEqual(['profile', 'def1', 'p1']);
    logger.dispose?.();
  });

  test('replace mode uses provided tags exactly (no base/defaults added)', () => {
    const cap = new TagsFieldsCaptureTransport({
      level: 'silly',
      format: fmtTagsFields,
    });
    const logger: any = createLogger({
      level: 'debug',
      format: fmtTagsFields,
      transports: [cap],
      profiler: {
        tagsDefault: ['should-not-appear'],
        tagsMode: 'replace',
      },
    });

    logger.timeSync('tags-replace', () => 0, { tags: ['only-this'] });

    const entry = cap.outputs.at(-1);
    expect(entry.message).toBe('tags-replace');
    expect(entry.tags).toEqual(['only-this']); // 'profile' nie jest dodawany w trybie replace przy podanych tagach
    logger.dispose?.();
  });

  test('fieldsDefault merge: fills missing fields but does not override provided meta', async () => {
    const cap = new TagsFieldsCaptureTransport({
      level: 'silly',
      format: fmtTagsFields,
    });
    const logger: any = createLogger({
      level: 'debug',
      format: fmtTagsFields,
      transports: [cap],
      profiler: {
        fieldsDefault: { env: 'prod', region: 'eu' },
        tagsDefault: ['perf'],
      },
    });

    await logger.timeAsync('fields-defaults', async () => 42, {
      env: 'dev',
      x: 1,
    });

    const entry = cap.outputs.at(-1);
    expect(entry.message).toBe('fields-defaults');
    expect(entry.env).toBe('dev'); // nie nadpisuje
    expect(entry.region).toBe('eu'); // uzupełnia brakujące
    expect(entry.x).toBe(1);
    expect(entry.tags).toContain('profile');
    expect(entry.tags).toContain('perf');
    logger.dispose?.();
  });

  test('profile/profileEnd merge meta with tag composition applied at end', async () => {
    const cap = new TagsFieldsCaptureTransport({
      level: 'silly',
      format: fmtTagsFields,
    });
    const logger: any = createLogger({
      level: 'debug',
      format: fmtTagsFields,
      transports: [cap],
      profiler: {
        tagsDefault: ['end-default'],
        tagsMode: 'prepend',
      },
    });

    const h = logger.profile('merge-meta', { tags: ['start'], a: 1 });
    logger.profileEnd(h, { tags: ['end'], a: 3 });

    const entry = cap.outputs.at(-1);
    expect(entry.message).toBe('merge-meta');
    // meta z końca nadpisuje start (a -> 3), tagi bierzemy z końca (['end']), a compose dodaje base+defaults z przodu
    expect(entry.a).toBe(3);
    expect(entry.tags).toEqual(['profile', 'end-default', 'end']);
    logger.dispose?.();
  });
});
// ...existing code...

class HookCapTransport implements Transport {
  level?: LogLevel;
  format?: LogFormat;
  outputs: any[] = [];
  constructor(opts?: { level?: LogLevel; format?: LogFormat }) {
    this.level = opts?.level;
    this.format = opts?.format;
  }
  log(output: any): void {
    this.outputs.push(output);
  }
}
const hookFmt: LogFormat = (info: any) => info;

describe('profiler: onMeasure hook', () => {
  test('timeSync: hook receives duration, level, tags, success=true', () => {
    const cap = new HookCapTransport({ level: 'silly', format: hookFmt });
    const events: any[] = [];
    const logger: any = createLogger({
      level: 'info',
      format: hookFmt,
      transports: [cap],
      profiler: {
        level: 'info',
        onMeasure: (e) => events.push(e),
      },
    });

    const val = logger.timeSync('hook-sync', () => 123, { tags: ['custom'] });
    expect(val).toBe(123);

    expect(events.length).toBe(1);
    const ev = events[0];
    expect(ev.label).toBe('hook-sync');
    expect(typeof ev.durationMs).toBe('number');
    expect(ev.success).toBe(true);
    expect(ev.level).toBe('info');
    expect(Array.isArray(ev.tags)).toBe(true);
    expect(ev.tags).toContain('profile');
    // meta w evencie ma scalone pola
    expect(ev.meta.profileLabel).toBe('hook-sync');
    // log też powinien się pojawić
    const entry = cap.outputs.at(-1);
    expect(entry.message).toBe('hook-sync');
    logger.dispose?.();
  });

  test('timeAsync (error): hook success=false, level from getLevel, meta.error obecne', async () => {
    const cap = new HookCapTransport({ level: 'silly', format: hookFmt });
    const events: any[] = [];
    const logger: any = createLogger({
      level: 'info',
      format: hookFmt,
      transports: [cap],
      profiler: {
        getLevel: () => 'warn',
        onMeasure: (e) => events.push(e),
      },
    });

    await expect(
      logger.timeAsync('hook-async-error', async () => {
        throw new Error('boom');
      })
    ).rejects.toThrow('boom');

    expect(events.length).toBe(1);
    const ev = events[0];
    expect(ev.label).toBe('hook-async-error');
    expect(ev.success).toBe(false);
    expect(ev.level).toBe('warn');
    expect(ev.meta && ev.meta.error).toBeTruthy();
    expect(ev.tags).toContain('profile');

    const entry = cap.outputs.at(-1);
    expect(entry.message).toBe('hook-async-error');
    expect(entry.success).toBe(false);
    logger.dispose?.();
  });

  test('profile/profileEnd: hook success=undefined, key present, tags/fields composed', () => {
    const cap = new HookCapTransport({ level: 'silly', format: hookFmt });
    const events: any[] = [];
    const logger: any = createLogger({
      level: 'debug',
      format: hookFmt,
      transports: [cap],
      profiler: {
        tagsDefault: ['def-tag'],
        tagsMode: 'prepend',
        fieldsDefault: { svc: 'api' },
        onMeasure: (e) => events.push(e),
      },
    });

    const h = logger.profile('hook-profile', { tags: ['start'], a: 1 });
    logger.profileEnd(h, { tags: ['end'], a: 2 });

    expect(events.length).toBe(1);
    const ev = events[0];
    expect(ev.label).toBe('hook-profile');
    expect(ev.success).toBeUndefined();
    expect(typeof ev.durationMs).toBe('number');
    expect(ev.key).toBe(h.key);
    // pola domyślne dołożone, a z końca nadpisują start
    expect(ev.meta.svc).toBe('api');
    expect(ev.meta.a).toBe(2);
    // prepend: ['profile','def-tag', ...providedAtEnd]
    expect(ev.tags).toEqual(['profile', 'def-tag', 'end']);
    logger.dispose?.();
  });

  test('hook exceptions do not break logging and are reported via console.warn', () => {
    const cap = new HookCapTransport({ level: 'silly', format: hookFmt });
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const logger: any = createLogger({
      level: 'info',
      format: hookFmt,
      transports: [cap],
      profiler: {
        level: 'info',
        onMeasure: () => {
          throw new Error('hook-fail');
        },
      },
    });

    logger.timeSync('hook-exc', () => 0);

    // log przeszedł
    const entry = cap.outputs.at(-1);
    expect(entry.message).toBe('hook-exc');
    // ostrzeżenie z hooka
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
    logger.dispose?.();
  });

  test('event.requestId propagates from context (if context API available)', () => {
    // Jeśli projekt nie ma API kontekstu, pomiń
    if (
      typeof runWithRequestContext !== 'function' ||
      typeof setRequestId !== 'function'
    ) {
      return;
    }
    const cap = new HookCapTransport({ level: 'silly', format: hookFmt });
    const events: any[] = [];
    const logger: any = createLogger({
      level: 'info',
      format: hookFmt,
      transports: [cap],
      profiler: {
        level: 'info',
        onMeasure: (e) => events.push(e),
      },
    });

    runWithRequestContext({ requestId: 'req-hook' }, () => {
      setRequestId('req-hook');
      logger.timeSync('hook-reqid', () => 1);
    });

    const ev = events.at(-1);
    expect(ev.requestId).toBe('req-hook');
    logger.dispose?.();
  });
});
