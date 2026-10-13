# Tincture — project context

Read this before touching anything. It outranks every skill and every note.

## What this is

A Pomodoro focus timer with a **community theme system**. Themes are the product, not a
decoration — the timer is the excuse for them.

## Stack (pinned)

| | |
|---|---|
| React | 19.2 |
| Vite | 8.3 |
| TypeScript | 6.0 (strict) |
| Validation | zod (theme schema only) |
| State | React context + `useReducer` + `localStorage`. **No state library** |
| Routing | none — single page with views. **No router** |
| Hosting | Vercel, static |

Adding a dependency requires a reason that survives the question "what breaks without it".
Every dependency is a failure surface, and this app is required to run with zero errors.

## The one architectural rule

> **Themes are data, never code.**

A theme is a JSON document of **typed tokens**. It cannot contain CSS, selectors, `url()`,
`@import`, `@font-face`, or JavaScript. The app converts tokens into CSS custom properties
itself, from a fixed list of token names, after validating every value against a strict
allowlist.

This is not a policy — it is the construction. There is no code path that accepts a CSS
string from a theme. If you ever find yourself writing `style={theme.something}` or
building a CSS string from theme data, **stop**: that is the bug the whole design exists to
prevent.

## Security model (see `docs/SECURITY.md`)

Four independent layers, so no single mistake is fatal:

1. **Schema** — zod, `.strict()`, fixed token names, no extra keys.
2. **Value allowlist** — per-type regex/whitelist. Colours are hex/rgb/hsl with numeric
   args only; dimensions are number + unit from a fixed set; font families come from a
   bundled whitelist.
3. **Alias resolution** — depth cap and cycle detection, so `{a}` → `{b}` → `{a}` cannot
   hang the app.
4. **CSP** — `default-src 'self'`, `img-src 'self' data:`, no remote origins. Even if a
   value escaped layer 2, there is no origin to exfiltrate to.

## Layout

```
src/
  theme/
    schema.ts        zod schemas — the single source of truth for what a theme may contain
    validate.ts      validation + alias resolution + human-readable errors
    apply.ts         validated tokens -> CSS custom properties
    builtin/         built-in themes as JSON (dark, light, and the character themes)
  app/
    state/           reducer, context, persistence
    views/           timer, tasks, stats, themes, gallery, onboarding
  ui/                primitives (Button, Field, Dialog…) — all token-driven
```

## Commands

```bash
npm run dev        # dev server
npm run build      # tsc -b && vite build  — MUST pass with zero errors
npm run lint       # oxlint
npm run test       # vitest — theme validator + timer maths
npm run verify     # build + test, the gate before saying done
npm run check:browser   # the Playwright pass — needs `npm run preview` running first
```

`check:browser` runs `scripts/browser-check.cjs`. Playwright is deliberately **not** a
dependency (a ~100 MB browser download); the script resolves a global install itself and says
so if it cannot find one. Point it elsewhere with `TINCTURE_URL=https://… npm run check:browser`.

## Rules that bite

- **`npm run build` passing is not "it works".** Drive it in a browser with Playwright.
  A page that renders and a page that functions are different claims.
- **Never write an API from memory.** `context7` for library docs.
- **Timers must not use `setInterval` counting.** Interval drift is real; store the target
  timestamp and compute the remainder. See `src/app/timer/engine.ts`.
- **`localStorage` is untrusted input.** It is user-writable. It goes through the same
  validator as a downloaded theme — no exceptions.
- **No `dangerouslySetInnerHTML` with theme data, ever.**
- **Tabular numerals** on every changing number, or the layout jitters.

## Verification before "done"

`npm run verify` green, plus `npm run check:browser` green (start `npm run preview` first).
The script covers the list this section used to describe in prose: onboarding completes, the
timer runs and survives a reload, every theme applies and its motif actually paints, Space
activates the focused control instead of the timer, the dialog traps Tab and marks the
background inert, "Erase everything" really erases, the builder's JSON tab does not desync,
a malformed theme is refused with a readable reason, the wheels open and Done commits while
Cancel cancels, deleting a theme asks first, and 360px has no overflow and no undersized
targets. Evidence in the message, or no claim.
