/**
 * dsh-ide-git host: shared errors, payload validation and the per-repository
 * write queue. No git process runs here; see ./git.js.
 */
import path from 'node:path'

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

/* ============================== safety ============================== */

/**
 * Write operations on one repository run one at a time. The client greys its
 * actions out while a request is in flight, but a stale tab, a second window or
 * a double click could still start two writers, and git dislikes concurrent
 * index writers — so the host serialises writes per repository.
 */
const repoQueues = new Map()

function withRepoLock(key, work) {
  const previous = repoQueues.get(key) === undefined ? Promise.resolve() : repoQueues.get(key)
  const next = previous.then(work, work)
  const settled = next.then(() => undefined, () => undefined)
  repoQueues.set(key, settled)
  settled.then(() => { if (repoQueues.get(key) === settled) repoQueues.delete(key) })
  return next
}

const WRITE_METHODS = new Set([
  'stage', 'unstage', 'discard', 'commit', 'checkout', 'branchCreate', 'branchRename', 'branch-upstream',
  'branchDelete', 'worktreeAdd', 'worktreeRemove', 'worktreePrune', 'merge', 'mergeAbort', 'rebase', 'cherryPick', 'revert', 'reset', 'fetch', 'pull',
  'push', 'stashPush', 'stashApply', 'stashDrop', 'stashClear', 'tagCreate', 'tagDelete', 'tagDeleteRemote', 'pushTags', 'clone', 'remoteAdd', 'remoteRemove', 'branchDeleteRemote', 'undoApply',
])

function lockKeyOf(payload) {
  if (typeof payload.repoRoot === 'string' && payload.repoRoot !== '') return payload.repoRoot
  if (typeof payload.cwd === 'string' && payload.cwd !== '') return payload.cwd
  return 'global'
}

/* ============================== path helpers ============================== */

function requireRelativePath(value) {
  if (typeof value !== 'string' || value.trim() === '') throw badRequest('path is required')
  const trimmed = value.trim()
  if (path.isAbsolute(trimmed)) return trimmed
  if (trimmed.split('/').includes('..')) throw badRequest('path must stay inside the repository')
  return trimmed
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

export {

  PanelError, badRequest, messageOf,

  requireAbsolute, requireRef, optionalRevs, requireMessage, cwdOf,

  requireRelativePath, optionalPaths, clampInt,

  withRepoLock, WRITE_METHODS, lockKeyOf,

}
