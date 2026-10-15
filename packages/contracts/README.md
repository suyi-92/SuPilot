# 跨进程契约包

## 用途

消息、DTO、错误与事件结构，以及运行时校验规则。

## 限制

保持平台中立；不依赖 Electron、React、具体插件或 Node 专有对象。

## v0.1 状态

src/index.ts 已定义 DTO、请求联合、DesktopAPI、Zod 主机及终端消息校验；仅依赖 Zod。

正式源码与说明由 SuPilot 独立仓库跟踪；生成产物和本机材料遵守项目忽略规则。

完整规则见 [AGENTS.md](../../AGENTS.md)，目录索引见 [directory-map.md](../../docs/directory-map.md)。
