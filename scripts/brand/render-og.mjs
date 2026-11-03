// Social cards from og.html, against a running app that serves /art: node scripts/brand/render-og.mjs <baseUrl>
// Uses the installed headless @playwright/cli in its own `og` session; no browser or imaging dependency is added to the app.
// Writes public/og-<variant>.png (1200×630) for every variant in og.html.
import { readFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'

const base = (process.argv[2] ?? '').replace(/\/$/, '')
if (!base) throw new Error('Usage: node scripts/brand/render-og.mjs <baseUrl>')
const html = readFileSync(new URL('./og.html', import.meta.url), 'utf8')
const out = new URL('../../public/', import.meta.url).pathname
const cli = (...args) => {
  const output = execFileSync('playwright-cli', [`-s=${process.env.BRAND_SESSION ?? 'og'}`, ...args], { encoding: 'utf8' })
  if (output.includes('### Error')) throw new Error(output)
  console.log(`playwright-cli ${args[0]}: passed`)
}

try {
  cli('open', `${base}/`)
  cli('resize', '1200', '630')
  for (const variant of ['landing', 'default', 'agents', 'security']) {
    cli('run-code', `async page => {
      await page.emulateMedia({ colorScheme: 'light' });
      await page.setContent(${JSON.stringify(html.replace('<html lang="en">', `<html lang="en" data-variant="${variant}" data-origin="${base}">`))}, { waitUntil: 'networkidle' });
      await page.evaluate(() => document.fonts.ready);
      if (!await page.evaluate(async () => (await document.fonts.load('600 56px "Instrument Sans"')).length)) throw new Error('Instrument Sans did not load');
      if (!await page.locator('.art').evaluate(img => img.complete ? img.naturalWidth : new Promise(r => { img.onload = () => r(img.naturalWidth); img.onerror = () => r(0) }))) throw new Error('art did not load');
      await page.screenshot({ path: '${out}og-${variant}.png' });
    }`)
  }
}
finally {
  cli('close')
}
