/**
 * NYSE market hours utility — pure, no side effects.
 *
 * Regular session: 9:30 AM – 4:00 PM ET, Monday–Friday.
 * Holidays sourced from NYSE calendar 2025–2026.
 */

// ── Types ─────────────────────────────────────────────────────────────────────

export type MarketStatus = "open" | "pre-market" | "after-hours" | "closed" | "holiday";

export interface MarketInfo {
  status:     MarketStatus;
  isOpen:     boolean;   // true only during regular session
  label:      string;    // human-readable label
  nextOpen:   Date;
  nextClose:  Date;
  etTime:     string;    // formatted ET time string
}

// ── NYSE holidays (YYYY-MM-DD in ET) ─────────────────────────────────────────

const NYSE_HOLIDAYS = new Set<string>([
  // 2024
  "2024-01-01", "2024-01-15", "2024-02-19", "2024-03-29",
  "2024-05-27", "2024-06-19", "2024-07-04", "2024-09-02",
  "2024-11-28", "2024-12-25",
  // 2025
  "2025-01-01", "2025-01-20", "2025-02-17", "2025-04-18",
  "2025-05-26", "2025-06-19", "2025-07-04", "2025-09-01",
  "2025-11-27", "2025-12-25",
  // 2026
  "2026-01-01", "2026-01-19", "2026-02-16", "2026-04-03",
  "2026-05-25", "2026-06-19", "2026-07-03", "2026-09-07",
  "2026-11-26", "2026-12-25",
]);

// ── ET time helpers ───────────────────────────────────────────────────────────

interface EtParts {
  year:    number;
  month:   number; // 1-based
  day:     number;
  weekday: string; // "Mon", "Tue", …
  hour:    number;
  minute:  number;
  mins:    number; // total minutes since midnight
  dateStr: string; // YYYY-MM-DD
}

function toEtParts(date: Date): EtParts {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone:  "America/New_York",
    weekday:   "short",
    year:      "numeric",
    month:     "2-digit",
    day:       "2-digit",
    hour:      "2-digit",
    minute:    "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);

  const get = (t: Intl.DateTimeFormatPartTypes) =>
    parts.find((p) => p.type === t)?.value ?? "0";

  const year    = Number(get("year"));
  const month   = Number(get("month"));
  const day     = Number(get("day"));
  const hour    = Number(get("hour"));
  const minute  = Number(get("minute"));
  const weekday = get("weekday");
  const dateStr = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;

  return { year, month, day, weekday, hour, minute, mins: hour * 60 + minute, dateStr };
}

function isWeekday(et: EtParts): boolean {
  return !["Sat", "Sun"].includes(et.weekday);
}

function isHoliday(dateStr: string): boolean {
  return NYSE_HOLIDAYS.has(dateStr);
}

function isTradingDay(et: EtParts): boolean {
  return isWeekday(et) && !isHoliday(et.dateStr);
}

// ── Core status ───────────────────────────────────────────────────────────────

const OPEN_MINS  = 9 * 60 + 30; // 9:30 AM
const CLOSE_MINS = 16 * 60;      // 4:00 PM

export function isMarketOpen(now = new Date()): boolean {
  const et = toEtParts(now);
  return isTradingDay(et) && et.mins >= OPEN_MINS && et.mins < CLOSE_MINS;
}

export function getMarketStatus(now = new Date()): MarketStatus {
  const et = toEtParts(now);
  if (!isWeekday(et))               return "closed";
  if (isHoliday(et.dateStr))        return "holiday";
  if (et.mins >= OPEN_MINS && et.mins < CLOSE_MINS) return "open";
  if (et.mins >= 4 * 60 && et.mins < OPEN_MINS)     return "pre-market";
  if (et.mins >= CLOSE_MINS && et.mins < 20 * 60)   return "after-hours";
  return "closed";
}

// ── Next open / close ─────────────────────────────────────────────────────────

/**
 * Build a Date set to h:mm AM ET on a calendar date.
 * `dateStr` is YYYY-MM-DD in ET; hour/minute are ET values.
 */
function etDateTime(dateStr: string, hour: number, minute: number): Date {
  // Build an ISO string and interpret it in ET via the Temporal polyfill approach.
  // We do this by finding the UTC offset for that ET moment using Intl.
  const [year, month, day] = dateStr.split("-").map(Number);
  // Create a rough UTC date and adjust with the ET offset
  const roughUtc = new Date(Date.UTC(year, month - 1, day, hour, minute));
  // Get the ET offset at that moment
  const etStr = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).format(roughUtc);
  const [etH, etM] = etStr.split(":").map(Number);
  const diffMins = (etH * 60 + etM) - (hour * 60 + minute);
  return new Date(roughUtc.getTime() - diffMins * 60_000);
}

/** Advance a YYYY-MM-DD string by N days. */
function addDays(dateStr: string, n: number): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + n));
  return dt.toISOString().slice(0, 10);
}

/** Find the next trading day on or after `dateStr`. */
function nextTradingDay(dateStr: string): string {
  let candidate = dateStr;
  for (let i = 0; i < 14; i++) {
    const et = toEtParts(etDateTime(candidate, 12, 0));
    if (isTradingDay(et)) return candidate;
    candidate = addDays(candidate, 1);
  }
  return candidate;
}

export function getNextOpen(now = new Date()): Date {
  const et = toEtParts(now);

  // If today is a trading day and market hasn't opened yet → open today
  if (isTradingDay(et) && et.mins < OPEN_MINS) {
    return etDateTime(et.dateStr, 9, 30);
  }

  // Otherwise find the next trading day
  const nextDay    = addDays(et.dateStr, 1);
  const tradingDay = nextTradingDay(nextDay);
  return etDateTime(tradingDay, 9, 30);
}

export function getNextClose(now = new Date()): Date {
  const et = toEtParts(now);

  // If market is currently open or pre-market on a trading day → close is today at 4 PM
  if (isTradingDay(et) && et.mins < CLOSE_MINS) {
    return etDateTime(et.dateStr, 16, 0);
  }

  // Otherwise: next trading day's close
  const nextDay    = addDays(et.dateStr, 1);
  const tradingDay = nextTradingDay(nextDay);
  return etDateTime(tradingDay, 16, 0);
}

// ── Full info object ──────────────────────────────────────────────────────────

const STATUS_LABEL: Record<MarketStatus, string> = {
  "open":        "OPEN",
  "pre-market":  "PRE-MARKET",
  "after-hours": "AFTER-HOURS",
  "closed":      "CLOSED",
  "holiday":     "HOLIDAY",
};

export function getMarketInfo(now = new Date()): MarketInfo {
  const status = getMarketStatus(now);

  const etStr = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
    hourCycle: "h12",
  }).format(now) + " ET";

  return {
    status,
    isOpen:    status === "open",
    label:     STATUS_LABEL[status],
    nextOpen:  getNextOpen(now),
    nextClose: getNextClose(now),
    etTime:    etStr,
  };
}
