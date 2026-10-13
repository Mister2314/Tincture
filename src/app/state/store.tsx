/**
 * Application state.
 *
 * One reducer, one context, one persistence effect. No state library: the whole store is a
 * few hundred lines, and a dependency here would add a failure surface without removing
 * any of the thinking.
 *
 * The timer is the one piece that is *not* stored as a countdown. `TimerState` holds an
 * anchor timestamp, and the ticking value is derived on read (see `timer/engine.ts`). The
 * store therefore never writes on every tick — only on a transition.
 */

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
  type Dispatch,
  type ReactNode,
} from 'react';

import {
  advance,
  pause,
  reset,
  setPhase,
  skip,
  start,
  toggle,
  type Phase,
  type TimerConfig,
  type TimerState,
} from '../timer/engine';
import {
  DEFAULT_SETTINGS,
  loadState,
  newId,
  resolveCustomThemes,
  saveState,
  saveStateNow,
  type PersistedState,
  type Session,
  type Settings,
  type Task,
} from './persistence';
import type { ResolvedTheme } from '../../theme/validate';

/* ------------------------------------------------------------------ *
 * State
 * ------------------------------------------------------------------ */

export type View = 'timer' | 'tasks' | 'stats' | 'themes' | 'gallery' | 'settings';

export type State = {
  settings: Settings;
  timer: TimerState;
  tasks: Task[];
  sessions: Session[];
  activeTaskId: string | null;
  customThemes: ResolvedTheme[];
  view: View;
};

export type Action =
  | { type: 'timer/toggle' }
  | { type: 'timer/start' }
  | { type: 'timer/pause' }
  | { type: 'timer/reset' }
  | { type: 'timer/skip' }
  | { type: 'timer/advance' }
  | { type: 'timer/setPhase'; phase: Phase }
  | { type: 'timer/config'; config: Partial<TimerConfig> }
  | { type: 'task/add'; title: string; estimate: number }
  | { type: 'task/toggle'; id: string }
  | { type: 'task/remove'; id: string }
  | { type: 'task/setActive'; id: string | null }
  | { type: 'task/rename'; id: string; title: string }
  | { type: 'session/record'; session: Session }
  | { type: 'settings/patch'; patch: Partial<Settings> }
  | { type: 'theme/select'; id: string }
  | { type: 'theme/add'; theme: ResolvedTheme }
  | { type: 'theme/remove'; id: string }
  | { type: 'view/set'; view: View }
  | { type: 'state/reset' };

/* ------------------------------------------------------------------ *
 * Initial state
 * ------------------------------------------------------------------ */

function initialState(now = Date.now()): State {
  const loaded = loadState(now);
  return {
    settings: loaded.settings,
    timer: loaded.timer,
    tasks: loaded.tasks,
    sessions: loaded.sessions,
    activeTaskId: loaded.activeTaskId,
    customThemes: resolveCustomThemes(loaded.customThemes),
    view: 'timer',
  };
}

/**
 * A genuinely empty state — **no read from storage**.
 *
 * `initialState` is the *boot* state: it loads what was persisted. "Erase everything" needs
 * the opposite, and using `initialState` for it silently reloaded the very data it was
 * meant to delete, so the reset looked like it had worked and the tasks were still there on
 * the next render. `clearState()` removes the key as well; this is the in-memory half.
 */
function emptyState(): State {
  return {
    settings: { ...DEFAULT_SETTINGS },
    timer: {
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
    view: 'timer',
  };
}

/* ------------------------------------------------------------------ *
 * Reducer
 * ------------------------------------------------------------------ */

export function reducer(state: State, action: Action, now = Date.now()): State {
  switch (action.type) {
    case 'timer/toggle':
      return { ...state, timer: toggle(state.timer, now) };

    case 'timer/start':
      return { ...state, timer: start(state.timer, now) };

    case 'timer/pause':
      return { ...state, timer: pause(state.timer, now) };

    case 'timer/reset':
      return { ...state, timer: reset(state.timer, state.settings.config, now) };

    case 'timer/skip':
      return { ...state, timer: skip(state.timer, state.settings.config, now) };

    case 'timer/setPhase':
      return { ...state, timer: setPhase(state.timer, action.phase, state.settings.config) };

    case 'timer/advance':
      return { ...state, timer: advance(state.timer, state.settings.config, now).state };

    case 'timer/config': {
      const config = { ...state.settings.config, ...action.config };
      // Changing a duration while idle should be visible immediately; changing it mid-run
      // leaves the current phase alone so a running session is not silently retimed.
      const timer =
        state.timer.status === 'idle'
          ? { ...state.timer, durationMs: durationOf(state.timer.phase, config) }
          : state.timer;
      return { ...state, settings: { ...state.settings, config }, timer };
    }

    case 'task/add': {
      const title = action.title.trim().slice(0, 160);
      if (!title) return state;
      const task: Task = {
        id: newId(),
        title,
        estimate: Math.min(99, Math.max(1, Math.round(action.estimate))),
        done: 0,
        completed: false,
        createdAt: now,
      };
      return { ...state, tasks: [task, ...state.tasks].slice(0, 500), activeTaskId: state.activeTaskId ?? task.id };
    }

    case 'task/toggle':
      return {
        ...state,
        tasks: state.tasks.map((t) => (t.id === action.id ? { ...t, completed: !t.completed } : t)),
      };

    case 'task/rename':
      return {
        ...state,
        tasks: state.tasks.map((t) =>
          t.id === action.id ? { ...t, title: action.title.trim().slice(0, 160) || t.title } : t,
        ),
      };

    case 'task/remove':
      return {
        ...state,
        tasks: state.tasks.filter((t) => t.id !== action.id),
        activeTaskId: state.activeTaskId === action.id ? null : state.activeTaskId,
      };

    case 'task/setActive':
      return { ...state, activeTaskId: action.id };

    case 'session/record': {
      const sessions = [...state.sessions, action.session].slice(-5000);
      // Credit the active task when a focus session completes.
      const tasks =
        action.session.phase === 'focus' && action.session.taskId
          ? state.tasks.map((t) => (t.id === action.session.taskId ? { ...t, done: t.done + 1 } : t))
          : state.tasks;
      return { ...state, sessions, tasks };
    }

    case 'settings/patch':
      return { ...state, settings: { ...state.settings, ...action.patch } };

    case 'theme/select':
      return { ...state, settings: { ...state.settings, themeId: action.id } };

    case 'theme/add': {
      const customThemes = [
        ...state.customThemes.filter((t) => t.id !== action.theme.id),
        action.theme,
      ].slice(-50);
      return { ...state, customThemes };
    }

    case 'theme/remove':
      return {
        ...state,
        customThemes: state.customThemes.filter((t) => t.id !== action.id),
        settings: {
          ...state.settings,
          themeId: state.settings.themeId === action.id ? DEFAULT_SETTINGS.themeId : state.settings.themeId,
        },
      };

    case 'view/set':
      return { ...state, view: action.view };

    case 'state/reset':
      return { ...emptyState(), settings: { ...DEFAULT_SETTINGS, onboarded: false } };
  }
}

/** Local import to avoid a cycle with the engine's own helper. */
function durationOf(phase: Phase, config: TimerConfig): number {
  const ms = phase === 'focus' ? config.focusMs : phase === 'shortBreak' ? config.shortBreakMs : config.longBreakMs;
  return Math.min(10_800_000, Math.max(60_000, Math.round(ms)));
}

/* ------------------------------------------------------------------ *
 * Context
 * ------------------------------------------------------------------ */

type Store = {
  state: State;
  dispatch: Dispatch<Action>;
  /** Current wall-clock ms, refreshed once a second while the timer runs. */
  now: number;
};

const StoreContext = createContext<Store | null>(null);

export function StoreProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(
    (s: State, a: Action) => reducer(s, a),
    undefined,
    () => initialState(),
  );

  const [now, setNow] = useState(() => Date.now());

  // Tick the clock only while something is actually running. An idle app should not hold a
  // timer open, and a paused one should not re-render every second.
  const running = state.timer.status === 'running';
  useEffect(() => {
    if (!running) {
      setNow(Date.now());
      return;
    }
    const interval = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(interval);
  }, [running]);

  // Persist on change, coalesced.
  const snapshot = useMemo<PersistedState>(
    () => ({
      settings: state.settings,
      timer: state.timer,
      tasks: state.tasks,
      sessions: state.sessions,
      activeTaskId: state.activeTaskId,
      customThemes: state.customThemes,
    }),
    [state.settings, state.timer, state.tasks, state.sessions, state.activeTaskId, state.customThemes],
  );

  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    saveState(snapshot);
  }, [snapshot]);

  // A last synchronous write when the tab goes away, so nothing is lost to the debounce.
  //
  // Both handlers are named and both are removed on cleanup. The inline-arrow version of
  // this leaked a `visibilitychange` listener per state change — an anonymous handler can
  // never be removed, so the old closures stayed registered and kept flushing a *stale*
  // snapshot whenever the tab was hidden.
  useEffect(() => {
    const flush = () => saveStateNow(snapshot);
    const onHide = () => {
      if (document.visibilityState === 'hidden') flush();
    };
    window.addEventListener('pagehide', flush);
    document.addEventListener('visibilitychange', onHide);
    return () => {
      window.removeEventListener('pagehide', flush);
      document.removeEventListener('visibilitychange', onHide);
    };
  }, [snapshot]);

  const value = useMemo<Store>(() => ({ state, dispatch, now }), [state, dispatch, now]);

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore(): Store {
  const store = useContext(StoreContext);
  if (!store) throw new Error('useStore must be used inside <StoreProvider>');
  return store;
}

/** Convenience: the timer plus its derived readings, without importing the engine. */
export function useTimer() {
  const { state, dispatch, now } = useStore();
  return { timer: state.timer, config: state.settings.config, dispatch, now };
}
