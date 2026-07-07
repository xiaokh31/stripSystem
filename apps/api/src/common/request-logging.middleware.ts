import { NextFunction, Request, Response } from 'express';
import { randomUUID } from 'node:crypto';
import { StructuredLogger } from './structured-logger.service';

const REQUEST_ID_HEADER = 'x-request-id';

export function requestLoggingMiddleware(
  logger = new StructuredLogger('HttpRequest'),
) {
  return (request: Request, response: Response, next: NextFunction): void => {
    const requestId = requestIdFromHeader(request) ?? randomUUID();
    const startedAt = process.hrtime.bigint();

    response.setHeader(REQUEST_ID_HEADER, requestId);

    response.on('finish', () => {
      const durationMs =
        Number(process.hrtime.bigint() - startedAt) / 1_000_000;
      const statusCode = response.statusCode;
      const logPayload = {
        durationMs: Number(durationMs.toFixed(2)),
        event: 'http_request',
        method: request.method,
        path: request.path,
        remoteAddress: request.ip || request.socket.remoteAddress || null,
        requestId,
        statusCode,
        userAgent: request.get('user-agent') ?? null,
      };

      if (statusCode >= 500) {
        logger.error(logPayload);
      } else if (statusCode >= 400) {
        logger.warn(logPayload);
      } else {
        logger.log(logPayload);
      }
    });

    next();
  };
}

function requestIdFromHeader(request: Request): string | null {
  const value = request.get(REQUEST_ID_HEADER);
  if (!value) {
    return null;
  }

  const trimmed = value.trim();
  if (!trimmed || trimmed.length > 128) {
    return null;
  }

  return trimmed;
}
