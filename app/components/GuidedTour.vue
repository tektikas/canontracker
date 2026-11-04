<script setup lang="ts">
// A skippable tour of the Broken Tide demo. The core path first: a figurative candidate, a made-up quote, accepting what holds
// up, a caught conflict and a change's impact. Then an end card offers more (the wiki, the timeline, Ask, the reader, export and
// agents) or exploring alone. It never clicks for the user or changes data; it opens the right page, outlines one element and
// explains it. Pages mark their targets with data-tour="…" (or a stable class). Each card reads the project as it finds it: the
// onboarding demo (every candidate pending) or the guest demo (most canon preloaded as sample canon, the scan run and the rule
// change proposed). When a step's target isn't there (already decided, not scanned yet), the card says what to do instead.
const { step, set, saved, resume, stop } = useTour()
const route = useRoute()

interface Ids { sister?: string, made?: string, rule?: string, verified: number, canon: number, sample: number, change?: string, arin?: string, scene?: string }
const ids = ref<Ids>({ verified: 0, canon: 0, sample: 0 })
async function loadIds() {
  try {
    const [pending, canon, changes, entities, docs] = await Promise.all([
      $fetch('/api/facts', { query: { status: 'pending' } }),
      $fetch('/api/facts', { query: { status: 'canon' } }),
      $fetch('/api/changes'),
      $fetch('/api/entities'),
      $fetch('/api/documents'),
    ])
    const verified = (f: (typeof pending)[number]) => f.evidence.some((e: { verified: number | boolean }) => e.verified)
    ids.value = {
      sister: pending.find(f => /\bsisters\b/i.test(f.statement))?.id,
      made: pending.find(f => !verified(f))?.id,
      rule: canon.find(f => f.statement.includes('whoever carries it'))?.id,
      verified: pending.filter(verified).length,
      canon: canon.length,
      sample: canon.filter(f => f.origin === 'sample').length,
      change: changes.find(c => c.status === 'ready_for_review' && c.before_statement.includes('whoever carries it'))?.id,
      arin: entities.find(e => e.analysis_name === 'Arin')?.id,
      scene: docs.find(d => d.filename === 'S05.md')?.id,
    }
  } catch {
    ids.value = { verified: 0, canon: 0, sample: 0 }
  }
}

// sel: the element to outline on wide screens; phone: a smaller one inside it, so the bottom sheet never covers it.
interface Target { sel: string, phone?: string, body: string }
interface Step {
  title: string, page?: string, pageName?: string, to?: string, targets?: Target[], missing?: string, lost?: string, intro?: string,
  action?: { label: string, to: string }, chapter: 'core' | 'more' | 'start' | 'break'
}
const cand = (id: string) => `[data-tour="candidate"][data-fact="${id}"]`
const STEPS = computed<Step[]>(() => {
  const i = ids.value
  const preloaded = i.sample > 0
  const traps = !i.sister && !i.made
  return [
    {
      chapter: 'start',
      title: 'Broken Tide in five steps',
      intro: preloaded
        ? 'Most of this story’s canon is already in place, marked “Sample canon (preloaded)”, so every page has something to show. A few candidates are left for you. Five steps, about two minutes: you make every decision yourself; the tour points and moves on when you act.'
        : 'A short tour of the demo story, about two minutes. You make every decision yourself; the tour points and moves on when you act.',
    },
    {
      chapter: 'core',
      title: 'The AI proposes. You decide.',
      page: '/review',
      pageName: 'Review',
      to: i.sister && `/review?fact=${i.sister}`,
      targets: i.sister ? [{ sel: cand(i.sister), phone: `${cand(i.sister)} [data-tour="decide"]`, body: '“Mara and Leya are sisters” rests on one line: “You’re my sister in all but blood.” That’s a figure of speech, not family. Press Reject…, give the reason and confirm; the tour moves on when you do.' }] : [],
      lost: 'Open “Mara and Leya are sisters” in the queue to continue.',
      missing: 'The “sisters” candidate already has a decision. Rejected candidates stay at the bottom of Review, with the reason, for the audit trail.',
    },
    {
      chapter: 'core',
      title: 'A made-up quote can’t get in',
      page: '/review',
      pageName: 'Review',
      to: i.made && `/review?fact=${i.made}`,
      targets: i.made ? [{ sel: cand(i.made), phone: `${cand(i.made)} [data-tour="blocked"]`, body: 'Here the AI quotes a line the scene never says. It isn’t in the source word for word, so Accept is switched off. Reject it with the reason “Quote not found in the source”, or press Next to leave it for now.' }] : [],
      lost: 'Open the candidate marked Blocked in the queue to continue.',
      missing: 'Every candidate with a made-up quote already has a decision. None of them could have been accepted.',
    },
    {
      chapter: 'core',
      title: 'Accept what holds up',
      page: '/review',
      pageName: 'Review',
      targets: i.verified ? [{ sel: '[data-tour="bulk"]', body: `${preloaded ? 'The rest of canon is preloaded; this short queue is yours. ' : ''}${traps ? 'The traps are handled. The other' : 'These'} ${counted(i.verified, 'candidate')} quote their source word for word${traps ? '' : ' (a verbatim quote can still be wrong, as the “sisters” one shows)'}. Open the list, read it, and accept them in one decision; each is logged with your name. Prefer one by one? Use Accept (key A).` }] : [],
      action: i.verified ? { label: `Accept the remaining ${counted(i.verified, 'verified candidate')}…`, to: '/review?bulk=1' } : undefined,
      missing: 'Every verified candidate has a decision. Conflicts are only checked in accepted canon: on to them.',
    },
    {
      chapter: 'core',
      title: 'Catch a conflict',
      page: '/conflicts',
      pageName: 'Conflicts',
      targets: [
        { sel: '[data-tour="c1"]', phone: '[data-tour="c1"] .clash', body: `${preloaded ? 'Already found by the scan over canon: ' : 'Caught: '}Arin can’t be crossing the causeway at 22:00 and in the Lighthouse gallery from 21:30 to 22:30. Both sides cite their passage. It is marked Hard: exact times, so it breaks canon (a Soft one is only worth a look). Confirm it or call it a false alarm, with a reason; deciding never edits canon.` },
        { sel: '[data-tour="scan"]', body: 'Scan canon runs timing, travel and relationship checks over accepted canon. Press it: Arin’s clash between scenes S05 and S06 shows up here.' },
      ],
      missing: i.canon
        ? 'Conflicts are checked by an editor. Ask one to scan canon, then come back.'
        : 'Conflicts are checked in accepted canon, and nothing is accepted yet. Accept the verified candidates in Review (Back takes you there), then press Scan canon here.',
    },
    {
      chapter: 'core',
      title: 'See a change’s impact before it ships',
      page: '/changes',
      pageName: 'Changes',
      to: i.change ? `/changes#change-${i.change}` : i.rule && `/changes?target=${i.rule}`,
      targets: [
        { sel: '[data-tour="impact"]', phone: '[data-tour="impact"] .impact > header', body: 'What the new rule may touch, within two hops, each with its path and sources: scenes S04, S07, S09 and S10, and not S01 or S03. Canon hasn’t changed: accept or reject the proposal, with a reason.' },
        ...(i.change ? [{ sel: `#change-${i.change}`, phone: `#change-${i.change} .impact > header`, body: 'A proposal is waiting: the chord stone would erase the last day instead of the last hour. Its possible review impact lists what that may touch, within two hops, each with its path and sources: scenes S04, S07, S09 and S10, and not S01 or S03. Canon hasn’t changed: accepting or rejecting it, with a reason, is yours.' }] : []),
        ...(i.rule ? [{ sel: '[data-tour="propose"]', phone: '[data-tour="propose"] form', body: 'The chord-stone rule is picked. Press Start from current wording, change it (say, a day instead of an hour), add why, and press Analyze impact. Nothing changes until someone accepts it.' }] : []),
      ],
      missing: 'The chord-stone rule (“…whoever carries it”) isn’t in canon right now. Accept it in Review, then pick it here and press Analyze impact.',
    },
    {
      chapter: 'break',
      title: 'That’s the core',
      intro: 'The AI proposes with a quote, a person decides, rules catch contradictions and a change shows its impact before it ships. Six short stops show the rest: the wiki, the timeline, Ask, the reader, export and agents.',
    },
    {
      chapter: 'more',
      title: 'A page for every name',
      page: i.arin && `/entities/${i.arin}`,
      pageName: 'Arin’s page',
      targets: i.arin ? [{ sel: '[data-tour="wiki-facts"]', phone: '[data-tour="wiki-facts"] .panel-head', body: 'Every name in canon gets a wiki page. What canon says lists Arin’s accepted facts, each with the passage it came from; the Relationships tab draws who he’s tied to. Summary and notes are your team’s words, never canon.' }] : [],
      missing: 'Pages are filed from accepted canon. Accept a few candidates in Review, then open Entities.',
    },
    {
      chapter: 'more',
      title: 'The timeline',
      page: i.arin && `/entities/${i.arin}`,
      pageName: 'Arin’s page',
      to: i.arin && `/entities/${i.arin}?tab=timeline`,
      targets: i.arin ? [{ sel: '[data-tour="timeline"]', phone: '[data-tour="timeline"] .panel-head', body: 'Arin’s canon facts on the story clock, each one a fact with its source. Canon has the same timeline for the whole cast, and a story with no clock times is laid out in reading order instead.' }] : [],
      missing: 'The timeline shows accepted canon. Accept a few candidates in Review first.',
    },
    {
      chapter: 'more',
      title: 'Ask the canon',
      page: '/ask',
      pageName: 'Ask',
      targets: [{ sel: '.ask .starter', phone: '.ask .convs-head', body: `Ask a question in plain words (New starts a conversation the team can read). Canon mode answers only from accepted canon and cites each source; ${i.canon ? 'when canon doesn’t say, the answer is “unknown”, never a guess' : 'with no canon yet, it answers “unknown”'}. Answers are marked as AI. Research mode looks outside the story and never adds to canon.` }],
    },
    {
      chapter: 'more',
      title: 'Read the source',
      page: i.scene && `/documents/${i.scene}`,
      pageName: 'scene S05',
      targets: [{ sel: 'main .doc', phone: 'main .doc .reader', body: 'Every source is stored read-only, versions and all. Select a few words in it: Add fact proposes a fact with exactly that quote, and Check continuity tests them against canon.' }],
    },
    {
      chapter: 'more',
      title: 'Hand it on',
      page: '/export',
      pageName: 'Export',
      targets: [{ sel: 'main .download', phone: 'main .download .panel-head', body: 'The story bible holds only accepted canon, each fact with its source words: download it, print it, or share a read-only link with people outside the studio.' }],
    },
    {
      chapter: 'more',
      title: 'Agents propose, people decide',
      page: '/settings/agents',
      pageName: 'Agents & API',
      targets: [{ sel: 'main p.intro', body: 'Connect your AI tools over MCP with a token for this project. Agents read canon with its sources, check continuity and propose candidates, which wait in Review like any other. No token can accept, reject or decide anything: only a person does.' }],
      missing: 'Agents & API is in Studio settings.',
    },
  ]
})
const current = computed(() => (step.value == null ? undefined : STEPS.value[step.value]))
const last = computed(() => step.value === STEPS.value.length - 1)
// Progress within the part the person is in: the core path, then the optional one.
const progress = computed(() => {
  const s = current.value
  if (!s || s.chapter === 'start') return 'Guided tour'
  if (s.chapter === 'break') return 'Core tour done'
  const same = STEPS.value.filter(x => x.chapter === s.chapter)
  return `${s.chapter === 'more' ? 'More · ' : ''}${same.indexOf(s) + 1} of ${same.length}`
})
const offPage = computed(() => !!current.value?.page && route.path !== current.value.page)
const text = computed(() => {
  const s = current.value
  if (!s) return ''
  if (offPage.value) return `This step is on ${s.pageName}.`
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
  // A target that is in the DOM but not laid out (a column hidden on phones) doesn't count; then its other selector is tried
  // (Ask hides the chat column up to 900px, the phone selector only takes over at 720px).
  const laid = (q?: string) => {
    const e = q ? document.querySelector<HTMLElement>(q) : null
    return e && e.getClientRects().length > 0 ? e : null
  }
  found.value = s?.targets?.find(t => (el = phone() && t.phone ? laid(t.phone) ?? laid(t.sel) : laid(t.sel) ?? laid(t.phone)))
  if (!found.value || !el) {
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
// Esc ends the tour from anywhere, unless it belongs to something else first: an open dialog (the bulk sheet), a form field
// (Review's reject form closes on Esc) or a handler that already took it.
function onKey(e: KeyboardEvent) {
  if (e.key !== 'Escape' || step.value == null || e.defaultPrevented || document.querySelector('dialog[open]')) return
  if ((e.target as HTMLElement | null)?.closest('input, textarea, select, [contenteditable="true"]') && !(e.target as HTMLElement).closest('.tour-pop')) return
  finish()
}
onMounted(async () => {
  window.addEventListener('scroll', measure, { passive: true, capture: true })
  window.addEventListener('resize', measure)
  window.addEventListener('keydown', onKey)
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
  window.removeEventListener('keydown', onKey)
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
// Focus goes back where it was before the tour took it (the button that started it), else to the page's main region.
let before: HTMLElement | null = null
watch(step, (n, old) => { if (import.meta.client && n != null && old == null) before = document.activeElement as HTMLElement | null })
function finish() {
  stop()
  const back = before?.isConnected ? before : document.querySelector<HTMLElement>('main')
  if (back && !back.hasAttribute('tabindex') && back.tagName === 'MAIN') back.setAttribute('tabindex', '-1')
  nextTick(() => back?.focus({ preventScroll: true }))
}
</script>

<template>
  <Teleport to="body">
    <div v-if="current" class="tour" :class="{ centered: !rect }">
      <div v-if="rect" class="tour-spot" :style="{ top: `${rect.top - PAD}px`, left: `${rect.left - PAD}px`, width: `${rect.width + PAD * 2}px`, height: `${rect.height + PAD * 2}px` }" aria-hidden="true" />
      <div v-else class="tour-dim" aria-hidden="true" />
      <section ref="pop" class="tour-pop" :class="{ docked: !!rect }" :style="popStyle" role="dialog" aria-modal="false" aria-labelledby="tour-title">
        <div class="tour-top">
          <span class="tour-count small">{{ progress }}</span>
          <button type="button" class="tour-x" aria-label="End tour" @click="finish"><UiIcon name="close" :size="16" /></button>
        </div>
        <h2 id="tour-title" ref="heading" tabindex="-1">{{ current.title }}</h2>
        <p aria-live="polite">{{ text }}</p>
        <UiButton v-if="current.action && !offPage" variant="primary" class="tour-do" @click="navigateTo(current.action.to)">{{ current.action.label }}</UiButton>
        <div v-if="current.chapter === 'break'" class="tour-choice">
          <UiButton variant="primary" class="tour-do" @click="next">Keep going: wiki, timeline, Ask, agents<UiIcon name="arrow" :size="14" /></UiButton>
          <UiButton class="tour-do" @click="finish">Explore on my own</UiButton>
        </div>
        <div class="tour-actions">
          <UiButton v-if="current.chapter !== 'break' && !last" size="sm" variant="ghost" @click="finish">Skip tour</UiButton>
          <span class="tour-nav">
            <UiButton v-if="step! > 0" size="sm" variant="ghost" @click="set(step! - 1)">Back</UiButton>
            <template v-if="current.chapter !== 'break'">
              <UiButton v-if="offPage" size="sm" variant="primary" @click="go(true)">Go to {{ current.pageName }}<UiIcon name="arrow" :size="14" /></UiButton>
              <UiButton v-else size="sm" :variant="current.action ? 'secondary' : 'primary'" @click="next">{{ step === 0 ? 'Start' : last ? 'Finish' : 'Next' }}<UiIcon v-if="!last" name="arrow" :size="14" /></UiButton>
            </template>
          </span>
        </div>
      </section>
    </div>
  </Teleport>
</template>

<style scoped>
.tour { position: fixed; inset: 0; z-index: 90; pointer-events: none; }
.tour-dim { position: absolute; inset: 0; background: var(--scrim); }
.tour-spot { position: fixed; border-radius: var(--r-lg); box-shadow: 0 0 0 2px var(--accent), 0 0 0 9999px var(--scrim); transition: top var(--dur-1) var(--ease), left var(--dur-1) var(--ease), width var(--dur-1) var(--ease), height var(--dur-1) var(--ease); }
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
.tour-choice { display: grid; gap: var(--s-2); }
.tour-nav { display: flex; gap: var(--s-2); margin-left: auto; }
/* Phones: a bottom sheet above the bottom nav; the outlined target sits above it (place() scrolls it up). */
/* Room below the last element while the tour runs, so any target can scroll clear of the card. */
:global(html.tour-on .shell) { padding-bottom: 70vh; }
@media (max-width: 720px) {
  .tour-pop.docked { top: auto; left: 0; right: 0; bottom: var(--bottom-nav-h, 0px); width: auto; border-radius: var(--r-lg) var(--r-lg) 0 0; border-bottom: 0; }
}
@media (prefers-reduced-motion: reduce) { .tour-spot { transition: none; } }
</style>
