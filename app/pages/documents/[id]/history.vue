<script setup lang="ts">
// Every saved version of one document and what changed between any two, passage by passage. For each passage of the older
// version that was changed or removed, the canon facts that cite it: re-check those before the next build. Read-only.
const route = useRoute()
const router = useRouter()
const { data: doc, error } = await useFetch(() => `/api/documents/${route.params.id}`)
useHead({ title: computed(() => `History · ${doc.value?.title ?? 'Document'} · Story Bible`) })

const versions = computed(() => doc.value?.versions ?? [])
// Compare `from` (older) → `to` (newer), as ids of two versions; versions are listed newest first. Default: the version you came
// from against the one before it, or, from the first version, the latest against the one before it. A pair picked the wrong
// way round is swapped, so the sides are always labelled by version number and the diff is never empty.
const pair = computed(() => {
  const vs = versions.value
  const at = (id: unknown) => vs.findIndex(v => v.id === id)
  let t = at(route.query.to)
  if (t < 0) {
    t = at(doc.value?.id)
    if (t < 0 || t === vs.length - 1) t = 0
  }
  let f = at(route.query.from)
  if (f < 0 || f === t) f = t + 1 < vs.length ? t + 1 : t - 1
  if (f < t) [f, t] = [t, f]
  return { to: vs[t]?.id ?? '', from: vs[f]?.id ?? '' }
})
const toId = computed<string>({
  get: () => pair.value.to,
  set: v => router.replace({ query: { ...route.query, from: pair.value.from, to: v } }),
})
const fromId = computed<string>({
  get: () => pair.value.from,
  set: v => router.replace({ query: { ...route.query, to: pair.value.to, from: v } }),
})
const verOf = (id: string) => versions.value.find(v => v.id === id)
const { data: diff, pending, error: diffError } = await useFetch(() => `/api/documents/${toId.value}/diff`, {
  query: computed(() => ({ from: fromId.value })),
  immediate: !!fromId.value,
  watch: [fromId, toId],
})
function compare(from: string, to: string) {
  router.replace({ query: { ...route.query, from, to } })
}

type View = 'inline' | 'split'
const view = ref<View>('inline')
const views = [{ value: 'inline' as View, label: 'Inline' }, { value: 'split' as View, label: 'Side by side' }]
// Runs of unchanged passages fold into one row; open one to read it. An unchanged passage that canon must re-check anyway (its
// quote now also appears elsewhere in the newer version) stands on its own, with its facts.
type Row = NonNullable<typeof diff.value>['rows'][number]
const blocks = computed(() => {
  const out: ({ kind: 'same', rows: Row[], key: string } | { kind: 'edit', row: Row, key: string })[] = []
  for (const [i, r] of (diff.value?.rows ?? []).entries()) {
    if (r.op === 'same' && !r.facts.length) {
      const last = out.at(-1)
      if (last?.kind === 'same') last.rows.push(r)
      else out.push({ kind: 'same', rows: [r], key: `s${i}` })
    } else out.push({ kind: 'edit', row: r, key: `e${i}` })
  }
  return out
})
const unfolded = ref(new Set<string>())
const unfold = (k: string) => { unfolded.value = new Set([...unfolded.value, k]) }
const lineOf = (p?: { start_line: number, end_line: number }) => (p ? `${p.start_line}${p.end_line !== p.start_line ? `–${p.end_line}` : ''}` : '')
// Gutter fits the longest line label in this diff (a changed passage reads "113–115→143–145").
const gutter = computed(() => `${Math.max(4, ...(diff.value?.rows ?? []).map(r => (r.from && r.to ? `${lineOf(r.from)}→${lineOf(r.to)}` : lineOf(r.from ?? r.to)).length)) + 1}ch`)
const OP_LABEL = { changed: 'Changed', removed: 'Removed', added: 'Added', same: 'Unchanged' } as const
const how = (v: { origin: string, created_by_name: string | null }) => `${v.origin === 'written' ? 'Written in Story Bible' : 'Uploaded'}${v.created_by_name ? ` by ${v.created_by_name}` : ''}`
</script>

<template>
  <UiPanel v-if="error">
    <UiEmptyState title="Document not found" icon="file">
      It may have been removed, or it belongs to another project.
      <template #actions><UiButton to="/library">Back to the library</UiButton></template>
    </UiEmptyState>
  </UiPanel>
  <template v-else-if="doc">
    <nav class="crumbs small" aria-label="Breadcrumb">
      <NuxtLink to="/library">Library</NuxtLink><span aria-hidden="true">/</span>
      <template v-if="doc.folder"><NuxtLink :to="`/library?folder=${doc.folder.id}`">{{ doc.folder.path }}</NuxtLink><span aria-hidden="true">/</span></template>
      <NuxtLink :to="`/documents/${doc.latest.id}`">{{ doc.title }}</NuxtLink><span aria-hidden="true">/</span><span>History</span>
    </nav>
    <UiPageHeader :title="`History of ${doc.title}`">
      {{ counted(versions.length, 'version') }}. Saved versions never change; a new upload or save adds the next one. Compare any two to see what changed and which canon to re-check.
      <template #actions><UiButton icon="file" :to="`/documents/${doc.latest.id}`">Open v{{ doc.latest.version }}</UiButton></template>
    </UiPageHeader>

    <div class="layout">
      <UiPanel title="Versions" as="aside" class="versions" flush>
        <ol class="v-list">
          <li v-for="(v, i) in versions" :key="v.id" :class="{ on: v.id === toId, from: v.id === fromId }">
            <div class="v-top">
              <b>v{{ v.version }}</b>
              <UiBadge v-if="v.id === doc.latest.id" tone="accent">Latest</UiBadge>
              <UiBadge v-if="v.id === toId" tone="neutral">Newer side</UiBadge>
              <UiBadge v-else-if="v.id === fromId" tone="pencil">Older side</UiBadge>
            </div>
            <span class="small muted">{{ how(v) }}</span>
            <span class="small faint">{{ dateTime(v.imported_at) }} · {{ counted(v.passages, 'passage') }} · <span class="mono" :title="`sha256 ${v.sha256}`">{{ v.sha256.slice(0, 8) }}</span></span>
            <div class="row v-actions">
              <UiButton v-if="versions[i + 1]" size="sm" :disabled="v.id === toId && versions[i + 1]!.id === fromId" @click="compare(versions[i + 1]!.id, v.id)">Compare with v{{ versions[i + 1]!.version }}</UiButton>
              <UiButton size="sm" variant="ghost" :to="`/documents/${v.id}`">Open</UiButton>
            </div>
          </li>
        </ol>
      </UiPanel>

      <section class="panel flush diff" aria-label="What changed">
        <UiEmptyState v-if="versions.length < 2" icon="history" title="Only one version so far">
          {{ doc.origin === 'written' ? 'Edit the document and save it to the story: the saved text becomes v2, and this page shows what changed.' : 'Edit the text here, or upload a changed file with the same name: either becomes v2. This page then shows what changed and which canon to re-check.' }}
        </UiEmptyState>
        <template v-else>
          <div class="diff-head">
            <div class="pick">
              <label>
                <span class="sr-only">Older version</span>
                <select :value="fromId" aria-label="Older version" @change="fromId = ($event.target as HTMLSelectElement).value">
                  <option v-for="v in versions" :key="v.id" :value="v.id" :disabled="v.id === toId">v{{ v.version }}</option>
                </select>
              </label>
              <UiIcon name="arrow" :size="16" />
              <label>
                <span class="sr-only">Newer version</span>
                <select :value="toId" aria-label="Newer version" @change="toId = ($event.target as HTMLSelectElement).value">
                  <option v-for="v in versions" :key="v.id" :value="v.id" :disabled="v.id === fromId">v{{ v.version }}</option>
                </select>
              </label>
            </div>
            <div class="seg" role="radiogroup" aria-label="Layout">
              <button v-for="o in views" :key="o.value" type="button" role="radio" :aria-checked="view === o.value" :class="{ on: view === o.value }" @click="view = o.value">{{ o.label }}</button>
            </div>
          </div>

          <p v-if="diffError" class="notice bad m" role="alert">{{ errorMessage(diffError) }}</p>
          <p v-else-if="pending && !diff" class="small muted m">Comparing…</p>
          <template v-else-if="diff">
            <div class="summary">
              <UiBadge v-if="diff.counts.changed" tone="warn">{{ diff.counts.changed }} changed</UiBadge>
              <UiBadge v-if="diff.counts.added" tone="good">{{ diff.counts.added }} added</UiBadge>
              <UiBadge v-if="diff.counts.removed" tone="bad">{{ diff.counts.removed }} removed</UiBadge>
              <span class="small faint">{{ diff.counts.same }} unchanged</span>
              <span v-if="!diff.counts.changed && !diff.counts.added && !diff.counts.removed" class="small muted">The text of v{{ diff.from.version }} and v{{ diff.to.version }} is the same.</span>
            </div>
            <p v-if="diff.recheck" class="notice m" :class="diff.outdated ? 'bad' : 'warn'" role="status">
              <UiIcon name="conflicts" :size="16" />
              <span>
                <b>{{ counted(diff.recheck, 'canon citation') }} to re-check<template v-if="diff.outdated">: {{ diff.outdated === diff.recheck ? (diff.recheck === 1 ? 'its evidence is' : 'all are') : `${diff.outdated} with evidence` }} outdated in v{{ diff.to.version }}</template>.</b>
                Re-check each one below: propose a change if it no longer holds, and see its impact before the next build. <NuxtLink to="/canon?recheck=1">All canon to re-check</NuxtLink>
              </span>
            </p>
            <p v-else class="small muted m">
              No canon cites the changed text.<template v-if="diff.unchanged_citations"> {{ counted(diff.unchanged_citations, 'citation') }} on v{{ diff.from.version }} {{ diff.unchanged_citations === 1 ? 'points' : 'point' }} at passages that read the same in v{{ diff.to.version }}.</template>
            </p>

            <div class="rows" :class="view" :style="{ '--gutter': gutter }">
              <div v-if="view === 'split'" class="split-head" aria-hidden="true"><span>v{{ diff.from.version }}</span><span>v{{ diff.to.version }}</span></div>
              <template v-for="b in blocks" :key="b.key">
                <template v-if="b.kind === 'same'">
                  <button v-if="!unfolded.has(b.key) && b.rows.length > 1" type="button" class="fold" @click="unfold(b.key)">
                    <UiIcon name="chevrons" :size="14" />{{ counted(b.rows.length, 'unchanged passage') }}
                  </button>
                  <div v-for="r in (unfolded.has(b.key) || b.rows.length === 1 ? b.rows : [])" :key="r.from!.id" class="drow same">
                    <template v-if="view === 'split'">
                      <div class="cell"><span class="ln">{{ lineOf(r.from) }}</span><span class="txt">{{ r.from!.text }}</span></div>
                      <div class="cell"><span class="ln">{{ lineOf(r.to) }}</span><span class="txt">{{ r.to!.text }}</span></div>
                    </template>
                    <div v-else class="cell"><span class="ln">{{ lineOf(r.to) }}</span><span class="txt">{{ r.to!.text }}</span></div>
                  </div>
                </template>
                <div v-else class="drow" :class="b.row.op">
                  <span class="op-label small">{{ OP_LABEL[b.row.op] }}</span>
                  <template v-if="view === 'split'">
                    <div class="cell old">
                      <span class="ln">{{ lineOf(b.row.from) }}</span>
                      <span v-if="b.row.op === 'changed'" class="txt"><template v-for="(w, i) in b.row.words" :key="i"><del v-if="w.t === 'del'">{{ w.text }}</del><span v-else-if="w.t === 'same'">{{ w.text }}</span></template></span>
                      <span v-else-if="b.row.op === 'same'" class="txt">{{ b.row.from!.text }}</span>
                      <span v-else-if="b.row.from" class="txt"><del>{{ b.row.from.text }}</del></span>
                    </div>
                    <div class="cell new">
                      <span class="ln">{{ lineOf(b.row.to) }}</span>
                      <span v-if="b.row.op === 'changed'" class="txt"><template v-for="(w, i) in b.row.words" :key="i"><ins v-if="w.t === 'ins'">{{ w.text }}</ins><span v-else-if="w.t === 'same'">{{ w.text }}</span></template></span>
                      <span v-else-if="b.row.op === 'same'" class="txt">{{ b.row.to!.text }}</span>
                      <span v-else-if="b.row.to" class="txt"><ins>{{ b.row.to.text }}</ins></span>
                    </div>
                  </template>
                  <div v-else class="cell">
                    <span class="ln">{{ b.row.op === 'removed' ? lineOf(b.row.from) : b.row.op === 'changed' && lineOf(b.row.from) !== lineOf(b.row.to) ? `${lineOf(b.row.from)}→${lineOf(b.row.to)}` : lineOf(b.row.to) }}</span>
                    <span v-if="b.row.op === 'changed'" class="txt"><template v-for="(w, i) in b.row.words" :key="i"><del v-if="w.t === 'del'">{{ w.text }}</del><ins v-else-if="w.t === 'ins'">{{ w.text }}</ins><span v-else>{{ w.text }}</span></template></span>
                    <span v-else-if="b.row.op === 'removed'" class="txt"><del>{{ b.row.from!.text }}</del></span>
                    <span v-else-if="b.row.op === 'same'" class="txt">{{ b.row.to!.text }}</span>
                    <span v-else class="txt"><ins>{{ b.row.to!.text }}</ins></span>
                  </div>
                  <ul v-if="b.row.facts.length" class="recheck">
                    <li v-for="f in b.row.facts" :key="f.id">
                      <div class="rc-top">
                        <UiBadge v-if="f.outdated" tone="bad" dot>Evidence outdated</UiBadge>
                        <UiBadge v-else tone="warn">Quote unchanged</UiBadge>
                        <span class="small muted">Canon fact citing v{{ diff.from.version }}, line {{ lineOf(b.row.from) }}; <template v-if="f.outdated">the {{ quoteLost(f.quote_count, diff.to.version).toLowerCase() }}</template><template v-else>the quote still reads the same in v{{ diff.to.version }}</template></span>
                      </div>
                      <p class="statement">{{ f.statement }}</p>
                      <blockquote class="quote prior">{{ f.quote }}</blockquote>
                      <div class="row">
                        <UiButton size="sm" :to="`/changes?target=${f.id}`" icon="changes">Propose a change</UiButton>
                        <UiButton size="sm" variant="ghost" :to="`/documents/${diff.from.id}#${b.row.from!.id}`">See it in v{{ diff.from.version }}</UiButton>
                        <UiButton v-if="b.row.to" size="sm" variant="ghost" :to="`/documents/${diff.to.id}#${b.row.to.id}`">See v{{ diff.to.version }}</UiButton>
                      </div>
                    </li>
                  </ul>
                </div>
              </template>
            </div>
          </template>
        </template>
      </section>
    </div>
    <p v-if="verOf(toId) && verOf(fromId)" class="sr-only" role="status">Comparing v{{ verOf(fromId)!.version }} with v{{ verOf(toId)!.version }}</p>
  </template>
</template>

<style scoped>
.sr-only { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }
.crumbs { display: flex; flex-wrap: wrap; gap: var(--s-2); align-items: center; color: var(--muted); margin-bottom: var(--s-2); }
.crumbs a { color: var(--muted); }
.layout { display: grid; grid-template-columns: 260px minmax(0, 1fr); gap: var(--s-4); align-items: start; }
.versions { position: sticky; top: var(--s-5); }
.v-list { list-style: none; margin: 0; padding: 0; }
.v-list li { display: grid; gap: 2px; padding: var(--s-3) var(--s-4); border-top: 1px solid var(--line); }
.v-list li.on { box-shadow: inset 3px 0 0 var(--accent); background: var(--accent-soft); }
.v-list li.from { box-shadow: inset 3px 0 0 var(--pencil); }
.v-top { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; }
.v-actions { margin-top: 6px; }
.diff-head { display: flex; flex-wrap: wrap; gap: var(--s-3); align-items: center; justify-content: space-between; padding: var(--s-3) var(--s-4); border-bottom: 1px solid var(--line); }
.pick { display: flex; align-items: center; gap: var(--s-2); color: var(--faint); }
.pick select { width: auto; min-width: 84px; }
.seg { display: inline-flex; padding: 2px; border: 1px solid var(--line-strong); border-radius: var(--r-md); background: var(--surface); }
.seg button { min-height: 28px; padding: 2px 12px; border: 0; border-radius: var(--r-sm); background: none; color: var(--muted); font: 500 var(--text-sm) var(--font-ui); cursor: pointer; }
.seg button.on { background: var(--raised); color: var(--ink); box-shadow: 0 0 0 1px var(--line); }
.summary { display: flex; flex-wrap: wrap; gap: var(--s-2); align-items: center; padding: var(--s-3) var(--s-4) 0; }
.m { margin: var(--s-3) var(--s-4) 0; }
.notice svg { flex: none; margin-top: 2px; }
.rows { display: grid; gap: 6px; padding: var(--s-4); }
.split-head { display: grid; grid-template-columns: 1fr 1fr; gap: var(--s-3); padding: 0 var(--s-2); font-size: var(--text-xs); font-weight: 600; color: var(--faint); }
.drow { position: relative; display: grid; gap: var(--s-2); padding: 8px 10px; border-radius: var(--r-md); border: 1px solid transparent; }
.split .drow { grid-template-columns: 1fr 1fr; }
.split .drow .op-label, .split .drow .recheck { grid-column: 1 / -1; }
.drow.same { color: var(--muted); }
.drow.changed { border-color: color-mix(in srgb, var(--warn) 35%, transparent); background: color-mix(in srgb, var(--warn-soft) 55%, transparent); }
.drow.added { border-color: color-mix(in srgb, var(--good) 35%, transparent); background: color-mix(in srgb, var(--good-soft) 55%, transparent); }
.drow.removed { border-color: color-mix(in srgb, var(--bad) 35%, transparent); background: color-mix(in srgb, var(--bad-soft) 55%, transparent); }
.op-label { font-weight: 600; color: var(--muted); }
.changed .op-label { color: var(--warn); }
.added .op-label { color: var(--good); }
.removed .op-label { color: var(--bad); }
.cell { display: grid; grid-template-columns: var(--gutter, 52px) minmax(0, 1fr); gap: var(--s-2); min-width: 0; }
.ln { font-family: var(--font-code); font-size: var(--text-xs); color: var(--faint); padding-top: 3px; text-align: right; white-space: nowrap; }
.txt { font-family: var(--font-story); font-size: var(--text-md); line-height: 1.65; white-space: pre-wrap; overflow-wrap: anywhere; }
del { background: var(--bad-soft); color: var(--bad); text-decoration: line-through; text-decoration-color: color-mix(in srgb, var(--bad) 60%, transparent); border-radius: 2px; }
ins { background: var(--good-soft); color: var(--good); text-decoration: none; border-radius: 2px; }
.fold { display: flex; align-items: center; gap: 6px; width: 100%; min-height: 32px; padding: 4px 10px; border: 1px dashed var(--line-strong); border-radius: var(--r-md); background: none; color: var(--muted); font: 500 var(--text-sm) var(--font-ui); cursor: pointer; }
.fold:hover { color: var(--ink); border-color: var(--muted); }
.recheck { list-style: none; margin: var(--s-2) 0 0; padding: 0; display: grid; gap: var(--s-2); }
.recheck li { display: grid; gap: var(--s-2); padding: var(--s-3); border: 1px solid var(--line); border-radius: var(--r-md); background: var(--raised); }
.rc-top { display: flex; flex-wrap: wrap; gap: var(--s-2); align-items: center; }
.recheck .statement, .recheck .quote { margin: 0; }
@media (max-width: 900px) {
  .layout { grid-template-columns: minmax(0, 1fr); }
  .versions { position: static; }
}
@media (max-width: 720px) {
  .split .drow, .split-head { grid-template-columns: minmax(0, 1fr); }
  .split-head { display: none; }
  .cell { grid-template-columns: minmax(0, 1fr); gap: 0; }
  .ln { text-align: left; padding-top: 0; }
  .rows { padding: var(--s-3); }
  .diff-head { padding: var(--s-3); }
}
</style>
