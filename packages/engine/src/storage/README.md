# 持久化

## 用途

SQLite 访问、schema 迁移、主机与任务存储、日志索引和留存策略。

## 限制

此处只存源码和正式迁移，实际数据库/日志位于应用数据目录；不持久化明文秘密。

## v0.1 状态

node:sqlite、WAL、schema 1、主机/任务 JSON、最近 200 条查询及旧记录清理、崩溃恢复已实现。有界步骤输出同存 SQLite，无单独日志文件。

正式源码与说明由 SuPilot 独立仓库跟踪；生成产物和本机材料遵守项目忽略规则。

完整规则见 [AGENTS.md](../../../../AGENTS.md)，目录索引见 [directory-map.md](../../../../docs/directory-map.md)。
