# OpenSSH 适配

## 用途

系统/随包 OpenSSH 探测、命令参数、SSH 配置、Agent、跳板机与传输适配。

## 限制

所有连接遵守核心信任策略；系统配置不静默覆盖，参数与远程转义需分别处理。

## v0.1 状态

系统 OpenSSH 检测、参数数组、应用 SSH 配置、用户 `~/.ssh/config` 的只读 Host/Include 导入、独立 BatchMode 执行、超时/取消/128 KiB 输出限制已实现。无随包 SSH、跳板机 UI 或文件传输。

正式源码与说明由 SuPilot 独立仓库跟踪；生成产物和本机材料遵守项目忽略规则。

完整规则见 [AGENTS.md](../../../../AGENTS.md)，目录索引见 [directory-map.md](../../../../docs/directory-map.md)。
