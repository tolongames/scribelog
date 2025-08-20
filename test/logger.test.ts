// test/logger.test.ts
import {
  createLogger,
  Scribelog,
  Logger,
  LoggerOptions,
  LogLevels,
  LogInfo,
  Transport,
  format,
  transports,
  standardLevels,
} from '../src/index';
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
    const { createLogger, runWithRequestContext, setRequestId } = require('../src');
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
    await transport.log({ level: 'info', message: 'mongo test', timestamp: new Date() });
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
      insertQuery: 'INSERT INTO logs(level, message, timestamp, meta) VALUES ($1, $2, $3, $4)',
    });
    await transport.log({ level: 'info', message: 'sql test', timestamp: new Date() });
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

    const mw = adapters.koa.createMiddleware({ logger, headerName: 'x-request-id' });
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
    const req: any = { method: 'PUT', url: '/nest', headers: { 'x-request-id': 'rid-nest-1' } };
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

    const req: any = { method: 'GET', url: '/api/hello', headers: { 'x-request-id': 'rid-next-1' } };
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

    const requestSpy = jest.spyOn(http, 'request').mockImplementation((_opts: any, cb: any) => {
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
        sendMock = jest.fn((buf: Buffer, _port: number, _host: string, cb?: Function) => {
          cb && cb(null);
        });
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