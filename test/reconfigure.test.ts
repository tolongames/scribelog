// test/reconfigure.test.ts
import { Scribelog } from '../src/logger';
import type { Transport } from '../src/types';
import * as format from '../src/format';

class CaptureTransport implements Transport {
  public entries: Array<Record<string, any> | string> = [];
  public name: string;
  public format = (info: Record<string, any>) => info; // Keep as object

  constructor(name = 'capture') {
    this.name = name;
  }

  log(entry: Record<string, any> | string): void {
    this.entries.push(entry);
  }

  clear(): void {
    this.entries = [];
  }
}

describe('Runtime Reconfiguration', () => {
  let logger: Scribelog;
  let capture1: CaptureTransport;
  let capture2: CaptureTransport;

  beforeEach(() => {
    capture1 = new CaptureTransport('capture1');
    capture2 = new CaptureTransport('capture2');
  });

  afterEach(() => {
    if (
      logger &&
      typeof (logger as any).removeExceptionHandlers === 'function'
    ) {
      (logger as any).removeExceptionHandlers();
    }
  });

  describe('updateLevel', () => {
    test('can change log level at runtime', () => {
      logger = new Scribelog({
        level: 'warn',
        transports: [capture1],
      });

      logger.debug('debug1');
      logger.info('info1');
      logger.warn('warn1');

      expect(capture1.entries.length).toBe(1); // Only warn

      // Change to debug level
      logger.updateLevel('debug');

      logger.debug('debug2');
      logger.info('info2');
      logger.warn('warn2');

      expect(capture1.entries.length).toBe(4); // warn1 + debug2 + info2 + warn2
    });

    test('warns on invalid level', () => {
      const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation();

      logger = new Scribelog({
        level: 'info',
        transports: [capture1],
      });

      logger.updateLevel('invalid-level' as any);

      expect(consoleWarnSpy).toHaveBeenCalledWith(
        '[scribelog] Unknown level "invalid-level" in updateLevel'
      );

      // Level should remain unchanged
      expect(logger.level).toBe('info');

      consoleWarnSpy.mockRestore();
    });

    test('can escalate to more restrictive level', () => {
      logger = new Scribelog({
        level: 'debug',
        transports: [capture1],
      });

      logger.debug('debug1');
      logger.info('info1');

      expect(capture1.entries.length).toBe(2);

      // Escalate to error only
      logger.updateLevel('error');

      logger.debug('debug2');
      logger.info('info2');
      logger.warn('warn2');
      logger.error('error1');

      expect(capture1.entries.length).toBe(3); // debug1, info1, error1
    });
  });

  describe('addTransport', () => {
    test('can add transport at runtime', () => {
      logger = new Scribelog({
        level: 'info',
        transports: [capture1],
      });

      logger.info('message1');

      expect(capture1.entries.length).toBe(1);
      expect(capture2.entries.length).toBe(0);

      // Add second transport
      logger.addTransport(capture2);

      logger.info('message2');

      expect(capture1.entries.length).toBe(2);
      expect(capture2.entries.length).toBe(1); // Only message2
    });

    test('newly added transport respects logger level', () => {
      logger = new Scribelog({
        level: 'warn',
        transports: [capture1],
      });

      logger.addTransport(capture2);

      logger.debug('debug1');
      logger.info('info1');
      logger.warn('warn1');

      expect(capture1.entries.length).toBe(1);
      expect(capture2.entries.length).toBe(1);
    });

    test('can add multiple transports', () => {
      logger = new Scribelog({
        level: 'info',
        transports: [],
      });

      logger.addTransport(capture1);
      logger.addTransport(capture2);

      logger.info('test');

      expect(capture1.entries.length).toBe(1);
      expect(capture2.entries.length).toBe(1);
    });
  });

  describe('removeTransport', () => {
    test('can remove transport at runtime', () => {
      logger = new Scribelog({
        level: 'info',
        transports: [capture1, capture2],
      });

      logger.info('message1');

      expect(capture1.entries.length).toBe(1);
      expect(capture2.entries.length).toBe(1);

      // Remove first transport
      logger.removeTransport(capture1);

      logger.info('message2');

      expect(capture1.entries.length).toBe(1); // No new entries
      expect(capture2.entries.length).toBe(2); // Got message2
    });

    test('removing non-existent transport is safe', () => {
      logger = new Scribelog({
        level: 'info',
        transports: [capture1],
      });

      const capture3 = new CaptureTransport('capture3');

      // Should not throw
      expect(() => {
        logger.removeTransport(capture3);
      }).not.toThrow();

      logger.info('test');
      expect(capture1.entries.length).toBe(1);
    });

    test('can remove all transports', () => {
      logger = new Scribelog({
        level: 'info',
        transports: [capture1, capture2],
      });

      logger.removeTransport(capture1);
      logger.removeTransport(capture2);

      // Logging should not crash even with no transports
      expect(() => {
        logger.info('test');
      }).not.toThrow();

      expect(capture1.entries.length).toBe(0);
      expect(capture2.entries.length).toBe(0);
    });
  });

  describe('updateOptions', () => {
    test('can update level via updateOptions', () => {
      logger = new Scribelog({
        level: 'info',
        transports: [capture1],
      });

      logger.debug('debug1');
      logger.info('info1');

      expect(capture1.entries.length).toBe(1);

      logger.updateOptions({ level: 'debug' });

      logger.debug('debug2');

      expect(capture1.entries.length).toBe(2);
    });

    test('can update transports via updateOptions', () => {
      logger = new Scribelog({
        level: 'info',
        transports: [capture1],
      });

      logger.info('message1');

      logger.updateOptions({ transports: [capture2] });

      logger.info('message2');

      expect(capture1.entries.length).toBe(1);
      expect(capture2.entries.length).toBe(1);
    });

    test('can update format via updateOptions', () => {
      logger = new Scribelog({
        level: 'info',
        transports: [capture1],
      });

      logger.info('message1', { formatted: 'v1' });

      logger.updateOptions({
        defaultMeta: { formatted: 'v2' },
      });

      logger.info('message2');

      const entries = capture1.entries as Array<Record<string, any>>;
      expect(entries[0].formatted).toBe('v1');
      expect(entries[1].formatted).toBe('v2');
    });

    test('can update defaultMeta via updateOptions', () => {
      logger = new Scribelog({
        level: 'info',
        transports: [capture1],
        defaultMeta: { app: 'v1' },
      });

      logger.info('message1');

      logger.updateOptions({
        defaultMeta: { version: '2.0' },
      });

      logger.info('message2');

      const entries = capture1.entries as Array<Record<string, any>>;
      expect(entries[0].app).toBe('v1');
      expect(entries[0].version).toBeUndefined();
      expect(entries[1].app).toBe('v1'); // Merged
      expect(entries[1].version).toBe('2.0');
    });

    test('can update profiler options via updateOptions', () => {
      logger = new Scribelog({
        level: 'debug',
        transports: [capture1],
        profiler: {
          level: 'debug',
          thresholdWarnMs: 100,
        },
      });

      logger.updateOptions({
        profiler: {
          thresholdWarnMs: 50,
          thresholdErrorMs: 200,
        },
      });

      // Profiler options should be merged
      const profilerOpts = (logger as any).profilerOptions;
      expect(profilerOpts.thresholdWarnMs).toBe(50);
      expect(profilerOpts.thresholdErrorMs).toBe(200);
    });

    test('can update sampler via updateOptions', () => {
      logger = new Scribelog({
        level: 'info',
        transports: [capture1],
      });

      logger.info('message1');
      logger.info('message2');

      expect(capture1.entries.length).toBe(2);

      // Add sampler that only allows messages with 'important'
      logger.updateOptions({
        sampler: (entry) => {
          return (
            typeof entry.message === 'string' &&
            entry.message.includes('important')
          );
        },
      });

      logger.info('normal message');
      logger.info('important message');

      expect(capture1.entries.length).toBe(3); // message1, message2, important message
    });

    test('can update rateLimit via updateOptions', () => {
      jest.useFakeTimers();

      logger = new Scribelog({
        level: 'info',
        transports: [capture1],
      });

      logger.info('message1');
      logger.info('message2');
      logger.info('message3');

      expect(capture1.entries.length).toBe(3);

      // Add rate limit
      logger.updateOptions({
        rateLimit: {
          maxPerSecond: 2,
        },
      });

      logger.info('message4');
      logger.info('message5');
      logger.info('message6'); // Should be dropped

      expect(capture1.entries.length).toBe(5); // 3 + 2

      jest.useRealTimers();
    });

    test('updating rateLimit resets counters', () => {
      jest.useFakeTimers();

      logger = new Scribelog({
        level: 'info',
        transports: [capture1],
        rateLimit: {
          maxPerSecond: 2,
        },
      });

      logger.info('message1');
      logger.info('message2');
      logger.info('message3'); // Dropped

      expect(capture1.entries.length).toBe(2);

      // Update rate limit - should reset counters
      logger.updateOptions({
        rateLimit: {
          maxPerSecond: 2,
        },
      });

      // Should be able to log again immediately
      logger.info('message4');
      logger.info('message5');

      expect(capture1.entries.length).toBe(4);

      jest.useRealTimers();
    });

    test('can update multiple options at once', () => {
      logger = new Scribelog({
        level: 'warn',
        transports: [capture1],
        defaultMeta: { env: 'dev' },
      });

      logger.info('info1');
      logger.warn('warn1');

      expect(capture1.entries.length).toBe(1);

      logger.updateOptions({
        level: 'debug',
        transports: [capture2],
        defaultMeta: { env: 'prod' },
      });

      logger.debug('debug2');

      expect(capture1.entries.length).toBe(1);
      expect(capture2.entries.length).toBe(1);

      const entry = capture2.entries[0] as any;
      expect(entry.env).toBe('prod');
    });

    test('warns on invalid level in updateOptions', () => {
      const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation();

      logger = new Scribelog({
        level: 'info',
        transports: [capture1],
      });

      logger.updateOptions({ level: 'invalid' as any });

      expect(consoleWarnSpy).toHaveBeenCalledWith(
        '[scribelog] Unknown level "invalid" in updateOptions'
      );

      consoleWarnSpy.mockRestore();
    });
  });

  describe('Hot Reload Scenarios', () => {
    test('can switch from verbose to quiet logging', () => {
      logger = new Scribelog({
        level: 'debug',
        transports: [capture1],
      });

      logger.debug('Starting application');
      logger.info('Loading config');
      logger.warn('Deprecated feature used');

      expect(capture1.entries.length).toBe(3);

      // Switch to production mode - only errors
      logger.updateOptions({
        level: 'error',
        format: format.json,
      });

      logger.debug('Debug in prod');
      logger.info('Info in prod');
      logger.warn('Warning in prod');
      logger.error('Error in prod');

      expect(capture1.entries.length).toBe(4); // 3 from before + 1 error
    });

    test('can redirect logs to different transport without restart', () => {
      logger = new Scribelog({
        level: 'info',
        transports: [capture1],
      });

      logger.info('Before redirect');

      expect(capture1.entries.length).toBe(1);
      expect(capture2.entries.length).toBe(0);

      // Redirect to new transport
      logger.removeTransport(capture1);
      logger.addTransport(capture2);

      logger.info('After redirect');

      expect(capture1.entries.length).toBe(1);
      expect(capture2.entries.length).toBe(1);
    });

    test('can enable debug logging for troubleshooting', () => {
      logger = new Scribelog({
        level: 'error',
        transports: [capture1],
      });

      logger.debug('Hidden debug');
      logger.error('Visible error');

      expect(capture1.entries.length).toBe(1);

      // Enable debug for troubleshooting
      logger.updateLevel('debug');

      logger.debug('Now visible debug');

      expect(capture1.entries.length).toBe(2);
    });

    test('can add sampling during high load', () => {
      logger = new Scribelog({
        level: 'info',
        transports: [capture1],
      });

      // Normal operation
      for (let i = 0; i < 10; i++) {
        logger.info(`message ${i}`);
      }

      expect(capture1.entries.length).toBe(10);

      // High load detected - enable sampling
      let counter = 0;
      logger.updateOptions({
        sampler: () => {
          counter++;
          return counter % 5 === 0; // Only 20% of logs
        },
      });

      for (let i = 10; i < 20; i++) {
        logger.info(`message ${i}`);
      }

      // Should have 10 from before + 2 from sampling (10 logs / 5)
      expect(capture1.entries.length).toBe(12);
    });
  });
});
