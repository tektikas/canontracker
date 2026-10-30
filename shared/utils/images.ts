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
