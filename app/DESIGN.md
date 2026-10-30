# Story Bible design system: pencil and ink

Comics and animation teams draw in pencil and commit in ink. Story Bible works the same way: the model sketches candidates in **pencil**, a person commits them to canon in **ink**. Every visual choice follows from that.

- **Pencil** (graphite, dashed outlines): proposed, not yet canon. Pending candidates, future workflow steps.
- **Ink** (Prussian blue `--accent`, solid fill): canon, primary actions, the current location.
- **Vermilion** (`--bad`): conflicts and unverified quotes. **Ochre** (`--warn`): caution, approximate times, recorded run. **Moss** (`--good`): verified evidence.
- **Serif is the story's voice.** Literata appears only for words from the story: statements, quotes, passages. Everything that belongs to the tool (labels, buttons, headings, tables) is Instrument Sans. Never set UI in the serif.
- Calm by default: flat bordered panels, no gradients, no decorative shadows, no entrance animations. One bold element per page at most (on Home it is the workflow rail).

## Tokens (`app/assets/main.css`)

All colors are CSS variables with a light set and a `prefers-color-scheme: dark` set. Never hard-code a hex in a page.

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

## Components (`app/components/ui/`, auto-imported as `Ui*`)

| Component | Use |
| --- | --- |
| `<UiPageHeader title description>` | Top of every page. `#actions` slot for the page's main button. Default slot replaces the description. |
| `<UiPanel title description flush sunk as>` | One block of content. `flush` for edge-to-edge tables/lists, `sunk` for nested panels. `#actions` slot in the header. |
| `<UiButton variant size to icon loading disabled>` | `variant`: `secondary` (default), `primary` (one per view), `ghost`, `danger`, `good`. `size`: `sm`, `md`, `lg`. With `to` it renders a link. |
| `<UiBadge tone dot>` | Status. `tone`: `neutral`, `pencil` (proposed), `accent` (canon), `good` (verified), `warn`, `bad`. `dot` for live states. Never fill a row with more than three. |
| `<UiField label hint error>` | Wraps one input/select/textarea. |
| `<UiTabs v-model :items="[{ value, label, count }]">` | In-page views (Canon: facts, graph, …). |
| `<UiEmptyState title icon>` | Say what is missing, then `#actions` with the button that fills it. |
| `<UiIcon name size label>` | Inline SVG stroke icons. Add new paths to the map in `Icon.vue`. |

Domain components restyled to this language: `SourceRef` (quote + source link + verification badge) and `FactSummary` (kind/time badges, statement, triple, optional sources).

The components render the same global classes old pages use, so both stay consistent: `.btn` (`.primary .ghost .danger .good .sm .lg`), `.chip` (= badge tones), `.card` (= panel), `.page-head`, `.tabs`, `.notice` (`.info .warn .bad`), `.empty`, `.stack`, `.row`, `.spread`, `.grid-2`, `.statement`, `.triple`, `.quote` (`.unverified .prior`), `.passage`, `.table-wrap`, `.muted`, `.faint`, `.small`, `.mono`, `.hide-sm`. New pages should prefer the components; don't invent new global classes for one page (use scoped styles).

## Layout

- **Shell** (`app/app.vue`): sidebar 240px on desktop with nav grouped as Home / Workflow (Review, Canon, Conflicts, Changes) / Tools (Ask, Metrics, Audit). Live counts: pending review (ink), open conflicts (vermilion), canon and changes (quiet). Model status sits at the bottom: "Recorded run" with a hollow ochre dot in mock mode, "Live model" with a filled dot otherwise. Recorded output must always be labeled as recorded.
- **Mobile (≤ 900px)**: a 52px top bar with menu, brand and the model badge; the sidebar becomes a drawer that closes on navigation, scrim tap or Esc.
- **Content**: max 1100px, left-aligned, 40px side padding (16px on phones). Text blocks stay under ~70ch.
- **Page rhythm**: `UiPageHeader`, then optional notice, then panels separated by `--s-5`. Two-column layouts collapse to one column at 720px (`.grid-2`) or 1100px (Home).
- **Phones (390px)**: no horizontal page scroll. Wide tables live in `.table-wrap` and hide secondary columns with `.hide-sm`. Touch targets are at least 34px (42px in the drawer).
- **Copy**: sentence case, plain verbs, button says what happens ("Start review", "Scan canon"). No all-caps labels.
