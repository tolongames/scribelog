// test/logger.test.ts
import {
  createLogger,
  Scribelog,
  Logger,
  LogInfo,
  Transport,
  format
} from '../src/index';
import chalk from 'chalk';
import process from 'process';
import { _internalExit } from '../src/utils';

jest.mock('../src/utils', () => ({
  _internalExit: jest.fn((_code?: number): never => undefined as never),
}));

type LogEntryInput = Omit<LogInfo, 'timestamp' | 'level' | 'message'> & Partial<Pick<LogInfo, 'level' | 'message' | 'splat'>> & { timestamp?: Date };

// Suite 1: Logger Core & Transports
describe('Logger Core with Transports', () => {
let logger: Logger;
let mockTransport: Transport;
let transportLogSpy: jest.SpyInstance;
beforeEach(() => { mockTransport = { log: jest.fn() }; transportLogSpy = jest.spyOn(mockTransport, 'log'); logger = createLogger({ transports: [mockTransport] }); chalk.level = 0; });
afterEach(() => { transportLogSpy.mockRestore(); chalk.level = chalk.supportsColor ? chalk.supportsColor.level : 0; });

// ... (testy 'create instance'...'metadata' bez zmian) ...
  it('should create a logger instance', () => { /*...*/ });
  it('should have default level "info"', () => { /*...*/ });
  it('should call transport.log for level "error" using .error()', () => { /*...*/ });
  it('should call transport.log for level "warn" using .warn()', () => { /*...*/ });
  it('should call transport.log for level "info" using .info()', () => { /*...*/ });
  it('should NOT call transport.log for levels below logger level (e.g., http)', () => { /*...*/ });
  it('should NOT call transport.log for levels below logger level (e.g., debug)', () => { /*...*/ });
  it('should call transport.log when logger level allows it', () => { /*...*/ });
  it('should respect transport-specific level', () => { /*...*/ });
  it('should pass default metadata to transport', () => { /*...*/ });
  it('should pass call-specific metadata to transport', () => { /*...*/ });
  it('should pass merged metadata to transport', () => { /*...*/ });
  it('should call transport.log via logEntry method with timestamp', () => { /*...*/ });
  it('should call transport.log via logEntry method WITHOUT timestamp', () => { /*...*/ });
  it('should pass merged meta via logEntry method to transport', () => { /*...*/ });


// --- Testy Splat ---
it('should handle printf-style formatting using splat', () => { /* OK */ });
it('should handle splat arguments with metadata object at the end', () => { /* OK */ });
it('should NOT interpolate message if no format specifiers are present', () => { /* OK */ });

 it('should handle Error object as the message with splat arguments', () => {
  const err = new Error("Splat Error %s");
  err.stack = "Fake splat stack";
  logger.error(err, 'details', { id: 1 }); // error >= info
  expect(transportLogSpy).toHaveBeenCalledTimes(1);
  const callArg = transportLogSpy.mock.calls[0][0] as string;
  expect(callArg).toContain('[ERROR]: Splat Error details'); // Sformatowana wiadomość OK

  // --- POCZĄTEK POPRAWKI: Sprawdź tylko meta przekazane w wywołaniu ---
  // Sprawdź, czy zawiera TYLKO metadane z wywołania ({ id: 1 }) sformatowane przez inspect
  expect(callArg).toContain("{ id: 1 }");
  // Upewnij się, że NIE zawiera errorName w części meta
  expect(callArg).not.toContain("errorName: 'Error'");
  // --- KONIEC POPRAWKI ---

  expect(callArg).toContain("\nFake splat stack"); // Stack w nowej linii OK
});

}); // Koniec describe 'Logger Core with Transports'


// Suite 2: Logger Formatting
describe('Logger Formatting', () => {
  let mockTransport: Transport;
  let transportLogSpy: jest.SpyInstance;
  let logger: Logger;
  beforeEach(() => { /*...*/ });
  afterEach(() => { /*...*/ });

  // ... (testy 'default simple', 'basic json', etc. BEZ ZMIAN) ...
  it('should use default simple format (defaultSimpleFormat)', () => { /*...*/ });
  it('should use basic json format when specified', () => { /*...*/ });
  it('should use combined format (e.g., defaultJsonFormat)', () => { /*...*/ });
  it('should allow transport-specific format', () => { /*...*/ });
  it('should format object output from logger format using transport default', () => { /*...*/ });
  it('should apply colors using simple format when TTY is detected (mocked)', () => { /*...*/ });
  it('should NOT apply colors using simple format when colors are disabled', () => { /*...*/ });
  it('should NOT apply colors using simple format when TTY is not detected (mocked)', () => { /*...*/ });
  it('ConsoleTransport should pass TTY info to simple format', () => { /*...*/ });
  it('timestamp format should use ISO by default', () => { /*...*/ });
  it('timestamp format should use custom format string (date-fns)', () => { /*...*/ });
  it('timestamp format should use custom format function', () => { /*...*/ });
  it('timestamp format should use custom alias', () => { /*...*/ });

  // --- Testy Splat Format ---
  it('should apply splat before json format', () => { /* OK */ });
  it('should allow splat formatter to be used explicitly and return only message', () => { /* OK */ });

}); // Koniec describe 'Logger Formatting'

// Suite 3: Child Loggers (bez zmian)
describe('Child Loggers', () => { /* ... */ });

// Suite 4: Error Handling (bez zmian)
describe('Error Handling', () => { /* ... */ });