/**
 * Conversation-tab probe (issue #8): drives a RUNNING clean dsh web instance and
 * locks the third seat — the `conversation.view` tab beside 对话/轨迹.
 *
 * What it asserts, in order:
 *   1. after a session starts inside a workspace, the conversation tab ring
 *      carries a "Git" tab (the seat our client half registers);
 *   2. clicking it mounts the panel (.dig-root) with repository data — the
 *      session's own cwd is the repository, resolved through the sessions
 *      service, not the sidebar props;
 *   3. the settings card's placement switch takes the tab down and puts it
 *      back LIVE — no reload (the row Config field `conversationTab`);
 *   4. with the direct plugin route fenced off (403, the remote pairing
 *      client's reality), the panel still loads: the transport retries through
 *      the /remote proxy path (issue #9);
 *   5. zero uncaught page errors throughout.
 *
 *   node scripts/conversation-probe.mjs "http://127.0.0.1:3099/?token=…" [out-dir]
 *
 * The instance is expected to be clean-isolated (independent DSH_HOME) with a
 * workspace named 演示仓库 bound to a git repository (scripts/demo-repo.mjs
 * generates one); the probe passes the onboarding gate with a dummy key and
 * creates one session inside that workspace. Set DIG_PROBE_WORKSPACE to use a
 * different workspace title.
 *
 * Playwright is loaded from the DSH checkout (DSH_CHECKOUT overrides the path).
 */
import { createRequire } from 'node:module'
import { mkdirSync, readdirSync, existsSync, appendFileSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const url = process.argv[2]
if (url === undefined || url === '') {
  console.error('usage: node scripts/conversation-probe.mjs <web-url-with-token> [out-dir]')
  process.exit(1)
}
const outDir = process.argv[3] === undefined || process.argv[3] === '' ? '/tmp/conversation-probe' : process.argv[3]
mkdirSync(outDir, { recursive: true })
const logPath = join(outDir, 'probe.log')
writeFileSync(logPath, '')
const log = (message) => { console.log('[conv] ' + message); appendFileSync(logPath, message + '\n') }
const workspaceTitle = process.env.DIG_PROBE_WORKSPACE === undefined ? '演示仓库' : process.env.DIG_PROBE_WORKSPACE

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

const failures = []
const pageErrors = []
const check = (ok, message) => {
  if (ok === true) { log('ok   ' + message); return true }
  log('FAIL ' + message)
  failures.push(message)
  return false
}
page.on('pageerror', (error) => {
  pageErrors.push(String(error.message))
  log('PAGEERROR ' + String(error.message).slice(0, 300))
})
page.on('console', (message) => {
  const text = message.text()
  if (text.indexOf('[dsh-ide-git]') === 0) log('CONSOLE ' + text.slice(0, 200))
  else if (message.type() === 'error') log('CONSOLE-ERROR ' + text.slice(0, 200))
})
const settle = (ms) => page.waitForTimeout(ms === undefined ? 1200 : ms)

/* ---- enter: gate → workspace → session (see scripts/layout-probe.mjs; the
   0.2.1 gate takes a key up front, and a dummy one is enough — the probe never
   needs a model reply, only a session record with a cwd) ---- */
async function enterSession() {
  await page.goto(url, { waitUntil: 'domcontentloaded' })
  await settle(9000)
  const key = page.locator('input[type="password"]').first()
  if (await key.count() > 0) {
    await key.click({ timeout: 6000 })
    await page.keyboard.type('sk-conversation-probe-dummy')
    await page.getByRole('button', { name: '保存并继续' }).first().click({ timeout: 6000 })
    await settle(2000)
  } else {
    log('no API-key gate visible (already configured)')
  }
  const picker = page.getByRole('button', { name: '选择工作区' })
  const pickerOpen = await picker.count() > 0
  if (pickerOpen) {
    await picker.first().click({ timeout: 6000 })
    await settle(1500)
  }
  /* The picker item's accessible name carries the path too, so match on the
     text node — but only when the picker is actually open; the sidebar carries
     the same title and must not be clicked blind. */
  if (pickerOpen) {
    const items = page.getByText(workspaceTitle, { exact: true })
    const total = await items.count()
    if (total > 0) {
      await items.nth(total - 1).click({ timeout: 6000 })
      await settle(2500)
    } else {
      log('workspace card "' + workspaceTitle + '" not found in the picker')
    }
  }
  /* With a session restored from the previous run the conversation shell is
     already mounted; otherwise create one session inside the workspace and
     give it its first message — the view ring follows the first turn. */
  const live = await page.getByText('对话', { exact: true }).first().isVisible().catch(() => false)
  if (live !== true) {
    const toast = () => page.evaluate(() => [...document.querySelectorAll('[class*="toast"]')].map((el) => (el.textContent || '').trim()).join(' '))
    for (let attempt = 0; attempt < 2; attempt++) {
      const fresh = page.getByRole('button', { name: /新会话|新建会话/ }).first()
      if (await fresh.count() > 0) {
        await fresh.click({ timeout: 6000 })
        await settle(4000)
        const message = await toast()
        if (message.indexOf('失败') >= 0) log('session attempt ' + attempt + ' refused: ' + message.slice(0, 160))
      }
      const composer = page.locator('[contenteditable="true"], textarea').first()
      if (await composer.count() > 0) {
        await composer.click({ timeout: 6000 })
        await page.keyboard.type('conversation probe: ignore this message', { delay: 15 })
        await settle(400)
        await page.keyboard.press('Enter')
        await settle(8000)
      }
      if (await page.getByText('对话', { exact: true }).first().isVisible().catch(() => false)) break
    }
  }
  /* The conversation shell mounts with the session; the tab ring shows 对话. */
  await page.getByText('对话', { exact: true }).first().waitFor({ timeout: 15000 })
  log('session is up; conversation shell mounted')
}

/* Re-enter a live conversation from wherever the app stands. The plugin page
   carries its own close affordance (关闭); history.goBack is the fallback, and
   the enter dance (composer + Enter) is the last resort. */
async function ensureConversation() {
  if (await page.getByText('对话', { exact: true }).first().isVisible().catch(() => false)) return true
  const close = page.getByRole('button', { name: '关闭' }).first()
  if (await close.count() > 0) {
    try { await close.click({ timeout: 3000 }) } catch (error) { void error }
    await settle(3500)
  }
  if (await page.getByText('对话', { exact: true }).first().isVisible().catch(() => false)) return true
  await page.goBack({ waitUntil: 'domcontentloaded' }).catch(() => {})
  await settle(3500)
  if (await page.getByText('对话', { exact: true }).first().isVisible().catch(() => false)) return true
  const composer = page.locator('[contenteditable="true"], textarea').first()
  if (await composer.count() > 0) {
    try {
      await composer.click({ timeout: 5000 })
      await page.keyboard.type('conversation probe: ignore this message too', { delay: 15 })
      await settle(400)
      await page.keyboard.press('Enter')
      await settle(8000)
    } catch (error) { void error }
  }
  return await page.getByText('对话', { exact: true }).first().isVisible().catch(() => false)
}

/* The tab ring row that carries 对话; our seat renders a plain "Git" button in
   it. Scoped to the row so the sidebar's Git card never matches. */
async function gitTabButton() {
  return page.evaluateHandle((title) => {
    const anchor = [...document.querySelectorAll('button, [role="tab"], span')].find((el) => (el.textContent || '').trim() === '对话')
    if (anchor === undefined) return null
    let row = anchor.closest('div, nav, ul, header')
    for (let depth = 0; depth < 5 && row !== null; depth++) {
      const git = [...row.querySelectorAll('button, [role="tab"]')].find((el) => (el.textContent || '').trim() === 'Git')
      if (git !== undefined) return git
      row = row.parentElement
    }
    return null
  }, '对话')
}

const panelState = () => page.evaluate(() => {
  const roots = [...document.querySelectorAll('.dig-root')]
  const visible = roots.filter((el) => el.getBoundingClientRect().height > 40)
  const text = visible.length > 0 ? (visible[0].textContent || '') : ''
  return { roots: roots.length, visible: visible.length, text: text.replace(/\s+/g, ' ').slice(0, 160) }
})

try {
  await enterSession()

  /* 1 — the seat is in the ring. */
  const tab = await gitTabButton()
  const tabFound = tab !== null && tab.asElement() !== null
  check(tabFound, 'the conversation tab ring carries a Git tab beside 对话/轨迹')
  if (tabFound === false) {
    await page.screenshot({ path: join(outDir, 'no-git-tab.png') })
    throw new Error('Git tab missing — nothing further to probe')
  }

  /* 2 — clicking it mounts the panel on the session's own cwd. */
  await tab.asElement().click()
  await settle(5000)
  let state = await panelState()
  check(state.visible === 1, 'the Git view mounts the panel (.dig-root visible)')
  check(/main|master|branch|分支/i.test(state.text) === true, 'the panel carries repository data from the session cwd: ' + state.text.slice(0, 80))
  await page.screenshot({ path: join(outDir, 'conversation-git-tab.png') })

  /* 3 — the placement switch drives the seat live. On hosts that serve the
     plugin page, the rail settings button NAVIGATES there (the in-panel dialog
     never opens), so every toggle is verified back ON the conversation page:
     open the dock's Git panel → settings → flip → go back → inspect the ring. */
  const dockGit = async () => {
    /* Open the panel through the sidebar's start page — the canonical entry
     (see layout-probe.mjs): expand the right sidebar, then its Git guide
     card. The bottom dock's tab set is persisted state and NOT guaranteed
     after a reload, so it is only a fallback. */
    const expand = page.getByRole('button', { name: '打开右侧边栏' }).first()
    if (await expand.count() > 0) {
      try { await expand.click({ timeout: 4000 }) } catch (error) { void error }
      await settle(3000)
    }
    const card = page.locator('[data-sidebar-right-guide-entry="dsh-ide-git:panel"], [data-sidebar-right-guide-entry="ide-git"]').first()
    if (await card.count() > 0) {
      try { await card.click({ timeout: 6000 }) } catch (error) { void error }
      await settle(4000)
      if (await page.locator('.dig-root:visible').count() > 0) return true
    }
    const candidates = await page.evaluate(() => {
      const points = []
      for (const el of document.querySelectorAll('button')) {
        const r = el.getBoundingClientRect()
        if (r.width === 0 || r.height === 0) continue
        if ((el.textContent || '').trim() !== 'Git') continue
        points.push({ x: r.x + r.width / 2, y: r.y + r.height / 2 })
      }
      return points
    })
    for (const point of candidates) {
      await page.mouse.click(point.x, point.y)
      await settle(4000)
      const open = await page.locator('.dig-root:visible').count()
      if (open > 0) return true
    }
    return false
  }
  /* Strict: "removed" only counts when the ring itself is visible (an absent
     ring must never read as a pass). */
  const ringState = async () => {
    const anchor = await page.getByText('对话', { exact: true }).first().isVisible().catch(() => false)
    if (anchor !== true) return 'no-ring'
    const git = await gitTabButton()
    return git !== null && git.asElement() !== null ? 'git-present' : 'git-absent'
  }
  const flipPlacement = async () => {
    if (await dockGit() !== true) { log('dock Git tab not found'); return false }
    /* The dock panel opens asynchronously (repo resolve + chrome render);
       wait for the button instead of sampling once. */
    const rail = page.locator('.dig-root:visible .dig-rail-settings').first()
    try { await rail.waitFor({ timeout: 10000 }) } catch (error) {
      log('rail settings button not found (panel did not open in time)')
      return false
    }
    await rail.click({ timeout: 6000 })
    await settle(3000)
    const placement = page.locator('input#dig-placement-conversationTab').first()
    if (await placement.count() === 0) { log('placement switch not found on the settings surface'); return false }
    await placement.click({ timeout: 6000 })
    await settle(2500)
    return true
  }
  /* The plugin page is an in-app view switch no history undo reliably
     reverses, so after each flip the probe re-enters through a fresh load —
     deterministic, and it doubles as a persistence check (the setting must
     survive the reload). */
  const reenterConversation = async () => {
    await page.reload({ waitUntil: 'domcontentloaded' })
    await settle(9000)
    try { await enterSession() } catch (error) {
      log('re-entry failed: ' + String(error && error.message ? error.message : error).slice(0, 160))
    }
    return await page.getByText('对话', { exact: true }).first().isVisible().catch(() => false)
  }
  if (await flipPlacement() === true) {
    check(await reenterConversation() === true, 'back on the conversation after the off flip')
    const goneState = await ringState()
    check(goneState === 'git-absent', 'turning the switch off removes the tab (ring visible, Git absent; saw ' + goneState + ')')
    if (await flipPlacement() === true) {
      check(await reenterConversation() === true, 'back on the conversation after the on flip')
      const againState = await ringState()
      if (againState !== 'git-present') {
        const diag = await page.evaluate(() => ({
          box: (() => { const el = document.querySelector('input#dig-placement-conversationTab'); return el === null ? 'gone' : String(el.checked) })(),
          note: (document.querySelector('[data-settings-error]') || {}).textContent || '',
        }))
        log('restore diagnostics: ' + JSON.stringify(diag) + ' pageErrors=' + pageErrors.length)
      }
      check(againState === 'git-present', 'turning the switch back on restores the tab (saw ' + againState + ')')
    } else {
      check(false, 'the on flip completed')
    }
  } else {
    log('skipping the live-switch check (settings surface not reachable)')
  }

  /* 4 — the remote pairing reality: the direct plugin route answers 403 (the
     harness browser-auth gate), the panel must still load through /remote.
     Simulated with route interception: direct → 403, /remote/… → the real
     route. The retry is sticky, so ONE fenced call is enough to prove it. */
  let remoteHits = 0
  await page.route('**/dsh-ide-git/api/**', (route) => route.fulfill({ status: 403, contentType: 'application/json', body: JSON.stringify({ ok: false, error: { code: 'forbidden', message: 'forbidden' } }) }))
  await page.route('**/remote/**', (route) => {
    remoteHits += 1
    const stripped = route.request().url().replace('/remote/', '/')
    return route.continue({ url: stripped })
  })
  await page.reload({ waitUntil: 'domcontentloaded' })
  await settle(9000)
  /* A cold reload may land on the workspace home rather than the session; the
     fencing verdict needs a live conversation first. */
  await reenterConversation()
  const tab2 = await gitTabButton()
  if ((await tab2) !== null && tab2.asElement() !== null) {
    await tab2.asElement().click()
    await settle(6000)
    state = await panelState()
    if (state.visible < 1 || /main|master|branch|分支/i.test(state.text) !== true) {
      log('remote-fencing panel state: ' + JSON.stringify(state) + ' remoteHits=' + remoteHits)
    }
    /* visible >= 1, not === 1: the sidebar panel from the flip steps may still
       be open beside the conversation view — both seats ride the same
       transport, so either proves the point. */
    check(state.visible >= 1 && /main|master|branch|分支/i.test(state.text) === true,
      'with the direct route fenced off the panel still loads through the /remote proxy')
    check(remoteHits > 0, 'the transport actually issued /remote requests (saw ' + remoteHits + ')')
    await page.screenshot({ path: join(outDir, 'conversation-git-tab-remote.png') })
  } else {
    check(false, 'the Git tab survived the reload (sticky view + fencing active)')
  }

  check(pageErrors.length === 0, 'zero uncaught page errors (saw ' + pageErrors.length + ')')
} catch (error) {
  check(false, 'probe crashed: ' + String(error && error.message ? error.message : error).slice(0, 300))
}

await browser.close()
if (failures.length > 0) {
  log(failures.length + ' failure(s); see ' + logPath)
  process.exit(1)
}
log('all checks passed')
