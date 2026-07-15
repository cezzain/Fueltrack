/**
 * All day boundaries are pinned to Dubai time (GST, UTC+4) so the log rolls
 * over at Dubai midnight regardless of the device's timezone.
 */
export const APP_TZ = 'Asia/Dubai';

const keyFmt = new Intl.DateTimeFormat('en-CA', {
  timeZone: APP_TZ,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

const timeFmt = new Intl.DateTimeFormat('en-GB', {
  timeZone: APP_TZ,
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
});

const dayLabelFmt = new Intl.DateTimeFormat('en-GB', {
  timeZone: APP_TZ,
  weekday: 'short',
  day: 'numeric',
  month: 'short',
});

const longLabelFmt = new Intl.DateTimeFormat('en-GB', {
  timeZone: APP_TZ,
  weekday: 'long',
  day: 'numeric',
  month: 'long',
});

/** YYYY-MM-DD for a Date, in Dubai time. en-CA locale yields ISO ordering. */
export function dateKeyFor(d: Date): string {
  return keyFmt.format(d);
}

export function todayKey(): string {
  return dateKeyFor(new Date());
}

/** "13:05" for a timestamp, in Dubai time. */
export function formatTime(ts: number): string {
  return timeFmt.format(new Date(ts));
}

/** Noon Dubai time on the given key's date — safe representative Date for formatting a dateKey. */
export function representativeDate(dateKey: string): Date {
  return new Date(`${dateKey}T12:00:00+04:00`);
}

/** "Mon 13 Jul" */
export function formatDayLabel(dateKey: string): string {
  return dayLabelFmt.format(representativeDate(dateKey));
}

/** "Monday 13 July" */
export function formatDayLabelLong(dateKey: string): string {
  return longLabelFmt.format(representativeDate(dateKey));
}

/** "Today" / "Yesterday" / "Mon 13 Jul" */
export function formatRelativeDayLabel(dateKey: string): string {
  if (dateKey === todayKey()) return 'Today';
  if (dateKey === lastNDateKeys(2)[0]) return 'Yesterday';
  return formatDayLabel(dateKey);
}

/**
 * The last n Dubai-time date keys, oldest first, ending with today.
 * Walks in 24h steps from a fixed representative instant, so DST-free GST is exact.
 */
export function lastNDateKeys(n: number): string[] {
  const keys: string[] = [];
  const now = Date.now();
  for (let i = n - 1; i >= 0; i--) {
    keys.push(dateKeyFor(new Date(now - i * 24 * 60 * 60 * 1000)));
  }
  return keys;
}

const hourFmt = new Intl.DateTimeFormat('en-GB', {
  timeZone: APP_TZ,
  hour: 'numeric',
  hour12: false,
});

/** Suggested meal type for right now, by Dubai wall-clock hour. */
export function suggestedMealType(): 'breakfast' | 'lunch' | 'dinner' | 'snack' {
  const hour = Number(hourFmt.format(new Date()));
  if (hour >= 5 && hour < 11) return 'breakfast';
  if (hour >= 11 && hour < 16) return 'lunch';
  if (hour >= 17 && hour < 23) return 'dinner';
  return 'snack';
}

/**
 * Combine a Dubai-time date key ("YYYY-MM-DD") and a 24h "HH:mm" time into an
 * epoch ms timestamp — for backfilling a meal onto a past day at a chosen time.
 */
export function dateTimeToEpoch(dateKey: string, hhmm: string): number {
  const time = /^\d{2}:\d{2}$/.test(hhmm) ? hhmm : '12:00';
  return Date.parse(`${dateKey}T${time}:00+04:00`);
}

/** Tomorrow's Dubai-time date key. */
export function tomorrowKey(): string {
  return dateKeyFor(new Date(Date.now() + 24 * 60 * 60 * 1000));
}

/**
 * Monday..Sunday date keys (Dubai time) for the calendar week containing
 * dateKey — used to spread a light day's shortfall across the rest of its week.
 */
export function weekDateKeys(dateKey: string): string[] {
  const d = representativeDate(dateKey);
  const dow = d.getUTCDay(); // 0=Sun..6=Sat
  const daysSinceMonday = (dow + 6) % 7;
  const monday = new Date(d.getTime() - daysSinceMonday * 24 * 60 * 60 * 1000);
  return Array.from({ length: 7 }, (_, i) =>
    dateKeyFor(new Date(monday.getTime() + i * 24 * 60 * 60 * 1000)),
  );
}
