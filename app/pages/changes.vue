<script setup lang="ts">
// Viewers read only; the server refuses their writes too (server/middleware/access.ts).
const editor = computed(() => canEdit(useMe().value))
const route = useRoute()
const { data: canon, refresh: refreshCanon } = await useFetch('/api/facts', { query: { status: 'canon' } })
// Superseded facts keep their sources: an applied change's impact still cites them.
const { data: superseded, refresh: refreshSuperseded } = await useFetch('/api/facts', { query: { status: 'superseded' } })
const { data: changes, refresh } = await useFetch('/api/changes')
const fill = useFillAction()
const { data: tasks, refresh: refreshTasks } = await useFetch('/api/tasks', { default: () => [] })
// Re-review tasks of one applied change: closed (done or won't fix) out of the live ones; "not needed" ones left a reverted change.
const tasksOf = (id: string) => tasks.value.filter(t => t.change_id === id)
const live = (id: string) => tasksOf(id).filter(t => t.status !== 'not_needed')
const reviewed = (id: string) => live(id).filter(t => t.status === 'done' || t.status === 'wont_fix').length
const TASK_TAG: Record<string, [string, string]> = { open: ['Open', 'warn'], in_progress: ['In progress', 'accent'], done: ['Done', 'good'], wont_fix: ['Won’t fix', 'neutral'], not_needed: ['Not needed', 'neutral'] }

// --- Propose: pick a fact, write the new version, check the impact.
const targetId = ref(String(route.query.target ?? ''))
watch(() => route.query.target, t => (targetId.value = String(t ?? '')))
const target = computed(() => canon.value?.find(f => f.id === targetId.value))
const query = ref('')
const LIMIT = 40
const matches = computed(() => {
  const words = query.value.trim().toLowerCase().split(/\s+/).filter(Boolean)
  return (canon.value ?? []).filter((f) => {
    const hay = `${f.statement} ${f.subject} ${f.object ?? ''} ${f.kind}`.toLowerCase()
    return words.every(w => hay.includes(w))
  })
})
const proposed = ref('')
const rationale = ref('')
const busy = ref(false)
const error = ref('')
const fresh = ref('') // the proposal just analysed: the guided tour points at its impact
// The new wording starts empty, with the current wording shown above it; "Start from current wording" copies it in for a small edit.
watch(target, () => { proposed.value = '' })
const unchanged = computed(() => !!target.value && proposed.value.trim() === target.value.statement)
const step = computed(() => (!target.value ? 1 : !proposed.value.trim() || unchanged.value || !rationale.value.trim() ? 2 : 3))
const STEPS = ['Pick a fact', 'Write the new version', 'Check the impact']

async function propose() {
  busy.value = true
  error.value = ''
  try {
    const id = (await $fetch('/api/changes', { method: 'POST', body: { target_fact_id: targetId.value, proposed_statement: proposed.value, rationale: rationale.value } })).id
    fresh.value = id
    shown[id] = true
    targetId.value = ''
    rationale.value = ''
    query.value = ''
    await Promise.all([refresh(), refreshNuxtData('stats')])
    view.value = 'open'
    await nextTick()
    document.getElementById(`change-${id}`)?.scrollIntoView({ block: 'start', behavior: 'smooth' })
  } catch (e) {
    error.value = errorMessage(e)
  } finally {
    busy.value = false
  }
}

// --- Proposals: grouped by where they stand, so history and revert are one tab away.
type View = 'open' | 'applied' | 'closed' | 'all'
const GROUP: Record<string, View> = { ready_for_review: 'open', analyzing: 'open', applied: 'applied', rejected: 'closed', reverted: 'closed' }
const count = (v: View) => changes.value?.filter(c => v === 'all' || GROUP[c.status] === v).length ?? 0
const view = ref<View>(count('open') ? 'open' : 'all')
const tabs = computed(() => [
  { value: 'open' as View, label: 'To decide', count: count('open') },
  { value: 'applied' as View, label: 'Applied', count: count('applied') },
  { value: 'closed' as View, label: 'Rejected or reverted', count: count('closed') },
  { value: 'all' as View, label: 'All', count: count('all') },
])
const visible = computed(() => changes.value?.filter(c => view.value === 'all' || GROUP[c.status] === view.value) ?? [])
const EMPTY: Record<View, string> = { open: 'Nothing waiting for a decision.', applied: 'No change has been applied yet.', closed: 'No change has been rejected or reverted.', all: '' }

const ui = reactive<Record<string, { rationale: string, error: string, busy: boolean }>>({})
const state = (id: string) => (ui[id] ??= { rationale: '', error: '', busy: false })
const STATUS_TONE: Record<string, string> = { ready_for_review: 'warn', applied: 'good', rejected: 'bad', reverted: 'neutral' }
const STATUS_LABEL: Record<string, string> = { ready_for_review: 'Waiting for a decision', applied: 'Applied', rejected: 'Rejected', reverted: 'Reverted' }
// Pencil while proposed, ink once applied, neutral when rejected/reverted (DESIGN.md).
const PROPOSAL_TONE: Record<string, string> = { ready_for_review: 'pencil', applied: 'accent', rejected: 'neutral', reverted: 'neutral' }
const reverting = reactive<Record<string, boolean>>({})
// Impact is open by default only where someone still has to decide.
const shown = reactive<Record<string, boolean>>({})
const isShown = (c: Record<string, any>) => shown[c.id] ?? c.status === 'ready_for_review'

// --- Impact, read as story consequences: by hop, path as names, sources folded away.
interface Item { target_type: 'fact' | 'scene', target_id: string, label: string, path: string[], via: string | null, evidence_ids: string[], rationale: string, confidence: number, hop_count: 1 | 2 }
const items = (c: Record<string, any>) => c.impact as Item[]
const scenes = (c: Record<string, any>) => items(c).filter(i => i.target_type === 'scene')
const facts = (c: Record<string, any>) => items(c).filter(i => i.target_type === 'fact')
const HOP_TITLE = { 1: '1 hop · tied directly to this fact', 2: '2 hops · through a related fact' }
const hops = (c: Record<string, any>) => ([1, 2] as const).map(hop => ({
  hop,
  scenes: scenes(c).filter(i => i.hop_count === hop),
  facts: facts(c).filter(i => i.hop_count === hop),
})).filter(g => g.scenes.length || g.facts.length)
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`
function summary(c: Record<string, any>) {
  const s = scenes(c).length
  const f = facts(c).length
  if (!s && !f) return 'No impact found within 2 hops'
  return `May touch ${[s && plural(s, 'scene'), f && plural(f, 'related fact')].filter(Boolean).join(' and ')}`
}
// Path items are ids; name them: the changed fact (shown above, so only named), the related fact, the scene. Each arrow says how the next one is tied in.
function chain(c: Record<string, any>, i: Item) {
  const names = new Map<string, string>([[c.target_fact_id, c.before_statement]])
  for (const x of items(c)) names.set(x.target_id, x.label)
  return i.path.map((id, n) => {
    const scene = n === i.path.length - 1 && i.target_type === 'scene'
    return {
      id,
      label: names.get(id) ?? 'Unknown',
      kind: n === 0 ? 'Changed fact' : scene ? 'Scene' : 'Related fact',
      link: scene ? `/documents/${id}` : undefined,
      via: !n ? '' : scene ? 'quoted in' : `shares “${i.via ?? 'a name'}”`,
    }
  })
}
const evidence = computed(() => {
  const m = new Map<string, Record<string, any>>()
  for (const f of [...canon.value ?? [], ...superseded.value ?? []]) for (const e of f.evidence) m.set(e.id, e)
  return m
})
const sources = (i: Item) => i.evidence_ids.map(id => evidence.value.get(id)).filter(e => !!e)

async function decide(id: string, decision: 'accept' | 'reject' | 'revert') {
  const s = state(id)
  s.busy = true
  s.error = ''
  try {
    if (decision === 'revert') await $fetch(`/api/changes/${id}/revert`, { method: 'POST', body: { rationale: s.rationale } })
    else await $fetch(`/api/changes/${id}/decision`, { method: 'POST', body: { decision, rationale: s.rationale } })
    s.rationale = ''
    reverting[id] = false
    // Follow the proposal to the tab it moves to, so the decision and its history stay in view.
    view.value = decision === 'accept' ? 'applied' : 'closed'
  } catch (e) {
    s.error = errorMessage(e)
    return
  } finally {
    s.busy = false
  }
  // Not awaited: a newer refresh cancels an older one, and a cancelled refresh never settles.
  refresh()
  refreshCanon()
  refreshSuperseded()
  refreshTasks()
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
</script>

<template>
  <UiPageHeader title="Changes &amp; impact" description="Rewrite one canon fact and see which facts and scenes it may touch, up to 2 hops away, before anything changes. Canon only changes when someone accepts the proposal." />

  <UiPanel v-if="!canon?.length && !changes?.length">
    <UiEmptyState title="No canon to change yet" icon="changes">
      A change proposal rewrites one accepted fact and shows what it may touch before anything changes. Accept some canon first.
      <template #actions><UiButton variant="primary" :icon="fill.icon" :to="fill.to">{{ fill.label }}</UiButton></template>
    </UiEmptyState>
  </UiPanel>

  <template v-else>
    <UiPanel v-if="editor" data-tour="propose" title="Propose a change" description="Nothing in canon changes until someone accepts the proposal.">
      <ol class="steps" aria-label="Steps">
        <li v-for="(s, n) in STEPS" :key="s" :class="{ done: step > n + 1, now: step === n + 1 }" :aria-current="step === n + 1 ? 'step' : undefined">
          <span class="num">{{ step > n + 1 ? '✓' : n + 1 }}</span>{{ s }}
        </li>
      </ol>

      <form class="stack" @submit.prevent="propose">
        <!-- 1 · Which fact -->
        <section class="block">
          <h3>Which fact?</h3>
          <div v-if="target" class="picked">
            <div class="row"><UiBadge tone="accent">{{ target.kind }}</UiBadge><UiBadge v-if="target.time_label">{{ target.time_label }}</UiBadge></div>
            <div class="statement">{{ target.statement }}</div>
            <details v-if="target.evidence?.length" class="src">
              <summary class="expand">Source{{ target.evidence.length === 1 ? '' : 's' }} ({{ target.evidence.length }})</summary>
              <SourceRef v-for="ev in target.evidence" :key="ev.id" :ev="ev" />
            </details>
            <div><UiButton size="sm" variant="ghost" @click="targetId = ''">Pick another fact</UiButton></div>
          </div>
          <template v-else>
            <p v-if="route.query.target && targetId" class="notice warn" role="status">That fact is not in canon any more (it may have been changed already). Pick the current one below.</p>
            <input v-model="query" type="search" aria-label="Search canon facts" placeholder="Search canon: a name, place or word">
            <fieldset class="picker" aria-label="Canon fact to change">
              <label v-for="f in matches.slice(0, LIMIT)" :key="f.id" class="pick">
                <input v-model="targetId" type="radio" name="target" :value="f.id">
                <span class="pick-body">
                  <span class="statement">{{ f.statement }}</span>
                  <span class="small faint">{{ f.kind }}<template v-if="f.time_label"> · {{ f.time_label }}</template></span>
                </span>
              </label>
              <p v-if="!matches.length" class="small muted pad">No canon fact matches “{{ query.trim() }}”.</p>
              <p v-else-if="matches.length > LIMIT" class="small muted pad">Showing {{ LIMIT }} of {{ matches.length }}. Type more to narrow it down.</p>
            </fieldset>
          </template>
        </section>

        <!-- 2 · The new version -->
        <section v-if="target" class="block">
          <h3>What should it say?</h3>
          <UiField label="New version" :hint="unchanged ? 'Same as the current wording. Edit it to propose a change.' : undefined">
            <textarea v-model="proposed" rows="3" placeholder="Write the fact as it should read" />
          </UiField>
          <div v-if="!proposed.trim()"><UiButton size="sm" @click="proposed = target.statement">Start from current wording</UiButton></div>
          <div v-else-if="!unchanged" class="compare" aria-label="Before and after">
            <div><span class="small faint">Now</span><div class="statement diff-old">{{ target.statement }}</div></div>
            <div><span class="small faint">Proposed</span><div class="statement diff-new">{{ proposed }}</div></div>
          </div>
          <UiField label="Why change it? (required)"><input v-model="rationale" type="text" placeholder="e.g. Make the memory rule conditional"></UiField>
        </section>

        <!-- 3 · Analyze -->
        <p v-if="error" class="notice bad" role="alert">{{ error }}</p>
        <div v-if="target" class="row">
          <UiButton variant="primary" type="submit" :loading="busy" :disabled="step < 3">{{ busy ? 'Analyzing…' : 'Analyze impact' }}</UiButton>
          <span class="small muted">Checks accepted canon up to 2 hops away. Your proposal then waits for a decision below.</span>
        </div>
      </form>
    </UiPanel>

    <div class="list-head">
      <h2>Proposals</h2>
      <UiTabs v-model="view" :items="tabs" />
    </div>
    <UiEmptyState v-if="!changes?.length" title="No change proposals yet" icon="changes">{{ editor ? 'Pick a canon fact above, or use Propose change… on any fact in Canon.' : 'Proposals your team makes show up here with their impact.' }}</UiEmptyState>
    <p v-else-if="!visible.length" class="small muted">{{ EMPTY[view] }}</p>

    <div class="list">
      <article v-for="c in visible" :id="`change-${c.id}`" :key="c.id" class="proposal" :class="`is-${c.status}`" :data-tour="c.id === fresh ? 'impact' : undefined">
        <header class="spread">
          <div class="row"><UiBadge :tone="PROPOSAL_TONE[c.status] as any">Change proposal</UiBadge><UiBadge :tone="STATUS_TONE[c.status] as any" dot>{{ STATUS_LABEL[c.status] ?? c.status }}</UiBadge></div>
          <span class="small faint" :title="c.id">Proposed {{ dateTime(c.created_at) }}</span>
        </header>

        <div class="compare">
          <div><span class="small faint">{{ c.status === 'applied' ? 'Was' : 'Now' }}</span><div class="statement diff-old">{{ c.before_statement }}</div></div>
          <div><span class="small faint">{{ c.status === 'applied' ? 'Canon now' : 'Proposed' }}</span><div class="statement diff-new">{{ c.proposed_statement }}</div></div>
        </div>
        <p class="small muted why">Why: {{ c.rationale }}</p>

        <section class="impact" :class="{ stale: c.impact_stale }">
          <header class="spread">
            <div class="row">
              <UiBadge tone="pencil">Possible review impact</UiBadge>
              <span class="small">{{ summary(c) }}</span>
            </div>
            <UiButton size="sm" variant="ghost" :aria-expanded="isShown(c)" :aria-controls="`impact-${c.id}`" @click="shown[c.id] = !isShown(c)">{{ isShown(c) ? 'Hide impact' : 'Show impact' }}</UiButton>
          </header>

          <div v-if="c.impact_stale && c.status === 'ready_for_review'" class="notice warn stale-note" role="status">
            <UiIcon name="merge" :size="16" />
            <span>
              <b>Impact out of date.</b> {{ c.impact_stale.from }} was merged into {{ c.impact_stale.into }} after this analysis ran, so it may now touch other facts and scenes.
              <NuxtLink :to="`/audit#${c.impact_stale.audit_id}`">See the merge</NuxtLink>
            </span>
            <UiButton v-if="editor" size="sm" :loading="state(c.id).busy" @click="reanalyze(c.id)">Re-run analysis</UiButton>
          </div>

          <div v-if="isShown(c)" :id="`impact-${c.id}`" class="impact-body">
            <p v-if="!items(c).length" class="small muted">No impact found within 2 hops of accepted canon. That is not a guarantee that nothing else is affected.</p>
            <template v-else>
              <p v-if="!scenes(c).length" class="small muted">No scene impact found within 2 hops. That is not a guarantee that no scene is affected.</p>
              <section v-for="g in hops(c)" :key="g.hop" class="hop">
                <h3><span class="hop-n">{{ g.hop }}</span>{{ HOP_TITLE[g.hop] }}</h3>
                <ul class="items">
                  <li v-for="i in g.scenes" :key="i.target_id" class="item">
                    <div class="spread">
                      <div class="row"><UiIcon name="scene" :size="16" /><NuxtLink :to="`/documents/${i.target_id}`" class="name">{{ i.label }}</NuxtLink></div>
                      <span class="small faint">confidence {{ percent(i.confidence) }}</span>
                    </div>
                    <p class="small muted why">{{ i.rationale }}</p>
                    <ol class="chain" :aria-label="`Path, ${plural(i.hop_count, 'hop')}`">
                      <li v-for="n in chain(c, i)" :key="n.id" class="step">
                        <span v-if="n.via" class="via small faint"><UiIcon name="arrow" :size="12" />{{ n.via }}</span>
                        <span v-if="!n.via" class="node first" :title="n.label">The changed fact</span>
                        <span v-else class="node">
                          <span class="small faint">{{ n.kind }}</span>
                          <NuxtLink v-if="n.link" :to="n.link" class="nlabel">{{ n.label }}</NuxtLink>
                          <span v-else class="nlabel">{{ n.label }}</span>
                        </span>
                      </li>
                    </ol>
                    <details v-if="sources(i).length" class="src">
                      <summary class="expand">Source quote{{ sources(i).length === 1 ? '' : 's' }} ({{ sources(i).length }})</summary>
                      <SourceRef v-for="ev in sources(i)" :key="ev.id" :ev="ev" />
                    </details>
                  </li>
                </ul>
                <details v-if="g.facts.length" class="deps" :open="g.facts.length <= 3">
                  <summary class="expand">Related canon facts to re-check ({{ g.facts.length }})</summary>
                  <ul class="items">
                    <li v-for="i in g.facts" :key="i.target_id" class="item fact-item">
                      <span class="statement">{{ i.label }}</span>
                      <span class="small muted">Shares “{{ i.via ?? 'a name' }}” with the changed fact.</span>
                      <details v-if="sources(i).length" class="src">
                        <summary class="expand">Source quote{{ sources(i).length === 1 ? '' : 's' }} ({{ sources(i).length }})</summary>
                        <SourceRef v-for="ev in sources(i)" :key="ev.id" :ev="ev" />
                      </details>
                    </li>
                  </ul>
                </details>
              </section>
            </template>
            <div class="row small export"><span class="muted">Export this list</span>
              <UiButton v-for="f in ['json', 'csv', 'md']" :key="f" size="sm" :to="`/api/changes/${c.id}/export?format=${f}`" external>{{ f.toUpperCase() }}</UiButton>
            </div>
          </div>
        </section>

        <section v-if="tasksOf(c.id).length" class="tasks" :aria-label="`Re-review tasks for change ${c.id}`">
          <header class="spread">
            <div class="row"><UiBadge tone="pencil">Re-review tasks</UiBadge>
              <span v-if="live(c.id).length" class="small muted">{{ reviewed(c.id) }} of {{ live(c.id).length }} {{ live(c.id).length === 1 ? 'scene' : 'scenes' }} re-reviewed</span>
              <span v-else class="small muted">Not needed — change reverted</span>
            </div>
            <NuxtLink :to="`/tasks?show=all&change=${c.id}`" class="small">Open in Tasks</NuxtLink>
          </header>
          <div v-if="live(c.id).length" class="bar" role="progressbar" :aria-valuenow="reviewed(c.id)" aria-valuemin="0" :aria-valuemax="live(c.id).length"><span :style="{ width: `${reviewed(c.id) / live(c.id).length * 100}%` }" /></div>
          <ul class="task-rows">
            <li v-for="t in tasksOf(c.id)" :key="t.id" class="task-row">
              <UiBadge :tone="TASK_TAG[t.status]![1] as any">{{ TASK_TAG[t.status]![0] }}</UiBadge>
              <NuxtLink :to="`/documents/${t.document_id}${t.passage_id ? `#${t.passage_id}` : ''}`" class="name">{{ t.document_title }}</NuxtLink>
              <span class="small faint">{{ t.assignee_name ?? 'Unassigned' }}</span>
            </li>
          </ul>
        </section>

        <p v-if="c.status === 'ready_for_review' && !editor" class="decide small muted">Waiting for an editor to accept or reject.</p>
        <div v-else-if="c.status === 'ready_for_review'" class="decide">
          <h3>Decide</h3>
          <p class="small muted">Accept &amp; apply writes the new version to canon and keeps the old one as superseded<template v-if="scenes(c).length">, and opens a re-review task for each scene above</template>. Reject leaves canon as it is.</p>
          <UiField label="Why (required)" :error="state(c.id).error"><input v-model="state(c.id).rationale" type="text" placeholder="e.g. Impact list reviewed with the writers"></UiField>
          <div class="row">
            <UiButton variant="primary" :disabled="state(c.id).busy || !state(c.id).rationale.trim() || !!c.impact_stale" :title="c.impact_stale ? 'Re-run the impact analysis first' : undefined" @click="decide(c.id, 'accept')">Accept &amp; apply</UiButton>
            <UiButton variant="danger" :disabled="state(c.id).busy || !state(c.id).rationale.trim()" @click="decide(c.id, 'reject')">Reject</UiButton>
          </div>
        </div>
        <div v-else class="decide">
          <h3>History</h3>
          <ol class="history small">
            <li><span class="faint">{{ dateTime(c.created_at) }}</span> Proposed: {{ c.rationale }}</li>
            <li v-if="c.decided_at"><span class="faint">{{ dateTime(c.decided_at) }}</span> {{ c.status === 'rejected' ? 'Rejected' : 'Accepted and applied' }}<template v-if="c.decided_by_name"> by {{ c.decided_by_name }}</template>: {{ c.decision_rationale }}<template v-if="c.status !== 'rejected'"> · new canon version created; the old fact is kept as superseded.</template></li>
            <li v-if="c.reverted_at"><span class="faint">{{ dateTime(c.reverted_at) }}</span> Reverted<template v-if="c.reverted_by_name"> by {{ c.reverted_by_name }}</template>: {{ c.revert_rationale }} · the original wording is canon again as a new version.</li>
          </ol>
          <template v-if="c.status === 'applied' && editor">
            <div v-if="!reverting[c.id]"><UiButton size="sm" icon="history" @click="reverting[c.id] = true">Revert this change…</UiButton></div>
            <template v-else>
              <UiField label="Why revert? (required)" :error="state(c.id).error"><input v-model="state(c.id).rationale" type="text" placeholder="e.g. Playtest showed the old rule reads better"></UiField>
              <div class="row">
                <UiButton variant="danger" :disabled="state(c.id).busy || !state(c.id).rationale.trim()" @click="decide(c.id, 'revert')">Revert to original</UiButton>
                <UiButton variant="ghost" @click="reverting[c.id] = false">Cancel</UiButton>
              </div>
            </template>
          </template>
        </div>
      </article>
    </div>
  </template>
</template>

<style scoped>
h3 { margin: 0; font-size: var(--text-base); font-weight: 600; }
.steps { list-style: none; margin: 0 0 var(--s-4); padding: 0; display: flex; flex-wrap: wrap; gap: var(--s-2) var(--s-4); font-size: var(--text-sm); color: var(--faint); }
.steps li { display: flex; align-items: center; gap: var(--s-2); }
.steps .num { display: inline-grid; place-items: center; width: 22px; height: 22px; border-radius: 50%; border: 1px dashed var(--line-strong); font-size: var(--text-xs); }
.steps .now { color: var(--ink); font-weight: 600; }
.steps .now .num { border: 1px solid var(--accent); color: var(--accent); }
.steps .done { color: var(--muted); }
.steps .done .num { border: 1px solid var(--accent); background: var(--accent); color: var(--accent-ink); }
.block { display: grid; gap: var(--s-3); }
.picked { display: grid; gap: var(--s-2); border: 1px solid var(--accent); border-radius: var(--r-md); padding: var(--s-3); background: var(--raised); }
.picker { margin: 0; padding: 0; border: 1px solid var(--line); border-radius: var(--r-md); max-height: 320px; overflow-y: auto; }
.pick { display: flex; align-items: flex-start; gap: var(--s-3); padding: var(--s-2) var(--s-3); border-bottom: 1px solid var(--line); cursor: pointer; min-height: 44px; color: var(--ink); font-weight: 400; }
.pick:last-of-type { border-bottom: 0; }
.pick:hover { background: var(--sunken); }
.pick input { margin-top: 6px; flex: none; }
.pick-body { display: grid; gap: 2px; min-width: 0; }
.pick .statement { font-size: var(--text-base); line-height: 1.5; overflow-wrap: anywhere; }
.pad { margin: 0; padding: var(--s-3); }
.compare { display: grid; grid-template-columns: 1fr 1fr; gap: var(--s-3); }
.compare > div { display: grid; gap: 2px; align-content: start; min-width: 0; overflow-wrap: anywhere; }
.list-head { display: grid; grid-template-columns: minmax(0, 1fr); gap: var(--s-2); margin: var(--s-5) 0 var(--s-3); }
.list-head h2 { margin: 0; font-size: var(--text-md); }
.list { display: grid; gap: var(--s-5); }
.proposal { background: var(--raised); border: 1px solid var(--line); border-left: 3px dashed var(--pencil); border-radius: var(--r-lg); padding: var(--s-4) var(--s-5); display: grid; gap: var(--s-3); min-width: 0; scroll-margin-top: 80px; }
.proposal.is-applied { border-left: 3px solid var(--accent); }
.proposal.is-rejected, .proposal.is-reverted { border-left: 3px solid var(--line-strong); }
.why { margin: 0; }
.stale-note { align-items: center; flex-wrap: wrap; }
.stale-note span { flex: 1 1 180px; }
.impact.stale .impact-body { opacity: .6; }
.impact { border: 1px dashed var(--line-strong); border-radius: var(--r-md); padding: var(--s-3); display: grid; gap: var(--s-3); background: var(--surface); min-width: 0; }
.impact-body { display: grid; gap: var(--s-4); min-width: 0; }
.impact-body > p { margin: 0; }
.hop { display: grid; gap: var(--s-2); min-width: 0; }
.hop h3 { display: flex; align-items: center; gap: var(--s-2); font-size: var(--text-sm); color: var(--muted); }
.hop-n { display: inline-grid; place-items: center; width: 20px; height: 20px; border-radius: 50%; border: 1px dashed var(--pencil); color: var(--ink); font-size: var(--text-xs); }
.items { list-style: none; margin: 0; padding: 0; display: grid; gap: var(--s-2); }
.item { background: var(--raised); border: 1px solid var(--line); border-radius: var(--r-md); padding: var(--s-3); display: grid; gap: var(--s-2); min-width: 0; }
.item .row { flex-wrap: nowrap; min-width: 0; }
.item .row svg { flex: none; color: var(--muted); }
.fact-item .statement { font-size: var(--text-base); overflow-wrap: anywhere; }
.name { font-weight: 600; font-size: var(--text-base); overflow-wrap: anywhere; }
.chain { list-style: none; margin: 0; padding: 0; display: flex; flex-wrap: wrap; align-items: center; gap: var(--s-2); }
.step { display: flex; align-items: center; gap: var(--s-2); min-width: 0; }
.via { display: inline-flex; align-items: center; gap: 4px; white-space: nowrap; }
.node { display: grid; gap: 2px; border: 1px solid var(--line-strong); border-radius: var(--r-sm); padding: var(--s-1) var(--s-2); max-width: 260px; min-width: 0; }
.node.first { border-color: var(--accent); color: var(--accent); font-size: var(--text-sm); font-weight: 600; align-self: center; }
.nlabel { font-size: var(--text-sm); overflow-wrap: anywhere; display: -webkit-box; -webkit-line-clamp: 2; line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
.src { display: grid; gap: var(--s-2); }
.src[open] { gap: var(--s-3); }
.src summary, .deps summary { display: flex; align-items: center; gap: var(--s-2); cursor: pointer; font-size: var(--text-sm); color: var(--muted); list-style: none; min-height: 32px; }
.deps[open] summary { margin-bottom: var(--s-2); }
.export { flex-wrap: wrap; }
.tasks { border: 1px solid var(--line); border-radius: var(--r-md); padding: var(--s-3); display: grid; gap: var(--s-3); }
.bar { height: 6px; border-radius: 3px; background: var(--sunken); overflow: hidden; }
.bar span { display: block; height: 100%; background: var(--accent); }
.task-rows { list-style: none; margin: 0; padding: 0; display: grid; gap: var(--s-2); }
.task-row { display: flex; flex-wrap: wrap; align-items: center; gap: var(--s-2); }
.task-row .small { margin-left: auto; }
.decide { border-top: 1px solid var(--line); padding-top: var(--s-3); display: grid; gap: var(--s-3); }
.decide p { margin: 0; }
.history { list-style: none; margin: 0; padding: 0; display: grid; gap: var(--s-2); color: var(--muted); }
.history .faint { margin-right: var(--s-2); }
@media (max-width: 720px) {
  .proposal { padding: var(--s-3); }
  .compare { grid-template-columns: 1fr; }
  .chain { flex-direction: column; align-items: stretch; }
  .step { flex-direction: column; align-items: stretch; gap: var(--s-1); }
  .via { padding-left: var(--s-3); }
  .via svg { transform: rotate(90deg); }
  .node { max-width: none; }
  .node.first { align-self: flex-start; }
  .src summary, .deps summary { min-height: 44px; }
}
</style>
