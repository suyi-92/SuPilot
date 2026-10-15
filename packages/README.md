# 内部共享包

## 用途

contracts、engine、ui 与 plugin-sdk 的实现边界。

## 限制

按明确依赖方向复用，不将此目录变成无归属的 utils 集合。

## v0.1 状态

四个内部包已有真实入口与 workspace 依赖；不依赖父仓库其他项目。

正式源码与说明由 SuPilot 独立仓库跟踪；生成产物和本机材料遵守项目忽略规则。

完整规则见 [AGENTS.md](../AGENTS.md)，目录索引见 [directory-map.md](../docs/directory-map.md)。
