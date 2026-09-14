/**
 * dsh-ide-git — host half (plain JavaScript, no build step).
 *
 * One HTTP surface backs the browser panel:
 *
 *   POST /dsh-ide-git/api/<method>   -> { ok: true, data } | { ok: false, error }
 *
 * Every method is a thin, argv-array wrapper around the local `git` binary
 * (never a shell string), executed with the working directory the client sent
 * (the session scope cwd). Read methods are cheap; write methods are explicit
 * and the destructive ones require an explicit `confirm: true` from the caller.
 *
 * Trust fence: the routes are mounted on DSH's own web server, so they are
 * same-origin by construction. A request is served only when the Host header
 * names a loopback authority or the browser marks the request as same-origin
 * (Sec-Fetch-Site) — a cross-site page cannot forge that header, which is the
 * same posture dsh-better-sidebar's own /sidebar/api routes take.
 */
import { spawn } from 'node:child_process'
import { existsSync, readdirSync } from 'node:fs'
import path from 'node:path'

export const name = 'dsh-ide-git'
export const inject = ['webServer']

const ROUTE_PREFIX = '/dsh-ide-git/api'
const MAX_OUTPUT_BYTES = 8 * 1024 * 1024
const MAX_DIFF_CHARS = 400 * 1024
const DEFAULT_TIMEOUT_MS = 30_000
const NETWORK_TIMEOUT_MS = 180_000
const RECORD_SEP = '\u001e'
const FIELD_SEP = '\u001f'

/* ============================== errors ============================== */

class PanelError extends Error {
  constructor(code, message, status = 400) {
    super(message)
    this.code = code
    this.status = status
  }
}

function badRequest(message) {
  return new PanelError('bad-request', message, 400)
}

/* ============================== argv git ============================== */

function gitBinary() {
  const override = process.env.DSH_IDE_GIT_BIN
  return override !== undefined && override.trim() !== '' ? override.trim() : 'git'
}

/**
 * Run git with an argv array (no shell). Resolves for ANY exit code so callers
 * can decide whether a non-zero status is data (e.g. `git diff --quiet`) or an
 * error; `git()` below is the throwing form.
 */
function runGit(cwd, args, options = {}) {
  const timeoutMs = options.timeoutMs === undefined ? DEFAULT_TIMEOUT_MS : options.timeoutMs
  return new Promise((resolve, reject) => {
    let child
    try {
      child = spawn(gitBinary(), args, { cwd, windowsHide: true, env: { ...process.env, GIT_OPTIONAL_LOCKS: '0', GIT_TERMINAL_PROMPT: '0' } })
    } catch (error) {
      reject(new PanelError('git-missing', 'cannot start git: ' + messageOf(error), 500))
      return
    }
    const out = []
    const err = []
    let outBytes = 0
    let errBytes = 0
    let settled = false
    const timer = setTimeout(() => {
      if (settled) return
      settled = true
      child.kill('SIGKILL')
      reject(new PanelError('git-timeout', 'git ' + args[0] + ' timed out after ' + timeoutMs + 'ms', 504))
    }, timeoutMs)
    child.stdout.on('data', (chunk) => {
      outBytes += chunk.length
      if (outBytes <= MAX_OUTPUT_BYTES) out.push(chunk)
    })
    child.stderr.on('data', (chunk) => {
      errBytes += chunk.length
      if (errBytes <= MAX_OUTPUT_BYTES) err.push(chunk)
    })
    child.on('error', (error) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      reject(new PanelError('git-missing', 'cannot run git: ' + messageOf(error), 500))
    })
    child.on('close', (code, signal) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      resolve({
        code: code === null ? -1 : code,
        signal: signal === null ? undefined : signal,
        stdout: Buffer.concat(out).toString('utf8'),
        stderr: Buffer.concat(err).toString('utf8'),
        truncated: outBytes > MAX_OUTPUT_BYTES,
      })
    })
  })
}

async function git(cwd, args, options = {}) {
  const result = await runGit(cwd, args, options)
  if (result.code !== 0) {
    const detail = result.stderr.trim() === '' ? result.stdout.trim() : result.stderr.trim()
    throw new PanelError('git-failed', 'git ' + args.join(' ') + ' failed: ' + (detail === '' ? 'exit ' + result.code : detail), 409)
  }
  return result.stdout
}

function messageOf(error) {
  return error instanceof Error ? error.message : String(error)
}

/* ============================== payload helpers ============================== */

function requireAbsolute(value, label) {
  if (typeof value !== 'string' || value.trim() === '') throw badRequest(label + ' is required')
  if (!path.isAbsolute(value)) throw badRequest(label + ' must be an absolute path')
  return path.resolve(value)
}

/** A ref/branch/tag name: no whitespace, no leading dash, no control characters. */
function requireRef(value, label) {
  if (typeof value !== 'string' || value.trim() === '') throw badRequest(label + ' is required')
  const name = value.trim()
  if (name.startsWith('-')) throw badRequest(label + ' must not start with "-"')
  if (/[\u0000-\u001f\u007f\s]/.test(name)) throw badRequest(label + ' contains invalid characters')
  return name
}

function optionalRevs(value, label) {
  if (value === undefined || value === null) return []
  if (!Array.isArray(value)) throw badRequest(label + ' must be an array')
  return value.map((entry) => requireRef(entry, label + ' entry'))
}

function requireMessage(value) {
  if (typeof value !== 'string' || value.trim() === '') throw badRequest('message is required')
  return value
}

function cwdOf(payload) {
  return requireAbsolute(payload === undefined ? undefined : payload.cwd, 'cwd')
}

/* ============================== git reads ============================== */

async function repoRootOf(cwd, payload) {
  if (payload !== undefined && payload.repoRoot !== undefined) return requireAbsolute(payload.repoRoot, 'repoRoot')
  const result = await runGit(cwd, ['rev-parse', '--show-toplevel'])
  if (result.code !== 0) {
    // A workspace that is not a repository is a normal state, not a failure:
    // the client answers it with a repo picker instead of an error banner.
    throw new PanelError('not-a-repo', 'not a git repository: ' + cwd, 409)
  }
  const top = result.stdout.trim()
  return top === '' ? cwd : top
}

async function currentBranchOf(root) {
  const name = (await git(root, ['rev-parse', '--abbrev-ref', 'HEAD'])).trim()
  return name
}

async function upstreamOf(root, branch) {
  const result = await runGit(root, ['rev-parse', '--abbrev-ref', '--symbolic-full-name', branch + '@{u}'])
  if (result.code !== 0) return null
  const name = result.stdout.trim()
  return name === '' ? null : name
}

async function aheadBehindOf(root, upstream, branch) {
  if (upstream === null) return { ahead: 0, behind: 0 }
  const result = await runGit(root, ['rev-list', '--left-right', '--count', upstream + '...' + branch])
  if (result.code !== 0) return { ahead: 0, behind: 0 }
  const parts = result.stdout.trim().split(/\s+/)
  const behind = Number.parseInt(parts[0], 10)
  const ahead = Number.parseInt(parts[1], 10)
  return { ahead: Number.isFinite(ahead) ? ahead : 0, behind: Number.isFinite(behind) ? behind : 0 }
}

/** Parse `git status --porcelain=v1 -z` (NUL separated, rename pairs follow). */
function parsePorcelain(stdout) {
  const records = stdout.split('\u0000')
  const entries = []
  for (let index = 0; index < records.length; index += 1) {
    const record = records[index]
    if (record.length < 4) continue
    const x = record[0]
    const y = record[1]
    const filePath = record.slice(3)
    let origPath
    if (x === 'R' || x === 'C' || y === 'R' || y === 'C') {
      const next = records[index + 1]
      if (next !== undefined && next !== '') {
        origPath = next
        index += 1
      }
    }
    entries.push({ x, y, path: filePath, origPath })
  }
  return entries
}

function classify(entries) {
  const staged = []
  const unstaged = []
  const untracked = []
  const conflicted = []
  for (const entry of entries) {
    const pair = entry.x + entry.y
    if (pair === '??') { untracked.push(entry); continue }
    if (pair === '!!') continue
    if (pair === 'DD' || pair === 'AU' || pair === 'UD' || pair === 'UA' || pair === 'DU' || pair === 'AA' || pair === 'UU') {
      conflicted.push(entry)
      continue
    }
    if (entry.x !== ' ' && entry.x !== '?') staged.push(entry)
    if (entry.y !== ' ' && entry.y !== '?') unstaged.push(entry)
  }
  return { staged, unstaged, untracked, conflicted }
}

/** `git diff --numstat -z` -> Map(path -> { additions, deletions, binary }). */
async function numstatOf(root, args) {
  const result = await runGit(root, ['diff', '--numstat', '-z', ...args])
  const map = new Map()
  if (result.code !== 0) return map
  const records = result.stdout.split('\u0000')
  for (let index = 0; index < records.length; index += 1) {
    const record = records[index]
    if (record === '') continue
    const firstTab = record.indexOf('\t')
    const secondTab = record.indexOf('\t', firstTab + 1)
    if (firstTab < 0 || secondTab < 0) continue
    const addRaw = record.slice(0, firstTab)
    const delRaw = record.slice(firstTab + 1, secondTab)
    let filePath = record.slice(secondTab + 1)
    if (filePath === '') {
      filePath = records[index + 1] === undefined ? '' : records[index + 1]
      index += 1
      const renamed = records[index + 1]
      if (renamed !== undefined && renamed !== '') index += 1
    }
    const binary = addRaw === '-' || delRaw === '-'
    map.set(filePath, {
      additions: binary ? 0 : Number.parseInt(addRaw, 10) || 0,
      deletions: binary ? 0 : Number.parseInt(delRaw, 10) || 0,
      binary,
    })
  }
  return map
}

function decorate(entries, numstat) {
  return entries.map((entry) => {
    const stat = numstat.get(entry.path)
    return {
      path: entry.path,
      origPath: entry.origPath,
      index: entry.x,
      worktree: entry.y,
      additions: stat === undefined ? 0 : stat.additions,
      deletions: stat === undefined ? 0 : stat.deletions,
      binary: stat === undefined ? false : stat.binary,
    }
  })
}

/** Parse the FIELD_SEP/RECORD_SEP pretty format used by `log`/`show`. */
function parseLog(stdout) {
  const commits = []
  for (const record of stdout.split(RECORD_SEP)) {
    const trimmed = record.replace(/^\n+/, '')
    if (trimmed.trim() === '') continue
    const parts = trimmed.split(FIELD_SEP)
    if (parts.length < 8) continue
    commits.push({
      hash: parts[0],
      shortHash: parts[1],
      parents: parts[2].trim() === '' ? [] : parts[2].trim().split(' '),
      author: parts[3],
      email: parts[4],
      date: parts[5],
      subject: parts[6],
      refs: parts[7].trim() === '' ? [] : parts[7].split(',').map((ref) => ref.trim()).filter((ref) => ref !== ''),
    })
  }
  return commits
}

const LOG_FORMAT = '%H' + FIELD_SEP + '%h' + FIELD_SEP + '%P' + FIELD_SEP + '%an' + FIELD_SEP + '%ae' + FIELD_SEP + '%aI' + FIELD_SEP + '%s' + FIELD_SEP + '%D' + RECORD_SEP

async function stashCountOf(root) {
  const result = await runGit(root, ['rev-list', '--walk-reflogs', '--count', 'refs/stash'])
  if (result.code !== 0) return 0
  const count = Number.parseInt(result.stdout.trim(), 10)
  return Number.isFinite(count) ? count : 0
}

async function worktreesOf(root) {
  const result = await runGit(root, ['worktree', 'list', '--porcelain'])
  if (result.code !== 0) return []
  const trees = []
  let current = null
  for (const line of result.stdout.split('\n')) {
    if (line.startsWith('worktree ')) {
      if (current !== null) trees.push(current)
      current = { path: line.slice('worktree '.length), branch: null, head: null, detached: false, bare: false }
      continue
    }
    if (current === null) continue
    if (line.startsWith('HEAD ')) current.head = line.slice('HEAD '.length)
    else if (line.startsWith('branch ')) current.branch = line.slice('branch '.length).replace('refs/heads/', '')
    else if (line === 'detached') current.detached = true
    else if (line === 'bare') current.bare = true
  }
  if (current !== null) trees.push(current)
  return trees
}

/* ============================== methods ============================== */

async function summary(payload) {
  const cwd = cwdOf(payload)
  const root = await repoRootOf(cwd, payload)
  const branch = await currentBranchOf(root)
  const detached = branch === 'HEAD'
  const upstream = detached ? null : await upstreamOf(root, branch)
  const tracking = upstream === null ? { ahead: 0, behind: 0 } : await aheadBehindOf(root, upstream, branch)
  const statusOut = await git(root, ['status', '--porcelain=v1', '-z', '--untracked-files=all'])
  const groups = classify(parsePorcelain(statusOut))
  const unstagedStat = await numstatOf(root, [])
  const stagedStat = await numstatOf(root, ['--cached'])
  return {
    repoRoot: root,
    cwd,
    branch,
    detached,
    upstream,
    ahead: tracking.ahead,
    behind: tracking.behind,
    changes: {
      staged: decorate(groups.staged, stagedStat),
      unstaged: decorate(groups.unstaged, unstagedStat),
      untracked: decorate(groups.untracked, new Map()),
      conflicted: decorate(groups.conflicted, new Map()),
    },
    stashCount: await stashCountOf(root),
    worktrees: await worktreesOf(root),
  }
}

async function branches(payload) {
  const cwd = cwdOf(payload)
  const root = await repoRootOf(cwd, payload)
  const branch = await currentBranchOf(root)
  const format = ['%(refname)', '%(refname:short)', '%(objectname)', '%(objectname:short)', '%(HEAD)', '%(upstream:short)', '%(committerdate:iso-strict)', '%(contents:subject)', '%(symref)'].join(FIELD_SEP)
  const out = await git(root, ['for-each-ref', '--format=' + format + RECORD_SEP, 'refs/heads', 'refs/remotes', 'refs/tags'])
  const local = []
  const remote = []
  const tags = []
  const worktrees = await worktreesOf(root)
  const busy = new Map()
  for (const tree of worktrees) {
    if (tree.branch !== null && tree.branch !== '') busy.set(tree.branch, tree.path)
  }
  for (const record of out.split(RECORD_SEP)) {
    const trimmed = record.replace(/^\n+/, '')
    if (trimmed.trim() === '') continue
    const parts = trimmed.split(FIELD_SEP)
    if (parts.length < 9) continue
    const entry = {
      name: parts[1],
      hash: parts[2],
      shortHash: parts[3],
      head: parts[4] === '*',
      upstream: parts[5] === '' ? null : parts[5],
      date: parts[6],
      subject: parts[7],
      worktree: busy.get(parts[1]) === undefined ? null : busy.get(parts[1]),
      ahead: 0,
      behind: 0,
    }
    if (parts[0].startsWith('refs/heads/')) local.push(entry)
    else if (parts[0].startsWith('refs/remotes/')) remote.push(entry)
    else if (parts[0].startsWith('refs/tags/')) tags.push({ name: entry.name, hash: entry.hash, shortHash: entry.shortHash, date: entry.date, subject: entry.subject })
  }
  for (const entry of local) {
    if (entry.upstream === null) continue
    const tracking = await aheadBehindOf(root, entry.upstream, entry.name)
    entry.ahead = tracking.ahead
    entry.behind = tracking.behind
  }
  local.sort((a, b) => (a.head === b.head ? a.name.localeCompare(b.name) : a.head ? -1 : 1))
  remote.sort((a, b) => a.name.localeCompare(b.name))
  tags.sort((a, b) => a.name.localeCompare(b.name))
  const remotesOut = await runGit(root, ['remote'])
  const remotes = remotesOut.code === 0 ? remotesOut.stdout.split('\n').map((line) => line.trim()).filter((line) => line !== '') : []
  return { repoRoot: root, branch, local, remote, tags, remotes }
}

async function log(payload) {
  const cwd = cwdOf(payload)
  const root = await repoRootOf(cwd, payload)
  const limit = clampInt(payload.limit, 1, 500, 100)
  const skip = clampInt(payload.skip, 0, 1_000_000, 0)
  const args = ['log', '--max-count=' + (limit + 1), '--skip=' + skip, '--date-order', '--pretty=format:' + LOG_FORMAT]
  if (typeof payload.rev === 'string' && payload.rev.trim() !== '') args.push(requireRef(payload.rev, 'rev'))
  if (typeof payload.path === 'string' && payload.path.trim() !== '') args.push('--', payload.path)
  const out = await git(root, args)
  const all = parseLog(out)
  const hasMore = all.length > limit
  return { repoRoot: root, commits: hasMore ? all.slice(0, limit) : all, hasMore, skip, limit }
}

async function commitDetail(payload) {
  const cwd = cwdOf(payload)
  const root = await repoRootOf(cwd, payload)
  const hash = requireRef(payload.hash, 'hash')
  const metaFormat = ['%H', '%h', '%P', '%an', '%ae', '%aI', '%s', '%b', '%D'].join(FIELD_SEP)
  const metaOut = await git(root, ['show', '-s', '--format=' + metaFormat, hash])
  const parts = metaOut.trim().split(FIELD_SEP)
  const parents = parts[2] === undefined || parts[2].trim() === '' ? [] : parts[2].trim().split(' ')
  const numstatOut = await git(root, ['show', '--numstat', '-z', '--format=', '-m', '--first-parent', hash])
  const files = []
  const records = numstatOut.split('\u0000')
  for (let index = 0; index < records.length; index += 1) {
    const record = records[index]
    if (record === '') continue
    const firstTab = record.indexOf('\t')
    const secondTab = record.indexOf('\t', firstTab + 1)
    if (firstTab < 0 || secondTab < 0) continue
    let filePath = record.slice(secondTab + 1)
    let origPath
    if (filePath === '') {
      origPath = records[index + 1]
      filePath = records[index + 2]
      index += 2
    }
    const addRaw = record.slice(0, firstTab)
    const delRaw = record.slice(firstTab + 1, secondTab)
    const binary = addRaw === '-' || delRaw === '-'
    files.push({
      path: filePath === undefined ? '' : filePath,
      origPath: origPath === undefined || origPath === '' ? undefined : origPath,
      additions: binary ? 0 : Number.parseInt(addRaw, 10) || 0,
      deletions: binary ? 0 : Number.parseInt(delRaw, 10) || 0,
      binary,
    })
  }
  return {
    hash: parts[0],
    shortHash: parts[1],
    parents,
    author: parts[3],
    email: parts[4],
    date: parts[5],
    subject: parts[6],
    body: parts[7] === undefined ? '' : parts[7],
    refs: parts[8] === undefined || parts[8].trim() === '' ? [] : parts[8].split(',').map((ref) => ref.trim()).filter((ref) => ref !== ''),
    files,
  }
}

async function diff(payload) {
  const cwd = cwdOf(payload)
  const root = await repoRootOf(cwd, payload)
  const args = ['diff', '--no-color', '--no-ext-diff', '-U3']
  if (payload.staged === true) args.push('--cached')
  if (typeof payload.hash === 'string' && payload.hash.trim() !== '') {
    args.length = 0
    args.push('show', '--no-color', '--no-ext-diff', '-U3', '--format=', requireRef(payload.hash, 'hash'))
  }
  if (typeof payload.path === 'string' && payload.path.trim() !== '') args.push('--', requireRelativePath(payload.path))
  const out = await git(root, args)
  const truncated = out.length > MAX_DIFF_CHARS
  return { patch: truncated ? out.slice(0, MAX_DIFF_CHARS) : out, truncated }
}

function requireRelativePath(value) {
  if (typeof value !== 'string' || value.trim() === '') throw badRequest('path is required')
  const trimmed = value.trim()
  if (path.isAbsolute(trimmed)) return trimmed
  if (trimmed.split('/').includes('..')) throw badRequest('path must stay inside the repository')
  return trimmed
}

async function stage(payload) {
  const cwd = cwdOf(payload)
  const root = await repoRootOf(cwd, payload)
  const paths = optionalPaths(payload, 'paths')
  await git(root, ['add', '-A', '--', ...paths])
  return { staged: paths.length }
}

async function unstage(payload) {
  const cwd = cwdOf(payload)
  const root = await repoRootOf(cwd, payload)
  const paths = optionalPaths(payload, 'paths')
  const result = await runGit(root, ['reset', '-q', 'HEAD', '--', ...paths])
  if (result.code !== 0) await git(root, ['rm', '--cached', '-r', '-q', '--', ...paths])
  return { unstaged: paths.length }
}

async function discard(payload) {
  const cwd = cwdOf(payload)
  const root = await repoRootOf(cwd, payload)
  const paths = optionalPaths(payload, 'paths')
  if (paths.length === 0) throw badRequest('paths is required')
  const untracked = payload.untracked === true
  if (untracked) {
    if (payload.confirm !== true) throw badRequest('discarding untracked files requires confirm: true')
    await git(root, ['clean', '-f', '-d', '--', ...paths])
    return { discarded: paths.length, untracked: true }
  }
  await git(root, ['checkout', '--', ...paths])
  return { discarded: paths.length, untracked: false }
}

async function commit(payload) {
  const cwd = cwdOf(payload)
  const root = await repoRootOf(cwd, payload)
  const message = requireMessage(payload.message)
  const paths = (payload.paths === undefined || payload.paths === null) ? [] : optionalPaths(payload, 'paths')
  if (paths.length > 0) await git(root, ['add', '-A', '--', ...paths])
  const args = ['commit', '-m', message]
  if (payload.amend === true) args.push('--amend')
  if (payload.signoff === true) args.push('--signoff')
  const out = await git(root, args)
  return { output: out.trim() }
}

async function checkout(payload) {
  const cwd = cwdOf(payload)
  const root = await repoRootOf(cwd, payload)
  if (payload.create === true) {
    const name = requireRef(payload.branch, 'branch')
    const start = typeof payload.startPoint === 'string' && payload.startPoint.trim() !== '' ? requireRef(payload.startPoint, 'startPoint') : undefined
    const args = ['checkout', '-b', name]
    if (start !== undefined) args.push(start)
    await git(root, args)
    return { branch: name, created: true }
  }
  const target = requireRef(payload.branch, 'branch')
  await git(root, ['checkout', target])
  return { branch: target, created: false }
}

async function branchCreate(payload) {
  const cwd = cwdOf(payload)
  const root = await repoRootOf(cwd, payload)
  const name = requireRef(payload.name, 'name')
  const args = ['branch', name]
  if (typeof payload.startPoint === 'string' && payload.startPoint.trim() !== '') args.push(requireRef(payload.startPoint, 'startPoint'))
  await git(root, args)
  return { branch: name }
}

async function branchRename(payload) {
  const cwd = cwdOf(payload)
  const root = await repoRootOf(cwd, payload)
  const from = requireRef(payload.from, 'from')
  const to = requireRef(payload.to, 'to')
  await git(root, ['branch', '-m', from, to])
  return { from, to }
}

async function branchDelete(payload) {
  const cwd = cwdOf(payload)
  const root = await repoRootOf(cwd, payload)
  const name = requireRef(payload.name, 'name')
  const force = payload.force === true
  if (force && payload.confirm !== true) throw badRequest('force delete requires confirm: true')
  await git(root, ['branch', force ? '-D' : '-d', name])
  return { branch: name, force }
}

async function merge(payload) {
  const cwd = cwdOf(payload)
  const root = await repoRootOf(cwd, payload)
  const branch = requireRef(payload.branch, 'branch')
  const args = ['merge', '--no-edit']
  if (payload.ffOnly === true) args.push('--ff-only')
  if (payload.noFf === true) args.push('--no-ff')
  if (payload.squash === true) args.push('--squash')
  args.push(branch)
  const result = await runGit(root, args)
  const combined = (result.stdout + '\n' + result.stderr).trim()
  const conflicted = /CONFLICT|Automatic merge failed/.test(combined)
  if (result.code !== 0 && !conflicted) throw new PanelError('git-failed', combined === '' ? 'merge failed' : combined, 409)
  return { branch, conflicted, output: combined }
}

async function rebase(payload) {
  const cwd = cwdOf(payload)
  const root = await repoRootOf(cwd, payload)
  const onto = requireRef(payload.onto, 'onto')
  const result = await runGit(root, ['rebase', onto])
  const combined = (result.stdout + '\n' + result.stderr).trim()
  const conflicted = /CONFLICT|could not apply/.test(combined)
  if (result.code !== 0 && !conflicted) throw new PanelError('git-failed', combined === '' ? 'rebase failed' : combined, 409)
  return { onto, conflicted, output: combined }
}

async function cherryPick(payload) {
  const cwd = cwdOf(payload)
  const root = await repoRootOf(cwd, payload)
  const hash = requireRef(payload.hash, 'hash')
  const result = await runGit(root, ['cherry-pick', hash])
  const combined = (result.stdout + '\n' + result.stderr).trim()
  const conflicted = /CONFLICT/.test(combined)
  if (result.code !== 0 && !conflicted) throw new PanelError('git-failed', combined === '' ? 'cherry-pick failed' : combined, 409)
  return { hash, conflicted, output: combined }
}

async function revert(payload) {
  const cwd = cwdOf(payload)
  const root = await repoRootOf(cwd, payload)
  const hash = requireRef(payload.hash, 'hash')
  const result = await runGit(root, ['revert', '--no-edit', hash])
  const combined = (result.stdout + '\n' + result.stderr).trim()
  const conflicted = /CONFLICT/.test(combined)
  if (result.code !== 0 && !conflicted) throw new PanelError('git-failed', combined === '' ? 'revert failed' : combined, 409)
  return { hash, conflicted, output: combined }
}

async function reset(payload) {
  const cwd = cwdOf(payload)
  const root = await repoRootOf(cwd, payload)
  const hash = requireRef(payload.hash, 'hash')
  const mode = payload.mode === 'soft' || payload.mode === 'hard' ? payload.mode : 'mixed'
  if (mode === 'hard' && payload.confirm !== true) throw badRequest('hard reset requires confirm: true')
  await git(root, ['reset', '--' + mode, hash])
  return { hash, mode }
}

async function fetch(payload) {
  const cwd = cwdOf(payload)
  const root = await repoRootOf(cwd, payload)
  const args = ['fetch']
  if (typeof payload.remote === 'string' && payload.remote.trim() !== '') args.push(requireRef(payload.remote, 'remote'))
  if (payload.prune !== false) args.push('--prune')
  args.push('--tags')
  const out = await git(root, args, { timeoutMs: NETWORK_TIMEOUT_MS })
  return { output: (out + '\n').trim() }
}

async function pull(payload) {
  const cwd = cwdOf(payload)
  const root = await repoRootOf(cwd, payload)
  const mode = payload.mode === 'rebase' || payload.mode === 'merge' ? payload.mode : 'ff-only'
  const args = ['pull']
  if (mode === 'ff-only') args.push('--ff-only')
  if (mode === 'rebase') args.push('--rebase')
  if (mode === 'merge') args.push('--no-rebase')
  if (typeof payload.remote === 'string' && payload.remote.trim() !== '') args.push(requireRef(payload.remote, 'remote'))
  if (typeof payload.branch === 'string' && payload.branch.trim() !== '') args.push(requireRef(payload.branch, 'branch'))
  const out = await git(root, args, { timeoutMs: NETWORK_TIMEOUT_MS })
  return { mode, output: out.trim() }
}

async function push(payload) {
  const cwd = cwdOf(payload)
  const root = await repoRootOf(cwd, payload)
  if (payload.confirm !== true) throw badRequest('push requires confirm: true')
  const args = ['push']
  if (payload.setUpstream === true) args.push('--set-upstream')
  if (typeof payload.remote === 'string' && payload.remote.trim() !== '') args.push(requireRef(payload.remote, 'remote'))
  if (typeof payload.branch === 'string' && payload.branch.trim() !== '') args.push(requireRef(payload.branch, 'branch'))
  const out = await git(root, args, { timeoutMs: NETWORK_TIMEOUT_MS })
  return { output: (out + '\n').trim() }
}

async function stashList(payload) {
  const cwd = cwdOf(payload)
  const root = await repoRootOf(cwd, payload)
  const out = await git(root, ['stash', 'list', '--pretty=format:%gd' + FIELD_SEP + '%gs' + FIELD_SEP + '%aI' + RECORD_SEP])
  const stashes = []
  for (const record of out.split(RECORD_SEP)) {
    const trimmed = record.replace(/^\n+/, '')
    if (trimmed.trim() === '') continue
    const parts = trimmed.split(FIELD_SEP)
    stashes.push({ ref: parts[0], subject: parts[1] === undefined ? '' : parts[1], date: parts[2] === undefined ? '' : parts[2] })
  }
  return { stashes }
}

async function stashPush(payload) {
  const cwd = cwdOf(payload)
  const root = await repoRootOf(cwd, payload)
  const args = ['stash', 'push']
  if (payload.includeUntracked === true) args.push('--include-untracked')
  if (typeof payload.message === 'string' && payload.message.trim() !== '') args.push('-m', payload.message)
  const out = await git(root, args)
  return { output: out.trim() }
}

async function stashApply(payload) {
  const cwd = cwdOf(payload)
  const root = await repoRootOf(cwd, payload)
  const ref = typeof payload.ref === 'string' && payload.ref.trim() !== '' ? requireRef(payload.ref, 'ref') : 'stash@{0}'
  const args = ['stash', payload.pop === true ? 'pop' : 'apply', ref]
  const result = await runGit(root, args)
  const combined = (result.stdout + '\n' + result.stderr).trim()
  const conflicted = /CONFLICT/.test(combined)
  if (result.code !== 0 && !conflicted) throw new PanelError('git-failed', combined === '' ? 'stash apply failed' : combined, 409)
  return { ref, conflicted, output: combined }
}

async function stashDrop(payload) {
  const cwd = cwdOf(payload)
  const root = await repoRootOf(cwd, payload)
  const ref = typeof payload.ref === 'string' && payload.ref.trim() !== '' ? requireRef(payload.ref, 'ref') : 'stash@{0}'
  if (payload.confirm !== true) throw badRequest('dropping a stash requires confirm: true')
  await git(root, ['stash', 'drop', ref])
  return { ref }
}

async function tagCreate(payload) {
  const cwd = cwdOf(payload)
  const root = await repoRootOf(cwd, payload)
  const tag = requireRef(payload.name, 'name')
  const args = ['tag']
  if (typeof payload.message === 'string' && payload.message.trim() !== '') args.push('-a', tag, '-m', payload.message)
  else args.push(tag)
  if (typeof payload.hash === 'string' && payload.hash.trim() !== '') args.push(requireRef(payload.hash, 'hash'))
  await git(root, args)
  return { tag }
}

async function tagDelete(payload) {
  const cwd = cwdOf(payload)
  const root = await repoRootOf(cwd, payload)
  const tag = requireRef(payload.name, 'name')
  await git(root, ['tag', '-d', tag])
  return { tag }
}

async function compare(payload) {
  const cwd = cwdOf(payload)
  const root = await repoRootOf(cwd, payload)
  const base = requireRef(payload.base, 'base')
  const head = requireRef(payload.head, 'head')
  const stat = await git(root, ['diff', '--numstat', '-z', base + '...' + head])
  const files = []
  const records = stat.split('\u0000')
  for (let index = 0; index < records.length; index += 1) {
    const record = records[index]
    if (record === '') continue
    const firstTab = record.indexOf('\t')
    const secondTab = record.indexOf('\t', firstTab + 1)
    if (firstTab < 0 || secondTab < 0) continue
    const addRaw = record.slice(0, firstTab)
    const delRaw = record.slice(firstTab + 1, secondTab)
    const binary = addRaw === '-' || delRaw === '-'
    files.push({
      path: record.slice(secondTab + 1),
      additions: binary ? 0 : Number.parseInt(addRaw, 10) || 0,
      deletions: binary ? 0 : Number.parseInt(delRaw, 10) || 0,
      binary,
    })
  }
  const logOut = await git(root, ['log', '--max-count=100', '--date-order', '--pretty=format:' + LOG_FORMAT, base + '..' + head])
  return { base, head, files, commits: parseLog(logOut) }
}

/** Directories never descended into while looking for repositories. */
const REPO_SCAN_SKIP = new Set(['node_modules', 'dist', 'build', 'out', 'target', 'vendor', 'venv', '.venv', '__pycache__', 'coverage', 'tmp', 'temp'])

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

/**
 * Repositories this panel may bind to: the session workspace itself when it is
 * one, plus repositories nested inside it (a sandbox holding many checkouts).
 * The client turns this into the repo picker — an empty workspace is answered
 * with the picker, not with an error.
 */
async function repos(payload) {
  const cwd = cwdOf(payload)
  const list = []
  const self = await runGit(cwd, ['rev-parse', '--show-toplevel'])
  const isRepo = self.code === 0
  if (isRepo) {
    const top = self.stdout.trim()
    list.push({ path: top, name: path.basename(top), branch: await branchOrNull(top), kind: 'workspace' })
  }
  for (const dir of findNestedRepos(cwd, 2)) {
    if (list.some((entry) => entry.path === dir)) continue
    list.push({ path: dir, name: path.basename(dir), branch: await branchOrNull(dir), kind: 'nested' })
  }
  list.sort((a, b) => (a.kind === b.kind ? a.name.localeCompare(b.name) : a.kind === 'workspace' ? -1 : 1))
  return { cwd, isRepo, repos: list }
}

async function version() {
  const result = await runGit(process.cwd(), ['--version'])
  const raw = result.code === 0 ? result.stdout.trim() : ''
  const match = /git version (\S+)/.exec(raw)
  return { git: match === null ? raw : match[1], available: result.code === 0 }
}

function optionalPaths(payload, label) {
  if (payload === undefined || payload[label] === undefined || payload[label] === null) return []
  if (!Array.isArray(payload[label])) throw badRequest(label + ' must be an array')
  if (payload[label].length > 5000) throw badRequest(label + ' has too many entries')
  return payload[label].map((entry) => requireRelativePath(entry))
}

function clampInt(value, min, max, fallback) {
  const parsed = typeof value === 'number' ? value : Number.parseInt(value, 10)
  if (!Number.isFinite(parsed)) return fallback
  return Math.min(max, Math.max(min, Math.trunc(parsed)))
}

const METHODS = {
  version,
  repos,
  summary,
  branches,
  log,
  commitDetail,
  diff,
  compare,
  stage,
  unstage,
  discard,
  commit,
  checkout,
  branchCreate,
  branchRename,
  branchDelete,
  merge,
  rebase,
  cherryPick,
  revert,
  reset,
  fetch,
  pull,
  push,
  stashList,
  stashPush,
  stashApply,
  stashDrop,
  tagCreate,
  tagDelete,
}

/* ============================== http plumbing ============================== */

function headerOf(req, name) {
  const value = req.headers[name]
  if (Array.isArray(value)) return value[0]
  return value
}

/** Loopback authority, or a same-origin browser request (desktop shell / remote UI). */
function isTrusted(req) {
  const host = headerOf(req, 'host')
  if (host === undefined || host === '') return false
  const hostname = host.replace(/^\[/, '').replace(/\]:\d+$/, '').replace(/:\d+$/, '')
  if (hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1' || hostname === '0.0.0.0') return true
  if (/^127\./.test(hostname)) return true
  const site = headerOf(req, 'sec-fetch-site')
  return site === 'same-origin' || site === 'same-site'
}

function sendJson(res, status, body) {
  const text = JSON.stringify(body)
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'content-length': Buffer.byteLength(text),
  })
  res.end(text)
}

function readJsonBody(req, limit = 1 << 20) {
  return new Promise((resolve, reject) => {
    const chunks = []
    let size = 0
    req.on('data', (chunk) => {
      size += chunk.length
      if (size > limit) {
        reject(new PanelError('too-large', 'request body is too large', 413))
        req.destroy()
        return
      }
      chunks.push(chunk)
    })
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8')
      if (raw.trim() === '') { resolve({}); return }
      try {
        const parsed = JSON.parse(raw)
        resolve(parsed !== null && typeof parsed === 'object' ? parsed : {})
      } catch {
        reject(badRequest('request body must be JSON'))
      }
    })
    req.on('error', (error) => { reject(new PanelError('transport', messageOf(error), 500)) })
  })
}

async function handle(req, res) {
  if (!isTrusted(req)) {
    sendJson(res, 403, { ok: false, error: { code: 'forbidden', message: 'forbidden' } })
    return
  }
  if (req.method !== 'POST') {
    sendJson(res, 405, { ok: false, error: { code: 'method-error', message: 'POST required' } })
    return
  }
  const pathname = new URL(req.url === undefined ? '/' : req.url, 'http://dsh.internal').pathname
  const method = pathname.startsWith(ROUTE_PREFIX + '/') ? pathname.slice(ROUTE_PREFIX.length + 1) : ''
  const handler = Object.prototype.hasOwnProperty.call(METHODS, method) ? METHODS[method] : undefined
  if (handler === undefined || method.includes('/')) {
    sendJson(res, 404, { ok: false, error: { code: 'not-found', message: 'unknown method "' + method + '"' } })
    return
  }
  try {
    const payload = await readJsonBody(req)
    sendJson(res, 200, { ok: true, data: await handler(payload) })
  } catch (error) {
    if (error instanceof PanelError) {
      sendJson(res, error.status, { ok: false, error: { code: error.code, message: error.message } })
      return
    }
    const message = messageOf(error)
    sendJson(res, 500, { ok: false, error: { code: 'internal', message } })
  }
}

export function apply(ctx) {
  ctx.effect(
    () => ctx.webServer.register({ kind: 'prefix', path: ROUTE_PREFIX, handler: handle }),
    'dsh-ide-git: /dsh-ide-git/api git routes',
  )
}
