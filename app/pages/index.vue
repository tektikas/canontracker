<script setup lang="ts">
// Signed out: the public landing page. Signed in: the current project's home inside the app shell.
definePageMeta({ layout: false })
const me = useMe()
</script>

<template>
  <NuxtLayout v-if="me?.user" name="default"><ProjectHome /></NuxtLayout>
  <LandingPage v-else />
</template>
