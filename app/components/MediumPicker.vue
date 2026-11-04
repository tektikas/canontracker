<script setup lang="ts">
// What a new project is: prose, screen or game (MEDIA). Nothing is picked until the person picks: the medium decides the
// entity wiki's fields and types and what a story document is called (Chapter or Scene), so it is asked, never assumed.
const medium = defineModel<string>({ default: '' })
const ORDER = ['prose', 'screen', 'game'] as const
</script>

<template>
  <div class="group" role="radiogroup" aria-label="Medium">
    <span class="label">Medium</span>
    <div class="chips">
      <label v-for="key in ORDER" :key="key" class="pick" :class="{ on: medium === key }">
        <input v-model="medium" type="radio" name="medium" :value="key">{{ MEDIA[key].label }}
      </label>
    </div>
    <span class="small faint">Sets the wiki’s fields and whether a story document is a chapter or a scene. You can change it in Settings.</span>
  </div>
</template>

<style scoped>
.group { display: grid; gap: var(--s-2); }
.label { font-weight: 500; font-size: var(--text-sm); }
.chips { display: flex; flex-wrap: wrap; gap: 6px; }
.pick { position: relative; display: inline-flex; align-items: center; min-height: 36px; padding: 0 12px; border: 1px dashed var(--line-strong); border-radius: var(--r-md); background: var(--canvas); font-size: var(--text-sm); color: var(--muted); cursor: pointer; }
.pick input { position: absolute; opacity: 0; inset: 0; margin: 0; cursor: pointer; }
.pick:hover { color: var(--ink); }
.pick.on { border-style: solid; border-color: var(--accent); background: var(--accent-soft); color: var(--accent); font-weight: 600; }
.pick:has(input:focus-visible) { outline: 2px solid var(--accent); outline-offset: 2px; }
@media (max-width: 720px) { .pick { min-height: 44px; } }
</style>
