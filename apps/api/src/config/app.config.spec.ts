import { appConfig } from './app.config';
import { DEFAULT_LEGACY_ACCESS_TOKEN_EXPIRES_IN_SECONDS } from './auth-session.constants';
import {
  DEFAULT_NATIVE_ACCESS_TOKEN_EXPIRES_IN_SECONDS,
  DEFAULT_NATIVE_SESSION_ABSOLUTE_EXPIRES_IN_SECONDS,
  DEFAULT_NATIVE_SESSION_IDLE_EXPIRES_IN_SECONDS,
} from './native-auth.constants';

describe('appConfig auth session defaults', () => {
  const originalJwtExpiresInSeconds = process.env.JWT_EXPIRES_IN_SECONDS;
  const originalNativeAccess =
    process.env.NATIVE_ACCESS_TOKEN_EXPIRES_IN_SECONDS;
  const originalNativeIdle = process.env.NATIVE_SESSION_IDLE_EXPIRES_IN_SECONDS;
  const originalNativeAbsolute =
    process.env.NATIVE_SESSION_ABSOLUTE_EXPIRES_IN_SECONDS;

  afterEach(() => {
    restoreEnv('JWT_EXPIRES_IN_SECONDS', originalJwtExpiresInSeconds);
    restoreEnv('NATIVE_ACCESS_TOKEN_EXPIRES_IN_SECONDS', originalNativeAccess);
    restoreEnv('NATIVE_SESSION_IDLE_EXPIRES_IN_SECONDS', originalNativeIdle);
    restoreEnv(
      'NATIVE_SESSION_ABSOLUTE_EXPIRES_IN_SECONDS',
      originalNativeAbsolute,
    );
  });

  it('defaults legacy access JWT expiry to a short session', () => {
    delete process.env.JWT_EXPIRES_IN_SECONDS;

    expect(appConfig().app.jwtExpiresInSeconds).toBe(
      DEFAULT_LEGACY_ACCESS_TOKEN_EXPIRES_IN_SECONDS,
    );
  });

  it('keeps JWT_EXPIRES_IN_SECONDS as a positive integer override', () => {
    process.env.JWT_EXPIRES_IN_SECONDS = '900';

    expect(appConfig().app.jwtExpiresInSeconds).toBe(900);
  });

  it('falls back to the short default for invalid expiry values', () => {
    process.env.JWT_EXPIRES_IN_SECONDS = 'not-a-number';

    expect(appConfig().app.jwtExpiresInSeconds).toBe(
      DEFAULT_LEGACY_ACCESS_TOKEN_EXPIRES_IN_SECONDS,
    );
  });

  it('keeps Native access short while defaulting refresh idle and absolute lifetimes independently', () => {
    delete process.env.NATIVE_ACCESS_TOKEN_EXPIRES_IN_SECONDS;
    delete process.env.NATIVE_SESSION_IDLE_EXPIRES_IN_SECONDS;
    delete process.env.NATIVE_SESSION_ABSOLUTE_EXPIRES_IN_SECONDS;

    const config = appConfig().app;
    expect(config.nativeAccessTokenExpiresInSeconds).toBe(
      DEFAULT_NATIVE_ACCESS_TOKEN_EXPIRES_IN_SECONDS,
    );
    expect(config.nativeSessionIdleExpiresInSeconds).toBe(
      DEFAULT_NATIVE_SESSION_IDLE_EXPIRES_IN_SECONDS,
    );
    expect(config.nativeSessionAbsoluteExpiresInSeconds).toBe(
      DEFAULT_NATIVE_SESSION_ABSOLUTE_EXPIRES_IN_SECONDS,
    );
  });
});

function restoreEnv(key: string, value: string | undefined): void {
  if (value === undefined) {
    delete process.env[key];
    return;
  }
  process.env[key] = value;
}
