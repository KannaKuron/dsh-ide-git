# Changelog — dsh-ide-git

> 倒序排列,新版本条目在最上面。条目格式:`## vX.Y.Z — YYYY-MM-DD` + 类型(feat / fix / docs / chore)+ 要点 + 相关链接。
> 纪律见 AGENTS.md「变更记录纪律」:发版前先更新本文件并随版本提交。

## v0.1.5 — 2026-09-14

**类型**:fix

- **底部面板恢复横向三栏(真机反馈)**:v0.1.3 的紧凑判定把「高度 < 330px」也算作紧凑,于是 1500×300 的底部工作台被判成单栏(分段切换 + 折叠分支树),看起来和右侧栏一个样。现在**宽度说了算**:`width ≥ 600 且 width ≥ height × 1.15` 即走三栏(分支树 | 图谱 | 变更);只有极窄(`< 400`)或极矮(`< 200`)的容器才退回紧凑 chrome。右侧栏(窄而高)仍旧是纵向堆叠,不变。
## v0.1.4 — 2026-09-14

**类型**:fix

- **默认字体加粗(真机反馈)**:面板此前沿用 `font: var(--dsw-font-xs-12)` 的常规字重,在薄字重主题下显得发虚。根容器改为显式 `font-family: var(--dsw-font-family)` + `12.5px` + `font-weight: 500`,提交主题 / 分支名 / 行标签 / 作者 / 时间 / 按钮 / 下拉 / 分段控件 / 空态一律 500(分组标题与分区标题维持 600),diff 字号 11 → 11.5px 并同样加粗。
## v0.1.3 — 2026-09-14

**类型**:feat

- **主题适配(真机反馈)**:面板此前自带不透明底色,在透明主题 + dsh-any-background 背景图下糊成一块灰。现在所有表面(根容器、行、下拉、输入、diff 行、弹窗、菜单)一律走 `--dsw-alias-*` 设计令牌,根容器 `background: transparent`,背景插件与主题怎么设就怎么显示;diff 增删用 `color-mix()` 把 `state-success/error` 令牌混成半透明底。
- **仓库发现与选择(真机反馈)**:工作区不是 Git 仓库时不再甩红报错。宿主新增 `repos` 方法——工作区自身是仓库就列出它,否则扫描其子目录(深度 2,跳过 node_modules/dist 等,上限 40 个)找出嵌套仓库;客户端把这些渲染成仓库选择器(空态列表)与顶部仓库下拉,选择按会话记在 localStorage;`repoRoot` 随 `summary/branches/log/diff` 等请求下发,绑定到选中的仓库。非仓库状态由宿主以 `not-a-repo` 错误码表达,不再是 git 的 fatal 文本。
- **紧凑布局(真机反馈)**:底部面板这种矮容器里,原来工具栏 + 状态行 + 三栏把按钮挤没了。新增 `compact` chrome:容器高度 < 330px 或宽度 < 470px 时改为单行头部(仓库/分支下拉 + 图标按钮)+ 变更/历史分段切换 + 单行提交框;宽高足够的容器保留三栏,窄高的保留纵向堆叠。
- 顶部新增仓库下拉与分支下拉:多仓库一键切换,分支下拉直接 checkout(与分支树右键等价)。
## v0.1.2 — 2026-09-14

**类型**:fix

- **修复真机首屏崩**:客户端半 `dictionaryOf()` 返回的是词典对象,却被当成 `t(key)` 函数调用(`title` / `description` 与面板内全部文案都经过它),better-sidebar 的错误边界因此捕获到 `dsh-better-sidebar: t is not a function` 并整页降级。现在显式构造 `const t = (key) => ...` 查表函数;语言探测在拿不到 locale 服务时回退 `navigator.language`。
- **安装形态改为 `dsh.profile.bundles` 挂载**:此前在 profile 的 `cordis.patch.yml` 手写 insert 行,与包自带的 `dsh.bundle.patch` 叠加,更新流程会组合出 `duplicate loader entry id ide-git (2 rows)` 并回滚。现在与 dsh-better-workspace 等插件一致,只保留 bundles 一条路径。
- 新增 SSR 渲染自检(本地 harness,用 profile 的 react / react-dom/server 真渲染 Tab 组件):断言模块注册、`inject`、tab 描述符与骨架 DOM,避免同类渲染回归。
## v0.1.1 — 2026-09-14

**类型**:test

- 新增真实 git 集成测试 `tests/api.test.mjs`(12 例):在临时目录建一个真实仓库,伪造 cordis ctx 与 HTTP req/res 直接驱动宿主路由,覆盖解析(porcelain -z / numstat -z / log 记录格式)、变更(暂存/取消暂存/提交/分支重命名与删除/标签/比较/stash 全链路)与全部守卫(confirm、ref 注入 `--force`、路径逃逸 `../..`、未知方法 404、跨站 403 与同源远程放行)。`npm test` 现在跑两层(smoke + api),CI 不变(仍只跑测试,不发布)。

## v0.1.0 — 2026-09-14

**类型**:feat

- **首个版本**。以 dsh-better-sidebar 原生 Tab 形式注册的 IDE 级 Git 工具窗口:
  - 宿主半 `src/index.js`:前缀路由 `/dsh-ide-git/api`,29 个方法(summary / branches / log / commitDetail / diff / compare / stage / unstage / discard / commit / checkout / branchCreate / branchRename / branchDelete / merge / rebase / cherryPick / revert / reset / fetch / pull / push / stashList / stashPush / stashApply / stashDrop / tagCreate / tagDelete / version)。全部走 `spawn('git', argv)`,无 shell 字符串;参数校验 + loopback/同源信任围栏;push、硬重置、强制删分支、丢弃未跟踪文件、删除 stash 一律要求 `confirm: true`。
  - 客户端半 `src/client.js`:无构建单文件,只 require `react`。分支树(HEAD/本地/远程/标签 + ahead-behind + worktree 标记 + 右键操作)、提交图谱(lane 拓扑 + refs 徽章 + 过滤 + 分页)、提交详情(逐行 diff)、变更四组(冲突/已暂存/更改/未跟踪 + 行内暂存/取消暂存/丢弃)、提交框(Ctrl+Enter 提交 / --amend)、工具条(刷新/新建分支/Fetch/Pull/Push)。
  - **双面自适应布局**:同一个注册同时出现在 DSH 原生右侧栏(窄高,纵向堆叠)与 better-sidebar 底部工作台(宽扁,三栏),按容器尺寸经 ResizeObserver 切换,不猜测所在面板。
  - 中英双语词典(跟随 DSH locale 服务)。
- 仓库基建:MIT、`cordis.patch.yml` 挂载声明、`dsh.plugin.json` 清单、文件级冒烟测试(清单一致性 / 客户端包装 / 基线 require 白名单 / 确认守卫 / 方法表一致性)、CI 仅跑冒烟测试(**暂不接 npm 发包**)。

**已知边界**:暂无多选批量操作、部分提交(changelist)、交互式变基、补丁、冲突编辑器、blame/文件历史、插件自有设置项;桌面客户端未真机验证。