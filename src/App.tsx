import { useEffect, useMemo, type ComponentType, type CSSProperties } from 'react';
import { LazyMotion, MotionConfig, domMax } from 'motion/react';
import { AnimatePresence, m } from 'motion/react';

import { Ambience } from './app/ambience/Ambience';
import { EASE_IN, EASE_OUT } from './app/motion';
import { ThemeRoot } from './app/ThemeRoot';
import { useStore, type View } from './app/state/store';
import { findTheme } from './theme/registry';
import { GalleryView } from './app/views/GalleryView';
import { Onboarding } from './app/views/Onboarding';
import { SettingsView } from './app/views/SettingsView';
import { StatsView } from './app/views/StatsView';
import { TasksView } from './app/views/TasksView';
import { ThemesView } from './app/views/ThemesView';
import { TimerView } from './app/views/TimerView';
import { ToastProvider } from './ui/primitives';

const NAV: { view: View; label: string }[] = [
  { view: 'timer', label: 'Timer' },
  { view: 'tasks', label: 'Tasks' },
  { view: 'stats', label: 'Stats' },
  { view: 'themes', label: 'Themes' },
  { view: 'gallery', label: 'Community' },
  { view: 'settings', label: 'Settings' },
];

const VIEWS: Record<View, ComponentType> = {
  timer: TimerView,
  tasks: TasksView,
  stats: StatsView,
  themes: ThemesView,
  gallery: GalleryView,
  settings: SettingsView,
};

/**
 * Anything that already does something with Space. Space is the browser's "activate the
 * focused control" key, and a global shortcut that swallows it makes every button in the
 * app unreachable by keyboard — the nav, the timer controls, the task checkbox, the phase
 * buttons. The shortcut fires only when focus is somewhere that has no Space action of its
 * own.
 */
const SPACE_OWNS_FOCUS = [
  'button',
  'a[href]',
  'input',
  'textarea',
  'select',
  'summary',
  '[role="button"]',
  '[role="checkbox"]',
  '[role="tab"]',
  '[role="switch"]',
  '[role="menuitem"]',
  '[contenteditable="true"]',
].join(',');

function Shell() {
  const { state, dispatch } = useStore();
  const { view, settings } = state;

  // Space toggles the timer — unless the user is typing, a control owns the key, or a
  // dialog is open.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      if (event.code !== 'Space' && event.key !== 'r' && event.key !== 's' && !/^[1-6]$/.test(event.key))
        return;
      const target = event.target as HTMLElement | null;
      if (target?.isContentEditable) return;
      if (target?.closest(SPACE_OWNS_FOCUS)) return;
      if (document.querySelector('.dialog-backdrop')) return;

      // Modifier-free single keys: R resets, S skips, 1–6 jump to a view. The Space guard
      // list above already covers every element that owns single-key activation; a shortcut
      // that swallowed a keystroke inside a task input would be a data-loss bug, so the
      // same guard is deliberately shared rather than duplicated per key.
      if (event.code === 'Space') {
        event.preventDefault();
        dispatch({ type: 'timer/toggle' });
        return;
      }
      if (event.key === 'r') {
        event.preventDefault();
        dispatch({ type: 'timer/reset' });
        return;
      }
      if (event.key === 's') {
        event.preventDefault();
        dispatch({ type: 'timer/skip' });
        return;
      }
      const index = Number(event.key) - 1;
      event.preventDefault();
      dispatch({ type: 'view/set', view: NAV[index].view });
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [dispatch]);

  if (!settings.onboarded) return <Onboarding />;

  const Current = VIEWS[view];

  return (
    <div className="app">
      <header className="header">
        <span className="brand">
          <span className="brand__mark" aria-hidden="true" />
          Tincture
        </span>

        <nav className="nav" aria-label="Sections">
          {NAV.map((item) => (
            <button
              key={item.view}
              type="button"
              className="nav__item"
              aria-current={view === item.view ? 'page' : undefined}
              onClick={() => dispatch({ type: 'view/set', view: item.view })}
            >
              {item.label}
            </button>
          ))}
        </nav>
      </header>

      <main className="main">
        {/*
          One transition for every view, on purpose. A consistent rhythm is what makes an
          app feel built rather than assembled; a different entrance per page reads as four
          people having decorated four rooms.

          `mode="wait"` because the views are different heights — cross-fading them in place
          would make the page jump under the cursor. The exit is deliberately shorter than
          the entrance: leaving should feel instant, arriving should feel deliberate.
        */}
        <AnimatePresence mode="wait" initial={false}>
          <m.div
            key={view}
            className="view"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, transition: { duration: 0.14, ease: EASE_IN } }}
            transition={{ duration: 0.24, ease: EASE_OUT }}
          >
            <Current />
          </m.div>
        </AnimatePresence>
      </main>
    </div>
  );
}

export default function App() {
  return (
    /*
      `LazyMotion` + `strict` loads only the DOM feature set and makes `motion.*` throw, so
      every animation has to go through `m.*`. That is the point: the full `motion` bundle is
      ~48 kB gzipped, this feature set is roughly half, and `strict` is what stops someone
      (me, later) from quietly pulling the heavy path back in with one convenient import.

      `domMax` rather than `domAnimation` because the task list reorders when you complete
      something, and `layout` animations live in `domMax`. Without it the rows teleport.
    */
    <LazyMotion features={domMax} strict>
      <MotionRoot />
    </LazyMotion>
  );
}

/**
 * Wires the app's two motion switches into `motion`, so nothing downstream has to remember
 * them.
 *
 * - `MotionConfig reducedMotion` is the **user's** switch: `prefers-reduced-motion`, or the
 *   app's own setting, disables transform and layout animation while keeping opacity. Motion
 *   that is removed entirely is motion that leaves the user wondering what happened.
 * - `data-motion` is the **theme's** switch. `effects.motion` scales every duration the same
 *   way it scales the canvas motifs — a theme that asks for 0.5 runs half speed, and 0 stops
 *   it. The attribute lets the stylesheet's own animations honour it too.
 */
function MotionRoot() {
  const { state } = useStore();
  const theme = useMemo(
    () => findTheme(state.settings.themeId, state.customThemes),
    [state.settings.themeId, state.customThemes],
  );

  const themeMotion = theme.effects?.motion ?? 1;
  const reduced = state.settings.reduceMotion;
  const scale = reduced || themeMotion === 0 ? 0 : themeMotion;
  const mode = scale === 0 ? 'off' : scale < 1 ? 'slow' : scale > 1 ? 'fast' : 'on';

  return (
    <MotionConfig reducedMotion={reduced ? 'always' : 'user'}>
      <ToastProvider>
        <div
          className="app-root"
          data-motion={mode}
          style={{ '--motion-scale': scale } as CSSProperties}
        >
          <ThemeRoot />
          <Ambience />
          <Shell />
        </div>
      </ToastProvider>
    </MotionConfig>
  );
}
