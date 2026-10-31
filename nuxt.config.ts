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
        { name: 'description', content: 'Human-approved, source-cited narrative canon and change impact for game teams.' },
        { property: 'og:type', content: 'website' },
        { property: 'og:site_name', content: 'Story Bible' },
        { property: 'og:title', content: 'Story Bible · Narrative canon and impact QA' },
        { property: 'og:description', content: 'Human-approved, source-cited narrative canon and change impact for game teams.' },
        { property: 'og:image', content: 'https://storybible.trythis.work/og-default.png' },
        { property: 'og:image:width', content: '1200' },
        { property: 'og:image:height', content: '630' },
        { property: 'og:image:type', content: 'image/png' },
        { property: 'og:image:alt', content: 'Story Bible — Narrative canon, committed in ink.' },
        { name: 'twitter:card', content: 'summary_large_image' },
        { name: 'twitter:title', content: 'Story Bible · Narrative canon and impact QA' },
        { name: 'twitter:description', content: 'Human-approved, source-cited narrative canon and change impact for game teams.' },
        { name: 'twitter:image', content: 'https://storybible.trythis.work/og-default.png' },
        { name: 'twitter:image:alt', content: 'Story Bible — Narrative canon, committed in ink.' },
        { name: 'theme-color', content: '#1f4f82' },
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
  runtimeConfig: {
    modelMode: 'mock', // NUXT_MODEL_MODE=meta to call the Meta Model API
    modelId: 'muse-spark-1.3', // NUXT_MODEL_ID
    imageModelId: 'muse-image-1.0', // NUXT_IMAGE_MODEL_ID
    metaApiKey: '', // NUXT_META_API_KEY, used as stored in pass
    metaBaseUrl: 'https://api.meta.ai/v1', // NUXT_META_BASE_URL
  },
})
