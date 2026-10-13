/**
 * The store's destructive action.
 *
 * "Erase everything" is the only thing in the app that deletes user data, and it is the one
 * place where being wrong is unrecoverable. It is also the one place where the bug was
 * invisible: the reset *looked* like it worked, because the settings were replaced and the
 * onboarding came back — while the tasks and sessions were quietly reloaded from storage and
 * written out again.
 */

import { beforeEach, describe, expect, it } from 'vitest';

import { reducer, type State } from './store';

const T = 1_700_000_000_000;

const stored = {
  settings: { onboarded: true, themeId: 'frost', name: 'Xəyal' },
  timer: { status: 'paused', phase: 'focus', startedAt: T, durationMs: 1_500_000, pausedTotalMs: 0, pausedAt: T, completedFocus: 3 },
  tasks: [{ id: 't1', title: 'still here', estimate: 2, done: 1, completed: false, createdAt: T }],
  sessions: [{ id: 's1', phase: 'focus', startedAt: T, durationMs: 1_500_000, taskId: 't1' }],
  activeTaskId: 't1',
  customThemes: [],
};

describe('state/reset', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('does not reload the data it is supposed to delete', () => {
    localStorage.setItem('tincture.v1', JSON.stringify(stored));

    const next = reducer({} as unknown as State, { type: 'state/reset' }, T);

    expect(next.tasks).toEqual([]);
    expect(next.sessions).toEqual([]);
    expect(next.customThemes).toEqual([]);
    expect(next.activeTaskId).toBeNull();
    expect(next.timer.status).toBe('idle');
    expect(next.timer.startedAt).toBeNull();
  });

  it('returns the app to its first-run state', () => {
    localStorage.setItem('tincture.v1', JSON.stringify(stored));

    const next = reducer({} as unknown as State, { type: 'state/reset' }, T);

    expect(next.settings.onboarded).toBe(false);
    expect(next.settings.name).toBe('');
    expect(next.settings.themeId).toBe('midnight');
    expect(next.view).toBe('timer');
  });

  it('erases the same data whether or not anything was stored', () => {
    const empty = reducer({} as unknown as State, { type: 'state/reset' }, T);
    localStorage.setItem('tincture.v1', JSON.stringify(stored));
    const after = reducer({} as unknown as State, { type: 'state/reset' }, T);

    expect(after.tasks).toEqual(empty.tasks);
    expect(after.sessions).toEqual(empty.sessions);
    expect(after.timer).toEqual(empty.timer);
  });
});
