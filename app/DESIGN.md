# Story Bible design system: pencil and ink

Comics and animation teams draw in pencil and commit in ink. Story Bible works the same way: the model sketches candidates in **pencil**, a person commits them to canon in **ink**. Every visual choice follows from that.

- **Pencil** (graphite, dashed outlines): proposed, not yet canon. Pending candidates, future workflow steps.
- **Ink** (Prussian blue `--accent`, solid fill): canon, primary actions, the current location.
- **Vermilion** (`--bad`): conflicts and unverified quotes. **Ochre** (`--warn`): caution, approximate times, recorded run. **Moss** (`--good`): verified evidence.
- **Serif is the story's voice.** Literata appears only for words from the story: statements, quotes, passages. Everything that belongs to the tool (labels, buttons, headings, tables) is Instrument Sans. Never set UI in the serif.
- Calm by default: flat bordered panels, no gradients, no decorative shadows, no entrance animations. One bold element per page at most (on Home it is the workflow rail).

## Tokens (`app/assets/main.css`)

All colors are CSS variables with a light set and a dark set (`prefers-color-scheme: dark`, or `data-theme` on `<html>` when a person toggled it in the command palette). Never hard-code a hex in a page.

| Group | Tokens |
| --- | --- |
| Surfaces | `--canvas` (page), `--surface` (sidebar, table heads, sunk panels), `--raised` (panels, inputs), `--sunken` (hover, neutral badge), `--quote-bg` |
| Text | `--ink`, `--muted` (secondary), `--faint` (meta, counts). All three meet 4.5:1 on every surface in both themes; keep it that way when tuning. |
| Lines | `--line`, `--line-strong` (inputs, buttons, dashed pencil) |
| Meaning | `--accent` / `--accent-strong` / `--accent-soft` / `--accent-ink`, `--pencil` / `--pencil-soft`, `--good`, `--warn`, `--bad` (each with `-soft`) |
| Type | `--font-ui` Instrument Sans, `--font-story` Literata, `--font-code` JetBrains Mono (hashes, triples, line numbers only). Sizes `--text-xs` 12 · `sm` 13 · `base` 14 (UI body) · `md` 16 (story text) · `lg` 19 · `xl` 24 · `2xl` 30 |
| Space | 4px grid: `--s-1` 4, `--s-2` 8, `--s-3` 12, `--s-4` 16, `--s-5` 24, `--s-6` 32, `--s-7` 48 |
| Radius | `--r-sm` 4 (badges), `--r-md` 6 (buttons, inputs, nav), `--r-lg` 10 (panels). Small things are squarer. |
| Elevation | Panels are flat with a 1px border. `--elev-overlay` only for things that float (mobile drawer). |
| Motion | `--dur-1` 120ms (hover), `--dur-2` 220ms (drawer), `--ease`. Motion only answers a user action; `prefers-reduced-motion` turns it off. |

Fonts load from Google Fonts in `nuxt.config.ts`.

## Brand

The mark is an open story ledger: graphite-style strokes on the left, solid ink on the right. Keep at least one quarter of the mark’s width clear around it. Minimum size: 16px for the mark, 140px for the horizontal lockup. Do not stretch, rotate, add shadows or place it on a busy image.

`BrandMark.vue` keeps the inline mark in the app’s existing text lockups. Standalone vectors live in `public/brand/`: `mark.svg` and `story-bible.svg` adapt to the system theme; `story-bible-mono.svg` uses `currentColor` when inlined. The wordmark is outlined Instrument Sans semibold (license alongside it). Use `--accent` (Prussian blue / light blue in dark mode), or one solid ink colour for monochrome. Keep Instrument Sans for UI and branding; Literata stays reserved for story content.

Original generated pencil-and-ink illustrations live in `public/art/`, with transparent WebP and PNG alternatives. Preserve their aspect ratios and ivory paper interiors in either theme. They are editorial artwork, not canon or screenshots. App icons and 1200×630 social PNGs live in `public/`; the social composition source and every generation prompt are in `scripts/brand/`. Keep social image URLs absolute in metadata. Regeneration details and asset sizes: `scripts/brand/README.md`.

## Components (`app/components/ui/`, auto-imported as `Ui*`)

| Component | Use |
| --- | --- |
| `<UiPageHeader title description>` | Top of every page. `#actions` slot for the page's main button. Default slot replaces the description. |
| `<UiPanel title description flush sunk as>` | One block of content. `flush` for edge-to-edge tables/lists, `sunk` for nested panels. `#actions` slot in the header. |
| `<UiButton variant size to icon loading disabled>` | `variant`: `secondary` (default), `primary` (one per view), `ghost`, `danger`, `good`. `size`: `sm`, `md`, `lg`. With `to` it renders a link. |
| `<UiBadge tone dot>` | Status. `tone`: `neutral`, `pencil` (proposed), `accent` (canon), `good` (verified), `warn`, `bad`. `dot` for live states. Never fill a row with more than three. |
| `<UiField label hint error>` | Wraps one input/select/textarea. |
| `<UiTabs v-model :items="[{ value, label, count }]">` | In-page views (Canon: facts, graph, …). One row that scrolls sideways when narrow, with a fade on the cut edge. |
| `<UiEmptyState title icon>` | Say what is missing, then `#actions` with the button that fills it. |
| `<UiDialog v-model:open title wide>` | Modal sheet on the native `<dialog>` (focus trap, Esc, backdrop), a bottom sheet on phones. `#actions` slot for the footer buttons. |
| `askConfirm({ title, body, confirm, danger })` | Await it instead of the browser's `confirm()`; `<UiConfirm>` in `app.vue` shows it. Never use `confirm()`/`alert()`. |
| `<UiIcon name size label>` | Inline SVG stroke icons. Add new paths to the map in `Icon.vue`. |

Domain components restyled to this language: `SourceRef` (quote + source link + verification badge) and `FactSummary` (kind/time badges, statement, triple, optional sources).

The components render the same global classes old pages use, so both stay consistent: `.btn` (`.primary .ghost .danger .good .sm .lg`), `.chip` (= badge tones), `.card` (= panel), `.page-head`, `.tabs`, `.notice` (`.info .warn .bad`), `.empty`, `.stack`, `.row`, `.spread`, `.grid-2`, `.statement`, `.triple`, `.quote` (`.unverified .prior`), `.passage`, `.table-wrap`, `.muted`, `.faint`, `.small`, `.mono`, `.hide-sm`. New pages should prefer the components; don't invent new global classes for one page (use scoped styles).

## Command palette

`<CommandPalette>` (in the default layout) opens with Ctrl/⌘ K or the Search button (sidebar; top bar on mobile). It searches canon facts, entities (any alias or merged name), documents (text, with the exact passage) and notes through `GET /api/search`, and runs commands (viewers only get read commands). Fixed height so results never shift the sheet; full screen on phones. Roles: combobox on the input, listbox/option for results.

## Layout

- **Shell** (`app/app.vue`): sidebar 240px on desktop with nav grouped as Home / Workflow (Review, Canon, Conflicts, Changes) / Tools (Ask, Metrics, Audit). Live counts: pending review (ink), open conflicts (vermilion), canon and changes (quiet). Model status sits at the bottom: "Recorded run" with a hollow ochre dot in mock mode, "Live model" with a filled dot otherwise. Recorded output must always be labeled as recorded.
- **Mobile (≤ 900px)**: a 52px top bar with menu, brand and the model badge; the sidebar becomes a drawer that closes on navigation, scrim tap or Esc.
- **Phones (≤ 720px)**: a bottom nav with Home, Review, Canon, Entities and More (opens the drawer). Review carries the pending count; More shows a vermilion dot for open conflicts. It respects the safe-area inset; anything fixed or sticky at the bottom sits at `bottom: var(--bottom-nav-h)`. Focus mode and modal dialogs cover it.
- **Empty pages**: `UiEmptyState` with one sentence of why and one primary action. When the fix is "add or review something", use `useFillAction()` so every page sends people to the same next step.
- **Content**: max 1100px, left-aligned, 40px side padding (16px on phones). Text blocks stay under ~70ch.
- **Page rhythm**: `UiPageHeader`, then optional notice, then panels separated by `--s-5`. Two-column layouts collapse to one column at 720px (`.grid-2`) or 1100px (Home).
- **Phones (390px)**: no horizontal page scroll. Wide tables live in `.table-wrap` and hide secondary columns with `.hide-sm`. Touch targets are at least 44px: `.btn` of every size, `.icon-btn`, inputs and selects grow on phones; custom controls (pills, toggles, checkbox rows) set their own 44px.
- **Disabled buttons** (`.btn:disabled`) look the same for every variant: sunken fill, dashed border, `--faint` label (≥ 4.5:1 in both themes). No opacity fade, so the label stays readable.
- **Dates**: `shortDate` ("30 Oct 2026"), `dateTime` ("30 Oct 2026, 22:36") and `clock` ("22:36:05") from `app/utils/date.ts`, 24-hour, everywhere.
- **Copy**: sentence case, plain verbs, button says what happens ("Start review", "Scan canon"). No all-caps labels.
