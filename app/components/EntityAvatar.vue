<script setup lang="ts">
// Portrait if there is one, otherwise the kind's glyph on a quiet tile.
withDefaults(defineProps<{ entity: { name: string, kind: string, portrait?: string | null }, size?: number }>(), { size: 40 })
</script>

<template>
  <span class="avatar" :class="`k-${entity.kind}`" :style="{ width: `${size}px`, height: `${size}px` }">
    <img v-if="entity.portrait" :src="entity.portrait" alt="" loading="lazy">
    <UiIcon v-else :name="(ENTITY_KINDS.includes(entity.kind as EntityKind) ? entity.kind : 'other') as EntityKind" :size="Math.round(size * 0.48)" />
  </span>
</template>

<style scoped>
.avatar { display: inline-grid; place-items: center; flex: none; overflow: hidden; border-radius: var(--r-md); background: var(--sunken); color: var(--muted); border: 1px solid var(--line); }
.avatar img { width: 100%; height: 100%; object-fit: cover; display: block; }
.k-character { background: var(--accent-soft); color: var(--accent); border-color: color-mix(in srgb, var(--accent) 18%, transparent); }
</style>
