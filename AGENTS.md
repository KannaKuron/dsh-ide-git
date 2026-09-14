# AGENTS.md

面向后续在本仓库继续开发的 Agent / 贡献者。读完再动手。

## 项目一句话

「dsh-ide-git」:DSH 插件(dsh-better-sidebar 消费插件),把 IDE(JetBrains)风格的 Git 工具窗口做成侧边栏原生 Tab——分支树 + 提交图谱 + 变更/提交 + 提交详情;右侧栏(窄高)与底部工作台(宽扁)同一注册、两种布局。

## 环境与工具

- GitHub 操作一律用 gh(已认证 KannaKuron)。**本仓库当前不接 npm 发包**:没有 npm-publish 工作流,也不要在没有明确指令时新增发布工作流(用户明确要求:功能稳定后再谈发版)。
- CI(`.github/workflows/ci.yml`)只跑 `npm test`(冒烟 + api 两层),不发布任何东西。
- 本机联调:仓库目录加入 web profile 依赖 + 挂载 `cordis.patch.yml` 的 insert 行 → 重启 `dsh web`(客户端半改动由 DSH 热加载,宿主半改动必须重启)。

## 变更记录纪律

- **所有版本发布、修复、事故复盘、复现/验证记录一律写进 `CHANGELOG.md`**,不追加进本文件;本文件只保留仍然有效的规则、不变量与当前事实。
- 条目格式:倒序;`## vX.Y.Z — YYYY-MM-DD` + 类型(feat / fix / docs / chore)+ 要点 bullet + 相关链接。
- 发版时:`npm version` 会经 `scripts.version` 同步 `dsh.plugin.json` 的 version(`package.json` 与 `dsh.plugin.json` 版本必须一致,冒烟测试强制)。

## 目录地图

| 路径 | 作用 |
|---|---|
| src/index.js | **宿主半**:`/dsh-ide-git/api` 前缀路由 + git 方法表(argv-only spawn)、参数校验、信任围栏、confirm 守卫 |
| src/client.js | **客户端半(全部 UI)**:`window.__ModuleLoader__.load` 包装;注册 better-sidebar Tab;Panel 组件含分支树 / 图谱 / 变更 / 详情 / 右键菜单 / 弹窗 / 样式 |
| cordis.patch.yml | dsh plugin add 官方安装通道的挂载声明(insert 一行 `ide-git`) |
| dsh.plugin.json | 插件注册表清单(id `dsh-external/dsh-ide-git`) |
| tests/smoke.mjs | 文件级冒烟测试(无 Cordis runtime、无浏览器):清单一致性 / 客户端包装 / 基线 require 白名单 / 确认守卫 / 方法表一致性 |
| tests/api.test.mjs | 集成测试:临时真实仓库 + 伪造 cordis ctx 与 HTTP req/res,直驱宿主路由(解析 / 变更 / 全部守卫) |
| docs/screenshots/ | README 截图(待补) |

## 核心不变量(改代码前必读)

1. **无构建、单文件客户端**。`src/client.js` 必须保持 `window.__ModuleLoader__.load({ id, factory })` 包装;只能 require DSH 客户端基线模块(当前仅 `react`),冒烟测试用白名单强制执行。禁止 `import`、禁止新增第二个 client entry。
2. **宿主半只 import `node:` 内置模块**(当前:`node:child_process` 的 `spawn`、`node:path`)。冒烟测试强制。
3. **git 调用永远是 argv 数组**:`spawn(gitBinary(), args, { cwd })`,禁止 `exec` / `shell: true` / 字符串拼接命令;用户输入先过 `requireAbsolute` / `requireRef`(不以 `-` 开头、无空白与控制字符)/ `requireRelativePath`(不越出仓库)。新增方法必须走同一套校验。
4. **破坏性操作必须 `confirm: true`**:push、`reset --hard`、`branch -D`、丢弃未跟踪文件(`clean`)、`stash drop`。UI 侧对应动作一律先弹 ConfirmDialog。冒烟测试校验这些守卫字符串存在。
5. **两条信任围栏**:宿主路由只服务 loopback Host 或 `Sec-Fetch-Site: same-origin/same-site` 的请求;任何新路由都必须先过 `isTrusted(req)`,再检查 method 为 POST。
6. **better-sidebar 契约**:用 `ctx.betterSidebar.registerTab` 注册,**必须包在 `ctx.effect(() => ...)` 里**(否则 HMR/禁用后残留注册,再次激活抛 already registered);`inject: ['betterSidebar']` 声明依赖;`id` 用 `dsh-ide-git:panel`(单例 `single: true`);标题/描述用函数形式以跟随语言切换。
7. **双面布局用测量而不是猜测**。`TabComponentProps` 不携带「我在右栏还是底部面板」的信息,所以布局只依赖容器尺寸:`width >= 640 && width >= height * 1.5` → `columns`(三栏),否则 `stack`(纵向)。不要引入「按面板类型」的分支,也不要硬编码高度。
8. **服务只在 client 半**。宿主半没有 `ctx.betterSidebar`;宿主侧要读侧栏状态只能走它自己的 `/sidebar/*` 路由。本插件的宿主半不依赖 better-sidebar,缺失时客户端注册静默跳过(peerDependency 是 optional)。
9. **版本两处一致**:`package.json` 与 `dsh.plugin.json` 的 version 必须相同(冒烟测试强制);`files[]` 里列出的每个文件都必须真实存在。

## 与 dsh-better-sidebar 生态的关系

- 插件要进 better-sidebar 设置页的「侧边卡片」分区/推荐目录,靠的是:注册 Tab 时提供 `title` / `description` / `icon`(卡片自动生成),以及仓库打好 `dsh-better-sidebar` topic。推荐目录本身维护在 better-sidebar 仓库的 `src/client/plugins-tabs.ts`,收录需要向该仓库提 PR。
- 本插件与内置 `git` Tab(「文件变动」)是互补关系:内置管暂存/提交/还原/历史,本插件管分支树、图谱、提交详情与更全的分支/提交操作。