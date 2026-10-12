/**
 * Validation and alias resolution.
 *
 * Two jobs, in this order:
 *
 * 1. **Structural** — `ThemeSchema.safeParse`. Rejects unknown keys, wrong types, out-of-range
 *    numbers. This is where a theme that tries to be clever dies.
 * 2. **Semantic** — resolve `{color.accent}`-style aliases into concrete values, with a depth
 *    cap and cycle detection, then re-check that every resolved value still matches the type
 *    its token name promises. A dimension that resolves to a colour is a broken theme, and
 *    it is caught here rather than at paint time.
 *
 * Everything returns a `Result` — never throws. A malformed theme is an expected input, not
 * an exception: it arrives from `localStorage`, from a URL, or from a downloaded file.
 */

import {
  ALIAS,
  DIMENSION,
  DIMENSION_UNITS,
  FONT_FAMILIES,
  HEX_COLOR,
  ThemeSchema,
  THEME_TOKEN_NAMES,
  type ShadowLayerValue,
  type Theme,
} from './schema';

/* ------------------------------------------------------------------ *
 * Result
 * ------------------------------------------------------------------ */

export type ThemeIssue = {
  /** Dotted path into the theme document, e.g. `tokens.color.accent`. */
  path: string;
  /** One sentence, written for a theme author who is not a programmer. */
  message: string;
};

export type Result<T> = { ok: true; value: T } | { ok: false; issues: ThemeIssue[] };

const ok = <T>(value: T): Result<T> => ({ ok: true, value });
const fail = (issues: ThemeIssue[]): Result<never> => ({ ok: false, issues });

/* ------------------------------------------------------------------ *
 * Resolved shape — no aliases survive past this point
 * ------------------------------------------------------------------ */

export type ResolvedTokens = {
  color: Record<(typeof THEME_TOKEN_NAMES.color)[number], string>;
  dimension: Record<(typeof THEME_TOKEN_NAMES.dimension)[number], string>;
  fontFamily: Record<(typeof THEME_TOKEN_NAMES.fontFamily)[number], (typeof FONT_FAMILIES)[number]>;
  shadow: Record<(typeof THEME_TOKEN_NAMES.shadow)[number], ShadowLayerValue[]>;
};

export type ResolvedTheme = Omit<Theme, 'tokens'> & { tokens: ResolvedTokens };

/* ------------------------------------------------------------------ *
 * Alias resolution
 * ------------------------------------------------------------------ */

const MAX_ALIAS_DEPTH = 8;

type TokenGroup = keyof typeof THEME_TOKEN_NAMES;

/** Raw (possibly aliased) value at a dotted path, or `undefined` if the path is unknown. */
function rawAt(theme: Theme, path: string): unknown {
  const [group, key] = path.split('.');
  const bucket = (theme.tokens as Record<string, Record<string, unknown>>)[group];
  return bucket?.[key];
}

/**
 * Walk an alias chain to a concrete value.
 *
 * The visited set is what stops `a → b → a`. The depth cap is belt-and-braces: a chain
 * longer than 8 is a mistake even if it terminates, and a cap means a pathological theme
 * cannot burn a long task.
 */
function resolveAlias(theme: Theme, path: string): Result<unknown> {
  const visited = new Set<string>();
  let current = path;
  let value: unknown;

  for (let depth = 0; depth <= MAX_ALIAS_DEPTH; depth += 1) {
    if (visited.has(current)) {
      return fail([
        {
          path: `tokens.${current}`,
          message: `Circular reference: ${[...visited, current].join(' → ')}. A token cannot refer to itself, directly or indirectly.`,
        },
      ]);
    }
    visited.add(current);

    value = rawAt(theme, current);

    if (value === undefined) {
      return fail([
        {
          path: `tokens.${current}`,
          message: `Refers to "${current}", which this theme does not define.`,
        },
      ]);
    }

    if (typeof value === 'string') {
      const match = ALIAS.exec(value);
      if (!match) return ok(value); // a concrete value — done
      current = match[1];
      continue;
    }

    return ok(value); // a shadow object — done
  }

  return fail([
    {
      path: `tokens.${path}`,
      message: `Reference chain is longer than ${MAX_ALIAS_DEPTH} steps. Flatten the aliases.`,
    },
  ]);
}

/* ------------------------------------------------------------------ *
 * Per-type re-checks, applied to resolved values
 * ------------------------------------------------------------------ */

function checkResolved(path: string, group: TokenGroup, value: unknown): ThemeIssue | null {
  switch (group) {
    case 'color':
      return typeof value === 'string' && HEX_COLOR.test(value)
        ? null
        : {
            path: `tokens.${path}`,
            message: `Must resolve to a hex colour. It currently resolves to ${describe(value)}.`,
          };

    case 'dimension':
      return typeof value === 'string' && DIMENSION.test(value)
        ? null
        : {
            path: `tokens.${path}`,
            message: `Must resolve to a number with an optional unit (${DIMENSION_UNITS.join(', ')}). It currently resolves to ${describe(value)}.`,
          };

    case 'fontFamily':
      return typeof value === 'string' && (FONT_FAMILIES as readonly string[]).includes(value)
        ? null
        : {
            path: `tokens.${path}`,
            message: `Must be one of: ${FONT_FAMILIES.join(', ')}. These are the fonts the app ships; a theme cannot load its own.`,
          };

    case 'shadow':
      return Array.isArray(value) || (typeof value === 'object' && value !== null)
        ? null
        : {
            path: `tokens.${path}`,
            message: `Must be a shadow object or a list of shadow objects. It currently resolves to ${describe(value)}.`,
          };
  }
}

/** A short, safe rendering of an unexpected value for an error message. */
function describe(value: unknown): string {
  if (value === null) return 'null';
  if (typeof value === 'string') return `"${value.slice(0, 40)}"`;
  if (Array.isArray(value)) return 'a list';
  return `a ${typeof value}`;
}

/* ------------------------------------------------------------------ *
 * Public API
 * ------------------------------------------------------------------ */

/**
 * Validate a raw value and resolve it into a theme the app can paint.
 *
 * Accepts `unknown` on purpose: this is the boundary. Anything from `localStorage`, a
 * fetched file, a URL parameter or a textarea arrives here untyped.
 */
export function parseTheme(raw: unknown): Result<ResolvedTheme> {
  const parsed = ThemeSchema.safeParse(raw);

  if (!parsed.success) {
    return fail(
      parsed.error.issues.map((issue) => ({
        path: issue.path.length ? issue.path.join('.') : '(root)',
        message: issue.message,
      })),
    );
  }

  const theme = parsed.data;
  const issues: ThemeIssue[] = [];

  const resolved = {
    color: {} as ResolvedTokens['color'],
    dimension: {} as ResolvedTokens['dimension'],
    fontFamily: {} as ResolvedTokens['fontFamily'],
    shadow: {} as ResolvedTokens['shadow'],
  };

  for (const [group, keys] of Object.entries(THEME_TOKEN_NAMES) as [
    TokenGroup,
    readonly string[],
  ][]) {
    for (const key of keys) {
      const path = `${group}.${key}`;
      const step = resolveAlias(theme, path);

      if (!step.ok) {
        issues.push(...step.issues);
        continue;
      }

      const problem = checkResolved(path, group, step.value);
      if (problem) {
        issues.push(problem);
        continue;
      }

      if (group === 'shadow') {
        const layers = Array.isArray(step.value) ? step.value : [step.value];
        resolved.shadow[key as (typeof THEME_TOKEN_NAMES.shadow)[number]] =
          layers as ShadowLayerValue[];
      } else {
        (resolved[group] as Record<string, unknown>)[key] = step.value;
      }
    }
  }

  if (issues.length > 0) return fail(issues);

  const { tokens: _tokens, ...rest } = theme;
  return ok({ ...rest, tokens: resolved });
}

/** Validate a theme from a JSON string. Used by the import box and the theme builder. */
export function parseThemeJson(text: string): Result<ResolvedTheme> {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch (error) {
    const detail = error instanceof Error ? error.message : 'unknown parse error';
    return fail([{ path: '(root)', message: `Not valid JSON — ${detail}` }]);
  }
  return parseTheme(raw);
}

/**
 * Does this value *look* like it is trying to be CSS?
 *
 * Not a security control — the schema already prevents that. This exists so the theme
 * builder can explain *why* a value was rejected instead of only that it was.
 */
export function looksLikeInjection(value: string): boolean {
  return /url\s*\(|@import|@font-face|expression\s*\(|javascript:|<\/?\w|\\[0-9a-f]{2}/i.test(value);
}
