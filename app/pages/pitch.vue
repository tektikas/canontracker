<script setup lang="ts">
// Pitch deck: twelve 16:9 slides (one idea each, alternating dark and light like the video) and an appendix with the
// detail: TAM/SAM (A1), SOM and ramp (A2), competitor table, proof and every source. Reads on screen (scroll or arrow keys) and prints one
// slide per page; docs/pitch-deck.pdf is rendered from this page by scripts/brand/render-pitch.mjs. Every number has a
// numbered source (SOURCES, pages opened 3 Nov 2026); our own assumptions are marked. Linked from /about and the footer only.
import { h, type FunctionalComponent } from 'vue'

definePageMeta({ layout: 'marketing' })
useMarketingSeo({ title: 'Pitch deck', description: 'Story Bible in twelve slides: every story world breaks, the product that catches it, who builds story worlds today, the model, go-to-market, competition and the team. Sources in the appendix.', path: '/pitch' })
useSeoMeta({ robots: 'noindex' })

interface Source { id: string, title: string, url?: string }
// Order sets the footnote numbers.
const SOURCES: Source[] = [
  { id: 'onepiece', title: 'Eiichiro Oda, One Piece, chapter 1 “Romance Dawn” (Weekly Shōnen Jump, 1997). The carpenter is Oda’s answer in his reader Q&A (SBS), as fans record it; we did not confirm the volume.' },
  { id: 'salon', title: 'Salon, “Potter fix”, 12 Jan 2001: Bloomsbury, “corrected in subsequent editions”', url: 'https://salon.com/2001/01/12/potterfix' },
  { id: 'scarlet', title: 'Arthur Conan Doyle, A Study in Scarlet (1887), Part I ch. 1: “struck on the shoulder by a Jezail bullet”', url: 'https://www.gutenberg.org/ebooks/244' },
  { id: 'sign', title: 'Arthur Conan Doyle, The Sign of the Four (1890), ch. 1: “I had a Jezail bullet through it” (his leg)', url: 'https://www.gutenberg.org/ebooks/2097' },
  { id: 'repo', title: 'Story Bible source, README, ROADMAP and scripts, 3 Nov 2026; Sherlock result from scripts/sherlock-probe.mjs', url: GITHUB },
  { id: 'gdc25', title: 'GDC, 2025 State of the Game Industry: “Roles in the Narrative field saw the most impact, with 19% of respondents”', url: 'https://gdconf.com/article/gdc-2025-state-of-the-game-industry-devs-weigh-in-on-layoffs-ai-and-more/' },
  { id: 'steam', title: 'Game World Observer, 30 Dec 2024, State of Steam 2024: “According to SteamDB, 18,945 games were released on Steam in 2024” (count as of that date)', url: 'https://www.gameworldobserver.com/2024/12/30/state-of-steam-2024-19k-new-games-records-ccu-chart-leaders' },
  { id: 'ggj', title: 'Wikipedia, Global Game Jam: 2025, 35,371 registered participants at 795 sites in 97 countries (secondary)', url: 'https://en.wikipedia.org/wiki/Global_Game_Jam' },
  { id: 'cass', title: 'China Daily, 14 Apr 2026, on the Chinese Academy of Social Sciences report: online literature writers rose to 32.69 million in 2025', url: 'https://www.chinadaily.com.cn/a/202604/14/WS69de142fa310d6866eb435ec.html' },
  { id: 'ao3', title: 'Wikipedia, Archive of Our Own: “over 18,470,000 works in over 82,900 fandoms” as of 18 Sep 2026 (secondary)', url: 'https://en.wikipedia.org/wiki/Archive_of_Our_Own' },
  { id: 'roll20', title: 'Roll20 press release, 22 Feb 2022: “reached 10 million users” (registered accounts)', url: 'https://pressreleases.triplepointpr.com/?p=23852' },
  { id: 'legendkeeper', title: 'LegendKeeper home page: “Used by 200k+ creators” (vendor claim); Pro $9 a month, $7.50 billed annually; no generative AI', url: 'https://www.legendkeeper.com/' },
  { id: 'tadc', title: 'YouTube Official Blog, 28 Oct 2024: Amazing Digital Circus videos from GLITCH, “more than 750 million views” (vendor)', url: 'https://blog.youtube/culture-and-trends/indie-animation/' },
  { id: 'sensortower', title: 'Sensor Tower, State of Short Drama Apps 2025: global in-app revenue of short-drama apps, $178M in Q1 2024 to nearly $700M in Q1 2025', url: 'https://sensortower.com/blog/state-of-short-drama-apps-2025' },
  { id: 'pw', title: 'Publishers Weekly, 23 Mar 2026 (Bowker, US ISBNs): self-published titles “soared 38.7% to more than 3.5 million” in 2025', url: 'https://www.publishersweekly.com/pw/print/20260323/99943-book-output-topped-4-million-in-2025.html' },
  { id: 'd2d', title: 'Draft2Digital, “The Big Indie Author Data Drop”, 21 Jun 2023 (Draft2Digital distribution data, labelled 2022): “75% of book sales (fiction and nonfiction) were part of a series”', url: 'https://draft2digital.com/blog/?p=207144' },
  { id: 'fx', title: 'Deadline via Yahoo, 9 Feb 2024: “516 scripted titles on air in 2023”, source FX/Disney', url: 'https://ca.news.yahoo.com/peak-tv-over-number-original-222100123.html' },
  { id: 'wgaw', title: 'Wikipedia, Writers Guild of America West: “around 14,000 total members as of 2026”, citing the US DOL OLMS filing (secondary)', url: 'https://en.wikipedia.org/wiki/Writers_Guild_of_America_West' },
  { id: 'goldman', title: 'Investing.com, 6 Apr 2023, on Goldman Sachs: creator economy “$250 billion TAM”, “approximately $480B by 2027” (secondary)', url: 'https://uk.investing.com/news/stock-market-news/goldman-sachs-estimates-creator-economy-tam-of-250-billion-432SI-2977867' },
  { id: 'webtoon', title: 'WEBTOON Entertainment, Form 10-K for 2025: “connected 27 million creators”; “the vast majority of the 27 million creators on our platform are amateur creators”', url: 'https://www.sec.gov/Archives/edgar/data/1997859/000199785926000028/wbtn-20251231.htm' },
  { id: 'slashdata', title: 'SlashData: “In Q1 2024, there are 11.1 million game developers”, including serious hobbyists and students', url: 'https://www.slashdata.co/post/there-are-11-1-million-game-developers-in-the-world' },
  { id: 'gdc26', title: 'GDC, 2026 State of the Game Industry (copy hosted by InvestGame): top roles “game design and narrative (22%)”', url: 'https://investgame.net/news/pdf/2026-01-29-dec052f4_d88e_48ce_9f83_a18ce2f2a6e5_541400_gdc26_pdf_soti_report/' },
  { id: 'nchome', title: 'Novelcrafter home page: “Join a community of 252k+ authors” (vendor claim)', url: 'https://www.novelcrafter.com/' },
  { id: 'ncprice', title: 'Novelcrafter pricing: $4, $8, $14, $20 a month', url: 'https://www.novelcrafter.com/pricing' },
  { id: 'arcweave', title: 'Arcweave pricing: Pro $15/$18, Team $25/$30 per member a month (yearly/monthly); REST API and MCP server on Team', url: 'https://arcweave.com/pricing' },
  { id: 'bcg', title: 'Book Check Genie: “flags possible slips for you to judge”; “Each finding comes with chapter references and supporting quotes”; “the final call is always yours”; £19 a check, £22 and £49 a month', url: 'https://bookcheckgenie.com' },
  { id: 'sudowrite', title: 'Sudowrite pricing: $10, $22, $44 a month', url: 'https://www.sudowrite.com/pricing' },
  { id: 'notion', title: 'Notion pricing: Free, Plus $10, Business $20 per member a month', url: 'https://www.notion.com/pricing' },
  { id: 'kanka', title: 'Kanka blog, 27 Oct 2023: 225,000 accounts created, 27,000 active accounts', url: 'https://blog.kanka.io/2023/10/27/anniversary-six-years-of-kanka-a-celebration' },
  { id: 'metanotes', title: 'Story Bible, docs/meta-api-notes.md: 15 notes for the Meta API team, each tied to a recorded response', url: `${GITHUB}/blob/master/docs/meta-api-notes.md` },
  { id: 'ugorur', title: 'Umurcan Görür, ugorur.com', url: 'https://ugorur.com' },
  { id: 'tektik', title: 'TekTık Yazılım AŞ, tektik.ai', url: 'https://tektik.ai' },
]
const num = (id: string) => SOURCES.findIndex(s => s.id === id) + 1
/** A footnote marker that links to the sources page of the appendix. */
const R: FunctionalComponent<{ id: string }> = p => h('sup', { class: 'ref' }, h('a', { href: `#src-${p.id}` }, String(num(p.id))))
/** Footer: the slide's source numbers (tiny) and its number. */
const Foot: FunctionalComponent<{ ids?: string[], n: string }> = p => h('footer', { class: 'sfoot' }, [
  h('span', p.ids?.length ? `Sources ${p.ids.map(num).join(', ')}, appendix A5` : ''),
  h('span', p.n),
])
const MAIN = 12

// ---------- Who builds story worlds (slide 7): one sourced number each, units never mixed ----------
const WORLDS = [
  { who: 'Game makers', big: '18,945', what: 'games released on Steam in 2024 (as of 30 Dec 2024)', src: 'steam', more: '35,371 people at the 2025 Global Game Jam', moreSrc: 'ggj' },
  { who: 'Serial and fan fiction', big: '32.69M', what: 'online-literature writers in China, 2025', src: 'cass', more: '18.47M works on AO3 (per Wikipedia)', moreSrc: 'ao3' },
  { who: 'Game masters', big: '10M', what: 'Roll20 accounts (2022)', src: 'roll20', more: 'LegendKeeper: “200k+ creators” (vendor)', moreSrc: 'legendkeeper' },
  { who: 'Video creators', big: '750M+', what: 'views of The Amazing Digital Circus videos (YouTube, 2024)', src: 'tadc', more: 'Short-drama apps, global in-app revenue: ~$700M in Q1 2025 vs $178M in Q1 2024', moreSrc: 'sensortower' },
  { who: 'Novelists', big: '3.5M+', what: 'self-published titles in 2025 (US ISBNs)', src: 'pw', more: '75% of sales through Draft2Digital were books in a series (2022 data)', moreSrc: 'd2d' },
  { who: 'Screen and series', big: '516', what: 'scripted US series on air in 2023', src: 'fx', more: 'WGA West: about 14,000 members (per Wikipedia)', moreSrc: 'wgaw' },
]

// ---------- Market size (appendix A1, A2): sourced bases × labelled assumptions × our ASSUMED tier prices ----------
// The tier prices are assumptions for sizing only; the site says cloud pricing is on request. AI usage is not counted.
const PRICE = { solo: 12, team: 29, studio: 49 } as const
type Tier = keyof typeof PRICE
const TIER_NAME: Record<Tier, string> = { solo: 'Solo', team: 'Team', studio: 'Studio' }
interface Step { show: string, text: string, factor: number, src?: string, assumption?: boolean }
interface Group { name: string, base: number, baseText: string, src: string, baseSteps?: Step[], tier: Tier, sam: Step[] }
const GROUPS: Group[] = [
  { name: 'Web and serial fiction writers, China', base: 32_690_000, baseText: 'online-literature writers, 2025', src: 'cass', tier: 'solo',
    sam: [{ show: '× 0', text: 'China’s domestic market left out of SAM: hard to reach', factor: 0, assumption: true }] },
  { name: 'Webcomic and web-novel creators', base: 27_000_000, baseText: 'creators on WEBTOON’s platforms, 2025 (mostly amateur)', src: 'webtoon', tier: 'solo',
    sam: [{ show: '× 1 in 20', text: 'serious: pro or semi-pro', factor: 0.05, assumption: true }] },
  { name: 'Game developers', base: 11_100_000, baseText: 'game developers worldwide incl. hobbyists and students, Q1 2024', src: 'slashdata', tier: 'team',
    sam: [{ show: '× 22%', text: 'in game design and narrative', factor: 0.22, src: 'gdc26' }, { show: '× 1 in 4', text: 'who write story and lore', factor: 0.25, assumption: true }] },
  { name: 'Game masters', base: 10_000_000, baseText: 'Roll20 accounts, 2022', src: 'roll20', tier: 'solo',
    baseSteps: [{ show: '× 1 in 5', text: 'who run games', factor: 0.2, assumption: true }],
    sam: [{ show: '× 1 in 4', text: 'who keep written campaign lore', factor: 0.25, assumption: true }] },
  { name: 'Novelists and series authors', base: 252_000, baseText: 'authors in Novelcrafter’s community (vendor claim; a floor, no sourced global count)', src: 'nchome', tier: 'solo', sam: [] },
  { name: 'Screenwriters', base: 14_000, baseText: 'WGA West members (per Wikipedia)', src: 'wgaw', tier: 'studio', sam: [] },
]
const SOM_SHARE: Record<Tier, number> = { solo: 0.03, team: 0.04, studio: 0.05 } // year 5, assumptions
const RAMP = [0.02, 0.1, 0.25, 0.55, 1] // share of the year-5 SOM reached in years 1–5, assumptions
const yearly = (t: Tier) => PRICE[t] * 12
const product = (n: number, steps: Step[] = []) => Math.round(steps.reduce((v, st) => v * st.factor, n))
const SIZED = GROUPS.map((g) => {
  const tamSeats = product(g.base, g.baseSteps)
  const samSeats = product(tamSeats, g.sam)
  return { ...g, tamSeats, tamValue: tamSeats * yearly(g.tier), samSeats, samValue: samSeats * yearly(g.tier) }
})
const TAM = SIZED.reduce((n, g) => n + g.tamValue, 0)
const SAM = SIZED.reduce((n, g) => n + g.samValue, 0)
const SOM_TIERS = (Object.keys(PRICE) as Tier[]).map((t) => {
  const samSeats = SIZED.filter(g => g.tier === t).reduce((n, g) => n + g.samSeats, 0)
  const seats = Math.round(samSeats * SOM_SHARE[t])
  return { tier: t, samSeats, share: SOM_SHARE[t], seats, arr: seats * yearly(t) }
})
const SOM = SOM_TIERS.reduce((n, t) => n + t.arr, 0)
const SOM_SEATS = SOM_TIERS.reduce((n, t) => n + t.seats, 0)
const money = (v: number) => v >= 1e9 ? `$${(v / 1e9).toFixed(1)}B` : v >= 1e6 ? `$${(v / 1e6).toFixed(v >= 1e8 ? 0 : 1)}M` : `$${Math.round(v / 1e3)}k`
const pct = (v: number) => `${Math.round(v * 100)}%`
const count = (v: number) => v.toLocaleString('en-US')

// ---------- Competition (slide 9): placed only by what each vendor's own page says ----------
// x: checks consistency automatically (0 no claim … 1 deterministic rules); y: cites every canon fact verbatim (0 no claim … 1 every fact).
const MAP = [
  { name: 'Story Bible', x: 0.74, y: 0.84, us: true },
  { name: 'Book Check Genie', x: 0.62, y: 0.38, note: 'AI flags slips and quotes each finding', src: 'bcg' },
  { name: 'Arcweave', x: 0.12, y: 0.24, src: 'arcweave' },
  { name: 'LegendKeeper', x: 0.24, y: 0.17, src: 'legendkeeper' },
  { name: 'Novelcrafter', x: 0.2, y: 0.36, src: 'nchome' },
  { name: 'Sudowrite', x: 0.36, y: 0.28, src: 'sudowrite' },
  { name: 'Notion', x: 0.05, y: 0.06, src: 'notion' },
  { name: 'Kanka', x: 0.36, y: 0.04, src: 'kanka' },
]
const COMPARE = [
  { name: 'Story Bible', cite: 'Every fact, verbatim, checked', rules: 'Yes: time and place, travel, relationships, same detail', gate: 'Yes, always', api: 'MCP (38 tools) + API', price: 'Free self-host; cloud: ask' },
  { name: 'Arcweave', cite: '—', rules: '—', gate: '—', api: 'REST API + MCP (Team tier)', price: 'Free; $15–$30 per member/mo', src: 'arcweave' },
  { name: 'Book Check Genie', cite: 'Each finding quoted, with chapter references', rules: 'AI “flags possible slips”', gate: 'Yes: “the final call is always yours”', api: '—', price: '£19/check; £22–£49/mo', src: 'bcg' },
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
  const tops = slides.map(s => s.getBoundingClientRect().top - 72) // below the sticky site header
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
      <p>Pitch deck: {{ MAIN }} slides and an appendix. Arrow keys move one slide.</p>
      <div class="deck-actions">
        <UiButton :to="PDF" size="sm">PDF on GitHub</UiButton>
        <UiButton size="sm" @click="print">Save as PDF</UiButton>
      </div>
    </div>

    <!-- 1. Hook: three famous slips -->
    <section class="slide d hook" aria-label="Three famous continuity slips">
      <div class="in">
        <div class="three">
          <figure>
            <img src="/art/pitch-door.webp" alt="A tavern door lying off its hinges." width="800" height="800">
            <figcaption>
              <h2>One Piece, chapter 1<R id="onepiece" /></h2>
              <p class="story">A door is kicked off its hinges. One scene later, it’s back.</p>
            </figcaption>
          </figure>
          <figure>
            <img src="/art/pitch-wand.webp" alt="A wand with two curls of smoke rising from its tip." width="800" height="800">
            <figcaption>
              <h2>Harry Potter and the Goblet of Fire<R id="salon" /></h2>
              <p class="story">James leaves the wand before Lily. Later editions swapped them.</p>
            </figcaption>
          </figure>
          <figure>
            <img src="/art/pitch-wound.webp" alt="An army surgeon’s bag, a bandage and an old musket ball." width="800" height="800">
            <figcaption>
              <h2>Sherlock Holmes<R id="scarlet" /><R id="sign" /></h2>
              <p class="story">Watson’s war wound: the shoulder in book one, the leg in book two.</p>
            </figcaption>
          </figure>
        </div>
      </div>
      <Foot :ids="['onepiece', 'salon', 'scarlet', 'sign']" n="1" />
    </section>

    <!-- 2. The line -->
    <section class="slide l breaks" aria-labelledby="t2">
      <div class="in">
        <h1 id="t2">Every story world breaks.</h1>
        <p class="lead">Story Bible caught Watson’s wound on its own. It read 31 Sherlock Holmes documents and quoted both books.<R id="repo" /></p>
      </div>
      <Foot :ids="['repo']" n="2" />
    </section>

    <!-- 3. Problem -->
    <section class="slide d problem" aria-labelledby="t3">
      <div class="in">
        <h2 id="t3">When a writer leaves, the canon in their head leaves too.</h2>
        <div class="bignum">
          <b>19%</b>
          <p>of narrative respondents were hit by layoffs, the most of any field in GDC’s 2025 survey.<R id="gdc25" /></p>
        </div>
      </div>
      <Foot :ids="['gdc25']" n="3" />
    </section>

    <!-- 4. Solution -->
    <section class="slide l solution" aria-labelledby="t4">
      <div class="in">
        <h2 id="t4">The AI does the reading. People keep the say.</h2>
        <ol class="flow">
          <li><b>Your sources</b><span>Docs, scripts, recordings. Never edited.</span></li>
          <li class="pencil"><b>AI proposes</b><span>Each fact with the exact sentence.</span></li>
          <li class="person"><b>A person decides</b><span>Nothing is canon without a human.</span></li>
          <li class="ink"><b>Canon</b><span>Every fact cites its source.</span></li>
          <li class="checks"><b>Conflicts and impact</b><span>Contradictions found by rules, before release.</span></li>
        </ol>
      </div>
      <Foot n="4" />
    </section>

    <!-- 5. Product -->
    <section class="slide d product" aria-labelledby="t5">
      <div class="in">
        <h2 id="t5">Shoulder or leg? Both sentences, side by side.</h2>
        <img class="screen" src="/shots/watson-card-light-1920.webp" srcset="/shots/watson-card-light-960.webp 960w, /shots/watson-card-light-1920.webp 1920w" sizes="(max-width: 900px) 100vw, 1100px" alt="Story Bible’s conflict card: “Watson’s wound was in his shoulder” against “Watson has a Jezail bullet wound in his leg”, each with its verbatim quote and chapter." width="1920" height="873">
        <p class="caption">A conflict in the Sherlock Holmes sample, found by a rule over accepted canon. A person decides what is true.<R id="repo" /></p>
      </div>
      <Foot :ids="['repo']" n="5" />
    </section>

    <!-- 6. Why now / Muse -->
    <section class="slide l muse" aria-labelledby="t6">
      <div class="in">
        <h2 id="t6">Built on Muse. A person signs off on every fact.</h2>
        <ul class="models">
          <li><b>Muse Spark</b><span>reads, critiques and checks continuity</span></li>
          <li><b>Muse Voice Transcribe</b><span>turns table reads into sources</span></li>
          <li><b>Muse Image</b><span>draws portraits for the wiki</span></li>
          <li><b>Muse Code</b><span>works with canon over MCP</span></li>
        </ul>
        <p class="lead sub">Models can read a whole story world. They still invent things. The human gate is what makes them safe for canon.<R id="metanotes" /></p>
      </div>
      <Foot :ids="['metanotes']" n="6" />
    </section>

    <!-- 7. Who builds story worlds -->
    <section class="slide d worlds" aria-labelledby="t7">
      <div class="in">
        <h2 id="t7">Millions of people build story worlds.</h2>
        <ul class="tiles">
          <li v-for="w in WORLDS" :key="w.who">
            <span class="who">{{ w.who }}</span>
            <b>{{ w.big }}</b>
            <span class="what">{{ w.what }}<R :id="w.src" /></span>
            <span class="more">{{ w.more }}<R :id="w.moreSrc" /></span>
          </li>
        </ul>
        <p class="sizes"><span><b>{{ money(TAM) }}</b> TAM</span><span><b>{{ money(SAM) }}</b> SAM</span><span><b>{{ money(SOM) }}</b> SOM by year 5</span><small>Assumptions in A1 and A2</small></p>
      </div>
      <Foot :ids="WORLDS.flatMap(w => [w.src, w.moreSrc])" n="7" />
    </section>

    <!-- 8. Business model -->
    <section class="slide l model" aria-labelledby="t8">
      <div class="in">
        <h2 id="t8">Open source to spread. Cloud for teams to pay.</h2>
        <div class="split">
          <div><b>Free</b><span>Self-host the whole app, AGPL-3.0.</span></div>
          <div class="cloud"><b>Cloud</b><span>We host it for teams. Price on request.</span></div>
        </div>
        <p class="lead sub">A solo writer starts free. A team pays when it wants us to host it, so nobody has to run a server.</p>
      </div>
      <Foot :ids="['repo']" n="8" />
    </section>

    <!-- 9. Go-to-market -->
    <section class="slide d gtm" aria-labelledby="t9g">
      <div class="in">
        <h2 id="t9g">Go-to-market: game teams first, then every story world.</h2>
        <ol class="phases">
          <li>
            <span class="when">Year 1</span>
            <b>Game narrative teams and game masters</b>
            <span class="why">Their lore already lives in docs, and their coding agents need canon to build from.</span>
            <span class="how">Open source on GitHub with four sample worlds · Muse Code and other agents over MCP · game jams (35,371 people at the 2025 Global Game Jam<R id="ggj" />)</span>
          </li>
          <li>
            <span class="when">Year 2</span>
            <b>Creators: serial and web fiction, webcomics, YouTube and TikTok worlds, series novelists</b>
            <span class="why">One world, many episodes, a fandom that notices every slip.</span>
            <span class="how">“Find the slip” videos on public-domain classics, like Watson’s wound · share pages and EPUB books that carry the name · creator partnerships</span>
          </li>
          <li>
            <span class="when">Year 3 on</span>
            <b>Studios: writers’ rooms and game studios</b>
            <span class="why">Many writers, long productions, canon that must outlive any one of them.</span>
            <span class="how">Cloud Team and Studio seats, sales-assisted · self-hosting support for studios that keep canon in-house</span>
          </li>
        </ol>
        <p class="caption">A plan, not traction yet. Seat ramp and shares in A2.</p>
      </div>
      <Foot :ids="['ggj']" n="9" />
    </section>

    <!-- 10. Competition -->
    <section class="slide l compete" aria-labelledby="t9">
      <div class="in">
        <h2 id="t9">Alone in the top right.</h2>
        <div class="map" role="img" aria-label="Positioning map. Across: checks consistency automatically. Up: cites every canon fact verbatim. Story Bible is alone in the top right: every canon fact cited verbatim, checked by deterministic rules. Book Check Genie checks with AI and quotes each finding, but does not keep every fact cited; Arcweave, LegendKeeper, Novelcrafter, Sudowrite, Notion and Kanka make neither claim on their own pages.">
          <span class="axis y">Cites every canon fact verbatim</span>
          <span class="axis x">Checks consistency automatically</span>
          <div class="plot">
            <span v-for="c in MAP" :key="c.name" class="dot" :class="{ us: c.us }" :style="{ left: `${c.x * 100}%`, bottom: `${c.y * 100}%` }">
              <i />{{ c.name }}<R v-if="c.src" :id="c.src" /><small v-if="c.note">{{ c.note }}</small>
            </span>
          </div>
        </div>
        <p class="caption">Placed only by what each vendor’s own page says (3 Nov 2026); places inside a quarter are only for legibility. Book Check Genie quotes each finding; Story Bible cites every canon fact and checks it by deterministic rules. Table in A3.</p>
      </div>
      <Foot :ids="MAP.filter(c => c.src).map(c => c.src!)" n="10" />
    </section>

    <!-- 11. Team -->
    <section class="slide d team" aria-labelledby="t10">
      <div class="in">
        <h2 id="t10">A solo entry, with a company behind it.</h2>
        <div class="people">
          <div class="person">
            <b class="name">Umurcan Görür<R id="ugorur" /></b>
            <p>Built Story Bible alone for this hackathon.</p>
            <ul>
              <li>Paid to write code at fourteen</li>
              <li>Co-founded three companies; one closed when the money ran out</li>
              <li>CTO of a company of about fifty people</li>
              <li>Taught Ruby to around 150 students</li>
              <li>Builds Orka, open-source teams of coding agents, which built this</li>
            </ul>
          </div>
          <div class="company">
            <b class="name">TekTık Yazılım AŞ<R id="tektik" /></b>
            <p>Will develop and host Story Bible.</p>
            <ul>
              <li>TekTık Asistan: an office assistant in WhatsApp and Telegram, in beta in Türkiye, with a UK pilot</li>
              <li>AI API reselling and custom AI software</li>
            </ul>
          </div>
        </div>
      </div>
      <Foot :ids="['ugorur', 'tektik']" n="11" />
    </section>

    <!-- 12. Close -->
    <section class="slide d close" aria-labelledby="t11">
      <div class="in">
        <BrandMark class="mark" />
        <h2 id="t11">Create the perfect world for your story.</h2>
        <p class="lead sub">We’re looking for design partners: a narrative team, a writers’ room, a serial writer and a game master.</p>
        <p class="contact"><a :href="CONTACT">info@tektik.ai</a><a :href="GITHUB">{{ GITHUB.replace('https://', '') }}</a></p>
      </div>
      <Foot n="12" />
    </section>

    <!-- A1. TAM and SAM -->
    <section class="slide l appx" aria-labelledby="ta1">
      <div class="in">
        <p class="tag">Appendix A1</p>
        <h2 id="ta1">TAM {{ money(TAM) }}, SAM {{ money(SAM) }}: from sourced counts</h2>
        <table class="sizing">
          <thead><tr><th>Group</th><th>Sourced base</th><th>Tier</th><th class="n">TAM a year</th><th>Filter to SAM</th><th class="n">SAM seats</th><th class="n">SAM a year</th></tr></thead>
          <tbody>
            <tr v-for="g in SIZED" :key="g.name">
              <th scope="row">{{ g.name }}</th>
              <td><b>{{ count(g.base) }}</b> {{ g.baseText }}<R :id="g.src" /><template v-for="(st, i) in g.baseSteps" :key="i"> <span class="as"><b>{{ st.show }}</b> {{ st.text }}</span></template><template v-if="g.baseSteps"> = <b>{{ count(g.tamSeats) }}</b></template></td>
              <td>{{ TIER_NAME[g.tier] }} ${{ PRICE[g.tier] }}</td>
              <td class="n">{{ money(g.tamValue) }}</td>
              <td><template v-if="g.sam.length"><template v-for="(st, i) in g.sam" :key="i"><span :class="{ as: st.assumption }"><b>{{ st.show }}</b> {{ st.text }}<R v-if="st.src" :id="st.src" /></span>{{ ' ' }}</template></template><span v-else class="faint">all of them</span></td>
              <td class="n">{{ g.samSeats ? count(g.samSeats) : '—' }}</td>
              <td class="n">{{ g.samValue ? money(g.samValue) : '—' }}</td>
            </tr>
          </tbody>
          <tfoot><tr><th scope="row" colspan="3">Total</th><td class="n"><b>{{ money(TAM) }}</b></td><td /><td class="n">{{ count(SIZED.reduce((n, g) => n + g.samSeats, 0)) }}</td><td class="n"><b>{{ money(SAM) }}</b></td></tr></tfoot>
        </table>
        <ul class="notes">
          <li><span class="as">Dashed</span> = our assumption. <b>Assumed prices for sizing</b>: Solo $12, Team $29, Studio $49 a seat a month, AI usage not counted; cloud pricing is on request. $ a year = seats × price × 12.</li>
          <li>Groups may overlap (a game developer can be a game master); overlaps are not removed. Not counted, no sourced count: YouTube and TikTok creators, other guilds, authors beyond one tool.</li>
          <li>SAM keeps English-language reach and people serious enough to pay. They already sign up for such tools: LegendKeeper 200k+ creators<R id="legendkeeper" />, Kanka 225,000 accounts.<R id="kanka" /></li>
        </ul>
      </div>
      <Foot n="A1" />
    </section>

    <!-- A2. SOM and ramp -->
    <section class="slide l appx" aria-labelledby="ta2">
      <div class="in">
        <p class="tag">Appendix A2</p>
        <h2 id="ta2">SOM {{ money(SOM) }} a year by year 5</h2>
        <div class="som">
          <table class="sizing">
            <thead><tr><th>Tier (assumed price)</th><th class="n">SAM seats</th><th class="n">Year-5 share</th><th class="n">Seats</th><th class="n">ARR</th></tr></thead>
            <tbody>
              <tr v-for="t in SOM_TIERS" :key="t.tier">
                <th scope="row">{{ TIER_NAME[t.tier] }}, ${{ PRICE[t.tier] }} a seat a month</th>
                <td class="n">{{ count(t.samSeats) }}</td>
                <td class="n"><span class="as">{{ pct(t.share) }}</span></td>
                <td class="n">{{ count(t.seats) }}</td>
                <td class="n">{{ money(t.arr) }}</td>
              </tr>
            </tbody>
            <tfoot><tr><th scope="row" colspan="3">Year 5</th><td class="n"><b>{{ count(SOM_SEATS) }}</b></td><td class="n"><b>{{ money(SOM) }}</b></td></tr></tfoot>
          </table>
          <div class="ramp" role="img" :aria-label="`ARR ramp: ${RAMP.map((r, i) => `year ${i + 1} ${money(SOM * r)}`).join(', ')}`">
            <div v-for="(r, i) in RAMP" :key="i" class="bar">
              <span class="v">{{ money(SOM * r) }}</span>
              <i :style="{ height: `calc(${r} * var(--bar-h))` }" />
              <span class="y">Year {{ i + 1 }}</span>
            </div>
          </div>
        </div>
        <ul class="notes">
          <li>Solo: webcomic and web-novel creators, game masters, novelists. Team: game developers. Studio: screenwriters. Year-5 shares (<span class="as">3%, 4%, 5%</span>) and the ramp (<span class="as">2%, 10%, 25%, 55%, 100% of year 5</span>) are our assumptions.</li>
          <li>For scale, the creator economy these people work in: $250B in 2023, about $480B by 2027 (Goldman Sachs via Investing.com). A broader market, not ours.<R id="goldman" /></li>
        </ul>
      </div>
      <Foot n="A2" />
    </section>

    <!-- A3. Competitor table -->
    <section class="slide l appx" aria-labelledby="ta3">
      <div class="in">
        <p class="tag">Appendix A3</p>
        <h2 id="ta3">What each vendor’s page says</h2>
        <table class="cmp">
          <thead><tr><th>Product</th><th>Cited facts</th><th>Rule-based checks</th><th>Human gate on AI</th><th>API / MCP</th><th>Price</th></tr></thead>
          <tbody>
            <tr v-for="c in COMPARE" :key="c.name" :class="{ us: !c.src }">
              <th scope="row">{{ c.name }}<R v-if="c.src" :id="c.src" /></th>
              <td>{{ c.cite }}</td><td>{{ c.rules }}</td><td>{{ c.gate }}</td><td>{{ c.api }}</td><td>{{ c.price }}</td>
            </tr>
          </tbody>
        </table>
        <ul class="notes">
          <li>“—” means the vendor’s own page didn’t say, checked 3 Nov 2026. Kanka (225,000 accounts, 27,000 active in 2023) is a source-available campaign wiki.<R id="kanka" /></li>
          <li>Where they are stronger: Arcweave already ships an MCP server; Sudowrite and Novelcrafter write prose and we don’t; World Anvil, Notion and Kanka have communities we don’t have yet.</li>
        </ul>
      </div>
      <Foot n="A3" />
    </section>

    <!-- A4. Proof -->
    <section class="slide l appx" aria-labelledby="ta4">
      <div class="in">
        <p class="tag">Appendix A4</p>
        <h2 id="ta4">What exists today, from the repository</h2>
        <ul class="kpis">
          <li><b>9</b><span>days, 27 Oct–4 Nov 2026, solo, 260+ commits</span></li>
          <li><b>4</b><span>sample worlds, up to 31 documents and 126,658 words</span></li>
          <li><b>40</b><span>scripted probes and checks that drive the real app</span></li>
          <li><b>38</b><span>MCP tools, under the same roles as people</span></li>
        </ul>
        <ul class="notes">
          <li>Sherlock Holmes gold set: all 4 planted contradictions found (4/4), 62 AI candidates blocked because their quote isn’t in the text, every target met.<R id="repo" /></li>
          <li>23 real Meta API responses, recorded and replayed as contract tests; 15 notes for the Meta API team.<R id="metanotes" /></li>
          <li>Every AI run is traced on Agent activity. Open source under AGPL-3.0. No users or revenue yet: this is day zero.</li>
        </ul>
      </div>
      <Foot n="A4" />
    </section>

    <!-- A5. Sources -->
    <section class="slide l appx sources" aria-labelledby="ta5">
      <div class="in">
        <p class="tag">Appendix A5</p>
        <h2 id="ta5">Sources, opened 3 Nov 2026</h2>
        <ol class="src">
          <li v-for="s in SOURCES" :id="`src-${s.id}`" :key="s.id">{{ s.title }}<template v-if="s.url">. <a :href="s.url">{{ s.url.replace('https://', '') }}</a></template></li>
        </ol>
      </div>
      <Foot n="A5" />
    </section>
  </div>
</template>

<style scoped>
.deck { max-width: 1200px; margin: 0 auto; padding: var(--s-5) var(--mk-pad) 0; display: grid; gap: var(--s-6); }
.deck-bar { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: var(--s-3); }
.deck-bar p { margin: 0; color: var(--muted); }
.deck-actions { display: flex; gap: var(--s-2); }

/* Each slide is pinned to the light or the dark set of main.css (the same values), whatever the site theme, so the deck
   keeps its dark/light rhythm on screen and in print. Type scales with the slide's width (cqw). */
.slide.l { --accent: var(--acc); --bg: #f4f0e8; --fg: #2a241d; --mut: #524b42; --faint: #675d50; --acc: #733816; --acc-soft: #f0e2d2; --line: #ddd4c6; --line-strong: #c0b4a2; --bad: #b0321e; --paper: #fdfbf7; --pencil: #555b63; }
.slide.d { --accent: var(--acc); --bg: #1b1815; --fg: #ebe3d6; --mut: #bab1a4; --faint: #9d9283; --acc: #dba077; --acc-soft: #3a2a1d; --line: #352f29; --line-strong: #4c443b; --bad: #f17e70; --paper: #231f1b; --pencil: #a4a9b1; }
.slide { container-type: inline-size; aspect-ratio: 16 / 9; background: var(--bg); color: var(--fg); border-radius: var(--r-lg); overflow: hidden; scroll-margin-top: 72px; display: flex; flex-direction: column; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
.slide.l { border: 1px solid var(--line); }
.slide.d { border: 1px solid var(--line-strong); }
.in { flex: 1; min-height: 0; font-size: 1.6cqw; line-height: 1.4; padding: 4.5cqw 6cqw 0; display: flex; flex-direction: column; justify-content: center; gap: 2.4cqw; }
.slide :deep(.sfoot) { display: flex; justify-content: space-between; gap: 2em; padding: 1cqw 6cqw 1.6cqw; color: var(--faint); font-size: max(0.75cqw, 10px); }
.slide h1, .slide h2 { margin: 0; color: var(--fg); font-weight: 600; letter-spacing: -0.03em; line-height: 1.04; text-wrap: balance; }
.slide h2 { font-size: 4.2cqw; max-width: 24ch; }
.slide p { margin: 0; }
.slide :deep(.ref) { font-size: 0.55em; line-height: 0; margin-left: 0.15em; font-weight: 600; }
.slide :deep(.ref a) { color: var(--acc); text-decoration: none; }
.slide a { color: var(--acc); }
.lead { font-size: 2.1cqw; line-height: 1.35; color: var(--mut); max-width: 40ch; }
.lead.sub { font-size: 1.7cqw; max-width: 52ch; }
.caption { font-size: 1.25cqw; color: var(--mut); max-width: 80ch; }
.story { font-family: var(--font-story); }

/* 1 */
.hook .in { padding-top: 3cqw; }
.three { display: grid; grid-template-columns: repeat(3, 1fr); gap: 4cqw; align-items: end; }
.three figure { margin: 0; display: grid; gap: 1.2cqw; }
.three img { width: 100%; height: auto; aspect-ratio: 1; object-fit: contain; }
.three h2 { font-size: 1.35cqw; letter-spacing: 0; color: var(--acc); max-width: none; }
.three .story { font-size: 2.05cqw; line-height: 1.3; margin-top: 0.5cqw; }

/* 2 */
.breaks h1 { font-size: 8.4cqw; max-width: 9ch; }
.breaks .lead { border-left: 0.35cqw solid var(--acc); padding-left: 1.6cqw; }

/* 3 */
.problem h2 { max-width: 20ch; }
.bignum { display: grid; grid-template-columns: auto 1fr; gap: 3cqw; align-items: center; }
.bignum b { font-size: 17cqw; line-height: 0.85; letter-spacing: -0.05em; color: var(--bad); font-weight: 600; }
.bignum p { font-size: 2.1cqw; color: var(--mut); max-width: 22ch; line-height: 1.3; }

/* 4 */
.flow { list-style: none; margin: 1cqw 0 0; padding: 0; display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 2.6cqw; }
.flow li { position: relative; display: grid; align-content: start; gap: 1cqw; padding: 2.2cqw 1.8cqw; border: 0.12cqw solid var(--line-strong); border-radius: 0.8cqw; background: var(--paper); min-height: 19cqw; }
.flow li:not(:last-child)::after { content: ''; position: absolute; top: 50%; right: -2.3cqw; width: 2cqw; height: 0.15cqw; background: var(--line-strong); }
.flow b { font-size: 2.3cqw; line-height: 1.15; letter-spacing: -0.01em; }
.flow span { font-size: 1.65cqw; color: var(--mut); line-height: 1.3; }
.flow .pencil { border-style: dashed; border-color: var(--pencil); background: transparent; }
.flow .pencil b { color: var(--pencil); }
.flow .ink { background: var(--acc); border-color: var(--acc); }
.flow .ink b, .flow .ink span { color: var(--paper); }
.flow .checks { border-color: var(--bad); border-width: 0.25cqw; }
.flow .checks b { color: var(--bad); }

/* 5 */
.product .in { gap: 1.8cqw; padding-top: 3.6cqw; }
.product h2 { max-width: 30ch; font-size: 3.4cqw; }
.screen { width: 100%; height: auto; aspect-ratio: 2.2 / 1; object-fit: cover; object-position: top; border-radius: 0.8cqw; box-shadow: 0 1.5cqw 4cqw rgb(0 0 0 / 0.45); }

/* 6 */
.models { list-style: none; margin: 0; padding: 0; display: grid; grid-template-columns: repeat(4, 1fr); gap: 2cqw; }
.models li { display: grid; align-content: start; gap: 0.8cqw; padding-top: 1.6cqw; border-top: 0.3cqw solid var(--acc); }
.models b { font-size: 2.7cqw; letter-spacing: -0.015em; line-height: 1.1; }
.models span { font-size: 1.9cqw; color: var(--mut); }

/* 7 */
.worlds .in { gap: 2cqw; padding-top: 3.6cqw; }
.worlds h2 { font-size: 3.6cqw; max-width: none; }
.tiles { list-style: none; margin: 0; padding: 0; display: grid; grid-template-columns: repeat(3, 1fr); gap: 2.2cqw 3cqw; }
.tiles li { display: grid; align-content: start; gap: 0.3cqw; border-top: 0.12cqw solid var(--line-strong); padding-top: 1cqw; }
.who { font-size: 1.15cqw; font-weight: 600; color: var(--acc); }
.tiles b { font-size: 4.6cqw; line-height: 1; letter-spacing: -0.04em; font-weight: 600; }
.what { font-size: 1.3cqw; color: var(--fg); }
.more { font-size: 1.05cqw; color: var(--faint); }
.sizes { display: flex; flex-wrap: wrap; align-items: baseline; gap: 1cqw 3.6cqw; margin: 0; padding-top: 1.4cqw; border-top: 0.15cqw solid var(--acc); }
.sizes span { font-size: 1.5cqw; color: var(--mut); }
.sizes b { font-size: 3.6cqw; line-height: 1; letter-spacing: -0.03em; font-weight: 600; color: var(--acc); margin-right: 0.5cqw; }
.sizes small { margin-left: auto; font-size: 1.1cqw; color: var(--faint); }

/* 8 */
.split { display: grid; grid-template-columns: 1fr 1fr; gap: 2.4cqw; }
.split div { display: grid; gap: 0.6cqw; padding: 2.2cqw 2.4cqw; border-radius: 0.8cqw; border: 0.12cqw solid var(--line-strong); background: var(--paper); }
.split b { font-size: 4.4cqw; letter-spacing: -0.04em; line-height: 1; }
.split span { font-size: 1.7cqw; color: var(--mut); }
.split .cloud { background: var(--acc); border-color: var(--acc); }
.split .cloud b, .split .cloud span { color: var(--paper); }

/* 9 */
.gtm .in { gap: 2cqw; padding-top: 3.6cqw; }
.gtm h2 { font-size: 3.4cqw; max-width: none; }
.phases { list-style: none; margin: 0; padding: 0; display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 2.4cqw; counter-reset: none; }
.phases li { display: grid; align-content: start; gap: 0.9cqw; padding-top: 1.4cqw; border-top: 0.3cqw solid var(--acc); }
.phases .when { font-size: 1.2cqw; font-weight: 600; color: var(--acc); text-transform: uppercase; letter-spacing: 0.08em; }
.phases b { font-size: 2.1cqw; line-height: 1.15; letter-spacing: -0.01em; }
.phases .why { font-size: 1.55cqw; line-height: 1.3; }
.phases .how { font-size: 1.3cqw; line-height: 1.4; color: var(--mut); }

.compete .in { padding-top: 3.4cqw; gap: 1.6cqw; }
.map { position: relative; display: grid; grid-template-columns: 2.4cqw 1fr; grid-template-rows: 1fr 2.4cqw; height: 29cqw; }
.plot { position: relative; grid-column: 2; grid-row: 1; border-left: 0.15cqw solid var(--line-strong); border-bottom: 0.15cqw solid var(--line-strong);
  background: linear-gradient(var(--line), var(--line)) 50% 0 / 0.08cqw 100% no-repeat, linear-gradient(var(--line), var(--line)) 0 50% / 100% 0.08cqw no-repeat; }
.axis { font-size: 1.15cqw; color: var(--faint); align-self: center; }
.axis.x { grid-column: 2; grid-row: 2; text-align: right; }
.axis.y { grid-column: 1; grid-row: 1; writing-mode: vertical-rl; transform: rotate(180deg); text-align: left; justify-self: center; }
.dot { position: absolute; transform: translate(-0.5cqw, 50%); display: inline-flex; align-items: baseline; gap: 0.5cqw; font-size: 1.25cqw; color: var(--mut); white-space: nowrap; flex-wrap: wrap; max-width: 22cqw; }
.dot i { width: 1cqw; height: 1cqw; border-radius: 50%; background: var(--line-strong); align-self: center; }
.dot small { flex-basis: 100%; padding-left: 1.5cqw; font-size: 0.9em; color: var(--faint); }
.dot.us { font-size: 2.2cqw; font-weight: 600; color: var(--fg); transform: translate(-1.1cqw, 50%); }
.dot.us i { width: 2.2cqw; height: 2.2cqw; background: var(--acc); }
.dot.us :deep(.ref) { display: none; }

/* 10 */
.people { display: grid; grid-template-columns: 1.3fr 1fr; gap: 4cqw; align-items: start; }
.name { display: block; font-size: 3cqw; letter-spacing: -0.03em; line-height: 1.05; }
.people p { font-size: 1.6cqw; color: var(--mut); margin: 0.8cqw 0 1.4cqw; }
.people ul { margin: 0; padding: 0; list-style: none; display: grid; gap: 0.7cqw; font-size: 1.45cqw; }
.people li { padding-left: 1.4cqw; position: relative; }
.people li::before { content: ''; position: absolute; left: 0; top: 0.6em; width: 0.6cqw; height: 0.6cqw; border-radius: 50%; background: var(--acc); }
.person { border-top: 0.35cqw solid var(--acc); padding-top: 1.6cqw; }
.company { border-top: 0.12cqw solid var(--line-strong); padding-top: 1.83cqw; }

/* 11 */
.close .in { align-items: flex-start; }
.close .mark { width: 5cqw; height: auto; color: var(--acc); }
.close h2 { font-size: 6.4cqw; max-width: 14ch; }
.contact { display: flex; gap: 3cqw; font-size: 1.7cqw; }

/* Appendix: denser, still large enough to read in the PDF. */
.appx .in { justify-content: flex-start; padding-top: 3.2cqw; gap: 1.4cqw; font-size: 1.1cqw; }
.appx h2 { font-size: 3cqw; max-width: none; }
.tag { font-size: 1.2cqw; font-weight: 600; color: var(--acc); margin-bottom: -0.8cqw !important; }
.appx table { width: 100%; border-collapse: collapse; font-size: inherit; }
.appx th, .appx td { text-align: left; padding: 0.55cqw 0.9cqw; border-bottom: 0.08cqw solid var(--line); vertical-align: top; }
.appx th { font-size: inherit; }
.appx thead th { color: var(--faint); font-weight: 600; background: var(--paper); font-size: 0.9em; }
.appx tbody th, .appx tfoot th { font-weight: 600; }
.appx tbody th, .appx tfoot th, .appx tfoot td, .appx td { background: transparent; }
.appx td { color: var(--mut); }
.appx .n { text-align: right; white-space: nowrap; color: var(--fg); }
.appx tfoot td, .appx tfoot th { border-bottom: 0; color: var(--fg); }
.step { display: inline; }
.step b { color: var(--fg); }
.as { border: 0.1cqw dashed var(--pencil); border-radius: 0.3cqw; padding: 0 0.3cqw; }
.faint { color: var(--faint); }
.notes { margin: 0; padding-left: 1.4cqw; display: grid; gap: 0.5cqw; color: var(--mut); max-width: 120ch; }
.cmp tr.us { background: var(--acc-soft); }
.cmp tr.us td, .cmp tr.us th { color: var(--fg); }
.kpis { list-style: none; margin: 0; padding: 0; display: grid; grid-template-columns: repeat(4, 1fr); gap: 2cqw; }
.kpis li { display: grid; gap: 0.4cqw; border-top: 0.3cqw solid var(--acc); padding-top: 1cqw; }
.kpis b { font-size: 5cqw; line-height: 1; letter-spacing: -0.04em; color: var(--acc); }
.kpis span { color: var(--mut); font-size: 1.3cqw; }
.som { display: grid; grid-template-columns: 1.15fr 1fr; gap: 3cqw; align-items: end; }
.ramp { --bar-h: 17cqw; display: grid; grid-template-columns: repeat(5, 1fr); gap: 1.2cqw; align-items: end; }
.bar { display: flex; flex-direction: column; justify-content: flex-end; gap: 0.4cqw; text-align: center; }
.bar i { display: block; min-height: 0.3cqw; background: var(--acc); border-radius: 0.3cqw 0.3cqw 0 0; }
.bar .v { font-size: 1.15cqw; font-weight: 600; color: var(--fg); }
.bar .y { font-size: 1cqw; color: var(--faint); border-top: 0.1cqw solid var(--line-strong); padding-top: 0.3cqw; }
.src { margin: 0; padding-left: 2cqw; columns: 2; column-gap: 3cqw; font-size: 0.82cqw; line-height: 1.35; color: var(--mut); }
.src li { break-inside: avoid; margin-bottom: 0.35cqw; }
.src a { word-break: break-all; }

/* Phones and narrow windows: slides become cards with natural height and fixed-size type. Screen only, so print keeps 16:9. */
@media screen and (max-width: 900px) {
  .slide { aspect-ratio: auto; }
  .in { font-size: 15px; padding: 28px 18px 0; gap: 20px; }
  .slide :deep(.sfoot) { font-size: 11px; padding: 14px 18px 16px; }
  .slide h2, .appx h2, .worlds h2, .product h2 { font-size: 28px; }
  .breaks h1 { font-size: 46px; }
  .close h2 { font-size: 36px; }
  .lead, .lead.sub, .bignum p { font-size: 18px; }
  .caption, .sizes span, .phases .why, .phases .how, .people ul, .models span, .split span, .what, .kpis span { font-size: 15px; }
  .more, .who, .axis, .dot, .tag, .appx .in { font-size: 13px; }
  .three, .flow, .models, .tiles, .split, .phases, .people, .kpis { grid-template-columns: minmax(0, 1fr); }
  .three img { width: 60%; }
  .three h2 { font-size: 14px; }
  .three .story { font-size: 19px; }
  .bignum { grid-template-columns: minmax(0, 1fr); }
  .bignum b { font-size: 120px; }
  .flow li { min-height: 0; padding: 14px; gap: 4px; }
  .flow li:not(:last-child)::after { top: auto; bottom: -14px; left: 50%; right: auto; width: 2px; height: 12px; }
  .flow b, .models b { font-size: 18px; }
  .flow span { font-size: 14px; }
  .tiles b, .split b, .kpis b { font-size: 40px; }
  .sizes b { font-size: 30px; }
  .sizes small, .bar .v, .bar .y { font-size: 12px; }
  .som { grid-template-columns: minmax(0, 1fr); }
  .ramp { --bar-h: 120px; }
  .name { font-size: 24px; }
  .people p { font-size: 16px; }
  .close .mark { width: 44px; }
  .contact { font-size: 16px; flex-direction: column; gap: 6px; }
  .map { height: 300px; grid-template-columns: 22px 1fr; grid-template-rows: 1fr 22px; }
  .dot { font-size: 11px; max-width: 120px; white-space: normal; }
  .dot.us { font-size: 15px; white-space: nowrap; }
  .dot i { width: 8px; height: 8px; } .dot.us i { width: 16px; height: 16px; }
  .appx table { display: block; overflow-x: auto; }
  .src { columns: 1; font-size: 12px; }
  .notes { padding-left: 18px; }
}
</style>

<style>
/* Print: one slide per 16:9 page (a named page, so other pages' A4 rules never apply), no site chrome. */
@page slide { size: 16in 9in; margin: 0; }
@media print {
  .mk-top, .mk-foot, .skip, .deck-bar { display: none !important; }
  /* The whole document on the slide page: a box outside the slides on the default page would add a blank last page. */
  body:has(.deck) { page: slide; }
  .mk { min-height: 0 !important; }
  .deck { display: block !important; padding: 0 !important; max-width: none !important; }
  .deck .slide { page: slide; width: 16in !important; height: 9in !important; aspect-ratio: auto !important; border: 0 !important; border-radius: 0 !important; break-inside: avoid; margin: 0 !important; }
  .deck .slide + .slide { break-before: page; }
}
</style>
