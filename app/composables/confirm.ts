// In-app confirmation instead of the browser's confirm(): `if (!(await askConfirm({ … }))) return`. One request at a time;
// a new one cancels the open one. The dialog itself is <UiConfirm> in app.vue.
export interface ConfirmRequest { title: string, body?: string, confirm: string, cancel?: string, danger?: boolean }
const current = shallowRef<(ConfirmRequest & { resolve: (ok: boolean) => void }) | null>(null)

export function askConfirm(req: ConfirmRequest): Promise<boolean> {
  current.value?.resolve(false)
  return new Promise(resolve => { current.value = { ...req, resolve } })
}
export const useConfirmRequest = () => current
