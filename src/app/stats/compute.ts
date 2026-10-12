/**
 * Statistics, as pure functions over the session log.
 *
 * Everything derives from `sessions` and a "now", so the same numbers are produced in a
 * test as in the browser. Day boundaries are local-time on purpose: a streak should follow
 * the user's calendar, not UTC.
 */

import type { Session } from '../state/persistence';

export type DayBucket = {
  /** Local date, `YYYY-MM-DD`. */
  date: string;
  focusSessions: number;
  focusMs: number;
};

export type Stats = {
  todayFocusSessions: number;
  todayFocusMs: number;
  totalFocusSessions: number;
  totalFocusMs: number;
  /** Consecutive days ending today (or yesterday) with at least one focus session. */
  streak: number;
  bestStreak: number;
  /** Last 14 days, oldest first. */
  recent: DayBucket[];
  /** Mean focus sessions per active day, one decimal. */
  averagePerActiveDay: number;
};

/** Local `YYYY-MM-DD`. Built by hand rather than via `toISOString`, which is UTC. */
export function localDateKey(timestamp: number): string {
  const d = new Date(timestamp);
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${month}-${day}`;
}

/** Midnight local time for the day containing `timestamp`. */
function startOfLocalDay(timestamp: number): number {
  const d = new Date(timestamp);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

const DAY_MS = 86_400_000;

export function computeStats(sessions: readonly Session[], now = Date.now(), window = 14): Stats {
  const focus = sessions.filter((s) => s.phase === 'focus');

  const byDay = new Map<string, DayBucket>();
  for (const session of focus) {
    const date = localDateKey(session.startedAt);
    const bucket = byDay.get(date) ?? { date, focusSessions: 0, focusMs: 0 };
    bucket.focusSessions += 1;
    bucket.focusMs += session.durationMs;
    byDay.set(date, bucket);
  }

  const todayKey = localDateKey(now);
  const today = byDay.get(todayKey) ?? { date: todayKey, focusSessions: 0, focusMs: 0 };

  // Streak: walk backwards from today. A day with no session ends it — but today is allowed
  // to be empty without breaking a streak that ran up to yesterday, which is the behaviour
  // people expect first thing in the morning.
  const todayStart = startOfLocalDay(now);
  let streak = 0;
  let cursor = todayStart;
  if (!byDay.has(todayKey)) cursor -= DAY_MS;

  while (byDay.has(localDateKey(cursor))) {
    streak += 1;
    cursor -= DAY_MS;
  }

  // Best streak: scan the distinct days in order.
  const keys = [...byDay.keys()].sort();
  let best = 0;
  let run = 0;
  let previous: number | null = null;
  for (const key of keys) {
    const t = new Date(`${key}T00:00:00`).getTime();
    run = previous !== null && Math.round((t - previous) / DAY_MS) === 1 ? run + 1 : 1;
    best = Math.max(best, run);
    previous = t;
  }

  const recent: DayBucket[] = [];
  for (let i = window - 1; i >= 0; i -= 1) {
    const t = todayStart - i * DAY_MS;
    const key = localDateKey(t);
    recent.push(byDay.get(key) ?? { date: key, focusSessions: 0, focusMs: 0 });
  }

  const activeDays = byDay.size;
  const totalFocusSessions = focus.length;

  return {
    todayFocusSessions: today.focusSessions,
    todayFocusMs: today.focusMs,
    totalFocusSessions,
    totalFocusMs: focus.reduce((sum, s) => sum + s.durationMs, 0),
    streak,
    bestStreak: Math.max(best, streak),
    recent,
    averagePerActiveDay: activeDays === 0 ? 0 : Math.round((totalFocusSessions / activeDays) * 10) / 10,
  };
}

/** `1h 25m`, `25m`, `0m`. Compact enough for a stat tile. */
export function formatFocusTime(ms: number): string {
  const totalMinutes = Math.floor(ms / 60_000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours === 0) return `${minutes}m`;
  return minutes === 0 ? `${hours}h` : `${hours}h ${minutes}m`;
}
