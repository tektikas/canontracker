# Checks

Use Node 24 and pnpm 12.16.1, install dependencies, then run:

```sh
pnpm install --frozen-lockfile
pnpm check
```

The runner is [scripts/check-all.mjs](../scripts/check-all.mjs). It runs serially and exits nonzero if any check fails. It requires `ffmpeg`, `ffprobe`, `unzip`, `xmllint`, `openssl`, `ss` (Linux iproute2) and Git. Migration fixtures read historical schemas, so use a full clone, not a shallow archive.

`CHECK_PORT=4700 pnpm check` selects the app port; the next port is used for self-starting migration probes and then the Meta fixture server. Defaults: 4650 and 4651. Both must be free. The image-fetch probe additionally creates its own ephemeral loopback TLS/proxy fixtures.

The runner creates a temporary working directory for each production server, supplies a random test session password, forces recorded mode, and discards inherited `NUXT_*` settings. It never starts a server against the repository's `.data/`. Each HTTP suite gets a fresh server and database so rate limits cannot spill between suites. Processes started by the runner are stopped in cleanup, including on SIGINT/SIGTERM. Logs stay under the printed temporary path; temporary app data is removed after success and retained after failure for inspection.

## Coverage

| Gate | What runs |
| --- | --- |
| Types and production build | `pnpm exec nuxi typecheck`, `pnpm build` |
| Offline self-checks | Every `scripts/*-check.*` (automatically discovered) |
| HTTP probes on production | Every `scripts/*-probe.mjs` except the special cases below: API hardening, all six samples, authorship, canon/review, version re-check, roles/isolation, conversations, research, continuity, critic, entities/types, merge, library, search, tasks, profile, save drain, Word, voice, image uploads, sharing, EPUB and help |
| Merge fuzzing | `merge-fuzz.mjs` with seed 74 and 100 operations, database invariants after operations |
| Migration/explicit defaults | `severity-probe.mjs migrate` and `explicit`, `image-upload-probe.mjs migrate`, `entity-types-probe.mjs migrate`, using the second port serially |
| Fetch safety | `image-fetch-probe.mjs`: local TLS/DNS/proxy interception, size/deadline and SSRF checks; its optional public connectivity smoke test is reported separately by the probe |
| Meta API contracts | `meta-contract-probe.mjs` against a production app in meta mode pointed only at local `meta-fake.mjs`; replays redacted real Meta envelopes and errors |
| Research runtime replay | `research-replay.mjs` against the same fixture service, using the real runtime with test-only Nitro globals and an in-memory trace |

These tests use real HTTP routes, SQLite and stored sample shapes. Recorded model output, local provider fixtures and runtime stubs are **not live Meta verification**. The gate does not require a live key or make a live Meta request. Browser QA is separate: use the `playwright-cli` skill, headless, at 1280×800 and 390×844 and keep evidence outside Git.

## Individual checks

Against your own disposable production instance, replace `<url>`, `<cwd>` and `<db>` with that instance's URL, working directory and `.data/storybible.db`. Never use real application data for probes.

```sh
node scripts/samples-probe.mjs <url>
node scripts/guest-probe.mjs <url>
node scripts/guest-clone-probe.mjs <url> <db>
node scripts/isolation-probe.mjs <url> <cwd>/.data
node scripts/ashbell-probe.mjs <url> <db>
node scripts/sherlock-probe.mjs <url> <db>
node scripts/mcp-probe.mjs <url> <db>
node scripts/recheck-probe.mjs <url> <db>
node scripts/share-probe.mjs <url> <db>
node scripts/docx-probe.mjs <url> <cwd>
node scripts/merge-fuzz.mjs <url> <db> 74 100
```

The remaining normal HTTP probes take just `<url>`. `image-fetch-probe.mjs` takes no URL. `severity-probe.mjs` requires `migrate|explicit <free-port>`. Image upload and entity types each have both an HTTP mode and `migrate <free-port>`. The full runner supplies every argument, including the database path needed for assertions that would otherwise be optional.

Common targeted regressions (HTTP probes take `<url>`):

- `review-probe.mjs`: verified acceptance, blocked quotes, fingerprints and repeat requests.
- `save-drain-probe.mjs`: autosave/drain ordering, failure recovery and real draft writes through a VM seam; no browser.
- `profile-probe.mjs`: profile/password changes, isolation and audit.
- `tasks-probe.mjs`: review tasks, state transitions and audit.
- `export-probe.mjs`: EPUB XML validity and scoped covers.
- `predicate-check.ts`: offline Add fact field/time suggestions; run directly with Node 24.

## Package scripts

`dev` starts Nuxt development; `build` creates the Node/Nitro application; `preview` starts that built application locally. `postinstall` prepares Nuxt types. `generate` produces a static prerender for inspecting public pages; it cannot host the authenticated application or API. Use the production server command in the README to run CanonTracker. `check` is the isolated gate above.

## Other scripts (intentional manual tools)

- `*-live.mjs`: credentialed recording/quality experiments for continuity, critic, research and voice. They are outside the offline gate; some write recordings when explicitly requested. `critic-gold.mjs` is the shared quality gate used by critic recording and its probe.
- `sherlock-corpus.mjs`, `gutenberg-corpus.mjs <oz|alice>`, `sample-record.mjs <set>`: rebuild the public-domain corpora and record a sample's extraction (credentialed, live); source/provenance is in each sample's `SOURCES.md` and `candidates.json` `_note`. They are not startup steps.
- `canon-scale-seed.mjs`: opt-in large-canon development dataset; not part of a judge's quick start.
- `recheck-timing.mjs`: opt-in citation re-check performance measurement; takes an instance URL, passage count and citation count, then creates a throwaway project.
- `meta-fake.mjs`, `image-stub.mjs`: local provider stand-ins for contract/manual integration checks; never production defaults. The image stub supports manual image-flow experiments; it is not a gate dependency.
- `scripts/brand/*`: screenshot, artwork optimization, icon, Open Graph and pitch rendering/generation tools. See [scripts/brand/README.md](../scripts/brand/README.md); these can need additional local rendering/image tools and are not application runtime dependencies.

All check/probe scripts are discovered by filename or called explicitly by the runner; manual utilities above remain documented instead of being mistaken for dead scripts.
