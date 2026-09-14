/**
 * Layout probe: drives a RUNNING clean dsh web instance and records which chrome
 * the panel picks at a range of container heights.
 *
 * The panel never asks whether it is the bottom workbench or the native right
 * sidebar — it measures its container. This script exists because that rule has
 * broken twice: v0.1.3 judged by height alone and turned a 1500x300 workbench
 * into a single column, and v0.3.5 still flipped a wide-but-short workbench into
 * the tall-and-narrow chrome. Run it before and after changing the thresholds.
 *
 *   node scripts/layout-probe.mjs "http://127.0.0.1:3099/?token=…" [out-dir]
 *
 * Playwright is loaded from the DSH checkout (DSH_CHECKOUT overrides the path).
 */
import { createRequire } from 'node:module'
import { mkdirSync, readdirSync, existsSync } from 'node:fs'
import { join } from 'node:path'

const url = process.argv[2]
if (url === undefined || url === '') {
  console.error('usage: node scripts/layout-probe.mjs <web-url-with-token> [out-dir]')
  process.exit(1)
}

const outDir = process.argv[3] === undefined || process.argv[3] === '' ? '/tmp/layout-probe' : process.argv[3]
mkdirSync(outDir, { recursive: true })

function loadPlaywright() {
  const checkout = process.env.DSH_CHECKOUT === undefined || process.env.DSH_CHECKOUT === ''
    ? '/Users/kanna/project/deepseek-harness'
    : process.env.DSH_CHECKOUT
  const store = join(checkout, 'node_modules', '.pnpm')
  const candidates = []
  if (existsSync(store)) {
    for (const name of readdirSync(store)) {
      if (name.indexOf('playwright@') !== 0) continue
      candidates.push(join(store, name, 'node_modules', 'playwright', 'package.json'))
    }
  }
  candidates.push(join(checkout, 'node_modules', 'playwright', 'package.json'))
  for (const candidate of candidates) {
    if (!existsSync(candidate)) continue
    try { return createRequire(candidate)('playwright') } catch (error) { void error }
  }
  throw new Error('playwright not found under ' + checkout + ' (set DSH_CHECKOUT)')
}

const { chromium } = loadPlaywright()
const browser = await chromium.launch({ headless: true, channel: process.env.DSH_SHOT_CHANNEL === undefined ? 'chrome' : process.env.DSH_SHOT_CHANNEL })
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 }, deviceScaleFactor: 1 })

const log = (message) => console.log('[probe] ' + message)
const settle = (ms) => page.waitForTimeout(ms === undefined ? 1200 : ms)

async function clickText(text, options) {
  const locators = [page.getByRole('button', { name: text, exact: true }), page.getByText(text, { exact: true })]
  for (const locator of locators) {
    try {
      const target = locator.first()
      if (await target.count() === 0) continue
      await target.click({ timeout: options !== undefined && options.timeout !== undefined ? options.timeout : 6000 })
      await settle(options !== undefined && options.wait !== undefined ? options.wait : 1200)
      return true
    } catch (error) { void error }
  }
  log('MISS ' + text)
  return false
}

async function enterSession() {
  await page.goto(url, { waitUntil: 'domcontentloaded' })
  await settle(7000)
  await clickText('继续')
  await clickText('稍后配置')
  await clickText('新建会话')
  await settle(2000)
  const editor = page.locator('textarea, [contenteditable="true"]').first()
  await editor.click({ timeout: 8000 })
  await page.keyboard.type('布局探针会话')
  await page.getByRole('button', { name: '发送消息', exact: true }).first().click({ timeout: 8000 })
  await settle(7000)
}

async function openBottomPanel() {
  await clickText('展开底部面板')
  await settle(2500)
  await page.locator('.nArs4W_tabBarPlus').first().click({ timeout: 8000 })
  await settle(1500)
  await page.getByText('Git', { exact: true }).first().click({ timeout: 8000 })
  await settle(6000)
}

/** Drags the workbench handle so the panel root ends up about `target` px tall. */
async function resizeTo(target) {
  const root = page.locator('.dig-root').first()
  const handle = page.locator('.nArs4W_bottomResize').first()
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const box = await root.boundingBox()
    const hb = await handle.boundingBox()
    if (box === null || hb === null) throw new Error('panel or resize handle not found')
    const delta = box.height - target
    if (Math.abs(delta) < 8) break
    const x = hb.x + hb.width / 2
    const y = hb.y + hb.height / 2
    await page.mouse.move(x, y)
    await page.mouse.down()
    await page.mouse.move(x, y + delta, { steps: 16 })
    await page.mouse.up()
    await settle(900)
  }
  const final = await root.boundingBox()
  return final === null ? null : Math.round(final.height)
}

const CHROMES = ['dig-body-columns', 'dig-body-stack', 'dig-body-compact']

async function chromeOf() {
  // Only the visible root counts: a folded workbench keeps its DOM node around,
  // so a page-wide class lookup mixes two chromes together.
  const visible = page.locator('.dig-root:visible').first()
  const root = await visible.boundingBox()
  const found = []
  for (const name of CHROMES) {
    if (await page.locator('.dig-root:visible .' + name).count() > 0) found.push(name.replace('dig-body-', ''))
  }
  const rail = await page.locator('.dig-rail-vertical').count() > 0 ? 'vertical' : 'horizontal'
  return {
    width: root === null ? 0 : Math.round(root.width),
    height: root === null ? 0 : Math.round(root.height),
    chrome: found.join('+') === '' ? 'none' : found.join('+'),
    rail: rail,
  }
}

const TARGETS = [480, 380, 300, 260, 220, 200, 180, 150, 120, 90]
const rows = []

try {
  await enterSession()
  await openBottomPanel()

  // Grow first, so every later step shrinks towards its target from above.
  await resizeTo(520)
  for (const target of TARGETS) {
    const actual = await resizeTo(target)
    await settle(700)
    const state = await chromeOf()
    rows.push({ requested: target, actual: actual, state: state })
    await page.locator('.dig-root').first().screenshot({ path: join(outDir, 'h' + String(target).padStart(3, '0') + '.png') })
    log('target ' + target + ' → ' + actual + 'px, chrome=' + state.chrome + ', rail=' + state.rail)
  }

  console.log('\nrequested | actual | width | chrome            | rail')
  console.log('----------|--------|-------|-------------------|----------')
  for (const row of rows) {
    console.log(
      String(row.requested).padStart(9) + ' |' +
      String(row.actual).padStart(7) + ' |' +
      String(row.state.width).padStart(6) + ' | ' +
      row.state.chrome.padEnd(17) + ' | ' + row.state.rail,
    )
  }

  // The narrow side of the rule: the native right sidebar must stay compact.
  await clickText('折叠底部面板')
  await settle(1500)
  await clickText('打开右侧边栏')
  await settle(3000)
  await page.locator('button:visible').filter({ hasText: /^Git$/ }).last().click({ timeout: 8000 })
  await settle(6000)
  const sidebar = await chromeOf()
  await page.locator('.dig-root').first().screenshot({ path: join(outDir, 'right-sidebar.png') })
  log('native right sidebar → ' + sidebar.width + 'x' + sidebar.height + ', chrome=' + sidebar.chrome)
} finally {
  await browser.close()
}
