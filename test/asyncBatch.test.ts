// test/asyncBatch.test.ts
import { AsyncBatchTransport } from '../src/transports/asyncBatch';
import type { Transport } from '../src/types';

class MockTransport implements Transport {
  public logs: Array<Record<string, any> | string> = [];

  log(entry: Record<string, any> | string): void {
    this.logs.push(entry);
  }

  clear(): void {
    this.logs = [];
  }
}

describe('AsyncBatchTransport - Backpressure', () => {
  let mockTransport: MockTransport;
  let batchTransport: AsyncBatchTransport;

  beforeEach(() => {
    mockTransport = new MockTransport();
    jest.useFakeTimers();
  });

  afterEach(() => {
    if (batchTransport) {
      batchTransport.close();
    }
    jest.useRealTimers();
  });

  test('drop-oldest policy removes oldest entries when buffer full', () => {
    batchTransport = new AsyncBatchTransport({
      target: mockTransport,
      batchSize: 5,
      flushIntervalMs: 1000,
      highWaterMark: 3,
      overflowPolicy: 'drop-oldest',
    });

    // Add 5 entries - first 2 will be dropped as we hit highWaterMark
    batchTransport.log({ message: 'msg1' });
    batchTransport.log({ message: 'msg2' });
    batchTransport.log({ message: 'msg3' });
    batchTransport.log({ message: 'msg4' }); // This causes msg1 to be dropped
    batchTransport.log({ message: 'msg5' }); // This causes msg2 to be dropped

    expect(batchTransport.droppedCount).toBe(2);

    // Flush manually
    (batchTransport as any).flush();

    // Should have msg3, msg4, msg5
    expect(mockTransport.logs.length).toBe(3);
    expect(mockTransport.logs.map((l: any) => l.message)).toEqual([
      'msg3',
      'msg4',
      'msg5',
    ]);
  });

  test('drop-newest policy rejects new entries when buffer full', () => {
    batchTransport = new AsyncBatchTransport({
      target: mockTransport,
      batchSize: 5,
      flushIntervalMs: 1000,
      highWaterMark: 3,
      overflowPolicy: 'drop-newest',
    });

    // Add 5 entries
    batchTransport.log({ message: 'msg1' });
    batchTransport.log({ message: 'msg2' });
    batchTransport.log({ message: 'msg3' });
    batchTransport.log({ message: 'msg4' }); // Dropped (buffer full)
    batchTransport.log({ message: 'msg5' }); // Dropped (buffer full)

    expect(batchTransport.droppedCount).toBe(2);

    // Flush manually
    (batchTransport as any).flush();

    // Should only have msg1, msg2, msg3
    expect(mockTransport.logs.length).toBe(3);
    expect(mockTransport.logs.map((l: any) => l.message)).toEqual([
      'msg1',
      'msg2',
      'msg3',
    ]);
  });

  test('block policy allows buffer to grow beyond highWaterMark', () => {
    batchTransport = new AsyncBatchTransport({
      target: mockTransport,
      batchSize: 10,
      flushIntervalMs: 1000,
      highWaterMark: 3,
      overflowPolicy: 'block',
    });

    // Add 5 entries - all should be accepted despite highWaterMark
    for (let i = 1; i <= 5; i++) {
      batchTransport.log({ message: `msg${i}` });
    }

    expect(batchTransport.droppedCount).toBe(0);

    // Flush manually
    (batchTransport as any).flush();

    // All 5 should be logged
    expect(mockTransport.logs.length).toBe(5);
  });

  test('default overflow policy is drop-oldest', () => {
    batchTransport = new AsyncBatchTransport({
      target: mockTransport,
      batchSize: 5,
      flushIntervalMs: 1000,
      highWaterMark: 2,
      // No overflowPolicy specified, should default to 'drop-oldest'
    });

    batchTransport.log({ message: 'msg1' });
    batchTransport.log({ message: 'msg2' });
    batchTransport.log({ message: 'msg3' }); // Drops msg1

    expect(batchTransport.droppedCount).toBe(1);

    (batchTransport as any).flush();

    expect(mockTransport.logs.length).toBe(2);
    expect(mockTransport.logs.map((l: any) => l.message)).toEqual(['msg2', 'msg3']);
  });

  test('default highWaterMark is 1000', () => {
    batchTransport = new AsyncBatchTransport({
      target: mockTransport,
      batchSize: 5,
      flushIntervalMs: 1000,
      // No highWaterMark specified
      overflowPolicy: 'drop-newest',
    });

    // Add many entries, but less than 1000
    for (let i = 1; i <= 100; i++) {
      batchTransport.log({ message: `msg${i}` });
    }

    expect(batchTransport.droppedCount).toBe(0);
  });

  test('droppedCount accumulates over time', () => {
    batchTransport = new AsyncBatchTransport({
      target: mockTransport,
      batchSize: 10,
      flushIntervalMs: 1000,
      highWaterMark: 2,
      overflowPolicy: 'drop-oldest',
    });

    // First batch
    batchTransport.log({ message: 'msg1' });
    batchTransport.log({ message: 'msg2' });
    batchTransport.log({ message: 'msg3' }); // Drops msg1

    expect(batchTransport.droppedCount).toBe(1);

    (batchTransport as any).flush();
    mockTransport.clear();

    // Second batch
    batchTransport.log({ message: 'msg4' });
    batchTransport.log({ message: 'msg5' });
    batchTransport.log({ message: 'msg6' }); // Drops msg4
    batchTransport.log({ message: 'msg7' }); // Drops msg5

    expect(batchTransport.droppedCount).toBe(3); // Cumulative
  });

  test('immediate mode bypasses backpressure', () => {
    batchTransport = new AsyncBatchTransport({
      target: mockTransport,
      batchSize: 5,
      flushIntervalMs: 1000,
      immediate: true,
      highWaterMark: 2,
      overflowPolicy: 'drop-oldest',
    });

    // All entries should go directly to target, bypassing buffer
    for (let i = 1; i <= 5; i++) {
      batchTransport.log({ message: `msg${i}` });
    }

    expect(batchTransport.droppedCount).toBe(0);
    expect(mockTransport.logs.length).toBe(5);
  });

  test('flush drains buffer respecting batchSize', () => {
    batchTransport = new AsyncBatchTransport({
      target: mockTransport,
      batchSize: 3,
      flushIntervalMs: 1000,
      highWaterMark: 10,
    });

    // Add 7 entries - auto-flush happens at 3 and 6
    for (let i = 1; i <= 7; i++) {
      batchTransport.log({ message: `msg${i}` });
    }

    // Auto-flush happened twice (at items 3 and 6), so 6 items already flushed
    expect(mockTransport.logs.length).toBe(6);

    // Manual flush gets the remaining 1
    (batchTransport as any).flush();
    expect(mockTransport.logs.length).toBe(7);
  });

  test('auto-flush triggered by batchSize', () => {
    batchTransport = new AsyncBatchTransport({
      target: mockTransport,
      batchSize: 3,
      flushIntervalMs: 5000,
      highWaterMark: 10,
    });

    // Add exactly batchSize entries
    batchTransport.log({ message: 'msg1' });
    batchTransport.log({ message: 'msg2' });
    batchTransport.log({ message: 'msg3' });

    // Should auto-flush immediately
    expect(mockTransport.logs.length).toBe(3);
  });

  test('auto-flush triggered by timer', () => {
    batchTransport = new AsyncBatchTransport({
      target: mockTransport,
      batchSize: 10,
      flushIntervalMs: 1000,
      highWaterMark: 20,
    });

    // Add fewer than batchSize entries
    batchTransport.log({ message: 'msg1' });
    batchTransport.log({ message: 'msg2' });

    // Not flushed yet
    expect(mockTransport.logs.length).toBe(0);

    // Advance timer
    jest.advanceTimersByTime(1000);

    // Should be flushed now
    expect(mockTransport.logs.length).toBe(2);
  });

  test('close flushes remaining buffer', () => {
    batchTransport = new AsyncBatchTransport({
      target: mockTransport,
      batchSize: 10,
      flushIntervalMs: 5000,
      highWaterMark: 20,
    });

    // Add some entries
    batchTransport.log({ message: 'msg1' });
    batchTransport.log({ message: 'msg2' });

    // Close should flush
    batchTransport.close();

    expect(mockTransport.logs.length).toBe(2);
  });

  test('logs after close are ignored', () => {
    batchTransport = new AsyncBatchTransport({
      target: mockTransport,
      batchSize: 5,
      flushIntervalMs: 1000,
      highWaterMark: 10,
    });

    batchTransport.log({ message: 'msg1' });
    batchTransport.close();
    batchTransport.log({ message: 'msg2' }); // Should be ignored

    (batchTransport as any).flush();

    expect(mockTransport.logs.length).toBe(1);
    expect((mockTransport.logs[0] as any).message).toBe('msg1');
  });

  test('stress test with high volume and drop-oldest', () => {
    batchTransport = new AsyncBatchTransport({
      target: mockTransport,
      batchSize: 100, // Large batch to prevent auto-flush
      flushIntervalMs: 100,
      highWaterMark: 50,
      overflowPolicy: 'drop-oldest',
    });

    // Simulate high-volume logging (more than highWaterMark)
    for (let i = 1; i <= 200; i++) {
      batchTransport.log({ message: `msg${i}`, index: i });
    }

    // Should have dropped 150 items (200 - 50 highWaterMark)
    expect(batchTransport.droppedCount).toBe(150);

    // Flush all
    while ((batchTransport as any).buffer.length > 0) {
      (batchTransport as any).flush();
    }

    // Verify we kept the most recent entries
    const logged = mockTransport.logs as Array<{ message: string; index: number }>;
    const lastIndex = logged[logged.length - 1]?.index;
    
    // Last logged entry should be 200 (most recent)
    expect(lastIndex).toBe(200);
    expect(logged.length).toBe(50); // Only highWaterMark items kept
    expect(logged.length + batchTransport.droppedCount).toBe(200);
  });
});
