const DEFAULT_OPERATIONAL_TIME_ZONE = "America/Edmonton";

export const OPERATIONAL_TIME_ZONE = resolveOperationalTimeZone();
export const OPERATIONAL_TIME_ZONE_LABEL = OPERATIONAL_TIME_ZONE;
export const OPERATIONAL_TIME_ZONE_DESCRIPTION = `${OPERATIONAL_TIME_ZONE} (dynamic DST)`;

export function formatOperationalDateTime(value: string | Date): string {
  const date = parseDate(value);

  if (!date) {
    return String(value);
  }

  const parts = operationalDateTimeFormatter().formatToParts(date);
  const values = Object.fromEntries(
    parts
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, part.value]),
  );

  return `${values.year}-${values.month}-${values.day} ${values.hour}:${values.minute}:${values.second} ${values.timeZoneName}`;
}

function operationalDateTimeFormatter(): Intl.DateTimeFormat {
  return new Intl.DateTimeFormat("en-CA", {
    day: "2-digit",
    hour: "2-digit",
    hourCycle: "h23",
    minute: "2-digit",
    month: "2-digit",
    second: "2-digit",
    timeZone: OPERATIONAL_TIME_ZONE,
    timeZoneName: "short",
    year: "numeric",
  });
}

function resolveOperationalTimeZone(): string {
  const configured = process.env.NEXT_PUBLIC_OPERATIONAL_TIME_ZONE;

  if (configured && isValidTimeZone(configured)) {
    return configured;
  }

  return DEFAULT_OPERATIONAL_TIME_ZONE;
}

function isValidTimeZone(timeZone: string): boolean {
  try {
    new Intl.DateTimeFormat("en-CA", { timeZone }).format(new Date(0));
    return true;
  } catch {
    return false;
  }
}

function parseDate(value: string | Date): Date | null {
  const date = value instanceof Date ? value : new Date(value);

  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return date;
}
