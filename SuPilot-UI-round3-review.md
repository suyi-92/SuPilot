# SuPilot 第三轮 UI 复核记录

## 结论

**第三轮主体实现可保留，但暂不按完整验收通过。** 需要一次范围明确的 3.1 收尾：修复主机表单错误上下文、首次快照读取失败的欢迎页状态，以及部分步骤不可用时结果摘要的视觉语义，并补齐这些场景及本轮四个页面的原定验证。**不重开已验收的第二轮、2.1，不追加新主题或新布局偏好。**

本次上传材料已足够定位问题，无须补充真实服务器、凭据或 Windows 可执行文件。

## 1. 交付物与核对边界

| 文件 | 大小 | SHA-256 |
|---|---:|---|
| SuPilot-source-round3.zip | 346,866 bytes | 96a064f473c3469eff090c293b3b9998802a2fdf1b7d81e97a6f7f1312da4cc5 |
| SuPilot-ui-round3-evidence.zip | 28,454,353 bytes | a0b3eff7ea683ad9e8b632ee7e9fd728c4ce90648b1543d1436107f5e2e12027 |

两项均与交付说明完全一致。对照上次通过验收的 `SuPilot-source-round2.1-final-fix.zip`，Engine、Contracts、Main、Preload、终端组件、共享 UI、插件、锁文件及原有 selection-actions.mjs 均逐字节一致。

开发版、打包版 JSON 各记录 20 条检查、`errors: []`，各有 67 张 PNG；本轮证据包另有基线截图与两次早期重跑 JSON。`commands-and-environment.txt` 是命令结果摘要，不是完整 pnpm stdout/stderr；独立复核不能将其视作自己重新执行了这些命令。exe 的哈希是交付包记录值，本次没有收到或运行 exe。

### 独立执行

- 对 desktop.mjs、ui-regression.mjs、selection-actions.mjs、ssh-server.mjs 执行 `node --check`，四项通过。
- 直接调用当前 `assertSelectionActions`，重放两份报告中的 42 组操作区测量，全部通过。六组侧栏恢复记录的宽度差、手柄坐标差均为 0。
- 使用 TypeScript AST 提取当前 `formatHostIssues`、`taskResultSummary`，独立执行 8 组结构化校验问题样本、7 个任务状态展示样本。
- 提取原始表单 update 回调、初始化 snapshot effect，以隔离状态 setter 和受控 Promise rejection 检查其数据变化。
- Linux Chromium 加载上传的原始主题/CSS，检查部分不可用摘要的最终颜色，并静态求值欢迎页 JSX 的合成分支。

这些不是完整 React 生命周期测试、不是真实 IPC 故障注入，也不是 Windows Electron 重跑。图标在静态欢迎 JSX 中用同尺寸占位 SVG，不能用该截图宣称通过像素级 Windows 验收。尝试建立依赖运行环境未完成，不据此宣称执行了 pnpm 测试、完整构建或 Zod 真实 safeParse；校验样本依据只读 schema 构造，执行的展示函数来自实际源码。

## 2. 已完成、应保留的部分

**欢迎页**：正常已有主机分支突出快速打开，首次使用分支突出添加主机；取消了装饰编号；设置入口已降级为轻量操作。正常状态下的改造方向正确。

**主机表单**：真实连接字段、认证、整理备注、高级记录已分区；sshdPort 不再和公网连接端口并列争夺首屏；仍保留预览、固定保存区、未保存保护以及现有数据契约。

**系统诊断**：目标持续可见，四项范围更容易扫描，命令与执行约束可展开；独立 SSH、免交互认证和只读边界仍有说明。原始诊断命令未改。

**任务结果**：新增七种任务状态的说明和下一步提示，能说明 unavailable 与正常完成不同，终态无 message 时不再统一显示执行中。成功计数与不可用计数分开，未增加健康评分或虚构远端结果。

旧工作台没有发现本轮引入的源码回退；主机栏按钮、真实终端焦点、ANSI 和目标固定不是此次返工对象。

## 3. 待修复：表单错误上下文

### 3.1 认证切换后仍显示隐藏字段错误

上传的 `evidence/development/host-form.png` 本身已经展示：选中了 **SSH Agent**，私钥路径输入框不在 DOM 中，顶部却仍有“私钥文件路径：私钥引用须为现有文件的绝对路径”的可点击错误。

复现路径与 desktop.mjs 一致：选择私钥 → 填 `relative-key` → 保存触发 keyPath 错误 → 切回 Agent。

源码依据：

- HostForm.tsx L102–108：update 仅删除当前更新字段的错误；`update('auth', 'agent')` 删除的是 `errors.auth`，没有处理已不适用的路径格式错误。
- L249–279：认证 radio 调用上述 update；keyPath 字段只在 `form.auth === 'key'` 时渲染。
- L175–187：非 form 级错误全部渲染可点击按钮，点击 keyPath 后找不到控件，无法完成定位。

独立调用原 update 回调后，`form.auth === 'agent'` 与 `errors.keyPath` 同时存在，和原截图吻合。

**要求**：切换认证时重新核对错误的适用性，保留路径值与其他输入。不要一股脑清空真实错误。如果 schema 在 Agent 模式仍会校验 keyPath 的长度或控制字符，应保证相应错误存在可达的修正路径；不能伪造可聚焦链接。路径绝对性错误不适用于 Agent 时应移除；切回私钥并再次提交时仍应重新校验。

### 3.2 中文说明没有忠实反映字段限制

当前 formatHostIssues 主要按通用 code 替换，未区分数字、字符串、数组和数组元素：

| 场景 | 当前展示 | 必须保留的实际语义 |
|---|---|---|
| port 大于 65535 | 公网连接端口超过允许长度 | 端口范围 1–65535 |
| port 为 0 | 公网连接端口不能留空或长度不足 | 端口范围 1–65535 |
| 非整数端口的 invalid_type | 公网连接端口不能为空 | 必须为整数 |
| 超过 16 个标签 | 标签超过允许长度 | 标签数量最多 16 个 |
| 单标签超过 32 个字符 | 标签超过允许长度 | 单个标签最多 32 个字符 |
| username 格式错误 | 声称首字符只能字母或数字 | 当前 schema 同时允许下划线开头 |

私钥 custom issue 也被统一显示为绝对路径问题，掩盖换行/空字符错误；所有无 path 的问题仅因 `auth === 'key'` 就归入 keyPath，不符合“只有可明确归因时才映射”的原要求。

**要求**：按真实字段、issue 路径/结构化属性和当前上下文翻译，不修改 schema 或约束，不依赖英文报错字符串。只说明路径格式检查，不能称 UI 已验证文件存在或密钥可用。数值限制和标签数量/单项长度应给出可执行的中文纠正提示。

这不是校验引擎允许了非法端口；底层契约仍正确。问题在于新的 UI 错误说明不准确。

## 4. 待修复：首次加载失败被误当成无主机/OpenSSH缺失

App.tsx L160–168 的首次快照请求失败时，只调用 `report(String(e))`，随后把 loading 设为 false。初始 real 仍是 hosts=[]、sshAvailable=false，且没有 engineError。

欢迎页只检查 `real.engineError`（L1056 附近），因此在 **第一次请求拒绝且尚未收到任何有效快照** 的场景中，会同时落入“系统 OpenSSH 不可用”和“首次使用 / 先添加一台主机”的展示。一次读取失败并没有证据证明这两个事实。

独立受控 rejection 复核结果：loading=false；real.engineError 未设；firstUseBranch=true；sshMissingBranch=true。错误 toast 可以存在，但不会纠正欢迎页事实表达。本次没有声称交付方机器真实发生了该故障。

此外，已有 engineError 的欢迎页分支提示可以填写档案或探索演示，但该欢迎区域内只有“设置”按钮；全局添加/演示入口仍存在，因此不是全应用不可操作。修复错误分支时宜就近复用原入口，不新增后台能力。

**要求**：在 Renderer 维护足够的加载/失败状态，未获取有效快照不能作为空数据或 OpenSSH 已检测失败处理。有效快照恢复后清除对应错误；不清空真实数据，不修改 Snapshot 契约或 IPC，不新增自动重试循环，不让较早请求错误覆盖较新的有效数据。

## 5. 待修复：部分不可用摘要仍使用成功绿色

Tasks.tsx 的 summary 对 `succeeded + unavailable` 正确返回 `tone: 'warning'`，且文案正确。实际 DOM 却同时有：

```text
result-message result-succeeded result-tone-warning
```

style.css L2061–2066 仍将 result-succeeded 的左边线和图标设为 success；新增 tone 样式只处理 neutral / progress，没有 warning 的相应规则。

原 CSS 在 Linux Chromium 的计算结果：

- 左边线：`rgb(124, 203, 155)`。
- 图标：`rgb(124, 203, 155)`。
- 正好对应 `--success: #7CCB9B`，不是 `--warning: #E7BD72`。

**要求**：结果摘要的边线与图标按 summary tone 表示部分不可用；任务总体 `succeeded` 状态本身及其真实 badge 可以保留，不篡改 Engine 数据。不需要把整页染黄，也不重定义全局成功色。补实际渲染断言，不能仅检查函数返回 warning 或文案包含“部分项不可用”。

## 6. 原定第三轮验证尚未覆盖完整

20 条开发版/打包版检查大多是既有工作台回归加上局部新增断言；它们有价值，但不能替代第三轮四页面的测试矩阵。

- `ui-regression.mjs` 的 12/13/17 × 窗口循环，在采样前显式点击 terminalTab；两份报告中全部 ui.windows 记录都存在 activePane。它们证明的是终端工作台，不是四个页面。
- 新增 ui-round3.test.ts 有两项测试：一项 formatHostIssues 合成问题，一项 taskResultSummary 合成状态。并非罕见状态的完整组件渲染验证。
- 欢迎页按当前 hostCount 只走一个分支，未独立覆盖加载、请求拒绝、OpenSSH 缺失、空数据及演示分支。
- 表单确实新增了 sshdPort 自动展开及相对私钥路径错误检查，但没有覆盖切换 Agent 后的旧错误清理，也未给出保存拒绝/双提交保护/长路径与标签及四页面最小窗大字号的完整证据。
- 任务截图覆盖常规、失败、未知；未见部分不可用的实际渲染、复制失败、取消请求等罕见状态的组件证据。日志复制成功、现有回环与旧过滤同步测试应保留，不是说整个功能没测。

**补测范围以原第三轮 Prompt 为限**：四页面在要求的窗口/字号下的实际内容边界、关键状态与交互。允许罕见状态使用隔离组件 fixture，但须使用当前真实组件，不仅测试手抄 HTML；标明合成组件、开发 Electron、打包 Electron与真实回环的来源。

原来的 42 组按钮测量和六组侧栏准确恢复继续保留，不能通过扩大侧栏/窗口、放宽阈值或假记录 checks 获得通过。

## 7. 收口条件

三组问题（表单、欢迎页加载失败、任务 warning）按明确行为修复，补齐原约定验证后即可结束第三轮。此次没有要求新主题、导航重做、监控能力、后台协议或第四轮。

父仓库暂存状态和未提交/未推送身份不在无 Git 元数据的源码包中，不能独立认证。缺少旧验收 md 已如实记录，不是验收阻塞项。

本次独立脚本、原图裁剪、原文摘录与测量见配套 review-package 的 independent/；涉及 Windows 字体、IME、跨屏 DPI 和安装器流程仍按既有验证边界保留，不作为这次新增条件。
