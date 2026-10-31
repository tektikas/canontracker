<script setup lang="ts">
// A short, skippable tour of the Broken Tide demo: a figurative candidate, a made-up quote, a caught conflict and a change's
// impact. It never clicks for the user or changes data; it opens the right page, outlines one element and explains it.
// Pages mark their targets with data-tour="…". When a step's target isn't there (already decided, not scanned yet), the card
// says what to do instead of pointing at nothing.
const { step, set, saved, resume, stop } = useTour()
const route = useRoute()

interface Ids { sister?: string, made?: string, rule?: string, verified: number }
const ids = ref<Ids>({ verified: 0 })
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
    const verified = (f: (typeof pending)[number]) => f.evidence.some((e: { verified: number | boolean }) => e.verified)
    ids.value = {
      sister: pending.find(f => /\bsisters\b/i.test(f.statement))?.id,
      made: pending.find(f => !verified(f))?.id,
      rule: canon.find(f => f.statement.includes('whoever carries it'))?.id,
      verified: pending.filter(verified).length,
    }
  } catch {
    ids.value = { verified: 0 }
  }
}

// sel: the element to outline on wide screens; phone: a smaller one inside it, so the bottom sheet never covers it.
interface Target { sel: string, phone?: string, body: string }
interface Step { title: string, page?: string, to?: string, targets?: Target[], missing?: string, lost?: string, intro?: string, action?: { label: string, to: string } }
const cand = (id: string) => `[data-tour="candidate"][data-fact="${id}"]`
const STEPS = computed<Step[]>(() => [
  {
    title: 'Broken Tide in five steps',
    intro: `A short tour of the demo story, about two minutes. ${{
      recorded: 'Its candidates and model checks replay a recorded run, labeled “Recorded demo run” wherever they show. ',
      live: 'Its candidates and model checks come from a live model, labeled with the model wherever they show. ',
      mixed: 'Some candidates replay a recorded run and some come from a live model; each is labeled where it shows. ',
      none: '',
    }[prov.value]}You make every decision yourself; the tour points and moves on when you act.`,
  },
  {
    title: 'The model proposes. You decide.',
    page: '/review',
    to: ids.value.sister && `/review?fact=${ids.value.sister}`,
    targets: ids.value.sister ? [{ sel: cand(ids.value.sister), phone: `${cand(ids.value.sister)} [data-tour="decide"]`, body: '“Mara and Leya are sisters” rests on one line: “You’re my sister in all but blood.” That’s a figure of speech, not family. Press Reject…, give the reason and confirm; the tour moves on when you do.' }] : [],
    lost: 'Open “Mara and Leya are sisters” in the queue to continue.',
    missing: 'The “sisters” candidate already has a decision. Rejected candidates stay at the bottom of Review, with the reason, for the audit trail.',
  },
  {
    title: 'A made-up quote can’t get in',
    page: '/review',
    to: ids.value.made && `/review?fact=${ids.value.made}`,
    targets: ids.value.made ? [{ sel: cand(ids.value.made), phone: `${cand(ids.value.made)} [data-tour="blocked"]`, body: 'Here the model quotes a line the scene never says. It isn’t in the source word for word, so Accept is switched off. Reject it with the reason “Quote not found in the source”, or press Next to leave it pending.' }] : [],
    lost: 'Open the candidate marked Blocked in the queue to continue.',
    missing: 'Every candidate with a made-up quote already has a decision. None of them could have been accepted.',
  },
  {
    title: 'Accept what holds up',
    page: '/review',
    targets: ids.value.verified ? [{ sel: '[data-tour="bulk"]', body: `The traps are handled. The other ${counted(ids.value.verified, 'candidate')} quote their source word for word. Open the list, read it, and accept them in one decision; each is logged with your name. Prefer one by one? Use Accept (key A).` }] : [],
    action: ids.value.verified ? { label: `Accept the remaining ${counted(ids.value.verified, 'verified candidate')}…`, to: '/review?bulk=1' } : undefined,
    missing: 'Every verified candidate has a decision. Conflicts are only checked in accepted canon: on to them.',
  },
  {
    title: 'Catch a conflict',
    page: '/conflicts',
    targets: [
      { sel: '[data-tour="c1"]', phone: '[data-tour="c1"] .clash', body: 'Caught: Arin can’t be crossing the causeway at 22:00 and in the Lighthouse gallery from 21:30 to 22:30. Both sides cite their passage. It is marked Hard: exact times, so it breaks canon (a Soft one is only worth a look). Confirm it or call it a false alarm, with a reason; deciding never edits canon.' },
      { sel: '[data-tour="scan"]', body: 'Scan canon runs timing, travel and relationship checks over accepted canon. Press it: Arin’s clash between scenes S05 and S06 shows up here.' },
    ],
    missing: 'Conflicts are checked by an editor. Ask one to scan canon, then come back.',
  },
  {
    title: 'See a change’s impact before it ships',
    page: '/changes',
    to: ids.value.rule && `/changes?target=${ids.value.rule}`,
    targets: [
      { sel: '[data-tour="impact"]', phone: '[data-tour="impact"] .impact > header', body: 'What the new rule may touch, within two hops, each with its path and sources: scenes S04, S07, S09 and S10, and not S01 or S03. Canon hasn’t changed: accept or reject the proposal, with a reason.' },
      ...(ids.value.rule ? [{ sel: '[data-tour="propose"]', phone: '[data-tour="propose"] form', body: 'The chord-stone rule is picked. Press Start from current wording, change it (say, a day instead of an hour), add why, and press Analyze impact. Nothing changes until someone accepts it.' }] : []),
    ],
    missing: 'The chord-stone rule (“…whoever carries it”) isn’t in canon right now. Accept it in Review, then pick it here and press Analyze impact.',
  },
])
const current = computed(() => (step.value == null ? undefined : STEPS.value[step.value]))
const last = computed(() => step.value === STEPS.value.length - 1)
const PAGE_NAME: Record<string, string> = { '/review': 'Review', '/conflicts': 'Conflicts', '/changes': 'Changes' }
const offPage = computed(() => !!current.value?.page && route.path !== current.value.page)
const text = computed(() => {
  const s = current.value
  if (!s) return ''
  if (offPage.value) return `This step is on ${PAGE_NAME[s.page!]}.`
  return s.intro ?? found.value?.body ?? (s.targets?.length ? s.lost : undefined) ?? s.missing ?? ''
})

// The person's own action moves the tour on: rejecting (or deciding) the candidate a step is about, or accepting the verified ones.
const signal = useTourSignal()
watch(signal, (s) => {
  if (!s || step.value == null) return
  signal.value = null
  const id = { 1: ids.value.sister, 2: ids.value.made }[step.value]
  if ((id && s.id === id) || (step.value === 3 && s.did === 'bulk')) set(step.value + 1)
})

// Where the step lives, which of its targets is on screen, and which side of it the card sits on.
const rect = ref<{ top: number, left: number, width: number, height: number } | null>(null)
const found = ref<Target>()
type Side = 'right' | 'left' | 'above' | 'below' | 'corner' | 'sheet'
const side = ref<Side>('corner')
const phone = () => matchMedia('(max-width: 720px)').matches
const GAP = 16
const PAD = 6 // the outline's distance from the target
let placedFor = ''
let placedHeight = 0
let settling = ''
function measure() {
  const s = current.value
  let el: HTMLElement | null = null
  found.value = s?.targets?.find(t => (el = document.querySelector<HTMLElement>(phone() && t.phone ? t.phone : t.sel)))
  if (!el) {
    rect.value = null
    return
  }
  // Once per target: a step whose target changes (Scan → the conflict it found) places the card for the new one too.
  // Again when a target above or below the card changes height (the page finished loading, a form opened): beside it, height doesn't matter.
  const key = `${step.value}:${found.value!.sel}:${phone()}`
  const height = (el as HTMLElement).offsetHeight
  if (placedFor !== key || (side.value !== 'right' && side.value !== 'left' && Math.abs(height - placedHeight) > 24)) {
    // Only once the page holds still for one tick: the router's own scroll and late data would undo the placement.
    const sig = `${key}:${Math.round((el as HTMLElement).getBoundingClientRect().top)}:${height}:${scrollY}`
    if (sig === settling) {
      placedFor = key
      placedHeight = height
      place(el)
    }
    settling = sig
  }
  const r = (el as HTMLElement).getBoundingClientRect()
  rect.value = { top: r.top, left: r.left, width: r.width, height: r.height }
}
// Beside the target when there is room, else above or below it after scrolling it into place. On phones the card is a
// bottom sheet and the target scrolls up to just under the top bar. The side is kept while the person scrolls.
function place(el: HTMLElement) {
  const scrollTo = (top: number) => window.scrollBy({ top: el.getBoundingClientRect().top - top, behavior: 'instant' })
  if (phone()) {
    scrollTo(52 + GAP)
    side.value = 'sheet'
    return
  }
  const w = Math.min(360, innerWidth - 32)
  const h = pop.value?.offsetHeight ?? 240
  let r = el.getBoundingClientRect()
  if (innerWidth - r.right >= w + 2 * GAP || r.left >= w + 2 * GAP) {
    scrollTo(Math.max(GAP, (innerHeight - Math.min(r.height, innerHeight)) / 2))
    side.value = innerWidth - r.right >= w + 2 * GAP ? 'right' : 'left'
    return
  }
  // Card above the target; when both fit on screen, centre the pair.
  scrollTo(r.height + h + 3 * GAP <= innerHeight ? (innerHeight - r.height - h - GAP) / 2 + h + GAP : h + 2 * GAP)
  r = el.getBoundingClientRect()
  if (r.top >= h + 2 * GAP - 2) {
    side.value = 'above'
    return
  }
  // Too close to the top of the page for that: below it instead (the page has extra room at the bottom while the tour runs).
  if (r.height + h + 3 * GAP <= innerHeight) scrollTo(innerHeight - h - 2 * GAP - r.height - 4)
  r = el.getBoundingClientRect()
  side.value = innerHeight - r.bottom >= h + 2 * GAP - 2 ? 'below' : 'corner'
}

// navigate: false when the tour is only picking up again (a reload, or Home's own layout mounting it afresh):
// the person chose where they are, so the card stays with them instead of pulling them back.
async function go(navigate: boolean) {
  const s = current.value
  if (!s) return
  placedFor = ''
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

const popStyle = computed(() => {
  const r = rect.value
  if (!r || import.meta.server || side.value === 'sheet') return {}
  const w = Math.min(360, innerWidth - 32)
  const h = pop.value?.offsetHeight ?? 240
  const clampX = (x: number) => Math.min(Math.max(16, x), innerWidth - w - 16)
  const clampY = (y: number) => Math.min(Math.max(16, y), innerHeight - h - 16)
  const at = (top: number, left: number) => ({ top: `${top}px`, left: `${left}px`, width: `${w}px` })
  switch (side.value) {
    case 'right': return at(clampY(r.top), r.left + r.width + GAP)
    case 'left': return at(clampY(r.top), r.left - GAP - w)
    case 'above': return at(r.top - GAP - h, clampX(r.left))
    case 'below': return at(r.top + r.height + GAP, clampX(r.left))
    default: return { bottom: '16px', right: '16px', width: `${w}px` }
  }
})
// The page gets room below its last element so a target near the bottom can scroll clear of the card (see the CSS).
watch(() => !!current.value, on => import.meta.client && document.documentElement.classList.toggle('tour-on', on), { immediate: true })
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
        <p aria-live="polite">{{ text }}</p>
        <UiButton v-if="current.action && !offPage" variant="primary" class="tour-do" @click="navigateTo(current.action.to)">{{ current.action.label }}</UiButton>
        <div class="tour-actions">
          <UiButton v-if="step! > 0" size="sm" variant="ghost" @click="set(step! - 1)">Back</UiButton>
          <UiButton v-else size="sm" variant="ghost" @click="finish">Skip tour</UiButton>
          <UiButton v-if="offPage" size="sm" variant="primary" @click="go(true)">Go to {{ PAGE_NAME[current.page!] }}<UiIcon name="arrow" :size="14" /></UiButton>
          <UiButton v-else size="sm" :variant="current.action ? 'secondary' : 'primary'" @click="next">{{ step === 0 ? 'Start' : last ? 'Finish' : 'Next' }}<UiIcon v-if="!last" name="arrow" :size="14" /></UiButton>
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
.tour-do { justify-content: center; white-space: normal; text-align: center; }
/* Phones: a bottom sheet above the bottom nav; the outlined target sits above it (place() scrolls it up). */
/* Room below the last element while the tour runs, so any target can scroll clear of the card. */
:global(html.tour-on .shell) { padding-bottom: 70vh; }
@media (max-width: 720px) {
  .tour-pop.docked { top: auto; left: 0; right: 0; bottom: var(--bottom-nav-h, 0px); width: auto; border-radius: var(--r-lg) var(--r-lg) 0 0; border-bottom: 0; }
}
@media (prefers-reduced-motion: reduce) { .tour-spot { transition: none; } }
</style>
