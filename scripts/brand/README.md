# Story Bible brand assets

Logo, icons, illustrations, product screenshots and social cards for the app and the public site, in the writer palette (`app/assets/main.css`: linen `#f4f0e8`, paper `#fdfbf7`, walnut ink `#733816`, tan ink `#dba077` in dark). The logo mark is hand-authored SVG; the wordmark is outlined Instrument Sans semibold, used under the included OFL license. No generation model drew the logo or any lettering.

## Logo and icons

- `public/brand/mark.svg`, `story-bible.svg` and `public/favicon.svg`: walnut `#733816`, tan `#dba077` under `prefers-color-scheme: dark`. `story-bible-mono.svg` uses `currentColor`.
- `node scripts/brand/render-icons.mjs` (system ImageMagick) derives `icon-512.png`, `icon-192.png`, `apple-touch-icon.png` and the 32/16px `favicon.ico` from `mark.svg`: walnut mark on a linen `#f4f0e8` square with safe padding. `site.webmanifest` uses the same two colours.

## Illustrations (`public/art/*.webp`)

Pencil-and-ink spots and one hero, generated with **OmniRoute images** (`POST https://gateway.example/v1/images/generations`, model `codex/gpt-image-2`). The exact prompt and size of every image is in [prompts.json](./prompts.json), keyed by its file name. All subjects are original objects; no people, characters, brands or lettering.

Transparent backgrounds work (`background: "transparent"`), but the model draws a soft white glow into the alpha, which shows as a halo on the dark theme. So every image is drawn on the flat linen paper colour, and `LandingArt.vue` shows it on a linen plate of the same colour in both themes (slightly dimmed in dark).

1. Generate: `OMNIROUTE_KEY="$(pass show <secret-entry> | head -1)" node scripts/brand/generate-art.mjs <source dir> [name…]`. Sources are PNG, 1254×1254; keep them outside `public/`. The gateway gives up after 30 s without a response and the script retries each image three times; long, busy prompts time out more often (the hero prompt was shortened for that reason).
2. Cut out: send each source to BiRefNet (`POST https://models.example/v1/images/edits`, multipart `model=birefnet`, `image=@<file>`, `response_format=b64_json`; homelab, no key) and save the transparent PNGs in their own folder. The drawings then sit on the page in both themes with no paper plate.
3. Optimise: `node scripts/brand/optimise-art.mjs <cut-out dir>`. Keeps the alpha (a source without alpha falls back to flood-filling its linen ground), resizes (hero 960px, spots 400px: twice their largest display size) and writes WebP quality 82 with alpha quality 90. No PNG fallbacks: every supported browser reads WebP.

## Product screenshots (`public/shots/*.webp`)

Real screens of the app with the bundled samples, light and dark, 1280 and 720 wide (`MarketingShot.vue` picks the theme with `prefers-color-scheme` and the width with `srcset`; lazy below the fold).

With a prod build on localhost with its own `.data` (default AI mode: each sample replays its own AI output), run `node scripts/brand/render-shots.mjs http://localhost:<port> [name…]`. It signs up a throwaway account (“Ada Marlow”, “Northlight Studio”) through the API, loads Lantern Row, Broken Tide, Sherlock Holmes (verified candidates accepted, conflicts scanned) and The Ashbell Pass into four projects, walks the Ashbell Pass through review (figurative candidate rejected, verified candidates accepted), a conflict scan with two decisions, the Salt Gate → Saltgate merge, a proposed change to the bell rule, the sample voice take linked to its script and one Ask question, then captures each page at 1280×800 with the installed headless `playwright-cli` (session `shots`). The session cookie carries the current project, so a project switch re-sets the browser cookie.

Shots: `review`, `tide-review`, `canon`, `graph`, `timeline`, `conflicts`, `impact`, `entity`, `library`, `reader`, `voice`, `ask`, `agent-activity`, `export`, `team`, `mcp`, `lantern`, `watson-card` (Sherlock Holmes: the Watson's wound conflict card alone at 2× zoom, light, 1920 and 960 wide; used by the pitch deck).

## Social cards (`public/og-*.png`)

`node scripts/brand/render-og.mjs http://localhost:<port>` renders [og.html](./og.html) at 1200×630 for each variant (`landing`, `default`, `agents`, `security`) with the installed `playwright-cli` (session `og`); the running app serves the illustration. It waits for Instrument Sans and the art and fails if either is missing (Google Fonts must be reachable). Copy and composition live in `og.html`. Pages set their card through `useMarketingSeo()` (`app/utils/marketing.ts`); absolute URLs use `https://storybible.trythis.work`.

## Sizes

| Group | Files | Bytes |
| --- | ---: | ---: |
| Illustrations `public/art/*.webp` (hero 69,002) | 16 | 257,354 |
| Screenshots `public/shots/*.webp` (17 screens × light/dark × 720/1280) | 68 | 2,371,052 |
| Social cards `public/og-*.png` | 4 | 682,532 |
| Icons, favicons, manifest, logo SVGs | 9 | 70,984 |

A page downloads only what it shows: the home page loads the hero screenshot (22–49 KB) eagerly and everything else lazily, one theme and one width per screenshot.

## Pitch deck (`docs/pitch-deck.pdf`)

`/pitch` (`app/pages/pitch.vue`) is the deck: eleven 16:9 slides alternating dark and light (each pinned to one set of the palette), then an appendix (market sizing, competitor table, proof, sources). Type scales with the slide width; print is one 16×9 in page per slide (`@page slide`). Sources and the beachhead model (counts × shares × assumptions × a competitor's list price) live at the top of the page. The three hook drawings are `pitch-door`, `pitch-wand` and `pitch-wound` in `prompts.json`. With the app running (it needs the `watson-card` shot above and the `pitch-*` illustrations), `node scripts/brand/render-pitch.mjs http://localhost:<port>` prints it with the installed headless `playwright-cli` (session `pitch`, light theme) to `docs/pitch-deck.pdf`, and fails if the font or a screenshot did not load or the page count differs from the slide count.
