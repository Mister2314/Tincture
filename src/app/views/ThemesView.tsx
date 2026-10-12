/**
 * The theme gallery.
 *
 * Two sources: the built-ins that ship with the app, and anything the user built or
 * imported. Both are rendered from *resolved* themes, so a card can only ever show
 * something that already passed validation.
 *
 * The preview is the real thing: each card applies the theme to its own node with the same
 * `applyTheme` the app uses, so what the card shows is what the app will look like.
 */

import { useMemo, useRef, useState } from 'react';

import { applyTheme } from '../../theme/apply';
import { allThemes, isBuiltIn } from '../../theme/registry';
import { parseThemeJson, type ResolvedTheme } from '../../theme/validate';
import { Button, Dialog, Field, useToast, ViewHeader } from '../../ui/primitives';
import { useStore } from '../state/store';
import { ThemeBuilder } from './ThemeBuilder';

/* ------------------------------------------------------------------ *
 * Card
 * ------------------------------------------------------------------ */

function ThemeCard({
  theme,
  selected,
  onSelect,
  onDelete,
}: {
  theme: ResolvedTheme;
  selected: boolean;
  onSelect: () => void;
  onDelete?: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const applied = useRef<string | null>(null);

  // Apply once per theme. `applyTheme` writes custom properties onto this node only, so the
  // rest of the app is untouched.
  if (ref.current && applied.current !== theme.id) {
    applyTheme(theme, ref.current);
    applied.current = theme.id;
  }

  const swatches = [
    theme.tokens.color.bg,
    theme.tokens.color.surface,
    theme.tokens.color.accent,
    theme.tokens.color.text,
  ];

  return (
    <button
      type="button"
      className="theme-card"
      data-selected={selected}
      onClick={onSelect}
      aria-pressed={selected}
      aria-label={`Apply ${theme.name}`}
    >
      <div className="theme-card__preview" ref={ref}>
        <div className="theme-card__swatches" aria-hidden="true">
          {swatches.map((c, i) => (
            <span key={i} className="theme-card__swatch" style={{ background: c }} />
          ))}
        </div>
        <div className="theme-card__sample" aria-hidden="true">
          25:00
        </div>
      </div>

      <div className="theme-card__meta">
        <span>
          <span className="theme-card__name">{theme.name}</span>
          <br />
          <span className="theme-card__author">by {theme.author}</span>
        </span>
        <span style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          {selected ? <span className="badge badge--accent">Active</span> : null}
          {onDelete ? (
            <span
              role="button"
              tabIndex={0}
              className="badge"
              title="Delete this theme"
              onClick={(e) => {
                e.stopPropagation();
                onDelete();
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.stopPropagation();
                  e.preventDefault();
                  onDelete();
                }
              }}
            >
              Delete
            </span>
          ) : null}
        </span>
      </div>
    </button>
  );
}

/* ------------------------------------------------------------------ *
 * View
 * ------------------------------------------------------------------ */

export function ThemesView() {
  const { state, dispatch } = useStore();
  const toast = useToast();
  const [builderOpen, setBuilderOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [importText, setImportText] = useState('');

  const themes = useMemo(() => allThemes(state.customThemes), [state.customThemes]);
  const grouped = useMemo(
    () => ({
      custom: themes.filter((t) => !isBuiltIn(t.id)),
      builtIn: themes.filter((t) => isBuiltIn(t.id)),
    }),
    [themes],
  );

  const importIssues = importText.trim() ? parseThemeJson(importText) : null;

  const runImport = () => {
    const result = parseThemeJson(importText);
    if (!result.ok) {
      toast.error(`Rejected — ${result.issues.length} problem${result.issues.length === 1 ? '' : 's'}.`);
      return;
    }
    dispatch({ type: 'theme/add', theme: result.value });
    dispatch({ type: 'theme/select', id: result.value.id });
    toast.success(`“${result.value.name}” imported and applied.`);
    setImportText('');
    setImportOpen(false);
  };

  const onFile = (file: File | undefined) => {
    if (!file) return;
    if (file.size > 256 * 1024) {
      toast.error('That file is larger than 256 KB — a theme should be a few kilobytes.');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => setImportText(String(reader.result ?? ''));
    reader.onerror = () => toast.error('Could not read that file.');
    reader.readAsText(file);
  };

  return (
    <section aria-labelledby="themes-heading">
      <ViewHeader
        title="Themes"
        subtitle="Every theme is a small JSON document. Pick one, or build your own — no code required."
        actions={
          <>
            <Button onClick={() => setImportOpen(true)}>Import</Button>
            <Button variant="primary" onClick={() => setBuilderOpen(true)}>
              Build a theme
            </Button>
          </>
        }
      />

      {grouped.custom.length > 0 ? (
        <>
          <h2 style={{ fontSize: 15, margin: 'var(--t-dimension-space-md) 0' }}>Your themes</h2>
          <div className="theme-grid" style={{ marginBottom: 'var(--t-dimension-space-lg)' }}>
            {grouped.custom.map((theme) => (
              <ThemeCard
                key={theme.id}
                theme={theme}
                selected={theme.id === state.settings.themeId}
                onSelect={() => dispatch({ type: 'theme/select', id: theme.id })}
                onDelete={() => {
                  dispatch({ type: 'theme/remove', id: theme.id });
                  toast.info(`“${theme.name}” deleted.`);
                }}
              />
            ))}
          </div>
        </>
      ) : null}

      <h2 style={{ fontSize: 15, margin: 'var(--t-dimension-space-md) 0' }}>Built in</h2>
      <div className="theme-grid">
        {grouped.builtIn.map((theme) => (
          <ThemeCard
            key={theme.id}
            theme={theme}
            selected={theme.id === state.settings.themeId}
            onSelect={() => dispatch({ type: 'theme/select', id: theme.id })}
          />
        ))}
      </div>

      <ThemeBuilder open={builderOpen} onClose={() => setBuilderOpen(false)} />

      <Dialog open={importOpen} onClose={() => setImportOpen(false)} title="Import a theme">
        <div className="stack">
          <Field
            label="Theme file"
            hint="A .json theme from the community gallery, or one you exported earlier. Max 256 KB."
          >
            <input
              className="input"
              type="file"
              accept="application/json,.json"
              onChange={(e) => onFile(e.target.files?.[0])}
            />
          </Field>

          <Field
            label="…or paste it"
            hint="Pasting runs the same checks as a file. A theme that is not valid is refused, not sanitised."
          >
            <textarea
              className="textarea"
              value={importText}
              spellCheck={false}
              placeholder='{ "id": "my-theme", "name": "My theme", … }'
              onChange={(e) => setImportText(e.target.value)}
            />
          </Field>

          {importIssues && !importIssues.ok ? (
            <>
              <p className="field__error">
                {importIssues.issues.length} problem
                {importIssues.issues.length === 1 ? '' : 's'}:
              </p>
              <ul className="issue-list">
                {importIssues.issues.slice(0, 8).map((issue, i) => (
                  <li key={`${issue.path}-${i}`} className="issue">
                    <span className="issue__path">{issue.path}</span>
                    {issue.message}
                  </li>
                ))}
              </ul>
            </>
          ) : importIssues?.ok ? (
            <p className="field__hint">
              Valid — this would apply “{importIssues.value.name}” by {importIssues.value.author}.
            </p>
          ) : null}
        </div>

        <div className="row row--between" style={{ marginTop: 'var(--t-dimension-space-lg)' }}>
          <Button variant="ghost" onClick={() => setImportText('')} disabled={!importText}>
            Clear
          </Button>
          <Button variant="primary" onClick={runImport} disabled={!importIssues?.ok}>
            Import and apply
          </Button>
        </div>
      </Dialog>
    </section>
  );
}
