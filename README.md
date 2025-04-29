# Scribelog 🪵📝

[![npm version](https://badge.fury.io/js/scribelog.svg)](https://badge.fury.io/js/scribelog)  
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

**Scribelog** is an advanced, highly configurable logging library for Node.js applications, written in TypeScript. It offers flexible formatting, support for multiple destinations (transports), child loggers, and automatic error catching.

---

## ✨ Key Features

- **Logging Levels:** Standard levels (`error`, `warn`, `info`, `http`, `verbose`, `debug`, `silly`).
- **Flexible Formatting:** Composable formatters (`simple`, `json`, `timestamp`, `metadata`, `errors`, etc.) with configuration options. Console color support.
- **Transports:** Built-in `ConsoleTransport`. Architecture ready for future extensions (e.g., `FileTransport`).
- **Child Loggers:** Create loggers that inherit parent configuration with additional, fixed context (`logger.child({...})`).
- **Error Handling:** Automatically logs uncaught exceptions and unhandled promise rejections with an option to exit the process.
- **Written in TypeScript:** Type-safe and developer-friendly.

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
import { createLogger, format, transports } from 'scribelog';

const logger = createLogger();

logger.info('Application started.');
logger.warn('Low memory warning!', { freeMemory: 100 });
logger.error(new Error('Could not connect to the database.'));

const userLogger = logger.child({ userId: 'user-123' });
userLogger.debug('Fetching user data.');

const jsonLogger = createLogger({
  level: 'debug',
  format: format.json(),
});

jsonLogger.debug('Debugging operation X', { operationId: 'op-xyz' });
```

---

## ⚙️ Configuration

Create a logger using `createLogger(options?: LoggerOptions)`

**LoggerOptions:**

| Option              | Type                      | Default         | Description |
|---------------------|---------------------------|------------------|-------------|
| `level`             | `string`                  | `'info'`         | Minimum level to log |
| `format`            | `LogFormat`               | `simple`         | Formatter pipeline |
| `transports`        | `Transport[]`             | `Console`        | Where to send logs |
| `defaultMeta`       | `Record<string, any>`     | `undefined`      | Metadata included in all logs |
| `handleExceptions`  | `boolean`                 | `false`          | Logs uncaught exceptions |
| `handleRejections`  | `boolean`                 | `false`          | Logs unhandled promise rejections |
| `exitOnError`       | `boolean`                 | `true`           | Exits process on fatal errors |

---

## 📊 Logging Levels

```text
error: 0
warn: 1
info: 2
http: 3
verbose: 4
debug: 5
silly: 6
```

Set the `level` option to control minimum log severity.

---

## 🎨 Formatting

Formatters modify the log info object before sending it to transports. You can combine them using `format.combine(...)`.

### Core Formatters

- `format.timestamp({ alias?, format? })`
- `format.level({ alias? })`
- `format.message({ alias? })`
- `format.errors({ stack?: boolean })`
- `format.metadata({ alias?: string, exclude?: string[] })`

### Terminal Formatters

- `format.json({ space?: string | number })`
- `format.simple({ colors?: boolean })`

### Example: Combined Formatter

```ts
const myFormat = format.combine(
  format.errors({ stack: true }),
  format.timestamp({ format: 'HH:mm:ss' }),
  format.level(),
  format.message(),
  format.metadata({ alias: 'meta' }),
  format.json({ space: 2 })
);

const logger = createLogger({ format: myFormat });

logger.info('Log with custom format', { userId: 1, data: { ok: true } });
```

---

## 📤 Transports

Transports define where the logs are sent.

### ConsoleTransport

```ts
new transports.Console({
  level: 'error',
  format: format.json(),
  useStdErrLevels: ['error']
});
```

### Example

```ts
const logger = createLogger({
  level: 'debug',
  transports: [
    new transports.Console({ level: 'info' }),
    new transports.Console({
      level: 'error',
      format: format.json(),
      useStdErrLevels: ['error']
    })
  ]
});
```

---

## 🌱 Child Loggers

```ts
const mainLogger = createLogger({ defaultMeta: { service: 'main-app' } });

function handleRequest(requestId: string) {
  const requestLogger = mainLogger.child({ requestId });

  requestLogger.info('Processing request started.');
  try {
    if (Math.random() > 0.5) throw new Error('Random error');
    requestLogger.info('Request processed successfully.');
  } catch (err) {
    requestLogger.error(err);
  }
}
```

---

## 🛠️ Error Handling

Enable automatic global error logging:

```ts
const logger = createLogger({
  handleExceptions: true,
  handleRejections: true,
  // exitOnError: false
});
```

By default, `exitOnError: true` will terminate the process after logging a fatal error.

---

## 📚 Future Work

- Add `FileTransport` with rotation
- More built-in formatters (e.g., `splat`, `printf`)
- Advanced color customization
- Custom logging levels
- Better async handling in transports

---

## 📄 License

MIT  
See [LICENSE](./LICENSE) for details.