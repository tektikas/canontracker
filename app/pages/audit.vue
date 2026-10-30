<script setup lang="ts">
const { data: events } = await useFetch('/api/audit')
const filter = ref('')
const shown = computed(() => (events.value ?? []).filter(e => !filter.value || e.event_type.startsWith(filter.value)))
const types = computed(() => [...new Set((events.value ?? []).map(e => e.event_type.split('.')[0]!))])
const count = (t: string) => (events.value ?? []).filter(e => e.event_type.startsWith(t)).length

const clip = (v: unknown, n = 90) => {
  const t = typeof v === 'string' ? v : v == null ? '' : JSON.stringify(v)
  return t.length > n ? `${t.slice(0, n - 1)}…` : t
}
const q = (v: unknown) => (v ? `“${clip(v)}”` : '')
const because = (d: Record<string, any>) => (d.rationale ? `Reason: ${clip(d.rationale, 140)}` : '')

// One plain sentence per event type; unknown types fall back to the raw event name.
function sentence(e: { event_type: string, actor_name: string, target_id: string, detail: Record<string, any> }) {
  const d = e.detail
  const who = e.actor_name
  switch (e.event_type) {
    case 'document.imported': return [`${who} imported ${d.filename}`, `${d.passages} passages, read-only`]
    case 'document.version_added': return [`${who} imported version ${d.version} of ${d.filename}`, `${d.passages} passages`]
    case 'citation.stale': return [`${d.filename} v${d.version} makes ${d.fact_ids?.length ?? 0} citation(s) stale`, 'Re-check the facts that cite it']
    case 'candidate.created': return [`The model proposed a candidate`, d.quote_verified ? 'Quote found in source' : 'Cannot be accepted: quote not found in source']
    case 'candidate.accepted': return [`${who} accepted a candidate: ${q(d.after?.statement)}`, because(d)]
    case 'candidate.corrected_and_accepted': return [`${who} corrected and accepted a candidate: ${q(d.after?.statement)}`, because(d)]
    case 'candidate.rejected': return [`${who} rejected a candidate: ${q(d.statement)}`, because(d)]
    case 'conflict.detected': return [`Scan found a possible conflict (${String(d.rule).replaceAll('_', ' ').toLowerCase()})`, 'Awaiting a human decision']
    case 'conflict.confirmed': return [`${who} confirmed a conflict`, because(d)]
    case 'conflict.false_positive': return [`${who} marked a conflict as a false alarm`, because(d)]
    case 'conflict.uncertain': return [`${who} marked a conflict as uncertain`, because(d)]
    case 'change.created': return [`${who} proposed a canon change: ${q(d.proposed)}`, d.before ? `Replaces ${q(d.before)}` : '']
    case 'impact.completed': return [`Impact analysis found ${d.items} item(s) to review`, d.scenes?.length ? `Scenes: ${d.scenes.join(', ')}` : d.items ? 'Scenes: none within 2 hops' : 'No impact found within 2 hops']
    case 'change.accepted': return [`${who} accepted a change proposal`, because(d)]
    case 'change.rejected': return [`${who} rejected a change proposal`, because(d)]
    case 'change.applied': return [`Canon updated: ${q(d.after)}`, d.before ? `Superseded ${q(d.before)}, kept in history` : '']
    case 'change.reverted': return [`${who} reverted a change, restoring ${q(d.restored)}`, because(d)]
    case 'qa.asked': return [`${who} asked: ${q(d.question)}`, `Result: ${({ supported: 'Supported by canon', source_only: 'Related canon only', unknown: 'Unknown' } as Record<string, string>)[d.status] ?? d.status}`]
    case 'eval.completed': return [`${who} ran the evaluation`, `${d.passed} met, ${d.failed} missed`]
    case 'export.created': return [`${who} exported ${d.format?.toUpperCase()}`, d.items != null ? `${d.items} impact items` : d.events != null ? `${d.events} audit events` : '']
    case 'entity.created': return [`${who} created a page for ${d.name}`, `${KIND_LABEL[d.kind as EntityKind]?.one ?? d.kind}`]
    case 'entity.updated': return [`${who} edited ${d.name}’s page`, `Changed: ${(d.changed ?? []).join(', ')}. Editorial, not canon`]
    case 'entity.merged': return [`${who} merged ${d.from?.name} into ${d.into}`, `${d.facts?.length ? `${d.facts.length} fact${d.facts.length === 1 ? '' : 's'} now name ${d.into}` : 'No facts needed re-pointing'}; ${d.from?.name}’s old page is kept in this event`]
    case 'entity.deleted': return [`${who} deleted ${d.name}’s page`, 'Canon unaffected; the page text is kept in this event']
    case 'entity.portrait_set': return [`${who} ${d.replaced ? 'replaced' : 'added'} ${d.name}’s portrait`, '']
    case 'entity.portrait_removed': return [`${who} removed ${d.name}’s portrait`, '']
    case 'job.failed': return [`Extraction failed for ${d.filename ?? 'a document'}`, clip(d.error, 140)]
    default: return [e.event_type, clip(d)]
  }
}

const TONE: Record<string, 'accent' | 'good' | 'bad' | 'warn' | 'pencil' | 'neutral'> = {
  candidate: 'pencil', conflict: 'bad', change: 'accent', impact: 'accent', document: 'neutral', citation: 'warn', qa: 'neutral', eval: 'neutral', export: 'neutral', job: 'bad', entity: 'neutral',
}

// Short ID plus a link where a page exists; pages have no per-item anchors, so links go to the list.
function target(e: { event_type: string, target_type: string, target_id: string }) {
  const t = e.target_type
  const to = t === 'entity' ? (e.event_type === 'entity.deleted' ? '' : `/entities/${e.target_id}`) : t === 'document' ? `/documents/${e.target_id}` : t === 'conflict' ? '/conflicts' : t === 'change' ? '/changes'
    : t === 'fact' ? (e.event_type.startsWith('candidate.') ? '/review' : '/canon') : ''
  return { to, label: `${t} ${e.target_id.slice(0, 8)}` }
}
const hms = (iso: string) => new Date(iso).toLocaleTimeString('en-GB', { hour12: false })

const day = (iso: string) => {
  const d = new Date(iso)
  const days = Math.round((new Date().setHours(0, 0, 0, 0) - new Date(d).setHours(0, 0, 0, 0)) / 864e5)
  return days === 0 ? 'Today' : days === 1 ? 'Yesterday' : d.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })
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
    <button v-for="t in types" :key="t" type="button" class="f" :class="{ on: filter === t }" :aria-pressed="filter === t" @click="filter = t">{{ t }} <span>{{ count(t) }}</span></button>
  </div>

  <UiEmptyState v-if="!shown.length" title="No events yet" icon="audit">Imports, decisions and exports show up here as they happen.</UiEmptyState>
  <template v-else>
    <section v-for="g in groups" :key="g.day" class="day">
      <h2>{{ g.day }}</h2>
      <ol class="events">
        <li v-for="e in g.items" :key="e.id">
          <time class="mono small faint" :datetime="e.created_at">{{ hms(e.created_at) }}</time>
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
.events li + li { border-top: 1px solid var(--line); }
.events time { white-space: nowrap; }
.kind { justify-self: start; }
.what { min-width: 0; overflow-wrap: anywhere; }
@media (max-width: 720px) {
  .events li { grid-template-columns: auto 1fr; gap: var(--s-1) var(--s-3); }
  .what { grid-column: 1 / -1; }
}
</style>
