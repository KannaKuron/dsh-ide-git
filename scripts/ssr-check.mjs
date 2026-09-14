/**
 * Local SSR self-check for the client half (not part of CI).
 *
 * Renders the registered tab once with react-dom/server against the react
 * copied in the local web profile: this is what catches "renders and throws"
 * regressions (a t() call that is not a function, a TDZ reference in a hooks
 * dependency array, a missing dictionary key) without opening a browser.
 *
 *   node scripts/ssr-check.mjs
 *
 * Skips silently when no web profile is present, so it never blocks anything.
 */
import { createRequire } from 'node:module'
import { existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = fileURLToPath(new URL('..', import.meta.url))
const dshHome = process.env.DSH_HOME === undefined || process.env.DSH_HOME === '' ? join(homedir(), '.dsh') : process.env.DSH_HOME
const profileManifest = join(dshHome, 'profiles', 'web', 'package.json')

if (!existsSync(profileManifest)) {
  console.log('ssr-check: skipped (no web profile at ' + profileManifest + ')')
  process.exit(0)
}

const require = createRequire(profileManifest)
let React
let renderToStaticMarkup
try {
  React = require('react')
  renderToStaticMarkup = require('react-dom/server').renderToStaticMarkup
} catch (error) {
  console.log('ssr-check: skipped (react not resolvable from the profile: ' + error.message + ')')
  process.exit(0)
}

const define = (name, value) => Object.defineProperty(globalThis, name, { value, writable: true, configurable: true })

let capturedSpec = null
define('window', {
  __ModuleLoader__: { load: (spec) => { capturedSpec = spec } },
  localStorage: { getItem: () => null, setItem: () => {} },
})
define('document', { createElement: () => ({ setAttribute() {}, remove() {}, textContent: '' }), head: { appendChild() {} } })
define('navigator', { language: 'zh-CN', clipboard: { writeText: async () => {} } })
define('fetch', async () => ({ status: 200, json: async () => ({ ok: true, data: {} }) }))

await import('file://' + join(repoRoot, 'src', 'client.js'))
if (capturedSpec === null) throw new Error('client half did not register itself with window.__ModuleLoader__')

const plugin = capturedSpec.factory((name) => {
  if (name === 'react') return React
  throw new Error('client half required a non-baseline module: ' + name)
})
if (typeof plugin.apply !== 'function') throw new Error('factory did not return an apply()')

let tab = null
const ctx = { effect: (fn) => fn(), get: () => undefined, betterSidebar: { registerTab: (descriptor) => { tab = descriptor; return () => {} } } }
plugin.apply(ctx)
if (tab === null) throw new Error('apply() did not register a tab')

const props = {
  ctx, store: {},
  scope: { sessionId: 'ssr', cwd: '/tmp/ssr-workspace' },
  tab: { id: tab.id, type: tab.id, title: 'Git' },
  visible: true,
}
const html = renderToStaticMarkup(React.createElement(tab.component, props))
const needles = ['dig-root', 'dig-topbar', 'dig-shell', 'dig-rail', 'dig-picker']
for (const needle of needles) {
  if (html.indexOf(needle) < 0) throw new Error('rendered output is missing: ' + needle)
}
console.log('ssr-check: tab ' + tab.id + ' (' + tab.title() + ') rendered ' + html.length + ' chars - OK')

const empty = renderToStaticMarkup(React.createElement(tab.component, Object.assign({}, props, { scope: { sessionId: 'ssr-2' } })))
if (empty.length === 0) throw new Error('rendering without a cwd produced nothing')
console.log('ssr-check: workspace-less render ' + empty.length + ' chars - OK')
