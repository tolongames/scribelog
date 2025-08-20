import type { LoggerInterface, LogLevel } from '../types';
import { runWithRequestContext } from '../requestContext';
import { createLogger } from '../logger';

export interface FastifyLoggerOptions {
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
 * Rejestrator dla Fastify: wywołaj zwróconą funkcję z instancją fastify.
 */
export function createFastifyPlugin(options: FastifyLoggerOptions = {}) {
  const {
    logger = createLogger(),
    headerName = 'x-request-id',
    generateId = defaultId,
    redactHeaders: redact = ['authorization', 'cookie', 'set-cookie'],
    logRequest = true,
    logResponse = true,
    levelRequest = 'http',
    levelResponse = 'info',
    tags = ['fastify'],
    maxHeaderValueLength = 256,
  } = options;

  return function registerFastifyLogger(fastify: any) {
    fastify.addHook('onRequest', (req: any, reply: any, done: any) => {
      const rid = (req.headers && req.headers[headerName]) || generateId();
      const start = process.hrtime.bigint();
      (req as any).__scribelogStart = start;
      (req as any).__scribelogRequestId = String(rid);

      runWithRequestContext({ requestId: String(rid) }, () => {
        if (logRequest) {
          const safeHeaders = redactHeaders(
            req.headers,
            redact,
            maxHeaderValueLength
          );
          (logger as any)[levelRequest]('HTTP request', {
            requestId: rid,
            method: req.method,
            url: req.url,
            tags,
            headers: safeHeaders,
          });
        }
        done();
      });
    });

    fastify.addHook('onResponse', (req: any, reply: any, done: any) => {
      const start: bigint | undefined = (req as any).__scribelogStart;
      const rid: string | undefined = (req as any).__scribelogRequestId;
      const durationMs =
        start !== undefined
          ? Number(process.hrtime.bigint() - start) / 1e6
          : undefined;
      if (logResponse) {
        (logger as any)[levelResponse]('HTTP response', {
          requestId: rid,
          method: req.method,
          url: req.url,
          statusCode: reply.statusCode,
          durationMs:
            durationMs !== undefined ? Math.round(durationMs) : undefined,
          tags,
        });
      }
      done();
    });

    fastify.addHook('onError', (req: any, reply: any, err: any, done: any) => {
      (logger as any).error('HTTP error', {
        requestId: (req as any).__scribelogRequestId,
        method: req.method,
        url: req.url,
        statusCode: reply?.statusCode,
        error: err,
        tags,
      });
      done();
    });
  };
}
