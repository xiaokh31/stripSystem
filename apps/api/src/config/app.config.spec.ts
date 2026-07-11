import { appConfig } from './app.config';
import { DEFAULT_BROWSER_SESSION_EXPIRES_IN_SECONDS } from './auth-session.constants';

describe('appConfig auth session defaults', () => {
  const originalJwtExpiresInSeconds = process.env.JWT_EXPIRES_IN_SECONDS;

  afterEach(() => {
    restoreEnv('JWT_EXPIRES_IN_SECONDS', originalJwtExpiresInSeconds);
  });

  it('defaults browser login JWT expiry to a 400-day persistent session', () => {
    delete process.env.JWT_EXPIRES_IN_SECONDS;

    expect(appConfig().app.jwtExpiresInSeconds).toBe(
      DEFAULT_BROWSER_SESSION_EXPIRES_IN_SECONDS,
    );
  });

  it('keeps JWT_EXPIRES_IN_SECONDS as a positive integer override', () => {
    process.env.JWT_EXPIRES_IN_SECONDS = '900';

    expect(appConfig().app.jwtExpiresInSeconds).toBe(900);
  });

  it('falls back to the persistent default for invalid expiry values', () => {
    process.env.JWT_EXPIRES_IN_SECONDS = 'not-a-number';

    expect(appConfig().app.jwtExpiresInSeconds).toBe(
      DEFAULT_BROWSER_SESSION_EXPIRES_IN_SECONDS,
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
