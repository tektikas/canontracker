<script setup lang="ts">
const { data: pending, refresh } = await useFetch('/api/facts', { query: { status: 'pending' } })
const { data: rejected, refresh: refreshRejected } = await useFetch('/api/facts', { query: { status: 'rejected' } })

interface CardState { mode: 'idle' | 'edit' | 'reject', rationale: string, statement: string, subject: string, predicate: string, object: string, error: string, busy: boolean }
const ui = reactive<Record<string, CardState>>({})
const state = (f: Record<string, any>) => (ui[f.id] ??= {
  mode: 'idle', rationale: '', statement: f.statement, subject: f.subject, predicate: f.predicate, object: f.object ?? '', error: '', busy: false,
})
const verified = (f: Record<string, any>) => f.evidence.some((e: any) => e.verified)

async function decide(f: Record<string, any>, decision: 'accept' | 'correct_and_accept' | 'reject') {
  const s = state(f)
  s.busy = true
  s.error = ''
  try {
    await $fetch(`/api/facts/${f.id}/review`, {
      method: 'POST',
      body: {
        decision,
        rationale: s.rationale,
        corrected: decision === 'correct_and_accept' ? { statement: s.statement, subject: s.subject, predicate: s.predicate, object: s.object } : undefined,
      },
    })
  } catch (e) {
    s.error = errorMessage(e)
    return
  } finally {
    s.busy = false
  }
  // Not awaited: a newer refresh cancels an older one, and a cancelled refresh never settles.
  refresh()
  refreshRejected()
  refreshNuxtData('stats')
}
</script>

<template>
  <div class="page-head">
    <h1>Review queue</h1>
    <p>Each candidate was proposed by the model with a quote. Nothing here is canon until you accept it. Quotes that don't appear verbatim in the source can't be accepted.</p>
  </div>

  <div v-if="!pending?.length" class="card empty">
    Nothing waiting for review. <NuxtLink to="/canon">Browse canon →</NuxtLink>
  </div>

  <div class="stack">
    <article v-for="f in pending" :key="f.id" class="card stack">
      <div class="spread">
        <span class="small muted">Proposed by <span class="mono">{{ f.model_id }}</span> · confidence {{ percent(f.confidence) }}</span>
        <span v-if="!verified(f)" class="chip bad">Cannot accept: unverified quote</span>
      </div>

      <FactSummary v-if="state(f).mode !== 'edit'" :fact="f" />
      <div v-else class="stack">
        <label>Statement<textarea v-model="state(f).statement" rows="2" /></label>
        <div class="grid-2 grid-3">
          <label>Subject<input v-model="state(f).subject" type="text"></label>
          <label>Predicate<input v-model="state(f).predicate" type="text"></label>
          <label>Object<input v-model="state(f).object" type="text"></label>
        </div>
      </div>

      <SourceRef v-for="ev in f.evidence" :key="ev.id" :ev="ev" />

      <label v-if="state(f).mode !== 'idle'">
        Rationale{{ state(f).mode === 'reject' ? ' (required)' : '' }}
        <input v-model="state(f).rationale" type="text" :placeholder="state(f).mode === 'reject' ? 'e.g. Figurative, not a literal relationship' : 'Optional'">
      </label>

      <p v-if="state(f).error" class="notice bad" role="alert">{{ state(f).error }}</p>

      <div class="row">
        <template v-if="state(f).mode === 'idle'">
          <button class="btn primary" :disabled="state(f).busy || !verified(f)" @click="decide(f, 'accept')">Accept</button>
          <button class="btn" :disabled="state(f).busy || !verified(f)" @click="state(f).mode = 'edit'">Edit &amp; accept</button>
          <button class="btn danger" :disabled="state(f).busy" @click="state(f).mode = 'reject'">Reject…</button>
        </template>
        <template v-else-if="state(f).mode === 'edit'">
          <button class="btn primary" :disabled="state(f).busy" @click="decide(f, 'correct_and_accept')">Save &amp; accept</button>
          <button class="btn" @click="state(f).mode = 'idle'">Cancel</button>
        </template>
        <template v-else>
          <button class="btn danger" :disabled="state(f).busy || !state(f).rationale.trim()" @click="decide(f, 'reject')">Confirm reject</button>
          <button class="btn" @click="state(f).mode = 'idle'">Cancel</button>
        </template>
      </div>
    </article>
  </div>

  <section v-if="rejected?.length" style="margin-top: 28px">
    <h2>Rejected</h2>
    <p class="small muted">Kept for the audit trail; never part of canon.</p>
    <div class="stack">
      <div v-for="f in rejected" :key="f.id" class="card">
        <div class="statement diff-old">{{ f.statement }}</div>
        <div class="small muted">Reason: {{ f.rationale }}</div>
      </div>
    </div>
  </section>
</template>
