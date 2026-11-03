// docs/pitch-deck.pdf from the /pitch print view, against a running app: node scripts/brand/render-pitch.mjs <baseUrl>
// Uses the installed headless @playwright/cli (Chromium) in its own `pitch` session, light theme, one 16:9 page per slide
// (the page's own `@page slide` rule). Fails if Instrument Sans or a screenshot did not load, or the page count is off.
import { readFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'

const base = (process.argv[2] ?? '').replace(/\/$/, '')
if (!base) throw new Error('Usage: node scripts/brand/render-pitch.mjs <baseUrl>')
const out = new URL('../../docs/pitch-deck.pdf', import.meta.url).pathname
const cli = (...args) => {
  const output = execFileSync('playwright-cli', [`-s=${process.env.BRAND_SESSION ?? 'pitch'}`, ...args], { encoding: 'utf8' })
  if (output.includes('### Error')) throw new Error(output.slice(0, 600))
  console.log(`playwright-cli ${args[0]}: passed`)
}

try {
  cli('open', `${base}/pitch`)
  cli('run-code', `async page => {
    await page.emulateMedia({ colorScheme: 'light', media: 'print' });
    await page.goto(${JSON.stringify(`${base}/pitch`)});
    await page.waitForLoadState('networkidle');
    await page.evaluate(() => document.fonts.ready);
    if (!await page.evaluate(async () => (await document.fonts.load('600 32px "Instrument Sans"')).length)) throw new Error('Instrument Sans did not load');
    const broken = await page.$$eval('.slide img', imgs => imgs.filter(i => !i.complete || !i.naturalWidth).map(i => i.currentSrc || i.src));
    if (broken.length) throw new Error('images did not load: ' + broken.join(', '));
    await page.pdf({ path: ${JSON.stringify(out)}, preferCSSPageSize: true, printBackground: true });
  }`)
}
finally {
  cli('close')
}

// One page per slide: count the PDF's page objects against the slides the page declares.
const slides = (readFileSync(new URL("../../app/pages/pitch.vue", import.meta.url), "utf8").match(/<section class="slide /g) ?? []).length
const pages = (readFileSync(out, 'latin1').match(/\/Type\s*\/Page[^s]/g) ?? []).length
if (pages !== slides) throw new Error(`${out}: ${pages} pages, expected ${slides}`)
console.log(`${out}: ${pages} pages`)
