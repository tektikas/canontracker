<script setup lang="ts">
// Add a fact or a note from words selected in a source. The quote is the selection exactly as it stands in the passage;
// the server checks it is verbatim before anything is stored. Opens as a modal <dialog> (focus trap and Esc for free).
export interface TextSelection {
  doc: { id: string, title: string }
  passage: { id: string, start_line: number, end_line: number }
  quote: string
}
const props = defineProps<{ selection: TextSelection, mode: 'fact' | 'note' }>()
const emit = defineEmits<{ close: [], saved: [kind: 'fact' | 'note', result: Record<string, any>] }>()

const dialog = ref<HTMLDialogElement>()
onMounted(() => dialog.value?.showModal())

const KINDS = ['character', 'location', 'relationship', 'event', 'rule', 'claim']
const { data: entities } = useEntityList()
const lookup = useEntityLookup()
// Start from the first known name in the selection, so the common case is one less field to type.
const firstName = () => {
  const re = lookup.value.pattern
  if (!re) return ''
  re.lastIndex = 0
  const m = re.exec(props.selection.quote)
  const e = m && lookup.value.byName.get(normName(m[0]))
  return e?.name ?? ''
}
const f = reactive({ subject: firstName(), predicate: '', object: '', value: '', kind: 'claim', time_from: '', time_to: '', approximate: false, statement: '', body: '' })
const kindTouched = ref(false)
const statementTouched = ref(false)
watch(() => f.predicate, (p) => { if (!kindTouched.value) f.kind = kindForPredicate(p.trim().toLowerCase().replace(/\s+/g, '_')) })
const drafted = computed(() => draftStatement(f))
watch(drafted, (s) => { if (!statementTouched.value) f.statement = s })

const pred = computed(() => f.predicate.trim().toLowerCase().replace(/\s+/g, '_'))
const hint = computed(() => PREDICATES.find(p => p.value === pred.value)?.hint ?? 'How the subject relates to the object, in a few words.')
const objectLabel = computed(() => (pred.value === 'located_at' ? 'Location' : pred.value === 'travel_time' ? 'Destination' : 'Object'))
const TIME = /^D\d+\s+\d{1,2}:\d{2}$/
const timeError = (v: string) => (v.trim() && !TIME.test(v.trim()) ? 'Use day and time, like D2 14:30.' : '')

const line = computed(() => `line ${props.selection.passage.start_line}${props.selection.passage.end_line !== props.selection.passage.start_line ? `–${props.selection.passage.end_line}` : ''}`)
const busy = ref<'' | 'canon' | 'review' | 'note'>('')
const error = ref('')

async function submit(to: 'canon' | 'review' | 'note') {
  if (busy.value) return
  error.value = ''
  busy.value = to
  try {
    if (to === 'note') {
      const note = await $fetch('/api/notes', { method: 'POST', body: { document_id: props.selection.doc.id, passage_id: props.selection.passage.id, quote: props.selection.quote, body: f.body } })
      emit('saved', 'note', note)
    } else {
      const fact = await $fetch('/api/facts', {
        method: 'POST',
        body: {
          to, document_id: props.selection.doc.id, passage_id: props.selection.passage.id, quote: props.selection.quote,
          kind: f.kind, subject: f.subject, predicate: f.predicate, object: f.object, value: f.value, statement: f.statement,
          time_from: f.time_from, time_to: f.time_to, precision: f.approximate ? 'approximate' : 'exact',
        },
      })
      emit('saved', 'fact', { ...fact, statement: f.statement, to })
    }
  } catch (e) {
    error.value = errorMessage(e)
  } finally {
    busy.value = ''
  }
}
const canSave = computed(() => (props.mode === 'note' ? !!f.body.trim()
  : !!(f.subject.trim() && f.predicate.trim() && f.statement.trim() && !timeError(f.time_from) && !timeError(f.time_to) && (pred.value !== 'travel_time' || f.value.trim()))))
</script>

<template>
  <dialog ref="dialog" class="sel-dialog" :aria-labelledby="`sel-title-${mode}`" @close="emit('close')">
    <form method="dialog" class="stack" novalidate @submit.prevent="submit(mode === 'note' ? 'note' : 'canon')">
      <header class="sel-head">
        <h2 :id="`sel-title-${mode}`">{{ mode === 'note' ? 'Add a note' : 'Add a fact' }}</h2>
        <button type="button" class="icon-btn" aria-label="Close" @click="dialog?.close()"><UiIcon name="close" :size="18" /></button>
      </header>

      <figure class="sel-quote">
        <blockquote class="quote">{{ selection.quote }}</blockquote>
        <figcaption class="small muted"><UiIcon name="file" :size="14" />{{ selection.doc.title }}, {{ line }}</figcaption>
      </figure>

      <template v-if="mode === 'note'">
        <UiField label="Note" hint="For your team: a question, a fix to make, a reference. Notes never become canon.">
          <textarea v-model="f.body" rows="4" maxlength="4000" autofocus placeholder="e.g. Check this against the harbor map" />
        </UiField>
      </template>

      <template v-else>
        <div class="triple-fields">
          <UiField label="Subject">
            <input v-model="f.subject" type="text" list="sel-entities" required maxlength="80" autofocus placeholder="Who or what">
          </UiField>
          <UiField label="Predicate" :hint="hint">
            <input v-model="f.predicate" type="text" list="sel-predicates" required maxlength="60" placeholder="e.g. located_at">
          </UiField>
          <UiField :label="objectLabel">
            <input v-model="f.object" type="text" list="sel-entities" maxlength="80" :placeholder="pred === 'located_at' ? 'Where' : 'Optional'">
          </UiField>
        </div>
        <datalist id="sel-entities"><option v-for="e in entities" :key="e.id" :value="e.name" /></datalist>
        <datalist id="sel-predicates"><option v-for="p in PREDICATES" :key="p.value" :value="p.value">{{ p.hint }}</option></datalist>

        <div class="when">
          <UiField v-if="pred === 'travel_time'" label="Minutes">
            <input v-model="f.value" type="number" min="0" inputmode="numeric" required placeholder="e.g. 40">
          </UiField>
          <template v-if="pred !== 'travel_time'">
          <UiField label="Time from" :error="timeError(f.time_from)">
            <input v-model="f.time_from" type="text" placeholder="e.g. D1 09:00" autocomplete="off">
          </UiField>
          <UiField label="Time to" :error="timeError(f.time_to)">
            <input v-model="f.time_to" type="text" placeholder="Optional" autocomplete="off">
          </UiField>
          <label class="check"><input v-model="f.approximate" type="checkbox"> Approximate</label>
          </template>
          <UiField label="Kind">
            <select v-model="f.kind" @change="kindTouched = true">
              <option v-for="k in KINDS" :key="k" :value="k">{{ k[0]!.toUpperCase() + k.slice(1) }}</option>
            </select>
          </UiField>
        </div>
        <p v-if="pred !== 'travel_time'" class="small faint pred-hint">Story time is the day and a 24-hour clock. Conflict checks compare where people are and when.</p>

        <UiField label="Statement" hint="One plain sentence. Drafted from the fields above; edit it freely.">
          <textarea v-model="f.statement" rows="2" maxlength="500" required class="statement-input" @input="statementTouched = true" />
        </UiField>
      </template>

      <p v-if="error" class="notice bad" role="alert">{{ error }}</p>

      <footer class="sel-actions">
        <template v-if="mode === 'note'">
          <UiButton type="submit" variant="primary" icon="note" :loading="busy === 'note'" :disabled="!canSave || !!busy">Add note</UiButton>
        </template>
        <template v-else>
          <UiButton type="submit" variant="primary" icon="canon" :loading="busy === 'canon'" :disabled="!canSave || !!busy">Add to canon</UiButton>
          <UiButton icon="review" :loading="busy === 'review'" :disabled="!canSave || !!busy" @click="submit('review')">Send to review</UiButton>
        </template>
        <UiButton variant="ghost" @click="dialog?.close()">Cancel</UiButton>
      </footer>
      <p v-if="mode === 'fact'" class="small faint decide">Add to canon records you as the person who decided. Send to review to let someone else decide.</p>
    </form>
  </dialog>
</template>

<style scoped>
.sel-dialog {
  width: min(640px, calc(100vw - 32px)); max-height: calc(100dvh - 32px); padding: var(--s-5); overflow-y: auto;
  border: 1px solid var(--line); border-radius: var(--r-lg); background: var(--raised); color: var(--ink); box-shadow: var(--elev-overlay);
}
.sel-dialog::backdrop { background: rgb(16 24 36 / 0.45); }
.sel-head { display: flex; justify-content: space-between; align-items: center; gap: var(--s-3); }
.sel-head h2 { margin: 0; font-size: var(--text-lg); }
.sel-quote { margin: 0; display: grid; gap: 6px; }
.sel-quote .quote { max-height: 9.6em; overflow-y: auto; white-space: pre-wrap; }
.sel-quote figcaption { display: flex; align-items: center; gap: 6px; }
.triple-fields { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: var(--s-3); align-items: start; }
.pred-hint { margin: calc(-1 * var(--s-2)) 0 0; }
.when { display: grid; grid-template-columns: repeat(auto-fit, minmax(110px, 1fr)); gap: var(--s-3); align-items: end; }
.check { display: flex; flex-direction: row; align-items: center; gap: 6px; min-height: 36px; font-weight: 400; }
.check input { width: auto; }
.statement-input { font-family: var(--font-story); font-size: var(--text-md); }
.sel-actions { display: flex; flex-wrap: wrap; gap: var(--s-2); }
.decide { margin: calc(-1 * var(--s-2)) 0 0; }
@media (max-width: 720px) {
  .sel-dialog { width: calc(100vw - 16px); max-height: calc(100dvh - 16px); padding: var(--s-4); }
  .triple-fields { grid-template-columns: 1fr; }
  .when { grid-template-columns: 1fr 1fr; }
  .sel-actions .btn { flex: 1 1 auto; }
}
</style>
