<script setup lang="ts">
// Bordered surface for one block of content. `flush` removes padding for tables and lists that run edge to edge.
defineProps<{ title?: string, description?: string, flush?: boolean, sunk?: boolean, as?: string }>()
</script>

<template>
  <component :is="as ?? 'section'" class="panel" :class="{ flush, sunk }">
    <header v-if="title || $slots.actions" class="panel-head">
      <div>
        <h2 v-if="title">{{ title }}</h2>
        <p v-if="description">{{ description }}</p>
      </div>
      <div v-if="$slots.actions" class="row"><slot name="actions" /></div>
    </header>
    <slot />
  </component>
</template>
