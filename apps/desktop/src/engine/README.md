# 后台进程入口

## 用途

启动 utilityProcess，装配核心服务和内置插件，处理 Electron 特有生命周期与传输适配。

## 限制

通用业务放 packages/engine；进程入口不维护第二份会话或数据库状态。

本目录中的正式源码、说明和配置应纳入 Git；目前为骨架，未提供实际业务实现。生成产物和本机材料遵守项目忽略规则。

完整规则见 [AGENTS.md](../../../../AGENTS.md)，目录索引见 [directory-map.md](../../../../docs/directory-map.md)。
