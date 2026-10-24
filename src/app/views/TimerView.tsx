/**
 * The timer view — the app's centre of gravity.
 *
 * The readout is derived from `now` on every render; the store only changes on a
 * transition. That is what makes a 25-minute session survive a throttled background tab.
 */

import { useEffect, useRef } from 'react';

import {
  formatDuration,
  isFinished,
  progress,
  remainingMs,
  type Phase,
} from '../timer/engine';
import { useStore } from '../state/store';
import { playPhaseTone } from '../sound';
import { Button } from '../../ui/primitives';

const PHASE_LABEL: Record<Phase, string> = {
  focus: 'Focus',
  shortBreak: 'Short break',
  longBreak: 'Long break',
};

const PHASES: Phase[] = ['focus', 'shortBreak', 'longBreak'];

const RADIUS = 46;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

export function TimerView() {
  const { state, dispatch, now } = useStore();
  const { timer, settings, tasks, activeTaskId } = state;

  const remaining = remainingMs(timer, now);
  const done = progress(timer, now);
  const finished = isFinished(timer, now);
  const activeTask = tasks.find((t) => t.id === activeTaskId) ?? null;

  /**
   * When a phase completes, record it and advance — once.
   *
   * The guard is a ref rather than state because the effect must not re-run on the render
   * that the dispatch itself causes; otherwise a finished timer advances twice.
   */
  const handledFor = useRef<number | null>(null);
  useEffect(() => {
    if (!finished || timer.startedAt === null) return;
    if (handledFor.current === timer.startedAt) return;
    handledFor.current = timer.startedAt;

    dispatch({
      type: 'session/record',
      session: {
        id: `${timer.startedAt}-${timer.phase}`,
        phase: timer.phase,
        startedAt: timer.startedAt,
        durationMs: timer.durationMs,
        taskId: timer.phase === 'focus' ? activeTaskId : null,
      },
    });
    dispatch({ type: 'timer/advance' });
  }, [finished, timer.startedAt, timer.phase, timer.durationMs, activeTaskId, dispatch]);

  // Notify when a phase ends, if the user asked for it and permission was granted.
  useEffect(() => {
    if (!finished) return;
    if (!settings.notificationsEnabled) return;
    if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return;

    const body =
      timer.phase === 'focus' ? 'Focus session complete. Take a break.' : 'Break over — back to it.';
    try {
      new Notification('Tincture', { body });
    } catch {
      /* a notification that fails must never break the timer */
    }
  }, [finished, settings.notificationsEnabled, timer.phase]);

  // A short synthesised tone when a phase ends, if the user asked for it. Settings promises
  // this; it used to be a switch wired to nothing.
  useEffect(() => {
    if (!finished) return;
    if (!settings.soundEnabled) return;
    playPhaseTone(timer.phase === 'focus' ? 'focus' : 'break');
  }, [finished, settings.soundEnabled, timer.phase]);

  // Keep the tab title useful when the app is in the background.
  useEffect(() => {
    document.title =
      timer.status === 'running'
        ? `${formatDuration(remaining)} · ${PHASE_LABEL[timer.phase]} — Tincture`
        : 'Tincture';
  }, [remaining, timer.status, timer.phase]);

  const primaryLabel =
    timer.status === 'running' ? 'Pause' : timer.status === 'paused' ? 'Resume' : 'Start';

  return (
    <section className="timer" aria-labelledby="timer-heading">
      <h1 id="timer-heading" className="visually-hidden">
        Pomodoro timer
      </h1>

      <div className="timer__phase" role="group" aria-label="Session type">
        {PHASES.map((phase) => (
          <button
            key={phase}
            type="button"
            className="timer__phase-btn"
            aria-pressed={timer.phase === phase}
            onClick={() => dispatch({ type: 'timer/setPhase', phase })}
          >
            {PHASE_LABEL[phase]}
          </button>
        ))}
      </div>

      <div className="timer__dial">
        {/*
          The breathing halo — the app's signature ambient state. It is the timer's own
          light, not the theme's motif: while the session runs it breathes on a slow cycle,
          and in the last fifth of the phase it brightens. Pure CSS (one composited layer,
          transform/opacity only), so a 25-minute session costs no rAF and no re-render.
          Reduced motion turns it into a still, soft glow.
        */}
        <div
          className="timer__breath"
          data-running={timer.status === 'running' || undefined}
          data-ending={timer.status !== 'idle' && done > 0.8 ? '' : undefined}
          aria-hidden="true"
        />
        <svg className="timer__ring" viewBox="0 0 100 100" aria-hidden="true">
          <circle
            className="timer__ring-track"
            cx="50"
            cy="50"
            r={RADIUS}
            fill="none"
            strokeWidth="2.5"
          />
          <circle
            className="timer__ring-value"
            cx="50"
            cy="50"
            r={RADIUS}
            fill="none"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeDasharray={CIRCUMFERENCE}
            strokeDashoffset={CIRCUMFERENCE * (1 - done)}
          />
        </svg>

        <div className="timer__readout">
          <div
            className="timer__digits"
            role="timer"
            aria-live="off"
            aria-label={`${Math.ceil(remaining / 60000)} minutes remaining`}
          >
            {formatDuration(remaining)}
          </div>
          <div className="timer__label">{PHASE_LABEL[timer.phase]}</div>
        </div>
      </div>

      <div className="timer__controls">
        <Button
          variant="primary"
          size="lg"
          onClick={() => dispatch({ type: 'timer/toggle' })}
          aria-label={primaryLabel}
        >
          {primaryLabel}
        </Button>
        <Button
          onClick={() => dispatch({ type: 'timer/reset' })}
          disabled={timer.status === 'idle' && timer.startedAt === null}
        >
          Reset
        </Button>
        <Button variant="ghost" onClick={() => dispatch({ type: 'timer/skip' })}>
          Skip
        </Button>
      </div>

      {activeTask ? (
        <p className="timer__active-task">
          Working on <strong>{activeTask.title}</strong>
        </p>
      ) : (
        <p className="timer__count">
          {timer.completedFocus} focus {timer.completedFocus === 1 ? 'session' : 'sessions'} in
          this cycle
        </p>
      )}
    </section>
  );
}
