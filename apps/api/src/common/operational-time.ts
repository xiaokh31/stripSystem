const DEFAULT_OPERATIONAL_TIME_ZONE = 'America/Edmonton';

export function operationalLocalDate(
  value: Date = new Date(),
  timeZone = operationalTimeZone(),
): string {
  const values = operationalDateTimeParts(value, timeZone);

  return `${values.year}-${values.month}-${values.day}`;
}

export function operationalDateTime(
  value: Date = new Date(),
  timeZone = operationalTimeZone(),
): string {
  const values = operationalDateTimeParts(value, timeZone);

  return `${values.year}-${values.month}-${values.day} ${values.hour}:${values.minute}:${values.second} ${values.timeZoneName}`;
}

function operationalDateTimeParts(
  value: Date,
  timeZone: string,
): Record<string, string> {
  const parts = new Intl.DateTimeFormat('en-CA', {
    day: '2-digit',
    hour: '2-digit',
    hourCycle: 'h23',
    minute: '2-digit',
    month: '2-digit',
    second: '2-digit',
    timeZone,
    timeZoneName: 'short',
    year: 'numeric',
  }).formatToParts(value);

  return Object.fromEntries(
    parts
      .filter((part) => part.type !== 'literal')
      .map((part) => [part.type, part.value]),
  );
}

export function operationalTimeZone(): string {
  const configured =
    process.env.OPERATIONAL_TIME_ZONE ||
    process.env.TZ ||
    DEFAULT_OPERATIONAL_TIME_ZONE;

  return isValidTimeZone(configured)
    ? configured
    : DEFAULT_OPERATIONAL_TIME_ZONE;
}

export function operationalDayRangeUtc(
  value: Date = new Date(),
  timeZone = operationalTimeZone(),
): { gte: Date; lt: Date } {
  const localDate = operationalLocalDate(value, timeZone);
  const [year, month, day] = localDate.split('-').map(Number);
  const nextDate = new Date(Date.UTC(year, month - 1, day + 1));

  return {
    gte: zonedMidnightUtc(year, month, day, timeZone),
    lt: zonedMidnightUtc(
      nextDate.getUTCFullYear(),
      nextDate.getUTCMonth() + 1,
      nextDate.getUTCDate(),
      timeZone,
    ),
  };
}

function zonedMidnightUtc(
  year: number,
  month: number,
  day: number,
  timeZone: string,
): Date {
  const desiredUtc = Date.UTC(year, month - 1, day);
  let candidate = new Date(desiredUtc);

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const parts = operationalDateTimeParts(candidate, timeZone);
    const representedLocalTime = Date.UTC(
      Number(parts.year),
      Number(parts.month) - 1,
      Number(parts.day),
      Number(parts.hour),
      Number(parts.minute),
      Number(parts.second),
    );
    const corrected = new Date(
      candidate.getTime() + desiredUtc - representedLocalTime,
    );
    if (corrected.getTime() === candidate.getTime()) {
      return corrected;
    }
    candidate = corrected;
  }

  return candidate;
}

function isValidTimeZone(timeZone: string): boolean {
  try {
    new Intl.DateTimeFormat('en-CA', { timeZone }).format(new Date(0));
    return true;
  } catch {
    return false;
  }
}
