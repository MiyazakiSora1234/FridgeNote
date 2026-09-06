export type LogLevel = "debug" | "info" | "warn" | "error";
export type LogFields = Record<string, unknown>;

const LEVEL_ORDER: Record<LogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40 };

function resolveMinLevel(): LogLevel {
  const raw = (process.env.LOG_LEVEL ?? "").toLowerCase();
  return raw === "debug" || raw === "info" || raw === "warn" || raw === "error" ? raw : "info";
}

function serializeError(err: unknown): LogFields {
  if (err instanceof Error) {
    const extra: LogFields = {};
    for (const key of ["reason", "raw", "status", "code"] as const) {
      if (key in err) extra[key] = (err as unknown as LogFields)[key];
    }
    return { name: err.name, message: err.message, stack: err.stack, ...extra };
  }
  return { value: err };
}

export interface Logger {
  debug(message: string, fields?: LogFields): void;
  info(message: string, fields?: LogFields): void;
  warn(message: string, fields?: LogFields & { err?: unknown }): void;
  error(message: string, fields?: LogFields & { err?: unknown }): void;
  child(bindings: LogFields): Logger;
}

function createLogger(base: LogFields): Logger {
  const minLevel = resolveMinLevel();

  function write(level: LogLevel, message: string, fields: LogFields = {}): void {
    if (LEVEL_ORDER[level] < LEVEL_ORDER[minLevel]) return;

    const { err, ...rest } = fields as LogFields & { err?: unknown };
    const entry: LogFields = {
      timestamp: new Date().toISOString(),
      level,
      message,
      ...base,
      ...rest,
    };
    if (err !== undefined) entry.error = serializeError(err);

    const line = JSON.stringify(entry);
    if (level === "warn" || level === "error") {
      console.error(line);
    } else {
      console.log(line);
    }
  }

  return {
    debug: (message, fields) => write("debug", message, fields),
    info: (message, fields) => write("info", message, fields),
    warn: (message, fields) => write("warn", message, fields),
    error: (message, fields) => write("error", message, fields),
    child: (bindings) => createLogger({ ...base, ...bindings }),
  };
}

export const logger = createLogger({
  functionName: process.env.AWS_LAMBDA_FUNCTION_NAME,
});
