<script setup lang="ts">
// Status pill. Tones carry meaning (see app/DESIGN.md): pencil = proposed, accent = canon/ink, bad = conflict, warn = change or caution, good = verified.
withDefaults(defineProps<{ tone?: 'neutral' | 'pencil' | 'accent' | 'good' | 'warn' | 'bad', dot?: boolean }>(), { tone: 'neutral' })
</script>

<template>
  <span class="chip" :class="[tone, { dot }]"><slot /></span>
</template>
