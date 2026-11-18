const BUSINESS_TIME_ZONE = 'Africa/Cairo';

const dateFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: BUSINESS_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

const receiptFormatter = new Intl.DateTimeFormat('en-GB', {
  timeZone: BUSINESS_TIME_ZONE,
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
});

const timeFormatter = new Intl.DateTimeFormat('en-GB', {
  timeZone: BUSINESS_TIME_ZONE,
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
});

export const businessDateOf = (instant: Date): string => dateFormatter.format(instant);

export const todayBusinessDate = (): string => businessDateOf(new Date());

export const formatReceiptTime = (iso: string): string => receiptFormatter.format(new Date(iso)).replace(',', '');

export const formatClock = (iso: string): string => timeFormatter.format(new Date(iso));

const partsFormatter = new Intl.DateTimeFormat('en-GB', {
  timeZone: BUSINESS_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hour12: false,
});

const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

export const isBusinessDate = (text: string): boolean => {
  const match = DATE_PATTERN.exec(text.trim());
  if (!match) {
    return false;
  }

  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const probe = new Date(Date.UTC(year, month - 1, day));
  return probe.getUTCFullYear() === year && probe.getUTCMonth() === month - 1 && probe.getUTCDate() === day;
};

// Cairo's offset from UTC at an instant (it changes with daylight saving).
function cairoOffsetMs(instant: number): number {
  const parts = Object.fromEntries(partsFormatter.formatToParts(new Date(instant)).map((part) => [part.type, part.value]));
  const wall = Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day), Number(parts.hour) % 24, Number(parts.minute), Number(parts.second));
  return wall - instant;
}

/** The UTC instant at which a Cairo business date (YYYY-MM-DD) starts. */
export function startOfBusinessDate(date: string): Date {
  const [year, month, day] = date.split('-').map(Number);
  const wallMidnight = Date.UTC(year, month - 1, day);
  return new Date(wallMidnight - cairoOffsetMs(wallMidnight));
}

export function addDays(date: string, days: number): string {
  const [year, month, day] = date.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10);
}

/** A Cairo wall-clock date (YYYY-MM-DD) and time (HH:mm) as a UTC instant. */
export function cairoTimeToUtc(date: string, time: string): Date {
  const [year, month, day] = date.split('-').map(Number);
  const [hour, minute] = time.split(':').map(Number);
  const wall = Date.UTC(year, month - 1, day, hour, minute);
  return new Date(wall - cairoOffsetMs(wall));
}

export const isClockTime = (text: string): boolean => /^([01]\d|2[0-3]):[0-5]\d$/.test(text.trim());
