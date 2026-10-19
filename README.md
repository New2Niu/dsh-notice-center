# dsh-notice-center 🔔🐋

**中文** | [English](./README.en.md)

[![test](https://github.com/New2Niu/dsh-notice-center/actions/workflows/test.yml/badge.svg)](https://github.com/New2Niu/dsh-notice-center/actions/workflows/test.yml)

<img src="docs/images/banner.jpg" alt="dsh-notice-center 会话通知 —— 让每一条消息，都不错过" width="100%">

**一句话**：DeepSeek Harness 的**通知中心**——把标签页上的鲸鱼图标变成状态灯，并在你不在看的时候主动提醒你。

| | |
|---|---|
| 包名 | `dsh-notice-center` |
| 插件实例 id | `notice-center` |
| 设置命名空间 | `notice-center` |
| 安装方式 | **只支持仓库地址安装**（见[安装](#安装)） |
| 宿主要求 | DeepSeek Harness `0.2.0-rc.2` – `0.3.0` |

## 目录

**使用**

- [为什么需要它](#为什么需要它)
- [功能特性](#功能特性)
- [安装](#安装)
- [上手三步](#上手三步)
- [设置项详解](#设置项详解)
- [常见问题](#常见问题)
- [已知限制](#已知限制)

**开发**

- [架构总览](#架构总览)
- [目录结构](#目录结构)
- [一条通知的生命周期](#一条通知的生命周期)
- [本地开发](#本地开发)
- [测试](#测试)
- [发版与分发](#发版与分发)
- [更新记录](./CHANGELOG.md)
- [设计约束](#设计约束)

## 为什么需要它

在 Harness 里，「会话跑完了」和「有事等你拍板」这两个信号，只出现在**侧边栏的小圆点**和**会话本身**上。你一旦切到别的标签页、别的应用，就看不见了。

长任务尤其难受：你去干别的，回来才发现早就跑完；或者一个审批请求已经晾了十分钟。

这个插件把这两个信号搬到你能看到的地方：

| 你不在 DSH 页面时 | 你会看到 |
|---|---|
| 会话跑完了 | 标签页鲸鱼变**绿**，并弹出系统通知（单独一条时附本轮总用时） |
| 有事等你处理 | 标签页鲸鱼变**琥珀**，并弹出系统通知（写明是审批 / 提问 / 计划审核） |

## 功能特性

### 1. 鲸鱼状态灯

三种颜色直接编码在标签页图标上，和侧边栏的绿点、琥珀点**用的是同一份官方信号**，永远同步：

| 鲸鱼颜色 | 含义 | 什么时候恢复 |
|---|---|---|
| <img src="docs/images/whale-green.svg" width="20" alt="绿色"> 绿色 | 有会话在你没看它的时候**跑完了** | 该会话点开后自动恢复；全部点开过一遍即回到默认状态 |
| <img src="docs/images/whale-amber.svg" width="20" alt="琥珀色"> 琥珀色 | 有会话**有事等你处理**：提问 / 审批 / 计划审核 | 处理完后自动消失 |
| <img src="docs/images/whale-black.svg" width="20" alt="黑色"> 黑色 | 一切正常（官方原版图标） | 默认状态 |

![标签页状态灯：自上而下为完成（绿）、待处理（琥珀）、默认（黑）](docs/images/tab-status-light.png)

- 只统计**主会话**，子代理不计入
- 绿色与琥珀同时存在时**琥珀优先**——待处理是首要状态，有会话卡住等你时，不会因为别的会话刚跑完而被掩盖
- 三种颜色都能改（含「默认色」：不配置就沿用官方原版图标）
- 未读记录会**落到本地**：刷新页面后绿灯还在（7 天过期、最多 50 条），点开对应会话即清除

### 2. 系统通知

两种事件会触发通知，**默认只在你不在看的时候弹**：

| 事件 | 触发时机 | 通知长什么样 |
|---|---|---|
| **完成通知** | 会话跑完 | 标题＝会话名；正文＝`会话已完成`，单独一条时附本轮总用时（如 `会话已完成 · 本轮总用时 2分13秒`） |
| **待处理通知** | 出现新的待处理交互 | 标题＝会话名；正文＝交互类型：`待审批 · <工具名>` / `请你选择`（多选则 `请你多选`、无选项则 `请你填写`、多问题则 `向你提问（N 个）`）/ `计划待审核`；认不出的类型回退为 `有交互等待处理` |

| 完成通知（绿） | 待处理通知（琥珀） |
|---|---|
| ![完成通知](docs/images/notification-done.png) | ![待处理通知](docs/images/notification-pending.png) |

> 通知由浏览器发出（本机是 Chrome），所以卡片上显示浏览器与站点 `127.0.0.1:3080`——这是正常的。

其余行为：

- **点击通知** = 聚焦窗口并打开对应会话
- **只在你不看的时候弹**——「前台」＝标签页可见**且**窗口有焦点；切到别的标签页、最小化、被别的应用压在后面时都会提醒。想在前台也提醒（人还停在会话里、却已离开屏幕，例如在刷手机），打开设置里的「前台提醒」
- **多条聚合**：300ms 内的事件合并为一条，标题补 `+N`
- **可常驻**：关掉「自动隐藏」后，通知会一直留在屏幕上，直到你点掉它
- 通知图标跟随你配置的状态灯颜色

### 3. 多标签页协同

同一份 DSH 页面常被开成好几个标签页，插件对此做了统一协调（官方本身没有跨标签页机制）：

- **只由一个标签页弹通知、响提示音**（按标签页 id 确定性选主），不会一次完成弹两遍
- **「前台」按所有标签页聚合**：B 标签正在看时，后台的 A 标签不会以为没人在看而打扰你
- **未读集合跨标签页共享**：任一标签页点开会话，其余标签页的绿灯同步熄灭

没有 `BroadcastChannel` 的环境自动退化成单标签页行为，不会报错。

### 4. 桌面端适配

桌面端**没有标签页**，所以鲸鱼状态灯那套在这里没有意义；插件会识别出桌面端并切换形态：

| | 浏览器 | 桌面端（DeepSeek Harness.app / `dsh desktop`） |
|---|---|---|
| 鲸鱼状态灯 | 有（三色可配） | **无**——窗口没有标签页图标，设置页里换成一段说明 |
| 系统通知 | 有，`Notification` 权限要用户授权 | 有，**权限由壳直接放行**（非 media 权限一律允许），不需要手势、也没有授权窗 |
| 通知授权没拿到时 | chip 教你去地址栏 / 站点设置 | chip 改成**系统设置指引**（通知由操作系统决定） |
| 自证入口 | 授权成功时的「通知已开启」确认 | 设置页有**「发送测试通知」**按钮，随时可自证 |
| 首次手势自动授权 | 有 | **没有**（没有授权窗可弹，请求只会是无意义的调用） |

- 桌面端面板只多两样东西：一段说明 + 一枚「发送测试通知」按钮。
  **刻意没有「打开系统设置」按钮**：Electron 壳的 `setWindowOpenHandler` 只对 `http(s)` 调 `shell.openExternal`，其余协议一律拒绝且不外开，`window.open(系统设置深链)` 会被静默丢弃；preload 暴露的 `dshDesktop` 里也没有「打开外部 URL」的能力。放一个点了没反应的按钮比不放更糟，所以设置页只给文字指引（系统设置 → 通知 → DeepSeek Harness）。
- 通知的标题、正文、聚合、提示音、点击跳转与浏览器端**完全同一条代码路径**，不会有第二套行为。

### 5. 提示音

完成与待处理各有独立下拉，共 **47 个条目**：2 个插件内置合成音 + 45 个取自 opencode 内置音效库的 mp3。

| 音效包 | 条目 |
|---|---|
| 内置（合成音） | `Chime Up`（完成默认，上行双音）、`Chime Down`（待处理默认，下行双音） |
| Alert | Alert 01–10 |
| Bip-bop | Bip-bop 01–10 |
| Staplebops | Staplebops 01–07 |
| Nope | Nope 01–12 |
| Yup | Yup 01–06 |

- **悬浮即试听**：鼠标划过下拉条目就播该音效（120ms 防抖，扫过整列不会连成一片）
- **调完音量即试听**：拖动音量条松手后，会按新音量播一次完成提示音
- 开启提示音后，**系统默认提示音会被静音**，改播插件音效
- 宿主半通过 `/notice-center-sounds/<id>.mp3` 提供音频；路由不可用时**自动回退内置合成音**，不会变哑
- 老配置无需迁移：没配过音效时仍用 `Chime Up` / `Chime Down`

## 安装

> 本插件**只支持从 GitHub 仓库地址安装**。npm 包页、tarball、本地 link 这几种方式都不再是分发渠道，文档里也不再提供。

### 前置要求

- **DeepSeek Harness `0.2.0-rc.2` 或更新的 0.2.x**（`engines.dsh` = `>=0.2.0-rc.2 <0.3.0-0`，已在 0.2.0-rc.2 上逐条验证；0.2.0-rc.1 与 0.1.x 不再兼容）
  - 兼容范围同时写在 `engines.dsh` 与 `@deepseek-ai/dsh-*` peer 上，由 `test/compat-range.smoke.mjs` 守护：**DSH 核心在加载前会拒绝不兼容的宿主**，旧宿主不会把插件跑起来再崩。
  - 版本闸门只比版本号，查不出 API 被删（0.1.7 删掉了 `settings.register`，旧声明在那上面照样 PASS），所以别只靠它当兼容性保障。
- 本机有 **git**（`dsh plugin add github:…` 会走 git 拉取）
- 系统通知需要**安全上下文**——`http://127.0.0.1:3080` 或 `localhost` 可用；用**局域网 IP** 访问时浏览器的 Notification API 不可用（这是浏览器限制，不是插件问题）。**桌面端不受这条限制**（`dsh-app://app` 是安全上下文，权限由壳放行）

### Web（浏览器界面）

```sh
dsh plugin --profile web add github:New2Niu/dsh-notice-center
```

HTTPS 被代理挡住时，可以改走 SSH：

```sh
dsh plugin --profile web add git+ssh://git@github.com/New2Niu/dsh-notice-center.git
```

### 桌面端（DeepSeek Harness.app）

```sh
dsh plugin --profile desktop add github:New2Niu/dsh-notice-center
```

> 桌面端请**先完全退出应用**再执行该命令——`--profile desktop` 由桌面端进程独占，正在运行时 profile 目录被它管理（应用会提示「先退出再操作」）。

两个 profile 是**各自独立**的安装位置：在浏览器界面里装了，桌面端不会自动有；反之亦然。想两边都用就装两次（设置也各存各的）。

### 更新

再执行一次同一条 `add` 命令即可拉到仓库的最新提交：

```sh
dsh plugin --profile web add github:New2Niu/dsh-notice-center
# 桌面端同理：dsh plugin --profile desktop add github:New2Niu/dsh-notice-center
```

想**锁定**某个版本（避免跟随 `main` 变动），把 tag 拼在地址后面：

```sh
dsh plugin --profile web add github:New2Niu/dsh-notice-center#v1.5.0
```

更新后需要**重启 Harness / 桌面端**才生效。

### 卸载

```sh
dsh plugin --profile web remove dsh-notice-center
# 桌面端同理：dsh plugin --profile desktop remove dsh-notice-center
```

移除依赖与 `dsh.profile.bundles` 条目后重启，即无残留。

## 上手三步

1. **打开设置页** —— 设置 → **通知中心**（侧栏导航项）
2. **授权系统通知** —— 总开关**默认就是开的**：打开页面后，你**第一次点击或按键**时，插件会自动向浏览器请求一次通知授权（浏览器**不允许**没有用户手势的请求，页面自己弹不出来，所以只能借你的一次交互），选「允许」，同时会收到一条「通知已开启」的确认。频率规则：

   - **每次打开页面最多问一次**（同一次会话里点多少下都只问一次，不会连环弹）；
   - 你在授权窗上选了「允许」或「阻止」→ **不会再问**（权限有定论了）；
   - 你只是点了 **× / Esc**（既没允许也没阻止）→ 不算做出选择，**下次刷新页面会再问一次**，直到你选为止；
   - 想彻底不被打扰：把「系统通知」开关**关掉**，或在授权窗里选「阻止」。

   之后想补授权，用开关**正下方**那枚状态 chip（短状态常驻、鼠标悬浮或键盘聚焦问号/叹号看完整说明）：

   | 状态 | chip 长什么样 | 怎么办 |
   |---|---|---|
   | **未授权**（自动请求被你关掉了，或从没问过） | 「未授权 · 授权」可点 | 点它，浏览器会重新弹授权窗 |
   | **已被拒绝** | 叹号 +「已被拒绝」 | 浏览器**不会二次弹窗**（网页也无权打开站点设置页）：悬浮看恢复路径 —— 点地址栏左侧的图标 → 通知 → 允许，或打开 `chrome://settings/content/notifications` |
   | **当前浏览器不支持** | 一行小字 | 多半是**安全上下文**问题（见「安装 → 前置要求」），用 `http://127.0.0.1:3080` 访问即可 |
   | 已授权 | 不显示（行保持干净） | — |

   开关本身始终可切（未授权时也能把通知关掉，关掉后就不会再自动请求）；你在站点设置里改完权限回到页面，chip 会立刻跟上。

   > **桌面端不一样**：没有授权窗、没有地址栏，权限由壳直接放行。所以第 2 步在桌面端是「打开设置 → 点一下**发送测试通知**」：能弹出来就说明通了；弹不出来就去**系统设置 → 通知 → DeepSeek Harness** 打开允许通知（插件**无法**替你打开那个面板 —— 壳不允许，见上文「桌面端适配」）。
3. **按需微调** —— 展开两个分组：调颜色、选音效、调音量、开关「前台提醒」/「自动隐藏」（桌面端只有「系统通知」这一组，颜色那组换成桌面端说明）

<img src="docs/images/settings.png" width="440" alt="通知中心设置页">

之后你切走或最小化时，会话跑完 / 有事等你都会收到通知，点通知直接跳回那个会话。

## 设置项详解

| 分组 | 设置项 | 配置键 | 默认值 | 说明 |
|---|---|---|---|---|
| 鲸鱼状态灯 | 总开关 | `colorsEnabled` | 开 | 关闭后保持官方原版图标（**桌面端不展示这一组**） |
| | 完成 | `green` | `#22C55E` | 完成状态灯颜色（官方侧边栏色） |
| | 待处理 | `amber` | `#F59E0B` | 待处理状态灯颜色（官方侧边栏色） |
| | 默认色 | `black` | 未设置 | 不设置＝沿用官方原版 `/favicon.svg` |
| 系统通知 | 总开关 | `notifyEnabled` | **开** | 默认开启；首次交互自动请求浏览器授权（桌面端无此流程），未授权时开关下方给状态 chip |
| | 自动隐藏 | `notifyAutoHide` | 开 | 关＝通知常驻屏幕，需手动关闭（最终仍由系统通知中心决定） |
| | 前台提醒 | `notifyForeground` | 关 | 开＝你正看着页面时也提醒 |
| | 提示音 | `notifySound` | 开 | 开启后静音系统提示音，改播插件音效 |
| | 音量 | `notifyVolume` | `0.6` | 0–1 |
| | 完成提示音 | `notifyDoneSound` | `builtin-up` | 47 个可选 |
| | 待处理提示音 | `notifyPendingSound` | `builtin-down` | 47 个可选 |

配置由 Harness 的 settings 服务持久化到 `<DSH_HOME>/settings.yaml` 的 `notice-center:` 段。
设置页**最上方**还有一行页脚：插件名 + 版本号（如「通知中心 v1.5.0」），点一下在新标签页打开仓库。

## 常见问题

| 现象 | 原因与处理 |
|---|---|
| 设置里找不到「通知中心」 | 插件没加载成功。确认装完**重启过 Harness**，再看 Harness 控制台有没有 `settings entry "notice-center"` 这行日志 |
| 开关点了没反应 / 加了新设置项不生效 | 改过**宿主半**（`lib/index.mjs`）后必须重启 Harness——设置写入要过宿主 schema 校验 |
| 装完插件后第一次点页面就弹出授权窗 | 通知开关默认开启，插件借你**第一次交互**（点击/按键）自动请求一次授权 —— 浏览器不允许没有用户手势的请求，页面自己弹不出来。不想授权就点「阻止」，之后可在设置页用状态 chip 补授权 |
| 完全不弹通知 | 三个条件缺一不可：① 系统通知总开关已打开；② 浏览器权限为「允许」；③ 触发时页面不在前台（默认策略，可用「前台提醒」放宽） |
| 打开开关没弹授权窗 | 只有权限处于「还没问过」时浏览器才会弹；已经「拒绝」过就**不会再弹**，页面会给出站点设置的恢复路径。另外授权请求必须在点击里发起、且要安全上下文（`127.0.0.1` / `localhost`） |
| 用局域网 IP 打开时不弹 | 非安全上下文，浏览器禁用 Notification API，系统通知**完全不可用**（与「前台提醒」无关）。改用 `127.0.0.1` / `localhost`；局域网下只能靠标签页状态灯 |
| 标签页关掉后收不到 | 已知限制，见下文 |
| 刷新页面后绿灯还在 | 正常：未读记录已落盘（7 天过期、最多 50 条），点开对应会话即清除 |
| 通知一闪而过看不到 | 关掉「自动隐藏」，通知会常驻直到你点掉它 |
| 没有声音 | 依次查：提示音开关、音量是否为 0、系统音效路由是否可用（不可用时会回退内置合成音，不会完全没声） |
| 通知被系统吞掉 | Windows「专注助手 / 勿扰」会拦截，插件无法感知 |
| 开了多个标签页，只弹一次 | 正常：插件只让一个标签页负责弹通知与发声，避免重复提醒 |
| **桌面端**装完看不到鲸鱼状态灯的设置 | 桌面端**故意不画**：应用窗口没有标签页图标。设置页里那一段「桌面端提醒方式」就是它的位置 |
| **桌面端**不弹通知 | 插件侧条件与浏览器相同（开关打开 + 触发时不在前台），但权限在**系统**手里：设置页点「发送测试通知」，收不到就去 系统设置 → 通知 → DeepSeek Harness 打开「允许通知」（macOS 首次会弹一次系统授权，选「允许」；选过「不允许」就得手动改回来） |
| **桌面端**想快速打开系统通知设置 | 插件没有这个按钮（壳不允许插件唤起系统设置，详见「桌面端适配」）。手动路径：macOS 系统设置 → 通知 → DeepSeek Harness。你也可以自己用命令行打开：`open "x-apple.systempreferences:com.apple.Notifications-Settings.extension"` |

## 已知限制

- **浏览器标签页关闭后收不到通知**——Web Push 需要服务端 + HTTPS，本地插件场景不现实
- **非安全上下文（局域网 IP）下 Notification API 不可用**
- **未读记录有保鲜期**——7 天未处理、或超过 50 条时旧记录会被丢弃，绿灯随之消失
- **系统级勿扰模式会吞掉通知**（Windows 专注助手等），插件无法感知
- **自动隐藏的时长不可配**——Web Notification 规范没有时长参数，桌面端由系统决定（约 5–20 秒）
- **通知卡片的外观不可定制**——卡片由浏览器渲染，没有 CSS / 主题入口，只能控制标题、正文与图标
- **桌面端没有状态灯替代品**——插件改不动 Electron 壳（`app.asar` 里的主进程代码），所以拿不到 Dock 角标 / 托盘角标；桌面端的主信号就是系统通知本身
- **桌面端无法唤起系统设置**——壳只把 `http(s)` 交给系统外开，`x-apple.systempreferences:` 这类深链会被丢弃（1.5.0 试过，点了没反应，已删）；只能手动去系统设置里开通知

---

# 开发文档

> 以下是给维护者的内容：架构、本地开发、测试与发版。只想用插件的读者可以到此为止。

## 架构总览

插件由**两半**组成，各自跑在不同进程里，通过 Harness 的 settings 服务交换配置：

| 组成 | 文件 | 跑在哪 | 职责 |
|---|---|---|---|
| **宿主半** | `lib/index.mjs` | Harness 主进程（Node） | ① 声明 `Config` schema（设置表单、写入校验、旧 `settings.yaml` 迁移都由它派生）；② 挂载 `/notice-center-sounds/<id>.mp3` 静态音效路由 |
| **浏览器半** | `lib/client.cjs` | 浏览器（插件 bundle） | favicon 状态机 + 通知状态机 + 跨标签页协调 + 音效库 + 设置页 |
| **bundle patch** | `cordis.patch.yml` | Loader 层 | 往插件树里插入一行 `id: notice-center`（这个 id 就是设置命名空间） |

**宿主半的两个「可选通道」**：

- `ctx.inject(["settings"], …)` —— 声明「本插件自带设置页」：`settings.configure({ auto: false }, ctx.fiber)`。owner 必须是插件自身的 fiber（`describe()` 按 `entry.fiber` 查这份策略，而 `inject` 子 fiber 是另一个 fiber）
- `ctx.inject(["webServer"], …)` —— 挂载音效路由。服务缺席时不挂载，浏览器半自动回退到内置合成音

**设置契约（0.1.7 起，0.2.0-rc.1 / 0.2.0-rc.2 上逐条复核仍成立，这是本插件最容易静默踩坏的地方）**：

- 表单由**插件自己的 Config** 派生：dsh-settings 的 `describe()` 读入口 fiber 的 `runtime.Config`，条目 id 就是命名空间 —— 插件**不再注册命名空间**（旧的 `settings.register(ns, schema)` 在 0.1.7 已删除）。
- **每个字段都要 `.volatile()`**：`volatileForm()` 只投影「最近的可变祖先」下的字段，漏标一个就等于那个设置项在设置页里整条消失（`test/host-half.smoke.mjs` 为此逐字段断言）。`.volatile()` 需要 **schemastery ≥ 3.18.4**。
- 老用户设置无需手工迁移：dsh-settings 启动时会读 `<DSH_HOME>/settings.yaml`，把每个 section 按名字写进**同 id** 的条目，再把原文件改名为 `settings.yaml.imported`。我们的段名正好等于条目 id（`notice-center`）。

**为什么宿主半不 import `@deepseek-ai/dsh-settings`**：宿主半的运行时依赖只剩 `@deepseek-ai/schemastery`——而 profile 默认 `autoInstallPeers: false`，真去解析任何 `@deepseek-ai` peer 反而会因 npm 上的版本不匹配而加载失败。这是「装完能干净加载」的关键。

**浏览器半的数据来源**（都是官方客户端服务，插件不自持业务状态）：

| 服务 | 提供包 | 用途 |
|---|---|---|
| `configForms` | `@deepseek-ai/dsh-client-ui-settings` | `configForms.get(entryId)` 读写设置（旧的 `settingsScope` 在 0.1.7 已删除）；快照带 `status` / `writable` |
| `sessions` | `@deepseek-ai/dsh-api-session-controller/client` | 会话列表快照：`origin` / `running` / `displayTitle` |
| `uiWorkspace` | `@deepseek-ai/dsh-client-ui-workspace` | `openSession(sessionId)`：点通知跳进对应会话。惰性 `ctx.inject(["uiWorkspace"])` 取用（宿主**没有** `sessions.open`），服务缺席时只是不跳，不影响插件加载 |
| `uiSession` | `@deepseek-ai/dsh-client-ui-session` | `sessionStatus`：`Map<sessionId, { running, pendingInteraction, completionUnread }>` —— 0.1.7 的 `completed` / `pendingInteraction` 行字段与 `pendingInteractions` store 都已删除，官方 workspace 的会话行用的是同一套映射（`completed` ≡ `completionUnread`） |

音效路由的安全约束：只放行 `^[a-z0-9-]+\.mp3$` 的文件名（杜绝路径穿越），音频是随包常量故用 `immutable` 长缓存。

**跨标签页协调**（`createCrossTab`）：一个 `BroadcastChannel`（名 `dsh-notice-center`）承担心跳与全量状态复制；存活标签页里 **tabId 最小者当主**（纯函数比较，不抢主、切换确定）。只有主标签页弹通知 / 发声 / 写盘；未读集合与聚合前台状态广播给所有标签页，各标签页据此各自重画 favicon（favicon 是每标签页独立的 DOM）。没有 `BroadcastChannel` 时退化为单标签页行为。

未读集合用官方 `createSnapshotStore` + `persist: { name: "dsh-notice-center:v1:unread" }` 落盘（localStorage 封装），保鲜期 7 天、上限 50 条。**同一个 persist key 的多个活实例会互相污染**，所以只由主标签页写。

**桌面端的平台判定**（`lib/client.cjs` 的 `isDesktopClient`）：壳的 preload 只在 `dsh-app://app` 主框架上放完整产品 API（`deviceInfo` / `browser` / `keyboard` / `shortcuts` / `updates`），iframe 只拿到 `{ protocolVersion: 1 }` —— 所以判定必须同时满足 `protocolVersion === 1` 与「有 `deviceInfo` 函数」。官方几个包（`dsh-client-shortcuts`、`dsh-client-ui-chat`、`dsh-client-product-analytics`…）用的是同一条信号（`"dshDesktop" in globalThis`）。

桌面端与壳的三条硬约束（决定了分支只能这么做）：

1. **壳不允许唤起系统设置**：`setWindowOpenHandler` 只对 `http(s)` 调 `shell.openExternal`，其余协议 `{ action: "deny" }` 且不外开，`will-navigate` 同样只放行 `http(s)`，preload 的 `dshDesktop` 也没有外开能力 —— 所以插件**不做**「打开系统设置」入口，只给文字指引（1.5.0 曾做过深链按钮，实测点了没反应，已删除）；
2. **壳没有 Dock / 托盘角标能力**，插件也改不动 `app.asar` 里的主进程 —— 桌面端没有状态灯的替代品；
3. **壳的 session 权限处理器对非 media 一律放行**（`main.js` 的 `installMicrophonePermissions`）—— 页面侧没有授权窗可弹，所以桌面端跳过「首次手势请求授权」，`Notification.permission` 只作参考。

## 目录结构

```
package.json                    包元数据（scripts: test / test:host / test:client / test:desktop / test:compat）
cordis.patch.yml                bundle patch 层（insert id: notice-center）
lib/index.mjs                   宿主半：settings schema + 音效静态路由
lib/client.cjs                  浏览器半 / 桌面端渲染进程：状态机 + 通知 + 跨标签页 + 音效库 + 设置页
assets/audio/*.mp3              45 个 opencode 音效（MIT，来源见 assets/audio/README.md）
docs/images/                    README 截图、主图与社交预览图
test/host-half.smoke.mjs        宿主半冒烟
test/client-half.smoke.mjs      浏览器半冒烟：状态机 + 设置页真渲染
test/desktop-half.smoke.mjs     桌面端分支冒烟：判定 / 状态灯停画 / 测试通知 / 权限 chip
test/compat-range.smoke.mjs     兼容范围（engines.dsh / peer / files 清单）
.github/workflows/test.yml      CI：push / PR 跑 pnpm test
```

## 一条通知的生命周期

```
sessions.list 变化
   └─ sync()
        ├─ trackEdges()        运行状态 true→false 边沿（当前会话在前台跑完的补偿路径）
        ├─ detectTransitions() 官方 completed false→true；pendingInteraction 新增会话
        │     └─ queueNotification(kind, sessionId, label, typeLabel)
        │          ├─ 总开关关闭 → 丢弃
        │          ├─ 同一次完成已入队 → 丢弃（两条检测路径不得重复发）
        │          └─ 入队 + 300ms 聚合窗口
        └─ targetOf() → favicon 换成 绿 / 琥珀 / 默认

300ms 后 flushNotifications()
   ├─ 权限未授权 → 丢弃
   ├─ 非主标签页 → 丢弃（副作用单一写者）
   ├─ 页面在前台且未开「前台提醒」→ 丢弃
   ├─ 按 kind 分组 → 每组一条 Notification（标题＝会话名，正文＝通知类型）
   └─ 播放所选音效
```

通知**不设置 `tag`**：同一会话反复跑完会复用同一个 tag，Windows/Chrome 会把后一条当成「更新已有通知」而静默替换、不再弹横幅。

## 本地开发

```sh
pnpm install          # 唯一运行时依赖是 @deepseek-ai/schemastery
npm test              # 宿主半 + 浏览器半 + 桌面端 + 兼容范围
```

**重启要求分两半——这是本项目最容易踩的坑：**

| 改了什么 | 要不要重启 Harness | 为什么 |
|---|---|---|
| `lib/client.cjs`（浏览器半） | **不用**，刷新页面最干净 | 客户端 HMR 会 stat-poll 到 bundle 变化并通知浏览器重载该插件 |
| `lib/index.mjs`（宿主半） | **必须重启** | 宿主半热重载依赖 `cordis-plugin-hmr`（需 loader 带 `--expose-internals`），实测未生效。**改 schema（增删设置项）同样必须重启**——否则设置页写入过不了校验，表现为「开关点不动」 |
| 首次安装、任何改名 | **必须重启** | 插件树与 bundle 列表变了 |
| 桌面端（`--profile desktop`，两种半都算） | **必须重启桌面端** | 桌面端没有「刷新页面」这个动作，客户端 bundle 也只在启动时装配；改完请完全退出应用再启动 |

调试提示：浏览器半的报错都在 DevTools Console；宿主半注册成功会在 Harness 控制台打一行 `dsh-notice-center: settings entry "notice-center" served from the Config schema`。桌面端的渲染进程同样有 DevTools（窗口菜单里打开），`isDesktopClient()` 的判定、通知构造失败都会打在那里。

## 测试

```sh
npm test              # 四个都跑（CI 跑的也是这个）
npm run test:host     # 只跑宿主半
npm run test:client   # 只跑浏览器半
npm run test:desktop  # 只跑桌面端分支
npm run test:compat   # 只跑兼容范围
```

四个冒烟测试都是**零依赖、纯 Node**，不需要浏览器：

- **宿主半**：`apply()` 真执行一遍、断言只注入预期服务、schema 默认值与校验、音效路由（能取到 mp3 / 不存在 404 / 拒绝路径穿越 / 随包 45 个齐全）、settings.yaml 存量配置过 schema 且**逐项原样保留**
- **浏览器半**：桩掉 `window.__ModuleLoader__` / `document` / `Notification` / `BroadcastChannel`，evaluate bundle 后取 factory，用假 `ctx` 装配 `apply()`，然后驱动状态跃迁断言 Notification 的构造参数；设置页用**记录型桩**真渲染（React 元素树），断言开关顺序、只写对应字段、折叠行为、页脚等
- **桌面端**：同一份 bundle 换 `globalThis.dshDesktop` 再装一遍，断言「什么算桌面端」（浏览器 / 只有 `protocolVersion` 的 iframe / 协议版本不匹配都**不算**）、桌面端**不画**状态灯分组、测试通知按钮真的发通知、权限 chip 是指引而不是授权按钮、不挂首次手势授权

被测试钉死的不变量（改代码时别破坏）：

- `lib/client.cjs` 里的 `PLUGIN_VERSION` / `PLUGIN_NAME` / `PLUGIN_REPO` 必须与 `package.json` 一致
- 音效库 `SOUND_PACKS` 必须与 `assets/audio/` 里的文件**一一对应**；新增音效要同步改 `lib/client.cjs` 与 `test/client-half.smoke.mjs` **两处**
- `zh` / `en` 两套文案的 key 集合必须一致（`test/client-half.smoke.mjs` 与 `test/desktop-half.smoke.mjs` 都断言）
- 桌面端判定只能认「`protocolVersion === 1` **且** 有 `deviceInfo` 函数」：少判一个就会把壳内嵌的 iframe 也当成桌面端主框架
- 设置页里凡是**要跨出 apply 作用域**的东西（图标、取色、测试通知）都必须是模块级函数，参数由调用方注入 —— 组件不在 `apply` 闭包里，直接引用 `apply` 内的局部函数会被 `ReferenceError` 打崩整页（1.5.0 开发时就踩过一次）

## 发版与分发

本仓库**只通过 GitHub 仓库地址分发**，不发 npm。一次发版就是三件事：

1. **改版本号** —— `package.json` 的 `version` 与 `lib/client.cjs` 的 `PLUGIN_VERSION`（宿主半冒烟测试会检查两者一致）
2. **写更新记录** —— 在 [`CHANGELOG.md`](./CHANGELOG.md) 顶部补上这一版（用户可见改动 + 兼容性说明）
3. **打 tag 并推送** ——

```sh
git tag v1.5.0
git push origin v1.5.0
```

推送后：

- `test.yml` 在 `main` 上跑测试
- 需要「固定版本安装」的用户可以用 `github:New2Niu/dsh-notice-center#v1.5.0`
- 想在 GitHub 上留一份可读的发行说明，可以基于该 tag 建一个 Release，正文直接用 CHANGELOG 对应段落

> `.github/workflows/publish.yml` 是**上游 npm 包**的发布流水线（OIDC Trusted Publishing），带仓库守卫，在本仓库打 tag 不会触发；日常改代码也不用管它。

## 设计约束

改代码前请先读这几条，它们都是踩过坑换来的：

1. **通知不带 `tag`**——同 tag 会被系统当成「更新已有通知」静默替换（详见上文「一条通知的生命周期」）
2. **「前台」判定是 `标签页可见 && 窗口有焦点`**，且**按所有标签页聚合**——只看 `visibilityState` 会把「浏览器被别的应用压在后面」误判成正在看，而那恰恰是最该提醒的时候
3. **状态灯琥珀优先于绿**——与官方 `sessionStatuses` 一致，待处理是首要状态
4. **通知时长来自观察 `running` 边沿**——刷新页面时已经在跑的会话算不出起点，就不显示这个数（不猜）
5. **副作用只由主标签页执行**——否则两个标签页都不在前台时，同一次完成会弹两条、响两次
6. **宿主半保持零 `@deepseek-ai` 运行时依赖**——只 import `schemastery`，否则安装后加载会因 peer 解析失败而挂掉
7. **音效路由只放行 `^[a-z0-9-]+\.mp3$`**——文件名直接参与 path join，必须白名单
8. **桌面端只信「主框架的产品 API」**——`protocolVersion === 1` 且有 `deviceInfo` 才算桌面端；壳内嵌 iframe 拿到的 `{ protocolVersion: 1 }` 不算，否则子框架里也会走桌面分支
9. **设置页组件不共享 `apply` 的闭包**——跨作用域的能力（图标、取色、测试通知）一律做成模块级函数、参数由调用方传；直接引用 `apply` 内的局部函数会把整页打崩
10. **桌面端不画状态灯**——没有标签页图标就别硬塞替代品（壳不提供 Dock/托盘角标，插件也改不动主进程）；桌面端的主信号就是系统通知

## 反馈与贡献

- 问题与建议：<https://github.com/New2Niu/dsh-notice-center/issues>
- 改动请先跑 `npm test`；涉及设置项的改动记得同步 `test/*.smoke.mjs` 的断言
- 音效素材来自 [anomalyco/opencode](https://github.com/anomalyco/opencode)（MIT），替换或移除请同步 [`assets/audio/README.md`](./assets/audio/README.md)

## License

MIT，完整许可文本见 [`LICENSE`](./LICENSE)。

音效素材（`assets/audio/*.mp3`，45 个）取自 [anomalyco/opencode](https://github.com/anomalyco/opencode) 的 `packages/ui/src/assets/audio/`，上游以 MIT 许可发布，这里保留同样的许可与署名；若上游调整授权，请同步替换或移除本目录。
