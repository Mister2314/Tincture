/**
 * Resolved tokens -> CSS custom properties.
 *
 * This module is the only place that turns theme data into something the browser paints,
 * and it is written so that no theme value is ever concatenated into a stylesheet.
 *
 * Two transports, both chosen for that reason:
 *
 * - **Tokens** go through `style.setProperty('--name', value)`. The value arrives already
 *   proven to be a hex colour, a bounded dimension, a bundled font name, or an array of
 *   numbers. There is no surrounding CSS for a stray character to break out of.
 * - **Shadows** are the one place a composite string is unavoidable, because CSS has no
 *   structured shadow. It is assembled from numbers that zod already range-checked and a
 *   hex colour that already passed a regex, then the *finished* string is re-checked
 *   against `SHADOW_VALUE` before it is set. Two independent gates on one string.
 *
 * No `<style>` element is ever built from theme data. No `dangerouslySetInnerHTML`.
 */

import type { ResolvedTheme } from './validate';
import type { FontFamily, ShadowLayerValue } from './schema';

/* ------------------------------------------------------------------ *
 * Naming
 * ------------------------------------------------------------------ */

/** `--t-color-accent`, `--t-dimension-radius-md`, … One prefix, so nothing collides. */
export const cssVarName = (group: string, key: string): string =>
  `--t-${group}-${key.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)}`;

/** A finished shadow value: `0px 1px 2px 0px #00000014, …`. Assembled, then re-checked. */
const SHADOW_VALUE = /^(?:-?\d+(?:\.\d+)?px ){4}#(?:[0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})(?:, )?$/;

const FONT_STACKS: Record<FontFamily, string> = {
  manrope: "'Manrope', ui-sans-serif, system-ui, sans-serif",
  'instrument-serif': "'Instrument Serif', ui-serif, Georgia, 'Times New Roman', serif",
  'jetbrains-mono': "'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, monospace",
  fraunces: "'Fraunces', ui-serif, Georgia, 'Times New Roman', serif",
  'bricolage-grotesque': "'Bricolage Grotesque', ui-sans-serif, system-ui, sans-serif",
  'space-grotesk': "'Space Grotesk', ui-sans-serif, system-ui, sans-serif",
};

/* ------------------------------------------------------------------ *
 * Serialisation
 * ------------------------------------------------------------------ */

/** Layers -> one CSS shadow value. Returns `none` if any layer is malformed. */
export function shadowToCss(layers: ShadowLayerValue[]): string {
  const parts = layers.map(
    (l: ShadowLayerValue) => `${l.x}px ${l.y}px ${l.blur}px ${l.spread}px ${l.color}`,
  );

  if (parts.length === 0) return 'none';

  const value = parts.join(', ');
  // Belt and braces: every component is already typed, but the composite is the one
  // string that reaches CSS, so it is checked as a whole too.
  if (!parts.every((p: string) => SHADOW_VALUE.test(p))) return 'none';

  return value;
}

/** Every custom property a resolved theme defines, as a plain map. */
export function tokensToCssVars(theme: ResolvedTheme): Record<string, string> {
  const vars: Record<string, string> = {};

  for (const [key, value] of Object.entries(theme.tokens.color) as [string, string][]) {
    vars[cssVarName('color', key)] = value;
  }
  for (const [key, value] of Object.entries(theme.tokens.dimension) as [string, string][]) {
    vars[cssVarName('dimension', key)] = value;
  }
  for (const [key, value] of Object.entries(theme.tokens.fontFamily) as [string, FontFamily][]) {
    vars[cssVarName('fontFamily', key)] = FONT_STACKS[value] ?? FONT_STACKS.manrope;
  }
  for (const [key, layers] of Object.entries(theme.tokens.shadow) as [string, ShadowLayerValue[]][]) {
    vars[cssVarName('shadow', key)] = shadowToCss(layers);
  }

  // Effects are plain numbers; they become opacity/blur/scale multipliers in the sheet.
  const effects = theme.effects ?? {};
  vars['--t-effect-grain'] = String(effects.grain ?? 0);
  vars['--t-effect-glow'] = String(effects.glow ?? 0);
  vars['--t-effect-motion'] = String(effects.motion ?? 1);
  vars['--t-effect-blur'] = `${effects.blur ?? 0}px`;

  // Motif parameters. These are read by the canvas renderer, not by the stylesheet — they
  // are numbers the ambience layer uses for geometry. Published as custom properties anyway
  // so the two CSS-only motifs (`terminal-grid`, `specimen`) can size themselves without
  // JavaScript reading them back out of the DOM.
  vars['--t-effect-ambience'] = String(effects.ambience ?? 0);
  vars['--t-effect-density'] = String(effects.density ?? 0.5);
  vars['--t-effect-scale'] = String(effects.scale ?? 1);
  vars['--t-effect-seed'] = String(effects.seed ?? 1);

  // Lets the browser theme scrollbars, form controls and the caret to match.
  vars['color-scheme'] = theme.appearance;

  return vars;
}

/* ------------------------------------------------------------------ *
 * Application
 * ------------------------------------------------------------------ */

/**
 * Write a theme onto an element's inline style.
 *
 * `target` defaults to `<html>`, but the theme builder passes its own preview node, which
 * is how the builder shows a live preview without touching the running app.
 *
 * Removing keys that the new theme does not define is deliberate: switching from a theme
 * with grain to one without must actually clear the grain, not leave it behind.
 */
export function applyTheme(theme: ResolvedTheme, target?: HTMLElement): void {
  const element = target ?? (typeof document === 'undefined' ? null : document.documentElement);
  if (!element) return;

  const vars = tokensToCssVars(theme);
  const previous = (element as HTMLElement & { __tinctureVars?: string[] }).__tinctureVars ?? [];

  for (const name of previous) {
    if (!(name in vars)) element.style.removeProperty(name);
  }

  for (const [name, value] of Object.entries(vars)) {
    element.style.setProperty(name, value);
  }

  (element as HTMLElement & { __tinctureVars?: string[] }).__tinctureVars = Object.keys(vars);

  // Lets CSS react to the theme without a class-name dance, and lets the page set
  // `color-scheme` for native controls.
  element.dataset.themeId = theme.id;
  element.dataset.themeAppearance = theme.appearance;
  // The motif is published here too, not only consumed by `Ambience`: it lets the CSS-only
  // motifs (and any future stylesheet rule) key off the theme without a class-name dance.
  element.dataset.themeMotif = theme.motif ?? 'none';
}

/** Detach a theme from an element — used when the builder preview unmounts. */
export function clearTheme(target: HTMLElement): void {
  const holder = target as HTMLElement & { __tinctureVars?: string[] };
  for (const name of holder.__tinctureVars ?? []) target.style.removeProperty(name);
  holder.__tinctureVars = undefined;
  delete target.dataset.themeId;
  delete target.dataset.themeAppearance;
  delete target.dataset.themeMotif;
}

/* ------------------------------------------------------------------ *
 * Export
 * ------------------------------------------------------------------ */

/**
 * Render a theme as a standalone `.css` file.
 *
 * Offered because people ask for it, and safe because it is generated **from resolved
 * tokens** — the same values that already passed validation — rather than from anything a
 * theme author wrote. Nothing here is interpolated raw.
 */
export function themeToCss(theme: ResolvedTheme): string {
  const vars = tokensToCssVars(theme);
  const body = Object.entries(vars)
    .map(([name, value]) => `  ${name}: ${value};`)
    .join('\n');

  return [
    `/* ${theme.name} — by ${theme.author} · ${theme.license} · v${theme.version} */`,
    `/* Generated by Tincture from validated tokens. Safe to edit by hand. */`,
    `:root {`,
    body,
    `}`,
    ``,
  ].join('\n');
}
