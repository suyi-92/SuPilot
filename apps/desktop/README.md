# 桌面应用

## 用途

Electron 应用及进程入口、React 工作区、静态打包资源。

## 限制

后台与界面分别构建；原生依赖必须在打包产物中验证。

## v0.1 状态

已实现 electron-vite 主进程/后台/预加载/界面构建，electron-builder 输出 release/win-unpacked。根目录 pnpm dev、build、package:win 为真实命令。

正式源码与说明由 SuPilot 独立仓库跟踪；生成产物和本机材料遵守项目忽略规则。

完整规则见 [AGENTS.md](../../AGENTS.md)，目录索引见 [directory-map.md](../../docs/directory-map.md)。
