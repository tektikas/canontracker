# Story Bible

**Tagline:** Human-approved story canon, with evidence and change impact.

Meta AI Developer Hackathon · Startup track · Submission draft (3 Nov 2026).

## The problem

Story worlds grow across chapters, scripts, lore documents and recordings. A writer changing one rule needs to know which scenes depend on it. A teammate or coding agent needs the approved answer, its source and the limits of what is known. Searching documents alone does not distinguish a proposal from canon, or tell a team what a change could affect.

## What it does

Story Bible imports Markdown, text, Word documents and audio into versioned sources. AI proposes facts with source quotes. A person reviews them before they become canon. Deterministic checks flag narrow contradictions in time, location, travel, relationships and single-valued details; AI separately suggests world-rule violations. Change proposals show paths through accepted canon, bounded to two hops, before a person applies or rejects them.

The app includes studio roles, projects, an entity wiki, canon timelines and graphs, team conversations, research notes, draft continuity checks, citation re-checking after source changes, and Markdown, print/PDF and EPUB export. Editorial notes, images and wiki summaries stay separate from canon. Four samples support local evaluation, including public-domain Sherlock Holmes texts and an original game story, The Ashbell Pass.

## How it uses Meta

- **Muse Spark 1.3:** extraction, critic opinions, grounded canon answers and world-rule checks. Research uses a bounded Responses agent with web search and deterministic calculators. Continuity uses the same runtime with Story Bible's own MCP read/check tools, then grounds the report on the server.
- **Muse Voice Transcribe 1.0:** timestamped transcript documents from recordings and dictation in the writer and Ask. Entity names are sent as recognition hints. Script comparison identifies changed or added lines and checks their proposed facts against canon with deterministic rules.
- **Muse Image 1.0:** editorial entity portraits and document covers. Generated images never serve as canon evidence.
- **Muse Code through MCP:** a direct Streamable HTTP connection exposes 38 tools with the same role checks and audit as the app. Propose tokens can read, run checks and propose; a person's full token may make decisions as that person, marked “via agent”. Muse Spark API clients use a generated function-call bridge.

The UI shows AI advice; model provenance and tool steps remain inspectable in Agent activity and Metrics. A live error is shown and logged, without falling back to recorded output. The default local mode replays sample output without an API key; Sherlock's stored extraction was recorded with a non-Meta model and is documented as such. Dated live API observations and redacted contract fixtures are in [meta-api-notes.md](meta-api-notes.md). Local replay tests do not verify current live Meta availability.

## What was technically hard

- **Verbatim citations across versions:** quotations are verified against stored passages; typography matching stores the source's exact characters. New versions preserve old text and make affected citations visible for human re-checking.
- **Separate advice from authority:** proposed facts, accepted canon, conflicts and change impact have separate states and decisions. Superseded facts remain and audit events append.
- **Deterministic checks alongside model advice:** time and relationship rules are reproducible; AI-suggested world-rule conflicts remain labelled. Empty impact means “no impact found”, and unsupported questions return `unknown`.
- **Grounded agents:** bounded steps, time and tool budgets; continuity findings must quote the checked text and cite accepted facts. Research source quotes are checked on fetched pages and calculations come from deterministic tools; unverified claims remain labelled.
- **MCP parity without a second permission system:** panel tools call the app's own handlers, carrying the token owner's current role, project scope and audit identity. Proposal tokens cannot turn advice into canon.

## What is next (planned)

Branching canon conditioned on player choices, project-specific membership within a studio, and episode-aware canon/context packs. Later directions include quest-state checks and localization glossaries. These are planned, not shipped; see [ROADMAP.md](../ROADMAP.md).

## Team and build history

**Umur — solo builder. TekTık, [tektik.ai](https://tektik.ai).** Built during 27 Oct–4 Nov 2026; repository history starts on 30 Oct. The only pre-existing piece was a reused generic CI/CD deployment pipeline. The application, samples and integrations were built for this hackathon entry. Nuxt 4, Nitro, Node 24, SQLite and the MCP SDK are dependencies, not claimed as original work. Public-domain Doyle texts and illustration credits are retained in the sample's source notices.

## Links to fill at submission

- Demo video: `VIDEO_URL`
- Public live app: `LIVE_URL` (current staging is LAN/VPN-only)
- Source: https://github.com/ugorur/storybible (mirror to be made public by the owner at submission)
- Pitch deck: [pitch-deck.pdf](pitch-deck.pdf), also `/pitch` on a running app
- Local quick start and checks: [README.md](../README.md)
- License: [AGPL-3.0-or-later](../LICENSE)
