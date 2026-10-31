<script setup lang="ts">
// Public landing page. Every example is real content from the Broken Tide demo, and the model note says what this instance actually runs.
useSeoMeta({
  title: 'Story Bible · Narrative canon and impact QA for game teams',
  description: 'Know what’s canon. Trace every fact to its source and see which scenes a change touches before it ships.',
  ogTitle: 'Story Bible · Know what’s canon',
  ogDescription: 'Human-approved, source-cited canon and change impact for your narrative team.',
  ogImage: 'https://storybible.trythis.work/og-landing.png',
  ogImageAlt: 'Story Bible — Know what’s canon. See what a change touches.',
  twitterCard: 'summary_large_image',
  twitterTitle: 'Story Bible · Know what’s canon',
  twitterDescription: 'Human-approved, source-cited canon and change impact for your narrative team.',
  twitterImage: 'https://storybible.trythis.work/og-landing.png',
  twitterImageAlt: 'Story Bible — Know what’s canon. See what a change touches.',
})
const me = useMe()
const recorded = computed(() => me.value?.model.mode !== 'meta')

const STEPS = [
  { title: 'Import', art: 'import', alt: 'Manuscript pages gathered with a paper clip.', text: 'Bring lore docs and scene scripts as Markdown or text. Sources are hashed, versioned and never edited.' },
  { title: 'Review', art: 'review', alt: 'A pen and a reviewed manuscript card.', text: 'The model proposes facts, each with the exact quote it came from. A person accepts, corrects or rejects every one.' },
  { title: 'Canon', art: 'canon', alt: 'A reference ledger with an ink-blue bookmark.', text: 'Accepted facts become canon: characters, places, relationships and rules, each cited to its passage.' },
  { title: 'Conflicts', art: 'conflicts', alt: 'Two scene cards with an interrupted connection.', text: 'Catch someone in two places at once, a trip that’s too fast, or a relationship used after it ended.' },
  { title: 'Impact', art: 'impact', alt: 'A story card connected to two downstream scenes.', text: 'Before you change canon, see which facts and scenes it touches, up to two steps away. Export the list for re-review.' },
]
const PRINCIPLES = [
  { title: 'A person decides', text: 'The model only proposes. Nothing becomes canon until someone on your team accepts it, and their name is on the decision.' },
  { title: 'No quote, no canon', text: 'Every canon fact cites a passage, word for word. A candidate whose quote isn’t in the source can’t be accepted.' },
  { title: 'Unknown beats invented', text: 'Ask canon a question it can’t support and the answer is “unknown”, never a guess with made-up sources.' },
  { title: 'Nothing is overwritten', text: 'Your files stay read-only. Changes create new versions, old facts are kept, and the audit log is append-only.' },
]
const TEAM = [
  { title: 'Narrative leads', text: 'Own the canon. Decide what’s true, settle contradictions and approve changes with the impact in front of you.' },
  { title: 'Writers', text: 'Check a detail in seconds, with the passage it comes from, instead of searching ten documents.' },
  { title: 'Producers', text: 'Know which scenes need another pass before a change reaches the build, and who signed off on what.' },
]
</script>

<template>
  <div class="landing">
    <header class="lp-top">
      <NuxtLink to="/" class="brand"><BrandMark />Story Bible</NuxtLink>
      <nav class="lp-nav" aria-label="Page">
        <a href="#how" class="hide-sm">How it works</a>
        <a href="#principles" class="hide-sm">Principles</a>
        <NuxtLink to="/login" class="btn ghost">Log in</NuxtLink>
        <NuxtLink to="/signup" class="btn primary">Create your studio</NuxtLink>
      </nav>
    </header>

    <main>
      <section class="hero">
        <div class="hero-copy">
          <span class="kicker">Narrative canon &amp; impact QA for game teams</span>
          <h1>Know what’s canon.<br>See what a change breaks before it ships.</h1>
          <p class="lead">
            Story Bible reads your lore docs and scene scripts, proposes facts with the exact quote they came from,
            and lets your narrative lead decide what becomes canon. Then it flags contradictions and shows which scenes a change will touch.
          </p>
          <div class="row cta">
            <UiButton to="/signup" variant="primary" size="lg">Create your studio<UiIcon name="arrow" :size="16" /></UiButton>
            <UiButton to="/login" size="lg">Log in</UiButton>
          </div>
          <p class="small muted">Comes with Broken Tide, an original demo story with planted contradictions, so you can try it before importing your own lore.</p>
        </div>

        <div class="hero-visual">
          <LandingArt name="story-world" alt="An open story ledger unfolds into a coastal world, with linked scene cards beside it." :width="720" :height="480" eager class="hero-art" />
          <figure class="preview" aria-label="Example from the Broken Tide demo">
            <div class="pv-bar">
              <span class="small"><b>Review</b> <span class="faint">· Broken Tide</span></span>
              <UiBadge tone="pencil">3 of 25 candidates</UiBadge>
            </div>

            <div class="pv-card candidate">
              <div class="pv-meta"><UiBadge tone="pencil">Candidate</UiBadge><span class="small faint">relationship · from S02</span></div>
              <p class="statement">Mara and Leya are sisters.</p>
              <blockquote class="quote">“You’re my sister in all but blood,” Mara says, and Leya laughs.</blockquote>
              <div class="pv-decision">
                <span class="pv-btn reject" aria-hidden="true">Reject</span>
                <span class="small muted"><b>Rejected by Ada</b> · figurative, they aren’t related</span>
              </div>
            </div>

            <div class="pv-card canon">
              <div class="pv-meta"><UiBadge tone="accent">Canon</UiBadge><UiBadge tone="good" dot>Quote verified</UiBadge></div>
              <p class="statement">Leya and Arin are biological siblings; Arin is four years older.</p>
              <span class="small faint">characters.md · accepted by Ada</span>
            </div>

            <div class="pv-impact">
              <div class="small"><b>Change a world rule</b> <span class="muted">· the chord stone erases the last hour</span></div>
              <div class="row">
                <span class="small muted">Scenes to re-review</span>
                <UiBadge v-for="s in ['S04', 'S07', 'S09', 'S10']" :key="s" tone="warn">{{ s }}</UiBadge>
              </div>
            </div>
          </figure>
        </div>
      </section>

      <section id="how" class="band">
        <div class="band-head">
          <h2>From lore docs to canon you can cite</h2>
          <p class="muted">Five steps, in the order your team already works.</p>
        </div>
        <ol class="steps">
          <li v-for="(s, i) in STEPS" :key="s.title">
            <LandingArt :name="s.art" :alt="s.alt" :width="200" :height="160" class="step-art" />
            <div class="step-heading"><span class="step-n">{{ i + 1 }}</span><h3>{{ s.title }}</h3></div>
            <p>{{ s.text }}</p>
          </li>
        </ol>
      </section>

      <section id="principles" class="band">
        <div class="band-head">
          <h2>Built so the model can’t write your canon</h2>
          <p class="muted">Language models are good at reading and bad at being sure. Story Bible uses the first and guards against the second.</p>
        </div>
        <div class="cards four">
          <div v-for="p in PRINCIPLES" :key="p.title" class="panel">
            <h3>{{ p.title }}</h3>
            <p>{{ p.text }}</p>
          </div>
        </div>
      </section>

      <section class="band">
        <div class="panel sunk model-note" :class="{ live: !recorded }">
          <span class="status-dot" aria-hidden="true" />
          <div>
            <h3>About the model</h3>
            <p v-if="recorded">
              Story Bible is built on the Meta Model API (Muse Spark). This instance runs in <b>recorded mode</b>: extraction and model checks
              replay a recorded run of the Broken Tide demo instead of calling the model live, and the app labels every recorded result as recorded.
              Your own files import and work normally, but get no model candidates until a live model is connected.
            </p>
            <p v-else>
              This instance calls {{ me?.model.label }} live. Every call is logged with the sources it was given, and nothing it says becomes canon without a person.
            </p>
          </div>
        </div>
      </section>

      <section class="band">
        <div class="band-head"><h2>For the whole narrative team</h2></div>
        <div class="cards three">
          <div v-for="t in TEAM" :key="t.title" class="team-card">
            <h3>{{ t.title }}</h3>
            <p>{{ t.text }}</p>
          </div>
        </div>
      </section>

      <section class="band final">
        <div class="panel final-card">
          <div>
            <h2>Try it on a finished story first</h2>
            <p class="muted">Create your studio, load Broken Tide and review your first candidates in under a minute. Invite your team when you’re ready.</p>
          </div>
          <UiButton to="/signup" variant="primary" size="lg">Create your studio<UiIcon name="arrow" :size="16" /></UiButton>
        </div>
      </section>
    </main>

    <footer class="lp-foot small faint">
      <span>Story Bible · built for the Meta AI Developer Hackathon</span>
      <span>Broken Tide is an original, synthetic story made for this demo.</span>
    </footer>
  </div>
</template>

<style scoped>
.landing { --lp-max: 1120px; min-height: 100vh; }
.lp-top, main > section, .lp-foot { width: 100%; max-width: var(--lp-max); margin: 0 auto; padding-inline: 40px; }
.lp-top { display: flex; align-items: center; justify-content: space-between; gap: var(--s-4); padding-block: var(--s-4); }
.lp-nav { display: flex; align-items: center; gap: var(--s-2); }
.lp-nav > a:not(.btn) { padding: 6px 10px; color: var(--muted); text-decoration: none; font-weight: 500; }
.lp-nav > a:not(.btn):hover { color: var(--ink); }

.hero { display: grid; grid-template-columns: minmax(0, 1.05fr) minmax(0, 1fr); gap: var(--s-7); align-items: center; padding-block: var(--s-7) 72px; }
.hero-copy { align-self: start; padding-top: var(--s-6); }
.kicker { display: inline-block; margin-bottom: var(--s-3); font-size: var(--text-sm); font-weight: 600; color: var(--accent); }
.hero h1 { font-size: clamp(2rem, 1.2rem + 2.6vw, 3.1rem); line-height: 1.08; letter-spacing: -0.03em; margin-bottom: var(--s-4); }
.lead { font-size: 1.0625rem; line-height: 1.6; color: var(--muted); max-width: 56ch; margin-bottom: var(--s-5); }
.cta { margin-bottom: var(--s-3); }
.hero-visual { display: grid; gap: var(--s-3); min-width: 0; }
.hero-art { width: min(100%, 360px); margin-inline: auto; }

/* The one bold element: a slice of the real review screen. */
.preview { margin: 0; display: grid; gap: var(--s-3); padding: var(--s-4); background: var(--surface); border: 1px solid var(--line); border-radius: 14px; }
.pv-bar { display: flex; justify-content: space-between; align-items: center; gap: var(--s-2); padding: 0 var(--s-1); }
.pv-card { display: grid; gap: var(--s-2); padding: var(--s-4); background: var(--raised); border-radius: var(--r-lg); }
.pv-card.candidate { border: 1.5px dashed var(--line-strong); }
.pv-card.canon { border: 1px solid var(--line); box-shadow: inset 3px 0 0 var(--accent); }
.pv-card .statement { margin: 0; }
.pv-card .quote { font-size: var(--text-base); }
.pv-meta { display: flex; gap: var(--s-2); align-items: center; flex-wrap: wrap; }
.pv-decision { display: flex; gap: var(--s-3); align-items: center; flex-wrap: wrap; }
.pv-btn { display: inline-flex; align-items: center; min-height: 28px; padding: 3px 10px; border-radius: var(--r-md); font-size: var(--text-sm); font-weight: 500; }
.pv-btn.reject { border: 1px solid var(--bad); color: var(--bad); background: var(--bad-soft); }
.pv-impact { display: grid; gap: var(--s-2); padding: var(--s-3) var(--s-4); border: 1px solid color-mix(in srgb, var(--warn) 30%, var(--line)); border-radius: var(--r-lg); background: var(--raised); }

.band { padding-block: var(--s-7); border-top: 1px solid var(--line); }
.band-head { margin-bottom: var(--s-5); }
.band-head h2 { font-size: var(--text-xl); letter-spacing: -0.02em; margin-bottom: var(--s-1); }
.band-head p { max-width: 64ch; margin: 0; }

.steps { list-style: none; margin: 0; padding: 0; display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: var(--s-4); }
.steps li { display: grid; gap: var(--s-2); align-content: start; }
.step-art { width: min(100%, 160px); }
.step-heading { display: flex; align-items: center; gap: var(--s-2); }
.steps h3, .cards h3 { margin: 0; font-size: var(--text-md); }
.steps p, .cards p { margin: 0; color: var(--muted); }
.step-n { display: grid; place-items: center; width: 28px; height: 28px; border-radius: 50%; border: 1.5px dashed var(--pencil); color: var(--pencil); font-size: var(--text-xs); font-weight: 600; }

.cards { display: grid; gap: var(--s-4); }
.cards.four { grid-template-columns: repeat(4, minmax(0, 1fr)); }
.cards.three { grid-template-columns: repeat(3, minmax(0, 1fr)); }
.cards .panel { display: grid; gap: var(--s-2); align-content: start; }
.team-card { display: grid; gap: var(--s-2); align-content: start; padding-left: var(--s-4); border-left: 2px solid var(--accent); }

.model-note { display: flex; gap: var(--s-3); align-items: flex-start; border-style: dashed; border-color: var(--line-strong); }
.model-note.live { border-style: solid; }
.model-note h3 { margin: 0 0 var(--s-1); font-size: var(--text-md); }
.model-note p { margin: 0; color: var(--muted); max-width: 80ch; }
.model-note .status-dot { margin-top: 6px; }
.model-note.live .status-dot { background: var(--good); border-color: var(--good); }

.final-card { display: flex; gap: var(--s-5); align-items: center; justify-content: space-between; flex-wrap: wrap; padding: var(--s-6); }
.final-card h2 { font-size: var(--text-xl); margin-bottom: var(--s-1); }
.final-card p { margin: 0; max-width: 60ch; }

.lp-foot { display: flex; justify-content: space-between; gap: var(--s-2) var(--s-4); flex-wrap: wrap; padding-block: var(--s-5) var(--s-6); border-top: 1px solid var(--line); }

@media (max-width: 1000px) {
  .hero { grid-template-columns: minmax(0, 1fr); gap: var(--s-6); padding-top: var(--s-5); }
  .hero-copy { padding-top: 0; }
  .steps { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .cards.four { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}
@media (max-width: 720px) {
  .lp-top, main > section, .lp-foot { padding-inline: var(--s-4); }
  .lp-top { padding-block: var(--s-3); }
  .lp-nav .btn.ghost { padding-inline: 10px; }
  .hero { padding-block: var(--s-4) var(--s-6); }
  .cta .btn { flex: 1 1 auto; }
  .preview { padding: var(--s-3); }
  .band { padding-block: var(--s-6); }
  .steps, .cards.four, .cards.three { grid-template-columns: minmax(0, 1fr); }
  .steps li { grid-template-columns: 92px minmax(0, 1fr); column-gap: var(--s-4); }
  .step-art { grid-row: span 2; align-self: center; }
  .final-card { padding: var(--s-5); }
  .final-card .btn { width: 100%; }
}
@media (max-width: 380px) {
  .lp-nav .btn.primary { padding-inline: 10px; }
}
</style>
