// Optimises generated sources into public/art/<name>.webp with the system ImageMagick (no app dependency).
//   node scripts/brand/optimise-art.mjs <source dir>
//   node scripts/brand/optimise-art.mjs --graphite (neutralise existing shipped cut-outs, preserving alpha)
// Sources are BiRefNet cut-outs (transparent, see README): their alpha is kept, so the drawing sits on the page in either
// theme with no plate. A source without alpha falls back to flood-filling its linen ground from the corners.
// Hero 960px, pitch-deck drawings 800px, spots 400px (about 2× their largest display size).
import { readdirSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { execFileSync } from 'node:child_process'

const src = process.argv[2]
if (!src) throw new Error('Usage: node scripts/brand/optimise-art.mjs <source dir> | --graphite')
mkdirSync('public/art', { recursive: true })
if (src === '--graphite') {
  for (const file of readdirSync('public/art').filter(f => f.endsWith('.webp'))) {
    const path = join('public/art', file)
    // Lossless encoding keeps the existing alpha and dimensions; no second lossy compression of the drawing.
    execFileSync('magick', [path, '-colorspace', 'Gray', '-colorspace', 'sRGB', '-strip', '-define', 'webp:lossless=true', path])
    console.log(`${file}: neutral graphite, alpha preserved`)
  }
} else for (const file of readdirSync(src).filter(f => f.endsWith('.png'))) {
  const name = file.replace(/\.png$/, '')
  const size = name === 'story-world' ? 960 : name.startsWith('pitch-') ? 800 : 400
  const [w, h, channels] = execFileSync('magick', ['identify', '-format', '%w %h %[channels]', join(src, file)], { encoding: 'utf8' }).split(' ')
  const ground = channels.includes('a') ? [] : ['-alpha', 'off', '-fuzz', '3%', '-fill', '#f2f3f5',
    ...['0,0', `${+w - 1},0`, `0,${+h - 1}`, `${+w - 1},${+h - 1}`].flatMap(p => ['-draw', `color ${p} floodfill`])]
  execFileSync('magick', [
    join(src, file), ...ground,
    '-resize', `${size}x${size}`, '-strip', '-quality', '82', '-define', 'webp:alpha-quality=90', '-define', 'webp:method=6', `public/art/${name}.webp`,
  ])
  console.log(`${name}: ${size}px`)
}
