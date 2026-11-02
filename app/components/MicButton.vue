<script setup lang="ts">
// Speak instead of typing: records from the microphone in the browser (MediaRecorder), the server transcribes the clip
// (POST /api/voice/transcribe, Muse Voice Transcribe) and `text` hands the words back for the person to check before using
// them. Nothing is kept on the server but the model-call record. Stops by itself at `max` seconds.
const props = withDefaults(defineProps<{ max?: number, label?: string }>(), { max: 120, label: 'Dictate' })
const emit = defineEmits<{ text: [text: string] }>()

const state = ref<'idle' | 'starting' | 'recording' | 'transcribing'>('idle')
const error = ref('')
const seconds = ref(0)
let rec: MediaRecorder | null = null
let chunks: Blob[] = []
let timer: ReturnType<typeof setInterval> | undefined
let cancelled = false

const mmss = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
const ext = (type: string) => (type.includes('ogg') ? 'ogg' : type.includes('mp4') ? 'm4a' : 'webm')

async function start() {
  error.value = ''
  if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
    error.value = 'This browser can’t record audio.'
    return
  }
  state.value = 'starting'
  let stream: MediaStream
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: true })
  } catch (e) {
    state.value = 'idle'
    const name = (e as DOMException).name
    error.value = name === 'NotAllowedError' ? 'Microphone access is blocked. Allow it in the browser’s site settings.'
      : name === 'NotFoundError' ? 'No microphone found.' : `Couldn’t start the microphone: ${(e as Error).message}`
    return
  }
  chunks = []
  cancelled = false
  rec = new MediaRecorder(stream)
  rec.ondataavailable = e => e.data.size && chunks.push(e.data)
  rec.onstop = () => {
    stream.getTracks().forEach(t => t.stop())
    clearInterval(timer)
    if (cancelled || !chunks.length) return void (state.value = 'idle')
    send(new Blob(chunks, { type: rec?.mimeType || chunks[0]!.type }))
  }
  rec.start()
  seconds.value = 0
  state.value = 'recording'
  timer = setInterval(() => {
    if (++seconds.value >= props.max) stop()
  }, 1000)
}
function stop() {
  if (rec?.state === 'recording') rec.stop()
}
function cancel() {
  cancelled = true
  stop()
}
async function send(blob: Blob) {
  state.value = 'transcribing'
  const form = new FormData()
  form.append('audio', blob, `clip.${ext(blob.type)}`)
  try {
    const r = await $fetch<{ text: string }>('/api/voice/transcribe', { method: 'POST', body: form })
    if (r.text.trim()) emit('text', r.text.trim())
    else error.value = 'No speech was heard. Try again a little closer to the microphone.'
  } catch (e) {
    error.value = errorMessage(e)
  } finally {
    state.value = 'idle'
  }
}
onBeforeUnmount(cancel)
</script>

<template>
  <span class="mic">
    <button
      v-if="state !== 'recording'" type="button" class="btn ghost sm mic-btn" :disabled="state !== 'idle'"
      :title="`${label}: speak, then stop to turn it into text (up to ${mmss(max)})`" @click="start"
    >
      <UiIcon name="mic" :size="16" /><span>{{ state === 'transcribing' ? 'Transcribing…' : state === 'starting' ? 'Starting…' : label }}</span>
    </button>
    <template v-else>
      <button type="button" class="btn sm mic-btn on" title="Stop and transcribe" @click="stop">
        <span class="dot" aria-hidden="true" /><UiIcon name="stop" :size="14" /><span>Stop</span>
      </button>
      <span class="small mono time" role="timer" aria-live="off">{{ mmss(seconds) }} / {{ mmss(max) }}</span>
      <button type="button" class="btn ghost sm" title="Discard this recording" @click="cancel"><UiIcon name="close" :size="14" /><span class="sr-only">Discard</span></button>
    </template>
    <span v-if="state === 'recording'" class="sr-only" role="status">Recording</span>
    <span v-if="error" class="small mic-error" role="alert">{{ error }}</span>
  </span>
</template>

<style scoped>
.mic { display: inline-flex; flex-wrap: wrap; gap: 6px; align-items: center; min-width: 0; }
.mic-btn.on { border-color: var(--bad); color: var(--bad); }
.mic-btn.on svg { fill: currentColor; }
.dot { width: 8px; height: 8px; border-radius: 50%; background: var(--bad); animation: pulse 1.2s ease-in-out infinite; }
.time { color: var(--muted); font-variant-numeric: tabular-nums; }
.mic-error { color: var(--bad); flex-basis: 100%; }
.sr-only { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }
@keyframes pulse { 50% { opacity: 0.3; } }
@media (prefers-reduced-motion: reduce) { .dot { animation: none; } }
</style>
