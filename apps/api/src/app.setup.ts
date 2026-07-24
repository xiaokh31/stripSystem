import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiExceptionFilter } from './common/api-exception.filter';
import { requestLoggingMiddleware } from './common/request-logging.middleware';
import { createTrustedProxyPredicate } from './common/trusted-proxy';
import type { PublicDeploymentConfiguration } from './config/public-deployment.config';

export function configureApp(app: INestApplication): void {
  const publicDeployment = app
    .get(ConfigService)
    .get<PublicDeploymentConfiguration>('app.publicDeployment');
  if (!publicDeployment) {
    throw new Error('PUBLIC_CONFIG_INVALID:TYPED_CONFIGURATION_REQUIRED');
  }

  const express = app.getHttpAdapter().getInstance() as {
    set(name: string, value: unknown): void;
  };
  express.set(
    'trust proxy',
    publicDeployment.trustedProxyCidrs.length > 0
      ? createTrustedProxyPredicate(publicDeployment.trustedProxyCidrs)
      : false,
  );

  app.setGlobalPrefix('api');
  app.use(requestLoggingMiddleware(publicDeployment));
  app.use((_request: unknown, response: SecurityHeaderResponse, next: () => void) => {
    applySecurityHeaders(response, publicDeployment.enabled);
    next();
  });
  app.enableCors({
    allowedHeaders: ['Authorization', 'Content-Type', 'X-CSRF-Token', 'X-Request-Id'],
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
    origin: (
      origin: string | undefined,
      callback: (error: Error | null, allow?: boolean) => void,
    ) => {
      callback(null, !origin || publicDeployment.allowedOrigins.includes(origin));
    },
  });
  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: true,
    }),
  );
  app.useGlobalFilters(new ApiExceptionFilter(publicDeployment.enabled));
}

interface SecurityHeaderResponse {
  setHeader(name: string, value: string): void;
}

function applySecurityHeaders(
  response: SecurityHeaderResponse,
  publicDeploymentEnabled: boolean,
): void {
  response.setHeader(
    'Content-Security-Policy',
    "default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'",
  );
  response.setHeader('Permissions-Policy', 'camera=(), geolocation=(), microphone=()');
  response.setHeader('Referrer-Policy', 'no-referrer');
  response.setHeader('X-Content-Type-Options', 'nosniff');
  response.setHeader('X-Frame-Options', 'DENY');
  if (publicDeploymentEnabled) {
    response.setHeader(
      'Strict-Transport-Security',
      'max-age=31536000; includeSubDomains',
    );
  }
}
