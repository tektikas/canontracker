# Roadmap (planned)

CanonTracker today: stored source versions stay unchanged, the model only proposes, people decide what becomes canon, every canon fact carries a verbatim citation, and a proposed change shows its 1–2 hop impact before it ships.

Everything below is **not built yet**. These are proposed directions for studio workflows; they are not implemented features or delivery commitments. Each item builds on what already exists: facts with subject, time and citations, rule-based conflict checks, impact analysis and the MCP server.

## Next

### 1. Branching canon: facts that depend on player choices
Today a fact is either canon or not. Games need facts that are true only on one path: "If the player spares the smuggler, she lives", "In the bad ending the captain loses his memories".

- A fact can carry conditions, e.g. `requires: spared_smuggler = true`. A fact with no conditions holds on every path.
- Conflict checks compare only facts that can be true on the same path. Opposite facts on different paths are expected, not errors.
- Each ending gets its own consistency check. Agents can ask for canon under a given set of flags.
- Reviewers see the condition next to the fact, in plain words.

### 2. Project-level access
Today a studio member sees every project in the studio. Studios with several titles, or outside writers and translators, need narrower access.

- Owners and admins see every project. Editors and viewers see only the projects they are assigned to.
- The same rule applies to the web app, search, share links, API tokens and MCP agents.
- Existing members keep their current access when this ships, so nobody loses work.

## Later

### Series and episodic storytelling
- **Two timelines:** story time (D5 09:00) kept separate from release order (S01E04), for flashbacks and non-linear storytelling.
- **Canon "as of" an episode:** `sb_get_context_pack(topic, as_of: "S01E03")` returns only what has been revealed by that episode, so secrets from season 2 don't leak into a season 1 script.
- **Who knows what, and when:** track when each character learns something, separately from when the audience does (the brother learns the truth in S02E05; the audience sees it in S01E08). New checks: a character uses information before learning it; a scene refers to a secret before it is revealed.
- **Facts with a validity window:** "alive" holds until a given episode; a retcon is recorded with the episode that made it.
- **Setup and payoff:** open questions ("Who forged the key? Asked in S1E2, not answered yet"), listed at the end of a season.
- **Episode pack:** `sb_get_episode_pack("S01E04")` gathers the characters, open threads and earlier events a writer or an agent needs for one episode.
- **Parallel clocks and calendar eras:** day-zero and negative story days already work; planned work adds several timelines running at different speeds and dates across calendar eras.

### Games
- **Quest dependencies:** "Quest C comes after A and B", plus a check that the player can know a fact at the moment a quest needs it, instead of a single fixed clock.
- **Game script import with bulk checks:** Ink, Yarn Spinner, articy:draft, Twine, JSON and spreadsheets, with verbatim citations into dialogue lines, and an answer to "Which of these 4,000 dialogue lines contradict canon?"
- **Story vs. design data:** compare canon rules with game tuning data (the story says the curse doubles every night; the design sheet scales it by 1.5) to catch ludonarrative contradictions.
- **Game-specific entity workflows:** NPC, item, ability and quest entity types and editorial schedule fields already exist. Planned work adds structured NPC schedules that can be checked against quest states, plus links to voice actors and concept art.
- **Game versions and DLC:** canon by release, the impact of a DLC or patch on earlier canon, unannounced vs. marketing-safe facts, and sharing only the relevant slice with external translation or voice teams.

### Localization
- A glossary of approved translations for names, places and invented terms (spell names, factions, made-up words), exported for translators.
- A check that flags a translation using a different term than the approved one.

## One idea under all of this
Episodes, quest states and player choices are all the same question: "What is canon in this context?" Context means episode for a series or a novel, and quest plus player flags for a game. One context filter, shared by the web app, conflict checks, impact analysis and MCP agents, keeps the features above consistent rather than five separate systems.
