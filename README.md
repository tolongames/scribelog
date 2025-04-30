
# Scribelog 🪵📝

[![npm version](https://img.shields.io/npm/v/scribelog.svg)](https://www.npmjs.com/package/scribelog)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Build Status](https://github.com/tolongames/scribelog/actions/workflows/node.js.yml/badge.svg)](https://github.com/tolongames/scribelog/actions/workflows/node.js.yml)
<!-- Add other badges if you have them (e.g., coverage) -->

**Scribelog** is an advanced, highly configurable logging library for Node.js applications, written in TypeScript. It offers flexible formatting, support for multiple destinations (transports), child loggers, automatic error catching, and printf-style interpolation, aiming for a great developer experience.

---

## ✨ Key Features

*   **Standard Logging Levels:** Uses familiar levels (`error`, `warn`, `info`, `http`, `verbose`, `debug`, `silly`).
*   **Highly Flexible Formatting:** Combine powerful formatters (`simple`, `json`, `timestamp`, `metadata`, `errors`, `splat`, etc.) using a composable API (`format.combine`). Customize timestamps, include/exclude metadata, and more.
*   **Printf-Style Logging:** Use `printf`-like placeholders (`%s`, `%d`, `%j`) for easy message interpolation.
*   **Console Color Support:** Automatic, readable colorization for the `simple` format in TTY environments.
*   **Multiple Transports:** Log to different destinations. Built-in `ConsoleTransport` and `FileTransport` with rotation options.
*   **Child Loggers:** Easily create contextual loggers (`logger.child({...})`) that inherit settings but add specific metadata (like `requestId`).
*   **Automatic Error Handling:** Optionally catch and log `uncaughtException` and `unhandledRejection` events, including stack traces.
*   **TypeScript First:** Written entirely in TypeScript for type safety and excellent editor autocompletion.

**Explore all features in the [Full Documentation](./DOCUMENTATION.md)!** ⬅

---

## 📦 Installation

```bash
npm install scribelog
# or
yarn add scribelog
# or
pnpm add scribelog
```

---

## 🚀 Basic Usage

```ts
// Import necessary functions and types
import { createLogger, format, transports } from 'scribelog';

// Create a logger with default settings:
// - Level: 'info'
// - Format: Simple, colored output to console (defaultSimpleFormat)
// - Transport: Console
const logger = createLogger();

// Standard logging
logger.info('Application started successfully.');
logger.warn('Warning: Cache memory usage high.', { usage: '85%' }); // With metadata

// Printf-style formatting (using the default format's built-in splat())
const username = 'Alice';
const userId = 123;
logger.info('User %s (ID: %d) logged in.', username, userId);

// Correct way to log Errors (pass error object in metadata)
const dbError = new Error('Database connection timeout');
(dbError as any).code = 'DB_TIMEOUT'; // Add custom properties
logger.error('Database Error Occurred', { error: dbError }); // format.errors() will process this

// Log to a file in JSON format
const fileLogger = createLogger({
  level: 'debug', // Log more details to the file
  transports: [
    new transports.File({
      filename: 'app-%DATE%.log', // Filename pattern (date-fns)
      interval: '1d', // Rotate daily
      path: './logs',   // Store logs in a 'logs' subfolder
      compress: 'gzip', // Compress rotated files
      maxFiles: 7,      // Keep 7 days of logs
      format: format.defaultJsonFormat // Log as JSON to the file
    })
  ]
});

fileLogger.debug('Writing detailed debug log to file.', { data: { complex: true }});
fileLogger.info('User action logged to file.', { userId: 456 });
```

**Example Console Output (Default Simple Format with Colors):**

```bash
# (Timestamps gray, Levels colored, Metadata inspected)
2024-05-01T10:00:00.123Z [INFO]: Application started successfully.
2024-05-01T10:00:01.456Z [WARN]: Warning: Cache memory usage high. { usage: '85%' }
2024-05-01T10:00:01.890Z [INFO]: User Alice (ID: 123) logged in.
2024-05-01T10:00:02.789Z [ERROR]: Database connection timeout { exception: true, eventType: undefined, errorName: 'Error', code: 'DB_TIMEOUT' }
Error: Database connection timeout
    at <anonymous>:10:17
    ... (stack trace) ...
```

---

## ⚙️ Configuration

Create and configure your logger using `createLogger(options?: LoggerOptions)`.

**`LoggerOptions` Interface:**

| Option              | Type                         | Default                    | Description                                                                 |
| :------------------ | :--------------------------- | :------------------------- | :-------------------------------------------------------------------------- |
| `level`             | `string`                     | `'info'`                   | Minimum level to log (e.g., 'debug', 'warn').                               |
| `format`            | `LogFormat`                  | `format.defaultSimpleFormat` | Default formatter pipeline for the logger.                                    |
| `transports`        | `Transport[]`                | `[new transports.Console()]` | Array of transport instances (where to send logs).                          |
| `defaultMeta`       | `Record<string, any>`        | `undefined`                | Metadata automatically included in all logs from this instance.             |
| `handleExceptions`  | `boolean`                    | `false`                    | Catch and log `uncaughtException` events.                                   |
| `handleRejections`  | `boolean`                    | `false`                    | Catch and log `unhandledRejection` events.                                  |
| `exitOnError`       | `boolean`                    | `true`                     | If handling exceptions/rejections, exit process (`process.exit(1)`) after logging. |

**Example: Advanced Configuration**

```ts
import { createLogger, format, transports, LogLevel } from 'scribelog';

// Helper function to safely get log level from environment
function getLogLevel(): LogLevel { /* ... (implementation from previous example) ... */ }

const advancedLogger = createLogger({
  level: getLogLevel(),
  format: format.combine( // Custom format pipeline
    format.errors({ stack: true }),
    format.splat(), // Apply splat formatting early
    format.timestamp({ format: 'isoDateTime' }), // Use date-fns named format
    format.level(),
    format.message(),
    format.metadata({ alias: 'context' }), // Nest metadata
    format.json() // Output as JSON
  ),
  transports: [
    // Log info and above to console with simple format
    new transports.Console({
      level: 'info',
      format: format.defaultSimpleFormat // Override main format
    }),
    // Log everything to a rotating file
    new transports.File({
      filename: '/var/log/my-app/app.log',
      level: 'debug', // Log everything to file
      // format: // Inherits the JSON format from the logger
      size: '10M', // Rotate after 10 MB
      maxFiles: 5, // Keep 5 rotated files
      compress: 'gzip'
    })
  ],
  defaultMeta: {
    service: 'advanced-service',
    pid: process.pid,
  },
  handleExceptions: true,
  handleRejections: true,
  exitOnError: false // Don't exit automatically
});

advancedLogger.info('Advanced logger ready.');
advancedLogger.debug('This goes only to the file transport as JSON.');
advancedLogger.error('An error occurred!', { error: new Error("Config read failed"), critical: true });
```

---

## 📊 Logging Levels

(Content is the same as before - list of levels and explanation)

```text
error: 0, warn: 1, info: 2, http: 3, verbose: 4, debug: 5, silly: 6
```
---

## 🎨 Formatting

Formatters transform the log `info` object. Chain them using `format.combine(...)`. The order matters!

**How it Works:**
`log(msg, ...args)` -> Creates `LogInfo { message, splat?, ... }` -> Passes to `format` -> `combine` applies chain -> Result passed to `transport.log()`.

### Available Formatters

*   **`format.timestamp(options?)`**: Adds/formats a timestamp (default: ISO).
    *   `alias?: string` (default: `'timestamp'`)
    *   `format?: string | ((date: Date) => string)` (`date-fns` format or function).
*   **`format.level(options?)`**: Adds the log level string.
    *   `alias?: string` (default: `'level'`).
*   **`format.message(options?)`**: Adds the log message string (after potential `splat` formatting).
    *   `alias?: string` (default: `'message'`).
*   **`format.splat()`**: Interpolates the `message` string using `util.format` and arguments found in `info.splat`. Place **after** `errors()` but **before** `message()` and `metadata()`.
*   **`format.errors(options?)`**: Extracts info from an `Error` object (expected at `info.error`). Adds `errorName`, `stack?`, etc. Place **early** in the chain.
    *   `stack?: boolean` (default: `true`).
*   **`format.metadata(options?)`**: Gathers remaining properties. Excludes standard fields (`level`, `message`, `timestamp`, etc.) and error fields.
    *   `alias?: string`: Nest metadata under this key.
    *   `exclude?: string[]`: Additional keys to exclude.
*   **`format.json(options?)`**: **Terminal.** Serializes `info` to JSON.
    *   `space?: string | number`: Pretty-print spaces.
*   **`format.simple(options?)`**: **Terminal.** Creates a human-readable string (colored if TTY). Includes `timestamp`, `level`, `message`, `{ metadata }`, and `stack` (new line).
    *   `colors?: boolean`: Force colors (default: auto-detect).

### Combining Formatters (`format.combine`)

```ts
import { createLogger, format } from 'scribelog';

// Example: Simple format with printf-style interpolation first
const printfSimpleFormat = format.combine(
    format.splat(), // Apply interpolation first
    format.errors({ stack: false }),
    format.timestamp({ format: 'HH:mm:ss' }),
    format.level(),
    format.message(), // Will use the result from splat()
    format.metadata(),
    format.simple()
);
const printfLogger = createLogger({ format: printfSimpleFormat });
printfLogger.info('User %s logged in (ID: %d)', 'Bob', 42, { ip: '127.0.0.1' });
// Output: 11:22:33 [INFO]: User Bob logged in (ID: 42) { ip: '127.0.0.1' }
```

### Predefined Formats

*   `format.defaultSimpleFormat`: `combine(errors(stack), splat(), timestamp(), level(), message(), metadata(), simple())`. **Default for `createLogger`.**
*   `format.defaultJsonFormat`: `combine(errors(stack), splat(), timestamp(), level(), message(), metadata(), json())`.

---

## 📤 Transports

Define log destinations.

### `transports.Console(options?: ConsoleTransportOptions)`

Logs to `process.stdout` / `process.stderr`.

*   `level?: string`: Transport-specific minimum level.
*   `format?: LogFormat`: Transport-specific format.
*   `useStdErrLevels?: string[]`: Levels to log to `stderr` (default: `['error']`).

### `transports.File(options: FileTransportOptions)`

Logs to a rotating file using [`rotating-file-stream`](https://github.com/iccicci/rotating-file-stream).

*   `filename: string`: Path/name of the log file (required). Can include date patterns like `%DATE%`.
*   `level?: string`: Transport-specific minimum level.
*   `format?: LogFormat`: Transport-specific format (defaults to `format.defaultJsonFormat`).
*   `size?: string`: Max file size before rotation (e.g., `'10M'`).
*   `interval?: string`: Rotation interval (e.g., `'1d'`, `'2h'`).
*   `path?: string`: Directory for rotated/archived files.
*   `compress?: string | boolean`: Compress rotated files (`'gzip'` or `true`).
*   `maxFiles?: number`: Max number of rotated files to keep.
*   `maxSize?: string`: Max total size of all log files.
*   `createPath?: boolean`: Create log directory if it doesn't exist (default: `true`).
*   `fsWriteStreamOptions?: object`: Options passed to `fs.createWriteStream`.
*   *(See `rotating-file-stream` docs for more options like `utc`, generators)*

**Example: Logging to Console and File**

```ts
import { createLogger, format, transports } from 'scribelog';

const fileAndConsoleLogger = createLogger({
  level: 'debug',
  transports: [
    // Console for immediate feedback (info and above)
    new transports.Console({
      level: 'info',
      format: format.simple({ colors: true })
    }),
    // File for detailed logs (debug and above, JSON)
    new transports.File({
      filename: 'app-debug.log',
      level: 'debug',
      format: format.defaultJsonFormat,
      size: '5M', // Rotate every 5MB
      maxFiles: 3
    })
  ]
});

fileAndConsoleLogger.debug('Detailed info only in file');
fileAndConsoleLogger.info('General info in console and file');
fileAndConsoleLogger.error('Error in console and file', { error: new Error('Failure') });
```

---

## 🌱 Child Loggers

```ts
import { createLogger } from 'scribelog';

const baseLogger = createLogger({ level: 'debug', defaultMeta: { app: 'my-api' } });

function processUserData(userId: string) {
  // Create a logger specific to this user's context
  const userLogger = baseLogger.child({ userId, module: 'userProcessing' });

  userLogger.debug('Starting data processing'); // Includes { app: 'my-api', userId: '...', module: '...' }
  // ...
  userLogger.info('Data processed');
}

function processAdminTask(adminId: string) {
    // Create a logger for admin tasks
    const adminLogger = baseLogger.child({ adminId, scope: 'admin' });
    adminLogger.info('Performing admin task');
}

processUserData('user-77');
processAdminTask('admin-01');
```

---

## 🛠️ Error Handling

Set `handleExceptions: true` and/or `handleRejections: true` in `createLogger` options to automatically log fatal errors.

```ts
import { createLogger, format } from 'scribelog';

const logger = createLogger({
  level: 'info',
  format: format.defaultJsonFormat, // Log errors as JSON for easier parsing
  handleExceptions: true,
  handleRejections: true,
  exitOnError: true // Default behavior: Exit after logging fatal error
});

logger.info('Application running with error handlers.');

// Example of what would be caught:
// setTimeout(() => { throw new Error('Something broke badly!'); }, 50);
// Output (JSON): {"level":"error","message":"Something broke badly!","timestamp":"...","exception":true,"eventType":"uncaughtException","errorName":"Error","stack":"..."}
// ... and process exits

// Example of what would be caught:
// Promise.reject('Unhandled promise rejection reason');
// Output (JSON): {"level":"error","message":"Unhandled promise rejection reason","timestamp":"...","exception":true,"eventType":"unhandledRejection","errorName":"Error","stack":"...","originalReason":"..."}
// ... and process exits
```

The logger adds `{ exception: true, eventType: '...', ...errorDetails }` to the log metadata for these events, processed by the `format.errors()` formatter. Remember to have `format.errors()` in your format chain to see detailed error info.

---

## 💻 Showcase

You can run this script to see a demonstration of various Scribelog features in action.

<details>
<summary>Click to show/hide showcase.ts code</summary>

```ts
// showcase.ts
// Import everything needed from scribelog
import {
    createLogger,
    format,     // Object containing formatters
    transports, // Object containing transports
    Logger,     // Logger interface type
    LogLevel,   // Log level type ('info', 'debug', etc.)
    LogFormat,  // Formatter function type
    Transport,  // Transport interface type
    LoggerOptions // Configuration options type
} from 'scribelog'; // Import from your published package
// Import 'process' for PID access
import process from 'process';
// Import 'crypto' for generating unique IDs
import crypto from 'crypto';
// Import 'date-fns' for custom date formatting (used in one example)
import { format as formatDate } from 'date-fns';
// Import chalk to demonstrate color control (optional for user)
import chalk from 'chalk';

// --- MAIN DEMO FUNCTION ---
async function runShowcase() {
    console.log('\n===========================================');
    console.log('🚀 Scribelog Showcase - All Features Demo 🚀');
    console.log('===========================================\n');

    // === 1. Basic Configuration & Levels ===
    console.log('--- 1. Basic Configuration & Levels ---');
    const logger1 = createLogger({ level: 'debug' });
    logger1.info('Logger 1 (level: debug, format: simple)');
    logger1.warn('Warning from Logger 1');
    logger1.debug('Debug message from Logger 1 (should appear)');
    logger1.error('Error from Logger 1');

    // === 2. Different Formats ===
    console.log('\n--- 2. Different Formats ---');

    // 2a. JSON Format
    console.log('\n--- 2a. JSON Format ---');
    const logger2a = createLogger({ format: format.defaultJsonFormat, level: 'info' });
    logger2a.info('Log in JSON format.', { data: true, value: 123 });
    const jsonError = new Error("JSON Formatted Error");
    (jsonError as any).code = "E_JSON";
    logger2a.error('An error occurred (JSON)', { error: jsonError, user: 'admin' });

    // 2b. Custom Simple Format (Colored)
    console.log('\n--- 2b. Custom Simple Format (Colored) ---');
    const customSimpleFormat = format.combine(
        format.timestamp({ format: 'HH:mm:ss' }),
        format.level(),
        format.splat(), // Apply splat formatting
        format.message(),
        format.metadata({ exclude: ['pid'] }),
        format.errors({ stack: false }),
        format.simple({ colors: true })
    );
    const logger2b = createLogger({ format: customSimpleFormat, level: 'info' });
    const originalChalkLevel2b = chalk.level;
    chalk.level = 1; // Force colors
    logger2b.info('Custom simple format for %s', 'user', { pid: 12345, user: 'demo' }); // Use splat
    logger2b.error('Another error (custom simple)', { error: new Error("Simple format error")});
    chalk.level = originalChalkLevel2b; // Restore

    // 2c. Custom JSON Format with Aliases and Nesting
    console.log('\n--- 2c. Custom JSON Format (Aliases & Nesting) ---');
    const customJson = format.combine(
        format.errors({ stack: true }), // Handle errors first
        format.splat(),                 // Then splat
        format.timestamp({ alias: '@timestamp' }),
        format.level({ alias: 'severity' }),
        format.message(),
        format.metadata({ alias: 'details' }),
        format.json()
    );
    const logger2c = createLogger({ format: customJson, level: 'info' });
    logger2c.warn('Warn %s nested meta', 'with', { transactionId: 'xyz', status: 'WARN' }); // Use splat
    const nestedError = new Error("Nested Error");
    nestedError.stack = "Fake stack\n  at place";
    logger2c.error("Error with nested meta", { error: nestedError, code: 503 });


    // === 3. Multiple Transports ===
    console.log('\n--- 3. Multiple Transports ---');
    const originalChalkLevel3 = chalk.level;
    chalk.level = 0; // Disable colors for comparison
    const logger3 = createLogger({
        level: 'debug',
        transports: [
            new transports.Console({
                level: 'info',
                format: format.defaultSimpleFormat, // Contains splat()
                useStdErrLevels: ['error']
            }),
            new transports.Console({
                level: 'debug',
                format: format.defaultJsonFormat, // Contains splat()
                useStdErrLevels: ['warn', 'error']
            })
        ]
    });
    logger3.debug('Debug log: %s', 'JSON only');
    logger3.info('Info log: %s', 'Simple & JSON');
    logger3.warn('Warn log: %s', 'Simple(stdout) & JSON(stderr)');
    logger3.error('Error log: %s', 'Simple(stderr) & JSON(stderr)');
    chalk.level = originalChalkLevel3; // Restore

    // === 4. Loggery Potomne (child) ===
    console.log('\n--- 4. Child Loggers ---');
    const parentLogger = createLogger({
        level: 'debug',
        format: format.simple({ colors: false }), // Use simple, no colors
        defaultMeta: { service: 'MainService' }
    });
    parentLogger.info('Parent log.');
    const childLogger1 = parentLogger.child({ module: 'ModuleA' });
    childLogger1.info('Child 1 log for action: %s', 'read'); // Use splat
    const childLogger2 = childLogger1.child({ function: 'doWork', module: 'OverrideModule' });
    childLogger2.debug('Child 2 log (debug).', { value: 42 });

    // === 5. logEntry ===
    console.log('\n--- 5. logEntry Method ---');
    const entryLogger = createLogger({ level: 'http' });
    entryLogger.logEntry({
        level: 'http',
        message: 'Manual %s entry with custom data %j', // Add splat placeholders
        splat: ['log', { status: 201 }], // Provide splat data
        method: 'POST', url: '/api/users', statusCode: 201,
    });
    entryLogger.logEntry({ level: 'info', message: 'This info entry will also show' });

    // === 6. Obsługa wyjątków i odrzuceń (Symulacja) ===
    // (Keep this section as in the previous example, it doesn't need _internalExit mock)
    console.log('\n--- 6. Exception/Rejection Handling (Simulating real events) ---');
    const handleErrorsAndExit = false;
    let errorHandlingLogger: Logger | undefined = undefined;

    console.log(`Creating logger with handleExceptions/Rejections, exitOnError: ${handleErrorsAndExit}`);
    errorHandlingLogger = createLogger({
        level: 'debug',
        transports: [new transports.Console({ format: format.defaultSimpleFormat })],
        handleExceptions: true,
        handleRejections: true,
        exitOnError: handleErrorsAndExit
    });
    errorHandlingLogger.info(`Error handlers active (exitOnError: ${handleErrorsAndExit}).`);

    console.log("Simulating unhandled rejection (will be logged)...");
    Promise.reject("Simulated rejection reason (handled by logger)");

    console.log("Simulating uncaught exception in 100ms (will be logged)...");
    const exceptionTimer = setTimeout(() => {
        try { throw new Error("Simulated uncaught exception (handled by logger)"); }
        catch (e) { process.emit('uncaughtException', e as Error); }
        if (!handleErrorsAndExit && errorHandlingLogger && typeof (errorHandlingLogger as any).removeExceptionHandlers === 'function') {
            (errorHandlingLogger as any).removeExceptionHandlers();
            console.log("Error handlers removed for no-exit logger.");
        }
        console.log('\n--- Showcase Finished (Error Handlers Tested) ---');
    }, 100);

    if (!handleErrorsAndExit) {
      await new Promise(resolve => setTimeout(resolve, 300));
    } else {
        // If we expect exit, keep the process running briefly
        // This usually isn't needed as process.exit stops everything
        // await new Promise(resolve => setTimeout(resolve, 1500));
    }

} // End runShowcase

runShowcase().catch(e => {
    console.error("!!! Unexpected error running showcase:", e);
});
```

</details>

If you have any questions about scribelog or would like to know more about how to use any of the features. You can write to me on discord:
theonlytolon

---

## 📘 Documentation

For detailed documentation covering all features, configuration options, and advanced examples, please see the [**Full Documentation**](./DOCUMENTATION.md).

---

## 📚 Future Work

*   More built-in formatters (e.g., customizable color themes).
*   Ability to define custom logging levels.
*   Improved handling of asynchronous operations in transports (especially for `exitOnError`).

---

## 🤝 Contributing

Contributions are welcome! Please feel free to submit issues and pull requests. Check for any existing guidelines or open an issue to discuss larger changes.

---

## 📄 License

MIT License
Copyright (c) 2025 tolongames
See [LICENSE](./LICENSE) for details.