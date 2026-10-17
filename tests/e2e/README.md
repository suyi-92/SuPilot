# 桌面端到端验证

## 用途

真实窗口、连接、键盘、布局、生命周期及打包产物的关键流程。

## 限制

使用 Playwright；截图/报告放忽略目录（2.1 原记录位于 `.local/Test/ui-round2.1/`，最终按钮补丁位于 `.local/Test/ui-round2.1-final-fix/`），样例仅使用合成数据。

## v0.1 状态

desktop.mjs 用 Playwright 启动 Electron，--packaged 改测 release/win-unpacked/SuPilot.exe。native-worker.cjs 在实际 utilityProcess 加载应用自己的 node-pty/SQLite，检查 Unicode、尺寸和长粘贴。使用 SuPilot-test 配置；先完成 pnpm build 或 package:win。界面回归覆盖快速打开/会话复用、未保存表单与错误焦点、任务筛选目标同步、窄窗口模态详情/任务选择、标签键盘导航，并继续检查实际回环 SSH 与原生模块。

selection-actions.mjs 通过 DOM Range 检查“新建”的真实文字片段、可见边界、scrollWidth/clientWidth、SVG 和相邻按钮，不能仅以 span 外框判定完整显示。12/13/17px 与最小/900×650/1280×800/1440×940 窗口矩阵保留；最小窗口额外保存初始侧栏、拖至组件允许最小比例、恢复原手柄位置三种状态及截图。恢复宽度/手柄容差为 0.5 CSS px，文字边界仅容许 1/64 CSS px 的 DOMRect 量化误差；缺少面板或手柄直接失败。报告记录真实外窗尺寸、viewport、DPR、zoom 和内容边界。长主机名的正常省略与终端滚动不适用短标签的完整显示断言。

第三轮记录保留在 `.local/Test/ui-round3/`。3.1 的开发版、打包版报告写入 `.local/Test/ui-round3.1/`。desktop.mjs 保留原终端矩阵，另调用 page-matrix.mjs 实际进入欢迎、主机表单、诊断、任务四页面；每页覆盖外窗 850×600、900×650、1280×800、1440×900 和 UI 12/13/17px，共 48 行。报告包含请求/实际外窗、viewport、DPR、zoom、页面/侧栏/详情/任务区域尺寸，以及 DOM Range 文字、SVG、相邻控件、遮挡、固定页脚和颜色对比度。最窄侧栏使用真实手柄拖动并精确恢复，未改变旧回归阈值。

`node tests/e2e/ui-round31.mjs` 用既有 Vite/React/Playwright/Electron 挂载当前 App 与 CSS，在隔离临时配置中提供合成 DesktopAPI；不连接 Engine，不新增生产 IPC，不读取用户档案。round31-host.cjs 先加载空页，测试安装 API 后才进入 round31-fixture.html / round31-entry.jsx。覆盖首次请求拒绝、恢复与旧请求竞态，表单校验/认证/保存拒绝/忙碌/未保存保护，诊断无目标/忙碌/固定目标，任务七种状态/部分不可用/日志/取消/筛选。剪贴板在 fixture 内模拟成功和失败，不改系统剪贴板；真实应用复制测试仍保存并恢复系统剪贴板。

此合成测试同样执行 48 行页面矩阵，并展开实际任务面板以限制中央页面高度。它不替代 desktop.mjs 的真实 IPC、独立 SSH、信任和 ConPTY 回环验证。可选 `--baseline` 从 `.local/Test/ui-round3.1/baseline/` 读取任务开始时保存的四个文件，只通过测试服务覆盖加载结果；不修改工作目录、不检出旧版本。正常运行不依赖这些本地副本。基线回放失败属于预期，必须保留报告和截图并标明是保存字节的回放。

native-worker.cjs 保留原 20 秒超时、退出码及五项输出断言。检查标记在流到达时累计，避免 11000 字符粘贴的终端回显挤出有界日志尾部；报告同时记录 observed 和原始输出尾部。这是测试采集修正，不改变终端实现。

正式源码与说明由 SuPilot 独立仓库跟踪；生成产物和本机材料遵守项目忽略规则。

完整规则见 [AGENTS.md](../../AGENTS.md)，目录索引见 [directory-map.md](../../docs/directory-map.md)。
