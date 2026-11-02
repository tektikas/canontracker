// Image prompts are composed the same way in the dialog preview and on the server, so what the writer sees is what
// Muse Image gets and what is stored with the image.
export const IMAGE_STYLES = {
  none: { label: 'No preset', prompt: '' },
  concept: { label: 'Concept art', prompt: 'Concept art, clean silhouettes, readable shapes, muted palette.' },
  ink: { label: 'Ink and wash', prompt: 'Ink and wash illustration, loose linework, limited palette, paper texture.' },
  painterly: { label: 'Painterly', prompt: 'Painterly digital illustration, visible brush strokes, soft atmospheric light.' },
  cel: { label: 'Cel shaded', prompt: 'Cel-shaded game art, bold outlines, flat colour blocks.' },
  photo: { label: 'Photographic', prompt: 'Photographic, natural light, shallow depth of field.' },
} as const
export type ImageStyle = keyof typeof IMAGE_STYLES
export const IMAGE_TARGETS = ['entity', 'document'] as const
export type ImageTarget = typeof IMAGE_TARGETS[number]

export const composeImagePrompt = (prompt: string, style: ImageStyle, artStyle: string) =>
  [prompt.trim(), IMAGE_STYLES[style].prompt, artStyle.trim() && `Project art style: ${artStyle.trim()}`].filter(Boolean).join('\n\n')

// One deadline for the whole generation (API call, its body and every download); the dialog shows the same number.
export const IMAGE_DEADLINE_MS = 150_000

// What the picture is called on screen: characters get a portrait, documents a cover, every other page just an image.
export const imageNoun = (type: ImageTarget, kind?: string) => (type === 'document' ? 'cover' : kind === 'character' || kind === 'npc' ? 'portrait' : 'image')

// Uploads: raster only (checked by magic bytes on the server), one size cap per file, and a pixel cap so a small file can't
// unpack into a picture no browser can draw. The client checks the same numbers first for instant feedback.
export const IMAGE_UPLOAD_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'] as const
export const IMAGE_MAX_BYTES = 10_000_000
export const IMAGE_MAX_SIDE = 12_000
export const IMAGE_MAX_PIXELS = 50_000_000
// Animated GIF/WebP: frames per file; IMAGE_MAX_PIXELS then caps the pixels decoded across all frames.
export const IMAGE_MAX_FRAMES = 1_000
// Files per upload request; the page splits a bigger drop into several.
export const IMAGE_BATCH_FILES = 8
export const IMAGE_CAPTION_MAX = 300
export type ImageSource = 'generated' | 'upload'
