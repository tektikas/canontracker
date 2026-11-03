<script setup lang="ts">
useHead({ title: 'Team · CanonTracker' })
const me = useMe()
const { data: team, refresh } = await useFetch('/api/team')
const ROLES: Role[] = ['owner', 'admin', 'editor', 'viewer']
const isOwner = computed(() => team.value?.role === 'owner')
const owners = computed(() => team.value?.members.filter(m => m.role === 'owner').length ?? 0)

// Invite form
const invite = reactive({ role: 'editor' as Role, days: 7 })
const inviteRoles = computed(() => ROLES.filter(r => r !== 'owner' || isOwner.value))
const created = ref<{ url: string, role: Role, expires_at: string }>()
const inviteBusy = ref(false)
const inviteError = ref('')
const origin = useRequestURL().origin
const linkFor = (token: string) => `${origin}/invite/${token}`

async function createInvite() {
  inviteBusy.value = true
  inviteError.value = ''
  try {
    const r = await $fetch('/api/team/invites', { method: 'POST', body: invite })
    created.value = { url: linkFor(r.token), role: r.role as Role, expires_at: r.expires_at }
    await refresh()
  } catch (e) {
    inviteError.value = errorMessage(e)
  } finally {
    inviteBusy.value = false
  }
}

const copied = ref('')
const copyFailed = ref('')
async function copy(text: string, key: string) {
  try {
    await navigator.clipboard.writeText(text)
    copied.value = key
    copyFailed.value = ''
    setTimeout(() => { if (copied.value === key) copied.value = '' }, 2000)
  } catch {
    // Clipboard blocked (e.g. insecure origin): select the text so it can be copied by hand.
    // Invite rows keep their link in a hidden input; showing it (copyFailed === key) lets the user copy by hand.
    copyFailed.value = key
    await nextTick()
    const input = document.getElementById(`link-${key}`) as HTMLInputElement | null
    input?.focus()
    input?.select()
  }
}

// Members
const rowError = reactive<Record<string, string>>({})
const rowBusy = ref('')
// Only owners touch owners; a studio's last owner can't be demoted or removed.
const lastOwner = (m: { role: string }) => m.role === 'owner' && owners.value <= 1
const canChange = (m: { id: string, role: string }) => !!team.value?.can_manage && (m.role !== 'owner' || isOwner.value) && !lastOwner(m)
const canRemove = (m: { id: string, role: string }) => (m.id === team.value?.user_id || canChange(m)) && !lastOwner(m)

async function memberAction(id: string, fn: () => Promise<unknown>) {
  rowBusy.value = id
  delete rowError[id]
  try {
    await fn()
  } catch (e) {
    rowError[id] = errorMessage(e)
  } finally {
    rowBusy.value = ''
    await refresh()
    if (id === team.value?.user_id) await loadMe()
  }
}
const setRole = (id: string, role: string) => memberAction(id, () => $fetch(`/api/team/${id}`, { method: 'PATCH', body: { role } }))
async function remove(m: { id: string, name: string }) {
  const self = m.id === team.value?.user_id
  const studio = team.value?.studio.name
  const ok = await askConfirm(self
    ? { title: `Leave ${studio}?`, body: 'You’ll lose access to its projects. Your past decisions stay in the audit log.', confirm: 'Leave studio', danger: true }
    : { title: `Remove ${m.name}?`, body: `${m.name} loses access to ${studio} and its projects. Their past decisions stay in the audit log.`, confirm: 'Remove', danger: true })
  if (!ok) return
  memberAction(m.id, async () => {
    await $fetch(`/api/team/${m.id}`, { method: 'DELETE' })
    if (self) rememberLeft(team.value!.studio.name)
    if (self) reloadNuxtApp({ path: '/', force: true })
  })
}
async function revoke(id: string) {
  if (!(await askConfirm({ title: 'Revoke this invite link?', body: 'Anyone who has it will no longer be able to join.', confirm: 'Revoke link', danger: true }))) return
  await memberAction(id, () => $fetch(`/api/team/invites/${id}`, { method: 'DELETE' }))
  if (created.value && team.value?.invites.every(i => linkFor(i.token) !== created.value!.url)) created.value = undefined
}

const rtf = new Intl.RelativeTimeFormat('en', { numeric: 'auto' })
const inDays = (iso: string) => {
  const hours = (new Date(iso).getTime() - Date.now()) / 36e5
  return hours < 24 ? rtf.format(Math.max(1, Math.round(hours)), 'hour') : rtf.format(Math.round(hours / 24), 'day')
}
</script>

<template>
  <div v-if="team" class="stack" style="gap: var(--s-5)">
    <UiPanel v-if="team.can_manage" title="Invite people" description="Create a link for each person you want to add. They pick a password and land in this studio with the role you choose.">
      <form class="invite-form" @submit.prevent="createInvite">
        <UiField label="Role">
          <select v-model="invite.role">
            <option v-for="r in inviteRoles" :key="r" :value="r">{{ ROLE_LABEL[r] }}</option>
          </select>
        </UiField>
        <UiField label="Link expires">
          <select v-model.number="invite.days">
            <option :value="1">In 1 day</option>
            <option :value="7">In 7 days</option>
            <option :value="30">In 30 days</option>
          </select>
        </UiField>
        <UiButton type="submit" variant="primary" icon="link" :loading="inviteBusy">Create invite link</UiButton>
      </form>
      <p class="small muted role-hint">{{ ROLE_LABEL[invite.role] }}: {{ ROLE_HELP[invite.role] }}</p>
      <p v-if="inviteError" class="notice bad" role="alert">{{ inviteError }}</p>

      <div v-if="created" class="created" role="status">
        <div class="small"><b>Invite link for one {{ ROLE_LABEL[created.role].toLowerCase() }}</b> · expires <span class="nowrap">{{ dateTime(created.expires_at) }}</span></div>
        <div class="link-row">
          <input id="link-new" :value="created.url" type="text" readonly class="mono" aria-label="Invite link" @focus="($event.target as HTMLInputElement).select()">
          <UiButton :variant="copied === 'new' ? 'good' : 'primary'" :icon="copied === 'new' ? 'check' : 'copy'" @click="copy(created.url, 'new')">{{ copied === 'new' ? 'Copied' : 'Copy link' }}</UiButton>
        </div>
        <p v-if="copyFailed === 'new'" class="small field-error" role="alert">Couldn’t copy. The link is selected; press Ctrl+C.</p>
        <p class="small muted">CanonTracker doesn’t send email yet. Paste this link to your teammate yourself, in chat or email. It works once.</p>
      </div>
    </UiPanel>

    <UiPanel :title="`Members · ${team.members.length}`" flush>
      <div class="table-wrap">
        <table class="members">
          <thead><tr><th>Person</th><th>Role</th><th class="hide-sm">Joined</th><th class="actions"><span class="sr-only">Actions</span></th></tr></thead>
          <tbody>
            <tr v-for="m in team.members" :key="m.id">
              <td>
                <div class="person">
                  <span class="avatar" aria-hidden="true">{{ initials(m.name) }}</span>
                  <div class="who">
                    <div class="name">{{ m.name }} <UiBadge v-if="m.id === team.user_id">You</UiBadge></div>
                    <div class="small muted email">{{ m.email }}</div>
                    <div v-if="rowError[m.id]" class="field-error" role="alert">{{ rowError[m.id] }}</div>
                  </div>
                </div>
              </td>
              <td>
                <select v-if="canChange(m)" :value="m.role" class="role-select" :aria-label="`Role for ${m.name}`" :disabled="rowBusy === m.id" @change="setRole(m.id, ($event.target as HTMLSelectElement).value)">
                  <option v-for="r in ROLES.filter(r => r !== 'owner' || isOwner)" :key="r" :value="r">{{ ROLE_LABEL[r] }}</option>
                </select>
                <span v-else class="role-static" :title="lastOwner(m) ? 'A studio needs at least one owner.' : undefined">
                  <UiBadge :tone="m.role === 'owner' ? 'accent' : 'neutral'">{{ ROLE_LABEL[m.role] }}</UiBadge>
                  <span v-if="lastOwner(m) && team.can_manage" class="small faint hide-sm">Only owner</span>
                </span>
              </td>
              <td class="hide-sm muted small">{{ shortDate(m.joined_at) }}</td>
              <td class="actions">
                <UiButton v-if="canRemove(m)" size="sm" :variant="m.id === team.user_id ? 'ghost' : 'danger'" :loading="rowBusy === m.id" @click="remove(m)">
                  {{ m.id === team.user_id ? 'Leave' : 'Remove' }}
                </UiButton>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <p v-if="team.can_manage && owners === 1" class="small faint table-note">A studio always keeps at least one owner. To hand it over, make someone else an owner first.</p>
    </UiPanel>

    <UiPanel v-if="team.can_manage" :title="`Open invite links · ${team.invites.length}`" flush>
      <UiEmptyState v-if="!team.invites.length" icon="link" title="No open invite links">
        Links you create show up here until someone uses them, they expire or you revoke them.
      </UiEmptyState>
      <ul v-else class="invites">
        <li v-for="i in team.invites" :key="i.id">
          <div class="invite-meta">
            <div><UiBadge>{{ ROLE_LABEL[i.role as Role] }}</UiBadge> <span class="small muted">created by {{ i.created_by_name }} · expires {{ inDays(i.expires_at) }}</span></div>
            <div v-if="rowError[i.id]" class="field-error" role="alert">{{ rowError[i.id] }}</div>
          </div>
          <div class="row">
            <input :id="`link-${i.id}`" :value="linkFor(i.token)" type="text" readonly :class="copyFailed === i.id ? 'mono link-open' : 'sr-only'" :tabindex="copyFailed === i.id ? 0 : -1" :aria-hidden="copyFailed === i.id ? undefined : 'true'" aria-label="Invite link">
            <span v-if="copyFailed === i.id" class="small field-error" role="alert">Couldn’t copy. The link is selected; press Ctrl+C.</span>
            <UiButton size="sm" :variant="copied === i.id ? 'good' : 'secondary'" :icon="copied === i.id ? 'check' : 'copy'" @click="copy(linkFor(i.token), i.id)">{{ copied === i.id ? 'Copied' : 'Copy link' }}</UiButton>
            <UiButton size="sm" variant="danger" :loading="rowBusy === i.id" @click="revoke(i.id)">Revoke</UiButton>
          </div>
        </li>
      </ul>
    </UiPanel>

    <UiPanel title="What each role can do" sunk>
      <dl class="roles">
        <template v-for="r in ROLES" :key="r">
          <dt><UiBadge :tone="r === me?.current?.role ? 'accent' : 'neutral'">{{ ROLE_LABEL[r] }}</UiBadge></dt>
          <dd class="small">{{ ROLE_HELP[r] }}</dd>
        </template>
      </dl>
    </UiPanel>
  </div>
</template>

<style scoped>
.nowrap { white-space: nowrap; }
.sr-only { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }
.invite-form { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr) auto; gap: var(--s-3); align-items: end; }
.role-hint { margin: var(--s-2) 0 0; }
.invite-form + .role-hint + .notice { margin-top: var(--s-3); }
.created { display: grid; gap: var(--s-2); margin-top: var(--s-4); padding: var(--s-4); border: 1px solid color-mix(in srgb, var(--good) 35%, var(--line)); border-radius: var(--r-md); background: var(--good-soft); }
.created p { margin: 0; }
.link-row { display: flex; gap: var(--s-2); }
.link-open { flex: 1 1 100%; font-size: var(--text-sm); }
.link-row input { flex: 1; min-width: 0; font-size: var(--text-sm); }

.person { display: flex; gap: var(--s-3); align-items: center; }
.who { min-width: 0; }
.name { font-weight: 500; display: flex; gap: var(--s-2); align-items: center; flex-wrap: wrap; }
.email { overflow-wrap: anywhere; }
.avatar { display: grid; place-items: center; flex: none; width: 32px; height: 32px; border-radius: 50%; background: var(--accent-soft); color: var(--accent); font-size: var(--text-xs); font-weight: 700; }
td { vertical-align: middle; }
.role-select { width: auto; min-width: 116px; }
.role-static { display: inline-flex; gap: var(--s-2); align-items: center; }
.actions { text-align: right; width: 1%; white-space: nowrap; }
.table-note { margin: 0; padding: var(--s-3) var(--s-5); border-top: 1px solid var(--line); }

.invites { list-style: none; margin: 0; padding: 0; }
.invites li { display: flex; gap: var(--s-3); align-items: center; justify-content: space-between; flex-wrap: wrap; padding: var(--s-3) var(--s-5); }
.invites li + li { border-top: 1px solid var(--line); }
.panel-head + .invites { border-top: 1px solid var(--line); margin-top: var(--s-4); }

.roles { display: grid; grid-template-columns: 90px 1fr; gap: var(--s-3) var(--s-4); margin: 0; align-items: center; }
.roles dd { margin: 0; color: var(--ink); }

@media (max-width: 720px) {
  .invite-form { grid-template-columns: 1fr 1fr; }
  .invite-form .btn { grid-column: 1 / -1; }
  .link-row { flex-direction: column; }
  .invites li { padding: var(--s-3) var(--s-4); }
  .table-note { padding: var(--s-3) var(--s-4); }
  /* Members table becomes stacked rows: person on top, role and action below. */
  .members thead { display: none; }
  .members tr { display: grid; grid-template-columns: 1fr auto; gap: var(--s-2) var(--s-3); align-items: center; padding: var(--s-3) var(--s-4); border-bottom: 1px solid var(--line); }
  .members tbody tr:last-child { border-bottom: 0; }
  .members td { padding: 0 !important; border: 0; }
  .members td:first-child { grid-column: 1 / -1; }
  .role-select { min-width: 140px; }
}
</style>
