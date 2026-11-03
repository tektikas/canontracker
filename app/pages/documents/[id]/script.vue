<script setup lang="ts">
// Script vs recording: the take's transcript aligned with the script it was read from, line by line. Changed and added
// (improvised) lines that state a fact are run through the canon rules; a hit is flagged here. Nothing is stored or decided:
// the facts stay pending candidates in Review.
const route = useRoute()
const editor = computed(() => canEdit(useMe().value))
const { data, error, refresh } = await useFetch(() => `/api/documents/${route.params.id}/script`)
useHead({ title: computed(() => `Script vs recording · ${data.value?.recording.title ?? ''}`) })
const { data: docs } = await useFetch('/api/documents', { default: () => [] })
const scripts = computed(() => docs.value.filter(d => d.origin !== 'recording'))

const picking = ref(false)
const linkError = ref('')
async function link(id: string | null) {
  picking.value = true
  linkError.value = ''
  try {
    await $fetch(`/api/documents/${route.params.id}/script`, { method: 'POST', body: { script_document_id: id } })
    await refresh()
  } catch (e) {
    linkError.value = errorMessage(e)
  } finally {
    picking.value = false
  }
}

const onlyDiffs = ref(true)
type Row = NonNullable<typeof data.value>['rows'][number]
const rows = computed(() => (data.value?.rows ?? []).filter(r => r.kind !== 'outside' && (!onlyDiffs.value || r.kind !== 'kept')))
const outside = computed(() => data.value?.rows.filter(r => r.kind === 'outside').length ?? 0)
const LABEL = { kept: 'As written', changed: 'Changed', added: 'Added', missing: 'Not said', outside: 'Not in this take' } as const
const TONE = { kept: 'good', changed: 'warn', added: 'accent', missing: 'pencil', outside: 'pencil' } as const
// A flag is either against accepted canon or between two candidates said in this take (not a canon conflict).
const flagged = (r: Row, w: 'canon' | 'take') => r.facts.some(f => f.flags.some(x => x.with === w))
const RULE: Record<string, string> = {
  EXACT_TIME_LOCATION_OVERLAP: 'Two places at once', APPROX_TIME_LOCATION_OVERLAP: 'Maybe two places at once',
  TRAVEL_TIME_TOO_SHORT: 'Too little travel time', RELATIONSHIP_AFTER_END: 'Relationship after it ended',
  ATTRIBUTE_MISMATCH: 'Same detail, two answers',
}
</script>

<template>
  <UiPanel v-if="error">
    <UiEmptyState title="Not a recording" icon="mic">
      Script vs recording compares a recording’s transcript with its script.
      <template #actions><UiButton to="/library">Back to the library</UiButton></template>
    </UiEmptyState>
  </UiPanel>
  <template v-else-if="data">
    <nav class="crumbs small" aria-label="Breadcrumb">
      <NuxtLink to="/library">Library</NuxtLink><span aria-hidden="true">/</span>
      <NuxtLink :to="`/documents/${data.recording.id}`">{{ data.recording.title }}</NuxtLink><span aria-hidden="true">/</span>
      <span>Script vs recording</span>
    </nav>
    <UiPageHeader title="Script vs recording">
      <span class="small muted">v{{ data.recording.version }} of {{ data.recording.title }} · {{ clockMs(data.recording.duration_ms) }} of audio</span>
    </UiPageHeader>

    <UiPanel class="pick">
      <label class="pick-field">
        <span class="small muted">Script</span>
        <select :value="data.script?.id ?? ''" :disabled="!editor || picking" aria-label="Script this recording was read from" @change="link(($event.target as HTMLSelectElement).value || null)">
          <option value="">No script</option>
          <option v-for="d in scripts" :key="d.id" :value="d.id">{{ d.title }}</option>
        </select>
      </label>
      <p v-if="linkError" class="field-error" role="alert">{{ linkError }}</p>
      <p v-if="data.script" class="small muted">
        Compared with <NuxtLink :to="`/documents/${data.script.id}`">{{ data.script.title }}</NuxtLink> v{{ data.script.version }}, word by word. The transcript is AI speech-to-text, so a changed word may be a mishearing: play the line to check.
      </p>
    </UiPanel>

    <UiPanel v-if="!data.script">
      <UiEmptyState title="Pick the script" icon="dialogue">
        Choose the scene or dialogue this take was read from. Lines that were changed, added or left out show up here, and changed or added lines are checked against canon.
      </UiEmptyState>
    </UiPanel>
    <template v-else>
      <div class="summary">
        <UiBadge tone="good">{{ data.counts.kept }} as written</UiBadge>
        <UiBadge tone="warn">{{ data.counts.changed }} changed</UiBadge>
        <UiBadge tone="accent">{{ data.counts.added }} added</UiBadge>
        <UiBadge tone="pencil">{{ data.counts.missing }} not said</UiBadge>
        <UiBadge :tone="data.flagged ? 'bad' : 'good'" dot>{{ data.flagged ? `${counted(data.flagged, 'line')} ${data.flagged === 1 ? 'contradicts' : 'contradict'} canon` : 'No canon conflict found' }}</UiBadge>
        <UiBadge v-if="data.take_conflicts" tone="warn" dot>{{ counted(data.take_conflicts, 'line') }} in conflict within this take</UiBadge>
        <label class="only small"><input v-model="onlyDiffs" type="checkbox"> Only differences</label>
      </div>
      <p class="small faint">
        {{ counted(data.checked_facts, 'fact') }} from changed or added lines checked against accepted canon with the conflict rules. No hit is not proof the line fits; only those rules ran.
        <template v-if="outside"> {{ counted(outside, 'script line') }} before or after this take are left out.</template>
      </p>

      <ol class="rows">
        <li v-for="(r, i) in rows" :key="i" class="row-item" :class="[r.kind, { flagged: flagged(r, 'canon'), 'take-flag': !flagged(r, 'canon') && flagged(r, 'take') }]">
          <div class="cell script">
            <span class="cell-head small"><UiBadge :tone="TONE[r.kind]">{{ LABEL[r.kind] }}</UiBadge><template v-if="r.script"> line {{ r.script.line }}<template v-if="r.script.speaker"> · {{ r.script.speaker }}</template></template></span>
            <p v-if="r.script" class="line"><span v-for="(p, k) in r.script.pieces" :key="k" :class="{ del: p.mark }">{{ p.text }}</span></p>
            <p v-else class="line none small">Not in the script</p>
          </div>
          <div class="cell spoken">
            <span class="cell-head small">
              <ClipButton v-if="r.spoken" :doc-id="data.recording.id" :start="r.spoken.start_ms" :end="r.spoken.end_ms" />
              <template v-if="r.spoken?.speaker">Speaker {{ r.spoken.speaker }}</template>
            </span>
            <p v-if="r.spoken" class="line"><span v-for="(p, k) in r.spoken.pieces" :key="k" :class="{ ins: p.mark }">{{ p.text }}</span></p>
            <p v-else class="line none small">Not said in this take</p>
          </div>
          <ul v-if="r.facts.length" class="facts">
            <li v-for="f in r.facts" :key="f.id">
              <template v-if="f.flags.length">
                <p v-for="(x, k) in f.flags" :key="k" class="flag" :class="{ take: x.with === 'take' }" role="note">
                  <UiIcon name="conflicts" :size="16" />
                  <span>
                    <b>{{ x.with === 'canon' ? 'Contradicts canon' : 'Conflicts with another line in this take' }}: {{ RULE[x.rule] ?? x.rule }}</b> <UiBadge :tone="x.severity === 'hard' ? 'bad' : 'warn'">{{ x.severity }}</UiBadge><br>
                    {{ x.rationale }}
                    <span v-if="x.with === 'canon'" class="small muted">Said here: “{{ f.statement }}” · Canon: <NuxtLink :to="`/canon#${x.against.id}`">{{ x.against.statement }}</NuxtLink></span>
                    <span v-else class="small muted">Said here: “{{ f.statement }}” · Also said <ClipButton v-if="x.against.line" :doc-id="data.recording.id" :start="x.against.line.start_ms" :end="x.against.line.end_ms" :label="`at ${clockMs(x.against.line.start_ms ?? 0)}`" />: <NuxtLink :to="`/review?fact=${x.against.id}`">{{ x.against.statement }}</NuxtLink></span>
                  </span>
                </p>
              </template>
              <p v-else class="small muted fact-ok"><UiIcon name="check" :size="14" />States “{{ f.statement }}”: no canon conflict found.</p>
              <NuxtLink v-if="f.status === 'pending'" :to="`/review?fact=${f.id}`" class="small">Review this candidate →</NuxtLink>
            </li>
          </ul>
        </li>
      </ol>
      <p v-if="!rows.length" class="small muted">Every line was said as written.</p>
    </template>
  </template>
</template>

<style scoped>
.crumbs { display: flex; gap: var(--s-2); align-items: center; color: var(--muted); margin-bottom: var(--s-2); }
.crumbs a { color: var(--muted); }
.pick { display: grid; gap: var(--s-2); margin-bottom: var(--s-4); }
.pick-field { display: grid; gap: 4px; max-width: 420px; }
.pick p { margin: 0; }
.summary { display: flex; flex-wrap: wrap; gap: var(--s-2); align-items: center; margin-bottom: var(--s-2); }
.only { display: inline-flex; gap: 6px; align-items: center; margin-left: auto; color: var(--muted); }
.rows { list-style: none; margin: var(--s-3) 0 0; padding: 0; display: grid; gap: var(--s-2); }
.row-item { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: var(--s-2) var(--s-4); padding: var(--s-3) var(--s-4); border: 1px solid var(--line); border-radius: var(--r-md); background: var(--raised); }
.row-item.flagged { border-color: var(--bad); box-shadow: inset 3px 0 0 var(--bad); }
.row-item.take-flag { border-color: var(--warn); box-shadow: inset 3px 0 0 var(--warn); }
.cell { display: grid; gap: 6px; align-content: start; min-width: 0; }
.cell-head { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; color: var(--muted); min-height: 24px; }
.line { margin: 0; font-family: var(--font-story); font-size: var(--text-md); line-height: 1.6; overflow-wrap: anywhere; }
.line.none { font-family: var(--font-ui); color: var(--faint); font-style: italic; }
.missing .script .line, .outside .script .line { color: var(--muted); }
.del { text-decoration: line-through; text-decoration-color: var(--bad); color: var(--muted); }
.ins { background: color-mix(in srgb, var(--warn) 22%, transparent); border-radius: 2px; }
.added .ins { background: color-mix(in srgb, var(--accent) 16%, transparent); }
.facts { grid-column: 1 / -1; list-style: none; margin: 0; padding: var(--s-2) 0 0; border-top: 1px solid var(--line); display: grid; gap: var(--s-2); }
.facts li { display: grid; gap: 4px; }
.flag { display: flex; gap: var(--s-2); margin: 0; color: var(--ink); }
.flag svg { flex: none; margin-top: 2px; color: var(--bad); }
.flag.take svg { color: var(--warn); }
.flag .small { display: block; margin-top: 2px; }
.fact-ok { display: flex; gap: 6px; align-items: center; margin: 0; }
@media (max-width: 720px) {
  .row-item { grid-template-columns: minmax(0, 1fr); padding: var(--s-3); }
  .only { margin-left: 0; }
}
</style>
