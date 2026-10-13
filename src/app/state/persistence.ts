/**
 * Persistence.
 *
 * `localStorage` is **untrusted input**. It is plain text on the user's disk: they can edit
 * it, an old version of the app wrote it, or a browser extension can. Everything read back
 * goes through a validator, and anything that fails is discarded in favour of a default
 * rather than trusted. A corrupt store must never be able to break the app.
 *
 * Writes are debounced and wrapped: a full quota, a private-mode browser or a disabled
 * storage API throws, and none of those should take the timer down with them.
 */

import { ThemeSchema } from '../../theme/schema';
import { parseTheme, type ResolvedTheme } from '../../theme/validate';
import { isValidConfig, reviveTimer, type TimerConfig, type TimerState } from '../timer/engine';

const KEY = 'tincture.v1';

/* ------------------------------------------------------------------ *
 * Shape
 * ------------------------------------------------------------------ */

export type Session = {
  id: string;
  phase: 'focus' | 'shortBreak' | 'longBreak';
  startedAt: number;
  durationMs: number;
  taskId: string | null;
};

export type Task = {
  id: string;
  title: string;
  /** Planned pomodoros. */
  estimate: number;
  /** Pomodoros actually completed against this task. */
  done: number;
  completed: boolean;
  createdAt: number;
};

export type Settings = {
  config: TimerConfig;
  themeId: string;
  soundEnabled: boolean;
  notificationsEnabled: boolean;
  /** Focus sessions the user is aiming for each day. */
  dailyGoal: number;
  reduceMotion: boolean;
  /** False until the first-run flow is finished. */
  onboarded: boolean;
  /** Optional — used only to greet. Never sent anywhere. */
  name: string;
};

export type PersistedState = {
  settings: Settings;
  timer: TimerState;
  tasks: Task[];
  sessions: Session[];
  activeTaskId: string | null;
  /** Themes the user built or imported, stored as raw documents. */
  customThemes: unknown[];
};

export const DEFAULT_SETTINGS: Settings = {
  config: {
    focusMs: 25 * 60 * 1000,
    shortBreakMs: 5 * 60 * 1000,
    longBreakMs: 15 * 60 * 1000,
    longBreakEvery: 4,
    autoStartBreaks: true,
    autoStartFocus: false,
  },
  themeId: 'midnight',
  soundEnabled: true,
  notificationsEnabled: false,
  dailyGoal: 8,
  reduceMotion: false,
  onboarded: false,
  name: '',
};

/* ------------------------------------------------------------------ *
 * Narrow validators
 * ------------------------------------------------------------------ */

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

const str = (v: unknown, fallback: string, max = 200): string =>
  typeof v === 'string' ? v.slice(0, max) : fallback;

const bool = (v: unknown, fallback: boolean): boolean => (typeof v === 'boolean' ? v : fallback);

const int = (v: unknown, fallback: number, min: number, max: number): number =>
  typeof v === 'number' && Number.isFinite(v)
    ? Math.min(max, Math.max(min, Math.round(v)))
    : fallback;

const id = (): string =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `id-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

function sanitiseSettings(raw: unknown): Settings {
  if (!isRecord(raw)) return { ...DEFAULT_SETTINGS };

  const config = isRecord(raw.config)
    ? {
        focusMs: int(raw.config.focusMs, DEFAULT_SETTINGS.config.focusMs, 60_000, 10_800_000),
        shortBreakMs: int(raw.config.shortBreakMs, DEFAULT_SETTINGS.config.shortBreakMs, 60_000, 10_800_000),
        longBreakMs: int(raw.config.longBreakMs, DEFAULT_SETTINGS.config.longBreakMs, 60_000, 10_800_000),
        longBreakEvery: int(raw.config.longBreakEvery, DEFAULT_SETTINGS.config.longBreakEvery, 2, 12),
        autoStartBreaks: bool(raw.config.autoStartBreaks, DEFAULT_SETTINGS.config.autoStartBreaks),
        autoStartFocus: bool(raw.config.autoStartFocus, DEFAULT_SETTINGS.config.autoStartFocus),
      }
    : { ...DEFAULT_SETTINGS.config };

  // A stored config that fails its own rules is replaced wholesale — a half-valid timer
  // configuration is worse than the default.
  const safeConfig = isValidConfig(config) ? config : { ...DEFAULT_SETTINGS.config };

  return {
    config: safeConfig,
    themeId: str(raw.themeId, DEFAULT_SETTINGS.themeId, 64),
    soundEnabled: bool(raw.soundEnabled, DEFAULT_SETTINGS.soundEnabled),
    notificationsEnabled: bool(raw.notificationsEnabled, DEFAULT_SETTINGS.notificationsEnabled),
    dailyGoal: int(raw.dailyGoal, DEFAULT_SETTINGS.dailyGoal, 1, 30),
    reduceMotion: bool(raw.reduceMotion, DEFAULT_SETTINGS.reduceMotion),
    onboarded: bool(raw.onboarded, false),
    name: str(raw.name, '', 40),
  };
}

function sanitiseTask(raw: unknown): Task | null {
  if (!isRecord(raw)) return null;
  const title = str(raw.title, '', 160).trim();
  if (!title) return null;
  return {
    id: str(raw.id, id(), 64),
    title,
    estimate: int(raw.estimate, 1, 1, 99),
    done: int(raw.done, 0, 0, 999),
    completed: bool(raw.completed, false),
    createdAt: int(raw.createdAt, Date.now(), 0, Number.MAX_SAFE_INTEGER),
  };
}

function sanitiseSession(raw: unknown): Session | null {
  if (!isRecord(raw)) return null;
  const phase = raw.phase;
  if (phase !== 'focus' && phase !== 'shortBreak' && phase !== 'longBreak') return null;
  return {
    id: str(raw.id, id(), 64),
    phase,
    startedAt: int(raw.startedAt, 0, 0, Number.MAX_SAFE_INTEGER),
    durationMs: int(raw.durationMs, 0, 0, 10_800_000),
    taskId: typeof raw.taskId === 'string' ? raw.taskId.slice(0, 64) : null,
  };
}

/** Keep the last N sessions — enough for a year of streaks, small enough for a quota. */
const MAX_SESSIONS = 5000;
const MAX_TASKS = 500;
const MAX_CUSTOM_THEMES = 50;

/* ------------------------------------------------------------------ *
 * Load
 * ------------------------------------------------------------------ */

export function loadState(now = Date.now()): PersistedState {
  const fallback: PersistedState = {
    settings: { ...DEFAULT_SETTINGS },
    timer: reviveTimer(null, DEFAULT_SETTINGS.config, now) ?? {
      status: 'idle',
      phase: 'focus',
      startedAt: null,
      durationMs: DEFAULT_SETTINGS.config.focusMs,
      pausedTotalMs: 0,
      pausedAt: null,
      completedFocus: 0,
    },
    tasks: [],
    sessions: [],
    activeTaskId: null,
    customThemes: [],
  };

  let text: string | null = null;
  try {
    text = localStorage.getItem(KEY);
  } catch {
    return fallback; // storage disabled (private mode, policy) — run in memory
  }
  if (!text) return fallback;

  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return fallback;
  }
  if (!isRecord(raw)) return fallback;

  const settings = sanitiseSettings(raw.settings);
  const timer = reviveTimer(raw.timer, settings.config, now) ?? fallback.timer;

  const tasks = Array.isArray(raw.tasks)
    ? raw.tasks.map(sanitiseTask).filter((t): t is Task => t !== null).slice(0, MAX_TASKS)
    : [];

  const sessions = Array.isArray(raw.sessions)
    ? raw.sessions
        .map(sanitiseSession)
        .filter((s): s is Session => s !== null)
        .slice(-MAX_SESSIONS)
    : [];

  const customThemes = Array.isArray(raw.customThemes)
    ? raw.customThemes
        .filter((t) => ThemeSchema.safeParse(t).success)
        .slice(0, MAX_CUSTOM_THEMES)
    : [];

  const activeTaskId =
    typeof raw.activeTaskId === 'string' && tasks.some((t) => t.id === raw.activeTaskId)
      ? raw.activeTaskId
      : null;

  return { settings, timer, tasks, sessions, activeTaskId, customThemes };
}

/* ------------------------------------------------------------------ *
 * Save
 * ------------------------------------------------------------------ */

let pending: number | null = null;

/** Write immediately. Throws are swallowed — a failed write must not break the app. */
export function saveStateNow(state: PersistedState): boolean {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
    return true;
  } catch {
    return false;
  }
}

/** Coalesce rapid writes (the timer ticks) into one per second. */
export function saveState(state: PersistedState, delayMs = 400): void {
  if (typeof window === 'undefined') return;
  if (pending !== null) window.clearTimeout(pending);
  pending = window.setTimeout(() => {
    pending = null;
    saveStateNow(state);
  }, delayMs);
}

export function clearState(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* nothing to do */
  }
}

/* ------------------------------------------------------------------ *
 * Custom themes
 * ------------------------------------------------------------------ */

/**
 * Turn stored custom themes into resolved themes.
 *
 * They were schema-checked on load, but they are re-validated here anyway: this is the
 * function whose output is painted, and it must not be able to return something that did
 * not pass the full validator.
 */
export function resolveCustomThemes(raw: unknown[]): ResolvedTheme[] {
  const out: ResolvedTheme[] = [];
  for (const item of raw) {
    const parsed = parseTheme(item);
    if (parsed.ok) out.push(parsed.value);
  }
  return out;
}

export const newId = id;
