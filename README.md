# dsh-ide-git

> 给 [DeepSeek Harness (DSH)](https://github.com/deepseek-ai/deepseek-harness) 的侧边栏装一个 **IDE 级的 Git 工具窗口**——左边分支树、中间提交图谱、右边变更与提交详情,操作方式对齐 JetBrains 系 IDE 的 Git 面板;以 [dsh-better-sidebar](https://github.com/omdsh-dev/DSH-better-sidebar) 原生 Tab 的形式注册,右侧栏与底部面板都能用。

DSH 自带的 Git 面板覆盖「暂存 / 提交 / 还原 / 看历史」;`dsh-ide-git` 补齐 IDE 用户习惯的那一层:**分支树 + 右键分支操作 + 提交图谱 + 提交详情 + 变更列表 + 提交框**。

## 它解决什么

- **分支管理没有树**:内置面板只有一个分支下拉。这里给出 `HEAD(当前分支) / 本地 / 远程 / 标签` 的分组树,每个分支带 ahead/behind 角标、上游、worktree 占用标记(`W`)。
- **历史只是列表**:这里画出提交图谱(lane 拓扑 + 分支/标签 ref 徽章),支持加载更多与过滤(文本 / 哈希 / 作者)。
- **想看某个提交改了什么**:点提交直接进详情——作者、日期、完整提交信息、变更文件(含 +/− 行数),点文件看逐行 diff(红绿 + 行号 + hunk 高亮)。
- **想比较分支**:分支右键即可与当前分支比较,结果按文件与提交数汇报。
- **操作要够全**:签出、从任意分支/提交新建分支、重命名、删除、合并到当前、变基当前到此、新建标签、cherry-pick、还原提交、重置(保留/丢弃)、fetch / pull --ff-only / push(确认后)。

## 布局:右侧栏与底部面板不一样,这是刻意的

dsh-better-sidebar 0.19.x 里,同一个 Tab 注册会出现在两个完全不同的面上:

| 面 | 归属 | 形态 | 本插件的布局 |
|---|---|---|---|
| 右侧栏 | **DSH 原生右侧栏**(插件注册的 Tab 被桥接成原生 Tab) | 窄而高 | `stack`:变更区在提交历史之上,分支树可收起,详情/差异占满主区 |
| 底部面板 | **dsh-better-sidebar 自有工作台** | 宽而扁 | `columns`:`分支树 | 提交图谱 | 变更与提交框` 三栏并排——就是 JetBrains Git 工具窗口的样子 |

插件不猜自己在哪儿,而是用 `ResizeObserver` 量自己的容器:宽 ≥ 640px 且宽高比 ≥ 1.5 走三栏,否则走纵向堆叠。自由浮窗、移动端抽屉同样自适应。

## 功能一览

| 区域 | 能力 |
|---|---|
| 动作条 | IDEA 式左侧竖排(底部工作台)/ 顶栏下一行横排(右侧栏):刷新、新建分支、签出、删除、比较、显示差异、贮藏、新建标签、收藏、抓取、拉取、推送。**按可用空间自动决定放几个**,放不下的收进 `⋯ 更多`;末尾 `⚙ 设置` 可拖动排序、逐项显隐(存 `dsh-ide-git.rail.v1`)。每个按钮按当前状态点亮/置灰(没有其他分支就不能删除/签出/比较,没有远程就不能抓取/推送,没有上游就不能拉取,没有变更就没有差异可看) |
| 状态行 | 当前分支、上游、`↑ahead ↓behind`、stash 数量、忙碌指示 |
| 分支树 | `HEAD / 本地 / 远程 / 标签` 分组(可折叠)、过滤框、星标当前分支、ahead/behind 角标、worktree 占用标记;本地蓝 / 远程紫 / 标签黄 / HEAD 绿 |
| 分支右键 | 签出、将当前分支变基到此、合并到当前分支、与当前分支比较、从该分支新建分支、重命名、删除(当前分支禁用)、更新(Fetch)、推送 |
| 历史筛选 | 文本或哈希、分支或标签、提交人、日期(今天 / 近 7 天 / 近 30 天 / 今年),外加排序方向(新→旧 / 旧→新)与一键清除;路径筛选回车后由 git 服务端过滤(`git log -- <path>`) |
| 提交列表 | 列序对齐 IDEA:**日期 → 提交人 → 图谱 → 分支标签 → 提交信息**;lane 拓扑图整格连线(相邻行像素对齐)、HEAD 空心点、refs 徽章(HEAD 绿 / 本地蓝 / 远程紫 / 标签黄,最多 3 个 + `+n`)、加载更多(每页 120) |
| 提交右键 | 提交详情、复制修订号、签出该修订(确认)、在此新建分支、新建标签、cherry-pick、还原提交、重置到此(保留 / 丢弃更改) |
| 提交详情 | 完整提交信息、作者/日期、变更文件列表(+/−),点文件看逐行 diff |
| 变更列表 | 冲突 / 已暂存 / 更改 / 未跟踪 四组,行内 暂存 / 取消暂存 / 丢弃,分组级「全部暂存 / 全部取消暂存」,点击行看 diff |
| 提交框 | 多行提交信息、`Ctrl+Enter`(macOS `Cmd+Enter`)提交、修补上次提交(`--amend`) |
| 文件右键 | 显示差异、暂存/取消暂存、丢弃更改、复制路径 |

## 安装

`@sh
# 先装底座(本插件的前置)
dsh plugin --profile web add dsh-better-sidebar
# 再装本插件(GitHub 直装;npm 包名与仓库名一致,发布后可用 dsh-ide-git)
dsh plugin --profile web add "github:KannaKuron/dsh-ide-git"
# 重启 dsh web
`@

装好后打开任意会话:

- **底部面板**:会话头右侧的面板开合按钮 → 面板 Tab 条右侧 `+` → 选 **Git**;
- **右侧栏**:原生右侧栏的 `+` → 选 **Git**(同一注册,同一份状态);
- 也可以在 better-sidebar 设置页的 **侧边卡片** 分区里看到本插件的卡片(标题 / id / 启用开关),随时停用。

## 工作原理

`@
宿主半 src/index.js                       客户端半 src/client.js
  POST /dsh-ide-git/api/<method>            ctx.betterSidebar.registerTab({ id: 'dsh-ide-git:panel' })
  └─ spawn('git', argv, { cwd })            └─ Panel:ResizeObserver → columns / stack
     └─ 会话工作区 = cwd(客户端 scope.cwd 传入)
`@

- **宿主半**:一个前缀路由 `/dsh-ide-git/api`,方法表 29 个(`summary` / `branches` / `log` / `commitDetail` / `diff` / `compare` / `stage` / … / `push` / `tagDelete` / `version`)。所有 git 调用都是 **argv 数组 + `spawn`**(没有 shell 字符串、没有 `exec`),参数先过校验(绝对路径、ref 不以 `-` 开头、无控制字符、路径不越出仓库)。
- **客户端半**:无构建、单文件、`window.__ModuleLoader__.load({ id, factory })` 包装,只 `require('react')`(DSH 客户端基线模块白名单内)。
- **信任围栏**:路由挂在 DSH 自己的 web server 上,天然同源;只有 Host 为 loopback,或浏览器标记 `Sec-Fetch-Site: same-origin/same-site` 的请求才会被服务。
- **破坏性操作**:`push` / 硬重置 / 强制删分支 / 丢弃未跟踪文件 / 删除 stash 都必须显式 `confirm: true`,UI 侧一律弹二次确认。

## 限制与路线图

- **v0.1.0 只覆盖主路径**:分支树 + 图谱 + 变更 + 提交 + 详情 + 常用分支/提交操作。下面的还在路上:
  - 变更/提交的**多选与批量操作**、按文件部分提交(类似 IDEA 的 Changelist);
  - 交互式变基(`rebase -i`)、fixup/squash、补丁(format-patch/apply);
  - 三方合并冲突编辑器、冲突解决动作(接受本地/远端);
  - blame / 文件历史视图、行级注释;
  - 设置页的插件自有开关(提交后自动刷新、diff 上下文行数等);
  - worktree 视图(当前只在分支行标注占用)。
- **只面向 `web` profile**:`dsh.client.platform` 为 `web`;桌面客户端的 renderer 复用同一套 shell 资产,但尚未真机验证。
- **不写 `.git`**:所有操作都通过 `git` 命令走正常索引/引用,插件不直接改 `.git` 内部文件。
- **大仓库**:提交列表分页(120/页),diff 输出上限 400KB(超出截断并标记)。

## 开发

`@sh
npm test      # 两层:smoke(文件级:清单一致性、客户端包装、白名单、确认守卫、方法表)
              #      + api(临时真实仓库直驱宿主路由:解析、暂存/提交/分支/标签/stash、全部守卫与信任围栏)
`@

本机联调:把仓库加到 web profile 后重启 `dsh web`;客户端半改动由 DSH 热加载,宿主半改动需要重启。

## 许可

MIT © KannaKuron