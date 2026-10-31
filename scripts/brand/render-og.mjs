// Run against the app on card c24's port: node scripts/brand/render-og.mjs
// Uses the installed headless @playwright/cli; no browser or imaging dependency is added to the app.
import { readFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'

const html = readFileSync(new URL('./og.html', import.meta.url), 'utf8')
const cli = (...args) => {
  const output = execFileSync('playwright-cli', ['-s=c24-og', ...args], { encoding: 'utf8' })
  if (output.includes('### Error')) throw new Error(output)
  console.log(`playwright-cli ${args[0]}: passed`)
}

try {
  cli('open', 'http://localhost:3640/')
  cli('resize', '1200', '630')
  for (const variant of ['landing', 'default']) {
    cli('run-code', `async page => {
      await page.emulateMedia({ colorScheme: 'light' });
      await page.setContent(${JSON.stringify(html.replace('<html lang="en">', `<html lang="en" data-variant="${variant}">`))}, { waitUntil: 'networkidle' });
      await page.evaluate(() => document.fonts.ready);
      if (!await page.evaluate(async () => (await document.fonts.load('600 56px "Instrument Sans"')).length)) throw new Error('Instrument Sans did not load');
      await page.locator('.art').evaluate(img => img.decode());
      await page.screenshot({ path: 'public/og-${variant}.png' });
    }`)
  }
}
finally {
  cli('close')
}
