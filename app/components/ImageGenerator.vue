<script setup lang="ts">
import type { InternalApi } from 'nitropack/types'

// Generate dialog for an entity portrait or a document cover. The model only proposes images: nothing is applied until
// a person picks one, and every image carries its prompt, author and date.
type Data = InternalApi['/api/images']['get']
type Img = Data['images'][number]
const props = defineProps<{ type: ImageTarget, id: string, canUpload?: boolean }>()
const emit = defineEmits<{ changed: [], upload: [] }>()
const me = useMe()

const dlg = ref<HTMLDialogElement>()
const data = ref<Data | null>(null)
const loadError = ref('')
const prompt = ref('')
const promptFor = ref('')
const style = ref<ImageStyle>('concept')
const count = ref(2)
const generating = ref(false)
const elapsed = ref(0)
const genError = ref<{ summary: string, detail: string } | null>(null)
const confirmId = ref('')
const fresh = ref<string[]>([])
const busy = ref('')
const actionError = ref('')

async function open() {
  dlg.value?.showModal()
  loadError.value = ''
  actionError.value = ''
  confirmId.value = ''
  if (!generating.value) genError.value = null
  try {
    const d = await $fetch('/api/images', { query: { target_type: props.type, target_id: props.id } })
    data.value = d
    // Keep the writer's edits while they stay on the same page; a different page starts from its own draft.
    if (promptFor.value !== props.id) {
      prompt.value = d.target.suggestion
      promptFor.value = props.id
      fresh.value = []
    }
  } catch (e) {
    loadError.value = errorMessage(e)
  }
}
defineExpose({ open })
const close = () => dlg.value?.close()
const backdrop = (ev: MouseEvent) => { if (ev.target === dlg.value) close() }

// Characters get a portrait, documents a cover, every other page an image.
const noun = computed(() => data.value?.target.noun ?? imageNoun(props.type))
const applyLabel = computed(() => ({ portrait: 'Set as portrait', cover: 'Set as cover', image: 'Use as image' })[noun.value] ?? 'Use as image')
const title = computed(() => !data.value ? 'Generate an image' : noun.value === 'image' ? `Generate an image of ${data.value.target.name}` : `Generate a ${noun.value} for ${data.value.target.name}`)
const live = computed(() => !!data.value?.model.live)
const sent = computed(() => composeImagePrompt(prompt.value, style.value, data.value?.art_style ?? ''))

// The server's message is exact but technical; lead with a sentence a writer can act on and keep the rest under "Details".
function plainError(raw: string) {
  const sentence = /billing is not set up/.test(raw) ? 'Image generation isn’t available yet: billing for the Meta Model API isn’t set up.'
    : /rejected the key|key is not set/.test(raw) ? 'Image generation isn’t available: the Meta Model API didn’t accept this workspace’s key.'
    : /rate limited/.test(raw) ? 'The Meta Model API is busy right now. Wait a moment and try again.'
    : /timed out/.test(raw) ? `Muse Image took longer than ${IMAGE_DEADLINE_MS / 1000} seconds, so Story Bible stopped waiting.`
    : /could not reach/.test(raw) ? 'Story Bible couldn’t reach the Meta Model API.'
    : /^(Image generation failed|Model call failed)/.test(raw) ? 'Muse Image didn’t return a usable image.'
    : ''
  return { summary: sentence || raw, detail: sentence ? raw : '' }
}

let timer: ReturnType<typeof setInterval> | undefined
async function generate() {
  if (!prompt.value.trim()) {
    genError.value = { summary: 'Describe what to draw.', detail: '' }
    return
  }
  genError.value = null
  generating.value = true
  elapsed.value = 0
  const started = Date.now()
  timer = setInterval(() => { elapsed.value = Math.floor((Date.now() - started) / 1000) }, 1000)
  try {
    const made = await $fetch('/api/images', { method: 'POST', body: { target_type: props.type, target_id: props.id, prompt: prompt.value, style: style.value, n: count.value } })
    fresh.value = made.map(i => i.id)
    if (data.value) data.value.images = [...made, ...data.value.images]
  } catch (e) {
    genError.value = plainError(errorMessage(e))
  } finally {
    clearInterval(timer)
    generating.value = false
  }
}
onBeforeUnmount(() => clearInterval(timer))

async function apply(i: Img) {
  busy.value = i.id
  actionError.value = ''
  try {
    await $fetch(`/api/images/${i.id}/apply`, { method: 'POST' })
    if (data.value) data.value.images = data.value.images.map(x => ({ ...x, applied: x.id === i.id }))
    emit('changed')
  } catch (e) {
    actionError.value = errorMessage(e)
  } finally {
    busy.value = ''
  }
}
async function discard(i: Img) {
  confirmId.value = ''
  busy.value = i.id
  actionError.value = ''
  try {
    await $fetch(`/api/images/${i.id}`, { method: 'DELETE' })
    if (data.value) data.value.images = data.value.images.filter(x => x.id !== i.id)
  } catch (e) {
    actionError.value = errorMessage(e)
  } finally {
    busy.value = ''
  }
}

const when = (iso: string) => new Date(iso).toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
</script>

<template>
  <dialog ref="dlg" class="gen" aria-labelledby="gen-title" @click="backdrop" @close="fresh = []">
    <div class="sheet">
      <header class="gen-head">
        <div class="gen-title">
          <h2 id="gen-title">{{ title }}</h2>
          <span v-if="data" class="small faint">
            <UiBadge v-if="live" tone="accent" dot>{{ data.model.label }}</UiBadge>
            <UiBadge v-else tone="warn">Image model offline</UiBadge>
          </span>
        </div>
        <button type="button" class="x" aria-label="Close" @click="close"><UiIcon name="close" /></button>
      </header>

      <p v-if="loadError" class="notice bad pad" role="alert">{{ loadError }}</p>

      <div v-else-if="data" class="gen-body">
        <form class="gen-form stack" novalidate @submit.prevent="generate">
          <p v-if="!live" class="notice warn" role="status">
            <UiIcon name="lock" :size="16" />
            <span>Image generation needs the live Meta Model API. This workspace runs on recorded demo output, which has no image model, so nothing can be generated here.<template v-if="canUpload"> You can still upload a picture yourself.</template></span>
          </p>
          <fieldset :disabled="!live || generating" class="stack">
            <UiField label="Prompt" hint="Drafted from accepted canon and your page’s own fields. Edit it freely; canon doesn’t change.">
              <textarea v-model="prompt" rows="7" maxlength="2000" />
            </UiField>
            <button type="button" class="linkish small" :style="{ visibility: prompt !== data.target.suggestion ? 'visible' : 'hidden' }" :tabindex="prompt !== data.target.suggestion ? 0 : -1" @click="prompt = data.target.suggestion">Start again from canon</button>

            <div class="group" role="radiogroup" aria-label="Style preset">
              <span class="label">Style preset</span>
              <div class="chips">
                <label v-for="(s, key) in IMAGE_STYLES" :key="key" class="pick" :class="{ on: style === key }">
                  <input v-model="style" type="radio" name="style" :value="key">{{ s.label }}
                </label>
              </div>
            </div>

            <div class="art small">
              <template v-if="data.art_style">
                <span class="label">Project art style</span> <span class="muted">{{ data.art_style }}</span>
                <NuxtLink v-if="canManage(me)" to="/settings/projects">Edit</NuxtLink>
              </template>
              <span v-else class="muted">
                No project art style yet.
                <NuxtLink v-if="canManage(me)" to="/settings/projects">Set one in Settings</NuxtLink>
                <template v-else>Owners and admins can set one in Settings.</template>
              </span>
            </div>

            <div class="group" role="radiogroup" aria-label="Number of images">
              <span class="label">Images</span>
              <div class="chips">
                <label v-for="k in 4" :key="k" class="pick num" :class="{ on: count === k }">
                  <input v-model="count" type="radio" name="count" :value="k">{{ k }}
                </label>
              </div>
            </div>

            <details class="sent small">
              <summary>Exact prompt sent to Muse Image</summary>
              <pre>{{ sent }}</pre>
            </details>
          </fieldset>

          <div class="gen-actions">
            <div v-if="genError" class="notice bad" role="alert">
              <UiIcon name="conflicts" :size="16" />
              <div class="stack tight">
                <span>{{ genError.summary }}<template v-if="genError.detail"> No image was saved. The current {{ noun }} is unchanged.</template></span>
                <details v-if="genError.detail" class="small"><summary>Details</summary><p>{{ genError.detail }}</p></details>
              </div>
            </div>
            <div class="row">
              <UiButton type="submit" variant="primary" icon="image" :loading="generating" :disabled="!live">
                {{ generating ? `Generating… ${elapsed} s` : genError ? 'Try again' : `Generate ${counted(count, 'image')}` }}
              </UiButton>
              <UiButton v-if="canUpload" type="button" icon="upload" :disabled="generating" @click="close(); emit('upload')">Upload instead</UiButton>
            </div>
            <span v-if="generating" class="small faint" role="status">Story Bible waits up to {{ IMAGE_DEADLINE_MS / 1000 }} seconds. You can close this; images land in the history.</span>
          </div>
        </form>

        <section class="gen-results" aria-label="Generated images">
          <h3 class="small">Images for {{ data.target.name }} <span class="faint">· {{ data.images.length }}</span></h3>
          <p v-if="actionError" class="notice bad" role="alert">{{ actionError }}</p>
          <div v-if="generating || data.images.length" class="grid">
            <template v-if="generating">
              <div v-for="k in count" :key="`p${k}`" class="shot placeholder" aria-hidden="true"><span class="spinner" /></div>
            </template>
            <figure v-for="i in data.images" :key="i.id" class="shot" :class="{ current: i.applied }">
              <a :href="i.url" target="_blank" rel="noopener" class="thumb"><img :src="i.url" :alt="`Generated image for ${data.target.name}`" loading="lazy"></a>
              <figcaption class="stack">
                <div v-if="i.applied || fresh.includes(i.id)" class="row tags">
                  <UiBadge v-if="i.applied" tone="accent">In use</UiBadge>
                  <UiBadge v-else tone="good">New</UiBadge>
                </div>
                <span class="small gen-by"><UiIcon name="image" :size="14" />Generated with Muse Image</span>
                <span class="small faint">{{ i.created_by_name ?? 'Unknown' }} · {{ when(i.created_at) }}</span>
                <details class="small"><summary>Prompt</summary><p class="prompt">{{ i.prompt }}</p></details>
                <div v-if="confirmId === i.id" class="confirm small" role="alertdialog" :aria-label="`Delete this image`">
                  <span>Delete this image made by {{ i.created_by_name ?? 'unknown' }} on {{ when(i.created_at) }}? The file and its prompt are removed for good.</span>
                  <div class="row">
                    <UiButton size="sm" variant="danger" :loading="busy === i.id" @click="discard(i)">Delete image</UiButton>
                    <UiButton size="sm" variant="ghost" @click="confirmId = ''">Keep it</UiButton>
                  </div>
                </div>
                <div v-else-if="!i.applied && canEdit(me)" class="row">
                  <UiButton size="sm" variant="primary" :loading="busy === i.id" @click="apply(i)">{{ applyLabel }}</UiButton>
                  <UiButton size="sm" variant="ghost" icon="trash" :disabled="!!busy" @click="confirmId = i.id">Discard</UiButton>
                </div>
              </figcaption>
            </figure>
          </div>
          <p v-else class="small muted empty-note">No images yet. Generated images are kept here so you can pick an older one later.</p>
        </section>
      </div>
      <div v-else class="pad"><span class="spinner" aria-label="Loading" /></div>
    </div>
  </dialog>
</template>

<style scoped>
.gen { width: min(1040px, calc(100vw - 32px)); height: min(760px, calc(100vh - 48px)); padding: 0; border: 1px solid var(--line); border-radius: var(--r-lg); background: var(--raised); color: var(--ink); box-shadow: var(--elev-overlay); }
.gen::backdrop { background: rgb(8 12 18 / 0.45); }
.sheet { display: flex; flex-direction: column; height: 100%; }
.gen-head { display: flex; gap: var(--s-3); align-items: flex-start; justify-content: space-between; padding: var(--s-4) var(--s-5); border-bottom: 1px solid var(--line); }
.gen-title { display: grid; gap: 6px; min-width: 0; }
.gen-title h2 { margin: 0; font-size: var(--text-lg); overflow-wrap: anywhere; }
.x { display: grid; place-items: center; width: 36px; height: 36px; border: 0; border-radius: var(--r-md); background: none; color: var(--muted); cursor: pointer; flex: none; }
.x:hover { background: var(--sunken); color: var(--ink); }
.pad { margin: var(--s-5); }
.gen-body { flex: 1; min-height: 0; display: grid; grid-template-columns: minmax(0, 5fr) minmax(0, 6fr); }
.gen-form, .gen-results { overflow-y: auto; }
.gen-form { padding: var(--s-5); border-right: 1px solid var(--line); gap: var(--s-4); align-content: start; }
fieldset { border: 0; margin: 0; padding: 0; min-width: 0; gap: var(--s-4); }
fieldset:disabled textarea { background: var(--surface); color: var(--muted); }
.gen-actions { position: sticky; bottom: calc(-1 * var(--s-5)); z-index: 1; display: grid; gap: var(--s-2); margin: 0 calc(-1 * var(--s-5)) calc(-1 * var(--s-5)); padding: var(--s-3) var(--s-5) var(--s-4); background: var(--raised); border-top: 1px solid var(--line); }
.tight { gap: var(--s-1); }
.notice details p { margin: var(--s-1) 0 0; overflow-wrap: anywhere; }
.notice details summary { cursor: pointer; }
.confirm { display: grid; gap: var(--s-2); padding: var(--s-2) var(--s-3); border-radius: var(--r-md); background: var(--surface); border: 1px solid var(--line-strong); }
.linkish { justify-self: start; margin-top: calc(-1 * var(--s-2)); background: none; border: 0; padding: 0; font: inherit; font-weight: 600; color: var(--accent); cursor: pointer; text-decoration: underline; }
.group { display: grid; gap: var(--s-2); }
.label { font-weight: 500; font-size: var(--text-sm); }
.chips { display: flex; flex-wrap: wrap; gap: 6px; }
.pick { position: relative; display: inline-flex; align-items: center; min-height: 34px; padding: 0 12px; border: 1px dashed var(--line-strong); border-radius: var(--r-md); background: var(--canvas); font-size: var(--text-sm); color: var(--muted); cursor: pointer; }
.pick.num { min-width: 40px; justify-content: center; }
.pick input { position: absolute; opacity: 0; inset: 0; margin: 0; cursor: pointer; }
.pick:hover { color: var(--ink); }
.pick.on { border-style: solid; border-color: var(--accent); background: var(--accent-soft); color: var(--accent); font-weight: 600; }
.pick:has(input:focus-visible) { outline: 2px solid var(--accent); outline-offset: 2px; }
fieldset:disabled .pick { cursor: not-allowed; color: var(--faint); }
.art { display: flex; flex-wrap: wrap; gap: 4px var(--s-2); align-items: baseline; padding: var(--s-2) var(--s-3); border-radius: var(--r-md); background: var(--surface); }
.sent summary { cursor: pointer; color: var(--muted); }
.sent pre { margin: var(--s-2) 0 0; padding: var(--s-3); white-space: pre-wrap; overflow-wrap: anywhere; font-family: var(--font-code); font-size: var(--text-xs); background: var(--surface); border: 1px solid var(--line); border-radius: var(--r-md); }
.notice svg { flex: none; margin-top: 2px; }
.gen-results { padding: var(--s-5); display: grid; gap: var(--s-3); align-content: start; background: var(--surface); }
.gen-results h3 { margin: 0; font-weight: 600; }
.grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: var(--s-3); }
.shot { margin: 0; display: grid; align-content: start; border: 1px solid var(--line); border-radius: var(--r-md); background: var(--raised); overflow: hidden; }
.shot.current { border-color: var(--accent); box-shadow: 0 0 0 1px var(--accent); }
.thumb { display: block; aspect-ratio: 1; background: var(--sunken); }
.thumb img { width: 100%; height: 100%; object-fit: cover; display: block; }
.shot figcaption { padding: var(--s-3); gap: var(--s-2); }
.tags { gap: 4px; }
.gen-by { display: flex; gap: 6px; align-items: flex-start; font-weight: 600; color: var(--muted); }
.gen-by svg { margin-top: 2px; }
.prompt { margin: var(--s-2) 0 0; white-space: pre-line; overflow-wrap: anywhere; color: var(--muted); }
.shot details summary { cursor: pointer; color: var(--muted); }
.placeholder { aspect-ratio: 1; place-items: center; align-content: center; border: 1px dashed var(--line-strong); background: var(--pencil-soft); color: var(--muted); }
.empty-note { margin: 0; }
@media (max-width: 720px) {
  .gen { width: 100vw; max-width: 100vw; height: 100dvh; max-height: 100dvh; margin: 0; border: 0; border-radius: 0; }
  .sheet { height: 100%; max-height: 100dvh; }
  .gen-head { padding: var(--s-3) var(--s-4); }
  .gen-body { grid-template-columns: minmax(0, 1fr); overflow-y: auto; }
  .gen-form, .gen-results { overflow-y: visible; }
  .gen-form { padding: var(--s-4); border-right: 0; border-bottom: 1px solid var(--line); }
  .gen-actions { bottom: 0; margin: 0 calc(-1 * var(--s-4)) calc(-1 * var(--s-4)); padding: var(--s-3) var(--s-4); }
  .gen-results { padding: var(--s-4); }
  .grid { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: var(--s-2); }
}
</style>
