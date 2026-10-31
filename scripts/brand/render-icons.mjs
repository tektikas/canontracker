// Requires the existing system ImageMagick installation; adds no app dependencies.
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { execFileSync } from 'node:child_process'

const workdir = mkdtempSync(join(tmpdir(), 'story-bible-icons-'))
try {
  const mark = readFileSync('public/brand/mark.svg', 'utf8')
    .replace(/<style>[\s\S]*?<\/style>/, '')
    .replace(/<svg[^>]*>/, '<g color="#1f4f82">')
    .replace('</svg>', '</g>')
  const source = join(workdir, 'icon.svg')
  writeFileSync(source, `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512"><rect width="512" height="512" fill="#eceef1"/><g transform="translate(64 64) scale(12)">${mark}</g></svg>`)
  for (const [size, target] of [[512, 'icon-512'], [192, 'icon-192'], [180, 'apple-touch-icon']]) {
    execFileSync('magick', [source, '-resize', `${size}x${size}`, '-strip', `public/${target}.png`])
  }
  execFileSync('magick', ['public/icon-512.png', '-define', 'icon:auto-resize=32,16', 'public/favicon.ico'])
  console.log('Created 512px, 192px, 180px PNGs and a 32/16px ICO.')
}
finally {
  rmSync(workdir, { recursive: true, force: true })
}
