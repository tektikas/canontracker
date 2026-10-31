// A drop target for files on one element: spread `on` with v-on. Counting enter/leave keeps `over` steady while the
// pointer crosses child elements. Text or links dragged in are left alone.
export function useFileDrop(onFiles: (files: File[]) => void, enabled: () => boolean = () => true) {
  const over = ref(false)
  let depth = 0
  const has = (e: DragEvent) => enabled() && !!e.dataTransfer?.types.includes('Files')
  const on = {
    dragenter: (e: DragEvent) => { if (!has(e)) return; e.preventDefault(); depth++; over.value = true },
    dragover: (e: DragEvent) => { if (!has(e)) return; e.preventDefault(); e.dataTransfer!.dropEffect = 'copy' },
    dragleave: (e: DragEvent) => { if (!has(e)) return; depth = Math.max(0, depth - 1); if (!depth) over.value = false },
    drop: (e: DragEvent) => {
      if (!has(e)) return
      e.preventDefault()
      e.stopPropagation()
      depth = 0
      over.value = false
      onFiles([...e.dataTransfer!.files])
    },
  }
  return { over, on }
}
