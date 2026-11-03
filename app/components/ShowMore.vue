<script setup lang="ts">
// The button under a capped list: how many more come with one click, and how many are left in all.
defineProps<{ rest: number, step: number, noun?: string }>()
defineEmits<{ more: [] }>()
</script>

<template>
  <button v-if="rest > 0" type="button" class="show-more" @click="$emit('more')">
    Show {{ Math.min(step, rest) }} more{{ noun ? ` ${noun}` : '' }} <span class="faint">· {{ rest }} not shown</span>
  </button>
</template>

<style scoped>
.show-more { justify-self: start; margin-top: var(--s-3); padding: 8px 14px; border: 1px solid var(--line); border-radius: var(--r-md); background: var(--raised); color: var(--ink); font: 500 var(--text-sm) var(--font-ui); cursor: pointer; }
.show-more:hover { border-color: var(--line-strong); }
.show-more:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
</style>
