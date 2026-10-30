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
  runtimeConfig: {
    modelMode: 'mock', // NUXT_MODEL_MODE=llama to call the Meta Llama API
    modelId: '', // NUXT_MODEL_ID
    llamaApiKey: '', // NUXT_LLAMA_API_KEY (LLM|<app_id>|<token>)
    llamaBaseUrl: 'https://api.llama.com/compat/v1',
  },
})
