<script setup lang="ts">
// Getting started on Home. Every tick comes from stored data (stats), never from clicks, so it is the same on any device
// and for anyone in the project; only hiding it is remembered, per person and project (a cookie, so the server render agrees).
const props = defineProps<{ demo: boolean }>()
const me = useMe()
const { data: stats } = await useFetch('/api/stats', { key: 'stats' })
const admin = computed(() => canManage(me.value))
const tour = useTour()

const key = computed(() => `${me.value?.user?.id}:${me.value?.current?.project.id}`)
const hidden = useCookie<string[]>('sb-getting-started-hidden', { default: () => [], maxAge: 60 * 60 * 24 * 365, sameSite: 'lax' })
const shown = computed(() => !hidden.value.includes(key.value))
const hide = () => { hidden.value = [...hidden.value.filter(k => k !== key.value), key.value].slice(-50) }
const show = () => { hidden.value = hidden.value.filter(k => k !== key.value) }

const items = computed(() => {
  const s = stats.value
  if (!s) return []
  const reviewed = s.canon - s.authored_canon + s.rejected
  const nothingToReview = s.documents > 0 && !s.pending && !reviewed
  return [
    { key: 'sources', label: admin.value ? 'Load the demo or add a document' : 'Add a document', to: s.documents ? '/library' : '#workflow', done: s.documents > 0,
      hint: s.documents ? `${counted(s.documents, 'source')} in this project` : 'Import files, write one here, or try the demo story' },
    // Nothing proposed is not a review done: the step reads as not applicable and leaves the count.
    { key: 'review', label: nothingToReview ? 'Nothing to review in this project' : 'Review a candidate', to: '/review', done: reviewed > 0, na: nothingToReview,
      hint: nothingToReview ? 'No candidates were proposed from these sources' : reviewed ? `${counted(reviewed, 'candidate')} decided` : s.pending ? `${counted(s.pending, 'candidate')} waiting` : 'The AI proposes facts with a quote; you decide' },
    { key: 'canon', label: 'See your canon', to: '/canon', done: s.canon > 0,
      hint: s.canon ? `${counted(s.canon, 'fact')}, each tied to its passage` : 'Accepted facts land here' },
    { key: 'scan', label: 'Run a conflict scan', to: '/conflicts', done: !!s.last_scan,
      hint: s.last_scan ? (s.open_conflicts ? `${counted(s.open_conflicts, 'possible conflict')} to judge (${s.open_hard} hard, ${s.open_soft} soft)` : 'Scanned, nothing open') : 'Timing, travel and relationship checks over canon' },
    { key: 'change', label: 'Propose a change and see its impact', to: '/changes', done: s.changes > 0,
      hint: s.changes ? `${counted(s.changes, 'proposal')}` : 'What a canon edit would touch, before it ships' },
    ...(admin.value ? [{ key: 'invite', label: 'Invite a teammate', to: '/settings/team', done: s.teammates > 0,
      hint: s.teammates ? 'Your studio has company' : 'Share an invite link; no email needed' }] : []),
    { key: 'agent', label: 'Connect an agent', optional: true, to: '/settings/agents', done: s.agent_tokens > 0,
      hint: s.agent_tokens ? 'An API token is active' : 'Read canon from your AI tools over MCP' },
  ]
})
const required = computed(() => items.value.filter(i => !('optional' in i) && !('na' in i && i.na)))
const doneCount = computed(() => required.value.filter(i => i.done).length)
const complete = computed(() => required.value.length > 0 && doneCount.value === required.value.length)
const nextKey = computed(() => items.value.find(i => !i.done && !('na' in i && i.na))?.key)
</script>

<template>
  <section v-if="shown && items.length" class="panel guide" aria-labelledby="guide-title">
    <header class="guide-head">
      <div>
        <h2 id="guide-title">{{ complete ? 'You’re set up' : 'Getting started' }}</h2>
        <p class="small muted">{{ complete ? 'Every step is done in this project. You can hide this now.' : 'Each step ticks itself off when it’s done in this project.' }}</p>
      </div>
      <div class="guide-meta">
        <span class="small" role="status"><b>{{ doneCount }}</b> of {{ required.length }} done</span>
        <span class="meter" aria-hidden="true"><span :style="{ width: `${(doneCount / Math.max(required.length, 1)) * 100}%` }" /></span>
        <UiButton size="sm" variant="ghost" icon="close" @click="hide">Hide</UiButton>
      </div>
    </header>
    <ol class="guide-list">
      <li v-for="i in items" :key="i.key" :class="{ done: i.done, na: 'na' in i && i.na, next: i.key === nextKey }">
        <NuxtLink :to="i.to" class="guide-item">
          <span class="mark" aria-hidden="true"><UiIcon v-if="i.done" name="check" :size="12" /><template v-else-if="'na' in i && i.na">–</template></span>
          <span class="guide-text">
            <span class="guide-label">{{ i.label }}<span v-if="'optional' in i" class="faint"> · optional</span><span class="sr-only">{{ i.done ? ' (done)' : 'na' in i && i.na ? ' (not applicable)' : '' }}</span></span>
            <span class="small faint">{{ i.hint }}</span>
          </span>
          <UiIcon name="arrow" :size="14" class="go" />
        </NuxtLink>
      </li>
    </ol>
    <footer v-if="props.demo" class="guide-tour">
      <span class="small muted"><b>New here?</b> A 2-minute guided tour of the Broken Tide demo: a figurative candidate, a made-up quote, a caught conflict and a change’s impact, then more if you want.</span>
      <UiButton size="sm" variant="primary" icon="demo" @click="tour.start()">Take the tour</UiButton>
    </footer>
  </section>
  <p v-else-if="items.length" class="guide-again small"><button type="button" class="linkish" @click="show">Show getting started</button></p>
</template>

<style scoped>
.guide { margin-bottom: var(--s-5); padding: var(--s-4) var(--s-5) var(--s-3); }
.guide-head { display: flex; flex-wrap: wrap; gap: var(--s-2) var(--s-4); align-items: flex-start; justify-content: space-between; margin-bottom: var(--s-3); }
.guide-head h2 { margin: 0; font-size: var(--text-md); }
.guide-head p { margin: 2px 0 0; }
.guide-meta { display: flex; align-items: center; gap: var(--s-3); }
.guide-meta b { font-variant-numeric: tabular-nums; }
.meter { width: 96px; height: 4px; border-radius: 2px; background: var(--sunken); overflow: hidden; }
.meter span { display: block; height: 100%; background: var(--accent); transition: width var(--dur-2) var(--ease); }
.guide-list { list-style: none; margin: 0 calc(-1 * var(--s-2)); padding: 0; display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 0 var(--s-4); }
.guide-item { display: grid; grid-template-columns: 20px minmax(0, 1fr) auto; gap: var(--s-3); align-items: start; padding: var(--s-2); border-radius: var(--r-md); color: var(--ink); text-decoration: none; }
.guide-item:hover { background: var(--sunken); color: var(--ink); }
.mark { display: grid; place-items: center; width: 20px; height: 20px; margin-top: 1px; border-radius: 50%; border: 1.5px dashed var(--pencil); }
.done .mark { border: 0; background: var(--accent); color: var(--accent-ink); }
.next .mark { border: 2px solid var(--accent); }
.guide-text { display: grid; gap: 1px; min-width: 0; }
.guide-label { font-weight: 600; }
.na .mark { border: 1.5px solid var(--line-strong); color: var(--faint); font-size: 12px; line-height: 1; }
.na .guide-label { color: var(--muted); font-weight: 500; font-style: italic; }
.done .guide-label { color: var(--muted); font-weight: 500; text-decoration: line-through; text-decoration-color: var(--line-strong); }
.go { margin-top: 3px; color: var(--faint); opacity: 0; transition: opacity var(--dur-1) var(--ease); }
.guide-item:hover .go, .next .go { opacity: 1; }
.next .go { color: var(--accent); }
.guide-tour { display: flex; flex-wrap: wrap; gap: var(--s-2) var(--s-4); align-items: center; justify-content: space-between; margin: var(--s-2) calc(-1 * var(--s-5)) calc(-1 * var(--s-3)); padding: var(--s-3) var(--s-5); border-top: 1px solid var(--line); background: var(--surface); border-radius: 0 0 var(--r-lg) var(--r-lg); }
.guide-tour span { flex: 1 1 320px; }
.guide-again { margin: 0 0 var(--s-4); text-align: right; }
.linkish { background: none; border: 0; padding: 0; font: inherit; color: var(--accent); cursor: pointer; text-decoration: underline; text-underline-offset: 2px; }
.sr-only { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }
@media (max-width: 720px) {
  .guide { padding: var(--s-4); }
  .guide-tour { margin: var(--s-2) calc(-1 * var(--s-4)) calc(-1 * var(--s-3)); padding: var(--s-3) var(--s-4); }
  .guide-meta { width: 100%; }
  .meter { flex: 1; }
}
</style>
