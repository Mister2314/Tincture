import { useEffect } from 'react';

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
    <ToastProvider>
      <ThemeRoot />
      <Shell />
    </ToastProvider>
  );
}
