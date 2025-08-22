# Scribelog 🪵📝

[![npm version](https://img.shields.io/npm/v/scribelog.svg)](https://www.npmjs.com/package/scribelog)
[![npm downloads](https://img.shields.io/npm/dm/scribelog.svg)](https://www.npmjs.com/package/scribelog)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Build Status](https://github.com/tolongames/scribelog/actions/workflows/node.js.yml/badge.svg)](https://github.com/tolongames/scribelog/actions/workflows/node.js.yml) <!-- Zaktualizuj URL, jeśli trzeba -->

**Scribelog** is an advanced, highly configurable logging library for Node.js applications, written in TypeScript. It offers flexible formatting, support for multiple destinations (transports like Console and File), child loggers, automatic error catching, and printf-style interpolation, aiming for a great developer experience.

---

## ✨ Key Features

**Standard & Custom Logging Levels:** Use familiar levels (`error`, `warn`, `info`, etc.) or define your own custom levels.

- **Highly Flexible Formatting:** Combine powerful formatters (`simple`, `json`, `timestamp`, `metadata`, `errors`, `splat`) using a composable API (`format.combine`). Customize outputs easily, including color themes.
- **Printf-Style Logging:** Use `printf`-like placeholders (`%s`, `%d`, `%j`) via `format.splat()` for easy message interpolation.
- **Console Color Support:** Automatic, readable colorization for the `simple` format in TTY environments, with customizable themes.
- **Multiple Transports:** Log to different destinations. Built-in `ConsoleTransport` and `FileTransport` with rotation options.
- **Child Loggers:** Easily create contextual loggers (`logger.child({...})`) that inherit settings but add specific metadata (like `requestId`).
- **Framework adapters (Express, Koa, Fastify, NestJS, Next.js):**
  Ready-to-use middleware/hooks/interceptors for request/response logging with automatic requestId (AsyncLocalStorage), duration, status, and framework tags. Minimal boilerplate.
- **Profiling & Timing:** Lightweight high-resolution timers (profile/time APIs), including sync/async helpers and start/end merging of metadata.
  - Configurable levels and thresholds: promote slow operations to warn/error via thresholdWarnMs/thresholdErrorMs or custom getLevel(duration, meta).
  - Concurrency-safe timers: profile(label) returns a handle; profileEnd accepts a handle or uses LIFO per label. Optional namespacing with requestId or a custom keyFactory.
  - Orphan cleanup: TTL-based cleanup, periodic sweeping, and maxActiveProfiles limit; stop the background cleaner with logger.dispose().
  - Fast path: when profiling is effectively disabled (no debug, no thresholds/getLevel/profiler.level), time*/profile calls are no-ops.
  - Configurable tags and fields: compose tags via tagsDefault/tagsMode (append/prepend/replace) and add fieldsDefault without overriding explicit meta.
  - Metrics hook: profiler.onMeasure(event) is called after each measurement (no extra log), ready for Prometheus/Grafana.
- **Automatic Error Handling:** Optionally catch and log `uncaughtException` and `unhandledRejection` events, including stack traces.
- **Remote Transports (HTTP, WebSocket, TCP, UDP):**
  Send logs over the network to ELK/Logstash, Graylog, Datadog, or custom collectors. Supports batching (AsyncBatch) and gzip (HTTP).
- **Tagging & Context:** Add tags to log messages for easy filtering and richer context. See examples in Quick Start.
- **Asynchronous Batch Logging:** Buffer and batch log messages before sending them to a target transport to reduce I/O overhead. See examples in Basic Configuration.
- **Automatic Request/Trace ID Propagation:** Automatically attaches a request/trace ID to every log message using AsyncLocalStorage. See usage in Basic Configuration.
- **Sensitive Data Masking:** Mask sensitive fields (passwords, tokens, API keys) with the built‑in `format.maskSensitive` formatter. See usage in Basic Configuration.
- **TypeScript First:** Written entirely in TypeScript for type safety and excellent editor autocompletion.

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

// --- NEW: Logging with tags ---
logger.info('User login', { tags: ['auth', 'user'], userId: 123 });
```

**Default Console Output (example):**

```bash
2025-05-01T12:00:00.123Z [INFO]: Scribelog is ready!
2025-05-01T12:00:00.125Z [WARN]: Something seems off... { detail: 'Cache size exceeded limit' }
2025-05-01T12:00:00.127Z [ERROR]: An error occurred! { errorName: 'Error', exception: true }
Error: Test error
    at <anonymous>:... (stack trace)
2025-05-01T12:00:00.130Z [INFO] [auth, user]: User login { userId: 123 }
```

## ⏱️ Profiling & Timing

High‑resolution timers for measuring any code block, with smart defaults and advanced controls.

Configuration (examples):
```ts
import { createLogger } from 'scribelog';

const logger = createLogger({
  profiler: {
    // Level heuristics
    level: 'debug',              // base level for profiling logs (optional)
    thresholdWarnMs: 200,        // >=200ms -> warn
    thresholdErrorMs: 1000,      // >=1000ms -> error
    // or custom level function:
    // getLevel: (durationMs, meta) => (durationMs > 500 ? 'warn' : 'info'),

    // Concurrency & keys
    namespaceWithRequestId: true,                 // key prefix from requestId (if context available)
    // keyFactory: (label, meta) => `${meta?.tenant ?? 'anon'}:${label}:${Date.now()}`,

    // Orphan cleanup
    ttlMs: 5 * 60_000,            // remove timers not ended within 5 min
    cleanupIntervalMs: 60_000,    // sweep every 60s
    maxActiveProfiles: 1000,      // drop the oldest when the limit is exceeded

    // Tags & fields
    tagsDefault: ['perf'],        // added with 'append' mode by default
    tagsMode: 'append',           // 'append' | 'prepend' | 'replace'
    fieldsDefault: { service: 'api' },

    // Metrics hook (no extra log)
    onMeasure: (e) => {
      // e = { label, durationMs, success?: boolean, level, tags?, requestId?, meta, key? }
      // Send to Prometheus, StatsD, etc.
    },
  },
});
```

Usage patterns:
```ts
// 1) Manual start/stop with handle (best for concurrency)
const h = logger.profile('db', { query: 'SELECT 1' });
// ... work ...
logger.profileEnd(h, { rows: 10 }); // merges start+end meta and logs

// 2) Aliases (still handle-capable via time/timeEnd)
logger.time('calc');
// ... work ...
logger.timeEnd('calc'); // ends the latest 'calc' via LIFO per label

// 3) Sync block helper
const value = logger.timeSync('compute', () => 2 + 2, { component: 'math' });

// 4) Async block helper (logs success or error, rethrows on error)
await logger.timeAsync('load-user', async () => getUser(42), { component: 'users' });
```

Notes:
- Concurrency-safe: profile(label) returns a unique handle; profileEnd(handle) ends that exact timer. If you pass a plain label, LIFO per label is used.
- Fast path: when profiling is effectively disabled (no debug and no thresholds/getLevel/profiler.level), time*/profile calls skip overhead and do not log.
- Orphan cleanup: timers not ended in time are removed by TTL sweep; the oldest timers can be dropped if maxActiveProfiles is exceeded. Stop the sweeper via logger.dispose().
- Tags & fields: tagsDefault/tagsMode and fieldsDefault are applied consistently; tags are deduplicated.
- Metrics hook: profiler.onMeasure(event) is called after each measurement, with merged meta and composed tags, without producing additional logs.

---

## 📘 Full Documentation

This README covers the basics. For a comprehensive guide covering **all configuration options, formatters (like `json`, custom `timestamp` formats), transports (`FileTransport` with rotation), child loggers, error handling details, and advanced examples**, please see the:

➡️ **[Detailed Documentation](./DOCUMENTATION.md)** ⬅️

---

## ⚙️ Basic Configuration (Overview)

Configure your logger via `createLogger(options)`. Key options:

- `level`: `'info'` (default), `'debug'`, `'warn'`, etc., or **custom levels** (e.g., `'critical'`, `'trace'`).
- `format`: Use `format.combine(...)` with formatters like `format.simple()`, `format.json()`, `format.timestamp()`, `format.splat()`, `format.errors()`, `format.metadata()`. Default is `format.defaultSimpleFormat`. You can also define **custom color themes** for log levels.
- `transports`: Array of `new transports.Console({...})` or `new transports.File({...})`. Default is one Console transport.
- `defaultMeta`: An object with data to add to every log message.
- `handleExceptions`, `handleRejections`, `exitOnError`: For automatic error catching.

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
      level: 'debug', // Log debug and above to the file
      size: '10M', // Rotate at 10 MB
      maxFiles: 5, // Keep 5 rotated files
    }),
  ],
  defaultMeta: { service: 'file-writer' },
});

fileJsonLogger.debug('Writing JSON log to file', { id: 1 });
fileJsonLogger.error('File write error occurred', {
  error: new Error('Disk full'),
  file: 'data.txt',
});
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

**Example 3: Batching logs (AsyncBatch)**

```ts
import { createLogger, transports } from 'scribelog';

const fileTransport = new transports.File({ filename: 'batched.log' });

const asyncBatch = new transports.AsyncBatch({
  target: fileTransport,
  batchSize: 5, // Send logs in batches of 5
  flushIntervalMs: 2000, // Or every 2 seconds
});

const logger = createLogger({ transports: [asyncBatch] });

logger.info('First log');
logger.info('Second log');
// ...more logs
```

**Example 4: Request/Trace ID propagation**

```ts
import { runWithRequestContext, setRequestId, createLogger } from 'scribelog';
const logger = createLogger();

// In your middleware:
app.use((req, res, next) => {
  const reqId = req.headers['x-request-id'] || generateRandomId();
  runWithRequestContext({ requestId: String(reqId) }, () => {
    next();
  });
});

// Anywhere later in the same async flow:
logger.info('Handled request'); // requestId is attached automatically
```

**Example 5: Sensitive data masking**

```ts
import { createLogger, format } from 'scribelog';

const logger = createLogger({
  format: format.combine(
    format.maskSensitive(['password', 'token', 'apiKey']),
    format.simple()
  ),
});

logger.info('User login', {
  username: 'bob',
  password: 'sekret123',
  token: 'abc',
  profile: { apiKey: 'xyz' },
});
// Output (example): password: '***', token: '***', profile: { apiKey: '***' }
```

## Framework adapters (quick integration)

Express:

```ts
import express from 'express';
import { createLogger, adapters } from 'scribelog';

const app = express();
const logger = createLogger();
app.use(adapters.express.createMiddleware({ logger }));
```

Koa:

```ts
import Koa from 'koa';
import { createLogger, adapters } from 'scribelog';

const app = new Koa();
const logger = createLogger();
app.use(adapters.koa.createMiddleware({ logger }));
```

Fastify:

```ts
import Fastify from 'fastify';
import { createLogger, adapters } from 'scribelog';

const app = Fastify();
const logger = createLogger();
const register = adapters.fastify.createPlugin({ logger });
register(app);
```

NestJS (global interceptor):

```ts
import { adapters, createLogger } from 'scribelog';
const app = await NestFactory.create(AppModule);
const logger = createLogger();
app.useGlobalInterceptors(adapters.nest.createInterceptor({ logger }));
```

Next.js (API Route):

```ts
import { adapters, createLogger } from 'scribelog';
const logger = createLogger();
export default adapters.next.createApiHandler(
  async (req, res) => {
    res.statusCode = 200;
    res.end('OK');
  },
  { logger }
);
```

## Remote transports (network logging)

HTTP (+ batching + gzip):

```ts
import { createLogger, transports, format } from 'scribelog';

const httpT = new transports.Http({
  url: 'https://logs.example.com/ingest',
  headers: { 'x-api-key': 'your-key' },
  compress: true, // gzip the body
  timeoutMs: 8000,
  // format defaults to format.defaultJsonFormat if not provided
});

const batched = new transports.AsyncBatch({
  target: httpT,
  batchSize: 20,
  flushIntervalMs: 1000,
});

const logger = createLogger({
  transports: [batched],
  format: format.defaultJsonFormat,
});
logger.info('Remote log', { service: 'api' });
```

WebSocket (requires ws: npm i ws):

```ts
import { createLogger, transports } from 'scribelog';

const wsT = new transports.WebSocket({ url: 'wss://logs.example.com/stream' });
const logger = createLogger({ transports: [wsT] });
logger.error('Streamed error', { code: 500 });
```

TCP (newline-delimited JSON) + batching:

```ts
import { createLogger, transports } from 'scribelog';

const tcp = new transports.Tcp({ host: '127.0.0.1', port: 5000 });
const batched = new transports.AsyncBatch({
  target: tcp,
  batchSize: 50,
  flushIntervalMs: 500,
});
const logger = createLogger({ transports: [batched] });
logger.info('Hello over TCP', { env: 'prod' });
```

UDP (best-effort, e.g., GELF-like):

```ts
import { createLogger, transports } from 'scribelog';

const udp = new transports.Udp({ host: '127.0.0.1', port: 12201 });
const logger = createLogger({ transports: [udp] });
logger.warn('Warning via UDP');
```

Notes:

- Prefer JSON format for collectors: use format.defaultJsonFormat.
- Use AsyncBatch to reduce network overhead and smooth bursts.
- Redact secrets before sending: format.maskSensitive([...]).
- requestId from async context is automatically attached to logs.

---

## 📚 Future Work

- Syslog/journald transports for system logging
- OpenTelemetry integration (trace/span IDs propagation)
- More adapters and richer redaction/masking presets

---

## 🤝 Contributing

Contributions are welcome! Please feel free to submit issues and pull requests on the [GitHub repository](https://github.com/tolongames/scribelog).

---

## 📄 License

MIT License
Copyright (c) 2025 tolongames
See [LICENSE](./LICENSE) for details.
