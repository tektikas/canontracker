<script setup lang="ts">
import type { IconName } from '~/components/ui/Icon.vue'

// The open project's entity types: rename, recolour, change the icon, add, remove. Editorial structure only; canon,
// conflicts and impact never read a type. Removing a type that pages use asks which type they become.
const props = defineProps<{ project: string }>()
const me = useMe()
const editable = computed(() => canEdit(me.value))
const { data: types } = await useEntityTypes()

const editing = ref('') // a type key, or 'new'
const removing = ref('')
const moveTo = ref('')
const busy = ref(false)
const error = ref('')
const form = reactive({ one: '', many: '', color: 'neutral' as TypeColor, icon: 'other' as TypeIcon })
const pluralTouched = ref(false)
watch(() => form.one, (v) => { if (!pluralTouched.value) form.many = v.trim() ? pluralOf(v.trim()) : '' })

function start(t?: EntityType) {
  removing.value = ''
  error.value = ''
  pluralTouched.value = !!t
  Object.assign(form, t ? { one: t.one, many: t.many, color: t.color, icon: t.icon } : { one: '', many: '', color: 'neutral', icon: 'other' })
  editing.value = t?.key ?? 'new'
}
function startRemove(t: EntityTypeItem) {
  editing.value = ''
  error.value = ''
  moveTo.value = types.value.find(x => x.key !== t.key && x.key === 'other')?.key ?? types.value.find(x => x.key !== t.key)?.key ?? ''
  removing.value = t.key
}
async function run(fn: () => Promise<unknown>) {
  busy.value = true
  error.value = ''
  try {
    await fn()
    await Promise.all([refreshEntityTypes(), refreshEntities()])
    editing.value = ''
    removing.value = ''
  } catch (e) {
    error.value = errorMessage(e)
  } finally {
    busy.value = false
  }
}
// The list, plus a blank row at the end while a new type is being added (it shares the edit form).
const rows = computed(() => [...types.value, ...(editing.value === 'new' ? [{ key: 'new', one: '', many: '', color: 'neutral', icon: 'other', pages: 0 } as EntityTypeItem] : [])])
const save = () => run(() => editing.value === 'new'
  ? $fetch('/api/entity-types', { method: 'POST', body: form })
  : $fetch(`/api/entity-types/${editing.value}`, { method: 'PATCH', body: form }))
async function remove(t: EntityTypeItem) {
  if (!t.pages && !(await askConfirm({ title: `Remove the ${t.one} type?`, body: 'No page uses it. You can add it again later.', confirm: 'Remove type', danger: true }))) return
  run(() => $fetch(`/api/entity-types/${t.key}`, { method: 'DELETE', query: t.pages ? { move_to: moveTo.value } : {} }))
}
</script>

<template>
  <UiPanel id="entity-types" :title="`Entity types · ${props.project}`" description="Types group pages on Entities, in the graph and in exports. Renaming keeps every page’s type. Types are notes for your team: canon, conflicts and impact never use them.">
    <template v-if="editable && editing !== 'new'" #actions>
      <UiButton size="sm" icon="plus" @click="start()">Add type</UiButton>
    </template>
    <ul class="types">
      <li v-for="t in rows" :key="t.key" :class="{ open: editing === t.key || removing === t.key }">
        <div v-if="t.key !== 'new'" class="type-row">
          <span class="tile" :class="`kt-${t.color}`"><UiIcon :name="t.icon as IconName" :size="16" /></span>
          <span class="name"><b>{{ t.one }}</b> <span class="small faint">{{ t.many }}</span></span>
          <span class="small muted count">{{ counted(t.pages, 'page') }}</span>
          <span v-if="editable" class="row acts">
            <UiButton size="sm" variant="ghost" icon="review" :aria-label="`Edit ${t.one}`" :title="`Edit ${t.one}`" @click="start(t)" />
            <UiButton size="sm" variant="ghost" icon="trash" :aria-label="`Remove ${t.one}`" :title="`Remove ${t.one}`" :disabled="types.length === 1" @click="t.pages ? startRemove(t) : remove(t)" />
          </span>
        </div>
        <form v-if="editing === t.key" class="type-form" novalidate @submit.prevent="save">
          <div class="names">
            <UiField label="Name">
              <input v-model="form.one" type="text" maxlength="40" required :autofocus="t.key === 'new'" placeholder="e.g. Spell" @keydown.esc="editing = ''">
            </UiField>
            <UiField label="Plural" hint="Used for group headings.">
              <input v-model="form.many" type="text" maxlength="40" @input="pluralTouched = true" @keydown.esc="editing = ''">
            </UiField>
          </div>
          <fieldset class="pick">
            <legend>Colour</legend>
            <div class="opts" role="radiogroup" aria-label="Colour">
              <button v-for="(label, c) in TYPE_COLORS" :key="c" type="button" role="radio" class="opt" :class="`kt-${c}`" :aria-checked="form.color === c" :aria-label="label" :title="label" @click="form.color = c">
                <span class="kt-dot" />
              </button>
            </div>
          </fieldset>
          <fieldset class="pick">
            <legend>Icon</legend>
            <div class="opts" role="radiogroup" aria-label="Icon">
              <button v-for="i in TYPE_ICONS" :key="i" type="button" role="radio" class="opt" :class="`kt-${form.color}`" :aria-checked="form.icon === i" :aria-label="i" :title="i" @click="form.icon = i">
                <UiIcon :name="i as IconName" :size="16" />
              </button>
            </div>
          </fieldset>
          <p v-if="error" class="field-error" role="alert">{{ error }}</p>
          <div class="row">
            <UiButton type="submit" size="sm" variant="primary" :loading="busy">{{ t.key === 'new' ? 'Add type' : 'Save' }}</UiButton>
            <UiButton size="sm" variant="ghost" @click="editing = ''">Cancel</UiButton>
          </div>
        </form>
        <form v-else-if="removing === t.key" class="type-form" novalidate @submit.prevent="remove(t)">
          <p class="small">{{ counted(t.pages, 'page') }} {{ t.pages === 1 ? 'is' : 'are' }} {{ t.many }}. Choose the type {{ t.pages === 1 ? 'it becomes' : 'they become' }}; nothing else on {{ t.pages === 1 ? 'the page' : 'those pages' }} changes.</p>
          <UiField label="Move pages to">
            <select v-model="moveTo">
              <option v-for="x in types.filter(x => x.key !== t.key)" :key="x.key" :value="x.key">{{ x.one }}</option>
            </select>
          </UiField>
          <p v-if="error" class="field-error" role="alert">{{ error }}</p>
          <div class="row">
            <UiButton type="submit" size="sm" variant="danger" :loading="busy">Move pages and remove {{ t.one }}</UiButton>
            <UiButton size="sm" variant="ghost" @click="removing = ''">Cancel</UiButton>
          </div>
        </form>
      </li>
    </ul>
    <p v-if="error && !editing && !removing" class="field-error" role="alert">{{ error }}</p>
    <p v-if="!editable" class="small faint">Editors and above can change types.</p>
  </UiPanel>
</template>

<style scoped>
.types { list-style: none; margin: 0; padding: 0; display: grid; }
.types li { border-top: 1px solid var(--line); padding: var(--s-2) 0; }
.types li:first-child { border-top: 0; }
.types li.open { padding-bottom: var(--s-4); }
.type-row { display: flex; align-items: center; gap: var(--s-3); min-height: 40px; }
.tile { display: grid; place-items: center; flex: none; width: 32px; height: 32px; border-radius: var(--r-md); background: var(--tone-soft); color: var(--tone); }
.name { flex: 1; min-width: 0; overflow-wrap: anywhere; }
.count { white-space: nowrap; }
.acts { gap: 2px; flex: none; }
.type-form { display: grid; gap: var(--s-3); margin-top: var(--s-3); max-width: 560px; }
.type-form p { margin: 0; }
.names { display: grid; grid-template-columns: 1fr 1fr; gap: var(--s-3); align-items: start; }
.pick { border: 0; margin: 0; padding: 0; min-width: 0; }
.pick legend { padding: 0; margin-bottom: 6px; font-size: var(--text-sm); font-weight: 500; }
.opts { display: flex; flex-wrap: wrap; gap: 4px; }
.opt { display: grid; place-items: center; width: 36px; height: 36px; border: 1px solid var(--line); border-radius: var(--r-md); background: var(--raised); color: var(--tone); cursor: pointer; }
.opt:hover { background: var(--sunken); }
.opt.kt-pencil .kt-dot { background: transparent; outline: 1.5px dashed var(--pencil); outline-offset: -1.5px; } /* as on Library tags */
.opt[aria-checked=true] { border-color: var(--ink); box-shadow: inset 0 0 0 1px var(--ink); background: var(--tone-soft); }
.opt:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
@media (max-width: 720px) { .names { grid-template-columns: 1fr; } .opt { width: 44px; height: 44px; } }
</style>
