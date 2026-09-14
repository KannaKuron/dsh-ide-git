/**
 * dsh-ide-git — client half (plain JavaScript, no build step).
 *
 * Registers ONE dsh-better-sidebar tab: an IDE-style Git tool window.
 *
 * Two surfaces, one registration (better-sidebar 0.19.x): the DSH NATIVE right
 * sidebar (narrow, tall) and the plugin's bottom workbench (wide, flat). The
 * panel never asks which one it is in — it measures its container and picks a
 * chrome:
 *
 *   columns  wide and tall enough : repo/branch bar | tree | graph | changes
 *   stack    narrow and tall      : changes over graph, collapsible tree
 *   compact  short or very narrow : one header row + a Changes/History switch
 *
 * Theming: no hard-coded surfaces. Every surface is a --dsw-alias-* token, so
 * transparent themes and background plugins (dsh-any-background) show through,
 * exactly like better-sidebar's own panels do.
 */
window.__ModuleLoader__.load({
  id: 'dsh-ide-git',
  factory: (require) => {
    const React = require('react')
    const E = React.createElement
    const useState = React.useState
    const useEffect = React.useEffect
    const useMemo = React.useMemo
    const useRef = React.useRef
    const useCallback = React.useCallback
    const useLayoutEffect = React.useLayoutEffect

    const API_BASE = '/dsh-ide-git/api'
    const TAB_ID = 'dsh-ide-git:panel'
    const LANE_WIDTH = 14
    const LANE_COLORS = ['#4d6bfe', '#e2a03f', '#3fb950', '#d2679b', '#59b0d6', '#b083f0', '#d2694a', '#8a9aa8']
    const AUTO_REFRESH_MS = 12000
    const REPO_KEY = 'dsh-ide-git.repo.v1'
    const COMPACT_MAX_HEIGHT = 200
    const COMPACT_MAX_WIDTH = 400

    /* ============================== i18n ============================== */

    const ZH = {
      'title': 'Git',
      'description': 'IDE 级 Git 面板:分支树 / 提交图谱 / 变更与提交',
      'repo.label': '仓库',
      'repo.workspace': '工作区',
      'repo.nested': '子仓库',
      'repo.none': '当前工作区不是 Git 仓库',
      'repo.pick': '选择要查看的仓库',
      'repo.empty': '这个工作区下没有找到 Git 仓库',
      'repo.switch': '切换仓库',
      'branch.switch': '切换分支',
      'seg.changes': '变更 {n}',
      'seg.history': '历史',
      'branches.local': '本地',
      'branches.remote': '远程',
      'branches.tags': '标签',
      'branches.head': 'HEAD(当前分支)',
      'branches.favorites': '收藏',
      'action.stash': '贮藏',
      'action.favorite': '收藏/取消收藏当前分支',
      'action.newTagHere': '在当前提交新建标签...',
      'stash.push': '贮藏当前更改',
      'stash.apply': '应用最近贮藏',
      'stash.drop': '删除最近贮藏',
      'stash.count': '共 {n} 条贮藏',
      'note.noChanges': '没有可显示的变更',
      'note.noBranches': '没有其他分支',
      'branches.filter': '分支或标签',
      'changes.title': '变更',
      'changes.staged': '已暂存',
      'changes.unstaged': '更改',
      'changes.untracked': '未跟踪',
      'changes.conflicted': '冲突',
      'changes.empty': '没有未提交的变更',
      'changes.commitPlaceholder': '提交信息(Ctrl+Enter 提交)',
      'changes.commit': '提交',
      'changes.amend': '修补',
      'changes.stageAll': '全部暂存',
      'changes.unstageAll': '全部取消暂存',
      'action.stage': '暂存',
      'action.unstage': '取消暂存',
      'action.discard': '丢弃更改',
      'action.showDiff': '显示差异',
      'action.copyPath': '复制路径',
      'action.checkout': '签出',
      'action.newBranchFrom': '从该分支新建分支...',
      'action.newBranchHere': '在此新建分支...',
      'action.rename': '重命名...',
      'action.delete': '删除',
      'action.mergeIntoCurrent': '合并到当前分支',
      'action.rebaseCurrentOnto': '将当前分支变基到此',
      'action.compare': '与当前分支比较',
      'action.update': '更新(Fetch)',
      'action.push': '推送',
      'action.newTag': '新建标签...',
      'action.cherryPick': '优选(Cherry-Pick)',
      'action.revert': '还原提交',
      'action.resetSoft': '重置到此(保留更改)',
      'action.resetHard': '重置到此(丢弃更改)',
      'action.copyHash': '复制修订号',
      'action.details': '提交详情',
      'history.empty': '这个仓库还没有提交',
      'history.loadMore': '加载更多',
      'history.filter': '文本或哈希',
      'detail.files': '变更文件',
      'detail.back': '返回历史',
      'detail.noFiles': '没有文件变更',
      'diff.empty': '没有可显示的文本差异',
      'diff.binary': '二进制文件',
      'diff.loading': '正在加载差异...',
      'toolbar.refresh': '刷新',
      'toolbar.newBranch': '新建分支',
      'toolbar.fetch': '抓取(Fetch)',
      'toolbar.pull': '拉取(Pull)',
      'toolbar.push': '推送(Push)',
      'toolbar.tree': '分支栏',
      'rail.more': '更多操作',
      'rail.settings': '动作条设置',
      'rail.settingsHint': '拖动或用箭头调整顺序,眼睛图标控制显示',
      'rail.reset': '恢复默认',
      'rail.up': '上移',
      'rail.down': '下移',
      'rail.show': '显示',
      'rail.hide': '隐藏',
      'action.unavailable': '当前状态不可用',
      'filter.branch': '分支',
      'filter.user': '用户',
      'filter.date': '日期',
      'filter.path': '路径',
      'filter.all': '全部',
      'filter.today': '今天',
      'filter.week': '最近 7 天',
      'filter.month': '最近 30 天',
      'filter.year': '今年',
      'filter.pathPlaceholder': '过滤路径(回车应用)',
      'filter.sortDesc': '新→旧',
      'filter.sortAsc': '旧→新',
      'filter.clear': '清除筛选',
      'filter.none': '没有匹配的提交',
      'confirm.title': '确认操作',
      'confirm.cancel': '取消',
      'confirm.ok': '确定',
      'prompt.newBranch': '新分支名(将创建并签出)',
      'prompt.renameBranch': '重命名分支',
      'prompt.newTag': '新标签名',
      'prompt.fromHead': '当前 HEAD',
      'error.dismiss': '关闭',
      'status.loading': '正在读取...',
      'status.busy': '处理中...',
      'counts.staged': '已暂存 {n}',
      'counts.unstaged': '更改 {n}',
      'counts.untracked': '未跟踪 {n}',
      'counts.conflicted': '冲突 {n}',
      'push.confirm': '将 {branch} 推送到 {upstream}?',
      'delete.confirm': '删除分支 {name}?该操作不可撤销。',
      'discard.confirm': '丢弃 {path} 的更改?该操作不可撤销。',
      'resetHard.confirm': '硬重置到 {hash}?未提交的更改会丢失。',
      'resetSoft.confirm': '将 HEAD 重置到 {hash}(保留工作区更改)?',
      'checkoutCommit.confirm': '签出提交 {hash}?(分离头指针)',
    }

    const EN = {
      'title': 'Git',
      'description': 'IDE-grade Git panel: branch tree / commit graph / changes',
      'repo.label': 'Repository',
      'repo.workspace': 'workspace',
      'repo.nested': 'nested',
      'repo.none': 'This workspace is not a Git repository',
      'repo.pick': 'Pick a repository to inspect',
      'repo.empty': 'No Git repository found in this workspace',
      'repo.switch': 'Switch repository',
      'branch.switch': 'Switch branch',
      'seg.changes': 'Changes {n}',
      'seg.history': 'History',
      'branches.local': 'Local',
      'branches.remote': 'Remote',
      'branches.tags': 'Tags',
      'branches.head': 'HEAD (current branch)',
      'branches.favorites': 'Favorites',
      'action.stash': 'Stash',
      'action.favorite': 'Favorite / unfavorite current branch',
      'action.newTagHere': 'New tag on current commit...',
      'stash.push': 'Stash current changes',
      'stash.apply': 'Apply latest stash',
      'stash.drop': 'Drop latest stash',
      'stash.count': '{n} stash entries',
      'note.noChanges': 'No pending changes',
      'note.noBranches': 'No other branches',
      'branches.filter': 'Branch or tag',
      'changes.title': 'Changes',
      'changes.staged': 'Staged',
      'changes.unstaged': 'Changes',
      'changes.untracked': 'Untracked',
      'changes.conflicted': 'Conflicts',
      'changes.empty': 'No pending changes',
      'changes.commitPlaceholder': 'Commit message (Ctrl+Enter)',
      'changes.commit': 'Commit',
      'changes.amend': 'Amend',
      'changes.stageAll': 'Stage all',
      'changes.unstageAll': 'Unstage all',
      'action.stage': 'Stage',
      'action.unstage': 'Unstage',
      'action.discard': 'Discard changes',
      'action.showDiff': 'Show diff',
      'action.copyPath': 'Copy path',
      'action.checkout': 'Checkout',
      'action.newBranchFrom': 'New branch from here...',
      'action.newBranchHere': 'New branch here...',
      'action.rename': 'Rename...',
      'action.delete': 'Delete',
      'action.mergeIntoCurrent': 'Merge into current branch',
      'action.rebaseCurrentOnto': 'Rebase current branch onto this',
      'action.compare': 'Compare with current branch',
      'action.update': 'Update (fetch)',
      'action.push': 'Push',
      'action.newTag': 'New tag...',
      'action.cherryPick': 'Cherry-pick',
      'action.revert': 'Revert commit',
      'action.resetSoft': 'Reset here (keep changes)',
      'action.resetHard': 'Reset here (discard changes)',
      'action.copyHash': 'Copy revision number',
      'action.details': 'Commit details',
      'history.empty': 'This repository has no commits yet',
      'history.loadMore': 'Load more',
      'history.filter': 'Text or hash',
      'detail.files': 'Changed files',
      'detail.back': 'Back to history',
      'detail.noFiles': 'No file changes',
      'diff.empty': 'No textual diff to show',
      'diff.binary': 'Binary file',
      'diff.loading': 'Loading diff...',
      'toolbar.refresh': 'Refresh',
      'toolbar.newBranch': 'New branch',
      'toolbar.fetch': 'Fetch',
      'toolbar.pull': 'Pull',
      'toolbar.push': 'Push',
      'toolbar.tree': 'Branch pane',
      'rail.more': 'More actions',
      'rail.settings': 'Action bar settings',
      'rail.settingsHint': 'Drag or use the arrows to reorder; the eye toggles visibility',
      'rail.reset': 'Restore defaults',
      'rail.up': 'Move up',
      'rail.down': 'Move down',
      'rail.show': 'Show',
      'rail.hide': 'Hide',
      'action.unavailable': 'Not available in the current state',
      'filter.branch': 'Branch',
      'filter.user': 'User',
      'filter.date': 'Date',
      'filter.path': 'Path',
      'filter.all': 'All',
      'filter.today': 'Today',
      'filter.week': 'Last 7 days',
      'filter.month': 'Last 30 days',
      'filter.year': 'This year',
      'filter.pathPlaceholder': 'Filter by path (Enter)',
      'filter.sortDesc': 'Newest first',
      'filter.sortAsc': 'Oldest first',
      'filter.clear': 'Clear filters',
      'filter.none': 'No matching commits',
      'confirm.title': 'Confirm',
      'confirm.cancel': 'Cancel',
      'confirm.ok': 'OK',
      'prompt.newBranch': 'New branch name (created and checked out)',
      'prompt.renameBranch': 'Rename branch',
      'prompt.newTag': 'New tag name',
      'prompt.fromHead': 'current HEAD',
      'error.dismiss': 'Dismiss',
      'status.loading': 'Reading...',
      'status.busy': 'Working...',
      'counts.staged': 'Staged {n}',
      'counts.unstaged': 'Changes {n}',
      'counts.untracked': 'Untracked {n}',
      'counts.conflicted': 'Conflicts {n}',
      'push.confirm': 'Push {branch} to {upstream}?',
      'delete.confirm': 'Delete branch {name}? This cannot be undone.',
      'discard.confirm': 'Discard changes in {path}? This cannot be undone.',
      'resetHard.confirm': 'Hard reset to {hash}? Uncommitted changes are lost.',
      'resetSoft.confirm': 'Move HEAD to {hash} (working tree kept)?',
      'checkoutCommit.confirm': 'Check out commit {hash}? (detached HEAD)',
    }

    function dictionaryOf(ctx) {
      let active = ''
      try {
        const locale = ctx.get('locale')
        if (locale !== undefined && typeof locale.getSnapshot === 'function') {
          const snapshot = locale.getSnapshot()
          if (snapshot !== null && typeof snapshot === 'object' && typeof snapshot.active === 'string') active = snapshot.active
        }
      } catch (error) { void error }
      if (active === '' && typeof navigator === 'object' && navigator !== null && typeof navigator.language === 'string') active = navigator.language
      return active.toLowerCase().indexOf('zh') === 0 ? ZH : EN
    }

    function fill(template, values) {
      return template.replace(/\{(\w+)\}/g, (match, key) => {
        const value = values[key]
        return value === undefined ? match : String(value)
      })
    }

    /* ============================== api ============================== */

    async function request(method, payload) {
      const response = await fetch(API_BASE + '/' + method, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload === undefined ? {} : payload),
      })
      let body = null
      try { body = await response.json() } catch (error) { void error }
      if (body === null || typeof body !== 'object') throw new Error('HTTP ' + response.status)
      if (body.ok !== true) {
        const error = body.error === undefined || body.error === null ? {} : body.error
        const failure = new Error(typeof error.message === 'string' && error.message !== '' ? error.message : 'HTTP ' + response.status)
        failure.code = typeof error.code === 'string' ? error.code : 'unknown'
        throw failure
      }
      return body.data
    }

    /* ============================== storage ============================== */

    function readRememberedRepo(sessionId) {
      try {
        const raw = window.localStorage.getItem(REPO_KEY)
        if (raw === null || raw === '') return undefined
        const parsed = JSON.parse(raw)
        if (parsed === null || typeof parsed !== 'object') return undefined
        const value = parsed[sessionId]
        return typeof value === 'string' && value !== '' ? value : undefined
      } catch (error) { void error }
      return undefined
    }

    function rememberRepo(sessionId, repoPath) {
      try {
        const raw = window.localStorage.getItem(REPO_KEY)
        const parsed = raw === null || raw === '' ? {} : JSON.parse(raw)
        const next = parsed !== null && typeof parsed === 'object' ? parsed : {}
        next[sessionId] = repoPath
        window.localStorage.setItem(REPO_KEY, JSON.stringify(next))
      } catch (error) { void error }
    }

    const FAV_KEY = 'dsh-ide-git.favorites.v1'

    function readFavorites(repoPath) {
      try {
        const raw = window.localStorage.getItem(FAV_KEY)
        if (raw === null || raw === '') return []
        const parsed = JSON.parse(raw)
        if (parsed === null || typeof parsed !== 'object') return []
        const list = parsed[repoPath]
        return Array.isArray(list) ? list.filter((entry) => typeof entry === 'string') : []
      } catch (error) { void error }
      return []
    }

    function toggleFavorite(repoPath, branch) {
      const current = readFavorites(repoPath)
      const next = current.indexOf(branch) >= 0 ? current.filter((entry) => entry !== branch) : current.concat([branch])
      try {
        const raw = window.localStorage.getItem(FAV_KEY)
        const parsed = raw === null || raw === '' ? {} : JSON.parse(raw)
        const all = parsed !== null && typeof parsed === 'object' ? parsed : {}
        all[repoPath] = next
        window.localStorage.setItem(FAV_KEY, JSON.stringify(all))
      } catch (error) { void error }
      return next
    }

    const RAIL_KEY = 'dsh-ide-git.rail.v1'

    /* The action rail is user-composed. RAIL_SPECS is the canonical set AND the
       default order; a stored config only holds a permutation plus the ids the
       user hid, and normalizeRail() drops unknown ids and appends missing ones —
       so a version that adds an action never breaks a stored config. */
    const RAIL_SPECS = [
      { id: 'refresh', icon: 'refresh', key: 'toolbar.refresh', tone: 'accent' },
      { id: 'newBranch', icon: 'plus', key: 'toolbar.newBranch', tone: 'success' },
      { id: 'checkout', icon: 'checkout', key: 'action.checkout', tone: 'accent' },
      { id: 'delete', icon: 'trash', key: 'action.delete', tone: 'danger' },
      { id: 'compare', icon: 'compare', key: 'action.compare', tone: 'violet' },
      { id: 'diff', icon: 'file', key: 'action.showDiff', tone: 'secondary' },
      { id: 'stash', icon: 'stash', key: 'action.stash', tone: 'cyan' },
      { id: 'tag', icon: 'tag', key: 'action.newTagHere', tone: 'warn' },
      { id: 'favorite', icon: 'star', key: 'action.favorite', tone: 'warn' },
      { id: 'fetch', icon: 'fetch', key: 'toolbar.fetch', tone: 'cyan' },
      { id: 'pull', icon: 'pull', key: 'toolbar.pull', tone: 'accent' },
      { id: 'push', icon: 'push', key: 'toolbar.push', tone: 'success' },
    ]
    const RAIL_IDS = RAIL_SPECS.map((spec) => spec.id)

    function normalizeRail(raw) {
      const source = raw !== null && typeof raw === 'object' ? raw : {}
      const order = []
      const storedOrder = Array.isArray(source.order) ? source.order : []
      for (const id of storedOrder) {
        if (typeof id === 'string' && RAIL_IDS.indexOf(id) >= 0 && order.indexOf(id) < 0) order.push(id)
      }
      for (const id of RAIL_IDS) { if (order.indexOf(id) < 0) order.push(id) }
      const hidden = []
      const storedHidden = Array.isArray(source.hidden) ? source.hidden : []
      for (const id of storedHidden) {
        if (typeof id === 'string' && RAIL_IDS.indexOf(id) >= 0 && hidden.indexOf(id) < 0) hidden.push(id)
      }
      return { order, hidden }
    }

    function readRailConfig() {
      try {
        const raw = window.localStorage.getItem(RAIL_KEY)
        if (raw === null || raw === '') return normalizeRail(null)
        return normalizeRail(JSON.parse(raw))
      } catch (error) { void error }
      return normalizeRail(null)
    }

    function writeRailConfig(config) {
      try { window.localStorage.setItem(RAIL_KEY, JSON.stringify(config)) } catch (error) { void error }
    }

    /* ============================== formatting ============================== */

    function relativeTime(iso) {
      if (typeof iso !== 'string' || iso === '') return ''
      const then = Date.parse(iso)
      if (!Number.isFinite(then)) return ''
      const seconds = Math.max(0, Math.round((Date.now() - then) / 1000))
      if (seconds < 60) return seconds + 's'
      const minutes = Math.round(seconds / 60)
      if (minutes < 60) return minutes + 'm'
      const hours = Math.round(minutes / 60)
      if (hours < 24) return hours + 'h'
      const days = Math.round(hours / 24)
      if (days < 30) return days + 'd'
      const months = Math.round(days / 30)
      if (months < 12) return months + 'mo'
      return Math.round(months / 12) + 'y'
    }

    function shortDate(iso) {
      if (typeof iso !== 'string' || iso === '') return ''
      const at = new Date(iso)
      if (Number.isNaN(at.getTime())) return ''
      const pad = (value) => (value < 10 ? '0' + value : String(value))
      return at.getFullYear() + '/' + pad(at.getMonth() + 1) + '/' + pad(at.getDate()) + ' ' + pad(at.getHours()) + ':' + pad(at.getMinutes())
    }

    function baseName(filePath) {
      if (typeof filePath !== 'string') return ''
      const parts = filePath.split('/')
      return parts[parts.length - 1]
    }

    function dirName(filePath) {
      if (typeof filePath !== 'string') return ''
      const index = filePath.lastIndexOf('/')
      return index < 0 ? '' : filePath.slice(0, index)
    }

    /* ============================== commit graph ============================== */

    function buildRows(commits) {
      const lanes = []
      const rows = []
      for (const commit of commits) {
        const before = lanes.slice()
        let lane = lanes.indexOf(commit.hash)
        if (lane === -1) {
          lane = lanes.indexOf(null)
          if (lane === -1) { lanes.push(null); lane = lanes.length - 1 }
        }
        const parents = Array.isArray(commit.parents) ? commit.parents : []
        const parentLanes = []
        lanes[lane] = parents.length > 0 ? parents[0] : null
        for (let index = 1; index < parents.length; index += 1) {
          let slot = lanes.indexOf(parents[index])
          if (slot === -1) {
            slot = lanes.indexOf(null)
            if (slot === -1) { lanes.push(parents[index]); slot = lanes.length - 1 }
            else lanes[slot] = parents[index]
          }
          parentLanes.push(slot)
        }
        rows.push({ commit, lane, parentLanes, before: before, after: lanes.slice(), width: 1 })
      }
      let laneCount = 1
      for (const row of rows) laneCount = Math.max(laneCount, row.before.length, row.after.length)
      for (const row of rows) row.width = laneCount
      return rows
    }

    /* One SVG per row, but the geometry is chosen so that rows stack into ONE
       continuous graph: a lane segment always covers the full row box (0..height)
       whenever the lane exists above and below, and only rounds off to the row
       centre where the lane genuinely starts (a branch tip) or ends (a root).
       v0.1.7 started every non-own lane at 0 and every own lane at height/2, which
       left a visible gap between two consecutive commits on the same lane. */
    function GraphCell(props) {
      const row = props.row
      const height = props.height
      const width = Math.max(1, row.width) * LANE_WIDTH + 8
      const middle = height / 2
      const children = []
      const x = (lane) => 8 + lane * LANE_WIDTH
      const color = (lane) => LANE_COLORS[lane % LANE_COLORS.length]
      const depth = Math.max(row.before.length, row.after.length)
      for (let lane = 0; lane < depth; lane += 1) {
        const above = lane < row.before.length ? row.before[lane] : null
        const below = lane < row.after.length ? row.after[lane] : null
        const hasTop = above !== null && above !== undefined
        const hasBottom = below !== null && below !== undefined
        if (hasTop === false && hasBottom === false) continue
        const y1 = hasTop ? 0 : middle
        const y2 = hasBottom ? height : middle
        if (y1 === y2) continue
        children.push(E('line', {
          key: 'lane-' + lane,
          x1: x(lane), y1: y1, x2: x(lane), y2: y2,
          stroke: color(lane), strokeWidth: 2, strokeLinecap: 'round',
        }))
      }
      for (const parentLane of row.parentLanes) {
        if (parentLane === row.lane) continue
        children.push(E('path', {
          key: 'edge-' + parentLane,
          d: 'M ' + x(row.lane) + ' ' + middle + ' C ' + x(row.lane) + ' ' + height + ', ' + x(parentLane) + ' ' + middle + ', ' + x(parentLane) + ' ' + height,
          fill: 'none',
          stroke: color(parentLane),
          strokeWidth: 2,
          strokeLinecap: 'round',
        }))
      }
      const isHead = Array.isArray(row.commit.refs) && row.commit.refs.some((ref) => String(ref).indexOf('HEAD') >= 0)
      children.push(isHead
        ? E('circle', { key: 'dot', cx: x(row.lane), cy: middle, r: 3.8, fill: 'none', stroke: color(row.lane), strokeWidth: 2 })
        : E('circle', { key: 'dot', cx: x(row.lane), cy: middle, r: 3.6, fill: color(row.lane) }))
      return E('svg', { className: 'dig-graph', width: width, height: height, viewBox: '0 0 ' + width + ' ' + height }, children)
    }

    /* ============================== diff ============================== */

    function diffLines(patch) {
      const text = typeof patch === 'string' ? patch : ''
      if (text.trim() === '') return []
      const raw = text.split('\n')
      const out = []
      let oldLine = 0
      let newLine = 0
      for (const line of raw) {
        let kind = 'ctx'
        if (line.indexOf('diff --git') === 0 || line.indexOf('index ') === 0 || line.indexOf('--- ') === 0 || line.indexOf('+++ ') === 0 || line.indexOf('new file') === 0 || line.indexOf('deleted file') === 0 || line.indexOf('similarity index') === 0 || line.indexOf('rename ') === 0) {
          kind = 'meta'
        } else if (line.indexOf('@@') === 0) {
          kind = 'hunk'
          const match = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/.exec(line)
          if (match !== null) { oldLine = Number.parseInt(match[1], 10); newLine = Number.parseInt(match[2], 10) }
        } else if (line.indexOf('+') === 0) { kind = 'add'; newLine += 1 }
        else if (line.indexOf('-') === 0) { kind = 'del'; oldLine += 1 }
        else if (line.indexOf('\\') === 0) { kind = 'meta' }
        else { oldLine += 1; newLine += 1 }
        out.push({
          kind, text: line,
          oldLine: kind === 'add' || kind === 'meta' || kind === 'hunk' ? null : oldLine,
          newLine: kind === 'del' || kind === 'meta' || kind === 'hunk' ? null : newLine,
        })
      }
      return out
    }

    function DiffBody(props) {
      const rows = useMemo(() => diffLines(props.patch), [props.patch])
      if (props.loading === true) return E('div', { className: 'dig-empty' }, props.t('diff.loading'))
      if (props.binary === true) return E('div', { className: 'dig-empty' }, props.t('diff.binary'))
      if (rows.length === 0) return E('div', { className: 'dig-empty' }, props.t('diff.empty'))
      return E('div', { className: 'dig-diff' }, rows.map((row, index) => E('div', { key: index, className: 'dig-diff-line dig-diff-' + row.kind },
        E('span', { className: 'dig-diff-gutter' }, row.oldLine === null ? '' : String(row.oldLine)),
        E('span', { className: 'dig-diff-gutter' }, row.newLine === null ? '' : String(row.newLine)),
        E('span', { className: 'dig-diff-text' }, row.text === '' ? ' ' : row.text),
      )))
    }

    /* ============================== ui kit ============================== */

    const ICONS = {
      branch: ['M4 3.5a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3Z', 'M12 3.5a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3Z', 'M4 6.5v3a3 3 0 0 0 3 3h2', 'M12 6.5v1a3 3 0 0 1-3 3'],
      commit: ['M8 5.5a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5Z', 'M8 1.5v4', 'M8 10.5v4'],
      refresh: ['M13 8a5 5 0 1 1-1.6-3.7', 'M13 3v3h-3'],
      fetch: ['M8 2v8', 'M4.5 6.5 8 10l3.5-3.5', 'M3 13h10'],
      pull: ['M8 13V5', 'M4.5 8.5 8 5l3.5 3.5', 'M3 3h10'],
      push: ['M8 2v8', 'M4.5 5.5 8 2l3.5 3.5', 'M3 13h10'],
      plus: ['M8 3v10', 'M3 8h10'],
      minus: ['M3 8h10'],
      undo: ['M5 6H2V3', 'M2.5 6.5a5.5 5.5 0 1 1 1.8 5'],
      chevron: ['M5 6.5 8 9.5l3-3'],
      close: ['M4 4l8 8', 'M12 4l-8 8'],
      star: ['M8 2.2l1.8 3.8 4 .5-2.9 2.7.8 4-3.7-2.1-3.7 2.1.8-4L2.2 6.5l4-.5z'],
      folder: ['M2 4.5h4l1.2 1.5H14v6.5H2z'],
      file: ['M4 2h5l3 3v9H4z', 'M9 2v3h3'],
      trash: ['M3 5h10', 'M6.5 5V3.5h3V5', 'M4.5 5l.6 8.5h5.8L11.5 5', 'M6.8 7v4', 'M9.2 7v4'],
      checkout: ['M3 8h7', 'M7.5 5.5 10 8l-2.5 2.5', 'M13 3.5v9'],
      compare: ['M4 4h7', 'M4 12h7', 'M6.5 1.5 4 4l2.5 2.5', 'M9.5 9.5 12 12l-2.5 2.5'],
      stash: ['M2.5 3.5h11V6h-11z', 'M3.5 6v6.5h9V6', 'M6.5 8.5h3'],
      tag: ['M2.5 7.5 7.5 2.5h6v6l-5 5z', 'M10.5 5.5h.01'],
      settings: ['M8 6.4a1.6 1.6 0 1 0 0 3.2 1.6 1.6 0 0 0 0-3.2Z', 'M8 1.8v1.5', 'M8 12.7v1.5', 'M1.8 8h1.5', 'M12.7 8h1.5', 'M3.6 3.6l1.1 1.1', 'M11.3 11.3l1.1 1.1', 'M12.4 3.6l-1.1 1.1', 'M4.7 11.3l-1.1 1.1'],
      more: ['M3.6 8h0.01', 'M8 8h0.01', 'M12.4 8h0.01'],
      eye: ['M1.5 8S4.1 3.8 8 3.8 14.5 8 14.5 8 11.9 12.2 8 12.2 1.5 8 1.5 8Z', 'M8 6.5a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3Z'],
      eyeOff: ['M1.6 8S4.2 4 8 4c1 0 1.9.2 2.7.6', 'M13 5.6c.9 1.1 1.5 2.4 1.5 2.4S11.9 12 8 12c-.9 0-1.7-.2-2.4-.5', 'M2.6 2.6l10.8 10.8'],
      up: ['M8 12.6V3.6', 'M4.6 7 8 3.6 11.4 7'],
      down: ['M8 3.4v9', 'M4.6 9 8 12.4 11.4 9'],
      grip: ['M5.6 4.6h4.8', 'M5.6 8h4.8', 'M5.6 11.4h4.8'],
      filter: ['M2 3.6h12l-4.6 5.2v4.2l-2.8-1.4V8.8z'],
    }

    function Icon(props) {
      const size = props.size === undefined ? 14 : props.size
      const shape = ICONS[props.name] === undefined ? ICONS.commit : ICONS[props.name]
      const weight = props.name === 'more' ? 2.6 : props.name === 'grip' ? 1.6 : 1.4
      return E('svg', {
        className: 'dig-icon', width: size, height: size, viewBox: '0 0 16 16',
        fill: 'none', stroke: 'currentColor', strokeWidth: weight,
        strokeLinecap: 'round', strokeLinejoin: 'round',
      }, shape.map((d, index) => E('path', { key: index, d: d })))
    }

    /* Menus are laid out INSIDE the panel on purpose: dsh-better-sidebar's bottom
       workbench declares contain: layout style, and layout containment makes that
       element the containing block for position:fixed descendants. A viewport-
       anchored menu inside a 300px-tall panel is therefore laid out against the
       panel with viewport coordinates, lands outside it and looks exactly like
       'right click does nothing'. Anchors become panel-relative offsets clamped to
       the panel box, and the menu scrolls when it is taller than the room left. */
    function ContextMenu(props) {
      const ref = useRef(null)
      const closeRef = useRef(props.onClose)
      const [position, setPosition] = useState({ left: props.anchor.x, top: props.anchor.y })
      useEffect(() => { closeRef.current = props.onClose })
      // Layout effect: the clamp below runs before the browser paints, so the menu
      // never flashes at its raw (possibly out-of-panel) anchor position.
      useLayoutEffect(() => {
        const element = ref.current
        if (element === null) return
        const rect = element.getBoundingClientRect()
        const width = props.boundsWidth === undefined ? 0 : props.boundsWidth
        const height = props.boundsHeight === undefined ? 0 : props.boundsHeight
        let left = props.anchor.x
        let top = props.anchor.y
        if (width > 0) left = Math.max(4, Math.min(left, width - rect.width - 4))
        if (height > 0 && top + rect.height > height - 4) top = Math.max(4, top - rect.height)
        setPosition({ left: left, top: top })
      }, [props.anchor.x, props.anchor.y, props.boundsWidth, props.boundsHeight])
      useEffect(() => {
        const onDown = (event) => {
          if (ref.current !== null && ref.current.contains(event.target)) return
          closeRef.current()
        }
        const onKey = (event) => { if (event.key === 'Escape') closeRef.current() }
        const timer = setTimeout(() => document.addEventListener('mousedown', onDown, true), 0)
        document.addEventListener('keydown', onKey)
        return () => {
          clearTimeout(timer)
          document.removeEventListener('mousedown', onDown, true)
          document.removeEventListener('keydown', onKey)
        }
      }, [])
      return E('div', { className: 'dig-menu', ref: ref, style: { left: position.left + 'px', top: position.top + 'px' } },
        props.items.map((item, index) => (item === null
          ? E('div', { key: 'sep-' + index, className: 'dig-menu-sep' })
          : E('button', {
              key: item.id + '-' + index,
              type: 'button',
              title: item.disabled === true && item.reason !== undefined ? item.reason : '',
              className: 'dig-menu-item'
                + (item.danger === true ? ' dig-menu-danger' : '')
                + (item.disabled === true ? ' dig-menu-disabled' : '')
                + (item.active === true ? ' dig-menu-item-active' : ''),
              disabled: item.disabled === true,
              onClick: (event) => { closeRef.current(); item.run(event) },
            },
            item.icon === undefined ? null : E('span', { className: 'dig-menu-icon dig-tone-' + (item.tone === undefined ? 'secondary' : item.tone) }, E(Icon, { name: item.icon, size: 13 })),
            E('span', { className: 'dig-menu-label' }, item.label)))))
    }

    /* Lets the user choose which actions the rail shows and in which order. The
       list is drag-sortable and arrow-sortable (the arrows also work with a
       keyboard); visibility is a per-action toggle, not a delete, so a hidden
       action keeps its position. */
    function RailSettings(props) {
      const t = props.t
      const [dragId, setDragId] = useState(null)
      return E('div', {
        className: 'dig-overlay',
        onMouseDown: (event) => { if (event.target === event.currentTarget) props.onClose() },
      },
        E('div', { className: 'dig-dialog dig-dialog-wide' },
          E('div', { className: 'dig-dialog-title' }, t('rail.settings')),
          E('div', { className: 'dig-dialog-text' }, t('rail.settingsHint')),
          E('div', { className: 'dig-rail-list' },
            props.items.map((item, index) => E('div', {
              key: item.id,
              className: 'dig-rail-item'
                + (item.hidden === true ? ' dig-rail-item-off' : '')
                + (dragId === item.id ? ' dig-rail-item-drag' : ''),
              draggable: true,
              onDragStart: (event) => {
                setDragId(item.id)
                if (event.dataTransfer !== undefined && event.dataTransfer !== null) {
                  event.dataTransfer.effectAllowed = 'move'
                  try { event.dataTransfer.setData('text/plain', item.id) } catch (error) { void error }
                }
              },
              onDragEnd: () => setDragId(null),
              onDragOver: (event) => { event.preventDefault() },
              onDrop: (event) => { event.preventDefault(); props.onDrop(dragId, item.id); setDragId(null) },
            },
              E('span', { className: 'dig-rail-grip' }, E(Icon, { name: 'grip', size: 12 })),
              E('span', { className: 'dig-rail-item-icon dig-tone-' + item.tone }, E(Icon, { name: item.icon, size: 13 })),
              E('span', { className: 'dig-rail-item-label' }, item.label),
              E('button', {
                type: 'button', className: 'dig-icon-btn dig-icon-btn-small', title: t('rail.up'),
                disabled: index === 0, onClick: () => props.onMove(item.id, -1),
              }, E(Icon, { name: 'up', size: 12 })),
              E('button', {
                type: 'button', className: 'dig-icon-btn dig-icon-btn-small', title: t('rail.down'),
                disabled: index === props.items.length - 1, onClick: () => props.onMove(item.id, 1),
              }, E(Icon, { name: 'down', size: 12 })),
              E('button', {
                type: 'button',
                className: 'dig-icon-btn dig-icon-btn-small' + (item.hidden === true ? '' : ' dig-icon-btn-active'),
                title: item.hidden === true ? t('rail.show') : t('rail.hide'),
                onClick: () => props.onToggle(item.id),
              }, E(Icon, { name: item.hidden === true ? 'eyeOff' : 'eye', size: 13 }))))),
          E('div', { className: 'dig-dialog-actions' },
            E('button', { type: 'button', className: 'dig-btn', onClick: props.onReset }, t('rail.reset')),
            E('button', { type: 'button', className: 'dig-btn dig-btn-primary', onClick: props.onClose }, t('confirm.ok')))))
    }

    function PromptDialog(props) {
      const [value, setValue] = useState(props.initialValue === undefined ? '' : props.initialValue)
      const ref = useRef(null)
      useEffect(() => { if (ref.current !== null) ref.current.focus() }, [])
      const submit = () => { if (value.trim() !== '') props.onSubmit(value.trim()) }
      return E('div', { className: 'dig-overlay' },
        E('div', { className: 'dig-dialog' },
          E('div', { className: 'dig-dialog-title' }, props.title),
          E('input', {
            ref: ref, className: 'dig-input', value: value, spellCheck: false,
            placeholder: props.placeholder === undefined ? '' : props.placeholder,
            onChange: (event) => setValue(event.target.value),
            onKeyDown: (event) => {
              if (event.key === 'Enter') { event.preventDefault(); submit() }
              if (event.key === 'Escape') { event.preventDefault(); props.onCancel() }
            },
          }),
          E('div', { className: 'dig-dialog-actions' },
            E('button', { type: 'button', className: 'dig-btn', onClick: props.onCancel }, props.cancelLabel),
            E('button', { type: 'button', className: 'dig-btn dig-btn-primary', onClick: submit }, props.okLabel))))
    }

    function ConfirmDialog(props) {
      return E('div', { className: 'dig-overlay' },
        E('div', { className: 'dig-dialog' },
          E('div', { className: 'dig-dialog-title' }, props.title),
          E('div', { className: 'dig-dialog-text' }, props.text),
          E('div', { className: 'dig-dialog-actions' },
            E('button', { type: 'button', className: 'dig-btn', onClick: props.onCancel }, props.cancelLabel),
            E('button', { type: 'button', className: 'dig-btn dig-btn-danger', onClick: props.onConfirm }, props.okLabel))))
    }

    function Segmented(props) {
      return E('div', { className: 'dig-seg' },
        props.items.map((item) => E('button', {
          key: item.id,
          type: 'button',
          className: 'dig-seg-item',
          'data-active': props.value === item.id ? 'true' : 'false',
          onClick: () => props.onChange(item.id),
        }, item.label)))
    }

    function RepoSelect(props) {
      const t = props.t
      if (props.repos.length <= 1) {
        const only = props.repos.length === 1 ? props.repos[0] : null
        return E('span', { className: 'dig-repo-static', title: only === null ? '' : only.path },
          E(Icon, { name: 'folder', size: 12 }),
          E('span', { className: 'dig-repo-name' }, only === null ? t('repo.empty') : only.name))
      }
      return E('span', { className: 'dig-select-wrap', title: t('repo.switch') },
        E(Icon, { name: 'folder', size: 12 }),
        E('select', {
          className: 'dig-select dig-select-repo',
          value: props.value === null ? '' : props.value,
          onChange: (event) => props.onChange(event.target.value),
        }, props.repos.map((repo) => E('option', { key: repo.path, value: repo.path },
          repo.name + (repo.branch === null || repo.branch === undefined ? '' : ' · ' + repo.branch)))))
    }

    function RepoPicker(props) {
      const t = props.t
      const repos = props.repos
      return E('div', { className: 'dig-picker' },
        E('div', { className: 'dig-picker-title' }, repos.length === 0 ? t('repo.empty') : t('repo.pick')),
        E('div', { className: 'dig-picker-sub' }, props.cwd),
        repos.map((repo) => E('button', {
          key: repo.path,
          type: 'button',
          className: 'dig-picker-row',
          onClick: () => props.onPick(repo.path),
        },
          E('span', { className: 'dig-picker-icon' }, E(Icon, { name: 'folder', size: 13 })),
          E('span', { className: 'dig-picker-name' }, repo.name),
          repo.branch === null || repo.branch === undefined ? null : E('span', { className: 'dig-badge' }, repo.branch),
          E('span', { className: 'dig-picker-kind' }, repo.kind === 'workspace' ? t('repo.workspace') : t('repo.nested')),
          E('span', { className: 'dig-picker-path' }, repo.path))))
    }

    /* ============================== branch tree ============================== */

    function BranchRow(props) {
      const entry = props.entry
      const isHead = entry.head === true
      const kind = entry.tag === true ? 'tag' : entry.remote === true ? 'remote' : isHead ? 'head' : 'local'
      const tone = kind === 'tag' ? 'warn' : kind === 'remote' ? 'violet' : kind === 'head' ? 'success' : 'accent'
      const glyph = kind === 'tag' ? 'tag' : kind === 'remote' ? 'fetch' : kind === 'head' ? 'star' : 'branch'
      return E('div', {
        className: 'dig-row dig-row-' + kind,
        title: entry.upstream === null || entry.upstream === undefined ? entry.name : entry.name + ' → ' + entry.upstream,
        onClick: () => props.onCheckout(entry),
        onContextMenu: (event) => { event.preventDefault(); props.onMenu(event, entry) },
      },
        E('span', { className: 'dig-row-icon dig-tone-' + tone }, E(Icon, { name: glyph, size: 12 })),
        E('span', { className: 'dig-row-label' }, entry.name),
        entry.worktree === null || entry.worktree === undefined ? null : E('span', { className: 'dig-badge dig-badge-muted', title: entry.worktree }, 'W'),
        entry.ahead > 0 ? E('span', { className: 'dig-badge' }, '↑' + entry.ahead) : null,
        entry.behind > 0 ? E('span', { className: 'dig-badge' }, '↓' + entry.behind) : null)
    }

    function BranchTree(props) {
      const t = props.t
      const [filter, setFilter] = useState('')
      const [collapsed, setCollapsed] = useState({ favorites: false, remote: false, tags: true })
      const branches = props.branches
      const needle = filter.trim().toLowerCase()
      const match = (name) => needle === '' || String(name).toLowerCase().indexOf(needle) >= 0
      const locals = (branches === null ? [] : branches.local).filter((entry) => match(entry.name))
      const remotes = (branches === null ? [] : branches.remote).filter((entry) => match(entry.name))
      const tags = (branches === null ? [] : branches.tags).filter((entry) => match(entry.name))
      const favorites = Array.isArray(props.favorites) ? props.favorites : []
      const section = (key, title, entries, decorate) => E('div', { className: 'dig-section', key: key },
        E('button', {
          type: 'button', className: 'dig-section-head',
          onClick: () => setCollapsed((previous) => Object.assign({}, previous, { [key]: !previous[key] })),
        },
          E('span', { className: 'dig-chevron' + (collapsed[key] === true ? '' : ' dig-chevron-open') }, E(Icon, { name: 'chevron', size: 12 })),
          E('span', null, title),
          E('span', { className: 'dig-count' }, String(entries.length))),
        collapsed[key] === true ? null : E('div', { className: 'dig-section-body' },
          entries.map((entry) => E(BranchRow, {
            key: entry.name, entry: decorate(entry), onCheckout: props.onCheckout, onMenu: props.onBranchMenu,
          }))))
      return E('div', { className: 'dig-tree' },
        E('div', { className: 'dig-search' },
          E('input', {
            className: 'dig-input dig-input-compact', value: filter, spellCheck: false,
            placeholder: t('branches.filter'),
            onChange: (event) => setFilter(event.target.value),
          })),
        E('div', { className: 'dig-tree-scroll' },
          E('div', { className: 'dig-section-head dig-section-head-static' }, t('branches.head')),
          favorites.length === 0 ? null : section('favorites', t('branches.favorites'), locals.filter((entry) => favorites.indexOf(entry.name) >= 0), (entry) => entry),
          section('local', t('branches.local'), locals, (entry) => entry),
          section('remote', t('branches.remote'), remotes, (entry) => Object.assign({}, entry, { remote: true })),
          section('tags', t('branches.tags'), tags, (entry) => Object.assign({}, entry, { tag: true }))))
    }

    /* ============================== changes ============================== */

    function ChangeRow(props) {
      const t = props.t
      const item = props.item
      const raw = item.index === '?' ? '?' : (item.index + item.worktree).trim()
      const status = raw === '' ? 'M' : raw.charAt(0)
      return E('div', {
        className: 'dig-row dig-row-file',
        title: item.origPath === undefined ? item.path : item.origPath + ' → ' + item.path,
        onClick: () => props.onDiff(item, props.group),
        onContextMenu: (event) => { event.preventDefault(); props.onMenu(event, item, props.group) },
      },
        E('span', { className: 'dig-file-status dig-file-status-' + (status === '?' ? 'U' : status) }, status),
        E('span', { className: 'dig-row-label' }, baseName(item.path)),
        E('span', { className: 'dig-row-sub dig-row-dir' }, dirName(item.path)),
        item.additions > 0 ? E('span', { className: 'dig-stat-add' }, '+' + item.additions) : null,
        item.deletions > 0 ? E('span', { className: 'dig-stat-del' }, '-' + item.deletions) : null,
        props.group === 'staged'
          ? E('button', { type: 'button', className: 'dig-mini', title: t('action.unstage'), onClick: (event) => { event.stopPropagation(); props.onUnstage(item) } }, E(Icon, { name: 'minus', size: 12 }))
          : E('button', { type: 'button', className: 'dig-mini', title: t('action.stage'), onClick: (event) => { event.stopPropagation(); props.onStage(item) } }, E(Icon, { name: 'plus', size: 12 })),
        E('button', { type: 'button', className: 'dig-mini', title: t('action.discard'), onClick: (event) => { event.stopPropagation(); props.onDiscard(item, props.group) } }, E(Icon, { name: 'undo', size: 12 })))
    }

    function ChangesPanel(props) {
      const t = props.t
      const summary = props.summary
      const [message, setMessage] = useState('')
      const [amend, setAmend] = useState(false)
      const [collapsed, setCollapsed] = useState(false)
      const changes = summary === null ? null : summary.changes
      const conflicted = changes === null ? [] : changes.conflicted
      const staged = changes === null ? [] : changes.staged
      const unstaged = changes === null ? [] : changes.unstaged
      const untracked = changes === null ? [] : changes.untracked
      const total = conflicted.length + staged.length + unstaged.length + untracked.length
      const submit = () => {
        if (message.trim() === '' || props.busy === true) return
        props.onCommit(message, amend)
        setMessage('')
        setAmend(false)
      }
      const group = (key, title, entries) => entries.length === 0 ? null : E('div', { className: 'dig-group', key: key },
        E('div', { className: 'dig-group-head' },
          E('span', null, title),
          key === 'staged' ? E('button', { type: 'button', className: 'dig-link', onClick: () => props.onUnstageAll() }, t('changes.unstageAll')) : null,
          key === 'unstaged' || key === 'untracked' ? E('button', { type: 'button', className: 'dig-link', onClick: () => props.onStageAll(entries) }, t('changes.stageAll')) : null),
        entries.map((item) => E(ChangeRow, {
          key: key + ':' + item.path, item: item, group: key, t: t,
          onStage: props.onStage, onUnstage: props.onUnstage, onDiscard: props.onDiscard, onDiff: props.onDiff, onMenu: props.onChangeMenu,
        })))
      const composer = props.compact === true
        ? E('div', { className: 'dig-commit-box dig-commit-box-compact' },
            E('input', {
              className: 'dig-input dig-input-compact', value: message, spellCheck: false,
              placeholder: t('changes.commitPlaceholder'),
              onChange: (event) => setMessage(event.target.value),
              onKeyDown: (event) => {
                if (event.key === 'Enter') { event.preventDefault(); submit() }
              },
            }),
            E('button', {
              type: 'button', className: 'dig-btn dig-btn-primary dig-btn-small',
              disabled: message.trim() === '' || props.busy === true,
              onClick: submit,
            }, t('changes.commit')))
        : E('div', { className: 'dig-commit-box' },
            E('textarea', {
              className: 'dig-textarea', value: message, spellCheck: false,
              placeholder: t('changes.commitPlaceholder'),
              onChange: (event) => setMessage(event.target.value),
              onKeyDown: (event) => {
                if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) { event.preventDefault(); submit() }
              },
            }),
            E('div', { className: 'dig-commit-actions' },
              E('label', { className: 'dig-check' },
                E('input', { type: 'checkbox', checked: amend, onChange: (event) => setAmend(event.target.checked) }),
                E('span', null, t('changes.amend'))),
              E('button', {
                type: 'button', className: 'dig-btn dig-btn-primary',
                disabled: message.trim() === '' || props.busy === true,
                onClick: submit,
              }, t('changes.commit'))))
      const showBody = props.hideHeader === true || collapsed === false
      return E('div', { className: 'dig-changes' },
        props.hideHeader === true ? null : E('button', {
          type: 'button', className: 'dig-section-head',
          onClick: () => setCollapsed((value) => !value),
        },
          E('span', { className: 'dig-chevron' + (collapsed ? '' : ' dig-chevron-open') }, E(Icon, { name: 'chevron', size: 12 })),
          E('span', null, t('changes.title')),
          E('span', { className: 'dig-count' }, String(total))),
        showBody ? E('div', { className: 'dig-changes-body' },
          E('div', { className: 'dig-changes-list' },
            total === 0 ? E('div', { className: 'dig-empty' }, t('changes.empty')) : null,
            group('conflicted', fill(t('counts.conflicted'), { n: conflicted.length }), conflicted),
            group('staged', fill(t('counts.staged'), { n: staged.length }), staged),
            group('unstaged', fill(t('counts.unstaged'), { n: unstaged.length }), unstaged),
            group('untracked', fill(t('counts.untracked'), { n: untracked.length }), untracked)),
          composer) : null)
    }

    /* ============================== history ============================== */

    const DAY_MS = 86400000

    /* A ref decoration as git prints it in %D, split into a display name and the
       kind that drives its badge colour. */
    function refInfo(raw) {
      const value = String(raw)
      if (value.indexOf('HEAD -> ') === 0) return { name: value.slice(8), kind: 'head' }
      if (value === 'HEAD') return { name: 'HEAD', kind: 'head' }
      if (value.indexOf('tag: ') === 0) return { name: value.slice(5), kind: 'tag' }
      return { name: value, kind: value.indexOf('/') >= 0 ? 'remote' : 'local' }
    }

    function sinceThreshold(key) {
      if (key === 'today') { const start = new Date(); start.setHours(0, 0, 0, 0); return start.getTime() }
      if (key === 'week') return Date.now() - 7 * DAY_MS
      if (key === 'month') return Date.now() - 30 * DAY_MS
      if (key === 'year') return new Date(new Date().getFullYear(), 0, 1).getTime()
      return 0
    }

    function HistoryList(props) {
      const t = props.t
      const commits = props.commits
      const [text, setText] = useState('')
      const [author, setAuthor] = useState('')
      const [refName, setRefName] = useState('')
      const [since, setSince] = useState('')
      const [order, setOrder] = useState('desc')
      const [pathDraft, setPathDraft] = useState(props.pathFilter === undefined ? '' : props.pathFilter)

      useEffect(() => { setPathDraft(props.pathFilter === undefined ? '' : props.pathFilter) }, [props.pathFilter])

      const authors = useMemo(() => {
        const found = []
        for (const commit of commits) {
          if (typeof commit.author === 'string' && commit.author !== '' && found.indexOf(commit.author) < 0) found.push(commit.author)
        }
        return found.sort()
      }, [commits])

      const refOptions = useMemo(() => {
        const found = []
        for (const commit of commits) {
          const list = Array.isArray(commit.refs) ? commit.refs : []
          for (const entry of list) {
            const info = refInfo(entry)
            if (info.kind !== 'head' && found.indexOf(info.name) < 0) found.push(info.name)
          }
        }
        return found.sort()
      }, [commits])

      const filtered = useMemo(() => {
        const needle = text.trim().toLowerCase()
        const threshold = sinceThreshold(since)
        const kept = commits.filter((commit) => {
          if (needle !== '') {
            const hit = String(commit.subject).toLowerCase().indexOf(needle) >= 0 ||
              String(commit.hash).toLowerCase().indexOf(needle) === 0 ||
              String(commit.author).toLowerCase().indexOf(needle) >= 0
            if (hit === false) return false
          }
          if (author !== '' && commit.author !== author) return false
          if (refName !== '') {
            const list = (Array.isArray(commit.refs) ? commit.refs : []).map((entry) => refInfo(entry).name)
            if (list.indexOf(refName) < 0) return false
          }
          if (threshold > 0) {
            const at = Date.parse(commit.date)
            if (Number.isFinite(at) && at < threshold) return false
          }
          return true
        })
        return order === 'asc' ? kept.slice().reverse() : kept
      }, [commits, text, author, refName, since, order])

      const rows = useMemo(() => buildRows(filtered), [filtered])
      const dirtyFilter = text !== '' || author !== '' || refName !== '' || since !== '' || (props.pathFilter !== undefined && props.pathFilter !== '')
      const applyPath = (value) => { if (props.onPathFilter !== undefined) props.onPathFilter(value) }
      const clearAll = () => {
        setText('')
        setAuthor('')
        setRefName('')
        setSince('')
        setPathDraft('')
        applyPath('')
      }

      const filterBar = props.hideSearch === true ? null : E('div', { className: 'dig-filters' },
        E('input', {
          className: 'dig-input dig-input-compact dig-filter-text', value: text, spellCheck: false,
          placeholder: t('history.filter'),
          onChange: (event) => setText(event.target.value),
        }),
        E('select', {
          className: 'dig-filter-select', value: refName, title: t('filter.branch'),
          onChange: (event) => setRefName(event.target.value),
        }, [E('option', { key: '', value: '' }, t('filter.branch') + ': ' + t('filter.all'))].concat(
          refOptions.map((name) => E('option', { key: name, value: name }, name)))),
        E('select', {
          className: 'dig-filter-select', value: author, title: t('filter.user'),
          onChange: (event) => setAuthor(event.target.value),
        }, [E('option', { key: '', value: '' }, t('filter.user') + ': ' + t('filter.all'))].concat(
          authors.map((name) => E('option', { key: name, value: name }, name)))),
        E('select', {
          className: 'dig-filter-select', value: since, title: t('filter.date'),
          onChange: (event) => setSince(event.target.value),
        },
          E('option', { value: '' }, t('filter.date') + ': ' + t('filter.all')),
          E('option', { value: 'today' }, t('filter.today')),
          E('option', { value: 'week' }, t('filter.week')),
          E('option', { value: 'month' }, t('filter.month')),
          E('option', { value: 'year' }, t('filter.year'))),
        E('form', {
          className: 'dig-filter-path',
          onSubmit: (event) => { event.preventDefault(); applyPath(pathDraft.trim()) },
        }, E('input', {
          className: 'dig-input dig-input-compact', value: pathDraft, spellCheck: false,
          placeholder: t('filter.pathPlaceholder'),
          onChange: (event) => setPathDraft(event.target.value),
        })),
        E('button', {
          type: 'button', className: 'dig-icon-btn dig-icon-btn-small',
          title: order === 'desc' ? t('filter.sortDesc') : t('filter.sortAsc'),
          onClick: () => setOrder(order === 'desc' ? 'asc' : 'desc'),
        }, E(Icon, { name: order === 'desc' ? 'down' : 'up', size: 12 })),
        dirtyFilter ? E('button', {
          type: 'button', className: 'dig-icon-btn dig-icon-btn-small', title: t('filter.clear'),
          onClick: clearAll,
        }, E(Icon, { name: 'close', size: 12 })) : null)

      return E('div', { className: 'dig-history' }, filterBar,
        E('div', { className: 'dig-history-scroll' },
          rows.length === 0 ? E('div', { className: 'dig-empty' }, dirtyFilter ? t('filter.none') : t('history.empty')) : null,
          rows.map((row) => {
            const commit = row.commit
            const decorations = (Array.isArray(commit.refs) ? commit.refs : []).map(refInfo)
            const shown = decorations.slice(0, 3)
            const hidden = decorations.length - shown.length
            return E('div', {
              key: commit.hash,
              className: 'dig-commit' + (props.selectedHash === commit.hash ? ' dig-commit-selected' : ''),
              onClick: () => props.onSelect(commit),
              onContextMenu: (event) => { event.preventDefault(); props.onMenu(event, commit) },
            },
              E('span', { className: 'dig-commit-date', title: shortDate(commit.date) }, relativeTime(commit.date)),
              E('span', { className: 'dig-commit-author', title: commit.author }, commit.author),
              E(GraphCell, { row: row, height: 26 }),
              shown.map((decoration, index) => E('span', {
                key: decoration.kind + ':' + decoration.name + ':' + index,
                className: 'dig-ref dig-ref-' + decoration.kind,
                title: decoration.name,
              }, decoration.name)),
              hidden > 0 ? E('span', { className: 'dig-ref dig-ref-more' }, '+' + hidden) : null,
              E('span', { className: 'dig-commit-subject', title: commit.subject }, commit.subject),
              E('span', { className: 'dig-commit-fill' }))
          }),
          props.hasMore === true
            ? E('button', { type: 'button', className: 'dig-load-more', disabled: props.busy === true, onClick: props.onLoadMore }, t('history.loadMore'))
            : null))
    }

    function CommitDetail(props) {
      const t = props.t
      const detail = props.detail
      if (detail === null || detail === undefined) return E('div', { className: 'dig-empty' }, t('status.loading'))
      return E('div', { className: 'dig-detail' },
        E('div', { className: 'dig-detail-head' },
          E('button', { type: 'button', className: 'dig-btn dig-btn-small', onClick: props.onBack }, '← ' + t('detail.back')),
          E('span', { className: 'dig-mono' }, detail.shortHash),
          E('span', { className: 'dig-detail-author' }, detail.author),
          E('span', { className: 'dig-detail-date' }, shortDate(detail.date))),
        E('div', { className: 'dig-detail-subject' }, detail.subject),
        detail.body === undefined || detail.body.trim() === '' ? null : E('pre', { className: 'dig-detail-body' }, detail.body.trim()),
        E('div', { className: 'dig-detail-files-head' }, t('detail.files') + ' · ' + String(detail.files.length)),
        E('div', { className: 'dig-detail-files' },
          detail.files.length === 0 ? E('div', { className: 'dig-empty' }, t('detail.noFiles')) : null,
          detail.files.map((file) => E('div', {
            key: file.path,
            className: 'dig-row dig-row-file' + (props.selectedPath === file.path ? ' dig-row-selected' : ''),
            title: file.path,
            onClick: () => props.onSelectFile(file),
          },
            E('span', { className: 'dig-row-label' }, baseName(file.path)),
            E('span', { className: 'dig-row-sub dig-row-dir' }, dirName(file.path)),
            file.additions > 0 ? E('span', { className: 'dig-stat-add' }, '+' + file.additions) : null,
            file.deletions > 0 ? E('span', { className: 'dig-stat-del' }, '-' + file.deletions) : null))))
    }

    /* ============================== panel ============================== */

    function Panel(props) {
      const scope = props.scope
      const t = props.t
      const hostRef = useRef(null)
      const railHostRef = useRef(null)
      const [size, setSize] = useState({ width: 0, height: 0 })
      const [repoState, setRepoState] = useState(null)
      const [repoRoot, setRepoRoot] = useState(null)
      const [summary, setSummary] = useState(null)
      const [branches, setBranches] = useState(null)
      const [commits, setCommits] = useState([])
      const [hasMore, setHasMore] = useState(false)
      const [error, setError] = useState(null)
      const [note, setNote] = useState(null)
      const [busy, setBusy] = useState(false)
      const [view, setView] = useState('history')
      const [treeOpen, setTreeOpen] = useState(true)
      const [detail, setDetail] = useState(null)
      const [selectedHash, setSelectedHash] = useState(null)
      const [selectedPath, setSelectedPath] = useState(null)
      const [patch, setPatch] = useState('')
      const [patchLoading, setPatchLoading] = useState(false)
      const [menu, setMenu] = useState(null)
      const [dialog, setDialog] = useState(null)
      const [tick, setTick] = useState(0)
      const [favTick, setFavTick] = useState(0)
      const [pathFilter, setPathFilter] = useState('')
      const [railConfig, setRailConfig] = useState(readRailConfig)
      const [railSettings, setRailSettings] = useState(false)
      const [railBox, setRailBox] = useState({ width: 0, height: 0 })

      const cwd = typeof scope.cwd === 'string' && scope.cwd !== '' ? scope.cwd : undefined
      const sessionId = typeof scope.sessionId === 'string' ? scope.sessionId : 'default'
      const base = useMemo(() => ({ cwd: cwd, repoRoot: repoRoot === null ? undefined : repoRoot }), [cwd, repoRoot])

      useEffect(() => {
        const element = hostRef.current
        if (element === null) return undefined
        const measure = () => {
          const rect = element.getBoundingClientRect()
          setSize({ width: Math.round(rect.width), height: Math.round(rect.height) })
        }
        measure()
        if (typeof ResizeObserver === 'function') {
          const observer = new ResizeObserver(measure)
          observer.observe(element)
          return () => observer.disconnect()
        }
        window.addEventListener('resize', measure)
        return () => window.removeEventListener('resize', measure)
      }, [])

      // Width decides: a wide container is a three-column workbench even when it is
      // short (the bottom panel is 1500x300 and still wants tree | graph | changes).
      // Only a genuinely tiny container (very narrow or very short) falls back to
      // the compact one-header chrome.
      const compact = size.height > 0 && (size.height < COMPACT_MAX_HEIGHT || size.width < COMPACT_MAX_WIDTH)
      const columns = !compact && size.width >= 600 && size.width >= size.height * 1.15

// The action rail measures ITSELF, not the panel: how many buttons fit is a
      // function of the strip that holds them (a 1200x300 workbench and a 300x900
      // sidebar disagree about that). railBox keeps the last measured span; until
      // the first measurement lands, every action is rendered.
      useEffect(() => {
        const element = railHostRef.current
        if (element === null) { setRailBox({ width: 0, height: 0 }); return undefined }
        const measure = () => {
          const rect = element.getBoundingClientRect()
          setRailBox({ width: Math.round(rect.width), height: Math.round(rect.height) })
        }
        measure()
        if (typeof ResizeObserver === 'function') {
          const observer = new ResizeObserver(measure)
          observer.observe(element)
          return () => observer.disconnect()
        }
        window.addEventListener('resize', measure)
        return () => window.removeEventListener('resize', measure)
      }, [repoRoot, columns, compact])

      const guard = useCallback(async (work) => {
        setBusy(true)
        setError(null)
        try {
          return await work()
        } catch (caught) {
          setError(caught instanceof Error ? caught.message : String(caught))
          return undefined
        } finally {
          setBusy(false)
        }
      }, [])

      const favorites = useMemo(() => (repoRoot === null ? [] : readFavorites(repoRoot)), [repoRoot, favTick])
      const toggleFavoriteBranch = useCallback((name) => {
        if (repoRoot === null || name === '') return
        toggleFavorite(repoRoot, name)
        setFavTick((value) => value + 1)
      }, [repoRoot])

      useEffect(() => {
        if (cwd === undefined) return undefined
        let cancelled = false
        void (async () => {
          try {
            const data = await request('repos', { cwd: cwd })
            if (cancelled) return
            setRepoState(data)
            const paths = data.repos.map((repo) => repo.path)
            const remembered = readRememberedRepo(sessionId)
            let pick = null
            if (remembered !== undefined && paths.indexOf(remembered) >= 0) pick = remembered
            else if (data.isRepo === true) pick = data.cwd
            else if (paths.length > 0) pick = paths[0]
            setRepoRoot(pick)
          } catch (caught) {
            if (!cancelled) setError(caught instanceof Error ? caught.message : String(caught))
          }
        })()
        return () => { cancelled = true }
      }, [cwd, sessionId, tick])

      const loadSummary = useCallback(async () => {
        const data = await request('summary', base)
        setSummary(data)
        return data
      }, [base])

      const loadBranches = useCallback(async () => {
        setBranches(await request('branches', base))
      }, [base])

      const loadCommits = useCallback(async (skip, overridePath) => {
        const activePath = overridePath === undefined ? pathFilter : overridePath
        const payload = Object.assign({}, base, { skip: skip === undefined ? 0 : skip, limit: 120 })
        if (activePath !== undefined && activePath !== '') payload.path = activePath
        const data = await request('log', payload)
        setCommits((previous) => (skip === undefined || skip === 0 ? data.commits : previous.concat(data.commits)))
        setHasMore(data.hasMore)
      }, [base, pathFilter])

      const refresh = useCallback(async () => {
        if (repoRoot === null) return
        await guard(async () => {
          await Promise.all([loadSummary(), loadBranches(), loadCommits(0)])
        })
      }, [guard, loadSummary, loadBranches, loadCommits, repoRoot])

      useEffect(() => {
        if (repoRoot === null) return undefined
        void refresh()
        return undefined
      }, [repoRoot, refresh, tick])

      useEffect(() => {
        if (props.visible !== true || repoRoot === null) return undefined
        const timer = setInterval(() => {
          void (async () => {
            try { await loadSummary() } catch (error) { void error }
          })()
        }, AUTO_REFRESH_MS)
        return () => clearInterval(timer)
      }, [props.visible, repoRoot, loadSummary])

      const run = useCallback(async (method, payload) => {
        const result = await guard(() => request(method, Object.assign({}, base, payload)))
        if (result !== undefined) await refresh()
        return result
      }, [base, guard, refresh])

      const pickRepo = useCallback((path) => {
        setRepoRoot(path)
        rememberRepo(sessionId, path)
        setSummary(null)
        setBranches(null)
        setCommits([])
        setDetail(null)
        setSelectedHash(null)
        setPatch('')
        setView('history')
        setPathFilter('')
      }, [sessionId])

      const openDiff = useCallback(async (seed) => {
        setPatchLoading(true)
        setPatch('')
        try {
          const data = await request('diff', Object.assign({}, base, seed))
          setPatch(data.patch)
        } catch (caught) {
          setError(caught instanceof Error ? caught.message : String(caught))
        } finally {
          setPatchLoading(false)
        }
      }, [base])

      const selectCommit = useCallback(async (commit) => {
        setSelectedHash(commit.hash)
        setSelectedPath(null)
        setPatch('')
        setView('detail')
        setDetail(null)
        try {
          setDetail(await request('commitDetail', Object.assign({}, base, { hash: commit.hash })))
        } catch (caught) {
          setError(caught instanceof Error ? caught.message : String(caught))
        }
      }, [base])

      const checkout = useCallback(async (entry) => {
        if (entry.tag === true) { void run('checkout', { branch: entry.name }); return }
        if (entry.remote === true) { void run('checkout', { branch: entry.name.slice(entry.name.indexOf('/') + 1) }); return }
        void run('checkout', { branch: entry.name })
      }, [run])

      const compareWith = useCallback(async (baseRef, headRef) => {
        const data = await run('compare', { base: baseRef, head: headRef })
        if (data === undefined) return
        setNote(baseRef + ' ... ' + headRef + ' · ' + String(data.files.length) + ' files / ' + String(data.commits.length) + ' commits')
      }, [run])

      /* Menu anchors are stored as offsets inside the panel, not as viewport
         coordinates: the bottom workbench is a containing block for fixed
         descendants (contain: layout), so viewport coordinates would place the
         menu outside the panel. See ContextMenu. */
      const openMenuAt = useCallback((event, items) => {
        const element = hostRef.current
        const rect = element === null ? null : element.getBoundingClientRect()
        setMenu({
          x: event.clientX - (rect === null ? 0 : rect.left),
          y: event.clientY - (rect === null ? 0 : rect.top),
          boundsWidth: rect === null ? 0 : Math.round(rect.width),
          boundsHeight: rect === null ? 0 : Math.round(rect.height),
          items: items,
        })
      }, [])

      const branchMenu = useCallback((event, entry) => {
        const current = branches === null ? '' : branches.branch
        const isLocal = entry.remote !== true && entry.tag !== true
        const reason = t('action.unavailable')
        const items = [
          { id: 'checkout', icon: 'checkout', tone: 'accent', label: t('action.checkout'), disabled: entry.head === true || entry.tag === true, reason: reason, run: () => { void checkout(entry) } },
          isLocal ? { id: 'rebase', icon: 'compare', tone: 'violet', label: t('action.rebaseCurrentOnto'), disabled: entry.head === true, reason: reason, run: () => { void run('rebase', { onto: entry.name }) } } : null,
          isLocal ? { id: 'merge', icon: 'compare', tone: 'accent', label: t('action.mergeIntoCurrent'), disabled: entry.head === true, reason: reason, run: () => { void run('merge', { branch: entry.name }) } } : null,
          { id: 'compare', icon: 'filter', tone: 'violet', label: t('action.compare'), disabled: entry.head === true || current === '', reason: reason, run: () => { void compareWith(current, entry.name) } },
          null,
          { id: 'favorite', icon: 'star', tone: 'warn', label: t('action.favorite'), active: favorites.indexOf(entry.name) >= 0, run: () => toggleFavoriteBranch(entry.name) },
          { id: 'newBranch', icon: 'plus', tone: 'success', label: t('action.newBranchFrom'), run: () => setDialog({ kind: 'newBranch', from: entry.name }) },
          isLocal ? { id: 'rename', icon: 'file', tone: 'primary', label: t('action.rename'), run: () => setDialog({ kind: 'renameBranch', from: entry.name }) } : null,
          isLocal ? { id: 'delete', icon: 'trash', tone: 'danger', label: t('action.delete'), danger: true, disabled: entry.head === true, reason: reason, run: () => setDialog({ kind: 'deleteBranch', name: entry.name }) } : null,
          null,
          { id: 'update', icon: 'fetch', tone: 'cyan', label: t('action.update'), run: () => { void run('fetch', { prune: true }) } },
          { id: 'push', icon: 'push', tone: 'success', label: t('action.push'), run: () => setDialog({ kind: 'push' }) },
        ].filter((item) => item !== null)
        openMenuAt(event, items)
      }, [branches, checkout, run, t, compareWith, toggleFavoriteBranch, openMenuAt, favorites])

      const commitMenu = useCallback((event, commit) => {
        const items = [
          { id: 'details', icon: 'file', tone: 'primary', label: t('action.details'), run: () => { void selectCommit(commit) } },
          { id: 'copy', icon: 'tag', tone: 'secondary', label: t('action.copyHash'), run: () => { copyText(commit.hash) } },
          null,
          { id: 'checkout', icon: 'checkout', tone: 'accent', label: t('action.checkout'), run: () => setDialog({ kind: 'checkoutCommit', hash: commit.hash }) },
          { id: 'branch', icon: 'plus', tone: 'success', label: t('action.newBranchHere'), run: () => setDialog({ kind: 'newBranch', from: commit.hash }) },
          { id: 'tag', icon: 'tag', tone: 'warn', label: t('action.newTag'), run: () => setDialog({ kind: 'newTag', hash: commit.hash }) },
          null,
          { id: 'cherry', icon: 'commit', tone: 'accent', label: t('action.cherryPick'), run: () => { void run('cherryPick', { hash: commit.hash }) } },
          { id: 'revert', icon: 'undo', tone: 'danger', label: t('action.revert'), run: () => { void run('revert', { hash: commit.hash }) } },
          null,
          { id: 'resetSoft', icon: 'undo', tone: 'warn', label: t('action.resetSoft'), run: () => setDialog({ kind: 'reset', hash: commit.hash, mode: 'mixed' }) },
          { id: 'resetHard', icon: 'trash', tone: 'danger', label: t('action.resetHard'), danger: true, run: () => setDialog({ kind: 'reset', hash: commit.hash, mode: 'hard' }) },
        ]
        openMenuAt(event, items)
      }, [run, selectCommit, t, openMenuAt])

      const changeMenu = useCallback((event, item, group) => {
        const items = [
          { id: 'diff', icon: 'file', tone: 'primary', label: t('action.showDiff'), run: () => { void openDiff({ path: item.path, staged: group === 'staged' }) } },
          null,
          group === 'staged'
            ? { id: 'unstage', icon: 'minus', tone: 'warn', label: t('action.unstage'), run: () => { void run('unstage', { paths: [item.path] }) } }
            : { id: 'stage', icon: 'plus', tone: 'success', label: t('action.stage'), run: () => { void run('stage', { paths: [item.path] }) } },
          { id: 'discard', icon: 'undo', tone: 'danger', label: t('action.discard'), danger: true, disabled: group === 'untracked', reason: t('action.unavailable'), run: () => setDialog({ kind: 'discard', item: item, group: group }) },
          null,
          { id: 'copy', icon: 'tag', tone: 'secondary', label: t('action.copyPath'), run: () => { copyText(item.path) } },
        ]
        openMenuAt(event, items)
      }, [openDiff, run, t, openMenuAt])

      const submitDialog = useCallback(async (state, value) => {
        setDialog(null)
        if (state.kind === 'newBranch') { await run('checkout', { branch: value, create: true, startPoint: state.from }); return }
        if (state.kind === 'renameBranch') { await run('branchRename', { from: state.from, to: value }); return }
        if (state.kind === 'newTag') { await run('tagCreate', { name: value, hash: state.hash }); return }
      }, [run])

      /* ---------- shared pieces ---------- */

      const repoOptions = repoState === null ? [] : repoState.repos
      const dirty = summary === null ? 0 : summary.changes.staged.length + summary.changes.unstaged.length + summary.changes.untracked.length + summary.changes.conflicted.length

      const topBar = E('div', { className: 'dig-topbar' },
        E(RepoSelect, { t: t, repos: repoOptions, value: repoRoot, onChange: pickRepo }),
        branches === null || branches.local.length === 0 ? null : E('span', { className: 'dig-select-wrap', title: t('branch.switch') },
          E(Icon, { name: 'branch', size: 12 }),
          E('select', {
            className: 'dig-select dig-select-branch',
            value: branches.branch,
            onChange: (event) => { void run('checkout', { branch: event.target.value }) },
          }, branches.local.map((entry) => E('option', { key: entry.name, value: entry.name }, entry.name)))),
        summary === null || summary.upstream === null ? null : E('span', { className: 'dig-track' },
          (summary.ahead > 0 ? '↑' + summary.ahead : '') + (summary.behind > 0 ? ' ↓' + summary.behind : '')),
        E('span', { className: 'dig-topbar-spacer' }),
        busy ? E('span', { className: 'dig-busy' }, t('status.busy')) : null)

      const banner = error === null ? null : E('div', { className: 'dig-banner' },
        E('span', { className: 'dig-banner-text' }, error),
        E('button', { type: 'button', className: 'dig-link', onClick: () => setError(null) }, t('error.dismiss')))

      const noteBanner = note === null ? null : E('div', { className: 'dig-note' },
        E('span', { className: 'dig-banner-text' }, note),
        E('button', { type: 'button', className: 'dig-link', onClick: () => setNote(null) }, t('error.dismiss')))

      const changesPane = E(ChangesPanel, {
        t: t, summary: summary, busy: busy, compact: compact, hideHeader: compact,
        onCommit: (message, amend) => { void run('commit', { message: message, amend: amend }) },
        onStage: (item) => { void run('stage', { paths: [item.path] }) },
        onUnstage: (item) => { void run('unstage', { paths: [item.path] }) },
        onStageAll: (entries) => { void run('stage', { paths: entries.map((entry) => entry.path) }) },
        onUnstageAll: () => { void run('unstage', { paths: (summary === null ? [] : summary.changes.staged).map((entry) => entry.path) }) },
        onDiscard: (item, group) => setDialog({ kind: 'discard', item: item, group: group }),
        onDiff: (item, group) => { void openDiff({ path: item.path, staged: group === 'staged' }) },
        onChangeMenu: changeMenu,
      })

      const historyPane = view === 'detail'
        ? E(CommitDetail, {
            t: t, detail: detail, selectedPath: selectedPath,
            onBack: () => { setView('history'); setSelectedPath(null); setPatch('') },
            onSelectFile: (file) => {
              setSelectedPath(file.path)
              void openDiff({ hash: detail === null ? undefined : detail.hash, path: file.path })
            },
          })
        : E(HistoryList, {
            t: t, commits: commits, hasMore: hasMore, busy: busy, selectedHash: selectedHash,
            hideSearch: compact, pathFilter: pathFilter,
            onPathFilter: (value) => setPathFilter(value),
            onSelect: (commit) => { void selectCommit(commit) },
            onMenu: commitMenu,
            onLoadMore: () => { void guard(() => loadCommits(commits.length)) },
          })

      const diffPane = patch === '' && patchLoading === false ? null : E('div', { className: 'dig-diff-pane' },
        E('div', { className: 'dig-diff-head' },
          E('span', { className: 'dig-mono dig-diff-path' }, selectedPath === null ? '' : selectedPath),
          E('button', { type: 'button', className: 'dig-icon-btn', onClick: () => { setPatch(''); setSelectedPath(null) } }, E(Icon, { name: 'close', size: 12 }))),
        E(DiffBody, { patch: patch, loading: patchLoading, t: t }))

      /* ---------- rail (IDE-style left action strip) ---------- */

      const otherBranches = (branches === null ? [] : branches.local).filter((entry) => entry.head !== true)

      const pickBranchMenu = (event, kind) => {
        if (otherBranches.length === 0) { setNote(t('note.noBranches')); return }
        const current = branches === null ? '' : branches.branch
        const icon = kind === 'checkout' ? 'checkout' : kind === 'delete' ? 'trash' : 'compare'
        const tone = kind === 'delete' ? 'danger' : kind === 'compare' ? 'violet' : 'accent'
        openMenuAt(event, otherBranches.map((entry) => ({
          id: kind + ':' + entry.name,
          icon: icon,
          tone: tone,
          label: entry.name,
          run: () => {
            if (kind === 'checkout') { void run('checkout', { branch: entry.name }); return }
            if (kind === 'delete') { setDialog({ kind: 'deleteBranch', name: entry.name }); return }
            void compareWith(current, entry.name)
          },
        })))
      }

      const showWorkingDiff = () => {
        const changes = summary === null ? null : summary.changes
        if (changes === null) return
        const order = [
          ['unstaged', changes.unstaged, false],
          ['staged', changes.staged, true],
          ['conflicted', changes.conflicted, false],
          ['untracked', changes.untracked, false],
        ]
        for (const entry of order) {
          if (entry[1].length > 0) { void openDiff({ path: entry[1][0].path, staged: entry[2] }); return }
        }
        setNote(t('note.noChanges'))
      }

      const stashMenu = (event) => {
        const count = summary === null ? 0 : summary.stashCount
        openMenuAt(event, [
          { id: 'stash-push', icon: 'stash', tone: 'violet', label: t('stash.push'), disabled: dirty === 0, reason: t('action.unavailable'), run: () => { void run('stashPush', { includeUntracked: true }) } },
          { id: 'stash-apply', icon: 'checkout', tone: 'accent', label: t('stash.apply'), disabled: count === 0, reason: t('action.unavailable'), run: () => { void run('stashApply', {}) } },
          { id: 'stash-drop', icon: 'trash', tone: 'danger', label: t('stash.drop'), danger: true, disabled: count === 0, reason: t('action.unavailable'), run: () => { void run('stashDrop', { confirm: true }) } },
          null,
          { id: 'stash-count', icon: 'tag', tone: 'secondary', label: fill(t('stash.count'), { n: count }), disabled: true, run: () => {} },
        ])
      }

      /* favorites/toggleFavoriteBranch live above branchMenu: a useCallback dep array is evaluated during render. */
      const headBranch = branches === null ? '' : branches.branch
      const remoteReady = branches !== null && Array.isArray(branches.remotes) && branches.remotes.length > 0
      const tracked = summary !== null && summary.upstream !== null
      const stashCount = summary === null ? 0 : summary.stashCount
      const reason = t('action.unavailable')

      /* One descriptor per action, with the availability IDEA would use: delete /
         checkout / compare need another local branch, fetch and push need a remote,
         pull needs an upstream, diff needs pending changes, tag needs a commit.
         The rail renders a user-chosen subset in a user-chosen order. */
      const railActions = RAIL_SPECS.map((spec) => {
        const entry = { id: spec.id, icon: spec.icon, tone: spec.tone, label: t(spec.key), disabled: false, active: false, run: () => {} }
        if (spec.id === 'refresh') entry.run = () => setTick((value) => value + 1)
        else if (spec.id === 'newBranch') entry.run = () => setDialog({ kind: 'newBranch' })
        else if (spec.id === 'checkout') { entry.disabled = otherBranches.length === 0; entry.run = (event) => pickBranchMenu(event, 'checkout') }
        else if (spec.id === 'delete') { entry.disabled = otherBranches.length === 0; entry.run = (event) => pickBranchMenu(event, 'delete') }
        else if (spec.id === 'compare') { entry.disabled = otherBranches.length === 0; entry.run = (event) => pickBranchMenu(event, 'compare') }
        else if (spec.id === 'diff') { entry.disabled = dirty === 0; entry.run = () => showWorkingDiff() }
        else if (spec.id === 'stash') { entry.disabled = dirty === 0 && stashCount === 0; entry.run = (event) => stashMenu(event) }
        else if (spec.id === 'tag') { entry.disabled = commits.length === 0; entry.run = () => setDialog({ kind: 'newTag' }) }
        else if (spec.id === 'favorite') { entry.disabled = headBranch === ''; entry.active = favorites.indexOf(headBranch) >= 0; entry.run = () => toggleFavoriteBranch(headBranch) }
        else if (spec.id === 'fetch') { entry.disabled = remoteReady !== true; entry.run = () => { void run('fetch', { prune: true }) } }
        else if (spec.id === 'pull') { entry.disabled = remoteReady !== true || tracked !== true; entry.run = () => { void run('pull', { mode: 'ff-only' }) } }
        else if (spec.id === 'push') { entry.disabled = remoteReady !== true; entry.run = () => setDialog({ kind: 'push' }) }
        if (busy === true && spec.id !== 'refresh') entry.disabled = true
        return entry
      })

      const railOrdered = railConfig.order
        .map((id) => railActions.find((action) => action.id === id))
        .filter((action) => action !== undefined)
      const railVisible = railOrdered.filter((action) => railConfig.hidden.indexOf(action.id) < 0)

      const applyRail = (next) => { setRailConfig(next); writeRailConfig(next) }
      const moveRailAction = (id, delta) => {
        const order = railConfig.order.slice()
        const at = order.indexOf(id)
        const to = at + delta
        if (at < 0 || to < 0 || to >= order.length) return
        order.splice(at, 1)
        order.splice(to, 0, id)
        applyRail({ order: order, hidden: railConfig.hidden })
      }
      const dropRailAction = (fromId, toId) => {
        if (fromId === null || fromId === toId) return
        const order = railConfig.order.slice()
        const at = order.indexOf(fromId)
        const to = order.indexOf(toId)
        if (at < 0 || to < 0) return
        order.splice(at, 1)
        order.splice(to, 0, fromId)
        applyRail({ order: order, hidden: railConfig.hidden })
      }
      const toggleRailAction = (id) => {
        const hidden = railConfig.hidden.indexOf(id) >= 0
          ? railConfig.hidden.filter((entry) => entry !== id)
          : railConfig.hidden.concat([id])
        applyRail({ order: railConfig.order, hidden: hidden })
      }
      const resetRailActions = () => applyRail({ order: RAIL_IDS.slice(), hidden: [] })

      const RAIL_SLOT = 26
      const railCapacityOf = (vertical) => {
        const span = vertical ? railBox.height : railBox.width
        if (span <= 0) return railVisible.length + 1
        return Math.max(1, Math.floor((span - (vertical ? 10 : 12)) / RAIL_SLOT))
      }

      /* Renders the rail for one orientation: as many buttons as fit, then a more
         menu that lists EVERY action, then the settings button pinned to the end. */
      const renderRail = (vertical) => {
        const capacity = railCapacityOf(vertical)
        // The settings button is never dropped and never pushed out: the more
        // button only appears when there is room for it AND for settings.
        const overflow = railVisible.length + 1 > capacity && capacity >= 3
        const slots = overflow
          ? Math.max(1, capacity - 2)
          : Math.min(railVisible.length, Math.max(0, capacity - 1))
        const children = railVisible.slice(0, slots).map((action) => E('button', {
          key: action.id,
          type: 'button',
          className: 'dig-rail-btn dig-tone-' + action.tone + (action.active === true ? ' dig-rail-btn-active' : ''),
          title: action.disabled === true ? action.label + ' · ' + reason : action.label,
          disabled: action.disabled === true,
          onClick: action.run,
        }, E(Icon, { name: action.icon, size: 15 })))
        if (overflow === true) {
          children.push(E('button', {
            key: 'more',
            type: 'button',
            className: 'dig-rail-btn dig-rail-more',
            title: t('rail.more'),
            onClick: (event) => openMenuAt(event, railActions.map((action) => ({
              id: 'rail:' + action.id,
              icon: action.icon,
              tone: action.tone,
              label: action.label,
              disabled: action.disabled,
              active: action.active,
              reason: reason,
              run: (inner) => action.run(inner === undefined ? event : inner),
            }))),
          }, E(Icon, { name: 'more', size: 16 })))
        }
        children.push(E('span', { key: 'gap', className: vertical ? 'dig-rail-gap' : 'dig-rail-gap-x' }))
        children.push(E('button', {
          key: 'settings',
          type: 'button',
          className: 'dig-rail-btn dig-rail-settings',
          title: t('rail.settings'),
          onClick: () => setRailSettings(true),
        }, E(Icon, { name: 'settings', size: 15 })))
        return E('div', { className: vertical ? 'dig-rail' : 'dig-rail-row', ref: railHostRef }, children)
      }

      /* ---------- body per chrome ---------- */

      let body
      if (repoRoot === null) {
        body = E('div', { className: 'dig-body' }, E(RepoPicker, {
          t: t, cwd: cwd === undefined ? '' : cwd, repos: repoOptions, onPick: pickRepo,
        }))
      } else if (compact) {
        body = E('div', { className: 'dig-body dig-body-compact' },
          E('div', { className: 'dig-compact-bar' },
            E(Segmented, {
              value: view === 'detail' ? 'history' : view,
              onChange: (next) => { setView(next); setPatch('') },
              items: [
                { id: 'changes', label: fill(t('seg.changes'), { n: dirty }) },
                { id: 'history', label: t('seg.history') },
              ],
            }),
            E('span', { className: 'dig-topbar-spacer' }),
            treeOpen ? E('button', { type: 'button', className: 'dig-icon-btn dig-icon-btn-active', title: t('toolbar.tree'), onClick: () => setTreeOpen(false) }, E(Icon, { name: 'branch' })) : null),
          treeOpen ? E('div', { className: 'dig-compact-tree' }, E(BranchTree, { t: t, branches: branches, favorites: favorites, onCheckout: checkout, onBranchMenu: branchMenu })) : null,
          view === 'changes' ? changesPane : E('div', { className: 'dig-pane dig-pane-main' }, historyPane, diffPane))
      } else if (columns) {
        body = E('div', { className: 'dig-body dig-body-columns' },
          treeOpen ? E('div', { className: 'dig-pane dig-pane-tree' }, E(BranchTree, { t: t, branches: branches, favorites: favorites, onCheckout: checkout, onBranchMenu: branchMenu })) : null,
          E('div', { className: 'dig-pane dig-pane-main' }, historyPane, diffPane),
          E('div', { className: 'dig-pane dig-pane-changes' }, changesPane))
      } else {
        body = E('div', { className: 'dig-body dig-body-stack' },
          treeOpen ? E('div', { className: 'dig-pane dig-pane-tree-stack' }, E(BranchTree, { t: t, branches: branches, favorites: favorites, onCheckout: checkout, onBranchMenu: branchMenu })) : null,
          E('div', { className: 'dig-pane dig-pane-changes-stack' }, changesPane),
          E('div', { className: 'dig-pane dig-pane-main' }, historyPane, diffPane))
      }

      /* ---------- overlays ---------- */

      const overlays = []
      if (menu !== null) {
        overlays.push(E(ContextMenu, {
          key: 'menu',
          anchor: { x: menu.x, y: menu.y },
          boundsWidth: menu.boundsWidth,
          boundsHeight: menu.boundsHeight,
          items: menu.items,
          onClose: () => setMenu(null),
        }))
      }
      if (railSettings === true) {
        overlays.push(E(RailSettings, {
          key: 'rail-settings',
          t: t,
          items: railOrdered.map((action) => ({
            id: action.id,
            icon: action.icon,
            tone: action.tone,
            label: action.label,
            hidden: railConfig.hidden.indexOf(action.id) >= 0,
          })),
          onMove: moveRailAction,
          onDrop: dropRailAction,
          onToggle: toggleRailAction,
          onReset: resetRailActions,
          onClose: () => setRailSettings(false),
        }))
      }
      if (dialog !== null && (dialog.kind === 'newBranch' || dialog.kind === 'renameBranch' || dialog.kind === 'newTag')) {
        const titles = { newBranch: t('prompt.newBranch'), renameBranch: t('prompt.renameBranch'), newTag: t('prompt.newTag') }
        overlays.push(E(PromptDialog, {
          key: 'prompt',
          title: titles[dialog.kind],
          placeholder: dialog.from === undefined ? t('prompt.fromHead') : dialog.from,
          initialValue: dialog.kind === 'renameBranch' ? dialog.from : '',
          okLabel: t('confirm.ok'), cancelLabel: t('confirm.cancel'),
          onCancel: () => setDialog(null),
          onSubmit: (value) => { void submitDialog(dialog, value) },
        }))
      }
      if (dialog !== null && dialog.kind === 'deleteBranch') {
        overlays.push(E(ConfirmDialog, {
          key: 'delete', title: t('confirm.title'), text: fill(t('delete.confirm'), { name: dialog.name }),
          okLabel: t('confirm.ok'), cancelLabel: t('confirm.cancel'),
          onCancel: () => setDialog(null),
          onConfirm: () => { setDialog(null); void run('branchDelete', { name: dialog.name }) },
        }))
      }
      if (dialog !== null && dialog.kind === 'discard') {
        overlays.push(E(ConfirmDialog, {
          key: 'discard', title: t('confirm.title'), text: fill(t('discard.confirm'), { path: dialog.item.path }),
          okLabel: t('confirm.ok'), cancelLabel: t('confirm.cancel'),
          onCancel: () => setDialog(null),
          onConfirm: () => {
            setDialog(null)
            void run('discard', { paths: [dialog.item.path], untracked: dialog.group === 'untracked', confirm: true })
          },
        }))
      }
      if (dialog !== null && dialog.kind === 'reset') {
        overlays.push(E(ConfirmDialog, {
          key: 'reset', title: t('confirm.title'),
          text: dialog.mode === 'hard' ? fill(t('resetHard.confirm'), { hash: dialog.hash.slice(0, 8) }) : fill(t('resetSoft.confirm'), { hash: dialog.hash.slice(0, 8) }),
          okLabel: t('confirm.ok'), cancelLabel: t('confirm.cancel'),
          onCancel: () => setDialog(null),
          onConfirm: () => { setDialog(null); void run('reset', { hash: dialog.hash, mode: dialog.mode, confirm: true }) },
        }))
      }
      if (dialog !== null && dialog.kind === 'checkoutCommit') {
        overlays.push(E(ConfirmDialog, {
          key: 'checkoutCommit', title: t('confirm.title'), text: fill(t('checkoutCommit.confirm'), { hash: dialog.hash.slice(0, 8) }),
          okLabel: t('confirm.ok'), cancelLabel: t('confirm.cancel'),
          onCancel: () => setDialog(null),
          onConfirm: () => { setDialog(null); void run('checkout', { branch: dialog.hash }) },
        }))
      }
      if (dialog !== null && dialog.kind === 'push') {
        const branch = summary === null ? '' : summary.branch
        const target = summary === null || summary.upstream === null ? 'origin' : summary.upstream
        overlays.push(E(ConfirmDialog, {
          key: 'push', title: t('confirm.title'), text: fill(t('push.confirm'), { branch: branch, upstream: target }),
          okLabel: t('confirm.ok'), cancelLabel: t('confirm.cancel'),
          onCancel: () => setDialog(null),
          onConfirm: () => {
            setDialog(null)
            void run('push', { confirm: true, setUpstream: summary !== null && summary.upstream === null })
          },
        }))
      }

      // Wide chromes (the bottom workbench) get the vertical IDE rail on the left;
      // narrow ones (the native right sidebar) get the same actions as one
      // horizontal row under the repo/branch bar, and every action lives in
      // exactly one place.
      return E('div', { className: 'dig-root', ref: hostRef }, topBar,
        columns === true || repoRoot === null ? null : renderRail(false),
        banner, noteBanner,
        E('div', { className: 'dig-shell' },
          columns === true && repoRoot !== null ? renderRail(true) : null,
          body),
        overlays)
    }

    function copyText(text) {
      try {
        void navigator.clipboard.writeText(text)
      } catch (error) { void error }
    }

    /* ============================== styles ============================== */
    /* Tokens only (--dsw-alias-*): transparent themes and background plugins
       (dsh-any-background) keep showing through, like the host's own panels. */

    const CSS = [
      '.dig-root{position:relative;display:flex;flex-direction:column;height:100%;min-height:0;background:transparent;color:var(--dsw-alias-label-primary);font-family:var(--dsw-font-family,system-ui,sans-serif);font-size:13px;line-height:1.5;font-weight:600;overflow:hidden}',
      '.dig-topbar{display:flex;align-items:center;gap:6px;padding:4px 6px;flex:none;min-width:0;border-bottom:1px solid var(--dsw-alias-hairline,var(--dsw-alias-border-l1));overflow:hidden}',
      '.dig-topbar-spacer{flex:1;min-width:4px}',
      '.dig-busy{color:var(--dsw-alias-label-tertiary);flex:none;white-space:nowrap}',
      '.dig-track{color:var(--dsw-alias-label-secondary);flex:none;font-variant-numeric:tabular-nums;white-space:nowrap}',
      '.dig-select-wrap{display:inline-flex;align-items:center;gap:4px;min-width:0;color:var(--dsw-alias-label-secondary)}',
      '.dig-select{appearance:none;-webkit-appearance:none;background:transparent;border:1px solid var(--dsw-alias-border-l2);border-radius:6px;color:var(--dsw-alias-label-primary);font:inherit;font-weight:500;padding:1px 6px;height:22px;max-width:190px;min-width:0;cursor:pointer;text-overflow:ellipsis}',
      '.dig-select:hover{background:var(--dsw-alias-interactive-bg-hover)}',
      '.dig-select:focus{outline:1px solid var(--dsw-alias-brand-primary);outline-offset:-1px}',
      '.dig-select-repo{max-width:200px}',
      '.dig-select-branch{max-width:150px}',
      '.dig-repo-static{display:inline-flex;align-items:center;gap:5px;min-width:0;color:var(--dsw-alias-label-secondary)}',
      '.dig-repo-name{color:var(--dsw-alias-label-primary);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:200px}',
      '.dig-icon-btn{display:inline-flex;align-items:center;justify-content:center;width:24px;height:24px;border:none;border-radius:6px;background:transparent;color:var(--dsw-alias-label-secondary);cursor:pointer;padding:0;flex:none}',
      '.dig-icon-btn:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary)}',
      '.dig-icon-btn:disabled{opacity:.4;cursor:default}',
      '.dig-icon-btn-active{background:var(--dsw-alias-interactive-bg-active,var(--dsw-alias-interactive-bg-hover));color:var(--dsw-alias-label-primary)}',
      '.dig-banner{display:flex;align-items:center;gap:8px;padding:4px 8px;flex:none;color:var(--dsw-alias-state-error-primary)}',
      '.dig-note{display:flex;align-items:center;gap:8px;padding:4px 8px;flex:none;color:var(--dsw-alias-label-secondary)}',
      '.dig-banner-text{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis}',
      '.dig-shell{flex:1;min-height:0;display:flex;overflow:hidden}',
      '.dig-rail{width:32px;flex:none;display:flex;flex-direction:column;align-items:center;gap:2px;padding:4px 0;overflow:hidden;border-right:1px solid var(--dsw-alias-hairline,var(--dsw-alias-border-l1))}',
      '.dig-rail-gap{flex:1;min-height:2px}',
      '.dig-rail-gap-x{flex:1;min-width:2px}',
      '.dig-rail-row{display:flex;align-items:center;gap:2px;padding:3px 6px;flex:none;overflow:hidden;border-bottom:1px solid var(--dsw-alias-hairline,var(--dsw-alias-border-l1))}',
      '.dig-rail-btn{display:inline-flex;align-items:center;justify-content:center;width:24px;height:24px;border:none;border-radius:6px;background:transparent;color:var(--dsw-alias-label-secondary);cursor:pointer;padding:0;flex:none}',
      '.dig-rail-btn:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary)}',
      '.dig-rail-btn:disabled{opacity:.28;cursor:default}',
      '.dig-rail-btn-active{background:color-mix(in srgb, var(--dsw-alias-brand-primary) 20%, transparent)}',
      '.dig-rail-more,.dig-rail-settings{color:var(--dsw-alias-label-tertiary)}',
      '.dig-rail-more:hover,.dig-rail-settings:hover{color:var(--dsw-alias-label-primary)}',
      '.dig-tone-primary{color:var(--dsw-alias-label-primary)}',
      '.dig-tone-secondary{color:var(--dsw-alias-label-secondary)}',
      '.dig-tone-accent{color:var(--dsw-alias-brand-primary)}',
      '.dig-tone-success{color:var(--dsw-alias-state-success-primary)}',
      '.dig-tone-warn{color:var(--dsw-alias-state-warn-primary,var(--dsw-alias-brand-primary))}',
      '.dig-tone-danger{color:var(--dsw-alias-state-error-primary)}',
      '.dig-tone-violet{color:#b083f0}',
      '.dig-tone-cyan{color:#59b0d6}',
      '.dig-icon-btn-small{width:20px;height:20px;border-radius:5px}',
      '.dig-rail-list{display:flex;flex-direction:column;gap:2px;max-height:min(50vh,300px);overflow:auto;padding:2px;border:1px solid var(--dsw-alias-hairline,var(--dsw-alias-border-l1));border-radius:8px}',
      '.dig-rail-item{display:flex;align-items:center;gap:6px;padding:2px 4px;border-radius:6px}',
      '.dig-rail-item:hover{background:var(--dsw-alias-interactive-bg-hover)}',
      '.dig-rail-item-off{opacity:.5}',
      '.dig-rail-item-drag{outline:1px solid var(--dsw-alias-brand-primary)}',
      '.dig-rail-grip{display:inline-flex;color:var(--dsw-alias-label-dimmed,var(--dsw-alias-label-tertiary));cursor:grab;flex:none}',
      '.dig-rail-item-icon{display:inline-flex;flex:none}',
      '.dig-rail-item-label{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-weight:500}',
      '.dig-body{flex:1;min-height:0;display:flex;overflow:hidden}',
      '.dig-body-columns{flex-direction:row}',
      '.dig-body-stack{flex-direction:column}',
      '.dig-body-compact{flex-direction:column}',
      '.dig-pane{display:flex;flex-direction:column;min-height:0;min-width:0}',
      '.dig-pane-tree{width:200px;flex:none;border-right:1px solid var(--dsw-alias-hairline,var(--dsw-alias-border-l1))}',
      '.dig-pane-tree-stack{max-height:36%;flex:none;border-bottom:1px solid var(--dsw-alias-hairline,var(--dsw-alias-border-l1))}',
      '.dig-pane-main{flex:1;min-width:0}',
      '.dig-pane-changes{width:290px;flex:none;border-left:1px solid var(--dsw-alias-hairline,var(--dsw-alias-border-l1))}',
      '.dig-pane-changes-stack{max-height:46%;flex:none;border-bottom:1px solid var(--dsw-alias-hairline,var(--dsw-alias-border-l1))}',
      '.dig-compact-bar{display:flex;align-items:center;gap:6px;padding:4px 6px;flex:none}',
      '.dig-compact-tree{max-height:42%;flex:none;border-bottom:1px solid var(--dsw-alias-hairline,var(--dsw-alias-border-l1))}',
      '.dig-seg{display:inline-flex;gap:2px;padding:2px;border-radius:8px;background:var(--dsw-alias-interactive-bg-hover);flex:none}',
      '.dig-seg-item{border:none;background:transparent;color:var(--dsw-alias-label-secondary);font:inherit;font-weight:500;padding:2px 10px;border-radius:6px;cursor:pointer;white-space:nowrap}',
      '.dig-seg-item:hover{color:var(--dsw-alias-label-primary)}',
      '.dig-seg-item[data-active="true"]{background:var(--dsw-alias-bg-layer-2,var(--dsw-alias-bg-layer-1));color:var(--dsw-alias-label-primary)}',
      '.dig-search{padding:4px 6px;flex:none}',
      '.dig-input{width:100%;box-sizing:border-box;padding:4px 6px;border-radius:6px;border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);font:inherit;outline:none}',
      '.dig-input::placeholder{color:var(--dsw-alias-label-tertiary)}',
      '.dig-input:focus{border-color:var(--dsw-alias-brand-primary)}',
      '.dig-input-compact{padding:3px 6px}',
      '.dig-picker{display:flex;flex-direction:column;gap:2px;padding:12px;overflow:auto;flex:1;min-height:0}',
      '.dig-picker-title{color:var(--dsw-alias-label-primary);font-weight:600;margin-bottom:2px}',
      '.dig-picker-sub{color:var(--dsw-alias-label-tertiary);margin-bottom:8px;word-break:break-all}',
      '.dig-picker-row{display:flex;align-items:center;gap:8px;width:100%;text-align:left;border:1px solid var(--dsw-alias-border-l2);background:transparent;color:var(--dsw-alias-label-primary);font:inherit;padding:6px 8px;border-radius:8px;cursor:pointer}',
      '.dig-picker-row:hover{background:var(--dsw-alias-interactive-bg-hover);border-color:var(--dsw-alias-brand-primary)}',
      '.dig-picker-icon{display:inline-flex;color:var(--dsw-alias-label-secondary);flex:none}',
      '.dig-picker-name{flex:none;font-weight:600}',
      '.dig-picker-kind{color:var(--dsw-alias-label-tertiary);flex:none}',
      '.dig-picker-path{color:var(--dsw-alias-label-tertiary);margin-left:auto;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:50%}',
      '.dig-tree{display:flex;flex-direction:column;min-height:0;flex:1}',
      '.dig-tree-scroll{flex:1;overflow:auto;padding-bottom:6px}',
      '.dig-section{display:flex;flex-direction:column}',
      '.dig-section-head{display:flex;align-items:center;gap:4px;width:100%;padding:3px 8px;border:none;background:transparent;color:var(--dsw-alias-label-secondary);font:inherit;font-weight:600;cursor:pointer;text-align:left}',
      '.dig-section-head-static{cursor:default;padding-left:20px}',
      '.dig-section-head:hover{color:var(--dsw-alias-label-primary)}',
      '.dig-count{margin-left:auto;opacity:.6;font-weight:400}',
      '.dig-chevron{display:inline-flex;transform:rotate(-90deg);transition:transform .12s ease}',
      '.dig-chevron-open{transform:rotate(0deg)}',
      '.dig-row{display:flex;align-items:center;gap:5px;padding:2px 8px;cursor:pointer;white-space:nowrap;overflow:hidden}',
      '.dig-row:hover{background:var(--dsw-alias-interactive-bg-hover)}',
      '.dig-row-head{color:var(--dsw-alias-state-warn-primary,var(--dsw-alias-brand-primary))}',
      '.dig-row-selected{background:var(--dsw-alias-interactive-bg-active,var(--dsw-alias-interactive-bg-hover))}',
      '.dig-row-remote .dig-row-label{color:var(--dsw-alias-label-secondary);font-weight:500}',
      '.dig-row-tag .dig-row-label{color:var(--dsw-alias-state-warn-primary,var(--dsw-alias-brand-primary));font-weight:500}',
      '.dig-row-head .dig-row-label{font-weight:600}',
      '.dig-row-icon{display:inline-flex;flex:none;opacity:.9}',
      '.dig-row-label{overflow:hidden;text-overflow:ellipsis;flex:1;min-width:0;font-weight:600}',
      '.dig-row-sub{color:var(--dsw-alias-label-tertiary);font-size:11px;flex:none;max-width:45%;overflow:hidden;text-overflow:ellipsis}',
      '.dig-row-dir{margin-left:auto;opacity:.75}',
      '.dig-badge{font-size:10px;padding:0 5px;border-radius:999px;background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-secondary);flex:none}',
      '.dig-badge-muted{opacity:.8}',
      '.dig-history{display:flex;flex-direction:column;min-height:0;flex:1}',
      '.dig-history-scroll{flex:1;overflow:auto}',
      '.dig-commit{display:flex;align-items:center;gap:6px;padding:1px 8px 1px 0;cursor:pointer;height:26px;overflow:hidden}',
      '.dig-commit:hover{background:var(--dsw-alias-interactive-bg-hover)}',
      '.dig-commit-selected{background:var(--dsw-alias-interactive-bg-active,var(--dsw-alias-interactive-bg-hover))}',
      '.dig-graph{flex:none}',
      '.dig-commit-date{color:var(--dsw-alias-label-tertiary);flex:none;width:54px;font-variant-numeric:tabular-nums;font-weight:500}',
      '.dig-commit-author{color:var(--dsw-alias-label-secondary);flex:none;width:96px;overflow:hidden;text-overflow:ellipsis;font-weight:500}',
      '.dig-commit-subject{flex:0 1 auto;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-weight:600}',
      '.dig-commit-fill{flex:1 1 0;min-width:0}',
      '.dig-ref{font-size:10px;padding:0 5px;border-radius:999px;background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-secondary);flex:none;max-width:130px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-weight:600}',
      '.dig-ref-head{color:var(--dsw-alias-state-success-primary)}',
      '.dig-ref-local{color:var(--dsw-alias-brand-primary)}',
      '.dig-ref-remote{color:#b083f0}',
      '.dig-ref-tag{color:var(--dsw-alias-state-warn-primary,var(--dsw-alias-brand-primary))}',
      '.dig-ref-more{color:var(--dsw-alias-label-tertiary)}',
      '.dig-filters{display:flex;align-items:center;gap:4px;padding:4px 6px;flex:none;min-width:0;overflow-x:auto;overflow-y:hidden;border-bottom:1px solid var(--dsw-alias-hairline,var(--dsw-alias-border-l1))}',
      '.dig-filter-text{flex:1 1 90px;min-width:80px;width:auto}',
      '.dig-filter-select{flex:none;max-width:118px;appearance:none;-webkit-appearance:none;background:transparent;border:1px solid var(--dsw-alias-border-l2);border-radius:6px;color:var(--dsw-alias-label-secondary);font:inherit;font-weight:500;height:22px;padding:0 4px;cursor:pointer;text-overflow:ellipsis}',
      '.dig-filter-select:hover{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary)}',
      '.dig-filter-path{flex:0 1 112px;min-width:70px;display:flex}',
      '.dig-load-more{margin:6px auto;display:block;padding:3px 12px;border-radius:6px;border:1px solid var(--dsw-alias-border-l2);background:transparent;color:var(--dsw-alias-label-secondary);font:inherit;cursor:pointer}',
      '.dig-load-more:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary)}',
      '.dig-empty{padding:14px;text-align:center;color:var(--dsw-alias-label-tertiary);font-weight:500}',
      '.dig-changes{display:flex;flex-direction:column;min-height:0;flex:1}',
      '.dig-changes-body{display:flex;flex-direction:column;min-height:0;flex:1}',
      '.dig-changes-list{flex:1;overflow:auto;min-height:0}',
      '.dig-group{display:flex;flex-direction:column}',
      '.dig-group-head{display:flex;align-items:center;gap:8px;padding:2px 8px;color:var(--dsw-alias-label-secondary);font-size:11px;font-weight:600}',
      '.dig-link{margin-left:auto;border:none;background:transparent;color:var(--dsw-alias-brand-primary);font:inherit;cursor:pointer;padding:0;flex:none}',
      '.dig-link:hover{text-decoration:underline}',
      '.dig-row-file{gap:6px}',
      '.dig-file-status{flex:none;width:14px;text-align:center;font-weight:700;font-size:10px;color:var(--dsw-alias-state-warn-primary,var(--dsw-alias-label-secondary))}',
      '.dig-file-status-A{color:var(--dsw-alias-state-success-primary)}',
      '.dig-file-status-D{color:var(--dsw-alias-state-error-primary)}',
      '.dig-file-status-R{color:var(--dsw-alias-brand-primary)}',
      '.dig-file-status-U{color:var(--dsw-alias-label-tertiary)}',
      '.dig-stat-add{color:var(--dsw-alias-state-success-primary);flex:none;font-variant-numeric:tabular-nums}',
      '.dig-stat-del{color:var(--dsw-alias-state-error-primary);flex:none;font-variant-numeric:tabular-nums}',
      '.dig-mini{display:inline-flex;align-items:center;justify-content:center;width:18px;height:18px;border:none;border-radius:5px;background:transparent;color:var(--dsw-alias-label-secondary);cursor:pointer;opacity:0;flex:none;padding:0}',
      '.dig-row:hover .dig-mini{opacity:1}',
      '.dig-mini:hover{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary)}',
      '.dig-commit-box{flex:none;padding:6px;display:flex;flex-direction:column;gap:6px;border-top:1px solid var(--dsw-alias-hairline,var(--dsw-alias-border-l1))}',
      '.dig-commit-box-compact{flex-direction:row;align-items:center;gap:6px;padding:4px 6px}',
      '.dig-textarea{width:100%;box-sizing:border-box;min-height:50px;resize:vertical;padding:5px 6px;border-radius:6px;border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);font:inherit;outline:none}',
      '.dig-textarea::placeholder{color:var(--dsw-alias-label-tertiary)}',
      '.dig-textarea:focus{border-color:var(--dsw-alias-brand-primary)}',
      '.dig-commit-actions{display:flex;align-items:center;gap:8px}',
      '.dig-check{display:inline-flex;align-items:center;gap:4px;color:var(--dsw-alias-label-secondary);cursor:pointer}',
      '.dig-btn{padding:3px 10px;border-radius:6px;border:1px solid var(--dsw-alias-border-l2);background:transparent;color:var(--dsw-alias-label-primary);font:inherit;font-weight:500;cursor:pointer;flex:none}',
      '.dig-btn:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover)}',
      '.dig-btn:disabled{opacity:.45;cursor:default}',
      '.dig-btn-small{padding:2px 8px;font-size:11px}',
      '.dig-btn-primary{margin-left:auto;background:var(--dsw-alias-button-primary-fill,var(--dsw-alias-brand-primary));border-color:transparent;color:var(--dsw-alias-label-primary-inverted,#fff)}',
      '.dig-btn-primary:hover:not(:disabled){background:var(--dsw-alias-button-primary-hover,var(--dsw-alias-brand-primary))}',
      '.dig-btn-danger{background:var(--dsw-alias-state-error-primary);border-color:transparent;color:var(--dsw-alias-label-primary-inverted,#fff)}',
      '.dig-detail{display:flex;flex-direction:column;min-height:0;flex:1;overflow:auto;padding:6px 8px;gap:6px}',
      '.dig-detail-head{display:flex;align-items:center;gap:8px;flex-wrap:wrap}',
      '.dig-detail-author,.dig-detail-date{color:var(--dsw-alias-label-tertiary)}',
      '.dig-detail-subject{font-weight:600;white-space:pre-wrap}',
      '.dig-detail-body{margin:0;white-space:pre-wrap;color:var(--dsw-alias-label-secondary);font:inherit}',
      '.dig-detail-files-head{font-weight:600;margin-top:4px}',
      '.dig-detail-files{display:flex;flex-direction:column}',
      '.dig-mono{font-family:ui-monospace,SFMono-Regular,Menlo,monospace}',
      '.dig-diff-pane{flex:none;max-height:55%;display:flex;flex-direction:column;min-height:0;border-top:1px solid var(--dsw-alias-hairline,var(--dsw-alias-border-l1))}',
      '.dig-diff-head{display:flex;align-items:center;gap:8px;padding:3px 8px;color:var(--dsw-alias-label-tertiary);flex:none;min-width:0}',
      '.dig-diff-path{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex:1;min-width:0}',
      '.dig-diff{flex:1;overflow:auto;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:12px;line-height:1.5;font-weight:500;min-height:0}',
      '.dig-diff-line{display:flex;gap:8px;padding:0 6px;white-space:pre}',
      '.dig-diff-gutter{width:32px;flex:none;text-align:right;color:var(--dsw-alias-label-dimmed,var(--dsw-alias-label-tertiary));user-select:none}',
      '.dig-diff-text{white-space:pre-wrap;word-break:break-word;flex:1;min-width:0}',
      '.dig-diff-add{background:color-mix(in srgb, var(--dsw-alias-state-success-primary) 16%, transparent)}',
      '.dig-diff-del{background:color-mix(in srgb, var(--dsw-alias-state-error-primary) 16%, transparent)}',
      '.dig-diff-hunk{color:var(--dsw-alias-brand-primary);background:color-mix(in srgb, var(--dsw-alias-brand-primary) 12%, transparent)}',
      '.dig-diff-meta{color:var(--dsw-alias-label-tertiary)}',
      '.dig-overlay{position:absolute;inset:0;padding:8px;box-sizing:border-box;background:var(--dsw-alias-bg-mask-1,rgba(0,0,0,.42));display:flex;align-items:center;justify-content:center;z-index:60}',
      '.dig-dialog{min-width:240px;max-width:min(420px,94%);max-height:100%;overflow:auto;background:var(--dsw-alias-bg-layer-2,var(--dsw-alias-bg-layer-1));border:1px solid var(--dsw-alias-border-l2);border-radius:10px;padding:14px;display:flex;flex-direction:column;gap:10px;box-shadow:0 12px 32px rgba(0,0,0,.35)}',
      '.dig-dialog-wide{min-width:min(360px,92%)}',
      '.dig-dialog-title{font-weight:600}',
      '.dig-dialog-text{color:var(--dsw-alias-label-secondary);white-space:pre-wrap}',
      '.dig-dialog-actions{display:flex;justify-content:flex-end;gap:8px}',
      '.dig-dialog-actions .dig-btn-primary{margin-left:0}',
      '.dig-menu{position:absolute;z-index:70;min-width:200px;max-width:calc(100% - 8px);max-height:calc(100% - 8px);overflow:auto;overscroll-behavior:contain;padding:4px;border-radius:8px;background:var(--dsw-alias-bg-layer-2,var(--dsw-alias-bg-layer-1));border:1px solid var(--dsw-alias-border-l2);box-shadow:0 10px 28px rgba(0,0,0,.35);display:flex;flex-direction:column}',
      '.dig-menu-item{display:flex;align-items:center;gap:8px;padding:4px 8px;border:none;background:transparent;color:var(--dsw-alias-label-primary);font:inherit;font-weight:500;text-align:left;border-radius:5px;cursor:pointer;white-space:nowrap;overflow:hidden}',
      '.dig-menu-icon{display:inline-flex;flex:none}',
      '.dig-menu-label{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis}',
      '.dig-menu-item:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover)}',
      '.dig-menu-item-active{color:var(--dsw-alias-state-warn-primary,var(--dsw-alias-brand-primary))}',
      '.dig-menu-danger,.dig-menu-danger .dig-menu-label{color:var(--dsw-alias-state-error-primary)}',
      '.dig-menu-disabled{opacity:.38;cursor:default}',
      '.dig-menu-sep{height:1px;margin:3px 6px;background:var(--dsw-alias-hairline,var(--dsw-alias-border-l1))}',
    ].join('\n')

    /* ============================== plugin ============================== */

    function apply(ctx) {
      const style = document.createElement('style')
      style.setAttribute('data-dsh-ide-git', '')
      style.textContent = CSS
      document.head.appendChild(style)
      ctx.effect(() => () => { style.remove() }, 'dsh-ide-git: panel styles')

      const dict = dictionaryOf(ctx)
      const t = (key) => (Object.prototype.hasOwnProperty.call(dict, key) ? dict[key] : key)

      ctx.effect(() => ctx.betterSidebar.registerTab({
        id: TAB_ID,
        title: () => t('title'),
        description: () => t('description'),
        icon: (size) => E(Icon, { name: 'commit', size: size === undefined ? 16 : size }),
        order: 21,
        single: true,
        component: (tabProps) => E(Panel, Object.assign({}, tabProps, { t: t })),
      }), 'dsh-ide-git: Git tab')
    }

    return { name: 'dsh-ide-git', inject: ['betterSidebar'], apply }
  },
})
