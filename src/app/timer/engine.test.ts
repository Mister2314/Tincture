/**
 * The timer's contract.
 *
 * The cases that matter are the ones a counter-based timer gets wrong: a long gap (a
 * throttled background tab, a suspended laptop), repeated pause/resume, and a clock that
 * moves backwards. Every test drives an explicit `now`, so none of them sleep.
 */

import { describe, expect, it } from 'vitest';

import {
  advance,
  clampDuration,
  createTimer,
  DEFAULT_CONFIG,
  durationFor,
  elapsedMs,
  formatDuration,
  isFinished,
  isValidConfig,
  pause,
  progress,
  remainingMs,
  reset,
  remainingMs as remaining,
  reviveTimer,
  setPhase,
  skip,
  start,
  toggle,
  type TimerConfig,
  type TimerState,
} from './engine';

const MIN = 60 * 1000;
const config: TimerConfig = { ...DEFAULT_CONFIG, focusMs: 25 * MIN, shortBreakMs: 5 * MIN, longBreakMs: 15 * MIN };
const T0 = 1_700_000_000_000;

const fresh = () => createTimer('focus', config, T0);
const running = (now = T0) => start(fresh(), now);

/* ------------------------------------------------------------------ *
 * Duration
 * ------------------------------------------------------------------ */

describe('duration', () => {
  it('clamps to a sane range', () => {
    expect(clampDuration(1000)).toBe(MIN);
    expect(clampDuration(999 * MIN)).toBe(180 * MIN);
    expect(clampDuration(25 * MIN)).toBe(25 * MIN);
  });

  it('validates a config', () => {
    expect(isValidConfig(config)).toBe(true);
    expect(isValidConfig({ ...config, focusMs: 1 })).toBe(false);
    expect(isValidConfig({ ...config, longBreakEvery: 1 })).toBe(false);
    expect(isValidConfig({ ...config, longBreakEvery: 4.5 })).toBe(false);
  });
});

/* ------------------------------------------------------------------ *
 * The core property: the reading comes from the clock, not from ticks
 * ------------------------------------------------------------------ */

describe('reading', () => {
  it('starts at the full duration', () => {
    const s = running();
    expect(remainingMs(s, T0)).toBe(25 * MIN);
    expect(progress(s, T0)).toBe(0);
  });

  it('derives remaining time from the clock alone', () => {
    const s = running();
    expect(remainingMs(s, T0 + 10 * MIN)).toBe(15 * MIN);
    expect(remainingMs(s, T0 + 24 * MIN + 59_000)).toBe(1000);
    expect(progress(s, T0 + 5 * MIN)).toBeCloseTo(0.2, 5);
  });

  it('survives a long gap — the throttled-background-tab case', () => {
    const s = running();
    // The tab was hidden for 40 minutes; the interval never fired. A counter would show
    // 25:00 still to go. The anchor says otherwise.
    expect(remainingMs(s, T0 + 40 * MIN)).toBe(0);
    expect(isFinished(s, T0 + 40 * MIN)).toBe(true);
  });

  it('never reports a negative remainder or progress past 1', () => {
    const s = running();
    expect(remainingMs(s, T0 + 999 * MIN)).toBe(0);
    expect(progress(s, T0 + 999 * MIN)).toBe(1);
  });

  it('reports nothing elapsed while idle', () => {
    expect(elapsedMs(fresh(), T0 + 10 * MIN)).toBe(0);
    expect(progress(fresh(), T0 + 10 * MIN)).toBe(0);
    expect(isFinished(fresh(), T0 + 10 * MIN)).toBe(false);
  });
});

/* ------------------------------------------------------------------ *
 * Pause and resume
 * ------------------------------------------------------------------ */

describe('pause and resume', () => {
  it('freezes the remainder while paused', () => {
    let s = running();
    s = pause(s, T0 + 5 * MIN);
    expect(remainingMs(s, T0 + 5 * MIN)).toBe(20 * MIN);
    expect(remainingMs(s, T0 + 60 * MIN)).toBe(20 * MIN); // an hour later, still 20:00
  });

  it('does not lose time across repeated pause/resume cycles', () => {
    let s = running();

    // 2 min run, 30 min pause, 3 min run, 10 min pause, 4 min run = 9 min of work.
    s = pause(s, T0 + 2 * MIN);
    s = start(s, T0 + 32 * MIN);
    s = pause(s, T0 + 35 * MIN);
    s = start(s, T0 + 45 * MIN);

    expect(elapsedMs(s, T0 + 49 * MIN)).toBe(9 * MIN);
    expect(remainingMs(s, T0 + 49 * MIN)).toBe(16 * MIN);
  });

  it('is idempotent when paused twice or started twice', () => {
    let s = running();
    s = pause(s, T0 + MIN);
    const pausedTwice = pause(s, T0 + 2 * MIN);
    expect(pausedTwice.pausedAt).toBe(T0 + MIN);

    const resumed = start(s, T0 + 3 * MIN);
    const resumedTwice = start(resumed, T0 + 4 * MIN);
    expect(resumedTwice.startedAt).toBe(resumed.startedAt);
  });

  it('toggles', () => {
    let s = running();
    s = toggle(s, T0 + MIN);
    expect(s.status).toBe('paused');
    s = toggle(s, T0 + 2 * MIN);
    expect(s.status).toBe('running');
  });
});

/* ------------------------------------------------------------------ *
 * Phase transitions
 * ------------------------------------------------------------------ */

describe('phases', () => {
  it('credits a finished focus session and moves to a short break', () => {
    const { state, completed } = advance(running(), config, T0 + 25 * MIN);
    expect(completed).toBe('focus');
    expect(state.phase).toBe('shortBreak');
    expect(state.completedFocus).toBe(1);
    expect(state.durationMs).toBe(5 * MIN);
    expect(state.status).toBe('running'); // autoStartBreaks is on by default
  });

  it('gives a long break every fourth focus session', () => {
    let s: TimerState = { ...running(), completedFocus: 3 };
    const { state } = advance(s, config, T0 + 25 * MIN);
    expect(state.phase).toBe('longBreak');
    expect(state.durationMs).toBe(15 * MIN);
    expect(state.completedFocus).toBe(4);
  });

  it('returns to focus after a break, without crediting it', () => {
    const s = setPhase(running(), 'shortBreak', config);
    const { state, completed } = advance(s, config, T0 + 5 * MIN);
    expect(completed).toBe('shortBreak');
    expect(state.phase).toBe('focus');
    expect(state.completedFocus).toBe(0);
  });

  it('honours autoStart off', () => {
    const manual: TimerConfig = { ...config, autoStartBreaks: false };
    const { state } = advance(running(), manual, T0 + 25 * MIN);
    expect(state.status).toBe('idle');
    expect(state.startedAt).toBeNull();
  });

  it('resets a phase without crediting it', () => {
    const s = reset(running(), config, T0 + 10 * MIN);
    expect(s.status).toBe('idle');
    expect(s.startedAt).toBeNull();
    expect(s.completedFocus).toBe(0);
    expect(remainingMs(s, T0 + 10 * MIN)).toBe(25 * MIN);
  });

  it('skips forward without crediting', () => {
    const fromFocus = skip(running(), config, T0 + 5 * MIN);
    expect(fromFocus.phase).toBe('shortBreak');
    expect(fromFocus.completedFocus).toBe(0);

    const fromBreak = skip(setPhase(running(), 'shortBreak', config), config, T0 + MIN);
    expect(fromBreak.phase).toBe('focus');
  });
});

/* ------------------------------------------------------------------ *
 * Formatting
 * ------------------------------------------------------------------ */

describe('formatDuration', () => {
  it.each([
    [25 * MIN, '25:00'],
    [5 * MIN, '05:00'],
    [59_000, '00:59'],
    [0, '00:00'],
    [60 * MIN, '1:00:00'],
    [65 * MIN + 5000, '1:05:05'],
  ])('%i -> %s', (ms, expected) => {
    expect(formatDuration(ms)).toBe(expected);
  });

  it('rounds up, so a timer never shows 00:00 while time remains', () => {
    expect(formatDuration(1)).toBe('00:01');
    expect(formatDuration(999)).toBe('00:01');
  });

  it('clamps negatives to zero', () => {
    expect(formatDuration(-5000)).toBe('00:00');
  });
});

/* ------------------------------------------------------------------ *
 * Rehydration — localStorage is untrusted input
 * ------------------------------------------------------------------ */

describe('reviveTimer', () => {
  it('accepts a well-formed stored timer', () => {
    const s = running();
    const back = reviveTimer(s, config, T0 + MIN);
    expect(back).not.toBeNull();
    expect(back?.phase).toBe('focus');
    expect(back?.status).toBe('running');
    expect(remainingMs(back!, T0 + MIN)).toBe(24 * MIN);
  });

  it('keeps a running timer running across a reload', () => {
    const s = running();
    const back = reviveTimer(s, config, T0 + 10 * MIN);
    expect(remainingMs(back!, T0 + 10 * MIN)).toBe(15 * MIN);
  });

  it('rejects junk instead of guessing', () => {
    for (const junk of [null, undefined, 42, 'x', [], {}, { durationMs: 'soon' }]) {
      const back = reviveTimer(junk, config, T0);
      if (back !== null) {
        // The only acceptable outcome for a partial object is a clean idle timer.
        expect(back.status).toBe('idle');
        expect(back.startedAt).toBeNull();
      }
    }
  });

  it('downgrades a running timer that has no anchor', () => {
    const broken = { ...running(), startedAt: null };
    expect(reviveTimer(broken, config, T0)?.status).toBe('idle');
  });

  it('repairs a paused timer that has no pause anchor', () => {
    const broken = { ...running(), status: 'paused' as const, pausedAt: null };
    expect(reviveTimer(broken, config, T0)?.status).toBe('running');
  });

  it('never repairs its way into a running timer with no anchor', () => {
    // The two repairs used to undo each other. A `running` timer with no anchor was
    // downgraded to idle, and then a `paused` timer with no pause anchor was upgraded
    // straight back to `running` — with the null anchor still in place. The result counts
    // down for nobody, and it is the exact shape of the "a running timer was found idle
    // with startedAt: null" report: it is stored as running, and the next load turns it
    // into an idle timer that looks like it lost its session.
    const broken = {
      ...running(),
      status: 'paused' as const,
      startedAt: null,
      pausedAt: null,
    };
    const back = reviveTimer(broken, config, T0);
    expect(back?.status).toBe('idle');
    expect(back?.startedAt).toBeNull();
    expect(remainingMs(back!, T0 + 5 * MIN)).toBe(back!.durationMs);
  });

  it('restarts a phase whose anchor is in the future — the clock-moved-back case', () => {
    const future = { ...running(), startedAt: T0 + 10 * MIN };
    const back = reviveTimer(future, config, T0);
    expect(back?.status).toBe('idle');
    expect(back?.startedAt).toBeNull();
  });

  it('clamps an absurd stored duration', () => {
    const back = reviveTimer({ ...running(), durationMs: 999 * MIN }, config, T0);
    expect(back?.durationMs).toBe(180 * MIN);
  });

  it('never returns a value that makes remaining() throw', () => {
    const junk = [{}, { durationMs: 1 }, { durationMs: 1, startedAt: T0, phase: 'nope' }];
    for (const j of junk) {
      const back = reviveTimer(j, config, T0);
      if (back) expect(() => remaining(back, T0)).not.toThrow();
    }
  });
});

/* ------------------------------------------------------------------ *
 * A full cycle, end to end
 * ------------------------------------------------------------------ */

describe('a full pomodoro cycle', () => {
  it('runs focus -> break -> focus and reaches a long break at four', () => {
    let s = running();
    let clock = T0;

    for (let i = 1; i <= 4; i += 1) {
      clock += 25 * MIN;
      const step = advance(s, config, clock);
      s = step.state;
      expect(s.completedFocus).toBe(i);
      expect(s.phase).toBe(i === 4 ? 'longBreak' : 'shortBreak');

      const breakLen = s.phase === 'longBreak' ? 15 : 5;
      clock += breakLen * MIN;
      s = advance(s, config, clock).state;
      expect(s.phase).toBe('focus');
    }

    expect(s.completedFocus).toBe(4);
    expect(durationFor('longBreak', config)).toBe(15 * MIN);
  });
});
