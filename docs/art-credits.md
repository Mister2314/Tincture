# Bundled artwork

Tincture ships one piece of third-party artwork. It is bundled with the app rather than
referenced by a URL, and it is not part of any theme file.

## Why the artwork is here and not in a theme

A theme is a token document. It has no `url()`, no assets and no code — that is what makes
opening a stranger's theme safe. So a theme cannot carry a picture. Instead a theme names a
**motif** (`motif: "starry-flow"`), and the app owns the bytes and the renderer. A theme
chooses; the app paints.

## `public/art/starry-night.jpg`

| | |
|---|---|
| Work | *The Starry Night*, Vincent van Gogh, 1889 |
| Source | Wikimedia Commons — `File:Van Gogh - Starry Night - Google Art Project.jpg` |
| Licence | **Public domain.** `LicenseShortName: Public domain`, `UsageTerms: Public domain`, `Copyrighted: false` — read from the Commons API `extmetadata` on 2026-10-12, not assumed |
| Dimensions as shipped | 1280 × 1014, 618 KB JPEG (downscaled from a 44,567 × 35,291 original) |
| Retrieved from | `upload.wikimedia.org` thumbnail service |

The work is in the public domain worldwide: Van Gogh died in 1890, and this is a photographic
reproduction of a two-dimensional work whose copyright has expired (PD-Art). No attribution
is legally required. It is credited here because crediting a painter costs nothing.

**Note for anyone re-fetching it:** the 1600px thumbnail returned an HTML error page from
Wikimedia during development; 1280px worked. Verify the bytes are a JPEG (`ff d8 ff`) rather
than trusting the HTTP status — a 200 with an error page is still a 200.

## Adding more

Only public-domain or openly-licensed work, and only with the licence recorded in this file
with the same evidence standard: read it from the source, do not infer it. Keep each asset
under roughly 1 MB and lazy-load it, so a theme nobody selected never costs a download.

## Bundled fonts

Six families, all **SIL Open Font License 1.1**, fetched from the Google Fonts CSS API on
2026-10-12 and committed under `src/assets/fonts/` (latin subset only, ~260 KB total). The
`@font-face` rules live in `src/styles/fonts.css`.

| Family | Role in the theme set | Files |
|---|---|---|
| Manrope | Default body face | `manrope-0.woff2` |
| Instrument Serif | Default display face (roman + italic) | `instrument-serif-0.woff2`, `instrument-serif-1.woff2` |
| JetBrains Mono | Every number that ticks | `jetbrains-mono-0.woff2` |
| Fraunces | Van Gogh, Herbarium — literary and soft-serifed | `fraunces-0.woff2` |
| Bricolage Grotesque | Sakura Tree — eclectic display | `bricolage-grotesque-0.woff2` |
| Space Grotesk | Terminal Amber — technical and wide | `space-grotesk-0.woff2` |

They are bundled rather than linked for the same reason the artwork is: `FONT_FAMILIES` is a
closed list, and a theme can only name a font the app already ships. A remote font would turn
`fontFamily` into a network fetch — which is precisely the exfiltration channel the closed
whitelist exists to close, and which the CSP (`font-src 'self'`) blocks regardless.

The OFL permits redistribution of the font files, including bundled in an application, with
the licence text retained. A copy of the OFL is available at
`https://openfontlicense.org`.

