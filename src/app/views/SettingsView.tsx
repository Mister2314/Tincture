import { Button, Field, Switch, ViewHeader } from '../../ui/primitives';
import { WheelField } from '../../ui/Wheel';
import { useStore } from '../state/store';

const minutes = (ms: number) => Math.round(ms / 60_000);

export function SettingsView() {
  const { state, dispatch } = useStore();
  const { settings } = state;

  const setConfig = (patch: Partial<typeof settings.config>) =>
    dispatch({ type: 'timer/config', config: patch });

  const requestNotifications = async (enabled: boolean) => {
    if (!enabled) {
      dispatch({ type: 'settings/patch', patch: { notificationsEnabled: false } });
      return;
    }
    if (typeof Notification === 'undefined') {
      dispatch({ type: 'settings/patch', patch: { notificationsEnabled: false } });
      return;
    }
    const permission =
      Notification.permission === 'default' ? await Notification.requestPermission() : Notification.permission;
    dispatch({
      type: 'settings/patch',
      patch: { notificationsEnabled: permission === 'granted' },
    });
  };

  return (
    <section aria-labelledby="settings-heading">
      <ViewHeader title="Settings" subtitle="Everything here is stored on this device." />

      <div className="card stack" style={{ marginBottom: 'var(--t-dimension-space-lg)' }}>
        <h2 style={{ fontSize: 15 }}>Timer</h2>

        <WheelField
          label="Focus length"
          hint="1–180 minutes."
          value={minutes(settings.config.focusMs)}
          onChange={(next) => setConfig({ focusMs: next * 60_000 })}
          min={1}
          max={180}
          unit="min"
        />

        <WheelField
          label="Short break"
          value={minutes(settings.config.shortBreakMs)}
          onChange={(next) => setConfig({ shortBreakMs: next * 60_000 })}
          min={1}
          max={60}
          unit="min"
        />

        <WheelField
          label="Long break"
          value={minutes(settings.config.longBreakMs)}
          onChange={(next) => setConfig({ longBreakMs: next * 60_000 })}
          min={1}
          max={180}
          unit="min"
        />

        <WheelField
          label="Long break after"
          hint="How many focus sessions between long breaks."
          value={settings.config.longBreakEvery}
          onChange={(next) => setConfig({ longBreakEvery: next })}
          min={2}
          max={12}
          unit="sessions"
        />

        <Switch
          checked={settings.config.autoStartBreaks}
          onChange={(v) => setConfig({ autoStartBreaks: v })}
          title="Start breaks automatically"
          description="A break begins the moment focus ends."
        />
        <Switch
          checked={settings.config.autoStartFocus}
          onChange={(v) => setConfig({ autoStartFocus: v })}
          title="Start focus automatically"
          description="Focus begins the moment a break ends. Off is usually kinder."
        />
      </div>

      <div className="card stack" style={{ marginBottom: 'var(--t-dimension-space-lg)' }}>
        <h2 style={{ fontSize: 15 }}>Goals and feedback</h2>

        <WheelField
          label="Daily goal"
          hint="Focus sessions per day."
          value={settings.dailyGoal}
          onChange={(next) => dispatch({ type: 'settings/patch', patch: { dailyGoal: next } })}
          min={1}
          max={30}
          unit="sessions"
        />

        <Switch
          checked={settings.soundEnabled}
          onChange={(v) => dispatch({ type: 'settings/patch', patch: { soundEnabled: v } })}
          title="Sound when a phase ends"
          description="A short tone, generated in the browser — no audio file is downloaded."
        />

        <Switch
          checked={settings.notificationsEnabled}
          onChange={(v) => void requestNotifications(v)}
          title="Desktop notification when a phase ends"
          description="Useful when the tab is in the background. Asks your browser for permission."
        />

        <Switch
          checked={settings.reduceMotion}
          onChange={(v) => dispatch({ type: 'settings/patch', patch: { reduceMotion: v } })}
          title="Reduce motion"
          description="Overrides the theme's motion setting."
        />
      </div>

      <div className="card stack" style={{ marginBottom: 'var(--t-dimension-space-lg)' }}>
        <h2 style={{ fontSize: 15 }}>You</h2>
        <Field label="Name" htmlFor="user-name" hint="Only used to greet you. Never sent anywhere.">
          <input
            id="user-name"
            className="input"
            maxLength={40}
            value={settings.name}
            onChange={(e) => dispatch({ type: 'settings/patch', patch: { name: e.target.value } })}
          />
        </Field>
        {/*
          This button used to dispatch `view/set: 'timer'`, which did nothing — the intro
          is not a view, it is what `App` renders instead of the shell while
          `settings.onboarded` is false. So the button looked broken because it was.
          The view is reset too, so finishing the intro lands on the timer rather than
          dropping you back on Settings.
        */}
        <Button
          onClick={() => {
            dispatch({ type: 'view/set', view: 'timer' });
            dispatch({ type: 'settings/patch', patch: { onboarded: false } });
          }}
        >
          Show the intro again
        </Button>
      </div>

      <div className="card stack">
        <h2 style={{ fontSize: 15 }}>Data</h2>
        <p className="muted" style={{ fontSize: 13.5 }}>
          {state.sessions.length} session{state.sessions.length === 1 ? '' : 's'} and{' '}
          {state.tasks.length} task{state.tasks.length === 1 ? '' : 's'} stored in this browser.
          There is no account and no server — clearing your browser data removes it.
        </p>
        <div className="row">
          <Button
            onClick={() => {
              const payload = JSON.stringify(
                { sessions: state.sessions, tasks: state.tasks, settings: state.settings },
                null,
                2,
              );
              const blob = new Blob([payload], { type: 'application/json' });
              const url = URL.createObjectURL(blob);
              const a = document.createElement('a');
              a.href = url;
              a.download = `tincture-export-${new Date().toISOString().slice(0, 10)}.json`;
              a.click();
              URL.revokeObjectURL(url);
            }}
          >
            Export my data
          </Button>
          <Button
            variant="danger"
            onClick={() => {
              if (window.confirm('Erase all sessions, tasks and settings on this device? This cannot be undone.')) {
                dispatch({ type: 'state/reset' });
              }
            }}
          >
            Erase everything
          </Button>
        </div>
      </div>
    </section>
  );
}
