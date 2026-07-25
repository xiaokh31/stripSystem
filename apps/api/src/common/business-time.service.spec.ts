import {
  BusinessTimeService,
  COMPLETION_FUTURE_TOLERANCE_MS,
  ServerClock,
} from './business-time.service';

class FixedClock extends ServerClock {
  constructor(private readonly value: Date) {
    super();
  }

  override now(): Date {
    return new Date(this.value);
  }
}

describe('BusinessTimeService', () => {
  it('uses Edmonton month boundaries across MST, MDT, year end, and DST', () => {
    const service = fixed('2026-07-24T18:00:00.000Z');

    expect(service.monthRange('2026-01')).toEqual({
      gte: new Date('2026-01-01T07:00:00.000Z'),
      lt: new Date('2026-02-01T07:00:00.000Z'),
    });
    expect(service.monthRange('2026-03')).toEqual({
      gte: new Date('2026-03-01T07:00:00.000Z'),
      lt: new Date('2026-04-01T06:00:00.000Z'),
    });
    expect(service.monthRange('2026-12')).toEqual({
      gte: new Date('2026-12-01T07:00:00.000Z'),
      lt: new Date('2027-01-01T07:00:00.000Z'),
    });
    expect(service.operationalMonth(new Date('2027-01-01T06:30:00.000Z'))).toBe(
      '2026-12',
    );
  });

  it('allows five minutes of completion tolerance and rejects later instants', () => {
    const now = new Date('2026-07-24T18:00:00.000Z');
    const service = fixed(now.toISOString());

    expect(() =>
      service.assertCompletionNotFuture(
        new Date(now.getTime() + COMPLETION_FUTURE_TOLERANCE_MS),
      ),
    ).not.toThrow();
    expect(() =>
      service.assertCompletionNotFuture(
        new Date(now.getTime() + COMPLETION_FUTURE_TOLERANCE_MS + 1),
      ),
    ).toThrow(
      expect.objectContaining({
        response: expect.objectContaining({
          code: 'UNLOADING_COMPLETION_DATE_IN_FUTURE',
        }),
      }),
    );
  });

  it('rejects a future operational month with a stable code', () => {
    const service = fixed('2026-12-31T23:00:00.000Z');

    expect(() => service.assertMonthNotFuture('2027-01')).toThrow(
      expect.objectContaining({
        response: expect.objectContaining({
          code: 'DASHBOARD_MONTH_IN_FUTURE',
          details: expect.objectContaining({ currentMonth: '2026-12' }),
        }),
      }),
    );
  });
});

function fixed(iso: string): BusinessTimeService {
  return new BusinessTimeService(new FixedClock(new Date(iso)));
}
