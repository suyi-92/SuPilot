# 正式测试

## 用途

需要长期维护的跨模块、真实应用验证与合成样例。

## 限制

本地结果放 .local/Test，秘密和生产目标不进入测试文件。

## v0.1 状态

已有六项关键集成测试与 Playwright 桌面/打包测试；只连接自建本机回环 SSH 服务，日志截图放 .local/Test。

正式源码与说明由 SuPilot 独立仓库跟踪；生成产物和本机材料遵守项目忽略规则。

完整规则见 [AGENTS.md](../AGENTS.md)，目录索引见 [directory-map.md](../docs/directory-map.md)。
