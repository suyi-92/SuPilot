# Electron 主进程

## 用途

窗口、菜单、生命周期、系统集成、凭据保护和消息授权；装配后台与内置插件。

## 限制

保持主进程响应，不承担长时任务；不向 Renderer 暴露任意执行入口。

## v0.1 状态

已实现原生窗口、单实例、独立 userData、精确来源 IPC 授权、文件选择、MessagePort、退出确认和 Engine 崩溃反馈。没有密码保存服务。

正式源码与说明由 SuPilot 独立仓库跟踪；生成产物和本机材料遵守项目忽略规则。

完整规则见 [AGENTS.md](../../../../AGENTS.md)，目录索引见 [directory-map.md](../../../../docs/directory-map.md)。
