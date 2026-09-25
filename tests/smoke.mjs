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
  // The Electron renderer has no loader-internal resolver, so client-module
  // discovery falls back to createRequire(baseUrl).resolve('<pkg>/package.json')
  // — which honours the exports map. Without this key the client half never
  // enters the boot graph and every host log stays green (v0.5.6, issue #2).
  assert.equal(pkg.exports['./package.json'], './package.json')
})

test('the dsh peer survives the runtime compatibility check', () => {
  // dsh 0.1.7+ enforces peerDependencies entries named @deepseek-ai/dsh* and
  // ignores engines.dsh entirely (packages/boot/app-boot/src/plugin-compatibility.ts),
  // so the plugin's floor has to live in BOTH fields with the same value.
  const peer = pkg.peerDependencies['@deepseek-ai/dsh']
  assert.equal(peer, pkg.engines.dsh, 'the dsh peer must mirror engines.dsh exactly')
  // Open floor, prerelease-aware ('-0'): every host that can enforce the check
  // is 0.1.7+, so a floor of 0.1.2-0 can never disable a host the plugin runs
  // on, and a missing ceiling keeps a future minor from rejecting it the way
  // version-enumerating peers did (dsh-any-background@0.3.0 on rc.1).
  const floor = /^>=(\d+)\.(\d+)\.(\d+)-0$/.exec(peer)
  assert.ok(floor, 'the dsh peer must stay an open >=X.Y.Z-0 floor: ' + peer)
  const required = floor.slice(1).map(Number)
  const satisfies = (version) => {
    const m = /^(\d+)\.(\d+)\.(\d+)/.exec(version)
    assert.ok(m, 'unparsable version ' + version)
    const got = m.slice(1).map(Number)
    for (let i = 0; i < 3; i += 1) {
      if (got[i] !== required[i]) return got[i] > required[i]
    }
    return true
  }
  for (const version of ['0.1.2', '0.1.6', '0.1.7-alpha.1', '0.1.7-rc.1', '0.2.0']) {
    assert.ok(satisfies(version), 'the dsh peer would reject ' + version)
  }
  // OPTIONAL keeps the gate intact while removing the install hazard: the gate
  // reads peerDependencies only, but a package manager with autoInstallPeers
  // (pnpm's default) resolves the range against the registry — and every
  // published @deepseek-ai/dsh version is a prerelease, which a plain range
  // excludes (ERR_PNPM_NO_MATCHING_VERSION for the whole install).
  assert.equal(pkg.peerDependenciesMeta?.['@deepseek-ai/dsh']?.optional, true)
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

test('client API base is mount-relative (sub-path support, issue #4)', () => {
  // dsh 0.1.7 serves the shell with <base href="./">: document.baseURI is the
  // mount the page loaded from, and fetch() resolves relative URLs against it.
  // An origin-absolute base ('/dsh-ide-git/api') would escape the mount and
  // 404 behind any strict prefix-stripping proxy.
  const match = client.match(/const API_BASE = '([^']+)'/)
  assert.ok(match, 'API_BASE declaration missing')
  const base = match[1]
  assert.ok(!base.startsWith('/'), 'API_BASE must be document-relative, not origin-absolute: ' + base)
  // Resolve the SHIPPED constant exactly the way the browser does, under both
  // serving shapes: a prefix-stripping proxy mount and the origin root.
  assert.equal(
    new URL(base + '/repos', 'http://dsh.internal/dsh/').pathname,
    '/dsh/dsh-ide-git/api/repos',
    'under a sub-path mount the call must stay inside the mount',
  )
  assert.equal(
    new URL(base + '/repos', 'http://dsh.internal/').pathname,
    '/dsh-ide-git/api/repos',
    'at the origin root the call must keep today\'s upstream path',
  )
  // The desktop renderer is the other document owner: it loads dsh-app://app/
  // and injects no <base> (its document directory already is the root), so the
  // relative form has to resolve to exactly the absolute form it replaced.
  assert.equal(
    new URL(base + '/repos', 'dsh-app://app/').href,
    new URL('/' + base + '/repos', 'dsh-app://app/').href,
    'the desktop document base must not change what the call resolves to',
  )
})

/** One rule out of the client half's injected stylesheet, by exact selector. */
function cssRule(selector) {
  const start = client.indexOf("'" + selector + '{')
  assert.ok(start >= 0, 'stylesheet rule missing: ' + selector)
  const end = client.indexOf("'", start + 1)
  return client.slice(start + 1, end)
}

test('the rc.2 surface contract: theme-owned menu material on its own layer', () => {
  // dsh 0.1.7-rc.2 (docs/web-styling.md "Component rules") made the menu material
  // theme-owned: dropdown/context/selection menus take `--dsw-menu-surface-fill`
  // plus `--dsw-menu-backdrop-filter` (or, without MenuSurface's macOS backing,
  // `--dsw-specific-menu`, whose darwin fill is 94% opaque), and feature/platform
  // CSS must not override either. The old rule painted its own opaque layer fill,
  // borrowed `--dsh-any-blur-card-panels` as the filter and re-added a neutral
  // border under a hand-rolled shadow — all three are now guarded.
  const menu = cssRule('.dig-menu')
  assert.match(menu, /border:0/, 'an elevated surface carries the hairline inside its shadow, not a border')
  assert.doesNotMatch(menu, /background:var\(--dsw-alias-bg-layer-/, 'the menu must not override the theme material')
  assert.doesNotMatch(menu, /--dsh-any-/, 'platform CSS must not override the theme material')
  // Filtering stays on an isolated layer: on the card itself it would become the
  // backdrop root and the containing block of every descendant.
  const material = cssRule('.dig-menu::before')
  assert.match(material, /z-index:-1/, 'the material must paint on its own layer behind the rows')
  assert.match(material, /border-radius:inherit/)
  assert.match(material, /background:var\(--dsw-specific-menu,/)
  assert.match(material, /backdrop-filter:var\(--dsw-menu-backdrop-filter,/)
  assert.match(material, /pointer-events:none/)
  // Invariant 13 (panel-internal overlays) survives the restructure: the card is
  // still absolute inside `.dig-root`, the scroller is a separate box, and the
  // theme's dark-menu stroke hook rides the card exactly as MenuSurface sets it.
  assert.match(menu, /position:absolute/)
  assert.match(menu, /isolation:isolate/)
  // border-box so `max-height: calc(100% - 8px)` caps the WHOLE card: content-box
  // sizing let the 8px of padding escape the cap, and a tall context menu in a
  // short bottom workbench (185px) stuck 4px past the panel edge. Measured with a
  // HEAD (v0.7.2) baseline tarball in the same instance: 187px of menu in a 185px
  // panel. The clamp only holds while BOTH declarations are present — border-box
  // alone would still let a 16px menu escape an 8px inset, and the 8px inset alone
  // only balances against `left/top >= 4` in ContextMenu.
  assert.match(menu, /box-sizing:border-box/)
  assert.match(menu, /max-height:calc\(100% - 8px\)/)
  assert.match(menu, /max-width:calc\(100% - 8px\)/)
  assert.match(client, /className: 'dig-menu-scroll'/)
  assert.match(client, /'data-menu-material': 'translucent'/)
  assert.doesNotMatch(client, /createPortal/, 'overlays must stay inside .dig-root')
})

test('the rc.2 surface contract: elevation instead of border plus shadow', () => {
  // "Never pair a `--dsw-alias-border-*` border with an lv/elevation shadow"
  // (docs/web-styling.md) — the 0.5px hairline is the first elevation layer.
  // Dialogs take the panel radius; the menu keeps the compact tier (outer R12,
  // 4px padding, R8 rows) from docs/ui-radius.md.
  for (const selector of ['.dig-menu', '.dig-dialog', '.dig-toast']) {
    const text = cssRule(selector)
    assert.match(text, /box-shadow:var\(--dsw-elevation-(prominent|panel)/, selector + ' must take a shared elevation')
    assert.doesNotMatch(text, /border:1px solid var\(--dsw-alias-border-/, selector + ' must not pair a neutral border with elevation')
  }
  assert.match(cssRule('.dig-menu'), /border-radius:var\(--dsw-radius-md,/)
  assert.match(cssRule('.dig-dialog'), /border-radius:var\(--dsw-radius-panel,/)
  // Modal masks keep the translucent dark fill and take their blur from the
  // theme (`--dsw-mask-blur` is `none`, so the declaration is a no-op today).
  assert.match(cssRule('.dig-overlay'), /backdrop-filter:var\(--dsw-mask-blur,/)
})

test('the rc.2 surface contract: one focus colour, radius tokens, round capsules', () => {
  // The theme owns `--dsw-focus-ring-color` / `--dsw-focus-ring-width` and blanks
  // the colour under `html[data-input-modality='pointer']` for everything that is
  // not `:read-write` (ui-theme/src/styles/focus.css), so a component may own its
  // offset and width but never its colour. The old rule used `:focus` with its own
  // colour, which painted a ring on pointer clicks too.
  assert.match(client, /\.dig-select:focus-visible\{outline:1px solid var\(--dsw-focus-ring-color,/)
  assert.doesNotMatch(client, /\.dig-select:focus\{outline:/, 'focus feedback must follow the input modality')
  // Text controls keep their own feedback (the shipped Input.module.css pattern:
  // outline:none plus a focus-within border colour) and use the shared colour.
  assert.match(client, /\.dig-input:focus\{border-color:var\(--dsw-alias-state-business-primary,/)
  assert.match(client, /\.dig-textarea:focus\{border-color:var\(--dsw-alias-state-business-primary,/)

  const css = client.slice(client.indexOf('const CSS = ['), client.indexOf('].join('))
  // docs/ui-radius.md: consume the named scale instead of local values, except
  // deliberate full-round shapes, which pair `corner-shape: round` in-rule so the
  // superellipse does not deform them.
  const radii = [...css.matchAll(/border-radius:([^;'}]+)/g)].map((match) => match[1].trim())
  assert.ok(radii.length >= 12, 'expected the radius scale to be consumed throughout, saw ' + radii.length)
  for (const value of radii) {
    assert.match(
      value,
      /^(var\(--dsw-radius-|calc\(var\(--dsw-radius-|inherit$|50%$|999px$)/,
      'off-scale radius literal (use a --dsw-radius-* token): ' + value,
    )
  }
  const capsules = [...css.matchAll(/border-radius:999px;([^}]*)/g)]
  assert.ok(capsules.length >= 3, 'expected the pill chips to survive, saw ' + capsules.length)
  for (const capsule of capsules) {
    assert.match(capsule[1], /corner-shape:round/, 'a full-round radius must pair corner-shape: round')
  }
  // Double-era posture: every rc.2 token needs a fallback, because the plugin
  // still installs on hosts that predate the scale (engines.dsh >= 0.1.2-0).
  for (const match of css.matchAll(/var\((--dsw-(?:radius|elevation|focus-ring|menu|mask|specific-menu)[a-z0-9-]*)\s*(,|\))/g)) {
    assert.equal(match[2], ',', 'rc.2 token without a fallback: ' + match[1])
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
  // The native seats WAIT for their services (v0.5.3): the old synchronous
  // ctx.get() probe ran before ui-sidebar-right provided the registry on the
  // desktop app and on clean instances, then returned silently — no Git card,
  // no error. ctx.inject() re-registers the moment the services appear.
  assert.match(client, /ctx\.inject\(\['sidebarRightTabs', 'slots'\]/, 'native seats wait for their services')
  assert.match(client, /slots\.inject\('sidebar\.right\.pane\.tab'/)
  assert.match(client, /hostedByBetterSidebar/)
  // The base can be disabled AT RUNTIME: cordis unloads the inject effect,
  // and the cleanup must fall back to the native seats (v0.5.2 — the panel
  // used to vanish until the next reload when better-sidebar was toggled
  // off in the plugin panel).
  assert.match(client, /return \(\) => \{/)
  assert.match(client, /hostedByBetterSidebar = false/)
  assert.match(client, /hostNatively\(\)\n\s*\}/)
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
  assert.match(client, /const t = translatorOf\(ctx\)/, 't must be a live lookup function')
  assert.match(client, /function translatorOf\(ctx\) \{/, 'the live lookup itself must exist')
  assert.match(client, /function dictionaryFor\(active\)/, 'locale tags must resolve through dictionaryFor')
  assert.match(client, /locale\.subscribe\(/, 'the panel must repaint on a live language switch')
  assert.doesNotMatch(client, /const t = dictionaryOf\(/, 't must not be the dictionary itself')
  assert.doesNotMatch(client, /const dict = dictionaryOf\(ctx\)/, 'the dictionary must not be captured once at activation')

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
