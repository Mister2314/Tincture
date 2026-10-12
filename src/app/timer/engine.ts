/**
 * The timer, as pure functions.
 *
 * Why this is not `setInterval(count => count + 1)`
 * -------------------------------------------------
 * Interval callbacks drift, and browsers throttle them in background tabs — often to once
 * per minute. A counter-based timer therefore runs *slow* whenever the tab is not focused,
 * which is exactly when a Pomodoro is being used.
 *
 * So the timer stores an **anchor** — the wall-clock instant the current phase ends — and
 * every reading is derived from `Date.now()`. The interval only decides how often the
 * display refreshes; it has no effect on the value. Close the tab, suspend the laptop,
 * reopen: the number is still right.
 *
 * Everything here is a pure function of `(state, now)`, so it is testable without a clock.
 */

export type Phase = 'focus' | 'shortBreak' | 'longBreak';

export type TimerStatus = 'idle' | 'running' | 'paused';

export type TimerState = {
  status: TimerStatus;
  phase: Phase;
  /** Wall-clock ms when the current phase began. `null` while idle. */
  startedAt: number | null;
  /** Total ms this phase should last. */
  durationMs: number;
  /**
   * ms already spent paused *before* the current run segment. Subtracting this keeps the
   * remaining time honest across any number of pause/resume cycles.
   */
  pausedTotalMs: number;
  /** Wall-clock ms of the current pause, or `null` when not paused. */
  pausedAt: number | null;
  /** Completed focus sessions in this cycle — decides when a long break is due. */
  completedFocus: number;
};

export type TimerConfig = {
  focusMs: number;
  shortBreakMs: number;
  longBreakMs: number;
  /** A long break replaces every Nth short break. */
  longBreakEvery: number;
  autoStartBreaks: boolean;
  autoStartFocus: boolean;
};

export const DEFAULT_CONFIG: TimerConfig = {
  focusMs: 25 * 60 * 1000,
  shortBreakMs: 5 * 60 * 1000,
  longBreakMs: 15 * 60 * 1000,
  longBreakEvery: 4,
  autoStartBreaks: true,
  autoStartFocus: false,
};

/* ------------------------------------------------------------------ *
 * Guards
 * ------------------------------------------------------------------ */

const MIN_PHASE_MS = 60 * 1000; // 1 minute
const MAX_PHASE_MS = 180 * 60 * 1000; // 3 hours

export const clampDuration = (ms: number): number =>
  Math.min(MAX_PHASE_MS, Math.max(MIN_PHASE_MS, Math.round(ms)));

export const isValidConfig = (c: TimerConfig): boolean =>
  [c.focusMs, c.shortBreakMs, c.longBreakMs].every(
    (ms) => Number.isFinite(ms) && ms >= MIN_PHASE_MS && ms <= MAX_PHASE_MS,
  ) &&
  Number.isInteger(c.longBreakEvery) &&
  c.longBreakEvery >= 2 &&
  c.longBreakEvery <= 12;

/* ------------------------------------------------------------------ *
 * Construction
 * ------------------------------------------------------------------ */

export function createTimer(phase: Phase, config: TimerConfig, _now = Date.now()): TimerState {
  return {
    status: 'idle',
    phase,
    startedAt: null,
    durationMs: durationFor(phase, config),
    pausedTotalMs: 0,
    pausedAt: null,
    completedFocus: 0,
  };
}

export function durationFor(phase: Phase, config: TimerConfig): number {
  switch (phase) {
    case 'focus':
      return clampDuration(config.focusMs);
    case 'shortBreak':
      return clampDuration(config.shortBreakMs);
    case 'longBreak':
      return clampDuration(config.longBreakMs);
  }
}

/* ------------------------------------------------------------------ *
 * Reading
 * ------------------------------------------------------------------ */

/** ms already elapsed in the current phase, pauses excluded. */
export function elapsedMs(state: TimerState, now = Date.now()): number {
  if (state.startedAt === null) return 0;

  const pausedNow = state.pausedAt === null ? 0 : Math.max(0, now - state.pausedAt);
  const raw = now - state.startedAt - state.pausedTotalMs - pausedNow;
  return Math.min(state.durationMs, Math.max(0, raw));
}

export function remainingMs(state: TimerState, now = Date.now()): number {
  return Math.max(0, state.durationMs - elapsedMs(state, now));
}

/** 0 → just started, 1 → finished. Used for the ring. */
export function progress(state: TimerState, now = Date.now()): number {
  if (state.durationMs <= 0) return 1;
  return Math.min(1, Math.max(0, elapsedMs(state, now) / state.durationMs));
}

export function isFinished(state: TimerState, now = Date.now()): boolean {
  return state.status !== 'idle' && remainingMs(state, now) <= 0;
}

/** `25:00`, or `1:05:00` past an hour. Always two digits below the hour. */
export function formatDuration(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return hours > 0 ? `${hours}:${pad(minutes)}:${pad(seconds)}` : `${pad(minutes)}:${pad(seconds)}`;
}

/* ------------------------------------------------------------------ *
 * Transitions — every one returns a new state, none mutate
 * ------------------------------------------------------------------ */

export function start(state: TimerState, now = Date.now()): TimerState {
  if (state.status === 'running') return state;
  if (state.status === 'paused' && state.pausedAt !== null) {
    // Fold the pause into the accumulated total and resume from now.
    return {
      ...state,
      status: 'running',
      pausedTotalMs: state.pausedTotalMs + Math.max(0, now - state.pausedAt),
      pausedAt: null,
    };
  }
  return { ...state, status: 'running', startedAt: now, pausedTotalMs: 0, pausedAt: null };
}

export function pause(state: TimerState, now = Date.now()): TimerState {
  if (state.status !== 'running') return state;
  return { ...state, status: 'paused', pausedAt: now };
}

export function toggle(state: TimerState, now = Date.now()): TimerState {
  return state.status === 'running' ? pause(state, now) : start(state, now);
}

/** Abandon the current phase and reset it, without counting it as completed. */
export function reset(state: TimerState, config: TimerConfig, _now = Date.now()): TimerState {
  return {
    ...state,
    status: 'idle',
    startedAt: null,
    durationMs: durationFor(state.phase, config),
    pausedTotalMs: 0,
    pausedAt: null,
  };
}

/**
 * Move to the next phase.
 *
 * A finished **focus** phase increments the counter and picks short or long break; a
 * finished **break** returns to focus. `autoStart` decides whether the next phase begins
 * running or waiting.
 */
export function advance(
  state: TimerState,
  config: TimerConfig,
  now = Date.now(),
): { state: TimerState; completed: Phase } {
  const completed = state.phase;

  let nextPhase: Phase;
  let completedFocus = state.completedFocus;

  if (state.phase === 'focus') {
    completedFocus += 1;
    nextPhase = completedFocus % config.longBreakEvery === 0 ? 'longBreak' : 'shortBreak';
  } else {
    nextPhase = 'focus';
  }

  const autoStart =
    nextPhase === 'focus' ? config.autoStartFocus : config.autoStartBreaks;

  const next: TimerState = {
    status: autoStart ? 'running' : 'idle',
    phase: nextPhase,
    startedAt: autoStart ? now : null,
    durationMs: durationFor(nextPhase, config),
    pausedTotalMs: 0,
    pausedAt: null,
    completedFocus,
  };

  return { state: next, completed };
}

/** Skip forward without crediting the current phase. */
export function skip(
  state: TimerState,
  config: TimerConfig,
  _now = Date.now(),
): TimerState {
  if (state.phase === 'focus') {
    return {
      ...state,
      phase: 'shortBreak',
      status: 'idle',
      startedAt: null,
      durationMs: durationFor('shortBreak', config),
      pausedTotalMs: 0,
      pausedAt: null,
    };
  }
  return {
    ...state,
    phase: 'focus',
    status: 'idle',
    startedAt: null,
    durationMs: durationFor('focus', config),
    pausedTotalMs: 0,
    pausedAt: null,
  };
}

/** Choose a phase directly — the "I just want a 5-minute break" path. */
export function setPhase(
  state: TimerState,
  phase: Phase,
  config: TimerConfig,
): TimerState {
  return {
    ...state,
    phase,
    status: 'idle',
    startedAt: null,
    durationMs: durationFor(phase, config),
    pausedTotalMs: 0,
    pausedAt: null,
  };
}

/* ------------------------------------------------------------------ *
 * Persistence
 * ------------------------------------------------------------------ */

/**
 * Rehydrate a stored timer.
 *
 * Two things are repaired rather than trusted, because `localStorage` is user-writable and
 * a stale anchor is normal:
 *
 * - A timer that was running when the tab closed keeps running — the anchor is still valid,
 *   so it is left alone. If it finished while away, `isFinished` reports that on first read
 *   and the app advances.
 * - Anything structurally wrong is discarded and replaced with a fresh idle timer.
 */
export function reviveTimer(raw: unknown, _config: TimerConfig, now = Date.now()): TimerState | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const t = raw as Partial<TimerState>;

  const phase: Phase =
    t.phase === 'focus' || t.phase === 'shortBreak' || t.phase === 'longBreak' ? t.phase : 'focus';
  const status: TimerStatus =
    t.status === 'running' || t.status === 'paused' || t.status === 'idle' ? t.status : 'idle';

  if (typeof t.durationMs !== 'number' || !Number.isFinite(t.durationMs)) return null;
  if (t.startedAt !== null && typeof t.startedAt !== 'number') return null;
  if (t.pausedAt !== null && t.pausedAt !== undefined && typeof t.pausedAt !== 'number') return null;

  const state: TimerState = {
    status,
    phase,
    startedAt: t.startedAt ?? null,
    durationMs: clampDuration(t.durationMs),
    pausedTotalMs:
      typeof t.pausedTotalMs === 'number' && Number.isFinite(t.pausedTotalMs)
        ? Math.max(0, t.pausedTotalMs)
        : 0,
    pausedAt: typeof t.pausedAt === 'number' ? t.pausedAt : null,
    completedFocus:
      typeof t.completedFocus === 'number' && Number.isFinite(t.completedFocus)
        ? Math.max(0, Math.floor(t.completedFocus))
        : 0,
  };

  // A "running" timer with no anchor cannot be measured; treat it as idle rather than
  // guessing a start time.
  if (state.status === 'running' && state.startedAt === null) state.status = 'idle';
  if (state.status === 'paused' && state.pausedAt === null) state.status = 'running';

  // An anchor in the future means the system clock moved backwards. Restart the phase.
  if (state.startedAt !== null && state.startedAt > now + 1000) {
    return { ...state, status: 'idle', startedAt: null, pausedTotalMs: 0, pausedAt: null };
  }

  return state;
}
