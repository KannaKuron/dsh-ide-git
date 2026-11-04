/** dsh-ide-git host: the short-lived undo stack and its one-shot handlers. */

import { createHash } from 'node:crypto'

import { existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, unlinkSync, writeFileSync } from 'node:fs'

import path from 'node:path'

import { PanelError, cwdOf, requireRef } from './core.js'

import { git, repoRootOf, runGit } from './git.js'



/* Deleting is a real delete — but the host remembers how to bring it back for a
   while, so the panel can offer an undo. Entries are per repository, newest
   last, capped and time-limited. */
const UNDO_LIMIT = 20
const UNDO_TTL_MS = 30 * 60 * 1000
const undoStacks = new Map()
let undoSeq = 0

/** Branches whose deletion is never a routine action. */
const PROTECTED_BRANCHES = new Set(['main', 'master', 'trunk'])

function undoEntriesOf(root) {
  const stored = undoStacks.get(root) === undefined ? [] : undoStacks.get(root)
  const alive = stored.filter((entry) => Date.now() - entry.at < UNDO_TTL_MS)
  if (alive.length !== stored.length) undoStacks.set(root, alive)
  return alive
}

function pushUndo(root, entry) {
  const list = undoEntriesOf(root)
  undoSeq += 1
  const record = Object.assign({ id: 'u' + undoSeq.toString(36) + Date.now().toString(36), at: Date.now() }, entry)
  list.push(record)
  while (list.length > UNDO_LIMIT) list.shift()
  undoStacks.set(root, list)
  return { id: record.id, kind: record.kind, label: record.label }
}

/* Undoing a discard means writing the old bytes back, so the host has to keep
   them: a checkout/clean is the one moment they still exist. Snapshots stay
   deliberately conservative — regular files only, capped in count and in total
   size — and anything that cannot be reproduced faithfully (a symlink, a
   special file, a huge tree) yields NO undo handle at all rather than a promise
   the host cannot keep. */
const UNDO_MAX_FILES = 400
const UNDO_MAX_SNAPSHOT_BYTES = 4 * 1024 * 1024

function hashOf(data) {
  return createHash('sha1').update(data).digest('hex')
}

/** Repo-relative POSIX path of a target, or null when it escapes the repo. */
function relInside(root, target) {
  const rel = path.relative(root, target)
  if (rel === '' || rel.startsWith('..') || path.isAbsolute(rel)) return null
  return rel.split(path.sep).join('/')
}

/**
 * Read every regular file the given paths cover (each path may be a file or a
 * directory). Returns null when the snapshot would not be faithful, which makes
 * the caller skip the undo handle instead of offering one it cannot honour.
 */
function snapshotForUndo(root, paths) {
  const files = []
  let bytes = 0
  const collect = (target) => {
    const rel = relInside(root, target)
    if (rel === null) return true
    let stat
    try {
      stat = lstatSync(target)
    } catch (error) {
      // Already gone ('D' in the working tree) is itself a state worth undoing
      // to, so record the absence. Any other failure is not ours to guess at.
      if (error.code === 'ENOENT') { files.push({ rel: rel, data: null }); return true }
      return false
    }
    if (stat.isSymbolicLink()) return false
    if (stat.isDirectory()) {
      if (path.basename(target) === '.git') return true
      let names
      try { names = readdirSync(target) } catch { return false }
      for (const name of names) if (!collect(path.join(target, name))) return false
      return true
    }
    if (!stat.isFile()) return false
    if (files.length >= UNDO_MAX_FILES) return false
    let data
    try { data = readFileSync(target) } catch { return false }
    bytes += data.length
    if (bytes > UNDO_MAX_SNAPSHOT_BYTES) return false
    files.push({ rel: rel, data: data })
    return true
  }
  for (const entry of paths) if (!collect(path.resolve(root, entry))) return null
  return files
}

/**
 * The shape the snapshot targets have right now: a content hash, or null when
 * the path is absent. The undo compares against this before writing anything,
 * so content typed after the discard is never silently overwritten.
 */
function snapshotState(root, files) {
  return files.map((file) => {
    try {
      return { rel: file.rel, hash: hashOf(readFileSync(path.join(root, file.rel))) }
    } catch {
      return { rel: file.rel, hash: null }
    }
  })
}

/** .git markers that mean a multi-step operation is still in progress. */
async function operationOf(root) {
  const result = await runGit(root, ['rev-parse', '--absolute-git-dir'])
  if (result.code !== 0) return null
  const gitDir = result.stdout.trim()
  if (gitDir === '') return null
  const markers = [
    ['merge', 'MERGE_HEAD'],
    ['rebase', 'rebase-merge'],
    ['rebase', 'rebase-apply'],
    ['cherry-pick', 'CHERRY_PICK_HEAD'],
    ['revert', 'REVERT_HEAD'],
    ['bisect', 'BISECT_LOG'],
  ]
  for (const marker of markers) {
    if (existsSync(path.join(gitDir, marker[1]))) return marker[0]
  }
  return null
}

/** What this repository can still undo right now (newest last). */
async function undoList(payload) {
  const cwd = cwdOf(payload)
  const root = await repoRootOf(cwd, payload)
  const items = undoEntriesOf(root).map((entry) => ({ id: entry.id, kind: entry.kind, label: entry.label, at: entry.at }))
  return { items }
}

/**
 * Undo one remembered action. Nothing here is a 'soft delete': the branch (or
 * stash entry) really was gone, and the undo recreates it from the object id
 * recorded before the deletion; a discard really overwrote the working tree,
 * and the undo writes the snapshotted bytes back. It is one-shot and fails
 * loudly when the world moved on — the name is taken again, or the discarded
 * files were edited since.
 */
async function undoApply(payload) {
  const cwd = cwdOf(payload)
  const root = await repoRootOf(cwd, payload)
  const id = requireRef(payload.id, 'id')
  const list = undoEntriesOf(root)
  const index = list.findIndex((entry) => entry.id === id)
  if (index < 0) throw new PanelError('undo-gone', 'this action can no longer be undone', 409)
  const entry = list[index]
  if (entry.kind === 'branch-delete') {
    /* Batch handles carry `branches: [{name, hash}]`; older single-branch
       handles only have `name`/`hash` — normalise both to one list. */
    const restores = Array.isArray(entry.branches) ? entry.branches : [{ name: entry.name, hash: entry.hash }]
    for (const item of restores) {
      const exists = await runGit(root, ['show-ref', '--verify', '--quiet', 'refs/heads/' + item.name])
      if (exists.code === 0) throw new PanelError('undo-conflict', 'branch "' + item.name + '" already exists again', 409)
      await git(root, ['branch', item.name, item.hash])
    }
  } else if (entry.kind === 'stash-drop') {
    await git(root, ['stash', 'store', '-m', 'dsh-ide-git: restored ' + entry.label, entry.hash])
  } else if (entry.kind === 'discard') {
    // Refuse to trample anything typed since the discard: every target must
    // still look exactly the way the discard left it.
    const now = snapshotState(root, entry.files)
    for (let position = 0; position < now.length; position += 1) {
      if (now[position].hash !== entry.after[position].hash) {
        throw new PanelError('undo-conflict', 'these files changed after the discard', 409)
      }
    }
    for (const file of entry.files) {
      const target = path.join(root, file.rel)
      if (file.data === null) {
        // The file was absent before the discard: absent is what we restore.
        try { unlinkSync(target) } catch { /* already gone */ }
        continue
      }
      mkdirSync(path.dirname(target), { recursive: true })
      writeFileSync(target, file.data)
    }
  } else {
    throw new PanelError('undo-unsupported', 'this action cannot be undone', 500)
  }
  list.splice(index, 1)
  undoStacks.set(root, list)
  return { kind: entry.kind, label: entry.label }
}

export {

  PROTECTED_BRANCHES, undoEntriesOf, pushUndo, snapshotForUndo, snapshotState,

  operationOf, undoList, undoApply,

}
