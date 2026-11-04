# Repository hygiene — 3 Nov 2026

The tracked tree contains no scratch logs, browser sessions, databases, dependency trees or build output. `.gitignore` covers runtime data, environment files, dependencies, build output, logs and local browser evidence. Check tracked paths with `git ls-files`; check ignore rules with `git check-ignore`.

No outstanding work markers were found in tracked source or fixtures. Probe and self-check scripts are discovered by [the check runner](../scripts/check-all.mjs); intentional manual tools are catalogued in [checks.md](checks.md). No dead script was identified for deletion. Relative Markdown links in the judge documentation resolve locally, and `git diff --check` passes.

A quick pattern scan of the tracked tree and every reachable historical text blob found no private-key headers, GitHub/provider tokens, AWS access IDs, long literal bearer values or long assigned credentials. This is a pattern scan, not proof that no secret exists. Staging hostnames are intentional and are not secrets. Re-run the scan on the final submission revision.

## Twenty largest tracked files

Sizes in bytes, from tracked files on 3 Nov. All have an application, sample or submission purpose; no stray large binary was found. Reproduce the ranking by checking file sizes from `git ls-files`.

| Bytes | Path |
| ---: | --- |
| 2,293,576 | `docs/pitch-deck.pdf` |
| 1,764,524 | `public/samples/harl-crier-take.wav` |
| 259,710 | `server/assets/sherlock-holmes/cover.jpg` |
| 238,176 | `pnpm-lock.yaml` |
| 178,454 | `public/og-landing.png` |
| 177,567 | `public/og-security.png` |
| 170,021 | `public/og-default.png` |
| 156,490 | `public/og-agents.png` |
| 147,463 | `server/assets/sherlock-holmes/candidates.json` |
| 83,910 | `public/shots/watson-card-light-1920.webp` |
| 82,834 | `public/art/story-world.webp` |
| 78,366 | `public/shots/review-light-1280.webp` |
| 77,920 | `public/art/pitch-wound.webp` |
| 75,708 | `public/shots/review-dark-1280.webp` |
| 72,118 | `public/shots/reader-light-1280.webp` |
| 70,302 | `server/assets/ashbell-pass/candidates.json` |
| 68,378 | `scripts/mcp-probe.mjs` |
| 68,218 | `public/shots/reader-dark-1280.webp` |
| 59,908 | `public/shots/voice-light-1280.webp` |

## Submission actions

The video (https://youtu.be/tb1EZ1d2VSk) and live app (https://canontracker.trythis.work) links are filled, and the filtered GitHub copy is public. Re-run the secret scan on what was pushed before the final submission. The draft is [submission.md](submission.md).

Live Meta availability, current billing/credits and the final published app/video are not verified by the offline gate. See [meta-api-notes.md](meta-api-notes.md) for dated live observations and [checks.md](checks.md) for reproducible local verification.
