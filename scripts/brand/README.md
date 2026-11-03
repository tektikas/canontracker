# CanonTracker brand assets

Logo, icons, illustrations, product screenshots and social cards in graphite and signal orange (`app/assets/main.css`: canvas `#f2f3f5`, panels `#ffffff`, ink `#16171a`, text-safe orange `#c2410c`; dark canvas `#111214`, ink `#ebecef`, orange `#ff7a45`). The mark is hand-authored SVG: a canon track with two hollow points and one accepted signal-orange `#e8501a` point. No generation model drew the logo or lettering.

## Logo and icons

- `public/brand/mark.svg`, `story-bible.svg` and `public/favicon.svg`: graphite ink, pale ink under `prefers-color-scheme: dark`, and the signal-orange middle point. `story-bible-mono.svg` uses `currentColor`. Legacy filenames stay stable. The wordmark is live Instrument Sans semibold text (OFL license included), with Helvetica/Arial fallbacks; the font must be present when using standalone SVGs. The app loads Instrument Sans itself.
- `node scripts/brand/render-icons.mjs` (system ImageMagick) derives `icon-512.png`, `icon-192.png`, `apple-touch-icon.png` and the 32/16px `favicon.ico` from `mark.svg`: graphite/orange on a cool-grey `#f2f3f5` square with safe padding. `site.webmanifest` uses the light canvas and text-safe accent.

## Illustrations (`public/art/*.webp`)

Pencil-and-ink spots and one hero, generated with **OmniRoute images** (`POST https://gateway.example/v1/images/generations`, model `codex/gpt-image-2`). The original prompt and size of every image is archived in [prompts.json](./prompts.json), keyed by file name; these historical prompts preserve the product's old name and warm colours before the graphite conversion. All subjects are original objects; no people, characters, brands or lettering.

The original sources used a warm ground. BiRefNet removed it before optimisation; `LandingArt.vue` displays the transparent cutouts directly in both themes. The rebrand converts their RGB to neutral graphite and keeps alpha and dimensions.

1. Generate: `OMNIROUTE_KEY="$(pass show <secret-entry> | head -1)" node scripts/brand/generate-art.mjs <source dir> [name…]`. Sources are PNG, 1254×1254; keep them outside `public/`. The gateway gives up after 30 s without a response and the script retries each image three times; long, busy prompts time out more often (the hero prompt was shortened for that reason).
2. Cut out: send each source to BiRefNet (`POST https://models.example/v1/images/edits`, multipart `model=birefnet`, `image=@<file>`, `response_format=b64_json`; homelab, no key) and save the transparent PNGs in their own folder. The drawings then sit on the page in both themes with no paper plate.
3. Optimise: `node scripts/brand/optimise-art.mjs <cut-out dir>`. Keeps alpha (a source without alpha falls back to flood-filling its original ground), converts RGB to grayscale, resizes (hero 960px, pitch 800px, spots 400px) and writes WebP quality 82 with alpha quality 90.
4. Rebrand existing shipped artwork: `node scripts/brand/optimise-art.mjs --graphite`. Uses ImageMagick `-colorspace Gray -colorspace sRGB` and lossless WebP encoding in place; preserves dimensions and the alpha channel. This was applied to all 19 shipped cutouts on 3 Nov 2026. No image-generation service is needed.

## Product screenshots (`public/shots/*.webp`)

Real screens of the app with the bundled samples, light and dark, 1280 and 720 wide (`MarketingShot.vue` picks the theme with `prefers-color-scheme` and the width with `srcset`; lazy below the fold).

With a prod build on localhost with its own `.data` (default AI mode: each sample replays its own AI output), run `node scripts/brand/render-shots.mjs http://localhost:<port> [name…]`. It signs up a throwaway account (“Ada Marlow”, “Northlight Studio”) through the API, loads Lantern Row, Broken Tide, Sherlock Holmes (verified candidates accepted, conflicts scanned) and The Ashbell Pass into four projects, walks the Ashbell Pass through review (figurative candidate rejected, verified candidates accepted), a conflict scan with two decisions, the Salt Gate → Saltgate merge, a proposed change to the bell rule, the sample voice take linked to its script and one Ask question, then captures each page at 1280×800 with the installed headless `playwright-cli` (session `shots`). The session cookie carries the current project, so a project switch re-sets the browser cookie.

Shots: `review`, `tide-review`, `canon`, `graph`, `timeline`, `conflicts`, `impact`, `entity`, `library`, `reader`, `voice`, `ask`, `agent-activity`, `export`, `team`, `mcp`, `lantern`, `watson-card` (Sherlock Holmes: the Watson's wound conflict card alone at 2× zoom, light, 1920 and 960 wide; used by the pitch deck).

## Social cards (`public/og-*.png`)

`node scripts/brand/render-og.mjs http://localhost:<port>` renders [og.html](./og.html) at 1200×630 for each variant (`landing`, `default`, `agents`, `security`) with the installed `playwright-cli` (session `og`); the running app serves the illustration. It waits for Instrument Sans and the art and fails if either is missing (Google Fonts must be reachable). Copy and composition live in `og.html`. Pages set their card through `useMarketingSeo()` (`app/utils/marketing.ts`); absolute URLs use `https://canontracker.trythis.work`.

## Sizes

| Group | Files | Bytes |
| --- | ---: | ---: |
| Illustrations `public/art/*.webp` | 19 | 1,097,548 |
| Screenshots `public/shots/*.webp` (including help and pitch crops; refreshed separately) | 118 | 3,685,600 |
| Social cards `public/og-*.png` | 4 | 469,643 |
| Icons, favicons, manifest, logo SVGs | 9 | 42,780 |

A page downloads only what it shows. The home hero is a live card with both verified Watson quotes, so it needs no hero image. Illustrations and screenshots below the fold load lazily, one theme and width per screenshot. The grayscale art uses lossless WebP to preserve the existing alpha exactly; the one-off conversion increased its total size from about 619 KB to 1.1 MB.

## Pitch deck (`docs/pitch-deck.pdf`)

`/pitch` (`app/pages/pitch.vue`) is the deck: eleven 16:9 slides alternating dark and light (each pinned to one set of the palette), then an appendix (market sizing, competitor table, proof, sources). Type scales with the slide width; print is one 16×9 in page per slide (`@page slide`). Sources and the beachhead model (counts × shares × assumptions × a competitor's list price) live at the top of the page. The three hook drawings are `pitch-door`, `pitch-wand` and `pitch-wound` in `prompts.json`. With the app running (it needs the `watson-card` shot above and the `pitch-*` illustrations), `node scripts/brand/render-pitch.mjs http://localhost:<port>` prints it with the installed headless `playwright-cli` (session `pitch`, light theme) to `docs/pitch-deck.pdf`, and fails if the font or a screenshot did not load or the page count differs from the slide count.
