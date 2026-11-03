<script setup lang="ts">
// Public home page (signed out). Every example is real content from the bundled samples, and every screenshot is the app.
useMarketingSeo({
  title: 'CanonTracker · Catch story contradictions with sources',
  description: 'CanonTracker turns your lore, scripts and chapters into human-approved canon with a source for every fact, finds contradictions, and shows what a change touches before you make it.',
  image: 'og-landing',
  path: '/',
})
const me = useMe()

// The Ashbell Pass: three of its planted contradictions, word for word from canon.
const PROBLEMS = [
  { a: 'Captain Rourke stands watch at the Bell Gate from 21:00 to 22:00 on Day 2.', b: 'Captain Rourke is at the Kettle & Coal at 21:30 on Day 2.', why: 'Two places at the same time' },
  { a: 'Ves is at the Bell Gate at 14:00 on Day 3.', b: 'Ves is at Saltgate at 14:10 on Day 3.', why: 'The walk takes forty-five minutes' },
  { a: 'Ysolde and Corin were sworn partners until Ysolde broke the oath at 18:00 on Day 2.', b: "Corin is Ysolde's sworn partner at 08:00 on Day 4.", why: 'A relationship used after it ended' },
]
const STEPS = [
  { title: 'Import', art: 'import', text: 'Markdown, text, Word or a recording. Sources are versioned and never edited.' },
  { title: 'Review', art: 'review', text: 'The AI proposes facts with the exact quote. A person accepts, edits or rejects each one.' },
  { title: 'Canon', art: 'canon', text: 'Accepted facts become canon: a wiki, a graph and a timeline, every fact cited.' },
  { title: 'Conflicts', art: 'conflicts', text: 'Rules flag two places at once, impossible travel and broken relationships.' },
  { title: 'Impact', art: 'impact', text: 'Before you change a fact, see the facts and scenes it touches, two steps deep.' },
]
const HIGHLIGHTS = [PILLARS[0]!.sections[0]!, PILLARS[1]!.sections[0]!, PILLARS[1]!.sections[1]!, PILLARS[3]!.sections[2]!]
const TRUST = [
  { title: 'A person decides', text: 'The AI only proposes. Nothing becomes canon until someone accepts it, and their name stays on the decision, with “via agent” when their own agent made it.' },
  { title: 'Word for word', text: 'Every canon fact cites a passage that contains its quote exactly. No quote, no canon; no evidence, “unknown”.' },
  { title: 'Nothing is rewritten', text: 'Imported files stay read-only, old facts are kept when canon changes, and the audit log is append-only.' },
  { title: 'Projects stay apart', text: 'One guard checks membership and role on every request. Viewers read; editors decide; admins manage.' },
]
// Muse Code (Meta) connects over Streamable HTTP from its settings file.
const MCP_SNIPPET = `// ~/.config/muse/settings.json (Muse Code)\n${JSON.stringify({ schema_version: 1, mcp_servers: { 'canontracker': { transport: 'streamable_http', url: `${SITE}/mcp`, headers: { Authorization: 'Bearer sb_…' } } } }, null, 2)}`
</script>

<template>
  <NuxtLayout name="marketing">
    <div class="home">
      <section class="hero">
        <div class="hero-copy">
          <p class="for">For novelists, game writers, screen and series writers, and worldbuilders</p>
          <h1>Catch contradictions. See the sources.</h1>
          <p class="lead">
            A shoulder in one book. A leg in the next. CanonTracker catches the contradiction and puts both quotes in front of you.
            Build human-approved canon from your lore, scripts and chapters, then see what a change touches before you make it.
          </p>
          <div class="cta">
            <UiButton v-if="me?.user" to="/" variant="primary" size="lg">Open the app</UiButton>
            <UiButton v-else to="/signup" variant="primary" size="lg">Start free</UiButton>
            <UiButton to="/features" size="lg">See every feature</UiButton>
          </div>
          <p class="fine">Open source under AGPL-3.0. Try Sherlock Holmes or three original sample stories before you import your own.</p>
        </div>
        <div class="hero-shot">
          <MarketingWatsonConflict />
          <p class="caption">A real continuity slip in Arthur Conan Doyle’s Sherlock Holmes. Load the sample and check it yourself.</p>
        </div>
      </section>

      <section v-if="VIDEO_ID" class="band demo" aria-labelledby="demo-title">
        <div class="band-head">
          <h2 id="demo-title">See it in three minutes</h2>
          <p class="muted">Sherlock Holmes goes in, canon comes out with a source for every fact, and Watson’s wound turns up in both books. Then an agent builds a game from the canon.</p>
        </div>
        <MarketingDemoVideo :id="VIDEO_ID" title="CanonTracker in three minutes" />
      </section>

      <section class="problem band">
        <div class="problem-art">
          <LandingArt name="story-world" alt="An open ledger whose page rises into a small world: a lighthouse, a mountain pass with a bell tower, a winding road." :size="480" />
        </div>
        <div class="problem-copy">
          <h2>Every story world contradicts itself eventually</h2>
          <p class="muted">
            Facts live in different files, written by different people at different times. These three are from The Ashbell Pass, a 28-document game story.
            Each pair looks fine on its own.
          </p>
          <ul class="pairs">
            <li v-for="p in PROBLEMS" :key="p.why">
              <span class="why">{{ p.why }}</span>
              <blockquote>{{ p.a }}</blockquote>
              <blockquote>{{ p.b }}</blockquote>
            </li>
          </ul>
        </div>
      </section>

      <section id="how" class="band">
        <div class="band-head">
          <h2>From documents to canon you can cite</h2>
          <p class="muted">Five steps, in the order a story team already works.</p>
        </div>
        <ol class="steps">
          <li v-for="(s, i) in STEPS" :key="s.title">
            <LandingArt :name="s.art" alt="" :size="200" class="step-art" />
            <h3><span class="step-n" aria-hidden="true">{{ i + 1 }}</span>{{ s.title }}</h3>
            <p>{{ s.text }}</p>
          </li>
        </ol>
      </section>

      <div class="band features">
        <MarketingFeature v-for="(s, i) in HIGHLIGHTS" :key="s.title" :section="s" :flip="i % 2 === 1" />
      </div>

      <section class="band">
        <div class="band-head">
          <h2>Everything a story world needs</h2>
          <p class="muted">Six areas, each with its own page.</p>
        </div>
        <ul class="pillars">
          <li v-for="p in PILLARS" :key="p.slug">
            <NuxtLink :to="`/features/${p.slug}`" class="pillar">
              <LandingArt :name="p.art" alt="" :size="120" class="pillar-art" />
              <span><b>{{ p.title }}</b><span>{{ p.short }}</span></span>
            </NuxtLink>
          </li>
        </ul>
      </section>

      <section class="band agents">
        <div class="band-head">
          <h2>AI that proposes, people who decide</h2>
          <p class="muted">AI helpers do the reading. None of them can change canon.</p>
        </div>
        <ul class="agent-list">
          <li v-for="a in AGENTS" :key="a.name">
            <UiIcon :name="a.icon" :size="20" class="agent-icon" />
            <div>
              <h3>{{ a.name }}</h3>
              <p>{{ a.does }}</p>
              <p class="never">{{ a.never }}</p>
            </div>
          </li>
        </ul>
        <div class="mcp">
          <div>
            <h3>Bring your own agents through MCP</h3>
            <p>CanonTracker is an MCP server with 38 tools, so an agent in Muse Code, or any MCP client, can do almost everything you do in a project. A propose token reads, checks and proposes; nothing it does becomes canon. A full-access token acts as you, and each decision it makes is marked “via agent” with the token’s name.</p>
            <NuxtLink to="/agents">How agents work with CanonTracker</NuxtLink>
          </div>
          <pre class="code" aria-label="Example: connect Muse Code"><code>{{ MCP_SNIPPET }}</code></pre>
        </div>
      </section>

      <section class="band">
        <div class="band-head">
          <h2>Built for anyone building a story</h2>
          <p class="muted">Alone or as a team, prose or game script.</p>
        </div>
        <ul class="cases">
          <li v-for="u in USE_CASES" :key="u.slug">
            <NuxtLink :to="`/use-cases/${u.slug}`" class="case">
              <LandingArt :name="u.art" alt="" :size="240" />
              <b>{{ u.nav }}</b>
              <span>{{ u.lead }}</span>
            </NuxtLink>
          </li>
        </ul>
      </section>

      <section class="band trust">
        <div class="band-head">
          <h2>Rules the product keeps</h2>
          <p class="muted">The same four rules hold in the app, the API and every agent. <NuxtLink to="/security">Read how</NuxtLink>.</p>
        </div>
        <dl class="rules">
          <div v-for="t in TRUST" :key="t.title">
            <dt>{{ t.title }}</dt>
            <dd>{{ t.text }}</dd>
          </div>
        </dl>
      </section>

      <MarketingCta />
    </div>
  </NuxtLayout>
</template>

<style scoped>
.home > section, .home > .band { max-width: var(--mk-max); margin: 0 auto; padding-inline: var(--mk-pad); }
.band { padding-block: 72px; border-top: 1px solid var(--line); }
.demo { max-width: 1040px; margin-inline: auto; }
.band-head { margin-bottom: var(--s-6); }
.band-head h2, .problem-copy h2 { font-size: clamp(1.5rem, 1.1rem + 1.2vw, 2rem); letter-spacing: -0.025em; margin-bottom: var(--s-2); }
.band-head p { margin: 0; max-width: 64ch; font-size: 1rem; }

.hero { display: grid; grid-template-columns: minmax(0, 5fr) minmax(0, 7fr); gap: var(--s-7); align-items: center; padding-block: 64px 80px; }
.for { margin: 0 0 var(--s-4); color: var(--accent); font-weight: 600; }
.hero h1 { font-size: clamp(2.1rem, 1.3rem + 2.6vw, 3.4rem); line-height: 1.05; letter-spacing: -0.035em; margin-bottom: var(--s-5); text-wrap: balance; }
.lead { font-size: 1.125rem; line-height: 1.6; color: var(--muted); margin: 0 0 var(--s-5); max-width: 52ch; }
.cta { display: flex; flex-wrap: wrap; gap: var(--s-2); margin-bottom: var(--s-4); }
.fine { margin: 0; color: var(--faint); font-size: var(--text-sm); }
.hero-shot { min-width: 0; }
.caption { margin: var(--s-2) 0 0; color: var(--faint); font-size: var(--text-sm); }

.problem { display: grid; grid-template-columns: minmax(0, 4fr) minmax(0, 7fr); gap: var(--s-7); align-items: center; }
.problem-art { max-width: 420px; }
.problem-copy > p { max-width: 60ch; font-size: 1rem; line-height: 1.6; }
.pairs { list-style: none; margin: var(--s-5) 0 0; padding: 0; display: grid; gap: var(--s-4); }
.pairs li { display: grid; grid-template-columns: 1fr 1fr; gap: var(--s-2) var(--s-4); padding: var(--s-4); background: var(--raised); border: 1px solid var(--line); border-left: 3px solid var(--bad); border-radius: var(--r-lg); }
.why { grid-column: 1 / -1; color: var(--bad); font-weight: 600; font-size: var(--text-sm); }
.pairs blockquote { margin: 0; font-family: var(--font-story); font-size: var(--text-md); line-height: 1.5; }

.steps { list-style: none; margin: 0; padding: 0; display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: var(--s-5); }
.steps li { display: grid; gap: var(--s-2); align-content: start; }
.step-art { width: 100%; max-width: 180px; margin-bottom: var(--s-2); }
.steps h3 { display: flex; align-items: center; gap: var(--s-2); margin: 0; font-size: var(--text-md); }
.steps p { margin: 0; color: var(--muted); line-height: 1.5; }
.step-n { display: grid; place-items: center; width: 26px; height: 26px; border-radius: 50%; border: 1.5px dashed var(--pencil); color: var(--pencil); font-size: var(--text-xs); }

.features { display: grid; gap: 96px; }

.pillars { list-style: none; margin: 0; padding: 0; display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: var(--s-4); }
.pillar { display: grid; grid-template-columns: 88px minmax(0, 1fr); gap: var(--s-4); align-items: center; height: 100%; padding: var(--s-4); background: var(--raised); border: 1px solid var(--line); border-radius: var(--r-lg); color: var(--ink); text-decoration: none; }
.pillar:hover { border-color: var(--accent); }
.pillar > span { display: grid; gap: 4px; }
.pillar > span > span { color: var(--muted); line-height: 1.45; }

.agent-list { list-style: none; margin: 0; padding: 0; display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: var(--s-6) var(--s-5); }
.agent-list li { display: grid; grid-template-columns: 36px minmax(0, 1fr); gap: var(--s-3); }
.agent-icon { display: grid; place-items: center; width: 36px; height: 36px; padding: 8px; color: var(--accent); background: var(--accent-soft); border-radius: var(--r-md); box-sizing: border-box; }
.agent-list h3 { margin: 6px 0 var(--s-2); }
.agent-list p { margin: 0 0 var(--s-2); color: var(--muted); line-height: 1.5; }
.agent-list .never { color: var(--ink); padding-left: var(--s-3); border-left: 2px dashed var(--pencil); }
.mcp { margin-top: var(--s-7); display: grid; grid-template-columns: minmax(0, 5fr) minmax(0, 6fr); gap: var(--s-6); align-items: center; padding: var(--s-6); background: var(--surface); border: 1px solid var(--line); border-radius: var(--r-lg); }
.mcp h3 { font-size: var(--text-lg); }
.mcp p { color: var(--muted); line-height: 1.55; }
.code { margin: 0; padding: var(--s-4); background: var(--raised); border: 1px solid var(--line); border-radius: var(--r-md); font-family: var(--font-code); font-size: var(--text-sm); line-height: 1.6; overflow-x: auto; white-space: pre; }

.cases { list-style: none; margin: 0; padding: 0; display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: var(--s-5); }
.case { display: grid; gap: var(--s-2); color: var(--ink); text-decoration: none; }
.case b { font-size: var(--text-md); margin-top: var(--s-2); }
.case span { color: var(--muted); line-height: 1.5; }
.case:hover b { color: var(--accent); text-decoration: underline; }

.rules { margin: 0; display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); border-top: 2px solid var(--ink); }
.rules > div { padding: var(--s-4) var(--s-4) 0 0; }
.rules > div + div { padding-left: var(--s-4); border-left: 1px solid var(--line); }
.rules dt { font-weight: 600; font-size: var(--text-md); margin-bottom: var(--s-2); }
.rules dd { margin: 0; color: var(--muted); line-height: 1.55; }

@media (max-width: 1100px) {
  .steps { grid-template-columns: repeat(3, minmax(0, 1fr)); }
  .agent-list, .pillars { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .cases, .rules { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .rules > div:nth-child(3) { padding-left: 0; border-left: 0; }
  .rules > div { padding-bottom: var(--s-4); }
}
@media (max-width: 900px) {
  .hero, .problem, .mcp { grid-template-columns: minmax(0, 1fr); }
  .hero { padding-block: var(--s-6) var(--s-7); gap: var(--s-6); }
  .problem-art { max-width: 200px; }
}
@media (max-width: 720px) {
  .band { padding-block: var(--s-7); }
  .features { gap: 64px; }
  .steps { grid-template-columns: minmax(0, 1fr); gap: var(--s-4); }
  .steps li { grid-template-columns: 88px minmax(0, 1fr); column-gap: var(--s-4); }
  .step-art { grid-row: span 2; margin: 0; }
  .agent-list, .pillars, .cases, .rules { grid-template-columns: minmax(0, 1fr); }
  .rules > div, .rules > div + div { padding-left: 0; border-left: 0; border-bottom: 1px solid var(--line); }
  .pairs li { grid-template-columns: minmax(0, 1fr); }
  .mcp { padding: var(--s-4); }
  .cta .btn { flex: 1 1 auto; }
}
</style>
