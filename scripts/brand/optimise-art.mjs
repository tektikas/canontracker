// Optimises generated sources into public/art/<name>.webp with the system ImageMagick (no app dependency).
//   node scripts/brand/optimise-art.mjs <source dir>
// Sources are BiRefNet cut-outs (transparent, see README): their alpha is kept, so the drawing sits on the page in either
// theme with no plate. A source without alpha falls back to flood-filling its linen ground from the corners.
// Hero 960px, spots 400px (2× their largest display size).
import { readdirSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { execFileSync } from 'node:child_process'

const src = process.argv[2]
if (!src) throw new Error('Usage: node scripts/brand/optimise-art.mjs <source dir>')
mkdirSync('public/art', { recursive: true })
for (const file of readdirSync(src).filter(f => f.endsWith('.png'))) {
  const name = file.replace(/\.png$/, '')
  const size = name === 'story-world' ? 960 : 400
  const [w, h, channels] = execFileSync('magick', ['identify', '-format', '%w %h %[channels]', join(src, file)], { encoding: 'utf8' }).split(' ')
  const ground = channels.includes('a') ? [] : ['-alpha', 'off', '-fuzz', '3%', '-fill', '#f4f0e8',
    ...['0,0', `${+w - 1},0`, `0,${+h - 1}`, `${+w - 1},${+h - 1}`].flatMap(p => ['-draw', `color ${p} floodfill`])]
  execFileSync('magick', [
    join(src, file), ...ground,
    '-resize', `${size}x${size}`, '-strip', '-quality', '82', '-define', 'webp:alpha-quality=90', '-define', 'webp:method=6', `public/art/${name}.webp`,
  ])
  console.log(`${name}: ${size}px`)
}
