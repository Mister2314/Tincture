/**
 * First run.
 *
 * The goal is that nobody has a question left when this closes. It asks the four things the
 * app cannot guess (name, session length, daily goal, theme) and then *explains itself* —
 * what the phases mean, where the data lives, how themes work.
 *
 * Every answer is written to the store as it is chosen, so the app behind the dialog is
 * already configured. Finishing is a formality, not a commit.
 */

import { useState } from 'react';

import { BUILT_IN_THEMES } from '../../theme/registry';
import { Button } from '../../ui/primitives';
import { useStore } from '../state/store';
import { ThemeCard } from './ThemeCard';

const STEPS = ['Welcome', 'Rhythm', 'Goal', 'Look', 'How it works'] as const;

const LENGTHS = [
  { minutes: 25, label: '25 minutes', desc: 'The classic. Works for most people.' },
  { minutes: 50, label: '50 minutes', desc: 'For work that needs a long runway.' },
  { minutes: 15, label: '15 minutes', desc: 'When starting is the hard part.' },
];

const GOALS = [
  { count: 4, label: '4 sessions', desc: 'About two hours. A gentle start.' },
  { count: 8, label: '8 sessions', desc: 'About four hours. A full working day.' },
  { count: 12, label: '12 sessions', desc: 'Ambitious. Better for a deadline week.' },
];

export function Onboarding() {
  const { state, dispatch } = useStore();
  const [step, setStep] = useState(0);

  const { settings } = state;
  const patch = (p: Parameters<typeof dispatch>[0] extends never ? never : Partial<typeof settings>) =>
    dispatch({ type: 'settings/patch', patch: p });

  const next = () => setStep((s) => Math.min(STEPS.length - 1, s + 1));
  const back = () => setStep((s) => Math.max(0, s - 1));
  const finish = () => patch({ onboarded: true });

  return (
    <div className="onboarding">
      <div className="onboarding__panel">
        <p className="onboarding__step">
          Step {step + 1} of {STEPS.length} · {STEPS[step]}
        </p>

        {step === 0 && (
          <>
            <h1 className="onboarding__title">Tincture</h1>
            <p className="onboarding__body">
              A focus timer with themes. Work in short blocks, rest between them, and shape the
              whole thing to look however you like — including with themes other people have
              made.
              <br />
              <br />
              Everything stays in this browser. No account, no server, nothing sent anywhere.
            </p>
            <div className="stack" style={{ marginBottom: 'var(--t-dimension-space-lg)' }}>
              <label className="field">
                <span className="field__label">What should I call you? (optional)</span>
                <input
                  className="input"
                  maxLength={40}
                  value={settings.name}
                  placeholder="Your name"
                  onChange={(e) => patch({ name: e.target.value })}
                />
              </label>
            </div>
          </>
        )}

        {step === 1 && (
          <>
            <h1 className="onboarding__title">How long is a session?</h1>
            <p className="onboarding__body">
              A focus session is one unbroken block of work. The break that follows it is
              automatic — you can change all of this later in Settings.
            </p>
            <div className="onboarding__choices">
              {LENGTHS.map((option) => (
                <button
                  key={option.minutes}
                  type="button"
                  className="choice"
                  aria-pressed={settings.config.focusMs === option.minutes * 60_000}
                  onClick={() => dispatch({ type: 'timer/config', config: { focusMs: option.minutes * 60_000 } })}
                >
                  <span>
                    <span className="choice__title">{option.label}</span>
                    <br />
                    <span className="choice__desc">{option.desc}</span>
                  </span>
                </button>
              ))}
            </div>
          </>
        )}

        {step === 2 && (
          <>
            <h1 className="onboarding__title">What are you aiming for?</h1>
            <p className="onboarding__body">
              This sets the daily goal shown on the timer and in your statistics. Missing it is
              fine — it is a target, not a debt.
            </p>
            <div className="onboarding__choices">
              {GOALS.map((option) => (
                <button
                  key={option.count}
                  type="button"
                  className="choice"
                  aria-pressed={settings.dailyGoal === option.count}
                  onClick={() => patch({ dailyGoal: option.count })}
                >
                  <span>
                    <span className="choice__title">{option.label}</span>
                    <br />
                    <span className="choice__desc">{option.desc}</span>
                  </span>
                </button>
              ))}
            </div>
          </>
        )}

        {step === 3 && (
          <>
            <h1 className="onboarding__title">Pick a look</h1>
            <p className="onboarding__body">
              You can change this any time, and build your own in the Themes tab. Click one to
              see it applied straight away.
            </p>
            <div className="theme-grid" style={{ marginBottom: 'var(--t-dimension-space-lg)' }}>
              {BUILT_IN_THEMES.map((theme) => (
                <ThemeCard
                  key={theme.id}
                  theme={theme}
                  selected={settings.themeId === theme.id}
                  selectedLabel="Picked"
                  onSelect={() => dispatch({ type: 'theme/select', id: theme.id })}
                />
              ))}
            </div>
          </>
        )}

        {step === 4 && (
          <>
            <h1 className="onboarding__title">That is everything</h1>
            <p className="onboarding__body">
              Here is the whole app in six lines. Nothing else is hidden.
            </p>

            <ol
              className="onboarding__body"
              style={{ paddingLeft: 20, display: 'flex', flexDirection: 'column', gap: 10, fontSize: 14 }}
            >
              <li>
                <strong>Start</strong> begins a focus session. <strong>Pause</strong> freezes it —
                and keeps the time honest even if you close the tab. <strong>Reset</strong> starts
                the current phase over; <strong>Skip</strong> moves on without counting it.
              </li>
              <li>
                When focus ends you get a break, and every fourth one is a long break. Both are
                automatic; you can turn that off in Settings.
              </li>
              <li>
                <strong>Tasks</strong> let you give a job an estimate in sessions. Pick one as
                active and each finished session fills a pip.
              </li>
              <li>
                <strong>Statistics</strong> shows today, your streak, and the last fourteen days.
              </li>
              <li>
                <strong>Themes</strong> is where you change the look — nine are built in, you can
                build your own without writing any code, and <strong>Community</strong> has themes
                other people have contributed.
              </li>
              <li>
                Everything lives in this browser. Settings → Data exports it or erases it.
              </li>
            </ol>

            <p className="onboarding__body" style={{ marginTop: 'var(--t-dimension-space-md)' }}>
              Your setup so far: <strong>{Math.round(settings.config.focusMs / 60_000)}-minute</strong>{' '}
              sessions, a goal of <strong>{settings.dailyGoal}</strong> a day, theme{' '}
              <strong>{settings.themeId}</strong>.
            </p>
          </>
        )}

        <div className="onboarding__footer">
          <div className="progress-dots" aria-hidden="true">
            {STEPS.map((_, i) => (
              <span key={i} className="progress-dots__dot" data-current={i === step} />
            ))}
          </div>

          <div className="row">
            {step > 0 ? (
              <Button variant="ghost" onClick={back}>
                Back
              </Button>
            ) : null}
            {step < STEPS.length - 1 ? (
              <Button variant="primary" onClick={next}>
                Continue
              </Button>
            ) : (
              <Button variant="primary" onClick={finish}>
                Start focusing
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
