# Scribelog 🪵📝

[![npm version](https://img.shields.io/npm/v/scribelog.svg)](https://www.npmjs.com/package/scribelog) <!-- This should update automatically -->
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Build Status](https://github.com/tolongames/scribelog/actions/workflows/node.js.yml/badge.svg)](https://github.com/tolongames/scribelog/actions/workflows/node.js.yml) <!-- Add your GitHub Actions badge URL -->
<!-- Add other badges if you have them (e.g., coverage) -->

**Scribelog** is an advanced, highly configurable logging library for Node.js applications, written in TypeScript. It offers flexible formatting, support for multiple destinations (transports), child loggers, and automatic error catching, aiming for a great developer experience.

---

## ✨ Key Features

*   **Standard Logging Levels:** Uses familiar levels (`error`, `warn`, `info`, `http`, `verbose`, `debug`, `silly`).
*   **Highly Flexible Formatting:** Combine powerful formatters (`simple`, `json`, `timestamp`, `metadata`, `errors`, etc.) using a composable API (`format.combine`). Customize timestamps, include/exclude metadata, and more.
*   **Console Color Support:** Automatic, readable colorization for the `simple` format in TTY environments.
*   **Multiple Transports:** Log to different destinations. Comes with a built-in `ConsoleTransport`. (File transport planned!).
*   **Child Loggers:** Easily create contextual loggers (`logger.child({...})`) that inherit settings but add specific metadata (like `requestId`).
*   **Automatic Error Handling:** Optionally catch and log `uncaughtException` and `unhandledRejection` events, including stack traces.
*   **TypeScript First:** Written entirely in TypeScript for type safety and excellent editor autocompletion.

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
import { createLogger } from 'scribelog';

// Create a logger with default settings:
// - Level: 'info'
// - Format: Simple, colored output to console
// - Transport: Console
const logger = createLogger();

// Log messages at different levels
logger.info('Application started successfully.');
logger.warn('Warning: Cache memory usage high.', { usage: '85%' });

// Pass an Error object directly or in metadata
const dbError = new Error('Database connection timeout');
(dbError as any).code = 'DB_TIMEOUT'; // Add custom properties
logger.error(dbError); // Logs the error message and stack trace
logger.info('Operation completed', { user: 'admin', durationMs: 120 });

// Debug logs won't appear by default (level 'info')
logger.debug('Detailed step for debugging.');
```

**Example Output (Simple Format with Colors):**

```bash
# (Timestamp will be gray, [INFO] green, [WARN] yellow, [ERROR] red)
2024-05-01T10:00:00.123Z [INFO]: Application started successfully.
2024-05-01T10:00:01.456Z [WARN]: Warning: Cache memory usage high. { usage: '85%' }
2024-05-01T10:00:02.789Z [ERROR]: Database connection timeout { errorName: 'Error', code: 'DB_TIMEOUT' }
Error: Database connection timeout
    at <anonymous>:10:17
    ... (stack trace) ...
2024-05-01T10:00:03.111Z [INFO]: Operation completed { user: 'admin', durationMs: 120 }
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

**Example: Creating a JSON logger for production**

```ts
import { createLogger, format, transports } from 'scribelog';

const prodLogger = createLogger({
  level: 'info', // Only log info and above in production
  format: format.defaultJsonFormat, // Use the predefined JSON format
  transports: [
    new transports.Console({
      // Console specific options can go here if needed
      // e.g., level: 'info' (though logger level already covers this)
    }),
    // In the future, you might add a FileTransport here:
    // new transports.File({ filename: 'app.log', level: 'warn' })
  ],
  defaultMeta: {
    environment: 'production',
    region: process.env.AWS_REGION || 'unknown',
  },
  // Handle critical errors in production
  handleExceptions: true,
  handleRejections: true,
  // exitOnError: true // Default is true, ensures app exits on fatal errors
});

prodLogger.info('Production logger initialized.');
prodLogger.error(new Error('Critical configuration error!'));
```

---

## 📊 Logging Levels

Scribelog uses standard `npm` logging levels (ordered from most to least severe):

```text
error: 0
warn: 1
info: 2
http: 3
verbose: 4
debug: 5
silly: 6
```

Setting the `level` option filters messages *at or above* the specified severity. `level: 'info'` logs `info`, `warn`, and `error`. `level: 'debug'` logs everything.

---

## 🎨 Formatting

Formatters transform the log `info` object before it reaches transports. Use `format.combine(...)` to chain them.

**How it Works:**
`createLogger` -> `log()`/`logEntry()` -> Creates `LogInfo` object -> Passes to `format` function -> `format` function applies its chain -> Result (string or object) passed to `transport.log()`.

### Available Formatters

*   **`format.timestamp(options?)`**: Adds/formats a timestamp.
    *   `alias?: string`: Key for the formatted timestamp (default: `'timestamp'`).
    *   `format?: string | ((date: Date) => string)`: `date-fns` format string or custom function (default: ISO 8601).
    ```ts
    format.timestamp({ format: 'yyyy-MM-dd HH:mm:ss' }) // -> '2024-05-01 10:30:00'
    format.timestamp({ alias: '@timestamp' }) // -> Adds {'@timestamp': '...'}
    ```
*   **`format.level(options?)`**: Adds the log level string.
    *   `alias?: string`: Key for the level (default: `'level'`).
*   **`format.message(options?)`**: Adds the log message string.
    *   `alias?: string`: Key for the message (default: `'message'`).
*   **`format.errors(options?)`**: Extracts info from an `Error` object (expected at `info.error`). Adds `errorName`, `stack?`, `originalReason?` and potentially other error properties. Sets `info.message` to `error.message` if `info.message` was empty. Removes the original `info.error`.
    *   `stack?: boolean`: Include stack trace (default: `true`).
*   **`format.metadata(options?)`**: Gathers all remaining properties into the main object or under an alias. Excludes standard fields (`level`, `message`, `timestamp`, etc.) and error fields (`stack`, `errorName`, etc.).
    *   `alias?: string`: If provided, nest metadata under this key.
    *   `exclude?: string[]`: Array of additional keys to exclude from metadata.
*   **`format.json(options?)`**: **Terminal Formatter.** Serializes the final `info` object to a JSON string.
    *   `space?: string | number`: Pretty-printing spaces for `JSON.stringify`.
*   **`format.simple(options?)`**: **Terminal Formatter.** Creates a human-readable, colored (if TTY) string. Includes `timestamp`, `level`, `message`, `{ metadata }`, and `stack` (on a new line).
    *   `colors?: boolean`: Force colors on or off (default: auto-detect).

### Combining Formatters (`format.combine`)

The order matters! Formatters run sequentially, modifying the `info` object. Terminal formatters (`json`, `simple`) should usually be last.

```ts
import { createLogger, format } from 'scribelog';

// Example: Log only level, message, and custom timestamp
const minimalFormat = format.combine(
    format.timestamp({ format: 'HH:mm:ss.SSS' }),
    format.level(),
    format.message(),
    // No metadata() or errors()
    format.simple() // Simple will only use timestamp, level, message
);
const minimalLogger = createLogger({ format: minimalFormat });
minimalLogger.info('Minimal log', { extra: 'this will be ignored'});
// Output: 10:45:00.123 [INFO]: Minimal log

// Example: JSON output with specific fields and nested metadata
const customJsonFormat = format.combine(
    format.errors({ stack: false }), // Include basic error info, no stack
    format.timestamp({ alias: '@ts' }),
    format.level({ alias: 'severity' }),
    format.message(),
    format.metadata({ alias: 'data' }), // Nest other data under 'data'
    format.json()
);
const customJsonLogger = createLogger({ format: customJsonFormat });
customJsonLogger.warn('Warning with nested meta', { user: 'test', id: 1 });
// Output: {"@ts":"...","severity":"warn","message":"Warning with nested meta","data":{"user":"test","id":1}}
```

### Predefined Formats

*   `format.defaultSimpleFormat`: Equivalent to `combine(errors(), timestamp(), level(), message(), metadata(), simple())`. **This is the default format for `createLogger`.**
*   `format.defaultJsonFormat`: Equivalent to `combine(errors(), timestamp(), level(), message(), metadata(), json())`.

---

## 📤 Transports

Define log destinations. You can use multiple transports.

### `transports.Console(options?: ConsoleTransportOptions)`

Logs to `process.stdout` or `process.stderr`.

*   `level?: string`: Minimum level for this specific transport. Overrides the logger's level if more restrictive (e.g., logger 'debug', transport 'info' -> transport logs 'info' and above).
*   `format?: LogFormat`: Specific format for this transport. Overrides the logger's format.
*   `useStdErrLevels?: string[]`: Array of levels to direct to `stderr` (default: `['error']`).

**Example: Separate Info and Error Streams**

```ts
import { createLogger, format, transports } from 'scribelog';

const logger = createLogger({
  level: 'info', // Logger handles info and above
  transports: [
    // Log INFO and WARN to stdout using simple format
    new transports.Console({
      level: 'warn', // Catches info and warn from logger
      format: format.simple({ colors: true }),
      useStdErrLevels: [], // Ensure nothing goes to stderr from here
    }),
    // Log only ERRORs to stderr using JSON format
    new transports.Console({
      level: 'error', // Catches only error from logger
      format: format.json(),
      useStdErrLevels: ['error'] // Explicitly send errors to stderr
    })
  ]
});

logger.info('User logged in');   // Goes to first console (stdout, simple)
logger.warn('Disk space low');  // Goes to first console (stdout, simple)
logger.error(new Error('DB Error')); // Goes to BOTH (stdout simple, stderr JSON)
logger.debug('Should not appear'); // Ignored by logger level
```

---

## 🌱 Child Loggers

Create contextual loggers using `logger.child(defaultMeta)`. They inherit settings but automatically add the specified metadata.

```ts
import { createLogger } from 'scribelog';

const baseLogger = createLogger({ level: 'debug', defaultMeta: { app: 'my-api' } });

function processUserData(userId: string) {
  const userLogger = baseLogger.child({ userId }); // Inherits level, format, transports
                                                  // Adds { userId: '...' }

  userLogger.debug('Starting data processing');
  // ...
  userLogger.info('Data processed');
  // Logs will include { app: 'my-api', userId: '...' }
}

function processAdminTask(adminId: string) {
    const adminLogger = baseLogger.child({ adminId, scope: 'admin' });
    adminLogger.info('Performing admin task');
     // Logs will include { app: 'my-api', adminId: '...', scope: 'admin' }
}

processUserData('user-77');
processAdminTask('admin-01');
```

---

## 🛠️ Error Handling

Set `handleExceptions: true` and/or `handleRejections: true` in `createLogger` options to automatically log fatal errors.

```ts
import { createLogger } from 'scribelog';

const logger = createLogger({
  level: 'info',
  format: format.defaultJsonFormat, // Log errors as JSON
  handleExceptions: true,
  handleRejections: true,
  exitOnError: true // Default: Exit after logging fatal error
});

logger.info('Application running with error handlers.');

// This would cause the logger to log the error and exit:
// throw new Error('Something broke badly!');

// This would also cause logging and exit:
// Promise.reject('Unhandled promise rejection reason');
```

The logger adds `{ exception: true, eventType: '...', errorName: '...', stack: '...' }` to the log metadata for these events.

---

## 📚 Future Work

*   **File Transport:** Adding `FileTransport` with log rotation (size, date).
*   **More Formatters:** `splat`/`printf`, potentially customizable color themes.
*   **Custom Levels:** Allowing users to define their own logging levels.
*   **Async Handling:** Better guarantees for transports finishing writes before `exitOnError`.

---

## 🤝 Contributing

Contributions are welcome! Please feel free to submit issues and pull requests.

*(Consider adding contribution guidelines)*

---

## 📄 License

MIT License
Copyright (c) 2024 Tolan Games *(Zmień na swoje)*
See [LICENSE](./LICENSE) for details.