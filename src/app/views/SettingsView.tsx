import { useState } from 'react';

import { Button, Dialog, Field, Switch, ViewHeader } from '../../ui/primitives';
import { WheelField } from '../../ui/Wheel';
import { clearState } from '../state/persistence';
import { useStore } from '../state/store';

const minutes = (ms: number) => Math.round(ms / 60_000);

export function SettingsView() {
  const { state, dispatch } = useStore();
  const { settings } = state;
  const [eraseOpen, setEraseOpen] = useState(false);

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
        <h2 style={{ fontSize: 15 }}>Keyboard</h2>
        <p className="muted" style={{ fontSize: 13.5, lineHeight: 1.7, margin: 0 }}>
          <kbd>Space</kbd> start / pause · <kbd>R</kbd> reset · <kbd>S</kbd> skip ·{' '}
          <kbd>1</kbd>–<kbd>6</kbd> sections. They never fire while you are typing or a dialog
          is open.
        </p>
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
          <Button variant="danger" onClick={() => setEraseOpen(true)}>
            Erase everything
          </Button>
        </div>
      </div>

      {/*
        A dialog rather than `window.confirm`: the app draws its own controls everywhere
        else, and a native confirm is the one place it stopped — on the most destructive
        action in the product. `clearState()` removes the stored document *and*
        `state/reset` rebuilds an empty one, because the reset alone used to reload the
        very data it was supposed to delete.
      */}
      <Dialog open={eraseOpen} onClose={() => setEraseOpen(false)} title="Erase everything?">
        <p style={{ fontSize: 14, lineHeight: 1.6 }}>
          This deletes every session, task, custom theme and setting stored in this browser.
          It cannot be undone, and there is no copy anywhere else.
        </p>
        <p className="muted" style={{ fontSize: 13.5, marginTop: 'var(--t-dimension-space-sm)' }}>
          Export your data first if you might want it back.
        </p>
        <div className="row row--between" style={{ marginTop: 'var(--t-dimension-space-lg)' }}>
          <Button variant="ghost" onClick={() => setEraseOpen(false)}>
            Keep my data
          </Button>
          <Button
            variant="danger"
            onClick={() => {
              clearState();
              dispatch({ type: 'state/reset' });
              setEraseOpen(false);
            }}
          >
            Erase everything
          </Button>
        </div>
      </Dialog>
    </section>
  );
}
