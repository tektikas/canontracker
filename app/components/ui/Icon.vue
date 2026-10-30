<script lang="ts">
// Inline stroke icons (24px grid, Lucide-style geometry). Add a path here rather than pulling an icon font.
const ICONS = {
  home: ['M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z'],
  review: ['M16.5 3.5a2.1 2.1 0 0 1 3 3L8 18l-4 1 1-4z', 'M14.5 5.5l3 3'],
  canon: ['M4 19.5V5.5A2.5 2.5 0 0 1 6.5 3H20v18H6.5A2.5 2.5 0 0 1 4 18.5', 'M4 18.5A2.5 2.5 0 0 1 6.5 16H20', 'M9 7h6'],
  conflicts: ['M10.3 3.9 2.4 18a2 2 0 0 0 1.7 3h15.8a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z', 'M12 9v4', 'M12 17h.01'],
  changes: ['M6 3v12', 'M3 18a3 3 0 1 0 6 0a3 3 0 1 0-6 0', 'M15 6a3 3 0 1 0 6 0a3 3 0 1 0-6 0', 'M18 9a9 9 0 0 1-9 9'],
  ask: ['M21 12a8.5 8.5 0 0 1-12.6 7.4L3 21l1.6-5.4A8.5 8.5 0 1 1 21 12z', 'M9.6 9.5a2.5 2.5 0 0 1 4.8.8c0 1.7-2.4 2.2-2.4 3.2', 'M12 16.5h.01'],
  metrics: ['M3 21h18', 'M6 17v-5', 'M11 17V6', 'M16 17v-8', 'M21 17v-3'],
  audit: ['M9 6h11', 'M9 12h11', 'M9 18h11', 'M4 6h.01', 'M4 12h.01', 'M4 18h.01'],
  upload: ['M12 15V3', 'M7 8l5-5 5 5', 'M4 15v4a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-4'],
  demo: ['M12 3 2 8l10 5 10-5z', 'M2 13l10 5 10-5'],
  file: ['M14 3H6a1 1 0 0 0-1 1v16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8z', 'M14 3v5h5'],
  menu: ['M4 6h16', 'M4 12h16', 'M4 18h16'],
  close: ['M6 6l12 12', 'M18 6 6 18'],
  check: ['M5 12.5l4.5 4.5L19 7'],
  arrow: ['M5 12h14', 'M13 6l6 6-6 6'],
} as const

export type IconName = keyof typeof ICONS
</script>

<script setup lang="ts">
const props = withDefaults(defineProps<{ name: IconName, size?: number, label?: string }>(), { size: 18 })
</script>

<template>
  <svg
    :width="props.size" :height="props.size" viewBox="0 0 24 24" fill="none" stroke="currentColor"
    stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" style="flex: none"
    :role="props.label ? 'img' : undefined" :aria-label="props.label" :aria-hidden="props.label ? undefined : 'true'"
  >
    <path v-for="d in ICONS[props.name]" :key="d" :d="d" />
  </svg>
</template>
