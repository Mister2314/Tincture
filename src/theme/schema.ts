/**
 * The theme schema — the single source of truth for what a theme may contain.
 *
 * Security rationale
 * ------------------
 * A theme is *data*. It has no way to express CSS, a selector, `url()`, `@import`,
 * `@font-face` or JavaScript, because the schema has no field that could hold one.
 *
 * Three properties do the work, and all three are deliberate:
 *
 * 1. **Fixed token names.** `THEME_TOKEN_NAMES` is a closed list. `.strict()` rejects any
 *    unknown key, so a theme cannot smuggle in a new token that later reaches the DOM.
 * 2. **Typed values.** Colours are hex only — no `rgb()`, no `hsl()`, no `var()`, no
 *    `url()`. A hex string cannot contain a parenthesis, so the entire function-injection
 *    class is unreachable. Dimensions are a number plus a unit from a fixed set. Shadows
 *    are structured objects of numbers, never a CSS string.
 * 3. **Bounded numbers.** Every numeric field has a range, so nothing can be `1e9` and
 *    break layout.
 *
 * If you are tempted to loosen any of this, read `docs/SECURITY.md` first. The looseness
 * is not the feature — the closure is.
 */

import { z } from 'zod';

/* ------------------------------------------------------------------ *
 * Colours — hex only, by design
 * ------------------------------------------------------------------ */

/**
 * `#rgb`, `#rrggbb` or `#rrggbbaa`.
 *
 * Hex-only is a security decision, not a limitation. `rgb()`/`hsl()` would mean accepting
 * a function call, and accepting a function call is the first step toward accepting
 * `url()`. Alpha is available through the 8-digit form, so nothing is lost in practice.
 */
export const HEX_COLOR = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/;

/* ------------------------------------------------------------------ *
 * Dimensions — number + unit from a fixed set
 * ------------------------------------------------------------------ */

export const DIMENSION_UNITS = ['px', 'rem', 'em', '%'] as const;

/**
 * A dimension is either a bare number (interpreted as px) or `<number><unit>`.
 *
 * The unit list is closed. `url`, `calc`, `var` and friends are not numbers followed by a
 * whitelisted unit, so they cannot pass.
 */
export const DIMENSION = /^-?\d+(?:\.\d+)?(?:px|rem|em|%)?$/;

/** Upper bound on any single dimension. Generous — `9999px` is the standard pill radius. */
const MAX_DIMENSION = 10000;

/* ------------------------------------------------------------------ *
 * Font families — a bundled whitelist
 * ------------------------------------------------------------------ */

/**
 * Only fonts shipped with the app. A theme picks a *name*; it can never point at a remote
 * font, which is what would otherwise turn `fontFamily` into an exfiltration channel
 * (`@font-face { src: url(https://attacker/?…) }`).
 *
 * Every entry is an OFL-licensed font bundled under `src/assets/fonts/` and declared in
 * `styles/fonts.css`. The list is short on purpose: each family is a real download, so a
 * name is added only when a theme needs the *character* of that typeface and not merely a
 * different colour.
 */
export const FONT_FAMILIES = [
  /** Neutral geometric sans — the app's default body face. */
  'manrope',
  /** High-contrast serif — the app's default display face. */
  'instrument-serif',
  /** Monospace with tabular figures — every number that ticks. */
  'jetbrains-mono',
  /** Literary, soft-serifed, slightly wonky: Van Gogh, Herbarium, Sakura Tree. */
  'fraunces',
  /** Eclectic display grotesque: Neon Rain. */
  'bricolage-grotesque',
  /** Technical, wide, slightly mechanical: Terminal Amber, Frost. */
  'space-grotesk',
] as const;

/* ------------------------------------------------------------------ *
 * Motifs — the app-rendered background layers
 * ------------------------------------------------------------------ */

/**
 * A theme may ask for a background motif. This is a closed list, and the closure is the
 * whole point.
 *
 * Artwork cannot live *inside* a theme: a theme is a token document with no `url()`, no
 * assets and no code, which is what makes opening a stranger's theme safe. So a motif is a
 * **name** — a value from this list and nothing else. The app owns the renderer and the
 * bytes for each name; the theme only chooses which one runs.
 *
 * Adding a motif means adding a renderer in `app/ambience/`. A name with no renderer falls
 * back to `none` rather than breaking, so an older build meeting a newer theme still paints.
 */
export const MOTIFS = [
  'none',
  /** Curl-noise advection over the real *Starry Night*. Van Gogh. */
  'starry-flow',
  /** Drafting grid and tick marks. Terminal Amber. */
  'terminal-grid',
  /** A hearth whose glow follows the timer phase. Ember. */
  'hearth',
  /** Rain streaks mirrored at a horizon. Neon Rain. */
  'neon-rain',
  /** A seeded L-system tree with falling petals. Sakura Tree. */
  'sakura-tree',
  /** Ruled specimen-plate lines and a pressed silhouette. Herbarium. */
  'specimen',
  /** Crystal growth anchored at the edges. Frost. */
  'frost-growth',
] as const;

export type Motif = (typeof MOTIFS)[number];

/* ------------------------------------------------------------------ *
 * Aliases
 * ------------------------------------------------------------------ */

/**
 * `{color.accent}` — a reference to another token in the same theme.
 *
 * Aliases make semantic themes possible (surface points at a base colour, not a hex).
 * They are resolved with a depth cap and cycle detection in `validate.ts`; a theme cannot
 * use them to hang the app or to smuggle a value past the type checks.
 */
export const ALIAS = /^\{([a-z][a-zA-Z0-9]*(?:\.[a-z][a-zA-Z0-9]*)+)\}$/;

/**
 * A string that is either an alias or a concrete value of the given kind.
 *
 * Written with `superRefine` rather than a `union` on purpose: a union collapses every
 * failure into `Invalid input`, and the people writing themes include people who do not
 * write code. The message has to say what was wrong.
 */
function valueOrAlias(
  check: (value: string, ctx: z.RefinementCtx) => void,
  aliasHint: string,
  typeMessage?: string,
) {
  return z
    .string({
      error:
        typeMessage ??
        `Must be text. Use ${aliasHint}, or write a literal value — this field cannot be a number or an object.`,
    })
    .superRefine((value, ctx) => {
      if (ALIAS.test(value)) return;
      if (value.includes('{') || value.includes('}')) {
        ctx.addIssue({
          code: 'custom',
          message: `Malformed reference. Use ${aliasHint}, or write a literal value.`,
        });
        return;
      }
      check(value, ctx);
    });
}

const ColorSchema = valueOrAlias((value, ctx) => {
  if (!HEX_COLOR.test(value)) {
    ctx.addIssue({
      code: 'custom',
      message: `"${value.slice(0, 32)}" is not a hex colour. Use #rgb, #rrggbb or #rrggbbaa (the last two digits are opacity).`,
    });
  }
}, 'a reference like {color.accent}');

const DimensionSchema = valueOrAlias((value, ctx) => {
  if (!DIMENSION.test(value)) {
    ctx.addIssue({
      code: 'custom',
      message: `"${value.slice(0, 32)}" is not a size. Use a number with an optional unit: ${DIMENSION_UNITS.join(', ')}. For example 12px or 1.5rem.`,
    });
    return;
  }
  const n = Number.parseFloat(value);
  if (!Number.isFinite(n) || Math.abs(n) > MAX_DIMENSION) {
    ctx.addIssue({
      code: 'custom',
      message: `Size must be between -${MAX_DIMENSION} and ${MAX_DIMENSION}.`,
    });
  }
}, 'a reference like {dimension.radiusMd}');

const FontFamilySchema = valueOrAlias((value, ctx) => {
  if (!(FONT_FAMILIES as readonly string[]).includes(value)) {
    ctx.addIssue({
      code: 'custom',
      message: `"${value}" is not a bundled font. Choose one of: ${FONT_FAMILIES.join(', ')}. A theme cannot load its own font — that would be a way to fetch a remote file.`,
    });
  }
}, 'a reference like {fontFamily.body}');

/* ------------------------------------------------------------------ *
 * Shadows — structured, never a CSS string
 * ------------------------------------------------------------------ */

/**
 * A bounded number with a message that names the field.
 *
 * Written as a helper because the default is unacceptable: zod's own text for a missing or
 * mistyped key is `Invalid input: expected number, received undefined`, and the README
 * promises the opposite — *"if something is wrong the message names the token and the
 * reason — not `Invalid input`."* A theme author who is not a programmer has to be able to
 * read the error and know which field to fix.
 */
const bounded = (what: string, min: number, max: number) =>
  z
    .number({ error: `${what} must be a number.` })
    .min(min, { error: `${what} must be between ${min} and ${max}.` })
    .max(max, { error: `${what} must be between ${min} and ${max}.` });

/** The same, for the optional `effects` knobs. */
const optionalBounded = (what: string, min: number, max: number) => bounded(what, min, max).optional();

const ShadowLayer = z
  .object({
    x: bounded('A shadow’s x offset', -100, 100),
    y: bounded('A shadow’s y offset', -100, 100),
    blur: bounded('A shadow’s blur', 0, 200),
    spread: bounded('A shadow’s spread', -100, 100),
    color: ColorSchema,
  })
  .strict();

const ShadowSchema = z.union([ShadowLayer, z.array(ShadowLayer).min(1).max(4)]);

/* ------------------------------------------------------------------ *
 * Token names — the closed list
 * ------------------------------------------------------------------ */

export const THEME_TOKEN_NAMES = {
  color: [
    'bg',
    'bgElevated',
    'surface',
    'surfaceHover',
    'surfaceActive',
    'text',
    'textMuted',
    'textSubtle',
    'accent',
    'accentHover',
    'accentText',
    'border',
    'borderStrong',
    'focusRing',
    'success',
    'danger',
  ],
  dimension: ['radiusSm', 'radiusMd', 'radiusLg', 'radiusFull', 'spaceXs', 'spaceSm', 'spaceMd', 'spaceLg', 'spaceXl'],
  fontFamily: ['display', 'body', 'mono'],
  shadow: ['card', 'elevated'],
} as const;

/** `{shadow.card}` for shadows, since a shadow is an object rather than a string. */
const ShadowValueSchema = valueOrAlias(
  (value, ctx) => {
    ctx.addIssue({
      code: 'custom',
      message: `"${value.slice(0, 32)}" is not a shadow. A shadow is an object like { "x": 0, "y": 1, "blur": 2, "spread": 0, "color": "#00000066" }, or a list of them.`,
    });
  },
  'a reference like {shadow.card}',
  'A shadow must be an object like { "x": 0, "y": 1, "blur": 2, "spread": 0, "color": "#00000066" }, a list of such objects, or a reference like {shadow.card}.',
);

/**
 * An object-level message that fires only when the whole object is missing or the wrong
 * shape — never when one of its keys is unknown.
 *
 * A plain string here would also replace zod's `Unrecognized key: "…"`, which is the more
 * precise message and the one a theme author actually needs when they invent a token.
 */
const objectError =
  (message: string) =>
  (issue: { code?: string }): string | undefined =>
    issue.code === 'invalid_type' ? message : undefined;

const ColorTokens = z
  .object(
    Object.fromEntries(THEME_TOKEN_NAMES.color.map((k) => [k, ColorSchema])) as unknown as Record<
      (typeof THEME_TOKEN_NAMES.color)[number],
      z.ZodTypeAny
    >,
    {
      error: objectError(
        `"tokens.color" must be an object with all ${THEME_TOKEN_NAMES.color.length} colour tokens: ${THEME_TOKEN_NAMES.color.join(', ')}.`,
      ),
    },
  )
  .strict();

const DimensionTokens = z
  .object(
    Object.fromEntries(THEME_TOKEN_NAMES.dimension.map((k) => [k, DimensionSchema])) as unknown as Record<
      (typeof THEME_TOKEN_NAMES.dimension)[number],
      z.ZodTypeAny
    >,
    {
      error: objectError(
        `"tokens.dimension" must be an object with all ${THEME_TOKEN_NAMES.dimension.length} size tokens: ${THEME_TOKEN_NAMES.dimension.join(', ')}.`,
      ),
    },
  )
  .strict();

const FontFamilyTokens = z
  .object(
    Object.fromEntries(THEME_TOKEN_NAMES.fontFamily.map((k) => [k, FontFamilySchema])) as unknown as Record<
      (typeof THEME_TOKEN_NAMES.fontFamily)[number],
      z.ZodTypeAny
    >,
    {
      error: objectError(
        `"tokens.fontFamily" must be an object with display, body and mono — each one a font the app ships: ${FONT_FAMILIES.join(', ')}.`,
      ),
    },
  )
  .strict();

const ShadowTokens = z
  .object(
    Object.fromEntries(
      THEME_TOKEN_NAMES.shadow.map((k) => [k, z.union([ShadowValueSchema, ShadowSchema])]),
    ) as unknown as Record<(typeof THEME_TOKEN_NAMES.shadow)[number], z.ZodTypeAny>,
    {
      error: objectError(
        `"tokens.shadow" must be an object with both ${THEME_TOKEN_NAMES.shadow.join(' and ')} — each a shadow object, a list of them, or a reference.`,
      ),
    },
  )
  .strict();

/* ------------------------------------------------------------------ *
 * The theme document
 * ------------------------------------------------------------------ */

/** Non-visual knobs. All bounded, all optional — a theme may ignore every one. */
const EffectsSchema = z
  .object({
    /** Film-grain overlay strength, 0–1. Rendered as a CSS noise layer, no image. */
    grain: optionalBounded('grain', 0, 1),
    /** Accent bloom behind the timer, 0–1. */
    glow: optionalBounded('glow', 0, 1),
    /** Multiplies every transition duration. 0 disables motion entirely. */
    motion: optionalBounded('motion', 0, 2),
    /** Backdrop blur on elevated surfaces, in px. */
    blur: optionalBounded('blur', 0, 40),

    /* Motif parameters. These shape the background layer named by `motif`; they do nothing
       on their own, so a theme can leave all of them out and still be complete. */
    /** How strongly the motif draws, 0–1. Zero switches it off without changing `motif`. */
    ambience: optionalBounded('ambience', 0, 1),
    /** Element count, 0–1. Each motif maps this onto its own sensible range. */
    density: optionalBounded('density', 0, 1),
    /** Motif scale, 0.2–3. Geometry, not decoration: a sapling versus a full tree. */
    scale: optionalBounded('scale', 0.2, 3),
    /** Seeds every deterministic motif. The same seed draws the same tree on every load —
     *  a background that rearranges itself each visit reads as a bug, not as character. */
    seed: z
      .number({ error: 'seed must be a whole number.' })
      .int({ error: 'seed must be a whole number, not a fraction.' })
      .min(0, { error: 'seed must be between 0 and 999999.' })
      .max(999_999, { error: 'seed must be between 0 and 999999.' })
      .optional(),
  })
  .strict();

const MetadataSchema = z
  .object({
    id: z
      .string({ error: 'A theme needs an "id" — a short lowercase name, like "my-theme".' })
      .min(2, { error: 'The id must be at least 2 characters.' })
      .max(48, { error: 'The id must be at most 48 characters.' })
      .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, {
        error: 'The id must be lowercase kebab-case: letters a-z, numbers 0-9 and dashes.',
      }),
    name: z
      .string({ error: 'A theme needs a "name" — the label people will see.' })
      .min(1, { error: 'The name cannot be empty.' })
      .max(48, { error: 'The name must be at most 48 characters.' }),
    author: z
      .string({ error: 'A theme needs an "author" — your name or handle.' })
      .min(1, { error: 'The author cannot be empty.' })
      .max(64, { error: 'The author must be at most 64 characters.' }),
    /** ISO date, `YYYY-MM-DD`. Used for the gallery's "newest" sort. */
    date: z
      .string({ error: 'A theme needs a "date", written as YYYY-MM-DD.' })
      .regex(/^\d{4}-\d{2}-\d{2}$/, { error: 'The date must be YYYY-MM-DD, for example 2026-10-13.' }),
    version: z
      .string({ error: 'A theme needs a "version", written as 1.0.0.' })
      .regex(/^\d+\.\d+\.\d+$/, { error: 'The version must be semver — three numbers, like 1.0.0.' }),
    license: z
      .string({ error: 'A theme needs a "license" — for example MIT.' })
      .min(1, { error: 'The license cannot be empty.' })
      .max(32, { error: 'The license must be at most 32 characters.' }),
    /** Drives `color-scheme`, scrollbars and the appearance the gallery groups by. */
    appearance: z.enum(['light', 'dark'], {
      error: 'The appearance must be exactly "light" or "dark".',
    }),
    description: z
      .string({ error: 'The description must be text.' })
      .max(160, { error: 'Keep the description under 160 characters.' })
      .optional(),
  })
  .strict();

export const ThemeSchema = z
  .object({
    $schema: z.string({ error: '$schema must be a URL string.' }).optional(),
    ...MetadataSchema.shape,
    /** Which app-rendered background motif this theme asks for. A name, never a source. */
    motif: z
      .enum(MOTIFS, {
        error: `The motif must be one of: ${MOTIFS.join(', ')}. A theme names a motif; it cannot carry an image.`,
      })
      .optional(),
    tokens: z
      .object(
        {
          color: ColorTokens,
          dimension: DimensionTokens,
          fontFamily: FontFamilyTokens,
          shadow: ShadowTokens,
        },
        {
          error: objectError(
            'A theme needs a "tokens" object containing color, dimension, fontFamily and shadow. A theme is complete, not partial.',
          ),
        },
      )
      .strict(),
    effects: EffectsSchema.optional(),
  })
  .strict();

export type Theme = z.infer<typeof ThemeSchema>;
export type ThemeTokens = Theme['tokens'];
export type ColorTokenName = (typeof THEME_TOKEN_NAMES.color)[number];
export type DimensionTokenName = (typeof THEME_TOKEN_NAMES.dimension)[number];
export type FontFamilyTokenName = (typeof THEME_TOKEN_NAMES.fontFamily)[number];
export type ShadowTokenName = (typeof THEME_TOKEN_NAMES.shadow)[number];
export type FontFamily = (typeof FONT_FAMILIES)[number];
export type ShadowLayerValue = z.infer<typeof ShadowLayer>;

/** Every token path a theme may define, e.g. `color.accent`. Used by the builder UI. */
export const ALL_TOKEN_PATHS = [
  ...THEME_TOKEN_NAMES.color.map((k) => `color.${k}`),
  ...THEME_TOKEN_NAMES.dimension.map((k) => `dimension.${k}`),
  ...THEME_TOKEN_NAMES.fontFamily.map((k) => `fontFamily.${k}`),
  ...THEME_TOKEN_NAMES.shadow.map((k) => `shadow.${k}`),
] as const;

