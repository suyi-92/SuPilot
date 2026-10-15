# 依赖修正

本目录由 SuPilot 跟踪，不属于父项目直接文件。`pnpm-workspace.yaml` 的
`patchedDependencies` 与 pnpm 生成的锁文件应用这些补丁；正式构建不依赖 `.local/`。

`node-pty@1.1.0.patch` 修复 Windows 系统 ConPTY 自然退出后遗留的输入管道、
输出 worker 和 pseudoconsole 句柄，并关闭强制退出路径的输入管道。
自然退出清理不枚举或结束已退出 Shell 的 PID，避免 PID 重用问题。
修改同时覆盖发布的 JS 与对应 TS。原生二进制、ABI 与 SSH 协议不变。

`pnpm test` 中真实 loopback SSH 会话的自然退出与测试进程正常结束是回归门禁。
依赖升级时先检查上游是否已修复，再决定删除或重新应用补丁。
