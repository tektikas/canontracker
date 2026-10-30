// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  compatibilityDate: '2025-07-15',
  devtools: { enabled: true },
  css: ['~/assets/main.css'],
  app: {
    head: {
      title: 'Story Bible',
      htmlAttrs: { lang: 'en' },
      meta: [{ name: 'description', content: 'Human-approved, source-cited narrative canon and change impact for game teams.' }],
    },
  },
  runtimeConfig: {
    modelMode: 'mock', // NUXT_MODEL_MODE=llama to call the Meta Llama API
    modelId: '', // NUXT_MODEL_ID
    llamaApiKey: '', // NUXT_LLAMA_API_KEY (LLM|<app_id>|<token>)
    llamaBaseUrl: 'https://api.llama.com/compat/v1',
  },
})
