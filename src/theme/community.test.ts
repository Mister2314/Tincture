// @vitest-environment node
/**
 * The community gate.
 *
 * Every file in `themes/` is validated here. This is the check that runs on a pull request,
 * and it is the *only* reason a merged theme can be trusted — the app re-validates anyway,
 * but nothing reaches `main` without passing this first.
 *
 * It deliberately reuses the app's own schema rather than restating the rules. A second,
 * drifting copy of the validation is how a gate becomes decorative.
 */

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import { looksLikeInjection, parseTheme } from './validate';
import { THEME_TOKEN_NAMES } from './schema';

const THEMES_DIR = resolve(process.cwd(), 'themes');

function themeFiles(): string[] {
  try {
    if (!statSync(THEMES_DIR).isDirectory()) return [];
  } catch {
    return [];
  }
  return readdirSync(THEMES_DIR)
    .filter((name) => name.endsWith('.json'))
    .sort();
}

const files = themeFiles();

describe('the community themes directory', () => {
  it('exists and contains at least one theme', () => {
    expect(files.length).toBeGreaterThan(0);
  });

  it.each(files)('%s is valid', (file) => {
    const text = readFileSync(join(THEMES_DIR, file), 'utf8');

    let raw: unknown;
    expect(() => {
      raw = JSON.parse(text);
    }, `${file} is not valid JSON`).not.toThrow();

    const result = parseTheme(raw);
    if (!result.ok) {
      throw new Error(
        `${file} failed validation:\n${result.issues.map((i) => `  ${i.path}: ${i.message}`).join('\n')}`,
      );
    }

    // The filename must match the id, so the gallery listing and the theme agree.
    expect(result.value.id).toBe(file.replace(/\.json$/, ''));
  });

  it.each(files)('%s contains no CSS-injection shape anywhere', (file) => {
    const text = readFileSync(join(THEMES_DIR, file), 'utf8');
    const raw = JSON.parse(text) as Record<string, unknown>;

    // Walk every string in the document and refuse anything that even resembles CSS.
    // The schema already makes these unreachable; this catches the case where someone
    // widens the schema later without revisiting the gate.
    const offenders: string[] = [];
    const walk = (value: unknown, path: string) => {
      if (typeof value === 'string') {
        if (looksLikeInjection(value)) offenders.push(`${path}: ${value.slice(0, 60)}`);
        return;
      }
      if (Array.isArray(value)) {
        value.forEach((v, i) => walk(v, `${path}[${i}]`));
        return;
      }
      if (typeof value === 'object' && value !== null) {
        for (const [k, v] of Object.entries(value)) walk(v, path ? `${path}.${k}` : k);
      }
    };
    walk(raw, '');

    expect(offenders, `${file} contains injection-shaped values:\n${offenders.join('\n')}`).toEqual([]);
  });

  it.each(files)('%s defines every token — a partial theme is not accepted', (file) => {
    const result = parseTheme(JSON.parse(readFileSync(join(THEMES_DIR, file), 'utf8')));
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    for (const [group, keys] of Object.entries(THEME_TOKEN_NAMES)) {
      const bucket = (result.value.tokens as unknown as Record<string, Record<string, unknown>>)[group];
      expect(Object.keys(bucket ?? {}).sort()).toEqual([...keys].sort());
    }
  });

  it('has no duplicate ids across files', () => {
    const ids = files
      .map((f) => parseTheme(JSON.parse(readFileSync(join(THEMES_DIR, f), 'utf8'))))
      .filter((r) => r.ok)
      .map((r) => (r as { value: { id: string } }).value.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
