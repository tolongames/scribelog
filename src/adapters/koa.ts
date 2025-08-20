import type { LoggerInterface, LogLevel } from '../types';
import { runWithRequestContext } from '../requestContext';
import { createLogger } from '../logger';

export interface KoaLoggerOptions {
  logger?: LoggerInterface;
  headerName?: string;
  generateId?: () => string;
  redactHeaders?: string[];
  logRequest?: boolean;
  logResponse?: boolean;
  levelRequest?: LogLevel;
  levelResponse?: LogLevel;
  tags?: string[];
  maxHeaderValueLength?: number;
}

function defaultId(): string {
  return `req_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function redactHeaders(
  headers: Record<string, any> | undefined,
  redact: string[],
  maxLen: number
) {
  const out: Record<string, any> = {};
  if (!headers) return out;
  const redactSet = new Set(redact.map((h) => h.toLowerCase()));
  for (const [k, v] of Object.entries(headers)) {
    const key = k.toLowerCase();
    let val =
      typeof v === 'string' ? v : Array.isArray(v) ? v.join(', ') : String(v);
    if (redactSet.has(key)) val = '***';
    if (maxLen > 0 && val.length > maxLen) val = val.slice(0, maxLen) + '…';
    out[key] = val;
  }
  return out;
}

/**
 * Koa middleware: automatyczne requestId + logi start/stop.
 */
export function createKoaMiddleware(options: KoaLoggerOptions = {}) {
  const {
    logger = createLogger(),
    headerName = 'x-request-id',
    generateId = defaultId,
    redactHeaders: redact = ['authorization', 'cookie', 'set-cookie'],
    logRequest = true,
    logResponse = true,
    levelRequest = 'http',
    levelResponse = 'info',
    tags = ['koa'],
    maxHeaderValueLength = 256,
  } = options;

  return async function koaLogger(ctx: any, next: any) {
    const rid = ctx.request.headers[headerName] || generateId();
    const start = process.hrtime.bigint();

    await runWithRequestContext({ requestId: String(rid) }, async () => {
      if (logRequest) {
        const safeHeaders = redactHeaders(
          ctx.request.headers,
          redact,
          maxHeaderValueLength
        );
        (logger as any)[levelRequest]('HTTP request', {
          requestId: rid,
          method: ctx.method,
          url: ctx.originalUrl || ctx.url,
          tags,
          headers: safeHeaders,
        });
      }

      try {
        await next();
      } finally {
        const durationMs = Number(process.hrtime.bigint() - start) / 1e6;
        if (logResponse) {
          (logger as any)[levelResponse]('HTTP response', {
            requestId: rid,
            method: ctx.method,
            url: ctx.originalUrl || ctx.url,
            statusCode: ctx.status,
            durationMs: Math.round(durationMs),
            tags,
          });
        }
      }
    });
  };
}
