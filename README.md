# Scribelog 🪵📝

[![npm version](https://img.shields.io/npm/v/scribelog.svg)](https://www.npmjs.com/package/scribelog)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Build Status](https://github.com/tolongames/scribelog/actions/workflows/node.js.yml/badge.svg)](https://github.com/tolongames/scribelog/actions/workflows/node.js.yml)
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
// Import necessary functions and types
import { createLogger, format, transports } from 'scribelog';

// Create a logger with default settings:
// - Level: 'info'
// - Format: Simple, colored output to console (defaultSimpleFormat)
// - Transport: Console
const logger = createLogger();

// Log messages at different levels
logger.info('Application started successfully.');
logger.warn('Warning: Cache memory usage high.', { usage: '85%' }); // Add metadata

// --- Correct way to log Errors ---
// Pass a message string as the first argument,
// and the Error object in the metadata (typically under the 'error' key).
// The `format.errors()` formatter (included in defaults) will handle it.
const dbError = new Error('Database connection timeout');
(dbError as any).code = 'DB_TIMEOUT'; // You can add custom properties to errors
logger.error('Database Error Occurred', { error: dbError });

logger.info('Operation completed', { user: 'admin', durationMs: 120 });

// Debug logs won't appear with the default 'info' level
logger.debug('Detailed step for debugging.');

// --- Example with JSON format and debug level ---
const jsonLogger = createLogger({
  level: 'debug', // Log 'debug' and higher levels
  format: format.defaultJsonFormat, // Use predefined JSON format (includes errors, timestamp, etc.)
});

jsonLogger.debug('Debugging operation X', { operationId: 'op-xyz' });
// Example JSON Output:
// {"level":"debug","message":"Debugging operation X","timestamp":"...ISO_STRING...","operationId":"op-xyz"}
```

**Example Output (Default Simple Format with Colors):**

```bash
# (Timestamp will be gray, [INFO] green, [WARN] yellow, [ERROR] red)
2024-05-01T10:00:00.123Z [INFO]: Application started successfully.
2024-05-01T10:00:01.456Z [WARN]: Warning: Cache memory usage high. { usage: '85%' }
2024-05-01T10:00:02.789Z [ERROR]: Database connection timeout { exception: true, eventType: undefined, errorName: 'Error', code: 'DB_TIMEOUT' }
Error: Database connection timeout
    at <anonymous>:10:17
    ... (stack trace) ...
2024-05-01T10:00:03.111Z [INFO]: Operation completed { user: 'admin', durationMs: 120 }
```
*(Note: `eventType` is undefined here because the error wasn't logged via `handleExceptions`/`handleRejections`)*

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
  level: 'info', // Read level from environment or default to info
  format: format.defaultJsonFormat,      // Use predefined JSON format
  transports: [
    new transports.Console({
      // Console specific options if needed
    }),
    // Future: new transports.File({ filename: '/var/log/app.log', level: 'warn' })
  ],
  defaultMeta: {
    service: 'my-prod-service',
    pid: process.pid,
    // You can add more static metadata here
  },
  handleExceptions: true, // Recommended for production
  handleRejections: true, // Recommended for production
  // exitOnError: true    // Default, recommended for production
});

prodLogger.info('Production logger initialized.');
try {
  // Simulate an operation that might fail
  throw new Error('Critical configuration error!');
} catch (error) {
  // Log the caught error correctly
  prodLogger.error('Failed to apply configuration', { error: error as Error });
}

// Example of an unhandled rejection that would be caught if not caught here
// Promise.reject('Something failed asynchronously');
```

---

## 📊 Logging Levels

Scribelog uses standard `npm` logging levels (ordered from most to least severe):

```text
error: 0, warn: 1, info: 2, http: 3, verbose: 4, debug: 5, silly: 6
```

Setting the `level` option filters messages *at or above* the specified severity. `level: 'info'` logs `info`, `warn`, and `error`. `level: 'debug'` logs everything.

---

## 🎨 Formatting

Formatters transform the log `info` object before it reaches transports. Use `format.combine(...)` to chain them.

**How it Works:**
`createLogger` -> `log()`/`logEntry()` -> Creates `LogInfo` object -> Passes to `format` function -> `format` function applies its chain (`combine`) -> Result (string or object) passed to `transport.log()`.

### Available Formatters

*   **`format.timestamp(options?)`**: Adds/formats a timestamp.
    *   `alias?: string`: Key for the formatted timestamp (default: `'timestamp'`).
    *   `format?: string | ((date: Date) => string)`: `date-fns` format string or custom function (default: ISO 8601).
    ```ts
    format.timestamp({ format: 'yyyy-MM-dd HH:mm:ss' }) // -> Adds { timestamp: '2024-05-01 10:30:00' }
    format.timestamp({ alias: '@timestamp' })          // -> Adds { '@timestamp': '...ISO...' }
    ```
*   **`format.level(options?)`**: Adds the log level string.
    *   `alias?: string`: Key for the level (default: `'level'`).
*   **`format.message(options?)`**: Adds the log message string.
    *   `alias?: string`: Key for the message (default: `'message'`).
*   **`format.errors(options?)`**: Extracts info from an `Error` object (expected at `info.error`). Adds `errorName`, `stack?`, `originalReason?` and potentially other error properties to the `info` object. Sets `info.message` to `error.message` if `info.message` was empty. Removes the original `info.error` field. **Place this early in your `combine` chain.**
    *   `stack?: boolean`: Include stack trace (default: `true`).
*   **`format.metadata(options?)`**: Gathers all remaining properties into the main object or under an alias. Excludes standard fields added by other formatters (`level`, `message`, `timestamp`, `errorName`, `stack`, `exception`, `eventType` etc.).
    *   `alias?: string`: If provided, nest metadata under this key and remove original keys.
    *   `exclude?: string[]`: Array of additional keys to exclude from metadata collection.
*   **`format.json(options?)`**: **Terminal Formatter.** Serializes the final `info` object to a JSON string.
    *   `space?: string | number`: Pretty-printing spaces for `JSON.stringify`.
*   **`format.simple(options?)`**: **Terminal Formatter.** Creates a human-readable, colored (if TTY) string. Includes `timestamp`, `level`, `message`, `{ metadata }`, and `stack` (on a new line if present).
    *   `colors?: boolean`: Force colors on or off (default: auto-detect based on TTY).

### Combining Formatters (`format.combine`)

The order matters! Formatters run sequentially. Terminal formatters (`json`, `simple`) should be last.

```ts
import { createLogger, format } from 'scribelog';

// Example: Log only level, message, and custom timestamp in simple format
const minimalFormat = format.combine(
    // Note: errors() is not included here
    format.timestamp({ format: 'HH:mm:ss.SSS' }),
    format.level(),
    format.message(),
    // No metadata() - ignores other fields like { extra: '...' }
    format.simple() // simple() will only use timestamp, level, message
);
const minimalLogger = createLogger({ format: minimalFormat });
minimalLogger.info('Minimal log', { extra: 'this is ignored'});
// Output: 10:45:00.123 [INFO]: Minimal log

// Example: JSON output with specific fields and nested metadata
const customJsonFormat = format.combine(
    format.errors({ stack: false }),       // Include basic error info, no stack
    format.timestamp({ alias: '@ts' }),    // Rename timestamp field
    format.level({ alias: 'severity' }), // Rename level field
    format.message(),                      // Keep message field
    format.metadata({ alias: 'data' }),    // Nest other data under 'data'
    format.json()                          // Output as JSON
);
const customJsonLogger = createLogger({ format: customJsonFormat });
customJsonLogger.warn('Warning with nested meta', { user: 'test', id: 1 });
// Output: {"@ts":"...","severity":"warn","message":"Warning with nested meta","data":{"user":"test","id":1}}

const errorExample = new Error("Failed task");
(errorExample as any).details = { code: 500 };
customJsonLogger.error("Task failed", { error: errorExample });
// Output: {"@ts":"...", "severity":"error", "message":"Failed task", "errorName":"Error", "originalReason":undefined, "data":{"details":{"code":500}}}
```

### Predefined Formats

*   `format.defaultSimpleFormat`: Equivalent to `combine(errors({ stack: true }), timestamp(), level(), message(), metadata(), simple())`. **This is the default format for `createLogger`.**
*   `format.defaultJsonFormat`: Equivalent to `combine(errors({ stack: true }), timestamp(), level(), message(), metadata(), json())`.

---

## 📤 Transports

Define log destinations. You can use multiple transports.

### `transports.Console(options?: ConsoleTransportOptions)`

Logs to `process.stdout` or `process.stderr`.

*   `level?: string`: Minimum level for this specific transport. Filters logs *after* the main logger level filter.
*   `format?: LogFormat`: Specific format for this transport. Overrides the logger's format.
*   `useStdErrLevels?: string[]`: Array of levels to direct to `stderr` (default: `['error']`).

**Example: Separate Info and Error Streams**

```ts
import { createLogger, format, transports } from 'scribelog';

const logger = createLogger({
  level: 'info', // Logger allows info, warn, error
  transports: [
    // Log INFO and WARN to stdout using simple format
    new transports.Console({
      level: 'warn', // Only logs warn and error passed from logger
      format: format.simple({ colors: true }),
      useStdErrLevels: [], // Nothing from here goes to stderr
    }),
    // Log only ERRORs to stderr using JSON format
    new transports.Console({
      level: 'error', // Only logs error passed from logger
      format: format.json(), // Use JSON for errors
      useStdErrLevels: ['error'] // Ensure errors go to stderr
    })
  ]
});

logger.info('User logged in');   // Filtered out by the first transport's level ('warn')
logger.warn('Disk space low');  // Goes to first console (stdout, simple)
logger.error('DB Error', { error: new Error('Connection failed')}); // Goes to BOTH (stdout simple, stderr JSON)
logger.debug('Should not appear'); // Filtered out by logger's level ('info')
```

---

## 🌱 Child Loggers

Create contextual loggers using `logger.child(defaultMeta)`. They inherit settings but automatically add the specified metadata.

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

## 📚 Future Work

*   **File Transport:** Adding `FileTransport` with log rotation (size, date).
*   **More Formatters:** `splat`/`printf`, potentially customizable color themes.
*   **Custom Levels:** Allowing users to define their own logging levels.
*   **Async Handling:** Better guarantees for transports finishing writes before `exitOnError`.

---

## 🤝 Contributing

Contributions are welcome! Please feel free to submit issues and pull requests. Check for any existing guidelines or open an issue to discuss larger changes.

---

## 📄 License

MIT License
Copyright (c) 2025 tolongames
See [LICENSE](./LICENSE) for details.