import type { HelpPage } from './types'

export default [
  {
    slug: 'candidates-and-canon',
    group: 'concepts',
    title: 'Candidates and canon',
    summary: 'The AI and agents only propose candidates. A fact becomes canon when a person accepts it, and every decision keeps a name.',
    sections: [
      {
        title: 'The human gate',
        text: 'CanonTracker keeps two kinds of fact apart. A candidate is a proposal, drawn in pencil. Canon is what your team accepted, drawn in ink. Nothing becomes canon without a person deciding it, and that person\'s name stays on the decision.',
        points: [
          'The AI reads your sources and proposes candidates. It never accepts anything.',
          'Conflict checks, impact analysis, Ask in Canon mode and continuity checks read accepted canon only, so a candidate can\'t cause or hide a problem until someone accepts it.',
          'Deciding is for editors, admins and owners. Viewers can read the queue but not decide. See [Roles and permissions](/help/roles).',
        ],
      },
      {
        title: 'Where a fact can be',
        points: [
          'Pending: waiting in [Review](/help/review). Accept it with **Accept**, fix it first with **Edit & accept**, or turn it down with **Reject…** and a reason.',
          'Canon: accepted. It shows on [Canon](/help/canon), on entity pages, in the graph and timeline, and in exports.',
          '**Rejected**: kept for the audit trail but never part of canon. Review lists rejected candidates with who rejected them and why.',
          '**Superseded**: an older version of a canon fact that an applied change replaced. It is kept, never deleted, and listed on the **Superseded** tab of Canon. See [Change impact](/help/change-impact).',
        ],
      },
      {
        title: 'Where candidates come from',
        points: [
          'AI extraction: every imported or saved document is read by the AI, and its candidates go to Review marked "Proposed by AI". **Re-extract** on a document runs it again and adds only candidates the project doesn\'t have yet.',
          'By hand: select words in a source, choose **Add fact**, then **Add to canon** (you are the one deciding) or **Send to review** (a teammate decides).',
          'Agents over MCP: a token\'s proposals arrive in Review with an **Agent proposal** badge and the person the token belongs to. See [Agents & API](/help/agents-api).',
          'Research: **Promote to a candidate** on a research note saves the note as a read-only source and sends a pending candidate quoting it. See [Research](/help/research).',
          'Continuity checks: a finding canon doesn\'t cover yet can be sent with **Send to review**.',
        ],
      },
      {
        title: 'Sample canon',
        text: 'Some sample projects come with facts already in canon. They carry a **Sample canon (preloaded)** badge: their quotes are verified against the sources, but no person reviewed or decided them. On Canon you can filter them apart with the origin filter.',
      },
      {
        title: 'Agents propose, people decide',
        text: 'An agent token is either **Propose only** or **Full access**. A propose-only token can read, check and propose; nothing it does becomes canon. A full-access token can also make editorial edits as the person who made it (documents, pages, notes, the Library), marked "via agent" in the audit log. Neither can accept, reject or edit a candidate, apply a change, judge a conflict or merge pages: a person decides in CanonTracker. Decisions made through an agent before this rule still show "via agent".',
      },
    ],
    related: ['review', 'canon', 'reader', 'evidence', 'agents-api', 'glossary'],
    keywords: ['pending', 'accept', 'reject', 'human gate', 'proposal', 'pencil', 'ink', 'origin', 'via agent', 'sample', 'superseded'],
  },
  {
    slug: 'evidence',
    group: 'concepts',
    title: 'Evidence and verbatim quotes',
    summary: 'Every canon fact rests on a quote that appears word for word in a source passage. A quote that isn\'t there blocks the fact.',
    sections: [
      {
        title: 'One rule: the words must be in the source',
        text: 'Each fact cites at least one passage of a document with a quote. CanonTracker checks that the quote appears in that passage word for word before the fact can become canon. A verified citation shows **Verbatim match**; one that fails shows **Quote not found in source**.',
        points: [
          'The check is the same everywhere: AI extraction, **Add fact**, agents over MCP, research and continuity.',
          'A fact without verified evidence can\'t become canon, and Ask answers "unknown" when no canon fact covers a question. CanonTracker never invents a source or a quote.',
          'Imported documents are never changed. A citation points at one version of a document; see [Versions and re-check](/help/versions-and-recheck).',
        ],
      },
      {
        title: 'What may differ',
        text: 'Writers retype quotes, and editors change typography, so the check ignores a few things. The citation always stores the source\'s exact characters, not the ones you typed.',
        points: [
          'Curly and straight quote marks.',
          'Dashes: an em dash, an en dash and `--` all match, with or without spaces around them.',
          'An ellipsis character and three dots.',
          'Line breaks and runs of spaces.',
          'Markdown emphasis marks around words, such as `*word*` or `**word**`.',
        ],
      },
      {
        title: 'What is refused',
        points: [
          'A quote that isn\'t in the passage, with any other word changed, added or missing.',
          'A quote that crosses a blank line: it must come from one paragraph.',
          'A quote shorter than 8 characters, which is too short to back a fact.',
        ],
      },
      {
        title: 'Blocked candidates',
        text: 'Sometimes the AI quotes a sentence that isn\'t in the source. In Review that candidate shows **Blocked**, and **Accept** and **Edit & accept** are turned off. Reject it. If the fact is true, select the real sentence in the source and use **Add fact**. The AI critic is never asked about blocked candidates, and "Accept all … verified" skips them.',
      },
    ],
    related: ['candidates-and-canon', 'review', 'reader', 'versions-and-recheck', 'glossary'],
    keywords: ['quote', 'citation', 'source', 'verified', 'blocked', 'hallucination', 'passage', 'typography', 'unknown'],
  },
  {
    slug: 'conflict-rules',
    group: 'concepts',
    title: 'Conflict rules',
    summary: 'The narrow checks CanonTracker runs over accepted canon, what each one catches, and how hard and soft conflicts are judged.',
    sections: [
      {
        title: 'How conflicts work',
        text: '**Scan canon** on [Conflicts](/help/conflicts) runs the checks below over accepted canon. Each hit is a conflict candidate: a possible problem for a person to judge, not a verdict. Six rules run in code and are marked **Rule-based**. The world-rule check uses the AI and is marked **AI-suggested**. Deciding a conflict never edits canon; to fix one, propose a change.',
      },
      {
        title: 'Same person, two places, overlapping exact times',
        text: 'One character is placed at two different places at clock times that overlap, and both times are exact. Example: Mara is at the harbour `D3 14:00`–`D3 15:00` and at the lighthouse `D3 14:30`. Hard by default.',
      },
      {
        title: 'Same person, two places, overlapping approximate times',
        text: 'The same clash, but at least one of the times is approximate (marked **Roughly**). Often a false alarm, so it is soft by default.',
      },
      {
        title: 'Not enough time to travel between places',
        text: 'Canon says how long a trip takes, and a character is placed at both ends with less time between than that. Example: the ride from the mill to the port takes 90 minutes, but Mara leaves the mill at `D2 09:00` and is at the port at `D2 09:30`. Hard by default; a trip close to the limit (at least half the travel time) is soft unless the project changes the rule.',
      },
      {
        title: 'Relationship used after it ended',
        text: 'A relationship has an end time, and a later fact uses the same relationship as still active. Example: an apprenticeship ended on `D10`, but a fact on `D12` still calls them master and apprentice. Hard by default.',
      },
      {
        title: 'Acts after death',
        text: 'Canon says a character dies (or is dead, or is killed) at a story time, and a fact timed later has them doing something. Example: Varek dies on `D3`, but on `D5` he greets the party. Being buried, mourned, remembered or mentioned is not acting. Both facts need a time; a day-only death counts as the whole day, so only a later day is flagged. Hard by default.',
      },
      {
        title: 'Same detail, two answers',
        text: 'One subject has a single-valued detail, such as eye colour or where a wound is, with two answers that disagree at the same time. Example: the wound is in the shoulder in one source and in the leg in another. An answer that only adds words ("left shoulder" for "shoulder") agrees; a "not" on one side never does. Hard by default.',
      },
      {
        title: 'Fact breaks a world rule',
        text: 'The AI reads your world rules in canon (how magic works, what the bell does) against the facts they touch and suggests where a fact may break one. It is labelled **AI-suggested** and kept apart from the rule-based checks. Soft by default.',
      },
      {
        title: 'Times the rules can read',
        points: [
          'Story time is a day and an optional clock time: `D3 14:00`, or day-only `D3`. Days may be 0 or negative (`D0`, `D-3650`) for backstory.',
          'Day-only means "some time that day". The two-places and travel rules skip any pair where either fact is day-only, because they need clock times on both sides.',
          'A day-only time still counts as the whole day for the timeline, for relationships after they ended and for acts after death.',
        ],
      },
      {
        title: 'Hard and soft',
        points: [
          '**Hard · breaks canon**: the facts can\'t both be true as written.',
          '**Soft · worth a look**: may be fine, read it.',
          'Editors can switch one conflict with **Change severity** and a reason. Owners and admins set each rule\'s default for new scans under **Conflict severity by rule** in the project\'s settings; existing conflicts keep theirs.',
        ],
      },
      {
        title: 'Deciding',
        text: 'Write a rationale, then pick one. The decision and its reason are saved to the audit log.',
        points: [
          '**Confirm conflict**: it is a real problem. Fix it with a change proposal.',
          '**False alarm**: the facts don\'t clash.',
          '**Uncertain**: you can\'t tell yet.',
          '**Resolved by merge**: closed automatically when a merge removed the reason for the conflict. See [Merges and identity](/help/merges).',
        ],
      },
    ],
    related: ['conflicts', 'review', 'projects', 'change-impact', 'merges', 'glossary'],
    keywords: ['conflict', 'contradiction', 'continuity', 'overlap', 'travel', 'relationship', 'detail', 'world rule', 'severity', 'hard', 'soft', 'false positive', 'day-only'],
  },
  {
    slug: 'change-impact',
    group: 'concepts',
    title: 'Change impact',
    summary: 'Before a canon fact changes, see which facts and documents (scenes, lore, quests, dialogue, recordings) it may touch, up to 2 hops away, with the path and evidence for each.',
    sections: [
      {
        title: 'Three different things',
        text: 'CanonTracker keeps these apart, in the data and on screen.',
        points: [
          '**Change proposal**: someone wants a canon fact to say something else. Made on [Changes](/help/changes).',
          'Conflict candidate: two canon facts may clash. Found on [Conflicts](/help/conflicts).',
          '**Possible review impact**: facts and documents a proposal may affect, for a person to read. Not a conflict and not a change.',
        ],
      },
      {
        title: 'How far impact reaches',
        text: 'Impact stays inside accepted canon and stops at 2 hops.',
        points: [
          '1 hop: documents of any kind that cite the changed fact, and canon facts that share a name with it. Documents are grouped by kind.',
          '2 hops: scenes that cite one of those related facts.',
          'Every item shows its path from the changed fact, the evidence it rests on and why it is listed.',
          'An empty result reads "No impact found within 2 hops". That is not a promise that nothing else is affected.',
        ],
      },
      {
        title: 'From proposal to canon',
        points: [
          'Pick a canon fact (or use **Propose change…** on it), write the new version and a reason, then **Analyze impact**. Canon doesn\'t change yet.',
          '**Accept & apply** makes the new wording canon. The old fact is kept as **Superseded**, and each document in the impact list becomes a **Re-review tasks** item on [Tasks](/help/tasks).',
          '**Reject** closes the proposal; canon stays as it was.',
          '**Revert this change…** then **Revert to original** makes the original wording canon again as a new version. Unfinished re-review tasks close as not needed.',
          'Every step needs a reason and is saved to the audit log.',
        ],
      },
      {
        title: 'When impact goes stale',
        text: 'A merge can change which facts a proposal touches. A waiting proposal then shows **Impact out of date.** and can\'t be accepted until someone uses **Re-run analysis**.',
      },
      {
        title: 'Export',
        text: 'Under each impact list, **Export this list** downloads it as JSON, CSV or Markdown, for a producer or a tracker.',
      },
    ],
    related: ['changes', 'tasks', 'conflict-rules', 'merges', 'glossary'],
    keywords: ['impact', 'change', 'proposal', 'hop', 'blast radius', 'apply', 'revert', 'stale', 'manifest', 'export', 'superseded'],
  },
  {
    slug: 'versions-and-recheck',
    group: 'concepts',
    title: 'Versions and re-check',
    summary: 'Sources are never edited in place: a changed file is a new version, and canon that cites an older version asks to be re-checked.',
    sections: [
      {
        title: 'Versions',
        points: [
          'Uploading a file with the same name into the same folder adds a new version of that document. A file with the same name in another folder stays a separate document.',
          'A file with exactly the same text as an existing version is skipped.',
          'Documents are never changed. **Edit** on a document opens its latest text in the writing view, and saving makes a new version.',
          '**History** on a document lists every version, who added it and how, and compares two versions passage by passage.',
          'New facts always cite the latest version. Older citations stay as they were until someone re-checks them.',
        ],
      },
      {
        title: 'What a re-check says',
        text: 'When a canon fact cites an older version, CanonTracker looks for its quote in the newest one.',
        points: [
          'Unchanged: the quote is still in the newest version, exactly once. The fact shows **Source updated** and the citation "Same quote in v…". Confirm moves the citation to the newest version.',
          'Outdated: the quote is gone, or it now appears more than once so no single passage holds it. The fact shows **Evidence outdated**, and the citation says which.',
          'Kept: a person checked an outdated citation and kept it on its version. It reads "Kept on v… (checked v…)". A later version asks again.',
        ],
      },
      {
        title: 'Doing the re-check',
        points: [
          'Open Canon\'s **Needs re-check** view (Home and Library link to it too). It lists only the facts with outdated evidence.',
          'Use the Confirm button at the top to move every unchanged citation to the newest version in one step.',
          'For each outdated citation, see what changed, then propose a change to the fact or choose **Keep as is**.',
          'Confirm and keep are for editors, admins and owners, and each is saved to the audit log.',
        ],
      },
    ],
    related: ['library', 'history', 'canon', 'evidence', 'change-impact'],
    keywords: ['version', 'upload', 'duplicate', 'stale', 'outdated', 'unchanged', 'kept', 'confirm', 'recheck', 're-check', 'diff'],
  },
  {
    slug: 'merges',
    group: 'concepts',
    title: 'Merges and identity',
    summary: 'When two entity pages are the same person, place or thing, a merge makes them one and everything downstream follows.',
    sections: [
      {
        title: 'What a merge is',
        text: 'A merge is a person\'s decision that two names mean the same thing, for example a nickname and a full name. Open the page you want to fold away, choose **Merge…**, pick the page to keep under **Keep this page**, and read **What happens** before you confirm. Editors, admins and owners can merge.',
      },
      {
        title: 'What changes',
        points: [
          'Canon facts and pending candidates that name the old page now name the kept one. Their statements and quotes don\'t change.',
          'The old names are listed on the kept page as **Merged from**, so mentions keep linking. Hand-typed aliases become aliases of the kept page.',
          'The kept page takes the old summary and fields where its own are empty, adds the old notes to its notes, and gets the portrait and images.',
          'Open rule-based conflicts that only existed because these were two pages close as **Resolved by merge**. Their history stays.',
          'Waiting change proposals whose impact the merge changed show **Impact out of date.** and need a fresh analysis before they can be accepted.',
          'Later candidates that name a merged name are shown to the reviewer with the kept name, and saved under it when accepted.',
          'The audit log keeps a full copy of the old page and every fact\'s previous names, so the merge can be traced and undone by hand.',
        ],
      },
      {
        title: 'Before you merge',
        text: 'CanonTracker warns when the two pages are of different types, or when both have their own canon. Those are often two different things that share a name. The merge is still allowed, but read the warning first.',
      },
    ],
    related: ['entity-page', 'entities', 'conflicts', 'changes', 'conflict-rules', 'change-impact', 'glossary'],
    keywords: ['merge', 'duplicate', 'alias', 'identity', 'same person', 'rename', 'resolved by merge', 'stale'],
  },
  {
    slug: 'glossary',
    group: 'concepts',
    title: 'Glossary',
    summary: 'The words CanonTracker uses, each in a sentence or two.',
    sections: [
      {
        title: 'A to F',
        points: [
          'Agent token: a key (`sb_…`) that lets an AI agent work in one project over MCP, made under **Agents & API**. **Propose only** proposes; **Full access** also edits as you, marked "via agent". Neither decides canon.',
          'Alias: another name for an entity page. Mentions of an alias link to the page.',
          'Blocked: a candidate whose quote isn\'t in the source word for word. It can\'t be accepted. See [Evidence](/help/evidence).',
          'Candidate: a proposed fact waiting for a person\'s decision in Review. Drawn in pencil.',
          'Canon: the facts your team accepted, each with a verified quote. Drawn in ink.',
          'Canon name: the one name accepted canon uses for an entity, shown as "Canon calls it …" on its page. Renaming the page doesn\'t change it.',
          'Change proposal: a request to rewrite one canon fact, with its impact, waiting for a decision. See [Change impact](/help/change-impact).',
          'Conflict: a possible clash between canon facts, found by a rule or suggested by the AI, for a person to judge. See [Conflict rules](/help/conflict-rules).',
          'Continuity check: the AI reads a draft or passage against accepted canon and reports what contradicts it, depends on it, or is new. Fixes are suggestions; nothing is applied.',
          'Critic: the **AI critic**, a second AI opinion on a candidate (keep, reject or needs edit). Advice only; you decide.',
          'Entity: a page per character, place, item, faction or event, filed for every name in canon or made by hand.',
          'Evidence: the quote and passage a fact cites.',
          'Folder: a Library label that groups documents, two levels deep. It never changes a document\'s text.',
        ],
      },
      {
        title: 'H to R',
        points: [
          'Hop: one step from a changed fact to something it touches. Impact stops at 2 hops.',
          'Impact: the canon facts and documents a change proposal may affect, each with a path, evidence and reason.',
          'Note: an editorial comment pinned to a passage, moved from open to ready to done. Never canon.',
          'Passage: one paragraph of a document, the unit a quote must sit in.',
          'Re-check: confirming or keeping canon citations after their source got a new version. See [Versions and re-check](/help/versions-and-recheck).',
          'Rejected: a candidate a person turned down, with a reason. Kept for the record, never canon.',
          'Research note: an answer to a real-world question from outside sources. Never canon; it can be promoted to a candidate.',
        ],
      },
      {
        title: 'S to Z',
        points: [
          'Sample canon: facts that came with a sample project, marked **Sample canon (preloaded)**. Their quotes are verified, but no person decided them.',
          'Story time: when something happens in the story, as `D3 14:00` or day-only `D3`. Days can be 0 or negative for backstory.',
          'Superseded: an older version of a canon fact that an applied change replaced. Kept, never deleted.',
          'Tag: a coloured Library label on documents. It never changes a document\'s text.',
          'Task: a document to re-read after a change was applied, with an owner and a status.',
          'Verified: a quote found word for word in its passage, shown as **Verbatim match**.',
          'Version: one saved state of a document. A new upload or save adds a version; old ones are kept.',
        ],
      },
    ],
    related: ['candidates-and-canon', 'evidence', 'conflict-rules', 'change-impact', 'versions-and-recheck', 'merges', 'review', 'agents-api'],
    keywords: ['glossary', 'terms', 'definitions', 'vocabulary', 'what is'],
  },
] satisfies HelpPage[]
