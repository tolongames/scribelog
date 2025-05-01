
# Scribelog 🪵📝

[![npm version](https://img.shields.io/npm/v/scribelog.svg)](https://www.npmjs.com/package/scribelog)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Build Status](https://github.com/tolongames/scribelog/actions/workflows/node.js.yml/badge.svg)](https://github.com/tolongames/scribelog/actions/workflows/node.js.yml) <!-- Zaktualizuj URL, jeśli trzeba -->

**Scribelog** is an advanced, highly configurable logging library for Node.js applications, written in TypeScript. It offers flexible formatting, support for multiple destinations (transports like Console and File), child loggers, automatic error catching, and printf-style interpolation, aiming for a great developer experience.

---

## ✨ Key Features

**Standard & Custom Logging Levels:** Use familiar levels (`error`, `warn`, `info`, etc.) or define your own custom levels.
*   **Highly Flexible Formatting:** Combine powerful formatters (`simple`, `json`, `timestamp`, `metadata`, `errors`, `splat`) using a composable API (`format.combine`). Customize outputs easily, including color themes.
*   **Printf-Style Logging:** Use `printf`-like placeholders (`%s`, `%d`, `%j`) via `format.splat()` for easy message interpolation.
*   **Console Color Support:** Automatic, readable colorization for the `simple` format in TTY environments, with customizable themes.
*   **Multiple Transports:** Log to different destinations. Built-in `ConsoleTransport` and `FileTransport` with rotation options.
*   **Child Loggers:** Easily create contextual loggers (`logger.child({...})`) that inherit settings but add specific metadata (like `requestId`).
*   **Automatic Error Handling:** Optionally catch and log `uncaughtException` and `unhandledRejection` events, including stack traces.
*   **TypeScript First:** Written entirely in TypeScript for type safety and excellent editor autocompletion.

---

## 📦 Installation

```bash
# Core library
npm install scribelog
# or
yarn add scribelog
# or
pnpm add scribelog
```

---

## 🚀 Quick Start

Get up and running in seconds:

```ts
import { createLogger, format } from 'scribelog';
import chalk from 'chalk';

// Logger with custom color theme and default settings
const logger = createLogger({
  level: 'debug',
  format: format.combine(
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
  ),
});

logger.info('Scribelog is ready!');
logger.warn('Something seems off...', { detail: 'Cache size exceeded limit' });
logger.error('An error occurred!', { error: new Error('Test error') });
```

**Default Console Output (example):**

```bash
2025-05-01T12:00:00.123Z [INFO]: Scribelog is ready!
2025-05-01T12:00:00.125Z [WARN]: Something seems off... { detail: 'Cache size exceeded limit' }
2025-05-01T12:00:00.127Z [ERROR]: An error occurred! { errorName: 'Error', exception: true }
Error: Test error
    at <anonymous>:... (stack trace)
```

---

## 📘 Full Documentation

This README covers the basics. For a comprehensive guide covering **all configuration options, formatters (like `json`, custom `timestamp` formats), transports (`FileTransport` with rotation), child loggers, error handling details, and advanced examples**, please see the:

➡️ **[Detailed Documentation](./DOCUMENTATION.md)** ⬅️

---

## ⚙️ Basic Configuration (Overview)

Configure your logger via `createLogger(options)`. Key options:

*   `level`: `'info'` (default), `'debug'`, `'warn'`, etc., or **custom levels** (e.g., `'critical'`, `'trace'`).
*   `format`: Use `format.combine(...)` with formatters like `format.simple()`, `format.json()`, `format.timestamp()`, `format.splat()`, `format.errors()`, `format.metadata()`. Default is `format.defaultSimpleFormat`. You can also define **custom color themes** for log levels.
*   `transports`: Array of `new transports.Console({...})` or `new transports.File({...})`. Default is one Console transport.
*   `defaultMeta`: An object with data to add to every log message.
*   `handleExceptions`, `handleRejections`, `exitOnError`: For automatic error catching.

**Example 1: Logging JSON to a File**

```ts
import { createLogger, format, transports } from 'scribelog';

const fileJsonLogger = createLogger({
  level: 'debug',
  // Use the predefined JSON format (includes error handling, splat, timestamp etc.)
  format: format.defaultJsonFormat,
  transports: [
    new transports.File({
      filename: 'application.log', // Log to application.log
      level: 'debug',             // Log debug and above to the file
      size: '10M',                // Rotate at 10 MB
      maxFiles: 5                 // Keep 5 rotated files
    })
  ],
  defaultMeta: { service: 'file-writer' }
});

fileJsonLogger.debug('Writing JSON log to file', { id: 1 });
fileJsonLogger.error('File write error occurred', { error: new Error('Disk full'), file: 'data.txt' });
```

**Example 2: Using Custom Levels and Colors**

```ts
import { createLogger, format } from 'scribelog';
import chalk from 'chalk';

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

logger.critical('Critical issue!');
logger.trace('Trace message for debugging.');
```

---

## 📚 Future Work

*   More built-in formatters (e.g., customizable color themes).
*   Ability to define custom logging levels.
*   Improved handling of asynchronous operations in transports (especially for `exitOnError`).

---

## 🤝 Contributing

Contributions are welcome! Please feel free to submit issues and pull requests on the [GitHub repository](https://github.com/tolongames/scribelog).

---

## 📄 License

MIT License
Copyright (c) 2025 tolongames
See [LICENSE](./LICENSE) for details.