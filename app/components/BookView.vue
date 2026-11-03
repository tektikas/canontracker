<script setup lang="ts">
// A story bible or manuscript laid out as a book for print (browser "Save as PDF"): cover, title page, contents with page numbers,
// one chapter per start-of-page, citations as numbered notes closing each chapter, running header and page numbers in the margins.
// Data only (the Book model), no app links or app requests. Print is always the light set.
const props = defineProps<{ book: Book }>()
const b = computed(() => props.book)
const cssString = (s: string) => `"${s.replace(/[\\"]/g, '\\$&').replace(/\s+/g, ' ')}"`
// Named pages give each chapter its own running header (Chromium has no string-set), so the rules are generated per chapter.
const margins = `font: 9pt "Instrument Sans", Arial, sans-serif; color: #675d50;`
const pages = computed(() => [
  `@page cover, front { @top-left { content: none; } @top-right { content: none; } @bottom-center { content: none; } }`,
  // flow (manuscript): chapters share one page style, so a short chapter follows the last one on the same page; the running header is the book title.
  ...(b.value.flow ? [`@page body { size: A4; margin: 22mm 20mm 20mm; @top-left { content: ${cssString(b.value.title)}; ${margins} } @top-right { content: none; } @bottom-center { content: counter(page); ${margins} } }`] : b.value.chapters.map((c, i) => `@page ch${i} { size: A4; margin: 22mm 20mm 20mm; @top-left { content: ${cssString(b.value.title)}; ${margins} } @top-right { content: ${cssString(emphasisPlain(c.title))}; ${margins} } @bottom-center { content: counter(page); ${margins} } }`)),
].join('\n'))
useHead(() => ({ style: [{ key: 'book-pages', innerHTML: pages.value }] }))
const portrait = (s: BookSection) => (s.portrait ? s.portrait : null)
</script>

<template>
  <div class="book">
    <section class="cover" :class="{ art: book.cover }">
      <img v-if="book.cover" :src="book.cover" alt="" class="cover-art">
      <div class="cover-text">
        <p class="kicker">{{ book.kicker }}</p>
        <h1>{{ book.title }}</h1>
        <p class="studio">{{ book.studio }}</p>
      </div>
    </section>

    <section class="titlepage">
      <p class="kicker">{{ book.kicker }}</p>
      <h1>{{ book.title }}</h1>
      <p class="studio">{{ book.studio }}</p>
      <p class="line">{{ book.line }}</p>
    </section>

    <nav class="toc" aria-label="Contents">
      <h2>Contents</h2>
      <ol>
        <li v-for="c in book.chapters" :key="c.id"><a :href="`#ch-${c.id}`"><span class="t"><EmText :text="c.title" /></span></a></li>
      </ol>
    </nav>

    <section v-for="(c, i) in book.chapters" :id="`ch-${c.id}`" :key="c.id" class="chapter" :class="{ flow: book.flow }" :style="{ page: book.flow ? 'body' : `ch${i}` }">
      <h2><EmText :text="c.title" /></h2>
      <p v-if="c.intro" class="intro">{{ c.intro }}</p>
      <article v-for="s in c.sections" :id="s.id" :key="s.id" class="sec">
        <img v-if="portrait(s)" :src="portrait(s)!" alt="" class="portrait">
        <h3 v-if="s.title">{{ s.title }}</h3>
        <p v-if="s.sub" class="sub">{{ s.sub }}</p>
        <template v-for="(p, j) in s.paras" :key="j">
          <h4 v-if="p.kind === 'h'"><EmText :text="p.text" /></h4>
          <p v-else :class="p.kind"><EmText :text="p.text" /></p>
        </template>
        <p v-for="f in s.facts" :id="f.n" :key="f.n" class="fact">
          <span class="n">{{ f.n }}</span><span v-if="f.label" class="lab" :class="{ approx: f.approx }">{{ f.label }}</span>{{ f.statement }}<em v-if="f.sample" class="sample"> (sample canon)</em><sup v-for="k in f.notes" :key="k" class="ref"><a :href="`#fn-${c.id}-${k}`">{{ k }}</a></sup>
        </p>
      </article>
      <ol v-if="c.notes.length" class="notes" aria-label="Notes">
        <li v-for="n in c.notes" :id="`fn-${c.id}-${n.n}`" :key="n.n" :value="n.n">{{ n.text }}</li>
      </ol>
    </section>
  </div>
</template>

<style scoped>
.book { max-width: 760px; margin: 0 auto; font-family: var(--font-story); line-height: 1.6; }
.kicker { margin: 0 0 var(--s-2); color: var(--accent); font-family: var(--font-ui, inherit); font-size: var(--text-sm); font-weight: 600; letter-spacing: .08em; text-transform: uppercase; }
.studio { color: var(--muted); font-size: var(--text-md); margin: 0; }
h1 { font-size: 2.6rem; line-height: 1.15; margin: 0 0 var(--s-3); overflow-wrap: anywhere; }
.cover { position: relative; aspect-ratio: 210 / 297; width: min(100%, 70vh); margin-inline: auto; display: flex; align-items: flex-end; padding: var(--s-7) var(--s-6); border: 1px solid var(--line-strong); margin-bottom: var(--s-7); overflow: hidden; }
.cover-art { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; }
.cover-text { position: relative; width: 100%; }
.cover.art .cover-text { padding: var(--s-5); background: rgb(253 251 247 / .88); color: #2a241d; }
.cover.art .studio, .cover.art .kicker { color: #524b42; }
.titlepage { padding: var(--s-7) 0; text-align: center; margin-bottom: var(--s-7); border-bottom: 1px solid var(--line); }
.line { color: var(--muted); font-size: var(--text-sm); }
.toc { margin-bottom: var(--s-7); }
.toc h2 { font-size: var(--text-xl); margin-bottom: var(--s-3); }
.toc ol { list-style: none; margin: 0; padding: 0; counter-reset: toc; }
.toc li { counter-increment: toc; padding: 4px 0; border-bottom: 1px dotted var(--line-strong); }
.toc a { display: flex; gap: var(--s-3); color: inherit; text-decoration: none; }
.toc a::before { content: counter(toc); width: 1.6em; color: var(--faint); font-variant-numeric: tabular-nums; }
.toc .t { flex: 1; }
.toc a::after { content: target-counter(attr(href url), page); font-variant-numeric: tabular-nums; }
.chapter { margin-bottom: var(--s-7); scroll-margin-top: var(--s-5); }
.chapter > h2 { font-size: 2rem; margin: 0 0 var(--s-3); padding-bottom: var(--s-2); border-bottom: 2px solid var(--ink); break-after: avoid; }
.intro { color: var(--muted); font-size: var(--text-sm); }
.sec { margin: var(--s-5) 0; }
.sec::after { content: ""; display: block; clear: both; }
.sec h3 { font-size: var(--text-xl); margin: 0 0 2px; break-after: avoid; }
.sec h4 { font-size: var(--text-md); margin: var(--s-3) 0 var(--s-1); break-after: avoid; }
.sec p { margin: 0 0 var(--s-2); white-space: pre-line; }
.sub, .small { color: var(--muted); font-size: var(--text-sm); }
.ed { color: var(--pencil); font-size: var(--text-xs); font-weight: 600; text-transform: uppercase; letter-spacing: .05em; margin-top: var(--s-2); }
.portrait { float: right; width: 34mm; max-width: 30%; margin: 0 0 var(--s-2) var(--s-4); border-radius: var(--r-md); break-inside: avoid; }
.fact { break-inside: avoid; white-space: normal !important; }
.n { display: inline-block; min-width: 2.4em; margin-right: var(--s-1); color: var(--faint); font-family: var(--font-mono, monospace); font-size: var(--text-xs); }
.lab { margin-right: var(--s-2); font-family: var(--font-ui, inherit); font-size: var(--text-xs); font-weight: 600; color: var(--muted); }
.lab.approx { color: var(--warn); }
.sample { color: var(--pencil); font-size: var(--text-sm); }
.ref a { color: var(--accent); text-decoration: none; padding: 0 1px; }
.notes { margin: var(--s-6) 0 0; padding: var(--s-3) 0 0 1.6em; border-top: 1px solid var(--line-strong); font-size: var(--text-sm); color: var(--muted); }
.notes li { margin-bottom: 4px; break-inside: avoid; overflow-wrap: anywhere; }
@media (max-width: 720px) {
  h1 { font-size: var(--text-2xl); }
  .cover { padding: var(--s-5) var(--s-4); }
}
</style>

<style>
/* Page setup for the book. Light colours on paper whatever the screen theme. */
@page cover { size: A4; margin: 0; }
@page front { size: A4; margin: 24mm 22mm; }
@media print {
  .book { max-width: none; font-size: 11pt; color: #2a241d; }
  .book .cover { page: cover; height: 296mm; width: auto; aspect-ratio: auto; min-height: 0; margin: 0; padding: 0 0 24mm; border: 0; break-after: page; align-items: flex-end; }
  .book .cover.art .cover-text { margin: 0 18mm; width: auto; }
  .book .cover:not(.art) { padding: 0 22mm 40mm; background: #f4efe6; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .book .cover-art { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .book .titlepage { page: front; height: 240mm; display: flex; flex-direction: column; justify-content: center; margin: 0; border: 0; break-after: page; }
  .book .toc { page: front; break-after: page; margin: 0; }
  .book .chapter { break-before: page; margin: 0 !important; }
  .book .chapter:first-of-type, .book .chapter.flow { break-before: auto; }
  .book .chapter.flow:not(:first-of-type) { margin-top: 12mm !important; }
  .book .sec { margin: 6mm 0; }
  .book a { color: inherit; }
  .book .ref a { color: inherit; }
}
</style>
