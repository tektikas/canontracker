<script setup lang="ts">
// Viewers read only; the server refuses their writes too (server/middleware/access.ts).
const editor = computed(() => canEdit(useMe().value))
const route = useRoute()
const { data: canon, refresh: refreshCanon } = await useFetch('/api/facts', { query: { status: 'canon' } })
const { data: changes, refresh } = await useFetch('/api/changes')

const targetId = ref(String(route.query.target ?? ''))
const target = computed(() => canon.value?.find(f => f.id === targetId.value))
const proposed = ref('')
const rationale = ref('')
const busy = ref(false)
const error = ref('')
// The new wording starts empty, with the current wording shown above it; "Start from current wording" copies it in for a small edit.
watch(target, () => { proposed.value = '' })

const ui = reactive<Record<string, { rationale: string, error: string, busy: boolean }>>({})
const state = (id: string) => (ui[id] ??= { rationale: '', error: '', busy: false })
const STATUS_TONE: Record<string, string> = { ready_for_review: 'warn', applied: 'good', rejected: 'bad', reverted: 'neutral' }
const STATUS_LABEL: Record<string, string> = { ready_for_review: 'Ready for review', applied: 'Applied', rejected: 'Rejected', reverted: 'Reverted' }
// Pencil while proposed, ink once applied, neutral when rejected/reverted (DESIGN.md).
const PROPOSAL_TONE: Record<string, string> = { ready_for_review: 'pencil', applied: 'accent', rejected: 'neutral', reverted: 'neutral' }
const open = reactive<Record<string, boolean>>({})
// Path items are ids; label them: changed fact, dependent fact, scene.
function chain(c: Record<string, any>, i: any) {
  const names = new Map<string, string>([[c.target_fact_id, c.before_statement]])
  for (const x of c.impact) names.set(x.target_id, x.label)
  return i.path.map((id: string, n: number) => ({
    id,
    label: names.get(id) ?? id,
    kind: n === 0 ? 'Changed fact' : n === i.path.length - 1 && i.target_type === 'scene' ? 'Scene' : 'Dependent fact',
  }))
}

async function propose() {
  busy.value = true
  error.value = ''
  try {
    await $fetch('/api/changes', { method: 'POST', body: { target_fact_id: targetId.value, proposed_statement: proposed.value, rationale: rationale.value } })
    targetId.value = ''
    rationale.value = ''
    await Promise.all([refresh(), refreshNuxtData('stats')])
  } catch (e) {
    error.value = errorMessage(e)
  } finally {
    busy.value = false
  }
}

async function decide(id: string, decision: 'accept' | 'reject' | 'revert') {
  const s = state(id)
  s.busy = true
  s.error = ''
  try {
    if (decision === 'revert') await $fetch(`/api/changes/${id}/revert`, { method: 'POST', body: { rationale: s.rationale } })
    else await $fetch(`/api/changes/${id}/decision`, { method: 'POST', body: { decision, rationale: s.rationale } })
    s.rationale = ''
  } catch (e) {
    s.error = errorMessage(e)
    return
  } finally {
    s.busy = false
  }
  // Not awaited: a newer refresh cancels an older one, and a cancelled refresh never settles.
  refresh()
  refreshCanon()
  refreshNuxtData('stats')
}

// A merge changed what a pending proposal may touch: the stored list is out of date until someone re-runs it.
async function reanalyze(id: string) {
  const s = state(id)
  s.busy = true
  s.error = ''
  try {
    await $fetch(`/api/changes/${id}/analyze`, { method: 'POST' })
  } catch (e) {
    s.error = errorMessage(e)
    return
  } finally {
    s.busy = false
  }
  refresh()
}

const impacts = (c: Record<string, any>) => c.impact as any[]
const scenes = (c: Record<string, any>) => c.impact.filter((i: any) => i.target_type === 'scene')
const facts = (c: Record<string, any>) => c.impact.filter((i: any) => i.target_type === 'fact')
</script>

<template>
  <UiPageHeader title="Changes &amp; impact" description="Propose a new value for a canon fact and see what it may touch before anything changes. Analysis stays inside accepted canon, at most 2 hops away. Nothing is rewritten automatically." />

  <UiPanel v-if="editor" title="1 · Propose a change" description="Pick a canon fact, write the new wording and say why.">
    <form class="stack" @submit.prevent="propose">
      <UiField label="Canon fact to change">
        <select v-model="targetId">
          <option value="">Choose a fact…</option>
          <option v-for="f in canon" :key="f.id" :value="f.id">[{{ f.kind }}] {{ f.statement }}</option>
        </select>
      </UiField>
      <template v-if="target">
        <div class="current"><span class="small muted">Current wording</span><div class="statement">{{ target.statement }}</div></div>
        <UiField label="New wording">
          <textarea v-model="proposed" rows="2" placeholder="Write the fact as it should read" />
        </UiField>
        <div v-if="!proposed.trim()"><UiButton size="sm" @click="proposed = target.statement">Start from current wording</UiButton></div>
        <UiField label="Why (required)"><input v-model="rationale" type="text" placeholder="e.g. Make the memory rule conditional"></UiField>
      </template>
      <p v-if="error" class="notice bad" role="alert">{{ error }}</p>
      <div><UiButton variant="primary" type="submit" :loading="busy" :disabled="!target || !proposed.trim() || !rationale.trim()">{{ busy ? 'Analyzing…' : 'Analyze impact' }}</UiButton></div>
    </form>
  </UiPanel>

  <h2 class="list-title">{{ editor ? '2 · Proposals' : 'Proposals' }}</h2>
  <UiEmptyState v-if="!changes?.length" title="No change proposals yet" icon="changes">{{ editor ? 'Choose a canon fact above, or start from the Canon page.' : 'Proposals your team makes show up here with their impact.' }}</UiEmptyState>

  <div class="list">
    <article v-for="c in changes" :key="c.id" class="proposal" :class="`is-${c.status}`">
      <header class="spread">
        <div class="row"><UiBadge :tone="PROPOSAL_TONE[c.status] as any">Change proposal</UiBadge><UiBadge :tone="STATUS_TONE[c.status] as any" dot>{{ STATUS_LABEL[c.status] }}</UiBadge></div>
        <span class="small faint mono">{{ c.id }}</span>
      </header>
      <div class="diff">
        <div class="statement diff-old">{{ c.before_statement }}</div>
        <div class="statement diff-new">{{ c.proposed_statement }}</div>
        <div class="small muted">Why: {{ c.rationale }}</div>
      </div>

      <section class="impact" :class="{ stale: c.impact_stale }">
        <div v-if="c.impact_stale && c.status === 'ready_for_review'" class="notice warn stale-note" role="status">
          <UiIcon name="merge" :size="16" />
          <span>
            <b>Impact out of date.</b> {{ c.impact_stale.from }} was merged into {{ c.impact_stale.into }} after this analysis ran, so it may now touch other facts and scenes.
            <NuxtLink :to="`/audit#${c.impact_stale.audit_id}`">See the merge</NuxtLink>
          </span>
          <UiButton v-if="editor" size="sm" :loading="state(c.id).busy" @click="reanalyze(c.id)">Re-run analysis</UiButton>
        </div>
        <header class="spread">
          <div class="row"><UiBadge tone="pencil">Possible review impact</UiBadge><span class="small muted">{{ scenes(c).length }} scene{{ scenes(c).length === 1 ? '' : 's' }} to re-review</span></div>
          <div class="row small"><span class="muted">Export</span>
            <UiButton v-for="f in ['json', 'csv', 'md']" :key="f" size="sm" :to="`/api/changes/${c.id}/export?format=${f}`" external>{{ f.toUpperCase() }}</UiButton>
          </div>
        </header>
        <p v-if="!impacts(c).length" class="small muted">No impact found within 2 hops. That is not a guarantee of no impact.</p>
        <ul v-else-if="scenes(c).length" class="items">
          <li v-for="i in scenes(c)" :key="i.target_id" class="item">
            <div class="spread">
              <div class="row">
                <UiBadge>Scene</UiBadge>
                <NuxtLink :to="`/documents/${i.target_id}`" class="name">{{ i.label }}</NuxtLink>
              </div>
              <div class="row small muted"><UiBadge>{{ i.hop_count }} {{ i.hop_count === 1 ? 'hop' : 'hops' }}</UiBadge>{{ percent(i.confidence) }}</div>
            </div>
            <ol class="chain" :aria-label="`Path, ${i.hop_count} hop${i.hop_count === 1 ? '' : 's'}`">
              <template v-for="(n, k) in chain(c, i)" :key="n.id">
                <li v-if="k" class="arrow" aria-hidden="true"><UiIcon name="arrow" :size="14" /></li>
                <li class="node"><span class="small faint">{{ n.kind }}</span><span class="nlabel">{{ n.label }}</span></li>
              </template>
            </ol>
            <p v-if="i.rationale" class="small muted why">{{ i.rationale }}</p>
          </li>
        </ul>
        <p v-else class="small muted">No scene impact found within 2 hops. That is not a guarantee of no impact.</p>
        <details v-if="facts(c).length" class="deps">
          <summary>Dependent canon facts ({{ facts(c).length }}): 1 hop, share an entity with the changed fact</summary>
          <ul class="small">
            <li v-for="i in facts(c)" :key="i.target_id">{{ i.label }} <span class="faint">· shares "{{ i.via ?? 'an entity' }}"</span></li>
          </ul>
        </details>
      </section>

      <p v-if="c.status === 'ready_for_review' && !editor" class="decide small muted">Ready for review · waiting for an editor to accept or reject.</p>
      <template v-else-if="c.status === 'ready_for_review'">
        <div class="decide">
          <UiField label="3 · Decision rationale (required)" :error="state(c.id).error"><input v-model="state(c.id).rationale" type="text" placeholder="e.g. Impact list reviewed with the writers"></UiField>
          <div class="row">
            <UiButton variant="primary" :disabled="state(c.id).busy || !state(c.id).rationale.trim() || !!c.impact_stale" :title="c.impact_stale ? 'Re-run the impact analysis first' : undefined" @click="decide(c.id, 'accept')">Accept &amp; apply</UiButton>
            <UiButton variant="danger" :disabled="state(c.id).busy || !state(c.id).rationale.trim()" @click="decide(c.id, 'reject')">Reject</UiButton>
          </div>
        </div>
      </template>
      <template v-else>
        <div class="decide">
          <p class="small muted">
            <template v-if="c.decided_by_name">{{ c.status === 'rejected' ? 'Rejected' : 'Accepted' }} by {{ c.decided_by_name }}: </template><template v-else>Decision: </template>{{ c.decision_rationale }}
            <template v-if="c.status === 'applied'"> · new canon version created; the old fact is kept as superseded.</template>
          </p>
          <p v-if="c.status === 'reverted'" class="small muted">Reverted<template v-if="c.reverted_by_name"> by {{ c.reverted_by_name }}</template>: {{ c.revert_rationale }} · the original wording is canon again as a new version.</p>
          <template v-if="c.status === 'applied' && editor">
            <div><UiButton v-if="!open[c.id]" size="sm" @click="open[c.id] = true">Revert this change…</UiButton></div>
            <template v-if="open[c.id]">
              <UiField label="Why revert (required)" :error="state(c.id).error"><input v-model="state(c.id).rationale" type="text" placeholder="e.g. Playtest showed the old rule reads better"></UiField>
              <div><UiButton variant="danger" :disabled="state(c.id).busy || !state(c.id).rationale.trim()" @click="decide(c.id, 'revert')">Revert to original</UiButton></div>
            </template>
          </template>
        </div>
      </template>
    </article>
  </div>
</template>

<style scoped>
.current { display: grid; gap: 4px; }
.list-title { margin: var(--s-5) 0 var(--s-3); font-size: var(--text-md); }
.list { display: grid; gap: var(--s-5); }
.proposal { background: var(--raised); border: 1px solid var(--line); border-left: 3px dashed var(--pencil); border-radius: var(--r-lg); padding: var(--s-4) var(--s-5); display: grid; gap: var(--s-4); min-width: 0; }
.proposal.is-applied { border-left: 3px solid var(--accent); }
.proposal.is-rejected, .proposal.is-reverted { border-left: 3px solid var(--line-strong); }
.why { margin: 0; }
.diff { display: grid; gap: var(--s-1); }
.stale-note { align-items: center; flex-wrap: wrap; }
.stale-note span { flex: 1 1 180px; }
.impact.stale .items, .impact.stale .deps { opacity: .6; }
.impact { border: 1px dashed var(--line-strong); border-radius: var(--r-md); padding: var(--s-3); display: grid; gap: var(--s-3); background: var(--surface); }
.items { list-style: none; margin: 0; padding: 0; display: grid; gap: var(--s-3); }
.item { background: var(--raised); border: 1px solid var(--line); border-radius: var(--r-md); padding: var(--s-3); display: grid; gap: var(--s-2); min-width: 0; }
.name { font-weight: 600; font-size: var(--text-base); }
.chain { list-style: none; margin: 0; padding: 0; display: flex; flex-wrap: wrap; align-items: stretch; gap: var(--s-2); }
.node { display: grid; gap: 2px; border: 1px solid var(--line-strong); border-radius: var(--r-sm); padding: var(--s-1) var(--s-2); max-width: 260px; min-width: 0; }
.node:first-child { border-color: var(--accent); }
.nlabel { font-size: var(--text-sm); overflow-wrap: anywhere; display: -webkit-box; -webkit-line-clamp: 2; line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
.arrow { display: flex; align-items: center; color: var(--faint); }
.deps summary { cursor: pointer; font-size: var(--text-sm); color: var(--muted); }
.deps ul { margin: var(--s-2) 0 0; padding-left: var(--s-5); display: grid; gap: var(--s-1); }
.decide { border-top: 1px solid var(--line); padding-top: var(--s-3); display: grid; gap: var(--s-3); }
.decide p { margin: 0; }
@media (max-width: 720px) {
  .chain { flex-direction: column; }
  .node { max-width: none; }
  .arrow { transform: rotate(90deg); justify-content: flex-start; padding-left: var(--s-3); }
}
</style>
