/**
 * dsh-ide-git — smoke test (file-level only: no Cordis runtime, no browser).
 *
 * Guards the invariants that would silently break the plugin at load time:
 * manifest/bookkeeping consistency, the no-build client wrapper, the baseline
 * require whitelist, and the argv-only git posture of the host half.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..')
const read = (name) => readFileSync(join(root, name), 'utf8')
const exists = (name) => existsSync(join(root, name))

const pkg = JSON.parse(read('package.json'))
const manifest = JSON.parse(read('dsh.plugin.json'))
const host = read('src/index.js')
const client = read('src/client.js')
const changelog = read('CHANGELOG.md')
const patch = read('cordis.patch.yml')

/** The dsh client baseline modules a no-build client half may require. */
const BASELINE = new Set([
  'react',
  'react/jsx-runtime',
  'react-dom',
  'react-dom/client',
  '@deepseek-ai/cordis',
  '@deepseek-ai/dsh-client-store',
  '@deepseek-ai/dsh-client-ui-slots',
  '@deepseek-ai/dsh-client-ui-primitives',
])

test('release bookkeeping: package.json and dsh.plugin.json agree', () => {
  assert.equal(manifest.version, pkg.version)
  assert.equal(manifest.main, './' + pkg.main)
  assert.equal(pkg.name, 'dsh-ide-git')
  assert.match(manifest.id, /^dsh-external\//)
  assert.equal(pkg.license, 'MIT')
  assert.ok(exists('LICENSE'))
})

test('every published entry exists on disk', () => {
  assert.ok(exists(pkg.main), 'host entry missing')
  assert.ok(exists('cordis.patch.yml'))
  for (const file of pkg.files) {
    if (file.includes('*')) continue
    assert.ok(exists(file), 'files[] entry missing: ' + file)
  }
  assert.equal(pkg.exports['.'], './' + pkg.main)
  assert.equal(pkg.exports['./client'], './src/client.js')
})

test('cordis patch mounts exactly one row named dsh-ide-git', () => {
  // Commented-out examples must not count: only live YAML lines are the mount.
  const active = patch.split('\n').filter((line) => !line.trim().startsWith('#')).join('\n')
  assert.match(active, /- insert:/)
  const names = active.match(/name: '([^']+)'/g) || []
  assert.deepEqual(names, ["name: 'dsh-ide-git'"])
  assert.match(active, /id: ide-git/)
})

test('client half uses the no-build ModuleLoader wrapper', () => {
  assert.match(client, /window\.__ModuleLoader__\.load\(\{/)
  assert.match(client, /id: 'dsh-ide-git'/)
  assert.match(client, /factory: \(require\) =>/)
  assert.doesNotMatch(client, /^\s*import\s/m, 'client half must not use import')
  assert.doesNotMatch(client, /\bexport\s+(default\s+)?(const|function|class)\b/)
})

test('client half requires only baseline modules', () => {
  const calls = client.match(/require\((['"])([^'"]+)\1\)/g) || []
  assert.ok(calls.length > 0, 'expected at least one require call')
  for (const call of calls) {
    const name = call.slice(call.indexOf('(') + 2, call.length - 2)
    assert.ok(BASELINE.has(name), 'non-baseline require: ' + name)
  }
})

test('client half has two doors: better-sidebar first, native right sidebar as fallback', () => {
  assert.match(client, /const TAB_ID = 'dsh-ide-git:panel'/)
  assert.match(client, /single: true/)
  // Door 1 — dsh-better-sidebar, waited for through ctx.inject so a host that
  // loads it late still gets the tab (and the bottom workbench with it).
  assert.match(client, /ctx\.inject\(\['betterSidebar'\]/)
  assert.match(client, /betterSidebar\.registerTab\(\{/)
  // Door 2 — DSH's own right-sidebar seats, for a host running this plugin
  // alone. Both doors can never be open at once.
  assert.match(client, /ctx\.get\('sidebarRightTabs'\)/)
  assert.match(client, /slots\.inject\('sidebar\.right\.pane\.tab'/)
  assert.match(client, /hostedByBetterSidebar/)
  assert.match(client, /inject: \[\], apply/)
  const registrations = client.match(/registerTab\(/g) || []
  assert.equal(registrations.length, 1)
  const nativeTypes = client.match(/tabs\.register\(\{/g) || []
  assert.equal(nativeTypes.length, 1, 'exactly one native tab type registration')
})

test('host half is an ESM cordis plugin with argv-only git calls', () => {
  assert.match(host, /export const name = 'dsh-ide-git'/)
  assert.match(host, /export const inject = \['webServer'\]/)
  assert.match(host, /export function apply\(ctx\)/)
  assert.match(host, /ctx\.webServer\.register\(\{ kind: 'prefix', path: ROUTE_PREFIX/)
  assert.match(host, /spawn\(gitBinary\(\), args, \{ cwd/)
  assert.doesNotMatch(host, /(^|[^.\w])exec\(/m, 'no shell exec')
  assert.doesNotMatch(host, /execSync\(|shell:\s*true/, 'no shell exec / shell:true')
  assert.doesNotMatch(host, /from '(?!node:)/, 'host half may only import node: builtins')
})

test('host half keeps the destructive-confirm guards', () => {
  for (const needle of [
    'push requires confirm: true',
    'hard reset requires confirm: true',
    'force delete requires confirm: true',
    'discarding untracked files requires confirm: true',
    'dropping a stash requires confirm: true',
  ]) {
    assert.ok(host.includes(needle), 'missing guard: ' + needle)
  }
})

test('host half exposes the method table the client calls', () => {
  const methods = ['summary', 'branches', 'log', 'commitDetail', 'diff', 'compare', 'repos', 'stage', 'unstage', 'discard', 'commit', 'checkout', 'branchCreate', 'branchRename', 'branchDelete', 'merge', 'rebase', 'cherryPick', 'revert', 'reset', 'fetch', 'pull', 'push', 'stashList', 'stashPush', 'stashApply', 'stashDrop', 'tagCreate', 'tagDelete', 'undoList', 'undoApply', 'version']
  for (const method of methods) {
    assert.match(host, new RegExp('^  ' + method + ',$', 'm'), 'host method missing: ' + method)
  }
  for (const call of client.match(/request\('([a-zA-Z]+)'/g) || []) {
    const method = call.slice(call.indexOf("'") + 1, call.length - 1)
    assert.ok(methods.includes(method), 'client calls an unregistered method: ' + method)
  }
})

test('host half serialises writes and refuses the dangerous cases', () => {
  for (const needle of [
    'const WRITE_METHODS = new Set([',
    'function withRepoLock(key, work) {',
    "const PROTECTED_BRANCHES = new Set(['main', 'master', 'trunk'])",
    "refusing to delete the checked-out branch",
    "'deleting \"' + name + '\" requires confirm: true'",
    'function pushUndo(root, entry) {',
    'async function operationOf(root) {',
  ]) {
    assert.ok(host.includes(needle), 'missing safety guard: ' + needle)
  }
  // '.' would wipe every untracked file at once; the panel only ever discards
  // explicit paths, so the root is filtered out before git sees it.
  assert.ok(host.includes("entry !== '.' && entry !== './'"), 'discard must not accept the repository root')
})

test('client half offers an undo toast and a safe confirm', () => {
  for (const needle of [
    'function ToastStack(props) {',
    "actionLabel: t('toast.undo'),",
    "request('undoApply'",
    'function isProtectedBranch(name) {',
    'requireText: guarded ? dialog.name : undefined,',
  ]) {
    assert.ok(client.includes(needle), 'missing client guard: ' + needle)
  }
  // Destructive dialogs must not open with focus on the red button.
  assert.match(client, /cancelRef\.current\.focus\(\)/, 'confirm dialog must focus cancel')
})

test('a discard is reversible through the same undo stack', () => {
  // Overwriting the working tree is a destructive action like any other: the
  // host snapshots the bytes first, and says so honestly when it cannot.
  for (const needle of [
    'function snapshotForUndo(root, paths) {',
    'function snapshotState(root, files) {',
    "kind: 'discard'",
    'undoBlocked: true',
    'UNDO_MAX_SNAPSHOT_BYTES',
  ]) {
    assert.ok(host.includes(needle), 'missing host guard: ' + needle)
  }
  for (const needle of [
    "t('toast.discarded')",
    'data.undoBlocked === true',
    "'undo.discard'",
    'void discardChanges(item, group)',
  ]) {
    assert.ok(client.includes(needle), 'missing client guard: ' + needle)
  }
})

test('every shipped dictionary carries the same key set as zh', () => {
  // A locale block is preceded by a /* locale: <tag> */ marker, so the blocks
  // can be sliced without parsing the file. Equality matters because a key
  // missing from a third language falls back to English at lookup time — a
  // silent half-translated panel, which is exactly what this catches.
  const keyLines = (segment) => [...segment.matchAll(/^ +'([^']+)': '/gm)].map((match) => match[1]).sort()
  const zhSegment = client.slice(client.indexOf('const ZH = {'), client.indexOf('const EN = {'))
  const zhKeys = keyLines(zhSegment)
  assert.ok(zhKeys.length >= 140, 'the zh dictionary looks truncated: ' + zhKeys.length)

  const parts = client.split('/* locale: ')
  assert.ok(parts.length - 1 >= 3, 'expected at least three third-language dictionaries, saw ' + (parts.length - 1))
  for (let index = 1; index < parts.length; index += 1) {
    const tag = parts[index].slice(0, parts[index].indexOf(' */'))
    assert.deepEqual(keyLines(parts[index]), zhKeys, 'dictionary ' + tag + ' does not match the zh key set')
  }
})

test('changelog tracks the current version', () => {
  assert.match(changelog, new RegExp('^## v' + pkg.version.replace(/\./g, '\\.') + ' — \\d{4}-\\d{2}-\\d{2}$', 'm'))
  assert.ok(exists('README.md') && exists('README_EN.md') && exists('AGENTS.md'))
})

test('markdown stays well-formed: fences paired, files newline-terminated', () => {
  // 2026-09-14: README 的 8 个代码围栏被写成「反引号 + @」,GitHub 上「安装」整段错乱。
  // README 是别人看到的第一屏,在这之前没有任何测试看着它。
  const fence = '`'.repeat(3)
  for (const name of ['README.md', 'README_EN.md', 'CHANGELOG.md', 'AGENTS.md']) {
    const lines = read(name).split('\n')
    assert.ok(!lines.some((line) => line.startsWith('`@')), name + ' has a half-typed fence')
    assert.ok(read(name).endsWith('\n'), name + ' must end with a newline')
    const fences = lines.filter((line) => line.startsWith(fence))
    assert.equal(fences.length % 2, 0, name + ' has an unpaired code fence')
    for (const line of fences) {
      assert.match(line, /^`{3,4}[a-zA-Z0-9]*$/, name + ' has a malformed fence: ' + line)
    }
  }
})
test('client half exposes t(key), never the raw dictionary object', () => {
  assert.match(client, /const t = \(key\) =>/, 't must be a lookup function')
  assert.doesNotMatch(client, /const t = dictionaryOf\(/, 't must not be the dictionary itself')

  const block = (name) => {
    const start = client.indexOf('const ' + name + ' = {')
    assert.ok(start >= 0, name + ' dictionary missing')
    let depth = 0
    for (let index = client.indexOf('{', start); index < client.length; index += 1) {
      if (client[index] === '{') depth += 1
      else if (client[index] === '}') {
        depth -= 1
        if (depth === 0) return client.slice(start, index + 1)
      }
    }
    throw new Error('unterminated ' + name)
  }

  const keys = new Set()
  for (const match of client.matchAll(/\bt\('([^']+)'\)/g)) keys.add(match[1])
  assert.ok(keys.size >= 30, 'expected many looked-up keys, saw ' + keys.size)
  for (const name of ['ZH', 'EN']) {
    const text = block(name)
    for (const key of keys) {
      assert.ok(text.includes("'" + key + "':"), name + ' is missing the key ' + key)
    }
  }
})
