# AGENTS.md

面向后续在本仓库继续开发的 Agent / 贡献者。读完再动手。

## 项目一句话

「dsh-ide-git」:DSH 插件(dsh-better-sidebar 消费插件),把 IDE(JetBrains)风格的 Git 工具窗口做成侧边栏原生 Tab——分支树 + 提交图谱 + 变更/提交 + 提交详情;右侧栏(窄高)与底部工作台(宽扁)同一注册、两种布局。

## 环境与工具

- GitHub 操作一律用 gh(已认证 KannaKuron)。**本仓库当前不接 npm 发包**:没有 npm-publish 工作流,也不要在没有明确指令时新增发布工作流(用户明确要求:功能稳定后再谈发版)。
- CI(`.github/workflows/ci.yml`)只跑 `npm test`(冒烟 + api 两层),不发布任何东西。
- 本机联调:把包名加进 profile 的 `dsh.profile.bundles`(依赖指向仓库里的 tarball)→ 客户端半改动硬刷新页面即可,宿主半改动必须重启 `dsh web`(见不变量 11)。
- 客户端半改动后跑 `node scripts/ssr-check.mjs`(用本地 web profile 的 react 真渲染一次 Tab 组件),它能抓住「一渲染就抛」的回归;`npm test` 的 30 例之外就靠它。

## 截图与演示仓库

- `scripts/demo-repo.mjs [dir]` 生成演示仓库(纯虚构),`scripts/screenshots.mjs <web-url> [out]` 拍 README 效果图。两者都要能重跑:演示仓库脚本是幂等的(先删后建),截图脚本假定实例已就绪。
- **截图环境必须是干净的**:独立 `DSH_HOME`(例:`/Users/kanna/sandbox/dsh-shot-home`)、只装 `dsh-better-sidebar` 与本插件、绑定演示仓库、`ui-theme.preference: dark`。不要在真实 profile 里拍——壁纸插件、真实工作区与其它面板都会入镜。
- **只截元素,不截窗口**:每张图都是 `.dig-root`(或其中的对话框)的元素截图,所以会话内容、文件路径与 DSH 外壳天然不会出现。
- 主题与引导标记都写在 `DSH_HOME/settings.yaml`;**覆盖该文件会把 `ui-onboarding.welcomeNoticeVersion` 一起抹掉**,下次打开页面又会弹内测声明,挡住后续点击(截图脚本会先尝试点掉它)。
- 面板要出现在底部工作台:会话头右侧的「展开底部面板」→ 面板 Tab 条 `+` → 卡片里的 **Git**;出现在原生右侧栏:点会话头右侧的「打开右侧边栏」→ 侧栏「开始」页里直接点 **Git** 卡片(那时没有 `+` 菜单可用)。这两个入口只在**会话真正开始之后**才存在(发一条消息即可,模型没有 key 也没关系)。

## 变更记录纪律

- **所有版本发布、修复、事故复盘、复现/验证记录一律写进 `CHANGELOG.md`**,不追加进本文件;本文件只保留仍然有效的规则、不变量与当前事实。
- 条目格式:倒序;`## vX.Y.Z — YYYY-MM-DD` + 类型(feat / fix / docs / chore)+ 要点 bullet + 相关链接。
- 发版时:`npm version` 会经 `scripts.version` 同步 `dsh.plugin.json` 的 version(`package.json` 与 `dsh.plugin.json` 版本必须一致,冒烟测试强制)。

## 目录地图

| 路径 | 作用 |
|---|---|
| src/index.js | **宿主半**:`/dsh-ide-git/api` 前缀路由 + git 方法表(argv-only spawn)、参数校验、信任围栏、confirm 守卫 |
| src/client.js | **客户端半(全部 UI)**:`window.__ModuleLoader__.load` 包装;注册 better-sidebar Tab;Panel 组件含分支树 / 图谱 / 变更 / 详情 / 历史筛选 / 可配置动作条 / 右键菜单 / 弹窗 / 撤回浮窗 / 样式 |
| cordis.patch.yml | dsh plugin add 官方安装通道的挂载声明(insert 一行 `ide-git`) |
| dsh.plugin.json | 插件注册表清单(id `dsh-external/dsh-ide-git`) |
| tests/smoke.mjs | 文件级冒烟测试(无 Cordis runtime、无浏览器):清单一致性 / 客户端包装 / 基线 require 白名单 / 破坏性守卫 / 写队列与撤回 / 方法表一致性 |
| tests/api.test.mjs | 集成测试:临时真实仓库 + 伪造 cordis ctx 与 HTTP req/res,直驱宿主路由(解析 / 变更 / 全部守卫) |
| docs/screenshots/ | README 效果图(6 张,由 scripts/screenshots.mjs 生成) |
| scripts/demo-repo.mjs | 生成用于截图的虚构演示仓库(幂等) |
| scripts/screenshots.mjs | Playwright 驱动的截图流程(只截插件面板元素) |
| scripts/ssr-check.mjs | 客户端半的 SSR 自检(真渲染一次 Tab 组件) |

## 核心不变量(改代码前必读)

1. **无构建、单文件客户端**。`src/client.js` 必须保持 `window.__ModuleLoader__.load({ id, factory })` 包装;只能 require DSH 客户端基线模块(当前仅 `react`),冒烟测试用白名单强制执行。禁止 `import`、禁止新增第二个 client entry。
2. **宿主半只 import `node:` 内置模块**(当前:`node:child_process` 的 `spawn`、`node:path`)。冒烟测试强制。
3. **git 调用永远是 argv 数组**:`spawn(gitBinary(), args, { cwd })`,禁止 `exec` / `shell: true` / 字符串拼接命令;用户输入先过 `requireAbsolute` / `requireRef`(不以 `-` 开头、无空白与控制字符)/ `requireRelativePath`(不越出仓库)。新增方法必须走同一套校验。
4. **破坏性操作必须 `confirm: true`**:push、`reset --hard`、`branch -D`、丢弃未跟踪文件(`clean`)、`stash drop`。UI 侧对应动作一律先弹 ConfirmDialog。冒烟测试校验这些守卫字符串存在。
5. **两条信任围栏**:宿主路由只服务 loopback Host 或 `Sec-Fetch-Site: same-origin/same-site` 的请求;任何新路由都必须先过 `isTrusted(req)`,再检查 method 为 POST。
6. **better-sidebar 契约**:用 `ctx.betterSidebar.registerTab` 注册,**必须包在 `ctx.effect(() => ...)` 里**(否则 HMR/禁用后残留注册,再次激活抛 already registered);`inject: ['betterSidebar']` 声明依赖;`id` 用 `dsh-ide-git:panel`(单例 `single: true`);标题/描述用函数形式以跟随语言切换。
7. **布局用测量而不是猜测,而且宽度说了算**。`TabComponentProps` 不携带「我在右栏还是底部面板」的信息,所以只看容器尺寸:`compact`(极窄 < 400px 或极矮 < 200px)→ 单行头部 + 变更/历史分段;否则 `width >= 600 且 width >= height * 1.15` → `columns`(三栏);其余 → `stack`(纵向)。**不要**拿高度当主要判据(v0.1.3 用 `height < 330` 判紧凑,把 1500x300 的底部工作台判成了单栏,看起来和右侧栏一样)。不要引入「按面板类型」的分支,也不要硬编码高度。
8. **服务只在 client 半**。宿主半没有 `ctx.betterSidebar`;宿主侧要读侧栏状态只能走它自己的 `/sidebar/*` 路由。本插件的宿主半不依赖 better-sidebar,缺失时客户端注册静默跳过(peerDependency 是 optional)。
9. **版本两处一致**:`package.json` 与 `dsh.plugin.json` 的 version 必须相同(冒烟测试强制);`files[]` 里列出的每个文件都必须真实存在。

10. **客户端半的 `t` 必须是函数**。词典是对象(`ZH` / `EN`),文案入口必须是 `const t = (key) => …` 查表函数——2026-09-14 真机首屏崩(`dsh-better-sidebar: t is not a function`)就是把它写成了词典本身,better-sidebar 的错误边界会整页降级。冒烟测试同时强制 `t` 是函数且 `t('…')` 用到的每个 key 在 ZH 与 EN 中都存在。改文案时两本词典一起改。
11. **挂载只走 `dsh.profile.bundles`**。包自带 `dsh.bundle.patch`(`cordis.patch.yml`),DSH 组合顺序是「各 bundle 层 → profile 自己的 patch 层」;再在 profile 的 `cordis.patch.yml` 手写一条 insert 就会得到两行同 id,插件更新流程会以 `duplicate loader entry id` 失败并回滚。本机联调改 profile 时:把包名加进 `dsh.profile.bundles`(并让依赖指向本地 tarball),**不要**手写 insert 行;可用 `app-boot` 的 `loadProfile` + `composeEntries` 离线校验组合里恰好一行。

12. **hooks 依赖数组在渲染期求值**。useCallback / useMemo / useEffect 的依赖数组当帧就会求值,引用「后面才声明的 const」直接 TDZ 报错(v0.1.6 就因此崩过一次:branchMenu 的依赖里写了定义在 rail 段的 toggleFavoriteBranch)。规则:被 hooks 依赖引用的函数与值必须先声明;派生值同理。SSR 自检(react-dom/server 真渲染一次 Tab 组件)能抓出这类错误,改完客户端半务必跑一遍。

13. **面板内的浮层一律用「面板内定位」**。`dsh-better-sidebar` 的底部工作台声明了 `contain: layout style`,布局包含使它成为 `position: fixed` 后代的**包含块**——用视口坐标 + `position: fixed` 的浮层会被摆到面板之外(屏幕外),真机上表现为「右键点了没反应」。规则:菜单 / 遮罩 / 对话框都是 `.dig-root`(`position: relative`)内的 `position: absolute`;锚点先减去 `hostRef` 的 `getBoundingClientRect()`(见 `openMenuAt`),再按面板盒子夹取;浮层自带 `max-height` + 内部滚动,放不下时向上翻而不是溢出。
14. **动作条是用户可配置的,`RAIL_SPECS` 是唯一权威**。增删动作只改 `RAIL_SPECS`;持久化(`dsh-ide-git.rail.v1`)只存「排列 + 隐藏」,读写一律过 `normalizeRail()`(丢弃未知 id、补齐缺失 id),所以新增动作不会让旧配置失效。设置按钮由 rail 自己追加、不参与配置;容量按 rail **自身**尺寸算(竖排看高度、横排看宽度),放不下才出现 `⋯ 更多`,而「更多」必须列出全部动作。

15. **删除类方法必须留下撤回句柄**。任何「删除」在动手前先记下对象 id 并 `pushUndo()`,响应里返回 `undo: { id, kind, label }`;撤回逻辑集中在 `undoApply` 里按 `kind` 分支,不要另开方法。撤回是**一次性**的:成功后必须把数组写回(`undoStacks.set(root, list)`)——`undoEntriesOf()` 返回的是 `filter` 出来的新数组,v0.3.0 就因此漏过写回,导致同一个句柄重放时走到 `undo-conflict` 而不是 `undo-gone`。句柄有 TTL 与条数上限。
16. **会改仓库的方法必须登记进 `WRITE_METHODS`**。路由按这个 Set 把写请求放进 per-repo 队列(`withRepoLock`),漏登记就等于重新打开并发写窗口;只读方法不要加进去,否则白白排队。

## 文档规范

- **README 顶部顺序:标题 → 徽章 → 中英互切链接 → 简介引用块**。语言切换照生态惯例写:`简体中文 | [English](README_EN.md)`(英文页 `[简体中文](README.md) | English`)。
- **徽章用 shields.io,不要用第三方 SVG**:`awesome-dsh-plugin.com/badge.svg` 内部用 `<text>` 定位、只留 6px 间距且依赖 Verdana 字宽,换字体就顶到勾选框上(v0.3.3 真机跑版)。统一写成 `[![awesome · DSH plugin](https://img.shields.io/badge/awesome-DSH_plugin-c0392b)](https://awesome-dsh-plugin.com)`——shields.io 在服务端按固定字体算好宽度,不会再跑版。
- 效果图走 `docs/screenshots/`,中文页与英文页引用同一批文件,配图段落用「左图右说明」的两列表格(见 `## 效果` / `## Screenshots`)。

## 与 dsh-better-sidebar 生态的关系

- 插件要进 better-sidebar 设置页的「侧边卡片」分区/推荐目录,靠的是:注册 Tab 时提供 `title` / `description` / `icon`(卡片自动生成),以及仓库打好 `dsh-better-sidebar` topic。推荐目录本身维护在 better-sidebar 仓库的 `src/client/plugins-tabs.ts`,收录需要向该仓库提 PR。
- 本插件与内置 `git` Tab(「文件变动」)是互补关系:内置管暂存/提交/还原/历史,本插件管分支树、图谱、提交详情与更全的分支/提交操作。