<script setup lang="ts">
// One re-review task: a scene a change may have affected, with the path, evidence and rationale from the impact manifest.
// Editors set status, assignee, due date and a comment; viewers read. A task whose change was reverted is closed.
const props = defineProps<{ task: Record<string, any>, members: { id: string, name: string }[] }>()
const emit = defineEmits<{ changed: [task: Record<string, any>] }>()
const editor = computed(() => canEdit(useMe().value))

const STATUS = [
  { value: 'open', label: 'Open', tone: 'warn' }, { value: 'in_progress', label: 'In progress', tone: 'accent' },
  { value: 'done', label: 'Done', tone: 'good' }, { value: 'wont_fix', label: 'Won’t fix', tone: 'neutral' },
] as const
const reverted = computed(() => props.task.change_status === 'reverted')
const closed = computed(() => props.task.status === 'not_needed')
const meta = computed(() => (closed.value ? { label: 'Not needed', tone: 'neutral' } : STATUS.find(s => s.value === props.task.status)!))
const today = new Date().toISOString().slice(0, 10)
const overdue = computed(() => !!props.task.due_date && props.task.due_date < today && ['open', 'in_progress'].includes(props.task.status))
const line = computed(() => (props.task.start_line ? `, line ${props.task.start_line}` : ''))
const { scene: sw } = useDocKinds()
const kinds = computed(() => props.task.path.map((_: string, n: number) => (n === 0 ? 'Changed fact' : n === props.task.path.length - 1 ? sw.value.One : 'Dependent fact')))

const busy = ref(false)
const error = ref('')
const comment = ref(props.task.comment as string)
watch(() => props.task.comment, v => { comment.value = v })
async function save(body: Record<string, unknown>) {
  busy.value = true
  error.value = ''
  try {
    emit('changed', await $fetch(`/api/tasks/${props.task.id}`, { method: 'PATCH', body }))
  } catch (e) {
    error.value = errorMessage(e)
  } finally {
    busy.value = false
  }
}
const pick = (e: Event) => (e.target as HTMLInputElement | HTMLSelectElement).value
</script>

<template>
  <article :id="`task-${task.id}`" class="task" :class="task.status">
    <div class="top">
      <UiBadge :tone="meta.tone as any" :dot="!closed && task.status !== 'done'">{{ meta.label }}</UiBadge>
      <UiBadge v-if="overdue" tone="bad">Overdue</UiBadge>
      <span v-if="task.due_date && !overdue" class="small muted">Due {{ shortDate(task.due_date) }}</span>
      <span class="small faint right">{{ task.assignee_name ? `Assigned to ${task.assignee_name}${task.assignee_former ? ' (former member)' : ''}` : 'Unassigned' }}</span>
    </div>
    <NuxtLink :to="`/documents/${task.document_id}${task.passage_id ? `#${task.passage_id}` : ''}`" class="scene">
      <UiIcon name="file" :size="14" />{{ task.document_title }} <span class="faint small">v{{ task.document_version }}{{ line }}</span>
    </NuxtLink>
    <p class="small muted from">
      From change <NuxtLink to="/changes">“{{ task.change_statement }}”</NuxtLink>
    </p>
    <p v-if="closed" class="small muted closed-note">Not needed — change reverted. Kept for the record.</p>
    <p class="small why">{{ task.rationale }}</p>
    <blockquote v-if="task.quote" class="quote">{{ task.quote }}</blockquote>
    <details class="path">
      <summary class="small muted">Path, {{ task.hop_count }} {{ task.hop_count === 1 ? 'hop' : 'hops' }}</summary>
      <ol class="small">
        <li v-for="(label, n) in task.path_labels" :key="n"><span class="faint">{{ kinds[n] }}:</span> {{ label }}</li>
      </ol>
    </details>

    <div v-if="editor && !closed" class="controls">
      <label><span class="small muted">Status</span>
        <select :value="task.status" :disabled="busy" @change="save({ status: pick($event) })">
          <option v-for="s in STATUS" :key="s.value" :value="s.value" :disabled="reverted && ['open', 'in_progress'].includes(s.value) && s.value !== task.status">{{ s.label }}</option>
        </select>
        <span v-if="reverted" class="small faint">Change reverted: can’t be reopened.</span>
      </label>
      <label><span class="small muted">Assignee</span>
        <select :value="task.assignee_id ?? ''" :disabled="busy" @change="save({ assignee_id: pick($event) })">
          <option value="">Unassigned</option>
          <option v-if="task.assignee_former" :value="task.assignee_id" disabled>{{ task.assignee_name }} (former member)</option>
          <option v-for="m in members" :key="m.id" :value="m.id">{{ m.name }}</option>
        </select>
      </label>
      <label><span class="small muted">Due date</span>
        <input type="date" :value="task.due_date ?? ''" :disabled="busy" @change="save({ due_date: pick($event) })">
      </label>
      <form class="wide comment-form" @submit.prevent="save({ comment })">
        <label><span class="small muted">Comment</span>
          <textarea v-model="comment" rows="2" maxlength="4000" placeholder="What did you find? Plain text." />
        </label>
        <div v-if="comment.trim() !== task.comment"><UiButton size="sm" type="submit" :loading="busy">Save comment</UiButton></div>
      </form>
    </div>
    <p v-else-if="task.comment" class="comment small"><span class="faint">Comment:</span> {{ task.comment }}</p>
    <p v-if="error" class="small field-error" role="alert">{{ error }}</p>
  </article>
</template>

<style scoped>
.task { display: grid; gap: var(--s-2); padding: var(--s-3) var(--s-4); border: 1px solid var(--line); border-radius: var(--r-md); background: var(--raised); min-width: 0; }
.task.open { box-shadow: inset 3px 0 0 var(--warn); }
.task.in_progress { box-shadow: inset 3px 0 0 var(--accent); }
.task.done, .task.wont_fix, .task.not_needed { background: var(--surface); }
.top { display: flex; flex-wrap: wrap; gap: var(--s-2); align-items: center; }
.right { margin-left: auto; }
.scene { display: inline-flex; align-items: center; gap: 6px; font-weight: 600; color: var(--ink); text-decoration: none; }
.scene:hover { color: var(--accent); }
.from, .why, .closed-note, .comment { margin: 0; overflow-wrap: anywhere; }
.comment { white-space: pre-wrap; }
.quote { margin: 0; padding-left: 10px; border-left: 2px solid var(--line-strong); font-family: var(--font-story); font-style: italic; font-size: var(--text-sm); color: var(--muted); }
.path summary { cursor: pointer; }
.path ol { margin: var(--s-1) 0 0; padding-left: var(--s-5); display: grid; gap: 2px; overflow-wrap: anywhere; }
.controls { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: var(--s-3); border-top: 1px solid var(--line); padding-top: var(--s-3); }
.controls label { display: grid; gap: 4px; min-width: 0; }
.wide { grid-column: 1 / -1; }
.comment-form { display: grid; gap: var(--s-2); min-width: 0; }
.closed-note { color: var(--ink); }
@media (max-width: 720px) {
  .controls { grid-template-columns: 1fr; }
  .right { margin-left: 0; flex-basis: 100%; }
}
</style>
