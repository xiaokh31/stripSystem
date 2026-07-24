import {
  operationalDateTime,
  operationalDayRangeUtc,
  operationalLocalDate,
  operationalTimeZone,
} from './operational-time';

describe('operational time', () => {
  const originalOperationalTimeZone = process.env.OPERATIONAL_TIME_ZONE;
  const originalTz = process.env.TZ;

  afterEach(() => {
    restoreEnv('OPERATIONAL_TIME_ZONE', originalOperationalTimeZone);
    restoreEnv('TZ', originalTz);
  });

  it('uses the configured IANA timezone with daylight saving rules', () => {
    process.env.OPERATIONAL_TIME_ZONE = 'America/Edmonton';
    delete process.env.TZ;

    expect(operationalLocalDate(new Date('2026-06-28T05:30:00.000Z'))).toBe(
      '2026-06-27',
    );
    expect(operationalLocalDate(new Date('2026-01-28T06:30:00.000Z'))).toBe(
      '2026-01-27',
    );
    expect(operationalDateTime(new Date('2026-06-28T05:30:00.000Z'))).toBe(
      '2026-06-27 23:30:00 MDT',
    );
    expect(operationalDateTime(new Date('2026-01-28T06:30:00.000Z'))).toBe(
      '2026-01-27 23:30:00 MST',
    );
  });

  it('falls back to America/Edmonton when the configured timezone is invalid', () => {
    process.env.OPERATIONAL_TIME_ZONE = 'Bad/Timezone';
    delete process.env.TZ;

    expect(operationalTimeZone()).toBe('America/Edmonton');
  });

  it('builds due-today UTC boundaries from the operational timezone across DST', () => {
    expect(
      operationalDayRangeUtc(
        new Date('2026-07-23T18:00:00.000Z'),
        'America/Edmonton',
      ),
    ).toEqual({
      gte: new Date('2026-07-23T06:00:00.000Z'),
      lt: new Date('2026-07-24T06:00:00.000Z'),
    });
    expect(
      operationalDayRangeUtc(
        new Date('2026-01-23T18:00:00.000Z'),
        'America/Edmonton',
      ),
    ).toEqual({
      gte: new Date('2026-01-23T07:00:00.000Z'),
      lt: new Date('2026-01-24T07:00:00.000Z'),
    });
  });
});

function restoreEnv(key: string, value: string | undefined): void {
  if (value === undefined) {
    delete process.env[key];
    return;
  }

  process.env[key] = value;
}
