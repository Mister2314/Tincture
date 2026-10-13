import { useEffect } from 'react';
import { LazyMotion, domMax } from 'motion/react';

import { Ambience } from './app/ambience/Ambience';
import { ThemeRoot } from './app/ThemeRoot';
import { useStore, type View } from './app/state/store';
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

function Shell() {
  const { state, dispatch } = useStore();
  const { view, settings } = state;

  // Space toggles the timer — unless the user is typing, or a dialog is open.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.code !== 'Space') return;
      const target = event.target as HTMLElement | null;
      const tag = target?.tagName.toLowerCase();
      if (tag === 'input' || tag === 'textarea' || tag === 'select') return;
      if (target?.isContentEditable) return;
      if (document.querySelector('.dialog-backdrop')) return;

      event.preventDefault();
      dispatch({ type: 'timer/toggle' });
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [dispatch]);

  if (!settings.onboarded) return <Onboarding />;

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
        {view === 'timer' && <TimerView />}
        {view === 'tasks' && <TasksView />}
        {view === 'stats' && <StatsView />}
        {view === 'themes' && <ThemesView />}
        {view === 'gallery' && <GalleryView />}
        {view === 'settings' && <SettingsView />}
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
      <ToastProvider>
        {/*
          One stacking context for the whole app. That is what lets the ambience sit at a
          negative z-index — behind the content, above the page background — instead of
          needing a positive one and covering everything. Without it a `z-index: 0` fixed
          layer paints on top of in-flow content, and the timer disappears behind its own
          background.
        */}
        <div className="app-root">
          <ThemeRoot />
          <Ambience />
          <Shell />
        </div>
      </ToastProvider>
    </LazyMotion>
  );
}
