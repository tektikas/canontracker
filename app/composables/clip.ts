// One audio player for the whole app: a recording's passage or citation plays its turn (start → end) and stops there.
// A page with a full player (the recording's own page) attaches its <audio> element so both drive the same sound.
const el = shallowRef<HTMLAudioElement | null>(null)
const own = shallowRef<HTMLAudioElement | null>(null)
const playing = ref('') // key of the segment playing now
const error = ref('')
let stopAt: number | null = null

function player() {
  if (el.value) return el.value
  own.value ??= new Audio()
  return own.value
}
function onTime(e: Event) {
  const a = e.target as HTMLAudioElement
  if (stopAt != null && a.currentTime >= stopAt) {
    a.pause()
    stopAt = null
  }
}
function onPause() {
  playing.value = ''
  stopAt = null
}

export function useClip() {
  /** Play `src` from start to end (ms). Same segment again stops it. */
  async function play(src: string, startMs: number | null, endMs: number | null, key = `${src}#${startMs}`) {
    const a = player()
    if (playing.value === key && !a.paused) return a.pause()
    error.value = ''
    a.removeEventListener('timeupdate', onTime)
    a.removeEventListener('pause', onPause)
    a.addEventListener('timeupdate', onTime)
    a.addEventListener('pause', onPause)
    try {
      if (!a.src.endsWith(src)) {
        a.src = src
        await new Promise((resolve, reject) => {
          a.addEventListener('loadedmetadata', resolve, { once: true })
          a.addEventListener('error', () => reject(new Error('the audio could not be loaded')), { once: true })
        })
      }
      a.currentTime = (startMs ?? 0) / 1000
      await a.play()
      stopAt = endMs != null ? endMs / 1000 : null
      playing.value = key
    } catch (e) {
      error.value = `Couldn’t play the recording: ${(e as Error).message}`
    }
  }
  function attach(a: HTMLAudioElement | null) {
    own.value?.pause()
    el.value = a
  }
  return { play, attach, playing: readonly(playing), error: readonly(error) }
}
