# Scribelog - Detailed Documentation 🪵📝

Welcome to the detailed documentation for Scribelog, an advanced, highly configurable logging library for Node.js. This guide covers all the core features, configuration options, and provides extensive examples.

---

## 1. Introduction

**Scribelog** is an advanced, highly configurable logging library for Node.js applications, written in TypeScript. It offers flexible formatting, support for multiple destinations (transports), child loggers, and automatic error catching, aiming for a great developer experience.

---

## 2. Installation

```bash
npm install scribelog
# or
yarn add scribelog
# or
pnpm add scribelog
```

---

## 3. Getting Started: Quick Example

This example shows basic logging, error logging, and JSON output.

```typescript
import { createLogger, format, transports } from 'scribelog';

// Logger with info level, simple format, console output (default)
const logger = createLogger();

logger.info('Service started.', { pid: process.pid });
logger.warn('Configuration value missing, using default.');

// Correctly log an Error object by passing it in the metadata
try {
  throw new Error('Something failed!');
} catch (error) {
  logger.error('Operation failed unexpectedly', { error: error as Error });
}

// Create a logger that outputs JSON
const jsonLogger = createLogger({
  level: 'debug',
  format: format.defaultJsonFormat, // Use predefined JSON format
});

jsonLogger.debug('Detailed debug info', { transactionId: 'abc' });
```

---

## 4. Core Concepts

### 4.1 Logging Levels

Scribelog uses standard `npm` logging levels, ordered by severity (most severe first):

1.  `error` (0)
2.  `warn` (1)
3.  `info` (2)
4.  `http` (3)
5.  `verbose` (4)
6.  `debug` (5)
7.  `silly` (6)

You can also define **custom logging levels** by passing a `levels` object to `createLogger`. For example:

```typescript
const customLevels = {
  critical: 0,
  error: 1,
  warn: 2,
  info: 3,
  debug: 4,
  trace: 5,
};

const logger = createLogger({
  levels: customLevels,
  level: 'trace',
});

logger.critical('Critical issue!');
logger.trace('Trace message for debugging.');
```

When you set a `level` for a logger or a transport, only messages with that severity level **or higher** (i.e., lower numerical value) will be processed. The default logger level is `'info'`.

### 4.2 Log Methods

Each log level has a corresponding method on the logger instance:

```typescript
logger.error(message, ...args);
logger.warn(message, ...args);
logger.info(message, ...args);
logger.http(message, ...args);
logger.verbose(message, ...args);
logger.debug(message, ...args);
logger.silly(message, ...args);
```

*   `message`: The primary log message. Can be a string (optionally with `printf`-style placeholders like `%s`, `%d`, `%j`) or potentially an `Error` object (see Logging Errors).
*   `...args`: Optional additional arguments.
    *   If the *last* argument is a plain object (not an Error, Date, Array, etc.), it's treated as the **metadata object**.
    *   Any arguments *before* the metadata object (or all arguments if no metadata object is detected) are treated as **splat arguments** used for `printf`-style formatting if the `format.splat()` formatter is included in the chain.

### 4.3 Logging Metadata

You can provide additional context with your logs by passing a metadata object as the *last* argument to the logging methods.

```typescript
logger.info('User action completed', { userId: 123, duration: 55, success: true });
logger.warn('Request timed out', { url: '/api/data', timeout: 5000 });
```

This metadata will be included in the `info` object passed to formatters and transports. The `format.metadata()` formatter can be used to collect these fields, and `format.simple()` or `format.json()` will typically display them.

You can also set `defaultMeta` when creating a logger, which will be merged with call-site metadata:

```typescript
const logger = createLogger({ defaultMeta: { service: 'auth-service' } });
logger.info('Login attempt', { username: 'alice' });
// Log entry will contain both service and username
```

#### **Automatic Request/Trace ID Propagation**

Scribelog can automatically attach a request or trace ID to every log message using async context (AsyncLocalStorage). This is especially useful in web servers (Express, Koa, Fastify, etc.) to correlate all logs for a single request.

**How it works:**

- Use `runWithRequestContext({ requestId }, fn)` to establish a context for a request.
- All logs within that context will automatically include the `requestId` field (unless explicitly overridden in metadata).

**Example (Express):**

```typescript
import { runWithRequestContext, setRequestId, createLogger } from 'scribelog';
const logger = createLogger();
app.use((req, res, next) => {
  const reqId = req.headers['x-request-id'] || generateRandomId();
  runWithRequestContext({ requestId: String(reqId) }, () => {
    next();
  });
});
// Later in any code:
logger.info('Handled request'); // Will include requestId automatically
```

You can access or set the current requestId at any time using `getRequestId()` and `setRequestId()`.

**Note:** This works for any async code within the same request lifecycle, as long as you use `runWithRequestContext` at the start of the request.

#### **Tagging log messages**

You can add tags to any log message by including a `tags` array in your metadata object:

```typescript
logger.info('User login', { tags: ['auth', 'user'], userId: 123 });
logger.warn('Payment failed', { tags: ['payment', 'order'], orderId: 42 });
```

Tags will be displayed in the log output (e.g., `[auth, user]`) and are available for custom filtering or processing in your transports and formatters.  
You can also set default tags for all messages by including them in `defaultMeta`:

```typescript
const logger = createLogger({
  defaultMeta: { tags: ['api'] }
});
logger.info('API started'); // Will include [api] in every log
```

### 4.4 Logging Errors

The recommended way to log `Error` objects is to pass them within the metadata object, typically under the key `'error'`. The `format.errors()` formatter (included in default formats) will detect this, extract useful information (message, name, stack, custom properties), and add them to the main log `info` object.

```typescript
try {
    // ... code that might throw ...
    throw new Error("Failed to process data");
} catch (err) {
    // Pass the error object in the metadata
    logger.error('Data processing failed', { error: err as Error, taskId: 'task-123' });
}
```

This ensures the error's stack trace and other properties are correctly handled and formatted. You can also pass an `Error` object as the *first* argument to `logger.error()` (or other level methods), and Scribelog will attempt to use its message and pass the error object to the formatters:

```typescript
const myError = new Error("Something specific broke");
(myError as any).details = { code: 'SPECIFIC' };
logger.error(myError, { additional: 'context'}); // Also works
```

---

## 5. Configuration (`createLogger`)

The `createLogger(options?: LoggerOptions)` function initializes a new logger instance.

### 5.1 `level`

*   **Type:** `string` (one of the `LogLevel` types: `'error'`, `'warn'`, `'info'`, `'http'`, `'verbose'`, `'debug'`, `'silly'`)
*   **Default:** `'info'`
*   **Description:** Sets the minimum severity level for messages to be processed by this logger instance. Messages below this level are discarded early.

```typescript
// Only log warnings and errors
const warnLogger = createLogger({ level: 'warn' });
warnLogger.info('This will NOT be logged.');
warnLogger.warn('This WILL be logged.');

// Log everything
const debugLogger = createLogger({ level: 'debug' });
debugLogger.debug('This will be logged.');
```

### 5.2 `format`

*   **Type:** `LogFormat` (a function `(info) => result`)
*   **Default:** `format.defaultSimpleFormat`
*   **Description:** Defines the default formatting pipeline for the logger. This format is applied to the `LogInfo` object *before* it's sent to transports, *unless* a transport specifies its own `format`. See the [Formatting (Deep Dive)](#6-formatting-deep-dive) section.

```typescript
// Use JSON format by default for all transports unless overridden
const jsonLogger = createLogger({ format: format.defaultJsonFormat });

// Use a custom simple format with custom colors
const customColorFormat = format.combine(
    format.timestamp(),
    format.simple({
      colors: true,
      levelColors: {
        error: chalk.bgRed.white,
        warn: chalk.yellow.bold,
        info: chalk.green,
        debug: chalk.blue,
      },
    })
);
const colorLogger = createLogger({ format: customColorFormat });
```

### 5.3 `transports`

*   **Type:** `Transport[]` (an array of transport instances)
*   **Default:** `[new transports.Console()]`
*   **Description:** An array containing instances of transport classes (like `transports.Console` or `transports.File`) that determine where log messages are sent. See the [Transports (Deep Dive)](#7-transports-deep-dive) section.

```typescript
// Log to console (default settings) and a file
const logger = createLogger({
  transports: [
    new transports.Console(), // Default console transport
    new transports.File({ filename: 'app.log' }) // Basic file transport
  ]
});
```

### 5.4 `defaultMeta`

*   **Type:** `Record<string, any>`
*   **Default:** `undefined`
*   **Description:** An object containing key-value pairs that will be merged into *every* log message generated by this logger instance and its children. Call-site metadata takes precedence over `defaultMeta` in case of key conflicts.

```typescript
const serviceLogger = createLogger({
  defaultMeta: { service: 'user-api', version: '1.2.0' }
});
serviceLogger.info('User requested data', { userId: 'abc' });
// Log entry will include { service: 'user-api', version: '1.2.0', userId: 'abc' }
```

### 5.5 `handleExceptions`, `handleRejections`, `exitOnError`

*   **Type:** `boolean`
*   **Defaults:** `handleExceptions: false`, `handleRejections: false`, `exitOnError: true`
*   **Description:** Configure automatic handling of global Node.js errors.
    *   `handleExceptions: true`: Catches `process.on('uncaughtException')`.
    *   `handleRejections: true`: Catches `process.on('unhandledRejection')`.
    *   `exitOnError: false`: Prevents `process.exit(1)` after logging an unhandled error (default is to exit).

```typescript
// Log fatal errors to a specific file and DO NOT exit
const fatalLogger = createLogger({
    transports: [
        new transports.File({ filename: 'fatal-errors.log', level: 'error', format: format.json() })
    ],
    handleExceptions: true,
    handleRejections: true,
    exitOnError: false // Keep the process running if possible
});
```

---

## 6. Formatting (Deep Dive)

Scribelog's formatting system is based on the concept of transforming the `LogInfo` object through a series of functions (formatters).

### 6.1 Custom Color Themes

You can now define custom color themes for your log levels using the `chalk` library.

```typescript
import { createLogger, format } from 'scribelog';
import chalk from 'chalk';

const logger = createLogger({
  level: 'debug',
  format: format.combine(
    format.timestamp(),
    format.simple({
      colors: true,
      levelColors: {
        critical: chalk.bgRed.white.bold,
        error: chalk.red,
        warn: chalk.yellow,
        info: chalk.green,
        debug: chalk.blue,
        trace: chalk.cyan,
      },
    })
  ),
});

logger.info('Info message with custom colors!');
logger.critical('Critical error with custom colors!');
```

### 6.2 The `format` Object

All built-in formatters are accessed via the imported `format` object:

```typescript
import { format } from 'scribelog';

const myFormat = format.combine(
  format.timestamp(),
  format.json()
);
```

### 6.3 How Formatters Work

*   Each formatter is a function that returns another function conforming to the `LogFormat` type: `(info: Record<string, any>) => Record<string, any> | string`.
*   This returned function takes the current log information object (`info`) as input.
*   It transforms the `info` object (e.g., adds a field, modifies a field, extracts error info).
*   It returns either the **modified `info` object** (for further processing by the next formatter) or a **final `string` representation** (if it's a terminal formatter like `simple` or `json`).

### 6.4 Combining Formatters: `format.combine()`

This is the core function for creating custom format pipelines. It takes multiple formatter functions as arguments and returns a new single `LogFormat` function.

```typescript
const myFormat = format.combine(
    formatterA(),
    formatterB({ option: true }),
    formatterC() // Terminal formatter (e.g., simple() or json())
);
```

When `myFormat` is called with a `LogInfo` object:
1.  `formatterA()`'s returned function is called with `LogInfo`. It returns a modified object `infoA`.
2.  `formatterB()`'s returned function is called with `infoA`. It returns `infoB`.
3.  `formatterC()`'s returned function is called with `infoB`. If `formatterC` is terminal (like `simple` or `json`), it returns a `string`, and `combine` returns that string immediately. If `formatterC` returned an object `infoC`, `combine` would return `infoC`.

**Order Matters!** Place formatters like `errors` and `splat` early, before formatters that rely on the `message` or metadata fields they might modify (`message`, `metadata`, `simple`, `json`). Place terminal formatters (`simple`, `json`) last.

### 6.5 Built-in Formatters

#### `format.timestamp(options?)`

Adds a timestamp string.

*   **Options:**
    *   `alias?: string`: Key name for the timestamp (default: `'timestamp'`).
    *   `format?: string | ((date: Date) => string)`: Format string for [`date-fns`](https://date-fns.org/v2/docs/format) or a custom function. Default is ISO 8601 format (`date.toISOString()`).
*   **Output:** Modifies `info` by adding/updating `info[alias]` with the formatted string. Also adds `info.originalTimestamp` (the original `Date` object) if not present.

#### `format.level(options?)`

Adds the log level string (lowercase).

*   **Options:**
    *   `alias?: string`: Key name for the level (default: `'level'`).
*   **Output:** Modifies `info` by adding/updating `info[alias]`.

#### `format.message(options?)`

Ensures the log message exists under a specific key. It uses the `info.message` field (which might have been modified by `format.splat`).

*   **Options:**
    *   `alias?: string`: Key name for the message (default: `'message'`).
*   **Output:** Modifies `info` by adding/updating `info[alias]`.

#### `format.splat()`

Performs `printf`-style interpolation on `info.message` using arguments from `info.splat`. Uses Node.js `util.format`.

*   **Options:** None.
*   **Output:** Modifies `info.message` with the interpolated string. Removes `info.splat`.

#### `format.errors(options?)`

Extracts information from an `Error` object found in `info.error` (or other properties).

*   **Options:**
    *   `stack?: boolean`: Include the stack trace (default: `true`).
*   **Output:** Modifies `info` by:
    *   Setting `info.message` to `error.message` if `info.message` was empty.
    *   Adding `info.errorName = error.name`.
    *   Adding `info.stack = error.stack` (if `stack: true`).
    *   Adding `info.originalReason` if present on the error.
    *   Copying other non-standard properties from the error object.
    *   Removing the original `info.error` field.

#### `format.metadata(options?)`

Gathers remaining "metadata" properties from the `info` object.

*   **Options:**
    *   `alias?: string`: If provided, nests all collected metadata into `info[alias]` and removes the original keys from the top level. If omitted, metadata remains at the top level.
    *   `exclude?: string[]`: An array of keys to explicitly exclude from being considered metadata. Default exclusions include standard fields like `level`, `message`, `timestamp`, `splat`, and fields added by `format.errors`.
*   **Output:** Modifies `info` by potentially nesting metadata under `info[alias]` and removing original keys.

#### `format.json(options?)`

**Terminal Formatter.** Converts the final `info` object into a JSON string.

*   **Options:**
    *   `space?: string | number`: Argument for `JSON.stringify` to enable pretty-printing.
*   **Output:** Returns a `string`.

#### `format.simple(options?)`

**Terminal Formatter.** Creates a single-line, human-readable string.

*   **Options:**
    *   `colors?: boolean`: Enable/disable ANSI colors (default: auto-detect TTY).
*   **Output:** Returns a `string` in the format: `TIMESTAMP [LEVEL][tags]: message {metadata}\nstackTrace` (colors applied if enabled). If `tags` are present in the log info, they are displayed in square brackets after the level.

#### `format.maskSensitive(fields?, mask?)`

Masks sensitive fields in log metadata (recursively).

- **fields:** `string[]` – array of field names to mask (default: `['password', 'token', 'secret']`)
- **mask:** `string | (value, key) => any` – value or function to use as mask (default: `'***'`)

**Example:**
```typescript
import { createLogger, format } from 'scribelog';

const logger = createLogger({
  format: format.combine(
    format.maskSensitive(['password', 'token', 'apiKey']),
    format.simple()
  ),
});

logger.info('Sensitive test', {
  username: 'bob',
  password: 'sekret123',
  token: 'abc',
  profile: { apiKey: 'xyz', deep: { password: 'deepSecret' } },
});
// Output: password: '***', token: '***', profile: { apiKey: '***', deep: { password: '***' } }
```

### 6.6 Predefined Formats

Convenience combinations for common use cases:

*   **`format.defaultSimpleFormat`**:
    `combine(errors({ stack: true }), splat(), timestamp(), level(), message(), metadata(), simple())`
    *(This is the default format used by `createLogger`)*
*   **`format.defaultJsonFormat`**:
    `combine(errors({ stack: true }), splat(), timestamp(), level(), message(), metadata(), json())`

### 6.7 Creating Custom Formats

You can easily create your own formatters. A formatter is just a function that returns a `LogFormat` function.

```typescript
import { createLogger, format, LogFormat } from 'scribelog';

// Custom formatter to add process uptime
const uptime = (): LogFormat => {
  return (info: Record<string, any>) => {
    info.uptimeSeconds = Math.floor(process.uptime());
    return info;
  };
};

// Custom formatter to output only message and level as CSV
const csvFormat = (): LogFormat => {
    return (info: Record<string, any>) => {
        // Ensure message is a string, escape quotes if necessary
        const message = String(info.message || '').replace(/"/g, '""');
        return `"${info.level}","${message}"`; // Return a string
    }
}

const logger = createLogger({
    format: format.combine(
        uptime(), // Add uptime
        format.defaultJsonFormat // Then format as JSON
    )
});

const csvLogger = createLogger({
    format: format.combine(
        format.splat(), // Apply splat first
        csvFormat()     // Then convert to CSV
    )
});


logger.info('Log with uptime.');
// Output (JSON): {"level":"info","message":"Log with uptime.","timestamp":"...","uptimeSeconds":...,"appName":...}

csvLogger.info('Comma value needs "escaping", %s', 'right?');
// Output (CSV string): "info","Comma value needs ""escaping"", right?"
```

---

## 7. Transports (Deep Dive)

### 7.1 Concept

Transports are responsible for *sending* the formatted log messages to their final destination (e.g., console, file, network service). You can configure multiple transports for a single logger.

Each transport can have its own `level` and `format`, allowing fine-grained control over where logs go and how they look.

*   **Logger `level`** acts as the first filter.
*   **Transport `level`** acts as a second filter (only messages passing the logger level *and* the transport level are sent).
*   **Transport `format`** overrides the logger's default `format` for that specific transport.

### 7.2 `transports.Console`

The default transport, logging to `process.stdout` and `process.stderr`.

*   **`new transports.Console(options?: ConsoleTransportOptions)`**
*   **Options (`ConsoleTransportOptions`):**
    *   `level?: LogLevel`: Minimum level for this transport.
    *   `format?: LogFormat`: Specific format for console output. If not provided, uses the logger's format. If the final formatted value passed to `log()` is an object, it defaults to using `format.simple()` to render it.
    *   `useStdErrLevels?: LogLevel[]`: Array of levels to direct to `stderr` (default: `['error']`).

### 7.3 `transports.File`

Logs messages to a file, with built-in rotation capabilities provided by `rotating-file-stream`. **Requires `npm install rotating-file-stream`**.

*   **`new transports.File(options: FileTransportOptions)`**
*   **Options (`FileTransportOptions`):**
    *   `filename: string`: **Required.** Path to the log file. Can include patterns like `%DATE%` for `rotating-file-stream`'s date-based rotation (see its documentation).
    *   `level?: LogLevel`: Minimum level for this transport.
    *   `format?: LogFormat`: Specific format for file output (defaults to `format.defaultJsonFormat`). JSON is often preferred for file logs for easier parsing.
    *   `size?: string`: Max file size (e.g., `'10M'`, `'1G'`) before rotation.
    *   `interval?: string`: Rotation interval (e.g., `'1d'` for daily, `'1h'` for hourly). Works with `filename` patterns.
    *   `path?: string`: Directory to store rotated/archived files. If omitted, rotated files are stored alongside the main log file.
    *   `compress?: string | boolean`: Compress rotated files. Use `'gzip'` or `true`.
    *   `maxFiles?: number`: Keep only the specified number of rotated log files.
    *   `maxSize?: string`: Max total size of all log files (current + rotated). Oldest files are removed if the limit is exceeded.
    *   `createPath?: boolean`: Create the log directory if it doesn't exist (default: `true`).
    *   `fsWriteStreamOptions?: object`: Options passed directly to Node.js `fs.createWriteStream`.
*   **Method:**
    *   `close()`: Closes the underlying file stream. Call this during graceful shutdown to ensure logs are flushed.

**Example: Daily Rotating Log File**

```ts
import { createLogger, format, transports } from 'scribelog';
import * as path from 'path';

const logDirectory = path.join(__dirname, 'logs'); // Store logs in a 'logs' subdirectory

const fileLogger = createLogger({
    level: 'debug',
    transports: [
        new transports.File({
            filename: path.join(logDirectory, 'app-%DATE%.log'), // Rotate daily, filename like app-2024-05-01.log
            level: 'debug',
            format: format.defaultJsonFormat, // Store structured logs
            interval: '1d',     // Rotate daily
            compress: 'gzip',   // Compress old logs
            maxFiles: 14,       // Keep 14 days of logs
            createPath: true,   // Create the 'logs' directory if needed
        })
    ]
});

fileLogger.info('Logging to a daily rotating file.');
fileLogger.debug('This debug message will also be written.');

// Remember to handle shutdown gracefully in a real application
// process.on('SIGTERM', () => {
//   fileLogger.info('Shutting down...');
//   // Access the transport instance to close it
//   (fileLogger as any).transports.forEach((t: Transport) => t.close?.());
//   process.exit(0);
// });
```

### 7.4 Using Multiple Transports

Simply provide an array of transport instances to the `transports` option in `createLogger`.

```ts
const logger = createLogger({
    level: 'verbose',
    transports: [
        new transports.Console({ level: 'info', format: format.simple({ colors: true }) }),
        new transports.File({ filename: 'verbose.log', level: 'verbose', format: format.json() })
    ]
});

logger.verbose('Verbose message'); // Goes only to file (JSON)
logger.info('Info message');      // Goes to console (simple) and file (JSON)
logger.error('Error message', { error: new Error('Failure')}); // Goes to console (simple, stderr) and file (JSON)
```

### 7.5 Creating Custom Transports

You can create your own transport by creating a class that implements the `Transport` interface:

```typescript
import { Transport, LogFormat, LogLevel } from 'scribelog';

class MyCustomDbTransport implements Transport {
  public level?: LogLevel;
  public format?: LogFormat;
  private dbConnection: any; // Your database connection instance

  constructor(options: { level?: LogLevel, connection: any }) {
    this.level = options.level;
    this.dbConnection = options.connection;
    // Use a default format suitable for DB (usually structured)
    this.format = format.defaultJsonFormat; // Or just format.json()
  }

  log(processedEntry: Record<string, any> | string): void {
    let logObject: Record<string, any>;

    if (typeof processedEntry === 'string') {
      // If we received a string, try to parse it or log it as is
      try {
        logObject = JSON.parse(processedEntry);
      } catch (e) {
        logObject = { rawMessage: processedEntry }; // Fallback
      }
    } else {
      logObject = processedEntry;
    }

    // Add a timestamp if the formatter didn't provide one suitable for the DB
    if (!logObject.dbTimestamp) {
        logObject.dbTimestamp = new Date();
    }

    // Send the logObject to your database
    this.dbConnection.insertLog(logObject).catch((err: Error) => {
      console.error('MyCustomDbTransport failed to write to DB:', err);
    });
  }

  close(): void {
    // Close the database connection if necessary
    this.dbConnection.close();
  }
}

// Usage:
// const dbConn = createMyDbConnection();
// const logger = createLogger({
//   transports: [
//     new MyCustomDbTransport({ connection: dbConn, level: 'warn' })
//   ]
// });
```

### 7.6 Asynchronous Batch Transport (`transports.AsyncBatch`)

The `AsyncBatchTransport` allows you to buffer and batch log messages before sending them to a target transport (such as a file or network transport). This is useful for reducing I/O operations and improving performance in high-throughput scenarios.

**Constructor:**
```typescript
new transports.AsyncBatch(options: {
  target: Transport;         // Required: the underlying transport to send batches to
  batchSize?: number;        // Max number of logs per batch (default: 10)
  flushIntervalMs?: number;  // Max time (ms) to wait before flushing a batch (default: 1000)
  immediate?: boolean;       // If true, disables batching and sends logs immediately
  level?: LogLevel;          // Optional: minimum level for this transport
  format?: LogFormat;        // Optional: custom format for this transport
})
```

**How it works:**
- Logs are buffered in memory.
- When the buffer reaches `batchSize`, all logs are flushed to the target transport.
- If `flushIntervalMs` elapses before the buffer is full, the current buffer is flushed.
- Calling `.close()` on the transport will flush any remaining logs and close the underlying target transport.

**Example:**
```typescript
import { createLogger, transports } from 'scribelog';

const fileTransport = new transports.File({ filename: 'batched.log' });

const asyncBatch = new transports.AsyncBatch({
  target: fileTransport,
  batchSize: 5,
  flushIntervalMs: 2000,
});

const logger = createLogger({
  transports: [asyncBatch],
});

logger.info('First log');
logger.info('Second log');
// ...more logs
```

**Notes:**
- You can wrap any transport (file, network, etc.) with `AsyncBatchTransport`.
- If you set `immediate: true`, logs are passed through without batching.
- Always call `.close()` on the transport during shutdown to ensure all logs are flushed.

### 7.7 Remote Transports (HTTP, WebSocket, TCP, UDP)

Scribelog provides remote transports for sending logs over the network. Recommended: wrap them with `transports.AsyncBatch` for performance.

- `transports.Http(options: HttpTransportOptions)`  
  Sends logs via HTTP/HTTPS (POST/PUT). Supports custom headers, timeouts, and gzip compression.
  - Options:
    - `url: string`
    - `method?: 'POST' | 'PUT'` (default: POST)
    - `headers?: Record<string, string>`
    - `timeoutMs?: number` (default: 5000)
    - `compress?: boolean` (gzip)
    - `agent?: http.Agent | https.Agent`
    - `level?: LogLevel`, `format?: LogFormat` (default format: `format.defaultJsonFormat`)

- `transports.WebSocket(options: WebSocketTransportOptions)`  
  Streams logs over WebSocket. Buffers messages until the socket is open. Requires `ws` in your app (`npm i ws`).
  - Options:
    - `url: string` (ws:// or wss://)
    - `protocols?: string | string[]`
    - `clientOptions?: any`
    - `queueMax?: number` (default: 1000)
    - `level?: LogLevel`, `format?: LogFormat`

- `transports.Tcp(options: TcpTransportOptions)`  
  Sends newline-delimited strings over TCP. Suitable for collectors expecting NDJSON.
  - Options:
    - `host: string`, `port: number`
    - `reconnect?: boolean` (default: true)
    - `level?: LogLevel`, `format?: LogFormat`

- `transports.Udp(options: UdpTransportOptions)`  
  Sends logs via UDP datagrams (best-effort, no backpressure).
  - Options:
    - `host: string`, `port: number`, `type?: 'udp4' | 'udp6'` (default: udp4)
    - `level?: LogLevel`, `format?: LogFormat`

Example (HTTP + batching):
```ts
import { createLogger, transports, format } from 'scribelog';

const httpT = new transports.Http({
  url: 'https://logs.example.com/ingest',
  headers: { Authorization: 'Bearer abc' },
  compress: true,
  timeoutMs: 8000,
});

const batched = new transports.AsyncBatch({
  target: httpT,
  batchSize: 20,
  flushIntervalMs: 1000,
});

const logger = createLogger({ transports: [batched], format: format.defaultJsonFormat });
logger.info('Remote log', { service: 'payments' });
```

Notes:
- WebSocket transport requires `ws` installed in your application.
- For TCP/UDP, ensure your collector expects newline-delimited JSON or a compatible format.
- Use `format.maskSensitive` to redact secrets in headers/body.
- requestId is automatically attached from async context.

---

## 8. Child Loggers (`logger.child()`)

Child loggers are useful for adding persistent contextual information to a set of related log messages without repeating that data in every log call.

*   **`logger.child(defaultMeta: Record<string, any>): LoggerInterface`**
*   Creates a *new* logger instance.
*   **Inherits:** `level`, `format`, and `transports` from the parent logger.
*   **Merges Metadata:** Combines the parent's `defaultMeta` with the `childMeta` passed to the `child()` method. Metadata provided in `childMeta` overrides keys from the parent's `defaultMeta`.

```ts
import { createLogger } from 'scribelog';

const mainLogger = createLogger({ defaultMeta: { app: 'api', version: '1.0' } });

// Simulate handling a request
const requestId = 'req-123';
const requestLogger = mainLogger.child({ requestId }); // Inherits app, version; adds requestId

requestLogger.info('Request received');
// Log Output includes: { app: 'api', version: '1.0', requestId: 'req-123' }

// Simulate a specific module within the request
const dbLogger = requestLogger.child({ module: 'database', version: '1.1-db' }); // Overrides version for this context
dbLogger.debug('Executing query', { query: 'SELECT *' });
// Log Output includes: { app: 'api', version: '1.1-db', requestId: 'req-123', module: 'database', query: 'SELECT *' }
```

---

## 9. Error Handling In-Depth

Scribelog can automatically log uncaught exceptions and unhandled promise rejections.

*   **Enable:** Set `handleExceptions: true` and/or `handleRejections: true` in `createLogger` options.
*   **Process:**
    1.  An uncaught error/rejection occurs.
    2.  Scribelog's listener catches it.
    3.  An `Error` object is created (if the rejection `reason` wasn't already an Error). The original reason is added as `originalReason`.
    4.  A `LogInfo` object is created with `level: 'error'`, `exception: true`, `eventType: 'uncaughtException' | 'unhandledRejection'`, the error's message, and the `Error` object itself stored under the `error` key.
    5.  This `LogInfo` object is processed by the logger's format pipeline. The `format.errors()` formatter (included in defaults) extracts `name`, `stack`, `originalReason`, etc., from the `info.error` field and adds them to the top level of the `info` object.
    6.  The formatted log is sent to transports.
    7.  If `exitOnError` is `true` (default), `process.exit(1)` is called after a short delay.
*   **`exitOnError: boolean` (Default: `true`):** Controls whether the process terminates after logging. Set to `false` if you have other cleanup mechanisms or want the process to attempt recovery (use with caution, especially for `uncaughtException`).
*   **`removeExceptionHandlers()`:** A method on the logger instance (`(logger as any).removeExceptionHandlers()`) can be called to detach the listeners added by `handleExceptions` and `handleRejections`. This is useful during graceful shutdown or in tests.

---

## 10. TypeScript Usage

Scribelog is written in TypeScript and exports all necessary types for configuration and extension.

```typescript
import {
  createLogger,
  Logger, // The main logger interface
  LoggerOptions,
  LogLevel,
  LogFormat,
  Transport,
  FileTransportOptions, // Options for specific transports
  LogInfo // The internal log object structure
} from 'scribelog';

const options: LoggerOptions = {
    level: 'verbose',
    format: format.json(),
    // ...
};

const logger: Logger = createLogger(options);

// Type safety for levels
const levelCheck: LogLevel = 'debug';
// const invalidLevel: LogLevel = 'myLevel'; // TypeScript Error

// Implementing a custom transport
class MyTransport implements Transport {
    log(processedEntry: string | Record<string, any>) {
        // ... implementation ...
    }
    // close() { ... }
}
```

## 11. Framework Adapters

Scribelog provides ready-to-use adapters for popular frameworks. They offer:
- Automatic requestId propagation (AsyncLocalStorage)
- Request/response logging with statusCode, durationMs, and framework tags
- Optional header redaction (e.g., Authorization, Cookie)

Common options (vary by adapter):
- logger?: Logger – defaults to `createLogger()`
- headerName?: string – header carrying the requestId (default: 'x-request-id')
- generateId?: () => string – generator when header is missing
- logRequest?: boolean – log request line (default: true)
- logResponse?: boolean – log response line (default: true)
- levelRequest?: LogLevel – level for request (e.g., 'http')
- levelResponse?: LogLevel – level for response (e.g., 'info')
- tags?: string[] – default adapter tags (e.g., ['express'])
- redactHeaders?: string[] – headers to redact (e.g., ['authorization', 'cookie'])
- maxHeaderValueLength?: number – truncate long header values (default: 256)

Express:
```ts
import { adapters, createLogger } from 'scribelog';
app.use(adapters.express.createMiddleware({
  logger: createLogger(),
  headerName: 'x-request-id',
  redactHeaders: ['authorization', 'cookie', 'set-cookie'],
}));
```

Koa:
```ts
import { adapters, createLogger } from 'scribelog';
app.use(adapters.koa.createMiddleware({
  logger: createLogger(),
  levelRequest: 'http',
  levelResponse: 'info',
}));
```

Fastify:
```ts
import { adapters, createLogger } from 'scribelog';
const register = adapters.fastify.createPlugin({ logger: createLogger() });
register(fastify);
```

NestJS (global interceptor):
```ts
import { adapters, createLogger } from 'scribelog';
app.useGlobalInterceptors(adapters.nest.createInterceptor({
  logger: createLogger(),
  headerName: 'x-request-id',
}));
```

Next.js (API routes, Node runtime):
```ts
import { adapters, createLogger } from 'scribelog';
export default adapters.next.createApiHandler(handler, { logger: createLogger() });
```

Notes:
- Adapters rely on AsyncLocalStorage; Edge runtime (Next.js) may not support it.
- Combine with `format.maskSensitive` to safely log headers/body.
- requestId is automatically attached to logs (the logger reads it from async context).