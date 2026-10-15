# 终端视图

## 用途

xterm.js 挂载、键盘输入、粘贴、滚动、尺寸、焦点与配色。

## 限制

SSH/PTY 生命周期归后台；高频输出不逐块写入 React/Zustand，不插入任务自动按键。

## v0.1 状态

Terminal.tsx 使用 xterm、FitAddon 和专用 MessagePort；ACK 背压、字号/尺寸、焦点及复制粘贴，不将输出存入 React/Zustand。

正式源码与说明由 SuPilot 独立仓库跟踪；生成产物和本机材料遵守项目忽略规则。

完整规则见 [AGENTS.md](../../../../../../AGENTS.md)，目录索引见 [directory-map.md](../../../../../../docs/directory-map.md)。
