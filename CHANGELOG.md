# Changelog — dsh-ide-git

> 倒序排列,新版本条目在最上面。条目格式:`## vX.Y.Z — YYYY-MM-DD` + 类型(feat / fix / docs / chore)+ 要点 + 相关链接。
> 纪律见 AGENTS.md「变更记录纪律」:发版前先更新本文件并随版本提交。

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