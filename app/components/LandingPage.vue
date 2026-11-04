<script setup lang="ts">
// Public home page (signed out). Every product example is real content from the bundled samples, every screenshot is
// the app, and the three famous slips are sourced in the pitch deck (/pitch, appendix).
useMarketingSeo({
  title: 'CanonTracker · The canon tracker for story worlds',
  description: 'CanonTracker keeps the canon of games, series, novels and franchises: every fact with its word-for-word source and a person’s approval, contradictions caught by rules, and every change traced two steps deep before it ships.',
  image: 'og-landing',
  path: '/',
})
const me = useMe()

const AUDIENCE = ['Game studios', 'Narrative designers', 'TV and film writers’ rooms', 'Novelists and series authors', 'Webcomic, serial and video creators', 'Game masters and worldbuilders']

const SLIPS = [
  { art: 'pitch-stairs', alt: 'An empty staircase in a family house, a closed door at the top.', medium: 'TV series', work: 'Happy Days', title: 'The brother who vanished', text: 'Richie’s older brother Chuck appears in the first two seasons, then is never seen or mentioned in the Cunningham household again. The trope now carries his name: Chuck Cunningham syndrome.' },
  { art: 'pitch-timeline', line: true, alt: 'A line of milestones that splits into three parallel branches at one orange point.', medium: 'Video games', work: 'The Legend of Zelda', title: 'A timeline nobody could draw', text: 'For 25 years the games did not fit one story order. In 2011 Nintendo’s Hyrule Historia settled it by splitting the timeline in three.' },
  { art: 'pitch-wound', alt: 'An army surgeon’s bag, a bandage and an old musket ball.', medium: 'Novels', work: 'Sherlock Holmes', title: 'A wound that moved', text: 'Watson’s Jezail bullet strikes his shoulder in A Study in Scarlet. In The Sign of the Four it went through his leg.' },
]

// The canon track: pencil (proposed) until a person approves, ink after. `pt` draws the station's point.
const STEPS = [
  { pt: 'hollow', art: 'import', title: 'Import', text: 'Lore docs, scripts, chapters and table reads: Markdown, text, Word or audio. Every version is kept and never edited.' },
  { pt: 'pencil', art: 'review', title: 'AI proposes', text: 'Characters, places, events, relationships and rules, each with its exact quote. A quote that isn’t in the source is blocked.' },
  { pt: 'canon', art: 'canon', title: 'A person approves', text: 'Accept, edit or reject. Only an explicit human decision makes canon, and the decider’s name stays on it.' },
  { pt: 'ink', art: 'conflicts', title: 'Rules flag contradictions', text: 'Two places at once, a trip faster than the road, a relationship after it ended, one detail with two answers.' },
  { pt: 'ink', art: 'impact', title: 'Impact, two hops deep', text: 'Propose a change and see the facts and scenes it touches, each with its path and evidence, before you apply it.' },
]

const MEDIA = [
  { slug: 'games', art: 'games', title: 'Game studios and narrative designers', text: 'Lore, quest scripts and barks from many hands, one canon every writer and every tool can check.', points: ['Entity types for NPCs, items, abilities and quests', 'Voice takes checked line by line against their script', 'Agents build from canon over MCP; their proposals wait for review'], link: 'For game teams' },
  { slug: 'screen', art: 'screen', title: 'TV and film writers’ rooms', text: 'Outlines, episode scripts and table reads, every fact citing the scene and line it came from.', points: ['Table reads as sources: timed transcripts, citations that play the line', 'Script vs recording flags changed lines that contradict canon', 'Rewrite a rule and get the scenes to re-review'], link: 'For TV and film' },
  { slug: 'novelists', art: 'novelists', title: 'Novelists and series authors', text: 'One canon across chapters and books, so book four agrees with book one.', points: ['Chapters recognised on upload, Word files with comments as notes', 'The Sherlock Holmes sample: two novels and five stories, 31 documents', 'Export the bible as a book, the manuscript as PDF or EPUB'], link: 'For novelists' },
  { slug: 'worldbuilding', art: 'worldbuilding', title: 'Creators, game masters and worldbuilders', text: 'Webcomic scripts, serial chapters, video scripts and campaign notes in one world.', points: ['World rules and travel times as cited facts', 'A wiki and a relationship graph filed from canon', 'Read-only share links for collaborators and players'], link: 'For worldbuilders' },
]

const TRUST = [
  { title: 'A person decides', text: 'The AI only proposes. Agents read, check and propose too. Nothing becomes canon until a person accepts it in CanonTracker, and their name stays on the decision.' },
  { title: 'Word for word', text: 'Every canon fact cites a passage that contains its quote exactly. No quote, no canon; no evidence, “unknown”.' },
  { title: 'Nothing is rewritten', text: 'Imported files stay read-only, old facts are kept when canon changes, and the audit log is append-only.' },
  { title: 'Projects stay apart', text: 'One guard checks membership and role on every request. Viewers read; editors decide; admins manage.' },
]

const MUSE = [
  { name: 'Muse Spark', text: 'Proposes facts, critiques them, answers from canon, checks continuity' },
  { name: 'Muse Voice Transcribe', text: 'Turns recordings and dictation into timed text' },
  { name: 'Muse Image', text: 'Draws portraits and covers for the wiki' },
  { name: 'Muse Code', text: 'Works with your canon over MCP' },
]

// Muse Code (Meta) connects over Streamable HTTP from its settings file.
const MCP_FILE = '~/.config/muse/settings.json'
const MCP_SNIPPET = JSON.stringify({ schema_version: 1, mcp_servers: { canontracker: { transport: 'streamable_http', url: `${SITE}/mcp`, headers: { Authorization: 'Bearer sb_…' } } } }, null, 2)
</script>

<template>
  <NuxtLayout name="marketing">
    <div class="home">
      <!-- 1. Hero -->
      <section class="hero" aria-labelledby="hero-title">
        <div class="hero-copy">
          <p class="kicker">The canon tracker for story worlds</p>
          <h1 id="hero-title"><span>Every fact sourced.</span> <span>Every contradiction caught.</span> <span>Every change traced.</span></h1>
          <p class="lead">
            Games, series, novels and franchises are written by many hands over many years. CanonTracker reads your lore, scripts, chapters and
            table reads, proposes facts with the exact sentence they came from, and lets a person decide what becomes canon. Rules flag
            contradictions, and every change shows what it touches before it ships.
          </p>
          <div class="cta">
            <UiButton v-if="me?.user" to="/" variant="primary" size="lg">Open the app</UiButton>
            <UiButton v-else to="/signup" variant="primary" size="lg">Start free</UiButton>
            <UiButton v-if="VIDEO_ID" to="#demo" size="lg" icon="play">Watch the 3-minute demo</UiButton>
            <UiButton v-else to="/features" size="lg">See every feature</UiButton>
          </div>
          <ul class="audience" aria-label="Built for">
            <li v-for="a in AUDIENCE" :key="a">{{ a }}</li>
          </ul>
        </div>

        <div class="hero-proof">
          <MarketingWatsonConflict />
          <!-- The Ashbell Pass: the R1 bell-rule change and the impact the app lists for it (gold set, render-shots). -->
          <figure class="impact">
            <figcaption class="impact-head"><span class="chip pencil">Change proposal</span><span>World rule</span></figcaption>
            <p class="statement was"><del>Whoever rings the Ashbell loses their voice until the next sunrise.</del></p>
            <p class="statement now"><ins>Whoever rings the Ashbell loses their voice for one hour.</ins></p>
            <p class="reach"><b>Possible review impact</b> 4 scenes and 6 related facts, at most two steps away</p>
            <ul class="scenes">
              <li>S02 Dusk at the Bell Gate</li>
              <li>S05 The Silent Bell</li>
              <li>S11 The Dawn Bell</li>
              <li>S13 Voiceless</li>
            </ul>
          </figure>
          <p class="caption">Both cards are real: a slip in Conan Doyle’s Sherlock Holmes and a rule change in The Ashbell Pass, a 28-document game sample. Load either and check.</p>
        </div>
      </section>

      <!-- 2. Demo video (hidden until VIDEO_ID is set) -->
      <section v-if="VIDEO_ID" id="demo" class="band demo" aria-labelledby="demo-title">
        <div class="band-head">
          <p class="kicker">Demo</p>
          <h2 id="demo-title">See it in three minutes</h2>
          <p>Sherlock Holmes goes in, canon comes out with a source for every fact, and Watson’s wound turns up in both books. Then an agent builds a game from the canon.</p>
        </div>
        <MarketingDemoVideo :id="VIDEO_ID" title="CanonTracker in three minutes" />
      </section>

      <!-- 3. Canon breaks everywhere -->
      <section class="band" aria-labelledby="breaks-title">
        <div class="band-head">
          <p class="kicker">Canon breaks everywhere</p>
          <h2 id="breaks-title">The best-loved story worlds lose track of their own facts</h2>
          <p>Not because the writers were careless. Facts live in different files, written by different people, years apart, and nothing keeps a record of what is already true.</p>
        </div>
        <ul class="slips">
          <li v-for="s in SLIPS" :key="s.work">
            <LandingArt :name="s.art" :alt="s.alt" :size="320" class="slip-art" :class="{ 'line-art': s.line }" />
            <p class="slip-meta"><span>{{ s.medium }}</span>{{ s.work }}</p>
            <h3>{{ s.title }}</h3>
            <p>{{ s.text }}</p>
          </li>
        </ul>
        <p class="breaks-foot">
          Watson’s wound is in the Sherlock Holmes sample: 31 public-domain documents in, and CanonTracker’s rules put both sentences side by side.
        </p>
      </section>

      <!-- 4. How it tracks canon: the one bold element of the page -->
      <section id="how" class="band" aria-labelledby="how-title">
        <div class="band-head">
          <p class="kicker">How it tracks canon</p>
          <h2 id="how-title">Pencil until a person approves it. Ink after.</h2>
          <p>The AI does the reading and sketches candidates. A person commits them to canon, and from there rules and impact analysis keep it straight.</p>
        </div>
        <ol class="track">
          <li v-for="(s, i) in STEPS" :key="s.title" :class="`st-${s.pt}`">
            <span class="pt" aria-hidden="true" />
            <LandingArt :name="s.art" alt="" :size="160" class="step-art" />
            <h3><span class="step-n">{{ i + 1 }}.</span> {{ s.title }}</h3>
            <p>{{ s.text }}</p>
          </li>
        </ol>
        <div class="proof">
          <figure>
            <MarketingShot name="review" alt="The review queue: a candidate whose quote is not in the source is blocked, with the source passage open beside it." sizes="(max-width: 900px) 100vw, 580px" />
            <figcaption><b>Blocked:</b> the AI quoted a sentence that isn’t in the scene, so it cannot become canon.</figcaption>
          </figure>
          <figure>
            <MarketingShot name="impact" alt="A proposed change to the Ashbell rule with its possible review impact: four scenes and six related facts." sizes="(max-width: 900px) 100vw, 580px" />
            <figcaption><b>Traced:</b> a rule change with the scenes and facts it may touch, each with its path.</figcaption>
          </figure>
        </div>
      </section>

      <!-- 5. For every medium -->
      <section class="band" aria-labelledby="media-title">
        <div class="band-head">
          <p class="kicker">For every medium</p>
          <h2 id="media-title">One canon, whatever you ship</h2>
          <p>A game, a show, a book series or a world that spans all three. Each project gets entity types that fit its medium, and the same rules hold everywhere.</p>
        </div>
        <ul class="media">
          <li v-for="m in MEDIA" :key="m.slug">
            <LandingArt :name="m.art" alt="" :size="160" class="media-art" />
            <div>
              <h3>{{ m.title }}</h3>
              <p>{{ m.text }}</p>
              <ul>
                <li v-for="pt in m.points" :key="pt">{{ pt }}</li>
              </ul>
              <NuxtLink :to="`/use-cases/${m.slug}`" class="more">{{ m.link }}<UiIcon name="arrow" :size="16" /></NuxtLink>
            </div>
          </li>
        </ul>
      </section>

      <!-- 6. Canon for your AI tools -->
      <section class="band" aria-labelledby="mcp-title">
        <div class="mcp">
          <div class="mcp-copy">
            <p class="kicker">Canon for your AI tools</p>
            <h2 id="mcp-title">Your agents read the same canon your team does</h2>
            <p>CanonTracker is an MCP server. An agent in Muse Code, or any MCP client, can search canon, read sources, check proposed facts against the rules and propose new ones. A person decides what becomes canon, in CanonTracker.</p>
            <dl class="mcp-facts">
              <div><dt>37 tools</dt><dd>Read, check, propose and editorial work, with the same checks and limits as the app.</dd></div>
              <div><dt>Agents propose</dt><dd>No token can accept, reject or apply anything. Proposals wait in Review for a person.</dd></div>
              <div><dt>“via agent”</dt><dd>Every agent action is in the audit log with its token’s name.</dd></div>
            </dl>
            <NuxtLink to="/agents" class="more">How agents work with CanonTracker<UiIcon name="arrow" :size="16" /></NuxtLink>
          </div>
          <figure class="code-card">
            <figcaption><span class="mono">{{ MCP_FILE }}</span><span>Muse Code</span></figcaption>
            <pre class="code" aria-label="Example: connect Muse Code to CanonTracker"><code>{{ MCP_SNIPPET }}</code></pre>
          </figure>
        </div>
      </section>

      <!-- 7. Trust -->
      <section class="band" aria-labelledby="trust-title">
        <div class="band-head">
          <p class="kicker">Trust</p>
          <h2 id="trust-title">Rules the product keeps</h2>
          <p>The same four rules hold in the app, the API and every agent. <NuxtLink to="/security">Read how</NuxtLink>.</p>
        </div>
        <dl class="rules">
          <div v-for="t in TRUST" :key="t.title">
            <dt>{{ t.title }}</dt>
            <dd>{{ t.text }}</dd>
          </div>
        </dl>
        <div class="open">
          <div>
            <h3>Open source, AGPL-3.0</h3>
            <p>Run the whole app on your own server for free, everything included. If you would rather we host it for your team, ask us for a price.</p>
          </div>
          <div class="open-actions">
            <UiButton :to="GITHUB">Source on GitHub</UiButton>
            <UiButton to="/pricing" variant="ghost">Pricing</UiButton>
          </div>
        </div>
      </section>

      <!-- 8. Built on Muse -->
      <section class="band muse-band" aria-labelledby="muse-title">
        <h2 id="muse-title" class="muse-title">Built on Muse, from Meta</h2>
        <ul class="muse">
          <li v-for="m in MUSE" :key="m.name"><b>{{ m.name }}</b><span>{{ m.text }}</span></li>
        </ul>
      </section>

      <MarketingCta
        title="Start with a story world that already breaks"
        text="Load Sherlock Holmes, the Oz books, Alice, The Ashbell Pass or Broken Tide: real documents, AI candidates to review and contradictions to find. Then import your own, or run CanonTracker on your own server."
      />
    </div>
  </NuxtLayout>
</template>

<style scoped>
.home > section { max-width: var(--mk-max); margin: 0 auto; padding-inline: var(--mk-pad); }
.band { padding-block: 88px; border-top: 1px solid var(--line); }
.band-head { margin-bottom: var(--s-7); max-width: 760px; }
.band-head h2, .mcp h2 { font-size: clamp(1.6rem, 1.1rem + 1.5vw, 2.35rem); line-height: 1.1; letter-spacing: -0.03em; margin-bottom: var(--s-3); text-wrap: balance; }
.band-head > p:last-child { margin: 0; max-width: 64ch; font-size: 1.0625rem; line-height: 1.6; color: var(--muted); }
/* Section label: the brand's accepted point, then the words. */
.kicker { display: flex; align-items: center; gap: 10px; margin: 0 0 var(--s-3); color: var(--accent-strong); font-weight: 600; font-size: var(--text-sm); }
.kicker::before { content: ''; flex: none; width: 22px; height: 8px; background: radial-gradient(circle at 18px 4px, var(--accent) 3.5px, transparent 4px), linear-gradient(var(--ink), var(--ink)) 0 3.5px / 14px 1.5px no-repeat; }
.more { display: inline-flex; align-items: center; gap: 6px; font-weight: 600; text-decoration: none; min-height: 44px; }
.more:hover { text-decoration: underline; }

/* 1. Hero */
.hero { display: grid; grid-template-columns: minmax(0, 6fr) minmax(0, 5fr); gap: 56px; align-items: start; padding-block: 72px 88px; }
.hero-copy { container-type: inline-size; min-width: 0; }
/* Sized to the column: the longest line ("Every contradiction caught.") fits on one line at every width. */
.hero h1 { font-size: clamp(1.9rem, 7.4cqi, 3.1rem); line-height: 1.02; letter-spacing: -0.04em; margin: 0 0 var(--s-5); }
.hero h1 span { display: block; white-space: nowrap; }
@media (max-width: 380px) { .hero h1 span { white-space: normal; } }
.hero h1 span:nth-child(2) { color: var(--muted); }
.lead { font-size: 1.125rem; line-height: 1.6; color: var(--muted); margin: 0 0 var(--s-6); max-width: 56ch; }
.cta { display: flex; flex-wrap: wrap; gap: var(--s-2); margin-bottom: var(--s-6); }
.audience { list-style: none; margin: 0; padding: 0; display: flex; flex-wrap: wrap; gap: var(--s-2); }
.audience li { padding: 6px 12px; border: 1px solid var(--line-strong); border-radius: 999px; color: var(--muted); font-size: var(--text-sm); font-weight: 500; background: var(--raised); }
.hero-proof { min-width: 0; display: grid; gap: var(--s-3); }
.impact { margin: 0 0 0 12%; padding: var(--s-4) var(--s-5); background: var(--raised); border: 1px solid var(--line-strong); border-top: 3px solid var(--accent); border-radius: var(--r-lg); position: relative; }
/* A short ink line ties the change to the conflict above: one canon, two checks. */
.impact::before { content: ''; position: absolute; left: 28px; top: -16px; height: 13px; border-left: 2px solid var(--line-strong); }
.impact-head { display: flex; align-items: center; flex-wrap: wrap; gap: var(--s-2); color: var(--muted); font-size: var(--text-sm); font-weight: 600; margin-bottom: var(--s-3); }
.impact .statement { margin: 0; font-size: var(--text-base); line-height: 1.5; }
.impact del { color: var(--faint); text-decoration-color: var(--bad); }
.impact ins { text-decoration: none; color: var(--ink); }
.was { margin-bottom: 4px !important; }
.reach { margin: var(--s-3) 0 var(--s-2); color: var(--muted); font-size: var(--text-sm); }
.reach b { color: var(--ink); margin-right: 6px; }
.scenes { list-style: none; margin: 0; padding: 0; display: flex; flex-wrap: wrap; gap: 6px; }
.scenes li { padding: 3px 8px; border-radius: var(--r-sm); background: var(--accent-soft); color: var(--accent-strong); font-size: var(--text-xs); font-weight: 600; }
.caption { margin: var(--s-1) 0 0; color: var(--faint); font-size: var(--text-sm); line-height: 1.5; }

/* 2. Video */
.demo { scroll-margin-top: 72px; }
.demo .band-head { margin-bottom: var(--s-6); }

/* 3. Slips */
.slips { list-style: none; margin: 0; padding: 0; display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: var(--s-5); }
.slips li { display: grid; align-content: start; gap: var(--s-2); padding: var(--s-5); background: var(--raised); border: 1px solid var(--line); border-radius: var(--r-lg); }
.slip-art { width: 100%; max-width: 240px; margin: 0 auto var(--s-3); }
.slip-meta { display: flex; flex-wrap: wrap; align-items: center; gap: var(--s-2); margin: 0; font-weight: 600; font-size: var(--text-sm); }
.slip-meta span { color: var(--faint); font-weight: 500; }
.slip-meta span::after { content: '·'; margin-left: var(--s-2); }
.slips h3 { margin: 0; font-size: var(--text-lg); letter-spacing: -0.01em; }
.slips p:last-child { margin: 0; color: var(--muted); line-height: 1.55; }
.breaks-foot { margin: var(--s-6) 0 0; padding-left: var(--s-4); border-left: 3px solid var(--bad); max-width: 72ch; line-height: 1.6; }

/* The timeline drawing has no white fill: on dark surfaces draw it in pale ink, orange kept. */
@media (prefers-color-scheme: dark) { :root:not([data-theme=light]) .line-art { filter: invert(1) hue-rotate(180deg); } }
:root[data-theme=dark] .line-art { filter: invert(1) hue-rotate(180deg); }

/* 4. The canon track: each station's point is joined to the next. Pencil (dashed) before approval, ink after. */
.track { list-style: none; margin: 0; padding: 0; display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); }
.track li { position: relative; display: grid; align-content: start; gap: var(--s-2); padding: 0 var(--s-3); }
.track li:first-child { padding-left: 0; }
.pt { position: relative; z-index: 1; width: 18px; height: 18px; border-radius: 50%; box-sizing: border-box; background: var(--canvas); border: 2px solid var(--ink); margin-bottom: var(--s-3); }
.st-pencil .pt { border: 2px dashed var(--pencil); }
.st-canon .pt { background: var(--accent); border-color: var(--accent); box-shadow: 0 0 0 5px var(--accent-soft); }
.st-ink .pt { background: var(--ink); }
.track li::after { content: ''; position: absolute; top: 8px; left: calc(var(--s-3) + 18px); right: calc(-1 * var(--s-3)); border-top: 2px solid var(--ink); }
.track li:first-child::after { left: 18px; }
.track li:nth-child(-n+2)::after { border-top: 2px dashed var(--pencil); }
.track li:last-child::after { display: none; }
.step-art { width: 100%; max-width: 150px; }
.track h3 { margin: var(--s-2) 0 0; font-size: var(--text-md); }
.step-n { color: var(--faint); font-weight: 500; }
.st-canon h3 { color: var(--accent-strong); }
.track p { margin: 0; color: var(--muted); line-height: 1.5; }
.proof { margin-top: 64px; display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: var(--s-5); }
.proof figure { margin: 0; display: grid; gap: var(--s-3); align-content: start; }
.proof figcaption { color: var(--muted); line-height: 1.5; }
.proof figcaption b { color: var(--ink); }

/* 5. Media */
.media { list-style: none; margin: 0; padding: 0; display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: var(--s-5); }
.media > li { display: grid; grid-template-columns: 112px minmax(0, 1fr); gap: var(--s-5); padding: var(--s-5); background: var(--raised); border: 1px solid var(--line); border-radius: var(--r-lg); }
.media-art { width: 112px; }
.media h3 { font-size: var(--text-lg); margin: 0 0 var(--s-2); }
.media p { margin: 0 0 var(--s-3); color: var(--muted); line-height: 1.5; }
.media ul { list-style: none; margin: 0 0 var(--s-2); padding: 0; display: grid; gap: 6px; }
.media ul li { position: relative; padding-left: 20px; line-height: 1.45; }
.media ul li::before { content: ''; position: absolute; left: 2px; top: 0.45em; width: 9px; height: 5px; border-left: 2px solid var(--accent); border-bottom: 2px solid var(--accent); transform: rotate(-45deg); }

/* 6. MCP */
.mcp { display: grid; grid-template-columns: minmax(0, 6fr) minmax(0, 5fr); gap: var(--s-7); align-items: center; }
.mcp-copy > p:not(.kicker) { color: var(--muted); font-size: 1.0625rem; line-height: 1.6; max-width: 58ch; }
.mcp-facts { margin: var(--s-5) 0 var(--s-3); display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: var(--s-4); }
.mcp-facts div { padding-top: var(--s-3); border-top: 2px solid var(--ink); }
.mcp-facts dt { font-weight: 600; font-size: var(--text-lg); margin-bottom: 4px; }
.mcp-facts dd { margin: 0; color: var(--muted); line-height: 1.5; font-size: var(--text-sm); }
.code-card { margin: 0; min-width: 0; background: var(--surface); border: 1px solid var(--line); border-radius: var(--r-lg); overflow: hidden; }
.code-card figcaption { display: flex; justify-content: space-between; gap: var(--s-3); padding: 10px var(--s-4); border-bottom: 1px solid var(--line); color: var(--muted); font-size: var(--text-xs); }
.code-card .mono { font-family: var(--font-code); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.code { margin: 0; padding: var(--s-4); font-family: var(--font-code); font-size: var(--text-sm); line-height: 1.6; overflow-x: auto; white-space: pre; background: var(--raised); }

/* 7. Trust */
.rules { margin: 0; display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); border-top: 2px solid var(--ink); }
.rules > div { padding: var(--s-4) var(--s-4) 0 0; }
.rules > div + div { padding-left: var(--s-4); border-left: 1px solid var(--line); }
.rules dt { font-weight: 600; font-size: var(--text-md); margin-bottom: var(--s-2); }
.rules dd { margin: 0; color: var(--muted); line-height: 1.55; }
.open { margin-top: var(--s-7); display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: var(--s-4); padding: var(--s-5); background: var(--surface); border: 1px solid var(--line); border-radius: var(--r-lg); }
.open h3 { font-size: var(--text-lg); margin-bottom: 4px; }
.open p { margin: 0; color: var(--muted); max-width: 64ch; line-height: 1.55; }
.open-actions { display: flex; flex-wrap: wrap; gap: var(--s-2); }

/* 8. Muse */
.muse-band { display: grid; grid-template-columns: 200px minmax(0, 1fr); gap: var(--s-6); align-items: start; padding-block: 56px; }
.muse-title { font-size: var(--text-lg); margin: 4px 0 0; }
.muse { list-style: none; margin: 0; padding: 0; display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: var(--s-5); }
.muse li { display: grid; gap: 4px; align-content: start; }
.muse b { font-size: var(--text-md); }
.muse span { color: var(--muted); line-height: 1.45; font-size: var(--text-sm); }

@media (max-width: 1100px) {
  .hero { grid-template-columns: minmax(0, 1fr); gap: var(--s-7); }
  .hero-proof { max-width: 640px; }
  .track { grid-template-columns: repeat(3, minmax(0, 1fr)); row-gap: var(--s-7); }
  .track li:nth-child(3)::after { display: none; }
  .track li:nth-child(4) { padding-left: 0; }
  .track li:nth-child(4)::after { left: 18px; }
  .rules { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .rules > div:nth-child(3) { padding-left: 0; border-left: 0; }
  .rules > div { padding-bottom: var(--s-4); }
  .muse-band { grid-template-columns: minmax(0, 1fr); gap: var(--s-4); }
  .muse { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .mcp { grid-template-columns: minmax(0, 1fr); }
}
@media (max-width: 900px) {
  .slips, .media, .proof { grid-template-columns: minmax(0, 1fr); }
  .slips li { grid-template-columns: 120px minmax(0, 1fr); column-gap: var(--s-4); }
  .slip-art { grid-row: span 3; margin: 0; }
}
@media (max-width: 720px) {
  .band { padding-block: 56px; }
  .band-head { margin-bottom: var(--s-6); }
  .hero { padding-block: var(--s-6) var(--s-7); }
  .cta .btn { flex: 1 1 auto; }
  .impact { margin-left: 0; padding: var(--s-4); }
  .impact::before { display: none; }
  /* The track turns vertical: points down the left, a line from each to the next. */
  .track { grid-template-columns: minmax(0, 1fr); row-gap: 0; }
  .track li, .track li:first-child, .track li:nth-child(4) { grid-template-columns: 18px 72px minmax(0, 1fr); column-gap: var(--s-4); padding: 0 0 var(--s-6); align-items: start; }
  .pt { grid-row: span 2; margin: 2px 0 0; }
  .step-art { grid-row: span 2; width: 72px; }
  .track h3 { margin: 0; }
  .track li::after, .track li:first-child::after, .track li:nth-child(4)::after { top: 22px; bottom: 0; left: 8px; right: auto; border-top: 0; border-left: 2px solid var(--ink); }
  .track li:nth-child(-n+2)::after { border-top: 0; border-left: 2px dashed var(--pencil); }
  .track li:nth-child(3)::after { display: block; }
  .proof { margin-top: var(--s-4); }
  .media > li { grid-template-columns: minmax(0, 1fr); gap: var(--s-3); padding: var(--s-4); }
  .media-art { width: 88px; }
  .mcp-facts { grid-template-columns: minmax(0, 1fr); }
  .rules { grid-template-columns: minmax(0, 1fr); }
  .rules > div, .rules > div + div { padding-left: 0; border-left: 0; border-bottom: 1px solid var(--line); }
  .open-actions { width: 100%; }
  .open-actions .btn { flex: 1 1 auto; }
}
@media (max-width: 480px) {
  .slips li { grid-template-columns: minmax(0, 1fr); }
  .slip-art { grid-row: auto; max-width: 168px; margin: 0 auto; }
  .muse { grid-template-columns: minmax(0, 1fr); gap: var(--s-3); }
  .audience li { font-size: var(--text-xs); }
}
</style>
