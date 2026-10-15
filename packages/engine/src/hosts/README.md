# 主机与连接端点

## 用途

稳定主机 ID、分组、标签、连接端点、认证引用和已知远端信息。

## 限制

公网端口与远端监听端口分开；不将 IP 当唯一身份或保存明文秘密。

## v0.1 状态

当前主机 CRUD 在 ../index.ts，持久化在 ../storage/index.ts，校验在 contracts；本目录仅保留职责说明，不重复实现。

正式源码与说明由 SuPilot 独立仓库跟踪；生成产物和本机材料遵守项目忽略规则。

完整规则见 [AGENTS.md](../../../../AGENTS.md)，目录索引见 [directory-map.md](../../../../docs/directory-map.md)。
