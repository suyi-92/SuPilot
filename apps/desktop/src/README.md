# 桌面应用源码

## 用途

按 main、preload、engine、renderer 分开维护进程入口与界面。

## 限制

不能混用 Renderer 与后台依赖。

## v0.1 状态

四个入口已有实现，Renderer 与后台分别打包，Preload 为 sandbox 兼容 CJS。

正式源码与说明由 SuPilot 独立仓库跟踪；生成产物和本机材料遵守项目忽略规则。

完整规则见 [AGENTS.md](../../../AGENTS.md)，目录索引见 [directory-map.md](../../../docs/directory-map.md)。
