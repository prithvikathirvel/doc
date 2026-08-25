# Sify DMS — Brand Kit

Minimal, enterprise-grade brand assets for Sify DMS. Sources are SVG; raster
outputs and the document template are generated from them.

## Brand tokens

| Token | Value | Use |
| --- | --- | --- |
| Accent | `#3B5BDB` | Primary actions, logo glyph, links |
| Accent gradient | `#4263FF → #2B3FA8` | Logo / icon background |
| Ink | `#0F172A` | Headings, primary text |
| Slate | `#64748B` | Secondary text (e.g. the “DMS” wordmark) |
| Canvas | `#F6F7F9` / `#0B1220` | App surface (light / dark) |
| Type | Inter, Segoe UI, system sans | Wordmark and UI |

## Files

### Sources (edit these, then regenerate)

- `icon.svg` — the app icon / favicon glyph (512², rounded square + document).
- `logo.svg` — full lockup: glyph + “Sify **DMS**” wordmark (1024×280).
- `og-image.svg` — social / Open Graph card (1200×630).

### Generated assets

- `icon-512.png`, `icon-192.png`, `icon-180.png`, `icon-48.png`, `icon-32.png`, `icon-16.png`
- `favicon.ico` — multi-size (16/32/48) icon for browser tabs and Google search.
- `logo-512.png`, `logo-1024.png` — raster lockups.
- `og-image.png` — rendered Open Graph image.
- `Sify-DMS-Onboarding-Template.docx` — editable onboarding template with a
  branded header (logo + wordmark) and footer (confidentiality + page numbers).

### Web app (already wired)

The web app consumes copies of these assets via Next.js file conventions:

- `web/app/favicon.ico`, `web/app/icon.png`, `web/app/apple-icon.png`,
  `web/app/opengraph-image.png` — auto-linked in `<head>`.
- `web/public/icon-192.png`, `web/public/icon-512.png` — referenced by the
  web manifest.

## Regenerating

```bash
cd brand
npm install
npm run build          # renders all PNGs + favicon.ico + the .docx template
# or individually:
npm run build:icons    # icons + favicon + OG + logo PNGs
npm run build:docx     # the onboarding .docx
```

> The SVG renderer (`@resvg/resvg-js`) needs no system libraries. `build.mjs`
> references DejaVu Sans at `/usr/share/fonts/truetype/dejavu/` for the OG card
> and logo wordmark; substitute the `fontFiles` paths on other systems if needed.

## Guidelines

- Keep clear space around the glyph equal to ~25% of its height.
- The glyph on the accent gradient works on light or dark backgrounds; do not
  recolour the wordmark — “Sify” is ink, “DMS” is slate.
- Minimum icon size: 16×16 (favicon). For print, use the SVG or a PNG ≥ 512.
