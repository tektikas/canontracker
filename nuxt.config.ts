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
      meta: [{ name: 'description', content: 'Human-approved, source-cited narrative canon and change impact for game teams.' }],
      link: [
        { rel: 'preconnect', href: 'https://fonts.googleapis.com' },
        { rel: 'preconnect', href: 'https://fonts.gstatic.com', crossorigin: '' },
        { rel: 'stylesheet', href: 'https://fonts.googleapis.com/css2?family=Instrument+Sans:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&family=Literata:ital,opsz,wght@0,7..72,400;0,7..72,500;1,7..72,400&display=swap' },
        { rel: 'icon', href: '/favicon.svg', type: 'image/svg+xml' },
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
  },
})
