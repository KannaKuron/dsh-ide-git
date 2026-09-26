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

    /* API base is MOUNT-RELATIVE (no leading slash). dsh 0.1.7 serves the
       shell with <base href="./">, so document.baseURI is the mount the page
       was loaded from — the origin root, or a prefix-stripping proxy's sub-path
       (issue #4). fetch() resolves this relative path against the document
       base, so the panel's calls land on /dsh-ide-git/api at the origin root
       and on <mount>/dsh-ide-git/api under a sub-path, both matching the route
       the host half registered at its upstream path. An origin-absolute base
       would escape the mount and 404 behind any strict proxy. */
    const API_BASE = 'dsh-ide-git/api'
    const TAB_ID = 'dsh-ide-git:panel'
    /* The bundle's package name: the key the Plugins page uses for a bundle's own
       page and its `plugins.bundle.config` slot. */
    const SETTINGS_BUNDLE = 'dsh-ide-git'
    /* The namespace this plugin's dictionaries are published under in the DSH
       locale registry. */
    const LOCALE_NS = 'dsh-ide-git'
    const LANE_WIDTH = 14
    /* Hard cap on the drawn lane columns. Lanes beyond the cap collapse into
       the last column: without the cap a branchy repository pushed the graph
       wider than the panel and shoved the subject column out of view. */
    const GRAPH_MAX_LANES = 7
    const LANE_COLORS = ['#4d6bfe', '#e2a03f', '#3fb950', '#d2679b', '#59b0d6', '#b083f0', '#d2694a', '#8a9aa8']
    const AUTO_REFRESH_MS = 12000
    const REPO_KEY = 'dsh-ide-git.repo.v1'
    const COMPACT_MAX_WIDTH = 400
    /* Branch rows sit one step right of their SECTION header, and each namespace
       folder adds another step. Without the base step the rows started at 8px —
       left of the section title, which reads as "no indentation at all".
       Folder headers use the same formula, so a folder's chevron lines up with the
       icon of a branch on the same level. */
    const BRANCH_INDENT_BASE = 34
    const BRANCH_INDENT_STEP = 14

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
      'branches.pickHint': '单击选中,双击签出',
      'branches.worktree': '已在另一工作区检出',
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
      'changes.groupBy': '分组依据',
      'changes.groupFlat': '平铺',
      'changes.groupDir': '按目录',
      'changes.expandAll': '全部展开',
      'changes.foldAll': '全部折叠',
      'changes.showIgnored': '显示忽略的文件',
      'changes.rootDir': '(根目录)',
      'changes.commitAndPush': '提交并推送',
      'action.stage': '暂存',
      'action.unstage': '取消暂存',
      'action.discard': '丢弃更改',
      'action.showDiff': '显示差异',
      'action.copyPath': '复制路径',
      'action.checkout': '签出',
      'action.float': '浮动本页',
      'action.dock': '收回停靠',
      'action.split': '分栏',
      'action.fullscreen': '全屏',
      'action.exitFullscreen': '退出全屏',
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
      'pane.diff': '差异视图',
      'pane.resize': '拖动调整{name}尺寸,双击复位,方向键微调',
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
      'rail.openSettings': '打开插件设置',
      'settings.rail.title': '动作条按钮',
      'settings.rail.hint': '勾选要显示在动作条上的动作;顺序固定为默认顺序,取消勾选即隐藏。',
      'settings.rail.unavailable': '当前宿主没有设置服务,请用面板内的「动作条设置」。',
      'settings.commit.title': 'AI 提交信息',
      'settings.commit.model': '使用的模型',
      'settings.commit.modelHint': '留空 = 跟随当前会话(provider/model)',
      'settings.commit.reasoning': '思考强度',
      'settings.commit.reasoningHint': '留空 = 模型默认',
      'settings.commit.prompt': '补充提示词',
      'settings.commit.promptHint': '例如:用 Conventional Commits,subject 用中文,不超过 72 字符',
      'settings.commit.tooLong': '超过 {n} 个字符的部分不会保存',
      'changes.aiWrite': 'AI 写提交信息',
      'changes.aiBusy': '正在生成…',
      'changes.aiQuota': '会消耗你的额度',
      'changes.aiOverwriteTitle': '覆盖当前草稿?',
      'changes.aiOverwriteText': 'AI 生成的内容会替换你已经输入的提交信息(可以撤销)。',
      'changes.aiUndo': '撤销,恢复我的草稿',
      'changes.aiFailed': '生成失败:',
      'changes.aiNotice': '部分变更没有发给模型(已截断或丢弃),信息可能不完整。',
      'settings.rail.writeFailed': '设置没写进去,已退回原状态;请重试。',
      'settings.rail.readonly': '当前宿主把配置设为只读,开关不可修改。',
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
      'toast.undo': '撤回',
      'toast.close': '关闭',
      'toast.branchDeleted': '已删除分支 {name}',
      'toast.stashDropped': '已删除贮藏 {ref}',
      'toast.discarded': '已丢弃 {path} 的更改',
      'toast.discardNoUndo': '已丢弃 {path} 的更改(文件过大或过多,未保留撤回)',
      'toast.restored': '已恢复',
      'undo.menu': '最近可撤回的操作',
      'undo.empty': '现在没有可撤回的操作',
      'undo.branch': '分支',
      'undo.stash': '贮藏',
      'undo.discard': '丢弃',
      'confirm.typeName': '输入 {name} 以确认',
      'confirm.protected': '{name} 是主分支。删除是不可逆的高风险操作,请输入分支名确认。删除后仍可从浮窗撤回。',
      'discard.untracked.confirm': '删除未跟踪文件 {path}?文件内容会被删除,删除后浮窗里可以撤回。',
      'stashDrop.confirm': '删除贮藏 {ref}?删除后浮窗里可以撤回。',
      'operation.merge': '合并进行中',
      'operation.rebase': '变基进行中',
      'operation.cherry-pick': '优选进行中',
      'operation.revert': '还原进行中',
      'operation.bisect': '二分定位进行中',
      'operation.hint': '该仓库还有一个多步操作没有结束,先完成或中止它再执行分支级操作',
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
      'counts.ignored': '忽略 {n}',
      'counts.unstaged': '更改 {n}',
      'counts.untracked': '未跟踪 {n}',
      'counts.conflicted': '冲突 {n}',
      'push.confirm': '将 {branch} 推送到 {upstream}?',
      'delete.confirm': '删除分支 {name}?删除后浮窗里可以撤回(未合并的分支 git 会拒绝删除)。',
      'discard.confirm': '丢弃 {path} 的更改?工作区内容会被覆盖,丢弃后浮窗里可以撤回。',
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
      'branches.pickHint': 'Click to select, double-click to check out',
      'branches.worktree': 'Checked out in another working tree',
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
      'changes.groupBy': 'Group by',
      'changes.groupFlat': 'Flat list',
      'changes.groupDir': 'By directory',
      'changes.expandAll': 'Expand all',
      'changes.foldAll': 'Collapse all',
      'changes.showIgnored': 'Show ignored files',
      'changes.rootDir': '(root)',
      'changes.commitAndPush': 'Commit and push',
      'action.stage': 'Stage',
      'action.unstage': 'Unstage',
      'action.discard': 'Discard changes',
      'action.showDiff': 'Show diff',
      'action.copyPath': 'Copy path',
      'action.checkout': 'Checkout',
      'action.float': 'Float this page',
      'action.dock': 'Dock back',
      'action.split': 'Split pane',
      'action.fullscreen': 'Full screen',
      'action.exitFullscreen': 'Exit full screen',
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
      'pane.diff': 'diff view',
      'pane.resize': 'Drag to resize {name}: double-click resets, arrow keys nudge',
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
      'rail.openSettings': 'Open plugin settings',
      'settings.rail.title': 'Action rail buttons',
      'settings.rail.hint': 'Tick the actions shown on the rail. The order is fixed; unticking one hides it.',
      'settings.rail.unavailable': 'This host has no settings service; use the in-panel “Action rail settings”.',
      'settings.commit.title': 'AI commit message',
      'settings.commit.model': 'Model',
      'settings.commit.modelHint': 'Empty = follow this session (provider/model)',
      'settings.commit.reasoning': 'Reasoning effort',
      'settings.commit.reasoningHint': 'Empty = the model\'s default',
      'settings.commit.prompt': 'Extra instructions',
      'settings.commit.promptHint': 'e.g. Conventional Commits, Chinese subject, at most 72 characters',
      'settings.commit.tooLong': 'Only the first {n} characters are saved',
      'changes.aiWrite': 'Write with AI',
      'changes.aiBusy': 'Writing…',
      'changes.aiQuota': 'Uses your own quota',
      'changes.aiOverwriteTitle': 'Replace the current draft?',
      'changes.aiOverwriteText': 'The AI text will replace the commit message you typed (you can undo it).',
      'changes.aiUndo': 'Undo, bring my draft back',
      'changes.aiFailed': 'Could not write it:',
      'changes.aiNotice': 'Some changes were not sent to the model (truncated or dropped); the message may be incomplete.',
      'settings.rail.writeFailed': 'The setting did not save; the switch went back. Try again.',
      'settings.rail.readonly': 'This host serves the configuration read-only.',
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
      'toast.undo': 'Undo',
      'toast.close': 'Close',
      'toast.branchDeleted': 'Deleted branch {name}',
      'toast.stashDropped': 'Dropped stash {ref}',
      'toast.discarded': 'Discarded changes in {path}',
      'toast.discardNoUndo': 'Discarded changes in {path} (too large to keep an undo)',
      'toast.restored': 'Restored',
      'undo.menu': 'Recently deleted (undo)',
      'undo.empty': 'Nothing to undo right now',
      'undo.branch': 'Branch',
      'undo.stash': 'Stash',
      'undo.discard': 'Discard',
      'confirm.typeName': 'Type {name} to confirm',
      'confirm.protected': '{name} is a main branch. Deleting it is high risk, so type the branch name to confirm — a toast can still bring it back afterwards.',
      'discard.untracked.confirm': 'Delete the untracked file {path}? Its content is removed — a toast will offer to bring it back.',
      'stashDrop.confirm': 'Drop stash {ref}? A toast will offer to bring it back.',
      'operation.merge': 'Merge in progress',
      'operation.rebase': 'Rebase in progress',
      'operation.cherry-pick': 'Cherry-pick in progress',
      'operation.revert': 'Revert in progress',
      'operation.bisect': 'Bisect in progress',
      'operation.hint': 'This repository still has a multi-step operation open — finish or abort it before branch-level actions',
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
      'counts.ignored': 'Ignored {n}',
      'counts.unstaged': 'Changes {n}',
      'counts.untracked': 'Untracked {n}',
      'counts.conflicted': 'Conflicts {n}',
      'push.confirm': 'Push {branch} to {upstream}?',
      'delete.confirm': 'Delete branch {name}? A toast will offer to bring it back (git still refuses unmerged branches).',
      'discard.confirm': 'Discard changes in {path}? The working-tree content is overwritten — a toast will offer to bring it back.',
      'resetHard.confirm': 'Hard reset to {hash}? Uncommitted changes are lost.',
      'resetSoft.confirm': 'Move HEAD to {hash} (working tree kept)?',
      'checkoutCommit.confirm': 'Check out commit {hash}? (detached HEAD)',
    }

    /* Third-language dictionaries, keyed by lowercase BCP-47 tag. Every entry
       must carry the SAME key set as ZH: a missing key falls back to English at
       lookup time, and tests/smoke.mjs enforces the equality so a new string
       cannot land in zh and en alone. Adding a language is one entry here and
       nothing else — the dictionaries are also handed to the DSH locale
       registry, so host-side consumers read the same copy the panel does. */
    const LOCALES = {
      /* locale: zh-hk */
      'zh-hk': {
        'title': 'Git',
        'description': 'IDE 級 Git 面板:分支樹 / 提交圖譜 / 變更',
        'repo.label': '存放庫',
        'repo.workspace': '工作區',
        'repo.nested': '巢狀',
        'repo.none': '呢個工作區唔係 Git 存放庫',
        'repo.pick': '揀一個存放庫嚟睇',
        'repo.empty': '呢個工作區搵唔到 Git 存放庫',
        'repo.switch': '切換存放庫',
        'branch.switch': '切換分支',
        'seg.changes': '變更 {n}',
        'seg.history': '歷史',
        'branches.local': '本地',
        'branches.remote': '遠端',
        'branches.tags': '標籤',
        'branches.head': 'HEAD(當前分支)',
        'branches.favorites': '我的最愛',
        'branches.pickHint': '單擊選取,雙擊簽出',
        'branches.worktree': '已喺另一個工作區簽出',
        'action.stash': '貯藏',
        'action.favorite': '加入/取消我的最愛',
        'action.newTagHere': '喺當前提交新建標籤...',
        'stash.push': '貯藏當前變更',
        'stash.apply': '套用最新貯藏',
        'stash.drop': '丟棄最新貯藏',
        'stash.count': '{n} 個貯藏',
        'note.noChanges': '冇待處理嘅變更',
        'note.noBranches': '冇其他分支',
        'branches.filter': '分支或標籤',
        'changes.title': '變更',
        'changes.staged': '已暫存',
        'changes.unstaged': '變更',
        'changes.untracked': '未追蹤',
        'changes.conflicted': '衝突',
        'changes.empty': '冇待處理嘅變更',
        'changes.commitPlaceholder': '提交訊息(Ctrl+Enter)',
        'changes.commit': '提交',
        'changes.amend': '修訂上次提交',
        'changes.stageAll': '全部暫存',
        'changes.unstageAll': '全部取消暫存',
        'changes.groupBy': '分組方式',
        'changes.groupFlat': '平面清單',
        'changes.groupDir': '按目錄',
        'changes.expandAll': '全部展開',
        'changes.foldAll': '全部收起',
        'changes.showIgnored': '顯示被忽略嘅檔案',
        'changes.rootDir': '(根目錄)',
        'changes.commitAndPush': '提交並推送',
        'action.stage': '暫存',
        'action.unstage': '取消暫存',
        'action.discard': '丟棄變更',
        'action.showDiff': '顯示差異',
        'action.copyPath': '複製路徑',
        'action.checkout': '簽出',
        'action.float': '浮動本頁',
        'action.dock': '收回停靠',
        'action.split': '分欄',
        'action.fullscreen': '全螢幕',
        'action.exitFullscreen': '結束全螢幕',
        'action.newBranchFrom': '由此新建分支...',
        'action.newBranchHere': '喺呢度新建分支...',
        'action.rename': '重新命名...',
        'action.delete': '刪除',
        'action.mergeIntoCurrent': '合併到當前分支',
        'action.rebaseCurrentOnto': '將當前分支變基到此',
        'action.compare': '同當前分支比較',
        'action.update': '更新(抓取)',
        'action.push': '推送',
        'action.newTag': '新建標籤...',
        'action.cherryPick': '揀選',
        'action.revert': '還原提交',
        'action.resetSoft': '重置到此(保留變更)',
        'action.resetHard': '重置到此(丟棄變更)',
        'action.copyHash': '複製修訂號',
        'action.details': '提交詳情',
        'history.empty': '呢個存放庫仲未有提交',
        'history.loadMore': '載入更多',
        'history.filter': '文字或雜湊',
        'detail.files': '變更嘅檔案',
        'detail.back': '返回歷史',
        'detail.noFiles': '冇檔案變更',
        'diff.empty': '冇文字差異可以顯示',
        'pane.diff': '差異檢視',
        'pane.resize': '拖動調整{name}尺寸,雙擊復位,方向鍵微調',
        'diff.binary': '二進位檔案',
        'diff.loading': '正在載入差異...',
        'toolbar.refresh': '重新整理',
        'toolbar.newBranch': '新建分支',
        'toolbar.fetch': '抓取',
        'toolbar.pull': '拉取',
        'toolbar.push': '推送',
        'toolbar.tree': '分支面板',
        'rail.more': '更多操作',
        'rail.settings': '動作列設定',
        'rail.openSettings': '開啟外掛設定',
        'settings.rail.title': '動作列按鈕',
        'settings.rail.hint': '勾選要顯示在動作列上的動作;順序固定,取消勾選即隱藏。',
        'settings.rail.unavailable': '目前宿主沒有設定服務,請用面板內的「動作條設定」。',
        'settings.commit.title': 'AI 提交訊息',
        'settings.commit.model': '使用嘅模型',
        'settings.commit.modelHint': '留空 = 跟隨當前對話(provider/model)',
        'settings.commit.reasoning': '思考強度',
        'settings.commit.reasoningHint': '留空 = 模型預設',
        'settings.commit.prompt': '補充提示詞',
        'settings.commit.promptHint': '例如:用 Conventional Commits,subject 用中文,唔超過 72 字',
        'settings.commit.tooLong': '超過 {n} 個字嘅部分唔會儲存',
        'changes.aiWrite': 'AI 寫提交訊息',
        'changes.aiBusy': '生成緊…',
        'changes.aiQuota': '會消耗你嘅額度',
        'changes.aiOverwriteTitle': '覆蓋當前草稿?',
        'changes.aiOverwriteText': 'AI 生成嘅內容會換走你打咗嘅提交訊息(可以撤銷)。',
        'changes.aiUndo': '撤銷,還原我嘅草稿',
        'changes.aiFailed': '生成失敗:',
        'changes.aiNotice': '有部分變更冇發俾模型(已截斷或丟棄),訊息可能唔完整。',
        'settings.rail.writeFailed': '設定寫唔入,已經退回原狀;請再試。',
        'settings.rail.readonly': '目前宿主將設定設為唯讀,開關改唔到。',
        'rail.settingsHint': '拖曳或用箭嘴排序;眼睛圖示切換顯示',
        'rail.reset': '還原預設',
        'rail.up': '上移',
        'rail.down': '下移',
        'rail.show': '顯示',
        'rail.hide': '隱藏',
        'action.unavailable': '當前狀態下唔可用',
        'filter.branch': '分支',
        'filter.user': '提交者',
        'filter.date': '日期',
        'filter.path': '路徑',
        'filter.all': '全部',
        'filter.today': '今日',
        'filter.week': '近 7 日',
        'filter.month': '近 30 日',
        'filter.year': '今年',
        'filter.pathPlaceholder': '按路徑篩選(Enter)',
        'filter.sortDesc': '新到舊',
        'filter.sortAsc': '舊到新',
        'filter.clear': '清除篩選',
        'filter.none': '冇符合嘅提交',
        'toast.undo': '撤回',
        'toast.close': '關閉',
        'toast.branchDeleted': '已刪除分支 {name}',
        'toast.stashDropped': '已丟棄貯藏 {ref}',
        'toast.discarded': '已丟棄 {path} 嘅變更',
        'toast.discardNoUndo': '已丟棄 {path} 嘅變更(太大,冇保留撤回)',
        'toast.restored': '已還原',
        'undo.menu': '最近刪除(撤回)',
        'undo.empty': '暫時冇嘢可以撤回',
        'undo.branch': '分支',
        'undo.stash': '貯藏',
        'undo.discard': '丟棄',
        'confirm.typeName': '輸入 {name} 以確認',
        'confirm.protected': '{name} 係主分支。刪除風險好高,請輸入分支名確認 —— 之後仍然可以喺提示條撤回。',
        'discard.untracked.confirm': '刪除未追蹤檔案 {path}?內容會被移除 —— 之後可以喺提示條撤回。',
        'stashDrop.confirm': '丟棄貯藏 {ref}?之後可以喺提示條撤回。',
        'operation.merge': '合併進行中',
        'operation.rebase': '變基進行中',
        'operation.cherry-pick': '揀選進行中',
        'operation.revert': '還原進行中',
        'operation.bisect': 'Bisect 進行中',
        'operation.hint': '呢個存放庫仲有未完成嘅多步操作 —— 請先完成或中止,再進行分支層級嘅操作',
        'confirm.title': '確認',
        'confirm.cancel': '取消',
        'confirm.ok': '確定',
        'prompt.newBranch': '新分支名(建立並簽出)',
        'prompt.renameBranch': '重新命名分支',
        'prompt.newTag': '新標籤名',
        'prompt.fromHead': '當前 HEAD',
        'error.dismiss': '關閉',
        'status.loading': '讀取中...',
        'status.busy': '處理中...',
        'counts.staged': '已暫存 {n}',
        'counts.ignored': '已忽略 {n}',
        'counts.unstaged': '變更 {n}',
        'counts.untracked': '未追蹤 {n}',
        'counts.conflicted': '衝突 {n}',
        'push.confirm': '將 {branch} 推送到 {upstream}?',
        'delete.confirm': '刪除分支 {name}?之後可以喺提示條撤回(git 仍然會拒絕未合併嘅分支)。',
        'discard.confirm': '丟棄 {path} 嘅變更?工作區內容會被覆寫 —— 之後可以喺提示條撤回。',
        'resetHard.confirm': '硬重置到 {hash}?未提交嘅變更會遺失。',
        'resetSoft.confirm': '將 HEAD 移到 {hash}(保留工作區)?',
        'checkoutCommit.confirm': '簽出提交 {hash}?(detached HEAD)',
      },
      /* locale: zh-tw */
      'zh-tw': {
        'title': 'Git',
        'description': 'IDE 級 Git 面板:分支樹 / 提交圖形 / 變更',
        'repo.label': '版本庫',
        'repo.workspace': '工作區',
        'repo.nested': '巢狀',
        'repo.none': '這個工作區不是 Git 版本庫',
        'repo.pick': '選擇要檢視的版本庫',
        'repo.empty': '這個工作區找不到 Git 版本庫',
        'repo.switch': '切換版本庫',
        'branch.switch': '切換分支',
        'seg.changes': '變更 {n}',
        'seg.history': '歷史',
        'branches.local': '本機',
        'branches.remote': '遠端',
        'branches.tags': '標籤',
        'branches.head': 'HEAD(目前分支)',
        'branches.favorites': '我的最愛',
        'branches.pickHint': '單擊選取,雙擊簽出',
        'branches.worktree': '已在另一個工作區簽出',
        'action.stash': '暫存擱置',
        'action.favorite': '加入/移除我的最愛',
        'action.newTagHere': '在目前提交新建標籤...',
        'stash.push': '擱置目前變更',
        'stash.apply': '套用最新擱置',
        'stash.drop': '丟棄最新擱置',
        'stash.count': '{n} 筆擱置',
        'note.noChanges': '沒有待處理的變更',
        'note.noBranches': '沒有其他分支',
        'branches.filter': '分支或標籤',
        'changes.title': '變更',
        'changes.staged': '已暫存',
        'changes.unstaged': '變更',
        'changes.untracked': '未追蹤',
        'changes.conflicted': '衝突',
        'changes.empty': '沒有待處理的變更',
        'changes.commitPlaceholder': '提交訊息(Ctrl+Enter)',
        'changes.commit': '提交',
        'changes.amend': '修訂上次提交',
        'changes.stageAll': '全部暫存',
        'changes.unstageAll': '全部取消暫存',
        'changes.groupBy': '分組方式',
        'changes.groupFlat': '平面清單',
        'changes.groupDir': '依目錄',
        'changes.expandAll': '全部展開',
        'changes.foldAll': '全部收合',
        'changes.showIgnored': '顯示被忽略的檔案',
        'changes.rootDir': '(根目錄)',
        'changes.commitAndPush': '提交並推送',
        'action.stage': '暫存',
        'action.unstage': '取消暫存',
        'action.discard': '丟棄變更',
        'action.showDiff': '顯示差異',
        'action.copyPath': '複製路徑',
        'action.checkout': '簽出',
        'action.float': '浮動本頁',
        'action.dock': '收回停靠',
        'action.split': '分割欄',
        'action.fullscreen': '全螢幕',
        'action.exitFullscreen': '結束全螢幕',
        'action.newBranchFrom': '由此新建分支...',
        'action.newBranchHere': '在此新建分支...',
        'action.rename': '重新命名...',
        'action.delete': '刪除',
        'action.mergeIntoCurrent': '合併到目前分支',
        'action.rebaseCurrentOnto': '將目前分支變基到此',
        'action.compare': '與目前分支比較',
        'action.update': '更新(抓取)',
        'action.push': '推送',
        'action.newTag': '新建標籤...',
        'action.cherryPick': '揀選',
        'action.revert': '還原提交',
        'action.resetSoft': '重置到此(保留變更)',
        'action.resetHard': '重置到此(丟棄變更)',
        'action.copyHash': '複製修訂編號',
        'action.details': '提交詳情',
        'history.empty': '這個版本庫還沒有提交',
        'history.loadMore': '載入更多',
        'history.filter': '文字或雜湊',
        'detail.files': '變更的檔案',
        'detail.back': '返回歷史',
        'detail.noFiles': '沒有檔案變更',
        'diff.empty': '沒有文字差異可顯示',
        'pane.diff': '差異檢視',
        'pane.resize': '拖曳調整{name}尺寸,雙擊重設,方向鍵微調',
        'diff.binary': '二進位檔案',
        'diff.loading': '正在載入差異...',
        'toolbar.refresh': '重新整理',
        'toolbar.newBranch': '新建分支',
        'toolbar.fetch': '抓取',
        'toolbar.pull': '拉取',
        'toolbar.push': '推送',
        'toolbar.tree': '分支面板',
        'rail.more': '更多操作',
        'rail.settings': '動作列設定',
        'rail.openSettings': '開啟外掛設定',
        'settings.rail.title': '動作列按鈕',
        'settings.rail.hint': '勾選要顯示在動作列上的動作;順序固定,取消勾選即隱藏。',
        'settings.rail.unavailable': '目前宿主沒有設定服務,請用面板內的「動作條設定」。',
        'settings.commit.title': 'AI 提交訊息',
        'settings.commit.model': '使用的模型',
        'settings.commit.modelHint': '留空 = 跟隨目前工作階段(provider/model)',
        'settings.commit.reasoning': '思考強度',
        'settings.commit.reasoningHint': '留空 = 模型預設',
        'settings.commit.prompt': '補充提示詞',
        'settings.commit.promptHint': '例如:用 Conventional Commits,subject 用中文,不超過 72 字元',
        'settings.commit.tooLong': '超過 {n} 個字元的部分不會儲存',
        'changes.aiWrite': 'AI 寫提交訊息',
        'changes.aiBusy': '正在生成…',
        'changes.aiQuota': '會消耗你的額度',
        'changes.aiOverwriteTitle': '覆蓋目前的草稿?',
        'changes.aiOverwriteText': 'AI 生成的內容會取代你已輸入的提交訊息(可以復原)。',
        'changes.aiUndo': '復原,還原我的草稿',
        'changes.aiFailed': '生成失敗:',
        'changes.aiNotice': '部分變更沒有傳給模型(已截斷或捨棄),訊息可能不完整。',
        'settings.rail.writeFailed': '設定沒有寫入,已退回原狀態;請重試。',
        'settings.rail.readonly': '目前宿主將設定設為唯讀,開關無法修改。',
        'rail.settingsHint': '拖曳或用箭頭排序;眼睛圖示切換顯示',
        'rail.reset': '還原預設',
        'rail.up': '上移',
        'rail.down': '下移',
        'rail.show': '顯示',
        'rail.hide': '隱藏',
        'action.unavailable': '目前狀態下無法使用',
        'filter.branch': '分支',
        'filter.user': '提交者',
        'filter.date': '日期',
        'filter.path': '路徑',
        'filter.all': '全部',
        'filter.today': '今天',
        'filter.week': '近 7 天',
        'filter.month': '近 30 天',
        'filter.year': '今年',
        'filter.pathPlaceholder': '依路徑篩選(Enter)',
        'filter.sortDesc': '新到舊',
        'filter.sortAsc': '舊到新',
        'filter.clear': '清除篩選',
        'filter.none': '沒有符合的提交',
        'toast.undo': '撤回',
        'toast.close': '關閉',
        'toast.branchDeleted': '已刪除分支 {name}',
        'toast.stashDropped': '已丟棄擱置 {ref}',
        'toast.discarded': '已丟棄 {path} 的變更',
        'toast.discardNoUndo': '已丟棄 {path} 的變更(太大,未保留撤回)',
        'toast.restored': '已還原',
        'undo.menu': '最近刪除(撤回)',
        'undo.empty': '目前沒有可撤回的項目',
        'undo.branch': '分支',
        'undo.stash': '擱置',
        'undo.discard': '丟棄',
        'confirm.typeName': '輸入 {name} 以確認',
        'confirm.protected': '{name} 是主分支。刪除風險很高,請輸入分支名稱確認 —— 之後仍可從提示條撤回。',
        'discard.untracked.confirm': '刪除未追蹤檔案 {path}?內容會被移除 —— 之後可從提示條撤回。',
        'stashDrop.confirm': '丟棄擱置 {ref}?之後可從提示條撤回。',
        'operation.merge': '合併進行中',
        'operation.rebase': '變基進行中',
        'operation.cherry-pick': '揀選進行中',
        'operation.revert': '還原進行中',
        'operation.bisect': 'Bisect 進行中',
        'operation.hint': '這個版本庫仍有未完成的多步驟操作 —— 請先完成或中止,再進行分支層級的操作',
        'confirm.title': '確認',
        'confirm.cancel': '取消',
        'confirm.ok': '確定',
        'prompt.newBranch': '新分支名稱(建立並簽出)',
        'prompt.renameBranch': '重新命名分支',
        'prompt.newTag': '新標籤名稱',
        'prompt.fromHead': '目前 HEAD',
        'error.dismiss': '關閉',
        'status.loading': '讀取中...',
        'status.busy': '處理中...',
        'counts.staged': '已暫存 {n}',
        'counts.ignored': '已忽略 {n}',
        'counts.unstaged': '變更 {n}',
        'counts.untracked': '未追蹤 {n}',
        'counts.conflicted': '衝突 {n}',
        'push.confirm': '將 {branch} 推送到 {upstream}?',
        'delete.confirm': '刪除分支 {name}?之後可從提示條撤回(git 仍會拒絕未合併的分支)。',
        'discard.confirm': '丟棄 {path} 的變更?工作區內容會被覆寫 —— 之後可從提示條撤回。',
        'resetHard.confirm': '硬重置到 {hash}?未提交的變更會遺失。',
        'resetSoft.confirm': '將 HEAD 移到 {hash}(保留工作區)?',
        'checkoutCommit.confirm': '簽出提交 {hash}?(detached HEAD)',
      },
      /* locale: zh-mo */
      'zh-mo': {
        'title': 'Git',
        'description': 'IDE 級 Git 面板:分支樹 / 提交圖譜 / 變更',
        'repo.label': '存放庫',
        'repo.workspace': '工作區',
        'repo.nested': '巢狀',
        'repo.none': '呢個工作區唔係 Git 存放庫',
        'repo.pick': '揀一個存放庫嚟睇',
        'repo.empty': '呢個工作區搵唔到 Git 存放庫',
        'repo.switch': '切換存放庫',
        'branch.switch': '切換分支',
        'seg.changes': '變更 {n}',
        'seg.history': '歷史',
        'branches.local': '本地',
        'branches.remote': '遠端',
        'branches.tags': '標籤',
        'branches.head': 'HEAD(當前分支)',
        'branches.favorites': '我的最愛',
        'branches.pickHint': '單擊選取,雙擊簽出',
        'branches.worktree': '已喺另一個工作區簽出',
        'action.stash': '貯藏',
        'action.favorite': '加入/取消我的最愛',
        'action.newTagHere': '喺當前提交新建標籤...',
        'stash.push': '貯藏當前變更',
        'stash.apply': '套用最新貯藏',
        'stash.drop': '丟棄最新貯藏',
        'stash.count': '{n} 個貯藏',
        'note.noChanges': '冇待處理嘅變更',
        'note.noBranches': '冇其他分支',
        'branches.filter': '分支或標籤',
        'changes.title': '變更',
        'changes.staged': '已暫存',
        'changes.unstaged': '變更',
        'changes.untracked': '未追蹤',
        'changes.conflicted': '衝突',
        'changes.empty': '冇待處理嘅變更',
        'changes.commitPlaceholder': '提交訊息(Ctrl+Enter)',
        'changes.commit': '提交',
        'changes.amend': '修訂上次提交',
        'changes.stageAll': '全部暫存',
        'changes.unstageAll': '全部取消暫存',
        'changes.groupBy': '分組方式',
        'changes.groupFlat': '平面清單',
        'changes.groupDir': '按目錄',
        'changes.expandAll': '全部展開',
        'changes.foldAll': '全部收起',
        'changes.showIgnored': '顯示被忽略嘅檔案',
        'changes.rootDir': '(根目錄)',
        'changes.commitAndPush': '提交並推送',
        'action.stage': '暫存',
        'action.unstage': '取消暫存',
        'action.discard': '丟棄變更',
        'action.showDiff': '顯示差異',
        'action.copyPath': '複製路徑',
        'action.checkout': '簽出',
        'action.float': '浮動本頁',
        'action.dock': '收回停靠',
        'action.split': '分欄',
        'action.fullscreen': '全螢幕',
        'action.exitFullscreen': '結束全螢幕',
        'action.newBranchFrom': '由此新建分支...',
        'action.newBranchHere': '喺呢度新建分支...',
        'action.rename': '重新命名...',
        'action.delete': '刪除',
        'action.mergeIntoCurrent': '合併到當前分支',
        'action.rebaseCurrentOnto': '將當前分支變基到此',
        'action.compare': '同當前分支比較',
        'action.update': '更新(抓取)',
        'action.push': '推送',
        'action.newTag': '新建標籤...',
        'action.cherryPick': '揀選',
        'action.revert': '還原提交',
        'action.resetSoft': '重置到此(保留變更)',
        'action.resetHard': '重置到此(丟棄變更)',
        'action.copyHash': '複製修訂號',
        'action.details': '提交詳情',
        'history.empty': '呢個存放庫仲未有提交',
        'history.loadMore': '載入更多',
        'history.filter': '文字或雜湊',
        'detail.files': '變更嘅檔案',
        'detail.back': '返回歷史',
        'detail.noFiles': '冇檔案變更',
        'diff.empty': '冇文字差異可以顯示',
        'pane.diff': '差異檢視',
        'pane.resize': '拖動調整{name}尺寸,雙擊復位,方向鍵微調',
        'diff.binary': '二進位檔案',
        'diff.loading': '正在載入差異...',
        'toolbar.refresh': '重新整理',
        'toolbar.newBranch': '新建分支',
        'toolbar.fetch': '抓取',
        'toolbar.pull': '拉取',
        'toolbar.push': '推送',
        'toolbar.tree': '分支面板',
        'rail.more': '更多操作',
        'rail.settings': '動作列設定',
        'rail.openSettings': '開啟外掛設定',
        'settings.rail.title': '動作列按鈕',
        'settings.rail.hint': '勾選要顯示在動作列上的動作;順序固定,取消勾選即隱藏。',
        'settings.rail.unavailable': '目前宿主沒有設定服務,請用面板內的「動作條設定」。',
        'settings.commit.title': 'AI 提交訊息',
        'settings.commit.model': '使用的模型',
        'settings.commit.modelHint': '留空 = 跟隨目前工作階段(provider/model)',
        'settings.commit.reasoning': '思考強度',
        'settings.commit.reasoningHint': '留空 = 模型預設',
        'settings.commit.prompt': '補充提示詞',
        'settings.commit.promptHint': '例如:用 Conventional Commits,subject 用中文,不超過 72 字元',
        'settings.commit.tooLong': '超過 {n} 個字元的部分不會儲存',
        'changes.aiWrite': 'AI 寫提交訊息',
        'changes.aiBusy': '正在生成…',
        'changes.aiQuota': '會消耗你的額度',
        'changes.aiOverwriteTitle': '覆蓋目前的草稿?',
        'changes.aiOverwriteText': 'AI 生成的內容會取代你已輸入的提交訊息(可以復原)。',
        'changes.aiUndo': '復原,還原我的草稿',
        'changes.aiFailed': '生成失敗:',
        'changes.aiNotice': '部分變更沒有傳給模型(已截斷或捨棄),訊息可能不完整。',
        'settings.rail.writeFailed': '設定沒有寫入,已退回原狀態;請重試。',
        'settings.rail.readonly': '目前宿主將設定設為唯讀,開關無法修改。',
        'rail.settingsHint': '拖曳或用箭嘴排序;眼睛圖示切換顯示',
        'rail.reset': '還原預設',
        'rail.up': '上移',
        'rail.down': '下移',
        'rail.show': '顯示',
        'rail.hide': '隱藏',
        'action.unavailable': '當前狀態下唔可用',
        'filter.branch': '分支',
        'filter.user': '提交者',
        'filter.date': '日期',
        'filter.path': '路徑',
        'filter.all': '全部',
        'filter.today': '今日',
        'filter.week': '近 7 日',
        'filter.month': '近 30 日',
        'filter.year': '今年',
        'filter.pathPlaceholder': '按路徑篩選(Enter)',
        'filter.sortDesc': '新到舊',
        'filter.sortAsc': '舊到新',
        'filter.clear': '清除篩選',
        'filter.none': '冇符合嘅提交',
        'toast.undo': '撤回',
        'toast.close': '關閉',
        'toast.branchDeleted': '已刪除分支 {name}',
        'toast.stashDropped': '已丟棄貯藏 {ref}',
        'toast.discarded': '已丟棄 {path} 嘅變更',
        'toast.discardNoUndo': '已丟棄 {path} 嘅變更(太大,冇保留撤回)',
        'toast.restored': '已還原',
        'undo.menu': '最近刪除(撤回)',
        'undo.empty': '暫時冇嘢可以撤回',
        'undo.branch': '分支',
        'undo.stash': '貯藏',
        'undo.discard': '丟棄',
        'confirm.typeName': '輸入 {name} 以確認',
        'confirm.protected': '{name} 係主分支。刪除風險好高,請輸入分支名確認 —— 之後仍然可以喺提示條撤回。',
        'discard.untracked.confirm': '刪除未追蹤檔案 {path}?內容會被移除 —— 之後可以喺提示條撤回。',
        'stashDrop.confirm': '丟棄貯藏 {ref}?之後可以喺提示條撤回。',
        'operation.merge': '合併進行中',
        'operation.rebase': '變基進行中',
        'operation.cherry-pick': '揀選進行中',
        'operation.revert': '還原進行中',
        'operation.bisect': 'Bisect 進行中',
        'operation.hint': '呢個存放庫仲有未完成嘅多步操作 —— 請先完成或中止,再進行分支層級嘅操作',
        'confirm.title': '確認',
        'confirm.cancel': '取消',
        'confirm.ok': '確定',
        'prompt.newBranch': '新分支名(建立並簽出)',
        'prompt.renameBranch': '重新命名分支',
        'prompt.newTag': '新標籤名',
        'prompt.fromHead': '當前 HEAD',
        'error.dismiss': '關閉',
        'status.loading': '讀取中...',
        'status.busy': '處理中...',
        'counts.staged': '已暫存 {n}',
        'counts.ignored': '已忽略 {n}',
        'counts.unstaged': '變更 {n}',
        'counts.untracked': '未追蹤 {n}',
        'counts.conflicted': '衝突 {n}',
        'push.confirm': '將 {branch} 推送到 {upstream}?',
        'delete.confirm': '刪除分支 {name}?之後可以喺提示條撤回(git 仍然會拒絕未合併嘅分支)。',
        'discard.confirm': '丟棄 {path} 嘅變更?工作區內容會被覆寫 —— 之後可以喺提示條撤回。',
        'resetHard.confirm': '硬重置到 {hash}?未提交嘅變更會遺失。',
        'resetSoft.confirm': '將 HEAD 移到 {hash}(保留工作區)?',
        'checkoutCommit.confirm': '簽出提交 {hash}?(detached HEAD)',
      },
      /* locale: ja */
      'ja': {
        'title': 'Git',
        'description': 'IDE 級の Git パネル:ブランチツリー / コミットグラフ / 変更',
        'repo.label': 'リポジトリ',
        'repo.workspace': 'ワークスペース',
        'repo.nested': 'ネスト',
        'repo.none': 'このワークスペースは Git リポジトリではありません',
        'repo.pick': '確認するリポジトリを選択',
        'repo.empty': 'このワークスペースに Git リポジトリが見つかりません',
        'repo.switch': 'リポジトリを切り替え',
        'branch.switch': 'ブランチを切り替え',
        'seg.changes': '変更 {n}',
        'seg.history': '履歴',
        'branches.local': 'ローカル',
        'branches.remote': 'リモート',
        'branches.tags': 'タグ',
        'branches.head': 'HEAD(現在のブランチ)',
        'branches.favorites': 'お気に入り',
        'branches.pickHint': 'クリックで選択、ダブルクリックでチェックアウト',
        'branches.worktree': '別のワークツリーでチェックアウト済み',
        'action.stash': 'スタッシュ',
        'action.favorite': '現在のブランチをお気に入りに追加/解除',
        'action.newTagHere': '現在のコミットにタグを作成...',
        'stash.push': '現在の変更をスタッシュ',
        'stash.apply': '最新のスタッシュを適用',
        'stash.drop': '最新のスタッシュを削除',
        'stash.count': 'スタッシュ {n} 件',
        'note.noChanges': '保留中の変更はありません',
        'note.noBranches': '他のブランチはありません',
        'branches.filter': 'ブランチまたはタグ',
        'changes.title': '変更',
        'changes.staged': 'ステージ済み',
        'changes.unstaged': '変更',
        'changes.untracked': '未追跡',
        'changes.conflicted': '競合',
        'changes.empty': '保留中の変更はありません',
        'changes.commitPlaceholder': 'コミットメッセージ(Ctrl+Enter)',
        'changes.commit': 'コミット',
        'changes.amend': '前回のコミットを修正',
        'changes.stageAll': 'すべてステージ',
        'changes.unstageAll': 'すべてステージ解除',
        'changes.groupBy': 'グループ化',
        'changes.groupFlat': 'フラット表示',
        'changes.groupDir': 'ディレクトリ別',
        'changes.expandAll': 'すべて展開',
        'changes.foldAll': 'すべて折りたたむ',
        'changes.showIgnored': '無視されたファイルを表示',
        'changes.rootDir': '(ルート)',
        'changes.commitAndPush': 'コミットしてプッシュ',
        'action.stage': 'ステージ',
        'action.unstage': 'ステージ解除',
        'action.discard': '変更を破棄',
        'action.showDiff': '差分を表示',
        'action.copyPath': 'パスをコピー',
        'action.checkout': 'チェックアウト',
        'action.float': 'このページを浮動表示',
        'action.dock': 'ドックに戻す',
        'action.split': '分割',
        'action.fullscreen': '全画面',
        'action.exitFullscreen': '全画面を終了',
        'action.newBranchFrom': 'ここから新しいブランチ...',
        'action.newBranchHere': 'ここに新しいブランチ...',
        'action.rename': '名前を変更...',
        'action.delete': '削除',
        'action.mergeIntoCurrent': '現在のブランチにマージ',
        'action.rebaseCurrentOnto': '現在のブランチをここにリベース',
        'action.compare': '現在のブランチと比較',
        'action.update': '更新(フェッチ)',
        'action.push': 'プッシュ',
        'action.newTag': '新しいタグ...',
        'action.cherryPick': 'チェリーピック',
        'action.revert': 'コミットを打ち消す',
        'action.resetSoft': 'ここにリセット(変更を保持)',
        'action.resetHard': 'ここにリセット(変更を破棄)',
        'action.copyHash': 'リビジョン番号をコピー',
        'action.details': 'コミットの詳細',
        'history.empty': 'このリポジトリにはまだコミットがありません',
        'history.loadMore': 'さらに読み込む',
        'history.filter': 'テキストまたはハッシュ',
        'detail.files': '変更されたファイル',
        'detail.back': '履歴に戻る',
        'detail.noFiles': 'ファイルの変更はありません',
        'diff.empty': '表示できるテキスト差分がありません',
        'pane.diff': '差分ビュー',
        'pane.resize': '{name}のサイズをドラッグで調整(ダブルクリックでリセット、矢印キーで微調整)',
        'diff.binary': 'バイナリファイル',
        'diff.loading': '差分を読み込み中...',
        'toolbar.refresh': '更新',
        'toolbar.newBranch': '新しいブランチ',
        'toolbar.fetch': 'フェッチ',
        'toolbar.pull': 'プル',
        'toolbar.push': 'プッシュ',
        'toolbar.tree': 'ブランチペイン',
        'rail.more': 'その他の操作',
        'rail.settings': 'アクションバーの設定',
        'rail.openSettings': 'プラグイン設定を開く',
        'settings.rail.title': 'アクションレールのボタン',
        'settings.rail.hint': 'レールに表示する操作にチェックを入れてください。順序は固定で、チェックを外すと非表示になります。',
        'settings.rail.unavailable': 'このホストには設定サービスがないため、パネル内の「アクションレール設定」を使ってください。',
        'settings.commit.title': 'AI コミットメッセージ',
        'settings.commit.model': '使用するモデル',
        'settings.commit.modelHint': '空欄 = 現在のセッションに従う(provider/model)',
        'settings.commit.reasoning': '思考の強度',
        'settings.commit.reasoningHint': '空欄 = モデルの既定値',
        'settings.commit.prompt': '追加の指示',
        'settings.commit.promptHint': '例:Conventional Commits、subject は日本語、72 文字以内',
        'settings.commit.tooLong': '{n} 文字を超える部分は保存されません',
        'changes.aiWrite': 'AI で書く',
        'changes.aiBusy': '生成中…',
        'changes.aiQuota': 'あなたの利用枠を消費します',
        'changes.aiOverwriteTitle': '現在の下書きを置き換えますか?',
        'changes.aiOverwriteText': 'AI の文章が入力済みのコミットメッセージを置き換えます(元に戻せます)。',
        'changes.aiUndo': '元に戻す',
        'changes.aiFailed': '生成できませんでした:',
        'changes.aiNotice': '一部の変更はモデルに送られていません(切り詰めまたは除外)。内容が不完全な可能性があります。',
        'settings.rail.writeFailed': '設定を保存できませんでした。元の状態に戻しました。もう一度お試しください。',
        'settings.rail.readonly': 'このホストは設定を読み取り専用で提供しています。',
        'rail.settingsHint': 'ドラッグまたは矢印で並べ替え、目のアイコンで表示を切り替え',
        'rail.reset': '既定に戻す',
        'rail.up': '上へ',
        'rail.down': '下へ',
        'rail.show': '表示',
        'rail.hide': '非表示',
        'action.unavailable': '現在の状態では使用できません',
        'filter.branch': 'ブランチ',
        'filter.user': 'コミット者',
        'filter.date': '日付',
        'filter.path': 'パス',
        'filter.all': 'すべて',
        'filter.today': '今日',
        'filter.week': '過去 7 日',
        'filter.month': '過去 30 日',
        'filter.year': '今年',
        'filter.pathPlaceholder': 'パスで絞り込み(Enter)',
        'filter.sortDesc': '新しい順',
        'filter.sortAsc': '古い順',
        'filter.clear': '絞り込みを解除',
        'filter.none': '一致するコミットがありません',
        'toast.undo': '元に戻す',
        'toast.close': '閉じる',
        'toast.branchDeleted': 'ブランチ {name} を削除しました',
        'toast.stashDropped': 'スタッシュ {ref} を削除しました',
        'toast.discarded': '{path} の変更を破棄しました',
        'toast.discardNoUndo': '{path} の変更を破棄しました(大きすぎるため取り消しは保持していません)',
        'toast.restored': '復元しました',
        'undo.menu': '最近の削除(元に戻す)',
        'undo.empty': '今すぐ元に戻せるものはありません',
        'undo.branch': 'ブランチ',
        'undo.stash': 'スタッシュ',
        'undo.discard': '破棄',
        'confirm.typeName': '確認のため {name} と入力してください',
        'confirm.protected': '{name} はメインブランチです。削除はリスクが高いため、ブランチ名を入力して確認してください —— その後もトーストから復元できます。',
        'discard.untracked.confirm': '未追跡ファイル {path} を削除しますか?内容は削除されます —— その後トーストから復元できます。',
        'stashDrop.confirm': 'スタッシュ {ref} を削除しますか?その後トーストから復元できます。',
        'operation.merge': 'マージ中',
        'operation.rebase': 'リベース中',
        'operation.cherry-pick': 'チェリーピック中',
        'operation.revert': '打ち消し中',
        'operation.bisect': 'bisect 中',
        'operation.hint': 'このリポジトリには未完了の多段階操作があります —— ブランチ操作の前に完了または中止してください',
        'confirm.title': '確認',
        'confirm.cancel': 'キャンセル',
        'confirm.ok': 'OK',
        'prompt.newBranch': '新しいブランチ名(作成してチェックアウト)',
        'prompt.renameBranch': 'ブランチ名を変更',
        'prompt.newTag': '新しいタグ名',
        'prompt.fromHead': '現在の HEAD',
        'error.dismiss': '閉じる',
        'status.loading': '読み込み中...',
        'status.busy': '処理中...',
        'counts.staged': 'ステージ済み {n}',
        'counts.ignored': '無視 {n}',
        'counts.unstaged': '変更 {n}',
        'counts.untracked': '未追跡 {n}',
        'counts.conflicted': '競合 {n}',
        'push.confirm': '{branch} を {upstream} にプッシュしますか?',
        'delete.confirm': 'ブランチ {name} を削除しますか?その後トーストから復元できます(git は未マージのブランチを引き続き拒否します)。',
        'discard.confirm': '{path} の変更を破棄しますか?ワークツリーの内容が上書きされます —— その後トーストから復元できます。',
        'resetHard.confirm': '{hash} にハードリセットしますか?未コミットの変更は失われます。',
        'resetSoft.confirm': 'HEAD を {hash} に移動しますか(ワークツリーは保持)?',
        'checkoutCommit.confirm': 'コミット {hash} をチェックアウトしますか?(detached HEAD)',
      },
      /* locale: ko */
      'ko': {
        'title': 'Git',
        'description': 'IDE 급 Git 패널: 브랜치 트리 / 커밋 그래프 / 변경',
        'repo.label': '저장소',
        'repo.workspace': '워크스페이스',
        'repo.nested': '중첩',
        'repo.none': '이 워크스페이스는 Git 저장소가 아닙니다',
        'repo.pick': '확인할 저장소를 선택하세요',
        'repo.empty': '이 워크스페이스에서 Git 저장소를 찾을 수 없습니다',
        'repo.switch': '저장소 전환',
        'branch.switch': '브랜치 전환',
        'seg.changes': '변경 {n}',
        'seg.history': '기록',
        'branches.local': '로컬',
        'branches.remote': '원격',
        'branches.tags': '태그',
        'branches.head': 'HEAD(현재 브랜치)',
        'branches.favorites': '즐겨찾기',
        'branches.pickHint': '클릭하여 선택, 더블클릭하여 체크아웃',
        'branches.worktree': '다른 워크트리에서 체크아웃됨',
        'action.stash': '스태시',
        'action.favorite': '현재 브랜치 즐겨찾기 추가/해제',
        'action.newTagHere': '현재 커밋에 태그 만들기...',
        'stash.push': '현재 변경 사항 스태시',
        'stash.apply': '최신 스태시 적용',
        'stash.drop': '최신 스태시 삭제',
        'stash.count': '스태시 {n}개',
        'note.noChanges': '보류 중인 변경 사항이 없습니다',
        'note.noBranches': '다른 브랜치가 없습니다',
        'branches.filter': '브랜치 또는 태그',
        'changes.title': '변경',
        'changes.staged': '스테이지됨',
        'changes.unstaged': '변경',
        'changes.untracked': '추적되지 않음',
        'changes.conflicted': '충돌',
        'changes.empty': '보류 중인 변경 사항이 없습니다',
        'changes.commitPlaceholder': '커밋 메시지(Ctrl+Enter)',
        'changes.commit': '커밋',
        'changes.amend': '이전 커밋 수정',
        'changes.stageAll': '모두 스테이지',
        'changes.unstageAll': '모두 스테이지 해제',
        'changes.groupBy': '그룹 기준',
        'changes.groupFlat': '평면 목록',
        'changes.groupDir': '디렉터리별',
        'changes.expandAll': '모두 펼치기',
        'changes.foldAll': '모두 접기',
        'changes.showIgnored': '무시된 파일 표시',
        'changes.rootDir': '(루트)',
        'changes.commitAndPush': '커밋 후 푸시',
        'action.stage': '스테이지',
        'action.unstage': '스테이지 해제',
        'action.discard': '변경 사항 버리기',
        'action.showDiff': '차이 보기',
        'action.copyPath': '경로 복사',
        'action.checkout': '체크아웃',
        'action.float': '이 페이지 띄우기',
        'action.dock': '도킹으로 복귀',
        'action.split': '분할',
        'action.fullscreen': '전체 화면',
        'action.exitFullscreen': '전체 화면 종료',
        'action.newBranchFrom': '여기서 새 브랜치...',
        'action.newBranchHere': '여기에 새 브랜치...',
        'action.rename': '이름 바꾸기...',
        'action.delete': '삭제',
        'action.mergeIntoCurrent': '현재 브랜치로 병합',
        'action.rebaseCurrentOnto': '현재 브랜치를 여기로 리베이스',
        'action.compare': '현재 브랜치와 비교',
        'action.update': '업데이트(페치)',
        'action.push': '푸시',
        'action.newTag': '새 태그...',
        'action.cherryPick': '체리픽',
        'action.revert': '커밋 되돌리기',
        'action.resetSoft': '여기로 리셋(변경 유지)',
        'action.resetHard': '여기로 리셋(변경 버림)',
        'action.copyHash': '리비전 번호 복사',
        'action.details': '커밋 상세',
        'history.empty': '이 저장소에는 아직 커밋이 없습니다',
        'history.loadMore': '더 불러오기',
        'history.filter': '텍스트 또는 해시',
        'detail.files': '변경된 파일',
        'detail.back': '기록으로 돌아가기',
        'detail.noFiles': '파일 변경 없음',
        'diff.empty': '표시할 텍스트 차이가 없습니다',
        'pane.diff': '차이 보기',
        'pane.resize': '{name} 크기를 드래그해 조절(더블클릭 초기화, 화살표 키 미세 조정)',
        'diff.binary': '바이너리 파일',
        'diff.loading': '차이 불러오는 중...',
        'toolbar.refresh': '새로 고침',
        'toolbar.newBranch': '새 브랜치',
        'toolbar.fetch': '페치',
        'toolbar.pull': '풀',
        'toolbar.push': '푸시',
        'toolbar.tree': '브랜치 창',
        'rail.more': '추가 작업',
        'rail.settings': '작업 표시줄 설정',
        'rail.openSettings': '플러그인 설정 열기',
        'settings.rail.title': '액션 레일 버튼',
        'settings.rail.hint': '레일에 표시할 동작을 선택하세요. 순서는 고정이며 선택을 해제하면 숨겨집니다.',
        'settings.rail.unavailable': '이 호스트에는 설정 서비스가 없으므로 패널의 "액션 레일 설정"을 사용하세요.',
        'settings.commit.title': 'AI 커밋 메시지',
        'settings.commit.model': '사용할 모델',
        'settings.commit.modelHint': '비우면 현재 세션을 따릅니다(provider/model)',
        'settings.commit.reasoning': '추론 강도',
        'settings.commit.reasoningHint': '비우면 모델 기본값',
        'settings.commit.prompt': '추가 지시',
        'settings.commit.promptHint': '예: Conventional Commits, 제목은 한국어, 72자 이내',
        'settings.commit.tooLong': '{n}자를 넘는 부분은 저장되지 않습니다',
        'changes.aiWrite': 'AI로 작성',
        'changes.aiBusy': '생성 중…',
        'changes.aiQuota': '사용자의 할당량을 소모합니다',
        'changes.aiOverwriteTitle': '현재 초안을 바꿀까요?',
        'changes.aiOverwriteText': 'AI 텍스트가 입력한 커밋 메시지를 대체합니다(되돌릴 수 있습니다).',
        'changes.aiUndo': '되돌리기',
        'changes.aiFailed': '생성하지 못했습니다:',
        'changes.aiNotice': '일부 변경이 모델에 전달되지 않았습니다(잘림 또는 제외). 내용이 불완전할 수 있습니다.',
        'settings.rail.writeFailed': '설정이 저장되지 않아 원래 상태로 되돌렸습니다. 다시 시도하세요.',
        'settings.rail.readonly': '이 호스트는 설정을 읽기 전용으로 제공합니다.',
        'rail.settingsHint': '끌어서 또는 화살표로 순서를 바꾸고, 눈 아이콘으로 표시를 전환합니다',
        'rail.reset': '기본값 복원',
        'rail.up': '위로',
        'rail.down': '아래로',
        'rail.show': '표시',
        'rail.hide': '숨기기',
        'action.unavailable': '현재 상태에서는 사용할 수 없습니다',
        'filter.branch': '브랜치',
        'filter.user': '작성자',
        'filter.date': '날짜',
        'filter.path': '경로',
        'filter.all': '전체',
        'filter.today': '오늘',
        'filter.week': '최근 7일',
        'filter.month': '최근 30일',
        'filter.year': '올해',
        'filter.pathPlaceholder': '경로로 필터(Enter)',
        'filter.sortDesc': '최신순',
        'filter.sortAsc': '오래된순',
        'filter.clear': '필터 지우기',
        'filter.none': '일치하는 커밋이 없습니다',
        'toast.undo': '되돌리기',
        'toast.close': '닫기',
        'toast.branchDeleted': '브랜치 {name} 삭제됨',
        'toast.stashDropped': '스태시 {ref} 삭제됨',
        'toast.discarded': '{path}의 변경 사항을 버렸습니다',
        'toast.discardNoUndo': '{path}의 변경 사항을 버렸습니다(너무 커서 되돌리기를 보관하지 않음)',
        'toast.restored': '복원했습니다',
        'undo.menu': '최근 삭제(되돌리기)',
        'undo.empty': '지금 되돌릴 항목이 없습니다',
        'undo.branch': '브랜치',
        'undo.stash': '스태시',
        'undo.discard': '버리기',
        'confirm.typeName': '확인하려면 {name}을(를) 입력하세요',
        'confirm.protected': '{name}은(는) 메인 브랜치입니다. 삭제 위험이 크므로 브랜치 이름을 입력해 확인하세요 —— 이후에도 토스트에서 복원할 수 있습니다.',
        'discard.untracked.confirm': '추적되지 않은 파일 {path}을(를) 삭제할까요? 내용이 제거됩니다 —— 이후 토스트에서 복원할 수 있습니다.',
        'stashDrop.confirm': '스태시 {ref}을(를) 삭제할까요? 이후 토스트에서 복원할 수 있습니다.',
        'operation.merge': '병합 진행 중',
        'operation.rebase': '리베이스 진행 중',
        'operation.cherry-pick': '체리픽 진행 중',
        'operation.revert': '되돌리기 진행 중',
        'operation.bisect': 'bisect 진행 중',
        'operation.hint': '이 저장소에 아직 끝나지 않은 다단계 작업이 있습니다 —— 브랜치 작업 전에 완료하거나 중단하세요',
        'confirm.title': '확인',
        'confirm.cancel': '취소',
        'confirm.ok': '확인',
        'prompt.newBranch': '새 브랜치 이름(생성 후 체크아웃)',
        'prompt.renameBranch': '브랜치 이름 바꾸기',
        'prompt.newTag': '새 태그 이름',
        'prompt.fromHead': '현재 HEAD',
        'error.dismiss': '닫기',
        'status.loading': '읽는 중...',
        'status.busy': '처리 중...',
        'counts.staged': '스테이지됨 {n}',
        'counts.ignored': '무시됨 {n}',
        'counts.unstaged': '변경 {n}',
        'counts.untracked': '추적되지 않음 {n}',
        'counts.conflicted': '충돌 {n}',
        'push.confirm': '{branch}을(를) {upstream}에 푸시할까요?',
        'delete.confirm': '브랜치 {name}을(를) 삭제할까요? 이후 토스트에서 복원할 수 있습니다(git은 병합되지 않은 브랜치를 계속 거부합니다).',
        'discard.confirm': '{path}의 변경 사항을 버릴까요? 워크트리 내용이 덮어써집니다 —— 이후 토스트에서 복원할 수 있습니다.',
        'resetHard.confirm': '{hash}로 하드 리셋할까요? 커밋하지 않은 변경 사항은 사라집니다.',
        'resetSoft.confirm': 'HEAD를 {hash}로 옮길까요(워크트리 유지)?',
        'checkoutCommit.confirm': '커밋 {hash}을(를) 체크아웃할까요?(detached HEAD)',
      },
      /* locale: de */
      'de': {
        'title': 'Git',
        'description': 'Git-Panel auf IDE-Niveau: Branch-Baum / Commit-Graph / Änderungen',
        'repo.label': 'Repository',
        'repo.workspace': 'Arbeitsbereich',
        'repo.nested': 'verschachtelt',
        'repo.none': 'Dieser Arbeitsbereich ist kein Git-Repository',
        'repo.pick': 'Repository zum Ansehen wählen',
        'repo.empty': 'In diesem Arbeitsbereich wurde kein Git-Repository gefunden',
        'repo.switch': 'Repository wechseln',
        'branch.switch': 'Branch wechseln',
        'seg.changes': 'Änderungen {n}',
        'seg.history': 'Verlauf',
        'branches.local': 'Lokal',
        'branches.remote': 'Remote',
        'branches.tags': 'Tags',
        'branches.head': 'HEAD (aktueller Branch)',
        'branches.favorites': 'Favoriten',
        'branches.pickHint': 'Klicken zum Auswählen, doppelklicken zum Auschecken',
        'branches.worktree': 'In einem anderen Arbeitsbaum ausgecheckt',
        'action.stash': 'Stash',
        'action.favorite': 'Aktuellen Branch als Favorit setzen/entfernen',
        'action.newTagHere': 'Neuer Tag am aktuellen Commit...',
        'stash.push': 'Aktuelle Änderungen stashen',
        'stash.apply': 'Neuesten Stash anwenden',
        'stash.drop': 'Neuesten Stash verwerfen',
        'stash.count': '{n} Stash-Einträge',
        'note.noChanges': 'Keine offenen Änderungen',
        'note.noBranches': 'Keine weiteren Branches',
        'branches.filter': 'Branch oder Tag',
        'changes.title': 'Änderungen',
        'changes.staged': 'Vorgemerkt',
        'changes.unstaged': 'Änderungen',
        'changes.untracked': 'Nicht verfolgt',
        'changes.conflicted': 'Konflikte',
        'changes.empty': 'Keine offenen Änderungen',
        'changes.commitPlaceholder': 'Commit-Nachricht (Strg+Enter)',
        'changes.commit': 'Committen',
        'changes.amend': 'Letzten Commit ergänzen',
        'changes.stageAll': 'Alle vormerken',
        'changes.unstageAll': 'Alle zurücknehmen',
        'changes.groupBy': 'Gruppieren nach',
        'changes.groupFlat': 'Flache Liste',
        'changes.groupDir': 'Nach Verzeichnis',
        'changes.expandAll': 'Alle ausklappen',
        'changes.foldAll': 'Alle einklappen',
        'changes.showIgnored': 'Ignorierte Dateien anzeigen',
        'changes.rootDir': '(Wurzel)',
        'changes.commitAndPush': 'Committen und pushen',
        'action.stage': 'Vormerken',
        'action.unstage': 'Zurücknehmen',
        'action.discard': 'Änderungen verwerfen',
        'action.showDiff': 'Diff anzeigen',
        'action.copyPath': 'Pfad kopieren',
        'action.checkout': 'Auschecken',
        'action.float': 'Diese Seite schweben lassen',
        'action.dock': 'Zurück andocken',
        'action.split': 'Teilen',
        'action.fullscreen': 'Vollbild',
        'action.exitFullscreen': 'Vollbild beenden',
        'action.newBranchFrom': 'Neuer Branch von hier...',
        'action.newBranchHere': 'Neuer Branch hier...',
        'action.rename': 'Umbenennen...',
        'action.delete': 'Löschen',
        'action.mergeIntoCurrent': 'In aktuellen Branch mergen',
        'action.rebaseCurrentOnto': 'Aktuellen Branch hierauf rebasen',
        'action.compare': 'Mit aktuellem Branch vergleichen',
        'action.update': 'Aktualisieren (fetch)',
        'action.push': 'Push',
        'action.newTag': 'Neuer Tag...',
        'action.cherryPick': 'Cherry-Pick',
        'action.revert': 'Commit rückgängig machen',
        'action.resetSoft': 'Hierher zurücksetzen (Änderungen behalten)',
        'action.resetHard': 'Hierher zurücksetzen (Änderungen verwerfen)',
        'action.copyHash': 'Revisionsnummer kopieren',
        'action.details': 'Commit-Details',
        'history.empty': 'Dieses Repository hat noch keine Commits',
        'history.loadMore': 'Mehr laden',
        'history.filter': 'Text oder Hash',
        'detail.files': 'Geänderte Dateien',
        'detail.back': 'Zurück zum Verlauf',
        'detail.noFiles': 'Keine Dateiänderungen',
        'diff.empty': 'Kein textueller Diff vorhanden',
        'pane.diff': 'Diff-Ansicht',
        'pane.resize': 'Größe von {name} per Ziehen ändern (Doppelklick setzt zurück, Pfeiltasten justieren)',
        'diff.binary': 'Binärdatei',
        'diff.loading': 'Diff wird geladen...',
        'toolbar.refresh': 'Aktualisieren',
        'toolbar.newBranch': 'Neuer Branch',
        'toolbar.fetch': 'Fetch',
        'toolbar.pull': 'Pull',
        'toolbar.push': 'Push',
        'toolbar.tree': 'Branch-Bereich',
        'rail.more': 'Weitere Aktionen',
        'rail.settings': 'Einstellungen der Aktionsleiste',
        'rail.openSettings': 'Plugin-Einstellungen öffnen',
        'settings.rail.title': 'Schaltflächen der Aktionsleiste',
        'settings.rail.hint': 'Die auf der Leiste sichtbaren Aktionen ankreuzen. Die Reihenfolge ist fest; abwählen blendet eine aus.',
        'settings.rail.unavailable': 'Dieser Host hat keinen Einstellungsdienst; nutze die „Aktionsleisten-Einstellungen“ im Panel.',
        'settings.commit.title': 'KI-Commit-Nachricht',
        'settings.commit.model': 'Modell',
        'settings.commit.modelHint': 'Leer = dieser Sitzung folgen (provider/model)',
        'settings.commit.reasoning': 'Denkaufwand',
        'settings.commit.reasoningHint': 'Leer = Standard des Modells',
        'settings.commit.prompt': 'Zusätzliche Anweisungen',
        'settings.commit.promptHint': 'z. B. Conventional Commits, Betreff auf Deutsch, höchstens 72 Zeichen',
        'settings.commit.tooLong': 'Nur die ersten {n} Zeichen werden gespeichert',
        'changes.aiWrite': 'Mit KI schreiben',
        'changes.aiBusy': 'Wird geschrieben…',
        'changes.aiQuota': 'Verbraucht dein eigenes Kontingent',
        'changes.aiOverwriteTitle': 'Aktuellen Entwurf ersetzen?',
        'changes.aiOverwriteText': 'Der KI-Text ersetzt deine eingegebene Commit-Nachricht (rückgängig möglich).',
        'changes.aiUndo': 'Rückgängig',
        'changes.aiFailed': 'Konnte nicht schreiben:',
        'changes.aiNotice': 'Einige Änderungen wurden nicht ans Modell gesendet (gekürzt oder verworfen); die Nachricht kann unvollständig sein.',
        'settings.rail.writeFailed': 'Die Einstellung wurde nicht gespeichert; der Schalter ist zurückgesprungen. Bitte erneut versuchen.',
        'settings.rail.readonly': 'Dieser Host liefert die Konfiguration schreibgeschützt.',
        'rail.settingsHint': 'Ziehen oder Pfeile zum Sortieren, das Auge schaltet die Sichtbarkeit um',
        'rail.reset': 'Standard wiederherstellen',
        'rail.up': 'Nach oben',
        'rail.down': 'Nach unten',
        'rail.show': 'Anzeigen',
        'rail.hide': 'Ausblenden',
        'action.unavailable': 'Im aktuellen Zustand nicht verfügbar',
        'filter.branch': 'Branch',
        'filter.user': 'Autor',
        'filter.date': 'Datum',
        'filter.path': 'Pfad',
        'filter.all': 'Alle',
        'filter.today': 'Heute',
        'filter.week': 'Letzte 7 Tage',
        'filter.month': 'Letzte 30 Tage',
        'filter.year': 'Dieses Jahr',
        'filter.pathPlaceholder': 'Nach Pfad filtern (Enter)',
        'filter.sortDesc': 'Neueste zuerst',
        'filter.sortAsc': 'Älteste zuerst',
        'filter.clear': 'Filter zurücksetzen',
        'filter.none': 'Keine passenden Commits',
        'toast.undo': 'Rückgängig',
        'toast.close': 'Schließen',
        'toast.branchDeleted': 'Branch {name} gelöscht',
        'toast.stashDropped': 'Stash {ref} verworfen',
        'toast.discarded': 'Änderungen in {path} verworfen',
        'toast.discardNoUndo': 'Änderungen in {path} verworfen (zu groß für ein Rückgängig)',
        'toast.restored': 'Wiederhergestellt',
        'undo.menu': 'Zuletzt gelöscht (rückgängig)',
        'undo.empty': 'Derzeit nichts rückgängig zu machen',
        'undo.branch': 'Branch',
        'undo.stash': 'Stash',
        'undo.discard': 'Verwerfen',
        'confirm.typeName': 'Zur Bestätigung {name} eingeben',
        'confirm.protected': '{name} ist ein Hauptbranch. Das Löschen ist riskant, daher bitte den Branchnamen eingeben —— ein Hinweis kann ihn danach noch zurückholen.',
        'discard.untracked.confirm': 'Nicht verfolgte Datei {path} löschen? Der Inhalt wird entfernt —— ein Hinweis kann ihn danach zurückholen.',
        'stashDrop.confirm': 'Stash {ref} verwerfen? Ein Hinweis kann ihn danach zurückholen.',
        'operation.merge': 'Merge läuft',
        'operation.rebase': 'Rebase läuft',
        'operation.cherry-pick': 'Cherry-Pick läuft',
        'operation.revert': 'Revert läuft',
        'operation.bisect': 'Bisect läuft',
        'operation.hint': 'In diesem Repository läuft noch eine mehrstufige Operation —— bitte zuerst abschließen oder abbrechen',
        'confirm.title': 'Bestätigen',
        'confirm.cancel': 'Abbrechen',
        'confirm.ok': 'OK',
        'prompt.newBranch': 'Name des neuen Branch (wird erstellt und ausgecheckt)',
        'prompt.renameBranch': 'Branch umbenennen',
        'prompt.newTag': 'Name des neuen Tags',
        'prompt.fromHead': 'aktuelles HEAD',
        'error.dismiss': 'Schließen',
        'status.loading': 'Wird gelesen...',
        'status.busy': 'Arbeitet...',
        'counts.staged': 'Vorgemerkt {n}',
        'counts.ignored': 'Ignoriert {n}',
        'counts.unstaged': 'Änderungen {n}',
        'counts.untracked': 'Nicht verfolgt {n}',
        'counts.conflicted': 'Konflikte {n}',
        'push.confirm': '{branch} nach {upstream} pushen?',
        'delete.confirm': 'Branch {name} löschen? Ein Hinweis kann ihn danach zurückholen (git verweigert weiterhin nicht gemergte Branches).',
        'discard.confirm': 'Änderungen in {path} verwerfen? Der Arbeitsbaum wird überschrieben —— ein Hinweis kann sie danach zurückholen.',
        'resetHard.confirm': 'Hart auf {hash} zurücksetzen? Nicht committete Änderungen gehen verloren.',
        'resetSoft.confirm': 'HEAD auf {hash} verschieben (Arbeitsbaum bleibt)?',
        'checkoutCommit.confirm': 'Commit {hash} auschecken? (detached HEAD)',
      },
      /* locale: fr */
      'fr': {
        'title': 'Git',
        'description': 'Panneau Git de niveau IDE : arbre des branches / graphe des commits / modifications',
        'repo.label': 'Dépôt',
        'repo.workspace': 'espace de travail',
        'repo.nested': 'imbriqué',
        'repo.none': 'Cet espace de travail n\'est pas un dépôt Git',
        'repo.pick': 'Choisir un dépôt à inspecter',
        'repo.empty': 'Aucun dépôt Git trouvé dans cet espace de travail',
        'repo.switch': 'Changer de dépôt',
        'branch.switch': 'Changer de branche',
        'seg.changes': 'Modifications {n}',
        'seg.history': 'Historique',
        'branches.local': 'Locales',
        'branches.remote': 'Distantes',
        'branches.tags': 'Étiquettes',
        'branches.head': 'HEAD (branche courante)',
        'branches.favorites': 'Favoris',
        'branches.pickHint': 'Cliquer pour sélectionner, double-cliquer pour extraire',
        'branches.worktree': 'Extraite dans un autre arbre de travail',
        'action.stash': 'Remisage',
        'action.favorite': 'Ajouter/retirer la branche courante des favoris',
        'action.newTagHere': 'Nouvelle étiquette sur le commit courant...',
        'stash.push': 'Remiser les modifications courantes',
        'stash.apply': 'Appliquer le dernier remisage',
        'stash.drop': 'Supprimer le dernier remisage',
        'stash.count': '{n} remisages',
        'note.noChanges': 'Aucune modification en attente',
        'note.noBranches': 'Aucune autre branche',
        'branches.filter': 'Branche ou étiquette',
        'changes.title': 'Modifications',
        'changes.staged': 'Indexé',
        'changes.unstaged': 'Modifications',
        'changes.untracked': 'Non suivi',
        'changes.conflicted': 'Conflits',
        'changes.empty': 'Aucune modification en attente',
        'changes.commitPlaceholder': 'Message de commit (Ctrl+Entrée)',
        'changes.commit': 'Valider',
        'changes.amend': 'Corriger le dernier commit',
        'changes.stageAll': 'Tout indexer',
        'changes.unstageAll': 'Tout désindexer',
        'changes.groupBy': 'Grouper par',
        'changes.groupFlat': 'Liste plate',
        'changes.groupDir': 'Par répertoire',
        'changes.expandAll': 'Tout déplier',
        'changes.foldAll': 'Tout replier',
        'changes.showIgnored': 'Afficher les fichiers ignorés',
        'changes.rootDir': '(racine)',
        'changes.commitAndPush': 'Valider et pousser',
        'action.stage': 'Indexer',
        'action.unstage': 'Désindexer',
        'action.discard': 'Abandonner les modifications',
        'action.showDiff': 'Afficher le diff',
        'action.copyPath': 'Copier le chemin',
        'action.checkout': 'Extraire',
        'action.float': 'Détacher cette page',
        'action.dock': 'Réancrer',
        'action.split': 'Fractionner',
        'action.fullscreen': 'Plein écran',
        'action.exitFullscreen': 'Quitter le plein écran',
        'action.newBranchFrom': 'Nouvelle branche depuis ici...',
        'action.newBranchHere': 'Nouvelle branche ici...',
        'action.rename': 'Renommer...',
        'action.delete': 'Supprimer',
        'action.mergeIntoCurrent': 'Fusionner dans la branche courante',
        'action.rebaseCurrentOnto': 'Rebaser la branche courante sur celle-ci',
        'action.compare': 'Comparer avec la branche courante',
        'action.update': 'Mettre à jour (fetch)',
        'action.push': 'Pousser',
        'action.newTag': 'Nouvelle étiquette...',
        'action.cherryPick': 'Cherry-pick',
        'action.revert': 'Annuler le commit',
        'action.resetSoft': 'Réinitialiser ici (garder les modifications)',
        'action.resetHard': 'Réinitialiser ici (abandonner les modifications)',
        'action.copyHash': 'Copier le numéro de révision',
        'action.details': 'Détails du commit',
        'history.empty': 'Ce dépôt n\'a pas encore de commit',
        'history.loadMore': 'Charger plus',
        'history.filter': 'Texte ou empreinte',
        'detail.files': 'Fichiers modifiés',
        'detail.back': 'Retour à l\'historique',
        'detail.noFiles': 'Aucune modification de fichier',
        'diff.empty': 'Aucun diff textuel à afficher',
        'pane.diff': 'vue du diff',
        'pane.resize': 'Glisser pour redimensionner {name} (double-clic pour réinitialiser, flèches pour ajuster)',
        'diff.binary': 'Fichier binaire',
        'diff.loading': 'Chargement du diff...',
        'toolbar.refresh': 'Rafraîchir',
        'toolbar.newBranch': 'Nouvelle branche',
        'toolbar.fetch': 'Récupérer',
        'toolbar.pull': 'Tirer',
        'toolbar.push': 'Pousser',
        'toolbar.tree': 'Volet des branches',
        'rail.more': 'Plus d\'actions',
        'rail.settings': 'Réglages de la barre d\'actions',
        'rail.openSettings': 'Ouvrir les réglages du plugin',
        'settings.rail.title': 'Boutons de la barre d’actions',
        'settings.rail.hint': 'Cochez les actions affichées sur la barre. L’ordre est fixe ; décocher masque une action.',
        'settings.rail.unavailable': 'Cet hôte n’a pas de service de réglages ; utilisez « Réglages de la barre d’actions » dans le panneau.',
        'settings.commit.title': 'Message de commit par IA',
        'settings.commit.model': 'Modèle',
        'settings.commit.modelHint': 'Vide = suivre cette session (provider/model)',
        'settings.commit.reasoning': 'Effort de raisonnement',
        'settings.commit.reasoningHint': 'Vide = valeur par défaut du modèle',
        'settings.commit.prompt': 'Instructions supplémentaires',
        'settings.commit.promptHint': 'ex. Conventional Commits, sujet en français, 72 caractères maximum',
        'settings.commit.tooLong': 'Seuls les {n} premiers caractères sont enregistrés',
        'changes.aiWrite': 'Écrire avec l’IA',
        'changes.aiBusy': 'Rédaction…',
        'changes.aiQuota': 'Consomme votre propre quota',
        'changes.aiOverwriteTitle': 'Remplacer le brouillon actuel ?',
        'changes.aiOverwriteText': 'Le texte de l’IA remplacera le message saisi (annulable).',
        'changes.aiUndo': 'Annuler, reprendre mon brouillon',
        'changes.aiFailed': 'Échec de la rédaction :',
        'changes.aiNotice': 'Certaines modifications n’ont pas été envoyées au modèle (tronquées ou écartées) ; le message peut être incomplet.',
        'settings.rail.writeFailed': 'Le réglage n’a pas été enregistré ; l’interrupteur est revenu en place. Réessayez.',
        'settings.rail.readonly': 'Cet hôte fournit la configuration en lecture seule.',
        'rail.settingsHint': 'Glisser ou utiliser les flèches pour réordonner ; l\'œil bascule la visibilité',
        'rail.reset': 'Rétablir les valeurs par défaut',
        'rail.up': 'Monter',
        'rail.down': 'Descendre',
        'rail.show': 'Afficher',
        'rail.hide': 'Masquer',
        'action.unavailable': 'Indisponible dans l\'état actuel',
        'filter.branch': 'Branche',
        'filter.user': 'Auteur',
        'filter.date': 'Date',
        'filter.path': 'Chemin',
        'filter.all': 'Tout',
        'filter.today': 'Aujourd\'hui',
        'filter.week': '7 derniers jours',
        'filter.month': '30 derniers jours',
        'filter.year': 'Cette année',
        'filter.pathPlaceholder': 'Filtrer par chemin (Entrée)',
        'filter.sortDesc': 'Plus récents d’abord',
        'filter.sortAsc': 'Plus anciens d’abord',
        'filter.clear': 'Effacer les filtres',
        'filter.none': 'Aucun commit correspondant',
        'toast.undo': 'Annuler',
        'toast.close': 'Fermer',
        'toast.branchDeleted': 'Branche {name} supprimée',
        'toast.stashDropped': 'Remisage {ref} supprimé',
        'toast.discarded': 'Modifications de {path} abandonnées',
        'toast.discardNoUndo': 'Modifications de {path} abandonnées (trop volumineuses pour être annulées)',
        'toast.restored': 'Restauré',
        'undo.menu': 'Supprimés récemment (annuler)',
        'undo.empty': 'Rien à annuler pour le moment',
        'undo.branch': 'Branche',
        'undo.stash': 'Remisage',
        'undo.discard': 'Abandon',
        'confirm.typeName': 'Saisir {name} pour confirmer',
        'confirm.protected': '{name} est une branche principale. Sa suppression est risquée : saisissez le nom de la branche pour confirmer —— une notification peut ensuite la rétablir.',
        'discard.untracked.confirm': 'Supprimer le fichier non suivi {path} ? Son contenu est retiré —— une notification peut ensuite le rétablir.',
        'stashDrop.confirm': 'Supprimer le remisage {ref} ? Une notification peut ensuite le rétablir.',
        'operation.merge': 'Fusion en cours',
        'operation.rebase': 'Rebasage en cours',
        'operation.cherry-pick': 'Cherry-pick en cours',
        'operation.revert': 'Annulation en cours',
        'operation.bisect': 'Bisect en cours',
        'operation.hint': 'Ce dépôt a encore une opération multi-étapes en cours —— terminez-la ou abandonnez-la avant les actions de branche',
        'confirm.title': 'Confirmer',
        'confirm.cancel': 'Annuler',
        'confirm.ok': 'OK',
        'prompt.newBranch': 'Nom de la nouvelle branche (créée et extraite)',
        'prompt.renameBranch': 'Renommer la branche',
        'prompt.newTag': 'Nom de la nouvelle étiquette',
        'prompt.fromHead': 'HEAD courant',
        'error.dismiss': 'Fermer',
        'status.loading': 'Lecture...',
        'status.busy': 'En cours...',
        'counts.staged': 'Indexé {n}',
        'counts.ignored': 'Ignoré {n}',
        'counts.unstaged': 'Modifications {n}',
        'counts.untracked': 'Non suivi {n}',
        'counts.conflicted': 'Conflits {n}',
        'push.confirm': 'Pousser {branch} vers {upstream} ?',
        'delete.confirm': 'Supprimer la branche {name} ? Une notification peut ensuite la rétablir (git refuse toujours les branches non fusionnées).',
        'discard.confirm': 'Abandonner les modifications de {path} ? Le contenu de l’arbre de travail est écrasé —— une notification peut ensuite le rétablir.',
        'resetHard.confirm': 'Réinitialisation dure sur {hash} ? Les modifications non validées sont perdues.',
        'resetSoft.confirm': 'Déplacer HEAD sur {hash} (arbre de travail conservé) ?',
        'checkoutCommit.confirm': 'Extraire le commit {hash} ? (HEAD détachée)',
      },
      /* locale: ru */
      'ru': {
        'title': 'Git',
        'description': 'Панель Git уровня IDE: дерево веток / граф коммитов / изменения',
        'repo.label': 'Репозиторий',
        'repo.workspace': 'рабочая область',
        'repo.nested': 'вложенный',
        'repo.none': 'Эта рабочая область не является репозиторием Git',
        'repo.pick': 'Выберите репозиторий для просмотра',
        'repo.empty': 'В этой рабочей области репозиторий Git не найден',
        'repo.switch': 'Сменить репозиторий',
        'branch.switch': 'Сменить ветку',
        'seg.changes': 'Изменения {n}',
        'seg.history': 'История',
        'branches.local': 'Локальные',
        'branches.remote': 'Удалённые',
        'branches.tags': 'Теги',
        'branches.head': 'HEAD (текущая ветка)',
        'branches.favorites': 'Избранное',
        'branches.pickHint': 'Щёлкните для выбора, двойной щелчок — переключение',
        'branches.worktree': 'Уже развёрнута в другом рабочем дереве',
        'action.stash': 'Отложить',
        'action.favorite': 'Добавить/убрать текущую ветку из избранного',
        'action.newTagHere': 'Новый тег на текущем коммите...',
        'stash.push': 'Отложить текущие изменения',
        'stash.apply': 'Применить последнюю отложенную запись',
        'stash.drop': 'Удалить последнюю отложенную запись',
        'stash.count': 'Отложенных записей: {n}',
        'note.noChanges': 'Нет незакоммиченных изменений',
        'note.noBranches': 'Других веток нет',
        'branches.filter': 'Ветка или тег',
        'changes.title': 'Изменения',
        'changes.staged': 'В индексе',
        'changes.unstaged': 'Изменения',
        'changes.untracked': 'Не отслеживается',
        'changes.conflicted': 'Конфликты',
        'changes.empty': 'Нет незакоммиченных изменений',
        'changes.commitPlaceholder': 'Сообщение коммита (Ctrl+Enter)',
        'changes.commit': 'Закоммитить',
        'changes.amend': 'Дополнить последний коммит',
        'changes.stageAll': 'Добавить всё в индекс',
        'changes.unstageAll': 'Убрать всё из индекса',
        'changes.groupBy': 'Группировать по',
        'changes.groupFlat': 'Плоский список',
        'changes.groupDir': 'По каталогам',
        'changes.expandAll': 'Развернуть всё',
        'changes.foldAll': 'Свернуть всё',
        'changes.showIgnored': 'Показывать игнорируемые файлы',
        'changes.rootDir': '(корень)',
        'changes.commitAndPush': 'Закоммитить и отправить',
        'action.stage': 'В индекс',
        'action.unstage': 'Из индекса',
        'action.discard': 'Отменить изменения',
        'action.showDiff': 'Показать различия',
        'action.copyPath': 'Скопировать путь',
        'action.checkout': 'Переключиться',
        'action.float': 'Открепить страницу',
        'action.dock': 'Вернуть в док',
        'action.split': 'Разделить',
        'action.fullscreen': 'Полный экран',
        'action.exitFullscreen': 'Выйти из полного экрана',
        'action.newBranchFrom': 'Новая ветка отсюда...',
        'action.newBranchHere': 'Новая ветка здесь...',
        'action.rename': 'Переименовать...',
        'action.delete': 'Удалить',
        'action.mergeIntoCurrent': 'Влить в текущую ветку',
        'action.rebaseCurrentOnto': 'Перебазировать текущую ветку сюда',
        'action.compare': 'Сравнить с текущей веткой',
        'action.update': 'Обновить (fetch)',
        'action.push': 'Отправить',
        'action.newTag': 'Новый тег...',
        'action.cherryPick': 'Cherry-pick',
        'action.revert': 'Отменить коммит',
        'action.resetSoft': 'Сбросить сюда (сохранить изменения)',
        'action.resetHard': 'Сбросить сюда (отбросить изменения)',
        'action.copyHash': 'Скопировать номер ревизии',
        'action.details': 'Сведения о коммите',
        'history.empty': 'В этом репозитории ещё нет коммитов',
        'history.loadMore': 'Загрузить ещё',
        'history.filter': 'Текст или хеш',
        'detail.files': 'Изменённые файлы',
        'detail.back': 'Назад к истории',
        'detail.noFiles': 'Файлы не изменялись',
        'diff.empty': 'Нет текстовых различий для показа',
        'pane.diff': 'просмотр diff',
        'pane.resize': 'Перетащите, чтобы изменить размер {name} (двойной клик — сброс, стрелки — точная настройка)',
        'diff.binary': 'Двоичный файл',
        'diff.loading': 'Загрузка различий...',
        'toolbar.refresh': 'Обновить',
        'toolbar.newBranch': 'Новая ветка',
        'toolbar.fetch': 'Получить',
        'toolbar.pull': 'Забрать',
        'toolbar.push': 'Отправить',
        'toolbar.tree': 'Панель веток',
        'rail.more': 'Другие действия',
        'rail.settings': 'Настройки панели действий',
        'rail.openSettings': 'Открыть настройки плагина',
        'settings.rail.title': 'Кнопки панели действий',
        'settings.rail.hint': 'Отметьте действия, показываемые на панели. Порядок фиксирован; снятие флажка скрывает действие.',
        'settings.rail.unavailable': 'На этом хосте нет службы настроек; используйте «Настройки панели действий» в панели.',
        'settings.commit.title': 'Сообщение коммита от ИИ',
        'settings.commit.model': 'Модель',
        'settings.commit.modelHint': 'Пусто = как в этой сессии (provider/model)',
        'settings.commit.reasoning': 'Усилие рассуждения',
        'settings.commit.reasoningHint': 'Пусто = по умолчанию у модели',
        'settings.commit.prompt': 'Дополнительные указания',
        'settings.commit.promptHint': 'напр. Conventional Commits, тема по-русски, до 72 символов',
        'settings.commit.tooLong': 'Сохраняются только первые {n} символов',
        'changes.aiWrite': 'Написать с ИИ',
        'changes.aiBusy': 'Генерация…',
        'changes.aiQuota': 'Расходует вашу квоту',
        'changes.aiOverwriteTitle': 'Заменить текущий черновик?',
        'changes.aiOverwriteText': 'Текст ИИ заменит введённое сообщение коммита (можно отменить).',
        'changes.aiUndo': 'Отменить',
        'changes.aiFailed': 'Не удалось сгенерировать:',
        'changes.aiNotice': 'Часть изменений не отправлена модели (обрезана или отброшена); сообщение может быть неполным.',
        'settings.rail.writeFailed': 'Настройка не сохранилась; переключатель вернулся назад. Попробуйте снова.',
        'settings.rail.readonly': 'Этот хост отдаёт конфигурацию только для чтения.',
        'rail.settingsHint': 'Перетаскивайте или используйте стрелки для порядка; значок глаза переключает видимость',
        'rail.reset': 'Вернуть значения по умолчанию',
        'rail.up': 'Вверх',
        'rail.down': 'Вниз',
        'rail.show': 'Показать',
        'rail.hide': 'Скрыть',
        'action.unavailable': 'Недоступно в текущем состоянии',
        'filter.branch': 'Ветка',
        'filter.user': 'Автор',
        'filter.date': 'Дата',
        'filter.path': 'Путь',
        'filter.all': 'Все',
        'filter.today': 'Сегодня',
        'filter.week': 'Последние 7 дней',
        'filter.month': 'Последние 30 дней',
        'filter.year': 'В этом году',
        'filter.pathPlaceholder': 'Фильтр по пути (Enter)',
        'filter.sortDesc': 'Сначала новые',
        'filter.sortAsc': 'Сначала старые',
        'filter.clear': 'Сбросить фильтры',
        'filter.none': 'Подходящих коммитов нет',
        'toast.undo': 'Отменить',
        'toast.close': 'Закрыть',
        'toast.branchDeleted': 'Ветка {name} удалена',
        'toast.stashDropped': 'Отложенная запись {ref} удалена',
        'toast.discarded': 'Изменения в {path} отменены',
        'toast.discardNoUndo': 'Изменения в {path} отменены (слишком велики, отмена не сохранена)',
        'toast.restored': 'Восстановлено',
        'undo.menu': 'Недавно удалённое (отменить)',
        'undo.empty': 'Сейчас нечего отменять',
        'undo.branch': 'Ветка',
        'undo.stash': 'Отложенная запись',
        'undo.discard': 'Отмена изменений',
        'confirm.typeName': 'Введите {name} для подтверждения',
        'confirm.protected': '{name} — основная ветка. Удаление рискованно, поэтому введите имя ветки для подтверждения —— уведомление затем сможет её вернуть.',
        'discard.untracked.confirm': 'Удалить неотслеживаемый файл {path}? Его содержимое будет удалено —— уведомление затем сможет его вернуть.',
        'stashDrop.confirm': 'Удалить отложенную запись {ref}? Уведомление затем сможет её вернуть.',
        'operation.merge': 'Идёт слияние',
        'operation.rebase': 'Идёт перебазирование',
        'operation.cherry-pick': 'Идёт cherry-pick',
        'operation.revert': 'Идёт отмена коммита',
        'operation.bisect': 'Идёт bisect',
        'operation.hint': 'В этом репозитории ещё не завершена многошаговая операция —— завершите или прервите её перед действиями с ветками',
        'confirm.title': 'Подтверждение',
        'confirm.cancel': 'Отмена',
        'confirm.ok': 'OK',
        'prompt.newBranch': 'Имя новой ветки (будет создана и выбрана)',
        'prompt.renameBranch': 'Переименовать ветку',
        'prompt.newTag': 'Имя нового тега',
        'prompt.fromHead': 'текущий HEAD',
        'error.dismiss': 'Закрыть',
        'status.loading': 'Чтение...',
        'status.busy': 'Работа...',
        'counts.staged': 'В индексе {n}',
        'counts.ignored': 'Игнорируется {n}',
        'counts.unstaged': 'Изменения {n}',
        'counts.untracked': 'Не отслеживается {n}',
        'counts.conflicted': 'Конфликты {n}',
        'push.confirm': 'Отправить {branch} в {upstream}?',
        'delete.confirm': 'Удалить ветку {name}? Уведомление затем сможет её вернуть (git по-прежнему откажет для несмёрженных веток).',
        'discard.confirm': 'Отменить изменения в {path}? Содержимое рабочего дерева будет перезаписано —— уведомление затем сможет его вернуть.',
        'resetHard.confirm': 'Жёсткий сброс на {hash}? Незакоммиченные изменения будут потеряны.',
        'resetSoft.confirm': 'Переместить HEAD на {hash} (рабочее дерево сохранится)?',
        'checkoutCommit.confirm': 'Переключиться на коммит {hash}? (detached HEAD)',
      },
      /* locale: pt */
      'pt': {
        'title': 'Git',
        'description': 'Painel Git de nível IDE: árvore de branches / grafo de commits / alterações',
        'repo.label': 'Repositório',
        'repo.workspace': 'área de trabalho',
        'repo.nested': 'aninhado',
        'repo.none': 'Esta área de trabalho não é um repositório Git',
        'repo.pick': 'Escolha um repositório para inspecionar',
        'repo.empty': 'Nenhum repositório Git encontrado nesta área de trabalho',
        'repo.switch': 'Trocar de repositório',
        'branch.switch': 'Trocar de branch',
        'seg.changes': 'Alterações {n}',
        'seg.history': 'Histórico',
        'branches.local': 'Locais',
        'branches.remote': 'Remotas',
        'branches.tags': 'Tags',
        'branches.head': 'HEAD (branch atual)',
        'branches.favorites': 'Favoritas',
        'branches.pickHint': 'Clique para selecionar, clique duplo para fazer checkout',
        'branches.worktree': 'Já em checkout em outra árvore de trabalho',
        'action.stash': 'Stash',
        'action.favorite': 'Adicionar/remover a branch atual dos favoritos',
        'action.newTagHere': 'Nova tag no commit atual...',
        'stash.push': 'Guardar alterações atuais',
        'stash.apply': 'Aplicar o stash mais recente',
        'stash.drop': 'Descartar o stash mais recente',
        'stash.count': '{n} stashes',
        'note.noChanges': 'Nenhuma alteração pendente',
        'note.noBranches': 'Nenhuma outra branch',
        'branches.filter': 'Branch ou tag',
        'changes.title': 'Alterações',
        'changes.staged': 'Preparado',
        'changes.unstaged': 'Alterações',
        'changes.untracked': 'Não rastreado',
        'changes.conflicted': 'Conflitos',
        'changes.empty': 'Nenhuma alteração pendente',
        'changes.commitPlaceholder': 'Mensagem do commit (Ctrl+Enter)',
        'changes.commit': 'Commitar',
        'changes.amend': 'Corrigir o último commit',
        'changes.stageAll': 'Preparar tudo',
        'changes.unstageAll': 'Despreparar tudo',
        'changes.groupBy': 'Agrupar por',
        'changes.groupFlat': 'Lista simples',
        'changes.groupDir': 'Por diretório',
        'changes.expandAll': 'Expandir tudo',
        'changes.foldAll': 'Recolher tudo',
        'changes.showIgnored': 'Mostrar arquivos ignorados',
        'changes.rootDir': '(raiz)',
        'changes.commitAndPush': 'Commitar e enviar',
        'action.stage': 'Preparar',
        'action.unstage': 'Despreparar',
        'action.discard': 'Descartar alterações',
        'action.showDiff': 'Mostrar diff',
        'action.copyPath': 'Copiar caminho',
        'action.checkout': 'Checkout',
        'action.float': 'Flutuar esta página',
        'action.dock': 'Reacoplar',
        'action.split': 'Dividir',
        'action.fullscreen': 'Tela cheia',
        'action.exitFullscreen': 'Sair da tela cheia',
        'action.newBranchFrom': 'Nova branch a partir daqui...',
        'action.newBranchHere': 'Nova branch aqui...',
        'action.rename': 'Renomear...',
        'action.delete': 'Excluir',
        'action.mergeIntoCurrent': 'Mesclar na branch atual',
        'action.rebaseCurrentOnto': 'Rebasear a branch atual sobre esta',
        'action.compare': 'Comparar com a branch atual',
        'action.update': 'Atualizar (fetch)',
        'action.push': 'Enviar',
        'action.newTag': 'Nova tag...',
        'action.cherryPick': 'Cherry-pick',
        'action.revert': 'Reverter commit',
        'action.resetSoft': 'Redefinir aqui (manter alterações)',
        'action.resetHard': 'Redefinir aqui (descartar alterações)',
        'action.copyHash': 'Copiar número da revisão',
        'action.details': 'Detalhes do commit',
        'history.empty': 'Este repositório ainda não tem commits',
        'history.loadMore': 'Carregar mais',
        'history.filter': 'Texto ou hash',
        'detail.files': 'Arquivos alterados',
        'detail.back': 'Voltar ao histórico',
        'detail.noFiles': 'Nenhuma alteração de arquivo',
        'diff.empty': 'Nenhum diff textual para mostrar',
        'pane.diff': 'visualização do diff',
        'pane.resize': 'Arraste para redimensionar {name} (duplo clique restaura, setas ajustam)',
        'diff.binary': 'Arquivo binário',
        'diff.loading': 'Carregando diff...',
        'toolbar.refresh': 'Atualizar',
        'toolbar.newBranch': 'Nova branch',
        'toolbar.fetch': 'Buscar',
        'toolbar.pull': 'Puxar',
        'toolbar.push': 'Enviar',
        'toolbar.tree': 'Painel de branches',
        'rail.more': 'Mais ações',
        'rail.settings': 'Configurações da barra de ações',
        'rail.openSettings': 'Abrir configurações do plugin',
        'settings.rail.title': 'Botões da barra de ações',
        'settings.rail.hint': 'Marque as ações exibidas na barra. A ordem é fixa; desmarcar oculta uma ação.',
        'settings.rail.unavailable': 'Este host não tem serviço de configurações; use «Configurações da barra de ações» no painel.',
        'settings.commit.title': 'Mensagem de commit por IA',
        'settings.commit.model': 'Modelo',
        'settings.commit.modelHint': 'Vazio = seguir esta sessão (provider/model)',
        'settings.commit.reasoning': 'Esforço de raciocínio',
        'settings.commit.reasoningHint': 'Vazio = padrão do modelo',
        'settings.commit.prompt': 'Instruções extras',
        'settings.commit.promptHint': 'ex.: Conventional Commits, assunto em português, até 72 caracteres',
        'settings.commit.tooLong': 'Só os primeiros {n} caracteres são salvos',
        'changes.aiWrite': 'Escrever com IA',
        'changes.aiBusy': 'Gerando…',
        'changes.aiQuota': 'Consome a sua cota',
        'changes.aiOverwriteTitle': 'Substituir o rascunho atual?',
        'changes.aiOverwriteText': 'O texto da IA substituirá a mensagem que você digitou (dá para desfazer).',
        'changes.aiUndo': 'Desfazer',
        'changes.aiFailed': 'Não foi possível gerar:',
        'changes.aiNotice': 'Algumas alterações não foram enviadas ao modelo (truncadas ou descartadas); a mensagem pode ficar incompleta.',
        'settings.rail.writeFailed': 'A configuração não foi salva; o interruptor voltou ao lugar. Tente de novo.',
        'settings.rail.readonly': 'Este host fornece a configuração somente para leitura.',
        'rail.settingsHint': 'Arraste ou use as setas para reordenar; o olho alterna a visibilidade',
        'rail.reset': 'Restaurar padrões',
        'rail.up': 'Mover para cima',
        'rail.down': 'Mover para baixo',
        'rail.show': 'Mostrar',
        'rail.hide': 'Ocultar',
        'action.unavailable': 'Indisponível no estado atual',
        'filter.branch': 'Branch',
        'filter.user': 'Autor',
        'filter.date': 'Data',
        'filter.path': 'Caminho',
        'filter.all': 'Tudo',
        'filter.today': 'Hoje',
        'filter.week': 'Últimos 7 dias',
        'filter.month': 'Últimos 30 dias',
        'filter.year': 'Este ano',
        'filter.pathPlaceholder': 'Filtrar por caminho (Enter)',
        'filter.sortDesc': 'Mais recentes primeiro',
        'filter.sortAsc': 'Mais antigos primeiro',
        'filter.clear': 'Limpar filtros',
        'filter.none': 'Nenhum commit correspondente',
        'toast.undo': 'Desfazer',
        'toast.close': 'Fechar',
        'toast.branchDeleted': 'Branch {name} excluída',
        'toast.stashDropped': 'Stash {ref} descartado',
        'toast.discarded': 'Alterações em {path} descartadas',
        'toast.discardNoUndo': 'Alterações em {path} descartadas (grandes demais para desfazer)',
        'toast.restored': 'Restaurado',
        'undo.menu': 'Excluídos recentemente (desfazer)',
        'undo.empty': 'Nada para desfazer agora',
        'undo.branch': 'Branch',
        'undo.stash': 'Stash',
        'undo.discard': 'Descarte',
        'confirm.typeName': 'Digite {name} para confirmar',
        'confirm.protected': '{name} é uma branch principal. Excluí-la é arriscado, então digite o nome da branch para confirmar —— um aviso ainda poderá trazê-la de volta.',
        'discard.untracked.confirm': 'Excluir o arquivo não rastreado {path}? O conteúdo será removido —— um aviso ainda poderá trazê-lo de volta.',
        'stashDrop.confirm': 'Descartar o stash {ref}? Um aviso ainda poderá trazê-lo de volta.',
        'operation.merge': 'Mesclagem em andamento',
        'operation.rebase': 'Rebase em andamento',
        'operation.cherry-pick': 'Cherry-pick em andamento',
        'operation.revert': 'Reversão em andamento',
        'operation.bisect': 'Bisect em andamento',
        'operation.hint': 'Este repositório ainda tem uma operação de várias etapas aberta —— conclua ou aborte antes das ações de branch',
        'confirm.title': 'Confirmar',
        'confirm.cancel': 'Cancelar',
        'confirm.ok': 'OK',
        'prompt.newBranch': 'Nome da nova branch (criada e com checkout)',
        'prompt.renameBranch': 'Renomear branch',
        'prompt.newTag': 'Nome da nova tag',
        'prompt.fromHead': 'HEAD atual',
        'error.dismiss': 'Fechar',
        'status.loading': 'Lendo...',
        'status.busy': 'Trabalhando...',
        'counts.staged': 'Preparado {n}',
        'counts.ignored': 'Ignorado {n}',
        'counts.unstaged': 'Alterações {n}',
        'counts.untracked': 'Não rastreado {n}',
        'counts.conflicted': 'Conflitos {n}',
        'push.confirm': 'Enviar {branch} para {upstream}?',
        'delete.confirm': 'Excluir a branch {name}? Um aviso ainda poderá trazê-la de volta (o git continua recusando branches não mescladas).',
        'discard.confirm': 'Descartar as alterações em {path}? O conteúdo da árvore de trabalho será sobrescrito —— um aviso ainda poderá trazê-lo de volta.',
        'resetHard.confirm': 'Redefinição forçada para {hash}? Alterações não commitadas serão perdidas.',
        'resetSoft.confirm': 'Mover HEAD para {hash} (árvore de trabalho mantida)?',
        'checkoutCommit.confirm': 'Fazer checkout do commit {hash}? (HEAD destacado)',
      },
      /* locale: it */
      'it': {
        'title': 'Git',
        'description': 'Pannello Git di livello IDE: albero dei branch / grafo dei commit / modifiche',
        'repo.label': 'Repository',
        'repo.workspace': 'area di lavoro',
        'repo.nested': 'annidato',
        'repo.none': 'Questa area di lavoro non è un repository Git',
        'repo.pick': 'Scegli un repository da esaminare',
        'repo.empty': 'Nessun repository Git trovato in questa area di lavoro',
        'repo.switch': 'Cambia repository',
        'branch.switch': 'Cambia branch',
        'seg.changes': 'Modifiche {n}',
        'seg.history': 'Cronologia',
        'branches.local': 'Locali',
        'branches.remote': 'Remoti',
        'branches.tags': 'Tag',
        'branches.head': 'HEAD (branch corrente)',
        'branches.favorites': 'Preferiti',
        'branches.pickHint': 'Clic per selezionare, doppio clic per fare checkout',
        'branches.worktree': 'Già in checkout in un altro albero di lavoro',
        'action.stash': 'Stash',
        'action.favorite': 'Aggiungi/rimuovi il branch corrente dai preferiti',
        'action.newTagHere': 'Nuovo tag sul commit corrente...',
        'stash.push': 'Metti in stash le modifiche correnti',
        'stash.apply': 'Applica lo stash più recente',
        'stash.drop': 'Elimina lo stash più recente',
        'stash.count': '{n} stash',
        'note.noChanges': 'Nessuna modifica in sospeso',
        'note.noBranches': 'Nessun altro branch',
        'branches.filter': 'Branch o tag',
        'changes.title': 'Modifiche',
        'changes.staged': 'In stage',
        'changes.unstaged': 'Modifiche',
        'changes.untracked': 'Non tracciati',
        'changes.conflicted': 'Conflitti',
        'changes.empty': 'Nessuna modifica in sospeso',
        'changes.commitPlaceholder': 'Messaggio di commit (Ctrl+Invio)',
        'changes.commit': 'Esegui commit',
        'changes.amend': 'Correggi l’ultimo commit',
        'changes.stageAll': 'Metti tutto in stage',
        'changes.unstageAll': 'Rimuovi tutto dallo stage',
        'changes.groupBy': 'Raggruppa per',
        'changes.groupFlat': 'Elenco piatto',
        'changes.groupDir': 'Per directory',
        'changes.expandAll': 'Espandi tutto',
        'changes.foldAll': 'Comprimi tutto',
        'changes.showIgnored': 'Mostra i file ignorati',
        'changes.rootDir': '(radice)',
        'changes.commitAndPush': 'Commit e push',
        'action.stage': 'Metti in stage',
        'action.unstage': 'Rimuovi dallo stage',
        'action.discard': 'Scarta le modifiche',
        'action.showDiff': 'Mostra il diff',
        'action.copyPath': 'Copia percorso',
        'action.checkout': 'Checkout',
        'action.float': 'Fluttua questa pagina',
        'action.dock': 'Riaggancia',
        'action.split': 'Dividi',
        'action.fullscreen': 'Schermo intero',
        'action.exitFullscreen': 'Esci da schermo intero',
        'action.newBranchFrom': 'Nuovo branch da qui...',
        'action.newBranchHere': 'Nuovo branch qui...',
        'action.rename': 'Rinomina...',
        'action.delete': 'Elimina',
        'action.mergeIntoCurrent': 'Unisci nel branch corrente',
        'action.rebaseCurrentOnto': 'Rebase del branch corrente su questo',
        'action.compare': 'Confronta con il branch corrente',
        'action.update': 'Aggiorna (fetch)',
        'action.push': 'Push',
        'action.newTag': 'Nuovo tag...',
        'action.cherryPick': 'Cherry-pick',
        'action.revert': 'Annulla il commit',
        'action.resetSoft': 'Ripristina qui (mantieni le modifiche)',
        'action.resetHard': 'Ripristina qui (scarta le modifiche)',
        'action.copyHash': 'Copia il numero di revisione',
        'action.details': 'Dettagli del commit',
        'history.empty': 'Questo repository non ha ancora commit',
        'history.loadMore': 'Carica altro',
        'history.filter': 'Testo o hash',
        'detail.files': 'File modificati',
        'detail.back': 'Torna alla cronologia',
        'detail.noFiles': 'Nessuna modifica ai file',
        'diff.empty': 'Nessun diff testuale da mostrare',
        'pane.diff': 'vista diff',
        'pane.resize': 'Trascina per ridimensionare {name} (doppio clic ripristina, frecce per regolare)',
        'diff.binary': 'File binario',
        'diff.loading': 'Caricamento del diff...',
        'toolbar.refresh': 'Aggiorna',
        'toolbar.newBranch': 'Nuovo branch',
        'toolbar.fetch': 'Fetch',
        'toolbar.pull': 'Pull',
        'toolbar.push': 'Push',
        'toolbar.tree': 'Riquadro dei branch',
        'rail.more': 'Altre azioni',
        'rail.settings': 'Impostazioni della barra delle azioni',
        'rail.openSettings': 'Apri le impostazioni del plugin',
        'settings.rail.title': 'Pulsanti della barra azioni',
        'settings.rail.hint': 'Seleziona le azioni mostrate sulla barra. L’ordine è fisso; deselezionando se ne nasconde una.',
        'settings.rail.unavailable': 'Questo host non ha un servizio di impostazioni; usa «Impostazioni barra azioni» nel pannello.',
        'settings.commit.title': 'Messaggio di commit con IA',
        'settings.commit.model': 'Modello',
        'settings.commit.modelHint': 'Vuoto = segui questa sessione (provider/model)',
        'settings.commit.reasoning': 'Sforzo di ragionamento',
        'settings.commit.reasoningHint': 'Vuoto = predefinito del modello',
        'settings.commit.prompt': 'Istruzioni aggiuntive',
        'settings.commit.promptHint': 'es. Conventional Commits, oggetto in italiano, max 72 caratteri',
        'settings.commit.tooLong': 'Solo i primi {n} caratteri vengono salvati',
        'changes.aiWrite': 'Scrivi con l’IA',
        'changes.aiBusy': 'Generazione…',
        'changes.aiQuota': 'Consuma la tua quota',
        'changes.aiOverwriteTitle': 'Sostituire la bozza attuale?',
        'changes.aiOverwriteText': 'Il testo dell’IA sostituirà il messaggio digitato (puoi annullare).',
        'changes.aiUndo': 'Annulla',
        'changes.aiFailed': 'Scrittura non riuscita:',
        'changes.aiNotice': 'Alcune modifiche non sono state inviate al modello (troncate o scartate); il messaggio può essere incompleto.',
        'settings.rail.writeFailed': 'L’impostazione non è stata salvata; l’interruttore è tornato indietro. Riprova.',
        'settings.rail.readonly': 'Questo host fornisce la configurazione in sola lettura.',
        'rail.settingsHint': 'Trascina o usa le frecce per riordinare; l’occhio attiva o disattiva la visibilità',
        'rail.reset': 'Ripristina i valori predefiniti',
        'rail.up': 'Sposta su',
        'rail.down': 'Sposta giù',
        'rail.show': 'Mostra',
        'rail.hide': 'Nascondi',
        'action.unavailable': 'Non disponibile nello stato attuale',
        'filter.branch': 'Branch',
        'filter.user': 'Autore',
        'filter.date': 'Data',
        'filter.path': 'Percorso',
        'filter.all': 'Tutti',
        'filter.today': 'Oggi',
        'filter.week': 'Ultimi 7 giorni',
        'filter.month': 'Ultimi 30 giorni',
        'filter.year': 'Quest’anno',
        'filter.pathPlaceholder': 'Filtra per percorso (Invio)',
        'filter.sortDesc': 'Più recenti prima',
        'filter.sortAsc': 'Più vecchi prima',
        'filter.clear': 'Cancella i filtri',
        'filter.none': 'Nessun commit corrispondente',
        'toast.undo': 'Annulla',
        'toast.close': 'Chiudi',
        'toast.branchDeleted': 'Branch {name} eliminato',
        'toast.stashDropped': 'Stash {ref} eliminato',
        'toast.discarded': 'Modifiche in {path} scartate',
        'toast.discardNoUndo': 'Modifiche in {path} scartate (troppo grandi per essere annullate)',
        'toast.restored': 'Ripristinato',
        'undo.menu': 'Eliminati di recente (annulla)',
        'undo.empty': 'Niente da annullare al momento',
        'undo.branch': 'Branch',
        'undo.stash': 'Stash',
        'undo.discard': 'Scarto',
        'confirm.typeName': 'Digita {name} per confermare',
        'confirm.protected': '{name} è un branch principale. Eliminarlo è rischioso, quindi digita il nome del branch per confermare —— un avviso potrà comunque riportarlo indietro.',
        'discard.untracked.confirm': 'Eliminare il file non tracciato {path}? Il contenuto viene rimosso —— un avviso potrà comunque riportarlo indietro.',
        'stashDrop.confirm': 'Eliminare lo stash {ref}? Un avviso potrà comunque riportarlo indietro.',
        'operation.merge': 'Unione in corso',
        'operation.rebase': 'Rebase in corso',
        'operation.cherry-pick': 'Cherry-pick in corso',
        'operation.revert': 'Annullamento in corso',
        'operation.bisect': 'Bisect in corso',
        'operation.hint': 'Questo repository ha ancora un’operazione a più passaggi aperta —— completala o interrompila prima delle azioni sui branch',
        'confirm.title': 'Conferma',
        'confirm.cancel': 'Annulla',
        'confirm.ok': 'OK',
        'prompt.newBranch': 'Nome del nuovo branch (creato e messo in checkout)',
        'prompt.renameBranch': 'Rinomina il branch',
        'prompt.newTag': 'Nome del nuovo tag',
        'prompt.fromHead': 'HEAD corrente',
        'error.dismiss': 'Chiudi',
        'status.loading': 'Lettura...',
        'status.busy': 'In corso...',
        'counts.staged': 'In stage {n}',
        'counts.ignored': 'Ignorati {n}',
        'counts.unstaged': 'Modifiche {n}',
        'counts.untracked': 'Non tracciati {n}',
        'counts.conflicted': 'Conflitti {n}',
        'push.confirm': 'Inviare {branch} a {upstream}?',
        'delete.confirm': 'Eliminare il branch {name}? Un avviso potrà comunque riportarlo indietro (git continua a rifiutare i branch non uniti).',
        'discard.confirm': 'Scartare le modifiche in {path}? Il contenuto dell’albero di lavoro viene sovrascritto —— un avviso potrà comunque riportarlo indietro.',
        'resetHard.confirm': 'Reset forzato a {hash}? Le modifiche non committate andranno perse.',
        'resetSoft.confirm': 'Spostare HEAD a {hash} (albero di lavoro mantenuto)?',
        'checkoutCommit.confirm': 'Fare checkout del commit {hash}? (HEAD scollegato)',
      },
      /* locale: nl */
      'nl': {
        'title': 'Git',
        'description': 'Git-paneel op IDE-niveau: branchboom / commit-graaf / wijzigingen',
        'repo.label': 'Repository',
        'repo.workspace': 'werkruimte',
        'repo.nested': 'genest',
        'repo.none': 'Deze werkruimte is geen Git-repository',
        'repo.pick': 'Kies een repository om te bekijken',
        'repo.empty': 'Geen Git-repository gevonden in deze werkruimte',
        'repo.switch': 'Wissel van repository',
        'branch.switch': 'Wissel van branch',
        'seg.changes': 'Wijzigingen {n}',
        'seg.history': 'Geschiedenis',
        'branches.local': 'Lokaal',
        'branches.remote': 'Extern',
        'branches.tags': 'Tags',
        'branches.head': 'HEAD (huidige branch)',
        'branches.favorites': 'Favorieten',
        'branches.pickHint': 'Klik om te selecteren, dubbelklik om uit te checken',
        'branches.worktree': 'Al uitgecheckt in een andere werkboom',
        'action.stash': 'Stash',
        'action.favorite': 'Huidige branch aan favorieten toevoegen/onttrekken',
        'action.newTagHere': 'Nieuwe tag op de huidige commit...',
        'stash.push': 'Huidige wijzigingen stashen',
        'stash.apply': 'Nieuwste stash toepassen',
        'stash.drop': 'Nieuwste stash verwijderen',
        'stash.count': '{n} stashes',
        'note.noChanges': 'Geen openstaande wijzigingen',
        'note.noBranches': 'Geen andere branches',
        'branches.filter': 'Branch of tag',
        'changes.title': 'Wijzigingen',
        'changes.staged': 'Gestaged',
        'changes.unstaged': 'Wijzigingen',
        'changes.untracked': 'Niet gevolgd',
        'changes.conflicted': 'Conflicten',
        'changes.empty': 'Geen openstaande wijzigingen',
        'changes.commitPlaceholder': 'Commit-bericht (Ctrl+Enter)',
        'changes.commit': 'Committen',
        'changes.amend': 'Laatste commit aanvullen',
        'changes.stageAll': 'Alles stagen',
        'changes.unstageAll': 'Alles unstagen',
        'changes.groupBy': 'Groeperen op',
        'changes.groupFlat': 'Platte lijst',
        'changes.groupDir': 'Op map',
        'changes.expandAll': 'Alles uitklappen',
        'changes.foldAll': 'Alles inklappen',
        'changes.showIgnored': 'Genegeerde bestanden tonen',
        'changes.rootDir': '(hoofdmap)',
        'changes.commitAndPush': 'Committen en pushen',
        'action.stage': 'Stagen',
        'action.unstage': 'Unstagen',
        'action.discard': 'Wijzigingen weggooien',
        'action.showDiff': 'Diff tonen',
        'action.copyPath': 'Pad kopiëren',
        'action.checkout': 'Uitchecken',
        'action.float': 'Deze pagina losmaken',
        'action.dock': 'Terugdokken',
        'action.split': 'Splitsen',
        'action.fullscreen': 'Volledig scherm',
        'action.exitFullscreen': 'Volledig scherm sluiten',
        'action.newBranchFrom': 'Nieuwe branch vanaf hier...',
        'action.newBranchHere': 'Nieuwe branch hier...',
        'action.rename': 'Hernoemen...',
        'action.delete': 'Verwijderen',
        'action.mergeIntoCurrent': 'Samenvoegen in huidige branch',
        'action.rebaseCurrentOnto': 'Huidige branch rebasen op deze',
        'action.compare': 'Vergelijken met huidige branch',
        'action.update': 'Bijwerken (fetch)',
        'action.push': 'Pushen',
        'action.newTag': 'Nieuwe tag...',
        'action.cherryPick': 'Cherry-pick',
        'action.revert': 'Commit terugdraaien',
        'action.resetSoft': 'Hierheen resetten (wijzigingen behouden)',
        'action.resetHard': 'Hierheen resetten (wijzigingen weggooien)',
        'action.copyHash': 'Revisienummer kopiëren',
        'action.details': 'Commit-details',
        'history.empty': 'Deze repository heeft nog geen commits',
        'history.loadMore': 'Meer laden',
        'history.filter': 'Tekst of hash',
        'detail.files': 'Gewijzigde bestanden',
        'detail.back': 'Terug naar geschiedenis',
        'detail.noFiles': 'Geen bestandswijzigingen',
        'diff.empty': 'Geen tekstuele diff om te tonen',
        'pane.diff': 'diff-weergave',
        'pane.resize': 'Sleep om {name} te vergroten (dubbelklik herstelt, pijltjes stellen fijn af)',
        'diff.binary': 'Binair bestand',
        'diff.loading': 'Diff laden...',
        'toolbar.refresh': 'Vernieuwen',
        'toolbar.newBranch': 'Nieuwe branch',
        'toolbar.fetch': 'Fetch',
        'toolbar.pull': 'Pull',
        'toolbar.push': 'Push',
        'toolbar.tree': 'Branchpaneel',
        'rail.more': 'Meer acties',
        'rail.settings': 'Instellingen van de actiebalk',
        'rail.openSettings': 'Plugin-instellingen openen',
        'settings.rail.title': 'Knoppen van de actiebalk',
        'settings.rail.hint': 'Vink de acties aan die op de balk verschijnen. De volgorde ligt vast; uitvinken verbergt er een.',
        'settings.rail.unavailable': 'Deze host heeft geen instellingenservice; gebruik "Actiebalk-instellingen" in het paneel.',
        'settings.commit.title': 'AI-commitbericht',
        'settings.commit.model': 'Model',
        'settings.commit.modelHint': 'Leeg = deze sessie volgen (provider/model)',
        'settings.commit.reasoning': 'Redeneerinspanning',
        'settings.commit.reasoningHint': 'Leeg = standaard van het model',
        'settings.commit.prompt': 'Extra instructies',
        'settings.commit.promptHint': 'bv. Conventional Commits, onderwerp in het Nederlands, max. 72 tekens',
        'settings.commit.tooLong': 'Alleen de eerste {n} tekens worden opgeslagen',
        'changes.aiWrite': 'Met AI schrijven',
        'changes.aiBusy': 'Bezig…',
        'changes.aiQuota': 'Verbruikt je eigen quota',
        'changes.aiOverwriteTitle': 'Huidig concept vervangen?',
        'changes.aiOverwriteText': 'De AI-tekst vervangt je getypte commitbericht (ongedaan te maken).',
        'changes.aiUndo': 'Ongedaan maken',
        'changes.aiFailed': 'Kon niet schrijven:',
        'changes.aiNotice': 'Sommige wijzigingen zijn niet naar het model gestuurd (afgekapt of overgeslagen); het bericht kan onvolledig zijn.',
        'settings.rail.writeFailed': 'De instelling is niet opgeslagen; de schakelaar sprong terug. Probeer opnieuw.',
        'settings.rail.readonly': 'Deze host levert de configuratie alleen-lezen.',
        'rail.settingsHint': 'Sleep of gebruik de pijlen om te sorteren; het oog schakelt de zichtbaarheid',
        'rail.reset': 'Standaardwaarden herstellen',
        'rail.up': 'Omhoog',
        'rail.down': 'Omlaag',
        'rail.show': 'Tonen',
        'rail.hide': 'Verbergen',
        'action.unavailable': 'Niet beschikbaar in de huidige staat',
        'filter.branch': 'Branch',
        'filter.user': 'Auteur',
        'filter.date': 'Datum',
        'filter.path': 'Pad',
        'filter.all': 'Alles',
        'filter.today': 'Vandaag',
        'filter.week': 'Afgelopen 7 dagen',
        'filter.month': 'Afgelopen 30 dagen',
        'filter.year': 'Dit jaar',
        'filter.pathPlaceholder': 'Filteren op pad (Enter)',
        'filter.sortDesc': 'Nieuwste eerst',
        'filter.sortAsc': 'Oudste eerst',
        'filter.clear': 'Filters wissen',
        'filter.none': 'Geen overeenkomende commits',
        'toast.undo': 'Ongedaan maken',
        'toast.close': 'Sluiten',
        'toast.branchDeleted': 'Branch {name} verwijderd',
        'toast.stashDropped': 'Stash {ref} verwijderd',
        'toast.discarded': 'Wijzigingen in {path} weggegooid',
        'toast.discardNoUndo': 'Wijzigingen in {path} weggegooid (te groot om ongedaan te maken)',
        'toast.restored': 'Hersteld',
        'undo.menu': 'Onlangs verwijderd (ongedaan maken)',
        'undo.empty': 'Nu niets om ongedaan te maken',
        'undo.branch': 'Branch',
        'undo.stash': 'Stash',
        'undo.discard': 'Weggooien',
        'confirm.typeName': 'Typ {name} om te bevestigen',
        'confirm.protected': '{name} is een hoofdbranch. Verwijderen is riskant, typ daarom de branchnaam om te bevestigen —— een melding kan hem daarna nog terugbrengen.',
        'discard.untracked.confirm': 'Het niet gevolgde bestand {path} verwijderen? De inhoud wordt verwijderd —— een melding kan het daarna nog terugbrengen.',
        'stashDrop.confirm': 'Stash {ref} verwijderen? Een melding kan hem daarna nog terugbrengen.',
        'operation.merge': 'Samenvoegen bezig',
        'operation.rebase': 'Rebase bezig',
        'operation.cherry-pick': 'Cherry-pick bezig',
        'operation.revert': 'Terugdraaien bezig',
        'operation.bisect': 'Bisect bezig',
        'operation.hint': 'Deze repository heeft nog een meerstapsbewerking openstaan —— rond die af of breek die af voordat je branchacties uitvoert',
        'confirm.title': 'Bevestigen',
        'confirm.cancel': 'Annuleren',
        'confirm.ok': 'OK',
        'prompt.newBranch': 'Naam van de nieuwe branch (wordt aangemaakt en uitgecheckt)',
        'prompt.renameBranch': 'Branch hernoemen',
        'prompt.newTag': 'Naam van de nieuwe tag',
        'prompt.fromHead': 'huidige HEAD',
        'error.dismiss': 'Sluiten',
        'status.loading': 'Lezen...',
        'status.busy': 'Bezig...',
        'counts.staged': 'Gestaged {n}',
        'counts.ignored': 'Genegeerd {n}',
        'counts.unstaged': 'Wijzigingen {n}',
        'counts.untracked': 'Niet gevolgd {n}',
        'counts.conflicted': 'Conflicten {n}',
        'push.confirm': '{branch} naar {upstream} pushen?',
        'delete.confirm': 'Branch {name} verwijderen? Een melding kan hem daarna nog terugbrengen (git weigert nog steeds niet-samengevoegde branches).',
        'discard.confirm': 'Wijzigingen in {path} weggooien? De inhoud van de werkboom wordt overschreven —— een melding kan die daarna nog terugbrengen.',
        'resetHard.confirm': 'Hard resetten naar {hash}? Niet-gecommitte wijzigingen gaan verloren.',
        'resetSoft.confirm': 'HEAD naar {hash} verplaatsen (werkboom behouden)?',
        'checkoutCommit.confirm': 'Commit {hash} uitchecken? (detached HEAD)',
      },
      /* locale: pl */
      'pl': {
        'title': 'Git',
        'description': 'Panel Git na poziomie IDE: drzewo gałęzi / graf commitów / zmiany',
        'repo.label': 'Repozytorium',
        'repo.workspace': 'obszar roboczy',
        'repo.nested': 'zagnieżdżone',
        'repo.none': 'Ten obszar roboczy nie jest repozytorium Git',
        'repo.pick': 'Wybierz repozytorium do podglądu',
        'repo.empty': 'W tym obszarze roboczym nie znaleziono repozytorium Git',
        'repo.switch': 'Zmień repozytorium',
        'branch.switch': 'Zmień gałąź',
        'seg.changes': 'Zmiany {n}',
        'seg.history': 'Historia',
        'branches.local': 'Lokalne',
        'branches.remote': 'Zdalne',
        'branches.tags': 'Tagi',
        'branches.head': 'HEAD (bieżąca gałąź)',
        'branches.favorites': 'Ulubione',
        'branches.pickHint': 'Kliknij, aby wybrać; kliknij dwukrotnie, aby przełączyć',
        'branches.worktree': 'Już wybrana w innym drzewie roboczym',
        'action.stash': 'Schowek',
        'action.favorite': 'Dodaj/usuń bieżącą gałąź z ulubionych',
        'action.newTagHere': 'Nowy tag na bieżącym commicie...',
        'stash.push': 'Odłóż bieżące zmiany',
        'stash.apply': 'Zastosuj najnowszy schowek',
        'stash.drop': 'Usuń najnowszy schowek',
        'stash.count': 'Schowki: {n}',
        'note.noChanges': 'Brak oczekujących zmian',
        'note.noBranches': 'Brak innych gałęzi',
        'branches.filter': 'Gałąź lub tag',
        'changes.title': 'Zmiany',
        'changes.staged': 'W indeksie',
        'changes.unstaged': 'Zmiany',
        'changes.untracked': 'Nieśledzone',
        'changes.conflicted': 'Konflikty',
        'changes.empty': 'Brak oczekujących zmian',
        'changes.commitPlaceholder': 'Opis commita (Ctrl+Enter)',
        'changes.commit': 'Zatwierdź',
        'changes.amend': 'Popraw ostatni commit',
        'changes.stageAll': 'Dodaj wszystko do indeksu',
        'changes.unstageAll': 'Usuń wszystko z indeksu',
        'changes.groupBy': 'Grupuj według',
        'changes.groupFlat': 'Płaska lista',
        'changes.groupDir': 'Według katalogu',
        'changes.expandAll': 'Rozwiń wszystko',
        'changes.foldAll': 'Zwiń wszystko',
        'changes.showIgnored': 'Pokaż ignorowane pliki',
        'changes.rootDir': '(katalog główny)',
        'changes.commitAndPush': 'Zatwierdź i wypchnij',
        'action.stage': 'Dodaj do indeksu',
        'action.unstage': 'Usuń z indeksu',
        'action.discard': 'Odrzuć zmiany',
        'action.showDiff': 'Pokaż różnice',
        'action.copyPath': 'Kopiuj ścieżkę',
        'action.checkout': 'Przełącz',
        'action.float': 'Odczep tę stronę',
        'action.dock': 'Zadokuj z powrotem',
        'action.split': 'Podziel',
        'action.fullscreen': 'Pełny ekran',
        'action.exitFullscreen': 'Wyjdź z pełnego ekranu',
        'action.newBranchFrom': 'Nowa gałąź stąd...',
        'action.newBranchHere': 'Nowa gałąź tutaj...',
        'action.rename': 'Zmień nazwę...',
        'action.delete': 'Usuń',
        'action.mergeIntoCurrent': 'Scal z bieżącą gałęzią',
        'action.rebaseCurrentOnto': 'Zrebase’uj bieżącą gałąź na tę',
        'action.compare': 'Porównaj z bieżącą gałęzią',
        'action.update': 'Odśwież (fetch)',
        'action.push': 'Wypchnij',
        'action.newTag': 'Nowy tag...',
        'action.cherryPick': 'Cherry-pick',
        'action.revert': 'Wycofaj commit',
        'action.resetSoft': 'Przywróć tutaj (zachowaj zmiany)',
        'action.resetHard': 'Przywróć tutaj (odrzuć zmiany)',
        'action.copyHash': 'Kopiuj numer wersji',
        'action.details': 'Szczegóły commita',
        'history.empty': 'To repozytorium nie ma jeszcze commitów',
        'history.loadMore': 'Wczytaj więcej',
        'history.filter': 'Tekst lub hash',
        'detail.files': 'Zmienione pliki',
        'detail.back': 'Powrót do historii',
        'detail.noFiles': 'Brak zmian w plikach',
        'diff.empty': 'Brak różnic tekstowych do pokazania',
        'pane.diff': 'widok diff',
        'pane.resize': 'Przeciągnij, aby zmienić rozmiar {name} (podwójne kliknięcie przywraca, strzałki korygują)',
        'diff.binary': 'Plik binarny',
        'diff.loading': 'Wczytywanie różnic...',
        'toolbar.refresh': 'Odśwież',
        'toolbar.newBranch': 'Nowa gałąź',
        'toolbar.fetch': 'Pobierz',
        'toolbar.pull': 'Ściągnij',
        'toolbar.push': 'Wypchnij',
        'toolbar.tree': 'Panel gałęzi',
        'rail.more': 'Więcej działań',
        'rail.settings': 'Ustawienia paska działań',
        'rail.openSettings': 'Otwórz ustawienia wtyczki',
        'settings.rail.title': 'Przyciski paska akcji',
        'settings.rail.hint': 'Zaznacz akcje widoczne na pasku. Kolejność jest stała; odznaczenie ukrywa akcję.',
        'settings.rail.unavailable': 'Ten host nie ma usługi ustawień; użyj „Ustawienia paska akcji” w panelu.',
        'settings.commit.title': 'Wiadomość commita od AI',
        'settings.commit.model': 'Model',
        'settings.commit.modelHint': 'Puste = zgodnie z tą sesją (provider/model)',
        'settings.commit.reasoning': 'Poziom rozumowania',
        'settings.commit.reasoningHint': 'Puste = domyślne modelu',
        'settings.commit.prompt': 'Dodatkowe instrukcje',
        'settings.commit.promptHint': 'np. Conventional Commits, temat po polsku, maks. 72 znaki',
        'settings.commit.tooLong': 'Zapisywane jest tylko pierwszych {n} znaków',
        'changes.aiWrite': 'Napisz z AI',
        'changes.aiBusy': 'Generowanie…',
        'changes.aiQuota': 'Zużywa twój limit',
        'changes.aiOverwriteTitle': 'Zastąpić bieżący szkic?',
        'changes.aiOverwriteText': 'Tekst AI zastąpi wpisaną wiadomość commita (można cofnąć).',
        'changes.aiUndo': 'Cofnij',
        'changes.aiFailed': 'Nie udało się wygenerować:',
        'changes.aiNotice': 'Część zmian nie trafiła do modelu (przycięta lub pominięta); wiadomość może być niepełna.',
        'settings.rail.writeFailed': 'Ustawienie nie zostało zapisane; przełącznik wrócił na miejsce. Spróbuj ponownie.',
        'settings.rail.readonly': 'Ten host udostępnia konfigurację tylko do odczytu.',
        'rail.settingsHint': 'Przeciągnij lub użyj strzałek, aby zmienić kolejność; oko przełącza widoczność',
        'rail.reset': 'Przywróć domyślne',
        'rail.up': 'W górę',
        'rail.down': 'W dół',
        'rail.show': 'Pokaż',
        'rail.hide': 'Ukryj',
        'action.unavailable': 'Niedostępne w bieżącym stanie',
        'filter.branch': 'Gałąź',
        'filter.user': 'Autor',
        'filter.date': 'Data',
        'filter.path': 'Ścieżka',
        'filter.all': 'Wszystkie',
        'filter.today': 'Dzisiaj',
        'filter.week': 'Ostatnie 7 dni',
        'filter.month': 'Ostatnie 30 dni',
        'filter.year': 'W tym roku',
        'filter.pathPlaceholder': 'Filtruj po ścieżce (Enter)',
        'filter.sortDesc': 'Najnowsze najpierw',
        'filter.sortAsc': 'Najstarsze najpierw',
        'filter.clear': 'Wyczyść filtry',
        'filter.none': 'Brak pasujących commitów',
        'toast.undo': 'Cofnij',
        'toast.close': 'Zamknij',
        'toast.branchDeleted': 'Usunięto gałąź {name}',
        'toast.stashDropped': 'Usunięto schowek {ref}',
        'toast.discarded': 'Odrzucono zmiany w {path}',
        'toast.discardNoUndo': 'Odrzucono zmiany w {path} (zbyt duże, aby zachować cofnięcie)',
        'toast.restored': 'Przywrócono',
        'undo.menu': 'Ostatnio usunięte (cofnij)',
        'undo.empty': 'Teraz nie ma czego cofać',
        'undo.branch': 'Gałąź',
        'undo.stash': 'Schowek',
        'undo.discard': 'Odrzucenie',
        'confirm.typeName': 'Wpisz {name}, aby potwierdzić',
        'confirm.protected': '{name} to gałąź główna. Usunięcie jest ryzykowne, więc wpisz nazwę gałęzi, aby potwierdzić —— powiadomienie może ją potem przywrócić.',
        'discard.untracked.confirm': 'Usunąć nieśledzony plik {path}? Jego zawartość zostanie usunięta —— powiadomienie może ją potem przywrócić.',
        'stashDrop.confirm': 'Usunąć schowek {ref}? Powiadomienie może go potem przywrócić.',
        'operation.merge': 'Trwa scalanie',
        'operation.rebase': 'Trwa rebase',
        'operation.cherry-pick': 'Trwa cherry-pick',
        'operation.revert': 'Trwa wycofywanie',
        'operation.bisect': 'Trwa bisect',
        'operation.hint': 'W tym repozytorium wciąż trwa wieloetapowa operacja —— zakończ ją lub przerwij przed działaniami na gałęziach',
        'confirm.title': 'Potwierdzenie',
        'confirm.cancel': 'Anuluj',
        'confirm.ok': 'OK',
        'prompt.newBranch': 'Nazwa nowej gałęzi (zostanie utworzona i wybrana)',
        'prompt.renameBranch': 'Zmień nazwę gałęzi',
        'prompt.newTag': 'Nazwa nowego tagu',
        'prompt.fromHead': 'bieżący HEAD',
        'error.dismiss': 'Zamknij',
        'status.loading': 'Wczytywanie...',
        'status.busy': 'Praca...',
        'counts.staged': 'W indeksie {n}',
        'counts.ignored': 'Ignorowane {n}',
        'counts.unstaged': 'Zmiany {n}',
        'counts.untracked': 'Nieśledzone {n}',
        'counts.conflicted': 'Konflikty {n}',
        'push.confirm': 'Wypchnąć {branch} do {upstream}?',
        'delete.confirm': 'Usunąć gałąź {name}? Powiadomienie może ją potem przywrócić (git nadal odmawia dla niescalonych gałęzi).',
        'discard.confirm': 'Odrzucić zmiany w {path}? Zawartość drzewa roboczego zostanie nadpisana —— powiadomienie może ją potem przywrócić.',
        'resetHard.confirm': 'Twarde przywrócenie do {hash}? Niezapisane zmiany przepadną.',
        'resetSoft.confirm': 'Przenieść HEAD do {hash} (drzewo robocze zachowane)?',
        'checkoutCommit.confirm': 'Przełączyć na commit {hash}? (detached HEAD)',
      },
      /* locale: sv */
      'sv': {
        'title': 'Git',
        'description': 'Git-panel i IDE-klass: grensträd / commit-graf / ändringar',
        'repo.label': 'Arkiv',
        'repo.workspace': 'arbetsyta',
        'repo.nested': 'nästlad',
        'repo.none': 'Den här arbetsytan är inte ett Git-arkiv',
        'repo.pick': 'Välj ett arkiv att granska',
        'repo.empty': 'Inget Git-arkiv hittades i den här arbetsytan',
        'repo.switch': 'Byt arkiv',
        'branch.switch': 'Byt gren',
        'seg.changes': 'Ändringar {n}',
        'seg.history': 'Historik',
        'branches.local': 'Lokala',
        'branches.remote': 'Fjärr',
        'branches.tags': 'Taggar',
        'branches.head': 'HEAD (aktuell gren)',
        'branches.favorites': 'Favoriter',
        'branches.pickHint': 'Klicka för att välja, dubbelklicka för att checka ut',
        'branches.worktree': 'Redan utcheckad i ett annat arbetsträd',
        'action.stash': 'Stash',
        'action.favorite': 'Lägg till/ta bort aktuell gren som favorit',
        'action.newTagHere': 'Ny tagg på aktuell commit...',
        'stash.push': 'Stasha aktuella ändringar',
        'stash.apply': 'Tillämpa senaste stash',
        'stash.drop': 'Släng senaste stash',
        'stash.count': '{n} stash-poster',
        'note.noChanges': 'Inga väntande ändringar',
        'note.noBranches': 'Inga andra grenar',
        'branches.filter': 'Gren eller tagg',
        'changes.title': 'Ändringar',
        'changes.staged': 'Klad',
        'changes.unstaged': 'Ändringar',
        'changes.untracked': 'Ospårad',
        'changes.conflicted': 'Konflikter',
        'changes.empty': 'Inga väntande ändringar',
        'changes.commitPlaceholder': 'Commit-meddelande (Ctrl+Enter)',
        'changes.commit': 'Committa',
        'changes.amend': 'Komplettera senaste commit',
        'changes.stageAll': 'Klädda alla',
        'changes.unstageAll': 'Avklädda alla',
        'changes.groupBy': 'Gruppera efter',
        'changes.groupFlat': 'Platt lista',
        'changes.groupDir': 'Per katalog',
        'changes.expandAll': 'Expandera alla',
        'changes.foldAll': 'Fäll ihop alla',
        'changes.showIgnored': 'Visa ignorerade filer',
        'changes.rootDir': '(rot)',
        'changes.commitAndPush': 'Committa och pusha',
        'action.stage': 'Klädda',
        'action.unstage': 'Avklädda',
        'action.discard': 'Förkasta ändringar',
        'action.showDiff': 'Visa diff',
        'action.copyPath': 'Kopiera sökväg',
        'action.checkout': 'Checka ut',
        'action.float': 'Friställ sidan',
        'action.dock': 'Docka tillbaka',
        'action.split': 'Dela',
        'action.fullscreen': 'Helskärm',
        'action.exitFullscreen': 'Avsluta helskärm',
        'action.newBranchFrom': 'Ny gren härifrån...',
        'action.newBranchHere': 'Ny gren här...',
        'action.rename': 'Byt namn...',
        'action.delete': 'Ta bort',
        'action.mergeIntoCurrent': 'Sammanfoga in i aktuell gren',
        'action.rebaseCurrentOnto': 'Rebasa aktuell gren mot denna',
        'action.compare': 'Jämför med aktuell gren',
        'action.update': 'Uppdatera (fetch)',
        'action.push': 'Pusha',
        'action.newTag': 'Ny tagg...',
        'action.cherryPick': 'Cherry-pick',
        'action.revert': 'Återställ commit',
        'action.resetSoft': 'Återställ hit (behåll ändringar)',
        'action.resetHard': 'Återställ hit (förkasta ändringar)',
        'action.copyHash': 'Kopiera revisionsnummer',
        'action.details': 'Commit-detaljer',
        'history.empty': 'Det här arkivet har inga commits ännu',
        'history.loadMore': 'Ladda mer',
        'history.filter': 'Text eller hash',
        'detail.files': 'Ändrade filer',
        'detail.back': 'Tillbaka till historiken',
        'detail.noFiles': 'Inga filändringar',
        'diff.empty': 'Ingen textdiff att visa',
        'pane.diff': 'diff-vy',
        'pane.resize': 'Dra för att ändra storleken på {name} (dubbelklick återställer, piltangenter finjusterar)',
        'diff.binary': 'Binär fil',
        'diff.loading': 'Laddar diff...',
        'toolbar.refresh': 'Uppdatera',
        'toolbar.newBranch': 'Ny gren',
        'toolbar.fetch': 'Fetch',
        'toolbar.pull': 'Pull',
        'toolbar.push': 'Push',
        'toolbar.tree': 'Grenpanel',
        'rail.more': 'Fler åtgärder',
        'rail.settings': 'Inställningar för åtgärdsfältet',
        'rail.openSettings': 'Öppna plugininställningar',
        'settings.rail.title': 'Knappar i åtgärdsfältet',
        'settings.rail.hint': 'Markera de åtgärder som visas i fältet. Ordningen är fast; avmarkering döljer en.',
        'settings.rail.unavailable': 'Denna värd saknar inställningstjänst; använd ”Åtgärdsfältets inställningar” i panelen.',
        'settings.commit.title': 'AI-commitmeddelande',
        'settings.commit.model': 'Modell',
        'settings.commit.modelHint': 'Tomt = följ denna session (provider/model)',
        'settings.commit.reasoning': 'Resonemangsinsats',
        'settings.commit.reasoningHint': 'Tomt = modellens standard',
        'settings.commit.prompt': 'Extra instruktioner',
        'settings.commit.promptHint': 't.ex. Conventional Commits, ämne på svenska, högst 72 tecken',
        'settings.commit.tooLong': 'Endast de första {n} tecknen sparas',
        'changes.aiWrite': 'Skriv med AI',
        'changes.aiBusy': 'Skriver…',
        'changes.aiQuota': 'Använder din egen kvot',
        'changes.aiOverwriteTitle': 'Ersätt nuvarande utkast?',
        'changes.aiOverwriteText': 'AI-texten ersätter commitmeddelandet du skrev (går att ångra).',
        'changes.aiUndo': 'Ångra',
        'changes.aiFailed': 'Kunde inte skriva:',
        'changes.aiNotice': 'Vissa ändringar skickades inte till modellen (kapade eller utelämnade); meddelandet kan vara ofullständigt.',
        'settings.rail.writeFailed': 'Inställningen sparades inte; reglaget gick tillbaka. Försök igen.',
        'settings.rail.readonly': 'Denna värd tillhandahåller konfigurationen skrivskyddad.',
        'rail.settingsHint': 'Dra eller använd pilarna för att sortera; ögat växlar synlighet',
        'rail.reset': 'Återställ standard',
        'rail.up': 'Flytta upp',
        'rail.down': 'Flytta ner',
        'rail.show': 'Visa',
        'rail.hide': 'Dölj',
        'action.unavailable': 'Inte tillgängligt i aktuellt läge',
        'filter.branch': 'Gren',
        'filter.user': 'Författare',
        'filter.date': 'Datum',
        'filter.path': 'Sökväg',
        'filter.all': 'Alla',
        'filter.today': 'I dag',
        'filter.week': 'Senaste 7 dagarna',
        'filter.month': 'Senaste 30 dagarna',
        'filter.year': 'I år',
        'filter.pathPlaceholder': 'Filtrera på sökväg (Enter)',
        'filter.sortDesc': 'Nyast först',
        'filter.sortAsc': 'Äldst först',
        'filter.clear': 'Rensa filter',
        'filter.none': 'Inga matchande commits',
        'toast.undo': 'Ångra',
        'toast.close': 'Stäng',
        'toast.branchDeleted': 'Grenen {name} borttagen',
        'toast.stashDropped': 'Stashen {ref} slängd',
        'toast.discarded': 'Ändringar i {path} förkastade',
        'toast.discardNoUndo': 'Ändringar i {path} förkastade (för stora för att ångra)',
        'toast.restored': 'Återställd',
        'undo.menu': 'Nyligen borttaget (ångra)',
        'undo.empty': 'Inget att ångra just nu',
        'undo.branch': 'Gren',
        'undo.stash': 'Stash',
        'undo.discard': 'Förkasta',
        'confirm.typeName': 'Skriv {name} för att bekräfta',
        'confirm.protected': '{name} är en huvudgren. Att ta bort den är riskabelt, så skriv grennamnet för att bekräfta —— en avisering kan sedan fortfarande återställa den.',
        'discard.untracked.confirm': 'Ta bort den ospårade filen {path}? Innehållet tas bort —— en avisering kan sedan fortfarande återställa det.',
        'stashDrop.confirm': 'Släng stashen {ref}? En avisering kan sedan fortfarande återställa den.',
        'operation.merge': 'Sammanfogning pågår',
        'operation.rebase': 'Rebase pågår',
        'operation.cherry-pick': 'Cherry-pick pågår',
        'operation.revert': 'Återställning pågår',
        'operation.bisect': 'Bisect pågår',
        'operation.hint': 'Det här arkivet har fortfarande en flerstegsoperation öppen —— slutför eller avbryt den före grenåtgärder',
        'confirm.title': 'Bekräfta',
        'confirm.cancel': 'Avbryt',
        'confirm.ok': 'OK',
        'prompt.newBranch': 'Namn på ny gren (skapas och checkas ut)',
        'prompt.renameBranch': 'Byt namn på grenen',
        'prompt.newTag': 'Namn på ny tagg',
        'prompt.fromHead': 'aktuell HEAD',
        'error.dismiss': 'Stäng',
        'status.loading': 'Läser...',
        'status.busy': 'Arbetar...',
        'counts.staged': 'Klädda {n}',
        'counts.ignored': 'Ignorerade {n}',
        'counts.unstaged': 'Ändringar {n}',
        'counts.untracked': 'Ospårade {n}',
        'counts.conflicted': 'Konflikter {n}',
        'push.confirm': 'Pusha {branch} till {upstream}?',
        'delete.confirm': 'Ta bort grenen {name}? En avisering kan sedan fortfarande återställa den (git nekar fortfarande till ej sammanfogade grenar).',
        'discard.confirm': 'Förkasta ändringar i {path}? Arbetsträdets innehåll skrivs över —— en avisering kan sedan fortfarande återställa det.',
        'resetHard.confirm': 'Hård återställning till {hash}? Ej committade ändringar går förlorade.',
        'resetSoft.confirm': 'Flytta HEAD till {hash} (arbetsträdet behålls)?',
        'checkoutCommit.confirm': 'Checka ut commiten {hash}? (detached HEAD)',
      },
      /* locale: tr */
      'tr': {
        'title': 'Git',
        'description': 'IDE düzeyinde Git paneli: dal ağacı / commit grafiği / değişiklikler',
        'repo.label': 'Depo',
        'repo.workspace': 'çalışma alanı',
        'repo.nested': 'iç içe',
        'repo.none': 'Bu çalışma alanı bir Git deposu değil',
        'repo.pick': 'İncelenecek depoyu seçin',
        'repo.empty': 'Bu çalışma alanında Git deposu bulunamadı',
        'repo.switch': 'Depoyu değiştir',
        'branch.switch': 'Dalı değiştir',
        'seg.changes': 'Değişiklikler {n}',
        'seg.history': 'Geçmiş',
        'branches.local': 'Yerel',
        'branches.remote': 'Uzak',
        'branches.tags': 'Etiketler',
        'branches.head': 'HEAD (geçerli dal)',
        'branches.favorites': 'Sık kullanılanlar',
        'branches.pickHint': 'Seçmek için tıklayın, çıkarmak için çift tıklayın',
        'branches.worktree': 'Başka bir çalışma ağacında çıkarılmış',
        'action.stash': 'Saklama',
        'action.favorite': 'Geçerli dalı sık kullanılanlara ekle/çıkar',
        'action.newTagHere': 'Geçerli commit üzerinde yeni etiket...',
        'stash.push': 'Geçerli değişiklikleri sakla',
        'stash.apply': 'En son saklamayı uygula',
        'stash.drop': 'En son saklamayı sil',
        'stash.count': '{n} saklama kaydı',
        'note.noChanges': 'Bekleyen değişiklik yok',
        'note.noBranches': 'Başka dal yok',
        'branches.filter': 'Dal veya etiket',
        'changes.title': 'Değişiklikler',
        'changes.staged': 'Hazırlanan',
        'changes.unstaged': 'Değişiklikler',
        'changes.untracked': 'İzlenmeyen',
        'changes.conflicted': 'Çakışmalar',
        'changes.empty': 'Bekleyen değişiklik yok',
        'changes.commitPlaceholder': 'Commit mesajı (Ctrl+Enter)',
        'changes.commit': 'Commit’le',
        'changes.amend': 'Son commit’i düzelt',
        'changes.stageAll': 'Tümünü hazırla',
        'changes.unstageAll': 'Tümünü hazırlıktan çıkar',
        'changes.groupBy': 'Gruplama ölçütü',
        'changes.groupFlat': 'Düz liste',
        'changes.groupDir': 'Dizine göre',
        'changes.expandAll': 'Tümünü genişlet',
        'changes.foldAll': 'Tümünü daralt',
        'changes.showIgnored': 'Yok sayılan dosyaları göster',
        'changes.rootDir': '(kök)',
        'changes.commitAndPush': 'Commit’le ve gönder',
        'action.stage': 'Hazırla',
        'action.unstage': 'Hazırlıktan çıkar',
        'action.discard': 'Değişiklikleri at',
        'action.showDiff': 'Farkı göster',
        'action.copyPath': 'Yolu kopyala',
        'action.checkout': 'Çıkar',
        'action.float': 'Bu sayfayı yüzdür',
        'action.dock': 'Yuvaya geri al',
        'action.split': 'Böl',
        'action.fullscreen': 'Tam ekran',
        'action.exitFullscreen': 'Tam ekrandan çık',
        'action.newBranchFrom': 'Buradan yeni dal...',
        'action.newBranchHere': 'Burada yeni dal...',
        'action.rename': 'Yeniden adlandır...',
        'action.delete': 'Sil',
        'action.mergeIntoCurrent': 'Geçerli dala birleştir',
        'action.rebaseCurrentOnto': 'Geçerli dalı bunun üzerine rebase et',
        'action.compare': 'Geçerli dalla karşılaştır',
        'action.update': 'Güncelle (fetch)',
        'action.push': 'Gönder',
        'action.newTag': 'Yeni etiket...',
        'action.cherryPick': 'Cherry-pick',
        'action.revert': 'Commit’i geri al',
        'action.resetSoft': 'Buraya sıfırla (değişiklikleri koru)',
        'action.resetHard': 'Buraya sıfırla (değişiklikleri at)',
        'action.copyHash': 'Revizyon numarasını kopyala',
        'action.details': 'Commit ayrıntıları',
        'history.empty': 'Bu depoda henüz commit yok',
        'history.loadMore': 'Daha fazla yükle',
        'history.filter': 'Metin veya hash',
        'detail.files': 'Değişen dosyalar',
        'detail.back': 'Geçmişe dön',
        'detail.noFiles': 'Dosya değişikliği yok',
        'diff.empty': 'Gösterilecek metin farkı yok',
        'pane.diff': 'diff görünümü',
        'pane.resize': '{name} boyutunu sürükleyerek ayarlayın (çift tıklama sıfırlar, ok tuşları ince ayar yapar)',
        'diff.binary': 'İkili dosya',
        'diff.loading': 'Fark yükleniyor...',
        'toolbar.refresh': 'Yenile',
        'toolbar.newBranch': 'Yeni dal',
        'toolbar.fetch': 'Fetch',
        'toolbar.pull': 'Pull',
        'toolbar.push': 'Push',
        'toolbar.tree': 'Dal paneli',
        'rail.more': 'Diğer eylemler',
        'rail.settings': 'Eylem çubuğu ayarları',
        'rail.openSettings': 'Eklenti ayarlarını aç',
        'settings.rail.title': 'Eylem çubuğu düğmeleri',
        'settings.rail.hint': 'Çubukta gösterilecek eylemleri işaretleyin. Sıra sabittir; işareti kaldırmak eylemi gizler.',
        'settings.rail.unavailable': 'Bu ana bilgisayarda ayar hizmeti yok; paneldeki "Eylem çubuğu ayarları"nı kullanın.',
        'settings.commit.title': 'AI commit mesajı',
        'settings.commit.model': 'Model',
        'settings.commit.modelHint': 'Boş = bu oturumu izle (provider/model)',
        'settings.commit.reasoning': 'Düşünme yoğunluğu',
        'settings.commit.reasoningHint': 'Boş = modelin varsayılanı',
        'settings.commit.prompt': 'Ek yönergeler',
        'settings.commit.promptHint': 'örn. Conventional Commits, konu Türkçe, en fazla 72 karakter',
        'settings.commit.tooLong': 'Yalnızca ilk {n} karakter kaydedilir',
        'changes.aiWrite': 'AI ile yaz',
        'changes.aiBusy': 'Yazılıyor…',
        'changes.aiQuota': 'Kendi kotanızı harcar',
        'changes.aiOverwriteTitle': 'Geçerli taslağın yerine geçilsin mi?',
        'changes.aiOverwriteText': 'AI metni yazdığınız commit mesajının yerine geçer (geri alınabilir).',
        'changes.aiUndo': 'Geri al',
        'changes.aiFailed': 'Yazılamadı:',
        'changes.aiNotice': 'Bazı değişiklikler modele gönderilmedi (kısaltıldı veya atlandı); mesaj eksik olabilir.',
        'settings.rail.writeFailed': 'Ayar kaydedilemedi; anahtar eski konumuna döndü. Yeniden deneyin.',
        'settings.rail.readonly': 'Bu ana bilgisayar yapılandırmayı salt okunur sunuyor.',
        'rail.settingsHint': 'Sıralamak için sürükleyin veya okları kullanın; göz simgesi görünürlüğü değiştirir',
        'rail.reset': 'Varsayılanlara dön',
        'rail.up': 'Yukarı taşı',
        'rail.down': 'Aşağı taşı',
        'rail.show': 'Göster',
        'rail.hide': 'Gizle',
        'action.unavailable': 'Geçerli durumda kullanılamaz',
        'filter.branch': 'Dal',
        'filter.user': 'Yazar',
        'filter.date': 'Tarih',
        'filter.path': 'Yol',
        'filter.all': 'Tümü',
        'filter.today': 'Bugün',
        'filter.week': 'Son 7 gün',
        'filter.month': 'Son 30 gün',
        'filter.year': 'Bu yıl',
        'filter.pathPlaceholder': 'Yola göre filtrele (Enter)',
        'filter.sortDesc': 'En yeniler önce',
        'filter.sortAsc': 'En eskiler önce',
        'filter.clear': 'Filtreleri temizle',
        'filter.none': 'Eşleşen commit yok',
        'toast.undo': 'Geri al',
        'toast.close': 'Kapat',
        'toast.branchDeleted': '{name} dalı silindi',
        'toast.stashDropped': '{ref} saklaması silindi',
        'toast.discarded': '{path} içindeki değişiklikler atıldı',
        'toast.discardNoUndo': '{path} içindeki değişiklikler atıldı (geri alma için fazla büyük)',
        'toast.restored': 'Geri yüklendi',
        'undo.menu': 'Son silinenler (geri al)',
        'undo.empty': 'Şu anda geri alınacak bir şey yok',
        'undo.branch': 'Dal',
        'undo.stash': 'Saklama',
        'undo.discard': 'Atma',
        'confirm.typeName': 'Onaylamak için {name} yazın',
        'confirm.protected': '{name} bir ana daldır. Silmek risklidir; onaylamak için dal adını yazın —— ardından bir bildirim onu geri getirebilir.',
        'discard.untracked.confirm': '{path} izlenmeyen dosyası silinsin mi? İçeriği kaldırılır —— ardından bir bildirim onu geri getirebilir.',
        'stashDrop.confirm': '{ref} saklaması silinsin mi? Ardından bir bildirim onu geri getirebilir.',
        'operation.merge': 'Birleştirme sürüyor',
        'operation.rebase': 'Rebase sürüyor',
        'operation.cherry-pick': 'Cherry-pick sürüyor',
        'operation.revert': 'Geri alma sürüyor',
        'operation.bisect': 'Bisect sürüyor',
        'operation.hint': 'Bu depoda hâlâ açık çok adımlı bir işlem var —— dal işlemlerinden önce tamamlayın veya iptal edin',
        'confirm.title': 'Onayla',
        'confirm.cancel': 'İptal',
        'confirm.ok': 'Tamam',
        'prompt.newBranch': 'Yeni dal adı (oluşturulur ve çıkarılır)',
        'prompt.renameBranch': 'Dalı yeniden adlandır',
        'prompt.newTag': 'Yeni etiket adı',
        'prompt.fromHead': 'geçerli HEAD',
        'error.dismiss': 'Kapat',
        'status.loading': 'Okunuyor...',
        'status.busy': 'Çalışıyor...',
        'counts.staged': 'Hazırlanan {n}',
        'counts.ignored': 'Yok sayılan {n}',
        'counts.unstaged': 'Değişiklikler {n}',
        'counts.untracked': 'İzlenmeyen {n}',
        'counts.conflicted': 'Çakışmalar {n}',
        'push.confirm': '{branch} dalı {upstream} deposuna gönderilsin mi?',
        'delete.confirm': '{name} dalı silinsin mi? Ardından bir bildirim onu geri getirebilir (git birleştirilmemiş dalları yine de reddeder).',
        'discard.confirm': '{path} içindeki değişiklikler atılsın mı? Çalışma ağacının içeriği üzerine yazılır —— ardından bir bildirim onu geri getirebilir.',
        'resetHard.confirm': '{hash} sürümüne zorla sıfırlansın mı? Commit’lenmemiş değişiklikler kaybolur.',
        'resetSoft.confirm': 'HEAD {hash} sürümüne taşınsın mı (çalışma ağacı korunur)?',
        'checkoutCommit.confirm': '{hash} commit’i çıkarılsın mı? (detached HEAD)',
      },
      /* locale: id */
      'id': {
        'title': 'Git',
        'description': 'Panel Git kelas IDE: pohon branch / grafik commit / perubahan',
        'repo.label': 'Repositori',
        'repo.workspace': 'ruang kerja',
        'repo.nested': 'bersarang',
        'repo.none': 'Ruang kerja ini bukan repositori Git',
        'repo.pick': 'Pilih repositori untuk diperiksa',
        'repo.empty': 'Tidak ada repositori Git di ruang kerja ini',
        'repo.switch': 'Ganti repositori',
        'branch.switch': 'Ganti branch',
        'seg.changes': 'Perubahan {n}',
        'seg.history': 'Riwayat',
        'branches.local': 'Lokal',
        'branches.remote': 'Remote',
        'branches.tags': 'Tag',
        'branches.head': 'HEAD (branch saat ini)',
        'branches.favorites': 'Favorit',
        'branches.pickHint': 'Klik untuk memilih, klik ganda untuk checkout',
        'branches.worktree': 'Sudah di-checkout di worktree lain',
        'action.stash': 'Stash',
        'action.favorite': 'Tambah/hapus branch saat ini dari favorit',
        'action.newTagHere': 'Tag baru pada commit saat ini...',
        'stash.push': 'Stash perubahan saat ini',
        'stash.apply': 'Terapkan stash terbaru',
        'stash.drop': 'Buang stash terbaru',
        'stash.count': '{n} entri stash',
        'note.noChanges': 'Tidak ada perubahan tertunda',
        'note.noBranches': 'Tidak ada branch lain',
        'branches.filter': 'Branch atau tag',
        'changes.title': 'Perubahan',
        'changes.staged': 'Ter-stage',
        'changes.unstaged': 'Perubahan',
        'changes.untracked': 'Tidak terlacak',
        'changes.conflicted': 'Konflik',
        'changes.empty': 'Tidak ada perubahan tertunda',
        'changes.commitPlaceholder': 'Pesan commit (Ctrl+Enter)',
        'changes.commit': 'Commit',
        'changes.amend': 'Perbaiki commit terakhir',
        'changes.stageAll': 'Stage semua',
        'changes.unstageAll': 'Batalkan stage semua',
        'changes.groupBy': 'Kelompokkan menurut',
        'changes.groupFlat': 'Daftar datar',
        'changes.groupDir': 'Per direktori',
        'changes.expandAll': 'Bentangkan semua',
        'changes.foldAll': 'Lipat semua',
        'changes.showIgnored': 'Tampilkan berkas yang diabaikan',
        'changes.rootDir': '(akar)',
        'changes.commitAndPush': 'Commit dan push',
        'action.stage': 'Stage',
        'action.unstage': 'Batalkan stage',
        'action.discard': 'Buang perubahan',
        'action.showDiff': 'Tampilkan diff',
        'action.copyPath': 'Salin jalur',
        'action.checkout': 'Checkout',
        'action.float': 'Apungkan halaman ini',
        'action.dock': 'Kembalikan ke dok',
        'action.split': 'Bagi',
        'action.fullscreen': 'Layar penuh',
        'action.exitFullscreen': 'Keluar dari layar penuh',
        'action.newBranchFrom': 'Branch baru dari sini...',
        'action.newBranchHere': 'Branch baru di sini...',
        'action.rename': 'Ganti nama...',
        'action.delete': 'Hapus',
        'action.mergeIntoCurrent': 'Gabungkan ke branch saat ini',
        'action.rebaseCurrentOnto': 'Rebase branch saat ini ke ini',
        'action.compare': 'Bandingkan dengan branch saat ini',
        'action.update': 'Perbarui (fetch)',
        'action.push': 'Push',
        'action.newTag': 'Tag baru...',
        'action.cherryPick': 'Cherry-pick',
        'action.revert': 'Batalkan commit',
        'action.resetSoft': 'Reset ke sini (pertahankan perubahan)',
        'action.resetHard': 'Reset ke sini (buang perubahan)',
        'action.copyHash': 'Salin nomor revisi',
        'action.details': 'Detail commit',
        'history.empty': 'Repositori ini belum punya commit',
        'history.loadMore': 'Muat lebih banyak',
        'history.filter': 'Teks atau hash',
        'detail.files': 'Berkas yang berubah',
        'detail.back': 'Kembali ke riwayat',
        'detail.noFiles': 'Tidak ada perubahan berkas',
        'diff.empty': 'Tidak ada diff teks untuk ditampilkan',
        'pane.diff': 'tampilan diff',
        'pane.resize': 'Seret untuk mengubah ukuran {name} (klik ganda mengatur ulang, tombol panah menyesuaikan)',
        'diff.binary': 'Berkas biner',
        'diff.loading': 'Memuat diff...',
        'toolbar.refresh': 'Segarkan',
        'toolbar.newBranch': 'Branch baru',
        'toolbar.fetch': 'Fetch',
        'toolbar.pull': 'Pull',
        'toolbar.push': 'Push',
        'toolbar.tree': 'Panel branch',
        'rail.more': 'Tindakan lain',
        'rail.settings': 'Pengaturan bilah tindakan',
        'rail.openSettings': 'Buka pengaturan plugin',
        'settings.rail.title': 'Tombol bilah aksi',
        'settings.rail.hint': 'Centang aksi yang ditampilkan di bilah. Urutannya tetap; menghapus centang menyembunyikannya.',
        'settings.rail.unavailable': 'Host ini tidak punya layanan pengaturan; gunakan "Pengaturan bilah aksi" di panel.',
        'settings.commit.title': 'Pesan commit AI',
        'settings.commit.model': 'Model',
        'settings.commit.modelHint': 'Kosong = ikuti sesi ini (provider/model)',
        'settings.commit.reasoning': 'Intensitas penalaran',
        'settings.commit.reasoningHint': 'Kosong = bawaan model',
        'settings.commit.prompt': 'Instruksi tambahan',
        'settings.commit.promptHint': 'mis. Conventional Commits, subjek bahasa Indonesia, maks 72 karakter',
        'settings.commit.tooLong': 'Hanya {n} karakter pertama yang disimpan',
        'changes.aiWrite': 'Tulis dengan AI',
        'changes.aiBusy': 'Menulis…',
        'changes.aiQuota': 'Memakai kuota Anda',
        'changes.aiOverwriteTitle': 'Ganti draf saat ini?',
        'changes.aiOverwriteText': 'Teks AI akan menggantikan pesan commit yang Anda tulis (bisa dibatalkan).',
        'changes.aiUndo': 'Batalkan',
        'changes.aiFailed': 'Gagal menulis:',
        'changes.aiNotice': 'Sebagian perubahan tidak dikirim ke model (dipotong atau dibuang); pesan bisa tidak lengkap.',
        'settings.rail.writeFailed': 'Pengaturan tidak tersimpan; tombol kembali ke posisi semula. Coba lagi.',
        'settings.rail.readonly': 'Host ini menyajikan konfigurasi hanya-baca.',
        'rail.settingsHint': 'Seret atau pakai panah untuk mengurutkan; ikon mata mengalihkan visibilitas',
        'rail.reset': 'Kembalikan default',
        'rail.up': 'Naikkan',
        'rail.down': 'Turunkan',
        'rail.show': 'Tampilkan',
        'rail.hide': 'Sembunyikan',
        'action.unavailable': 'Tidak tersedia pada keadaan saat ini',
        'filter.branch': 'Branch',
        'filter.user': 'Penulis',
        'filter.date': 'Tanggal',
        'filter.path': 'Jalur',
        'filter.all': 'Semua',
        'filter.today': 'Hari ini',
        'filter.week': '7 hari terakhir',
        'filter.month': '30 hari terakhir',
        'filter.year': 'Tahun ini',
        'filter.pathPlaceholder': 'Filter menurut jalur (Enter)',
        'filter.sortDesc': 'Terbaru dulu',
        'filter.sortAsc': 'Terlama dulu',
        'filter.clear': 'Hapus filter',
        'filter.none': 'Tidak ada commit yang cocok',
        'toast.undo': 'Urungkan',
        'toast.close': 'Tutup',
        'toast.branchDeleted': 'Branch {name} dihapus',
        'toast.stashDropped': 'Stash {ref} dibuang',
        'toast.discarded': 'Perubahan di {path} dibuang',
        'toast.discardNoUndo': 'Perubahan di {path} dibuang (terlalu besar untuk diurungkan)',
        'toast.restored': 'Dipulihkan',
        'undo.menu': 'Baru dihapus (urungkan)',
        'undo.empty': 'Tidak ada yang bisa diurungkan sekarang',
        'undo.branch': 'Branch',
        'undo.stash': 'Stash',
        'undo.discard': 'Pembuangan',
        'confirm.typeName': 'Ketik {name} untuk mengonfirmasi',
        'confirm.protected': '{name} adalah branch utama. Menghapusnya berisiko, jadi ketik nama branch untuk mengonfirmasi —— notifikasi masih bisa mengembalikannya.',
        'discard.untracked.confirm': 'Hapus berkas tidak terlacak {path}? Isinya dihapus —— notifikasi masih bisa mengembalikannya.',
        'stashDrop.confirm': 'Buang stash {ref}? Notifikasi masih bisa mengembalikannya.',
        'operation.merge': 'Penggabungan berlangsung',
        'operation.rebase': 'Rebase berlangsung',
        'operation.cherry-pick': 'Cherry-pick berlangsung',
        'operation.revert': 'Pembatalan berlangsung',
        'operation.bisect': 'Bisect berlangsung',
        'operation.hint': 'Repositori ini masih punya operasi bertahap yang terbuka —— selesaikan atau batalkan sebelum tindakan tingkat branch',
        'confirm.title': 'Konfirmasi',
        'confirm.cancel': 'Batal',
        'confirm.ok': 'OK',
        'prompt.newBranch': 'Nama branch baru (dibuat dan di-checkout)',
        'prompt.renameBranch': 'Ganti nama branch',
        'prompt.newTag': 'Nama tag baru',
        'prompt.fromHead': 'HEAD saat ini',
        'error.dismiss': 'Tutup',
        'status.loading': 'Membaca...',
        'status.busy': 'Bekerja...',
        'counts.staged': 'Ter-stage {n}',
        'counts.ignored': 'Diabaikan {n}',
        'counts.unstaged': 'Perubahan {n}',
        'counts.untracked': 'Tidak terlacak {n}',
        'counts.conflicted': 'Konflik {n}',
        'push.confirm': 'Push {branch} ke {upstream}?',
        'delete.confirm': 'Hapus branch {name}? Notifikasi masih bisa mengembalikannya (git tetap menolak branch yang belum digabung).',
        'discard.confirm': 'Buang perubahan di {path}? Isi worktree ditimpa —— notifikasi masih bisa mengembalikannya.',
        'resetHard.confirm': 'Reset keras ke {hash}? Perubahan yang belum di-commit akan hilang.',
        'resetSoft.confirm': 'Pindahkan HEAD ke {hash} (worktree dipertahankan)?',
        'checkoutCommit.confirm': 'Checkout commit {hash}? (detached HEAD)',
      },
      /* locale: vi */
      'vi': {
        'title': 'Git',
        'description': 'Bảng Git chuẩn IDE: cây nhánh / đồ thị commit / thay đổi',
        'repo.label': 'Kho',
        'repo.workspace': 'không gian làm việc',
        'repo.nested': 'lồng nhau',
        'repo.none': 'Không gian làm việc này không phải kho Git',
        'repo.pick': 'Chọn một kho để xem',
        'repo.empty': 'Không tìm thấy kho Git trong không gian làm việc này',
        'repo.switch': 'Chuyển kho',
        'branch.switch': 'Chuyển nhánh',
        'seg.changes': 'Thay đổi {n}',
        'seg.history': 'Lịch sử',
        'branches.local': 'Cục bộ',
        'branches.remote': 'Từ xa',
        'branches.tags': 'Thẻ',
        'branches.head': 'HEAD (nhánh hiện tại)',
        'branches.favorites': 'Yêu thích',
        'branches.pickHint': 'Nhấp để chọn, nhấp đôi để checkout',
        'branches.worktree': 'Đã được checkout ở một worktree khác',
        'action.stash': 'Tạm cất',
        'action.favorite': 'Thêm/bỏ nhánh hiện tại khỏi yêu thích',
        'action.newTagHere': 'Thẻ mới trên commit hiện tại...',
        'stash.push': 'Tạm cất thay đổi hiện tại',
        'stash.apply': 'Áp dụng bản tạm cất mới nhất',
        'stash.drop': 'Xoá bản tạm cất mới nhất',
        'stash.count': '{n} bản tạm cất',
        'note.noChanges': 'Không có thay đổi nào đang chờ',
        'note.noBranches': 'Không có nhánh khác',
        'branches.filter': 'Nhánh hoặc thẻ',
        'changes.title': 'Thay đổi',
        'changes.staged': 'Đã stage',
        'changes.unstaged': 'Thay đổi',
        'changes.untracked': 'Chưa theo dõi',
        'changes.conflicted': 'Xung đột',
        'changes.empty': 'Không có thay đổi nào đang chờ',
        'changes.commitPlaceholder': 'Nội dung commit (Ctrl+Enter)',
        'changes.commit': 'Commit',
        'changes.amend': 'Sửa commit gần nhất',
        'changes.stageAll': 'Stage tất cả',
        'changes.unstageAll': 'Bỏ stage tất cả',
        'changes.groupBy': 'Nhóm theo',
        'changes.groupFlat': 'Danh sách phẳng',
        'changes.groupDir': 'Theo thư mục',
        'changes.expandAll': 'Mở rộng tất cả',
        'changes.foldAll': 'Thu gọn tất cả',
        'changes.showIgnored': 'Hiện tệp bị bỏ qua',
        'changes.rootDir': '(gốc)',
        'changes.commitAndPush': 'Commit và push',
        'action.stage': 'Stage',
        'action.unstage': 'Bỏ stage',
        'action.discard': 'Bỏ thay đổi',
        'action.showDiff': 'Xem diff',
        'action.copyPath': 'Sao chép đường dẫn',
        'action.checkout': 'Checkout',
        'action.float': 'Tách trang này',
        'action.dock': 'Ghép lại vào dock',
        'action.split': 'Chia',
        'action.fullscreen': 'Toàn màn hình',
        'action.exitFullscreen': 'Thoát toàn màn hình',
        'action.newBranchFrom': 'Nhánh mới từ đây...',
        'action.newBranchHere': 'Nhánh mới tại đây...',
        'action.rename': 'Đổi tên...',
        'action.delete': 'Xoá',
        'action.mergeIntoCurrent': 'Hợp nhất vào nhánh hiện tại',
        'action.rebaseCurrentOnto': 'Rebase nhánh hiện tại lên nhánh này',
        'action.compare': 'So sánh với nhánh hiện tại',
        'action.update': 'Cập nhật (fetch)',
        'action.push': 'Push',
        'action.newTag': 'Thẻ mới...',
        'action.cherryPick': 'Cherry-pick',
        'action.revert': 'Hoàn tác commit',
        'action.resetSoft': 'Đặt lại về đây (giữ thay đổi)',
        'action.resetHard': 'Đặt lại về đây (bỏ thay đổi)',
        'action.copyHash': 'Sao chép số hiệu bản sửa',
        'action.details': 'Chi tiết commit',
        'history.empty': 'Kho này chưa có commit nào',
        'history.loadMore': 'Tải thêm',
        'history.filter': 'Văn bản hoặc hash',
        'detail.files': 'Tệp đã thay đổi',
        'detail.back': 'Quay lại lịch sử',
        'detail.noFiles': 'Không có thay đổi tệp',
        'diff.empty': 'Không có diff văn bản để hiển thị',
        'pane.diff': 'chế độ xem diff',
        'pane.resize': 'Kéo để đổi kích thước {name} (nhấp đúp để đặt lại, phím mũi tên để tinh chỉnh)',
        'diff.binary': 'Tệp nhị phân',
        'diff.loading': 'Đang tải diff...',
        'toolbar.refresh': 'Làm mới',
        'toolbar.newBranch': 'Nhánh mới',
        'toolbar.fetch': 'Fetch',
        'toolbar.pull': 'Pull',
        'toolbar.push': 'Push',
        'toolbar.tree': 'Bảng nhánh',
        'rail.more': 'Thao tác khác',
        'rail.settings': 'Cài đặt thanh thao tác',
        'rail.openSettings': 'Mở cài đặt plugin',
        'settings.rail.title': 'Nút thanh tác vụ',
        'settings.rail.hint': 'Chọn các tác vụ hiển thị trên thanh. Thứ tự cố định; bỏ chọn sẽ ẩn tác vụ đó.',
        'settings.rail.unavailable': 'Máy chủ này không có dịch vụ cài đặt; hãy dùng “Cài đặt thanh tác vụ” trong bảng điều khiển.',
        'settings.commit.title': 'Thông điệp commit do AI viết',
        'settings.commit.model': 'Mô hình',
        'settings.commit.modelHint': 'Trống = theo phiên này (provider/model)',
        'settings.commit.reasoning': 'Mức suy luận',
        'settings.commit.reasoningHint': 'Trống = mặc định của mô hình',
        'settings.commit.prompt': 'Chỉ dẫn bổ sung',
        'settings.commit.promptHint': 'ví dụ Conventional Commits, tiêu đề tiếng Việt, tối đa 72 ký tự',
        'settings.commit.tooLong': 'Chỉ {n} ký tự đầu được lưu',
        'changes.aiWrite': 'Viết bằng AI',
        'changes.aiBusy': 'Đang viết…',
        'changes.aiQuota': 'Dùng hạn mức của bạn',
        'changes.aiOverwriteTitle': 'Thay bản nháp hiện tại?',
        'changes.aiOverwriteText': 'Nội dung AI sẽ thay thế thông điệp commit bạn đã nhập (có thể hoàn tác).',
        'changes.aiUndo': 'Hoàn tác',
        'changes.aiFailed': 'Không viết được:',
        'changes.aiNotice': 'Một số thay đổi chưa gửi tới mô hình (bị cắt hoặc bỏ); thông điệp có thể chưa đầy đủ.',
        'settings.rail.writeFailed': 'Cài đặt không lưu được; công tắc đã trở về trạng thái cũ. Hãy thử lại.',
        'settings.rail.readonly': 'Máy chủ này chỉ cung cấp cấu hình ở chế độ chỉ đọc.',
        'rail.settingsHint': 'Kéo hoặc dùng mũi tên để sắp xếp; biểu tượng con mắt bật tắt hiển thị',
        'rail.reset': 'Khôi phục mặc định',
        'rail.up': 'Di chuyển lên',
        'rail.down': 'Di chuyển xuống',
        'rail.show': 'Hiện',
        'rail.hide': 'Ẩn',
        'action.unavailable': 'Không dùng được ở trạng thái hiện tại',
        'filter.branch': 'Nhánh',
        'filter.user': 'Tác giả',
        'filter.date': 'Ngày',
        'filter.path': 'Đường dẫn',
        'filter.all': 'Tất cả',
        'filter.today': 'Hôm nay',
        'filter.week': '7 ngày qua',
        'filter.month': '30 ngày qua',
        'filter.year': 'Năm nay',
        'filter.pathPlaceholder': 'Lọc theo đường dẫn (Enter)',
        'filter.sortDesc': 'Mới nhất trước',
        'filter.sortAsc': 'Cũ nhất trước',
        'filter.clear': 'Xoá bộ lọc',
        'filter.none': 'Không có commit khớp',
        'toast.undo': 'Hoàn tác',
        'toast.close': 'Đóng',
        'toast.branchDeleted': 'Đã xoá nhánh {name}',
        'toast.stashDropped': 'Đã xoá bản tạm cất {ref}',
        'toast.discarded': 'Đã bỏ thay đổi trong {path}',
        'toast.discardNoUndo': 'Đã bỏ thay đổi trong {path} (quá lớn để giữ hoàn tác)',
        'toast.restored': 'Đã khôi phục',
        'undo.menu': 'Vừa xoá (hoàn tác)',
        'undo.empty': 'Hiện không có gì để hoàn tác',
        'undo.branch': 'Nhánh',
        'undo.stash': 'Tạm cất',
        'undo.discard': 'Bỏ thay đổi',
        'confirm.typeName': 'Nhập {name} để xác nhận',
        'confirm.protected': '{name} là nhánh chính. Xoá nó rất rủi ro, hãy nhập tên nhánh để xác nhận —— thông báo sau đó vẫn có thể khôi phục.',
        'discard.untracked.confirm': 'Xoá tệp chưa theo dõi {path}? Nội dung sẽ bị xoá —— thông báo sau đó vẫn có thể khôi phục.',
        'stashDrop.confirm': 'Xoá bản tạm cất {ref}? Thông báo sau đó vẫn có thể khôi phục.',
        'operation.merge': 'Đang hợp nhất',
        'operation.rebase': 'Đang rebase',
        'operation.cherry-pick': 'Đang cherry-pick',
        'operation.revert': 'Đang hoàn tác',
        'operation.bisect': 'Đang bisect',
        'operation.hint': 'Kho này vẫn còn một thao tác nhiều bước chưa xong —— hãy hoàn tất hoặc huỷ trước khi thao tác ở mức nhánh',
        'confirm.title': 'Xác nhận',
        'confirm.cancel': 'Huỷ',
        'confirm.ok': 'OK',
        'prompt.newBranch': 'Tên nhánh mới (được tạo và checkout)',
        'prompt.renameBranch': 'Đổi tên nhánh',
        'prompt.newTag': 'Tên thẻ mới',
        'prompt.fromHead': 'HEAD hiện tại',
        'error.dismiss': 'Đóng',
        'status.loading': 'Đang đọc...',
        'status.busy': 'Đang xử lý...',
        'counts.staged': 'Đã stage {n}',
        'counts.ignored': 'Bị bỏ qua {n}',
        'counts.unstaged': 'Thay đổi {n}',
        'counts.untracked': 'Chưa theo dõi {n}',
        'counts.conflicted': 'Xung đột {n}',
        'push.confirm': 'Push {branch} lên {upstream}?',
        'delete.confirm': 'Xoá nhánh {name}? Thông báo sau đó vẫn có thể khôi phục (git vẫn từ chối nhánh chưa hợp nhất).',
        'discard.confirm': 'Bỏ thay đổi trong {path}? Nội dung worktree sẽ bị ghi đè —— thông báo sau đó vẫn có thể khôi phục.',
        'resetHard.confirm': 'Đặt lại cứng về {hash}? Thay đổi chưa commit sẽ mất.',
        'resetSoft.confirm': 'Chuyển HEAD về {hash} (giữ worktree)?',
        'checkoutCommit.confirm': 'Checkout commit {hash}? (detached HEAD)',
      },
      /* locale: ar */
      'ar': {
        'title': 'Git',
        'description': 'لوحة Git بمستوى IDE: شجرة الفروع / رسم الالتزامات / التغييرات',
        'repo.label': 'المستودع',
        'repo.workspace': 'مساحة العمل',
        'repo.nested': 'متشعّب',
        'repo.none': 'مساحة العمل هذه ليست مستودع Git',
        'repo.pick': 'اختر مستودعًا لعرضه',
        'repo.empty': 'لم يُعثر على مستودع Git في مساحة العمل هذه',
        'repo.switch': 'تبديل المستودع',
        'branch.switch': 'تبديل الفرع',
        'seg.changes': 'التغييرات {n}',
        'seg.history': 'السجل',
        'branches.local': 'محلي',
        'branches.remote': 'بعيد',
        'branches.tags': 'الوسوم',
        'branches.head': 'HEAD (الفرع الحالي)',
        'branches.favorites': 'المفضلة',
        'branches.pickHint': 'انقر للتحديد، وانقر نقرًا مزدوجًا للتبديل',
        'branches.worktree': 'مُستخرَج بالفعل في شجرة عمل أخرى',
        'action.stash': 'التخزين المؤقت',
        'action.favorite': 'إضافة الفرع الحالي إلى المفضلة أو إزالته',
        'action.newTagHere': 'وسم جديد على الالتزام الحالي...',
        'stash.push': 'خزّن التغييرات الحالية',
        'stash.apply': 'طبّق أحدث تخزين',
        'stash.drop': 'احذف أحدث تخزين',
        'stash.count': '{n} مدخلات تخزين',
        'note.noChanges': 'لا توجد تغييرات معلّقة',
        'note.noBranches': 'لا توجد فروع أخرى',
        'branches.filter': 'فرع أو وسم',
        'changes.title': 'التغييرات',
        'changes.staged': 'مُجهَّز',
        'changes.unstaged': 'التغييرات',
        'changes.untracked': 'غير متعقَّب',
        'changes.conflicted': 'التعارضات',
        'changes.empty': 'لا توجد تغييرات معلّقة',
        'changes.commitPlaceholder': 'رسالة الالتزام (Ctrl+Enter)',
        'changes.commit': 'التزام',
        'changes.amend': 'تعديل الالتزام الأخير',
        'changes.stageAll': 'جهّز الكل',
        'changes.unstageAll': 'ألغِ تجهيز الكل',
        'changes.groupBy': 'التجميع حسب',
        'changes.groupFlat': 'قائمة مسطّحة',
        'changes.groupDir': 'حسب الدليل',
        'changes.expandAll': 'وسّع الكل',
        'changes.foldAll': 'اطوِ الكل',
        'changes.showIgnored': 'إظهار الملفات المتجاهَلة',
        'changes.rootDir': '(الجذر)',
        'changes.commitAndPush': 'التزام ودفع',
        'action.stage': 'تجهيز',
        'action.unstage': 'إلغاء التجهيز',
        'action.discard': 'تجاهل التغييرات',
        'action.showDiff': 'عرض الفروق',
        'action.copyPath': 'نسخ المسار',
        'action.checkout': 'تبديل',
        'action.float': 'تعويم هذه الصفحة',
        'action.dock': 'الإرجاع إلى الرصيف',
        'action.split': 'تقسيم',
        'action.fullscreen': 'ملء الشاشة',
        'action.exitFullscreen': 'إنهاء ملء الشاشة',
        'action.newBranchFrom': 'فرع جديد من هنا...',
        'action.newBranchHere': 'فرع جديد هنا...',
        'action.rename': 'إعادة التسمية...',
        'action.delete': 'حذف',
        'action.mergeIntoCurrent': 'الدمج في الفرع الحالي',
        'action.rebaseCurrentOnto': 'إعادة تأسيس الفرع الحالي على هذا',
        'action.compare': 'المقارنة مع الفرع الحالي',
        'action.update': 'تحديث (fetch)',
        'action.push': 'دفع',
        'action.newTag': 'وسم جديد...',
        'action.cherryPick': 'انتقاء',
        'action.revert': 'تراجع عن الالتزام',
        'action.resetSoft': 'إعادة التعيين هنا (مع الاحتفاظ بالتغييرات)',
        'action.resetHard': 'إعادة التعيين هنا (مع تجاهل التغييرات)',
        'action.copyHash': 'نسخ رقم المراجعة',
        'action.details': 'تفاصيل الالتزام',
        'history.empty': 'لا توجد التزامات في هذا المستودع بعد',
        'history.loadMore': 'تحميل المزيد',
        'history.filter': 'نص أو تجزئة',
        'detail.files': 'الملفات المتغيّرة',
        'detail.back': 'رجوع إلى السجل',
        'detail.noFiles': 'لا توجد تغييرات في الملفات',
        'diff.empty': 'لا توجد فروق نصية لعرضها',
        'pane.diff': 'عرض الفروق',
        'pane.resize': 'اسحب لتغيير حجم {name} (النقر المزدوج يعيد الضبط، ومفاتيح الأسهم للضبط الدقيق)',
        'diff.binary': 'ملف ثنائي',
        'diff.loading': 'جارٍ تحميل الفروق...',
        'toolbar.refresh': 'تحديث',
        'toolbar.newBranch': 'فرع جديد',
        'toolbar.fetch': 'جلب',
        'toolbar.pull': 'سحب',
        'toolbar.push': 'دفع',
        'toolbar.tree': 'لوحة الفروع',
        'rail.more': 'مزيد من الإجراءات',
        'rail.settings': 'إعدادات شريط الإجراءات',
        'rail.openSettings': 'فتح إعدادات الإضافة',
        'settings.rail.title': 'أزرار شريط الإجراءات',
        'settings.rail.hint': 'حدّد الإجراءات المعروضة على الشريط. الترتيب ثابت، وإلغاء التحديد يخفي الإجراء.',
        'settings.rail.unavailable': 'لا تتوفر خدمة إعدادات على هذا المضيف؛ استخدم «إعدادات شريط الإجراءات» في اللوحة.',
        'settings.commit.title': 'رسالة إيداع بالذكاء الاصطناعي',
        'settings.commit.model': 'النموذج',
        'settings.commit.modelHint': 'فارغ = اتبع هذه الجلسة (provider/model)',
        'settings.commit.reasoning': 'مستوى التفكير',
        'settings.commit.reasoningHint': 'فارغ = الافتراضي للنموذج',
        'settings.commit.prompt': 'تعليمات إضافية',
        'settings.commit.promptHint': 'مثال: Conventional Commits، والعنوان بالعربية، وبحد أقصى 72 حرفًا',
        'settings.commit.tooLong': 'يُحفظ أول {n} حرفًا فقط',
        'changes.aiWrite': 'اكتب بالذكاء الاصطناعي',
        'changes.aiBusy': 'جارٍ الكتابة…',
        'changes.aiQuota': 'يستهلك حصتك',
        'changes.aiOverwriteTitle': 'استبدال المسودة الحالية؟',
        'changes.aiOverwriteText': 'سيستبدل نص الذكاء الاصطناعي رسالة الإيداع التي كتبتها (يمكن التراجع).',
        'changes.aiUndo': 'تراجع',
        'changes.aiFailed': 'تعذّرت الكتابة:',
        'changes.aiNotice': 'لم تُرسل بعض التغييرات إلى النموذج (مقتطعة أو متروكة)؛ قد تكون الرسالة ناقصة.',
        'settings.rail.writeFailed': 'لم يتم حفظ الإعداد؛ عاد المفتاح إلى حاله. حاول مرة أخرى.',
        'settings.rail.readonly': 'يوفّر هذا المضيف الإعدادات للقراءة فقط.',
        'rail.settingsHint': 'اسحب أو استخدم الأسهم لإعادة الترتيب؛ وأيقونة العين تبدّل الظهور',
        'rail.reset': 'استعادة الإعدادات الافتراضية',
        'rail.up': 'تحريك لأعلى',
        'rail.down': 'تحريك لأسفل',
        'rail.show': 'إظهار',
        'rail.hide': 'إخفاء',
        'action.unavailable': 'غير متاح في الحالة الحالية',
        'filter.branch': 'الفرع',
        'filter.user': 'المؤلف',
        'filter.date': 'التاريخ',
        'filter.path': 'المسار',
        'filter.all': 'الكل',
        'filter.today': 'اليوم',
        'filter.week': 'آخر 7 أيام',
        'filter.month': 'آخر 30 يومًا',
        'filter.year': 'هذا العام',
        'filter.pathPlaceholder': 'تصفية حسب المسار (Enter)',
        'filter.sortDesc': 'الأحدث أولًا',
        'filter.sortAsc': 'الأقدم أولًا',
        'filter.clear': 'مسح عوامل التصفية',
        'filter.none': 'لا توجد التزامات مطابقة',
        'toast.undo': 'تراجع',
        'toast.close': 'إغلاق',
        'toast.branchDeleted': 'تم حذف الفرع {name}',
        'toast.stashDropped': 'تم حذف التخزين {ref}',
        'toast.discarded': 'تم تجاهل التغييرات في {path}',
        'toast.discardNoUndo': 'تم تجاهل التغييرات في {path} (أكبر من أن يُحتفظ بالتراجع)',
        'toast.restored': 'تمت الاستعادة',
        'undo.menu': 'المحذوف حديثًا (تراجع)',
        'undo.empty': 'لا شيء لتراجعه الآن',
        'undo.branch': 'فرع',
        'undo.stash': 'تخزين',
        'undo.discard': 'تجاهل',
        'confirm.typeName': 'اكتب {name} للتأكيد',
        'confirm.protected': '{name} فرع رئيسي. حذفه محفوف بالمخاطر، لذا اكتب اسم الفرع للتأكيد —— ويمكن لإشعار بعد ذلك أن يعيده.',
        'discard.untracked.confirm': 'حذف الملف غير المتعقَّب {path}؟ سيُزال محتواه —— ويمكن لإشعار بعد ذلك أن يعيده.',
        'stashDrop.confirm': 'حذف التخزين {ref}؟ يمكن لإشعار بعد ذلك أن يعيده.',
        'operation.merge': 'الدمج جارٍ',
        'operation.rebase': 'إعادة التأسيس جارية',
        'operation.cherry-pick': 'الانتقاء جارٍ',
        'operation.revert': 'التراجع جارٍ',
        'operation.bisect': 'bisect جارٍ',
        'operation.hint': 'لا يزال في هذا المستودع إجراء متعدد الخطوات مفتوح —— أكمله أو ألغِه قبل إجراءات الفروع',
        'confirm.title': 'تأكيد',
        'confirm.cancel': 'إلغاء',
        'confirm.ok': 'موافق',
        'prompt.newBranch': 'اسم الفرع الجديد (يُنشأ ويُبدَّل إليه)',
        'prompt.renameBranch': 'إعادة تسمية الفرع',
        'prompt.newTag': 'اسم الوسم الجديد',
        'prompt.fromHead': 'HEAD الحالي',
        'error.dismiss': 'إغلاق',
        'status.loading': 'جارٍ القراءة...',
        'status.busy': 'جارٍ العمل...',
        'counts.staged': 'مُجهَّز {n}',
        'counts.ignored': 'متجاهَل {n}',
        'counts.unstaged': 'التغييرات {n}',
        'counts.untracked': 'غير متعقَّب {n}',
        'counts.conflicted': 'التعارضات {n}',
        'push.confirm': 'دفع {branch} إلى {upstream}?',
        'delete.confirm': 'حذف الفرع {name}? يمكن لإشعار بعد ذلك أن يعيده (سيظل git يرفض الفروع غير المدمجة).',
        'discard.confirm': 'تجاهل التغييرات في {path}? سيُستبدل محتوى شجرة العمل —— ويمكن لإشعار بعد ذلك أن يعيده.',
        'resetHard.confirm': 'إعادة تعيين قسرية إلى {hash}? ستفقد التغييرات غير الملتزَم بها.',
        'resetSoft.confirm': 'نقل HEAD إلى {hash} (مع الاحتفاظ بشجرة العمل)?',
        'checkoutCommit.confirm': 'تبديل إلى الالتزام {hash}? (detached HEAD)',
      },
      /* locale: hi */
      'hi': {
        'title': 'Git',
        'description': 'IDE स्तर का Git पैनल: शाखा वृक्ष / कमिट ग्राफ़ / परिवर्तन',
        'repo.label': 'रिपॉज़िटरी',
        'repo.workspace': 'कार्यक्षेत्र',
        'repo.nested': 'नेस्टेड',
        'repo.none': 'यह कार्यक्षेत्र Git रिपॉज़िटरी नहीं है',
        'repo.pick': 'देखने के लिए रिपॉज़िटरी चुनें',
        'repo.empty': 'इस कार्यक्षेत्र में कोई Git रिपॉज़िटरी नहीं मिली',
        'repo.switch': 'रिपॉज़िटरी बदलें',
        'branch.switch': 'शाखा बदलें',
        'seg.changes': 'परिवर्तन {n}',
        'seg.history': 'इतिहास',
        'branches.local': 'स्थानीय',
        'branches.remote': 'रिमोट',
        'branches.tags': 'टैग',
        'branches.head': 'HEAD (वर्तमान शाखा)',
        'branches.favorites': 'पसंदीदा',
        'branches.pickHint': 'चुनने के लिए क्लिक करें, चेकआउट के लिए डबल-क्लिक करें',
        'branches.worktree': 'पहले से किसी अन्य वर्कट्री में चेकआउट है',
        'action.stash': 'स्टैश',
        'action.favorite': 'वर्तमान शाखा को पसंदीदा में जोड़ें/हटाएँ',
        'action.newTagHere': 'वर्तमान कमिट पर नया टैग...',
        'stash.push': 'वर्तमान परिवर्तन स्टैश करें',
        'stash.apply': 'नवीनतम स्टैश लागू करें',
        'stash.drop': 'नवीनतम स्टैश हटाएँ',
        'stash.count': '{n} स्टैश प्रविष्टियाँ',
        'note.noChanges': 'कोई लंबित परिवर्तन नहीं',
        'note.noBranches': 'कोई अन्य शाखा नहीं',
        'branches.filter': 'शाखा या टैग',
        'changes.title': 'परिवर्तन',
        'changes.staged': 'स्टेज्ड',
        'changes.unstaged': 'परिवर्तन',
        'changes.untracked': 'अनट्रैक्ड',
        'changes.conflicted': 'टकराव',
        'changes.empty': 'कोई लंबित परिवर्तन नहीं',
        'changes.commitPlaceholder': 'कमिट संदेश (Ctrl+Enter)',
        'changes.commit': 'कमिट करें',
        'changes.amend': 'पिछला कमिट सुधारें',
        'changes.stageAll': 'सभी स्टेज करें',
        'changes.unstageAll': 'सभी अनस्टेज करें',
        'changes.groupBy': 'इसके अनुसार समूह',
        'changes.groupFlat': 'सपाट सूची',
        'changes.groupDir': 'निर्देशिका के अनुसार',
        'changes.expandAll': 'सभी फैलाएँ',
        'changes.foldAll': 'सभी समेटें',
        'changes.showIgnored': 'अनदेखी फ़ाइलें दिखाएँ',
        'changes.rootDir': '(रूट)',
        'changes.commitAndPush': 'कमिट और पुश',
        'action.stage': 'स्टेज',
        'action.unstage': 'अनस्टेज',
        'action.discard': 'परिवर्तन छोड़ें',
        'action.showDiff': 'अंतर दिखाएँ',
        'action.copyPath': 'पथ कॉपी करें',
        'action.checkout': 'चेकआउट',
        'action.float': 'इस पृष्ठ को तैराएँ',
        'action.dock': 'डॉक पर वापस लाएँ',
        'action.split': 'विभाजित करें',
        'action.fullscreen': 'पूर्ण स्क्रीन',
        'action.exitFullscreen': 'पूर्ण स्क्रीन से बाहर',
        'action.newBranchFrom': 'यहाँ से नई शाखा...',
        'action.newBranchHere': 'यहाँ नई शाखा...',
        'action.rename': 'नाम बदलें...',
        'action.delete': 'हटाएँ',
        'action.mergeIntoCurrent': 'वर्तमान शाखा में मर्ज करें',
        'action.rebaseCurrentOnto': 'वर्तमान शाखा को इस पर रीबेस करें',
        'action.compare': 'वर्तमान शाखा से तुलना करें',
        'action.update': 'अद्यतन करें (fetch)',
        'action.push': 'पुश',
        'action.newTag': 'नया टैग...',
        'action.cherryPick': 'चेरी-पिक',
        'action.revert': 'कमिट वापस लें',
        'action.resetSoft': 'यहाँ रीसेट करें (परिवर्तन रखें)',
        'action.resetHard': 'यहाँ रीसेट करें (परिवर्तन छोड़ें)',
        'action.copyHash': 'रिवीज़न संख्या कॉपी करें',
        'action.details': 'कमिट विवरण',
        'history.empty': 'इस रिपॉज़िटरी में अभी कोई कमिट नहीं है',
        'history.loadMore': 'और लोड करें',
        'history.filter': 'टेक्स्ट या हैश',
        'detail.files': 'बदली हुई फ़ाइलें',
        'detail.back': 'इतिहास पर वापस',
        'detail.noFiles': 'कोई फ़ाइल परिवर्तन नहीं',
        'diff.empty': 'दिखाने के लिए कोई टेक्स्ट अंतर नहीं',
        'pane.diff': 'डिफ़ व्यू',
        'pane.resize': '{name} का आकार बदलने के लिए खींचें (डबल-क्लिक रीसेट, तीर कुंजियाँ सूक्ष्म समायोजन)',
        'diff.binary': 'बाइनरी फ़ाइल',
        'diff.loading': 'अंतर लोड हो रहा है...',
        'toolbar.refresh': 'ताज़ा करें',
        'toolbar.newBranch': 'नई शाखा',
        'toolbar.fetch': 'फ़ेच',
        'toolbar.pull': 'पुल',
        'toolbar.push': 'पुश',
        'toolbar.tree': 'शाखा पैनल',
        'rail.more': 'अधिक क्रियाएँ',
        'rail.settings': 'क्रिया पट्टी सेटिंग्स',
        'rail.openSettings': 'प्लगइन सेटिंग खोलें',
        'settings.rail.title': 'एक्शन रेल बटन',
        'settings.rail.hint': 'रेल पर दिखने वाली क्रियाएँ चुनें। क्रम निश्चित है; चुनाव हटाने पर वह छिप जाती है।',
        'settings.rail.unavailable': 'इस होस्ट में सेटिंग सेवा नहीं है; पैनल में «एक्शन रेल सेटिंग» का उपयोग करें।',
        'settings.commit.title': 'AI कमिट संदेश',
        'settings.commit.model': 'मॉडल',
        'settings.commit.modelHint': 'खाली = इस सत्र का अनुसरण करें (provider/model)',
        'settings.commit.reasoning': 'तर्क की तीव्रता',
        'settings.commit.reasoningHint': 'खाली = मॉडल का डिफ़ॉल्ट',
        'settings.commit.prompt': 'अतिरिक्त निर्देश',
        'settings.commit.promptHint': 'जैसे Conventional Commits, विषय हिंदी में, अधिकतम 72 अक्षर',
        'settings.commit.tooLong': 'केवल पहले {n} अक्षर सहेजे जाते हैं',
        'changes.aiWrite': 'AI से लिखें',
        'changes.aiBusy': 'लिखा जा रहा है…',
        'changes.aiQuota': 'आपका कोटा खर्च होता है',
        'changes.aiOverwriteTitle': 'मौजूदा ड्राफ़्ट बदलें?',
        'changes.aiOverwriteText': 'AI पाठ आपके लिखे कमिट संदेश की जगह लेगा (पूर्ववत कर सकते हैं)।',
        'changes.aiUndo': 'पूर्ववत करें',
        'changes.aiFailed': 'लिख नहीं सका:',
        'changes.aiNotice': 'कुछ बदलाव मॉडल को नहीं भेजे गए (काटे या छोड़े गए); संदेश अधूरा हो सकता है।',
        'settings.rail.writeFailed': 'सेटिंग सहेजी नहीं गई; स्विच वापस पुरानी स्थिति में आ गया। फिर से कोशिश करें।',
        'settings.rail.readonly': 'यह होस्ट कॉन्फ़िगरेशन को केवल-पढ़ने के लिए देता है।',
        'rail.settingsHint': 'क्रम बदलने के लिए खींचें या तीरों का उपयोग करें; आँख आइकन दृश्यता बदलता है',
        'rail.reset': 'डिफ़ॉल्ट बहाल करें',
        'rail.up': 'ऊपर ले जाएँ',
        'rail.down': 'नीचे ले जाएँ',
        'rail.show': 'दिखाएँ',
        'rail.hide': 'छिपाएँ',
        'action.unavailable': 'वर्तमान स्थिति में उपलब्ध नहीं',
        'filter.branch': 'शाखा',
        'filter.user': 'लेखक',
        'filter.date': 'दिनांक',
        'filter.path': 'पथ',
        'filter.all': 'सभी',
        'filter.today': 'आज',
        'filter.week': 'पिछले 7 दिन',
        'filter.month': 'पिछले 30 दिन',
        'filter.year': 'इस वर्ष',
        'filter.pathPlaceholder': 'पथ से फ़िल्टर करें (Enter)',
        'filter.sortDesc': 'नवीनतम पहले',
        'filter.sortAsc': 'पुराने पहले',
        'filter.clear': 'फ़िल्टर साफ़ करें',
        'filter.none': 'कोई मेल खाता कमिट नहीं',
        'toast.undo': 'पूर्ववत करें',
        'toast.close': 'बंद करें',
        'toast.branchDeleted': 'शाखा {name} हटाई गई',
        'toast.stashDropped': 'स्टैश {ref} हटाया गया',
        'toast.discarded': '{path} में परिवर्तन छोड़े गए',
        'toast.discardNoUndo': '{path} में परिवर्तन छोड़े गए (पूर्ववत रखने के लिए बहुत बड़ा)',
        'toast.restored': 'बहाल किया गया',
        'undo.menu': 'हाल में हटाए गए (पूर्ववत करें)',
        'undo.empty': 'अभी पूर्ववत करने के लिए कुछ नहीं',
        'undo.branch': 'शाखा',
        'undo.stash': 'स्टैश',
        'undo.discard': 'छोड़ना',
        'confirm.typeName': 'पुष्टि के लिए {name} लिखें',
        'confirm.protected': '{name} एक मुख्य शाखा है। इसे हटाना जोखिम भरा है, इसलिए पुष्टि के लिए शाखा का नाम लिखें —— बाद में एक सूचना इसे वापस ला सकती है।',
        'discard.untracked.confirm': 'अनट्रैक्ड फ़ाइल {path} हटाएँ? इसकी सामग्री हट जाएगी —— बाद में एक सूचना इसे वापस ला सकती है।',
        'stashDrop.confirm': 'स्टैश {ref} हटाएँ? बाद में एक सूचना इसे वापस ला सकती है।',
        'operation.merge': 'मर्ज जारी है',
        'operation.rebase': 'रीबेस जारी है',
        'operation.cherry-pick': 'चेरी-पिक जारी है',
        'operation.revert': 'वापसी जारी है',
        'operation.bisect': 'bisect जारी है',
        'operation.hint': 'इस रिपॉज़िटरी में अभी एक बहु-चरणीय कार्य खुला है —— शाखा क्रियाओं से पहले उसे पूरा करें या रद्द करें',
        'confirm.title': 'पुष्टि',
        'confirm.cancel': 'रद्द करें',
        'confirm.ok': 'ठीक',
        'prompt.newBranch': 'नई शाखा का नाम (बनाई और चेकआउट की जाएगी)',
        'prompt.renameBranch': 'शाखा का नाम बदलें',
        'prompt.newTag': 'नए टैग का नाम',
        'prompt.fromHead': 'वर्तमान HEAD',
        'error.dismiss': 'बंद करें',
        'status.loading': 'पढ़ा जा रहा है...',
        'status.busy': 'कार्य जारी...',
        'counts.staged': 'स्टेज्ड {n}',
        'counts.ignored': 'अनदेखा {n}',
        'counts.unstaged': 'परिवर्तन {n}',
        'counts.untracked': 'अनट्रैक्ड {n}',
        'counts.conflicted': 'टकराव {n}',
        'push.confirm': '{branch} को {upstream} पर पुश करें?',
        'delete.confirm': 'शाखा {name} हटाएँ? बाद में एक सूचना इसे वापस ला सकती है (git अब भी अनमर्ज्ड शाखाओं से इनकार करता है)।',
        'discard.confirm': '{path} में परिवर्तन छोड़ें? वर्कट्री की सामग्री अधिलेखित हो जाएगी —— बाद में एक सूचना इसे वापस ला सकती है।',
        'resetHard.confirm': '{hash} पर हार्ड रीसेट करें? बिना कमिट किए परिवर्तन खो जाएँगे।',
        'resetSoft.confirm': 'HEAD को {hash} पर ले जाएँ (वर्कट्री सुरक्षित)?',
        'checkoutCommit.confirm': 'कमिट {hash} चेकआउट करें? (detached HEAD)',
      },
      /* locale: th */
      'th': {
        'title': 'Git',
        'description': 'แผง Git ระดับ IDE: ทรีแบรนช์ / กราฟคอมมิต / การเปลี่ยนแปลง',
        'repo.label': 'รีโพซิทอรี',
        'repo.workspace': 'เวิร์กสเปซ',
        'repo.nested': 'ซ้อนกัน',
        'repo.none': 'เวิร์กสเปซนี้ไม่ใช่รีโพซิทอรี Git',
        'repo.pick': 'เลือกรีโพซิทอรีที่จะดู',
        'repo.empty': 'ไม่พบรีโพซิทอรี Git ในเวิร์กสเปซนี้',
        'repo.switch': 'สลับรีโพซิทอรี',
        'branch.switch': 'สลับแบรนช์',
        'seg.changes': 'การเปลี่ยนแปลง {n}',
        'seg.history': 'ประวัติ',
        'branches.local': 'โลคัล',
        'branches.remote': 'รีโมต',
        'branches.tags': 'แท็ก',
        'branches.head': 'HEAD (แบรนช์ปัจจุบัน)',
        'branches.favorites': 'รายการโปรด',
        'branches.pickHint': 'คลิกเพื่อเลือก ดับเบิลคลิกเพื่อเช็กเอาต์',
        'branches.worktree': 'เช็กเอาต์อยู่ในเวิร์กทรีอื่นแล้ว',
        'action.stash': 'สแตช',
        'action.favorite': 'เพิ่ม/移除แบรนช์ปัจจุบันในรายการโปรด',
        'action.newTagHere': 'แท็กใหม่บนคอมมิตปัจจุบัน...',
        'stash.push': 'สแตชการเปลี่ยนแปลงปัจจุบัน',
        'stash.apply': 'ใช้สแตชล่าสุด',
        'stash.drop': 'ลบสแตชล่าสุด',
        'stash.count': 'สแตช {n} รายการ',
        'note.noChanges': 'ไม่มีการเปลี่ยนแปลงที่ค้างอยู่',
        'note.noBranches': 'ไม่มีแบรนช์อื่น',
        'branches.filter': 'แบรนช์หรือแท็ก',
        'changes.title': 'การเปลี่ยนแปลง',
        'changes.staged': 'สเตจแล้ว',
        'changes.unstaged': 'การเปลี่ยนแปลง',
        'changes.untracked': 'ไม่ถูกติดตาม',
        'changes.conflicted': 'ความขัดแย้ง',
        'changes.empty': 'ไม่มีการเปลี่ยนแปลงที่ค้างอยู่',
        'changes.commitPlaceholder': 'ข้อความคอมมิต (Ctrl+Enter)',
        'changes.commit': 'คอมมิต',
        'changes.amend': 'แก้ไขคอมมิตล่าสุด',
        'changes.stageAll': 'สเตจทั้งหมด',
        'changes.unstageAll': 'ยกเลิกสเตจทั้งหมด',
        'changes.groupBy': 'จัดกลุ่มตาม',
        'changes.groupFlat': 'รายการแบน',
        'changes.groupDir': 'ตามไดเรกทอรี',
        'changes.expandAll': 'ขยายทั้งหมด',
        'changes.foldAll': 'ย่อทั้งหมด',
        'changes.showIgnored': 'แสดงไฟล์ที่ถูกเพิกเฉย',
        'changes.rootDir': '(รูท)',
        'changes.commitAndPush': 'คอมมิตและพุช',
        'action.stage': 'สเตจ',
        'action.unstage': 'ยกเลิกสเตจ',
        'action.discard': 'ทิ้งการเปลี่ยนแปลง',
        'action.showDiff': 'แสดงความต่าง',
        'action.copyPath': 'คัดลอกพาธ',
        'action.checkout': 'เช็กเอาต์',
        'action.float': 'ลอยหน้านี้',
        'action.dock': 'กลับเข้าด็อก',
        'action.split': 'แบ่งหน้าต่าง',
        'action.fullscreen': 'เต็มหน้าจอ',
        'action.exitFullscreen': 'ออกจากเต็มหน้าจอ',
        'action.newBranchFrom': 'แบรนช์ใหม่จากที่นี่...',
        'action.newBranchHere': 'แบรนช์ใหม่ที่นี่...',
        'action.rename': 'เปลี่ยนชื่อ...',
        'action.delete': 'ลบ',
        'action.mergeIntoCurrent': 'รวมเข้าแบรนช์ปัจจุบัน',
        'action.rebaseCurrentOnto': 'รีเบสแบรนช์ปัจจุบันไปที่นี้',
        'action.compare': 'เปรียบเทียบกับแบรนช์ปัจจุบัน',
        'action.update': 'อัปเดต (fetch)',
        'action.push': 'พุช',
        'action.newTag': 'แท็กใหม่...',
        'action.cherryPick': 'เชอร์รีพิก',
        'action.revert': 'ย้อนคอมมิต',
        'action.resetSoft': 'รีเซ็ตมาที่นี่ (เก็บการเปลี่ยนแปลง)',
        'action.resetHard': 'รีเซ็ตมาที่นี่ (ทิ้งการเปลี่ยนแปลง)',
        'action.copyHash': 'คัดลอกเลขรีวิชัน',
        'action.details': 'รายละเอียดคอมมิต',
        'history.empty': 'รีโพซิทอรีนี้ยังไม่มีคอมมิต',
        'history.loadMore': 'โหลดเพิ่ม',
        'history.filter': 'ข้อความหรือแฮช',
        'detail.files': 'ไฟล์ที่เปลี่ยน',
        'detail.back': 'กลับไปที่ประวัติ',
        'detail.noFiles': 'ไม่มีการเปลี่ยนแปลงไฟล์',
        'diff.empty': 'ไม่มีความต่างเชิงข้อความให้แสดง',
        'pane.diff': 'มุมมอง diff',
        'pane.resize': 'ลากเพื่อปรับขนาด {name} (ดับเบิลคลิกเพื่อรีเซ็ต ปุ่มลูกศรปรับละเอียด)',
        'diff.binary': 'ไฟล์ไบนารี',
        'diff.loading': 'กำลังโหลดความต่าง...',
        'toolbar.refresh': 'รีเฟรช',
        'toolbar.newBranch': 'แบรนช์ใหม่',
        'toolbar.fetch': 'Fetch',
        'toolbar.pull': 'Pull',
        'toolbar.push': 'Push',
        'toolbar.tree': 'แผงแบรนช์',
        'rail.more': 'การทำงานเพิ่มเติม',
        'rail.settings': 'ตั้งค่าแถบการทำงาน',
        'rail.openSettings': 'เปิดการตั้งค่าปลั๊กอิน',
        'settings.rail.title': 'ปุ่มแถบการทำงาน',
        'settings.rail.hint': 'ทำเครื่องหมายการทำงานที่จะแสดงบนแถบ ลำดับคงที่; ยกเลิกเครื่องหมายเพื่อซ่อน',
        'settings.rail.unavailable': 'โฮสต์นี้ไม่มีบริการตั้งค่า ให้ใช้ «ตั้งค่าแถบการทำงาน» ในแผง',
        'settings.commit.title': 'ข้อความคอมมิตโดย AI',
        'settings.commit.model': 'โมเดล',
        'settings.commit.modelHint': 'ว่าง = ตามเซสชันนี้ (provider/model)',
        'settings.commit.reasoning': 'ระดับการใช้เหตุผล',
        'settings.commit.reasoningHint': 'ว่าง = ค่าเริ่มต้นของโมเดล',
        'settings.commit.prompt': 'คำสั่งเพิ่มเติม',
        'settings.commit.promptHint': 'เช่น Conventional Commits หัวข้อเป็นภาษาไทย ไม่เกิน 72 ตัวอักษร',
        'settings.commit.tooLong': 'บันทึกเพียง {n} ตัวอักษรแรก',
        'changes.aiWrite': 'เขียนด้วย AI',
        'changes.aiBusy': 'กำลังเขียน…',
        'changes.aiQuota': 'ใช้โควตาของคุณ',
        'changes.aiOverwriteTitle': 'แทนที่ฉบับร่างปัจจุบันหรือไม่',
        'changes.aiOverwriteText': 'ข้อความจาก AI จะแทนที่ข้อความคอมมิตที่คุณพิมพ์ (เลิกทำได้)',
        'changes.aiUndo': 'เลิกทำ',
        'changes.aiFailed': 'เขียนไม่สำเร็จ:',
        'changes.aiNotice': 'มีการเปลี่ยนแปลงบางส่วนที่ไม่ได้ส่งให้โมเดล (ถูกตัดหรือทิ้ง) ข้อความอาจไม่ครบถ้วน',
        'settings.rail.writeFailed': 'บันทึกการตั้งค่าไม่สำเร็จ สวิตช์กลับไปสถานะเดิม ลองอีกครั้ง',
        'settings.rail.readonly': 'โฮสต์นี้ให้บริการการตั้งค่าแบบอ่านอย่างเดียว',
        'rail.settingsHint': 'ลากหรือใช้ลูกศรเพื่อจัดลำดับ; ไอคอนตาใช้สลับการแสดง',
        'rail.reset': 'คืนค่าเริ่มต้น',
        'rail.up': 'เลื่อนขึ้น',
        'rail.down': 'เลื่อนลง',
        'rail.show': 'แสดง',
        'rail.hide': 'ซ่อน',
        'action.unavailable': 'ใช้ไม่ได้ในสถานะปัจจุบัน',
        'filter.branch': 'แบรนช์',
        'filter.user': 'ผู้เขียน',
        'filter.date': 'วันที่',
        'filter.path': 'พาธ',
        'filter.all': 'ทั้งหมด',
        'filter.today': 'วันนี้',
        'filter.week': '7 วันที่ผ่านมา',
        'filter.month': '30 วันที่ผ่านมา',
        'filter.year': 'ปีนี้',
        'filter.pathPlaceholder': 'กรองตามพาธ (Enter)',
        'filter.sortDesc': 'ใหม่สุดก่อน',
        'filter.sortAsc': 'เก่าสุดก่อน',
        'filter.clear': 'ล้างตัวกรอง',
        'filter.none': 'ไม่มีคอมมิตที่ตรงกัน',
        'toast.undo': 'เลิกทำ',
        'toast.close': 'ปิด',
        'toast.branchDeleted': 'ลบแบรนช์ {name} แล้ว',
        'toast.stashDropped': 'ลบสแตช {ref} แล้ว',
        'toast.discarded': 'ทิ้งการเปลี่ยนแปลงใน {path} แล้ว',
        'toast.discardNoUndo': 'ทิ้งการเปลี่ยนแปลงใน {path} แล้ว (ใหญ่เกินกว่าจะเก็บไว้เลิกทำ)',
        'toast.restored': 'กู้คืนแล้ว',
        'undo.menu': 'ลบล่าสุด (เลิกทำ)',
        'undo.empty': 'ตอนนี้ไม่มีอะไรให้เลิกทำ',
        'undo.branch': 'แบรนช์',
        'undo.stash': 'สแตช',
        'undo.discard': 'การทิ้ง',
        'confirm.typeName': 'พิมพ์ {name} เพื่อยืนยัน',
        'confirm.protected': '{name} เป็นแบรนช์หลัก การลบมีความเสี่ยงสูง จึงให้พิมพ์ชื่อแบรนช์เพื่อยืนยัน —— จากนั้นยังกู้คืนได้ผ่านการแจ้งเตือน',
        'discard.untracked.confirm': 'ลบไฟล์ที่ไม่ถูกติดตาม {path}? เนื้อหาจะถูกลบ —— จากนั้นยังกู้คืนได้ผ่านการแจ้งเตือน',
        'stashDrop.confirm': 'ลบสแตช {ref}? จากนั้นยังกู้คืนได้ผ่านการแจ้งเตือน',
        'operation.merge': 'กำลังรวม',
        'operation.rebase': 'กำลังรีเบส',
        'operation.cherry-pick': 'กำลังเชอร์รีพิก',
        'operation.revert': 'กำลังย้อน',
        'operation.bisect': 'กำลัง bisect',
        'operation.hint': 'รีโพซิทอรีนี้ยังมีงานหลายขั้นตอนค้างอยู่ —— ทำให้เสร็จหรือยกเลิกก่อนทำการกับแบรนช์',
        'confirm.title': 'ยืนยัน',
        'confirm.cancel': 'ยกเลิก',
        'confirm.ok': 'ตกลง',
        'prompt.newBranch': 'ชื่อแบรนช์ใหม่ (สร้างและเช็กเอาต์ให้)',
        'prompt.renameBranch': 'เปลี่ยนชื่อแบรนช์',
        'prompt.newTag': 'ชื่อแท็กใหม่',
        'prompt.fromHead': 'HEAD ปัจจุบัน',
        'error.dismiss': 'ปิด',
        'status.loading': 'กำลังอ่าน...',
        'status.busy': 'กำลังทำงาน...',
        'counts.staged': 'สเตจแล้ว {n}',
        'counts.ignored': 'เพิกเฉย {n}',
        'counts.unstaged': 'การเปลี่ยนแปลง {n}',
        'counts.untracked': 'ไม่ถูกติดตาม {n}',
        'counts.conflicted': 'ความขัดแย้ง {n}',
        'push.confirm': 'พุช {branch} ไปที่ {upstream}?',
        'delete.confirm': 'ลบแบรนช์ {name}? จากนั้นยังกู้คืนได้ผ่านการแจ้งเตือน (git ยังคงปฏิเสธแบรนช์ที่ยังไม่รวม)',
        'discard.confirm': 'ทิ้งการเปลี่ยนแปลงใน {path}? เนื้อหาของเวิร์กทรีจะถูกเขียนทับ —— จากนั้นยังกู้คืนได้ผ่านการแจ้งเตือน',
        'resetHard.confirm': 'ฮาร์ดรีเซ็ตไปที่ {hash}? การเปลี่ยนแปลงที่ยังไม่คอมมิตจะหายไป',
        'resetSoft.confirm': 'ย้าย HEAD ไปที่ {hash} (เก็บเวิร์กทรีไว้)?',
        'checkoutCommit.confirm': 'เช็กเอาต์คอมมิต {hash}? (detached HEAD)',
      },
    }

    /* Resolve one locale tag against what this plugin ships: the exact tag,
       then the primary subtag, then English. Chinese is special-cased because
       the traditional variants are shipped while a bare zh-Hant-* is not
       spelled out. */
    function dictionaryFor(active) {
      const raw = active === undefined || active === null || active === '' ? 'en' : String(active)
      const tag = raw.toLowerCase().replace(/_/g, '-')
      const primary = tag.split('-')[0]
      if (primary === 'zh') {
        if (hasOwnKey(LOCALES, tag)) return LOCALES[tag]
        if (tag.indexOf('hant') >= 0 || tag === 'zh-hk' || tag === 'zh-mo' || tag === 'zh-tw') {
          return hasOwnKey(LOCALES, 'zh-hk') ? LOCALES['zh-hk'] : ZH
        }
        return ZH
      }
      if (hasOwnKey(LOCALES, primary)) return LOCALES[primary]
      return EN
    }

    function hasOwnKey(bag, key) {
      return Object.prototype.hasOwnProperty.call(bag, key)
    }

    /* The active locale tag, read fresh every time: DSH's language preference
       switches live (the host-backed preference wins over the browser), so a
       value captured once at activation would keep answering in the language
       that happened to be active when the plugin loaded. */
    function activeLocaleOf(ctx) {
      let active = ''
      try {
        const locale = ctx.get('locale')
        if (locale !== undefined && typeof locale.getSnapshot === 'function') {
          const snapshot = locale.getSnapshot()
          if (snapshot !== null && typeof snapshot === 'object' && typeof snapshot.active === 'string') active = snapshot.active
        }
      } catch (error) { void error }
      if (active === '' && typeof navigator === 'object' && navigator !== null && typeof navigator.language === 'string') active = navigator.language
      return active
    }

    function dictionaryOf(ctx) {
      return dictionaryFor(activeLocaleOf(ctx))
    }

    /* A live lookup: the dictionary is picked per call and cached under the tag
       it was picked for, so a language switch costs one string compare per
       string. Falling back to EN — which is kept key-complete on purpose —
       means an unsupported language shows English, never a raw key. */
    function translatorOf(ctx) {
      let cachedTag = null
      let cachedDict = null
      return (key) => {
        const tag = activeLocaleOf(ctx)
        if (tag !== cachedTag) { cachedTag = tag; cachedDict = dictionaryFor(tag) }
        if (hasOwnKey(cachedDict, key)) return cachedDict[key]
        return hasOwnKey(EN, key) ? EN[key] : key
      }
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
      /* View actions. The tree toggle lives here as well as in the compact header
         because a persisted treeOpen=false would otherwise have no way back:
         compact is the only chrome with a header button, and it used to render
         that button only while the tree was OPEN. */
      { id: 'tree', icon: 'branch', key: 'toolbar.tree', tone: 'secondary' },
      /* The official right-sidebar dock (float / re-dock / split / full screen).
         They only render where that service exists — see dockFaceOf(). */
      { id: 'float', icon: 'float', key: 'action.float', tone: 'accent' },
      { id: 'split', icon: 'split', key: 'action.split', tone: 'secondary' },
      { id: 'fullscreen', icon: 'fullscreen', key: 'action.fullscreen', tone: 'secondary' },
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
    /* Actions that arrange the view rather than touch the repository, so a running
       git command never greys them out. */
    const RAIL_VIEW_IDS = ['tree', 'float', 'split', 'fullscreen']
    const RAIL_DOCK_IDS = ['float', 'split', 'fullscreen']

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

    /* ---------------------------------------------------------------------
       Where the rail config LIVES. On dsh >= 0.1.7 a plugin's configuration is
       the row Config (the official settings surface, persisted by the host under
       the loader row id) and the browser reads it through ctx.configForms — so
       the settings card and the rail read ONE source and nothing is written
       twice. An older host has no such service: there the rail keeps its
       localStorage home and its in-panel editor, which is the only editor those
       hosts have. `railForm` is that switch; null means legacy.
       --------------------------------------------------------------------- */
    const RAIL_NS = 'ide-git'
    /* One write window for the settings card: a burst of switches becomes one
       atomic mutation instead of a stream the Host can lose. */
    const FLUSH_MS = 250
    const RAIL_MIGRATED_KEY = 'dsh-ide-git.rail.v1.migrated'
    let railForm = null
    let railMigrating = false
    const railWatchers = new Set()

    /* ---- rail config core (pure: tests/smoke.mjs slices this block) ---- */
    function railFieldOf(id) {
      return 'rail' + id.charAt(0).toUpperCase() + id.slice(1)
    }

    /* Stored booleans -> the { order, hidden } shape the rail has always used.
       The order is the code order now: the settings card edits one switch per
       action, so a stored permutation would have no editor left, and dropping it
       keeps this surface honest rather than half-editable. */
    function railConfigOfValues(values) {
      const source = values !== null && typeof values === 'object' ? values : {}
      const hidden = RAIL_IDS.filter((id) => source[railFieldOf(id)] === false)
      return { order: RAIL_IDS.slice(), hidden: hidden }
    }

    /* The inverse of railFieldOf, for the one-field write path. Returns null for a
       field no rail action owns, so a caller cannot invent a row-Config key. */
    function railIdOfField(field) {
      if (typeof field !== 'string' || field.indexOf('rail') !== 0 || field.length <= 4) return null
      const name = field.slice(4)
      const id = name.charAt(0).toLowerCase() + name.slice(1)
      return RAIL_IDS.indexOf(id) < 0 ? null : id
    }

    function railValuesOfConfig(config) {
      const values = {}
      for (const id of RAIL_IDS) values[railFieldOf(id)] = config.hidden.indexOf(id) < 0
      return values
    }

    /* ---- end rail config core ---- */

    /* The three AI-commit settings live in the same row Config document the
       settings card writes; the panel reads them per render, so a change in the
       card applies to the next click without a reload. */
    function readCommitSettings() {
      let values = {}
      const ready = railFormReady()
      if (ready !== null && ready.value !== null && typeof ready.value === 'object') values = ready.value
      const text = (field, max) => (typeof values[field] === 'string' ? values[field].trim().slice(0, max) : '')
      return { model: text('commitModel', 120), reasoning: text('commitReasoning', 60), prompt: text('commitPrompt', 2000) }
    }

    function railFormReady() {
      if (railForm === null) return null
      const snapshot = railForm.getSnapshot()
      if (snapshot === null || snapshot === undefined || snapshot.status !== 'ready' || snapshot.value === undefined) return null
      return snapshot
    }

    function readRailConfig() {
      const ready = railFormReady()
      if (ready !== null) return railConfigOfValues(ready.value)
      // Legacy home (and the state before the host answers): localStorage.
      try {
        const raw = window.localStorage.getItem(RAIL_KEY)
        if (raw === null || raw === '') return normalizeRail(null)
        return normalizeRail(JSON.parse(raw))
      } catch (error) { void error }
      return normalizeRail(null)
    }

    /* `form` lets a caller write through the exact handle it read from (the
       settings card gets the framework's own form); without it the module handle
       is used. When a config surface EXISTS but is not ready yet, the write is
       refused instead of silently landing in the legacy localStorage home — two
       sources would be worse than a refused edit. */
    function writeRailConfig(config, form) {
      const active = form !== undefined && form !== null && typeof form.getSnapshot === 'function' ? form : railForm
      let ready = null
      try {
        const snapshot = active === null || active === undefined ? null : active.getSnapshot()
        if (snapshot !== null && snapshot !== undefined && snapshot.status === 'ready' && snapshot.value !== undefined) ready = snapshot
      } catch (error) { void error }
      if (ready !== null) {
        if (ready.writable !== true || typeof active.set !== 'function') return
        railForm = active
        const current = ready.value !== null && typeof ready.value === 'object' ? ready.value : {}
        // Only the fields that actually changed: one write, not sixteen.
        for (const id of RAIL_IDS) {
          const field = railFieldOf(id)
          const visible = config.hidden.indexOf(id) < 0
          if (current[field] === visible) continue
          const written = active.set(field, visible)
          if (written !== undefined && written !== null && typeof written.then === 'function') {
            void written.then((accepted) => {
              if (accepted === false) console.warn('[dsh-ide-git] rail setting "' + field + '" was refused by the host')
            }, (error) => { console.warn('[dsh-ide-git] rail setting write failed: ' + String(error && error.message ? error.message : error)) })
          }
        }
        return
      }
      if (railForm !== null) return
      try { window.localStorage.setItem(RAIL_KEY, JSON.stringify(config)) } catch (error) { void error }
    }

    /* One switch, one field, one write — computed from the value the user just
       chose rather than from a whole-config snapshot that may predate the click.
       The card edits one field at a time, and a full-config write derived from a
       stale render clobbers whichever sibling was toggled a moment earlier
       (measured on 16 rapid toggles: 4 fields never reached the row Config and
       reverted on reload).
       Returns the write's disposition so the caller can roll its optimistic value
       back and say so instead of leaving a switch that lies:
         sent:true            + settled:Promise<boolean> when the Host answers
         sent:false, reason   'read-only' | 'not-ready' | 'unknown'. */
    function writeRailFields(ops, form) {
      const active = form !== undefined && form !== null && typeof form.getSnapshot === 'function' ? form : railForm
      let ready = null
      try {
        const snapshot = active === null || active === undefined ? null : active.getSnapshot()
        if (snapshot !== null && snapshot !== undefined && snapshot.status === 'ready' && snapshot.value !== undefined) ready = snapshot
      } catch (error) { void error }
      if (ready !== null) {
        if (ready.writable !== true || typeof active.mutate !== 'function') return { sent: false, reason: 'read-only' }
        railForm = active
        const settled = Promise.resolve(active.mutate(ops)).then(
          (accepted) => accepted !== false,
          (error) => {
            console.warn('[dsh-ide-git] rail setting write failed: ' + String(error && error.message ? error.message : error))
            return false
          },
        )
        return { sent: true, settled: settled }
      }
      /* A config surface that exists but has not answered yet must refuse rather
         than fall through to the legacy home: two sources would be worse. */
      if (railForm !== null) return { sent: false, reason: 'not-ready' }
      const current = readRailConfig()
      let hidden = current.hidden.slice()
      for (const op of ops) {
        const id = railIdOfField(String(op.path[0]))
        if (id === null) return { sent: false, reason: 'unknown' }
        const wanted = op.value === true
        if (wanted === true) hidden = hidden.filter((entry) => entry !== id)
        else if (hidden.indexOf(id) < 0) hidden = hidden.concat([id])
      }
      try { window.localStorage.setItem(RAIL_KEY, JSON.stringify({ order: current.order, hidden: hidden })) } catch (error) { void error }
      notifyRailConfig()
      return { sent: true }
    }

    /* One switch's write. The card batches a burst through writeRailFields so the
       Host sees one atomic mutation instead of a stream of overlapping ones. */
    function writeRailField(field, value, form) {
      return writeRailFields([{ op: 'set', path: [field], value: value }], form)
    }

    /* One-shot move of the pre-settings rail config into the row Config: read the
       legacy value ONCE, write it through, mark it done. After this the row Config
       is the only source (the legacy key is left untouched as a paper trail, but
       nothing writes it any more on this host). */
    function migrateRailConfig(form) {
      try {
        if (window.localStorage.getItem(RAIL_MIGRATED_KEY) !== null) return
        if (railMigrating === true) return
        const done = () => {
          railMigrating = false
          try { window.localStorage.setItem(RAIL_MIGRATED_KEY, '1') } catch (error) { void error }
        }
        const raw = window.localStorage.getItem(RAIL_KEY)
        if (raw === null || raw === '') { done(); return }
        const values = railValuesOfConfig(normalizeRail(JSON.parse(raw)))
        const ready = railFormReady()
        const accepted = ready !== null && ready.value !== null && typeof ready.value === 'object' ? ready.value : {}
        const ops = []
        for (const id of RAIL_IDS) {
          const field = railFieldOf(id)
          if (accepted[field] === values[field]) continue
          ops.push({ op: 'set', path: [field], value: values[field] === true })
        }
        if (ops.length === 0) { done(); return }
        /* ONE atomic mutation, and the marker ONLY once the Host accepted it.
           The per-field set() loop this replaces fired sixteen unawaited writes
           and stamped the marker right away, so on a real profile fifteen of the
           sixteen fields (and in one case all of them) never reached the row
           Config and were never retried — an upgrade silently lost the user's
           rail settings while the marker claimed success. A refusal, a failed
           write or a superseded one now leaves the marker unwritten so the next
           load migrates again. */
        railMigrating = true
        const outcome = writeRailFields(ops, form)
        if (outcome.sent !== true) {
          railMigrating = false
          console.warn('[dsh-ide-git] legacy rail migration was refused (' + String(outcome.reason) + '); it stays unmarked and is retried')
          return
        }
        if (outcome.settled === undefined) { done(); return }
        void outcome.settled.then((acceptedWrite) => {
          if (acceptedWrite === true) { done(); return }
          railMigrating = false
          console.warn('[dsh-ide-git] legacy rail migration was not accepted; it stays unmarked and is retried')
        })
      } catch (error) { void error }
    }

    function subscribeRailConfig(listener) {
      railWatchers.add(listener)
      return () => { railWatchers.delete(listener) }
    }

    function notifyRailConfig() {
      for (const listener of Array.from(railWatchers)) {
        try { listener() } catch (error) { void error }
      }
    }

    /* ============================== pane sizes ============================== */

    /* ---- pane sizing core (pure: tests/smoke.mjs slices this block and drives
       it through new Function, so it must stay free of window/DOM/React) ---- */

    /* Every fixed pane size in the layout became draggable (issue #5), and the
       result is remembered PER SURFACE. The same registration renders in the
       bottom workbench (wide and flat) and in the native right sidebar (narrow
       and tall), and a 290px changes column that is right in one is half the
       panel in the other. The bucket is therefore `chrome:wide|tall`, and what
       is stored is a RATIO of the measured container: resizing the dock or the
       window rescales the panes instead of breaking the layout. */
    const PANES_KEY = 'dsh-ide-git.panes.v1'
    const PANE_CHROME_KEYS = {
      columns: ['tree', 'changes'],
      stack: ['tree', 'changes', 'diff'],
      compact: ['tree', 'diff'],
    }
    /* Whether a key measures a height (stacked chromes) or a width (columns). */
    const PANE_HEIGHT_CHROME = { columns: false, stack: true, compact: true }
    /* The pane a separator resizes, and the key its label is translated from. */
    const PANE_NAME_KEYS = { tree: 'toolbar.tree', changes: 'changes.title', diff: 'pane.diff' }
    /* Hard limits in px: a gutter moves a pane between these and nothing else,
       so no pane can ever be dragged down to zero. */
    const PANE_LIMITS = {
      'columns:tree': { min: 140, max: 560 },
      'columns:changes': { min: 200, max: 640 },
      'stack:tree': { min: 100, max: 420 },
      'stack:changes': { min: 120, max: 460 },
      'stack:diff': { min: 120, max: 900 },
      'compact:tree': { min: 100, max: 420 },
      'compact:diff': { min: 120, max: 900 },
    }
    /* Today's fixed sizes stay the default — and stay in the stylesheet: a pane
       the user never dragged keeps exactly the look it had before, while a
       dragged one is remembered as a ratio. */
    const PANE_DEFAULTS = {
      'columns:tree': { px: 200 },
      'columns:changes': { px: 290 },
      'stack:tree': { ratio: 0.36 },
      'stack:changes': { ratio: 0.46 },
      'compact:tree': { ratio: 0.42 },
    }
    const PANE_MAIN_MIN_W = 240
    const PANE_MAIN_MIN_H = 150
    /* The reserve above is the IDEAL the clamp aims for. When the panel is simply
       too small for every default at once, aiming for it would put a pane's
       ceiling BELOW the box that pane already occupies — and the first drag would
       then shrink it instead of growing it. Below that point the middle pane
       keeps this hard floor instead, and the pane's own current size always wins
       (see paneGeometry). */
    const PANE_MAIN_FLOOR_PX = 120
    const PANE_HISTORY_MIN_H = 120
    /* Hit area of one gutter, and how many of them sit in the body. The
       history↔diff separator lives inside the middle pane, so it is not counted
       against the body's own budget. */
    const PANE_GUTTER_PX = 8
    const PANE_BODY_GUTTERS = { columns: 2, stack: 2, compact: 1 }
    const PANE_BUCKETS = Object.keys(PANE_CHROME_KEYS).reduce(
      (all, chrome) => all.concat([chrome + ':wide', chrome + ':tall']), [])

    /* Two measurements are the same when every pane they know about is. */
    function samePaneSizes(current, next) {
      const keys = Object.keys(current)
      if (keys.length !== Object.keys(next).length) return false
      for (const key of keys) { if (current[key] !== next[key]) return false }
      return true
    }

    function panBucket(chrome, box) {
      return chrome + (box.height > box.width ? ':tall' : ':wide')
    }

    /* Storage is untrusted, so this keeps normalizeRail()'s discipline: unknown
       buckets, unknown keys, non-finite numbers and out-of-range ratios are all
       dropped. A ratio is a fraction of the container, so it lives in (0, 1]. */
    function normalizePanes(raw) {
      const source = raw !== null && typeof raw === 'object' ? raw : {}
      const stored = source.panes !== null && typeof source.panes === 'object' ? source.panes : {}
      const panes = {}
      for (const bucket of PANE_BUCKETS) {
        const entry = stored[bucket]
        if (entry === null || typeof entry !== 'object') continue
        const keys = PANE_CHROME_KEYS[bucket.slice(0, bucket.indexOf(':'))]
        const clean = {}
        for (const key of keys) {
          const value = entry[key]
          if (typeof value !== 'number' || Number.isFinite(value) === false) continue
          if (value <= 0 || value > 1) continue
          clean[key] = value
        }
        if (Object.keys(clean).length > 0) panes[bucket] = clean
      }
      return { treeOpen: source.treeOpen !== false, panes: panes }
    }

    /* Immutable single-key update. ratio === null removes the override, which is
       exactly what the double-click reset does. */
    function withPaneRatio(config, bucket, key, ratio) {
      const panes = {}
      for (const name of PANE_BUCKETS) {
        if (config.panes[name] !== undefined) panes[name] = config.panes[name]
      }
      const entry = {}
      const current = panes[bucket] === undefined ? {} : panes[bucket]
      for (const name of PANE_CHROME_KEYS[bucket.slice(0, bucket.indexOf(':'))]) {
        if (current[name] !== undefined) entry[name] = current[name]
      }
      if (ratio === null) delete entry[key]
      else entry[key] = ratio
      if (Object.keys(entry).length === 0) delete panes[bucket]
      else panes[bucket] = entry
      return { treeOpen: config.treeOpen, panes: panes }
    }

    /* Stored ratios (or today's defaults) → concrete px for the current chrome,
       clamped against the measured container. `overrides` holds only the panes
       the user actually dragged (absent = leave the stylesheet default alone);
       `effective` is what the clamp math used; `limits` is the range each gutter
       is allowed to hand back. `laidOut` is what the panes actually measure right
       now, which beats the stylesheet default when a pane is content-sized: the
       stacked chrome caps the changes pane at 46%, but a three-file summary only
       takes 30%, and reserving the cap would freeze the tree above it. */
    function paneGeometry(chrome, box, config, laidOut) {
      const height = PANE_HEIGHT_CHROME[chrome] === true
      const reference = height ? box.height : box.width
      const bucket = panBucket(chrome, box)
      const ready = config !== null && typeof config === 'object'
      const source = ready && config.panes !== null && typeof config.panes === 'object' ? config.panes : {}
      const ratios = source[bucket] !== null && typeof source[bucket] === 'object' ? source[bucket] : {}
      const measured = laidOut !== null && typeof laidOut === 'object' ? laidOut : {}
      const keys = PANE_CHROME_KEYS[chrome].slice()
      /* A folded tree has no pane and no gutter, so it must not reserve room. */
      if (ready && config.treeOpen === false) {
        const at = keys.indexOf('tree')
        if (at >= 0) keys.splice(at, 1)
      }
      const overrides = {}
      const effective = {}
      const limits = {}
      const sizeOf = (key) => (effective[key] === undefined ? 0 : effective[key])
      for (const key of keys) {
        const spec = PANE_DEFAULTS[chrome + ':' + key]
        const fallback = spec === undefined ? 0 : (spec.px === undefined ? spec.ratio * reference : spec.px)
        const live = measured[key]
        effective[key] = typeof live === 'number' && Number.isFinite(live) && live > 0 ? live : fallback
      }
      const space = Math.max(0, reference - PANE_BODY_GUTTERS[chrome] * PANE_GUTTER_PX)
      const reserve = height ? PANE_MAIN_MIN_H : PANE_MAIN_MIN_W
      /* Deterministic order: changes, then tree, then diff. The diff is carved
         out of the middle pane, so it is clamped last — against whatever the
         first two left behind, minus the history list's own minimum. */
      for (const key of ['changes', 'tree', 'diff']) {
        if (keys.indexOf(key) < 0) continue
        const spec = PANE_LIMITS[chrome + ':' + key]
        const current = sizeOf(key)
        let ceiling = spec.max
        if (key === 'diff') {
          const main = space - sizeOf('changes') - sizeOf('tree') - PANE_GUTTER_PX
          ceiling = Math.min(ceiling, main - PANE_HISTORY_MIN_H)
        } else {
          let taken = 0
          for (const other of keys) { if (other !== key && other !== 'diff') taken += sizeOf(other) }
          /* Two tiers, because one number cannot serve both jobs. The IDEAL keeps
             the middle pane at its reserve — that is what a roomy panel gets. The
             relaxed tier only kicks in when the ideal would land BELOW the box
             this pane already occupies (a 674px column cannot hold 200 + 290 + 240
             at once), and it exists so the clamp degrades to "you may not grow
             much" instead of "the first drag to the right shrinks you". */
          const ideal = space - reserve - taken
          ceiling = Math.min(ceiling, current > ideal ? space - PANE_MAIN_FLOOR_PX - taken : ideal)
        }
        /* The clamp may refuse to GROW a pane; it may never shrink one the user
           did not touch — so the ceiling is never below the pane's current box,
           and the aria window says exactly that. */
        const cap = Math.max(spec.max, Math.round(current))
        const high = Math.min(cap, Math.max(spec.min, Math.round(ceiling), Math.round(current)))
        limits[key] = { min: spec.min, max: high }
        const ratio = ratios[key]
        if (typeof ratio === 'number' && Number.isFinite(ratio)) {
          const px = Math.round(Math.min(Math.max(ratio * reference, spec.min), high))
          overrides[key] = px
          effective[key] = px
        }
      }
      return { bucket: bucket, overrides: overrides, effective: effective, limits: limits }
    }
    /* ---- end pane sizing core ---- */

    function readPanes() {
      try {
        const raw = window.localStorage.getItem(PANES_KEY)
        if (raw === null || raw === '') return normalizePanes(null)
        return normalizePanes(JSON.parse(raw))
      } catch (error) { void error }
      return normalizePanes(null)
    }

    function writePanes(config) {
      try { window.localStorage.setItem(PANES_KEY, JSON.stringify(normalizePanes(config))) } catch (error) { void error }
    }

    /* ============================== dock actions ============================== */

    /* ---- dock action core (pure: tests/smoke.mjs slices this block) ---- */

    /* The official right sidebar (ui-sidebar-right) is the only surface that can
       float a tab out, dock it back, split its pane or take it full screen, and it
       is NOT there on every host: with dsh-better-sidebar loaded this panel lives
       in THAT dock, an old host has no sidebarRight at all, and even on a host that
       ships it the service is only provided once ui-sidebar-right has mounted —
       reading it during apply() returns undefined (measured on 0.1.7-rc.2). So the
       service is read at render time, and a missing one means these actions do not
       exist for this mount: no button, no error, no console noise. */
    function dockFaceOf(ctx) {
      if (ctx === null || ctx === undefined || typeof ctx.get !== 'function') return null
      let service
      try { service = ctx.get('sidebarRight') } catch (error) { return null }
      if (service === null || service === undefined || typeof service !== 'object') return null
      if (typeof service.float !== 'function' || typeof service.dock !== 'function') return null
      return service
    }

    /* What this mount can offer. `dock` is the wiring handed down to the panel
       (null when nothing is wired, e.g. the better-sidebar door), `floatPaneId` is
       the floating pane the panel is currently drawn in, read from the float
       layer's own marker. The face publishes operations only — no layout snapshot —
       so the float state has to come from there. */
    function dockActionState(dock, floatPaneId) {
      const wired = dock !== null && typeof dock === 'object' && typeof dock.tabId === 'string'
        && dock.tabId !== '' && dock.service !== null && typeof dock.service === 'object'
      const floating = typeof floatPaneId === 'string' && floatPaneId !== ''
      return {
        wired: wired,
        floating: floating,
        float: wired,
        /* A float panel hosts exactly one tab: splitting it is not a thing. */
        split: wired && floating === false,
        fullscreen: wired && typeof dock.service.toggleFullscreen === 'function',
      }
    }
    /* ---- end dock action core ---- */

    /* The slot hands every tab body its own reader; it THROWS while the tab is not
       committed in the session, so an unreadable tab means no dock actions rather
       than a broken panel. Called from the component that owns the hook. */
    function readDockInfo(useTabInfo, ctx) {
      if (typeof useTabInfo !== 'function') return null
      const service = dockFaceOf(ctx)
      if (service === null) return null
      let info = null
      try { info = useTabInfo() } catch (error) { void error }
      if (info === null || typeof info !== 'object' || info.tab === undefined || info.panel === undefined) return null
      if (typeof info.tab.id !== 'string') return null
      return {
        service: service,
        tabId: info.tab.id,
        paneId: typeof info.panel.id === 'string' ? info.panel.id : '',
        fullscreen: info.sidebar !== undefined && info.sidebar !== null && info.sidebar.fullscreen === true,
      }
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
      /* The log is a WINDOW: the oldest visible commits usually have parents
         that were never loaded. A parent outside the window must not park its
         hash on a lane — the lane would stay occupied for the rest of the
         page (the hash can never be consumed), every later branch tip would
         claim yet another fresh lane, and the drawing degenerated into a
         bundle of independent parallel lines that pushed the subjects out of
         the panel. So the pass first learns which hashes are actually on the
         board, and an edge to anything else simply ends at its commit. */
      const present = new Set()
      for (const commit of commits) present.add(commit.hash)
      const lanes = []
      /* The current branch keeps the LEFTMOST column whenever it is on the
         board: pre-seeding its hash makes that commit claim lane 0 when its
         row arrives, so HEAD's line never drifts to the right of a side
         branch (the rest of the lanes fill newest-first, see below). */
      const headCommit = commits.find((commit) => Array.isArray(commit.refs) && commit.refs.some((ref) => String(ref).indexOf('HEAD') >= 0))
      if (headCommit !== undefined) lanes.push(headCommit.hash)
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
        /* A commit whose parent already sits on ANOTHER lane merges into it:
           its own lane ends here and the edge is drawn across. Until v0.4.1 the
           first parent was parked on the commit's own lane unconditionally, so
           a branch that merged back into a lane to its left kept a stub of its
           own colour running on above the junction — a fork that never
           happened. Only a parent that is not on the board yet inherits the
           lane, and (v0.5.4) only a parent that is on the board at all: a
           parent past the loaded window ends the lane at this row instead of
           holding it for a commit that will never arrive. */
        if (parents.length > 0) {
          const first = lanes.indexOf(parents[0])
          if (first !== -1 && first !== lane) {
            lanes[lane] = null
            parentLanes.push(first)
          } else if (present.has(parents[0])) {
            lanes[lane] = parents[0]
          } else {
            lanes[lane] = null
          }
        } else {
          lanes[lane] = null
        }
        for (let index = 1; index < parents.length; index += 1) {
          const parent = parents[index]
          if (!present.has(parent)) continue
          let slot = lanes.indexOf(parent)
          if (slot === -1) {
            slot = lanes.indexOf(null)
            if (slot === -1) { lanes.push(parent); slot = lanes.length - 1 }
            else lanes[slot] = parent
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
    /* Vertical lane segments for one row. A lane that this row OPENS through an
       edge curve (it was empty above, and the curve lands at the row bottom) must
       NOT also get a vertical segment from the row centre: the two overlapped and
       left a floating hook where the line visibly started in mid-air — reported
       twice by the user as "断开的线/无端点的分叉". The curve alone carries the
       connection, and the next row's segment starts at its top edge. */
    function laneSegments(row, height) {
      const middle = height / 2
      const depth = Math.max(row.before.length, row.after.length)
      const segments = []
      for (let lane = 0; lane < depth; lane += 1) {
        const above = lane < row.before.length ? row.before[lane] : null
        const below = lane < row.after.length ? row.after[lane] : null
        const hasTop = above !== null && above !== undefined
        const hasBottom = below !== null && below !== undefined
        if (hasTop === false && hasBottom === false) continue
        if (hasTop === false && row.parentLanes.indexOf(lane) >= 0) continue
        const y1 = hasTop ? 0 : middle
        const y2 = hasBottom ? height : middle
        if (y1 === y2) continue
        segments.push({ lane: lane, y1: y1, y2: y2 })
      }
      return segments
    }

    function GraphCell(props) {
      const row = props.row
      const height = props.height
      const width = Math.min(Math.max(1, row.width), GRAPH_MAX_LANES) * LANE_WIDTH + 8
      const middle = height / 2
      const children = []
      /* Lanes beyond the cap share the last column: the geometry stays bounded
         and the subject column keeps its room. */
      const x = (lane) => 8 + Math.min(lane, GRAPH_MAX_LANES - 1) * LANE_WIDTH
      const color = (lane) => LANE_COLORS[lane % LANE_COLORS.length]
      for (const segment of laneSegments(row, height)) {
        children.push(E('line', {
          key: 'lane-' + segment.lane,
          x1: x(segment.lane), y1: segment.y1, x2: x(segment.lane), y2: segment.y2,
          stroke: color(segment.lane), strokeWidth: 2, strokeLinecap: 'round',
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
      // pull mirrors push: arrow INTO the local side (down) with the rail on top,
      // where fetch keeps its arrow against the bottom rail. Both used to point up,
      // so pull read as "push" in the rail (reported on v0.3.9).
      pull: ['M8 3v8', 'M4.5 7.5 8 11l3.5-3.5', 'M3 2h10'],
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
      // A real gear: the toothed contour plus the centre hole, borrowed from the
      // official product icon set (ui-primitives IconSettingsOutlineMedium, same
      // 16x16 grid and currentColor stroke) because the previous entry was a
      // centre dot with eight rays — a sunburst, not a settings control.
      settings: ['M13.0107 7.79377C12.9505 7.89401 12.9205 7.94413 12.9205 7.99951C12.9205 8.0549 12.9505 8.10502 13.0106 8.20528L13.9849 9.83006C14.045 9.93029 14.0751 9.9804 14.0751 10.0358C14.0751 10.0911 14.045 10.1413 13.9849 10.2415L13.0037 11.8777C12.9468 11.9726 12.9184 12.0201 12.8725 12.0461C12.8267 12.072 12.7713 12.072 12.6607 12.072H10.6704C10.5598 12.072 10.5045 12.072 10.4586 12.098C10.4128 12.1239 10.3843 12.1714 10.3274 12.2662L9.33825 13.9142C9.28133 14.009 9.25287 14.0564 9.20703 14.0823C9.16118 14.1083 9.10588 14.1083 8.99529 14.1083H7.00486C6.89426 14.1083 6.83896 14.1083 6.79312 14.0823C6.74727 14.0564 6.71881 14.009 6.6619 13.9142L5.67273 12.2662C5.61581 12.1714 5.58735 12.1239 5.54151 12.098C5.49566 12.072 5.44036 12.072 5.32977 12.072H3.33945C3.2288 12.072 3.17347 12.072 3.12761 12.0461C3.08176 12.0201 3.0533 11.9726 2.9964 11.8777L2.0152 10.2415C1.9551 10.1413 1.92505 10.0911 1.92505 10.0358C1.92505 9.9804 1.9551 9.93029 2.0152 9.83006L2.98951 8.20528C3.04963 8.10502 3.07969 8.0549 3.07969 7.99951C3.07968 7.94413 3.04961 7.89401 2.98946 7.79377L2.01529 6.17011C1.95514 6.06987 1.92507 6.01975 1.92507 5.96437C1.92506 5.90899 1.95512 5.85886 2.01524 5.7586L2.9964 4.1224C3.0533 4.0275 3.08176 3.98005 3.12761 3.95408C3.17347 3.92811 3.2288 3.92811 3.33945 3.92811H5.32977C5.44036 3.92811 5.49566 3.92811 5.54151 3.90216C5.58735 3.87621 5.61581 3.82879 5.67273 3.73397L6.6619 2.08599C6.71881 1.99116 6.74727 1.94375 6.79312 1.9178C6.83896 1.89185 6.89426 1.89185 7.00486 1.89185H8.99529C9.10588 1.89185 9.16118 1.89185 9.20703 1.9178C9.25287 1.94375 9.28133 1.99116 9.33825 2.08599L10.3274 3.73397C10.3843 3.82879 10.4128 3.87621 10.4586 3.90216C10.5045 3.92811 10.5598 3.92811 10.6704 3.92811H12.6607C12.7713 3.92811 12.8267 3.92811 12.8725 3.95408C12.9184 3.98005 12.9468 4.0275 13.0037 4.1224L13.9849 5.7586C14.045 5.85886 14.0751 5.90899 14.0751 5.96437C14.0751 6.01975 14.045 6.06987 13.9849 6.17011L13.0107 7.79377Z', 'M8 9.75012C8.9665 9.75012 9.75 8.96662 9.75 8.00012C9.75 7.03362 8.9665 6.25012 8 6.25012C7.0335 6.25012 6.25 7.03362 6.25 8.00012C6.25 8.96662 7.0335 9.75012 8 9.75012Z'],
      more: ['M3.6 8h0.01', 'M8 8h0.01', 'M12.4 8h0.01'],
      eye: ['M1.5 8S4.1 3.8 8 3.8 14.5 8 14.5 8 11.9 12.2 8 12.2 1.5 8 1.5 8Z', 'M8 6.5a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3Z'],
      eyeOff: ['M1.6 8S4.2 4 8 4c1 0 1.9.2 2.7.6', 'M13 5.6c.9 1.1 1.5 2.4 1.5 2.4S11.9 12 8 12c-.9 0-1.7-.2-2.4-.5', 'M2.6 2.6l10.8 10.8'],
      up: ['M8 12.6V3.6', 'M4.6 7 8 3.6 11.4 7'],
      down: ['M8 3.4v9', 'M4.6 9 8 12.4 11.4 9'],
      grip: ['M5.6 4.6h4.8', 'M5.6 8h4.8', 'M5.6 11.4h4.8'],
      filter: ['M2 3.6h12l-4.6 5.2v4.2l-2.8-1.4V8.8z'],
      check: ['M3.2 8.4 6.4 11.6 12.8 4.6'],
      // dock actions (official right sidebar): lift a panel out, drop it back into
      // the dock, split the pane, and the full-screen pair reuses expand/collapse.
      float: ['M2.5 6.5v7h7v-3', 'M6 10 13.2 2.8', 'M9.4 2.8h3.8v3.8'],
      dock: ['M2.5 3h11v10h-11z', 'M8 5.2v5.6', 'M5.4 8.2 8 10.8l2.6-2.6'],
      split: ['M2.5 3h11v10h-11z', 'M8 3v10'],
      expand: ['M4.5 6.2 8 9.7l3.5-3.5', 'M3 12.4h10'],
      collapse: ['M4.5 9.8 8 6.3l3.5 3.5', 'M3 3.6h10'],
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
      /* Two boxes on purpose (dsh 0.1.7-rc.2 menu-material contract): the outer
         card owns the material (a `::before` painted on its own layer, so the
         backdrop filter never becomes the containing block or backdrop root of
         the rows) and the inner box owns the scroll. `data-menu-material` is the
         theme's hook for the dark-menu stroke rebind — the same hook the shipped
         MenuSurface sets. The card must stay a plain `position: absolute` box
         inside `.dig-root`: panel-internal positioning is an invariant (13), and
         a portal to `document.body` would land outside the panel. */
      return E('div', {
        className: 'dig-menu', ref: ref, 'data-menu-material': 'translucent',
        style: { left: position.left + 'px', top: position.top + 'px' },
      },
        E('div', { className: 'dig-menu-scroll' },
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
                // The row keeps its id on the DOM so a `⋯ 更多` entry is addressable
                // (the rail's own buttons do the same; probes click through either).
                'data-action': item.id === undefined ? undefined : item.id,
                disabled: item.disabled === true,
                onClick: (event) => { closeRef.current(); item.run(event) },
              },
              item.icon === undefined ? null : E('span', { className: 'dig-menu-icon dig-tone-' + (item.tone === undefined ? 'secondary' : item.tone) }, E(Icon, { name: item.icon, size: 13 })),
              E('span', { className: 'dig-menu-label' }, item.label))))))
    }

    /* Lets the user choose which actions the rail shows and in which order. The
       list is drag-sortable and arrow-sortable (the arrows also work with a
       keyboard); visibility is a per-action toggle, not a delete, so a hidden
       action keeps its position. */
    /* The plugin's settings card. It is the SAME surface on the plugin's detail
       page (slot `plugins.bundle.config`, keyed by the PACKAGE name) and in
       Settings → Plugins (slot `settings.plugin.item`, keyed by the settings
       namespace = the loader row id), and it is the only editor when the host
       serves the row Config — the in-panel editor is not reachable there.

       A host without that service still renders the card (the seat exists), so it
       says so instead of pretending to have settings. */
    function RailSettingsCard(props) {
      const t = props.t
      const [tick, setTick] = useState(0)
      const [pending, setPending] = useState({})
      const [note, setNote] = useState('')
      /* The three AI-commit settings are free text, so they are drafted locally
         and written on blur / Enter — one write per edit, never one per keystroke. */
      const [textDraft, setTextDraft] = useState({})
      /* The user's latest intent per field, written SYNCHRONOUSLY. React state is
         not enough: two clicks inside one frame would both read the pre-click
         snapshot, so the second click recomputed the same target and the toggle
         was lost (measured: a fast double click on one switch netted one step
         instead of returning to where it started). */
      const intent = useRef({})
      const timers = useRef(new Set())
      const dirty = useRef(new Map())
      const pendingFlush = useRef(null)
      const bump = () => setTick((value) => value + 1)
      /* Writes the Host answers ok for can still be lost when several overlap its
         persist cycle: measured on this surface, 16 switches toggled 55ms apart
         left 3 fields at their old value in the row Config while every request
         answered 200, and the same 16 at 500ms apart all landed. So a switch is
         only "done" when the accepted document agrees — checked once after the
         burst settles, re-issued once, and otherwise rolled back and reported. */
      const reconcile = (field, want, attempt) => {
        const timer = setTimeout(() => {
          timers.current.delete(timer)
          let hostValue
          try {
            const snapshot = scope === null || scope === undefined ? null : scope.getSnapshot()
            hostValue = snapshot !== null && snapshot !== undefined && snapshot.value !== null && typeof snapshot.value === 'object' ? snapshot.value[field] : undefined
          } catch (error) { hostValue = undefined }
          if (hostValue === want) return
          if (attempt === 0) {
            const again = writeRailField(field, want, scope)
            if (again.sent === true) {
              if (again.settled !== undefined) void again.settled.then(() => { reconcile(field, want, 1) })
              else reconcile(field, want, 1)
              return
            }
          }
          delete intent.current[field]
          setPending((now) => { const copy = Object.assign({}, now); delete copy[field]; return copy })
          setNote(t('settings.rail.writeFailed'))
        }, 600)
        timers.current.add(timer)
      }
      const rollbackFields = (fields) => {
        for (const field of fields) {
          delete intent.current[field]
          setPending((now) => { const copy = Object.assign({}, now); delete copy[field]; return copy })
        }
      }
      /* One atomic mutation for the whole burst. Sixteen separate writes 55ms
         apart lost 3 fields inside the Host's persist cycle while every request
         answered 200 (the same sixteen 500ms apart all landed), so the fix is to
         stop producing a burst: collect the fields the user touched and submit
         them together, at most one mutation per window. */
      const commitTextField = (field, max) => {
        const accepted = values[field] === undefined || values[field] === null ? '' : String(values[field])
        const shown = Object.prototype.hasOwnProperty.call(textDraft, field) ? textDraft[field] : accepted
        const wanted = shown.slice(0, max)
        if (wanted === accepted) return
        const outcome = writeRailFields([{ op: 'set', path: [field], value: wanted }], scope)
        if (outcome.sent !== true) {
          setNote(t(outcome.reason === 'read-only' ? 'settings.rail.readonly' : 'settings.rail.writeFailed'))
          return
        }
        if (outcome.settled === undefined) return
        void outcome.settled.then((ok) => {
          if (ok !== true) { setNote(t('settings.rail.writeFailed')); return }
          /* The accepted document now carries it: drop the draft so the control
             shows the Host's own value again. */
          setTextDraft((now) => { const copy = Object.assign({}, now); delete copy[field]; return copy })
        })
      }
      const textRow = (field, labelKey, hintKey, max, multiline) => {
        const accepted = values[field] === undefined || values[field] === null ? '' : String(values[field])
        const shown = Object.prototype.hasOwnProperty.call(textDraft, field) ? textDraft[field] : accepted
        const id = 'dig-' + field
        const common = {
          id: id, className: 'dig-input dig-settings-input', value: shown, spellCheck: false,
          disabled: readOnly === true, placeholder: t(hintKey), 'aria-labelledby': id + '-label',
          onChange: (event) => setTextDraft((now) => Object.assign({}, now, { [field]: event.target.value })),
          onBlur: () => commitTextField(field, max),
        }
        if (multiline === true) common.onKeyDown = (event) => { if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) commitTextField(field, max) }
        else common.onKeyDown = (event) => { if (event.key === 'Enter') commitTextField(field, max) }
        return E('div', { className: 'dig-settings-text', key: field },
          E('label', { id: id + '-label', className: 'dig-settings-text-label', htmlFor: id }, t(labelKey)),
          multiline === true ? E('textarea', Object.assign({ rows: 3 }, common)) : E('input', Object.assign({ type: 'text' }, common)),
          shown.length >= max ? E('div', { className: 'dig-settings-error' }, fill(t('settings.commit.tooLong'), { n: String(max) })) : null)
      }
      const flush = () => {
        pendingFlush.current = null
        /* The pending TARGET per field, not "whatever the render-time intent
           happens to hold now": the accepted document can already agree with the
           user's new value, which clears the optimistic intent before this flush
           runs — reading it here would then submit the opposite of the click and
           write the switch back to the wrong state. */
        const targets = new Map(dirty.current)
        dirty.current.clear()
        const fields = Array.from(targets.keys())
        if (fields.length === 0) return
        const ops = fields.map((field) => ({ op: 'set', path: [field], value: targets.get(field) === true }))
        const outcome = writeRailFields(ops, scope)
        if (outcome.sent !== true) {
          rollbackFields(fields)
          setNote(t(outcome.reason === 'read-only' ? 'settings.rail.readonly' : 'settings.rail.writeFailed'))
          return
        }
        if (outcome.settled === undefined) return
        void outcome.settled.then((accepted) => {
          if (accepted !== true) {
            rollbackFields(fields)
            setNote(t('settings.rail.writeFailed'))
            return
          }
          for (const field of fields) reconcile(field, targets.get(field) === true, 0)
        })
      }
      const scheduleFlush = () => {
        if (pendingFlush.current !== null) return
        pendingFlush.current = setTimeout(() => { pendingFlush.current = null; flush() }, FLUSH_MS)
        timers.current.add(pendingFlush.current)
      }
      /* Two handles, one document: the slot hands the card the framework's own
         form for this entry (`props.scope`), and our ctx.configForms handle is the
         fallback — both address the same namespace, so a write through either is
         the same row Config write. */
      const scope = props.scope !== undefined && props.scope !== null && typeof props.scope.getSnapshot === 'function'
        ? props.scope
        : railForm
      useEffect(() => {
        const offRail = subscribeRailConfig(bump)
        let offScope
        if (scope !== null && scope !== undefined && typeof scope.subscribe === 'function') {
          const unsubscribe = scope.subscribe(bump)
          if (typeof unsubscribe === 'function') offScope = unsubscribe
        }
        return () => {
          offRail()
          if (offScope !== undefined) offScope()
          for (const timer of Array.from(timers.current)) clearTimeout(timer)
          timers.current.clear()
        }
      }, [])
      void tick
      const head = E('div', { className: 'dig-settings-head' },
        E('div', { className: 'dig-settings-title' }, t('settings.rail.title')),
        E('div', { className: 'dig-settings-hint' }, t('settings.rail.hint')))
      let snapshot = null
      try { snapshot = scope === null || scope === undefined ? null : scope.getSnapshot() } catch (error) { void error }
      const status = snapshot === null || snapshot === undefined || typeof snapshot.status !== 'string' ? 'absent' : snapshot.status
      const values = snapshot !== null && snapshot !== undefined && snapshot.value !== null && typeof snapshot.value === 'object' ? snapshot.value : null
      // Drop optimistic values the host has since confirmed (post-commit effect).
      useEffect(() => {
        setPending((current) => {
          const keys = Object.keys(current)
          if (keys.length === 0 || values === null) return current
          const next = {}
          let changed = false
          for (const key of keys) {
            if (values[key] === current[key]) {
              changed = true
              /* The accepted document agrees: this intent is no longer pending.
                 Deleting twice is harmless, so a re-invoked updater stays safe. */
              delete intent.current[key]
              continue
            }
            next[key] = current[key]
          }
          return changed ? next : current
        })
      })
      // Switches exist only where they can actually write: a host that does not
      // serve this entry's settings gets a sentence instead of dead controls.
      if (status !== 'ready' || values === null) {
        return E('div', { className: 'dig-settings', 'data-settings-status': status }, head,
          E('div', { className: 'dig-settings-note' }, t('settings.rail.unavailable')))
      }
      const config = railConfigOfValues(values)
      /* A toggle is a host round trip, so the switch would snap back to the old
         value for a moment and read as "stuck". The optimistic value wins until
         the accepted document agrees with it (then it is dropped). */
      const shown = (spec) => {
        const field = railFieldOf(spec.id)
        if (Object.prototype.hasOwnProperty.call(intent.current, field)) return intent.current[field]
        return config.hidden.indexOf(spec.id) < 0
      }
      /* A host that serves the document but refuses writes gets disabled switches
         and a sentence, not controls that silently do nothing. */
      const readOnly = snapshot.writable !== true
      return E('div', { className: 'dig-settings', 'data-settings-status': status, 'data-settings-readonly': readOnly === true ? 'true' : 'false' }, head,
        E('div', { className: readOnly === true ? 'dig-settings-note' : 'dig-settings-note dig-settings-note-hidden', 'data-settings-readonly-note': '' }, t('settings.rail.readonly')),
        note === '' ? null : E('div', { className: 'dig-settings-error', 'data-settings-error': '' }, note),
        E('div', { className: 'dig-settings-list' }, RAIL_SPECS.map((spec) => {
          const inputId = 'dig-rail-' + spec.id
          const visible = shown(spec)
          /* A row, not a <label>: a label that both carries htmlFor and wraps its
             own input toggles twice per click (once for the input, once for the
             label activation), which reads as a stuck switch and writes twice. */
          const toggle = (event) => {
            if (readOnly === true) { setNote(t('settings.rail.readonly')); return }
            const field = railFieldOf(spec.id)
            /* The control's own answer when the browser gives it to us: a click that
               lands while the previous one is still rendering would otherwise
               compose from the pre-click snapshot and be lost (measured: a fast
               double click netted one step instead of returning to its start). The
               row's label span is not a control, so it falls back to the
               synchronous intent — never to the render snapshot alone. */
            const fromControl = event !== undefined && event !== null && event.target !== null
              && event.target !== undefined && typeof event.target.checked === 'boolean'
              ? event.target.checked
              : null
            /* The control already holds the state the user just asked for, so it is
               the TARGET — inverting it here would write the opposite of the click.
               Without a control (the row's label span) the target is the inverse of
               the current intent, falling back to the accepted document. */
            const wanted = fromControl !== null
              ? fromControl
              : (Object.prototype.hasOwnProperty.call(intent.current, field)
                ? intent.current[field] !== true
                : config.hidden.indexOf(spec.id) < 0 !== true)
            intent.current[field] = wanted
            dirty.current.set(field, wanted)
            setPending((now) => Object.assign({}, now, { [field]: wanted }))
            setNote('')
            bump()
            scheduleFlush()
          }
          return E('div', { key: spec.id, className: 'dig-settings-row', 'data-rail-action': spec.id },
            E('input', {
              id: inputId,
              type: 'checkbox',
              className: 'dig-settings-check',
              'aria-labelledby': inputId + '-label',
              checked: visible,
              disabled: readOnly === true,
              onChange: toggle,
            }),
            E('span', { className: 'dig-settings-glyph' }, E(Icon, { name: spec.icon, size: 13 })),
            E('span', { id: inputId + '-label', className: 'dig-settings-label', onClick: toggle }, t(spec.key)))
        })),
        E('div', { className: 'dig-settings-sub' }, t('settings.commit.title')),
        textRow('commitModel', 'settings.commit.model', 'settings.commit.modelHint', 120, false),
        textRow('commitReasoning', 'settings.commit.reasoning', 'settings.commit.reasoningHint', 60, false),
        textRow('commitPrompt', 'settings.commit.prompt', 'settings.commit.promptHint', 2000, true))
    }

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

    /* Transient result chips, anchored inside the panel (see ContextMenu for why
       nothing here is position:fixed). A toast can carry one action — currently
       'undo', which is how a real delete is still reversible. */
    function ToastStack(props) {
      if (props.toasts.length === 0) return null
      return E('div', { className: 'dig-toasts' }, props.toasts.map((item) => E('div', {
        key: item.id,
        className: 'dig-toast' + (item.tone === undefined ? '' : ' dig-toast-' + item.tone),
      },
        E('span', { className: 'dig-toast-icon' }, E(Icon, { name: item.icon === undefined ? 'check' : item.icon, size: 13 })),
        E('span', { className: 'dig-toast-text', title: item.text }, item.text),
        item.actionLabel === undefined ? null : E('button', {
          type: 'button', className: 'dig-toast-action', onClick: () => item.onAction(),
        }, item.actionLabel),
        E('button', {
          type: 'button', className: 'dig-icon-btn dig-icon-btn-small',
          title: props.t('toast.close'), onClick: () => item.onClose(),
        }, E(Icon, { name: 'close', size: 11 })))))
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

    /* A destructive confirm: focus starts on Cancel (never on the red button), Enter
       only submits when the dialog asked for a typed confirmation, and passing
       requireText turns the dialog into a type-the-name gate. */
    function ConfirmDialog(props) {
      const t = props.t
      const [typed, setTyped] = useState('')
      const cancelRef = useRef(null)
      const needText = typeof props.requireText === 'string' && props.requireText !== ''
      const matches = needText === false || typed.trim() === props.requireText
      useEffect(() => { if (cancelRef.current !== null) cancelRef.current.focus() }, [])
      return E('div', { className: 'dig-overlay' },
        E('div', { className: 'dig-dialog' },
          E('div', { className: 'dig-dialog-title' }, props.title),
          E('div', { className: 'dig-dialog-text' }, props.text),
          needText === false ? null : E('input', {
            className: 'dig-input', value: typed, spellCheck: false,
            placeholder: fill(t('confirm.typeName'), { name: props.requireText }),
            onChange: (event) => setTyped(event.target.value),
            onKeyDown: (event) => { if (event.key === 'Enter' && matches === true) props.onConfirm() },
          }),
          E('div', { className: 'dig-dialog-actions' },
            E('button', { ref: cancelRef, type: 'button', className: 'dig-btn', onClick: props.onCancel }, props.cancelLabel),
            E('button', { type: 'button', className: 'dig-btn dig-btn-danger', disabled: matches === false, onClick: props.onConfirm }, props.okLabel))))
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

    /* A draggable divider between two panes. The pane it resizes is the sibling
       it is rendered against, and its size is MEASURED at pointerdown — so a pane
       still living on its stylesheet default (a percentage cap, or a diff pane
       sized by its own content) drags from exactly where it looks. Pointer capture
       keeps the drag alive once the pointer leaves the 8px hit area, and
       touch-action:none is what stops a phone from scrolling the panel instead of
       resizing it. Arrow keys nudge (Shift = 4x), double-click resets, and the
       whole thing is focusable so the divider is reachable without a mouse. */
    function Gutter(props) {
      const dragRef = useRef(null)
      const targetOf = (node) => (props.side === 'next' ? node.nextElementSibling : node.previousElementSibling)
      const extentOf = (node) => {
        if (node === null || typeof node.getBoundingClientRect !== 'function') return 0
        const rect = node.getBoundingClientRect()
        return props.vertical === true ? rect.width : rect.height
      }
      const sign = props.side === 'next' ? -1 : 1
      const onPointerDown = (event) => {
        if (event.button !== undefined && event.button !== 0) return
        dragRef.current = {
          id: event.pointerId,
          at: props.vertical === true ? event.clientX : event.clientY,
          size: extentOf(targetOf(event.currentTarget)),
        }
        if (typeof event.currentTarget.setPointerCapture === 'function') event.currentTarget.setPointerCapture(event.pointerId)
        if (typeof event.currentTarget.focus === 'function') event.currentTarget.focus()
        props.onStart()
      }
      const onPointerMove = (event) => {
        const drag = dragRef.current
        if (drag === null || drag.id !== event.pointerId) return
        const at = props.vertical === true ? event.clientX : event.clientY
        props.onDrag(drag.size + sign * (at - drag.at))
      }
      const onPointerUp = () => {
        if (dragRef.current === null) return
        dragRef.current = null
        props.onEnd()
      }
      const onKeyDown = (event) => {
        const step = event.shiftKey === true ? 32 : 8
        const axis = props.vertical === true
          ? (event.key === 'ArrowLeft' ? -1 : event.key === 'ArrowRight' ? 1 : 0)
          : (event.key === 'ArrowUp' ? -1 : event.key === 'ArrowDown' ? 1 : 0)
        if (axis === 0) return
        event.preventDefault()
        props.onDrag(extentOf(targetOf(event.currentTarget)) + sign * axis * step)
        props.onEnd()
      }
      const label = fill(props.t('pane.resize'), { name: props.t(props.nameKey) })
      return E('div', {
        className: 'dig-gutter ' + (props.vertical === true ? 'dig-gutter-v' : 'dig-gutter-h')
          + (props.active === true ? ' dig-gutter-active' : ''),
        role: 'separator',
        tabIndex: 0,
        'aria-orientation': props.vertical === true ? 'vertical' : 'horizontal',
        'aria-label': label,
        'aria-valuenow': props.value,
        'aria-valuemin': props.min,
        'aria-valuemax': props.max,
        title: label,
        onPointerDown: onPointerDown,
        onPointerMove: onPointerMove,
        onPointerUp: onPointerUp,
        onPointerCancel: onPointerUp,
        onLostPointerCapture: onPointerUp,
        onDoubleClick: () => props.onReset(),
        onKeyDown: onKeyDown,
      })
    }

    function RepoSelect(props) {
      const t = props.t
      /* While the workspace is still being scanned the panel used to print "no
         repository found" — a verdict nobody had reached yet. A deep workspace
         scan takes seconds, so that premature verdict sat on screen long enough
         to look like the final answer. Loading shows loading; "not found" only
         shows once the scan came back empty. */
      if (props.loading === true) {
        return E('span', { className: 'dig-repo-static' },
          E(Icon, { name: 'folder', size: 12 }),
          E('span', { className: 'dig-repo-name' }, t('status.loading')))
      }
      if (props.repos.length <= 1) {
        const only = props.repos.length === 1 ? props.repos[0] : null
        return E('span', { className: 'dig-repo-static', title: only === null ? '' : only.path },
          E(Icon, { name: 'folder', size: 12 }),
          E('span', { className: 'dig-repo-name' }, only === null ? t('repo.empty') : only.name))
      }
      /* The switcher is a button over a panel-internal menu, not a native
         <select>: the OS-drawn popup ignores the panel theme entirely (light
         system colours over a dark translucent panel) and was unreadable. */
      let current = null
      for (const repo of props.repos) { if (repo.path === props.value) { current = repo; break } }
      return E('span', { className: 'dig-select-wrap', title: t('repo.switch') },
        E(Icon, { name: 'folder', size: 12 }),
        E('button', {
          type: 'button',
          className: 'dig-select dig-select-btn dig-select-repo',
          onClick: props.onOpenMenu,
        },
          E('span', { className: 'dig-repo-name' },
            current === null ? t('repo.pick') : current.name + (current.branch === null || current.branch === undefined ? '' : ' · ' + current.branch)),
          E(Icon, { name: 'chevron', size: 12 })))
    }

    /* The history filters were the LAST native <select>s: their popup is drawn
       by the OS, so a dark translucent panel still got a light system list —
       reported on v0.5.4 ("only the one at the top was replaced"). Same
       treatment as the header switchers: a button over a panel-internal menu. */
    function FilterSelect(props) {
      const options = Array.isArray(props.options) ? props.options : []
      let current = options[0]
      for (const option of options) { if (option.value === props.value) { current = option; break } }
      const label = props.label + ': ' + (current === undefined ? '' : current.label)
      return E('button', {
        type: 'button',
        className: 'dig-filter-select' + (props.value === '' ? '' : ' dig-filter-on'),
        title: props.hint === undefined ? label : props.hint,
        onClick: (event) => { if (props.onOpenMenu !== undefined) props.onOpenMenu(event, options) },
      },
        E('span', { className: 'dig-filter-label' }, label),
        E(Icon, { name: 'chevron', size: 11 }))
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
      const t = props.t
      const entry = props.entry
      const isHead = entry.head === true
      const kind = entry.tag === true ? 'tag' : entry.remote === true ? 'remote' : isHead ? 'head' : 'local'
      const tone = kind === 'tag' ? 'warn' : kind === 'remote' ? 'violet' : kind === 'head' ? 'success' : 'accent'
      const glyph = kind === 'tag' ? 'tag' : kind === 'remote' ? 'fetch' : kind === 'head' ? 'star' : 'branch'
      const where = entry.upstream === null || entry.upstream === undefined ? entry.name : entry.name + ' → ' + entry.upstream
      // A single click only SELECTS: checking a branch out is a real change of
      // working tree, and a stray click in a long list must not do that (reported
      // on v0.3.7). Double-click checks out, right-click has the whole menu.
      return E('div', {
        className: 'dig-row dig-row-' + kind + (props.picked === true ? ' dig-row-picked' : ''),
        style: { paddingLeft: (BRANCH_INDENT_BASE + (props.depth === undefined ? 0 : props.depth) * BRANCH_INDENT_STEP) + 'px' },
        title: where + ' · ' + t('branches.pickHint'),
        onClick: () => props.onPick(entry),
        onDoubleClick: () => props.onCheckout(entry),
        onContextMenu: (event) => { event.preventDefault(); props.onMenu(event, entry) },
      },
        E('span', { className: 'dig-row-icon dig-tone-' + tone }, E(Icon, { name: glyph, size: 12 })),
        E('span', { className: 'dig-row-label' }, props.label === undefined ? entry.name : props.label),
        // A bare 'W' told nobody anything (reported right after the section counts):
        // it means this branch is checked out in ANOTHER working tree, which is why
        // git refuses to check it out here. An icon plus a spelled-out tooltip says so.
        entry.worktree === null || entry.worktree === undefined ? null : E('span', {
          className: 'dig-badge dig-badge-muted dig-badge-worktree',
          title: t('branches.worktree') + ': ' + entry.worktree,
        }, E(Icon, { name: 'folder', size: 10 })),
        entry.ahead > 0 ? E('span', { className: 'dig-badge' }, '↑' + entry.ahead) : null,
        entry.behind > 0 ? E('span', { className: 'dig-badge' }, '↓' + entry.behind) : null)
    }

    function BranchTree(props) {
      const t = props.t
      const [filter, setFilter] = useState('')
      const [collapsed, setCollapsed] = useState({ favorites: false, remote: false, tags: true })
      const [picked, setPicked] = useState('')
      const [foldedFolders, setFoldedFolders] = useState({})
      const branches = props.branches
      const needle = filter.trim().toLowerCase()
      const match = (name) => needle === '' || String(name).toLowerCase().indexOf(needle) >= 0
      const locals = (branches === null ? [] : branches.local).filter((entry) => match(entry.name))
      const remotes = (branches === null ? [] : branches.remote).filter((entry) => match(entry.name))
      const tags = (branches === null ? [] : branches.tags).filter((entry) => match(entry.name))
      const favorites = Array.isArray(props.favorites) ? props.favorites : []
      /**
       * Branch names nest on '/', the way an IDE shows a branch namespace: clicking a
       * row only SELECTS it (checking out rewrites the working tree), so the row
       * carries the selection and a double-click does the checkout.
       */
      const forestOf = (entries) => {
        const root = { folders: new Map(), leaves: [] }
        for (const entry of entries) {
          const parts = String(entry.name).split('/')
          let node = root
          for (let index = 0; index < parts.length - 1; index += 1) {
            const key = parts[index]
            if (node.folders.has(key) === false) node.folders.set(key, { folders: new Map(), leaves: [] })
            node = node.folders.get(key)
          }
          node.leaves.push({ entry: entry, label: parts[parts.length - 1] })
        }
        return root
      }
      const countLeaves = (node) => node.leaves.length + Array.from(node.folders.values()).reduce((sum, child) => sum + countLeaves(child), 0)
      const branchRow = (entry, label, depth) => E(BranchRow, {
        key: 'row:' + entry.name, entry: entry, label: label, depth: depth, t: t,
        picked: picked === entry.name,
        onPick: (target) => setPicked(target.name),
        onCheckout: props.onCheckout, onMenu: props.onBranchMenu,
      })
      const rowsOf = (node, prefix, depth) => {
        const out = []
        for (const name of Array.from(node.folders.keys()).sort()) {
          const id = prefix === '' ? name : prefix + '/' + name
          const open = foldedFolders[id] !== true
          const child = node.folders.get(name)
          out.push(E('div', { className: 'dig-branch-folder', key: 'dir:' + id },
            E('button', {
              type: 'button', className: 'dig-folder-head',
              style: { paddingLeft: (BRANCH_INDENT_BASE + depth * BRANCH_INDENT_STEP) + 'px' },
              onClick: () => setFoldedFolders((previous) => Object.assign({}, previous, { [id]: previous[id] !== true })),
            },
              E('span', { className: 'dig-chevron' + (open ? ' dig-chevron-open' : '') }, E(Icon, { name: 'chevron', size: 10 })),
              E('span', { className: 'dig-folder-name' }, name),
              E('span', { className: 'dig-count' }, String(countLeaves(child)))),
            open ? rowsOf(child, id, depth + 1) : null))
        }
        for (const leaf of node.leaves) out.push(branchRow(leaf.entry, leaf.label, depth))
        return out
      }
      const section = (key, title, entries, decorate, grouped) => E('div', { className: 'dig-section', key: key },
        E('button', {
          type: 'button', className: 'dig-section-head',
          onClick: () => setCollapsed((previous) => Object.assign({}, previous, { [key]: !previous[key] })),
        },
          E('span', { className: 'dig-chevron' + (collapsed[key] === true ? '' : ' dig-chevron-open') }, E(Icon, { name: 'chevron', size: 12 })),
          // No count here: a bare digit next to the section name read as another
          // column instead of a total (reported on v0.3.10).
          E('span', null, title)),
        collapsed[key] === true ? null : E('div', { className: 'dig-section-body' },
          grouped === true
            ? rowsOf(forestOf(entries.map((entry) => decorate(entry))), '', 0)
            : entries.map((entry) => branchRow(decorate(entry), undefined, 0))))
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
          section('local', t('branches.local'), locals, (entry) => entry, true),
          section('remote', t('branches.remote'), remotes, (entry) => Object.assign({}, entry, { remote: true })),
          section('tags', t('branches.tags'), tags, (entry) => Object.assign({}, entry, { tag: true }))))
    }

    /* ============================== changes ============================== */

    function ChangeRow(props) {
      const t = props.t
      const item = props.item
      const raw = item.index === '?' ? '?' : (item.index + item.worktree).trim()
      // Ignored rows are informational: their status letter is their own, and the
      // stage/discard buttons below would silently do nothing (git needs -f).
      const readOnly = props.group === 'ignored'
      const status = readOnly ? 'I' : (raw === '' ? 'M' : raw.charAt(0))
      return E('div', {
        className: 'dig-row dig-row-file',
        title: item.origPath === undefined ? item.path : item.origPath + ' → ' + item.path,
        onClick: () => props.onDiff(item, props.group),
        onContextMenu: (event) => { event.preventDefault(); props.onMenu(event, item, props.group) },
      },
        E('span', { className: 'dig-file-status dig-file-status-' + (status === '?' ? 'U' : status) }, status),
        // An ignored DIRECTORY comes back as "dist/" (ls-files --directory), whose
        // basename is empty — show the whole path instead of a blank label.
        E('span', { className: 'dig-row-label' }, item.path.slice(-1) === '/' ? item.path : baseName(item.path)),
        E('span', { className: 'dig-row-sub dig-row-dir' }, item.path.slice(-1) === '/' ? '' : dirName(item.path)),
        item.additions > 0 ? E('span', { className: 'dig-stat-add' }, '+' + item.additions) : null,
        item.deletions > 0 ? E('span', { className: 'dig-stat-del' }, '-' + item.deletions) : null,
        readOnly ? null : (props.group === 'staged'
          ? E('button', { type: 'button', className: 'dig-mini', title: t('action.unstage'), onClick: (event) => { event.stopPropagation(); props.onUnstage(item) } }, E(Icon, { name: 'minus', size: 12 }))
          : E('button', { type: 'button', className: 'dig-mini', title: t('action.stage'), onClick: (event) => { event.stopPropagation(); props.onStage(item) } }, E(Icon, { name: 'plus', size: 12 }))),
        readOnly ? null : E('button', { type: 'button', className: 'dig-mini', title: t('action.discard'), onClick: (event) => { event.stopPropagation(); props.onDiscard(item, props.group) } }, E(Icon, { name: 'undo', size: 12 })))
    }

    function ChangesPanel(props) {
      const t = props.t
      const summary = props.summary
      const [message, setMessage] = useState('')
      const [amend, setAmend] = useState(false)
      const [collapsed, setCollapsed] = useState(false)
      /* AI-written message (issue #6). The draft is kept so the write can be
         undone, and an existing draft is never overwritten without a word. */
      const [aiBusy, setAiBusy] = useState(false)
      const [aiNote, setAiNote] = useState(null)
      const [aiAsk, setAiAsk] = useState(false)
      const [aiUndo, setAiUndo] = useState(null)
      // 'flat' keeps git's own grouping (staged / changes / untracked); 'dir'
      // clusters each group's files under their folder, the way "Group by:
      // Directory" does in an IDE. Folders are addressed by <group>|<dir>, so a
      // refresh never loses which ones the user folded away.
      const [groupBy, setGroupBy] = useState('flat')
      const [foldedDirs, setFoldedDirs] = useState({})
      const changes = summary === null ? null : summary.changes
      const conflicted = changes === null ? [] : changes.conflicted
      const staged = changes === null ? [] : changes.staged
      const unstaged = changes === null ? [] : changes.unstaged
      const untracked = changes === null ? [] : changes.untracked
      const ignored = changes === null || changes.ignored === undefined ? [] : changes.ignored
      const total = conflicted.length + staged.length + unstaged.length + untracked.length
      const aiRun = async () => {
        setAiAsk(false)
        setAiBusy(true)
        setAiNote(null)
        try {
          const settings = props.commitSettings === undefined ? { model: '', reasoning: '', prompt: '' } : props.commitSettings
          const data = await props.request('commit-message', {
            cwd: props.cwd,
            sessionId: props.sessionId,
            model: settings.model,
            reasoningEffort: settings.reasoning,
            prompt: settings.prompt,
          })
          setAiUndo(message === '' ? null : message)
          setMessage(typeof data.message === 'string' ? data.message : '')
          /* Say what the model did NOT see, instead of quietly sending less. */
          const input = data.input === undefined ? {} : data.input
          const incomplete = input.truncated === true || (typeof input.dropped === 'number' && input.dropped > 0) || data.promptTruncated === true
          setAiNote(incomplete === true ? t('changes.aiNotice') : null)
        } catch (error) {
          const code = error !== null && error !== undefined && typeof error.code === 'string' ? error.code : 'unknown'
          setAiNote(t('changes.aiFailed') + ' [' + code + '] ' + String(error && error.message ? error.message : error))
        } finally {
          setAiBusy(false)
        }
      }
      const submit = (push) => {
        if (message.trim() === '' || props.busy === true) return false
        props.onCommit(message, amend, push === true)
        setMessage('')
        setAmend(false)
        return true
      }
      const entryRow = (key, item) => E(ChangeRow, {
        key: key + ':' + item.path, item: item, group: key, t: t,
        onStage: props.onStage, onUnstage: props.onUnstage, onDiscard: props.onDiscard, onDiff: props.onDiff, onMenu: props.onChangeMenu,
      })
      const folderOf = (item) => {
        const dir = dirName(item.path)
        return dir === '' ? t('changes.rootDir') : dir
      }
      const rowsOf = (key, entries) => {
        if (groupBy !== 'dir') return entries.map((item) => entryRow(key, item))
        const folders = new Map()
        for (const item of entries) {
          const name = folderOf(item)
          if (folders.has(name) === false) folders.set(name, [])
          folders.get(name).push(item)
        }
        return Array.from(folders.keys()).sort().map((name) => {
          const id = key + '|' + name
          const open = foldedDirs[id] !== true
          const list = folders.get(name)
          return E('div', { className: 'dig-folder', key: id },
            E('button', {
              type: 'button', className: 'dig-folder-head',
              onClick: () => setFoldedDirs((previous) => Object.assign({}, previous, { [id]: previous[id] !== true })),
            },
              E('span', { className: 'dig-chevron' + (open ? ' dig-chevron-open' : '') }, E(Icon, { name: 'chevron', size: 10 })),
              E('span', { className: 'dig-folder-name' }, name),
              E('span', { className: 'dig-count' }, String(list.length))),
            open ? list.map((item) => entryRow(key, item)) : null)
        })
      }
      const foldAll = (value) => {
        const next = {}
        if (value === true) {
          const groups = [['conflicted', conflicted], ['staged', staged], ['unstaged', unstaged], ['untracked', untracked], ['ignored', ignored]]
          for (const pair of groups) for (const item of pair[1]) next[pair[0] + '|' + folderOf(item)] = true
        }
        setFoldedDirs(next)
      }
      const group = (key, title, entries) => entries.length === 0 ? null : E('div', { className: 'dig-group', key: key },
        E('div', { className: 'dig-group-head' },
          E('span', null, title),
          key === 'staged' ? E('button', { type: 'button', className: 'dig-link', onClick: () => props.onUnstageAll() }, t('changes.unstageAll')) : null,
          key === 'unstaged' || key === 'untracked' ? E('button', { type: 'button', className: 'dig-link', onClick: () => props.onStageAll(entries) }, t('changes.stageAll')) : null),
        rowsOf(key, entries))
      const aiConfirmDialog = aiAsk !== true ? null : E(ConfirmDialog, {
        t: t,
        title: t('changes.aiOverwriteTitle'),
        text: t('changes.aiOverwriteText'),
        okLabel: t('confirm.ok'),
        cancelLabel: t('confirm.cancel'),
        onConfirm: () => { void aiRun() },
        onCancel: () => setAiAsk(false),
      })
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
              type: 'button', className: 'dig-btn dig-btn-small dig-btn-ai',
              disabled: aiBusy === true || props.busy === true,
              title: t('changes.aiQuota'),
              onClick: () => { if (message.trim() === '') void aiRun(); else setAiAsk(true) },
            }, aiBusy === true ? t('changes.aiBusy') : t('changes.aiWrite')),
            E('button', {
              type: 'button', className: 'dig-btn dig-btn-primary dig-btn-small',
              disabled: message.trim() === '' || props.busy === true,
              onClick: () => { submit(false) },
            }, t('changes.commit')),
            E('span', { className: 'dig-commit-ai-hint dig-commit-ai-hint-block' }, t('changes.aiQuota')))
        : E('div', { className: 'dig-commit-box' },
            E('textarea', {
              className: 'dig-textarea', value: message, spellCheck: false,
              placeholder: t('changes.commitPlaceholder'),
              onChange: (event) => setMessage(event.target.value),
              onKeyDown: (event) => {
                if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) { event.preventDefault(); submit() }
              },
            }),
            E('div', { className: 'dig-commit-ai' },
              E('button', {
                type: 'button', className: 'dig-btn dig-btn-small dig-btn-ai',
                disabled: aiBusy === true || props.busy === true,
                onClick: () => { if (message.trim() === '') void aiRun(); else setAiAsk(true) },
              }, aiBusy === true ? t('changes.aiBusy') : t('changes.aiWrite')),
              E('span', { className: 'dig-commit-ai-hint' }, t('changes.aiQuota')),
              aiUndo === null ? null : E('button', {
                type: 'button', className: 'dig-link',
                onClick: () => { setMessage(aiUndo); setAiUndo(null); setAiNote(null) },
              }, t('changes.aiUndo'))),
            aiNote === null ? null : E('div', { className: 'dig-commit-ai-note', 'data-ai-note': '' }, aiNote),
            E('div', { className: 'dig-commit-actions' },
              E('label', { className: 'dig-check' },
                E('input', { type: 'checkbox', checked: amend, onChange: (event) => setAmend(event.target.checked) }),
                E('span', null, t('changes.amend'))),
              E('button', {
                type: 'button', className: 'dig-btn dig-btn-primary',
                disabled: message.trim() === '' || props.busy === true,
                onClick: () => { submit(false) },
              }, t('changes.commit')),
              E('button', {
                type: 'button', className: 'dig-btn',
                disabled: message.trim() === '' || props.busy === true,
                onClick: () => { submit(true) },
              }, t('changes.commitAndPush'))))
      // Folding hides the FILE LIST only. The commit box is the panel's primary
      // action and used to vanish together with the list, leaving an empty pane
      // with no way to commit anything (reported on v0.3.5).
      const head = props.hideHeader === true ? null : E('div', { className: 'dig-section-head dig-changes-head' },
        E('button', {
          type: 'button', className: 'dig-section-toggle',
          onClick: () => setCollapsed((value) => !value),
        },
          E('span', { className: 'dig-chevron' + (collapsed ? '' : ' dig-chevron-open') }, E(Icon, { name: 'chevron', size: 12 })),
          E('span', null, t('changes.title')),
          E('span', { className: 'dig-count' }, String(total))),
        E('span', { className: 'dig-topbar-spacer' }),
        E('button', {
          type: 'button',
          className: 'dig-icon-btn dig-icon-btn-small' + (groupBy === 'dir' ? ' dig-icon-btn-active' : ''),
          title: t('changes.groupBy') + ': ' + (groupBy === 'dir' ? t('changes.groupDir') : t('changes.groupFlat')),
          onClick: () => setGroupBy((value) => (value === 'dir' ? 'flat' : 'dir')),
        }, E(Icon, { name: 'folder', size: 13 })),
        E('button', {
          type: 'button', className: 'dig-icon-btn dig-icon-btn-small',
          title: t('changes.expandAll'), disabled: groupBy !== 'dir',
          onClick: () => foldAll(false),
        }, E(Icon, { name: 'expand', size: 13 })),
        E('button', {
          type: 'button', className: 'dig-icon-btn dig-icon-btn-small',
          title: t('changes.foldAll'), disabled: groupBy !== 'dir',
          onClick: () => foldAll(true),
        }, E(Icon, { name: 'collapse', size: 13 })),
        E('button', {
          type: 'button',
          className: 'dig-icon-btn dig-icon-btn-small' + (props.showIgnored === true ? ' dig-icon-btn-active' : ''),
          title: t('changes.showIgnored'),
          onClick: () => props.onToggleIgnored(),
        }, E(Icon, { name: props.showIgnored === true ? 'eye' : 'eyeOff', size: 13 })))
      return E('div', { className: 'dig-changes' },
        aiConfirmDialog,
        head,
        E('div', { className: 'dig-changes-body' },
          E('div', { className: 'dig-changes-list' },
            collapsed ? null : [
              total === 0 && ignored.length === 0 ? E('div', { className: 'dig-empty', key: 'empty' }, t('changes.empty')) : null,
              group('conflicted', fill(t('counts.conflicted'), { n: conflicted.length }), conflicted),
              group('staged', fill(t('counts.staged'), { n: staged.length }), staged),
              group('unstaged', fill(t('counts.unstaged'), { n: unstaged.length }), unstaged),
              group('untracked', fill(t('counts.untracked'), { n: untracked.length }), untracked),
              group('ignored', fill(t('counts.ignored'), { n: ignored.length }), ignored),
            ]),
          composer))
    }

    /* ============================== history ============================== */

    const DAY_MS = 86400000

    /** Branches the panel treats as high risk: deleting one needs a typed confirm. */
    function isProtectedBranch(name) {
      return name === 'main' || name === 'master' || name === 'trunk'
    }

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

      /* Every filter opens the same in-panel menu; a checked row marks the active
        value, so the button never has to spell the whole list out. */
        const openFilterMenu = (event, options, currentValue, onPick) => {
          if (props.openMenuAt === undefined) return
          props.openMenuAt(event, options.map((option) => ({
            id: 'filter:' + String(option.value),
            icon: option.value === '' ? 'filter' : 'check',
            tone: option.value === '' ? 'secondary' : 'accent',
            label: option.label,
            active: option.value === currentValue,
            run: () => onPick(option.value),
          })))
        }
        const allOption = { value: '', label: t('filter.all') }
        const filterBar = props.hideSearch === true ? null : E('div', { className: 'dig-filters' },
        E('input', {
          className: 'dig-input dig-input-compact dig-filter-text', value: text, spellCheck: false,
          placeholder: t('history.filter'),
          onChange: (event) => setText(event.target.value),
        }),
        E(FilterSelect, {
          label: t('filter.branch'), value: refName, hint: t('filter.branch'),
          options: [allOption].concat(refOptions.map((name) => ({ value: name, label: name }))),
          onOpenMenu: (event, options) => openFilterMenu(event, options, refName, setRefName),
        }),
        E(FilterSelect, {
          label: t('filter.user'), value: author, hint: t('filter.user'),
          options: [allOption].concat(authors.map((name) => ({ value: name, label: name }))),
          onOpenMenu: (event, options) => openFilterMenu(event, options, author, setAuthor),
        }),
        E(FilterSelect, {
          label: t('filter.date'), value: since, hint: t('filter.date'),
          options: [allOption,
            { value: 'today', label: t('filter.today') },
            { value: 'week', label: t('filter.week') },
            { value: 'month', label: t('filter.month') },
            { value: 'year', label: t('filter.year') }],
          onOpenMenu: (event, options) => openFilterMenu(event, options, since, setSince),
        }),
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
      // Ignored files are opt-in: --ignored walks the ignore rules, and nobody
      // needs node_modules listed while they are writing a commit message.
      const [showIgnored, setShowIgnored] = useState(false)
      const [branches, setBranches] = useState(null)
      const [commits, setCommits] = useState([])
      const [hasMore, setHasMore] = useState(false)
      const [error, setError] = useState(null)
      const [note, setNote] = useState(null)
      const [busy, setBusy] = useState(false)
      const [view, setView] = useState('history')
      /* Pane sizes are remembered per surface (see the pane sizing core). The ref
         is the value the pointer handlers write through: a drag updates state for
         the preview and the ref for the single write that pointerup performs. */
      const [panes, setPanes] = useState(readPanes)
      const panesRef = useRef(panes)
      const [treeOpen, setTreeOpen] = useState(panes.treeOpen)
      const [paneDragging, setPaneDragging] = useState(null)
      const [paneSizes, setPaneSizes] = useState({})
      /* The float pane this panel is drawn in, or null while it is docked. The
         dock face exposes operations only, so the state comes from the float
         layer's own marker around this panel — the same marker carries the pane
         id dock() needs to put it back. */
      const [floatPaneId, setFloatPaneId] = useState(null)
      const bodyRef = useRef(null)
      const [bodyBox, setBodyBox] = useState({ width: 0, height: 0 })
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
      const [railTick, setRailTick] = useState(0)
      const [railSettings, setRailSettings] = useState(false)
      const [railBox, setRailBox] = useState({ width: 0, height: 0 })
      const [toasts, setToasts] = useState([])

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
      // Width alone decides WHICH SURFACE this is: the native right sidebar is
      // narrow (< 400) whatever its height, the bottom workbench is wide
      // whatever its height. Height must never select the tall-narrow chrome on
      // its own — v0.1.3 already made that mistake with a height < 330 test (a
      // 1500x300 workbench came out single-column) and v0.3.5 still let
      // height < 200 flip a 1320x180 workbench into the right-sidebar chrome.
      /* Where the gear goes: the plugin's own settings page when this host has
         both the row Config and the navigation to it, the in-panel editor
         otherwise (see RAIL_NS / railForm). */
      const railSettingsTarget = () => (railForm === null || props.openSettings === null || props.openSettings === undefined ? 'panel' : 'page')
      const openSettingsPage = () => {
        if (props.openSettings === null || props.openSettings === undefined) return
        props.openSettings()
      }

      const compact = size.width > 0 && size.width < COMPACT_MAX_WIDTH
      const columns = !compact && size.width >= 600 && size.width >= size.height * 1.15

      /* ---------- draggable panes (issue #5) ---------- */

      // Like the rail, the panes measure the box that actually holds them instead
      // of trusting the root probe: the column chrome keeps a vertical rail
      // beside the body, and the header sits above it.
      useEffect(() => {
        const element = bodyRef.current
        if (element === null) { setBodyBox({ width: 0, height: 0 }); return undefined }
        const measure = () => {
          const rect = element.getBoundingClientRect()
          setBodyBox({ width: Math.round(rect.width), height: Math.round(rect.height) })
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

      const chrome = compact ? 'compact' : columns ? 'columns' : 'stack'
      const measured = bodyBox.width > 0 || bodyBox.height > 0
      const paneBox = measured ? bodyBox : size
      /* The column chrome's dividers are vertical LINES, and the panes they move
         are sized by width; the stacked chromes move heights. One name for that
         switch: it decides the divider's orientation, the inline size, the ratio
         reference and the drag cursor, and getting it half-right is how a height
         drag ends up writing a width. */
      const paneByWidth = PANE_HEIGHT_CHROME[chrome] !== true
      /* What the panes actually measure right now. The clamp needs the real box of
         the pane it is NOT moving: a content-sized pane is usually shorter than
         its own percentage cap, and reserving the cap would block the drag (or
         snap a stored size back on the next render). The markers are data
         attributes rather than class sniffing so the diff pane, nested inside the
         middle pane, is found the same way. */
      const measurePanes = () => {
        const found = {}
        const element = bodyRef.current
        if (element === null) return found
        for (const node of element.querySelectorAll('[data-pane]')) {
          const rect = node.getBoundingClientRect()
          found[node.getAttribute('data-pane')] = Math.round(paneByWidth ? rect.width : rect.height)
        }
        return found
      }
      /* Kept in state, not in a ref: a pane's box changes without the panel
         re-rendering (content arrives, a dock resizes), and the render that
         re-clamps a stored size has to see the same numbers the drag did — a drag
         allowed further than the render allows snaps back under the cursor. The
         bail-out comparison is what keeps this from looping. */
      useEffect(() => {
        const found = measurePanes()
        setPaneSizes((current) => (samePaneSizes(current, found) ? current : found))
      })
      useEffect(() => {
        const node = hostRef.current
        const holder = node === null || typeof node.closest !== 'function' ? null : node.closest('[data-dockkit-float]')
        const next = holder === null ? null : holder.getAttribute('data-dockkit-float')
        setFloatPaneId((current) => (current === next ? current : next))
      })
      const dock = props.dock === undefined ? null : props.dock
      const dockState = dockActionState(dock, floatPaneId)
      const paneLayout = paneGeometry(chrome, paneBox, panes, paneSizes)

      const commitPanes = (next) => {
        panesRef.current = next
        setPanes(next)
      }

      /* The gutter hands back the px it wants; the clamp lives here, and what
         gets stored is the ratio that reproduces it on this container. The live
         measurement is pushed into state alongside the new ratio, so the render
         that follows this gesture clamps with the very same box. */
      const dragPane = (key, rawPx) => {
        const live = measurePanes()
        setPaneSizes((current) => (samePaneSizes(current, live) ? current : live))
        const layout = paneGeometry(chrome, paneBox, panesRef.current, live)
        const limit = layout.limits[key]
        const reference = paneByWidth ? paneBox.width : paneBox.height
        if (limit === undefined || !(reference > 0)) return
        const px = Math.round(Math.min(Math.max(rawPx, limit.min), limit.max))
        commitPanes(withPaneRatio(panesRef.current, layout.bucket, key, px / reference))
      }

      /* One write per gesture (pointerup / keyboard nudge / double-click), not one
         per pointermove. */
      const endPaneDrag = () => {
        setPaneDragging(null)
        writePanes(panesRef.current)
      }

      const resetPane = (key) => {
        commitPanes(withPaneRatio(panesRef.current, paneLayout.bucket, key, null))
        writePanes(panesRef.current)
      }

      const foldTree = (open) => {
        setTreeOpen(open)
        commitPanes({ treeOpen: open, panes: panesRef.current.panes })
        writePanes(panesRef.current)
      }

      /* Only a pane the user actually dragged gets an inline size; everything
         else keeps the stylesheet default (200px tree, 290px changes, the
         percentage caps) — which is also what a double-click returns to. */
      const paneStyle = (key) => {
        const px = paneLayout.overrides[key]
        if (px === undefined) return null
        return paneByWidth ? { width: px + 'px', maxWidth: px + 'px' } : { height: px + 'px', maxHeight: px + 'px' }
      }

      /* A divider is a control, so it only exists when it can actually move
         something: no pane of that key in this chrome, or a window with no travel
         at all, means no element — and therefore no tab stop either (v0.8.0 shipped
         a 0x0 focusable separator in the columns chrome that way). */
      const gutter = (key, side) => {
        const limit = paneLayout.limits[key]
        if (limit === undefined || limit.max <= limit.min) return null
        return E(Gutter, {
        key: 'gutter-' + key,
        t: t,
        nameKey: PANE_NAME_KEYS[key],
        vertical: paneByWidth,
        side: side,
        active: paneDragging === key,
        // Now is clamped into [min, max]: an aria window the panel contradicts is
        // worse than no window at all.
        value: Math.min(Math.max(Math.round(paneLayout.effective[key] === undefined ? 0 : paneLayout.effective[key]), limit.min), limit.max),
        min: limit.min,
        max: limit.max,
        onStart: () => setPaneDragging(key),
        onDrag: (px) => dragPane(key, px),
        onEnd: endPaneDrag,
        onReset: () => resetPane(key),
        })
      }

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
        /* No workspace attached: there is nothing to scan, so land the empty
           result straight away instead of leaving repoState null (which reads
           as "still loading" and would spin forever). */
        if (cwd === undefined) { setRepoState({ repos: [], isRepo: false }); return undefined }
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
        const data = await request('summary', Object.assign({}, base, { ignored: showIgnored }))
        setSummary(data)
        return data
      }, [base, showIgnored])

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
      // A merge / rebase / cherry-pick / revert / bisect that has not finished yet
      // makes branch-level actions dangerous: git refuses most of them anyway, so
      // the panel greys them out and says why instead of letting them fail.
      const operation = summary === null || summary.operation === undefined ? null : summary.operation
      const blocked = operation !== null

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
          { id: 'checkout', icon: 'checkout', tone: 'accent', label: t('action.checkout'), disabled: entry.head === true || entry.tag === true || blocked, reason: blocked ? t('operation.hint') : reason, run: () => { void checkout(entry) } },
          isLocal ? { id: 'rebase', icon: 'compare', tone: 'violet', label: t('action.rebaseCurrentOnto'), disabled: entry.head === true || blocked, reason: blocked ? t('operation.hint') : reason, run: () => { void run('rebase', { onto: entry.name }) } } : null,
          isLocal ? { id: 'merge', icon: 'compare', tone: 'accent', label: t('action.mergeIntoCurrent'), disabled: entry.head === true || blocked, reason: blocked ? t('operation.hint') : reason, run: () => { void run('merge', { branch: entry.name }) } } : null,
          { id: 'compare', icon: 'filter', tone: 'violet', label: t('action.compare'), disabled: entry.head === true || current === '', reason: reason, run: () => { void compareWith(current, entry.name) } },
          null,
          { id: 'favorite', icon: 'star', tone: 'warn', label: t('action.favorite'), active: favorites.indexOf(entry.name) >= 0, run: () => toggleFavoriteBranch(entry.name) },
          { id: 'newBranch', icon: 'plus', tone: 'success', label: t('action.newBranchFrom'), run: () => setDialog({ kind: 'newBranch', from: entry.name }) },
          isLocal ? { id: 'rename', icon: 'file', tone: 'primary', label: t('action.rename'), run: () => setDialog({ kind: 'renameBranch', from: entry.name }) } : null,
          isLocal ? { id: 'delete', icon: 'trash', tone: 'danger', label: t('action.delete'), danger: true, disabled: entry.head === true, reason: reason, run: () => setDialog({ kind: 'deleteBranch', name: entry.name }) } : null,
          null,
          { id: 'update', icon: 'fetch', tone: 'cyan', label: t('action.update'), run: () => { void run('fetch', { prune: true }) } },
          { id: 'push', icon: 'push', tone: 'success', label: t('action.push'), disabled: blocked, reason: t('operation.hint'), run: () => setDialog({ kind: 'push' }) },
        ].filter((item) => item !== null)
        openMenuAt(event, items)
      }, [branches, checkout, run, t, compareWith, toggleFavoriteBranch, openMenuAt, favorites, blocked])

      const commitMenu = useCallback((event, commit) => {
        const items = [
          { id: 'details', icon: 'file', tone: 'primary', label: t('action.details'), run: () => { void selectCommit(commit) } },
          { id: 'copy', icon: 'tag', tone: 'secondary', label: t('action.copyHash'), run: () => { copyText(commit.hash) } },
          null,
          { id: 'checkout', icon: 'checkout', tone: 'accent', label: t('action.checkout'), run: () => setDialog({ kind: 'checkoutCommit', hash: commit.hash }) },
          { id: 'branch', icon: 'plus', tone: 'success', label: t('action.newBranchHere'), run: () => setDialog({ kind: 'newBranch', from: commit.hash }) },
          { id: 'tag', icon: 'tag', tone: 'warn', label: t('action.newTag'), run: () => setDialog({ kind: 'newTag', hash: commit.hash }) },
          null,
          { id: 'cherry', icon: 'commit', tone: 'accent', label: t('action.cherryPick'), disabled: blocked, reason: t('operation.hint'), run: () => { void run('cherryPick', { hash: commit.hash }) } },
          { id: 'revert', icon: 'undo', tone: 'danger', label: t('action.revert'), disabled: blocked, reason: t('operation.hint'), run: () => { void run('revert', { hash: commit.hash }) } },
          null,
          { id: 'resetSoft', icon: 'undo', tone: 'warn', label: t('action.resetSoft'), disabled: blocked, reason: t('operation.hint'), run: () => setDialog({ kind: 'reset', hash: commit.hash, mode: 'mixed' }) },
          { id: 'resetHard', icon: 'trash', tone: 'danger', label: t('action.resetHard'), danger: true, disabled: blocked, reason: t('operation.hint'), run: () => setDialog({ kind: 'reset', hash: commit.hash, mode: 'hard' }) },
        ]
        openMenuAt(event, items)
      }, [run, selectCommit, t, openMenuAt, blocked])

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

      /* ---------- toasts + undo ---------- */

      const toastTimers = useRef([])
      const toastSeq = useRef(0)

      useEffect(() => () => {
        for (const timer of toastTimers.current) clearTimeout(timer)
        toastTimers.current = []
      }, [])

      const dropToast = useCallback((id) => {
        setToasts((list) => list.filter((item) => item.id !== id))
      }, [])

      const pushToast = useCallback((toast) => {
        toastSeq.current += 1
        const id = 'toast-' + String(toastSeq.current)
        setToasts((list) => list.concat([Object.assign({ id: id, onClose: () => dropToast(id) }, toast)]))
        const ttl = toast.ttl === undefined ? (toast.actionLabel === undefined ? 9000 : 30000) : toast.ttl
        if (ttl > 0) toastTimers.current.push(setTimeout(() => dropToast(id), ttl))
        return id
      }, [dropToast])

      // The delete really happened; the host kept an object id for a while, and this
      // asks it to recreate the branch / stash entry from that id.
      const undoAction = useCallback(async (id) => {
        const data = await guard(() => request('undoApply', Object.assign({}, base, { id: id })))
        if (data === undefined) return
        setToasts((list) => list.filter((item) => item.undoId !== id))
        await refresh()
        pushToast({ text: t('toast.restored') + ' · ' + data.label, icon: 'check', tone: 'ok', ttl: 6000 })
      }, [base, guard, refresh, pushToast, t])

      const deleteBranch = useCallback(async (name) => {
        const data = await run('branchDelete', { name: name, confirm: true })
        if (data === undefined) return
        if (data.undo === undefined) return
        pushToast({
          text: fill(t('toast.branchDeleted'), { name: name }),
          icon: 'trash',
          tone: 'warn',
          undoId: data.undo.id,
          actionLabel: t('toast.undo'),
          onAction: () => { void undoAction(data.undo.id) },
        })
      }, [run, pushToast, undoAction, t])

      const dropStash = useCallback(async (ref) => {
        const data = await run('stashDrop', { ref: ref, confirm: true })
        if (data === undefined) return
        if (data.undo === undefined) return
        pushToast({
          text: fill(t('toast.stashDropped'), { ref: ref }),
          icon: 'trash',
          tone: 'warn',
          undoId: data.undo.id,
          actionLabel: t('toast.undo'),
          onAction: () => { void undoAction(data.undo.id) },
        })
      }, [run, pushToast, undoAction, t])

      // A discard really overwrote the working tree, so it hands back the same
      // kind of handle a delete does: the host snapshotted the bytes first.
      const discardChanges = useCallback(async (item, group) => {
        const data = await run('discard', { paths: [item.path], untracked: group === 'untracked', confirm: true })
        if (data === undefined) return
        if (data.undo === undefined) {
          // The host declined to snapshot (too big / not faithfully reproducible);
          // say so instead of letting the toast promise an undo that is not there.
          if (data.undoBlocked === true) {
            pushToast({ text: fill(t('toast.discardNoUndo'), { path: item.path }), icon: 'trash', tone: 'warn' })
          }
          return
        }
        pushToast({
          text: fill(t('toast.discarded'), { path: item.path }),
          icon: 'trash',
          tone: 'warn',
          undoId: data.undo.id,
          actionLabel: t('toast.undo'),
          onAction: () => { void undoAction(data.undo.id) },
        })
      }, [run, pushToast, undoAction, t])

      // A toast is transient; this keeps the same handles reachable afterwards, so
      // undoing a delete never depends on catching a floating chip in time.
      const openUndoMenu = useCallback(async (event) => {
        const data = await guard(() => request('undoList', base))
        if (data === undefined) return
        const entries = Array.isArray(data.items) ? data.items.slice().reverse() : []
        if (entries.length === 0) {
          pushToast({ text: t('undo.empty'), icon: 'undo', ttl: 6000 })
          return
        }
        openMenuAt(event, entries.map((entry) => ({
          id: 'undo:' + entry.id,
          icon: 'undo',
          tone: 'warn',
          label: (entry.kind === 'branch-delete' ? t('undo.branch') : entry.kind === 'stash-drop' ? t('undo.stash') : entry.kind === 'discard' ? t('undo.discard') : entry.kind) + ' · ' + entry.label,
          run: () => { void undoAction(entry.id) },
        })))
      }, [base, guard, openMenuAt, pushToast, t, undoAction])

      /* ---------- shared pieces ---------- */

      const repoOptions = repoState === null ? [] : repoState.repos
      const dirty = summary === null ? 0 : summary.changes.staged.length + summary.changes.unstaged.length + summary.changes.untracked.length + summary.changes.conflicted.length

      /* Both header switchers are menu-driven now (see RepoSelect): the
         popovers reuse openMenuAt, so they clamp to the panel box and share
         the opaque, frosted menu surface instead of the OS select popup. */
      const openRepoMenu = useCallback((event) => {
        openMenuAt(event, repoOptions.map((repo) => ({
          id: 'repo:' + repo.path,
          icon: 'folder',
          tone: 'accent',
          label: repo.name + (repo.branch === null || repo.branch === undefined ? '' : ' · ' + repo.branch),
          active: repo.path === repoRoot,
          run: () => { if (repo.path !== repoRoot) pickRepo(repo.path) },
        })))
      }, [openMenuAt, repoOptions, repoRoot, pickRepo])

      const openBranchSwitchMenu = useCallback((event) => {
        const local = branches === null ? [] : branches.local
        openMenuAt(event, local.map((entry) => ({
          id: 'switch:' + entry.name,
          icon: entry.head === true ? 'star' : 'branch',
          tone: entry.head === true ? 'warn' : 'accent',
          label: entry.name,
          active: entry.head === true,
          run: () => { if (entry.head !== true) void checkout(entry) },
        })))
      }, [openMenuAt, branches, checkout])

      const topBar = E('div', { className: 'dig-topbar' },
        E(RepoSelect, {
          t: t, repos: repoOptions, value: repoRoot,
          loading: repoState === null,
          onOpenMenu: openRepoMenu,
        }),
        branches === null || branches.local.length === 0 ? null : E('span', { className: 'dig-select-wrap', title: t('branch.switch') },
          E(Icon, { name: 'branch', size: 12 }),
          E('button', {
            type: 'button',
            className: 'dig-select dig-select-btn dig-select-branch',
            onClick: openBranchSwitchMenu,
          },
            E('span', { className: 'dig-repo-name' }, branches.branch),
            E(Icon, { name: 'chevron', size: 12 }))),
        summary === null || summary.upstream === null ? null : E('span', { className: 'dig-track' },
          (summary.ahead > 0 ? '↑' + summary.ahead : '') + (summary.behind > 0 ? ' ↓' + summary.behind : '')),
        operation === null ? null : E('span', { className: 'dig-opchip', title: t('operation.hint') }, t('operation.' + operation)),
        E('button', {
          type: 'button', className: 'dig-icon-btn dig-icon-btn-small',
          title: t('undo.menu'),
          onClick: (event) => { void openUndoMenu(event) },
        }, E(Icon, { name: 'undo', size: 13 })),
        E('span', { className: 'dig-topbar-spacer' }),
        busy ? E('span', { className: 'dig-busy' }, t('status.busy')) : null)

      const banner = error === null ? null : E('div', { className: 'dig-banner' },
        E('span', { className: 'dig-banner-text' }, error),
        E('button', { type: 'button', className: 'dig-link', onClick: () => setError(null) }, t('error.dismiss')))

      const noteBanner = note === null ? null : E('div', { className: 'dig-note' },
        E('span', { className: 'dig-banner-text' }, note),
        E('button', { type: 'button', className: 'dig-link', onClick: () => setNote(null) }, t('error.dismiss')))

      const commitSettings = readCommitSettings()
      const changesPane = E(ChangesPanel, {
        t: t, summary: summary, busy: busy, compact: compact, hideHeader: compact,
        request: request, cwd: cwd, sessionId: sessionId, commitSettings: commitSettings,
        showIgnored: showIgnored,
        onToggleIgnored: () => setShowIgnored((value) => !value),
        // Commit-and-push carries the confirm flag with it: the button already
        // says exactly what it will publish, so the host guard is satisfied by
        // the click itself rather than by a second dialog.
        onCommit: (message, amend, push) => {
          void run('commit', { message: message, amend: amend, push: push === true, confirm: push === true })
        },
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
            hideSearch: compact, pathFilter: pathFilter, openMenuAt: openMenuAt,
            onPathFilter: (value) => setPathFilter(value),
            onSelect: (commit) => { void selectCommit(commit) },
            onMenu: commitMenu,
            onLoadMore: () => { void guard(() => loadCommits(commits.length)) },
          })

      const diffPane = patch === '' && patchLoading === false ? null : E('div', { className: 'dig-diff-pane', 'data-pane': 'diff', style: paneStyle('diff') },
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
          { id: 'stash-drop', icon: 'trash', tone: 'danger', label: t('stash.drop'), danger: true, disabled: count === 0, reason: t('action.unavailable'), run: () => setDialog({ kind: 'stashDrop', ref: 'stash@{0}' }) },
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
        else if (spec.id === 'checkout') { entry.disabled = otherBranches.length === 0 || blocked; entry.run = (event) => pickBranchMenu(event, 'checkout') }
        else if (spec.id === 'delete') { entry.disabled = otherBranches.length === 0; entry.run = (event) => pickBranchMenu(event, 'delete') }
        else if (spec.id === 'compare') { entry.disabled = otherBranches.length === 0; entry.run = (event) => pickBranchMenu(event, 'compare') }
        else if (spec.id === 'diff') { entry.disabled = dirty === 0; entry.run = () => showWorkingDiff() }
        else if (spec.id === 'stash') { entry.disabled = dirty === 0 && stashCount === 0; entry.run = (event) => stashMenu(event) }
        else if (spec.id === 'tag') { entry.disabled = commits.length === 0; entry.run = () => setDialog({ kind: 'newTag' }) }
        else if (spec.id === 'favorite') { entry.disabled = headBranch === ''; entry.active = favorites.indexOf(headBranch) >= 0; entry.run = () => toggleFavoriteBranch(headBranch) }
        else if (spec.id === 'fetch') { entry.disabled = remoteReady !== true; entry.run = () => { void run('fetch', { prune: true }) } }
        else if (spec.id === 'pull') { entry.disabled = remoteReady !== true || tracked !== true || blocked; entry.run = () => { void run('pull', { mode: 'ff-only' }) } }
        else if (spec.id === 'push') { entry.disabled = remoteReady !== true || blocked; entry.run = () => setDialog({ kind: 'push' }) }
        else if (spec.id === 'tree') { entry.active = treeOpen; entry.run = () => foldTree(!treeOpen) }
        else if (spec.id === 'float') {
          // Label AND icon follow where the panel actually is: floating panels get
          // the way back, docked ones get the way out.
          entry.available = dockState.float
          entry.active = dockState.floating
          entry.icon = dockState.floating === true ? 'dock' : 'float'
          entry.label = dockState.floating === true ? t('action.dock') : t('action.float')
          entry.run = () => {
            if (dockState.floating === true) { dock.service.dock(floatPaneId); return }
            dock.service.float(dock.tabId)
          }
        }
        else if (spec.id === 'split') {
          entry.available = dockState.split
          entry.run = () => { dock.service.split(dock.paneId) }
        }
        else if (spec.id === 'fullscreen') {
          entry.available = dockState.fullscreen
          entry.active = dock !== null && dock.fullscreen === true
          entry.icon = entry.active === true ? 'collapse' : 'expand'
          entry.label = entry.active === true ? t('action.exitFullscreen') : t('action.fullscreen')
          entry.run = () => {
            const service = dock.service
            const target = typeof service.commandTarget === 'function' ? service.commandTarget(document.activeElement) : undefined
            if (target !== undefined && target !== null) service.toggleFullscreen(target)
          }
        }
        // A running git command greys out the repository actions, never the view.
        if (busy === true && spec.id !== 'refresh' && RAIL_VIEW_IDS.indexOf(spec.id) < 0) entry.disabled = true
        return entry
      })

      const railOrdered = railConfig.order
        .map((id) => railActions.find((action) => action.id === id))
        // An action this mount cannot perform is not rendered at all — hidden, not
        // disabled: a greyed button for a service the host does not have is noise.
        .filter((action) => action !== undefined && action.available !== false)
      const railVisible = railOrdered.filter((action) => railConfig.hidden.indexOf(action.id) < 0)

      /* The rail is drawn from the row Config when the host serves it: a change
         made in the settings card must show up here without a reload. */
      useEffect(() => subscribeRailConfig(() => {
        setRailConfig(readRailConfig())
        setRailTick((value) => value + 1)
      }), [])
      void railTick

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
          'data-action': action.id,
          'aria-pressed': action.active === true ? 'true' : 'false',
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
          'data-action': 'settings',
          // On a host that serves the row Config this button opens the plugin's own
          // settings page (where the card below the description edits the rail);
          // on an older host it keeps the in-panel editor. Never both.
          title: railSettingsTarget() === 'page' ? t('rail.openSettings') : t('rail.settings'),
          onClick: () => {
            const target = railSettingsTarget()
            if (target === 'page') { openSettingsPage(); return }
            setRailSettings(true)
          },
        }, E(Icon, { name: 'settings', size: 15 })))
        return E('div', { className: vertical ? 'dig-rail' : 'dig-rail-row', ref: railHostRef }, children)
      }

      /* ---------- body per chrome ---------- */

      /* ---------- body per chrome ---------- */

      /* The history↔diff separator only exists while a diff is on screen, and it
         lives inside the middle pane — the diff is the pane below it. */
      const diffGutter = diffPane === null ? null : gutter('diff', 'next')

      let body
      if (repoState === null) {
        /* The scan is still running: a neutral loading state, never the
           "no repository found" verdict (that text is reserved for a scan
           that actually came back empty). */
        body = E('div', { className: 'dig-body', ref: bodyRef }, E('div', { className: 'dig-empty' }, t('status.loading')))
      } else if (repoRoot === null) {
        body = E('div', { className: 'dig-body', ref: bodyRef }, E(RepoPicker, {
          t: t, cwd: cwd === undefined ? '' : cwd, repos: repoOptions, onPick: pickRepo,
        }))
      } else if (compact) {
        body = E('div', { className: 'dig-body dig-body-compact', ref: bodyRef },
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
            // Two-way on purpose: treeOpen is persisted, so a header button that
            // only rendered while the tree was OPEN left a folded tree with no way
            // back on this chrome (the rail now carries one too, for the others).
            E('button', {
              type: 'button',
              className: 'dig-icon-btn' + (treeOpen ? ' dig-icon-btn-active' : ''),
              'data-action': 'tree',
              'aria-pressed': treeOpen ? 'true' : 'false',
              title: t('toolbar.tree'),
              onClick: () => foldTree(!treeOpen),
            }, E(Icon, { name: treeOpen ? 'eye' : 'eyeOff' }))),
          treeOpen ? E('div', { className: 'dig-compact-tree', 'data-pane': 'tree', style: paneStyle('tree') }, E(BranchTree, { t: t, branches: branches, favorites: favorites, onCheckout: checkout, onBranchMenu: branchMenu })) : null,
          treeOpen ? gutter('tree', 'prev') : null,
          view === 'changes' ? changesPane : E('div', { className: 'dig-pane dig-pane-main' }, historyPane, diffGutter, diffPane))
      } else if (columns) {
        body = E('div', { className: 'dig-body dig-body-columns', ref: bodyRef },
          treeOpen ? E('div', { className: 'dig-pane dig-pane-tree', 'data-pane': 'tree', style: paneStyle('tree') }, E(BranchTree, { t: t, branches: branches, favorites: favorites, onCheckout: checkout, onBranchMenu: branchMenu })) : null,
          treeOpen ? gutter('tree', 'prev') : null,
          E('div', { className: 'dig-pane dig-pane-main' }, historyPane, diffGutter, diffPane),
          gutter('changes', 'next'),
          E('div', { className: 'dig-pane dig-pane-changes', 'data-pane': 'changes', style: paneStyle('changes') }, changesPane))
      } else {
        body = E('div', { className: 'dig-body dig-body-stack', ref: bodyRef },
          treeOpen ? E('div', { className: 'dig-pane dig-pane-tree-stack', 'data-pane': 'tree', style: paneStyle('tree') }, E(BranchTree, { t: t, branches: branches, favorites: favorites, onCheckout: checkout, onBranchMenu: branchMenu })) : null,
          treeOpen ? gutter('tree', 'prev') : null,
          E('div', { className: 'dig-pane dig-pane-changes-stack', 'data-pane': 'changes', style: paneStyle('changes') }, changesPane),
          gutter('changes', 'prev'),
          E('div', { className: 'dig-pane dig-pane-main' }, historyPane, diffGutter, diffPane))
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
        const guarded = isProtectedBranch(dialog.name)
        overlays.push(E(ConfirmDialog, {
          key: 'delete',
          t: t,
          title: t('confirm.title'),
          text: fill(guarded ? t('confirm.protected') : t('delete.confirm'), { name: dialog.name }),
          requireText: guarded ? dialog.name : undefined,
          okLabel: t('confirm.ok'), cancelLabel: t('confirm.cancel'),
          onCancel: () => setDialog(null),
          onConfirm: () => { const name = dialog.name; setDialog(null); void deleteBranch(name) },
        }))
      }
      if (dialog !== null && dialog.kind === 'stashDrop') {
        overlays.push(E(ConfirmDialog, {
          key: 'stashDrop',
          t: t,
          title: t('confirm.title'),
          text: fill(t('stashDrop.confirm'), { ref: dialog.ref }),
          okLabel: t('confirm.ok'), cancelLabel: t('confirm.cancel'),
          onCancel: () => setDialog(null),
          onConfirm: () => { const ref = dialog.ref; setDialog(null); void dropStash(ref) },
        }))
      }
      if (dialog !== null && dialog.kind === 'discard') {
        overlays.push(E(ConfirmDialog, {
          key: 'discard',
          t: t,
          title: t('confirm.title'),
          text: dialog.group === 'untracked'
            ? fill(t('discard.untracked.confirm'), { path: dialog.item.path })
            : fill(t('discard.confirm'), { path: dialog.item.path }),
          okLabel: t('confirm.ok'), cancelLabel: t('confirm.cancel'),
          onCancel: () => setDialog(null),
          onConfirm: () => {
            const item = dialog.item
            const group = dialog.group
            setDialog(null)
            void discardChanges(item, group)
          },
        }))
      }
      if (dialog !== null && dialog.kind === 'reset') {
        overlays.push(E(ConfirmDialog, {
          key: 'reset', t: t,
          title: t('confirm.title'),
          text: dialog.mode === 'hard' ? fill(t('resetHard.confirm'), { hash: dialog.hash.slice(0, 8) }) : fill(t('resetSoft.confirm'), { hash: dialog.hash.slice(0, 8) }),
          okLabel: t('confirm.ok'), cancelLabel: t('confirm.cancel'),
          onCancel: () => setDialog(null),
          onConfirm: () => { setDialog(null); void run('reset', { hash: dialog.hash, mode: dialog.mode, confirm: true }) },
        }))
      }
      if (dialog !== null && dialog.kind === 'checkoutCommit') {
        overlays.push(E(ConfirmDialog, {
          key: 'checkoutCommit', t: t,
          title: t('confirm.title'), text: fill(t('checkoutCommit.confirm'), { hash: dialog.hash.slice(0, 8) }),
          okLabel: t('confirm.ok'), cancelLabel: t('confirm.cancel'),
          onCancel: () => setDialog(null),
          onConfirm: () => { setDialog(null); void run('checkout', { branch: dialog.hash }) },
        }))
      }
      if (dialog !== null && dialog.kind === 'push') {
        const branch = summary === null ? '' : summary.branch
        const target = summary === null || summary.upstream === null ? 'origin' : summary.upstream
        overlays.push(E(ConfirmDialog, {
          key: 'push', t: t,
          title: t('confirm.title'), text: fill(t('push.confirm'), { branch: branch, upstream: target }),
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
      // While a divider is being dragged the whole panel stops selecting text and
      // keeps the resize cursor, even though the pointer has left the 8px gutter.
      return E('div', {
        className: 'dig-root'
          + (compact ? ' dig-root-narrow' : '')
          + (paneDragging === null ? '' : ' dig-pane-dragging' + (paneByWidth ? '-v' : '-h')),
        ref: hostRef,
      }, topBar,
        columns === true || repoRoot === null ? null : renderRail(false),
        banner, noteBanner,
        E('div', { className: 'dig-shell' },
          columns === true && repoRoot !== null ? renderRail(true) : null,
          body),
        overlays,
        E(ToastStack, { t: t, toasts: toasts }))
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
      '.dig-select{appearance:none;-webkit-appearance:none;background:transparent;border:1px solid var(--dsw-alias-border-l2);border-radius:var(--dsw-radius-sm,8px);color:var(--dsw-alias-label-primary);font:inherit;font-weight:500;padding:1px 6px;height:22px;max-width:190px;min-width:0;cursor:pointer;text-overflow:ellipsis}',
      '.dig-select:hover{background:var(--dsw-alias-interactive-bg-hover)}',
      '.dig-select:focus-visible{outline:1px solid var(--dsw-focus-ring-color,var(--dsw-alias-state-business-primary));outline-offset:-1px}',
      '.dig-select-btn{display:inline-flex;align-items:center;gap:4px;text-align:left;white-space:nowrap;overflow:hidden}',
      '.dig-select-btn .dig-repo-name{flex:1;min-width:0;max-width:none}',
      '.dig-select-repo{max-width:200px}',
      '.dig-select option,.dig-filter-select option{background:var(--dsw-alias-bg-layer-1,#22262e);color:var(--dsw-alias-label-primary,#e6e8ee)}',
      '.dig-select-branch{max-width:150px}',
      '.dig-repo-static{display:inline-flex;align-items:center;gap:5px;min-width:0;color:var(--dsw-alias-label-secondary)}',
      '.dig-repo-name{color:var(--dsw-alias-label-primary);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:200px}',
      '.dig-icon-btn{display:inline-flex;align-items:center;justify-content:center;width:24px;height:24px;border:none;border-radius:var(--dsw-radius-sm,8px);background:transparent;color:var(--dsw-alias-label-secondary);cursor:pointer;padding:0;flex:none}',
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
      '.dig-rail-btn{display:inline-flex;align-items:center;justify-content:center;width:24px;height:24px;border:none;border-radius:var(--dsw-radius-sm,8px);background:transparent;color:var(--dsw-alias-label-secondary);cursor:pointer;padding:0;flex:none}',
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
      '.dig-icon-btn-small{width:20px;height:20px;border-radius:var(--dsw-radius-xs,4px)}',
      // A panel dragged narrower than COMPACT_MAX_WIDTH (the compact chrome) is the
      // case where 'nowrap + ellipsis' stops being readable: the overlays clamp
      // their own width, and their text wraps inside that box instead of clipping.
      // The settings card (the host's plugin page renders it inside its own
      // section): one row per rail action, themed entirely by tokens.
      '.dig-settings{display:flex;flex-direction:column;gap:8px;min-width:0}',
      '.dig-settings-head{display:flex;flex-direction:column;gap:2px}',
      '.dig-settings-title{font-weight:600;color:var(--dsw-alias-label-primary)}',
      '.dig-settings-hint{color:var(--dsw-alias-label-tertiary);font-weight:400}',
      '.dig-settings-note{color:var(--dsw-alias-state-warn-primary,var(--dsw-alias-brand-primary));font-weight:400}',
      '.dig-settings-note-hidden{display:none}',
      '.dig-settings-error{color:var(--dsw-alias-state-error-primary);font-weight:400}',
      '.dig-settings-sub{margin-top:6px;font-weight:600;color:var(--dsw-alias-label-primary)}',
      '.dig-settings-text{display:flex;flex-direction:column;gap:3px;min-width:0}',
      '.dig-settings-text-label{color:var(--dsw-alias-label-secondary);font-weight:400}',
      '.dig-settings-input{width:100%;box-sizing:border-box;font:inherit}',
      '.dig-commit-ai{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:4px}',
      '.dig-commit-ai-hint{color:var(--dsw-alias-label-tertiary);font-size:11px}',
      '.dig-commit-ai-hint-block{flex:1 0 100%;font-size:11px}',
      '.dig-commit-ai-note{color:var(--dsw-alias-state-warn-primary,var(--dsw-alias-brand-primary));font-size:11px;margin-bottom:4px;word-break:break-word}',
      '.dig-settings-list{display:flex;flex-direction:column;gap:2px;max-height:min(46vh,360px);overflow:auto;padding:2px;border:1px solid var(--dsw-alias-hairline,var(--dsw-alias-border-l1));border-radius:var(--dsw-radius-sm,8px)}',
      '.dig-settings-row{display:flex;align-items:center;gap:8px;padding:3px 6px;border-radius:calc(var(--dsw-radius-sm,8px) - 2px);cursor:pointer;min-width:0}',
      '.dig-settings-row:hover{background:var(--dsw-alias-interactive-bg-hover)}',
      '.dig-settings-check{flex:none;accent-color:var(--dsw-alias-brand-primary)}',
      '.dig-settings-glyph{display:inline-flex;flex:none;color:var(--dsw-alias-label-secondary)}',
      '.dig-settings-label{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-weight:500}',
      '.dig-root-narrow .dig-settings-label{white-space:normal}',
      '.dig-root-narrow .dig-menu-item{white-space:normal}',
      '.dig-root-narrow .dig-toast-text{white-space:normal}',
      '.dig-toasts{position:absolute;right:8px;bottom:8px;display:flex;flex-direction:column;gap:6px;z-index:80;max-width:min(340px,92%)}',
      '.dig-toast{display:flex;align-items:center;gap:8px;padding:6px 8px;border-radius:var(--dsw-radius-sm,8px);background:var(--dsw-alias-bg-layer-2,var(--dsw-alias-bg-layer-1));border:0;box-shadow:var(--dsw-elevation-prominent,0 8px 22px rgba(0,0,0,.32))}',
      '.dig-toast-icon{display:inline-flex;flex:none;color:var(--dsw-alias-label-secondary)}',
      '.dig-toast-warn .dig-toast-icon{color:var(--dsw-alias-state-warn-primary,var(--dsw-alias-brand-primary))}',
      '.dig-toast-ok .dig-toast-icon{color:var(--dsw-alias-state-success-primary)}',
      '.dig-toast-text{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-weight:500}',
      '.dig-toast-action{border:none;background:transparent;color:var(--dsw-alias-brand-primary);font:inherit;font-weight:600;cursor:pointer;padding:0 2px;flex:none}',
      '.dig-toast-action:hover{text-decoration:underline}',
      '.dig-opchip{flex:none;padding:0 6px;border-radius:999px;corner-shape:round;background:color-mix(in srgb, var(--dsw-alias-state-warn-primary,var(--dsw-alias-brand-primary)) 20%, transparent);color:var(--dsw-alias-state-warn-primary,var(--dsw-alias-brand-primary));font-weight:500;white-space:nowrap}',
      '.dig-rail-list{display:flex;flex-direction:column;gap:2px;max-height:min(50vh,300px);overflow:auto;padding:2px;border:1px solid var(--dsw-alias-hairline,var(--dsw-alias-border-l1));border-radius:var(--dsw-radius-sm,8px)}',
      '.dig-rail-item{display:flex;align-items:center;gap:6px;padding:2px 4px;border-radius:calc(var(--dsw-radius-sm,8px) - 2px)}',
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
      // A divider: an 8px hit area (a fingertip needs it) painted as a 1px hairline
      // that lights up on hover, focus or while dragging. touch-action:none is what
      // makes a touch drag resize the pane instead of scrolling the panel.
      '.dig-gutter{flex:none;align-self:stretch;position:relative;z-index:1;touch-action:none;background:transparent;border:0;padding:0;cursor:col-resize}',
      '.dig-gutter-v{width:8px}',
      '.dig-gutter-h{height:8px;cursor:row-resize}',
      '.dig-gutter::after{content:"";position:absolute;background:var(--dsw-alias-hairline,var(--dsw-alias-border-l1));transition:background .12s ease}',
      '.dig-gutter-v::after{top:0;bottom:0;left:50%;width:1px;margin-left:-.5px}',
      '.dig-gutter-h::after{left:0;right:0;top:50%;height:1px;margin-top:-.5px}',
      '.dig-gutter:hover::after,.dig-gutter:focus-visible::after,.dig-gutter-active::after{background:var(--dsw-alias-brand-primary)}',
      '.dig-gutter:focus-visible{outline:1px solid var(--dsw-focus-ring-color,var(--dsw-alias-state-business-primary));outline-offset:-1px}',
      '.dig-pane-dragging,.dig-pane-dragging *{user-select:none}',
      '.dig-pane-dragging-v{cursor:col-resize}',
      '.dig-pane-dragging-h{cursor:row-resize}',
      '.dig-seg{display:inline-flex;gap:2px;padding:2px;border-radius:var(--dsw-radius-sm,8px);background:var(--dsw-alias-interactive-bg-hover);flex:none}',
      '.dig-seg-item{border:none;background:transparent;color:var(--dsw-alias-label-secondary);font:inherit;font-weight:500;padding:2px 10px;border-radius:calc(var(--dsw-radius-sm,8px) - 2px);cursor:pointer;white-space:nowrap}',
      '.dig-seg-item:hover{color:var(--dsw-alias-label-primary)}',
      '.dig-seg-item[data-active="true"]{background:var(--dsw-alias-bg-layer-2,var(--dsw-alias-bg-layer-1));color:var(--dsw-alias-label-primary)}',
      '.dig-search{padding:4px 6px;flex:none}',
      '.dig-input{width:100%;box-sizing:border-box;padding:4px 6px;border-radius:var(--dsw-radius-sm,8px);border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);font:inherit;outline:none}',
      '.dig-input::placeholder{color:var(--dsw-alias-label-tertiary)}',
      '.dig-input:focus{border-color:var(--dsw-alias-state-business-primary,var(--dsw-alias-brand-primary))}',
      '.dig-input-compact{padding:3px 6px}',
      '.dig-picker{display:flex;flex-direction:column;gap:2px;padding:12px;overflow:auto;flex:1;min-height:0}',
      '.dig-picker-title{color:var(--dsw-alias-label-primary);font-weight:600;margin-bottom:2px}',
      '.dig-picker-sub{color:var(--dsw-alias-label-tertiary);margin-bottom:8px;word-break:break-all}',
      '.dig-picker-row{display:flex;align-items:center;gap:8px;width:100%;text-align:left;border:1px solid var(--dsw-alias-border-l2);background:transparent;color:var(--dsw-alias-label-primary);font:inherit;padding:6px 8px;border-radius:var(--dsw-radius-sm,8px);cursor:pointer}',
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
      // The header became a DIV (it now holds buttons), and a div is content-box
      // while a button is border-box: without this, width:100% plus its own padding
      // overflowed the pane by 16px and clipped the last toolbar icon (reported on
      // v0.3.8).
      '.dig-changes-head{cursor:default;gap:2px;box-sizing:border-box}',
      '.dig-section-toggle{display:flex;align-items:center;gap:4px;flex:1;min-width:0;padding:0;border:none;background:transparent;color:inherit;font:inherit;font-weight:600;cursor:pointer;text-align:left}',
      '.dig-folder{display:flex;flex-direction:column}',
      '.dig-branch-folder{display:flex;flex-direction:column}',
      '.dig-row-picked{background:var(--dsw-alias-interactive-bg-active,var(--dsw-alias-interactive-bg-hover));color:var(--dsw-alias-label-primary)}',
      '.dig-folder-head{display:flex;align-items:center;gap:6px;width:100%;padding:1px 8px 1px 4px;border:none;background:transparent;color:var(--dsw-alias-label-secondary);font:inherit;font-size:11px;cursor:pointer;text-align:left}',
      '.dig-folder-head:hover{color:var(--dsw-alias-label-primary)}',
      '.dig-folder-name{flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
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
      '.dig-badge{font-size:10px;padding:0 5px;border-radius:999px;corner-shape:round;background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-secondary);flex:none}',
      '.dig-badge-muted{opacity:.8}',
      '.dig-badge-worktree{padding:0 3px;display:inline-flex;align-items:center;height:14px}',
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
      '.dig-ref{font-size:10px;padding:0 5px;border-radius:999px;corner-shape:round;background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-secondary);flex:none;max-width:130px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-weight:600}',
      '.dig-ref-head{color:var(--dsw-alias-state-success-primary)}',
      '.dig-ref-local{color:var(--dsw-alias-brand-primary)}',
      '.dig-ref-remote{color:#b083f0}',
      '.dig-ref-tag{color:var(--dsw-alias-state-warn-primary,var(--dsw-alias-brand-primary))}',
      '.dig-ref-more{color:var(--dsw-alias-label-tertiary)}',
      '.dig-filters{display:flex;align-items:center;gap:4px;padding:4px 6px;flex:none;min-width:0;overflow-x:auto;overflow-y:hidden;border-bottom:1px solid var(--dsw-alias-hairline,var(--dsw-alias-border-l1))}',
      '.dig-filter-text{flex:1 1 90px;min-width:80px;width:auto}',
      '.dig-filter-select{flex:none;max-width:118px;appearance:none;-webkit-appearance:none;background:transparent;border:1px solid var(--dsw-alias-border-l2);border-radius:var(--dsw-radius-sm,8px);color:var(--dsw-alias-label-secondary);font:inherit;font-weight:500;height:22px;padding:0 4px;cursor:pointer;text-overflow:ellipsis}',
      '.dig-filter-select:hover{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary)}',
      '.dig-filter-select{display:inline-flex;align-items:center;gap:3px}',
      '.dig-filter-label{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:96px}',
      '.dig-filter-on{color:var(--dsw-alias-brand-primary);border-color:var(--dsw-alias-brand-primary)}',
      '.dig-filter-path{flex:0 1 112px;min-width:70px;display:flex}',
      '.dig-load-more{margin:6px auto;display:block;padding:3px 12px;border-radius:var(--dsw-radius-sm,8px);border:1px solid var(--dsw-alias-border-l2);background:transparent;color:var(--dsw-alias-label-secondary);font:inherit;cursor:pointer}',
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
      '.dig-file-status-I{color:var(--dsw-alias-label-tertiary)}',
      '.dig-stat-add{color:var(--dsw-alias-state-success-primary);flex:none;font-variant-numeric:tabular-nums}',
      '.dig-stat-del{color:var(--dsw-alias-state-error-primary);flex:none;font-variant-numeric:tabular-nums}',
      '.dig-mini{display:inline-flex;align-items:center;justify-content:center;width:18px;height:18px;border:none;border-radius:var(--dsw-radius-xs,4px);background:transparent;color:var(--dsw-alias-label-secondary);cursor:pointer;opacity:0;flex:none;padding:0}',
      '.dig-row:hover .dig-mini{opacity:1}',
      '.dig-mini:hover{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary)}',
      '.dig-commit-box{flex:none;padding:6px;display:flex;flex-direction:column;gap:6px;border-top:1px solid var(--dsw-alias-hairline,var(--dsw-alias-border-l1))}',
      '.dig-commit-box-compact{flex-direction:row;align-items:center;gap:6px;padding:4px 6px;flex-wrap:wrap}',
      '.dig-textarea{width:100%;box-sizing:border-box;min-height:50px;resize:vertical;padding:5px 6px;border-radius:var(--dsw-radius-sm,8px);border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);font:inherit;outline:none}',
      '.dig-textarea::placeholder{color:var(--dsw-alias-label-tertiary)}',
      '.dig-textarea:focus{border-color:var(--dsw-alias-state-business-primary,var(--dsw-alias-brand-primary))}',
      '.dig-commit-actions{display:flex;align-items:center;gap:8px}',
      '.dig-check{display:inline-flex;align-items:center;gap:4px;color:var(--dsw-alias-label-secondary);cursor:pointer}',
      '.dig-btn{padding:3px 10px;border-radius:var(--dsw-radius-sm,8px);border:1px solid var(--dsw-alias-border-l2);background:transparent;color:var(--dsw-alias-label-primary);font:inherit;font-weight:500;cursor:pointer;flex:none}',
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
      '.dig-overlay{position:absolute;inset:0;padding:8px;box-sizing:border-box;background:var(--dsw-alias-bg-mask-1,rgba(0,0,0,.42));-webkit-backdrop-filter:var(--dsw-mask-blur,none);backdrop-filter:var(--dsw-mask-blur,none);display:flex;align-items:center;justify-content:center;z-index:60}',
      '.dig-dialog{box-sizing:border-box;min-width:min(240px,100%);max-width:min(420px,94%);max-height:100%;overflow:auto;background:var(--dsw-alias-bg-layer-2,var(--dsw-alias-bg-layer-1));border:0;border-radius:var(--dsw-radius-panel,28px);padding:14px;display:flex;flex-direction:column;gap:10px;box-shadow:var(--dsw-elevation-prominent,0 12px 32px rgba(0,0,0,.35))}',
      '.dig-dialog-wide{min-width:min(360px,92%)}',
      '.dig-dialog-title{font-weight:600}',
      '.dig-dialog-text{color:var(--dsw-alias-label-secondary);white-space:pre-wrap}',
      '.dig-dialog-actions{display:flex;justify-content:flex-end;gap:8px}',
      '.dig-dialog-actions .dig-btn-primary{margin-left:0}',
      '.dig-menu{position:absolute;z-index:70;box-sizing:border-box;min-width:min(200px,calc(100% - 8px));max-width:calc(100% - 8px);max-height:calc(100% - 8px);padding:4px;border:0;border-radius:var(--dsw-radius-md,12px);background:transparent;box-shadow:var(--dsw-elevation-prominent,0 10px 28px rgba(0,0,0,.35));--dsw-elevation-stroke-color:var(--dsw-alias-border-l1);isolation:isolate;display:flex;flex-direction:column}',
      '.dig-menu::before{content:"";position:absolute;inset:0;z-index:-1;border-radius:inherit;background:var(--dsw-specific-menu,var(--dsw-alias-bg-layer-2,var(--dsw-alias-bg-layer-1)));-webkit-backdrop-filter:var(--dsw-menu-backdrop-filter,blur(14px) saturate(1.2));backdrop-filter:var(--dsw-menu-backdrop-filter,blur(14px) saturate(1.2));pointer-events:none}',
      '.dig-menu-scroll{flex:1;min-height:0;overflow:auto;overscroll-behavior:contain;display:flex;flex-direction:column}',
      '.dig-menu-item{display:flex;align-items:center;gap:8px;padding:4px 8px;border:none;background:transparent;color:var(--dsw-alias-label-primary);font:inherit;font-weight:500;text-align:left;border-radius:var(--dsw-radius-sm,8px);cursor:pointer;white-space:nowrap;overflow:hidden}',
      '.dig-menu-icon{display:inline-flex;flex:none}',
      '.dig-menu-label{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis}',
      '.dig-menu-item:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover)}',
      '.dig-menu-item-active{color:var(--dsw-alias-state-warn-primary,var(--dsw-alias-brand-primary))}',
      '.dig-menu-danger,.dig-menu-danger .dig-menu-label{color:var(--dsw-alias-state-error-primary)}',
      '.dig-menu-disabled{opacity:.38;cursor:default}',
      '.dig-menu-sep{height:1px;margin:3px 6px;background:var(--dsw-alias-hairline,var(--dsw-alias-border-l1))}',
    ].join('\n')

    /* ============================== plugin ============================== */

    /* The native right-sidebar seats need three names: the registration id (a
       package name is the natural value, and it is also the seat key the body
       registers under), the tab kind (unique across kinds — the shipped `git`
       kind is not ours to take), and the guide capsule that opens the tab. */
    const NATIVE_ID = 'dsh-ide-git'
    const NATIVE_KIND = 'ide-git'
    const NATIVE_WORKSPACE_ITEMS = (state) => state.items

    /* The native seat hands a tab the standard props; the panel wants
       `{ scope, t }`. A session's working directory is the path of the
       workspace that accounts for it — the same value the better-sidebar seat
       delivers as `scope.cwd`. */
    /* DSH's locale service notifies on every snapshot change, and its own
       components re-render on that. The panel is not one of DSH's components,
       so it subscribes for itself: a language switch then repaints the panel
       instead of waiting for the next page load. Everything the panel draws is
       inside this wrapper — the better-sidebar tab and the native seat both go
       through it. */
    function LocaleLive(props) {
      const [tick, setTick] = useState(0)
      useEffect(() => {
        const locale = props.ctx === undefined ? undefined : props.ctx.get('locale')
        if (locale === undefined || typeof locale.subscribe !== 'function') return undefined
        const unsubscribe = locale.subscribe(() => { setTick((value) => value + 1) })
        return typeof unsubscribe === 'function' ? unsubscribe : undefined
      }, [])
      void tick
      /* Read at RENDER time (the service may arrive after this plugin's apply) and
         soft: a host without the plugin page simply keeps the in-panel editor. */
      let navigation
      try {
        navigation = props.ctx === undefined || props.ctx === null ? undefined : props.ctx.get('pluginNavigation')
      } catch (error) { navigation = undefined }
      const openSettings = navigation !== undefined && navigation !== null && typeof navigation.openBundle === 'function'
        ? () => { navigation.openBundle(SETTINGS_BUNDLE) }
        : null
      return E(Panel, { scope: props.scope, t: props.t, visible: props.visible, dock: props.dock, openSettings: openSettings })
    }

    function NativePanel(props) {
      const workspaces = typeof props.useWorkspaces === 'function'
        ? props.useWorkspaces(NATIVE_WORKSPACE_ITEMS)
        : null
      const sessionId = typeof props.sessionId === 'string' ? props.sessionId : 'default'
      let cwd
      if (Array.isArray(workspaces)) {
        for (const item of workspaces) {
          if (item === null || typeof item !== 'object') continue
          if (!Array.isArray(item.sessionIds) || item.sessionIds.indexOf(sessionId) < 0) continue
          if (typeof item.path === 'string' && item.path !== '') cwd = item.path
          break
        }
      }
      const scope = useMemo(() => ({ cwd: cwd, sessionId: sessionId }), [cwd, sessionId])
      /* The dock actions need this tab's own identity, which only the native seat
         binds; the better-sidebar door has no sidebarRight tab id and therefore
         wires nothing (a panel hosted elsewhere must not float a foreign tab). */
      const dock = readDockInfo(props.useTabInfo, props.ctx)
      return E(LocaleLive, { ctx: props.ctx, scope: scope, t: props.t, visible: true, dock: dock })
    }

    function apply(ctx) {
      const style = document.createElement('style')
      style.setAttribute('data-dsh-ide-git', '')
      style.textContent = CSS
      document.head.appendChild(style)
      ctx.effect(() => () => { style.remove() }, 'dsh-ide-git: panel styles')

      const t = translatorOf(ctx)

      /* DSH's own locale registry: bind this plugin's namespace so host-side
         consumers read exactly the copy the panel does. Every shipped
         dictionary rides this one call; a missing service (standalone
         compositions) simply means the panel is the only reader. */
      const localeService = ctx.get('locale')
      if (localeService !== undefined && typeof localeService.register === 'function') {
        ctx.effect(
          () => localeService.register(LOCALE_NS, Object.assign({ zh: ZH, en: EN }, LOCALES)),
          'dsh-ide-git: locale dictionaries',
        )
      }

      /* Two doors, one panel. dsh-better-sidebar also carries the bottom
         workbench, so wherever it is loaded it stays the host; the native
         right-sidebar seats are the fallback for a host running this plugin on
         its own — registering both would draw the same panel twice in one
         column, so a late-arriving better-sidebar takes the native one down. */
      let nativeFiber = null
      let hostedByBetterSidebar = false

      /* WAIT for both native seats instead of probing with ctx.get(): on a
         host without better-sidebar this apply can run BEFORE ui-sidebar-right
         provides the registry, and the old synchronous probe returned
         silently — the native seats were then never registered (reproduced
         on a clean instance and on the desktop app: the right sidebar showed
         no Git card and the console stayed empty). ctx.inject() retries the
         registration the moment the services appear. */
      const hostNatively = () => {
        if (nativeFiber !== null) return
        nativeFiber = ctx.inject(['sidebarRightTabs', 'slots'], (nativeCtx) => {
          const tabs = nativeCtx.get('sidebarRightTabs')
          const slots = nativeCtx.get('slots')
          if (tabs === undefined || typeof tabs.register !== 'function') return
          if (slots === undefined || typeof slots.inject !== 'function') return
          nativeCtx.effect(() => {
            const offType = tabs.register({
              id: NATIVE_ID,
              kind: NATIVE_KIND,
              title: () => t('title'),
              guide: [{
                id: 'git',
                order: 21,
                title: () => t('title'),
                description: () => t('description'),
                icon: (iconProps) => E(Icon, {
                  name: 'commit',
                  size: iconProps === undefined || iconProps.size === undefined ? 16 : iconProps.size,
                }),
              }],
            })
            const offBody = slots.inject('sidebar.right.pane.tab', () => slots.register(
              { name: 'sidebar.right.pane.tab', key: NATIVE_ID },
              (tabProps) => E(NativePanel, Object.assign({}, tabProps, { t: t, ctx: ctx })),
            ))
            return () => {
              try { offBody() } catch (error) { void error }
              try { offType() } catch (error) { void error }
            }
          }, 'dsh-ide-git: native right-sidebar seats')
        })
      }

      const takeNativeDown = () => {
        if (nativeFiber === null) return
        const fiber = nativeFiber
        nativeFiber = null
        void Promise.resolve(fiber.dispose()).catch((error) => { void error })
      }

      ctx.inject(['betterSidebar'], (tabCtx) => {
        const betterSidebar = tabCtx.get('betterSidebar')
        if (betterSidebar === undefined || typeof betterSidebar.registerTab !== 'function') return
        hostedByBetterSidebar = true
        takeNativeDown()
        tabCtx.effect(() => {
          const offTab = betterSidebar.registerTab({
            id: TAB_ID,
            title: () => t('title'),
            description: () => t('description'),
            icon: (size) => E(Icon, { name: 'commit', size: size === undefined ? 16 : size }),
            order: 21,
            single: true,
            component: (tabProps) => E(LocaleLive, {
              ctx: ctx,
              scope: tabProps.scope,
              t: t,
              visible: tabProps.visible,
            }),
          })
          /* The base can go away at RUNTIME (disabled in the plugin panel, or
             uninstalled): cordis unloads this effect when the service
             disappears, and the panel must fall back to the native
             right-sidebar seats instead of vanishing with the base. The
             same inject re-fires when the service returns, and the
             callback above takes the native seats down again. */
          return () => {
            try { offTab() } catch (error) { void error }
            hostedByBetterSidebar = false
            hostNatively()
          }
        }, 'dsh-ide-git: Git tab')
      })

      /* ctx.inject runs its callback straight away when the service is already
         there, so only a host without better-sidebar reaches the native seats. */
      if (!hostedByBetterSidebar) hostNatively()

      /* ---- settings: the row Config is the rail's source of truth ---- */
      /* dsh >= 0.1.7 serves a plugin's row Config to the browser through
         ctx.configForms; from then on the settings card and the rail read that one
         document (and the legacy localStorage value is migrated once). A host
         without the service never fires this callback: railForm stays null and the
         localStorage home + in-panel editor keep working there. */
      ctx.inject(['configForms'], (formCtx) => {
        const forms = formCtx.get('configForms')
        if (forms === undefined || forms === null || typeof forms.get !== 'function') return
        let form
        try { form = forms.get(RAIL_NS) } catch (error) { void error }
        if (form === undefined || form === null || typeof form.getSnapshot !== 'function') return
        formCtx.effect(() => {
          railForm = form
          migrateRailConfig(form)
          /* The row Config is still 'loading' at bind time, so the migration is
             attempted here AND on every notification until it lands — it is
             idempotent (marker-gated, re-entrancy-guarded) and only stamps the
             marker once the Host accepted the write. */
          const unsubscribe = typeof form.subscribe === 'function' ? form.subscribe(() => { notifyRailConfig(); migrateRailConfig(form) }) : undefined
          notifyRailConfig()
          return () => {
            railForm = null
            if (typeof unsubscribe === 'function') unsubscribe()
            notifyRailConfig()
          }
        }, 'dsh-ide-git: row config')
      })

      /* The settings card, on both official seats: the plugin's detail page
         (keyed by the PACKAGE name) and Settings → Plugins (keyed by the settings
         namespace = the loader row id). Both seats are optional — a host without
         the slots keeps whatever surface it has. */
      ctx.inject(['slots'], (slotCtx) => {
        const slots = slotCtx.get('slots')
        if (slots === undefined || slots === null || typeof slots.inject !== 'function') return
        slotCtx.effect(() => {
          const card = (cardProps) => E(RailSettingsCard, Object.assign({}, cardProps, { t: t }))
          const offBundle = slots.inject('plugins.bundle.config', () => slots.register(
            { name: 'plugins.bundle.config', key: SETTINGS_BUNDLE, locale: LOCALE_NS },
            card,
          ))
          const offItem = slots.inject('settings.plugin.item', () => slots.register(
            { name: 'settings.plugin.item', key: RAIL_NS, locale: LOCALE_NS },
            card,
          ))
          return () => {
            try { offBundle() } catch (error) { void error }
            try { offItem() } catch (error) { void error }
          }
        }, 'dsh-ide-git: settings card')
      })
    }

    return { name: 'dsh-ide-git', inject: [], apply }
  },
})
