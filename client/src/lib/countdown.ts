// The countdown to the next UTC day (MapleStory's daily reset is at 00:00 UTC).

export const utcDay = (now: Date) => now.toISOString().slice(0, 10);

export function nextUtcMidnight(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1));
}

// "20h 49m 05s" until the next 00:00 UTC.
export function untilNextUtcDay(now: Date): string {
  const left = nextUtcMidnight(now).getTime() - now.getTime();
  const h = Math.floor(left / 3_600_000);
  const m = Math.floor((left % 3_600_000) / 60_000);
  const s = Math.floor((left % 60_000) / 1000);
  return `${h}h ${String(m).padStart(2, "0")}m ${String(s).padStart(2, "0")}s`;
}
