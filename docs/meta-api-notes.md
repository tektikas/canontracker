# Building on the Meta Model API: what we ran into

Notes for the Meta Model API team, from building Story Bible during the Meta AI Developer Hackathon (27 Oct–4 Nov 2026). We use Muse Spark for extraction, the AI critic, continuity checks, research (web search plus our own function tools) and grounded answers; Muse Voice Transcribe for recordings and dictation; Muse Image for portraits and covers; and Muse Code connects to Story Bible over MCP.

Most behaviour below was recorded against `https://api.meta.ai/v1` on 2 Nov 2026 and is kept as redacted fixtures in [`server/assets/meta-fixtures/`](../server/assets/meta-fixtures/) (each file has a `_note`, the request we sent and the status and body we got). `node scripts/meta-fake.mjs <port>` replays them and `node scripts/meta-contract-probe.mjs` runs the app against them, so every point here can be reproduced. Where a point comes from the docs rather than a recording, it says so.

## What worked well

- **OpenAI compatibility.** Chat Completions and Responses worked with our existing OpenAI-shaped client. Moving between providers was a base URL and a model id.
- **Strict structured output.** `response_format` `json_schema` with `strict: true` accepted our real schemas, including type arrays and `anyOf` with null (`chat-critic-schema.json`), and the output always parsed.
- **Web search and function tools in one Responses call** (`responses-search-and-function-turn1.json`). One request can search the web and then call our calculators.
- **Stateless agents.** `store: false` with `include: ["reasoning.encrypted_content"]`, replaying every output item on the next turn, worked across web-search and function-call turns (`responses-stateless-turn2.json`, `agent-stateless-search-turn2.json`).
- **Voice transcription works without chat billing.** Muse Voice Transcribe answered while Chat Completions still returned 402, which let us build and test the voice features early. Entity names passed as `keywords` helped with invented names.
- **Muse Code speaks MCP** (`streamable_http` with headers). Story Bible's MCP server connected with a few lines of settings and no adapter.

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

## Summary of suggestions

1. Show credit and billing state clearly; name the missing step in a 402.
2. Document default reasoning effort per model; allow `none`/`minimal` with structured output.
3. Support `tool_choice: "required"` and named functions.
4. Make `max_tool_calls` match the docs, or document it as shared.
5. Document `phase: "commentary"` and keep `url_citation` annotations reliable.
6. Return actual image dimensions.
7. Voice: accept common audio formats, document modes that return turns, consider word timestamps.
8. An MCP tool type on the Responses API.
9. A stable `code` on every error.
