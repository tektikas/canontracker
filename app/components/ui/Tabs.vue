<script setup lang="ts" generic="T extends string">
defineProps<{ items: { value: T, label: string, count?: number }[] }>()
const model = defineModel<T>({ required: true })
// Tabs scroll sideways on narrow screens instead of wrapping; a fade on the right says there are more.
const list = ref<HTMLElement>()
const more = ref(false)
const check = () => {
  const el = list.value
  more.value = !!el && el.scrollLeft + el.clientWidth < el.scrollWidth - 2
}
let ro: ResizeObserver | undefined
onMounted(() => {
  check()
  ro = new ResizeObserver(check)
  ro.observe(list.value!)
})
onBeforeUnmount(() => ro?.disconnect())
</script>

<template>
  <div class="tabs-wrap" :class="{ more }">
    <div ref="list" class="tabs" role="tablist" @scroll.passive="check">
      <button
        v-for="t in items" :key="t.value" type="button" role="tab"
        :aria-selected="model === t.value" @click="model = t.value"
      >
        {{ t.label }}<span v-if="t.count != null" class="tab-count">{{ t.count }}</span>
      </button>
    </div>
  </div>
</template>
