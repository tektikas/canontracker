<script setup lang="ts">
// A short, skippable tour of the Broken Tide demo: a figurative candidate, a made-up quote, a caught conflict and a change's
// impact. It never clicks for the user or changes data; it opens the right page, outlines one element and explains it.
// Pages mark their targets with data-tour="…". When a step's target isn't there (already decided, not scanned yet), the card
// says what to do instead of pointing at nothing.
const { step, set, saved, resume, stop } = useTour()
const route = useRoute()

interface Ids { sister?: string, made?: string, rule?: string }
const ids = ref<Ids>({})
// What the stored candidates and checks came from (their model ids), so the intro only claims a recorded run when it is one.
const prov = ref<ReturnType<typeof provenance>['kind']>('none')
async function loadIds() {
  try {
    const [pending, canon, stats] = await Promise.all([
      $fetch('/api/facts', { query: { status: 'pending' } }),
      $fetch('/api/facts', { query: { status: 'canon' } }),
      $fetch('/api/stats'),
    ])
    prov.value = provenance(stats.data_model_id).kind
    ids.value = {
      sister: pending.find(f => /\bsisters\b/i.test(f.statement))?.id,
      made: pending.find(f => !f.evidence.some((e: { verified: number | boolean }) => e.verified))?.id,
      rule: canon.find(f => f.statement.includes('whoever carries it'))?.id,
    }
  } catch {
    ids.value = {}
  }
}

interface Target { sel: string, body: string }
interface Step { title: string, page?: string, to?: string, targets?: Target[], missing?: string, intro?: string }
const STEPS = computed<Step[]>(() => [
  {
    title: 'Broken Tide in five steps',
    intro: `A short tour of the demo story. ${{
      recorded: 'Its candidates and model checks replay a recorded run, labeled “Recorded demo run” wherever they show. ',
      live: 'Its candidates and model checks come from a live model, labeled with the model wherever they show. ',
      mixed: 'Some candidates replay a recorded run and some come from a live model; each is labeled where it shows. ',
      none: '',
    }[prov.value]}You do every click yourself; the tour only points.`,
  },
  {
    title: 'The model proposes. You decide.',
    page: '/review',
    to: ids.value.sister && `/review?fact=${ids.value.sister}`,
    targets: ids.value.sister ? [{ sel: '[data-tour="candidate"]', body: '“Mara and Leya are sisters” rests on one line: “You’re my sister in all but blood.” That’s a figure of speech, not family. Choose Reject…, give the reason, and it never becomes canon.' }] : [],
    missing: 'The “sisters” candidate already has a decision. Rejected candidates stay at the bottom of Review, with the reason, for the audit trail.',
  },
  {
    title: 'A made-up quote can’t get in',
    page: '/review',
    to: ids.value.made && `/review?fact=${ids.value.made}`,
    // The whole candidate, so the red notice and the switched-off Accept are both in the outline.
    targets: ids.value.made ? [{ sel: '[data-tour="candidate"]:has([data-tour="blocked"])', body: 'Here the model quotes a line the scene never says. The quote isn’t in the source word for word, so Accept is switched off. Reject it, or leave it pending.' }] : [],
    missing: 'Every candidate with a made-up quote already has a decision. None of them could have been accepted.',
  },
  {
    title: 'Accept what holds up',
    page: '/review',
    targets: [{ sel: '[data-tour="decide"]', body: 'Read each remaining candidate against its highlighted passage and Accept it (key A on a keyboard). Every decision is logged with your name. Conflicts are only checked in accepted canon.' }],
    missing: 'The queue is empty: every candidate has a decision. On to conflicts.',
  },
  {
    title: 'Catch a conflict',
    page: '/conflicts',
    targets: [
      { sel: '[data-tour="c1"]', body: 'Caught: Arin can’t be crossing the causeway at 22:00 and in the Lighthouse gallery from 21:30 to 22:30. Both sides cite their passage. Confirm it or call it a false alarm, with a reason; deciding never edits canon.' },
      { sel: '[data-tour="scan"]', body: 'Scan canon runs timing, travel and relationship checks over accepted canon. Press it: the Arin clash between scenes S05 and S06 shows up here. Nothing found? Accept those scenes’ candidates in Review first.' },
    ],
    missing: 'Conflicts are checked by an editor. Ask one to scan canon, then come back.',
  },
  {
    title: 'See a change’s impact before it ships',
    page: '/changes',
    to: ids.value.rule && `/changes?target=${ids.value.rule}`,
    targets: ids.value.rule ? [{ sel: '[data-tour="propose"]', body: 'Rewrite the chord-stone rule, say why, and press Analyze impact. You get what it may touch within two hops, each with its path and sources: scenes S04, S07, S09 and S10, not S01 or S03. Nothing changes until someone accepts it.' }] : [],
    missing: 'The chord-stone rule (“…whoever carries it”) isn’t in canon right now. Accept it in Review, then pick it here and press Analyze impact.',
  },
])
const current = computed(() => (step.value == null ? undefined : STEPS.value[step.value]))
const last = computed(() => step.value === STEPS.value.length - 1)
const PAGE_NAME: Record<string, string> = { '/review': 'Review', '/conflicts': 'Conflicts', '/changes': 'Changes' }
const offPage = computed(() => !!current.value?.page && route.path !== current.value.page)

// Where the step lives, and which of its targets is on screen.
const rect = ref<{ top: number, left: number, width: number, height: number } | null>(null)
const found = ref<Target>()
let scrolledFor = ''
function measure() {
  const s = current.value
  let el: Element | null = null
  found.value = s?.targets?.find(t => (el = document.querySelector(t.sel)))
  if (!el) {
    rect.value = null
    return
  }
  // Once per target: a step whose target changes (Scan → the conflict it found) brings the new one into view too.
  if (scrolledFor !== `${step.value}:${found.value!.sel}`) {
    scrolledFor = `${step.value}:${found.value!.sel}`
    ;(el as HTMLElement).scrollIntoView({ block: 'center' })
  }
  const r = (el as HTMLElement).getBoundingClientRect()
  rect.value = { top: r.top, left: r.left, width: r.width, height: r.height }
}

// navigate: false when the tour is only picking up again (a reload, or Home's own layout mounting it afresh):
// the person chose where they are, so the card stays with them instead of pulling them back.
async function go(navigate: boolean) {
  const s = current.value
  if (!s) return
  scrolledFor = ''
  await loadIds()
  if (s.page) {
    const to = current.value?.to ?? s.page
    if (navigate && route.fullPath !== to) await navigateTo(to)
  }
  await nextTick()
  measure()
  heading.value?.focus({ preventScroll: true })
}
const heading = ref<HTMLElement>()
const pop = ref<HTMLElement>()

let timer: ReturnType<typeof setInterval> | undefined
function kick(n: number | null, navigate = true) {
  clearInterval(timer)
  if (n == null) return
  go(navigate)
  // Pages load data and re-render after navigation; re-measure until the step changes.
  timer = setInterval(measure, 250)
}
watch(step, n => kick(n))
// The tour fits the Broken Tide demo only: it never starts or resumes in a project without it.
const fitsDemo = () => $fetch('/api/documents').then(d => d.some(x => x.filename === 'lore-chord-stone.md'), () => false)
onMounted(async () => {
  window.addEventListener('scroll', measure, { passive: true, capture: true })
  window.addEventListener('resize', measure)
  // Home renders its own layout, so moving between Home and other pages mounts the tour afresh mid-step.
  if (route.query.tour === '1' && step.value == null) {
    if (await fitsDemo()) set(0)
  } else if (step.value != null || saved() != null) {
    if (!(await fitsDemo())) return stop()
    resume()
    kick(step.value, false)
  }
})
onBeforeUnmount(() => {
  clearInterval(timer)
  window.removeEventListener('scroll', measure, { capture: true })
  window.removeEventListener('resize', measure)
})
watch(() => route.query.tour, async (v) => { if (v === '1' && await fitsDemo()) set(0) })

// The card sits beside the outlined element on wide screens, and docks at the bottom on phones (DESIGN.md: 720px).
const PAD = 6
const popStyle = computed(() => {
  const r = rect.value
  if (!r || import.meta.server || matchMedia('(max-width: 720px)').matches) return {}
  const w = Math.min(360, innerWidth - 32)
  const h = pop.value?.offsetHeight ?? 220
  const left = Math.min(Math.max(16, r.left), innerWidth - w - 16)
  // Below the target, else above it. A target taller than the screen gets the card in the bottom-right corner, clear of
  // its left-aligned buttons.
  if (innerHeight - (r.top + r.height) >= h + 24) return { top: `${r.top + r.height + PAD + 10}px`, left: `${left}px`, width: `${w}px` }
  if (r.top >= h + 24) return { top: `${r.top - PAD - 10 - h}px`, left: `${left}px`, width: `${w}px` }
  return { bottom: '16px', right: '16px', width: `${w}px` }
})
const next = () => (last.value ? finish() : set(step.value! + 1))
const finish = () => stop()
</script>

<template>
  <Teleport to="body">
    <div v-if="current" class="tour" :class="{ centered: !rect }">
      <div v-if="rect" class="tour-spot" :style="{ top: `${rect.top - PAD}px`, left: `${rect.left - PAD}px`, width: `${rect.width + PAD * 2}px`, height: `${rect.height + PAD * 2}px` }" aria-hidden="true" />
      <div v-else class="tour-dim" aria-hidden="true" />
      <section ref="pop" class="tour-pop" :class="{ docked: !!rect }" :style="popStyle" role="dialog" aria-modal="false" aria-labelledby="tour-title" @keydown.esc="finish">
        <div class="tour-top">
          <span class="tour-count small">{{ step === 0 ? 'Guided tour' : `Step ${step} of ${STEPS.length - 1}` }}</span>
          <button type="button" class="tour-x" aria-label="End tour" @click="finish"><UiIcon name="close" :size="16" /></button>
        </div>
        <h2 id="tour-title" ref="heading" tabindex="-1">{{ current.title }}</h2>
        <p v-if="offPage" aria-live="polite">This step is on {{ PAGE_NAME[current.page!] }}.</p>
        <p v-else aria-live="polite">{{ current.intro ?? found?.body ?? current.missing }}</p>
        <div class="tour-actions">
          <UiButton v-if="step! > 0" size="sm" variant="ghost" @click="set(step! - 1)">Back</UiButton>
          <UiButton v-else size="sm" variant="ghost" @click="finish">Skip tour</UiButton>
          <UiButton v-if="offPage" size="sm" variant="primary" @click="go(true)">Go to {{ PAGE_NAME[current.page!] }}<UiIcon name="arrow" :size="14" /></UiButton>
          <UiButton v-else size="sm" variant="primary" @click="next">{{ step === 0 ? 'Start' : last ? 'Finish' : 'Next' }}<UiIcon v-if="!last" name="arrow" :size="14" /></UiButton>
        </div>
      </section>
    </div>
  </Teleport>
</template>

<style scoped>
.tour { position: fixed; inset: 0; z-index: 90; pointer-events: none; }
.tour-dim { position: absolute; inset: 0; background: rgb(8 12 18 / 0.45); }
.tour-spot { position: fixed; border-radius: var(--r-lg); box-shadow: 0 0 0 2px var(--accent), 0 0 0 9999px rgb(8 12 18 / 0.45); transition: top var(--dur-1) var(--ease), left var(--dur-1) var(--ease), width var(--dur-1) var(--ease), height var(--dur-1) var(--ease); }
.tour-pop { position: fixed; pointer-events: auto; display: grid; gap: var(--s-2); padding: var(--s-4); background: var(--raised); color: var(--ink); border: 1px solid var(--line); border-radius: var(--r-lg); box-shadow: var(--elev-overlay); }
.centered .tour-pop { top: 50%; left: 50%; transform: translate(-50%, -50%); width: min(420px, calc(100vw - 32px)); }
.tour-top { display: flex; align-items: center; justify-content: space-between; }
.tour-count { color: var(--accent); font-weight: 600; }
.tour-x { display: grid; place-items: center; width: 30px; height: 30px; margin: -6px -6px -6px 0; border: 0; border-radius: var(--r-md); background: none; color: var(--muted); cursor: pointer; }
.tour-x:hover { background: var(--sunken); color: var(--ink); }
.tour-pop h2 { margin: 0; font-size: var(--text-md); }
.tour-pop h2:focus { outline: none; }
.tour-pop p { margin: 0; color: var(--muted); font-size: var(--text-sm); line-height: 1.55; }
.tour-actions { display: flex; justify-content: space-between; gap: var(--s-2); margin-top: var(--s-1); }
@media (max-width: 720px) {
  .tour-pop.docked { top: auto !important; left: var(--s-3) !important; right: var(--s-3) !important; bottom: calc(var(--bottom-nav-h, 0px) + var(--s-3)) !important; width: auto !important; }
}
@media (prefers-reduced-motion: reduce) { .tour-spot { transition: none; } }
</style>
