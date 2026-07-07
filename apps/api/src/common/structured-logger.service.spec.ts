import { StructuredLogger } from './structured-logger.service';

describe('StructuredLogger', () => {
  let stdout: jest.SpyInstance;
  let stderr: jest.SpyInstance;

  beforeEach(() => {
    stdout = jest.spyOn(process.stdout, 'write').mockImplementation(() => true);
    stderr = jest.spyOn(process.stderr, 'write').mockImplementation(() => true);
  });

  afterEach(() => {
    stdout.mockRestore();
    stderr.mockRestore();
  });

  it('writes redacted JSON info logs to stdout', () => {
    new StructuredLogger('TestContext').log({
      authorization: 'Bearer secret',
      event: 'login_attempt',
      message: 'User login',
      password: 'secret',
      userId: 'user-1',
    });

    expect(stdout).toHaveBeenCalledTimes(1);
    expect(stderr).not.toHaveBeenCalled();
    const payload = JSON.parse(String(stdout.mock.calls[0][0])) as {
      context: string;
      details: { authorization: string; password: string; userId: string };
      level: string;
      message: string;
    };
    expect(payload).toEqual(
      expect.objectContaining({
        context: 'TestContext',
        level: 'info',
        message: 'User login',
      }),
    );
    expect(payload.details.authorization).toBe('[REDACTED]');
    expect(payload.details.password).toBe('[REDACTED]');
    expect(payload.details.userId).toBe('user-1');
  });

  it('writes error logs to stderr with stack text', () => {
    new StructuredLogger('TestContext').error(
      'Unexpected failure',
      'stack-line',
      'OverrideContext',
    );

    expect(stderr).toHaveBeenCalledTimes(1);
    expect(stdout).not.toHaveBeenCalled();
    const payload = JSON.parse(String(stderr.mock.calls[0][0])) as {
      context: string;
      level: string;
      message: string;
      stack: string;
    };
    expect(payload).toEqual(
      expect.objectContaining({
        context: 'OverrideContext',
        level: 'error',
        message: 'Unexpected failure',
        stack: 'stack-line',
      }),
    );
  });
});
