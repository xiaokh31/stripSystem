import { ArgumentsHost, UnauthorizedException } from '@nestjs/common';
import { ApiExceptionFilter } from './api-exception.filter';

describe('ApiExceptionFilter', () => {
  const originalTimeZone = process.env.OPERATIONAL_TIME_ZONE;

  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-06-29T20:47:49.276Z'));
    process.env.OPERATIONAL_TIME_ZONE = 'America/Edmonton';
  });

  afterEach(() => {
    jest.useRealTimers();
    if (originalTimeZone === undefined) {
      delete process.env.OPERATIONAL_TIME_ZONE;
    } else {
      process.env.OPERATIONAL_TIME_ZONE = originalTimeZone;
    }
  });

  it('formats API error timestamps in the operational time zone', () => {
    const json = jest.fn();
    const status = jest.fn().mockReturnValue({ json });
    const host = {
      switchToHttp: () => ({
        getResponse: () => ({ status }),
        getRequest: () => ({ url: '/api/reports/download' }),
      }),
    } as unknown as ArgumentsHost;

    new ApiExceptionFilter().catch(
      new UnauthorizedException({
        code: 'UNAUTHENTICATED',
        message: 'Bearer token is required.',
        details: {},
      }),
      host,
    );

    expect(status).toHaveBeenCalledWith(401);
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({
        code: 'UNAUTHENTICATED',
        path: '/api/reports/download',
        timestamp: '2026-06-29 14:47:49 MDT',
      }),
    );
  });
});
