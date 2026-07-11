import {
  Injectable,
  InternalServerErrorException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { DEFAULT_BROWSER_SESSION_EXPIRES_IN_SECONDS } from '../config/auth-session.constants';

export interface AuthTokenPayload {
  sub: string;
  email: string | null;
  roles: string[];
  iat: number;
  exp: number;
  permissionsIssuedAt: number;
}

@Injectable()
export class AuthTokenService {
  constructor(private readonly configService: ConfigService) {}

  get expiresInSeconds(): number {
    const configured = this.configService.get<number>(
      'app.jwtExpiresInSeconds',
    );
    return typeof configured === 'number' &&
      Number.isFinite(configured) &&
      configured > 0
      ? configured
      : DEFAULT_BROWSER_SESSION_EXPIRES_IN_SECONDS;
  }

  sign(
    payload: Omit<AuthTokenPayload, 'iat' | 'exp' | 'permissionsIssuedAt'>,
  ): {
    accessToken: string;
    expiresIn: number;
  } {
    const issuedAt = Math.floor(Date.now() / 1000);
    const expiresIn = this.expiresInSeconds;
    const tokenPayload: AuthTokenPayload = {
      ...payload,
      iat: issuedAt,
      exp: issuedAt + expiresIn,
      permissionsIssuedAt: issuedAt,
    };
    const encodedHeader = this.encodeJson({ alg: 'HS256', typ: 'JWT' });
    const encodedPayload = this.encodeJson(tokenPayload);
    const signature = this.signingInput(`${encodedHeader}.${encodedPayload}`);

    return {
      accessToken: `${encodedHeader}.${encodedPayload}.${signature}`,
      expiresIn,
    };
  }

  verifyBearerHeader(authorization: string | undefined): AuthTokenPayload {
    if (!authorization) {
      throw this.unauthenticated('Bearer token is required.');
    }

    const [tokenType, token] = authorization.split(' ');
    if (tokenType !== 'Bearer' || !token) {
      throw this.unauthenticated('Bearer token is required.');
    }

    return this.verify(token);
  }

  verify(token: string): AuthTokenPayload {
    const [encodedHeader, encodedPayload, encodedSignature] = token.split('.');
    if (!encodedHeader || !encodedPayload || !encodedSignature) {
      throw this.unauthenticated('Bearer token is invalid.');
    }

    const header = this.decodeJson<JwtHeader>(encodedHeader);
    if (header.alg !== 'HS256' || header.typ !== 'JWT') {
      throw this.unauthenticated('Bearer token is invalid.');
    }

    const expectedSignature = this.signingInput(
      `${encodedHeader}.${encodedPayload}`,
    );
    if (!this.equalSignatures(encodedSignature, expectedSignature)) {
      throw this.unauthenticated('Bearer token is invalid.');
    }

    const payload = this.decodeJson<AuthTokenPayload>(encodedPayload);
    if (!this.isPayload(payload)) {
      throw this.unauthenticated('Bearer token is invalid.');
    }

    if (payload.exp <= Math.floor(Date.now() / 1000)) {
      throw this.unauthenticated('Bearer token is expired.');
    }

    return payload;
  }

  private signingInput(input: string): string {
    return createHmac('sha256', this.jwtSecret)
      .update(input)
      .digest('base64url');
  }

  private get jwtSecret(): string {
    const secret = this.configService.get<string>('app.jwtSecret')?.trim();
    if (!secret) {
      throw new InternalServerErrorException({
        code: 'JWT_SECRET_REQUIRED',
        message:
          'JWT_SECRET must be configured before auth tokens can be used.',
        details: {},
      });
    }
    return secret;
  }

  private encodeJson(value: unknown): string {
    return Buffer.from(JSON.stringify(value)).toString('base64url');
  }

  private decodeJson<T>(encoded: string): T {
    try {
      return JSON.parse(
        Buffer.from(encoded, 'base64url').toString('utf8'),
      ) as T;
    } catch {
      throw this.unauthenticated('Bearer token is invalid.');
    }
  }

  private equalSignatures(actual: string, expected: string): boolean {
    const actualBuffer = Buffer.from(actual);
    const expectedBuffer = Buffer.from(expected);
    return (
      actualBuffer.length === expectedBuffer.length &&
      timingSafeEqual(actualBuffer, expectedBuffer)
    );
  }

  private isPayload(value: unknown): value is AuthTokenPayload {
    return (
      value !== null &&
      typeof value === 'object' &&
      typeof (value as AuthTokenPayload).sub === 'string' &&
      ((value as AuthTokenPayload).email === null ||
        typeof (value as AuthTokenPayload).email === 'string') &&
      Array.isArray((value as AuthTokenPayload).roles) &&
      typeof (value as AuthTokenPayload).iat === 'number' &&
      typeof (value as AuthTokenPayload).exp === 'number' &&
      typeof (value as AuthTokenPayload).permissionsIssuedAt === 'number'
    );
  }

  private unauthenticated(message: string): UnauthorizedException {
    return new UnauthorizedException({
      code: 'UNAUTHENTICATED',
      message,
      details: {},
    });
  }
}

interface JwtHeader {
  alg: string;
  typ: string;
}
