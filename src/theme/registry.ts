/**
 * The theme registry.
 *
 * Built-in themes are parsed once at module load and cached. A built-in that fails
 * validation is a build-time defect, not a runtime condition — the test suite asserts every
 * one of them is valid, so this module can treat a failure as "impossible" and still not
 * crash the app if it ever happens.
 */

import daylight from './builtin/daylight.json';
import ember from './builtin/ember.json';
import frost from './builtin/frost.json';
import herbarium from './builtin/herbarium.json';
import midnight from './builtin/midnight.json';
import neonRain from './builtin/neon-rain.json';
import sakuraTree from './builtin/sakura-tree.json';
import terminalAmber from './builtin/terminal-amber.json';
import vanGogh from './builtin/van-gogh.json';
import { parseTheme, type ResolvedTheme } from './validate';

/**
 * The two safe neutrals first — they are the themes a new user sees and the fallback the
 * app can always paint. The seven character themes follow, each with its own motif; no two
 * of them are the same idea in a different hue.
 */
const SOURCES: readonly unknown[] = [
  midnight,
  daylight,
  vanGogh,
  terminalAmber,
  ember,
  neonRain,
  sakuraTree,
  herbarium,
  frost,
];

function parseAll(): ResolvedTheme[] {
  const out: ResolvedTheme[] = [];
  for (const source of SOURCES) {
    const result = parseTheme(source);
    if (result.ok) {
      out.push(result.value);
    } else if (import.meta.env.DEV) {
      // Loud in development, silent in production: shipping a broken built-in would be a
      // test failure, and a console error in front of a user helps nobody.
      console.error(
        `[tincture] built-in theme failed validation:\n${result.issues
          .map((i) => `  ${i.path}: ${i.message}`)
          .join('\n')}`,
      );
    }
  }
  return out;
}

const BUILT_IN: readonly ResolvedTheme[] = parseAll();

export const BUILT_IN_THEMES = BUILT_IN;

/** The theme the app falls back to when an id is unknown. Never absent. */
export const FALLBACK_THEME: ResolvedTheme =
  BUILT_IN.find((t) => t.id === 'midnight') ?? BUILT_IN[0]!;

/**
 * Look a theme up across built-ins and the user's own themes.
 *
 * Unknown ids return the fallback rather than `undefined`, so a theme that was deleted
 * (or a store written by an older version) leaves the app in a paintable state.
 */
export function findTheme(id: string, custom: readonly ResolvedTheme[] = []): ResolvedTheme {
  return (
    custom.find((t) => t.id === id) ??
    BUILT_IN.find((t) => t.id === id) ??
    FALLBACK_THEME
  );
}

/** Every theme the user can choose from, built-ins first. */
export function allThemes(custom: readonly ResolvedTheme[] = []): ResolvedTheme[] {
  return [...BUILT_IN, ...custom];
}

export function isBuiltIn(id: string): boolean {
  return BUILT_IN.some((t) => t.id === id);
}
