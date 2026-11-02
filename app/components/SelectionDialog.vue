<script setup lang="ts">
// Add a fact, an entity page or a note from words selected in a source. For facts and notes the quote is the selection exactly
// as it stands in the passage; the server checks it is verbatim before anything is stored. Opens as a modal <dialog> (focus trap
// and Esc for free).
export interface TextSelection {
  doc: { id: string, title: string }
  passage: { id: string, start_line: number, end_line: number }
  quote: string
}
export type SelectionMode = 'fact' | 'entity' | 'note'
const props = defineProps<{ selection: TextSelection, mode: SelectionMode }>()
const emit = defineEmits<{ close: [], saved: [kind: 'fact' | 'note', result: Record<string, any>] }>()

const dialog = ref<HTMLDialogElement>()
onMounted(() => dialog.value?.showModal())

const { data: entities } = useEntityList()
const lookup = useEntityLookup()
const oneLine = (s: string) => s.replace(/\s+/g, ' ').trim()
const f = reactive({
  statement: oneLine(props.selection.quote), subject: '', relation: '', object: '', value: '', time_from: '', time_to: '', approximate: false,
  body: '', name: oneLine(props.selection.quote).replace(/^[\p{P}\s]+|[\p{P}\s]+$/gu, '').slice(0, 80), kind: 'character' as EntityKind,
})

// Sentence first: the writer says what the passage establishes, and who / does what / where / when are read from that sentence
// as it is edited (known names, a known place, story times; see `suggestParts`). A part the writer has typed in keeps their words.
const PARTS = ['subject', 'relation', 'object', 'time_from', 'time_to'] as const
type Part = typeof PARTS[number]
const typed = reactive(new Set<Part>())
const suggested = computed<Record<Part, string>>(() => {
  const re = lookup.value.pattern
  const known = re ? [...f.statement.matchAll(re)].map(m => ({ name: m[0], kind: lookup.value.byName.get(normName(m[0]))?.kind })) : []
  return suggestParts(f.statement, known)
})
watch(suggested, (s) => { for (const k of PARTS) if (!typed.has(k)) f[k] = s[k] }, { immediate: true })
// A guess never becomes canon unseen: structured parts drive conflict checks, so a wrong guess is a false conflict.
const guessed = computed(() => PARTS.some(k => !typed.has(k) && !!f[k].trim()))
const checkFirst = ref(false)

// Who a fact is about changes only by an explicit choice: picking a page from the list (its exact title) links it, and the
// server stores the name analysis knows that page by. Typed names stay as typed; a title or alias of a page is only offered.
type Role = 'subject' | 'object'
const ROLES = ['subject', 'object'] as const
const link = reactive<Record<Role, EntityListItem | null>>({ subject: null, object: null })
for (const role of ROLES) {
  watch([() => f[role], entities], ([v]) => {
    if (link[role] && normName(link[role]!.name) === normName(v)) return
    link[role] = entities.value?.find(e => normName(e.name) === normName(v)) ?? null
  }, { immediate: true })
}
function pick(role: Role, e: EntityListItem) {
  f[role] = e.name
  typed.add(role)
  link[role] = e
}
// A typed name that is a page's title or alias but isn't linked. The analysis name (and merged names) link on the server.
const suggestion = (role: Role) => {
  const n = normName(f[role])
  if (link[role] || !n) return null
  return entities.value?.find(e => normName(e.analysis_name) !== n && [e.name, ...e.aliases].some(x => normName(x) === n)) ?? null
}

// The stored predicate: plain words map to the relations checks read ("is at" -> located_at); other words are kept as typed.
// With no relation given the fact is a plain statement about its subject.
const pred = computed(() => relationFor(f.relation) || 'about')
const known = computed(() => PREDICATES.find(p => p.value === pred.value))
const timeError = (v: string) => (v.trim() && !storyTime(v) ? 'Use a day and a time, like Day 2 14:30.' : '')
const detailError = computed(() => !f.subject.trim() ? 'Say who or what this is about.'
  : pred.value === 'is' && !f.object.trim() ? 'Say what they are, for example “keeper of the lighthouse”.'
    : pred.value === 'travel_time' && !f.value.trim() ? 'Say how many minutes the trip takes.'
      : timeError(f.time_from) || timeError(f.time_to))
// Conflict checks need who, where and when. Say so only for the facts they read.
const checkNote = computed(() => {
  if (pred.value === 'located_at') return f.object.trim() && f.time_from.trim() ? known.value!.hint : 'Add where and when, so this is checked for being in two places at once.'
  if (known.value) return known.value.hint
  if (f.object.trim() && f.time_from.trim()) return 'If this says where they are, use “is at”, so it is checked for being in two places at once.'
  return ''
})
const summary = computed(() => [f.subject, f.relation, f.object, [f.time_from, f.time_to].filter(Boolean).join(' – ')].map(s => s.trim()).filter(Boolean).join(' · '))
const more = ref(false)
const subjectInput = ref<HTMLInputElement>()

const existing = computed(() => lookup.value.byName.get(normName(f.name)))
const line = computed(() => `line ${props.selection.passage.start_line}${props.selection.passage.end_line !== props.selection.passage.start_line ? `–${props.selection.passage.end_line}` : ''}`)
const busy = ref<'' | 'canon' | 'review' | 'note' | 'entity'>('')
const error = ref('')

async function submit(to: 'canon' | 'review' | 'note' | 'entity') {
  if (busy.value) return
  error.value = ''
  if ((to === 'canon' || to === 'review') && detailError.value) {
    more.value = true
    error.value = detailError.value
    if (!f.subject.trim()) nextTick(() => subjectInput.value?.focus())
    return
  }
  // The first Add to canon with guessed parts still folded away opens them instead; the next one adds.
  if (to === 'canon' && guessed.value && !more.value) {
    more.value = true
    checkFirst.value = true
    return
  }
  busy.value = to
  try {
    if (to === 'entity') {
      const id = existing.value?.id ?? (await $fetch('/api/entities', { method: 'POST', body: { name: f.name, kind: f.kind } })).id
      await refreshEntities()
      await navigateTo(`/entities/${id}`)
    } else if (to === 'note') {
      const note = await $fetch('/api/notes', { method: 'POST', body: { document_id: props.selection.doc.id, passage_id: props.selection.passage.id, quote: props.selection.quote, body: f.body } })
      emit('saved', 'note', note)
    } else {
      const fact = await $fetch('/api/facts', {
        method: 'POST',
        body: {
          to, document_id: props.selection.doc.id, passage_id: props.selection.passage.id, quote: props.selection.quote,
          kind: kindForPredicate(pred.value), subject: f.subject, predicate: pred.value, object: f.object, value: f.value, statement: f.statement,
          subject_entity_id: link.subject?.id, object_entity_id: link.object?.id,
          time_from: storyTime(f.time_from) ?? '', time_to: storyTime(f.time_to) ?? '', precision: f.approximate ? 'approximate' : 'exact',
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
const canSave = computed(() => (props.mode === 'note' ? !!f.body.trim() : props.mode === 'entity' ? !!f.name.trim() : !!f.statement.trim()))
const TITLE = { fact: 'Add a fact', entity: 'Add an entity', note: 'Add a note' }
</script>

<template>
  <dialog ref="dialog" class="sel-dialog" :aria-labelledby="`sel-title-${mode}`" @close="emit('close')">
    <form method="dialog" class="stack" novalidate @submit.prevent="submit(mode === 'fact' ? 'canon' : mode)">
      <header class="sel-head">
        <h2 :id="`sel-title-${mode}`">{{ TITLE[mode] }}</h2>
        <button type="button" class="icon-btn" aria-label="Close" @click="dialog?.close()"><UiIcon name="close" :size="18" /></button>
      </header>

      <figure v-if="mode !== 'entity'" class="sel-quote">
        <blockquote class="quote">{{ selection.quote }}</blockquote>
        <figcaption class="small muted"><UiIcon name="file" :size="14" />{{ selection.doc.title }}, {{ line }}</figcaption>
      </figure>

      <template v-if="mode === 'note'">
        <UiField label="Note" hint="For your team: a question, a fix to make, a reference. Notes never become canon.">
          <textarea v-model="f.body" rows="4" maxlength="4000" autofocus placeholder="e.g. Check this against the harbor map" />
        </UiField>
      </template>

      <template v-else-if="mode === 'entity'">
        <!-- An existing page keeps its kind; the form only offers to open it. -->
        <div class="entity-fields" :class="{ found: existing }">
          <UiField label="Name">
            <input v-model="f.name" type="text" required maxlength="80" autofocus spellcheck="false" autocomplete="off">
          </UiField>
          <UiField v-if="!existing" label="Kind">
            <select v-model="f.kind">
              <option v-for="k in ENTITY_KINDS" :key="k" :value="k">{{ KIND_LABEL[k].one }}</option>
            </select>
          </UiField>
        </div>
        <p v-if="existing" class="notice info"><UiIcon name="entities" :size="16" />There is already a page for {{ existing.name }}.</p>
        <p v-else class="small faint">Opens a wiki page for it. Pages are notes for your team; they never become canon on their own.</p>
      </template>

      <template v-else>
        <UiField label="What does this passage establish?" hint="One plain sentence. It starts as the words you selected; edit it freely.">
          <textarea v-model="f.statement" rows="2" maxlength="500" required autofocus class="statement-input" />
        </UiField>

        <details class="parts" :open="more" @toggle="more = ($event.target as HTMLDetailsElement).open">
          <summary class="expand">
            <span class="parts-title">Who, where and when</span>
            <span v-if="!more" class="parts-sum small" :class="{ missing: !f.subject.trim() }">{{ !f.subject.trim() ? 'Say who it is about' : summary }}</span>
          </summary>
          <div class="parts-body stack">
            <p v-if="checkFirst" class="notice warn" role="status"><UiIcon name="conflicts" :size="16" /><span>Check these before adding to canon. They were read from your sentence.</span></p>
            <!-- Fields first, then their link states, so Tab goes who → does what → where; the grid puts each state under its field. -->
            <div class="triple-fields">
              <UiField label="Who or what" class="tf-s">
                <input ref="subjectInput" v-model="f.subject" type="text" list="sel-entities" maxlength="80" spellcheck="false" autocomplete="off" placeholder="e.g. Ines" @input="typed.add('subject')">
              </UiField>
              <UiField label="Does what / is what" class="tf-p">
                <input v-model="f.relation" type="text" list="sel-relations" maxlength="60" spellcheck="false" autocomplete="off" placeholder="e.g. is at, owns" @input="typed.add('relation')">
              </UiField>
              <UiField :label="pred === 'located_at' ? 'Where' : 'To whom / where'" class="tf-o">
                <input v-model="f.object" type="text" list="sel-entities" maxlength="80" spellcheck="false" autocomplete="off" placeholder="Optional" @input="typed.add('object')">
              </UiField>
              <template v-for="role in ROLES" :key="role">
                <span v-if="link[role]" class="link-state" :class="`tf-${role[0]}l`"><UiIcon name="link" :size="14" />Linked to {{ link[role]!.name }}
                  <button type="button" class="linkish" :aria-label="`Unlink from ${link[role]!.name}`" @click="link[role] = null">Unlink</button></span>
                <span v-else-if="suggestion(role)" class="link-state" :class="`tf-${role[0]}l`">Did you mean {{ suggestion(role)!.name }}?
                  <button type="button" class="linkish" @click="pick(role, suggestion(role)!)">Select it to link</button></span>
              </template>
            </div>
            <datalist id="sel-entities"><option v-for="e in entities" :key="e.id" :value="e.name" /></datalist>
            <datalist id="sel-relations"><option v-for="p in PREDICATES" :key="p.value" :value="p.label" /></datalist>

            <UiField v-if="pred === 'travel_time'" label="Minutes" class="minutes">
              <input v-model="f.value" type="number" min="0" inputmode="numeric" placeholder="e.g. 40">
            </UiField>
            <fieldset v-else class="when">
              <legend>When in the story</legend>
              <UiField label="From" :error="timeError(f.time_from)">
                <input v-model="f.time_from" type="text" placeholder="e.g. Day 1 20:30" autocomplete="off" @input="typed.add('time_from')">
              </UiField>
              <UiField label="Until" :error="timeError(f.time_to)">
                <input v-model="f.time_to" type="text" placeholder="Optional" autocomplete="off" @input="typed.add('time_to')">
              </UiField>
              <label class="check"><input v-model="f.approximate" type="checkbox"> Roughly</label>
            </fieldset>
            <p v-if="checkNote" class="small faint check-note">{{ checkNote }}</p>
          </div>
        </details>
      </template>

      <p v-if="error" class="notice bad" role="alert">{{ error }}</p>

      <footer class="sel-actions">
        <UiButton v-if="mode === 'note'" type="submit" variant="primary" icon="note" :loading="busy === 'note'" :disabled="!canSave || !!busy">Add note</UiButton>
        <UiButton v-else-if="mode === 'entity'" type="submit" variant="primary" icon="entities" :loading="busy === 'entity'" :disabled="!canSave || !!busy">{{ existing ? 'Open page' : 'Create page' }}</UiButton>
        <template v-else>
          <UiButton type="submit" variant="primary" icon="canon" :loading="busy === 'canon'" :disabled="!canSave || !!busy">Add to canon</UiButton>
          <UiButton icon="review" :loading="busy === 'review'" :disabled="!canSave || !!busy" @click="submit('review')">Send to review</UiButton>
        </template>
        <UiButton variant="ghost" @click="dialog?.close()">Cancel</UiButton>
      </footer>
      <p v-if="mode === 'fact'" class="small faint decide">Add to canon if you’re sure; it records you as the one who decided. Send to review to let a teammate decide.</p>
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
.statement-input { font-family: var(--font-story); font-size: var(--text-md); }
.parts { border: 1px solid var(--line); border-radius: var(--r-md); }
.parts summary { display: flex; flex-wrap: wrap; align-items: center; gap: 4px var(--s-2); padding: 10px 12px; cursor: pointer; list-style: none; font-weight: 600; font-size: var(--text-sm); }
.parts summary::-webkit-details-marker { display: none; }
.parts-sum { font-weight: 400; color: var(--muted); min-width: 0; overflow-wrap: anywhere; }
.parts-sum.missing { color: var(--warn); }
.parts-body { padding: 0 12px 12px; }
.triple-fields { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); grid-template-areas: "s p o" "sl . ol"; gap: 4px var(--s-3); align-items: start; }
.tf-s { grid-area: s; } .tf-p { grid-area: p; } .tf-o { grid-area: o; } .tf-sl { grid-area: sl; } .tf-ol { grid-area: ol; }
.when { display: grid; grid-template-columns: 1fr 1fr auto; gap: var(--s-3); align-items: end; margin: 0; padding: 0; border: 0; min-width: 0; }
.when legend { grid-column: 1 / -1; padding: 0; margin-bottom: 6px; font-size: var(--text-sm); font-weight: 600; }
.minutes { max-width: 160px; }
.check { display: flex; flex-direction: row; align-items: center; gap: 6px; min-height: 36px; font-weight: 400; }
.check input { width: auto; }
.check-note { margin: 0; }
.entity-fields { display: grid; grid-template-columns: 2fr 1fr; gap: var(--s-3); }
.entity-fields.found { grid-template-columns: 1fr; }
.sel-actions { display: flex; flex-wrap: wrap; gap: var(--s-2); }
.decide { margin: calc(-1 * var(--s-2)) 0 0; }
.link-state { display: flex; flex-wrap: wrap; align-items: center; gap: 4px; font-size: var(--text-xs); font-weight: 400; color: var(--muted); }
.linkish { background: none; border: 0; padding: 0; font: inherit; font-weight: 600; color: var(--accent); cursor: pointer; text-decoration: underline; }
@media (max-width: 720px) {
  .sel-dialog { width: calc(100vw - 16px); max-height: calc(100dvh - 16px); padding: var(--s-4); }
  .triple-fields { grid-template-columns: 1fr; grid-template-areas: "s" "sl" "p" "o" "ol"; }
  .when { grid-template-columns: 1fr 1fr; }
  .when .check { grid-column: 1 / -1; min-height: 28px; }
  .entity-fields { grid-template-columns: 1fr; }
  .sel-actions .btn { flex: 1 1 auto; }
}
</style>
