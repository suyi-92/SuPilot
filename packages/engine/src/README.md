# 核心业务源码

## 用途

按 hosts、ssh、sessions、trust、tasks、storage、plugins 组织。

## 限制

避免跨模块直接修改内部状态；连接与任务的事实来源在此，不在 Renderer。

## v0.1 状态

index.ts 是编排入口；ssh、trust、sessions、tasks、storage 为实际模块。简单主机 CRUD/插件注册留在入口，未强拆空服务。

正式源码与说明由 SuPilot 独立仓库跟踪；生成产物和本机材料遵守项目忽略规则。

完整规则见 [AGENTS.md](../../../AGENTS.md)，目录索引见 [directory-map.md](../../../docs/directory-map.md)。
