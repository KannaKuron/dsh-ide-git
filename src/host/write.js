/** dsh-ide-git host: mutating methods. Every destructive one checks confirm. */

import { existsSync } from 'node:fs'

import path from 'node:path'

import {

  PanelError, badRequest, cwdOf, requireAbsolute, requireRef, requireMessage,

  optionalRevs, optionalPaths, requireRelativePath,

} from './core.js'

import {

  git, runGit, gitFailure, repoRootOf, currentBranchOf, upstreamOf, worktreesOf, sameDirectory,

  FIELD_SEP, RECORD_SEP, NETWORK_TIMEOUT_MS,

} from './git.js'

import { PROTECTED_BRANCHES, pushUndo, snapshotForUndo, snapshotState } from './undo.js'



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
  // '.' would discard EVERYTHING in the repository in one go; the panel always
  // discards explicit paths, so the root itself is not a valid target here.
  const paths = optionalPaths(payload, 'paths').filter((entry) => entry !== '.' && entry !== './')
  if (paths.length === 0) throw badRequest('paths is required')
  const untracked = payload.untracked === true
  if (untracked && payload.confirm !== true) throw badRequest('discarding untracked files requires confirm: true')
  // Last chance to keep the bytes: the checkout/clean below is what destroys them.
  const files = snapshotForUndo(root, paths)
  if (untracked) await git(root, ['clean', '-f', '-d', '--', ...paths])
  else await git(root, ['checkout', '--', ...paths])
  // A snapshot the host cannot reproduce faithfully means no handle at all — the
  // panel says so instead of showing an undo that would fail later.
  if (files === null) return { discarded: paths.length, untracked: untracked, undoBlocked: true }
  const label = paths.length === 1 ? paths[0] : paths.length + ' paths'
  const undo = pushUndo(root, { kind: 'discard', label: label, files: files, after: snapshotState(root, files) })
  return { discarded: paths.length, untracked: untracked, undo: undo }
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
  const result = { output: out.trim() }
  if (payload.push === true) {
    // Commit-and-push is one gesture in the panel, so the commit is published in
    // the same request. A failed push must not hide the commit that did land.
    if (payload.confirm !== true) throw badRequest('pushing requires confirm: true')
    const pushed = await runGit(root, ['push'])
    result.pushed = pushed.code === 0
    if (pushed.code !== 0) result.pushError = (pushed.stderr.trim() || pushed.stdout.trim() || 'push failed')
  }
  return result
}

async function checkout(payload) {
  const cwd = cwdOf(payload)
  const root = await repoRootOf(cwd, payload)
  if (payload.create === true) {
    const name = requireRef(payload.branch, 'branch')
    const start = typeof payload.startPoint === 'string' && payload.startPoint.trim() !== '' ? requireRef(payload.startPoint, 'startPoint') : undefined
    const args = ['checkout', '-b', name]
    /* track (issue #18): "create a local branch from a remote one" must bind
       the upstream in the same breath — checkout -b alone never does. */
    if (payload.track === true && start !== undefined) args.push('--track')
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

/* ---------- worktrees (v0.22, alpha.2) ----------
   A worktree is a second checkout of the same repository. These three verbs
   are the whole lifecycle the panel offers: create a checkout (on a new or an
   existing branch), remove one, and prune the admin records of directories
   that are already gone.

   Removal is deliberately strict. The current and primary checkouts are
   refused outright (removing the tree the panel is reading is never what a
   click meant), a locked worktree must be unlocked first, and a dirty one
   needs a second request with force:true. The dirty check runs INSIDE the
   target, not the repository root: git status at the root says nothing
   about the linked checkout's files. */
async function worktreeAdd(payload) {
  const cwd = cwdOf(payload)
  const root = await repoRootOf(cwd, payload)
  const target = requireAbsolute(payload.path, 'path')
  if (sameDirectory(target, root)) throw badRequest('path must differ from the current worktree')
  if (existsSync(target)) throw new PanelError('worktree-exists', 'path already exists: ' + target, 409)
  const branch = requireRef(payload.branch, 'branch')
  const checked = await runGit(root, ['check-ref-format', '--branch', branch])
  if (checked.code !== 0) throw badRequest('invalid branch name: ' + branch)
  const createBranch = payload.createBranch !== false
  const args = ['worktree', 'add']
  if (createBranch === true) {
    args.push('-b', branch, target)
    if (typeof payload.base === 'string' && payload.base.trim() !== '') args.push(requireRef(payload.base, 'base'))
  } else {
    args.push(target, branch)
  }
  await git(root, args)
  return { path: target, branch: branch, created: createBranch }
}

async function worktreeRemove(payload) {
  const cwd = cwdOf(payload)
  const root = await repoRootOf(cwd, payload)
  if (payload.confirm !== true) throw badRequest('removing a worktree requires confirm: true')
  const target = requireAbsolute(payload.path, 'path')
  const trees = await worktreesOf(root)
  const tree = trees.find((entry) => sameDirectory(entry.path, target))
  if (tree === undefined) throw new PanelError('worktree-missing', 'not a worktree of this repository: ' + target, 409)
  if (tree.current === true) throw new PanelError('protected-worktree', 'refusing to remove the worktree this panel is showing', 409)
  if (tree.primary === true) throw new PanelError('protected-worktree', 'refusing to remove the primary worktree', 409)
  if (tree.locked === true) throw new PanelError('worktree-locked', 'worktree is locked; unlock it before removing: ' + target, 409)
  if (tree.prunable === true || existsSync(target) === false) throw new PanelError('worktree-missing', 'worktree directory is gone; prune the record instead: ' + target, 409)
  const dirty = await runGit(target, ['status', '--porcelain=v1', '-z', '--untracked-files=all'])
  if (dirty.code !== 0) throw new PanelError('worktree-unreadable', 'could not inspect the worktree: ' + target, 409)
  const hasChanges = dirty.stdout !== ''
  if (hasChanges === true && payload.force !== true) throw new PanelError('worktree-dirty', 'worktree has uncommitted changes; force removal deletes them: ' + target, 409)
  const args = ['worktree', 'remove']
  if (payload.force === true) args.push('--force')
  args.push(target)
  await git(root, args)
  return { path: target, forced: payload.force === true, dirty: hasChanges }
}

async function worktreePrune(payload) {
  const cwd = cwdOf(payload)
  const root = await repoRootOf(cwd, payload)
  if (payload.confirm !== true) throw badRequest('pruning worktrees requires confirm: true')
  const output = await git(root, ['worktree', 'prune', '-v'])
  return { output: output.trim() }
}

/* Upstream management (issue #18): rebind or drop a branch's tracking remote.
   git refuses --set-upstream-to with a ref it cannot resolve, so a typo dies
   here instead of silently writing branch.<name>.merge. */
async function branchUpstream(payload) {
  const cwd = cwdOf(payload)
  const root = await repoRootOf(cwd, payload)
  const branch = requireRef(payload.branch, 'branch')
  if (payload.unset === true) {
    /* --unset-upstream errors on a branch that has none; the client only
       offers the verb when the row shows an upstream, and git's own message
       is the right one to surface if they raced. */
    await git(root, ['branch', '--unset-upstream', branch])
    return { branch, upstream: null }
  }
  const upstream = requireRef(payload.upstream, 'upstream')
  await git(root, ['branch', '--set-upstream-to=' + upstream, branch])
  return { branch, upstream }
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
  const force = payload.force === true
  if (force && payload.confirm !== true) throw badRequest('force delete requires confirm: true')
  /* Batch form (multi-select): `names` wins when present; the single `name`
     keeps working exactly as before. Every name goes through the same ref
     guard — an array never bypasses validation. */
  const names = Array.isArray(payload.names)
    ? payload.names.map((entry) => requireRef(entry, 'name'))
    : [requireRef(payload.name, 'name')]
  const current = await currentBranchOf(root)
  for (const name of names) {
    if (name === current) throw new PanelError('protected-branch', 'refusing to delete the checked-out branch "' + name + '"', 409)
    if (PROTECTED_BRANCHES.has(name) && payload.confirm !== true) throw badRequest('deleting "' + name + '" requires confirm: true')
  }
  const branches = []
  for (const name of names) {
    const head = (await git(root, ['rev-parse', '--verify', 'refs/heads/' + name])).trim()
    branches.push({ name: name, hash: head })
  }
  /* -d (the default) refuses to drop an unmerged branch: git is the guard here.
     The panel answers that refusal with a second confirmation instead of a dead
     end, so when force is off we classify first: a branch merged into neither
     HEAD nor its upstream is exactly what -d would reject. Refusing before the
     git call also keeps a batch atomic (git may delete the merged entries before
     failing on an unmerged one). */
  if (!force) {
    const unmerged = []
    for (const name of names) {
      const upstream = await upstreamOf(root, name)
      const base = upstream === null ? 'HEAD' : upstream
      const result = await runGit(root, ['merge-base', '--is-ancestor', 'refs/heads/' + name, base])
      if (result.code !== 0) unmerged.push(name)
    }
    if (unmerged.length > 0) {
      const listed = unmerged.length === 1 ? 'branch "' + unmerged[0] + '"' : 'branches ' + unmerged.join(', ')
      throw new PanelError('branch-unmerged', listed + ' not fully merged; deleting it can discard commits' + (unmerged.length === 1 ? '' : ' on those branches'), 409)
    }
  }
  await git(root, ['branch', force ? '-D' : '-d', ...names])
  const label = names.length === 1 ? names[0] : names.length + ' branches'
  const undo = pushUndo(root, {
    kind: 'branch-delete', label: label,
    branches: branches,
    // Legacy single-branch fields stay so an in-flight old handle keeps working.
    name: names[0], hash: branches[0].hash,
  })
  return { branch: names[0], hash: branches[0].hash, names: names, branches: branches, force: force, undo: undo }
}

async function merge(payload) {
  const cwd = cwdOf(payload)
  const root = await repoRootOf(cwd, payload)
  const branch = requireRef(payload.branch, 'branch')
  const args = ['merge', '--no-edit']
  if (payload.ffOnly === true) args.push('--ff-only')
  if (payload.noFf === true) args.push('--no-ff')
  if (payload.squash === true) args.push('--squash')
  /* --no-commit is only meaningful when the merge cannot fast-forward (git
     otherwise refuses with "--no-commit cannot be used with a fast-forward"),
     so the client always sends it beside noFf. The route stays a plain flag
     so an API caller can compose the same pair itself. */
  if (payload.noCommit === true) args.push('--no-commit')
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

/* VS Code's "Abort Rebase" (SCM ▸ Commit ▸ Abort Rebase). Only meaningful
   while a rebase is in progress — `operationOf` already surfaces that state,
   so the menu greys the entry out; the route still refuses honestly when
   there is nothing to abort. */
async function rebaseAbort(payload) {
  const cwd = cwdOf(payload)
  const root = await repoRootOf(cwd, payload)
  const result = await runGit(root, ['rebase', '--abort'])
  if (result.code !== 0) {
    const detail = (result.stdout + '\n' + result.stderr).trim()
    throw new PanelError('git-failed', detail === '' ? 'no rebase to abort' : detail, 409)
  }
  return { output: (result.stdout + '\n' + result.stderr).trim() }
}

/* The pair to rebaseAbort for issue #25: a --no-ff --no-commit merge leaves
   MERGE_HEAD behind and stops before the commit, so without this entry the
   user could only back out in a terminal. Same honest refusal when there is
   no merge in progress. */
async function mergeAbort(payload) {
  const cwd = cwdOf(payload)
  const root = await repoRootOf(cwd, payload)
  const result = await runGit(root, ['merge', '--abort'])
  if (result.code !== 0) {
    const detail = (result.stdout + '\n' + result.stderr).trim()
    throw new PanelError('git-failed', detail === '' ? 'no merge to abort' : detail, 409)
  }
  return { output: (result.stdout + '\n' + result.stderr).trim() }
}

/* VS Code's SCM ▸ Remote ▸ Add Remote.... The name is a ref, the URL the same
   grammar `clone` already accepts. */
async function remoteAdd(payload) {
  const cwd = cwdOf(payload)
  const root = await repoRootOf(cwd, payload)
  const name = requireRef(payload.name, 'name')
  const url = requireUrl(payload.url, 'url')
  await git(root, ['remote', 'add', name, url])
  return { name, url }
}

async function remoteRemove(payload) {
  const cwd = cwdOf(payload)
  const root = await repoRootOf(cwd, payload)
  const name = requireRef(payload.name, 'name')
  if (typeof payload.confirm !== 'boolean' || payload.confirm !== true) throw badRequest('removing a remote requires confirm: true')
  await git(root, ['remote', 'remove', name])
  return { name }
}

/* SCM ▸ Branch ▸ Delete Remote Branch...: `git push <remote> --delete <branch>`.
   Genuinely destructive on the OTHER side, so it keeps the typed-confirm
   posture of a local protected-branch delete: confirm is mandatory. */
async function branchDeleteRemote(payload) {
  const cwd = cwdOf(payload)
  const root = await repoRootOf(cwd, payload)
  const remote = requireRef(payload.remote, 'remote')
  /* Batch form (multi-select): `branches` wins; the single `branch` keeps
     working. `git push --delete` accepts several names in one go. */
  const branches = Array.isArray(payload.branches)
    ? payload.branches.map((entry) => requireRef(entry, 'branch'))
    : [requireRef(payload.branch, 'branch')]
  if (payload.confirm !== true) throw badRequest('deleting a remote branch requires confirm: true')
  const out = await git(root, ['push', remote, '--delete', ...branches], { timeoutMs: NETWORK_TIMEOUT_MS })
  return { remote: remote, branch: branches[0], branches: branches, output: out.trim() }
}

/* SCM ▸ Tags ▸ Delete Remote Tag... / Push Tags. */
async function tagDeleteRemote(payload) {
  const cwd = cwdOf(payload)
  const root = await repoRootOf(cwd, payload)
  const remote = requireRef(payload.remote, 'remote')
  const tag = requireRef(payload.name, 'name')
  if (payload.confirm !== true) throw badRequest('deleting a remote tag requires confirm: true')
  const out = await git(root, ['push', remote, '--delete', tag], { timeoutMs: NETWORK_TIMEOUT_MS })
  return { remote, tag, output: out.trim() }
}

async function pushTags(payload) {
  const cwd = cwdOf(payload)
  const root = await repoRootOf(cwd, payload)
  if (payload.confirm !== true) throw badRequest('pushing tags requires confirm: true')
  const remote = typeof payload.remote === 'string' && payload.remote.trim() !== '' ? requireRef(payload.remote, 'remote') : 'origin'
  const out = await git(root, ['push', remote, '--tags'], { timeoutMs: NETWORK_TIMEOUT_MS })
  return { output: out.trim() }
}

/* SCM ▸ Stash ▸ Drop All Stashes...: one `git stash clear`. No undo handle is
   possible (the stash reflog is gone with the clear), hence the mandatory
   confirm on top of the dialog. */
async function stashClear(payload) {
  const cwd = cwdOf(payload)
  const root = await repoRootOf(cwd, payload)
  if (payload.confirm !== true) throw badRequest('dropping all stashes requires confirm: true')
  await git(root, ['stash', 'clear'])
  return { cleared: true }
}

async function cherryPick(payload) {
  const cwd = cwdOf(payload)
  const root = await repoRootOf(cwd, payload)
  /* Batch form (multi-select): `hashes` are applied in the order given — the
     client sends them oldest-first so the sequence replays topologically. The
     single `hash` keeps working. */
  const hashes = Array.isArray(payload.hashes)
    ? payload.hashes.map((entry) => requireRef(entry, 'hash'))
    : [requireRef(payload.hash, 'hash')]
  const result = await runGit(root, ['cherry-pick', ...hashes])
  const combined = (result.stdout + '\n' + result.stderr).trim()
  const conflicted = /CONFLICT/.test(combined)
  if (result.code !== 0 && !conflicted) throw new PanelError('git-failed', combined === '' ? 'cherry-pick failed' : combined, 409)
  return { hash: hashes[0], hashes: hashes, conflicted: conflicted, output: combined }
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
  // A refspec (`main:main`) fast-forwards a NON-checked-out branch in place —
  // this is how "pull a branch that is not HEAD" works without switching to
  // it (git pull would merge into HEAD instead). git refuses a non-ff update
  // here, which is exactly the safety we want.
  if (typeof payload.branch === 'string' && payload.branch.trim() !== '') args.push(requireRef(payload.branch, 'refspec'))
  if (payload.all === true) args.push('--all')
  // prune/--tags serve the repo-wide fetch; a refspec fetch is deliberately
  // narrow and must not drag every tag over the wire.
  if (payload.branch === undefined && payload.prune !== false) args.push('--prune')
  if (payload.branch === undefined) args.push('--tags')
  const out = await git(root, args, { timeoutMs: NETWORK_TIMEOUT_MS })
  return { output: (out + '\n').trim() }
}

async function pull(payload) {
  const cwd = cwdOf(payload)
  const root = await repoRootOf(cwd, payload)
  /* Merge is the default (v0.24.0): --ff-only is safe but leaves a diverged
     branch permanently unpullable, which is the exact wall users hit. ff-only
     stays available when asked for explicitly. */
  const mode = payload.mode === 'ff-only' || payload.mode === 'rebase' || payload.mode === 'merge' ? payload.mode : 'merge'
  const args = ['pull']
  if (mode === 'ff-only') args.push('--ff-only')
  if (mode === 'rebase') args.push('--rebase')
  if (mode === 'merge') args.push('--no-rebase')
  if (typeof payload.remote === 'string' && payload.remote.trim() !== '') args.push(requireRef(payload.remote, 'remote'))
  if (typeof payload.branch === 'string' && payload.branch.trim() !== '') args.push(requireRef(payload.branch, 'branch'))
  let out
  try {
    out = await git(root, args, { timeoutMs: NETWORK_TIMEOUT_MS })
  } catch (error) {
    throw gitFailure('pull', error)
  }
  return { mode, output: out.trim() }
}

async function push(payload) {
  const cwd = cwdOf(payload)
  const root = await repoRootOf(cwd, payload)
  if (payload.confirm !== true) throw badRequest('push requires confirm: true')
  const args = ['push']
  if (payload.setUpstream === true) args.push('--set-upstream')
  if (payload.force === true) args.push('--force-with-lease')
  if (typeof payload.remote === 'string' && payload.remote.trim() !== '') args.push(requireRef(payload.remote, 'remote'))
  if (typeof payload.branch === 'string' && payload.branch.trim() !== '') args.push(requireRef(payload.branch, 'branch'))
  let out
  try {
    out = await git(root, args, { timeoutMs: NETWORK_TIMEOUT_MS })
  } catch (error) {
    throw gitFailure('push', error)
  }
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
  if (payload.staged === true) args.push('--staged')
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
  const sha = (await git(root, ['rev-parse', '--verify', ref])).trim()
  await git(root, ['stash', 'drop', ref])
  const undo = pushUndo(root, { kind: 'stash-drop', label: ref, hash: sha })
  return { ref, hash: sha, undo: undo }
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
  /* Batch form (multi-select): `names` wins; the single `name` keeps working. */
  const names = Array.isArray(payload.names)
    ? payload.names.map((entry) => requireRef(entry, 'name'))
    : [requireRef(payload.name, 'name')]
  await git(root, ['tag', '-d', ...names])
  return { tag: names[0], names: names }
}

/* VS Code's SCM title "Clone..." — clone a URL into an absolute local path.
   The PARENT of the target must exist; git creates the last component itself
   and refuses a non-empty one, which is the safety net for typos. It writes a
   brand-new tree (never touches an existing repository), but it does write the
   filesystem, so it rides the write queue like everything else that mutates. */
const CLONE_TIMEOUT_MS = 10 * 60 * 1000
function requireUrl(value, label) {
  if (typeof value !== 'string' || value.trim() === '') throw badRequest(label + ' is required')
  const text = value.trim()
  if (text.startsWith('-') === true || /[\s\u0000-\u001f]/.test(text) === true || text.length > 2048) {
    throw badRequest(label + ' is not a valid repository URL')
  }
  return text
}
async function clone(payload) {
  const url = requireUrl(payload.url, 'url')
  const dir = requireAbsolute(payload.dir, 'dir')
  await git(path.dirname(dir), ['clone', url, dir], { timeoutMs: CLONE_TIMEOUT_MS })
  return { dir }
}

export {

  stage, unstage, discard, commit, checkout, branchCreate, worktreeAdd, worktreeRemove,

  worktreePrune, branchUpstream, branchRename, branchDelete, merge, mergeAbort, rebase, rebaseAbort,

  remoteAdd, remoteRemove, branchDeleteRemote, tagDeleteRemote, pushTags, stashClear,

  cherryPick, revert, reset, fetch, pull, push, stashList, stashPush, stashApply,

  stashDrop, tagCreate, tagDelete, clone,

}
