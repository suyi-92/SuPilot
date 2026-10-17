# SuPilot v0.1.0 界面审查记录

## 审查范围与边界

来源：用户提供的 `SuPilot-v0.1.0-source.zip`。检查了主工作区、主机表单、终端、诊断、任务、快速打开、共享组件、主题、界面文档以及相关测试脚本；本记录不是完整的后端安全审计。

未改动原始压缩包或解压后的项目源文件。当前环境无法安装项目所需的完整运行依赖，因此没有启动 Windows Electron，没有连接真实 SSH，也没有重新执行仓库中的集成或桌面测试。压缩包没有包含文档所列 `.local/Test/` 截图。

已使用 Chromium 对原始 `theme.css` 与 `style.css` 做隔离样式验证：移除导入指令和 Tailwind 源扫描指令，将与被测选择器相匹配的最小 DOM 放入浏览器读取最终样式。此验证可确认所列 CSS 层叠、字号、悬停颜色问题，但不能替代完整 React、Electron、Windows 字体、IME 或 DPI 验证。悬停测量等待 180ms，以避开现有 120ms 颜色过渡。

## 总体判断

现有项目具备终端优先、本地工作区、固定操作目标、只读诊断和持久任务的产品结构。视觉问题更像“设计规则没有收口”，而非缺少一个 UI 框架。应保留工作区结构和已实现的保护机制，优先修正状态表达、样式覆盖、字号与空间层级，不建议改造成大量卡片、渐变和装饰图表的后台首页。

## 已确认的问题

| 问题 | 证据 | 影响 | 建议 |
|---|---|---|---|
| 终端输入焦点边框被覆盖 | `style.css:1642–1644` 与 `2467–2469`，相同选择器权重；隔离实测为 `#3b3f48`，不是 `--ring` 的 `#007fd4` | 活动窗格和真正接受键盘输入的窗格难以明确区分 | 合并终端状态规则，显式定义 inactive / active / input-focused 三种状态 |
| 主按钮悬停文字对比度下降 | `theme.css:16–17,98–105`；白字对正常蓝为 4.529:1，对悬停蓝为 3.773:1 | 小字在悬停时失去对比度余量 | 悬停改为更深蓝，分别验证普通、悬停、焦点状态 |
| 欢迎页说明文字悬停对比度下降 | `style.css:2718–2721,2743–2746`；说明字 `#858585` 对悬停背景 `#252526` 为 4.150:1 | 已经很小的 10px 说明文字进一步变弱 | 使用统一次要文字 token，不要让局部小字保留过暗硬编码颜色 |
| 默认部分字号只有 10–11px | 主机状态、欢迎链接说明及欢迎页底部约 10px；详情字段 11px；主机名 12px | 重要性层次被过度小字号代替 | 普通阅读正文建议 14px，辅助说明建议 12px 起；提供舒适/紧凑两种密度 |
| 字号设置覆盖不完整 | 快速打开副行与搜索副行固定 11px，日志固定 12px；界面设置调到 17px 时仍不变 | 同一应用内文字缩放行为不一致 | 定义 UI、终端、日志各自的字号设置或统一继承策略 |
| 使用未定义 token | `style.css:1533–1535` 使用 `--text-muted`，主题中只有 `--muted-foreground` 等 | 该声明计算失效后继承父级颜色，配置标识不再按预期显示次要色 | 修正变量名并加入自定义属性检查 |
| 窄窗搜索框规则被后续基础规则覆盖 | `style.css:2169–2175` 与 `2243–2251`；900px 隔离测试最终宽度 342px，而先前媒体规则本会给出 252px | 窄窗紧凑化意图失效；完整布局的最终宽度还会受 flex 收缩影响 | 调整规则顺序、用明确层级管理基础样式与响应式覆盖 |
| 多个操作入口的目标语义不同 | 活动栏诊断采用 `selected || target`，详情栏诊断采用 `target`；测试明确允许左侧选北京、当前终端为东京 | 用户必须理解“选择”和“正在操作”的区别 | 保留固定目标，不做错误的全局同步；明确显示“选中主机”和“当前会话目标” |

备注：上面的字号与配色建议是设计方案，不是声称 WCAG 规定了某个最小中文字号。WCAG 普通文本通常以至少 4.5:1 作为 AA 对比度标准；目标尺寸条款通常为至少 24×24 CSS px，但存在间距与等效操作等例外，因此不能仅凭一个 23px 按钮断言整个应用不合规。

## 样式维护现状

`App.tsx` 为 1488 行；`style.css` 为 2880 行。仅统计该 CSS 文件最外层规则，共 476 条，其中 78 个完全相同的选择器文本重复出现。该文件包含 94 处十六进制颜色字面量、53 个不同字面值。统计未将媒体查询内规则混入最外层重复计数。

重复规则、行数和颜色数量本身不等于错误。这里值得重构的原因是：已经出现输入焦点覆盖、响应式规则覆盖和未定义变量等具体问题。已有的 theme token、Button、IconButton、Dialog、Status、Radix 和 Lucide 应继续复用，而不是先更换组件库。

## 页面级改进

### 工作区

将标签、工作区工具栏、窗格标题设计为同一层级体系，而非连续三条同样显眼的横条。保留会话身份和明确输入焦点；降低重复的“终端工作区”等说明权重。右侧详情按工作情境显示，分屏或任务详情页可默认收起，但保留固定目标提示。正式模式任务面板原本默认收起；演示模式会同时展开任务和详情，需单独优化其首次观感，不能混为一谈。

### 主机列表

保留树形列表和单击选择、双击连接。不要改成大卡片。建议常规单行 32–34px，舒适双行约 42–44px；选中项显示名称和地址，长名称有可访问的完整信息。将“列表选择”“当前会话”“等待认证”“已认证”分开表达；源代码里的活跃会话包括等待认证，不能把它改画成虚假的在线健康状态。

### 欢迎页

突出“添加主机”作为主要动作，“查看演示”作为次要动作。已有 SSH 配置自动发现与导入能力应按实际能力说明，不要仅为填充界面添加不存在的导入流程。弱化纯装饰的 01/02 编号和重复提示，不删除演示标识、安全边界或真实错误信息。

### 主机表单

第一层只突出连接名称、地址、连接端口、用户名和认证方式。远端 sshd 监听端口仅用于档案记录，应归入高级信息，而不是与真正用于连接的端口并列抢占注意力。分组、标签和备注作为整理信息。保留现有固定保存区、连接预览、错误摘要跳转、脏表单确认。补充统一的中文验证错误映射，而不是直接展示验证库原始消息。

### 诊断与任务

诊断页先给目标和执行范围，再给主动作，将具体命令和执行限制放入可展开信息。任务页保留现有固定目标、状态、耗时、完成项数和原始输出；强化失败原因与下一步排查动作。未来要显示磁盘百分比、内存卡片等结构化结果，需扩展结果解析和数据契约，不能仅凭原始输出补出伪监控面板。短日志无需强制占用过大的空白区域。

### 设置与帮助

应用主题与终端 ANSI 主题继续分开设置，但提供协调的默认组合；不要悄悄覆盖已有终端偏好。当前帮助和设置入口都打开同一弹窗，可改为一个设置入口内的不同分区，或者提供真正的帮助页。面板比例已有保存机制；侧栏、详情、任务开关未写入当前 `supilot-ui` 设置，适合增加工作模式偏好保存。

## 建议的配色方向：石墨灰 + 低饱和蓝

以下是建议起点，不是已经实现或已在完整应用中验证的主题。

| 用途 | 建议颜色 |
|---|---|
| 应用底层背景 | `#101216` |
| 主内容背景 | `#171A20` |
| 侧栏背景 | `#14171C` |
| 弹层/抬升表面 | `#20252D` |
| 装饰分隔线 | `#2C3440` |
| 主文字 | `#E6EAF0` |
| 次文字 | `#A7B0C0` |
| 辅助文字 | `#8D97A8` |
| 链接/焦点 | `#7AA2F7` |
| 主按钮 / 悬停 | `#2563EB` / `#1D4ED8` |
| 选中背景 | `#243247` |
| 成功 / 警告 / 错误 | `#7CCB9B` / `#E7BD72` / `#F08A8A` |

白字与建议主按钮的对比度约 5.169:1，悬停约 6.702:1；辅助文字与建议抬升表面约 5.224:1。其他状态、透明叠加、禁用状态和完整界面仍需逐项验证。装饰分隔线与用于识别交互状态的边线不是同一种 token，不应拿同一条对比度规则机械处理。

## 建议实施顺序

P0：修复输入焦点覆盖、未定义变量、窄窗样式覆盖；明确不同入口的目标语义；修复小字悬停对比度。

P1：统一语义颜色、字号、行高、组件高度和边距；减少饱和状态栏和重复信息；优化主工作区与演示首次展示。

P2：优化主机表单信息分组、任务失败结果与帮助设置；按功能拆分 App 和 CSS；保留现有数据契约与安全边界。

P3：建立稳定的视觉基线与状态测试。覆盖空工作区、长中文主机名、单/双终端、真实认证等待与失败、固定目标不同于列表选择、错误表单、任务各状态、快速打开无结果，以及窄窗和字体缩放。

验收至少包括：关键 UI 状态颜色可区分；普通阅读文字在普通和悬停状态满足预设对比度；调整字号后重要内容不遗漏、不截断；焦点目标明确；已存在的独立核验、脏表单确认、未确定任务结果等保护不退化。实际 Windows 字体、IME、原生窗口和系统 DPI 需要 Windows 环境验证。

## 标准参考

W3C：Understanding SC 1.4.3 Contrast (Minimum)、SC 1.4.11 Non-text Contrast、SC 2.5.8 Target Size (Minimum)。

VS Code 官方：Theme Color Reference，尤其是活动栏、列表、标签、输入框、按钮和焦点的独立语义颜色。

## 源码证据节选

### `packages/ui/src/themes/theme.css:1–37`

```text
   1 | :root {
   2 |   color-scheme: dark;
   3 |   --background: #1e1e1e;
   4 |   --surface: #252526;
   5 |   --surface-raised: #2d2d30;
   6 |   --surface-hover: #2a2d2e;
   7 |   --activity-background: #181818;
   8 |   --title-background: #181818;
   9 |   --input-background: #1f1f1f;
  10 |   --input-border: #3f3f46;
  11 |   --foreground: #d4d4d4;
  12 |   --muted-foreground: #c2c2c2;
  13 |   --subtle-foreground: #a5a5a5;
  14 |   --border: #454545;
  15 |   --border-soft: #2b2b2b;
  16 |   --accent: #0078d4;
  17 |   --accent-hover: #1687df;
  18 |   --link: #4fc1ff;
  19 |   --accent-foreground: #ffffff;
  20 |   --accent-muted: #094771;
  21 |   --selection-inactive: #37373d;
  22 |   --success: #89d185;
  23 |   --warning: #cca700;
  24 |   --danger: #f48771;
  25 |   --success-background: #253025;
  26 |   --warning-background: #352e1b;
  27 |   --danger-background: #352422;
  28 |   --demo-background: #6f3c86;
  29 |   --terminal-background: #1e1e1e;
  30 |   --ring: #007fd4;
  31 |   --ui-font-size: 13px;
  32 |   --mono-font: 'Cascadia Mono', Consolas, 'Microsoft YaHei UI', monospace;
  33 |   font-family: 'Segoe UI', 'Microsoft YaHei UI', 'Microsoft YaHei', sans-serif;
  34 |   font-size: var(--ui-font-size);
  35 |   font-synthesis: none;
  36 |   background: var(--background);
  37 |   color: var(--foreground);
```

### `packages/ui/src/themes/theme.css:98–105`

```text
  98 | .button-primary {
  99 |   background: var(--accent);
 100 |   border-color: var(--accent);
 101 |   color: var(--accent-foreground);
 102 | }
 103 | .button-primary:hover:not(:disabled) {
 104 |   background: var(--accent-hover);
 105 | }
```

### `apps/desktop/src/renderer/app/style.css:1530–1535`

```text
1530 | .host-row .host-state.local {
1531 |   color: var(--link);
1532 | }
1533 | .host-row .host-state.config {
1534 |   color: var(--text-muted);
1535 | }
```

### `apps/desktop/src/renderer/app/style.css:1642–1647`

```text
1642 | .terminal-pane.input-focused {
1643 |   border-color: var(--ring);
1644 | }
1645 | .terminal-pane.focused .pane-header {
1646 |   box-shadow: inset 0 1px var(--accent);
1647 | }
```

### `apps/desktop/src/renderer/app/style.css:2462–2479`

```text
2462 | .terminal-pane {
2463 |   border-color: #2b2b2b;
2464 |   background: var(--terminal-background);
2465 | }
2466 | 
2467 | .terminal-pane.focused {
2468 |   border-color: #3b3f48;
2469 | }
2470 | 
2471 | .pane-header {
2472 |   min-height: 32px;
2473 |   padding-left: 10px;
2474 |   background: #181818;
2475 |   border-bottom-color: #2b2b2b;
2476 | }
2477 | 
2478 | .terminal-pane.focused .pane-header {
2479 |   box-shadow: inset 0 1px var(--accent);
```

### `apps/desktop/src/renderer/app/style.css:2169–2175`

```text
2169 | @media (max-width: 900px) {
2170 |   .command-context {
2171 |     display: none;
2172 |   }
2173 |   .command-center {
2174 |     width: min(28vw, 260px);
2175 |   }
```

### `apps/desktop/src/renderer/app/style.css:2243–2251`

```text
2243 | .command-center {
2244 |   height: 27px;
2245 |   width: min(420px, 38vw);
2246 |   border-radius: 4px;
2247 |   border-color: #3d3d42;
2248 |   background: #252526;
2249 |   box-shadow: inset 0 1px 0 #ffffff08;
2250 |   color: #c8c8c8;
2251 | }
```

### `apps/desktop/src/renderer/app/style.css:2377–2384`

```text
2377 | .host-copy strong {
2378 |   font-size: 0.92308rem;
2379 |   line-height: 20px;
2380 | }
2381 | 
2382 | .host-state {
2383 |   font-size: 0.76923rem;
2384 | }
```

### `apps/desktop/src/renderer/app/style.css:2718–2722`

```text
2718 | .welcome-link:hover {
2719 |   background: #252526;
2720 |   color: #ffffff;
2721 |   text-decoration: none;
2722 | }
```

### `apps/desktop/src/renderer/app/style.css:2743–2746`

```text
2743 | .welcome-link small {
2744 |   color: #858585;
2745 |   font-size: 0.76923rem;
2746 | }
```

### `apps/desktop/src/renderer/app/style.css:1320–1329`

```text
1320 | .log-panel pre {
1321 |   font: 12px/1.8 var(--mono-font);
1322 |   padding: 14px;
1323 |   white-space: pre;
1324 |   margin: 0;
1325 |   color: var(--foreground);
1326 |   max-height: 440px;
1327 |   min-height: 220px;
1328 |   overflow: auto;
1329 |   user-select: text;
```

### `apps/desktop/src/renderer/app/style.css:2009–2012`

```text
2009 | .quick-result small {
2010 |   color: var(--subtle-foreground);
2011 |   font: 11px/1.8 var(--mono-font);
2012 | }
```

### `apps/desktop/src/renderer/app/App.tsx:567–587`

```text
 567 |             </IconButton>
 568 |             <IconButton
 569 |               label="任务记录"
 570 |               data-active={current?.kind === 'tasks'}
 571 |               onClick={() => openTasks()}
 572 |             >
 573 |               <ClipboardList size={24} />
 574 |             </IconButton>
 575 |             <span className="flex-1" />
 576 |             <IconButton label="键盘与使用说明" onClick={() => setSettings(true)}>
 577 |               <CircleHelp size={23} />
 578 |             </IconButton>
 579 |             <IconButton label="界面与终端设置" onClick={() => setSettings(true)}>
 580 |               <Settings2 size={23} />
 581 |             </IconButton>
 582 |           </div>
 583 |           <PanelGroup direction="horizontal" autoSaveId="supilot-main" className="main-panels">
 584 |             {ui.sidebar && !ui.focus && (
 585 |               <>
 586 |                 <Panel id="hosts" order={1} defaultSize={20} minSize={16} maxSize={34}>
 587 |                   <aside className="host-sidebar">
```

### `apps/desktop/src/renderer/app/App.tsx:1250–1264`

```text
1250 |                     <h4>快捷操作</h4>
1251 |                     <button
1252 |                       className="detail-action"
1253 |                       disabled={busy}
1254 |                       onClick={() => openHost(target, true)}
1255 |                     >
1256 |                       <TerminalSquare size={16} />
1257 |                       新建 SSH 会话
1258 |                       <Plus size={13} />
1259 |                     </button>
1260 |                     <button className="detail-action" onClick={() => openOperation(target)}>
1261 |                       <Activity size={16} />
1262 |                       系统诊断
1263 |                       <ChevronRight size={13} />
1264 |                     </button>
```

### `tests/e2e/desktop.mjs:183–190`

```text
 183 |   await page.getByLabel('搜索主机', { exact: true }).fill('alpine')
 184 |   assert.equal(await page.locator('.host-row').count(), 1)
 185 |   await page.getByRole('button', { name: '清除搜索', exact: true }).click()
 186 |   assert.equal(await page.locator('.host-row').count(), 14)
 187 |   await page.locator('.host-row').filter({ hasText: '北京' }).click()
 188 |   assert.match(await page.locator('.host-selection strong').innerText(), /北京/)
 189 |   assert.match(await page.locator('.detail-identity h3').innerText(), /东京/)
 190 |   await page.locator('.host-row').filter({ hasText: '东京 · 边缘节点 01' }).click()
```

### `apps/desktop/src/renderer/app/state.ts:22–37`

```text
  22 |   sidebar: true,
  23 |   details: true,
  24 |   tasks: false,
  25 |   focus: false,
  26 |   uiSize: Math.min(17, Math.max(12, Number(saved.uiSize) || 13)),
  27 |   terminalSize: Math.min(22, Math.max(11, Number(saved.terminalSize) || 14)),
  28 |   ansi: saved.ansi === 'classic' || saved.ansi === 'graphite' ? saved.ansi : 'dark-plus',
  29 |   set: (values) => {
  30 |     set(values)
  31 |     const s = get()
  32 |     localStorage.setItem(
  33 |       'supilot-ui',
  34 |       JSON.stringify({ uiSize: s.uiSize, terminalSize: s.terminalSize, ansi: s.ansi })
  35 |     )
  36 |   }
  37 | }))
```

## CSS 实测原始记录

```json
{
  "method": "Isolated Chromium CSS fixture using unmodified theme.css and style.css rules; @import/@source removed. No React/Electron runtime, no Tailwind utilities required for these tested declarations. Not a full-app visual test.",
  "default13px": {
    "focus": {
      "fontSize": "13px",
      "lineHeight": "19.5px",
      "color": "rgb(212, 212, 212)",
      "borderColor": "rgb(59, 63, 72)",
      "width": "1440px",
      "height": "940px"
    },
    "host": {
      "fontSize": "12px",
      "lineHeight": "20px",
      "color": "rgb(212, 212, 212)",
      "borderColor": "rgb(212, 212, 212)",
      "width": "1440px",
      "height": "20px"
    },
    "hoststate": {
      "fontSize": "9.99999px",
      "lineHeight": "15px",
      "color": "rgb(165, 165, 165)",
      "borderColor": "rgb(165, 165, 165)",
      "width": "auto",
      "height": "auto"
    },
    "welcomesmall": {
      "fontSize": "9.99999px",
      "lineHeight": "15px",
      "color": "rgb(133, 133, 133)",
      "borderColor": "rgb(133, 133, 133)",
      "width": "85.9844px",
      "height": "15px"
    },
    "welcomef": {
      "fontSize": "9.99999px",
      "lineHeight": "15px",
      "color": "rgb(133, 133, 133)",
      "borderColor": "rgb(48, 48, 48)",
      "width": "1209.62px",
      "height": "30px"
    },
    "detailfields": {
      "fontSize": "11px",
      "lineHeight": "16.4999px",
      "color": "rgb(212, 212, 212)",
      "borderColor": "rgb(212, 212, 212)",
      "width": "1440px",
      "height": "26.5px"
    },
    "configstate": {
      "fontSize": "9.99999px",
      "lineHeight": "15px",
      "color": "rgb(212, 212, 212)",
      "borderColor": "rgb(212, 212, 212)",
      "width": "19.9688px",
      "height": "15px"
    },
    "panebutton": {
      "fontSize": "12px",
      "lineHeight": "18.0001px",
      "color": "rgb(194, 194, 194)",
      "borderColor": "rgb(194, 194, 194)",
      "width": "23px",
      "height": "23px"
    },
    "tabclose": {
      "fontSize": "13px",
      "lineHeight": "19.5px",
      "color": "rgb(194, 194, 194)",
      "borderColor": "rgb(194, 194, 194)",
      "width": "22px",
      "height": "24px"
    },
    "quicksmall": {
      "fontSize": "11px",
      "lineHeight": "19.8px",
      "color": "rgb(165, 165, 165)",
      "borderColor": "rgb(165, 165, 165)",
      "width": "1420px",
      "height": "19.7969px"
    },
    "log": {
      "fontSize": "12px",
      "lineHeight": "21.6px",
      "color": "rgb(212, 212, 212)",
      "borderColor": "rgb(212, 212, 212)",
      "width": "1440px",
      "height": "220px"
    }
  },
  "ui17px": {
    "focus": {
      "fontSize": "17px",
      "lineHeight": "25.5px",
      "color": "rgb(212, 212, 212)",
      "borderColor": "rgb(59, 63, 72)",
      "width": "1440px",
      "height": "940px"
    },
    "host": {
      "fontSize": "15.6924px",
      "lineHeight": "20px",
      "color": "rgb(212, 212, 212)",
      "borderColor": "rgb(212, 212, 212)",
      "width": "1440px",
      "height": "20px"
    },
    "hoststate": {
      "fontSize": "13.0769px",
      "lineHeight": "19.6154px",
      "color": "rgb(165, 165, 165)",
      "borderColor": "rgb(165, 165, 165)",
      "width": "auto",
      "height": "auto"
    },
    "welcomesmall": {
      "fontSize": "13.0769px",
      "lineHeight": "19.6154px",
      "color": "rgb(133, 133, 133)",
      "borderColor": "rgb(133, 133, 133)",
      "width": "112.5px",
      "height": "19.6094px"
    },
    "welcomef": {
      "fontSize": "13.0769px",
      "lineHeight": "19.6154px",
      "color": "rgb(133, 133, 133)",
      "borderColor": "rgb(48, 48, 48)",
      "width": "1209.62px",
      "height": "34.6094px"
    },
    "detailfields": {
      "fontSize": "14.3846px",
      "lineHeight": "21.5768px",
      "color": "rgb(212, 212, 212)",
      "borderColor": "rgb(212, 212, 212)",
      "width": "1440px",
      "height": "31.5781px"
    },
    "configstate": {
      "fontSize": "13.0769px",
      "lineHeight": "19.6154px",
      "color": "rgb(212, 212, 212)",
      "borderColor": "rgb(212, 212, 212)",
      "width": "26.125px",
      "height": "19.6094px"
    },
    "panebutton": {
      "fontSize": "15.6924px",
      "lineHeight": "23.5385px",
      "color": "rgb(194, 194, 194)",
      "borderColor": "rgb(194, 194, 194)",
      "width": "23px",
      "height": "23px"
    },
    "tabclose": {
      "fontSize": "17px",
      "lineHeight": "25.5px",
      "color": "rgb(194, 194, 194)",
      "borderColor": "rgb(194, 194, 194)",
      "width": "22px",
      "height": "24px"
    },
    "quicksmall": {
      "fontSize": "11px",
      "lineHeight": "19.8px",
      "color": "rgb(165, 165, 165)",
      "borderColor": "rgb(165, 165, 165)",
      "width": "1420px",
      "height": "19.7969px"
    },
    "log": {
      "fontSize": "12px",
      "lineHeight": "21.6px",
      "color": "rgb(212, 212, 212)",
      "borderColor": "rgb(212, 212, 212)",
      "width": "1440px",
      "height": "220px"
    }
  },
  "staticMetrics": {
    "appTsxLines": 1488,
    "styleCssLines": 2880,
    "topLevelRuleCount": 476,
    "topLevelRepeatedExactSelectorCount": 78,
    "topLevelSelectorExamples": [
      [
        ".work-tab > button:first-child",
        3
      ],
      [
        ".app-header",
        2
      ],
      [
        ".brand",
        2
      ],
      [
        ".brand strong",
        2
      ],
      [
        ".demo-banner",
        2
      ],
      [
        ".activity-rail",
        2
      ],
      [
        ".activity-rail .icon-button",
        2
      ],
      [
        ".activity-rail [data-active=\"true\"]",
        2
      ],
      [
        ".main-panels",
        2
      ],
      [
        ".resize-handle",
        2
      ],
      [
        ".resize-handle:hover,\n.resize-handle[data-resize-handle-active]",
        2
      ],
      [
        ".host-sidebar",
        2
      ],
      [
        ".sidebar-title",
        2
      ],
      [
        ".sidebar-title h2",
        2
      ],
      [
        ".search-box",
        2
      ]
    ],
    "undefinedCustomProperties": [
      "--text-muted"
    ],
    "styleCssLiteralHexOccurrences": 94,
    "styleCssUniqueLiteralHexValues": 53
  },
  "sourceColorContrastRatios": [
    {
      "foreground": "#858585",
      "background": "#1e1e1e",
      "contrast": 4.518
    },
    {
      "foreground": "#858585",
      "background": "#252526",
      "contrast": 4.15
    },
    {
      "foreground": "#a5a5a5",
      "background": "#1e1e1e",
      "contrast": 6.768
    },
    {
      "foreground": "#ffffff",
      "background": "#0078d4",
      "contrast": 4.529
    },
    {
      "foreground": "#ffffff",
      "background": "#1687df",
      "contrast": 3.773
    },
    {
      "foreground": "#d4d4d4",
      "background": "#1e1e1e",
      "contrast": 11.247
    },
    {
      "foreground": "#3f3f46",
      "background": "#1f1f1f",
      "contrast": 1.578
    }
  ],
  "hoverAndResponsiveFixture": {
    "primaryNormal": {
      "background": "rgb(0, 120, 212)",
      "color": "rgb(255, 255, 255)",
      "fontSize": "13px",
      "width": "74px",
      "height": "29.5px"
    },
    "primaryHover": {
      "background": "rgb(22, 135, 223)",
      "color": "rgb(255, 255, 255)",
      "fontSize": "13px",
      "width": "74px",
      "height": "29.5px"
    },
    "welcomeHover": {
      "background": "rgb(37, 37, 38)",
      "color": "rgb(255, 255, 255)",
      "fontSize": "13px",
      "width": "836px",
      "height": "53px"
    },
    "welcomeSmallHover": {
      "background": "rgba(0, 0, 0, 0)",
      "color": "rgb(133, 133, 133)",
      "fontSize": "9.99999px",
      "width": "59.9062px",
      "height": "15px"
    },
    "commandAt900px": {
      "background": "rgb(37, 37, 38)",
      "color": "rgb(200, 200, 200)",
      "fontSize": "12px",
      "width": "342px",
      "height": "27px"
    }
  }
}
```
