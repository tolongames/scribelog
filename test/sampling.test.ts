// test/sampling.test.ts
import { Scribelog } from '../src/logger';
import type { Transport, LogInfo } from '../src/types';

class CaptureTransport implements Transport {
  public entries: Array<Record<string, any> | string> = [];
  public format = (info: Record<string, any>) => info; // Keep as object

  log(entry: Record<string, any> | string): void {
    this.entries.push(entry);
  }

  clear(): void {
    this.entries = [];
  }
}

describe('Sampling', () => {
  let capture: CaptureTransport;
  let logger: Scribelog;

  beforeEach(() => {
    capture = new CaptureTransport();
  });

  afterEach(() => {
    if (
      logger &&
      typeof (logger as any).removeExceptionHandlers === 'function'
    ) {
      (logger as any).removeExceptionHandlers();
    }
  });

  test('sampler function can filter logs', () => {
    let callCount = 0;
    logger = new Scribelog({
      level: 'debug',
      transports: [capture],
      sampler: (entry) => {
        callCount++;
        // Only allow even-numbered calls
        return callCount % 2 === 0;
      },
    });

    logger.info('message 1');
    logger.info('message 2');
    logger.info('message 3');
    logger.info('message 4');

    expect(capture.entries.length).toBe(2);
    const messages = capture.entries.map((e: any) => e.message);
    expect(messages).toEqual(['message 2', 'message 4']);
  });

  test('sampler based on log level', () => {
    logger = new Scribelog({
      level: 'debug',
      transports: [capture],
      sampler: (entry) => {
        // Only allow error and warn levels
        return entry.level === 'error' || entry.level === 'warn';
      },
    });

    logger.debug('debug msg');
    logger.info('info msg');
    logger.warn('warn msg');
    logger.error('error msg');

    expect(capture.entries.length).toBe(2);
    const levels = capture.entries.map((e: any) => e.level);
    expect(levels).toEqual(['warn', 'error']);
  });

  test('sampler based on message content', () => {
    logger = new Scribelog({
      level: 'info',
      transports: [capture],
      sampler: (entry) => {
        // Only allow messages containing 'important'
        return (
          typeof entry.message === 'string' &&
          entry.message.includes('important')
        );
      },
    });

    logger.info('normal message');
    logger.info('important message');
    logger.info('another normal message');
    logger.info('very important note');

    expect(capture.entries.length).toBe(2);
    const messages = capture.entries.map((e: any) => e.message);
    expect(messages).toEqual(['important message', 'very important note']);
  });

  test('sampler errors are handled gracefully', () => {
    const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation();

    logger = new Scribelog({
      level: 'info',
      transports: [capture],
      sampler: () => {
        throw new Error('Sampler error');
      },
    });

    logger.info('test message');

    expect(consoleWarnSpy).toHaveBeenCalledWith(
      '[scribelog] sampler function threw:',
      expect.any(Error)
    );
    // When sampler throws, we log the warning and continue processing
    // (the catch block doesn't return, so log still goes through)
    expect(capture.entries.length).toBe(1);

    consoleWarnSpy.mockRestore();
  });

  test('sampler can access metadata', () => {
    logger = new Scribelog({
      level: 'info',
      transports: [capture],
      sampler: (entry) => {
        // Only allow entries with userId metadata
        return 'userId' in entry && entry.userId != null;
      },
    });

    logger.info('message 1');
    logger.info('message 2', { userId: 123 });
    logger.info('message 3');
    logger.info('message 4', { userId: 456 });

    expect(capture.entries.length).toBe(2);
    const userIds = capture.entries.map((e: any) => e.userId);
    expect(userIds).toEqual([123, 456]);
  });
});

describe('Rate Limiting', () => {
  let capture: CaptureTransport;
  let logger: Scribelog;

  beforeEach(() => {
    capture = new CaptureTransport();
    jest.useFakeTimers();
  });

  afterEach(() => {
    if (
      logger &&
      typeof (logger as any).removeExceptionHandlers === 'function'
    ) {
      (logger as any).removeExceptionHandlers();
    }
    jest.useRealTimers();
  });

  test('rate limit enforces maxPerSecond', () => {
    logger = new Scribelog({
      level: 'info',
      transports: [capture],
      rateLimit: {
        maxPerSecond: 3,
      },
    });

    // Log 5 messages immediately
    logger.info('message 1');
    logger.info('message 2');
    logger.info('message 3');
    logger.info('message 4');
    logger.info('message 5');

    // Only first 3 should be logged
    expect(capture.entries.length).toBe(3);
  });

  test('rate limit resets after window', () => {
    logger = new Scribelog({
      level: 'info',
      transports: [capture],
      rateLimit: {
        maxPerSecond: 2,
        window: 1000,
      },
    });

    // Log 3 messages
    logger.info('message 1');
    logger.info('message 2');
    logger.info('message 3'); // This should be dropped

    expect(capture.entries.length).toBe(2);

    // Advance time by 1 second
    jest.advanceTimersByTime(1000);

    // Now we should be able to log again
    logger.info('message 4');
    logger.info('message 5');
    logger.info('message 6'); // This should be dropped

    expect(capture.entries.length).toBe(4);
  });

  test('rate limit with custom window', () => {
    logger = new Scribelog({
      level: 'info',
      transports: [capture],
      rateLimit: {
        maxPerSecond: 2,
        window: 500, // 500ms window
      },
    });

    logger.info('message 1');
    logger.info('message 2');
    logger.info('message 3'); // Dropped

    expect(capture.entries.length).toBe(2);

    // Advance time by 500ms
    jest.advanceTimersByTime(500);

    // Window should reset
    logger.info('message 4');
    logger.info('message 5');

    expect(capture.entries.length).toBe(4);
  });

  test('rate limit respects level filtering', () => {
    logger = new Scribelog({
      level: 'warn', // Only warn and error
      transports: [capture],
      rateLimit: {
        maxPerSecond: 2,
      },
    });

    // These won't be logged due to level filtering (not rate limit)
    logger.debug('debug 1');
    logger.info('info 1');

    // These will be rate limited
    logger.warn('warn 1');
    logger.error('error 1');
    logger.warn('warn 2'); // Dropped by rate limit

    expect(capture.entries.length).toBe(2);
    const levels = capture.entries.map((e: any) => e.level);
    expect(levels).toEqual(['warn', 'error']);
  });

  test('rate limit counter updates correctly', () => {
    logger = new Scribelog({
      level: 'info',
      transports: [capture],
      rateLimit: {
        maxPerSecond: 5,
      },
    });

    // Log exactly at the limit
    for (let i = 1; i <= 5; i++) {
      logger.info(`message ${i}`);
    }

    expect(capture.entries.length).toBe(5);

    // Next one should be dropped
    logger.info('message 6');
    expect(capture.entries.length).toBe(5);

    // Reset and log again
    jest.advanceTimersByTime(1000);
    logger.info('message 7');
    expect(capture.entries.length).toBe(6);
  });
});

describe('Sampling and Rate Limiting Combined', () => {
  let capture: CaptureTransport;
  let logger: Scribelog;

  beforeEach(() => {
    capture = new CaptureTransport();
  });

  afterEach(() => {
    if (
      logger &&
      typeof (logger as any).removeExceptionHandlers === 'function'
    ) {
      (logger as any).removeExceptionHandlers();
    }
  });

  test('sampler applies before rate limit', () => {
    let sampleCount = 0;

    logger = new Scribelog({
      level: 'info',
      transports: [capture],
      sampler: () => {
        sampleCount++;
        return true; // Allow all
      },
      rateLimit: {
        maxPerSecond: 2,
      },
    });

    logger.info('message 1');
    logger.info('message 2');
    logger.info('message 3');

    // Sampler called for all 3
    expect(sampleCount).toBe(3);
    // But only 2 logged due to rate limit
    expect(capture.entries.length).toBe(2);
  });

  test('sampling reduces rate limit pressure', () => {
    logger = new Scribelog({
      level: 'info',
      transports: [capture],
      sampler: (entry) => {
        // Only sample 50% of logs
        return Math.random() < 0.5;
      },
      rateLimit: {
        maxPerSecond: 10,
      },
    });

    // With sampling at 50%, we'd expect roughly 10 out of 20 to pass sampler
    // Then rate limit would allow all of those through
    for (let i = 0; i < 20; i++) {
      logger.info(`message ${i}`);
    }

    // Due to randomness, we expect between 4 and 16 logs (very loose bounds)
    // but definitely less than 20
    expect(capture.entries.length).toBeLessThan(20);
    expect(capture.entries.length).toBeGreaterThan(0);
  });
});
