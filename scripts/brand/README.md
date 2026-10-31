# Story Bible brand assets

Original assets for card c24. The logo mark is hand-authored SVG; the wordmark is outlined Instrument Sans semibold, used under the included OFL license. No generation model drew the logo or any lettering. `BrandMark.vue` retains its original mark-only API; the surrounding existing text completes the app lockup.

## Generation prompts

The exact full prompt for **every generated source** is in [prompts.json](./prompts.json), keyed by its final filename stem: `story-world`, `import`, `review`, `canon`, `conflicts`, `impact`. Tool: built-in Codex `image_gen.imagegen`, with `transparent_background: true` for each of six separate generations. The five spots share a common pencil-and-ink style specification. All scenes and objects are original; there are no brands or copyrighted characters. Any manuscript marks are abstract strokes, not copy.

The hero depicts an open ledger becoming a coastal world, beside connected story cards. The spots depict gathered source pages, deliberate pen review, a reference ledger, contradictory scene cards and downstream scene connections. The OG cards reuse `story-world.webp`; their logo and all copy are real SVG/HTML text in [og.html](./og.html), rendered in a headless browser. They require no additional image-generation prompts.

## Regeneration

1. Generate each source using the corresponding exact prompt and transparency option. Keep the source PNGs outside `public/`.
2. Use the existing system ImageMagick to optimise copies. Hero: `magick SOURCE -resize 720x480 -strip -quality 80 -define webp:alpha-quality=85 public/art/story-world.webp`. PNG fallback: same resize, then `-strip -dither None -colors 128 PNG8:public/art/story-world.png`.
3. Each spot: `magick SOURCE -resize 200x160 -background none -gravity center -extent 200x160 -strip -quality 80 -define webp:alpha-quality=85 public/art/NAME.webp`. PNG fallback: same geometry, then `-strip -dither None -colors 96 PNG8:public/art/NAME.png`. Preserve alpha; never flatten on a theme colour.
4. Icons: `node scripts/brand/render-icons.mjs` (system ImageMagick, no app dependency). It derives all raster icons from `public/brand/mark.svg`; SVG favicon uses the same mark. The ICO contains actual 32px and 16px entries. PNG app icons use a fixed light canvas and safe padding.
5. With the app running on **http://localhost:3640**, run `node scripts/brand/render-og.mjs`. It uses installed `@playwright/cli` in its own headless `c24-og` session, waits for the real Instrument Sans font and illustration to load, renders both 1200×630 cards, then closes the session. Google Fonts must be reachable; a missing font fails the render. The HTML template is the source of truth for copy and composition.

The standalone logo SVGs contain outlined glyphs, so no font download is required to display them. Typography source: Google Fonts' `ofl/instrumentsans/InstrumentSans[wdth,wght].ttf`, weight 600 and width 100; fontTools was used only as a local authoring tool to outline the glyphs. No package dependencies were added.

## Asset sizes

All landing artwork, **including both formats**, totals **224,812 bytes** (219.5 KiB). A WebP browser transfers only 101.5 KiB. Hero: 720×480; each spot: 200×160; OG cards: 1200×630.

| Asset | Bytes |
| --- | ---: |
| `public/art/canon.png` | 6,346 |
| `public/art/canon.webp` | 4,360 |
| `public/art/conflicts.png` | 7,055 |
| `public/art/conflicts.webp` | 6,800 |
| `public/art/impact.png` | 3,996 |
| `public/art/impact.webp` | 4,846 |
| `public/art/import.png` | 4,700 |
| `public/art/import.webp` | 4,558 |
| `public/art/review.png` | 5,656 |
| `public/art/review.webp` | 6,246 |
| `public/art/story-world.png` | 93,169 |
| `public/art/story-world.webp` | 77,080 |
| `public/favicon.svg` | 576 |
| `public/favicon.ico` | 5,430 |
| `public/apple-touch-icon.png` | 18,392 |
| `public/icon-192.png` | 18,961 |
| `public/icon-512.png` | 5,197 |
| `public/site.webmanifest` | 366 |
| `public/brand/mark.svg` | 576 |
| `public/brand/story-bible.svg` | 10,719 |
| `public/brand/story-bible-mono.svg` | 10,633 |
| `public/og-default.png` | 252,606 |
| `public/og-landing.png` | 263,751 |

## Review evidence

Browser evidence belongs in `.orka-evidence/c24-*.png` (ignored by git): desktop 1280×800 and mobile 390×844 in both themes, full-size OG views, favicon/app-icon/logo sheets and PNG fallback. Social tags use the canonical staging origin `https://storybible.trythis.work`; update those absolute URLs in both `nuxt.config.ts` and `LandingPage.vue` if the public origin changes.
