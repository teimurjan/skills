import "server-only";
import { AsyncLocalStorage } from "node:async_hooks";
import { clientVersion } from "./client-version";

/**
 * Structured request logging for API routes — one JSON line per request, so a
 * log explorer can filter and aggregate by route, status, or outcome. Wrap a
 * route handler with `withLogging`; enrich its line from inside the handler
 * with `logFields` (deviceId, outcome, productId, …).
 *
 * Logs metadata only — never tokens, transactions, or request/response bodies.
 */

interface RequestLog {
  fields: Record<string, unknown>;
}

const store = new AsyncLocalStorage<RequestLog>();

/** Attach fields to the current request's log line. No-op outside `withLogging`. */
export function logFields(fields: Record<string, unknown>): void {
  const current = store.getStore();
  if (current) Object.assign(current.fields, fields);
}

type Handler<C> = (request: Request, context: C) => Promise<Response> | Response;

/**
 * Wrap a route handler so every request emits `{ route, method, status, ms, … }`.
 * `route` is a stable label for grouping (the URL path carries variable ids).
 */
export function withLogging<C>(route: string, handler: Handler<C>): Handler<C> {
  return (request, context) =>
    store.run({ fields: {} }, async () => {
      const start = performance.now();
      const base = {
        route,
        method: request.method,
        hasAuth: request.headers.has("authorization"),
        // Null for builds that predate the header — old by definition.
        appVersion: clientVersion(request),
      };
      try {
        const response = await handler(request, context);
        emit(response.status, { ...base, status: response.status, ms: elapsed(start), ...fields() });
        return response;
      } catch (error) {
        emit(500, {
          ...base,
          status: 500,
          ms: elapsed(start),
          error: error instanceof Error ? error.message : String(error),
          ...fields(),
        });
        throw error;
      }
    });
}

const fields = (): Record<string, unknown> => store.getStore()?.fields ?? {};
const elapsed = (start: number): number => Math.round(performance.now() - start);

/** 5xx → error stream; else standard out. */
function emit(status: number, record: Record<string, unknown>): void {
  const line = JSON.stringify(record);
  if (status >= 500) console.error(line);
  else console.log(line);
}
