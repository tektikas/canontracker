<script setup lang="ts">
// Merge this page (the duplicate) into another. The server's preview is shown before anything is written.
const props = defineProps<{ entity: { id: string, name: string, kind: string } }>()
const emit = defineEmits<{ close: [] }>()
const { data: list } = useNuxtData<EntityListItem[]>('entities')

// Same kind first, then the rest, so the likely target is near the top.
const options = computed(() => (list.value ?? []).filter(e => e.id !== props.entity.id)
  .sort((a, b) => Number(b.kind === props.entity.kind) - Number(a.kind === props.entity.kind) || a.name.localeCompare(b.name)))
const into = ref('')
const target = computed(() => options.value.find(e => e.id === into.value))

type Plan = Awaited<ReturnType<typeof preview>>
const plan = ref<Plan | null>(null)
const loading = ref(false)
const busy = ref(false)
const error = ref('')
const preview = (id: string) => $fetch(`/api/entities/${props.entity.id}/merge`, { method: 'POST', body: { into: id, preview: true } }) as Promise<{
  facts: { id: string, statement: string, status: string }[], aliases_added: string[], fields_filled: string[], summary_taken: boolean, notes_added: boolean, portrait: string
}>
watch(into, async (id) => {
  plan.value = null
  error.value = ''
  if (!id) return
  loading.value = true
  try {
    plan.value = await preview(id)
  } catch (e) {
    error.value = errorMessage(e)
  } finally {
    loading.value = false
  }
})

async function merge() {
  busy.value = true
  error.value = ''
  try {
    const { id } = await $fetch(`/api/entities/${props.entity.id}/merge`, { method: 'POST', body: { into: into.value } }) as { id: string }
    await refreshEntities()
    await navigateTo({ path: `/entities/${id}`, query: { merged: props.entity.name } })
  } catch (e) {
    error.value = errorMessage(e)
    busy.value = false
  }
}
</script>

<template>
  <UiPanel :title="`Merge ${entity.name} into another page`" :description="`Use this when two pages are the same ${kindLabel(entity.kind).one.toLowerCase()}. ${entity.name}’s page goes away; its facts, names and notes move to the page you keep.`" class="merge">
    <div class="stack">
      <UiField label="Keep this page">
        <select v-model="into">
          <option value="" disabled>Choose a page…</option>
          <option v-for="e in options" :key="e.id" :value="e.id">{{ e.name }} ({{ kindLabel(e.kind).one.toLowerCase() }})</option>
        </select>
      </UiField>

      <p v-if="loading" class="small muted row"><span class="spinner" aria-hidden="true" />Checking what moves…</p>
      <div v-if="plan && target" class="plan" aria-live="polite">
        <h3>What happens</h3>
        <ul>
          <li>
            <template v-if="plan.facts.length">
              <b>{{ counted(plan.facts.length, 'fact') }}</b> (canon and candidates) will name <b>{{ target.name }}</b> instead of {{ entity.name }}. The statements and their sources don’t change.
            </template>
            <template v-else>No canon facts or candidates name {{ entity.name }}, so canon is untouched.</template>
          </li>
          <li v-if="plan.aliases_added.length"><b>{{ plan.aliases_added.join(', ') }}</b> become{{ plan.aliases_added.length === 1 ? 's an alias' : ' aliases' }} of {{ target.name }}, so mentions keep linking.</li>
          <li v-if="plan.summary_taken">{{ target.name }} has no summary yet, so it takes {{ entity.name }}’s.</li>
          <li v-if="plan.fields_filled.length">Empty fields filled in: {{ plan.fields_filled.map(k => FIELD_LABEL[k]?.label ?? k).join(', ') }}.</li>
          <li v-if="plan.notes_added">{{ entity.name }}’s {{ plan.summary_taken ? 'notes are' : 'summary and notes are' }} added to the end of {{ target.name }}’s notes.</li>
          <li v-if="plan.portrait === 'move'">{{ entity.name }}’s portrait moves over.</li>
          <li v-if="plan.portrait === 'discard'" class="warn-text">{{ target.name }} keeps its own portrait; {{ entity.name }}’s portrait is discarded.</li>
          <li>The audit log keeps a full copy of {{ entity.name }}’s page and every fact’s previous wording, so the merge can be traced and undone by hand.</li>
        </ul>
        <details v-if="plan.facts.length" class="moved">
          <summary class="small">Show the {{ counted(plan.facts.length, 'fact') }}</summary>
          <ul>
            <li v-for="f in plan.facts" :key="f.id">
              <UiBadge :tone="f.status === 'canon' ? 'accent' : 'pencil'">{{ f.status === 'canon' ? 'Canon' : 'Candidate' }}</UiBadge>
              <span class="story">{{ f.statement }}</span>
            </li>
          </ul>
        </details>
      </div>
      <p v-if="error" class="notice bad" role="alert">{{ error }}</p>
      <div class="row">
        <UiButton variant="primary" icon="merge" :disabled="!plan" :loading="busy" @click="merge">{{ target ? `Merge into ${target.name}` : 'Merge' }}</UiButton>
        <UiButton variant="ghost" @click="emit('close')">Cancel</UiButton>
      </div>
    </div>
  </UiPanel>
</template>

<style scoped>
.merge { border-color: color-mix(in srgb, var(--accent) 40%, var(--line)); }
.merge select { max-width: 360px; }
.plan { display: grid; gap: var(--s-2); padding: var(--s-3) var(--s-4); background: var(--surface); border: 1px solid var(--line); border-radius: var(--r-md); }
.plan h3 { margin: 0; font-size: var(--text-sm); }
.plan > ul { margin: 0; padding-left: 1.2em; display: grid; gap: 6px; font-size: var(--text-sm); }
.warn-text { color: var(--warn); }
.moved summary { cursor: pointer; color: var(--muted); font-weight: 500; }
.moved ul { list-style: none; margin: var(--s-2) 0 0; padding: 0; display: grid; gap: var(--s-2); }
.moved li { display: flex; gap: var(--s-2); align-items: baseline; }
.story { font-family: var(--font-story); font-size: var(--text-sm); }
</style>
