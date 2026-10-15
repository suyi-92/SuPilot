# 内部共享包

## 用途

contracts、engine、ui 与 plugin-sdk 的实现边界。

## 限制

按明确依赖方向复用，不将此目录变成无归属的 utils 集合。

本目录中的正式源码、说明和配置应纳入 Git；目前为骨架，未提供实际业务实现。生成产物和本机材料遵守项目忽略规则。

完整规则见 [AGENTS.md](../AGENTS.md)，目录索引见 [directory-map.md](../docs/directory-map.md)。
