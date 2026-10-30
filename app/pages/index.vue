<script setup lang="ts">
const { data: stats } = await useFetch('/api/stats', { key: 'stats' })
const { data: docs, refresh: refreshDocs } = await useFetch('/api/documents')
const busy = ref(false)
const error = ref('')
const results = ref<Record<string, any>[]>([])

async function run(fn: () => Promise<{ results: Record<string, any>[] }>) {
  busy.value = true
  error.value = ''
  try {
    results.value = (await fn()).results
    await Promise.all([refreshDocs(), refreshNuxtData('stats')])
  } catch (e) {
    error.value = errorMessage(e)
  } finally {
    busy.value = false
  }
}

function loadDemo() {
  if (stats.value?.documents && !confirm('Replace all local data with the Broken Tide demo set?')) return
  run(() => $fetch('/api/demo/load', { method: 'POST' }))
}

function upload(e: Event) {
  const input = e.target as HTMLInputElement
  if (!input.files?.length) return
  const form = new FormData()
  for (const f of input.files) form.append('files', f)
  run(() => $fetch('/api/documents', { method: 'POST', body: form }))
  input.value = ''
}

const cards = computed(() => stats.value ? [
  { label: 'Documents', value: stats.value.documents, sub: `${stats.value.scenes} scenes` },
  { label: 'Awaiting review', value: stats.value.pending, to: '/review' },
  { label: 'Canon facts', value: stats.value.canon, to: '/canon' },
  { label: 'Open conflicts', value: stats.value.open_conflicts, to: '/conflicts' },
  { label: 'Change proposals', value: stats.value.changes, to: '/changes' },
  { label: 'Audit events', value: stats.value.audit_events, to: '/audit' },
] : [])
</script>

<template>
  <div class="page-head">
    <h1>Narrative canon you can trace</h1>
    <p>Import lore and scenes read-only. The model proposes facts with an exact quote; only facts a person accepts become canon. Then check conflicts and see what a canon change would touch before it reaches a build.</p>
  </div>

  <div v-if="stats?.model.mode === 'mock'" class="notice warn" style="margin-bottom: 14px">
    {{ stats.model.label }}: candidates come from a recorded extraction run, not a live model call.
  </div>

  <div class="stats" style="margin-bottom: 20px">
    <template v-for="c in cards" :key="c.label">
      <NuxtLink v-if="c.to" :to="c.to" class="card stat"><b>{{ c.value }}</b><span>{{ c.label }}</span></NuxtLink>
      <div v-else class="card stat"><b>{{ c.value }}</b><span>{{ c.label }}<template v-if="c.sub"> · {{ c.sub }}</template></span></div>
    </template>
  </div>

  <div class="grid-2" style="margin-bottom: 20px">
    <section class="card stack">
      <h2>Demo dataset</h2>
      <p class="muted small">"Broken Tide": an original, synthetic island story with 2 lore docs and 10 scenes. Loading it resets local data.</p>
      <div><button class="btn primary" :disabled="busy" @click="loadDemo">Load Broken Tide</button></div>
    </section>
    <section class="card stack">
      <h2>Import documents</h2>
      <p class="muted small">Markdown or plain text, up to 1 MB each. Files are stored read-only with a SHA-256 hash; re-importing the same file is detected.</p>
      <label class="btn" :class="{ disabled: busy }" style="width: fit-content">
        Choose files…
        <input type="file" accept=".md,.markdown,.txt" multiple hidden :disabled="busy" @change="upload">
      </label>
    </section>
  </div>

  <p v-if="busy" class="notice info">Importing and extracting candidates…</p>
  <p v-if="error" class="notice bad" role="alert">{{ error }}</p>

  <section v-if="results.length" class="card" style="margin-bottom: 20px">
    <h2>Import results</h2>
    <div class="table-wrap">
      <table>
        <thead><tr><th>File</th><th>Result</th><th>Passages</th><th>Candidates</th></tr></thead>
        <tbody>
          <tr v-for="r in results" :key="r.filename">
            <td>{{ r.filename }}</td>
            <td>
              <span v-if="r.status === 'imported'" class="chip good">Imported v{{ r.version }}</span>
              <span v-else-if="r.status === 'duplicate'" class="chip warn">Already imported</span>
              <span v-else class="chip bad">{{ r.error }}</span>
              <div v-if="r.extraction_error" class="small" style="color: var(--bad)">Extraction failed: {{ r.extraction_error }}</div>
            </td>
            <td>{{ r.passages ?? '—' }}</td>
            <td>
              {{ r.candidates ?? '—' }}
              <span v-if="r.unverified" class="chip bad">{{ r.unverified }} unverified</span>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
    <p class="small" style="margin-top: 10px"><NuxtLink to="/review">Review candidates →</NuxtLink></p>
  </section>

  <section class="card">
    <h2>Documents</h2>
    <div v-if="!docs?.length" class="empty">No documents yet. Load the demo set or import your own files.</div>
    <div v-else class="table-wrap">
      <table>
        <thead><tr><th>Title</th><th>Type</th><th>Version</th><th>Passages</th><th>Canon facts</th><th>SHA-256</th></tr></thead>
        <tbody>
          <tr v-for="d in docs" :key="String(d.id)">
            <td><NuxtLink :to="`/documents/${d.id}`">{{ d.title }}</NuxtLink></td>
            <td><span class="chip">{{ d.kind }}</span></td>
            <td>v{{ d.version }}</td>
            <td>{{ d.passages }}</td>
            <td>{{ d.canon_facts }}</td>
            <td class="mono muted">{{ String(d.sha256).slice(0, 10) }}…</td>
          </tr>
        </tbody>
      </table>
    </div>
  </section>
</template>
