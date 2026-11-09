/** dsh-ide-git host: read-only methods (status, log, detail, diff, compare). */

import path from 'node:path'

import { PanelError, badRequest, cwdOf, requireRef, requireRelativePath, clampInt } from './core.js'

import {

  git, runGit, repoRootOf, parseLog, LOG_FORMAT, decorate, parsePorcelain, classify, numstatOf,

  ignoredEntriesOf, stashCountOf, worktreesOf, currentBranchOf, upstreamOf,

  aheadBehindOf, originNameOf, sameDirectory, FIELD_SEP, RECORD_SEP,

  MAX_DIFF_CHARS, gitLog, GIT_LOG_MAX_ENTRIES,

} from './git.js'

import { operationOf } from './undo.js'



async function summary(payload) {
  const cwd = cwdOf(payload)
  const root = await repoRootOf(cwd, payload)
  /* Two-phase changes (issue #11): with `stats: false` the two `diff
     --numstat` passes — the most expensive step once a tree holds thousands
     of changes — are skipped, `statsDeferred: true` announces that the +/-
     numbers arrive through the `stats` method instead. The rows themselves
     are complete without them; nothing is truncated. */
  const deferStats = payload.stats === false
  /* The branch chain (branch → upstream → ahead/behind) is sequential by
     necessity; everything else is independent and runs concurrently, so a
     large `status` scan no longer serialises behind five cheap calls
     (issue #11: the sum of ~ten sequential commands became the max of two
     chains). */
  const [branchInfo, statusOut, unstagedStat, stagedStat, ignored, stashCount, worktrees, operation, head, originName] = await Promise.all([
    (async () => {
      const branch = await currentBranchOf(root)
      const detached = branch === 'HEAD'
      const upstream = detached ? null : await upstreamOf(root, branch)
      const tracking = upstream === null ? { ahead: 0, behind: 0 } : await aheadBehindOf(root, upstream, branch)
      return { branch, detached, upstream, tracking }
    })(),
    git(root, ['status', '--porcelain=v1', '-z', '--untracked-files=all']),
    deferStats ? Promise.resolve(new Map()) : numstatOf(root, []),
    deferStats ? Promise.resolve(new Map()) : numstatOf(root, ['--cached']),
    payload.ignored === true ? ignoredEntriesOf(root) : { entries: [], truncated: false },
    stashCountOf(root),
    worktreesOf(root),
    operationOf(root),
    /* HEAD hash (v0.18.7): lets the client's poll notice OUTSIDE commits and
       checkouts — the panel's own actions already refresh everything, but
       nothing else watches the repo. Empty string on an unborn branch. */
    git(root, ['rev-parse', 'HEAD']).then((out) => out.trim()).catch(() => ''),
    originNameOf(root),
  ])
  const groups = classify(parsePorcelain(statusOut))
  return {
    repoRoot: root,
    cwd,
    branch: branchInfo.branch,
    detached: branchInfo.detached,
    upstream: branchInfo.upstream,
    ahead: branchInfo.tracking.ahead,
    behind: branchInfo.tracking.behind,
    head: head,
    /* The repository's own name (v0.19.1): the origin URL's leaf, so a
       renamed clone still shows the real repo name, not the folder's. */
    origin: originName,
    changes: {
      staged: decorate(groups.staged, stagedStat),
      unstaged: decorate(groups.unstaged, unstagedStat),
      untracked: decorate(groups.untracked, new Map()),
      conflicted: decorate(groups.conflicted, new Map()),
      ignored: ignored.entries,
      ignoredTruncated: ignored.truncated,
    },
    statsDeferred: deferStats === true,
    stashCount: stashCount,
    worktrees: worktrees,
    operation: operation,
  }
}

/* The second phase of the two-phase changes (issue #11): the two numstat
   passes, concurrent, packed as [path, additions, deletions, binary] rows so
   they survive JSON. Paths are post-rename paths — exactly what `summary`
   decorates its entries with. Read-only: deliberately not in WRITE_METHODS. */
async function stats(payload) {
  const root = await repoRootOf(cwdOf(payload), payload)
  const [unstaged, staged] = await Promise.all([
    numstatOf(root, []),
    numstatOf(root, ['--cached']),
  ])
  const pack = (map) => {
    const rows = []
    for (const [path, stat] of map) rows.push([path, stat.additions, stat.deletions, stat.binary === true])
    return rows
  }
  return { unstaged: pack(unstaged), staged: pack(staged) }
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
    if (tree.branch === null || tree.branch === '') continue
    // `git worktree list` includes the checkout this repository lives in, so
    // without this the CURRENT branch was flagged as occupied by its own working
    // tree (reported on v0.3.11: main showed the marker while checked out here).
    // Only a SECOND working tree holding a branch blocks checking it out here.
    if (sameDirectory(tree.path, root)) continue
    busy.set(tree.branch, tree.path)
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
    else if (parts[0].startsWith('refs/remotes/')) {
      /* "<remote>/HEAD" is the symbolic pointer at a remote's default branch —
         its %(refname:short) collapses to the BARE remote name, so it is not a
         branch anyone can check out. It never becomes a row (the stray
         "<remote>" entry used to pollute the remote tree and, grouped, it also
         defeated the tree's single-remote prefix strip). */
      if (/^refs\/remotes\/[^/]+\/HEAD$/.test(parts[0]) === false) remote.push(entry)
    }
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
  /* History scope (issue #25). `allBranches` is a boolean switch, never a
     caller-supplied ref list: --branches + --remotes is the union of every
     local and remote tip, so commits that only exist on an unrelated or
     ahead branch become visible instead of staying inside that branch's
     own log. A named rev still wins when it is the only thing provided. */
  if (payload.allBranches === true) args.push('--branches', '--remotes')
  else if (typeof payload.rev === 'string' && payload.rev.trim() !== '') args.push(requireRef(payload.rev, 'rev'))
  if (typeof payload.path === 'string' && payload.path.trim() !== '') args.push('--', payload.path)
  const out = await git(root, args)
  const all = parseLog(out)
  const hasMore = all.length > limit
  return { repoRoot: root, commits: hasMore ? all.slice(0, limit) : all, hasMore, skip, limit }
}
/* The merge that carried `from` INTO `to`, newest first — the anchor the
   branch tree's double-click-to-browse lands on (IDEA-style: double-click
   branch 2, then branch 1, and 1's list opens scrolled to the merge commit
   where 2 was merged in, so "2 has been merged here" is visible at a
   glance even though 1 kept moving. No merge relationship -> null, and the
   caller just opens the list at the top. Pure rev arithmetic, no network. */
/* Who am I here: git config resolves user.name/email through its usual
   cascade (repo-local overrides global), so the answer is per repository.
   The client caches it per repo root for the whole panel lifetime — a git
   identity rarely changes mid-session — and pins it to the top of the
   author filter (v0.19.3), even when this branch has no commits by me:
   picking it and seeing an empty list IS the answer ("I never committed
   here"). Empty strings mean no identity is configured. */
async function me(payload) {
  const cwd = cwdOf(payload)
  const root = await repoRootOf(cwd, payload)
  const name = await runGit(root, ['config', 'user.name'])
  const email = await runGit(root, ['config', 'user.email'])
  return {
    repoRoot: root,
    name: name.code === 0 ? name.stdout.trim() : '',
    email: email.code === 0 ? email.stdout.trim() : '',
  }
}

async function mergePoint(payload) {
  const cwd = cwdOf(payload)
  const root = await repoRootOf(cwd, payload)
  const from = requireRef(payload.from, 'from')
  const to = requireRef(payload.to, 'to')
  const out = await git(root, ['rev-list', '--merges', '--ancestry-path', '--max-count=1', from + '..' + to])
  const hash = out.trim().split('\n')[0] || ''
  return { repoRoot: root, hash: hash === '' ? null : hash }
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
  /* Untracked files have no index entry, so plain `git diff [--cached] -- path`
     is legitimately empty for them — the panel's change list still shows the
     file and the preview must not go blank. `--no-index /dev/null <file>`
     produces the honest "new file" patch; its exit code is 1 when differences
     exist, which is data, not failure (only >1 rejects). */
  if (payload.untracked === true) {
    const rel = requireRelativePath(payload.path)
    const absolute = path.isAbsolute(rel) ? rel : path.join(root, rel)
    /* --no-index reads the file for real, so unlike the plain `git diff --`
       form an absolute path must NOT be allowed to escape the repository. */
    if (absolute !== root && !absolute.startsWith(root + path.sep)) throw badRequest('path must stay inside the repository')
    /* git quotes and C-escapes backslash paths inside the diff header (and
       git ≥2.55 spells the a/ side with the real path instead of /dev/null);
       passing forward slashes keeps the header unquoted, so the rewrite below
       can match it verbatim. POSIX is a no-op. */
    const headerPath = absolute.split(path.sep).join('/')
    const result = await runGit(root, ['diff', '--no-color', '--no-ext-diff', '-U3', '--no-index', '--', '/dev/null', headerPath])
    if (result.code !== 0 && result.code !== 1) {
      const detail = result.stderr.trim() === '' ? result.stdout.trim() : result.stderr.trim()
      throw new PanelError('git-failed', 'git diff --no-index failed: ' + (detail === '' ? 'exit ' + result.code : detail), 409)
    }
    /* --no-index spells the b/ side with the absolute path we passed; rewrite
       the header lines back to the repository-relative spelling so the preview
       reads like every other patch (body lines are left untouched). */
    let out = result.stdout
    if (out.indexOf(headerPath) >= 0 && out.indexOf('\n') !== -1) {
      out = out.split('\n').map((line) => {
        if (line.startsWith('diff --git ') && line.indexOf(headerPath) >= 0) return 'diff --git a/' + rel + ' b/' + rel
        /* git ≥2.55 quotes the header and spells the a/ side with the real
           path instead of /dev/null, so match on the path, not the prefix. */
        if (line.startsWith('+++ ') && line.indexOf(headerPath) >= 0) return '+++ b/' + rel
        return line
      }).join('\n')
    }
    const truncated = out.length > MAX_DIFF_CHARS
    return { patch: truncated ? out.slice(0, MAX_DIFF_CHARS) : out, truncated }
  }
  const args = ['diff', '--no-color', '--no-ext-diff', '-U3']
  if (payload.staged === true) args.push('--cached')
  if (typeof payload.hash === 'string' && payload.hash.trim() !== '') {
    args.length = 0
    /* Merge commits carry no patch by default (`git show` prints only the
       header), which made the diff pane blank for them. `-m --first-parent`
       asks for the diff against the first parent and is a no-op on the usual
       single-parent commit. This matches commitDetail() below (issue #32). */
    args.push('show', '-m', '--first-parent', '--no-color', '--no-ext-diff', '-U3', '--format=', requireRef(payload.hash, 'hash'))
  }
  if (typeof payload.path === 'string' && payload.path.trim() !== '') args.push('--', requireRelativePath(payload.path))
  const out = await git(root, args)
  const truncated = out.length > MAX_DIFF_CHARS
  return { patch: truncated ? out.slice(0, MAX_DIFF_CHARS) : out, truncated }
}

/* The tail of the git run ring buffer (see runGit). Read-only, global. */
async function gitLogs() {
  return { entries: gitLog.slice(-GIT_LOG_MAX_ENTRIES) }
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

export { summary, stats, branches, log, me, mergePoint, commitDetail, diff, gitLogs, compare }
