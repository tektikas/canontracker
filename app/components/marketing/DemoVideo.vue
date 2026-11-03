<script setup lang="ts">
// The demo video, click to play: only our own poster loads with the page; YouTube's player (no-cookie domain) loads after
// the click. VIDEO_ID in app/utils/marketing.ts; the landing hides the section while it is empty.
const props = defineProps<{ id: string, title?: string }>()
const playing = ref(false)
const src = computed(() => `https://www.youtube-nocookie.com/embed/${encodeURIComponent(props.id)}?autoplay=1&rel=0`)
</script>

<template>
  <div class="video">
    <iframe
      v-if="playing" :src="src" :title="title ?? 'CanonTracker demo video'" allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
      allowfullscreen referrerpolicy="strict-origin-when-cross-origin"
    />
    <button v-else type="button" class="poster" :aria-label="`Play: ${title ?? 'CanonTracker demo video'}`" @click="playing = true">
      <img src="/video-poster.webp" alt="" width="1280" height="720" loading="lazy">
      <span class="play" aria-hidden="true"><UiIcon name="play" /></span>
    </button>
  </div>
</template>

<style scoped>
.video { position: relative; aspect-ratio: 16 / 9; max-width: 100%; border-radius: var(--r-3, 12px); overflow: hidden; border: 1px solid var(--line); background: var(--surface); }
iframe, .poster { position: absolute; inset: 0; width: 100%; height: 100%; border: 0; }
.poster { padding: 0; cursor: pointer; background: none; }
.poster img { width: 100%; height: 100%; object-fit: cover; display: block; }
.play { position: absolute; left: 50%; top: 50%; width: 84px; height: 84px; margin: -42px 0 0 -42px; border-radius: 50%; background: var(--accent); color: var(--accent-ink); display: grid; place-items: center; box-shadow: 0 8px 28px rgb(0 0 0 / 0.25); transition: transform 0.15s; }
.play :deep(svg) { width: 34px; height: 34px; margin-left: 4px; }
.poster:hover .play, .poster:focus-visible .play { transform: scale(1.08); }
.poster:focus-visible { outline: 3px solid var(--accent); outline-offset: -3px; }
@media (max-width: 600px) { .play { width: 60px; height: 60px; margin: -30px 0 0 -30px; } .play :deep(svg) { width: 24px; height: 24px; } }
@media (prefers-reduced-motion: reduce) { .play { transition: none; } }
</style>
