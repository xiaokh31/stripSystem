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

  return isValidTimeZone(configured) ? configured : DEFAULT_OPERATIONAL_TIME_ZONE;
}

function isValidTimeZone(timeZone: string): boolean {
  try {
    new Intl.DateTimeFormat('en-CA', { timeZone }).format(new Date(0));
    return true;
  } catch {
    return false;
  }
}
