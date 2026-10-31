<script setup lang="ts">
// One canon fact in a story bible: number, labels, statement and every verified citation (document, version, lines, quote).
// Data only, no app links, so it renders the same on a public share page and in print.
defineProps<{ fact: BibleFact }>()
</script>

<template>
  <article :id="fact.n" class="bfact">
    <div class="bfact-head">
      <span class="num mono">{{ fact.n }}</span>
      <UiBadge tone="accent">{{ fact.kind }}</UiBadge>
      <UiBadge v-if="fact.time_label" :tone="fact.approximate ? 'warn' : 'neutral'" :title="fact.approximate ? 'Approximate time' : undefined">{{ fact.time_label }}</UiBadge>
      <UiBadge v-if="fact.version > 1">v{{ fact.version }}</UiBadge>
      <UiBadge v-if="fact.sample" tone="pencil" title="Came with a sample project. Its quote is verified, but no person decided it.">Sample canon (preloaded)</UiBadge>
    </div>
    <p class="statement">{{ fact.statement }}</p>
    <figure v-for="(c, i) in fact.citations" :key="i" class="cite">
      <blockquote class="quote" :class="{ prior: c.prior_source }">{{ c.quote }}</blockquote>
      <figcaption class="small">
        <UiIcon name="file" :size="13" />
        <span class="doc">{{ c.document }}</span>
        <span class="faint">{{ [c.folder, c.file].filter(Boolean).join(' / ') }} · v{{ c.version }}<template v-if="lineLabel(c)">, {{ lineLabel(c) }}</template></span>
        <UiBadge v-if="c.prior_source" tone="pencil">Prior source, wording changed</UiBadge>
        <UiBadge v-if="c.latest_version > c.version" tone="warn" :title="`Cites v${c.version}; the source now has v${c.latest_version}.`">Stale: source now v{{ c.latest_version }}</UiBadge>
      </figcaption>
    </figure>
  </article>
</template>

<style scoped>
.bfact { display: grid; gap: var(--s-2); padding: var(--s-4) 0; border-top: 1px solid var(--line); break-inside: avoid; scroll-margin-top: var(--s-6); }
.bfact-head { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; }
.num { min-width: 2.4em; color: var(--faint); font-size: var(--text-xs); font-weight: 500; }
.statement { margin: 0; font-family: var(--font-story); font-size: var(--text-md); line-height: 1.55; color: var(--ink); max-width: 68ch; }
.cite { margin: 0; display: grid; gap: 4px; max-width: 68ch; }
.cite figcaption { display: flex; flex-wrap: wrap; gap: 4px 8px; align-items: center; color: var(--muted); }
.cite figcaption svg { color: var(--faint); }
.doc { font-weight: 500; color: var(--ink); overflow-wrap: anywhere; }
.faint { overflow-wrap: anywhere; }
</style>
