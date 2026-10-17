# SuPilot UI 2.1 独立复核

## 结论

**2.1 的实际修改已交付，但尚不能全项验收。**

终端标题层级、标题排布、12/13/17px 矩阵和 ANSI 代表色验证可认可。本轮原有必修项 A 在最小侧栏宽度下仍未解决：“新建”的文字越出按钮边框；新增测试只验证 span 元素框，没有验证真实文字范围，因而误通过。另有测试恢复面板宽度不准确的问题。

本次不是要求重新换主题或增加一轮视觉重设计。只需修复该局部按钮以及相关测试；保留已完成的改动。

## 1. 复核材料与边界

输入：

- `SuPilot-source-round2.1.zip`：SHA-256 `ca17147f8bf994e4c569a905401637a5b3a9ea5d7257930c21d615002dcbbf32`。
- `SuPilot-ui-round2.1-evidence.zip`：SHA-256 `93b59019ba6a5759af6a015d4852e608079f8f5f416370f1d62b7992a2340148`。
- 对比基线：此前上传的 `SuPilot-source-round2-4190ab6.zip`。

已完成独立工作：逐文件差异比对、关键源码及测试审查、原始截图检查、三份脚本 `node --check`、使用当前主题和应用 CSS 的 Linux Chromium 局部复现。未修改交付源码。

未独立重跑 pnpm build/test/test:desktop、Windows Electron、安装器、系统 DPI、中文 IME 或真实 VPS。上传桌面报告包含 20 条检查、`errors: []`、`packaged: false`，这是交付方测试结果，不等于独立重跑。证据包包含 54 张 PNG、2 份 JSON，其中存在 before/after 与运行目录的重复截图。

不含 Git 元数据的包不能证明 commit/push 或父仓库暂存状态。

## 2. 可以认可的部分

### 2.1 源码确实包含局部修改

相对第二轮，10 个既有文件改变，新增两份历史审查/指令文档。生产代码变化集中于 `App.tsx` 的按钮展示、`style.css` 和 `Terminal.tsx` 的名称 class。

以下目录逐文件字节一致：`packages/engine/`、`packages/contracts/`、`packages/ui/`、`apps/desktop/src/engine/`、`apps/desktop/src/main/`、`apps/desktop/src/preload/`；锁文件也一致。

### 2.2 终端标题层级有实际改善

- `.pane-name` 使用主文字、`1rem` 和 500 字重。
- `.pane-user` 保留辅助文字、等宽字体和相对字号。
- 窄窗格中身份两行，状态与工具位于侧边同一排，没有恢复错误的整个标题栏 focus-within 输入高亮。
- 上传报告在最小窗口 / 17px 下记录标题高度约 57.77 CSS px；旧报告约 89.73px。前后侧栏宽度并非完全相同，故不能把这两个数字当作严格固定所有变量的测量，但截图和源码均支持标题变紧凑。
- UI 12/13/17px 的报告中，名称分别为 12/13/17px，端点随 UI 设置增长，xterm 字号始终为 14px。

### 2.3 ANSI 验证不再只是 rgb() 正则

`tests/fixtures/ssh-server.mjs` 输出标准 `31m`、`32m`、`34m` 的红、绿、蓝样本；`tests/e2e/desktop.mjs` 比对真实 xterm DOM 的渲染颜色，并保存三套截图。

独立读取截图的样本区域，也能找到报告对应的精确 RGB 像素：

| 配色 | 红 | 绿 | 蓝 |
|---|---|---|---|
| Dark+ | 205,49,49 | 13,188,121 | 36,114,200 |
| Graphite | 231,136,142 | 125,206,176 | 122,165,245 |
| Classic | 255,117,127 | 145,207,123 | 130,170,255 |

这足以满足上轮“代表色 + 实际渲染证据”的要求，不等于自动穷举了全部 16 色和所有终端输出状态；不要求为本次按钮问题继续重做 ANSI 验证。

## 3. 必修项 A 仍未通过：span 框合格，文字本身溢出

### 3.1 原始截图可见

来源：`after/window-850x600-ui-17-after.png`，同时也存在于最终运行目录。左下角按钮的“建”越过右侧边框，接近编辑图标。

交付报告在该场景记录：

- 最小外部窗口 850×600；viewport 836×564 CSS px。
- 侧栏宽约 125.92px。
- 操作区宽约 109.92px。
- 主按钮宽约 47.92px。
- `.selection-action-label` 元素框宽约 15.58px。
- `labelInside: true`。

同一报告的宽栏 / 17px 条件下，“新建”文字容器自然宽度约 31.38px。窄栏中的 15.58px 元素框明显不足以容纳这两个字。

### 3.2 源码原因

`apps/desktop/src/renderer/app/style.css:290–315`：

```css
.selection-actions {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 28px 28px;
  gap: 3px;
}
.selection-actions .button {
  display: inline-flex;
  gap: 4px;
  padding: 3px 7px;
  min-width: 0;
  white-space: nowrap;
}
.selection-actions .button > svg {
  flex: 0 0 auto;
}
.selection-action-label {
  min-width: 0;
  white-space: nowrap;
}
```

文字 span 仍允许 flex 收缩，文字不换行；删除原有 `overflow: hidden` 后，超出的字符会直接画到按钮外。缩短文案解决了较宽场景，但没有解决最窄允许侧栏。

不能只给按钮增加 min-width：整个操作区仍可能容不下按钮与两个图标列，需要设计实际容器级的紧凑排布。

### 3.3 新断言为什么误通过

`tests/e2e/ui-regression.mjs:264–274, 301` 读取的是：

```js
const labelBox = button.querySelector('.selection-action-label')?.getBoundingClientRect()
```

它证明 span 的布局框在按钮里面，不证明文字内容在框里面。额外的相邻按钮检测也只比较按钮矩形，不能发现文字侵入相邻点击区域。

### 3.4 独立复现

使用上传的原始 theme/app CSS，加局部 DOM 和基础 reset，在 Linux Chromium 复现，未启动 React/Electron；字体使用本机回退，因此小数不应当冒充 Windows 实测。

| UI 字号 | 按钮框宽 | span 框宽 | Range 文字宽 | 原断言 | 文字超出按钮右侧 |
|---|---:|---:|---:|---|---:|
| 12 | 47.91 | 14.91 | 22.13 | 通过 | 0.00 |
| 13 | 47.91 | 14.91 | 24.00 | 通过 | 1.09 |
| 17 | 47.91 | 14.91 | 31.38 | 通过 | 8.47 |

测量应使用 `Range.selectNodeContents(label)` 得到文字片段边界，并结合可见区域、是否被裁切和相邻控件交叠判断。对于这个本应完整显示的短文案，也应检查 `scrollWidth/clientWidth` 或等价内容溢出证据。不要把同样的“禁止省略”规则套用到允许 ellipsis 的长主机名。

## 4. 测试恢复逻辑并没有恢复原布局

`tests/e2e/ui-regression.mjs:313–325`：

```js
Math.max(restoreSidebarHandleX, handleBox.x + handleBox.width / 2 + 100)
```

这会强制向右至少拉宽 100px，而不是准确回到保存的位置。报告中 900px 窗口的侧栏宽度从 13px UI 场景的约 133.92px，变为 17px UI 场景的约 240.22px，支持后续场景使用不同侧栏比例这一判断。

这不是已证明生产布局被污染；它发生在测试流程中。但它不能称为精确恢复，也削弱了后续窄栏大字号覆盖。

应该保存并恢复真实布局/原坐标，恢复后在同一窗口条件下断言侧栏宽度或比例相符。此前恢复后暴露的后续失败应在其实际布局条件下修正，不应通过额外拉宽规避。

## 5. 最小修复范围

只做两件事：

1. 让主机栏按钮在实际允许最窄宽度 / 12、13、17px 下完整可见、不侵入相邻按钮。优先采用按容器宽度触发的计划性两行布局：主按钮一行，编辑/删除对齐一行；也可采用其他有真实验证的紧凑方案。不要再缩字号、隐藏短文案、仅保留无说明加号，或重置用户面板宽度。
2. 修正文字内容检测与布局恢复测试。先证明新断言能使当前问题版本失败，再修布局后通过。提交真实最窄侧栏截图和机器可读的内容边界记录。

保留终端标题、ANSI、主题及所有第一轮状态/目标语义。本次完成前不进入第三轮，但也不新增无关设计目标。
