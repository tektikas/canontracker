// Optimises generated sources into public/art/<name>.webp with the system ImageMagick (no app dependency).
//   node scripts/brand/optimise-art.mjs <source dir>
// The background is flood-filled from the corners to the exact linen #f4f0e8 (the generator's paper drifts a few
// shades), so every plate matches LandingArt's background. Hero 960px, spots 400px (2× their largest display size).
import { readdirSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { execFileSync } from 'node:child_process'

const src = process.argv[2]
if (!src) throw new Error('Usage: node scripts/brand/optimise-art.mjs <source dir>')
mkdirSync('public/art', { recursive: true })
for (const file of readdirSync(src).filter(f => f.endsWith('.png'))) {
  const name = file.replace(/\.png$/, '')
  const size = name === 'story-world' ? 960 : 400
  const [w, h] = execFileSync('magick', ['identify', '-format', '%w %h', join(src, file)], { encoding: 'utf8' }).split(' ').map(n => Number(n) - 1)
  const fill = ['0,0', `${w},0`, `0,${h}`, `${w},${h}`]
  execFileSync('magick', [
    join(src, file), '-alpha', 'off', '-fuzz', '3%', '-fill', '#f4f0e8',
    ...fill.flatMap(p => ['-draw', `color ${p} floodfill`]),
    '-resize', `${size}x${size}`, '-strip', '-quality', '80', '-define', 'webp:method=6', `public/art/${name}.webp`,
  ])
  console.log(`${name}: ${size}px`)
}
