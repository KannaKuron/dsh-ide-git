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

    const API_BASE = '/dsh-ide-git/api'
    const TAB_ID = 'dsh-ide-git:panel'
    const LANE_WIDTH = 14
    const LANE_COLORS = ['#4d6bfe', '#e2a03f', '#3fb950', '#d2679b', '#59b0d6', '#b083f0', '#d2694a', '#8a9aa8']
    const AUTO_REFRESH_MS = 12000
    const REPO_KEY = 'dsh-ide-git.repo.v1'
    const COMPACT_MAX_HEIGHT = 330
    const COMPACT_MAX_WIDTH = 470

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
      let laneCount = 1
      for (const commit of commits) {
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
        if (lanes.length > laneCount) laneCount = lanes.length
        rows.push({ commit, lane, parentLanes, lanes: lanes.slice() })
      }
      for (const row of rows) row.width = laneCount
      return rows
    }

    function GraphCell(props) {
      const row = props.row
      const previous = props.previous
      const height = props.height
      const width = Math.max(1, row.width) * LANE_WIDTH + 8
      const children = []
      const x = (lane) => 8 + lane * LANE_WIDTH
      const previousLanes = previous === null || previous === undefined ? [] : previous.lanes
      const depth = Math.max(row.lanes.length, previousLanes.length)
      for (let lane = 0; lane < depth; lane += 1) {
        const below = row.lanes[lane]
        const above = previousLanes[lane]
        if ((below === null || below === undefined) && (above === null || above === undefined)) continue
        const startY = lane === row.lane ? height / 2 : 0
        children.push(E('line', {
          key: 'lane-' + lane,
          x1: x(lane), y1: startY, x2: x(lane), y2: height,
          stroke: LANE_COLORS[lane % LANE_COLORS.length], strokeWidth: 1.6,
        }))
      }
      for (const parentLane of row.parentLanes) {
        children.push(E('path', {
          key: 'edge-' + parentLane,
          d: 'M ' + x(row.lane) + ' ' + (height / 2) + ' C ' + x(row.lane) + ' ' + height + ', ' + x(parentLane) + ' ' + (height / 2) + ', ' + x(parentLane) + ' ' + height,
          fill: 'none',
          stroke: LANE_COLORS[parentLane % LANE_COLORS.length],
          strokeWidth: 1.6,
        }))
      }
      children.push(E('circle', { key: 'dot', cx: x(row.lane), cy: height / 2, r: 4, fill: LANE_COLORS[row.lane % LANE_COLORS.length] }))
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
    }

    function Icon(props) {
      const size = props.size === undefined ? 14 : props.size
      const shape = ICONS[props.name] === undefined ? ICONS.commit : ICONS[props.name]
      return E('svg', {
        className: 'dig-icon', width: size, height: size, viewBox: '0 0 16 16',
        fill: 'none', stroke: 'currentColor', strokeWidth: 1.4,
        strokeLinecap: 'round', strokeLinejoin: 'round',
      }, shape.map((d, index) => E('path', { key: index, d: d })))
    }

    function ContextMenu(props) {
      const ref = useRef(null)
      const [position, setPosition] = useState({ left: props.anchor.x, top: props.anchor.y })
      useEffect(() => {
        const element = ref.current
        if (element === null) return
        const rect = element.getBoundingClientRect()
        setPosition({
          left: Math.max(4, Math.min(props.anchor.x, window.innerWidth - rect.width - 8)),
          top: Math.max(4, Math.min(props.anchor.y, window.innerHeight - rect.height - 8)),
        })
      }, [props.anchor.x, props.anchor.y])
      useEffect(() => {
        const onDown = (event) => {
          if (ref.current !== null && ref.current.contains(event.target)) return
          props.onClose()
        }
        const onKey = (event) => { if (event.key === 'Escape') props.onClose() }
        const timer = setTimeout(() => document.addEventListener('mousedown', onDown, true), 0)
        document.addEventListener('keydown', onKey)
        return () => {
          clearTimeout(timer)
          document.removeEventListener('mousedown', onDown, true)
          document.removeEventListener('keydown', onKey)
        }
      }, [props.onClose])
      return E('div', { className: 'dig-menu', ref: ref, style: { left: position.left + 'px', top: position.top + 'px' } },
        props.items.map((item, index) => (item === null
          ? E('div', { key: 'sep-' + index, className: 'dig-menu-sep' })
          : E('button', {
              key: item.id + '-' + index,
              type: 'button',
              className: 'dig-menu-item' + (item.danger === true ? ' dig-menu-danger' : '') + (item.disabled === true ? ' dig-menu-disabled' : ''),
              disabled: item.disabled === true,
              onClick: () => { props.onClose(); item.run() },
            }, item.label))))
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
      return E('div', {
        className: 'dig-row' + (isHead ? ' dig-row-head' : ''),
        title: entry.upstream === null || entry.upstream === undefined ? entry.name : entry.name + ' → ' + entry.upstream,
        onClick: () => props.onCheckout(entry),
        onContextMenu: (event) => { event.preventDefault(); props.onMenu(event, entry) },
      },
        E('span', { className: 'dig-row-icon' }, E(Icon, { name: isHead ? 'star' : entry.remote === true ? 'fetch' : 'branch', size: 12 })),
        E('span', { className: 'dig-row-label' }, entry.name),
        entry.worktree === null || entry.worktree === undefined ? null : E('span', { className: 'dig-badge dig-badge-muted', title: entry.worktree }, 'W'),
        entry.ahead > 0 ? E('span', { className: 'dig-badge' }, '↑' + entry.ahead) : null,
        entry.behind > 0 ? E('span', { className: 'dig-badge' }, '↓' + entry.behind) : null)
    }

    function BranchTree(props) {
      const t = props.t
      const [filter, setFilter] = useState('')
      const [collapsed, setCollapsed] = useState({ remote: false, tags: true })
      const branches = props.branches
      const needle = filter.trim().toLowerCase()
      const match = (name) => needle === '' || String(name).toLowerCase().indexOf(needle) >= 0
      const locals = (branches === null ? [] : branches.local).filter((entry) => match(entry.name))
      const remotes = (branches === null ? [] : branches.remote).filter((entry) => match(entry.name))
      const tags = (branches === null ? [] : branches.tags).filter((entry) => match(entry.name))
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

    function HistoryList(props) {
      const t = props.t
      const [filter, setFilter] = useState('')
      const rows = useMemo(() => buildRows(props.commits), [props.commits])
      const needle = filter.trim().toLowerCase()
      const visible = useMemo(() => {
        if (needle === '') return rows
        return rows.filter((row) => {
          const commit = row.commit
          return commit.subject.toLowerCase().indexOf(needle) >= 0 ||
            commit.hash.toLowerCase().indexOf(needle) === 0 ||
            commit.author.toLowerCase().indexOf(needle) >= 0
        })
      }, [rows, needle])
      return E('div', { className: 'dig-history' },
        props.hideSearch === true ? null : E('div', { className: 'dig-search' },
          E('input', {
            className: 'dig-input dig-input-compact', value: filter, spellCheck: false,
            placeholder: t('history.filter'),
            onChange: (event) => setFilter(event.target.value),
          })),
        E('div', { className: 'dig-history-scroll' },
          visible.length === 0 ? E('div', { className: 'dig-empty' }, t('history.empty')) : null,
          visible.map((row, index) => {
            const commit = row.commit
            return E('div', {
              key: commit.hash,
              className: 'dig-commit' + (props.selectedHash === commit.hash ? ' dig-commit-selected' : ''),
              onClick: () => props.onSelect(commit),
              onContextMenu: (event) => { event.preventDefault(); props.onMenu(event, commit) },
            },
              E(GraphCell, { row: row, previous: index === 0 ? null : visible[index - 1], height: 26 }),
              E('span', { className: 'dig-commit-date', title: shortDate(commit.date) }, relativeTime(commit.date)),
              E('span', { className: 'dig-commit-author' }, commit.author),
              E('span', { className: 'dig-commit-subject' }, commit.subject),
              commit.refs.map((ref) => E('span', {
                key: ref,
                className: 'dig-ref' + (ref.indexOf('HEAD') >= 0 ? ' dig-ref-head' : ref.indexOf('tag:') >= 0 ? ' dig-ref-tag' : ''),
              }, ref.replace('HEAD -> ', '').replace('tag: ', ''))))
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

      const compact = size.height > 0 && (size.height < COMPACT_MAX_HEIGHT || size.width < COMPACT_MAX_WIDTH)
      const columns = !compact && size.width >= 640 && size.width >= size.height * 1.4

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

      const loadCommits = useCallback(async (skip) => {
        const data = await request('log', Object.assign({}, base, { skip: skip === undefined ? 0 : skip, limit: 120 }))
        setCommits((previous) => (skip === undefined || skip === 0 ? data.commits : previous.concat(data.commits)))
        setHasMore(data.hasMore)
      }, [base])

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

      const branchMenu = useCallback((event, entry) => {
        const current = branches === null ? '' : branches.branch
        const isLocal = entry.remote !== true && entry.tag !== true
        const items = [
          { id: 'checkout', label: t('action.checkout'), disabled: entry.head === true || entry.tag === true, run: () => { void checkout(entry) } },
          isLocal ? { id: 'rebase', label: t('action.rebaseCurrentOnto'), disabled: entry.head === true, run: () => { void run('rebase', { onto: entry.name }) } } : null,
          isLocal ? { id: 'merge', label: t('action.mergeIntoCurrent'), disabled: entry.head === true, run: () => { void run('merge', { branch: entry.name }) } } : null,
          { id: 'compare', label: t('action.compare'), disabled: entry.head === true || current === '', run: () => { void compareWith(current, entry.name) } },
          null,
          { id: 'newBranch', label: t('action.newBranchFrom'), run: () => setDialog({ kind: 'newBranch', from: entry.name }) },
          isLocal ? { id: 'rename', label: t('action.rename'), run: () => setDialog({ kind: 'renameBranch', from: entry.name }) } : null,
          isLocal ? { id: 'delete', label: t('action.delete'), danger: true, disabled: entry.head === true, run: () => setDialog({ kind: 'deleteBranch', name: entry.name }) } : null,
          null,
          { id: 'update', label: t('action.update'), run: () => { void run('fetch', { prune: true }) } },
          { id: 'push', label: t('action.push'), run: () => setDialog({ kind: 'push' }) },
        ].filter((item) => item !== null)
        setMenu({ x: event.clientX, y: event.clientY, items: items })
      }, [branches, checkout, run, t, compareWith])

      const commitMenu = useCallback((event, commit) => {
        const items = [
          { id: 'details', label: t('action.details'), run: () => { void selectCommit(commit) } },
          { id: 'copy', label: t('action.copyHash'), run: () => { copyText(commit.hash) } },
          null,
          { id: 'checkout', label: t('action.checkout'), run: () => setDialog({ kind: 'checkoutCommit', hash: commit.hash }) },
          { id: 'branch', label: t('action.newBranchHere'), run: () => setDialog({ kind: 'newBranch', from: commit.hash }) },
          { id: 'tag', label: t('action.newTag'), run: () => setDialog({ kind: 'newTag', hash: commit.hash }) },
          null,
          { id: 'cherry', label: t('action.cherryPick'), run: () => { void run('cherryPick', { hash: commit.hash }) } },
          { id: 'revert', label: t('action.revert'), run: () => { void run('revert', { hash: commit.hash }) } },
          null,
          { id: 'resetSoft', label: t('action.resetSoft'), run: () => setDialog({ kind: 'reset', hash: commit.hash, mode: 'mixed' }) },
          { id: 'resetHard', label: t('action.resetHard'), danger: true, run: () => setDialog({ kind: 'reset', hash: commit.hash, mode: 'hard' }) },
        ]
        setMenu({ x: event.clientX, y: event.clientY, items: items })
      }, [run, selectCommit, t])

      const changeMenu = useCallback((event, item, group) => {
        const items = [
          { id: 'diff', label: t('action.showDiff'), run: () => { void openDiff({ path: item.path, staged: group === 'staged' }) } },
          null,
          group === 'staged'
            ? { id: 'unstage', label: t('action.unstage'), run: () => { void run('unstage', { paths: [item.path] }) } }
            : { id: 'stage', label: t('action.stage'), run: () => { void run('stage', { paths: [item.path] }) } },
          { id: 'discard', label: t('action.discard'), danger: true, disabled: group === 'untracked', run: () => setDialog({ kind: 'discard', item: item, group: group }) },
          null,
          { id: 'copy', label: t('action.copyPath'), run: () => { copyText(item.path) } },
        ]
        setMenu({ x: event.clientX, y: event.clientY, items: items })
      }, [openDiff, run, t])

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
        busy ? E('span', { className: 'dig-busy' }, t('status.busy')) : null,
        E('button', { type: 'button', className: 'dig-icon-btn', title: t('toolbar.refresh'), onClick: () => setTick((value) => value + 1) }, E(Icon, { name: 'refresh' })),
        E('button', { type: 'button', className: 'dig-icon-btn', title: t('toolbar.newBranch'), onClick: () => setDialog({ kind: 'newBranch' }) }, E(Icon, { name: 'plus' })),
        E('button', { type: 'button', className: 'dig-icon-btn', title: t('toolbar.fetch'), disabled: busy, onClick: () => { void run('fetch', { prune: true }) } }, E(Icon, { name: 'fetch' })),
        compact ? null : E('button', { type: 'button', className: 'dig-icon-btn', title: t('toolbar.pull'), disabled: busy, onClick: () => { void run('pull', { mode: 'ff-only' }) } }, E(Icon, { name: 'pull' })),
        E('button', { type: 'button', className: 'dig-icon-btn', title: t('toolbar.push'), disabled: busy, onClick: () => setDialog({ kind: 'push' }) }, E(Icon, { name: 'push' })),
        compact ? null : E('button', {
          type: 'button', className: 'dig-icon-btn' + (treeOpen ? ' dig-icon-btn-active' : ''), title: t('toolbar.tree'),
          onClick: () => setTreeOpen((value) => !value),
        }, E(Icon, { name: 'branch' })))

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
            t: t, commits: commits, hasMore: hasMore, busy: busy, selectedHash: selectedHash, hideSearch: compact,
            onSelect: (commit) => { void selectCommit(commit) },
            onMenu: commitMenu,
            onLoadMore: () => { void guard(() => loadCommits(commits.length)) },
          })

      const diffPane = patch === '' && patchLoading === false ? null : E('div', { className: 'dig-diff-pane' },
        E('div', { className: 'dig-diff-head' },
          E('span', { className: 'dig-mono dig-diff-path' }, selectedPath === null ? '' : selectedPath),
          E('button', { type: 'button', className: 'dig-icon-btn', onClick: () => { setPatch(''); setSelectedPath(null) } }, E(Icon, { name: 'close', size: 12 }))),
        E(DiffBody, { patch: patch, loading: patchLoading, t: t }))

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
          treeOpen ? E('div', { className: 'dig-compact-tree' }, E(BranchTree, { t: t, branches: branches, onCheckout: checkout, onBranchMenu: branchMenu })) : null,
          view === 'changes' ? changesPane : E('div', { className: 'dig-pane dig-pane-main' }, historyPane, diffPane))
      } else if (columns) {
        body = E('div', { className: 'dig-body dig-body-columns' },
          treeOpen ? E('div', { className: 'dig-pane dig-pane-tree' }, E(BranchTree, { t: t, branches: branches, onCheckout: checkout, onBranchMenu: branchMenu })) : null,
          E('div', { className: 'dig-pane dig-pane-main' }, historyPane, diffPane),
          E('div', { className: 'dig-pane dig-pane-changes' }, changesPane))
      } else {
        body = E('div', { className: 'dig-body dig-body-stack' },
          treeOpen ? E('div', { className: 'dig-pane dig-pane-tree-stack' }, E(BranchTree, { t: t, branches: branches, onCheckout: checkout, onBranchMenu: branchMenu })) : null,
          E('div', { className: 'dig-pane dig-pane-changes-stack' }, changesPane),
          E('div', { className: 'dig-pane dig-pane-main' }, historyPane, diffPane))
      }

      /* ---------- overlays ---------- */

      const overlays = []
      if (menu !== null) {
        overlays.push(E(ContextMenu, {
          key: 'menu', anchor: { x: menu.x, y: menu.y }, items: menu.items, onClose: () => setMenu(null),
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

      return E('div', { className: 'dig-root', ref: hostRef }, topBar, banner, noteBanner, body, overlays)
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
      '.dig-root{display:flex;flex-direction:column;height:100%;min-height:0;background:transparent;color:var(--dsw-alias-label-primary);font-family:var(--dsw-font-family,system-ui,sans-serif);font-size:12.5px;line-height:1.5;font-weight:500;overflow:hidden}',
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
      '.dig-row-icon{display:inline-flex;flex:none;opacity:.9}',
      '.dig-row-label{overflow:hidden;text-overflow:ellipsis;flex:1;min-width:0;font-weight:500}',
      '.dig-row-sub{color:var(--dsw-alias-label-tertiary);font-size:11px;flex:none;max-width:45%;overflow:hidden;text-overflow:ellipsis}',
      '.dig-row-dir{margin-left:auto;opacity:.75}',
      '.dig-badge{font-size:10px;padding:0 5px;border-radius:999px;background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-secondary);flex:none}',
      '.dig-badge-muted{opacity:.8}',
      '.dig-history{display:flex;flex-direction:column;min-height:0;flex:1}',
      '.dig-history-scroll{flex:1;overflow:auto}',
      '.dig-commit{display:flex;align-items:center;gap:6px;padding:1px 6px 1px 0;cursor:pointer;height:26px;overflow:hidden}',
      '.dig-commit:hover{background:var(--dsw-alias-interactive-bg-hover)}',
      '.dig-commit-selected{background:var(--dsw-alias-interactive-bg-active,var(--dsw-alias-interactive-bg-hover))}',
      '.dig-graph{flex:none}',
      '.dig-commit-date{color:var(--dsw-alias-label-tertiary);flex:none;font-variant-numeric:tabular-nums;min-width:24px;font-weight:500}',
      '.dig-commit-author{color:var(--dsw-alias-label-secondary);flex:none;max-width:110px;overflow:hidden;text-overflow:ellipsis;font-weight:500}',
      '.dig-commit-subject{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-weight:500}',
      '.dig-ref{font-size:10px;padding:0 5px;border-radius:999px;background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-secondary);flex:none;max-width:150px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
      '.dig-ref-head{color:var(--dsw-alias-state-warn-primary,var(--dsw-alias-brand-primary))}',
      '.dig-ref-tag{color:var(--dsw-alias-brand-primary)}',
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
      '.dig-diff{flex:1;overflow:auto;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:11.5px;line-height:1.5;font-weight:500;min-height:0}',
      '.dig-diff-line{display:flex;gap:8px;padding:0 6px;white-space:pre}',
      '.dig-diff-gutter{width:32px;flex:none;text-align:right;color:var(--dsw-alias-label-dimmed,var(--dsw-alias-label-tertiary));user-select:none}',
      '.dig-diff-text{white-space:pre-wrap;word-break:break-word;flex:1;min-width:0}',
      '.dig-diff-add{background:color-mix(in srgb, var(--dsw-alias-state-success-primary) 16%, transparent)}',
      '.dig-diff-del{background:color-mix(in srgb, var(--dsw-alias-state-error-primary) 16%, transparent)}',
      '.dig-diff-hunk{color:var(--dsw-alias-brand-primary);background:color-mix(in srgb, var(--dsw-alias-brand-primary) 12%, transparent)}',
      '.dig-diff-meta{color:var(--dsw-alias-label-tertiary)}',
      '.dig-overlay{position:fixed;inset:0;background:var(--dsw-alias-bg-mask-1,rgba(0,0,0,.42));display:flex;align-items:center;justify-content:center;z-index:60}',
      '.dig-dialog{min-width:260px;max-width:min(420px,90vw);background:var(--dsw-alias-bg-layer-2,var(--dsw-alias-bg-layer-1));border:1px solid var(--dsw-alias-border-l2);border-radius:10px;padding:14px;display:flex;flex-direction:column;gap:10px;box-shadow:0 12px 32px rgba(0,0,0,.35)}',
      '.dig-dialog-title{font-weight:600}',
      '.dig-dialog-text{color:var(--dsw-alias-label-secondary);white-space:pre-wrap}',
      '.dig-dialog-actions{display:flex;justify-content:flex-end;gap:8px}',
      '.dig-dialog-actions .dig-btn-primary{margin-left:0}',
      '.dig-menu{position:fixed;z-index:70;min-width:190px;padding:4px;border-radius:8px;background:var(--dsw-alias-bg-layer-2,var(--dsw-alias-bg-layer-1));border:1px solid var(--dsw-alias-border-l2);box-shadow:0 10px 28px rgba(0,0,0,.35);display:flex;flex-direction:column}',
      '.dig-menu-item{padding:4px 8px;border:none;background:transparent;color:var(--dsw-alias-label-primary);font:inherit;text-align:left;border-radius:5px;cursor:pointer;white-space:nowrap}',
      '.dig-menu-item:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover)}',
      '.dig-menu-danger{color:var(--dsw-alias-state-error-primary)}',
      '.dig-menu-disabled{opacity:.4;cursor:default}',
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
