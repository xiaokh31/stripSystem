import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { Response } from 'express';
import { operationalDateTime } from './operational-time';
import { StructuredLogger } from './structured-logger.service';

interface ApiErrorBody {
  code: string;
  message: string;
  details: unknown;
  timestamp: string;
  path: string;
}

@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  private readonly logger = new StructuredLogger(ApiExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<{ url?: string }>();
    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;

    const code = this.errorCode(status, exception);
    const message = this.errorMessage(exception);
    this.logException({
      code,
      exception,
      message,
      path: request.url ?? '',
      status,
    });

    response.status(status).json({
      code,
      message,
      details: this.errorDetails(exception),
      timestamp: operationalDateTime(),
      path: request.url ?? '',
    } satisfies ApiErrorBody);
  }

  private errorCode(status: number, exception: unknown): string {
    if (!(exception instanceof HttpException)) {
      return 'INTERNAL_SERVER_ERROR';
    }

    const body = exception.getResponse();
    if (this.hasStringCode(body)) {
      return body.code;
    }

    return HttpStatus[status] ?? 'HTTP_ERROR';
  }

  private errorMessage(exception: unknown): string {
    if (exception instanceof HttpException) {
      const body = exception.getResponse();
      if (typeof body === 'string') {
        return body;
      }
      if (this.hasStringMessage(body)) {
        return body.message;
      }
      return exception.message;
    }

    if (exception instanceof Error) {
      return exception.message;
    }

    return 'Unexpected error';
  }

  private errorDetails(exception: unknown): unknown {
    if (!(exception instanceof HttpException)) {
      return {};
    }

    const body = exception.getResponse();
    if (typeof body === 'string') {
      return {};
    }
    if (body && typeof body === 'object' && 'details' in body) {
      return body.details;
    }
    return {};
  }

  private hasStringCode(value: unknown): value is { code: string } {
    return (
      value !== null &&
      typeof value === 'object' &&
      'code' in value &&
      typeof value.code === 'string'
    );
  }

  private hasStringMessage(value: unknown): value is { message: string } {
    return (
      value !== null &&
      typeof value === 'object' &&
      'message' in value &&
      typeof value.message === 'string'
    );
  }

  private logException(input: {
    code: string;
    exception: unknown;
    message: string;
    path: string;
    status: number;
  }): void {
    const payload = {
      code: input.code,
      event: 'api_exception',
      message: input.message,
      path: input.path,
      status: input.status,
    };

    if (input.status >= 500) {
      this.logger.error(
        payload,
        input.exception instanceof Error ? input.exception.stack : undefined,
      );
      return;
    }

    this.logger.warn(payload);
  }
}
