<script setup lang="ts">
const { data: events } = await useFetch('/api/audit')
const route = useRoute() // /audit#<event id> highlights that event (links from Conflicts and Changes)
const filter = ref('')
const kindLabel = useKind()
const me = useMe()
const shown = computed(() => (events.value ?? []).filter(e => !filter.value || e.event_type.startsWith(`${filter.value}.`)))
const types = computed(() => [...new Set((events.value ?? []).map(e => e.event_type.split('.')[0]!))])
const count = (t: string) => (events.value ?? []).filter(e => e.event_type.startsWith(`${t}.`)).length

const clip = (v: unknown, n = 90) => {
  const t = typeof v === 'string' ? v : v == null ? '' : JSON.stringify(v)
  return t.length > n ? `${t.slice(0, n - 1)}…` : t
}
const q = (v: unknown) => (v ? `“${clip(v)}”` : '')
const TASK_LABEL: Record<string, string> = { open: 'open', in_progress: 'in progress', done: 'done', wont_fix: 'won’t fix', not_needed: 'not needed' }
const identity = (d: Record<string, any>) => (d.identity ?? []).map((i: any) => `${i.from} saved as ${i.to} (merged page)`).join(', ')
const SAMPLE_NAME: Record<string, string> = { 'broken-tide': 'the Broken Tide demo', 'lantern-row': 'the Lantern Row sample', 'ashbell-pass': 'the Ashbell Pass demo', 'sherlock-holmes': 'the Sherlock Holmes sample' }
// Audit details carry the file's own name and the folder it was in then (null: the Library root), never the internal key.
const inFolder = (d: Record<string, any>) => (d.folder ? ` in ${d.folder}` : '')
const because = (d: Record<string, any>) => (d.rationale ? `Reason: ${clip(d.rationale, 140)}` : '')

// One plain sentence per event type; unknown types fall back to the raw event name.
function sentence(e: { event_type: string, actor_name: string, target_id: string, detail: Record<string, any> }) {
  const d = e.detail
  // Done through an MCP token: still that person's action, marked with the agent's token name.
  const who = d.via === 'mcp' && d.token_name ? `${e.actor_name} via agent “${d.token_name}”` : e.actor_name
  switch (e.event_type) {
    case 'document.imported': return [`${who} imported ${d.filename}${inFolder(d)}`, `${d.passages} passages, read-only`]
    case 'document.version_added': return [`${who} imported version ${d.version} of ${d.filename}${inFolder(d)}`, `${d.passages} passages`]
    case 'recording.imported': return [`${who} added the recording ${d.filename}${inFolder(d)}`, `Transcribed: ${clockMs(d.duration_ms ?? 0)} of audio, ${d.passages} timed passages, read-only`]
    case 'recording.version_added': return [`${who} transcribed ${d.filename} again: version ${d.version}`, `${d.passages} timed passages · earlier transcripts are kept`]
    case 'recording.script_linked': return [d.script ? `${who} compared ${d.filename} with the script ${d.script}` : `${who} unlinked the script from ${d.filename}`, '']
    case 'document.written': return [`${who} wrote ${d.title ?? d.filename} in Story Bible`, `${d.passages} passages, read-only once saved`]
    case 'document.version_written': return [`${who} saved version ${d.version} of ${d.title ?? d.filename}`, `${d.passages} passages · earlier versions are kept`]
    case 'citation.stale': return [`${d.title ?? d.filename}${inFolder(d)} v${d.version} makes ${d.fact_ids?.length ?? 0} citation(s) stale`,
      d.outdated_fact_ids ? `${d.outdated_fact_ids.length} lost their quote (evidence outdated) · ${d.unchanged_fact_ids?.length ?? 0} still read the same, waiting to be confirmed` : 'Re-check the facts that cite it']
    case 'citation.confirmed': return [`${who} confirmed ${d.citations?.length === 1 ? 'a citation' : `${d.citations?.length ?? 0} citations`}: the quote reads the same in ${d.citations?.[0]?.filename} v${d.citations?.[0]?.to?.version}`,
      `Now cites v${d.citations?.[0]?.to?.version}${d.citations?.[0]?.to?.line ? `, line ${d.citations[0].to.line}` : ''} (was v${d.citations?.[0]?.from?.version}): ${q(d.citations?.[0]?.quote)}`]
    case 'citation.kept': return [`${who} kept a citation of a canon fact as it is after its quote ${d.citations?.[0]?.quote_count ? 'appeared more than once in' : 'left'} ${d.citations?.[0]?.filename} v${d.citations?.[0]?.checked_against?.version}`,
      `Still cites v${d.citations?.[0]?.from?.version}: ${q(d.citations?.[0]?.quote)}`]
    case 'candidate.created':
      if (d.research_note_id) return [`${who} promoted a research note to a candidate: ${q(d.statement)}`, 'Cites the note, saved read-only · waiting for a human decision']
      if (d.via === 'mcp') return [`Agent “${d.token_name}” proposed a candidate for ${e.actor_name}`, 'Quote found in source · waiting for a human decision']
      return [`The AI proposed a candidate`, d.quote_verified ? 'Quote found in source' : 'Cannot be accepted: quote not found in source']
    case 'candidate.accepted': return [`${who} accepted a candidate: ${q(d.after?.statement)}`, [because(d), identity(d), d.bulk ? 'Part of one “accept all verified” decision' : ''].filter(Boolean).join(' · ')]
    case 'candidate.bulk_accepted': return [`${who} accepted ${counted(d.accepted?.length ?? 0, 'verified candidate')} in one decision`,
      `Confirmed from the listed candidates · each one is logged with its statement${d.skipped?.length ? ` · ${d.skipped.length} skipped (already decided or quote not found)` : ''}`]
    case 'candidate.corrected_and_accepted': return [`${who} corrected and accepted a candidate: ${q(d.after?.statement)}`, [because(d), identity(d)].filter(Boolean).join(' · ')]
    case 'candidate.evidence_moved': return [`A pending candidate now cites ${d.filename}${inFolder(d)} v${d.to?.version}${d.to?.line ? `, line ${d.to.line}` : ''}`,
      `Its quote appears exactly once in the new version (was v${d.from?.version}${d.from?.line ? `, line ${d.from.line}` : ''}): ${q(d.quote)} · still waiting for a human decision`]
    case 'candidate.evidence_added': return [`A pending candidate is also said in the recording ${q(d.title)}`,
      `The transcript states it again, so it now cites ${q(d.quote)} there too; no second candidate was made · still waiting for a human decision`]
    case 'candidate.accept_refused': return [`${who} tried to accept a candidate; it was refused`, 'Quote not found verbatim in the source']
    case 'fact.authored': return [d.to === 'canon' ? `${who} added a fact to canon: ${q(d.statement)}` : `${who} sent a fact to review: ${q(d.statement)}`,
      [`From the source: ${q(d.quote)}`, d.to === 'canon' ? 'Added by hand, a person’s decision' : 'Waiting for a human decision', identity(d)].filter(Boolean).join(' · ')]
    case 'project.reset': return [`${who} cleared this project to load ${SAMPLE_NAME[d.set] ?? d.set}`, 'Sources, facts, conflicts and changes were removed; earlier events stay in the trail']
    case 'sample.loaded': return [`${who} loaded ${d.name ?? SAMPLE_NAME[d.set] ?? d.set}: ${counted(d.documents ?? 0, 'document')}, ${d.facts?.length ? counted(d.facts.length, 'preloaded fact') : counted(d.candidates ?? 0, 'candidate')}`,
      d.facts?.length ? 'Sample canon, preloaded with verified quotes; no person decided it' : d.candidates ? 'Candidates wait for a human decision' : '']
    case 'research.created': return [`${who} researched ${q(d.question)}`, `Verdict: ${d.verdict}${d.sources ? ` · ${d.sources.verified} of ${d.sources.total} sources verified` : ''} · outside research, not canon`]
    case 'research.promoted': return [`${who} promoted a research note to a ${d.as === 'rule' ? 'world rule' : 'fact'} candidate`, q(d.statement)]
    case 'research.pinned': return [`${who} pinned a research note to a passage`, d.quote ? `On ${q(d.quote)}` : 'Editorial, not canon']
    case 'research.unpinned': return [`${who} unpinned a research note`, 'Editorial, not canon']
    case 'document.research_saved': return [`${who} saved a research note to the Library: ${d.title}`, `${d.passages} passages, read-only · the source promoted candidates cite`]
    case 'note.created': return [`${who} added a note: ${q(d.body)}`, d.quote ? `On ${q(d.quote)} · editorial, not canon` : 'Editorial, not canon']
    case 'note.updated': return [d.status ? `${who} marked a note ${d.status.to}` : `${who} edited a note`, [
      d.status ? `Was ${d.status.from}` : '', d.body ? `Now reads ${q(d.body.to)}` : '',
    ].filter(Boolean).join(' · ')]
    case 'candidate.rejected': return [`${who} rejected a candidate: ${q(d.statement)}`, because(d)]
    case 'conflict.detected': return [`Scan found a possible conflict (${String(d.rule).replaceAll('_', ' ').toLowerCase()})`, 'Awaiting a human decision']
    case 'conflict.scan': return [`${who} scanned canon for conflicts`, `${d.facts} canon facts checked, ${d.created} new ${d.created === 1 ? 'candidate' : 'candidates'}${d.model_error ? ' · world-rule check failed' : ''}`]
    case 'conflict.confirmed': return [`${who} confirmed a conflict`, because(d)]
    case 'conflict.false_positive': return [`${who} marked a conflict as a false alarm`, because(d)]
    case 'conflict.severity': return [`${who} changed a conflict from ${d.from} to ${d.to}`, because(d)]
    case 'conflict.uncertain': return [`${who} marked a conflict as uncertain`, because(d)]
    case 'change.created': return [`${who} proposed a canon change: ${q(d.proposed)}`, d.before ? `Replaces ${q(d.before)}` : '']
    case 'impact.completed': return [`${d.rerun ? `${who} re-ran impact analysis: ` : 'Impact analysis '}found ${d.items} item(s) to review`, d.scenes?.length ? `Scenes: ${d.scenes.join(', ')}` : d.items ? 'Scenes: none within 2 hops' : 'No impact found within 2 hops']
    case 'change.accepted': return [`${who} accepted a change proposal`, because(d)]
    case 'change.rejected': return [`${who} rejected a change proposal`, because(d)]
    case 'change.applied': return [`Canon updated: ${q(d.after)}`, d.before ? `Superseded ${q(d.before)}, kept in history` : '']
    case 'change.reverted': return [`${who} reverted a change, restoring ${q(d.restored)}`, because(d)]
    case 'task.created': return [`Applying the change created ${counted(d.count, 're-review task')}`, `Scenes: ${(d.scenes ?? []).join(', ')}`]
    case 'task.closed': return [`Reverting the change closed ${counted(d.count, 'unfinished re-review task')} as not needed`, 'Kept in the task list with their history']
    case 'task.updated': return [d.status ? `${who} marked the re-review of ${d.document} ${TASK_LABEL[d.status.to] ?? d.status.to}` : `${who} updated the re-review of ${d.document}`, [
      d.status ? `Was ${TASK_LABEL[d.status.from] ?? d.status.from}` : '', d.assignee ? (d.assignee.to ? `Assigned to ${d.assignee.to}` : 'Unassigned') : '',
      d.due_date ? (d.due_date.to ? `Due ${d.due_date.to}` : 'Due date removed') : '', d.comment ? `Comment: ${q(d.comment)}` : '',
    ].filter(Boolean).join(' · ')]
    case 'qa.asked': return [`${who} asked: ${q(d.question)}`, `Result: ${({ supported: 'Supported by canon', source_only: 'Related canon only', unknown: 'Unknown' } as Record<string, string>)[d.status] ?? d.status}`]
    case 'eval.completed': return [`${who} ran the evaluation`, `${d.passed} met, ${d.failed} missed`]
    case 'export.created': return [`${who} exported ${d.format?.toUpperCase()}`, d.items != null ? `${d.items} impact items` : d.events != null ? `${d.events} audit events` : '']
    case 'bible.exported': return [`${who} exported the ${d.book === 'manuscript' ? 'manuscript' : d.book === 'bible' ? 'story bible as a book' : 'story bible'} as ${({ md: 'Markdown', zip: 'Markdown with portraits', pdf: 'a PDF print view', epub: 'an EPUB' } as Record<string, string>)[d.format] ?? d.format}`,
      d.book === 'manuscript' ? `${d.scope} · ${counted(d.documents ?? 0, 'document')}, ${counted(d.words ?? 0, 'word')}` : `${d.scope} · ${counted(d.facts ?? 0, 'canon fact')}, ${counted(d.entities ?? 0, 'entity', 'entities')}`]
    case 'share.created': return [`${who} created the read-only link “${d.name}”`, `${d.scope} · ${counted(d.facts ?? 0, 'canon fact')} · ${d.expires_at ? `expires ${shortDate(d.expires_at)}` : 'never expires'} · stored hashed`]
    case 'share.revoked': return [`${who} turned off the read-only link “${d.name}”`, 'Opening it now says the link isn’t available']
    case 'share.opened': return [`The read-only link “${d.name}” was opened for the first time`, 'Later opens are counted on the link, not logged here']
    case 'agent.proposal_refused': return [`Agent “${d.token_name}” proposed a candidate and was refused for ${e.actor_name}`, `${String(d.code).replaceAll('_', ' ').toLowerCase()}, nothing stored: ${q(d.statement)}`]
    case 'account.profile_updated': return [`${who} updated their profile`, [d.name ? `Name: ${d.name.from} to ${d.name.to}` : '', d.email ? `Email: ${d.email.from} to ${d.email.to}` : ''].filter(Boolean).join(' · ')]
    case 'account.password_changed': return [`${who} changed their password`, 'The password itself is never logged']
    case 'token.created': return [`${who} created the API token “${d.name}”`, 'Shown once, stored hashed']
    case 'token.revoked': return [`${who} revoked an API token`, '']
    // Logged only when an agent does them (drafts are private, messages live in Ask): ids and titles, never a draft's text.
    case 'draft.created': return [`${who} started a private draft${d.title ? ` “${clip(d.title, 60)}”` : ''}`, 'Private to its author until saved']
    case 'draft.updated': return [`${who} edited a private draft${d.title ? ` “${clip(d.title, 60)}”` : ''}`, 'Private to its author until saved']
    case 'draft.deleted': return [`${who} discarded a private draft${d.title ? ` “${clip(d.title, 60)}”` : ''}`, '']
    case 'draft.saved': return [`${who} saved a draft to the story${d.title ? `: “${clip(d.title, 60)}”` : ''}`, d.unchanged ? 'The text was unchanged' : 'Now a read-only document version']
    case 'message.posted': return [`${who} posted in an Ask conversation`, d.mode === 'research' ? 'Research mode' : 'Canon mode']
    case 'entity.created': return [`${who} created a page for ${d.name}`, `${kindLabel(d.kind).one}`]
    case 'entity_type.created': return [`${who} added the entity type “${d.one}”`, 'Wiki structure · canon unaffected']
    case 'entity_type.updated': return [d.before?.one && d.before.one !== d.after?.one ? `${who} renamed the entity type “${d.before.one}” to “${d.after.one}”` : `${who} changed the entity type “${kindLabel(d.key).one}”`,
      `Changed: ${(d.changed ?? []).map((k: string) => ({ one: 'name', many: 'plural', color: 'colour', icon: 'icon' } as Record<string, string>)[k] ?? k).join(', ')} · pages keep their type`]
    case 'entity_type.deleted': return [`${who} removed the entity type “${d.one}”`, d.entities?.length ? `${counted(d.entities.length, 'page')} became ${d.moved_to_name}: ${d.entities.map((x: { name: string }) => x.name).join(', ')}` : 'No pages used it']
    case 'entity.updated': return [`${who} edited ${d.name}’s page`, `Changed: ${(d.changed ?? []).join(', ')}. Editorial, not canon`]
    case 'entity.merged': return [`${who} merged ${d.from?.name} into ${d.into}`, [
      d.facts?.length ? `${d.facts.length} fact${d.facts.length === 1 ? '' : 's'} now name ${d.canonical ?? d.into}` : 'No facts needed re-pointing',
      d.conflicts_resolved?.length ? `${d.conflicts_resolved.length} conflict${d.conflicts_resolved.length === 1 ? '' : 's'} resolved` : '',
      d.changes_stale?.length ? `${d.changes_stale.length} proposal${d.changes_stale.length === 1 ? ' needs' : 's need'} a fresh impact analysis` : '',
      `later candidates naming ${(d.names_mapped ?? [d.from?.name]).join(', ')} are saved as ${d.canonical ?? d.into}`,
      `${d.from?.name}’s old page is kept in this event`,
    ].filter(Boolean).join('; ')]
    case 'conflict.resolved_by_merge': return [`A conflict closed: ${d.from} was merged into ${d.into}`, `${String(d.rule).replaceAll('_', ' ').toLowerCase()} no longer applies`]
    case 'impact.stale': return [`A change proposal’s impact went out of date: ${d.from} was merged into ${d.into}`, 'Accept waits for a fresh analysis']
    case 'entity.deleted': return [`${who} deleted ${d.name}’s page`, 'Canon unaffected; the page text is kept in this event']
    case 'entity.portrait_set': return [`${who} ${d.replaced ? 'replaced' : 'added'} ${d.name}’s portrait`, '']
    case 'entity.portrait_removed': return [`${who} removed ${d.name}’s portrait`, '']
    case 'image.generated': return [`${who} generated ${d.images?.length ?? 0} image${d.images?.length === 1 ? '' : 's'} for ${d.name} with Muse Image`, `Editorial, not canon · prompt: ${q(d.prompt)}`]
    case 'image.uploaded': return [`${who} uploaded ${d.images?.length === 1 ? 'an image' : `${d.images?.length ?? 0} images`} to ${d.name}`, `Editorial, not canon · ${(d.files ?? []).join(', ')}`]
    case 'image.applied': return d.restored ? [`${who} undid removing the ${d.as ?? 'image'} of ${d.name}`, 'The image is back in use'] : [`${who} set ${d.source === 'upload' ? 'an uploaded' : d.source === 'generated' ? 'a generated' : 'an'} image as ${d.name}’s ${d.as ?? 'image'}`, d.replaced ? 'Replaced the previous one, which stays in the image history' : '']
    case 'image.discarded': return [`${who} deleted ${d.source === 'upload' ? 'an uploaded' : 'a generated'} image${d.name ? ` of ${d.name}` : ''}`, d.source === 'upload' ? `File was ${q(d.filename ?? 'unnamed')}` : `Prompt was ${q(d.prompt)}`]
    case 'image.captioned': return [`${who} ${d.to ? 'captioned' : 'removed the caption from'} an image of ${d.name}`, d.to ? q(d.to) : '']
    case 'image.cover_removed': return [`${who} removed ${d.name ? `${d.name}’s` : 'a document’s'} cover`, 'The image stays in its history']
    case 'folder.created': return [`${who} created the folder ${d.parent ? `${d.parent} / ` : ''}${d.name}`, 'Library label · sources unchanged']
    case 'folder.renamed': return [`${who} renamed the folder ${d.from} to ${d.to}`, 'Library label · sources unchanged']
    case 'folder.deleted': return [`${who} deleted the folder ${d.name}`, `${d.documents ? `${d.documents} document${d.documents === 1 ? '' : 's'} moved to ${d.to ?? 'the Library root'}` : 'It was empty'}${d.subfolders ? ` · ${d.subfolders} subfolder${d.subfolders === 1 ? '' : 's'} moved up` : ''} · nothing deleted`]
    case 'tag.created': return [`${who} created the tag “${d.name}”`, 'Library label · sources unchanged']
    case 'tag.updated': return [d.from?.name !== d.to?.name ? `${who} renamed the tag “${d.from?.name}” to “${d.to?.name}”` : `${who} recoloured the tag “${d.to?.name}”`, 'Library label · sources unchanged']
    case 'tag.deleted': return [`${who} deleted the tag “${d.name}”`, d.documents ? `Removed from ${d.documents} document${d.documents === 1 ? '' : 's'} · nothing deleted` : 'It was on no documents']
    case 'document.organised': {
      const docs: { title: string }[] = d.documents ?? []
      const what = docs.length === 1 ? docs[0]!.title : `${docs.length} documents`
      const did = [
        d.title ? `renamed ${q(d.title.from)} to ${q(d.title.to)}` : '',
        d.folder ? (d.folder.to ? `moved ${what} to ${d.folder.to}` : `took ${what} out of ${d.folder.from?.filter(Boolean).join(', ') || 'their folder'}`) : '',
        d.kind ? `set ${what} to ${d.kind.to}` : '',
        d.tags_added?.length ? `tagged ${what} ${d.tags_added.map((t: string) => `“${t}”`).join(', ')}` : '',
        d.tags_removed?.length ? `removed ${d.tags_removed.map((t: string) => `“${t}”`).join(', ')} from ${what}` : '',
      ].filter(Boolean).join('; ')
      return [`${who} ${did}`, `${docs.length > 1 ? `${clip(docs.map(x => x.title).join(', '), 120)} · ` : ''}Labels only: text and hash unchanged`]
    }
    case 'document.reextracted': return [`${who} re-extracted ${d.title ?? d.filename} v${d.version}`, [
      `${d.created} new candidate${d.created === 1 ? '' : 's'} sent to review`,
      Object.values(d.skipped ?? {}).length ? `${Object.values(d.skipped as Record<string, number>).reduce((a, b) => a + b, 0)} already in the project, skipped` : '',
      'AI',
      'canon unchanged',
    ].filter(Boolean).join(' · ')]
    case 'job.failed': return [`${d.step === 're-extraction' ? 'Re-extraction' : 'Extraction'} failed for ${d.filename ?? 'a document'}`, clip(d.error, 140)]
    default: return [e.event_type, clip(d)]
  }
}

const TONE: Record<string, 'accent' | 'good' | 'bad' | 'warn' | 'pencil' | 'neutral'> = {
  candidate: 'pencil', conflict: 'bad', change: 'accent', impact: 'accent', document: 'neutral', citation: 'warn', qa: 'neutral', eval: 'neutral', export: 'neutral', job: 'bad', entity: 'neutral', image: 'neutral', agent: 'bad', token: 'neutral', fact: 'accent', note: 'pencil', task: 'pencil', folder: 'neutral', tag: 'neutral', library: 'neutral', bible: 'neutral', share: 'neutral',
}

// Short ID plus a link where a page exists; pages have no per-item anchors, so links go to the list.
function target(e: { event_type: string, target_type: string, target_id: string, target_removed: boolean }) {
  const t = e.target_type
  const short = e.target_id.replace(/^[a-z]+_/, '').slice(0, 6)
  if (e.target_removed) return { to: '', label: `${t.charAt(0).toUpperCase() + t.slice(1)} · ${short}… (removed by reset)` }
  if (t === 'entity_type') return { to: `/settings/projects/${me.value?.current?.project.id}#entity-types`, label: `Entity type · ${e.target_id}` }
  const to = t === 'entity' ? (e.event_type === 'entity.deleted' ? '' : `/entities/${e.target_id}`) : t === 'document' ? `/documents/${e.target_id}` : t === 'conflict' || e.event_type === 'conflict.scan' ? '/conflicts' : t === 'change' ? '/changes'
    : t === 'fact' ? (e.event_type.startsWith('candidate.') && !e.event_type.endsWith('accepted') ? '/review' : '/canon') : t === 'note' ? '/notes' : t === 'research_note' ? `/research/${e.target_id}` : t === 'task' ? '/tasks' : t === 'share' || e.event_type === 'bible.exported' ? '/export' : ['folder', 'tag', 'library'].includes(t) ? '/library' : ''
  // Ids already carry a type prefix ("fact_d0e…", "trc_e02c…"): drop it and label the thing in words.
  const noun = e.target_id.startsWith('trc_') ? 'Model call' : t === 'research_note' ? 'Research note' : t.charAt(0).toUpperCase() + t.slice(1)
  return { to: e.target_id.startsWith('trc_') ? '/metrics' : to, label: `${noun} · ${short}…` }
}

// Compared as formatted dates, so "Today" follows the same time zone as every date on the page.
const day = (iso: string) => {
  const d = shortDate(iso)
  const now = new Date().toISOString()
  return d === shortDate(now) ? 'Today' : d === shortDateBack(now, 1) ? 'Yesterday' : d
}
const groups = computed(() => {
  const out: { day: string, items: typeof shown.value }[] = []
  for (const e of shown.value) {
    const k = day(e.created_at)
    if (out.at(-1)?.day === k) out.at(-1)!.items.push(e)
    else out.push({ day: k, items: [e] })
  }
  return out
})
</script>

<template>
  <UiPageHeader title="Audit trail" description="Append-only history of imports, proposals, human decisions and canon changes. Nothing here can be edited.">
    <template #actions>
      <a class="btn" href="/api/audit/export?format=json" download>Export JSON</a>
      <a class="btn" href="/api/audit/export?format=md" download>Export Markdown</a>
    </template>
  </UiPageHeader>

  <div v-if="events?.length" class="filters" role="group" aria-label="Filter by event type">
    <button type="button" class="f" :class="{ on: !filter }" :aria-pressed="!filter" @click="filter = ''">All <span>{{ events.length }}</span></button>
    <button v-for="t in types" :key="t" type="button" class="f" :class="{ on: filter === t }" :aria-pressed="filter === t" @click="filter = t">{{ t.replace('_', ' ') }} <span>{{ count(t) }}</span></button>
  </div>

  <UiEmptyState v-if="!shown.length" title="No events yet" icon="audit">Imports, decisions and exports show up here as they happen.</UiEmptyState>
  <template v-else>
    <section v-for="g in groups" :key="g.day" class="day">
      <h2>{{ g.day }}</h2>
      <ol class="events">
        <li v-for="e in g.items" :id="e.id" :key="e.id" :class="{ hit: route.hash === `#${e.id}` }">
          <time class="mono small faint" :datetime="e.created_at">{{ clock(e.created_at) }}</time>
          <UiBadge :tone="TONE[e.event_type.split('.')[0]!] ?? 'neutral'" class="kind">{{ e.event_type.split('.')[0] }}</UiBadge>
          <div class="what">
            <div>{{ sentence(e)[0] }}</div>
            <div v-if="sentence(e)[1]" class="small muted">{{ sentence(e)[1] }}</div>
            <div v-if="e.target_id" class="small faint mono">
              <NuxtLink v-if="target(e).to" :to="target(e).to">{{ target(e).label }}</NuxtLink>
              <template v-else>{{ target(e).label }}</template>
            </div>
          </div>
        </li>
      </ol>
    </section>
  </template>
</template>

<style scoped>
.filters { display: flex; flex-wrap: wrap; gap: var(--s-2); margin-bottom: var(--s-5); }
.f { font: inherit; font-size: var(--text-sm); color: var(--muted); background: var(--raised); border: 1px solid var(--line-strong); border-radius: var(--r-md); padding: 6px 12px; min-height: 34px; cursor: pointer; }
.f span { color: var(--faint); margin-left: 4px; }
.f:hover { color: var(--ink); }
.f.on { background: var(--accent); border-color: var(--accent); color: var(--accent-ink); }
.f.on span { color: inherit; opacity: .8; }
.day { margin-bottom: var(--s-5); }
.day h2 { font-size: var(--text-sm); color: var(--muted); font-weight: 600; margin: 0 0 var(--s-2); }
.events { list-style: none; margin: 0; padding: 0; border: 1px solid var(--line); border-radius: var(--r-lg); background: var(--raised); }
.events li { display: grid; grid-template-columns: 84px 92px 1fr; gap: var(--s-3); align-items: start; padding: var(--s-3) var(--s-4); }
.events li { scroll-margin-top: 72px; } /* clears the sticky mobile top bar */
.events li.hit { background: var(--accent-soft); box-shadow: inset 3px 0 0 var(--accent); }
.events li + li { border-top: 1px solid var(--line); }
.events time { white-space: nowrap; }
.kind { justify-self: start; }
.what { min-width: 0; overflow-wrap: anywhere; }
@media (max-width: 720px) {
  .f { min-height: 44px; }
  .events li { grid-template-columns: auto 1fr; gap: var(--s-1) var(--s-3); }
  .what { grid-column: 1 / -1; }
}
</style>
