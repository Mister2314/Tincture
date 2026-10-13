/**
 * The ambience contract.
 *
 * A motif renderer is a factory that receives a canvas context and the resolved theme's
 * motif parameters, and returns an object with three verbs: paint a frame, resize, and
 * clean up. Everything a renderer is allowed to know about the theme arrives through
 * `AmbienceEnv` — it never reaches into the store, never reads CSS, and never touches the
 * DOM outside its own context.
 *
 * The parameters are *numbers* because a canvas needs numbers. The two CSS-only motifs
 * (`terminal-grid`, `specimen`) read the same values back out of the `--t-effect-*`
 * custom properties instead, which is why those are published by the theme engine.
 */

import type { Motif } from '../../theme/schema';
import type { Phase } from '../timer/engine';
import type { ResolvedTheme } from '../../theme/validate';

/**
 * The theme's own colour tokens, passed straight through.
 *
 * A renderer picks the tokens it needs (`accent`, `success`, `borderStrong`) rather than
 * inventing a palette — so a community theme that changes one token changes the motif with
 * it, and no renderer can introduce a colour the theme did not choose.
 */
export type Palette = ResolvedTheme['tokens']['color'];

export const paletteOf = (theme: ResolvedTheme): Palette => theme.tokens.color;

/**
 * `#rgb` / `#rrggbb` / `#rrggbbaa` -> `rgba(...)`, so a theme colour can be drawn at an
 * alpha. Any embedded alpha is multiplied rather than discarded.
 */
export function withAlpha(color: string, alpha: number): string {
  const hex = color.trim();
  const a = Math.min(1, Math.max(0, alpha));
  if (!hex.startsWith('#')) return color;

  let r: number;
  let g: number;
  let b: number;
  let embedded = 1;

  if (hex.length === 4) {
    r = parseInt(hex[1] + hex[1], 16);
    g = parseInt(hex[2] + hex[2], 16);
    b = parseInt(hex[3] + hex[3], 16);
  } else if (hex.length === 7 || hex.length === 9) {
    r = parseInt(hex.slice(1, 3), 16);
    g = parseInt(hex.slice(3, 5), 16);
    b = parseInt(hex.slice(5, 7), 16);
    if (hex.length === 9) embedded = parseInt(hex.slice(7, 9), 16) / 255;
  } else {
    return color;
  }

  if (!Number.isFinite(r) || !Number.isFinite(g) || !Number.isFinite(b)) return color;
  return `rgba(${r}, ${g}, ${b}, ${(a * embedded).toFixed(3)})`;
}

/** Everything a renderer needs to know about its canvas. Set on mount and on every resize. */
export type AmbienceEnv = {
  /** CSS pixels — the context is already scaled by `dpr`. */
  width: number;
  height: number;
  dpr: number;
  palette: Palette;
  /** 0–1. How strongly the motif draws. Zero switches it off without changing `motif`. */
  ambience: number;
  /** 0–1. Element count; each motif maps this onto its own sensible range. */
  density: number;
  /** 0.2–3. Geometry — a sapling versus a full tree. */
  scale: number;
  /** Seeds every deterministic motif. The same seed must draw the same thing. */
  seed: number;
  /** The lazy-loaded painting. Present only for `starry-flow`; null everywhere else. */
  image: HTMLImageElement | null;
};

/**
 * Per-frame state.
 *
 * `animate` is already the AND of every gate — reduced motion, `motion: 0`, a hidden tab,
 * and (for phase-driven motifs) an idle timer. A renderer that respects `animate` gets the
 * whole policy for free, and reduced motion still paints one static frame rather than
 * nothing.
 */
export type AmbienceFrame = {
  /** ms since the renderer was created. */
  now: number;
  /** ms since the previous frame, clamped — a background tab must not jump the animation. */
  dt: number;
  animate: boolean;
  phase: Phase;
  /** True while the timer is running. The signal a phase-driven motif reads. */
  running: boolean;
  /** 0–1 through the current phase. */
  progress: number;
};

export type MotifRenderer = {
  frame: (frame: AmbienceFrame) => void;
  resize: (env: AmbienceEnv) => void;
  dispose: () => void;
};

export type MotifFactory = (ctx: CanvasRenderingContext2D, env: AmbienceEnv) => MotifRenderer;

/** How a motif is painted. `canvas` needs the renderer; `css` is drawn by the stylesheet. */
export type MotifKind = 'none' | 'canvas' | 'css';

export const MOTIF_KIND: Record<Motif, MotifKind> = {
  none: 'none',
  'terminal-grid': 'css',
  specimen: 'css',
  'starry-flow': 'canvas',
  hearth: 'canvas',
  'neon-rain': 'canvas',
  'sakura-tree': 'canvas',
  'frost-growth': 'canvas',
};

/** An unknown motif name is `none`, never a throw — an older build meeting a newer theme. */
export const kindOf = (motif: Motif | undefined): MotifKind =>
  motif ? (MOTIF_KIND[motif] ?? 'none') : 'none';
