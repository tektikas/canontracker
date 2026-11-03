# Story Bible

A story builder for anyone building a story world: novelists, game writers, screen and series writers, worldbuilders, solo or in a team. Story Bible keeps your canon human-approved and source-cited. Import lore, notes and scene scripts (read-only), turn model-extracted candidates into human-approved, source-cited canon, flag narrow conflicts, and see the 1-2 hop impact of a proposed canon change before it reaches the build or the manuscript. Games are one use case, not the only one: the samples are Broken Tide and Lantern Row (prose scenes) and The Ashbell Pass (a game story). Built for the Meta AI Developer Hackathon.

## Run it (about 5 minutes, no API key)

You need Node 24 and pnpm (`mise install` reads `mise.toml`, or install both yourself).

```sh
git clone <this repo> storybible && cd storybible
pnpm install
pnpm dev --port 3000
```

Open http://localhost:3000, then:

1. **Sign up** (any name, email and password; the data stays in a local SQLite file under `.data/`).
2. Name your studio and first project.
3. On the last onboarding step click **Load The Ashbell Pass** (28 documents) or **Load demo and take the tour** (Broken Tide + Lantern Row).

No `.env` is needed in dev: the session password is generated and written to `.env` on first start, and the model runs in recorded mode. For a production build, set `NUXT_SESSION_PASSWORD` (32+ characters, see `.env.example`), then `pnpm build && node .output/server/index.mjs`.

## Recorded mode and live mode

- **Recorded (default, `NUXT_MODEL_MODE=mock`)**: model steps replay recorded output for the three samples. The UI labels it **"Recorded demo run"**. Your own files import fine but get no candidates; add facts by hand from their text.
- **Live (`NUXT_MODEL_MODE=meta`)**: calls the Meta Model API with your key. The UI names the model ("Muse Spark 1.3 via Meta Model API"). A live failure (no key, 401, 402, timeout, invalid JSON) is shown and logged, and never falls back to recorded output.

```sh
NUXT_MODEL_MODE=meta NUXT_META_API_KEY=<your key> pnpm dev --port 3000
```

Optional: `NUXT_MODEL_ID` (default `muse-spark-1.3`), `NUXT_IMAGE_MODEL_ID` (default `muse-image-1.0`), `NUXT_META_BASE_URL` (default `https://api.meta.ai/v1`), `NUXT_TRANSCRIBE_MODEL_ID` (default `muse-voice-transcribe-1.0`; `NUXT_TRANSCRIBE_BASE_URL` / `NUXT_TRANSCRIBE_API_KEY` default to the Meta ones). Recordings in formats other than mono 16 or 24 kHz WAV need `ffmpeg` on the server (the production image installs it). The key is read on the server only and never reaches the browser. Live runs have not been tested against a funded key yet: Meta billing was not active when this was written.

## Meta AI in Story Bible

Every model call goes through one file, `server/utils/model.ts`. The Meta Model API (`https://api.meta.ai/v1`, OpenAI-compatible) is called from the Story Bible server, never from the browser.

| Agent | What it does | Meta model | Meta API | Runs |
| --- | --- | --- | --- | --- |
| Extractor | Reads an imported document and proposes fact candidates, each with a quote. Nothing becomes canon until a person accepts it. | Muse Spark 1.3 | Chat completions (`/chat/completions`, JSON output) | Story Bible server |
| Rule checker | Tests a world rule against accepted canon and suggests `WORLD_RULE_VIOLATION` conflicts (labelled as model-suggested). | Muse Spark 1.3 | Chat completions | Story Bible server |
| Ask / Canon | Answers a question from accepted canon only, with citations; no evidence means `unknown`. | Muse Spark 1.3 | Chat completions | Story Bible server |
| Transcriber | Turns audio into text: recordings (voice-actor takes, table reads, interviews, voice notes) become read-only transcripts with a time on every passage (citations play "at 02:14"), and dictation fills the writer and Ask. Sends the project's entity names as recognition keywords. Script vs recording then flags changed or ad-libbed lines that contradict canon (deterministic rules, no model). | Muse Voice Transcribe 1.0 | Speech to text (`/asr/transcribe`, multipart WAV, ENDPOINTING turns, `keywords`) | Story Bible server (audio converted with ffmpeg) |
| Illustrator | Generates portrait and location images for wiki pages (editorial, never canon). | Muse Image 1.0 | Images (`/images/generations`) | Story Bible server |
| MCP bridge | Lets Muse Spark read canon and propose candidates through Story Bible's `/mcp` tools (16 tools, one write: `sb_propose_candidate`). A small script from Settings > Agents & API relays Muse's function calls to `/mcp`. Not yet run against a live Meta key. | Muse Spark 1.3 | Chat completions with function calling | User's machine (the script); `/mcp` runs on the server |
| Research | Answers real-world questions (science, history, crime scenes, period travel) with a verdict, sources whose quotes are checked on the fetched page, and numbers from deterministic calculators (orbits, light delay, moon phase, sunrise, calendars, time since death). A bounded multi-step agent on the server; results are research notes, promoted to canon only through review. Run live through an OpenAI-compatible gateway; not yet against a funded Meta key. | Muse Spark 1.3 | Responses API (`/responses`) with built-in `web_search` and function calling | Story Bible server |
| Critic | Gives a second opinion on each verified candidate in Review: keep / reject / needs edit, a reason (figurative, not stated in the passage, ambiguous time or place, duplicate of a canon fact, wrong subject) and one line why, plus a corrected fact for "needs edit". It reads the candidate, its source passage and nearby canon; it never sees a blocked candidate, never writes a quote and never changes a fact. Review filters and sorts by it and offers "Accept N the AI critic keeps" (still one human confirmation). | Muse Spark 1.3 | Chat completions (JSON output) | Story Bible server, in batches after extraction and on demand |
| Continuity | Checks a draft scene, a selected passage or lines typed in Ask against accepted canon. A bounded agent calls Story Bible's own MCP read tools step by step (`sb_get_entity`, `sb_search_facts`, `sb_get_fact`, `sb_get_timeline`, `sb_read_document`, `sb_check_facts`), then reports each finding: the sentence, the canon fact it contradicts or rests on (with its source quote), the rule-engine conflict behind it and a suggested fix that is never applied. The server checks every finding before it is shown. Every run, with each step, is on the Agent activity page. Run live through an OpenAI-compatible gateway; not yet against a funded Meta key. | Muse Spark 1.3 | Responses API (`/responses`) with function calling | Story Bible server |

Rows marked "in progress" are not in the app yet.

## Rules the app enforces

- **Human gate:** the model only proposes candidates. Nothing becomes canon without an explicit human decision.
- **Verbatim citations:** every canon fact has at least one evidence row whose quote appears word for word in a passage of an imported document. Hallucinated quotes are blocked.
- **Sources stay read-only:** imported documents (`.md`, `.txt`, or Word `.docx`, converted to text on upload with the original file kept) are never modified; a changed file becomes a new version and flags stale citations.
- **No evidence, no answer:** the answer is `unknown`. Change proposals, conflict candidates and possible review impact are three separate things; impact stays inside accepted canon, at most 2 hops, with path, evidence and rationale.

## Samples

- **Broken Tide:** original island story, 2 lore documents and 11 scenes, with planted contradictions and a guided tour.
- **Lantern Row:** three short documents with five preloaded sample canon facts and one planted conflict.
- **The Ashbell Pass:** 28 documents (about 22.5k words) with folders, NPCs and quests, for a larger-scale run. To try voice in recorded mode, drop `public/samples/harl-crier-take.wav` (a synthetic text-to-speech take of the town crier's lines, with one ad-libbed line) on the Library, open it and choose **Compare with a script** → "Dialogue: The Town Crier". Accept S05 first to see the ad-lib flagged against canon. In recorded mode only this file has a transcript.

`POST /api/demo/load` takes `{ "set": "broken-tide" | "lantern-row" | "ashbell-pass" }` and replaces the current project's data (admin and above).

## Connect an agent over MCP

1. Sign in, open **Settings > Agents & API** and create a token (shown once, bound to one project). Pick its level: **propose** (reads, checks and proposes; nothing it does becomes canon) or **full** (acts as you within your role; its decisions show as "via agent").
2. Point an MCP client at `http://localhost:3000/mcp` (Streamable HTTP) and send `Authorization: Bearer sb_...` with every request.
3. 38 tools: 16 canon and document tools (search facts, context pack, entities, timeline, `sb_ask`, `sb_check_facts`, conflicts, impact, ...) and 22 area tools that cover what a person does in the app (review, entities, changes, conflicts, documents, notes, library, research, continuity, export, ...). Team changes, tokens, sample loads and audio uploads stay in the app. Empty results mean `unknown` or "no impact found".

**Muse Code** connects directly; add this to `~/.config/muse/settings.json` and run `/mcp`:

```json
{
  "schema_version": 1,
  "mcp_servers": {
    "story-bible": {
      "transport": "streamable_http",
      "url": "http://localhost:3000/mcp",
      "headers": { "Authorization": "Bearer ${STORYBIBLE_TOKEN}" }
    }
  }
}
```

The settings page generates ready-made snippets with your token for Muse Code, the Muse Spark API (a small bridge script), Claude Code and Cursor.

## Architecture

Nuxt 4 (SSR pages and the Nitro API in one process), SQLite through Node's built-in `node:sqlite` with no ORM (file at `.data/storybible.db`), `nuxt-auth-utils` sealed-cookie sessions with studios, roles (owner, admin, editor, viewer) and projects. One middleware (`server/middleware/access.ts`) guards every content route and scopes each query to the current project. Documents are split into passages; model output passes through `server/utils/model.ts` and a single verbatim quote check before a human reviews it. `/mcp` exposes the same data to agents. `audit_events` is append-only.

## Probes

Probes drive a running server over HTTP with throwaway accounts. Start `pnpm dev --port 3000`, then:

```sh
node scripts/samples-probe.mjs http://localhost:3000
node scripts/isolation-probe.mjs http://localhost:3000
node scripts/mcp-probe.mjs http://localhost:3000
node scripts/research-probe.mjs http://localhost:3000
node scripts/continuity-probe.mjs http://localhost:3000
node scripts/calculators-check.ts
```

Others (`ashbell-probe`, `authoring-probe`, `docx-probe`, `library-probe`, `share-probe`, ...) are in `scripts/`; the first lines of each file say how to run it. The UI itself is checked in a browser, and the gates are `pnpm exec nuxi typecheck` and `pnpm build`.

## More

[ROADMAP.md](ROADMAP.md) lists what is not built yet. [docs/meta-api-notes.md](docs/meta-api-notes.md) is what we ran into building on the Meta Model API, with the recorded responses that show it and our suggestions. [AGENTS.md](AGENTS.md) describes the data model and invariants in detail.

## License

Story Bible is open source under the [GNU Affero General Public License v3.0 or later](LICENSE). You may self-host, change and share it; if you run a modified version as a network service, you must offer its users the source of that version.
