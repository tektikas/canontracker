import type { InternalApi } from 'nitropack/types'

export type ImageItem = InternalApi['/api/images']['get']['images'][number]
export type ImageUploadResponse = InternalApi['/api/images/upload']['post']

// The server's limits, checked first so a person hears at once. The server judges the bytes again (a renamed file is caught there).
export function imageUploadProblem(f: File) {
  if (f.size > IMAGE_MAX_BYTES) return `Too large: ${(f.size / 1e6).toFixed(1)} MB, images can be up to ${IMAGE_MAX_BYTES / 1e6} MB.`
  const typed = f.type ? (IMAGE_UPLOAD_TYPES as readonly string[]).includes(f.type) : /\.(png|jpe?g|webp|gif)$/i.test(f.name)
  if (!typed) return 'Not a PNG, JPEG, WebP or GIF image.'
  if (!f.size) return 'Empty file.'
  return null
}

// One upload request. XMLHttpRequest because fetch can't report upload progress; onProgress gets the bytes sent so far.
export function sendImages(type: ImageTarget, id: string, files: File[], opts: { apply?: boolean, onProgress?: (loaded: number) => void } = {}) {
  const form = new FormData()
  form.append('target_type', type)
  form.append('target_id', id)
  if (opts.apply) form.append('apply', '1')
  for (const f of files) form.append('files', f, f.name)
  return new Promise<ImageUploadResponse>((resolve, reject) => {
    const x = new XMLHttpRequest()
    x.open('POST', '/api/images/upload')
    x.responseType = 'json'
    x.upload.onprogress = e => opts.onProgress?.(e.loaded)
    x.onload = () => (x.status < 300 ? resolve(x.response) : reject(new Error(x.response?.message || `The server didn’t respond (${x.status}).`)))
    x.onerror = () => reject(new Error('Couldn’t reach the server. Check your connection.'))
    x.send(form)
  })
}

// File name for "Download original": an upload keeps its own; a generated image is named after its page.
export const imageFileName = (i: ImageItem, name: string) =>
  i.filename || `${name.replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, '').toLowerCase() || 'image'}-${i.id.slice(-6)}.${i.mime.split('/')[1]!.replace('jpeg', 'jpg')}`
