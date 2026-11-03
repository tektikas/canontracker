<template>
  <!-- Quotes and statements from the bundled Sherlock Holmes gold set (W1). -->
  <figure class="watson">
    <figcaption class="card-head">
      <span class="chip bad">Hard</span>
      <span>Same detail, two answers</span>
    </figcaption>
    <h2>Where was Watson wounded?</h2>
    <div class="fact">
      <p class="statement">Watson’s wound is on his shoulder.</p>
      <blockquote class="quote">There I was struck on the shoulder by a Jezail bullet, which shattered the bone and grazed the subclavian artery.</blockquote>
      <p class="source"><span class="chip good">Verbatim match</span><cite>A Study in Scarlet</cite> · Part I, Chapter 1</p>
    </div>
    <div class="fact">
      <p class="statement">Watson’s wound is in his leg.</p>
      <blockquote class="quote">I made no remark, however, but sat nursing my wounded leg.</blockquote>
      <p class="source"><span class="chip good">Verbatim match</span><cite>The Sign of the Four</cite> · Chapter 1</p>
    </div>
    <p class="card-foot">One character. One old wound. Both sources, side by side.</p>
  </figure>
</template>

<style scoped>
.watson { margin: 0; padding: var(--s-5); background: var(--raised); border: 1px solid var(--line-strong); border-top: 3px solid var(--bad); border-radius: var(--r-lg); }
.card-head { display: flex; align-items: center; flex-wrap: wrap; gap: var(--s-2); color: var(--bad); font-size: var(--text-sm); font-weight: 600; }
.watson h2 { margin: var(--s-3) 0 var(--s-4); font-size: clamp(1.25rem, 1rem + .5vw, 1.5rem); }
.fact + .fact { margin-top: var(--s-4); padding-top: var(--s-4); border-top: 1px solid var(--line); }
.statement { margin-bottom: var(--s-2); }
.quote { font-size: var(--text-base); border-left-color: var(--bad); }
.source { display: flex; flex-wrap: wrap; align-items: baseline; gap: 4px 6px; margin: var(--s-2) 0 0; color: var(--muted); font-size: var(--text-xs); }
.source cite { font-style: normal; }
.card-foot { margin: var(--s-4) 0 0; color: var(--faint); font-size: var(--text-sm); }
@media (max-width: 720px) { .watson { padding: var(--s-4); } }
</style>
