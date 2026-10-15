# 核心业务源码

## 用途

按 hosts、ssh、sessions、trust、tasks、storage、plugins 组织。

## 限制

避免跨模块直接修改内部状态；连接与任务的事实来源在此，不在 Renderer。

本目录中的正式源码、说明和配置应纳入 Git；目前为骨架，未提供实际业务实现。生成产物和本机材料遵守项目忽略规则。

完整规则见 [AGENTS.md](../../../AGENTS.md)，目录索引见 [directory-map.md](../../../docs/directory-map.md)。
