# Building on the Meta Model API: what we ran into

Notes for the Meta Model API team, from building CanonTracker during the Meta AI Developer Hackathon (27 Oct–4 Nov 2026). We use Muse Spark for extraction, the AI critic, continuity checks, research (web search plus our own function tools) and grounded answers; Muse Voice Transcribe for recordings and dictation; Muse Image for portraits and covers; and Muse Code connects to CanonTracker over MCP.

Most behaviour below was recorded against `https://api.meta.ai/v1` on 2 Nov 2026 and is kept as redacted fixtures in [`server/assets/meta-fixtures/`](../server/assets/meta-fixtures/) (each file has a `_note`, the request we sent and the status and body we got). `node scripts/meta-fake.mjs <port>` replays them and `node scripts/meta-contract-probe.mjs` runs the app against them, so every point here can be reproduced. Where a point comes from the docs rather than a recording, it says so.

## What worked well

- **OpenAI compatibility.** Chat Completions and Responses worked with our existing OpenAI-shaped client. Moving between providers was a base URL and a model id.
- **Strict structured output.** `response_format` `json_schema` with `strict: true` accepted our real schemas, including type arrays and `anyOf` with null (`chat-critic-schema.json`), and the output always parsed.
- **Web search and function tools in one Responses call** (`responses-search-and-function-turn1.json`). One request can search the web and then call our calculators.
- **Stateless agents.** `store: false` with `include: ["reasoning.encrypted_content"]`, replaying every output item on the next turn, worked across web-search and function-call turns (`responses-stateless-turn2.json`, `agent-stateless-search-turn2.json`).
- **Voice transcription works without chat billing.** Muse Voice Transcribe answered while Chat Completions still returned 402, which let us build and test the voice features early. Entity names passed as `keywords` helped with invented names.
- **Muse Code speaks MCP** (`streamable_http` with headers). CanonTracker's MCP server connected with a few lines of settings and no adapter.

## Things we ran into

Each item: what we expected, what happened, what we did, and a suggestion.

1. **Billing state.** Chat returned `402 billing_not_configured` for days while voice worked. When a card was added, the hackathon credits were still not applied (as of 3 Nov). *We did:* built a recorded mode and contract fixtures so development never waited on billing. *Suggestion:* show credit status on the dashboard, and say in the 402 body which step is missing.

2. **Reasoning effort defaults to high.** With no `reasoning_effort` / `reasoning.effort`, the response reports effort `high` (`agent-stateless-search-turn1.json`). For short batch classifications (our critic reads 3–5 candidates per call) that is slow and spends output tokens. `"none"` is a 400. *We did:* send an explicit effort on every call (critic: `low` for batch readings, `medium` for second readings) and record the effort and tokens per call. *Suggestion:* document the default per model next to the price, and consider accepting `none` (or `minimal`) wherever `json_schema` is used.

3. **`tool_choice` accepts only `"auto"`.** `"required"` returns 400 with `param: tool_choice` (`error-bad-param.json`; the docs say the same). OpenAI-compatible agent code often forces a tool on the first step. *We did:* never set `tool_choice`; nudge with instructions instead. *Suggestion:* support `"required"` and a named function, or list this first in the compatibility notes.

4. **`max_tool_calls` also limits function calls in practice.** The docs say it caps built-in tools only. With `max_tool_calls: 2`, `web_search` and one function tool, the model used both calls on `web_search` (search, then open_page) and then answered "no further tool calls are available" instead of calling our function (`agent-stateless-search-turn1.json`). *We did:* budget it ourselves: searches left plus a per-step allowance for our calculators, and drop `web_search` from the tool list once the search budget is spent. *Suggestion:* either make it built-in only as documented, or document that it is shared, ideally with separate budgets per tool type.

5. **`previous_response_id` cannot be combined with encrypted reasoning.** `include: ["reasoning.encrypted_content"]` plus `previous_response_id` is a 400 on `include` (`error-responses-bad-combo.json`; also in the docs). *We did:* went fully stateless (`store: false`, replay every item). *Suggestion:* a short "stateful vs stateless agents" page with one worked example each.

6. **Commentary messages mixed into the output.** A Responses turn with tools can return `message` items with `phase: "commentary"` between reasoning and tool calls (`responses-search-and-function-turn1.json`); the final answer is a message without a phase. Early on, our research answers included the commentary text. *We did:* take the last message that is not commentary. *Suggestion:* document `phase` on the Responses output page.

7. **Citations are not always annotations.** With `web_search`, the final message sometimes has `url_citation` annotations and sometimes `annotations: []` with URLs only in the text (`responses-search-and-function-turn2.json`). *We did:* fetch every cited page ourselves and check the quoted words before calling a claim verified; anything else is shown as unverified. *Suggestion:* make annotations reliable when `web_search` ran, or say when they are omitted.

8. **Chat tool calls come with text.** On Chat Completions, `finish_reason: "tool_calls"` came with a non-empty `message.content` next to `tool_calls` (`chat-tools-turn1.json`), and the next turn must echo that whole assistant message or it is a 400 (per the docs and the cookbook). *We did:* echo the assistant message unchanged, `refusal: null` included (`chat-mcp-bridge-turn2.json`).

9. **A tiny `max_output_tokens` returns no message.** At the minimum of 16 the response is HTTP 200, `status: "incomplete"`, `incomplete_details.reason: "max_output_tokens"`, and the output holds only a reasoning item (`responses-max-output-incomplete.json`). Reasoning spends the budget before any text. *We did:* treat `incomplete` as a failure shown to the person, never as an empty answer. *Suggestion:* say in the docs that reasoning counts against `max_output_tokens`, with a sensible minimum for reasoning models.

10. **The background body cap was not enforced.** The docs give a 1 MiB cap for `background: true`; a ~1.1 MB body was queued normally (`responses-background-over-1mib-accepted.json`). Harmless for us, but a client that splits work to respect the cap can't rely on it either way.

11. **Image `size` sets the aspect ratio, not the size.** `512x512` came back as 1600×1600; `1024x512` as 2240×1120 (`images-b64.json`, `images-url.json`). The default `b64_json` body was 1.36 MB for one image. The docs do say the returned size differs. *We did:* resize on our side and store WebP. *Suggestion:* return the actual width and height in the response.

12. **Voice transcription is its own shape.** `POST /v1/asr/transcribe` takes multipart `request` (JSON) and `audio`, not the OpenAI `/audio/transcriptions` shape; input must be WAV (mono, 16-bit PCM, 16 or 24 kHz), at most 10 minutes per file. In the default `PUSH_TO_TALK` mode, `turns` came back empty, so there were no timestamps; `ENDPOINTING` gave turn times; `DIARIZATION` added speakers but gave coarser turns in our tests. Timestamps are turn-level only. *We did:* convert every upload with ffmpeg, send ≤ 9.5-minute chunks and shift turn times back, use `ENDPOINTING`. *Suggestion:* accept common formats (mp3, m4a, webm) server-side, document which mode returns turns, and consider word-level timestamps; script-vs-recording checks need them.

13. **No remote MCP for the Muse Spark API.** Muse Code connects to MCP servers, but the Model API itself only takes function tools. *We did:* ship a small bridge script (Settings → Agents & API) that turns our MCP tools into function tools for Muse Spark. *Suggestion:* an MCP tool type on Responses, as Muse Code already speaks MCP.

14. **Error bodies.** An unknown model is a clear `404 model_not_found` (`error-bad-model.json`), but 400s come with `code: null` and only `param` set (`error-bad-param.json`, `error-responses-bad-combo.json`). *Suggestion:* a stable `code` on every 4xx so clients can branch without parsing messages.

15. **Chat can't carry reasoning across turns.** Per the docs, `reasoning_content` is redacted for external keys, so multi-step agents have to use Responses. We built every agent (research, continuity) on Responses for that reason.

16. **Voice `keywords` are limited to 30 characters.** The speech-to-text page (dev.meta.ai/docs/speech-to-text, checked 3 Nov 2026) gives no limit on the number or length of `keywords`; it only says they bias recognition. Live, a request whose 5th keyword was 36 characters (a wiki page titled "a husband and father of two children") was refused with 400 "ASR keyword 5 exceeds the maximum length of 30 characters", so one long page name stopped a whole project from transcribing. Not kept as a fixture (it came from a recording session, not the contract run). *We did:* send only names of at most 30 characters (a page with a long title still contributes its short aliases), deduped, at most 100; the count limit is unknown (about 30 keywords were tested live). *Suggestion:* document both limits, and ignore or truncate an over-long keyword instead of failing the request.

## Live test on Muse, 3 Nov 2026

Once the credits were applied we ran the whole product live on `muse-spark-1.3` and its contributor variant (`muse-spark-1.3-contributor`, used for public-domain and synthetic test data only): 592 server-side model calls plus 20 Muse Code calls between 19:07 and 20:35 UTC, **0 API failures, no 429s**. Extraction runs at `reasoning_effort: low` (see item 2; at the default, high, whole chapters ran past our 60 s timeout).

| Test | Result |
|---|---|
| Quotes | 1,319 extracted candidates, **0 invented quotes**; verified-quote rate 98.8–100% (the rest are real text with an added quotation mark, which verification blocks) |
| The Ashbell Pass (28 docs, planted contradictions) | 233 candidates, all quotes verified; 4 of 6 planted conflicts found (C1–C4), the approximate-time false alarm and the post-merge conflict raised as designed; 2/2 unknowns |
| Sherlock Holmes (31 docs, ~127k words) | 418 candidates in 4.5 min (4 documents at a time); Watson's wound found as shoulder vs leg, the slip readers have argued about for 130 years |
| Public-domain stress test: Oz (3 books) and Alice (2 books) | 93 chapters, ~175k words, 1,086 candidates, verified-quote rate 99.3% / 98.8% |
| Ask | 5/5 answerable questions right with real citations; 5/5 unanswerable ones `unknown` |
| Continuity (agent with our MCP tools) | contradiction, dependency and new-material drafts reported correctly (one new finding dropped by our own grounding) |
| Research (web search + calculators) | 8/8 genre questions answered on Muse, including a follow-up question and an honest `unknown` |
| AI critic | quality gate passed on both synthetic samples (every planted fact kept, figurative "sister" rejected) |
| Muse Code over MCP | 3/3 canon questions answered correctly; all 14 cited fact ids real and supporting |

What Muse missed, and what we changed:
- It missed some world rules stated in passing (the Ashbell bell rule) and treated changing states ("Ves's voice is gone", a broken knee) as single-valued details, which raised false "same detail, two answers" alerts. Prompt `extract-v5` now records a state something goes into as an event with its time.
- Name identity: "Oz" and "the Wizard" filed as two people, three different Queens as one. CanonTracker now suggests "Possibly the same" pages for a person to merge; it never merges on its own.
- A big project's world-rule scan (34 rules) took 17 minutes one call at a time; rule checks now run four at a time.
- A model sometimes reports the same finding twice; the continuity report now keeps it once.
- One chapter's extraction plus the AI critic takes about a minute live, more than a page should wait and close to the 100 s a proxy such as Cloudflare allows a request. Uploads from the web app now store the file and answer at once; the AI reads it in the background. Live check, 4 Nov 2026, `muse-spark-1.3-contributor` via the Meta Model API: 4 Wizard of Oz chapters (1.2k–3.7k words) uploaded in one drop were answered in 80 ms; each run (extraction + critic) took 58–96 s, the fourth waited 58 s for a slot (3 at a time), all done 2 min 12 s after the drop with 65 candidates, 0 failed calls.

## Sample recordings and book uploads, 3–4 Nov 2026

The public-domain samples ship with recorded Muse runs, so a load replays them in seconds. Each `candidates.json` has a `_note` with how it was made. All runs below went through the Meta Model API at `reasoning_effort: low`.

- **Sherlock Holmes** (3 Nov, `muse-spark-1.3`, prompt extract-v4): 418 candidates; after a sample load 409 are pending (repeats skipped) and 1 is blocked (a quote that is not verbatim).
- **Oz** (4 Nov, `muse-spark-1.3-contributor`, extract-v5, 4 documents at a time, the sample's 36 wiki pages passed as the names the project uses): 69 calls in 539 s, 938 candidates; after a load 859 pending (79 repeats skipped), 3 blocked (two quotes with an added quotation mark, one one-word chant), 856 canon after "accept verified". Passing the known names fixed the earlier "Oz" vs "the Wizard" and "Nome King" vs "Roquat" splits. Live world-rule scan: 29 rules, 57 calls, 130 s, 2 soft violations: "The sands of the desert destroy life on contact" (Ozma of Oz, 1907) against the Griffin lying exhausted on the desert (Land of Oz, 1904), Baum's real retcon of the Deadly Desert; and "Oz can take on any form he wishes" (a character's belief, accepted as a rule) against "The Wizard of Oz is a humbug". Ozma's origin retcon is not found: canon has how the Wizard brought her to Mombi, but no Ozma of Oz fact on how she was lost.
- **Alice** (4 Nov, same setup, 37 wiki pages): 261 candidates; after a load 245 pending (16 repeats skipped), 1 blocked ("Shan't," is in the text but shorter than the minimum quote), 244 canon. Live world-rule scan: 8 rules, 8 calls, 31 s, no violation. Muse filed the Red Queen's "all the running you can do to keep in the same place" under "Wonderland"; it is the Looking-glass country.
- **A whole book in one file** (4 Nov, `muse-spark-1.3-contributor`, uploaded through the web app): Dracula (Gutenberg #345) as one `.txt` split into 27 chapters plus front matter, all 28 read in 699 s, 348 candidates, 0 failed calls. The same book as a `.docx` (heading styles): the same 28 parts, 675 s, 317 candidates, 0 failed. Re-uploading the `.txt` with one sentence of chapter 7 edited (and LF instead of CRLF line ends): 1 new version, 27 unchanged.
- **Document kind detection** (4 Nov, same model): `harbour-notes.md` holding a scene was filed as a scene, not lore; `chapter-12.md` holding a glossary was filed as lore.

## Summary of suggestions

1. Show credit and billing state clearly; name the missing step in a 402.
2. Document default reasoning effort per model; allow `none`/`minimal` with structured output.
3. Support `tool_choice: "required"` and named functions.
4. Make `max_tool_calls` match the docs, or document it as shared.
5. Document `phase: "commentary"` and keep `url_citation` annotations reliable.
6. Return actual image dimensions.
7. Voice: accept common audio formats, document modes that return turns and the `keywords` limits, consider word timestamps.
8. An MCP tool type on the Responses API.
9. A stable `code` on every error.
