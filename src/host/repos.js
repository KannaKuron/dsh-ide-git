/** dsh-ide-git host: repository discovery for the picker, plus git --version. */

import { existsSync, realpathSync, readdirSync } from 'node:fs'

import path from 'node:path'

import { PanelError, badRequest, cwdOf, requireAbsolute } from './core.js'

import { runGit, originNameOf } from './git.js'



/** Directories never descended into while looking for repositories. */
const REPO_SCAN_SKIP = new Set(['node_modules', 'dist', 'build', 'out', 'target', 'vendor', 'venv', '.venv', '__pycache__', 'coverage', 'tmp', 'temp'])

/* `git submodule status --recursive` already reports every nesting level of a
   repository in ONE call (paths arrive fully qualified), so the submodule walk
   costs exactly one `status` per checkout; the lists stay bounded so a
   pathological tree cannot flood the picker. */
const SUBMODULE_LIST_LIMIT = 400
const REPO_LIST_LIMIT = 60

/** Slash-normalized path, for comparing paths that came from different
 *  producers (git prints forward slashes; `path.join` prints backslashes on
 *  Windows). Case-insensitive on Windows so the same checkout reached two ways
 *  collapses to one row. */
function pathIdentity(value) {
  const normalized = value.replace(/\\/g, '/').replace(/\/+$/, '')
  const key = process.platform === 'win32' ? normalized.toLowerCase() : normalized
  /* realpath collapses producer spellings of one checkout: git's
   * --show-toplevel resolves symlinks (/private/var on macOS) while a
   * directory walk keeps the spelling it was handed (/var), and without this
   * the same submodule arrived as two rows. An unresolvable path falls back
   * to the slash-normalized form. */
  try {
    return realpathSync(key).replace(/\\/g, '/').replace(/\/+$/, '')
  } catch {
    return key
  }
}

/** One repository row shipped to the client (`kind` drives the picker badge). */
function repoRow(root, submodulePath, kind) {
  return {
    path: root.replace(/\\/g, '/'),
    /** Full checkout name; a submodule carries its repo-relative path so two
     *  same-named checkouts stay apart in a long list. */
    name: submodulePath === undefined ? path.basename(root) : submodulePath,
    label: submodulePath === undefined ? path.basename(root) : submodulePath.split('/').pop(),
    branch: null,
    /** The checkout's own repository name, cut from its origin URL (v0.19.2):
     *  the picker shows this first and falls back to the directory name, with
     *  the directory name as the small sub line whenever the two differ — so
     *  two clones of one repository stay tellable apart. Filled in by the
     *  scan below (an origin-less checkout keeps the empty string). */
    origin: '',
    kind,
    ...(submodulePath === undefined ? {} : { submodulePath }),
  }
}

/**
 * Every checkout registered as a submodule under `root`, at any depth.
 *
 * Git itself is the source of truth: `git submodule status --recursive` lists
 * the registered paths (relative to the parent repository) even for submodules
 * that were never initialised, and `--recursive` walks EVERY nesting level in
 * that one call — deeper entries arrive as fully qualified paths
 * ("outer/inner"), so one `status` per checkout is the whole discovery. (An
 * earlier revision also re-ran `status` inside every confirmed submodule; those
 * calls could only re-list checkouts the recursive pass had already reported,
 * which multiplied the process count on a workspace full of checkouts without
 * producing a single new row.) A path that is present on disk and passes
 * `rev-parse --show-toplevel` is a real, independent working tree — the parent
 * only ever sees it as one gitlink line, so this is what makes it selectable
 * as a repository of its own (the SourceTree behavior).
 *
 * The working-tree checks all run at once, because a repository with a dozen
 * submodules otherwise costs a dozen sequential processes on every scan.
 */
async function collectSubmoduleRepos(root) {
  const found = []
  const listing = await runGit(root, ['submodule', 'status', '--recursive'])
  if (listing.code !== 0) return found
  const candidates = []
  for (const raw of listing.stdout.split('\n')) {
    if (candidates.length >= SUBMODULE_LIST_LIMIT) break
    const line = raw.replace(/\r$/, '')
    if (line.trim() === '') continue
    /* `<state><sha> <path> (<describe>)`: the state prefix is ' ', '+', '-' or 'U'. */
    const match = /^[\s+\-U]([0-9a-f]{4,64})\s+(.+?)(?:\s+\(.*\))?$/.exec(line)
    const rel = (match === null ? line.trim().replace(/^[\s+\-U]\S*\s+/, '') : match[2]).trim().replace(/\\/g, '/')
    if (rel === '') continue
    const absolute = path.resolve(root, rel)
    /* An uninitialised submodule has no `.git` yet: git still registers it, but
       there is no working tree to bind the panel to. */
    if (!existsSync(path.join(absolute, '.git'))) continue
    candidates.push({ absolute, rel })
  }
  const tops = await Promise.all(candidates.map((entry) => runGit(entry.absolute, ['rev-parse', '--show-toplevel'])))
  for (let index = 0; index < candidates.length; index += 1) {
    const top = tops[index]
    if (top.code !== 0) continue
    const reported = top.stdout.trim().replace(/\\/g, '/').replace(/\/+$/, '')
    found.push({ root: reported === '' ? candidates[index].absolute : reported, rel: candidates[index].rel })
  }
  return found
}

/* The whole discovery pass is cached in-process per cwd: one scan walks the
   tree and spawns a git process per checkout, while the client re-POSTs `repos`
   on every panel mount — a warm answer is what keeps switching back to the Git
   page instant on a workspace full of checkouts. Entries are { at, rows };
   REPOS_CACHE_TTL_MS is a module-level `let` so tests can pin it to 0 and
   observe the always-rescan path.

   The cache is deliberately NOT invalidated when a write method succeeds:
   `repos` is a read-only discovery of which checkouts EXIST, and no write
   method changes that set — a commit or a new branch does not conjure a
   repository. A clone landing inside the 15s window simply stays invisible
   until the next scan; that is an accepted trade, the client's background
   refresh is the safety net. */
export const repoScanCache = new Map()
export let REPOS_CACHE_TTL_MS = 15000

async function scanRepos(cwd) {
  const cached = repoScanCache.get(cwd)
  /* Hand back fresh row objects: the cache is shared by every caller, and a
     consumer that decorates or reorders what it received must not write
     through into the next request's answer. */
  if (cached !== undefined && Date.now() - cached.at < REPOS_CACHE_TTL_MS) {
    return { cached: true, rows: cached.rows.map((row) => ({ ...row })) }
  }
  const list = []
  const self = await runGit(cwd, ['rev-parse', '--show-toplevel'])
  const isRepo = self.code === 0
  if (isRepo) {
    const top = self.stdout.trim()
    list.push(repoRow(top === '' ? cwd : top, undefined, 'workspace'))
  }
  for (const dir of findNestedRepos(cwd, 2)) list.push(repoRow(dir, undefined, 'nested'))
  /* Submodules of EVERY discovered checkout, not only a workspace that is one:
     a container workspace (a folder holding several checkouts — the usual
     shape of a multi-repo project) reaches its repositories through the rows
     above, and each of those may carry submodules of its own. Without this
     pass the picker lists `eis` but none of the eight checkouts under it.
     These rows are built LAST and the map below lets them win: the directory
     scan can reach the same checkout through a plain path (a submodule whose
     parent directory is not itself a repository), and the submodule row is the
     better one — its name carries the repo-relative path. */
  const roots = list.map((row) => row.path)
  const submoduleLists = await Promise.all(roots.map((root) => collectSubmoduleRepos(root)))
  for (const entries of submoduleLists) {
    for (const entry of entries) list.push(repoRow(entry.root, entry.rel, 'nested'))
  }
  const byIdentity = new Map()
  for (const row of list) byIdentity.set(pathIdentity(row.path), row)
  const rows = [...byIdentity.values()]
  rows.sort((a, b) => (a.kind === b.kind ? a.path.localeCompare(b.path) : a.kind === 'workspace' ? -1 : 1))
  const capped = rows.slice(0, REPO_LIST_LIMIT).map((row) => ({ ...row }))
  const branches = await Promise.all(capped.map((row) => branchOrNull(row.path)))
  for (let index = 0; index < capped.length; index += 1) capped[index].branch = branches[index]
  /* Origin names ride the same one-call-per-row pass as the branches: a local
     `git remote get-url` read, cheap, and the 15s cache means repeated picker
     opens pay for it once. */
  const origins = await Promise.all(capped.map((row) => originNameOf(row.path)))
  for (let index = 0; index < capped.length; index += 1) capped[index].origin = origins[index]
  repoScanCache.set(cwd, { at: Date.now(), rows: capped })
  return { cached: false, rows: capped.map((row) => ({ ...row })) }
}

/** Depth-capped search for repositories nested in a workspace. */
function findNestedRepos(root, maxDepth) {
  const found = []
  const walk = (dir, depth) => {
    if (found.length >= 40 || depth > maxDepth) return
    let entries
    try { entries = readdirSync(dir, { withFileTypes: true }) } catch { return }
    for (const entry of entries) {
      if (!entry.isDirectory() || entry.name.startsWith('.') || REPO_SCAN_SKIP.has(entry.name)) continue
      const child = path.join(dir, entry.name)
      if (existsSync(path.join(child, '.git'))) { found.push(child); continue }
      if (depth < maxDepth) walk(child, depth + 1)
    }
  }
  walk(root, 1)
  return found
}

async function branchOrNull(root) {
  const result = await runGit(root, ['rev-parse', '--abbrev-ref', 'HEAD'])
  if (result.code !== 0) return null
  const name = result.stdout.trim()
  return name === '' ? null : name
}

/** Resolve one user-supplied absolute path to its repository top level and
 *  decorate that row like a scanned checkout. Throws a 409 when the path is
 *  not inside any working tree; `repos` below tolerates that per entry. */
async function resolveManualRepo(value) {
  const dir = requireAbsolute(value, 'path')
  const result = await runGit(dir, ['rev-parse', '--show-toplevel'])
  if (result.code !== 0) throw new PanelError('not-a-repo', 'not a git repository: ' + dir, 409)
  const top = result.stdout.trim()
  const row = repoRow(top === '' ? dir : top, undefined, 'manual')
  const [branch, origin] = await Promise.all([branchOrNull(row.path), originNameOf(row.path)])
  row.branch = branch
  row.origin = origin
  return row
}

/** Optional remembered manual paths: bad entries are ignored, not fatal — a
 *  deleted checkout must not break discovery for the whole workspace. */
function extraPathList(payload) {
  if (payload === undefined || payload.extraPaths === undefined || payload.extraPaths === null) return []
  if (!Array.isArray(payload.extraPaths)) throw badRequest('extraPaths must be an array')
  return payload.extraPaths.filter((entry) => typeof entry === 'string' && entry.trim() !== '').slice(0, 20)
}

/** Read-only route behind “open another repository…”: validates a typed
 *  absolute path, resolves its top level, and returns the selectable row. */
async function openRepo(payload) {
  return { repo: await resolveManualRepo(payload === undefined ? undefined : payload.path) }
}

/**
 * Repositories this panel may bind to: the session workspace itself when it is
 * one, repositories nested inside it (a sandbox holding many checkouts), and
 * the submodules of every checkout discovered that way — git records each
 * submodule as its own working tree with its own HEAD, index and branches, so
 * it is a repository the panel can bind to like any other. The client turns
 * this into the repo picker, and picking a row is all it takes: every later
 * call carries that path as `repoRoot`, which is the working directory the git
 * commands run in.
 */
async function repos(payload) {
  const cwd = cwdOf(payload)
  const { cached, rows } = await scanRepos(cwd)
  /* Manually opened checkouts are merged AFTER the cached scan and never
     written into the cache: the scan describes the workspace, while this list
     belongs to one session's remembered picks. Invalid paths disappear quietly
     and a path already found by the scan keeps its scanned row (the workspace
     or nested badge is more informative than “manual”). */
  const manualRows = (await Promise.all(extraPathList(payload).map(async (value) => {
    try { return await resolveManualRepo(value) } catch { return null }
  }))).filter((row) => row !== null)
  const merged = rows.map((row) => ({ ...row }))
  const seen = new Set(merged.map((row) => pathIdentity(row.path)))
  for (const row of manualRows) {
    const identity = pathIdentity(row.path)
    if (seen.has(identity)) continue
    seen.add(identity)
    merged.push(row)
  }
  /* `cached: true` rides a cache hit only; the client ignores it today, it just
     makes the answer say where it came from. */
  return { cwd, isRepo: rows.some((row) => row.kind === 'workspace'), repos: merged, ...(cached ? { cached: true } : {}) }
}

async function version() {
  const result = await runGit(process.cwd(), ['--version'])
  const raw = result.code === 0 ? result.stdout.trim() : ''
  const match = /git version (\S+)/.exec(raw)
  return { git: match === null ? raw : match[1], available: result.code === 0 }
}

export { repos, openRepo, version }
