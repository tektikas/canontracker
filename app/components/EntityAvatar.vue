<script setup lang="ts">
import type { IconName } from '~/components/ui/Icon.vue'

// Portrait if there is one, otherwise the type's icon on a tile in the type's colour. `type` is passed where the project's
// types aren't loaded (the bible on a share page); elsewhere it comes from the shared list.
const props = withDefaults(defineProps<{ entity: { name: string, kind: string, portrait?: string | null }, type?: EntityType, size?: number }>(), { size: 40, type: undefined })
const kindOf = useKind()
const t = computed(() => props.type ?? kindOf(props.entity.kind))
</script>

<template>
  <span class="avatar" :class="`kt-${t.color}`" :style="{ width: `${size}px`, height: `${size}px` }">
    <img v-if="entity.portrait" :src="entity.portrait" alt="" loading="lazy">
    <UiIcon v-else :name="t.icon as IconName" :size="Math.round(size * 0.48)" />
  </span>
</template>

<style scoped>
.avatar { display: inline-grid; place-items: center; flex: none; overflow: hidden; border-radius: var(--r-md); background: var(--tone-soft, var(--sunken)); color: var(--tone, var(--muted)); border: 1px solid color-mix(in srgb, var(--tone, var(--line)) 18%, transparent); }
.avatar img { width: 100%; height: 100%; object-fit: cover; display: block; }
</style>
