<script setup lang="ts">
import { HELP_PAGES, helpInline, type HelpSlug } from '~/help'

definePageMeta({ layout: 'marketing', key: route => route.path })
const route = useRoute()
const page = computed(() => HELP_PAGES[route.params.slug as HelpSlug])
if (!page.value) throw createError({ statusCode: 404, statusMessage: 'No such help page', fatal: true })
const p = page.value
useMarketingSeo({ title: `${p.title} · Help`, description: p.summary, path: `/help/${p.slug}` })

const mac = ref(false)
onMounted(() => { mac.value = /Mac|iPhone|iPad/.test(navigator.platform) })
// Shortcuts page: the app's own list, grouped by where each key works.
const keyGroups = computed(() => {
  const out = new Map<string, { id: ShortcutId, label: string, keys: string }[]>()
  for (const [id, s] of Object.entries(SHORTCUTS) as [ShortcutId, (typeof SHORTCUTS)[ShortcutId]][]) {
    if (!out.has(s.where)) out.set(s.where, [])
    out.get(s.where)!.push({ id, label: s.label, keys: keyLabel(id, mac.value) })
  }
  return [...out]
})

// Links inside the rendered text are plain <a href="/help/…">: route them in the app instead of reloading the page.
function follow(e: MouseEvent) {
  const a = (e.target as Element).closest?.('a')
  if (!a || e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return
  const href = a.getAttribute('href')
  if (!href?.startsWith('/help')) return
  e.preventDefault()
  navigateTo(href)
}
</script>

<template>
  <div class="help">
    <aside class="side">
      <details class="side-menu">
        <summary>All help topics<UiIcon name="down" :size="14" /></summary>
        <HelpTopics :current="p.slug" />
      </details>
      <HelpTopics :current="p.slug" class="side-desk" />
    </aside>

    <article class="doc" @click="follow">
      <NuxtLink to="/help" class="crumb">Help</NuxtLink>
      <h1>{{ p.title }}</h1>
      <p class="lead">{{ p.summary }}</p>
      <p v-if="p.where" class="where"><span>Where</span> <span v-html="helpInline(p.where)" /></p>

      <MarketingShot v-if="p.shot" :name="p.shot.name" :alt="p.shot.alt" eager sizes="(max-width: 900px) 100vw, 820px" class="shot" />

      <section v-if="p.see?.length" aria-labelledby="h-see">
        <h2 id="h-see">What you see</h2>
        <ol class="see">
          <li v-for="s in p.see" :key="s.label"><b>{{ s.label }}</b><span v-html="helpInline(s.text)" /></li>
        </ol>
      </section>

      <section v-for="(t, i) in p.tasks" :key="t.title" :aria-labelledby="`h-task-${i}`">
        <h2 :id="`h-task-${i}`">{{ t.title }}</h2>
        <ol class="steps">
          <li v-for="(s, j) in t.steps" :key="j" v-html="helpInline(s)" />
        </ol>
      </section>

      <section v-if="p.slug === 'shortcuts'" aria-labelledby="h-keys">
        <h2 id="h-keys" class="sr-only">Shortcuts</h2>
        <div v-for="[where, list] in keyGroups" :key="where" class="keys">
          <h3>{{ where }}</h3>
          <table>
            <tbody>
              <tr v-for="k in list" :key="k.id" :data-shortcut="k.id"><td><kbd>{{ k.keys }}</kbd></td><td>{{ k.label }}</td></tr>
            </tbody>
          </table>
        </div>
      </section>

      <section v-for="(s, i) in p.sections" :key="s.title" :aria-labelledby="`h-sec-${i}`">
        <h2 :id="`h-sec-${i}`">{{ s.title }}</h2>
        <p v-if="s.text" v-html="helpInline(s.text)" />
        <ul v-if="s.points?.length">
          <li v-for="(x, j) in s.points" :key="j" v-html="helpInline(x)" />
        </ul>
      </section>

      <section v-if="p.roles?.length" aria-labelledby="h-roles">
        <h2 id="h-roles">Who can do what</h2>
        <dl class="roles">
          <template v-for="r in p.roles" :key="r.role"><dt>{{ r.role }}</dt><dd v-html="helpInline(r.can)" /></template>
        </dl>
        <p class="small muted">Roles are per studio. <NuxtLink to="/help/roles">Roles and permissions</NuxtLink> has the full list.</p>
      </section>

      <section v-if="p.related.length" aria-labelledby="h-rel" class="related">
        <h2 id="h-rel">Related</h2>
        <ul>
          <li v-for="s in p.related" :key="s"><NuxtLink :to="`/help/${s}`"><b>{{ HELP_PAGES[s].title }}</b><span>{{ HELP_PAGES[s].summary }}</span></NuxtLink></li>
        </ul>
      </section>
    </article>
  </div>
</template>

<style scoped>
.help { max-width: var(--mk-max); margin: 0 auto; padding: var(--s-6) var(--mk-pad) 0; display: grid; grid-template-columns: 240px minmax(0, 1fr); gap: var(--s-7); align-items: start; }
.sr-only { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }

.side { position: sticky; top: 80px; max-height: calc(100vh - 100px); overflow-y: auto; }
.side-menu { display: none; }
.doc { min-width: 0; max-width: 820px; }
.crumb { display: inline-block; margin-bottom: var(--s-3); color: var(--muted); font-weight: 500; }
h1 { font-size: clamp(1.9rem, 1.4rem + 1.6vw, 2.6rem); line-height: 1.1; letter-spacing: -0.03em; margin-bottom: var(--s-3); }
.lead { font-size: 1.125rem; line-height: 1.6; color: var(--muted); margin: 0 0 var(--s-3); max-width: 64ch; }
.where { display: flex; flex-wrap: wrap; gap: var(--s-2); margin: 0 0 var(--s-5); color: var(--muted); }
.where > span:first-child { font-weight: 600; color: var(--ink); }
.shot { margin-bottom: var(--s-5); }
section { margin-top: var(--s-6); }
section h2 { font-size: var(--text-lg); letter-spacing: -0.01em; margin: 0 0 var(--s-3); }
section p, section li, .roles dd { line-height: 1.6; max-width: 70ch; }
.doc :deep(b.ui) { font-weight: 600; color: var(--ink); }
.doc :deep(code) { font-family: var(--font-code); font-size: 0.9em; padding: 1px 5px; border-radius: var(--r-sm); background: var(--sunken); }
.doc :deep(a) { color: var(--accent); }
.see { margin: 0; padding-left: 1.4em; display: grid; gap: var(--s-2); }
.see b { display: block; }
.see span { color: var(--muted); }
.steps { margin: 0; padding-left: 1.4em; display: grid; gap: var(--s-2); }
.steps li::marker { color: var(--accent); font-weight: 600; }
ul { padding-left: 1.2em; display: grid; gap: var(--s-1); }
.roles { display: grid; grid-template-columns: max-content minmax(0, 1fr); gap: var(--s-2) var(--s-5); margin: 0 0 var(--s-3); padding: var(--s-4); border: 1px solid var(--line); border-radius: var(--r-lg); background: var(--raised); }
.roles dt { font-weight: 600; }
.roles dd { margin: 0; color: var(--muted); }
.keys { margin-bottom: var(--s-5); }
.keys h3 { font-size: var(--text-base); margin: 0 0 var(--s-2); }
.keys table { width: 100%; border-collapse: collapse; }
.keys td { padding: 8px 0; border-bottom: 1px solid var(--line); vertical-align: top; }
.keys td:first-child { width: 140px; padding-right: var(--s-4); }
.related ul { list-style: none; padding: 0; display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: var(--s-2); }
.related a { display: grid; gap: 2px; height: 100%; padding: var(--s-3) var(--s-4); border: 1px solid var(--line); border-radius: var(--r-md); background: var(--raised); text-decoration: none; }
.related a:hover { border-color: var(--accent); }
.related a span { color: var(--muted); font-size: var(--text-sm); line-height: 1.45; }

@media (max-width: 900px) {
  .help { grid-template-columns: minmax(0, 1fr); gap: var(--s-4); padding-top: var(--s-4); }
  .side { position: static; max-height: none; overflow: visible; }
  .side-desk { display: none; }
  .side-menu { display: block; border: 1px solid var(--line); border-radius: var(--r-md); background: var(--raised); }
  .side-menu summary { display: flex; align-items: center; justify-content: space-between; min-height: 44px; padding: 0 var(--s-4); font-weight: 500; cursor: pointer; list-style: none; }
  .side-menu summary::-webkit-details-marker { display: none; }
  .side-menu[open] summary :deep(svg) { transform: rotate(180deg); }
  .side-menu > nav { padding: var(--s-2) var(--s-4) var(--s-4); }
  .related ul { grid-template-columns: minmax(0, 1fr); }
  .roles { grid-template-columns: minmax(0, 1fr); gap: 2px; }
  .roles dd + dt { margin-top: var(--s-2); }
}
</style>
