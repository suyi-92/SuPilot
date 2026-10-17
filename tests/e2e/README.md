# 桌面端到端验证

## 用途

真实窗口、连接、键盘、布局、生命周期及打包产物的关键流程。

## 限制

使用 Playwright；截图/报告放忽略目录（2.1 原记录位于 `.local/Test/ui-round2.1/`，最终按钮补丁位于 `.local/Test/ui-round2.1-final-fix/`），样例仅使用合成数据。

## v0.1 状态

simple-flow.mjs 用 Playwright 启动 Electron，`--packaged` 改测本次构建的 `release/win-unpacked/SuPilot.exe`。使用 SuPilot-test 配置；先完成 pnpm build 或 package:win。界面回归覆盖主机→终端→工具→任务→设置、编辑草稿与未保存保护、真实回环 SSH、信任核对、分屏和任务结果；截图/报告写入 `.local/Test/ux-migration/`。旧的 desktop.mjs/page-matrix.mjs/ui-round31.mjs 保留为历史 3.1 回放资料，不作为新外壳的正式入口测试。

selection-actions.mjs 通过 DOM Range 检查“新建”的真实文字片段、可见边界、scrollWidth/clientWidth、SVG 和相邻按钮，不能仅以 span 外框判定完整显示。12/13/17px 与最小/900×650/1280×800/1440×940 窗口矩阵保留；最小窗口额外保存初始侧栏、拖至组件允许最小比例、恢复原手柄位置三种状态及截图。恢复宽度/手柄容差为 0.5 CSS px，文字边界仅容许 1/64 CSS px 的 DOMRect 量化误差；缺少面板或手柄直接失败。报告记录真实外窗尺寸、viewport、DPR、zoom 和内容边界。长主机名的正常省略与终端滚动不适用短标签的完整显示断言。

第三轮记录保留在 `.local/Test/ui-round3/`。3.1 的开发版、打包版报告写入 `.local/Test/ui-round3.1/`。简化流程本轮在 `.local/Test/ux-migration/` 保存主机、单/双终端、工具、诊断、任务、设置、编辑和小窗口大字号原始 PNG，以及开发版/打包版 JSON 报告。

`node tests/e2e/ui-round31.mjs` 用既有 Vite/React/Playwright/Electron 挂载当前 App 与 CSS，在隔离临时配置中提供合成 DesktopAPI；不连接 Engine，不新增生产 IPC，不读取用户档案。round31-host.cjs 先加载空页，测试安装 API 后才进入 round31-fixture.html / round31-entry.jsx。覆盖首次请求拒绝、恢复与旧请求竞态，表单校验/认证/保存拒绝/忙碌/未保存保护，诊断无目标/忙碌/固定目标，任务七种状态/部分不可用/日志/取消/筛选。剪贴板在 fixture 内模拟成功和失败，不改系统剪贴板；真实应用复制测试仍保存并恢复系统剪贴板。

此合成测试同样执行 48 行页面矩阵，并展开实际任务面板以限制中央页面高度。它不替代 desktop.mjs 的真实 IPC、独立 SSH、信任和 ConPTY 回环验证。可选 `--baseline` 从 `.local/Test/ui-round3.1/baseline/` 读取任务开始时保存的四个文件，只通过测试服务覆盖加载结果；不修改工作目录、不检出旧版本。正常运行不依赖这些本地副本。基线回放失败属于预期，必须保留报告和截图并标明是保存字节的回放。

native-worker.cjs 保留原 20 秒超时、退出码及五项输出断言。检查标记在流到达时累计，避免 11000 字符粘贴的终端回显挤出有界日志尾部；报告同时记录 observed 和原始输出尾部。这是测试采集修正，不改变终端实现。

正式源码与说明由 SuPilot 独立仓库跟踪；生成产物和本机材料遵守项目忽略规则。

完整规则见 [AGENTS.md](../../AGENTS.md)，目录索引见 [directory-map.md](../../docs/directory-map.md)。
