/**
 * A theme card.
 *
 * One component, used by the gallery, by the first-run theme step and by the theme list,
 * because they are the same object seen three times: a theme, a preview of it, and one
 * action. Three copies of a card is three cards that drift apart the first time one of them
 * is improved — and they had already drifted, in three different shapes.
 *
 * The preview shows the theme's **motif** — one static frame, never a loop.
 *
 * This reverses an earlier decision, so the reasoning is recorded here in full. The card
 * used to name the motif and render only a ring and four swatches, on the argument that
 * *"a grid of live canvases is a grid of animation loops for a picture 220px wide."* The
 * argument was about loops. It was never about the picture — and throwing the picture
 * away cost the one thing that makes a character theme recognisable: Van Gogh became
 * Midnight with different dots. So the card now paints the motif through the same layer
 * the app and the builder use, with reduced motion forced on: one frame is drawn when
 * the card mounts, and no `requestAnimationFrame` is ever opened. Nine cards cost nine
 * one-shot draws and zero loops — the picture is back, the budget is not spent.
 *
 * The action is its own `<button>` and the secondary action is a sibling — not a
 * `role="button"` span nested inside a button. Nested interactive content is invalid,
 * unreachable by keyboard, and needs `stopPropagation` on every handler to behave.
 */

import { useEffect, useRef, type ReactNode } from 'react';

import { AmbienceLayer } from '../ambience/Ambience';
import { applyTheme } from '../../theme/apply';
import type { ResolvedTheme } from '../../theme/validate';

/** Circumference of the mini ring, `2πr` with r = 15.5. */
const RING = 2 * Math.PI * 15.5;

export function ThemeCard({
  theme,
  selected,
  onSelect,
  onDelete,
  selectedLabel = 'Active',
  action,
  footer,
}: {
  theme: ResolvedTheme;
  selected: boolean;
  /** Omitted by the gallery, which installs a theme rather than applying it. */
  onSelect?: () => void;
  onDelete?: () => void;
  selectedLabel?: string;
  /** Rendered in the meta row, before the badge. */
  action?: ReactNode;
  /** Rendered under the meta row — the gallery's description. */
  footer?: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const applied = useRef<string | null>(null);

  /*
    Apply once per theme, **after** the node exists. `applyTheme` writes custom properties
    onto this node only, so the rest of the app is untouched — and the card shows the theme
    it is advertising rather than the one currently selected.

    This used to run in the render body. `ref.current` is `null` on the first render, so
    the write was skipped at mount and only happened on some later, unrelated re-render:
    a grid of nine cards would show nine copies of the *current* theme until something else
    made them re-render. An effect is the only place a ref is guaranteed to be populated.
  */
  useEffect(() => {
    const node = ref.current;
    if (!node || applied.current === theme.id) return;
    applyTheme(theme, node);
    applied.current = theme.id;
  }, [theme]);

  const swatches = [
    theme.tokens.color.bg,
    theme.tokens.color.surface,
    theme.tokens.color.accent,
    theme.tokens.color.text,
  ];
  const motif = theme.motif && theme.motif !== 'none' ? theme.motif : null;

  const preview = (
    <div className="theme-card__preview" ref={ref}>
      {motif ? (
        <AmbienceLayer theme={theme} mode="fill" reduceMotion className="theme-card__motif" />
      ) : null}
      <div className="theme-card__ring-wrap" aria-hidden="true">
        <svg className="theme-card__ring" viewBox="0 0 36 36">
          <circle cx="18" cy="18" r="15.5" fill="none" strokeWidth="2.5" className="theme-card__ring-track" />
          <circle
            cx="18"
            cy="18"
            r="15.5"
            fill="none"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeDasharray={RING}
            strokeDashoffset={RING * 0.42}
            transform="rotate(-90 18 18)"
            className="theme-card__ring-value"
          />
        </svg>
        <span className="theme-card__sample">25:00</span>
      </div>

      <div className="theme-card__strip" aria-hidden="true">
        {swatches.map((c, i) => (
          <span key={i} className="theme-card__swatch" style={{ background: c }} />
        ))}
      </div>
    </div>
  );

  return (
    <div className="theme-card" data-selected={selected}>
      {onSelect ? (
        <button
          type="button"
          className="theme-card__apply"
          aria-pressed={selected}
          aria-label={`Apply ${theme.name}`}
          onClick={onSelect}
        >
          {preview}
        </button>
      ) : (
        preview
      )}

      <div className="theme-card__meta">
        <span className="theme-card__id">
          <span className="theme-card__name">{theme.name}</span>
          <span className="theme-card__author">{motif ?? `by ${theme.author}`}</span>
        </span>

        <span className="theme-card__actions">
          {action}
          {selected && !action ? <span className="badge badge--accent">{selectedLabel}</span> : null}
          {onDelete ? (
            <button
              type="button"
              className="theme-card__delete"
              aria-label={`Delete ${theme.name}`}
              onClick={onDelete}
            >
              ✕
            </button>
          ) : null}
        </span>
      </div>

      {footer}
    </div>
  );
}
