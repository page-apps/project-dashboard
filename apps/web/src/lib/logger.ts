import { type Logger, pino } from "pino";

type LogLevel = "trace" | "debug" | "info" | "warn" | "error" | "fatal";
type LogFields = Record<string, unknown>;

interface BrowserLogRecord extends LogFields {
  level?: number;
  msg?: string;
  time?: number;
}

let globalErrorHandlersInstalled = false;

export const logger = createLogger();

export function installGlobalErrorHandlers(): void {
  if (globalErrorHandlersInstalled || typeof globalThis === "undefined") {
    return;
  }

  globalErrorHandlersInstalled = true;

  globalThis.addEventListener("error", (event) => {
    logger.error(
      {
        filename: event.filename,
        lineno: event.lineno,
        colno: event.colno,
      },
      event.message || "Unhandled window error",
    );
  });

  globalThis.addEventListener("unhandledrejection", (event) => {
    logger.error(
      {
        reason: stringifyUnknown(event.reason),
      },
      "Unhandled promise rejection",
    );
  });
}

function createLogger(): Logger {
  return pino({
    name: "project-dashboard",
    level: "info",
    base: {
      service: "project-dashboard",
      runtime: "browser",
    },
    browser: {
      asObject: true,
      write: (record: object) => {
        const normalizedRecord = normalizeBrowserRecord(record);
        writeToConsole(normalizedRecord);
      },
    },
  });
}

function writeToConsole(record: BrowserLogRecord): void {
  if (import.meta.env.MODE === "test") {
    return;
  }

  const level = mapLevelNumberToLabel(record.level);
  const consoleMethod = mapLevelToConsoleMethod(level);
  const message = record.msg ?? "Application log";

  consoleMethod(message, record);
}

function mapLevelNumberToLabel(level?: number): LogLevel {
  if (!level) {
    return "info";
  }

  if (level >= 60) {
    return "fatal";
  }
  if (level >= 50) {
    return "error";
  }
  if (level >= 40) {
    return "warn";
  }
  if (level >= 30) {
    return "info";
  }
  if (level >= 20) {
    return "debug";
  }
  return "trace";
}

function mapLevelToConsoleMethod(level: LogLevel): (...data: unknown[]) => void {
  switch (level) {
    case "fatal":
    case "error":
      return console.error;
    case "warn":
      return console.warn;
    case "debug":
      return console.debug;
    case "trace":
      return console.trace;
    case "info":
    default:
      return console.info;
  }
}

function stringifyUnknown(value: unknown): string {
  if (value instanceof Error) {
    return `${value.name}: ${value.message}`;
  }

  return typeof value === "string" ? value : JSON.stringify(value);
}

function normalizeBrowserRecord(record: object): BrowserLogRecord {
  return Object.fromEntries(Object.entries(record)) as BrowserLogRecord;
}
