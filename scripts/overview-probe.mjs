/** Overview checks for layout-probe, using an already running isolated DSH.
 * DIG_PROBE_OVERVIEW=1 creates two temporary repositories for read/diff checks.
 * DIG_PROBE_DESTRUCTIVE=1 also tests writes against those repositories.
 * Fixtures are removed on exit; skipped checks produce a PARTIAL result.
 */
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, isAbsolute, join, relative, resolve, sep } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'

const MARKER = 'dig-overview-probe.json'
const KIND = 'dsh-ide-git-overview-probe-v1'
const FILES = { staged: 'staged.txt', edit: 'folder/edit.txt', peer: 'folder/peer.txt', renamed: 'rename-after.txt', untracked: 'new.txt', binary: 'binary.bin' }
const norm = (value) => {
  const path = resolve(value).replaceAll('\\', '/')
  return process.platform === 'win32' ? path.toLowerCase() : path
}
const within = (parent, child) => { const rel = relative(parent, child); return rel !== '' && rel !== '..' && !rel.startsWith('..' + sep) && !isAbsolute(rel) }
const git = (cwd, args) => execFileSync('git', ['-c', 'core.quotepath=false', ...args], { cwd, encoding: 'utf8', windowsHide: true, timeout: 30000, stdio: ['ignore', 'pipe', 'pipe'] }).trimEnd()

function createOverviewFixtures() {
  const directory = realpathSync(mkdtempSync(join(tmpdir(), 'dig-overview-')))
  const repos = []
  try {
    for (const name of ['probe-a', 'probe-b']) {
      const root = join(directory, name)
      const remote = join(directory, name + '.git')
      mkdirSync(join(root, 'folder'), { recursive: true })
      git(root, ['init', '-b', 'main'])
      for (const [key, value] of Object.entries({ 'user.name': 'Overview Probe', 'user.email': 'overview-probe@example.invalid', 'core.autocrlf': 'false', 'core.eol': 'lf', 'commit.gpgsign': 'false', 'core.hooksPath': join(directory, 'no-hooks') })) git(root, ['config', key, value])
      for (const file of [FILES.staged, FILES.edit, FILES.peer, 'rename-before.txt']) writeFileSync(join(root, file), name + ' baseline ' + file + '\n')
      writeFileSync(join(root, FILES.binary), Buffer.from([0, 1, 2, 3]))
      git(root, ['add', '-A'])
      git(root, ['commit', '-m', 'Probe baseline'])
      git(root, ['init', '--bare', remote])
      git(root, ['remote', 'add', 'origin', remote])
      git(root, ['push', '-u', 'origin', 'main'])
      writeFileSync(join(root, FILES.staged), name + ' staged change\n')
      git(root, ['add', '--', FILES.staged])
      git(root, ['mv', 'rename-before.txt', FILES.renamed])
      for (const file of [FILES.edit, FILES.peer]) writeFileSync(join(root, file), name + ' worktree change ' + file + '\n')
      writeFileSync(join(root, FILES.untracked), name + ' untracked\n')
      writeFileSync(join(root, FILES.binary), Buffer.from([0, 4, 5, 6]))
      const fixture = { kind: KIND, root: realpathSync(root), directory, remote: realpathSync(remote) }
      writeFileSync(join(root, '.git', MARKER), JSON.stringify(fixture, null, 2))
      repos.push(fixture)
    }
    return { repos, directory }
  } catch (error) {
    if (within(realpathSync(tmpdir()), directory)) rmSync(directory, { recursive: true, force: true })
    throw error
  }
}

function validateFixture(path) {
  const root = realpathSync(path)
  const fixture = JSON.parse(readFileSync(join(root, '.git', MARKER), 'utf8'))
  assert.equal(fixture.kind, KIND, 'fixture marker must identify this probe')
  assert.equal(norm(fixture.root), norm(root), 'fixture root must match its marker')
  assert(within(realpathSync(tmpdir()), root), 'write fixtures must live below the real temporary directory')
  assert(within(realpathSync(tmpdir()), realpathSync(fixture.directory)), 'fixture container must be temporary')
  assert(within(fixture.directory, root), 'fixture root must be inside its marked container')
  assert(within(fixture.directory, realpathSync(fixture.remote)), 'bare remote must be inside its marked container')
  assert.equal(git(fixture.remote, ['rev-parse', '--is-bare-repository']), 'true')
  assert.equal(norm(git(root, ['remote', 'get-url', '--push', 'origin'])), norm(fixture.remote), 'origin push URL must be the marked local bare repository')
  assert.equal(git(root, ['config', 'user.email']), 'overview-probe@example.invalid')
  assert.equal(norm(git(root, ['rev-parse', '--show-toplevel'])), norm(root))
  return { ...fixture, root }
}

export function prepareOverview() {
  return process.env.DIG_PROBE_OVERVIEW === '1' ? createOverviewFixtures() : null
}

export function cleanupOverview(fixtures) {
  if (fixtures === null) return
  const directory = realpathSync(fixtures.directory)
  assert(within(realpathSync(tmpdir()), directory) && basename(directory).startsWith('dig-overview-'), 'cleanup must remain inside the owned temporary fixture directory')
  for (const repo of fixtures.repos) validateFixture(repo.root)
  rmSync(directory, { recursive: true, force: true, maxRetries: 5, retryDelay: 250 })
}

/** Fetch stacks attribute summary/stats to fetchOne or to other components.
 * The separate browser request log records what actually crossed the transport.
 * No request headers, tokens, or full URLs are written to the report.
 */
export async function installOverviewMonitor(page) {
  const records = []
  const pending = new Set()
  let phase = 'setup'
  const byRequest = new WeakMap()
  page.on('request', (request) => {
    const match = new URL(request.url()).pathname.match(/\/dsh-ide-git\/api\/([^/]+)$/)
    if (!match) return
    let payload = null
    try { payload = request.postDataJSON() } catch { /* Non-JSON is retained as a missing payload. */ }
    const record = { phase, method: match[1], verb: request.method(), payload, at: Date.now(), status: null, response: null }
    records.push(record)
    byRequest.set(request, record)
  })
  page.on('response', (response) => {
    const record = byRequest.get(response.request())
    if (!record) return
    record.status = response.status()
    const work = response.json().then((body) => { record.response = body }, (error) => { record.responseError = String(error.message) }).finally(() => pending.delete(work))
    pending.add(work)
  })
  await page.addInitScript(() => {
    const original = window.fetch
    window.__digOverviewFetches = []
    window.fetch = function (...args) {
      const input = args[0]
      const init = args[1]
      const address = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
      const match = new URL(address, document.baseURI).pathname.match(/\/dsh-ide-git\/api\/([^/]+)$/)
      if (match) {
        let payload = null
        try { payload = JSON.parse(init?.body ?? '{}') } catch { /* Preserve unknown payloads as null. */ }
        const stack = new Error().stack ?? ''
        window.__digOverviewFetches.push({ method: match[1], payload, at: Date.now(), source: /\bfetchOne\b/.test(stack) ? 'overview' : 'other-or-unresolved', stack })
      }
      return Reflect.apply(original, this, args)
    }
  })
  return {
    records,
    phase(value) { phase = value },
    async flush() { await Promise.allSettled([...pending]) },
    async fetches() { return page.evaluate(() => window.__digOverviewFetches ?? []) },
  }
}

async function eventually(read, message, timeout = 12000) {
  const end = Date.now() + timeout
  let last
  do {
    last = await read()
    if (last) return last
    await delay(80)
  } while (Date.now() < end)
  throw new Error(message + ' (condition did not become true)')
}

export async function runOverview({ page, fixtures, monitor, outDir, log }) {
  const report = { status: 'RUNNING', checks: [], skipped: [], failures: [], repos: fixtures.repos.map((repo) => repo.root), requests: monitor.records }
  const root = page.locator('.dig-root:visible').first()
  const card = (repo) => root.locator('.dig-all-card').filter({ has: page.locator('.dig-all-card-name').filter({ hasText: basename(repo.root) }) })
  const row = (repo, file) => card(repo).locator('.dig-row-file').filter({ has: page.locator('.dig-row-label', { hasText: new RegExp('^' + file.split('/').at(-1).replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '$') }) })
  const check = (ok, message, evidence) => {
    const result = { status: ok ? 'PASS' : 'FAIL', message, ...(evidence === undefined ? {} : { evidence }) }
    report.checks.push(result)
    log('overview ' + result.status + ' ' + message)
    if (!ok) report.failures.push(message)
    return ok
  }
  const skip = (message) => { report.skipped.push(message); log('overview NOT RUN ' + message) }
  const step = async (name, run) => {
    monitor.phase(name)
    try { await run() } catch (error) {
      check(false, name, String(error.stack ?? error))
      await root.screenshot({ path: join(outDir, 'overview-' + name + '-failed.png') }).catch(() => {})
    }
  }
  const waitReady = async (repo) => {
    await card(repo).waitFor({ state: 'visible', timeout: 20000 })
    await card(repo).locator('.dig-all-card-loading').waitFor({ state: 'hidden', timeout: 20000 })
  }
  const waitChanges = async (repo, action) => {
    const response = page.waitForResponse((res) => {
      if (!/\/dsh-ide-git\/api\/changes$/.test(new URL(res.url()).pathname)) return false
      try { return norm(res.request().postDataJSON().repoRoot) === norm(repo.root) } catch { return false }
    }, { timeout: 20000 })
    await action()
    const res = await response
    const body = await res.json()
    assert.equal(body.ok, true, 'changes refresh must succeed')
    await waitReady(repo)
    return body.data
  }
  const refresh = (repo) => waitChanges(repo, () => card(repo).locator('[data-card-refresh]').click())
  const mode = async (value) => {
    const button = root.locator('[data-view-mode]')
    if (await button.getAttribute('data-view-mode') !== value) await button.click()
    await eventually(async () => await button.getAttribute('data-view-mode') === value, 'view mode ' + value)
  }
  const readBoundary = (repo) => ({ status: git(repo.root, ['status', '--porcelain=v1', '-z']), head: git(repo.root, ['rev-parse', 'HEAD']), edit: readFileSync(join(repo.root, FILES.edit), 'utf8'), index: git(repo.root, ['ls-files', '-s']) })
  const assertBase = (record, repo) => {
    assert(record, 'expected a recorded API request')
    assert.equal(norm(record.payload.cwd), norm(repo.root), record.method + ' cwd')
    assert.equal(norm(record.payload.repoRoot), norm(repo.root), record.method + ' repoRoot')
  }
  const write = async (repo, method, action) => {
    validateFixture(repo.root)
    const start = monitor.records.length
    const resPromise = page.waitForResponse((res) => {
      if (!new URL(res.url()).pathname.endsWith('/dsh-ide-git/api/' + method)) return false
      try { return norm(res.request().postDataJSON().repoRoot) === norm(repo.root) } catch { return false }
    }, { timeout: 20000 })
    const reloaded = page.waitForResponse((res) => {
      if (!new URL(res.url()).pathname.endsWith('/dsh-ide-git/api/changes')) return false
      try { return norm(res.request().postDataJSON().repoRoot) === norm(repo.root) } catch { return false }
    }, { timeout: 20000 })
    await action()
    const response = await resPromise
    const body = await response.json()
    assert.equal(body.ok, true, method + ': ' + JSON.stringify(body))
    const changed = await reloaded
    assert.equal((await changed.json()).ok, true, 'write must refresh this card through changes')
    await waitReady(repo)
    await monitor.flush()
    const record = monitor.records.slice(start).find((item) => item.method === method)
    assertBase(record, repo)
    check(true, method + ' uses this card root and refreshes through changes', record.payload)
    return { body: body.data, record }
  }
  const [a, b] = fixtures.repos
  let entered = false
  try {
    await page.setViewportSize({ width: 1600, height: 1000 })
    await step('manual-repositories', async () => {
      check(await root.locator('[data-view-mode]').getAttribute('data-view-mode') === 'repo', 'fresh profile starts in the single-repository view')
      await mode('repo')
      for (const repo of fixtures.repos) {
        validateFixture(repo.root)
        await root.locator('.dig-select-repo').click()
        await root.locator('.dig-pick-manual-open').click()
        await root.locator('.dig-pick-manual-input').fill(repo.root)
        const response = page.waitForResponse((res) => new URL(res.url()).pathname.endsWith('/dsh-ide-git/api/openRepo'))
        await root.locator('.dig-pick-manual-form button').first().click()
        const body = await (await response).json()
        assert.equal(body.ok, true, 'UI manual repository entry must resolve a real root')
        await root.locator('.dig-pick-manual-input').waitFor({ state: 'hidden' })
        await eventually(async () => norm(await root.locator('.dig-select-repo').locator('..').getAttribute('title')) === norm(repo.root), 'manual repository is selected')
      }
      assert.equal(norm(await root.locator('.dig-select-repo').locator('..').getAttribute('title')), norm(b.root))
      check(true, 'both real dirty repositories added through the manual UI; panel remains bound to probe-b')
    })
    await step('first-overview', async () => {
      const start = monitor.records.length
      await mode('all')
      entered = true
      for (const repo of fixtures.repos) {
        await waitReady(repo)
        assert.equal(norm(await card(repo).getAttribute('data-repo')), norm(repo.root))
        assert.equal((await card(repo).locator('.dig-all-card-branch').innerText()).trim(), 'main')
        const record = await eventually(() => monitor.records.slice(start).find((item) => item.method === 'changes' && norm(item.payload?.repoRoot ?? '.') === norm(repo.root)), 'first card changes request')
        assertBase(record, repo)
        await monitor.flush()
        assert.equal(record.response?.ok, true)
        const data = record.response.data
        assert.equal(data.statsDeferred, true)
        assert.deepEqual(data.changes.ignored, [])
        assert.equal(data.changes.ignoredTruncated, false)
        for (const group of ['staged', 'unstaged', 'untracked']) assert(data.changes[group].length > 0, group + ' must contain fixture data')
        assert(data.changes.staged.some((item) => item.path === FILES.renamed && item.origPath === 'rename-before.txt'))
        const count = ['staged', 'unstaged', 'untracked', 'conflicted'].reduce((total, group) => total + data.changes[group].length, 0)
        assert.equal(await card(repo).locator('.dig-all-card-head > .dig-count').innerText(), String(count))
      }
      check(true, 'first overview reads changes with matching roots, branches, groups and counts')
      check(await root.locator('.dig-rail:visible, .dig-rail-right:visible').count() === 0, 'overview hides repository action rails')
      await root.screenshot({ path: join(outDir, 'overview-initial.png') })
    })
    if (!entered || await card(a).count() === 0 || await card(b).count() === 0) throw new Error('overview fixtures did not mount; dependent scenarios cannot run')

    await step('selection-diff-isolation', async () => {
      for (const repo of fixtures.repos) {
        const other = repo === a ? b : a
        const before = await card(other).locator('.dig-row-selected').count()
        const response = page.waitForResponse((res) => new URL(res.url()).pathname.endsWith('/dsh-ide-git/api/diff') && norm(res.request().postDataJSON().repoRoot) === norm(repo.root))
        await row(repo, FILES.edit).click()
        const request = (await response).request().postDataJSON()
        assert.equal(norm(request.cwd), norm(repo.root))
        assert.equal(request.path, FILES.edit)
        assert.equal(request.staged, false)
        assert.equal(request.untracked, false)
        await eventually(async () => await card(repo).locator('.dig-row-selected').count() === 1, 'card owns its selection')
        assert.equal(await card(other).locator('.dig-row-selected').count(), before)
      }
      assert.equal(await card(a).locator('.dig-all-diff-path').getAttribute('title'), FILES.edit)
      assert.equal(await card(b).locator('.dig-all-diff-path').getAttribute('title'), FILES.edit)
      await card(a).locator('.dig-all-diff-head button').click()
      assert.equal(await card(a).locator('.dig-all-diff').count(), 0)
      assert.equal(await card(b).locator('.dig-all-diff').count(), 1)
      await card(b).locator('.dig-all-diff-head button').click()
      check(true, 'selection and diff remain independent between dirty cards')
      for (const [file, staged, untracked] of [[FILES.staged, true, false], [FILES.edit, false, false], [FILES.untracked, false, true], [FILES.renamed, true, false], [FILES.binary, false, false]]) {
        const response = page.waitForResponse((res) => new URL(res.url()).pathname.endsWith('/dsh-ide-git/api/diff') && norm(res.request().postDataJSON().repoRoot) === norm(a.root))
        await row(a, file).click()
        const res = await response
        const payload = res.request().postDataJSON()
        assert.equal(payload.path, file)
        assert.equal(payload.staged, staged)
        assert.equal(payload.untracked, untracked)
        assert.equal(norm(payload.cwd), norm(a.root))
        const result = await res.json()
        assert.equal(result.ok, true)
        if (file !== FILES.binary) assert(result.data.patch.length > 0, file + ' should have a real diff')
        await card(a).locator('.dig-all-diff-head button').click()
      }
      check(true, 'staged, unstaged, untracked, rename and binary diffs use the right path and group')
    })

    await step('read-failures', async () => {
      let fail = false
      const handler = async (route) => {
        if (fail && norm(route.request().postDataJSON().repoRoot) === norm(a.root)) {
          fail = false
          await route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ ok: false, error: { code: 'probe-read-failure', message: 'Injected overview read failure' } }) })
        } else await route.fallback()
      }
      await page.route('**/dsh-ide-git/api/changes', handler)
      try {
        const before = await card(a).locator('.dig-all-card-head > .dig-count').innerText()
        fail = true
        await card(a).locator('[data-card-refresh]').click()
        await card(a).getByRole('alert').waitFor({ state: 'visible' })
        assert.match(await card(a).getByRole('alert').innerText(), /Injected overview read failure/)
        assert.equal(await card(a).locator('.dig-all-card-head > .dig-count').innerText(), before)
        assert(await row(a, FILES.edit).count() > 0)
        await waitChanges(a, () => card(a).getByRole('alert').getByRole('button').click())
        await card(a).getByRole('alert').waitFor({ state: 'hidden' })
        check(true, 'failed refresh retains old rows/count; card retry recovers')
        await mode('repo')
        fail = true
        await mode('all')
        await card(a).getByRole('alert').waitFor({ state: 'visible' })
        assert.match(await card(a).getByRole('alert').innerText(), /Injected overview read failure/)
        assert.equal(await card(a).locator('.dig-row-file').count(), 0)
        assert.equal(await root.locator('.dig-all-clean').filter({ hasText: basename(a.root) }).count(), 0)
        await waitChanges(a, () => card(a).getByRole('alert').getByRole('button').click())
        await card(a).getByRole('alert').waitFor({ state: 'hidden' })
        await waitReady(b)
        check(true, 'first read failure shows reason/retry and never becomes a clean row')
      } finally { await page.unroute('**/dsh-ide-git/api/changes', handler) }
    })

    await step('late-responses', async () => {
      let held = null
      let holdNext = true
      const releases = []
      const stalePath = '__probe_stale_generation__.txt'
      const handler = async (route) => {
        if (!holdNext || norm(route.request().postDataJSON().repoRoot) !== norm(a.root)) { await route.fallback(); return }
        holdNext = false
        const upstream = await route.fetch()
        const body = await upstream.json()
        assert.equal(body.ok, true)
        body.data.changes.untracked.push({ path: stalePath, index: '?', worktree: '?', additions: 0, deletions: 0, binary: false })
        await new Promise((release) => { held = release; releases.push(release) })
        await route.fulfill({ response: upstream, json: body })
      }
      await page.route('**/dsh-ide-git/api/changes', handler)
      try {
        await card(a).locator('[data-card-refresh]').click()
        await eventually(() => held, 'old changes response is held')
        await waitChanges(a, () => root.locator('[data-all-refresh]').click())
        const currentCount = await card(a).locator('.dig-all-card-head > .dig-count').innerText()
        const delivered = page.waitForResponse((res) => new URL(res.url()).pathname.endsWith('/dsh-ide-git/api/changes') && norm(res.request().postDataJSON().repoRoot) === norm(a.root))
        held(); held = null
        await delivered
        await page.evaluate(() => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))))
        assert.equal(await card(a).locator('.dig-all-card-head > .dig-count').innerText(), currentCount)
        assert.equal(await row(a, stalePath).count(), 0)
        check(true, 'late response from an older refresh generation cannot replace current data')
        holdNext = true
        await card(a).locator('[data-card-refresh]').click()
        await eventually(() => held, 'unmount response is held')
        await mode('repo')
        const deliveredAfterUnmount = page.waitForResponse((res) => new URL(res.url()).pathname.endsWith('/dsh-ide-git/api/changes') && norm(res.request().postDataJSON().repoRoot) === norm(a.root))
        held(); held = null
        await deliveredAfterUnmount
        await mode('all')
        await waitReady(a)
        await waitReady(b)
        assert.equal(await row(a, stalePath).count(), 0)
        check(true, 'response delivered after overview unmount does not seed a remounted card')
      } finally { for (const release of releases) release(); await page.unroute('**/dsh-ide-git/api/changes', handler) }
    })

    if (process.env.DIG_PROBE_DESTRUCTIVE !== '1') skip('stage/unstage/commit/commit-push/discard/undo/undoBlocked: set DIG_PROBE_DESTRUCTIVE=1 for marked temporary fixtures')
    else {
      await step('stage-unstage', async () => {
        const other = readBoundary(b)
        await write(a, 'stage', () => row(a, FILES.edit).getByTitle(/^(暂存|Stage)$/).click())
        assert(git(a.root, ['diff', '--cached', '--name-only']).split('\n').includes(FILES.edit))
        assert.equal(git(a.root, ['show', ':' + FILES.edit]), readFileSync(join(a.root, FILES.edit), 'utf8').trimEnd())
        assert.deepEqual(readBoundary(b), other)
        await write(a, 'unstage', () => row(a, FILES.edit).getByTitle(/^(取消暂存|Unstage)$/).click())
        assert(!git(a.root, ['diff', '--cached', '--name-only']).split('\n').includes(FILES.edit))
        assert(git(a.root, ['diff', '--name-only']).split('\n').includes(FILES.edit))
        assert.deepEqual(readBoundary(b), other)
        check(true, 'stage/unstage change the real index and leave the other repository unchanged')
      })
      await step('commit-and-push', async () => {
        const other = readBoundary(b)
        const previous = git(a.root, ['rev-parse', 'HEAD'])
        const message = 'Overview probe commit'
        await card(a).locator('.dig-commit-box textarea, .dig-commit-box input:not([type="checkbox"])').fill(message)
        await write(a, 'commit', () => card(a).getByRole('button', { name: /^(提交|Commit)$/, exact: true }).click())
        assert.notEqual(git(a.root, ['rev-parse', 'HEAD']), previous)
        assert.equal(git(a.root, ['log', '-1', '--format=%s']), message)
        assert.equal(git(a.root, ['show', 'HEAD:' + FILES.staged]), 'probe-a staged change')
        assert.equal(git(a.root, ['diff', '--cached', '--name-only']), '')
        assert.deepEqual(readBoundary(b), other)
        await write(a, 'stage', () => row(a, FILES.edit).getByTitle(/^(暂存|Stage)$/).click())
        await card(a).locator('.dig-commit-box textarea, .dig-commit-box input:not([type="checkbox"])').fill('Overview probe local bare push')
        const result = await write(a, 'commit', () => card(a).getByRole('button', { name: /^(提交并推送|Commit and push)$/, exact: true }).click())
        assert.equal(result.record.payload.push, true)
        assert.equal(result.record.payload.confirm, true)
        assert.equal(git(a.remote, ['rev-parse', 'refs/heads/main']), git(a.root, ['rev-parse', 'HEAD']))
        assert.deepEqual(readBoundary(b), other)
        check(true, 'commit updates HEAD and commit/push confirms and updates the local bare remote')
      })
      const discard = async (repo, file) => {
        await row(repo, file).getByTitle(/^(丢弃更改|Discard changes)$/).click()
        await card(repo).locator('.dig-dialog').waitFor({ state: 'visible' })
        assert.equal(await card(repo === a ? b : a).locator('.dig-dialog').count(), 0)
        return write(repo, 'discard', () => card(repo).locator('.dig-dialog').getByRole('button', { name: /^(确定|OK)$/, exact: true }).click())
      }
      await step('discard-undo', async () => {
        await mode('repo')
        assert.equal(norm(await root.locator('.dig-select-repo').locator('..').getAttribute('title')), norm(b.root))
        await mode('all')
        await waitReady(a)
        await waitReady(b)
        // Operate on A while the panel is bound to B to catch incorrect undo routing.
        const other = readBoundary(b)
        const bytes = readFileSync(join(a.root, FILES.peer))
        const result = await discard(a, FILES.peer)
        assert.equal(result.record.payload.confirm, true)
        assert(result.body.undo?.id)
        assert.equal(readFileSync(join(a.root, FILES.peer), 'utf8').trimEnd(), git(a.root, ['show', 'HEAD:' + FILES.peer]))
        const toast = root.locator('.dig-toast').filter({ hasText: FILES.peer }).filter({ has: page.locator('.dig-toast-action') })
        await toast.waitFor({ state: 'visible' })
        const undone = await write(a, 'undoApply', () => toast.locator('.dig-toast-action').click())
        assert.equal(undone.record.payload.id, result.body.undo.id)
        assert.deepEqual(readFileSync(join(a.root, FILES.peer)), bytes)
        assert.deepEqual(readBoundary(b), other)
        check(true, 'discard confirms; toast undo restores real bytes through the original card root')
      })
      await step('snapshot-not-kept', async () => {
        const file = 'large-no-undo.txt'
        writeFileSync(join(a.root, file), Buffer.alloc(4 * 1024 * 1024 + 1, 120))
        await refresh(a)
        const result = await discard(a, file)
        assert.equal(result.record.payload.untracked, true)
        assert.equal(result.body.undoBlocked, true)
        assert.equal(result.body.undo, undefined)
        assert.equal(existsSync(join(a.root, file)), false)
        const toast = root.locator('.dig-toast').filter({ hasText: file })
        await toast.waitFor({ state: 'visible' })
        assert.match(await toast.innerText(), /未保留撤回|too large to keep an undo/i)
        assert.equal(await toast.locator('.dig-toast-action').count(), 0)
        check(true, 'oversized discard removes the real file and reports snapshot not kept with no undo action')
      })
    }

    await step('return-single-repository', async () => {
      const start = monitor.records.length
      await mode('repo')
      await eventually(() => monitor.records.slice(start).some((record) => record.method === 'summary'), 'returning to a repository performs a complete summary read')
      await root.locator('.dig-body').waitFor({ state: 'visible' })
      assert.equal(await root.locator('.dig-all').count(), 0)
      assert.equal(await page.evaluate(() => localStorage.getItem('dsh-ide-git.view.v1')), 'repo')
      check(true, 'returning to a repository restores complete reads and persists repo mode')
      // Exercise the card-open path separately from the view toggle.
      await mode('all')
      await waitReady(a)
      await waitReady(b)
      await card(a).locator('[data-card-open]').click()
      await eventually(async () => await root.locator('[data-view-mode]').getAttribute('data-view-mode') === 'repo', 'open card switches to repository')
      assert.equal(norm(await root.locator('.dig-select-repo').locator('..').getAttribute('title')), norm(a.root))
      check(true, 'opening a card returns to the single-repository view bound to that card')
    })
  } catch (error) { check(false, 'overview setup or dependent scenarios', String(error.stack ?? error)) }
  finally {
    await monitor.flush()
    report.fetches = await monitor.fetches()
    const overviewFetches = report.fetches.filter((item) => item.source === 'overview')
    check(overviewFetches.some((item) => item.method === 'changes'), 'runtime fetch stack identifies overview changes calls', overviewFetches.filter((item) => item.method === 'changes').map((item) => ({ method: item.method, source: item.source, payload: item.payload, stack: item.stack })))
    const forbidden = overviewFetches.filter((item) => ['summary', 'stats'].includes(item.method))
    check(forbidden.length === 0, 'overview fetchOne never appends summary or stats', forbidden)
    report.overviewCalls = overviewFetches
    report.otherReads = report.fetches.filter((item) => item.source !== 'overview' && ['summary', 'stats'].includes(item.method)).map(({ method, payload, at, stack }) => ({ method, payload, at, stack }))
    report.status = report.failures.length > 0 ? 'FAIL' : report.skipped.length > 0 ? 'PARTIAL' : 'PASS'
    writeFileSync(join(outDir, 'overview-report.json'), JSON.stringify(report, null, 2))
    log('overview result: ' + report.status + ' (see overview-report.json); other summary/stats=' + report.otherReads.length)
  }
  return report
}
