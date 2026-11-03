// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  compatibilityDate: '2025-07-15',
  devtools: { enabled: true },
  modules: ['nuxt-auth-utils'], // sealed httpOnly session cookie; needs NUXT_SESSION_PASSWORD (32+ chars)
  // Lets server utils (audit, scoped queries) read the request's user and project without threading the event through.
  nitro: { experimental: { asyncContext: true } },
  css: ['~/assets/main.css'],
  app: {
    head: {
      title: 'Story Bible',
      viewport: 'width=device-width, initial-scale=1, viewport-fit=cover',
      htmlAttrs: { lang: 'en' },
      meta: [
        { name: 'description', content: 'Human-approved, source-cited narrative canon and change impact for anyone building a story world.' },
        { property: 'og:type', content: 'website' },
        { property: 'og:site_name', content: 'Story Bible' },
        { property: 'og:title', content: 'Story Bible · A story builder with canon you can cite' },
        { property: 'og:description', content: 'Human-approved, source-cited narrative canon and change impact for anyone building a story world.' },
        { property: 'og:image', content: 'https://storybible.trythis.work/og-default.png' },
        { property: 'og:image:width', content: '1200' },
        { property: 'og:image:height', content: '630' },
        { property: 'og:image:type', content: 'image/png' },
        { property: 'og:image:alt', content: 'Story Bible: story canon, committed in ink.' },
        { name: 'twitter:card', content: 'summary_large_image' },
        { name: 'twitter:title', content: 'Story Bible · A story builder with canon you can cite' },
        { name: 'twitter:description', content: 'Human-approved, source-cited narrative canon and change impact for anyone building a story world.' },
        { name: 'twitter:image', content: 'https://storybible.trythis.work/og-default.png' },
        { name: 'twitter:image:alt', content: 'Story Bible: story canon, committed in ink.' },
        { name: 'theme-color', content: '#733816' },
      ],
      // Apply a saved theme before first paint (see app/composables/theme.ts).
      script: [{ innerHTML: `try{var t=localStorage.getItem('sb-theme');if(t)document.documentElement.dataset.theme=t}catch(e){}` }],
      link: [
        { rel: 'preconnect', href: 'https://fonts.googleapis.com' },
        { rel: 'preconnect', href: 'https://fonts.gstatic.com', crossorigin: '' },
        { rel: 'stylesheet', href: 'https://fonts.googleapis.com/css2?family=Instrument+Sans:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&family=Literata:ital,opsz,wght@0,7..72,400;0,7..72,500;1,7..72,400&display=swap' },
        { rel: 'icon', href: '/favicon.ico', sizes: '16x16 32x32', type: 'image/x-icon' },
        { rel: 'icon', href: '/favicon.svg', sizes: 'any', type: 'image/svg+xml' },
        { rel: 'apple-touch-icon', href: '/apple-touch-icon.png', sizes: '180x180' },
        { rel: 'manifest', href: '/site.webmanifest' },
      ],
    },
  },
  // Share pages carry a secret in the URL: never cached, indexed or sent on as a referrer.
  routeRules: { '/share/**': { headers: { 'cache-control': 'no-store', 'x-robots-tag': 'noindex', 'referrer-policy': 'no-referrer' } } },
  runtimeConfig: {
    modelMode: 'mock', // NUXT_MODEL_MODE=meta to call the Meta Model API
    modelId: 'muse-spark-1.3', // NUXT_MODEL_ID
    imageModelId: 'muse-image-1.0', // NUXT_IMAGE_MODEL_ID
    metaApiKey: '', // NUXT_META_API_KEY, used as stored in pass
    metaBaseUrl: 'https://api.meta.ai/v1', // NUXT_META_BASE_URL
    criticModelId: '', // NUXT_CRITIC_MODEL_ID: the AI critic's model; empty = modelId
    criticEffort: 'low', // NUXT_CRITIC_EFFORT=off | low | high: candidates per AI critic call and per run (server/utils/critic.ts)
    criticReasoningEffort: '', // NUXT_CRITIC_REASONING_EFFORT=minimal | low | medium | high; empty = by NUXT_CRITIC_EFFORT (low: low, flags re-read at medium; high: medium, re-read at high)
    // Muse Voice Transcribe. Base URL and key default to the ones above; mode ENDPOINTING (turns with times) or DIARIZATION.
    transcribeModelId: 'muse-voice-transcribe-1.0', // NUXT_TRANSCRIBE_MODEL_ID
    transcribeMode: 'ENDPOINTING', // NUXT_TRANSCRIBE_MODE
    transcribeBaseUrl: '', // NUXT_TRANSCRIBE_BASE_URL
    transcribeApiKey: '', // NUXT_TRANSCRIBE_API_KEY
    transcribeApi: 'meta', // NUXT_TRANSCRIBE_API: meta (/asr/transcribe) | openai (an /audio/transcriptions stand-in, for tests)
  },
})
