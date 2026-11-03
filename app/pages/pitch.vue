<script setup lang="ts">
// Pitch deck: 16:9 slides that read on screen (scroll, or arrow keys) and print one slide per page for "Save as PDF".
// docs/pitch-deck.pdf is rendered from this page by scripts/brand/render-pitch.mjs. Every number has a numbered source
// (SOURCES, checked 3 Nov 2026); our own assumptions are marked as such. Not in the site nav: linked from /about and the footer.
import { h, type FunctionalComponent } from 'vue'

definePageMeta({ layout: 'marketing' })
useMarketingSeo({ title: 'Pitch deck', description: 'Story Bible in 13 slides: the problem, the product, a bottom-up market size with every source, the business model, go-to-market, competition and the team.', path: '/pitch' })
useSeoMeta({ robots: 'noindex' })

interface Source { id: string, label: string, title: string, url?: string }
// Order sets the footnote numbers. Accessed 3 Nov 2026 unless the title says otherwise.
const SOURCES: Source[] = [
  { id: 'onepiece', label: 'One Piece ch. 1', title: 'Eiichiro Oda, One Piece, chapter 1 “Romance Dawn” (Weekly Shōnen Jump, 1997). The carpenter answer is from Oda’s reader Q&A (SBS) as fans record it; we did not confirm the volume.' },
  { id: 'salon', label: 'Salon 2001', title: 'Salon, “Potter fix”, 12 Jan 2001 (Bloomsbury: “corrected in subsequent editions”)', url: 'https://salon.com/2001/01/12/potterfix' },
  { id: 'scarlet', label: 'A Study in Scarlet', title: 'Arthur Conan Doyle, A Study in Scarlet (1887), Part I ch. 1, Project Gutenberg #244', url: 'https://www.gutenberg.org/ebooks/244' },
  { id: 'sign', label: 'The Sign of the Four', title: 'Arthur Conan Doyle, The Sign of the Four (1890), ch. 1, Project Gutenberg #2097', url: 'https://www.gutenberg.org/ebooks/2097' },
  { id: 'gdc25', label: 'GDC 2025', title: 'GDC, 2025 State of the Game Industry (3,000+ respondents)', url: 'https://gdconf.com/article/gdc-2025-state-of-the-game-industry-devs-weigh-in-on-layoffs-ai-and-more/' },
  { id: 'gdc26', label: 'GDC 2026', title: 'GDC, 2026 State of the Game Industry (2,300+ respondents), copy hosted by InvestGame', url: 'https://investgame.net/news/pdf/2026-01-29-dec052f4_d88e_48ce_9f83_a18ce2f2a6e5_541400_gdc26_pdf_soti_report/' },
  { id: 'wga', label: 'WGA 2023 MBA', title: 'WGA East, Summary of the 2023 WGA MBA: TV writers’ room staffing minimums', url: 'https://wgaeast.org/?p=24846' },
  { id: 'd2d', label: 'Draft2Digital 2023', title: 'Draft2Digital, “The Big Indie Author Data Drop”, 21 Jun 2023', url: 'https://draft2digital.com/blog/?p=207144' },
  { id: 'vge', label: 'Video Games Europe 2025', title: 'Video Games Europe, 2025 All About Video Games – European Key Facts (workforce: EGDF, 2024 data), copy hosted by InvestGame', url: 'https://investgame.net/news/pdf/2026-08-27-all-about-games-2025-key-facts-report-final_wp/' },
  { id: 'nchome', label: 'Novelcrafter', title: 'Novelcrafter home page: “Join a community of 252k+ authors” (vendor claim)', url: 'https://www.novelcrafter.com/' },
  { id: 'fx', label: 'FX/Disney via Deadline', title: 'Deadline (via Yahoo), 9 Feb 2024: 516 scripted titles on air in 2023, source FX/Disney', url: 'https://ca.news.yahoo.com/peak-tv-over-number-original-222100123.html' },
  { id: 'arcweave', label: 'Arcweave pricing', title: 'Arcweave pricing: Pro $15/$18, Team $25/$30 per member per month (yearly/monthly); MCP server and REST API on Team', url: 'https://arcweave.com/pricing' },
  { id: 'ncprice', label: 'Novelcrafter pricing', title: 'Novelcrafter pricing: $4, $8, $14, $20 per month', url: 'https://www.novelcrafter.com/pricing' },
  { id: 'slashdata', label: 'SlashData 2024', title: 'SlashData: 11.1 million game developers in Q1 2024, including serious hobbyists and students', url: 'https://www.slashdata.co/post/there-are-11-1-million-game-developers-in-the-world' },
  { id: 'webtoon', label: 'WEBTOON 10-K', title: 'WEBTOON Entertainment, Form 10-K for 2025: 27 million creators, “the vast majority” amateur', url: 'https://www.sec.gov/Archives/edgar/data/1997859/000199785926000028/wbtn-20251231.htm' },
  { id: 'notion', label: 'Notion pricing', title: 'Notion pricing: $0, $10, $20 per member per month; Enterprise custom', url: 'https://www.notion.com/pricing' },
  { id: 'sudowrite', label: 'Sudowrite pricing', title: 'Sudowrite pricing: $10, $22, $44 per month (monthly billing)', url: 'https://www.sudowrite.com/pricing' },
  { id: 'legendkeeper', label: 'LegendKeeper', title: 'LegendKeeper home page: Pro $9 a month, $7.50 on the annual plan; “does not have generative AI features”', url: 'https://www.legendkeeper.com/' },
  { id: 'bcg', label: 'Book Check Genie', title: 'Book Check Genie: £19 per check, £22 and £49 per month; “flags possible slips for you to judge”; “the final call is always yours”', url: 'https://bookcheckgenie.com' },
  { id: 'repo', label: 'Story Bible repo', title: 'Story Bible source, README, ROADMAP and scripts (state on 3 Nov 2026)', url: GITHUB },
  { id: 'metanotes', label: 'Meta API notes', title: 'Story Bible, docs/meta-api-notes.md: 15 notes, each tied to a recorded Meta API response', url: `${GITHUB}/blob/master/docs/meta-api-notes.md` },
  { id: 'ugorur', label: 'ugorur.com', title: 'Umurcan Görür, ugorur.com', url: 'https://ugorur.com' },
  { id: 'tektik', label: 'tektik.ai', title: 'TekTık Yazılım AŞ, tektik.ai', url: 'https://tektik.ai' },
]
const num = (id: string) => SOURCES.findIndex(s => s.id === id) + 1
/** A footnote marker that links to the sources slide. */
const R: FunctionalComponent<{ id: string }> = p => h('sup', { class: 'ref' }, h('a', { href: `#src-${p.id}` }, String(num(p.id))))
/** The slide's footer: its sources by number, and the slide number. */
const Foot: FunctionalComponent<{ ids?: string[], n: number }> = p => h('footer', { class: 'sfoot' }, [
  h('span', !p.ids?.length ? 'Story Bible' : p.ids.length > 6 ? `Sources ${p.ids.map(num).join(', ')}: full list on the last slide` : `Sources: ${p.ids.map(id => `${num(id)} ${SOURCES.find(s => s.id === id)!.label}`).join(' · ')}`),
  h('span', `${p.n} / ${TOTAL}`),
])
const TOTAL = 13

// ---------- Market: bottom-up seats × a competitor's list price (not our price) ----------
const TEAM_SEAT = 25 * 12 // Arcweave Team, yearly billing, per member
const WRITER = 8 * 12 // Novelcrafter Hobbyist, monthly
interface Step { text: string, value?: number, factor?: number, show: string, src?: string, assumption?: boolean }
interface Segment { name: string, steps: Step[], price: number, priceNote: string, som: number }
const SEGMENTS: Segment[] = [
  {
    name: 'Games, Europe', price: TEAM_SEAT, priceNote: '$25/seat/month', som: 0.03,
    steps: [
      { text: 'people employed in European games (2024)', value: 123_000, show: '123,000', src: 'vge' },
      { text: 'in game design and narrative (share of GDC 2026 respondents)', factor: 0.22, show: '× 22%', src: 'gdc26' },
      { text: 'who write story and lore (assumption)', factor: 0.25, show: '× 1 in 4', assumption: true },
    ],
  },
  {
    name: 'Series fiction', price: WRITER, priceNote: '$8/month', som: 0.02,
    steps: [
      { text: 'authors in Novelcrafter’s community (vendor claim)', value: 252_000, show: '252,000', src: 'nchome' },
      { text: 'who write a series that needs checks (assumption; 75% of indie sales are series books)', factor: 0.25, show: '× 1 in 4', assumption: true, src: 'd2d' },
    ],
  },
  {
    name: 'TV, US scripted', price: TEAM_SEAT, priceNote: '$25/seat/month', som: 0.03,
    steps: [
      { text: 'scripted series on air in 2023', value: 516, show: '516', src: 'fx' },
      { text: 'writers each, the smallest WGA room minimum', factor: 3, show: '× 3', src: 'wga' },
    ],
  },
]
const MARKET = SEGMENTS.map((s) => {
  const seats = Math.round(s.steps.reduce((n, st) => st.value ?? n * (st.factor ?? 1), 0))
  const somSeats = Math.round(seats * s.som)
  return { ...s, seats, sam: seats * s.price, somSeats, somValue: somSeats * s.price }
})
const SAM_TOTAL = MARKET.reduce((n, m) => n + m.sam, 0)
const SOM_TOTAL = MARKET.reduce((n, m) => n + m.somValue, 0)
const money = (v: number) => v >= 1e6 ? `$${(v / 1e6).toFixed(1)}M` : `$${Math.round(v / 1e3)}k`
const count = (v: number) => v.toLocaleString('en-US')
// Bars drawn to scale against the largest SAM.
const MAX_SAM = Math.max(...MARKET.map(m => m.sam))
const BAR_W = 340
const barW = (v: number) => Math.max(1.5, (v / MAX_SAM) * BAR_W)

// ---------- What neighbouring tools cost, per person per month (USD, list prices) ----------
const PRICES = [
  { name: 'Arcweave', from: 15, to: 30, note: 'per member, Pro to Team', src: 'arcweave' },
  { name: 'Notion', from: 10, to: 20, note: 'per member, Plus to Business', src: 'notion' },
  { name: 'Sudowrite', from: 10, to: 44, note: 'Hobby to Max', src: 'sudowrite' },
  { name: 'Novelcrafter', from: 4, to: 20, note: 'Scribe to Specialist', src: 'ncprice' },
  { name: 'LegendKeeper', from: 7.5, to: 9, note: 'Pro, annual to monthly', src: 'legendkeeper' },
]
const PRICE_MAX = 50
const usd = (v: number) => `$${Number.isInteger(v) ? v : v.toFixed(2)}`
const px = (v: number) => (v / PRICE_MAX) * 260

// ---------- Competition: what each vendor's own page says (— = not stated on the page we checked) ----------
const COMPARE = [
  { name: 'Story Bible', us: true, cite: 'Every fact, verbatim, checked', rules: 'Yes: time and place, travel, relationships, same detail', gate: 'Yes, always', api: 'MCP (38 tools) + API', price: 'Free self-host · cloud: ask' },
  { name: 'Arcweave', cite: '—', rules: '—', gate: '—', api: 'REST API + MCP (Team tier)', price: 'Free; $15–$30 per member/mo', src: 'arcweave' },
  { name: 'Book Check Genie', cite: '—', rules: 'AI “flags possible slips”', gate: 'Yes: “the final call is always yours”', api: '—', price: '£19/check · £22–£49/mo', src: 'bcg' },
  { name: 'Sudowrite', cite: '—', rules: '—', gate: '—', api: '—', price: '$10–$44/mo', src: 'sudowrite' },
  { name: 'Novelcrafter', cite: '—', rules: '—', gate: '—', api: '—', price: '$4–$20/mo', src: 'ncprice' },
  { name: 'Notion', cite: '—', rules: '—', gate: '—', api: 'Public API', price: 'Free; $10–$20 per member/mo', src: 'notion' },
  { name: 'LegendKeeper', cite: '—', rules: '—', gate: 'No generative AI', api: '—', price: '$7.50–$9/mo', src: 'legendkeeper' },
]

const PDF = `${GITHUB}/blob/master/docs/pitch-deck.pdf`

// Arrow keys move one slide (unless a field has focus).
const deck = ref<HTMLElement>()
function onKey(e: KeyboardEvent) {
  const dir = { ArrowDown: 1, ArrowRight: 1, PageDown: 1, ArrowUp: -1, ArrowLeft: -1, PageUp: -1 }[e.key]
  if (!dir || e.altKey || e.ctrlKey || e.metaKey || (e.target as HTMLElement).closest('input, textarea, select, [contenteditable]')) return
  const slides = [...deck.value?.querySelectorAll<HTMLElement>('.slide') ?? []]
  const tops = slides.map(s => s.getBoundingClientRect().top - 80) // below the sticky site header
  const current = tops.findLastIndex(t => t <= 8) // the slide at the top of the window (-1: above the first)
  const next = slides[dir > 0 ? current + 1 : (tops[current]! < -8 ? current : current - 1)]
  if (!next) return
  e.preventDefault()
  next.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' })
}
onMounted(() => document.addEventListener('keydown', onKey))
onBeforeUnmount(() => document.removeEventListener('keydown', onKey))
const print = () => window.print()
</script>

<template>
  <div ref="deck" class="deck">
    <div class="deck-bar">
      <p>Pitch deck · {{ TOTAL }} slides · use the arrow keys to move</p>
      <div class="deck-actions">
        <UiButton :to="PDF" size="sm">PDF on GitHub</UiButton>
        <UiButton size="sm" @click="print">Save as PDF</UiButton>
      </div>
    </div>

    <!-- 1. Hook -->
    <section id="s1" class="slide hook" aria-labelledby="t1">
      <div class="in">
        <p class="kicker">Story Bible · pitch deck · Meta AI Developer Hackathon 2026</p>
        <h1 id="t1">Every story world breaks.</h1>
        <div class="cases">
          <article>
            <h3>One Piece, chapter 1<R id="onepiece" /></h3>
            <p>A bandit knocks the bar door off its hinges. Later in the scene the door is back. Oda’s answer to a reader: a carpenter fixed it.</p>
          </article>
          <article>
            <h3>Harry Potter and the Goblet of Fire<R id="salon" /></h3>
            <p>Voldemort killed James, then Lily, yet James stepped out of the wand first. Bloomsbury corrected later editions: Lily first, then James.</p>
          </article>
          <article>
            <h3>Dr Watson’s wound</h3>
            <p class="story">“struck on the shoulder by a Jezail bullet”<R id="scarlet" /></p>
            <p class="story">“I had a Jezail bullet through it” <span class="ui">(his leg)</span><R id="sign" /></p>
          </article>
        </div>
        <p class="payoff"><b>Story Bible found Watson’s wound on its own.</b> It read 31 Sherlock Holmes documents, a person accepted the facts, and a deterministic rule paired “shoulder” with “leg”, quoting both books.</p>
      </div>
      <Foot :ids="['onepiece', 'salon', 'scarlet', 'sign']" :n="1" />
    </section>

    <!-- 2. Problem -->
    <section id="s2" class="slide" aria-labelledby="t2">
      <div class="in">
        <p class="kicker">Problem</p>
        <h2 id="t2">Canon lives in people’s heads, and people move on.</h2>
        <div class="two">
          <div>
            <h3>Who it hurts</h3>
            <ul class="list">
              <li><b>Narrative leads at game studios:</b> lore, quests and barks across many documents and many hands.</li>
              <li><b>Writers’ rooms:</b> a US TV room starts at 3 writers or more under the 2023 WGA contract.<R id="wga" /></li>
              <li><b>Series novelists:</b> 75% of indie book sales are books in a series.<R id="d2d" /></li>
              <li><b>Worldbuilders:</b> magic rules, travel times and histories that start long before page one.</li>
            </ul>
          </div>
          <div>
            <h3>How canon is kept today</h3>
            <p class="today">Wikis, shared docs, spreadsheets and memory. None of them can say where a fact came from or what a change will break.</p>
            <div class="stats">
              <p><b>19%</b><span>of respondents in narrative roles were laid off: the most of any field in GDC’s 2025 survey.<R id="gdc25" /></span></p>
              <p><b>20%</b><span>of game designers, narrative included, were laid off in the past 12 months (GDC 2026).<R id="gdc26" /></span></p>
            </div>
            <p class="gap">When a writer leaves, the canon in their head leaves with them. We found no survey of how teams keep lore; our first design partners will tell us.</p>
          </div>
        </div>
      </div>
      <Foot :ids="['wga', 'd2d', 'gdc25', 'gdc26']" :n="2" />
    </section>

    <!-- 3. Solution -->
    <section id="s3" class="slide" aria-labelledby="t3">
      <div class="in">
        <p class="kicker">Solution</p>
        <h2 id="t3">The AI does the reading. People keep the say.</h2>
        <ol class="flow">
          <li><b>Import</b><span>Markdown, Word and voice recordings. Sources stay read-only; a new file is a new version.</span></li>
          <li class="pencil"><b>AI proposes</b><span>Facts, each with the exact sentence it came from. A quote that isn’t in the source is blocked.</span></li>
          <li><b>A person decides</b><span>Accept, edit or reject. Nothing becomes canon without a human.</span></li>
          <li class="ink"><b>Canon</b><span>Every fact cites its sentence and keeps who decided it.</span></li>
          <li class="checks"><b>Checks</b><span><em>Conflicts:</em> rules for time and place, travel, relationships and “same detail, two answers”. <em>Impact:</em> what a change reaches, two hops deep.</span></li>
        </ol>
        <p class="note">No evidence means the answer is “unknown”. The AI never invents a source or a quote.</p>
      </div>
      <Foot :n="3" />
    </section>

    <!-- 4. Product -->
    <section id="s4" class="slide product" aria-labelledby="t4">
      <div class="in">
        <p class="kicker">Product</p>
        <h2 id="t4">Working today, on real and sample stories</h2>
        <div class="shots">
          <figure class="big">
            <MarketingShot eager name="watson" alt="Conflict candidates in the Sherlock Holmes sample: Watson’s wound in his shoulder and in his leg, with both quotes." sizes="(max-width: 720px) 100vw, 640px" />
            <figcaption>Watson’s wound: shoulder in one book, leg in the next. Both quotes, found by a rule.</figcaption>
          </figure>
          <figure>
            <MarketingShot eager name="tide-review" alt="Review: the AI critic marks a figurative “sisters” candidate." sizes="(max-width: 720px) 100vw, 320px" />
            <figcaption>The AI critic flags a figurative “sister”.</figcaption>
          </figure>
          <figure>
            <MarketingShot eager name="impact" alt="A proposed change to a world rule with the scenes and facts it may touch." sizes="(max-width: 720px) 100vw, 320px" />
            <figcaption>A rule change and the scenes it reaches.</figcaption>
          </figure>
        </div>
      </div>
      <Foot :n="4" />
    </section>

    <!-- 5. Why now / why Meta -->
    <section id="s5" class="slide" aria-labelledby="t5">
      <div class="in">
        <p class="kicker">Why now, why Meta</p>
        <h2 id="t5">Models can read a whole story world. They still make things up.</h2>
        <div class="grid4">
          <article><h3>Muse Spark</h3><p>Extraction, the AI critic, continuity checks, research with web search, and answers from canon only.</p></article>
          <article><h3>Muse Voice Transcribe</h3><p>Table reads, voice-actor takes and dictation become timed sources: a citation plays the line.</p></article>
          <article><h3>Muse Image</h3><p>Portraits and covers for wiki pages. Editorial, never canon.</p></article>
          <article><h3>Muse Code over MCP</h3><p>An agent works with canon through 38 tools; with a propose token, what it suggests waits for a person.</p></article>
        </div>
        <p class="trust"><b>The human gate is the trust layer.</b> Every AI output is a proposal with a quote, the server checks the quote word for word, and a person decides. That is what lets a studio use AI on its canon.</p>
        <p class="note">Built against api.meta.ai: 15 notes for the Meta API team, each tied to a recorded response.<R id="metanotes" /></p>
      </div>
      <Foot :ids="['metanotes']" :n="5" />
    </section>

    <!-- 6. Market -->
    <section id="s6" class="slide" aria-labelledby="t6">
      <div class="in">
        <p class="kicker">Market, bottom-up</p>
        <h2 id="t6">SAM {{ money(SAM_TOTAL) }} a year, SOM {{ money(SOM_TOTAL) }} in three years</h2>
        <div class="market">
          <div class="mrows">
            <div v-for="m in MARKET" :key="m.name" class="mrow">
              <h3>{{ m.name }} <span class="res">= {{ count(m.seats) }} seats × {{ m.priceNote }}</span></h3>
              <p class="calc">
                <template v-for="(st, i) in m.steps" :key="i">
                  <span :class="{ as: st.assumption }"><b>{{ st.show }}</b> {{ st.text }}<R v-if="st.src" :id="st.src" /></span>{{ ' ' }}
                </template>
              </p>
            </div>
            <div class="mrow unsized">
              <h3>Comics <span class="res">not sized</span></h3>
              <p class="calc">WEBTOON has 27 million creators, “the vast majority” amateur<R id="webtoon" />. We found no count of professional comics writers.</p>
            </div>
          </div>
          <figure class="chart">
            <svg :viewBox="`0 0 460 ${MARKET.length * 70 + 34}`" role="img" :aria-label="`SAM and SOM per segment: ${MARKET.map(m => `${m.name} SAM ${money(m.sam)}, SOM ${money(m.somValue)}`).join('; ')}`">
              <g v-for="(m, i) in MARKET" :key="m.name" :transform="`translate(0 ${i * 70})`">
                <text x="0" y="15" class="c-label">{{ m.name }}</text>
                <rect x="0" y="23" :width="barW(m.sam)" height="17" rx="2" class="c-sam" />
                <text :x="barW(m.sam) + 8" y="37" class="c-val">SAM {{ money(m.sam) }}</text>
                <rect x="0" y="45" :width="barW(m.somValue)" height="10" rx="1" class="c-som" />
                <text :x="barW(m.somValue) + 8" y="55" class="c-val small">SOM {{ money(m.somValue) }} ({{ count(m.somSeats) }} seats)</text>
              </g>
              <text :y="MARKET.length * 70 + 20" x="0" class="c-axis">Bars to scale. SOM: 3% of team seats, 2% of writers.</text>
            </svg>
            <figcaption><b>TAM, not valued.</b> The outer bounds we found count people, not buyers: 11.1 million game developers including hobbyists and students<R id="slashdata" />, and 27 million WEBTOON creators.</figcaption>
            <figcaption><b>How we sized it.</b> Sourced counts × sourced shares × our assumptions (<span class="as">dashed</span>) = seats, × a competitor’s list price, not ours: $25 per seat a month for teams (Arcweave Team, yearly)<R id="arcweave" />, $8 a month for writers (Novelcrafter Hobbyist).<R id="ncprice" /> Left out: games outside Europe, TV outside the US, film, traditional publishing, comics, tabletop.</figcaption>
          </figure>
        </div>
      </div>
      <Foot :ids="['vge', 'gdc26', 'nchome', 'd2d', 'fx', 'wga', 'webtoon', 'slashdata', 'arcweave', 'ncprice']" :n="6" />
    </section>

    <!-- 7. Business model -->
    <section id="s7" class="slide" aria-labelledby="t7">
      <div class="in">
        <p class="kicker">Business model</p>
        <h2 id="t7">Open source to spread, cloud for teams to pay</h2>
        <div class="two">
          <div class="plans">
            <article><h3>Open source · free</h3><p>The whole app under AGPL-3.0. Self-host it; bring your own AI key and pay your provider directly.</p></article>
            <article class="cloud"><h3>Cloud for teams · ask for a price</h3><p>We host it for a studio, a writers’ room or a writer. Today a price is quoted per team.</p></article>
            <article class="planned"><h3>Planned, not priced yet</h3><p>A per-seat team plan and a solo writer plan. AI usage is the main running cost, so cloud prices will cover it.</p></article>
          </div>
          <figure class="chart">
            <figcaption class="top">What people pay for neighbouring tools, USD per person a month (list prices)</figcaption>
            <svg :viewBox="`0 0 540 ${PRICES.length * 40 + 40}`" role="img" :aria-label="PRICES.map(p => `${p.name} $${p.from} to $${p.to}`).join('; ')">
              <g v-for="(p, i) in PRICES" :key="p.name" :transform="`translate(0 ${i * 40})`">
                <text x="0" y="22" class="c-label">{{ p.name }}<tspan class="c-ref" dx="2" dy="-6">{{ num(p.src) }}</tspan></text>
                <rect :x="120 + px(p.from)" y="10" :width="Math.max(3, px(p.to) - px(p.from))" height="16" rx="2" class="c-range" />
                <text :x="120 + px(p.to) + 8" y="23" class="c-val small">{{ usd(p.from) }}–{{ usd(p.to) }} · {{ p.note }}</text>
              </g>
              <g :transform="`translate(120 ${PRICES.length * 40 + 8})`">
                <line x1="0" :x2="px(PRICE_MAX)" y1="0" y2="0" class="c-axisline" />
                <text v-for="t in [0, 10, 20, 30, 40, 50]" :key="t" :x="px(t)" y="20" text-anchor="middle" class="c-axis">${{ t }}</text>
              </g>
            </svg>
            <figcaption>Book Check Genie charges per check: £19, or £22–£49 a month.<R id="bcg" /> Context only: none of these is our price.</figcaption>
          </figure>
        </div>
      </div>
      <Foot :ids="['arcweave', 'notion', 'sudowrite', 'ncprice', 'legendkeeper', 'bcg']" :n="7" />
    </section>

    <!-- 8. Go-to-market -->
    <section id="s8" class="slide" aria-labelledby="t8">
      <div class="in">
        <p class="kicker">Go-to-market · plan</p>
        <h2 id="t8">Start where narrative people already gather</h2>
        <div class="two">
          <div>
            <h3>Channels</h3>
            <ul class="list">
              <li><b>Open source first.</b> A public repo that runs in about five minutes with no API key, and sample worlds with planted contradictions to find.</li>
              <li><b>Narrative communities.</b> Game-writing and narrative design groups, narrative talks at game conferences, indie author communities.</li>
              <li><b>Agents as a channel.</b> MCP setups for Muse Code, Claude Code and Cursor; planned imports from Ink, Yarn Spinner, articy:draft and Twine.</li>
              <li><b>Design partners to case studies.</b> One game team, one writers’ room and one series novelist, with results we can publish.</li>
            </ul>
          </div>
          <div>
            <h3>First 90 days</h3>
            <ol class="days">
              <li><b>Days 1–30</b><span>Repo public. Hosted cloud for three design partners. Weekly calls with each.</span></li>
              <li><b>Days 31–60</b><span>Branching canon (roadmap item 1) with the game partner; first game-script import.</span></li>
              <li><b>Days 61–90</b><span>First paid cloud teams; a published price; one public case study.</span></li>
            </ol>
            <p class="note">We will watch facts accepted per project each week, and how many conflicts teams confirm rather than dismiss.</p>
          </div>
        </div>
      </div>
      <Foot :ids="['repo']" :n="8" />
    </section>

    <!-- 9. Competition -->
    <section id="s9" class="slide" aria-labelledby="t9">
      <div class="in">
        <p class="kicker">Competition</p>
        <h2 id="t9">Others store lore or write prose. None we checked cites every fact and checks it by rule.</h2>
        <div class="table-wrap">
          <table class="cmp">
            <thead><tr><th>Product</th><th>Cited facts</th><th>Rule-based checks</th><th>Human gate on AI</th><th>API / MCP</th><th>Price</th></tr></thead>
            <tbody>
              <tr v-for="c in COMPARE" :key="c.name" :class="{ us: c.us }">
                <th scope="row">{{ c.name }}<R v-if="c.src" :id="c.src" /></th>
                <td>{{ c.cite }}</td><td>{{ c.rules }}</td><td>{{ c.gate }}</td><td>{{ c.api }}</td><td>{{ c.price }}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <p class="note"><b>Where they are stronger:</b> Arcweave already ships an MCP server; Sudowrite and Novelcrafter write prose and we don’t; Notion, Obsidian and World Anvil have communities we don’t have yet. “—” means the vendor’s own page didn’t say, checked 3 Nov 2026.</p>
      </div>
      <Foot :ids="['arcweave', 'bcg', 'sudowrite', 'ncprice', 'notion', 'legendkeeper']" :n="9" />
    </section>

    <!-- 10. Traction / proof -->
    <section id="s10" class="slide" aria-labelledby="t10">
      <div class="in">
        <p class="kicker">Proof</p>
        <h2 id="t10">Built in 9 days, checked like a product</h2>
        <div class="kpis">
          <p><b>9</b><span>days, 27 Oct–4 Nov 2026, solo, with 260+ commits</span></p>
          <p><b>4</b><span>sample worlds, up to 31 documents and 126,658 words</span></p>
          <p><b>40</b><span>scripted probes and checks that drive the real app</span></p>
          <p><b>38</b><span>MCP tools, under the same roles as people</span></p>
        </div>
        <ul class="list two-col">
          <li><b>Gold sets with targets.</b> The Metrics page scores each sample’s planted contradictions; on Sherlock Holmes it finds all 4 planted contradictions (4/4) and blocks 62 AI candidates whose quote isn’t in the text.</li>
          <li><b>Real Meta responses as contract tests.</b> 23 recorded responses from api.meta.ai replay in a fake server.</li>
          <li><b>Every AI agent is traced.</b> Agent activity shows each run, its steps, and what people did with its output.</li>
          <li><b>Open source under AGPL-3.0.</b> Self-host it today. No users or revenue yet: this is day zero.</li>
        </ul>
      </div>
      <Foot :ids="['repo']" :n="10" />
    </section>

    <!-- 11. Team -->
    <section id="s11" class="slide" aria-labelledby="t11">
      <div class="in">
        <p class="kicker">Team</p>
        <h2 id="t11">A solo entry, with a company behind it</h2>
        <div class="two">
          <article class="person">
            <h3>Umurcan Görür (Umur)<R id="ugorur" /></h3>
            <p class="role">Founder and engineer. Built Story Bible alone for this hackathon.</p>
            <ul class="list">
              <li>Paid to write code at fourteen.</li>
              <li>Co-founded three companies; one closed when the money ran out.</li>
              <li>CTO of a company of about fifty people.</li>
              <li>Taught Ruby to around 150 students.</li>
              <li>Builds Orka, an open-source way to run teams of coding agents. Story Bible was built with it.</li>
              <li>Runs a homelab of about a hundred devices, where he tests things.</li>
            </ul>
          </article>
          <article class="company">
            <h3>TekTık Yazılım AŞ · tektik.ai<R id="tektik" /></h3>
            <p class="role">The company that will develop and host Story Bible.</p>
            <ul class="list">
              <li><b>TekTık Asistan:</b> an office assistant in WhatsApp and Telegram, in beta with companies in Türkiye, with a first UK pilot.</li>
              <li><b>AI API reseller:</b> several AI models under one invoice.</li>
              <li><b>Custom AI software</b> and integrations.</li>
            </ul>
            <p class="note">The hackathon entry is Umur alone. TekTık gives Story Bible a company to sign contracts, bill and host from day one.</p>
          </article>
        </div>
      </div>
      <Foot :ids="['ugorur', 'tektik']" :n="11" />
    </section>

    <!-- 12. Roadmap and close -->
    <section id="s12" class="slide close" aria-labelledby="t12">
      <div class="in">
        <p class="kicker">Roadmap · not built yet</p>
        <h2 id="t12">What canon means in context: an episode, a quest, a player’s choice</h2>
        <div class="grid3">
          <article><h3>Next</h3><p><b>Branching canon:</b> facts true only on one player path, checked per ending. <b>Project-level access</b> for outside writers and translators.</p></article>
          <article><h3>Series</h3><p>Story time apart from release order, canon “as of” an episode, who knows what and when, setup and payoff.</p></article>
          <article><h3>Games and localization</h3><p>Quest dependencies, game-script import with bulk checks, DLC and patches, an approved-terms glossary for translators.</p></article>
        </div>
        <div class="ask">
          <p class="big">Create the perfect world for your story.</p>
          <p>We are looking for design partners: a narrative team, a writers’ room and a series novelist. <a :href="CONTACT">info@tektik.ai</a> · <a :href="GITHUB">{{ GITHUB.replace('https://', '') }}</a></p>
        </div>
      </div>
      <Foot :ids="['repo']" :n="12" />
    </section>

    <!-- 13. Sources -->
    <section id="s13" class="slide sources" aria-labelledby="t13">
      <div class="in">
        <p class="kicker">Sources · pages opened 3 Nov 2026</p>
        <h2 id="t13">Every number, where it came from</h2>
        <ol class="src">
          <li v-for="s in SOURCES" :id="`src-${s.id}`" :key="s.id">{{ s.title }}<template v-if="s.url">. <a :href="s.url">{{ s.url.replace('https://', '') }}</a></template></li>
        </ol>
      </div>
      <Foot :n="13" />
    </section>
  </div>
</template>

<style scoped>
.deck { --deck-max: 1200px; max-width: var(--deck-max); margin: 0 auto; padding: var(--s-5) var(--mk-pad) 0; display: grid; gap: var(--s-6); }
.deck-bar { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: var(--s-3); }
.deck-bar p { margin: 0; color: var(--muted); }
.deck-actions { display: flex; gap: var(--s-2); }

/* A slide is 16:9 and its type scales with its width (cqw), so the screen, the print page and the PDF match. */
.slide { container-type: inline-size; aspect-ratio: 16 / 9; position: relative; background: var(--raised); border: 1px solid var(--line); border-radius: var(--r-lg); overflow: hidden; scroll-margin-top: 80px; display: flex; flex-direction: column; }
.in { flex: 1; min-height: 0; font-size: 1.5cqw; line-height: 1.45; padding: 3.2em 4em 0; display: flex; flex-direction: column; gap: 0.9em; }
.slide :deep(.sfoot) { display: flex; justify-content: space-between; gap: 2em; padding: 0.7em 4.8em 1.1em; color: var(--faint); font-size: max(0.8cqw, 10px); }
.kicker { margin: 0; color: var(--accent); font-weight: 600; font-size: 0.85em; letter-spacing: 0.01em; }
.slide h1, .slide h2 { font-size: 2.2em; line-height: 1.1; letter-spacing: -0.025em; margin: 0; max-width: 30ch; text-wrap: balance; }
.slide h1 { font-size: 3.6em; }
.slide h3 { font-size: 1.05em; margin: 0 0 0.3em; }
.slide p { margin: 0; }
.slide :deep(.ref) { font-size: 0.62em; line-height: 0; margin-left: 0.15em; font-weight: 600; }
.slide :deep(.ref a) { color: var(--accent); text-decoration: none; }
.note { color: var(--muted); font-size: 0.85em; max-width: 90ch; }
.list { margin: 0; padding: 0; list-style: none; display: grid; gap: 0.55em; }
.list li { position: relative; padding-left: 1.1em; }
.list li::before { content: ''; position: absolute; left: 0.1em; top: 0.6em; width: 0.4em; height: 0.4em; border-radius: 50%; background: var(--accent); }
.two { display: grid; grid-template-columns: 1fr 1fr; gap: 2.4em; align-items: start; }
.grid3, .grid4 { display: grid; gap: 1em; }
.grid3 { grid-template-columns: repeat(3, 1fr); }
.grid4 { grid-template-columns: repeat(4, 1fr); }
.grid3 article, .grid4 article, .cases article, .plans article { padding: 0.9em 1em; background: var(--canvas); border: 1px solid var(--line); border-radius: var(--r-md); }
.grid3 p, .grid4 p, .cases p, .plans p { color: var(--muted); font-size: 0.9em; }

/* 1 */
.hook .in { justify-content: center; gap: 1.2em; padding-top: 2em; }
.cases { display: grid; grid-template-columns: repeat(3, 1fr); gap: 1em; }
.cases article { border-top: 3px solid var(--bad); }
.story { font-family: var(--font-story); color: var(--ink) !important; font-size: 0.95em !important; margin-bottom: 0.3em !important; }
.story .ui { font-family: var(--font-ui); color: var(--muted); }
.payoff { font-size: 1.15em; max-width: 60ch; padding-left: 0.9em; border-left: 3px solid var(--accent); }

/* 2 */
.today { font-size: 1.05em; margin-bottom: 0.9em !important; }
.stats { display: grid; gap: 0.6em; margin-bottom: 0.8em; }
.stats p { display: grid; grid-template-columns: 2.4em 1fr; gap: 0.6em; align-items: baseline; }
.stats b { font-size: 1.9em; color: var(--bad); letter-spacing: -0.02em; }
.stats span { color: var(--muted); font-size: 0.9em; }
.gap { color: var(--muted); font-size: 0.85em; }

/* 3 */
.flow { list-style: none; margin: 0.6em 0 0; padding: 0; display: grid; grid-template-columns: repeat(5, 1fr); gap: 1.6em; counter-reset: step; }
.flow li { position: relative; display: grid; align-content: start; gap: 0.4em; padding: 1em; background: var(--canvas); border: 1px solid var(--line-strong); border-radius: var(--r-md); counter-increment: step; }
.flow li::before { content: counter(step); font-weight: 600; color: var(--faint); font-size: 0.85em; }
.flow li:not(:last-child)::after { content: '→'; position: absolute; right: -1.25em; top: 50%; transform: translateY(-50%); color: var(--faint); font-size: 1.1em; }
.flow b { font-size: 1.05em; }
.flow span { color: var(--muted); font-size: 0.88em; }
.flow em { font-style: normal; font-weight: 600; color: var(--ink); }
.flow .pencil { border: 1.5px dashed var(--pencil); background: var(--pencil-soft); }
.flow .ink { background: var(--accent-soft); border-color: var(--accent); }
.flow .checks { border-top: 3px solid var(--bad); }

/* 4 */
.product .in { padding-top: 2.4em; }
.shots { display: grid; grid-template-columns: 2.25fr 1fr; grid-template-rows: auto auto; gap: 0.9em 1em; min-height: 0; }
.shots figure { margin: 0; display: grid; gap: 0.35em; align-content: start; min-width: 0; }
.shots .big { grid-row: span 2; }
.shots figcaption { font-size: 0.8em; color: var(--muted); }
.shots :deep(.shot) { padding: 3px; border-radius: 8px; }
.shots :deep(.shot img) { border-radius: 5px; }

/* 5 */
.grid4 h3 { color: var(--accent); }
.trust { font-size: 1.05em; max-width: 72ch; padding-left: 0.9em; border-left: 3px solid var(--accent); }

/* 6 */
.market { display: grid; grid-template-columns: 1fr 1.05fr; gap: 2em; align-items: start; }
.mrows { display: grid; gap: 0.75em; }
.mrow h3 { margin-bottom: 0.15em; }
.res { font-weight: 600; color: var(--accent); }
.calc { font-size: 0.82em; color: var(--muted); }
.calc b { color: var(--ink); font-weight: 600; }
.as { border: 1px dashed var(--pencil); border-radius: 3px; padding: 0 0.25em; }
.unsized h3, .unsized .res { color: var(--muted); }
.chart { margin: 0; display: grid; gap: 0.5em; }
.chart svg { width: 100%; height: auto; overflow: visible; }
.chart figcaption { font-size: 0.78em; color: var(--muted); }
.chart figcaption.top { color: var(--ink); font-weight: 600; font-size: 0.9em; }
.c-label { font: 600 16px var(--font-ui); fill: var(--ink); }
.c-ref { font-size: 11px; fill: var(--accent); }
.c-val { font: 500 15px var(--font-ui); fill: var(--ink); }
.c-val.small { font-size: 13px; fill: var(--muted); }
.c-axis { font: 400 13px var(--font-ui); fill: var(--faint); }
.c-axisline { stroke: var(--line-strong); stroke-width: 1; }
.c-sam { fill: var(--accent); }
.c-som { fill: var(--good); }
.c-range { fill: var(--accent); opacity: 0.85; }

/* 7 */
.plans { display: grid; gap: 0.7em; }
.plans .cloud { border-left: 3px solid var(--accent); }
.plans .planned { border: 1.5px dashed var(--pencil); background: transparent; }

/* 8 */
.days { list-style: none; margin: 0 0 0.9em; padding: 0; display: grid; gap: 0.6em; }
.days li { display: grid; grid-template-columns: 6.5em 1fr; gap: 0.6em; padding-bottom: 0.6em; border-bottom: 1px solid var(--line); }
.days span { color: var(--muted); font-size: 0.92em; }

/* 9 */
.slide .table-wrap { border: 1px solid var(--line); border-radius: var(--r-md); overflow: auto; }
.cmp { width: 100%; border-collapse: collapse; font-size: 0.78em; }
.cmp th, .cmp td { text-align: left; padding: 0.45em 0.7em; border-bottom: 1px solid var(--line); vertical-align: top; }
.cmp thead th { background: var(--surface); font-weight: 600; color: var(--muted); }
.cmp tbody th { font-weight: 600; white-space: nowrap; }
.cmp tr.us { background: var(--accent-soft); }
.cmp tr.us td, .cmp tr.us th { color: var(--ink); }
.cmp td { color: var(--muted); }
.slide h2#t9 { max-width: 40ch; font-size: 1.9em; }

/* 10 */
.kpis { display: grid; grid-template-columns: repeat(4, 1fr); gap: 1em; margin: 0.4em 0 0.6em; }
.kpis p { display: grid; gap: 0.2em; padding: 0.8em 1em; border-top: 3px solid var(--accent); background: var(--canvas); border-radius: 0 0 var(--r-md) var(--r-md); }
.kpis b { font-size: 2.6em; line-height: 1; letter-spacing: -0.03em; color: var(--accent); }
.kpis span { color: var(--muted); font-size: 0.88em; }
.two-col { grid-template-columns: 1fr 1fr; gap: 0.7em 2em; }

/* 11 */
.role { color: var(--muted); margin-bottom: 0.7em !important; }
.person, .company { padding: 1.1em 1.2em; border: 1px solid var(--line); border-radius: var(--r-md); background: var(--canvas); }
.person { border-top: 3px solid var(--accent); }
.company .note { margin-top: 0.8em; }

/* 12 */
.ask { margin-top: auto; margin-bottom: 0.4em; padding: 1em 1.2em; border-left: 4px solid var(--accent); background: var(--accent-soft); border-radius: var(--r-md); display: grid; gap: 0.3em; }
.ask .big { font-size: 1.6em; font-weight: 600; letter-spacing: -0.02em; }

/* 13 */
.src { margin: 0; padding-left: 1.6em; columns: 2; column-gap: 2.4em; font-size: 0.62em; line-height: 1.35; color: var(--muted); }
.src li { break-inside: avoid; margin-bottom: 0.3em; }
.sources h2 { font-size: 1.6em; }
.src a { word-break: break-all; }
.src li:target { color: var(--ink); background: var(--warn-soft); }

/* Phones and narrow windows: slides become cards with natural height and fixed-size type. */
@media screen and (max-width: 900px) {
  .slide { aspect-ratio: auto; }
  .in { font-size: 15px; padding: 24px 16px 0; }
  .slide :deep(.sfoot) { font-size: 11px; padding: 12px 16px 16px; flex-direction: column; gap: 4px; }
  .slide h1 { font-size: 2.2em; }
  .slide h2, .slide h2#t9 { font-size: 1.5em; }
  .two, .market, .grid3, .grid4, .cases, .flow, .two-col { grid-template-columns: minmax(0, 1fr); }
  .kpis { grid-template-columns: 1fr 1fr; }
  .flow li:not(:last-child)::after { content: '↓'; right: auto; left: 50%; top: auto; bottom: -1.35em; transform: none; }
  .shots { grid-template-columns: 1fr 1fr; }
  .shots .big { grid-column: 1 / -1; grid-row: auto; }
  .src { columns: 1; font-size: 0.8em; }
  .cmp { font-size: 0.8em; }
  .cmp tbody th { white-space: normal; }
}
</style>

<style>
/* Print: one slide per 16:9 page (a named page, so other pages' A4 rules never apply), light tokens, no site chrome. */
@page slide { size: 16in 9in; margin: 0; }
@media print {
  .mk-top, .mk-foot, .skip, .deck-bar { display: none !important; }
  html, body { background: var(--raised) !important; }
  .deck { display: block !important; padding: 0 !important; max-width: none !important; }
  .deck .slide { page: slide; width: 16in !important; height: 9in !important; aspect-ratio: auto !important; border: 0 !important; border-radius: 0 !important; break-inside: avoid; margin: 0 !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .deck .slide + .slide { break-before: page; }
  .mk { min-height: 0 !important; }
  /* The whole document on the slide page: a box outside the slides on the default page would add a blank last page. */
  body:has(.deck) { page: slide; }
}
</style>
