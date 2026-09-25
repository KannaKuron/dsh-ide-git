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

test('the dock actions exist only where the right sidebar can perform them', () => {
  // The official right sidebar is read at RENDER time: ctx.get('sidebarRight')
  // returns undefined while ui-sidebar-right has not mounted yet (measured on
  // 0.1.7-rc.2), and a host running dsh-better-sidebar or an old host has none at
  // all. Missing service = no buttons, no error.
  const start = client.indexOf('/* ---- dock action core')
  const end = client.indexOf('/* ---- end dock action core')
  assert.ok(start >= 0 && end > start, 'the dock action core must keep its markers')
  const core = new Function(client.slice(start, end)
    + '\nreturn { dockFaceOf: dockFaceOf, dockActionState: dockActionState }')()

  const service = { float: () => {}, dock: () => {}, split: () => {}, toggleFullscreen: () => {} }
  assert.equal(core.dockFaceOf(null), null, 'no ctx means no dock actions')
  assert.equal(core.dockFaceOf({ get: () => undefined }), null, 'a host without sidebarRight degrades silently')
  assert.equal(core.dockFaceOf({ get: () => { throw new Error('late service') } }), null, 'a throwing ctx.get must not escape')
  assert.equal(core.dockFaceOf({ get: () => ({ float: () => {} }) }), null, 'half a service is not a service')
  assert.equal(core.dockFaceOf({ get: () => service }), service)

  const off = core.dockActionState(null, null)
  assert.deepEqual([off.wired, off.float, off.split, off.fullscreen], [false, false, false, false],
    'an unwired panel offers none of the dock actions')
  const docked = core.dockActionState({ service: service, tabId: 'tab3', paneId: 'pane1' }, null)
  assert.deepEqual([docked.wired, docked.float, docked.split, docked.fullscreen, docked.floating], [true, true, true, true, false])
  const floating = core.dockActionState({ service: service, tabId: 'tab3', paneId: 'float4' }, 'float4')
  assert.deepEqual([floating.float, floating.split, floating.floating], [true, false, true],
    'a floating panel can be docked back, but not split again')
  assert.equal(core.dockActionState({ service: service, tabId: '' }, null).wired, false, 'a tab without an id is not floatable')
})

test('the tree toggle is reachable again after it was folded', () => {
  // treeOpen is persisted, so a header button that only rendered while the tree
  // was OPEN left a folded tree with no way back (a workspace could only be
  // repaired by clearing localStorage). The header button is two-way now, and the
  // rail carries the action for the chromes that have no header button.
  const bar = client.slice(client.indexOf("className: 'dig-compact-bar'"), client.indexOf("className: 'dig-compact-bar'") + 1400)
  assert.match(bar, /'data-action': 'tree'/, 'the compact header keeps a tree control')
  assert.match(bar, /onClick: \(\) => foldTree\(!treeOpen\)/, 'and it toggles BOTH ways')
  assert.match(bar, /'aria-pressed': treeOpen \? 'true' : 'false'/)
  assert.match(bar, /E\(Icon, \{ name: treeOpen \? 'eye' : 'eyeOff' \}\)/, 'the icon distinguishes the two states')
  assert.doesNotMatch(client, /treeOpen \? E\('button'/, 'no chrome may render its tree control only while the tree is open')

  const specs = client.slice(client.indexOf('const RAIL_SPECS = ['), client.indexOf('const RAIL_IDS ='))
  for (const id of ['tree', 'float', 'split', 'fullscreen']) {
    assert.match(specs, new RegExp("\\{ id: '" + id + "'"), 'RAIL_SPECS must carry the ' + id + ' action')
  }
  assert.match(client, /const RAIL_VIEW_IDS = \['tree', 'float', 'split', 'fullscreen'\]/,
    'view actions must stay clickable while a git command runs')
  assert.match(client, /action\.available !== false/, 'an action this mount cannot perform is not rendered at all')
})

test('the dock actions are wired on the native seat only', () => {
  // Door 2 (the native right-sidebar seat) owns a sidebarRight tab id; door 1
  // (dsh-better-sidebar) does not, and floating a foreign tab id is not a thing.
  assert.match(client, /readDockInfo\(props\.useTabInfo, props\.ctx\)/, 'the native seat reads its own tab identity')
  const better = client.slice(client.indexOf('betterSidebar.registerTab({'), client.indexOf('dsh-ide-git: Git tab'))
  assert.doesNotMatch(better, /dock:/, 'the better-sidebar door must not wire dock actions')
  assert.match(client, /try \{ info = useTabInfo\(\) \} catch \(error\) \{ void error \}/,
    'the slot reader throws until the tab is committed; a missing answer is a missing button')
  assert.match(client, /node\.closest\('\[data-dockkit-float\]'\)/, 'the float state comes from the float layer marker')
})

test('every shipped dictionary carries the same key set as zh', () => {
  // A locale block is preceded by a /* locale: <tag> */ marker, so the blocks
  // can be sliced without parsing the file. Equality matters because a key
  // missing from a third language falls back to English at lookup time — a
  // silent half-translated panel, which is exactly what this catches.
  //
  // Each block is cut at its OWN closing brace: the text after the last
  // dictionary is ordinary code, and a perfectly innocent `'data-action': 'tree',`
  // in a component reads exactly like a dictionary entry to a line scanner.
  const keyLines = (segment) => [...segment.matchAll(/^ +'([^']+)': '/gm)].map((match) => match[1]).sort()
  const bodyOf = (segment) => {
    const start = segment.indexOf('{')
    let depth = 0
    for (let index = start; index < segment.length; index += 1) {
      if (segment[index] === '{') depth += 1
      else if (segment[index] === '}') {
        depth -= 1
        if (depth === 0) return segment.slice(start, index + 1)
      }
    }
    throw new Error('unterminated dictionary')
  }
  const zhSegment = client.slice(client.indexOf('const ZH = {'), client.indexOf('const EN = {'))
  const zhKeys = keyLines(zhSegment)
  assert.ok(zhKeys.length >= 140, 'the zh dictionary looks truncated: ' + zhKeys.length)

  const parts = client.split('/* locale: ')
  assert.ok(parts.length - 1 >= 3, 'expected at least three third-language dictionaries, saw ' + (parts.length - 1))
  for (let index = 1; index < parts.length; index += 1) {
    const tag = parts[index].slice(0, parts[index].indexOf(' */'))
    assert.deepEqual(keyLines(bodyOf(parts[index])), zhKeys, 'dictionary ' + tag + ' does not match the zh key set')
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

/* ---------------------------------------------------------------------------
 * Draggable panes (issue #5).
 *
 * The sizing core sits between two markers as a PURE block (no window, no DOM,
 * no React), so these tests slice it out and drive the real implementation —
 * a re-implemented clamp in the test would only ever agree with itself.
 * ------------------------------------------------------------------------- */

function paneCore() {
  const start = client.indexOf('/* ---- pane sizing core')
  const end = client.indexOf('/* ---- end pane sizing core')
  assert.ok(start >= 0 && end > start, 'the pane sizing core must keep its markers')
  const exported = 'return { PANES_KEY: PANES_KEY, PANE_LIMITS: PANE_LIMITS, PANE_DEFAULTS: PANE_DEFAULTS,'
    + ' PANE_CHROME_KEYS: PANE_CHROME_KEYS, PANE_BUCKETS: PANE_BUCKETS, PANE_GUTTER_PX: PANE_GUTTER_PX,'
    + ' panBucket: panBucket, normalizePanes: normalizePanes, withPaneRatio: withPaneRatio, paneGeometry: paneGeometry }'
  return new Function(client.slice(start, end) + '\n' + exported)()
}

test('pane sizes are stored per surface under one versioned key', () => {
  assert.match(client, /const PANES_KEY = 'dsh-ide-git\.panes\.v1'/)
  assert.match(client, /localStorage\.getItem\(PANES_KEY\)/, 'reads must go through the versioned key')
  assert.match(client, /localStorage\.setItem\(PANES_KEY, JSON\.stringify\(normalizePanes\(config\)\)\)/,
    'writes must be normalised too, and wrapped in try/catch')

  const core = paneCore()
  // Six buckets: the bottom workbench and the right sidebar must never share a
  // remembered size, even when they run the same chrome.
  assert.deepEqual(core.PANE_BUCKETS, [
    'columns:wide', 'columns:tall', 'stack:wide', 'stack:tall', 'compact:wide', 'compact:tall',
  ])
  assert.equal(core.panBucket('stack', { width: 500, height: 900 }), 'stack:tall')
  assert.equal(core.panBucket('stack', { width: 900, height: 500 }), 'stack:wide')
  assert.equal(core.panBucket('compact', { width: 300, height: 300 }), 'compact:wide', 'a square panel is not tall')
})

test('normalizePanes drops unknown buckets, unknown keys and out-of-range ratios', () => {
  const core = paneCore()
  assert.deepEqual(core.normalizePanes(null), { treeOpen: true, panes: {} }, 'the tree stays open by default')
  assert.deepEqual(core.normalizePanes('nope'), { treeOpen: true, panes: {} })
  assert.deepEqual(core.normalizePanes({ panes: 7 }), { treeOpen: true, panes: {} })

  const clean = core.normalizePanes({
    treeOpen: false,
    panes: {
      'stack:tall': { tree: 0.3, changes: 'wide', diff: 0, ghost: 0.5 },
      'stack:wide': { tree: 1.2, changes: -0.1, diff: Number.NaN },
      'stack:tallish': { tree: 0.5 },
      bogus: { tree: 0.5 },
    },
  })
  assert.equal(clean.treeOpen, false, 'a folded tree is remembered')
  assert.deepEqual(clean.panes, { 'stack:tall': { tree: 0.3 } },
    'only finite ratios in (0, 1] on known keys survive')

  const one = core.withPaneRatio(clean, 'stack:tall', 'diff', 0.44)
  assert.deepEqual(one.panes['stack:tall'], { tree: 0.3, diff: 0.44 })
  assert.equal(one.treeOpen, false, 'the tree state rides along with the sizes')
  assert.deepEqual(core.withPaneRatio(one, 'stack:tall', 'diff', null).panes['stack:tall'], { tree: 0.3 },
    'a double-click reset removes the override')
  const emptied = core.withPaneRatio(core.withPaneRatio(one, 'stack:tall', 'tree', null), 'stack:tall', 'diff', null)
  assert.equal(emptied.panes['stack:tall'], undefined, 'an emptied bucket is not stored at all')
  assert.deepEqual(clean.panes['stack:tall'], { tree: 0.3 }, 'the update must not mutate its input')
})

test('the pane clamps hold at both ends and never squeeze a pane to zero', () => {
  const core = paneCore()
  const tall = { width: 500, height: 900 }

  // Nothing stored → no inline override at all: the stylesheet default (200px
  // tree, 290px changes, the percentage caps) keeps rendering as before.
  const fresh = core.paneGeometry('stack', tall, core.normalizePanes(null))
  assert.deepEqual(fresh.overrides, {})
  assert.equal(fresh.bucket, 'stack:tall')

  // Stored ratios become px, and every one of them obeys its own limits.
  const stored = core.normalizePanes({ panes: { 'stack:tall': { tree: 0.9, changes: 0.9, diff: 0.9 } } })
  const geo = core.paneGeometry('stack', tall, stored)
  // The changes pane asks for 810px and gets 900 - 150 (middle pane) - 324 (the
  // tree, on its 36% default) - 16 (two gutters) = 410.
  assert.equal(geo.overrides.changes, 410, 'the changes pane stops where the middle pane begins')
  assert.equal(geo.overrides.tree, 324, 'the tree gives way to the pane it shares the column with')
  assert.equal(geo.overrides.diff, 120, 'the diff can never eat the history list')
  assert.equal(geo.limits.diff.max, 120)
  assert.ok(geo.overrides.tree + geo.overrides.changes + 2 * core.PANE_GUTTER_PX <= tall.height)

  // Tiny stored ratios clamp UP to the minimums, never to 0.
  const tiny = core.paneGeometry('stack', tall, core.normalizePanes({ panes: { 'stack:tall': { tree: 0.001, changes: 0.001 } } }))
  assert.equal(tiny.overrides.tree, core.PANE_LIMITS['stack:tree'].min)
  assert.equal(tiny.overrides.changes, core.PANE_LIMITS['stack:changes'].min)

  // A huge container does not lift the absolute maxima...
  const roomy = core.paneGeometry('columns', { width: 3000, height: 400 },
    core.normalizePanes({ panes: { 'columns:wide': { tree: 1, changes: 1 } } }))
  assert.equal(roomy.overrides.tree, core.PANE_LIMITS['columns:tree'].max)
  assert.equal(roomy.overrides.changes, core.PANE_LIMITS['columns:changes'].max)
  // ...and a container too small for every minimum still never overflows: the
  // minima win, the panes simply fill it.
  const tight = core.paneGeometry('columns', { width: 500, height: 400 },
    core.normalizePanes({ panes: { 'columns:wide': { tree: 1, changes: 1 } } }))
  assert.equal(tight.overrides.tree, core.PANE_LIMITS['columns:tree'].min)
  assert.equal(tight.overrides.changes, core.PANE_LIMITS['columns:changes'].min)
  assert.ok(tight.overrides.tree + tight.overrides.changes + 2 * core.PANE_GUTTER_PX <= 500)

  // A folded tree frees its room instead of reserving it, and has no override.
  const folded = core.paneGeometry('stack', tall, core.normalizePanes({ treeOpen: false, panes: { 'stack:tall': { changes: 1 } } }))
  assert.equal(folded.overrides.tree, undefined)
  assert.equal(folded.overrides.changes, core.PANE_LIMITS['stack:changes'].max)
})

test('the pane dividers are draggable, touch-safe and keyboard reachable', () => {
  const gutter = cssRule('.dig-gutter')
  assert.match(gutter, /touch-action:none/, 'a touch drag must resize the pane, not scroll the panel')
  assert.match(cssRule('.dig-gutter-v'), /width:8px/, 'the hit area is wider than the hairline it paints')
  assert.match(cssRule('.dig-gutter-h'), /height:8px/)
  assert.match(cssRule('.dig-gutter::after'), /var\(--dsw-alias-hairline,/, 'the hairline keeps the theme token')
  assert.match(client, /setPointerCapture/, 'the drag must survive leaving the hit area')
  assert.match(client, /\.dig-pane-dragging,\.dig-pane-dragging \*\{user-select:none\}/, 'no text selection while dragging')
  assert.match(client, /onLostPointerCapture/, 'a dropped capture must still finish the gesture')
  // Double-click resets and the arrow keys nudge (Shift = 4x).
  assert.match(client, /onDoubleClick: \(\) => props\.onReset\(\)/)
  assert.match(client, /const step = event\.shiftKey === true \? 32 : 8/)
  assert.match(client, /role: 'separator'/)
})

test('every overlay is clamped to the panel it lives in', () => {
  // Found while making the panel draggable (issue #5): the dock can now be dragged
  // narrower than the overlays' own minimum, and a fixed min-width BEATS max-width
  // in CSS — so the context menu came out wider than the panel and hung past its
  // right edge. Invariant 13 is about the panel's box, not just its origin.
  assert.match(cssRule('.dig-menu'), /box-sizing:border-box/)
  assert.match(cssRule('.dig-menu'), /min-width:min\(200px,calc\(100% - 8px\)\)/, 'the menu minimum must yield to the panel')
  assert.match(cssRule('.dig-menu'), /max-width:calc\(100% - 8px\)/)
  assert.match(cssRule('.dig-dialog'), /box-sizing:border-box/, 'a content-box dialog adds its padding on top of the clamp')
  assert.match(cssRule('.dig-dialog'), /min-width:min\(240px,100%\)/)
  assert.match(cssRule('.dig-dialog'), /max-width:min\(420px,94%\)/)
  assert.match(cssRule('.dig-dialog-wide'), /min-width:min\(360px,92%\)/)
  assert.match(cssRule('.dig-toasts'), /max-width:min\(340px,92%\)/)
  // Under the compact threshold the panel marks itself, and the nowrap labels that
  // would otherwise be clipped start wrapping inside the clamped box.
  assert.match(client, /compact \? ' dig-root-narrow' : ''/)
  assert.match(client, /\.dig-root-narrow \.dig-menu-item\{white-space:normal\}/)
  assert.match(client, /\.dig-root-narrow \.dig-toast-text\{white-space:normal\}/)
})

test('every pane name a divider announces exists in every dictionary', () => {  const mapped = client.match(/const PANE_NAME_KEYS = \{([^}]*)\}/)
  assert.ok(mapped !== null, 'the pane name map must stay greppable')
  const keys = [...mapped[1].matchAll(/'([^']+)'/g)].map((match) => match[1])
  assert.deepEqual(keys, ['toolbar.tree', 'changes.title', 'pane.diff'])
  const zh = client.slice(client.indexOf('const ZH = {'), client.indexOf('const EN = {'))
  const en = client.slice(client.indexOf('const EN = {'), client.indexOf('const LOCALES = {'))
  for (const key of keys) {
    assert.ok(zh.includes("'" + key + "':"), 'ZH is missing ' + key)
    assert.ok(en.includes("'" + key + "':"), 'EN is missing ' + key)
  }
  // The template that wraps the name is looked up through t(), so the shared
  // dictionary test already covers all 21 languages for it.
  assert.match(client, /fill\(props\.t\('pane\.resize'\), \{ name: props\.t\(props\.nameKey\) \}\)/)
})
