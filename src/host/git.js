/**

 * dsh-ide-git host: the argv-only git process and the parsers shared by every

 * method. Callers never pass a shell string; all input is validated in ./core.js.

 */

import { spawn } from 'node:child_process'

import { realpathSync } from 'node:fs'

import path from 'node:path'

import { PanelError, messageOf, badRequest, requireAbsolute } from './core.js'



const MAX_OUTPUT_BYTES = 8 * 1024 * 1024

/* Ring buffer of the most recent git runs — the panel's "Git output" view
   (VS Code's scm showOutput equivalent). Bounded on both axes: entries and
   per-entry text, so a hostile `log -p` cannot grow it without limit. */
const GIT_LOG_MAX_ENTRIES = 200
const GIT_LOG_TEXT_MAX = 4000
const gitLog = []

/* Calls currently in spawn-to-close, for the load diagnostics route. This is
   deliberately tiny (no argv): a commit message or a remote URL in argv must
   never leak into a UI that only needs to say which git command is running. */
const activeGit = new Map()
let activeGitSeq = 0
function beginGitCall(cwd, args) {
  activeGitSeq += 1
  const id = activeGitSeq
  const command = typeof args[0] === 'string' && args[0] !== '' ? args[0] : 'git'
  activeGit.set(id, { id, cwd, command, startedAt: Date.now() })
  return id
}
function endGitCall(id) {
  activeGit.delete(id)
}
function activeGitCalls(now = Date.now()) {
  return [...activeGit.values()]
    .sort((a, b) => a.startedAt - b.startedAt)
    .map((call) => ({ command: call.command, cwd: call.cwd, elapsedMs: Math.max(0, now - call.startedAt) }))
}
function diagnostics() {
  return {
    pid: process.pid,
    uptimeMs: Math.round(process.uptime() * 1000),
    now: Date.now(),
    active: activeGitCalls(),
  }
}
function pushGitLog(entry) {
  gitLog.push(entry)
  if (gitLog.length > GIT_LOG_MAX_ENTRIES) gitLog.splice(0, gitLog.length - GIT_LOG_MAX_ENTRIES)
}
function clipGitLogText(text) {
  if (typeof text !== 'string' || text.length <= GIT_LOG_TEXT_MAX) return text
  return text.slice(0, GIT_LOG_TEXT_MAX / 2) + '\n…[' + String(text.length - GIT_LOG_TEXT_MAX) + ' more chars]…\n' + text.slice(-GIT_LOG_TEXT_MAX / 2)
}
const MAX_DIFF_CHARS = 400 * 1024
const DEFAULT_TIMEOUT_MS = 30_000
const NETWORK_TIMEOUT_MS = 180_000
const RECORD_SEP = '\u001e'
const FIELD_SEP = '\u001f'

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
/** Environment for every git child: no optional locks, no credential prompt,
 *  and unquoted non-ASCII paths in diff headers (issue #31). git's default
 *  core.quotePath=true C-escapes those headers, which made the client's
 *  header-derived path unusable for `git show <hash> -- <path>`. GIT_CONFIG_*
 *  is honoured by git >= 2.31; the client still decodes quoted headers so an
 *  older git keeps working. A caller that already owns GIT_CONFIG_COUNT keeps
 *  its own configuration instead of having it overwritten here. */
function gitEnv() {
  const env = { ...process.env, GIT_OPTIONAL_LOCKS: '0', GIT_TERMINAL_PROMPT: '0' }
  if (process.env.GIT_CONFIG_COUNT === undefined) {
    env.GIT_CONFIG_COUNT = '1'
    env.GIT_CONFIG_KEY_0 = 'core.quotePath'
    env.GIT_CONFIG_VALUE_0 = 'false'
  }
  return env
}

function runGit(cwd, args, options = {}) {
  const timeoutMs = options.timeoutMs === undefined ? DEFAULT_TIMEOUT_MS : options.timeoutMs
  const startedAt = Date.now()
  return new Promise((resolve, reject) => {
    let child
    try {
      child = spawn(gitBinary(), args, { cwd, windowsHide: true, env: gitEnv() })
    } catch (error) {
      reject(new PanelError('git-missing', 'cannot start git: ' + messageOf(error), 500))
      return
    }
    const callId = beginGitCall(cwd, args)
    const out = []
    const err = []
    let outBytes = 0
    let errBytes = 0
    let settled = false
    const timer = setTimeout(() => {
      if (settled) return
      settled = true
      endGitCall(callId)
      child.kill('SIGKILL')
      pushGitLog({ at: new Date(startedAt).toISOString(), argv: args.join(' '), code: 'timeout', ms: timeoutMs, out: '', err: 'timed out after ' + String(timeoutMs) + 'ms' })
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
      endGitCall(callId)
      clearTimeout(timer)
      reject(new PanelError('git-missing', 'cannot run git: ' + messageOf(error), 500))
    })
    child.on('close', (code, signal) => {
      if (settled) return
      settled = true
      endGitCall(callId)
      clearTimeout(timer)
      pushGitLog({
        at: new Date(startedAt).toISOString(),
        argv: args.join(' '),
        code: code === null ? -1 : code,
        ms: Date.now() - startedAt,
        out: clipGitLogText(Buffer.concat(out).toString('utf8')),
        err: clipGitLogText(Buffer.concat(err).toString('utf8')),
      })
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

/* Turn the failures users actually hit into named codes (v0.24.0), so the
   panel can answer with an actionable sentence instead of the raw git wall.
   Everything else keeps the honest git-failed message. */
function gitFailure(command, error) {
  const message = messageOf(error)
  if (command === 'push' && /\[rejected\]|non-fast-forward|fetch first|Updates were rejected because/i.test(message)) {
    return new PanelError('push-rejected', 'push rejected: the remote branch has commits that are not local; pull (merge) first. ' + message, 409)
  }
  if (command === 'pull') {
    if (/CONFLICT|Automatic merge failed|Fix conflicts/i.test(message)) {
      return new PanelError('pull-conflict', 'pull stopped on merge conflicts; resolve them and commit before continuing. ' + message, 409)
    }
    if (/Not possible to fast-forward|Diverging branches/i.test(message)) {
      return new PanelError('pull-diverged', 'local and remote branches have diverged; pull with merge or rebase instead of fast-forward. ' + message, 409)
    }
    if (/Your local changes|would be overwritten by merge|Please commit your changes or stash them/i.test(message)) {
      return new PanelError('pull-dirty', 'pull would overwrite local changes; commit or stash them first. ' + message, 409)
    }
  }
  return error
}

/* ============================== git reads ============================== */

async function repoRootOf(cwd, payload) {
  /* Normalize the separator: `rev-parse --show-toplevel` spells drive paths
     with forward slashes on Windows while path.join produces backslashes, so
     the untracked-diff fence (root + path.sep prefix check) rejected every
     in-repo path there. macOS/Linux are byte-identical no-ops. */
  if (payload !== undefined && payload.repoRoot !== undefined) return path.normalize(requireAbsolute(payload.repoRoot, 'repoRoot'))
  const result = await runGit(cwd, ['rev-parse', '--show-toplevel'])
  if (result.code !== 0) {
    // A workspace that is not a repository is a normal state, not a failure:
    // the client answers it with a repo picker instead of an error banner.
    throw new PanelError('not-a-repo', 'not a git repository: ' + cwd, 409)
  }
  const top = result.stdout.trim()
  return path.normalize(top === '' ? cwd : top)
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

/** An ignored tree can be enormous, and this list is informational only. */
const MAX_IGNORED_ENTRIES = 500

/**
 * Ignored paths, asked for on their own. `git status -uall --ignored` expands
 * every file inside an ignored directory — node_modules alone would flood the
 * panel — while `ls-files --directory` reports the directory as a single entry.
 */
async function ignoredEntriesOf(root) {
  const result = await runGit(root, ['ls-files', '--others', '--ignored', '--exclude-standard', '--directory', '-z'])
  if (result.code !== 0) return { entries: [], truncated: false }
  const paths = result.stdout.split('\u0000').filter((entry) => entry !== '')
  const kept = paths.slice(0, MAX_IGNORED_ENTRIES)
  return {
    entries: kept.map((filePath) => ({ index: '!', worktree: '!', path: filePath })),
    truncated: paths.length > kept.length,
  }
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

/** Same directory, tolerating a trailing slash and macOS /var vs /private/var. */
function sameDirectory(left, right) {
  const one = path.resolve(String(left))
  const two = path.resolve(String(right))
  if (one === two) return true
  try { return realpathSync(one) === realpathSync(two) } catch { return false }
}

/* `--porcelain -z` is the only parseable form: a path may contain spaces and
   newlines, and git realpaths the main worktree (/var -> /private/var on macOS),
   so every record is NUL-terminated and an empty record closes the current
   block. The flags describe the ADMIN view: `locked` and `prunable` say
   whether removal is blocked or the directory is already gone. */
async function worktreesOf(root) {
  const result = await runGit(root, ['worktree', 'list', '--porcelain', '-z'])
  if (result.code !== 0) return []
  const trees = []
  let current = null
  const push = () => { if (current !== null) trees.push(current); current = null }
  for (const record of result.stdout.split('\u0000')) {
    if (record === '') { push(); continue }
    if (record.startsWith('worktree ')) {
      push()
      current = {
        path: record.slice('worktree '.length),
        branch: null,
        head: null,
        detached: false,
        bare: false,
        locked: false,
        lockReason: null,
        prunable: false,
        pruneReason: null,
      }
      continue
    }
    if (current === null) continue
    if (record.startsWith('HEAD ')) current.head = record.slice('HEAD '.length)
    else if (record.startsWith('branch ')) current.branch = record.slice('branch '.length).replace('refs/heads/', '')
    else if (record === 'detached') current.detached = true
    else if (record === 'bare') current.bare = true
    else if (record.startsWith('locked')) {
      current.locked = true
      const reason = record.slice('locked'.length).trim()
      current.lockReason = reason === '' ? null : reason
    } else if (record.startsWith('prunable')) {
      current.prunable = true
      const reason = record.slice('prunable'.length).trim()
      current.pruneReason = reason === '' ? null : reason
    }
  }
  push()
  return trees.map((tree, index) => Object.assign(tree, {
    primary: index === 0,
    current: sameDirectory(tree.path, root),
  }))
}

/* The repository's own name, cut from its origin URL — a cloned folder that
   was renamed on disk still reports the name the remote gave it (the leaf of
   the URL, minus a trailing .git). scp-style (user@host:path), URL-style and
   plain local paths all cut on the last slash or colon. */
function repoNameFromUrl(url) {
  if (typeof url !== 'string' || url.trim() === '') return ''
  const tail = url.trim().replace(/\/+$/, '').replace(/\.git$/i, '')
  const segments = tail.split(/[\\/:]/).filter((segment) => segment !== '')
  return segments.length > 0 ? segments[segments.length - 1] : ''
}
/* origin first, then the first configured remote, then '' — the client
   falls back to the folder basename when this is empty. Both reads are
   local config reads, never network. */
async function originNameOf(root) {
  try {
    const origin = await git(root, ['remote', 'get-url', 'origin'])
    const name = repoNameFromUrl(origin)
    if (name !== '') return name
  } catch (error) { void error }
  try {
    const remotesOut = await runGit(root, ['remote'])
    if (remotesOut.code !== 0) return ''
    const first = remotesOut.stdout.split('\n').map((line) => line.trim()).filter((line) => line !== '')[0]
    if (first === undefined) return ''
    const urlOut = await runGit(root, ['remote', 'get-url', first])
    return urlOut.code === 0 ? repoNameFromUrl(urlOut.stdout.trim()) : ''
  } catch (error) { void error; return '' }
}

export {

  MAX_DIFF_CHARS, NETWORK_TIMEOUT_MS, FIELD_SEP, RECORD_SEP, gitLog, GIT_LOG_MAX_ENTRIES,

  gitBinary, runGit, git, gitFailure, activeGitCalls, diagnostics,

  repoRootOf, currentBranchOf, upstreamOf, aheadBehindOf,

  parsePorcelain, classify, ignoredEntriesOf, numstatOf, decorate,

  parseLog, LOG_FORMAT, stashCountOf, sameDirectory, worktreesOf,

  repoNameFromUrl, originNameOf,

}
