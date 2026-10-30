<script setup lang="ts" generic="T extends string">
defineProps<{ items: { value: T, label: string, count?: number }[] }>()
const model = defineModel<T>({ required: true })
</script>

<template>
  <div class="tabs" role="tablist">
    <button
      v-for="t in items" :key="t.value" type="button" role="tab"
      :aria-selected="model === t.value" @click="model = t.value"
    >
      {{ t.label }}<span v-if="t.count != null" class="tab-count">{{ t.count }}</span>
    </button>
  </div>
</template>
