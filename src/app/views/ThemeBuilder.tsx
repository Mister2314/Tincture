/**
 * The visual theme builder.
 *
 * This is how a non-coder makes a theme. It edits a plain token document and shows the
 * result live, then exports the same JSON a coder would hand-write.
 *
 * The builder never validates by guessing: every edit goes through `parseTheme`, and the
 * result is what gets previewed. That means the preview is showing exactly what the app
 * would paint — if the builder shows it, the theme is valid.
 */

import { useMemo, useState } from 'react';

import { THEME_TOKEN_NAMES, FONT_FAMILIES } from '../../theme/schema';
import { applyTheme } from '../../theme/apply';
import { parseTheme } from '../../theme/validate';
import { Button, Dialog, Field, useToast } from '../../ui/primitives';
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
    effects: { grain: 0.03, glow: 0.25, motion: 1, blur: 12 },
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
 * A hex field plus a native picker.
 *
 * `<input type="color">` only understands `#rrggbb`, so it edits the first six digits and
 * leaves any alpha untouched. The text field remains the source of truth, which is what
 * keeps `#rrggbbaa` values from being silently truncated.
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
    <div className="field">
      <span className="field__label">{label}</span>
      <div className="row">
        <input
          type="color"
          aria-label={`${label} colour`}
          value={base}
          onChange={(e) => onChange(alpha ? `${e.target.value}${alpha}` : e.target.value)}
          style={{
            width: 40,
            height: 36,
            padding: 2,
            background: 'var(--t-color-bg-elevated)',
            border: '1px solid var(--t-color-border)',
            borderRadius: 'var(--t-dimension-radius-sm)',
          }}
        />
        <input
          className="input"
          aria-label={`${label} hex value`}
          value={value}
          spellCheck={false}
          onChange={(e) => onChange(e.target.value.trim())}
          style={{ fontFamily: 'var(--t-fontFamily-mono)', fontSize: 12.5 }}
        />
      </div>
    </div>
  );
}

function Slider({
  label,
  value,
  min,
  max,
  step,
  onChange,
  format,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (next: number) => void;
  format?: (v: number) => string;
}) {
  return (
    <div className="field">
      <span className="field__label">
        {label} <span className="subtle">{format ? format(value) : value}</span>
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

export function ThemeBuilder({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { state, dispatch } = useStore();
  const toast = useToast();
  const [draft, setDraft] = useState<Draft>(() => blankDraft());
  const [tab, setTab] = useState<'colour' | 'shape' | 'motion' | 'json'>('colour');

  const parsed = useMemo(() => parseTheme(draft), [draft]);
  const issues = parsed.ok ? [] : parsed.issues;

  // The live preview writes onto its own node, so the running app keeps its theme.
  const previewRef = (node: HTMLDivElement | null) => {
    if (!node || !parsed.ok) return;
    applyTheme(parsed.value, node);
  };

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
    <Dialog open={open} onClose={onClose} title="Theme builder">
      <div className="row" role="tablist" style={{ marginBottom: 'var(--t-dimension-space-md)', flexWrap: 'wrap' }}>
        {(['colour', 'shape', 'motion', 'json'] as const).map((key) => (
          <Button
            key={key}
            variant={tab === key ? 'primary' : 'ghost'}
            onClick={() => setTab(key)}
            role="tab"
            aria-selected={tab === key}
          >
            {key === 'colour' ? 'Colours' : key === 'shape' ? 'Shape & type' : key === 'motion' ? 'Motion' : 'JSON'}
          </Button>
        ))}
      </div>

      {/* Live preview — the actual app styles, on a node of their own. */}
      <div
        ref={previewRef}
        style={{
          padding: 'var(--t-dimension-space-lg)',
          borderRadius: 'var(--t-dimension-radius-lg)',
          background: 'var(--t-color-bg)',
          border: '1px solid var(--t-color-border)',
          marginBottom: 'var(--t-dimension-space-md)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div
            style={{
              fontFamily: 'var(--t-fontFamily-mono)',
              fontSize: 30,
              fontVariantNumeric: 'tabular-nums',
              color: 'var(--t-color-text)',
            }}
          >
            24:13
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            <span
              className="btn btn--primary"
              style={{ pointerEvents: 'none', padding: '8px 14px', fontSize: 13 }}
            >
              Pause
            </span>
            <span
              className="btn"
              style={{ pointerEvents: 'none', padding: '8px 14px', fontSize: 13 }}
            >
              Reset
            </span>
          </div>
        </div>
        <p style={{ marginTop: 12, color: 'var(--t-color-text-muted)', fontSize: 13 }}>
          Working on <span style={{ color: 'var(--t-color-accent)' }}>Write the introduction</span>
        </p>
      </div>

      {issues.length > 0 ? (
        <div style={{ marginBottom: 'var(--t-dimension-space-md)' }}>
          <p className="field__error" style={{ marginBottom: 6 }}>
            {issues.length} problem{issues.length === 1 ? '' : 's'} — fix these to save:
          </p>
          <ul className="issue-list">
            {issues.slice(0, 8).map((issue, i) => (
              <li key={`${issue.path}-${i}`} className="issue">
                <span className="issue__path">{issue.path}</span>
                {issue.message}
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <p className="field__hint" style={{ marginBottom: 'var(--t-dimension-space-md)' }}>
          Valid — this theme can be saved and shared.
        </p>
      )}

      {tab === 'colour' && (
        <>
          <div className="stack" style={{ marginBottom: 'var(--t-dimension-space-md)' }}>
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
            <Field label="Appearance" htmlFor="theme-appearance" hint="Themes the browser's own controls.">
              <select
                id="theme-appearance"
                className="select"
                value={String(getPath(draft, 'appearance') ?? 'dark')}
                onChange={(e) => update('appearance', e.target.value)}
              >
                <option value="dark">Dark</option>
                <option value="light">Light</option>
              </select>
            </Field>
          </div>

          <div className="divider" />

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
              gap: 'var(--t-dimension-space-md)',
            }}
          >
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
              <select
                id={`font-${key}`}
                className="select"
                value={String(getPath(draft, `tokens.fontFamily.${key}`) ?? FONT_FAMILIES[0])}
                onChange={(e) => update(`tokens.fontFamily.${key}`, e.target.value)}
              >
                {FONT_FAMILIES.map((f) => (
                  <option key={f} value={f}>
                    {f}
                  </option>
                ))}
              </select>
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

      <div className="row row--between" style={{ marginTop: 'var(--t-dimension-space-lg)' }}>
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

      {state.customThemes.length > 0 ? (
        <p className="field__hint" style={{ marginTop: 'var(--t-dimension-space-md)' }}>
          You have {state.customThemes.length} saved theme
          {state.customThemes.length === 1 ? '' : 's'} on this device.
        </p>
      ) : null}
    </Dialog>
  );
}
