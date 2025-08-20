import { AsyncLocalStorage } from 'async_hooks';

type ContextData = {
  requestId?: string;
  [key: string]: any;
};

const storage = new AsyncLocalStorage<ContextData>();

export function runWithRequestContext<T>(
  context: ContextData,
  fn: () => T
): T {
  return storage.run(context, fn);
}

export function setRequestId(requestId: string) {
  const store = storage.getStore();
  if (store) {
    store.requestId = requestId;
  }
}

export function getRequestId(): string | undefined {
  const store = storage.getStore();
  return store?.requestId;
}

export function setContextValue(key: string, value: any) {
  const store = storage.getStore();
  if (store) {
    store[key] = value;
  }
}

export function getContextValue<T = any>(key: string): T | undefined {
  const store = storage.getStore();
  return store ? store[key] : undefined;
}