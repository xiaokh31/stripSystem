import { LoggerService } from '@nestjs/common';
import { inspect } from 'node:util';

type StructuredLogLevel = 'debug' | 'error' | 'info' | 'verbose' | 'warn';

interface StructuredLogRecord {
  context: string;
  details?: unknown;
  level: StructuredLogLevel;
  message: string;
  service: string;
  stack?: string;
  timestamp: string;
}

const REDACTED = '[REDACTED]';
const SENSITIVE_KEY_PATTERN =
  /(authorization|cookie|jwt|password|secret|token)/i;

export class StructuredLogger implements LoggerService {
  constructor(private readonly defaultContext = 'Application') {}

  log(message: unknown, ...optionalParams: unknown[]): void {
    this.write('info', message, optionalParams);
  }

  error(message: unknown, ...optionalParams: unknown[]): void {
    this.write('error', message, optionalParams);
  }

  warn(message: unknown, ...optionalParams: unknown[]): void {
    this.write('warn', message, optionalParams);
  }

  debug(message: unknown, ...optionalParams: unknown[]): void {
    this.write('debug', message, optionalParams);
  }

  verbose(message: unknown, ...optionalParams: unknown[]): void {
    this.write('verbose', message, optionalParams);
  }

  private write(
    level: StructuredLogLevel,
    message: unknown,
    optionalParams: unknown[],
  ): void {
    const record: StructuredLogRecord = {
      context: this.context(level, optionalParams),
      level,
      message: this.messageText(message),
      service: process.env.SERVICE_NAME?.trim() || 'bestar-api',
      timestamp: new Date().toISOString(),
    };

    const details = this.details(message);
    if (details !== undefined) {
      record.details = details;
    }

    const stack = this.stackTrace(optionalParams);
    if (stack) {
      record.stack = stack;
    }

    const line = `${this.stringify(record)}\n`;
    if (level === 'error' || level === 'warn') {
      process.stderr.write(line);
      return;
    }
    process.stdout.write(line);
  }

  private context(
    level: StructuredLogLevel,
    optionalParams: unknown[],
  ): string {
    if (level === 'error' && optionalParams.length < 2) {
      return this.defaultContext;
    }

    const last = optionalParams.at(-1);
    return typeof last === 'string' && last.trim() ? last : this.defaultContext;
  }

  private stackTrace(optionalParams: unknown[]): string | undefined {
    const first = optionalParams[0];
    if (typeof first === 'string' && optionalParams.length > 1) {
      return first;
    }
    return undefined;
  }

  private messageText(message: unknown): string {
    if (typeof message === 'string') {
      return message;
    }
    if (message instanceof Error) {
      return message.message;
    }
    if (this.isRecord(message) && typeof message.message === 'string') {
      return message.message;
    }
    if (this.isRecord(message) && typeof message.event === 'string') {
      return message.event;
    }
    return inspect(message, { breakLength: Infinity, depth: 4 });
  }

  private details(message: unknown): unknown {
    if (typeof message === 'string' || message instanceof Error) {
      return undefined;
    }
    return message;
  }

  private stringify(value: unknown): string {
    const seen = new WeakSet<object>();

    return JSON.stringify(value, (key, innerValue: unknown) => {
      if (SENSITIVE_KEY_PATTERN.test(key)) {
        return REDACTED;
      }
      if (typeof innerValue === 'bigint') {
        return innerValue.toString();
      }
      if (innerValue instanceof Error) {
        return {
          message: innerValue.message,
          name: innerValue.name,
          stack: innerValue.stack,
        };
      }
      if (innerValue && typeof innerValue === 'object') {
        if (seen.has(innerValue)) {
          return '[Circular]';
        }
        seen.add(innerValue);
      }
      return innerValue;
    });
  }

  private isRecord(value: unknown): value is Record<string, unknown> {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
  }
}
