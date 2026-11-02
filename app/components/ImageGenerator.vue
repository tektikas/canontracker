<script setup lang="ts">
import type { InternalApi } from 'nitropack/types'

// Generate dialog for an entity portrait or a document cover. The model only proposes images: nothing is applied until
// a person picks one, and every image carries its prompt, author and date. The right side is the same image history as
// the page's Images, so "Upload instead" adds the team's own files right here, even when generation is offline.
// Editors only: the parent leaves it out for viewers.
type Data = InternalApi['/api/images']['get']
const props = defineProps<{ type: ImageTarget, id: string }>()
const emit = defineEmits<{ changed: [] }>()
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
const fresh = ref<string[]>([])
const history = ref<{ pick: () => void }>()
const results = ref<HTMLElement>()

async function open() {
  dlg.value?.showModal()
  loadError.value = ''
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
const title = computed(() => !data.value ? 'Generate an image' : noun.value === 'image' ? `Generate an image of ${data.value.target.name}` : `Generate a ${noun.value} for ${data.value.target.name}`)
const live = computed(() => !!data.value?.model.live)
// Canon had nothing drawable to add: the draft is just the opening line.
const bare = computed(() => live.value && prompt.value === data.value?.target.suggestion && prompt.value.split('\n').filter(Boolean).length <= 1)
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
    emit('changed')
  } catch (e) {
    genError.value = plainError(errorMessage(e))
  } finally {
    clearInterval(timer)
    generating.value = false
  }
}
onBeforeUnmount(() => clearInterval(timer))

// Upload instead: the picker opens straight away (it needs the click), then the history scrolls into view on phones.
function uploadInstead() {
  history.value?.pick()
  results.value?.scrollIntoView({ block: 'start', behavior: 'smooth' })
}
</script>

<template>
  <dialog ref="dlg" class="gen" aria-labelledby="gen-title" @click="backdrop" @close="fresh = []">
    <div class="sheet">
      <header class="gen-head">
        <div class="gen-title">
          <h2 id="gen-title">{{ title }}</h2>
          <span v-if="data" class="small faint">
            <UiBadge v-if="live" tone="accent" dot>Image model connected</UiBadge>
            <UiBadge v-else tone="warn">Image model not connected</UiBadge>
          </span>
        </div>
        <button type="button" class="x" aria-label="Close" @click="close"><UiIcon name="close" /></button>
      </header>

      <p v-if="loadError" class="notice bad pad" role="alert">{{ loadError }}</p>

      <div v-else-if="data" class="gen-body">
        <form class="gen-form stack" novalidate @submit.prevent="generate">
          <p v-if="!live" class="notice warn" role="status">
            <UiIcon name="lock" :size="16" />
            <span>Portrait generation is not available on this instance. You can still upload your own images.</span>
          </p>
          <fieldset :disabled="!live || generating" class="stack">
            <UiField label="Prompt" hint="Drafted from accepted canon and your page’s own fields. Edit it freely; canon doesn’t change.">
              <textarea v-model="prompt" rows="7" maxlength="2000" />
            </UiField>
            <p v-if="bare" class="small muted bare">Describe it: what it looks like, the light, the mood. Only a name and kind are known so far.</p>
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
                <NuxtLink v-if="canManage(me)" :to="`/settings/projects/${me?.current?.project.id}`">Edit</NuxtLink>
              </template>
              <span v-else class="muted">
                No project art style yet.
                <NuxtLink v-if="canManage(me)" :to="`/settings/projects/${me?.current?.project.id}`">Set one in Settings</NuxtLink>
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
                {{ generating ? `Generating… ${elapsed} s` : genError ? 'Try again' : `Generate ${counted(count, 'image')}` }}<UiSendKey v-if="!generating" />
              </UiButton>
              <UiButton type="button" icon="upload" @click="uploadInstead">Upload instead</UiButton>
            </div>
            <span v-if="generating" class="small faint" role="status">Story Bible waits up to {{ IMAGE_DEADLINE_MS / 1000 }} seconds. You can close this; images land in the history.</span>
          </div>
        </form>

        <section ref="results" class="gen-results" aria-label="Images">
          <h3 class="small">Images for {{ data.target.name }} <span class="faint">· {{ data.images.length }}</span></h3>
          <ImageHistory ref="history" v-model:images="data.images" :type="type" :id="id" :name="data.target.name" :noun="noun" editable :generating="generating ? count : 0" :fresh="fresh" @changed="genError = null; emit('changed')" />
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
fieldset:disabled textarea { background: var(--sunken); color: var(--muted); border-style: dashed; cursor: not-allowed; resize: none; }
.bare { margin: calc(-1 * var(--s-2)) 0 0; }
.gen-actions { position: sticky; bottom: calc(-1 * var(--s-5)); z-index: 1; display: grid; gap: var(--s-2); margin: 0 calc(-1 * var(--s-5)) calc(-1 * var(--s-5)); padding: var(--s-3) var(--s-5) var(--s-4); background: var(--raised); border-top: 1px solid var(--line); }
.tight { gap: var(--s-1); }
.notice details p { margin: var(--s-1) 0 0; overflow-wrap: anywhere; }
.notice details summary { cursor: pointer; }
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
@media (max-width: 720px) {
  .gen { width: 100vw; max-width: 100vw; height: 100dvh; max-height: 100dvh; margin: 0; border: 0; border-radius: 0; }
  .sheet { height: 100%; max-height: 100dvh; }
  .gen-head { padding: var(--s-3) var(--s-4); }
  .gen-body { grid-template-columns: minmax(0, 1fr); overflow-y: auto; }
  .gen-form, .gen-results { overflow-y: visible; }
  .gen-form { padding: var(--s-4); border-right: 0; border-bottom: 1px solid var(--line); }
  .gen-actions { bottom: 0; margin: 0 calc(-1 * var(--s-4)) calc(-1 * var(--s-4)); padding: var(--s-3) var(--s-4); }
  .gen-results { padding: var(--s-4); }
}
</style>
