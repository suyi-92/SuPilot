# 诊断插件源码

## 用途

定义探测能力、诊断操作、参数与结构化结果。

## 限制

通过 SDK 执行，不另行启动 SSH 或读取其他会话；检查时间随结果返回。

## v0.1 状态

index.ts 导出四个固定命令，考虑 os-release、uptime/proc、df -Pk、meminfo/free 差异；Engine 统一执行。

正式源码与说明由 SuPilot 独立仓库跟踪；生成产物和本机材料遵守项目忽略规则。

完整规则见 [AGENTS.md](../../../AGENTS.md)，目录索引见 [directory-map.md](../../../docs/directory-map.md)。
