# 后台进程入口

## 用途

启动 utilityProcess，装配核心服务和内置插件，处理 Electron 特有生命周期与传输适配。

## 限制

通用业务放 packages/engine；进程入口不维护第二份会话或数据库状态。

## v0.1 状态

index.ts 仅适配父进程消息/终端端口，创建 Engine 并注册 Diagnostics；业务仍归 packages/engine。

正式源码与说明由 SuPilot 独立仓库跟踪；生成产物和本机材料遵守项目忽略规则。

完整规则见 [AGENTS.md](../../../../AGENTS.md)，目录索引见 [directory-map.md](../../../../docs/directory-map.md)。
