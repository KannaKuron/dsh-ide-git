/** dsh-ide-git host: POST /dsh-ide-git/api/<method> and its trust fence. */

import { PanelError, badRequest, messageOf, WRITE_METHODS, withRepoLock, lockKeyOf } from './core.js'

import { summary, stats, branches, log, me, mergePoint, commitDetail, diff, compare, gitLogs } from './read.js'

import {

  stage, unstage, discard, commit, checkout, branchCreate, worktreeAdd, worktreeRemove,

  worktreePrune, branchUpstream, branchRename, branchDelete, merge, mergeAbort, rebase, rebaseAbort,

  remoteAdd, remoteRemove, branchDeleteRemote, tagDeleteRemote, pushTags, stashClear,

  cherryPick, revert, reset, fetch, pull, push, stashList, stashPush, stashApply,

  stashDrop, tagCreate, tagDelete, clone,

} from './write.js'

import { undoList, undoApply } from './undo.js'

import { repos, openRepo, version } from './repos.js'
import { diagnostics } from './git.js'

import { commitMessage, commitModels, commitEfforts } from './commit-message.js'



const ROUTE_PREFIX = '/dsh-ide-git/api'



const METHODS = {
  version,
  diagnostics,
  'commit-message': commitMessage,
  'commit-models': commitModels,
  'commit-efforts': commitEfforts,
  repos,
  openRepo,
  summary,
  stats,
  branches,
  log,
  me,
  'merge-point': mergePoint,
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
  'branch-upstream': branchUpstream,
  branchDelete,
  worktreeAdd,
  worktreeRemove,
  worktreePrune,
  merge,
  mergeAbort,
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
  tagDeleteRemote,
  pushTags,
  clone,
  gitLogs,
  remoteAdd,
  remoteRemove,
  branchDeleteRemote,
  rebaseAbort,
  stashClear,
  undoList,
  undoApply,
}

/* ============================== http plumbing ============================== */

function headerOf(req, name) {
  const value = req.headers[name]
  if (Array.isArray(value)) return value[0]
  return value
}

/* Normalize an authority ("host[:port]" or an absolute URL) to
   "hostname:port", filling the scheme default port when it is implicit.
   Returns '' for anything unparseable (including the "null" opaque origin). */
function authorityKey(value, protocol) {
  const text = String(value === undefined || value === null ? '' : value).trim()
  if (text === '') return ''
  let hostname = text
  let port = ''
  let scheme = protocol
  if (text.includes('://') === true) {
    let parsed = null
    try { parsed = new URL(text) } catch (error) { parsed = null }
    if (parsed === null) return ''
    hostname = parsed.hostname
    port = parsed.port
    scheme = parsed.protocol
  } else {
    const bracketed = /^\[([^\]]+)\](?::(\d+))?$/.exec(text)
    if (bracketed !== null) {
      hostname = bracketed[1]
      port = bracketed[2] === undefined ? '' : bracketed[2]
    } else {
      const plain = /^([^:]+)(?::(\d+))?$/.exec(text)
      if (plain === null) return ''
      hostname = plain[1]
      port = plain[2] === undefined ? '' : plain[2]
    }
  }
  if (hostname === '') return ''
  if (port === '') port = scheme === 'https:' ? '443' : '80'
  return hostname.toLowerCase() + ':' + port
}

/* Same-origin fallback for browsers that send no Sec-Fetch-* headers. A page
   served over plain HTTP from a non-loopback address is not a secure context,
   and the fetch-metadata headers are omitted there (issue #20: the git panel
   answered 403 on a LAN address). Origin and Referer are forbidden headers a
   page cannot forge — a cross-site request always carries the caller's own
   origin — so comparing either against the Host header restores the
   same-origin fence without trusting anything the request body claims. */
function sameOriginOf(req, host) {
  const hostKey = authorityKey(host, 'http:')
  if (hostKey === '') return false
  /* A Host header without a port says nothing about the scheme, so either
     scheme default may be the one the browser used in Origin. */
  const candidates = new Set([hostKey])
  if (/:\d+$/.test(String(host).trim()) !== true) candidates.add(authorityKey(host, 'https:'))
  const matches = (value) => {
    const key = authorityKey(value, 'http:')
    return key !== '' && candidates.has(key)
  }
  if (matches(headerOf(req, 'origin')) === true) return true
  return matches(headerOf(req, 'referer'))
}

/** Loopback authority, or a same-origin browser request (desktop shell / remote UI). */
function isTrusted(req) {
  const host = headerOf(req, 'host')
  if (host === undefined || host === '') return false
  const hostname = host.replace(/^\[/, '').replace(/\]:\d+$/, '').replace(/:\d+$/, '')
  if (hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1' || hostname === '0.0.0.0') return true
  if (/^127\./.test(hostname)) return true
  const site = headerOf(req, 'sec-fetch-site')
  if (site === 'same-origin' || site === 'same-site') return true
  return sameOriginOf(req, host)
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
    sendJson(res, 403, {
      ok: false,
      error: {
        code: 'forbidden',
        message: 'forbidden: a non-loopback request must be same-origin (open this host from its own page) or come through the remote pairing proxy',
      },
    })
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
    const data = WRITE_METHODS.has(method)
      ? await withRepoLock(lockKeyOf(payload), () => handler(payload))
      : await handler(payload)
    sendJson(res, 200, { ok: true, data: data })
  } catch (error) {
    if (error instanceof PanelError) {
      sendJson(res, error.status, { ok: false, error: { code: error.code, message: error.message } })
      return
    }
    const message = messageOf(error)
    sendJson(res, 500, { ok: false, error: { code: 'internal', message } })
  }
}

export { ROUTE_PREFIX, handle }
