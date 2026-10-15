# 受控界面桥接

## 用途

在隔离上下文中向 Renderer 提供最小、类型化接口。

## 限制

不是独立进程；不透传通用 ipcRenderer，不处理业务任务或泄露凭据。

## v0.1 状态

index.ts 暴露 request、subscribe、attachTerminal、chooseKey；不暴露 ipcRenderer 或任意 Node 能力。

正式源码与说明由 SuPilot 独立仓库跟踪；生成产物和本机材料遵守项目忽略规则。

完整规则见 [AGENTS.md](../../../../AGENTS.md)，目录索引见 [directory-map.md](../../../../docs/directory-map.md)。
