import { randomUUID } from "node:crypto";

/** Structured JSON logs with a correlation id per job run. */
export type Logger = ((event: string, data?: Record<string, unknown>) => void) & { child?: (extra: Record<string, unknown>) => Logger };

export function createLogger(base: Record<string, unknown> = {}, sink: (line: string) => void = (l) => process.stdout.write(l + "\n")): Logger & { child(extra: Record<string, unknown>): Logger } {
  const log = ((event: string, data: Record<string, unknown> = {}) => sink(JSON.stringify({ ts: new Date().toISOString(), event, ...base, ...data }))) as Logger & { child(extra: Record<string, unknown>): Logger };
  log.child = (extra) => createLogger({ ...base, ...extra }, sink);
  return log;
}

export const newCorrelationId = () => randomUUID();

/** Sentry-compatible error hook; a no-op without SENTRY_DSN. GAP: DSN transport not implemented — errors are logged as JSON. */
export function reportError(err: unknown, context: Record<string, unknown> = {}) {
  if (!process.env.SENTRY_DSN) return;
  process.stderr.write(JSON.stringify({ level: "error", event: "error_report", message: (err as Error)?.message, ...context }) + "\n");
}
