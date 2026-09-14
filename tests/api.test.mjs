/**
 * dsh-ide-git — API integration test.
 *
 * Drives the real host-half route against a throwaway git repository created in
 * the OS temp dir: parses (porcelain -z / numstat -z / log record format),
 * mutations (stage / unstage / commit / branch / tag), and every guard
 * (confirm, ref injection, path escape, method lookup, trust fence).
 */
import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync, readFileSync, mkdirSync, rmSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { execFileSync } from 'node:child_process'
import { EventEmitter } from 'node:events'
import { apply } from '../src/index.js'

let repo = ''
let route = null

const git = (...args) => execFileSync('git', args, { cwd: repo, encoding: 'utf8' })

function call(method, payload, headers) {
  return new Promise((resolve, reject) => {
    const req = new EventEmitter()
    req.method = 'POST'
    req.url = '/dsh-ide-git/api/' + method
    req.headers = Object.assign({ host: '127.0.0.1:3080', 'content-type': 'application/json' }, headers)
    req.destroy = () => {}
    const res = {
      statusCode: 0,
      writeHead(status) { this.statusCode = status },
      end(text) {
        try { resolve({ status: this.statusCode, body: JSON.parse(text) }) } catch (error) { reject(error) }
      },
    }
    void route.handler(req, res)
    req.emit('data', Buffer.from(JSON.stringify(payload === undefined ? {} : payload)))
    req.emit('end')
  })
}

before(() => {
  const ctx = {
    effect: (fn) => fn(),
    webServer: { register: (spec) => { route = spec; return () => {} } },
  }
  apply(ctx)
  assert.equal(route.kind, 'prefix')
  assert.equal(route.path, '/dsh-ide-git/api')

  repo = mkdtempSync(join(tmpdir(), 'dsh-ide-git-api-'))
  git('init', '-q', '-b', 'main')
  git('config', 'user.name', 'Check')
  git('config', 'user.email', 'check@example.com')
  writeFileSync(join(repo, 'a.txt'), 'one\n')
  git('add', '-A')
  git('commit', '-q', '-m', 'first')
  writeFileSync(join(repo, 'a.txt'), 'one\ntwo\n')
  mkdirSync(join(repo, 'sub'))
  writeFileSync(join(repo, 'sub', 'b.txt'), 'bee\n')
  git('add', '-A')
  git('commit', '-q', '-m', 'second\n\nbody line')
  git('tag', 'v1')
  git('checkout', '-q', '-b', 'feature')
  writeFileSync(join(repo, 'c.txt'), 'see\n')
  git('add', '-A')
  git('commit', '-q', '-m', 'third on feature')
  git('checkout', '-q', 'main')
  writeFileSync(join(repo, 'a.txt'), 'one\ntwo\nthree\n')
  writeFileSync(join(repo, 'untracked.txt'), 'new\n')
  writeFileSync(join(repo, 'staged.txt'), 'staged\n')
  git('add', 'staged.txt')
})

after(() => {
  if (repo !== '') rmSync(repo, { recursive: true, force: true })
})

test('summary classifies staged / unstaged / untracked with diffstats', async () => {
  const { status, body } = await call('summary', { cwd: repo })
  assert.equal(status, 200)
  assert.equal(body.ok, true)
  assert.equal(body.data.branch, 'main')
  assert.equal(body.data.detached, false)
  assert.deepEqual(body.data.changes.staged.map((file) => file.path), ['staged.txt'])
  const unstaged = body.data.changes.unstaged.map((file) => file.path)
  assert.deepEqual(unstaged, ['a.txt'])
  assert.equal(body.data.changes.unstaged[0].additions, 1)
  assert.deepEqual(body.data.changes.untracked.map((file) => file.path), ['untracked.txt'])
  assert.ok(Array.isArray(body.data.worktrees))
  assert.equal(body.data.worktrees.length, 1)
})

test('branches reports locals, remotes, tags and HEAD', async () => {
  const { body } = await call('branches', { cwd: repo })
  const names = body.data.local.map((entry) => entry.name)
  assert.ok(names.includes('main'))
  assert.ok(names.includes('feature'))
  const head = body.data.local.filter((entry) => entry.head === true)
  assert.equal(head.length, 1)
  assert.equal(head[0].name, 'main')
  assert.deepEqual(body.data.tags.map((tag) => tag.name), ['v1'])
  assert.ok(Array.isArray(body.data.remotes))
})

test('log parses hash, parents and paginates', async () => {
  const first = await call('log', { cwd: repo, limit: 1 })
  assert.equal(first.body.data.commits.length, 1)
  assert.equal(first.body.data.hasMore, true)
  const head = first.body.data.commits[0]
  assert.equal(head.parents.length, 1)
  assert.match(head.hash, /^[0-9a-f]{40}$/)
  assert.ok(head.refs.some((ref) => ref.includes('HEAD')))
  const rest = await call('log', { cwd: repo, limit: 10, rev: 'v1' })
  assert.equal(rest.body.data.commits[0].subject, 'second')
  assert.equal(rest.body.data.hasMore, false)
})

test('commitDetail returns body and per-file numstat', async () => {
  // v1 is tagged on the second commit — a stable anchor that earlier tests
  // (which add commits) cannot move.
  const hash = git('rev-parse', 'v1').trim()
  const { body } = await call('commitDetail', { cwd: repo, hash })
  assert.equal(body.data.subject, 'second')
  assert.equal(body.data.body.trim(), 'body line')
  const paths = body.data.files.map((file) => file.path)
  assert.ok(paths.includes('sub/b.txt'))
})

test('diff returns a unified patch and rejects escaping paths', async () => {
  const ok = await call('diff', { cwd: repo, path: 'a.txt' })
  assert.match(ok.body.data.patch, /\+three/)
  const escaped = await call('diff', { cwd: repo, path: '../../etc/passwd' })
  assert.equal(escaped.body.ok, false)
  assert.equal(escaped.body.error.code, 'bad-request')
})

test('stage, unstage and commit move files through the index', async () => {
  const staged = await call('stage', { cwd: repo, paths: ['a.txt'] })
  assert.equal(staged.body.ok, true)
  const after = await call('summary', { cwd: repo })
  assert.deepEqual(after.body.data.changes.staged.map((file) => file.path).sort(), ['a.txt', 'staged.txt'])
  const unstaged = await call('unstage', { cwd: repo, paths: ['a.txt'] })
  assert.equal(unstaged.body.ok, true)
  const committed = await call('commit', { cwd: repo, message: 'check commit' })
  assert.equal(committed.body.ok, true)
  assert.match(committed.body.data.output, /check commit/)
})

test('branch and tag lifecycle works and compare reports the delta', async () => {
  const created = await call('checkout', { cwd: repo, branch: 'tmp-check', create: true })
  assert.equal(created.body.data.created, true)
  const back = await call('checkout', { cwd: repo, branch: 'main' })
  assert.equal(back.body.data.branch, 'main')
  const renamed = await call('branchRename', { cwd: repo, from: 'tmp-check', to: 'tmp-renamed' })
  assert.equal(renamed.body.data.to, 'tmp-renamed')
  const deleted = await call('branchDelete', { cwd: repo, name: 'tmp-renamed' })
  assert.equal(deleted.body.data.force, false)
  const hash = git('rev-parse', 'HEAD~1').trim()
  await call('tagCreate', { cwd: repo, name: 'v2', hash })
  assert.ok((await call('branches', { cwd: repo })).body.data.tags.some((tag) => tag.name === 'v2'))
  await call('tagDelete', { cwd: repo, name: 'v2' })
  const compared = await call('compare', { cwd: repo, base: 'main', head: 'feature' })
  assert.deepEqual(compared.body.data.files.map((file) => file.path), ['c.txt'])
  assert.equal(compared.body.data.commits.length, 1)
})

test('stash push / list / apply / drop round-trips', async () => {
  writeFileSync(join(repo, 'a.txt'), 'one\ntwo\nthree\nfour\n')
  const pushed = await call('stashPush', { cwd: repo, message: 'api-check' })
  assert.equal(pushed.body.ok, true)
  const listed = await call('stashList', { cwd: repo })
  assert.equal(listed.body.data.stashes.length, 1)
  assert.match(listed.body.data.stashes[0].subject, /api-check/)
  const applied = await call('stashApply', { cwd: repo, ref: 'stash@{0}' })
  assert.equal(applied.body.ok, true)
  const dropped = await call('stashDrop', { cwd: repo, ref: 'stash@{0}', confirm: true })
  assert.equal(dropped.body.ok, true)
  assert.equal((await call('stashList', { cwd: repo })).body.data.stashes.length, 0)
})

test('destructive methods refuse without confirm', async () => {
  assert.equal((await call('push', { cwd: repo })).body.error.message, 'push requires confirm: true')
  assert.equal((await call('reset', { cwd: repo, hash: 'HEAD', mode: 'hard' })).body.error.message, 'hard reset requires confirm: true')
  assert.equal((await call('branchDelete', { cwd: repo, name: 'feature', force: true })).body.error.message, 'force delete requires confirm: true')
  assert.equal((await call('stashDrop', { cwd: repo, ref: 'stash@{0}' })).body.error.message, 'dropping a stash requires confirm: true')
})

test('argument validation blocks ref injection', async () => {
  const injected = await call('checkout', { cwd: repo, branch: '--force' })
  assert.equal(injected.body.error.code, 'bad-request')
  const relative = await call('summary', { cwd: 'relative/path' })
  assert.equal(relative.body.error.message, 'cwd must be an absolute path')
  const unknown = await call('nope', { cwd: repo })
  assert.equal(unknown.status, 404)
  assert.equal(unknown.body.error.code, 'not-found')
})

test('trust fence refuses cross-site requests and accepts same-origin remote hosts', async () => {
  const hostile = await call('summary', { cwd: repo }, { host: 'evil.example.com', 'sec-fetch-site': 'cross-site' })
  assert.equal(hostile.status, 403)
  assert.equal(hostile.body.error.code, 'forbidden')
  const remote = await call('summary', { cwd: repo }, { host: 'remote.example.com', 'sec-fetch-site': 'same-origin' })
  assert.equal(remote.body.ok, true)
  const noHost = await call('summary', { cwd: repo }, { host: '' })
  assert.equal(noHost.status, 403)
})

test('branch delete is reversible through the undo stack', async () => {
  git('branch', 'doomed', 'HEAD')
  const head = git('rev-parse', 'doomed').trim()
  const removed = await call('branchDelete', { cwd: repo, name: 'doomed' })
  assert.equal(removed.status, 200)
  assert.equal(removed.body.data.hash, head)
  assert.ok(removed.body.data.undo !== undefined, 'a delete must hand back an undo handle')
  assert.equal(git('branch', '--list', 'doomed').trim(), '')
  const listed = await call('undoList', { cwd: repo })
  assert.ok(listed.body.data.items.some((entry) => entry.id === removed.body.data.undo.id))
  const undone = await call('undoApply', { cwd: repo, id: removed.body.data.undo.id })
  assert.equal(undone.status, 200)
  assert.equal(undone.body.data.kind, 'branch-delete')
  assert.equal(git('rev-parse', 'doomed').trim(), head)
  // One-shot: the same handle cannot be replayed.
  const again = await call('undoApply', { cwd: repo, id: removed.body.data.undo.id })
  assert.equal(again.status, 409)
  assert.equal(again.body.error.code, 'undo-gone')
  git('branch', '-q', '-D', 'doomed')
})

test('undo refuses when the branch name is taken again', async () => {
  git('branch', 'redo', 'HEAD')
  const removed = await call('branchDelete', { cwd: repo, name: 'redo' })
  git('branch', 'redo', 'HEAD')
  const conflict = await call('undoApply', { cwd: repo, id: removed.body.data.undo.id })
  assert.equal(conflict.status, 409)
  assert.equal(conflict.body.error.code, 'undo-conflict')
  git('branch', '-q', '-D', 'redo')
})

test('the checked-out branch and protected branches are guarded', async () => {
  const current = await call('branchDelete', { cwd: repo, name: 'main', confirm: true })
  assert.equal(current.status, 409)
  assert.equal(current.body.error.code, 'protected-branch')
  git('branch', 'master', 'HEAD')
  const guarded = await call('branchDelete', { cwd: repo, name: 'master' })
  assert.equal(guarded.status, 400)
  assert.match(guarded.body.error.message, /requires confirm: true/)
  const allowed = await call('branchDelete', { cwd: repo, name: 'master', confirm: true })
  assert.equal(allowed.status, 200)
})

test('discard refuses to target the repository root', async () => {
  writeFileSync(join(repo, 'keep-me.txt'), 'x\n')
  const refused = await call('discard', { cwd: repo, paths: ['.'], untracked: true, confirm: true })
  assert.equal(refused.status, 400)
  assert.equal(refused.body.error.message, 'paths is required')
  assert.ok(existsSync(join(repo, 'keep-me.txt')), 'a refused discard must not delete anything')
  rmSync(join(repo, 'keep-me.txt'), { force: true })
})

test('summary reports an in-progress git operation', async () => {
  assert.equal((await call('summary', { cwd: repo })).body.data.operation, null)
  const marker = join(repo, '.git', 'MERGE_HEAD')
  writeFileSync(marker, git('rev-parse', 'HEAD'))
  assert.equal((await call('summary', { cwd: repo })).body.data.operation, 'merge')
  rmSync(marker, { force: true })
  assert.equal((await call('summary', { cwd: repo })).body.data.operation, null)
})

test('a dropped stash can be restored from the undo stack', async () => {
  writeFileSync(join(repo, 'a.txt'), 'one\ntwo\nthree\nfour\nfive\n')
  await call('stashPush', { cwd: repo, message: 'undo-check' })
  assert.equal((await call('stashList', { cwd: repo })).body.data.stashes.length, 1)
  const dropped = await call('stashDrop', { cwd: repo, ref: 'stash@{0}', confirm: true })
  assert.equal(dropped.status, 200)
  assert.ok(dropped.body.data.undo !== undefined)
  assert.equal((await call('stashList', { cwd: repo })).body.data.stashes.length, 0)
  const undone = await call('undoApply', { cwd: repo, id: dropped.body.data.undo.id })
  assert.equal(undone.status, 200)
  assert.equal((await call('stashList', { cwd: repo })).body.data.stashes.length, 1)
  git('stash', 'clear')
})

test('discarding a tracked file hands back an undo that puts the bytes back', async () => {
  const target = join(repo, 'undo-discard.txt')
  writeFileSync(target, 'committed\n')
  git('add', 'undo-discard.txt')
  git('commit', '-q', '-m', 'add undo-discard')
  writeFileSync(target, 'dirty edit\n')
  const discarded = await call('discard', { cwd: repo, paths: ['undo-discard.txt'] })
  assert.equal(discarded.status, 200)
  assert.equal(readFileSync(target, 'utf8'), 'committed\n')
  assert.ok(discarded.body.data.undo !== undefined, 'a discard must hand back an undo handle')
  const undone = await call('undoApply', { cwd: repo, id: discarded.body.data.undo.id })
  assert.equal(undone.status, 200)
  assert.equal(undone.body.data.kind, 'discard')
  assert.equal(readFileSync(target, 'utf8'), 'dirty edit\n')
  // One-shot, exactly like the delete handles.
  const again = await call('undoApply', { cwd: repo, id: discarded.body.data.undo.id })
  assert.equal(again.status, 409)
  assert.equal(again.body.error.code, 'undo-gone')
})

test('discarding an untracked file can be undone too', async () => {
  const target = join(repo, 'untracked-note.txt')
  writeFileSync(target, 'scratch\n')
  const discarded = await call('discard', { cwd: repo, paths: ['untracked-note.txt'], untracked: true, confirm: true })
  assert.equal(discarded.status, 200)
  assert.equal(existsSync(target), false, 'clean really deletes the file')
  assert.ok(discarded.body.data.undo !== undefined)
  const undone = await call('undoApply', { cwd: repo, id: discarded.body.data.undo.id })
  assert.equal(undone.status, 200)
  assert.equal(readFileSync(target, 'utf8'), 'scratch\n')
  rmSync(target, { force: true })
})

test('a file deleted in the working tree is undone back to absent', async () => {
  const target = join(repo, 'gone.txt')
  writeFileSync(target, 'committed\n')
  git('add', 'gone.txt')
  git('commit', '-q', '-m', 'add gone')
  rmSync(target)
  const discarded = await call('discard', { cwd: repo, paths: ['gone.txt'] })
  assert.equal(discarded.status, 200)
  assert.equal(existsSync(target), true, 'checkout brings the committed file back')
  const undone = await call('undoApply', { cwd: repo, id: discarded.body.data.undo.id })
  assert.equal(undone.status, 200)
  assert.equal(existsSync(target), false, 'undoing restores the deletion, not the file')
})

test('the discard undo refuses once the file changed again', async () => {
  const target = join(repo, 'undo-conflict.txt')
  writeFileSync(target, 'first\n')
  git('add', 'undo-conflict.txt')
  git('commit', '-q', '-m', 'add undo-conflict')
  writeFileSync(target, 'second\n')
  const discarded = await call('discard', { cwd: repo, paths: ['undo-conflict.txt'] })
  assert.equal(discarded.status, 200)
  // The user typed something new after the discard: writing the old bytes back
  // would silently destroy it, so the undo has to refuse.
  writeFileSync(target, 'third\n')
  const conflict = await call('undoApply', { cwd: repo, id: discarded.body.data.undo.id })
  assert.equal(conflict.status, 409)
  assert.equal(conflict.body.error.code, 'undo-conflict')
  assert.equal(readFileSync(target, 'utf8'), 'third\n')
})

test('a discard too large to snapshot still happens, just without an undo handle', async () => {
  const target = join(repo, 'huge-untracked.bin')
  writeFileSync(target, Buffer.alloc(5 * 1024 * 1024, 7))
  const discarded = await call('discard', { cwd: repo, paths: ['huge-untracked.bin'], untracked: true, confirm: true })
  assert.equal(discarded.status, 200)
  assert.equal(existsSync(target), false)
  // No handle is better than a handle that would fail later: the panel says so.
  assert.equal(discarded.body.data.undo, undefined)
  assert.equal(discarded.body.data.undoBlocked, true)
})
