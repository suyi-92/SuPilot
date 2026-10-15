# 契约源码

## 用途

可序列化协议、校验器与状态类型。

## 限制

先落实真实调用场景再定义接口；TypeScript 类型不能代替边界校验。

## v0.1 状态

index.ts 包含实际跨进程类型、状态与运行时校验，无 Node/Electron 依赖。

正式源码与说明由 SuPilot 独立仓库跟踪；生成产物和本机材料遵守项目忽略规则。

完整规则见 [AGENTS.md](../../../AGENTS.md)，目录索引见 [directory-map.md](../../../docs/directory-map.md)。
