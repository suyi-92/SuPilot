# 桌面端到端验证

## 用途

真实窗口、连接、键盘、布局、生命周期及打包产物的关键流程。

## 限制

使用 Playwright；截图/报告放忽略目录，样例仅使用合成数据。

## v0.1 状态

desktop.mjs 用 Playwright 启动 Electron，--packaged 改测 release/win-unpacked/SuPilot.exe。native-worker.cjs 在实际 utilityProcess 加载应用自己的 node-pty/SQLite，检查 Unicode、尺寸和长粘贴。使用 SuPilot-test 配置；先完成 pnpm build 或 package:win。

正式源码与说明由 SuPilot 独立仓库跟踪；生成产物和本机材料遵守项目忽略规则。

完整规则见 [AGENTS.md](../../AGENTS.md)，目录索引见 [directory-map.md](../../docs/directory-map.md)。
