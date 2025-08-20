import type { LoggerInterface, LogLevel } from '../types';
import { runWithRequestContext } from '../requestContext';
import { createLogger } from '../logger';

export interface NestLoggerOptions {
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
 * Interceptor kompatybilny z NestJS (bez zależności od @nestjs/*).
 * Użycie: app.useGlobalInterceptors(createNestInterceptor({ logger }));
 */
export function createNestInterceptor(opts: NestLoggerOptions = {}) {
  const {
    logger = createLogger(),
    headerName = 'x-request-id',
    generateId = defaultId,
    levelRequest = 'http',
    levelResponse = 'info',
    tags = ['nest'],
  } = opts;

  return {
    intercept(ctx: any, next: any) {
      const req = ctx.switchToHttp?.().getRequest?.() ?? ctx.getRequest?.();
      const res = ctx.switchToHttp?.().getResponse?.() ?? ctx.getResponse?.();
      const rid = (req?.headers?.[headerName]) || generateId();
      const start = process.hrtime.bigint();

      return runWithRequestContext({ requestId: String(rid) }, () => {
        (logger as any)[levelRequest]('HTTP request', {
          requestId: rid,
          method: req?.method,
          url: req?.originalUrl || req?.url,
          tags,
        });

        const handle = next?.handle ? next.handle() : next();
        // Obsługa Observable/Promise/prymityw
        if (handle && typeof handle.subscribe === 'function') {
          // Observable
          return handle.pipe({
            finalize: () => {
              const durationMs = Number(process.hrtime.bigint() - start) / 1e6;
              (logger as any)[levelResponse]('HTTP response', {
                requestId: rid,
                method: req?.method,
                url: req?.originalUrl || req?.url,
                statusCode: res?.statusCode,
                durationMs: Math.round(durationMs),
                tags,
              });
            },
          });
        } else if (handle && typeof handle.then === 'function') {
          // Promise
          return handle.finally(() => {
            const durationMs = Number(process.hrtime.bigint() - start) / 1e6;
            (logger as any)[levelResponse]('HTTP response', {
              requestId: rid,
              method: req?.method,
              url: req?.originalUrl || req?.url,
              statusCode: res?.statusCode,
              durationMs: Math.round(durationMs),
              tags,
            });
          });
        } else {
          // Sync
          const durationMs = Number(process.hrtime.bigint() - start) / 1e6;
          (logger as any)[levelResponse]('HTTP response', {
            requestId: rid,
            method: req?.method,
            url: req?.originalUrl || req?.url,
            statusCode: res?.statusCode,
            durationMs: Math.round(durationMs),
            tags,
          });
          return handle;
        }
      });
    },
  };
}