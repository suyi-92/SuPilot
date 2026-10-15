# 界面业务功能

## 用途

按 hosts、terminal、operations、tasks 划分用户功能。

## 限制

共享通用组件放 packages/ui；业务状态经 contracts 接收，不直接调用 Engine 实现。

## v0.1 状态

已实现 hosts、terminal、operations、tasks，跨进程请求经 contracts 和 Preload。

正式源码与说明由 SuPilot 独立仓库跟踪；生成产物和本机材料遵守项目忽略规则。

完整规则见 [AGENTS.md](../../../../../AGENTS.md)，目录索引见 [directory-map.md](../../../../../docs/directory-map.md)。
