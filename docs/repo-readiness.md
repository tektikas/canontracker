# Submission readiness audit — 3 Nov 2026

Card c74; baseline `dd9e28a`. No application routes, model prompts or canon logic changed. No push, release or repository visibility change was made.

## Fresh clone and startup

Cloned the current branch with full history and no hardlinks into `/tmp/storybible-c74-fresh`. The GitHub mirror was not used: publication is an owner action at submission. Tested Node **24.22.2**, pnpm **12.16.1** (matching `mise.toml` and `packageManager`).

- `pnpm install`: passed (616 packages, Nuxt prepare completed). Also ran `pnpm install --frozen-lockfile` in the worker checkout successfully.
- Copied `.env.example` before dev, as requested by the card: with its blank session password, sign-up returned 500 and `samples-probe` failed at sign-up. This is a configuration trap, not a sample failure. The revised README creates `.env` from the example with a generated 48-character password, without printing it. The example now explicitly requires filling the password.
- With that setup, `pnpm dev --port 4650`, health and `samples-probe` passed (Lantern Row, Broken Tide and Ashbell). The production Sherlock probe separately loaded and exercised the fourth sample.
- `pnpm exec nuxi typecheck`: exit 0. `pnpm build`: exit 0, **Build complete in 13.5s**, 9.59 MB server output. All production probes passed on localhost with isolated temporary databases.
- Rebuilt after testing static generation, then started `HOST=localhost PORT=4650 node --env-file=.env .output/server/index.mjs` successfully. This proves the README production environment-loading path. `pnpm preview --port 4650 --host localhost` also answered health with schema 15 and recorded mode.
- `pnpm generate`: exit 0, **Prerendered 136 routes**, **Generated public .output/public**. Documented that this static output cannot host the authenticated app/API; the Node production build is required.
- `postinstall` ran successfully during install; the new `check` command runs the serial production gate described below.

The original README's literal `<this repo>` clone placeholder was replaced with `https://github.com/ugorur/storybible`. Empty session-password behaviour and production `.env` loading are now explicit. The public GitHub URL itself is **not verified** until the owner publishes the mirror.

## Verification evidence

First full clone gate: `node scripts/check-all.mjs`, exit 0; final line **All checks passed**. Logs: `/tmp/storybible-check-NkWyIG/logs`; summary `/tmp/c74-full-gate.log`. This includes:

- Typecheck and production build, eight offline self-checks and all 28 normal HTTP probe scripts.
- All sample beats: Ashbell 28 docs / 22,548 words; Sherlock 31 docs / 126,658 words / 1,116 candidates / 62 blocked. Lantern Row's preloaded canon and Broken Tide's human-review queue remained distinct.
- API hardening, cross-studio/role isolation, all MCP panel tools (including the database-backed assertions), library, authoring, review, critic quality, merge, re-check, Word, voice, conversations, research, continuity, tasks, profile, search, sharing, EPUB and help.
- Seed 74 merge fuzzing: **all 100 steps passed**. Severity migration and explicit defaults, image-upload migration and entity-type migration all passed.
- Local image-fetch TLS/proxy fixtures and the probe's public PNG smoke passed. No live Meta call was made.
- Meta contract production app against `meta-fake`: **all meta contract checks passed**. Research runtime replay: **all research replay checks passed**.

Headless `playwright-cli`, named session `c74`, confirmed `headed: false`: signed up through the UI, created a studio and project, loaded Ashbell from onboarding and opened Review. Verified the quoted candidate, verbatim-match badge, critic advice and explicit decision controls at 390×844 and 1280×800. Screenshots: `.orka-evidence/c74-readme-mobile.png`, `.orka-evidence/c74-readme-desktop.png` (ignored, retained locally). Console: **0 errors, 0 warnings**. Browser closed; manually started dev/prod/preview processes stopped by their own PIDs. This was a quick-start smoke check, not a full UI audit.

Final worker-checkout command: `pnpm check`, **exit 0**, final line **All checks passed. Logs: /tmp/storybible-check-kou3Fc/logs**. This repeated the complete gate through the package script. Summary: `/tmp/c74-final-gate.log`. Temporary app data was removed by the runner; both slot ports were free after completion.

Logs for startup: `/tmp/c74-fresh-install.log`, `/tmp/c74-fresh-dev-samples.log` (before), `/tmp/c74-fresh-dev-samples-after.log`, `/tmp/c74-fresh-production-build.log`, `/tmp/c74-readme-production.log`, `/tmp/c74-generate.log`, `/tmp/c74-preview.log`.

## Documentation and hygiene findings

- README now leads with a short pitch, hackathon build dates and reused-CI disclosure, all four Meta integrations, human gate, correct clone URL, quick start, `VIDEO_URL`/`LIVE_URL`, real screenshots, architecture, checks and license. Removed stale UI labels, three-sample assumptions, funded-key assertions and the obsolete 16-tool/one-write MCP description. Kept recording provenance explicit, including the non-Meta Sherlock extraction.
- AGENTS now includes Sherlock in the demo-load contract, 38-tool/current token semantics, version-preserving edits to uploaded documents, the Responses runtime, newer schema tables, existing fingerprint/stale-draft checks and the full check command. Current billing/availability is no longer inferred from old errors. Dated live observations remain in `docs/meta-api-notes.md`; this card did not make a live billing check.
- ROADMAP is explicitly planned. Negative days/day zero are already implemented, so that item now concerns parallel clocks/calendar eras. Removed an unsupported studio-feedback assertion from the roadmap introduction.
- Added [checks.md](checks.md) with prerequisites, all probe argument shapes, isolation/cleanup, replay limitations and a catalog of manual tools. Previously unreferenced probes are now discovered by the runner; scale seeding and re-check timing are intentional documented manual utilities. No dead script was identified for deletion.
- Corrected stale illustration/screenshot counts in `scripts/brand/README.md` (19 illustrations, 118 screenshots).
- `.gitignore` already covered runtime data, environment files, dependencies, build output, logs, `.playwright-cli/` and `.orka-evidence/`; `git check-ignore` confirmed representative files. No ignore additions were needed. No tracked scratch files, logs, local sessions, databases or dependency trees were found.
- Marker audit: **no TODO/FIXME work markers found** in the tracked baseline tree, including fixtures. No trivial marker cleanup was needed.
- Quick secret-pattern scan of the current tree and every reachable historical text blob: **2,063 text blobs; zero pattern hits** for private keys, GitHub/provider tokens, AWS IDs, long literal bearer values and long assigned credentials. No values were printed. This is a pattern scan, not proof of absence or a live credential check. Staging hostnames were intentionally retained. Raw scan summary: `/tmp/c74-hygiene.log`.
- Repeated the scan after staging the new files: zero tree/history pattern hits; no script lacked a reference outside itself (dynamic probe discovery plus the manual catalog). Summary: `/tmp/c74-hygiene-final.log`. The audit's own mention of work markers is not an outstanding code task.
- Relative Markdown links in the changed judge docs resolve locally; `git diff --check` passed. The root CI deploy pipeline and public-domain credits were retained.

## Twenty largest tracked files

Baseline tracked tree: **673 files, 13,857,949 bytes**. All large files have an application, sample or submission purpose; no stray large binary was found. Byte sizes below are before this documentation change; the largest-file ranking is unaffected by it.

| Bytes | Path |
| ---: | --- |
| 2,293,576 | `docs/pitch-deck.pdf` |
| 1,764,524 | `public/samples/harl-crier-take.wav` |
| 374,800 | `server/assets/sherlock-holmes/candidates.json` |
| 259,710 | `server/assets/sherlock-holmes/cover.jpg` |
| 238,176 | `pnpm-lock.yaml` |
| 178,454 | `public/og-landing.png` |
| 177,567 | `public/og-security.png` |
| 170,021 | `public/og-default.png` |
| 156,490 | `public/og-agents.png` |
| 83,910 | `public/shots/watson-card-light-1920.webp` |
| 82,834 | `public/art/story-world.webp` |
| 78,872 | `public/art/pitch-door.webp` |
| 78,366 | `public/shots/review-light-1280.webp` |
| 77,920 | `public/art/pitch-wound.webp` |
| 75,708 | `public/shots/review-dark-1280.webp` |
| 72,118 | `public/shots/reader-light-1280.webp` |
| 70,302 | `server/assets/ashbell-pass/candidates.json` |
| 68,378 | `scripts/mcp-probe.mjs` |
| 68,218 | `public/shots/reader-dark-1280.webp` |
| 59,908 | `public/shots/voice-light-1280.webp` |

## Remaining submission actions and limits

Owner fills `VIDEO_URL` and `LIVE_URL`, publishes the GitHub mirror and verifies public access at submission. [submission.md](submission.md) contains the concrete draft. Live Meta availability, current billing/credits and the final published app/video are **not verified** by this offline card. No new application bug was found in the completed gates; the empty session-password setup trap was fixed in the instructions. The in-flight c73 files were not touched.
