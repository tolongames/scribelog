import type { LoggerInterface, LogLevel } from '../types';
import { runWithRequestContext } from '../requestContext';
import { createLogger } from '../logger';

export interface ExpressLoggerOptions {
  logger?: LoggerInterface;
  headerName?: string; // np. 'x-request-id'
  generateId?: () => string;
  redactHeaders?: string[];
  logRequest?: boolean;
  logResponse?: boolean;
  levelRequest?: LogLevel;
  levelResponse?: LogLevel;
  tags?: string[]; // np. ['express']
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
 * Express middleware: automatyczne ustawienie requestId + logi start/stop.
 */
export function createExpressMiddleware(opts: ExpressLoggerOptions = {}) {
  const {
    logger = createLogger(),
    headerName = 'x-request-id',
    generateId = defaultId,
    redactHeaders: redact = ['authorization', 'cookie', 'set-cookie'],
    logRequest = true,
    logResponse = true,
    levelRequest = 'http',
    levelResponse = 'info',
    tags = ['express'],
    maxHeaderValueLength = 256,
  } = opts;

  return function expressLogger(req: any, res: any, next: any) {
    const rid =
      (req.headers && (req.headers[headerName] as string)) || generateId();

    const start = process.hrtime.bigint();
    const baseMeta = {
      requestId: rid,
      method: req.method,
      url: req.originalUrl || req.url,
      tags,
    };

    runWithRequestContext({ requestId: rid }, () => {
      if (logRequest) {
        const safeHeaders = redactHeaders(
          req.headers,
          redact,
          maxHeaderValueLength
        );
        (logger as any)[levelRequest]('HTTP request', {
          ...baseMeta,
          headers: safeHeaders,
        });
      }

      res.on('finish', () => {
        const durationMs = Number(process.hrtime.bigint() - start) / 1e6;
        const contentLength = res.getHeader?.('content-length');
        if (logResponse) {
          (logger as any)[levelResponse]('HTTP response', {
            ...baseMeta,
            statusCode: res.statusCode,
            durationMs: Math.round(durationMs),
            contentLength: contentLength ? Number(contentLength) : undefined,
          });
        }
      });

      next();
    });
  };
}
