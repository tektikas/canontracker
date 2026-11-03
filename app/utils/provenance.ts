// Provenance comes from the stored model_id of the data itself, never from the current runtime mode.
// A stored id is one model id, or several joined with ' + ' (evaluations over mixed data); '' means no model output.
export const isRecordedModel = (id: string | null | undefined) => !!id?.startsWith('mock:')

const MODEL_NAMES: Record<string, string> = { 'muse-spark-1.3': 'Muse Spark 1.3', 'muse-image-1.0': 'Muse Image 1.0' }
export const modelLabel = (id: string | null | undefined) =>
  !id ? 'No model output' : isRecordedModel(id) ? 'AI' : `${MODEL_NAMES[id] ?? id} via Meta Model API`

export function provenance(id: string | null | undefined): { kind: 'recorded' | 'live' | 'mixed' | 'none', label: string } {
  const parts = (id ?? '').split(' + ').filter(Boolean)
  if (!parts.length) return { kind: 'none', label: 'No model output' }
  const rec = parts.filter(isRecordedModel).length
  const label = [...new Set(parts.map(modelLabel))].join(' + ')
  return { kind: rec === parts.length ? 'recorded' : rec ? 'mixed' : 'live', label }
}
