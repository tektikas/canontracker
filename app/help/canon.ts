import type { HelpPage } from './types'

export default [
  {
    slug: 'review',
    group: 'canon',
    title: 'Review',
    summary: 'Decide on the facts the AI proposed: accept them into canon, correct them first, or reject them with a reason.',
    where: 'Sidebar → **Review**',
    shot: { name: 'review', alt: 'The Review queue in The Ashbell Pass sample: a blocked candidate whose quote is not in the source, the source document beside it, and the queue below.' },
    see: [
      { label: 'Progress', text: 'How many candidates have a decision and how many are left.' },
      { label: 'Candidate', text: 'The proposed fact: its statement, who or what it names, its story time, the quote it rests on and where that quote comes from. A badge shows the AI’s confidence, or **Agent proposal** when an agent sent it over MCP.' },
      { label: 'AI critic', text: 'A second AI reading of the candidate against its passage: keep, reject or needs edit, with one line on why. It is advice only.' },
      { label: 'Source', text: 'The document the quote comes from, open at the passage, with the quoted words marked. **Open document** opens it in the reader.' },
      { label: 'Queue', text: 'Every candidate still waiting. Filter and sort it by the AI critic’s opinion, and accept verified candidates in bulk.' },
      { label: 'Rejected', text: 'Rejected candidates with who rejected them and why. They are kept for the audit trail and never become canon.' },
    ],
    tasks: [
      {
        title: 'Accept a candidate',
        steps: [
          'Read the statement and compare the quote with the marked passage in the source.',
          'Check the **AI critic** opinion if there is one; it is advice, the decision is yours.',
          'Select **Accept** (or press `A`) to add the fact to canon with your name on it.',
          'The next candidate opens; use `J` and `K` to move through the queue.',
        ],
      },
      {
        title: 'Correct a candidate, then accept it',
        steps: [
          'Select **Edit & accept** (or press `E`).',
          'Fix the **Statement**, **Subject**, **Predicate** or **Object**, and the story time in **From** and **Until**, for example `D2 14:30`.',
          'Tick **Roughly** when the source gives only an approximate time.',
          'Add a **Note** if you want the reason in the audit log, then select **Save & accept**.',
        ],
      },
      {
        title: 'Reject a candidate',
        steps: [
          'Select **Reject…** (or press `R`).',
          'Fill in **Why reject it?**, or pick a common reason such as a figurative phrase or a duplicate.',
          'Select **Confirm reject**; the candidate moves to **Rejected** and never becomes canon.',
        ],
      },
      {
        title: 'Accept many at once',
        steps: [
          'In **Queue**, select the bulk accept button for all verified candidates, or the one for the candidates the AI critic keeps.',
          'Read the list in the dialog: every quote in it appears word for word in its source.',
          'Close the dialog and decide one on its own if you are unsure of it; otherwise confirm.',
        ],
      },
    ],
    sections: [
      {
        title: 'Blocked candidates',
        text: 'A candidate whose quote is not in the source word for word is marked **Blocked** and can’t be accepted, by hand or in bulk. Reject it. If the fact is true, select the real sentence in the source and use **Add fact**.',
      },
      {
        title: 'The AI critic',
        points: [
          'It reads each verified candidate with its passage and the canon about the same names, and says keep, reject or needs edit, with a reason such as **Figurative** or **Duplicate**.',
          'A needs-edit opinion comes with a suggested correction; **Use in Edit & accept** copies it into the edit form for you to check.',
          'If the candidate or the canon about its names changed since, the opinion says so; select **Ask again** for a fresh one, or **Ask the AI critic** when there is none.',
          'It never changes a fact. Only your decision does.',
        ],
      },
      {
        title: 'Where candidates come from',
        points: [
          'The AI proposes them when a document is imported or re-extracted.',
          'Teammates send them from the reader with **Add fact**, from a research note, or from a continuity check.',
          'Agents propose them over MCP with an API token; the candidate says which agent and for whom.',
          'A candidate that names a merged-away entity says which page it will be saved under when you accept it.',
        ],
      },
    ],
    roles: [
      { role: 'Viewer', can: 'Read the queue, the candidates, the AI critic opinions and the rejected list.' },
      { role: 'Editor, admin, owner', can: 'Accept, edit and accept, reject, bulk accept and ask the AI critic.' },
    ],
    related: ['candidates-and-canon', 'evidence', 'canon', 'reader', 'merges', 'shortcuts'],
    keywords: ['accept', 'reject', 'critic', 'candidate', 'queue', 'blocked', 'quote', 'bulk', 'agent proposal', 'pencil'],
  },
  {
    slug: 'canon',
    group: 'canon',
    title: 'Canon',
    summary: 'Every fact a person accepted, each linked to the exact passage it came from, as a list, a relationship graph and a story timeline.',
    where: 'Sidebar → **Canon**',
    shot: { name: 'canon', alt: 'The Canon facts list in The Ashbell Pass sample, grouped by kind, with search and filters above it.' },
    see: [
      { label: 'Tabs', text: '**Facts**, **Graph**, **Timeline** and **Superseded**.' },
      { label: 'Filters', text: 'Search by name, place or word; filter by kind and document; **Needs re-check** shows only facts whose evidence went out of date.' },
      { label: 'Facts list', text: 'One line per fact, grouped by kind, entity or document (**Group by**). Open a line to see its story time, its verified quotes and its sources.' },
      { label: 'Graph', text: 'Who and what is linked to whom in canon, coloured by entity type, with a search box to find an entity and zoom buttons.' },
      { label: 'Timeline', text: 'The **Story timeline**: timed facts by story time, one lane per character. Day 1 starts at 00:00; earlier days are D0, D-1 and so on.' },
      { label: 'Superseded', text: 'Earlier versions of facts that an accepted change replaced, with the version that replaced them. They are kept, never deleted.' },
    ],
    tasks: [
      {
        title: 'Find a fact and its source',
        steps: [
          'Type a name, place or word in the search box, or pick a kind or a document.',
          'Open the fact’s line to see its quotes and the documents they come from.',
          'Select a source to read the passage in place.',
        ],
      },
      {
        title: 'Re-check facts after a source changed',
        steps: [
          'Select **Needs re-check** to list the facts whose quote a newer version no longer has in one place.',
          'If some quotes read the same in the newer version, confirm them all with the button at the top.',
          'For each outdated citation, select **See what changed** to compare the versions.',
          'Select **Keep as is** to keep citing the older version, or **Propose change…** to rewrite the fact.',
        ],
      },
      {
        title: 'Propose a change to a fact',
        steps: [
          'Open the fact’s line.',
          'Select **Propose change…** to open it on the Changes page, ready to rewrite.',
        ],
      },
    ],
    sections: [
      {
        title: 'What canon holds',
        points: [
          'Only facts a person accepted, plus a sample project’s preloaded canon, which is marked **Sample**.',
          'Every fact has at least one quote that appears word for word in its source.',
          'Canon changes only through Review (new facts) and Changes (rewrites). A fact whose evidence went out of date stays in canon until someone proposes a change.',
        ],
      },
    ],
    roles: [
      { role: 'Viewer', can: 'Read canon, the graph, the timeline and superseded facts.' },
      { role: 'Editor, admin, owner', can: 'Also confirm or keep citations after a source changed, and propose changes.' },
    ],
    related: ['review', 'changes', 'entities', 'versions-and-recheck', 'evidence', 'export'],
    keywords: ['facts', 'graph', 'timeline', 'superseded', 're-check', 'outdated', 'evidence', 'ink', 'sample canon'],
  },
  {
    slug: 'entities',
    group: 'canon',
    title: 'Entities',
    summary: 'A wiki page for every character, place, item, faction and event, made automatically from accepted canon or added by hand.',
    where: 'Sidebar → **Entities**',
    shot: { name: 'entities', alt: 'The Entities page in The Ashbell Pass sample: entity cards grouped by type, with search and type filters.' },
    see: [
      { label: 'Search', text: 'Finds pages by name, alias or summary.' },
      { label: 'Type filters', text: 'One button per entity type with its count; **All** shows every page.' },
      { label: 'Sort', text: 'By name or by **Most canon facts**.' },
      { label: 'Cards', text: 'Grouped by type: portrait, name, summary (or the first canon fact), the number of canon facts and any other names.' },
    ],
    tasks: [
      {
        title: 'Find a page',
        steps: [
          'Type a name, alias or word from a summary in the search box.',
          'Narrow it with a type button if the list is long.',
          'Select a card to open the page.',
        ],
      },
      {
        title: 'Add a page by hand',
        steps: [
          'Select **New entity**.',
          'Fill in **Name** and pick a **Type**.',
          'Add a short **Summary** if you like; it is your team’s note, not canon.',
          'Select **Create page**.',
        ],
      },
      {
        title: 'Change the entity types',
        steps: [
          'Select **Edit types** to open the project’s entity types.',
          'Rename, recolour or add types there; pages keep their type.',
        ],
      },
    ],
    sections: [
      {
        title: 'Where pages come from',
        points: [
          'Every name in accepted canon gets a page, marked **From canon**. Its type is a guess; change it on the page if it is wrong.',
          'Pages you add by hand cover anything canon doesn’t name yet.',
          'Summaries, aliases, fields, notes and portraits are editorial. They never become canon and are never used for conflicts or impact.',
        ],
      },
    ],
    roles: [
      { role: 'Viewer', can: 'Browse and search every page.' },
      { role: 'Editor, admin, owner', can: 'Add pages and edit the project’s entity types.' },
    ],
    related: ['entity-page', 'canon', 'merges', 'projects'],
    keywords: ['wiki', 'characters', 'locations', 'items', 'factions', 'aliases', 'entity types'],
  },
  {
    slug: 'entity-page',
    group: 'canon',
    title: 'Entity page',
    summary: 'Everything about one character, place or thing: what canon says, its timeline, relationships, appearances, images and team notes.',
    where: 'Sidebar → **Entities** → select a page, or select a highlighted name anywhere in the app',
    shot: { name: 'entity', alt: 'The entity page for Saltgate in The Ashbell Pass sample: merged from Salt Gate, with the Story tab showing its summary, what canon says and the game details panel.' },
    see: [
      { label: 'Header', text: 'Portrait, type, name, other names, the names it was merged from, how many canon facts name it and who edited it last. **Edit**, **Merge…** and **Delete** sit on the right.' },
      { label: 'Story', text: '**Summary**, **What canon says** (accepted facts that name it, grouped, each with its passage) and a details panel with fields for your project’s medium.' },
      { label: 'Timeline', text: 'Timed canon facts that name it, by story time.' },
      { label: 'Relationships', text: 'Every canon link to another character, place or item. Open one to see the facts behind it.' },
      { label: 'Appearances', text: 'Passages in the latest version of your sources that mention it or its other names; **Cited in canon** marks the ones canon cites.' },
      { label: 'Images', text: 'Concept art, references and generated images. Any of them can become the portrait.' },
      { label: 'Notes', text: '**Notes on the text** (notes pinned to passages that mention it) and **Page notes** (free working notes).' },
    ],
    tasks: [
      {
        title: 'Edit the name, type and aliases',
        steps: [
          'Select **Edit** in the header.',
          'Change the **Name** or **Type**; if canon uses the old name it stays as an alias.',
          'Under **Aliases**, type a nickname, title or full name and select **Add**.',
          'Select **Save**.',
        ],
      },
      {
        title: 'Merge two pages that are the same',
        steps: [
          'On the page that should go away, select **Merge…**.',
          'Pick the page to keep under **Keep this page**.',
          'Read **What happens**: which facts will name the kept page, which conflicts close and which change proposals need a fresh analysis.',
          'Select the merge button to confirm; the audit log keeps a full copy of the old page.',
        ],
      },
      {
        title: 'Set a portrait',
        steps: [
          'Select **Upload** under the portrait, or drop an image on it.',
          'Or select **Generate**, check the **Prompt** drafted from canon, pick a **Style preset** and the number of images, then generate.',
          'On the **Images** tab, set any image as the portrait, add a caption, download it or delete it.',
        ],
      },
      {
        title: 'Write a summary and notes',
        steps: [
          'On the **Story** tab, select **Write** or **Edit** in **Summary**.',
          'On the **Notes** tab, select **Write notes** under **Page notes**.',
          'Select **Save** or **Save notes**; neither becomes canon.',
        ],
      },
    ],
    sections: [
      {
        title: 'Canon and editorial text',
        points: [
          'Only **What canon says**, the timeline, relationships and appearances come from canon and your sources.',
          'Summary, aliases, fields, notes and images are your team’s words. They never become canon and are never used for conflicts or impact.',
          'A merge is a decision that two names are one: canon facts and later candidates under the old name move to the kept page. See [Merges](/help/merges).',
          'A page that canon still names can’t be deleted, because it would come straight back; merge it instead.',
          'Image generation may not be available on every instance; uploading always works.',
        ],
      },
    ],
    roles: [
      { role: 'Viewer', can: 'Read every tab.' },
      { role: 'Editor, admin, owner', can: 'Edit details, summary, fields and notes; merge and delete pages; upload, generate and pick images.' },
      { role: 'Admin, owner', can: 'Also change the project’s medium (**Change medium**), which decides the fields shown.' },
    ],
    related: ['entities', 'merges', 'canon', 'notes', 'projects'],
    keywords: ['wiki', 'portrait', 'merge', 'alias', 'relationships', 'appearances', 'images', 'generate'],
  },
  {
    slug: 'conflicts',
    group: 'canon',
    title: 'Conflicts',
    summary: 'Scan accepted canon for timing, travel, relationship, detail and world-rule clashes, then judge each possible conflict.',
    where: 'Sidebar → **Conflicts**',
    shot: { name: 'conflicts', alt: 'Conflict candidates in The Ashbell Pass sample: a hard, rule-based relationship conflict with Source A and Source B side by side.' },
    see: [
      { label: 'Tabs', text: '**To judge** (open conflicts) and **Decided**.' },
      { label: 'Severity bar', text: 'Open hard and soft counts, a filter by severity and **Hard first** to sort.' },
      { label: 'Conflict card', text: 'Severity, status, whether it is **Rule-based** or **AI-suggested**, the confidence, the rule it broke and one line on the clash.' },
      { label: 'Source A and Source B', text: 'The two canon facts that clash, each with its verified quote and source.' },
      { label: 'Decision', text: 'A required rationale and three decisions: **Confirm conflict**, **False alarm** or **Uncertain**.' },
    ],
    tasks: [
      {
        title: 'Scan canon',
        steps: [
          'Select **Scan canon**.',
          'New possible conflicts appear under **To judge**; a note says how many were found and how many world rules were checked.',
          'Scan again after canon changes.',
        ],
      },
      {
        title: 'Judge a conflict',
        steps: [
          'Read the clash and both sources.',
          'Write why in **Your rationale (required)**.',
          'Select **Confirm conflict**, **False alarm** or **Uncertain**.',
        ],
      },
      {
        title: 'Change a conflict’s severity',
        steps: [
          'Select **Change severity** on the card.',
          'Say why, then make it hard or soft.',
        ],
      },
    ],
    sections: [
      {
        title: 'What it checks',
        points: [
          'In code: one person in two places at overlapping exact or approximate times, too little time to travel between places, a relationship used after it ended, and one detail with two answers.',
          'With the AI: facts that break a world rule. These are marked **AI-suggested**.',
          'Facts with a day but no clock time are skipped by the overlap and travel checks. See [Conflict rules](/help/conflict-rules).',
          'Hard conflicts break canon; soft ones are worth a look.',
        ],
      },
      {
        title: 'Deciding never edits canon',
        text: 'A conflict is a possible problem for you to judge, not a change. To fix a fact, propose a change on the Changes page. A conflict that only existed because two pages were one closes as **Resolved by merge** when they are merged.',
      },
    ],
    roles: [
      { role: 'Viewer', can: 'Read conflicts and decisions.' },
      { role: 'Editor, admin, owner', can: 'Scan canon, judge conflicts and change their severity.' },
    ],
    related: ['conflict-rules', 'canon', 'changes', 'merges'],
    keywords: ['scan', 'continuity', 'clash', 'overlap', 'travel time', 'world rule', 'false alarm', 'severity'],
  },
  {
    slug: 'changes',
    group: 'canon',
    title: 'Changes',
    summary: 'Rewrite one canon fact and see which facts and scenes it may touch, up to 2 hops away, before anything in canon changes.',
    where: 'Sidebar → **Changes**, or **Propose change…** on a fact in Canon',
    shot: { name: 'impact', alt: 'A change proposal in The Ashbell Pass sample: the bell rule now and as proposed, with its possible review impact listing related canon facts to re-check.' },
    see: [
      { label: 'Propose a change', text: 'Three steps: pick a fact, write the new version, check the impact.' },
      { label: 'Proposals', text: 'Tabs **To decide**, **Applied**, **Rejected or reverted** and **All**.' },
      { label: 'Proposal card', text: 'The fact now and as proposed, and why.' },
      { label: 'Possible review impact', text: 'Scenes and related canon facts the change may touch, by hop, each with its path, source quotes and rationale. Export it as JSON, CSV or Markdown.' },
      { label: 'Re-review tasks', text: 'After a change is applied: one task per affected scene, with progress. **Open in Tasks** shows them.' },
    ],
    tasks: [
      {
        title: 'Propose a change',
        steps: [
          'Under **Which fact?**, search canon and pick the fact.',
          'Under **What should it say?**, write the **New version**, or select **Start from current wording** and edit it.',
          'Fill in **Why change it? (required)**.',
          'Select **Analyze impact**; the proposal and its impact appear under **Proposals**.',
        ],
      },
      {
        title: 'Accept or reject a proposal',
        steps: [
          'Select **Show impact** and read the scenes and facts it may touch.',
          'Fill in **Why (required)** under **Decide**.',
          'Select **Accept & apply** to write the new version to canon and keep the old one as superseded, or **Reject** to leave canon as it is.',
        ],
      },
      {
        title: 'Revert an applied change',
        steps: [
          'Open the **Applied** tab and find the change.',
          'Select **Revert this change…** and fill in **Why revert? (required)**.',
          'Select **Revert to original**; its open re-review tasks close as not needed.',
        ],
      },
    ],
    sections: [
      {
        title: 'How impact works',
        points: [
          'It looks only at accepted canon, at most 2 hops from the changed fact: 1 hop is tied directly to it, 2 hops go through a related fact.',
          'Every item carries its path, its evidence and a rationale.',
          'An empty result reads “no impact found”: nothing was found within 2 hops, which is not a guarantee that nothing is affected.',
          'If a merge changes the names involved after the analysis ran, the proposal says **Impact out of date.** and can’t be accepted until you select **Re-run analysis**. See [Change impact](/help/change-impact).',
        ],
      },
      {
        title: 'Three different things',
        text: 'A change proposal (a rewrite you decide on), a conflict candidate (a possible clash on the Conflicts page) and a possible review impact (what a change may touch) are separate. Accepting a change applies it; a conflict decision never edits canon.',
      },
    ],
    roles: [
      { role: 'Viewer', can: 'Read proposals, their impact and history, and export the impact list.' },
      { role: 'Editor, admin, owner', can: 'Propose changes, accept and apply, reject, revert and re-run the analysis.' },
    ],
    related: ['change-impact', 'canon', 'tasks', 'conflicts', 'merges'],
    keywords: ['change proposal', 'impact', 'hops', 'apply', 'revert', 'supersede', 'impact manifest', 'export'],
  },
  {
    slug: 'tasks',
    group: 'canon',
    title: 'Tasks',
    summary: 'Re-review the scenes an applied canon change may have affected: assign them, set due dates, track status and leave comments.',
    where: 'Sidebar → **Tasks**, or **Open in Tasks** on an applied change',
    shot: { name: 'tasks', alt: 'The Tasks page in The Ashbell Pass sample: re-review tasks with status, assignee and the change they came from.' },
    see: [
      { label: 'Tabs', text: '**Open**, **Mine** (open tasks assigned to you), **Closed** and **All**.' },
      { label: 'Filters', text: '**All changes** and **All documents** narrow the list to one change or one document.' },
      { label: 'Task card', text: 'Status, due date or **Overdue**, the assignee, the scene, the change it came from, why it may be affected, the quote and its path from the changed fact.' },
      { label: 'Controls', text: '**Status**, **Assignee**, **Due date** and **Comment**.' },
    ],
    tasks: [
      {
        title: 'Assign a task',
        steps: [
          'Pick a teammate under **Assignee**.',
          'Set a **Due date** if it has one.',
        ],
      },
      {
        title: 'Work through a task',
        steps: [
          'Select the scene’s title to read it at the affected passage.',
          'Set **Status** to **In progress** while you work on it.',
          'Write what you found under **Comment** and select **Save comment**.',
          'Set **Status** to **Done**, or **Won’t fix** if the scene stays as it is.',
        ],
      },
    ],
    sections: [
      {
        title: 'Where tasks come from',
        points: [
          'When a change proposal is accepted and applied, every scene in its impact list becomes a task.',
          'If the change is reverted, its tasks close as **Not needed** and can’t be reopened. They are kept for the record.',
          'Tasks are for your team; they never become canon.',
        ],
      },
    ],
    roles: [
      { role: 'Viewer', can: 'Read tasks and comments.' },
      { role: 'Editor, admin, owner', can: 'Set status, assignee and due date, and comment.' },
    ],
    related: ['changes', 'change-impact', 'reader'],
    keywords: ['re-review', 'assign', 'due date', 'overdue', 'scenes', 'workflow'],
  },
  {
    slug: 'notes',
    group: 'canon',
    title: 'Notes',
    summary: 'Every note in the project, pinned to the words it is about: questions, fixes and references for your team.',
    where: 'Sidebar → **Notes**',
    shot: { name: 'notes', alt: 'The Notes page in The Ashbell Pass sample: open notes with the quoted words and the document they are pinned to.' },
    see: [
      { label: 'Tabs', text: '**Open**, **Ready**, **Done** and **All**.' },
      { label: 'Document filter', text: '**All documents**, or one document with all its versions.' },
      { label: 'Note card', text: 'Status, who wrote it and when, the words it is pinned to, the note itself and the document, version and line.' },
    ],
    tasks: [
      {
        title: 'Add a note',
        steps: [
          'Open a document in the reader and select the words the note is about.',
          'Choose **Add note** (or press `N`).',
          'Write the note and save it; it shows in the reader margin, here, and on the page of every entity its passage mentions.',
        ],
      },
      {
        title: 'Move a note along',
        steps: [
          'Select **Mark ready** when the note is handled and waiting for a check.',
          'Select **Mark done** once it is checked.',
          'Select **Reopen** to send it back to open.',
        ],
      },
    ],
    sections: [
      {
        title: 'Good to know',
        points: [
          'Notes are for your team; they never become canon.',
          'Comments in an imported Word file become open notes by the person who uploaded it.',
          'A note on an older version is shown where its words still appear. If they now appear in more than one place it says **Needs re-anchoring**.',
        ],
      },
    ],
    roles: [
      { role: 'Viewer', can: 'Read every note.' },
      { role: 'Editor, admin, owner', can: 'Add notes and move them between open, ready and done.' },
    ],
    related: ['reader', 'entity-page', 'library', 'shortcuts'],
    keywords: ['comments', 'annotations', 'margin', 'open', 'ready', 'done', 'word comments'],
  },
] satisfies HelpPage[]
