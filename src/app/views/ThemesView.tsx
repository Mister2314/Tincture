/**
 * The theme gallery.
 *
 * Two sources — the built-ins that ship with the app, and anything the user built or
 * imported — split by **appearance**, because that is the only question anyone actually
 * arrives with. "I want something dark for tonight" is a real need; "show me all nine in
 * alphabetical order" is not. A filter row carries the same information as a second axis,
 * so the grid can stay a grid.
 *
 * Both are rendered from *resolved* themes, so a card can only ever show something that
 * already passed validation. The preview is the real thing: each card applies the theme to
 * its own node with the same `applyTheme` the app uses, so what the card shows is what the
 * app will look like.
 *
 * The card does **not** render the theme's motif. Nine live canvases in a grid is nine
 * animation loops for a picture 200px wide; the motif is named instead, and the theme
 * builder is where you see it move.
 */

import { useMemo, useState } from 'react';

import { allThemes, isBuiltIn } from '../../theme/registry';
import { parseThemeJson } from '../../theme/validate';
import { Button, Dialog, Field, useToast, ViewHeader } from '../../ui/primitives';
import { FileDrop } from '../../ui/FileDrop';
import { useStore } from '../state/store';
import { ThemeBuilder } from './ThemeBuilder';
import { ThemeCard } from './ThemeCard';

/* ------------------------------------------------------------------ *
 * View
 * ------------------------------------------------------------------ */

type Filter = 'all' | 'dark' | 'light';

const FILTERS: { key: Filter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'dark', label: 'Dark' },
  { key: 'light', label: 'Light' },
];

export function ThemesView() {
  const { state, dispatch } = useStore();
  const toast = useToast();
  const [builderOpen, setBuilderOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [importText, setImportText] = useState('');
  const [filter, setFilter] = useState<Filter>('all');

  const themes = useMemo(() => allThemes(state.customThemes), [state.customThemes]);

  const counts = useMemo(
    () => ({
      all: themes.length,
      dark: themes.filter((t) => t.appearance === 'dark').length,
      light: themes.filter((t) => t.appearance === 'light').length,
    }),
    [themes],
  );

  const sections = useMemo(
    () =>
      (['dark', 'light'] as const)
        .filter((appearance) => filter === 'all' || filter === appearance)
        .map((appearance) => ({
          appearance,
          items: themes.filter((t) => t.appearance === appearance),
        })),
    [themes, filter],
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

      <div className="theme-filter" role="group" aria-label="Filter themes by appearance">
        {FILTERS.map((entry) => (
          <button
            key={entry.key}
            type="button"
            className="theme-filter__chip"
            aria-pressed={filter === entry.key}
            onClick={() => setFilter(entry.key)}
          >
            {entry.key !== 'all' ? (
              <span className="theme-filter__dot" data-appearance={entry.key} aria-hidden="true" />
            ) : null}
            {entry.label}
            <span className="theme-filter__count">{counts[entry.key]}</span>
          </button>
        ))}
      </div>

      {sections.map(({ appearance, items }) =>
        items.length === 0 ? null : (
          <section className="theme-section" key={appearance}>
            <h2 className="theme-section__title">
              <span className="theme-filter__dot" data-appearance={appearance} aria-hidden="true" />
              {appearance === 'dark' ? 'Dark' : 'Light'}
              <span className="theme-section__count">{items.length}</span>
            </h2>

            <div className="theme-grid">
              {items.map((theme) => (
                <ThemeCard
                  key={theme.id}
                  theme={theme}
                  selected={theme.id === state.settings.themeId}
                  onSelect={() => dispatch({ type: 'theme/select', id: theme.id })}
                  onDelete={
                    isBuiltIn(theme.id)
                      ? undefined
                      : () => {
                          dispatch({ type: 'theme/remove', id: theme.id });
                          toast.info(`“${theme.name}” deleted.`);
                        }
                  }
                />
              ))}
            </div>
          </section>
        ),
      )}

      <ThemeBuilder open={builderOpen} onClose={() => setBuilderOpen(false)} />

      <Dialog open={importOpen} onClose={() => setImportOpen(false)} title="Import a theme">
        <div className="stack">
          <FileDrop
            accept="application/json,.json"
            onFile={onFile}
            title="Choose a theme file"
            hint="…or drop a .json here. Max 256 KB."
            icon={
              <svg viewBox="0 0 24 24" focusable="false">
                <path
                  d="M12 15.5V4m0 0L7.5 8.5M12 4l4.5 4.5M5 15v3.5A1.5 1.5 0 0 0 6.5 20h11a1.5 1.5 0 0 0 1.5-1.5V15"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.7"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            }
          />

          <div className="or-rule">
            <span>or paste it</span>
          </div>

          <Field
            label="Theme JSON"
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
