import type { LoggerInterface, LogLevel } from '../types';
import { runWithRequestContext } from '../requestContext';
import { createLogger } from '../logger';

export interface NextApiLoggerOptions {
  logger?: LoggerInterface;
  headerName?: string;
  generateId?: () => string;
  levelRequest?: LogLevel;
  levelResponse?: LogLevel;
  tags?: string[];
}

function defaultId(): string {
  return `req_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Wrapper dla Next.js API routes (Node runtime).
 * Uwaga: nie dla Edge Runtime (brak AsyncLocalStorage).
 */
export function createNextApiHandler<T extends (...args: any[]) => any>(
  handler: T,
  opts: NextApiLoggerOptions = {}
): T {
  const {
    logger = createLogger(),
    headerName = 'x-request-id',
    generateId = defaultId,
    levelRequest = 'http',
    levelResponse = 'info',
    tags = ['next'],
  } = opts;

  const wrapped = ((req: any, res: any, ...rest: any[]) => {
    const rid = (req?.headers?.[headerName]) || generateId();
    const start = process.hrtime.bigint();

    return runWithRequestContext({ requestId: String(rid) }, async () => {
      (logger as any)[levelRequest]('HTTP request', {
        requestId: rid,
        method: req?.method,
        url: req?.url,
        tags,
      });
      try {
        const result = await handler(req, res, ...rest);
        return result;
      } finally {
        const durationMs = Number(process.hrtime.bigint() - start) / 1e6;
        (logger as any)[levelResponse]('HTTP response', {
          requestId: rid,
          method: req?.method,
          url: req?.url,
          statusCode: res?.statusCode,
          durationMs: Math.round(durationMs),
          tags,
        });
      }
    });
  }) as T;

  return wrapped;
}