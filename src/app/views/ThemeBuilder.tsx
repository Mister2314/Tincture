/**
 * The visual theme builder.
 *
 * This is how a non-coder makes a theme. It edits a plain token document and shows the
 * result live, then exports the same JSON a coder would hand-write.
 *
 * The builder never validates by guessing: every edit goes through `parseTheme`, and the
 * result is what gets previewed. That means the preview is showing exactly what the app
 * would paint — if the builder shows it, the theme is valid.
 *
 * ## Why the preview is a two-column layout
 *
 * It used to be a strip at the top of a scrolling list, which meant every control below the
 * fold was edited blind — and the strip only ever showed colours, because it was a plain
 * `div` with the theme's custom properties on it. Grain, glow, blur, motion and the motif
 * were all invisible: you could set them, and nothing anywhere would change. That is the
 * worst possible feedback, because it looks like it worked.
 *
 * So the preview is now `position: sticky` beside the controls, and it is the **real**
 * thing: the app's own class names for the chrome, the timer and a card, and an
 * `AmbienceLayer` underneath painting the draft theme's actual motif. Every control has
 * somewhere to show up.
 */

import { useEffect, useMemo, useRef, useState } from 'react';

import { AmbienceLayer } from '../ambience/Ambience';
import { applyTheme } from '../../theme/apply';
import { findTheme } from '../../theme/registry';
import { FONT_FAMILIES, MOTIFS, THEME_TOKEN_NAMES } from '../../theme/schema';
import { parseTheme } from '../../theme/validate';
import { Button, Dialog, Field, Select, useToast } from '../../ui/primitives';
import { useStore } from '../state/store';

/* ------------------------------------------------------------------ *
 * Editing model
 * ------------------------------------------------------------------ */

type Draft = Record<string, unknown>;

/** A blank-but-valid theme, so the builder always has something paintable. */
export function blankDraft(): Draft {
  return {
    id: 'my-theme',
    name: 'My theme',
    author: 'you',
    date: new Date().toISOString().slice(0, 10),
    version: '1.0.0',
    license: 'MIT',
    appearance: 'dark',
    description: '',
    motif: 'none',
    tokens: {
      color: {
        bg: '#101014',
        bgElevated: '#17171d',
        surface: '#1c1c24',
        surfaceHover: '#23232d',
        surfaceActive: '#2b2b37',
        text: '#f0f0f4',
        textMuted: '#a4a4b4',
        textSubtle: '#6f6f80',
        accent: '#6ea8fe',
        accentHover: '#8bbaff',
        accentText: '#101014',
        border: '#2a2a36',
        borderStrong: '#3d3d4d',
        focusRing: '#6ea8fe',
        success: '#5ec9a0',
        danger: '#e8697f',
      },
      dimension: {
        radiusSm: '6px',
        radiusMd: '12px',
        radiusLg: '20px',
        radiusFull: '9999px',
        spaceXs: '4px',
        spaceSm: '8px',
        spaceMd: '16px',
        spaceLg: '24px',
        spaceXl: '40px',
      },
      fontFamily: {
        display: 'instrument-serif',
        body: 'manrope',
        mono: 'jetbrains-mono',
      },
      shadow: {
        card: { x: 0, y: 1, blur: 2, spread: 0, color: '#00000066' },
        elevated: [
          { x: 0, y: 8, blur: 24, spread: -4, color: '#00000099' },
          { x: 0, y: 2, blur: 6, spread: 0, color: '#0000004d' },
        ],
      },
    },
    effects: { grain: 0.04, glow: 0.28, motion: 1, blur: 12, ambience: 0, density: 0.5, scale: 1, seed: 7 },
  };
}

/** Deep set at `a.b.c`. Mutates a structural clone, never the input. */
function setPath(source: Draft, path: string, value: unknown): Draft {
  const next = structuredClone(source);
  const parts = path.split('.');
  let cursor: Record<string, unknown> = next;
  for (let i = 0; i < parts.length - 1; i += 1) {
    const key = parts[i]!;
    if (typeof cursor[key] !== 'object' || cursor[key] === null) cursor[key] = {};
    cursor = cursor[key] as Record<string, unknown>;
  }
  cursor[parts[parts.length - 1]!] = value;
  return next;
}

function getPath(source: Draft, path: string): unknown {
  return path.split('.').reduce<unknown>((acc, key) => {
    if (typeof acc !== 'object' || acc === null) return undefined;
    return (acc as Record<string, unknown>)[key];
  }, source);
}

/* ------------------------------------------------------------------ *
 * Colour control
 * ------------------------------------------------------------------ */

/**
 * A swatch and a hex field.
 *
 * The swatch *is* the `<input type="color">` — not a button that opens one. `appearance:
 * none` plus the `::-webkit-color-swatch` reset turns it into a plain rounded square that
 * takes the theme's own border radius, which a wrapper button never would. The text field
 * stays the source of truth, because the native picker only understands `#rrggbb` and would
 * silently truncate the 8-digit form's alpha.
 */
function ColorControl({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (next: string) => void;
}) {
  const base = value.length >= 7 ? value.slice(0, 7) : value;
  const alpha = value.length === 9 ? value.slice(7) : '';

  return (
    <div className="colour">
      <input
        type="color"
        className="colour__swatch"
        aria-label={`${label} colour`}
        value={base}
        onChange={(e) => onChange(alpha ? `${e.target.value}${alpha}` : e.target.value)}
      />
      <span className="colour__meta">
        <span className="colour__label">{label}</span>
        <input
          className="colour__hex"
          aria-label={`${label} hex value`}
          value={value}
          spellCheck={false}
          onChange={(e) => onChange(e.target.value.trim())}
        />
      </span>
    </div>
  );
}

function Slider({
  label,
  hint,
  value,
  min,
  max,
  step,
  onChange,
  format,
}: {
  label: string;
  hint?: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (next: number) => void;
  format?: (v: number) => string;
}) {
  return (
    <div className="slider">
      <span className="slider__head">
        <span className="slider__label">{label}</span>
        <span className="slider__value">{format ? format(value) : value}</span>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        aria-label={label}
        onChange={(e) => onChange(Number(e.target.value))}
      />
      {hint ? <span className="field__hint">{hint}</span> : null}
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * The preview
 * ------------------------------------------------------------------ */

/**
 * A miniature of the app, built from the app's own class names.
 *
 * Not a picture of the app and not a swatch strip: the real type scale, the real radii, the
 * real shadows, the real chrome. It is the only way to see that a `radiusLg` of 2px makes
 * the timer look wrong, or that a `blur` of 0 leaves the header flat against the motif.
 */
function PreviewSpecimen() {
  const ring = 2 * Math.PI * 46;

  return (
    <div className="specimen">
      <div className="specimen__chrome">
        <span className="specimen__brand">
          <span className="specimen__mark" />
          Tincture
        </span>
        <span className="specimen__nav">
          <span className="specimen__nav-item" data-current="true">
            Timer
          </span>
          <span className="specimen__nav-item">Tasks</span>
          <span className="specimen__nav-item">Themes</span>
        </span>
      </div>

      <div className="specimen__body">
        <div className="specimen__phases">
          <span className="specimen__phase" data-on="true">
            Focus
          </span>
          <span className="specimen__phase">Short break</span>
        </div>

        <div className="specimen__dial">
          <svg viewBox="0 0 100 100" aria-hidden="true">
            <circle className="specimen__ring-track" cx="50" cy="50" r="46" fill="none" strokeWidth="2.5" />
            <circle
              className="specimen__ring-value"
              cx="50"
              cy="50"
              r="46"
              fill="none"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeDasharray={ring}
              strokeDashoffset={ring * 0.42}
            />
          </svg>
          <span className="specimen__readout">
            <span className="specimen__digits">24:13</span>
            <span className="specimen__label">Focus</span>
          </span>
        </div>

        <div className="specimen__controls">
          <span className="specimen__btn" data-primary="true">
            Pause
          </span>
          <span className="specimen__btn">Reset</span>
        </div>

        <div className="specimen__card">
          <span className="specimen__card-title">Working on Write the introduction</span>
          <span className="specimen__track">
            <span className="specimen__fill" />
          </span>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * The builder
 * ------------------------------------------------------------------ */

const COLOR_LABELS: Record<string, string> = {
  bg: 'Page background',
  bgElevated: 'Raised background',
  surface: 'Card surface',
  surfaceHover: 'Surface · hover',
  surfaceActive: 'Surface · active',
  text: 'Text',
  textMuted: 'Text · muted',
  textSubtle: 'Text · subtle',
  accent: 'Accent',
  accentHover: 'Accent · hover',
  accentText: 'Text on accent',
  border: 'Border',
  borderStrong: 'Border · strong',
  focusRing: 'Focus ring',
  success: 'Success',
  danger: 'Danger',
};

const TABS = [
  { key: 'colour', label: 'Colours' },
  { key: 'shape', label: 'Shape & type' },
  { key: 'motion', label: 'Motion & motif' },
  { key: 'json', label: 'JSON' },
] as const;

type TabKey = (typeof TABS)[number]['key'];

export function ThemeBuilder({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { state, dispatch } = useStore();
  const toast = useToast();
  const [draft, setDraft] = useState<Draft>(() => blankDraft());
  const [tab, setTab] = useState<TabKey>('colour');

  const parsed = useMemo(() => parseTheme(draft), [draft]);
  const issues = parsed.ok ? [] : parsed.issues;

  /**
   * The preview never shows a half-state. While the draft is invalid — mid-keystroke in the
   * hex field, say — the panel keeps painting the theme the app is actually wearing, and
   * says so. Showing a broken draft would be worse than showing a stale one.
   */
  const previewTheme = useMemo(
    () => (parsed.ok ? parsed.value : findTheme(state.settings.themeId, state.customThemes)),
    [parsed, state.settings.themeId, state.customThemes],
  );

  const stageRef = useRef<HTMLDivElement>(null);

  // The preview node carries the draft theme's custom properties, so everything inside it
  // — including the specimen's own class names — resolves to the draft's tokens.
  useEffect(() => {
    if (stageRef.current) applyTheme(previewTheme, stageRef.current);
  }, [previewTheme, open]);

  const update = (path: string, value: unknown) => setDraft((d) => setPath(d, path, value));

  const save = () => {
    if (!parsed.ok) {
      toast.error(`${issues.length} problem${issues.length === 1 ? '' : 's'} to fix before saving.`);
      return;
    }
    dispatch({ type: 'theme/add', theme: parsed.value });
    dispatch({ type: 'theme/select', id: parsed.value.id });
    toast.success(`“${parsed.value.name}” saved and applied.`);
    onClose();
  };

  const exportJson = () => {
    const text = JSON.stringify(draft, null, 2);
    navigator.clipboard?.writeText(text).then(
      () => toast.success('Theme JSON copied to the clipboard.'),
      () => toast.error('Could not reach the clipboard — copy from the JSON tab instead.'),
    );
  };

  return (
    <Dialog open={open} onClose={onClose} title="Theme builder" size="wide">
      <div className="builder">
        <div className="builder__controls">
          <div className="segmented" role="tablist">
            {TABS.map((entry) => (
              <button
                key={entry.key}
                type="button"
                role="tab"
                className="segmented__item"
                aria-selected={tab === entry.key}
                onClick={() => setTab(entry.key)}
              >
                {entry.label}
              </button>
            ))}
          </div>

          {issues.length > 0 ? (
            <div className="builder__status" data-tone="error">
              <p className="field__error">
                {issues.length} problem{issues.length === 1 ? '' : 's'} — fix these to save:
              </p>
              <ul className="issue-list">
                {issues.slice(0, 6).map((issue, i) => (
                  <li key={`${issue.path}-${i}`} className="issue">
                    <span className="issue__path">{issue.path}</span>
                    {issue.message}
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <p className="builder__status" data-tone="ok">
              Valid — this theme can be saved and shared.
            </p>
          )}

          {tab === 'colour' && (
            <>
              <div className="stack">
                <Field label="Theme name" htmlFor="theme-name">
                  <input
                    id="theme-name"
                    className="input"
                    value={String(getPath(draft, 'name') ?? '')}
                    onChange={(e) => update('name', e.target.value)}
                  />
                </Field>
                <Field
                  label="Identifier"
                  htmlFor="theme-id"
                  hint="Lowercase letters, numbers and dashes. This is how the theme is stored."
                >
                  <input
                    id="theme-id"
                    className="input"
                    value={String(getPath(draft, 'id') ?? '')}
                    spellCheck={false}
                    onChange={(e) =>
                      update(
                        'id',
                        e.target.value
                          .toLowerCase()
                          .replace(/[^a-z0-9-]/g, '-')
                          .replace(/-+/g, '-'),
                      )
                    }
                  />
                </Field>
                <Field label="Your name or handle" htmlFor="theme-author">
                  <input
                    id="theme-author"
                    className="input"
                    value={String(getPath(draft, 'author') ?? '')}
                    onChange={(e) => update('author', e.target.value)}
                  />
                </Field>
                <Field
                  label="Appearance"
                  htmlFor="theme-appearance"
                  hint="Themes the browser's own controls, and decides which group the gallery files it under."
                >
                  <Select
                    id="theme-appearance"
                    value={String(getPath(draft, 'appearance') ?? 'dark')}
                    onChange={(e) => update('appearance', e.target.value)}
                  >
                    <option value="dark">Dark</option>
                    <option value="light">Light</option>
                  </Select>
                </Field>
              </div>

              <div className="divider" />

              <div className="colour-grid">
                {THEME_TOKEN_NAMES.color.map((key) => (
                  <ColorControl
                    key={key}
                    label={COLOR_LABELS[key] ?? key}
                    value={String(getPath(draft, `tokens.color.${key}`) ?? '#000000')}
                    onChange={(next) => update(`tokens.color.${key}`, next)}
                  />
                ))}
              </div>
            </>
          )}

          {tab === 'shape' && (
            <div className="stack">
              {THEME_TOKEN_NAMES.fontFamily.map((key) => (
                <Field key={key} label={`${key} font`} htmlFor={`font-${key}`}>
                  <Select
                    id={`font-${key}`}
                    value={String(getPath(draft, `tokens.fontFamily.${key}`) ?? FONT_FAMILIES[0])}
                    onChange={(e) => update(`tokens.fontFamily.${key}`, e.target.value)}
                  >
                    {FONT_FAMILIES.map((f) => (
                      <option key={f} value={f}>
                        {f}
                      </option>
                    ))}
                  </Select>
                </Field>
              ))}
              <div className="divider" />
              {THEME_TOKEN_NAMES.dimension
                .filter((k) => k.startsWith('radius'))
                .map((key) => {
                  const raw = String(getPath(draft, `tokens.dimension.${key}`) ?? '0px');
                  const num = Number.parseFloat(raw) || 0;
                  return (
                    <Slider
                      key={key}
                      label={key}
                      value={num}
                      min={0}
                      max={key === 'radiusFull' ? 9999 : 40}
                      step={1}
                      format={(v) => `${v}px`}
                      onChange={(v) => update(`tokens.dimension.${key}`, `${v}px`)}
                    />
                  );
                })}
            </div>
          )}

          {tab === 'motion' && (
            <div className="stack">
              <Slider
                label="Grain"
                value={Number(getPath(draft, 'effects.grain') ?? 0)}
                min={0}
                max={0.2}
                step={0.005}
                format={(v) => v.toFixed(3)}
                onChange={(v) => update('effects.grain', v)}
              />
              <Slider
                label="Accent glow"
                value={Number(getPath(draft, 'effects.glow') ?? 0)}
                min={0}
                max={1}
                step={0.05}
                format={(v) => v.toFixed(2)}
                onChange={(v) => update('effects.glow', v)}
              />
              <Slider
                label="Motion speed"
                hint="Scales every transition — and the background motif with them. Zero stops both."
                value={Number(getPath(draft, 'effects.motion') ?? 1)}
                min={0}
                max={2}
                step={0.05}
                format={(v) => (v === 0 ? 'off' : `${v.toFixed(2)}×`)}
                onChange={(v) => update('effects.motion', v)}
              />
              <Slider
                label="Backdrop blur"
                value={Number(getPath(draft, 'effects.blur') ?? 0)}
                min={0}
                max={40}
                step={1}
                format={(v) => `${v}px`}
                onChange={(v) => update('effects.blur', v)}
              />

              <div className="divider" />

              <Field
                label="Background motif"
                hint="A motif is a name, never a file: the app owns the renderer, so a theme cannot carry code or an image. It is painted in the preview beside you."
                htmlFor="motif"
              >
                <Select
                  id="motif"
                  value={String(getPath(draft, 'motif') ?? 'none')}
                  onChange={(e) => update('motif', e.target.value)}
                >
                  {MOTIFS.map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </Select>
              </Field>

              <Slider
                label="Ambience strength"
                hint="How strongly the motif draws. Zero switches it off without changing the motif."
                value={Number(getPath(draft, 'effects.ambience') ?? 0)}
                min={0}
                max={1}
                step={0.05}
                format={(v) => (v === 0 ? 'off' : v.toFixed(2))}
                onChange={(v) => update('effects.ambience', v)}
              />
              <Slider
                label="Density"
                value={Number(getPath(draft, 'effects.density') ?? 0.5)}
                min={0}
                max={1}
                step={0.05}
                format={(v) => v.toFixed(2)}
                onChange={(v) => update('effects.density', v)}
              />
              <Slider
                label="Scale"
                value={Number(getPath(draft, 'effects.scale') ?? 1)}
                min={0.2}
                max={3}
                step={0.05}
                format={(v) => `${v.toFixed(2)}×`}
                onChange={(v) => update('effects.scale', v)}
              />
              <Slider
                label="Seed"
                hint="The same seed draws the same thing on every load. A background that rearranges itself reads as a bug, not as character."
                value={Number(getPath(draft, 'effects.seed') ?? 1)}
                min={0}
                max={999999}
                step={1}
                format={(v) => String(Math.round(v))}
                onChange={(v) => update('effects.seed', Math.round(v))}
              />
            </div>
          )}

          {tab === 'json' && (
            <Field
              label="Theme document"
              hint="This is exactly what gets saved and shared. Edit it directly if you prefer."
            >
              <textarea
                className="textarea"
                value={JSON.stringify(draft, null, 2)}
                spellCheck={false}
                onChange={(e) => {
                  try {
                    const next = JSON.parse(e.target.value) as Draft;
                    setDraft(next);
                  } catch {
                    /* mid-typing JSON is expected to be invalid; leave the draft alone */
                  }
                }}
              />
            </Field>
          )}

          <div className="builder__actions">
            <Button variant="ghost" onClick={() => setDraft(blankDraft())}>
              Start over
            </Button>
            <div className="row">
              <Button onClick={exportJson}>Copy JSON</Button>
              <Button variant="primary" onClick={save} disabled={!parsed.ok}>
                Save theme
              </Button>
            </div>
          </div>
        </div>

        <aside className="builder__aside">
          <div className="builder__stage" ref={stageRef}>
            <AmbienceLayer
              theme={previewTheme}
              mode="fill"
              phase="focus"
              running
              reduceMotion={state.settings.reduceMotion}
            />
            <PreviewSpecimen />
          </div>

          <p className="builder__note">
            {parsed.ok
              ? `${previewTheme.name} · ${previewTheme.motif && previewTheme.motif !== 'none' ? previewTheme.motif : 'no motif'}`
              : 'Showing the current theme until the draft is valid again.'}
          </p>
        </aside>
      </div>
    </Dialog>
  );
}
