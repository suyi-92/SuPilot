# 开发与验证

## 当前能做什么

当前仓库只提供结构、规则和 `.local/` 初始化工具。没有应用入口、应用依赖、可执行产物或正式测试套件。

在项目根目录执行：

```powershell
node --version
node scripts/init-local.mjs
git status --short
```

Node.js 22+ 足以运行当前脚本。未来 Electron、Node、pnpm 和原生依赖的兼容版本在实际搭建应用时统一验证；本机碰巧安装的最新 Node 版本不自动成为发布标准。

无需为骨架安装应用依赖。已用 pnpm 11.25.0 验证 `pnpm local:init`，根包记录该工具版本。pnpm 执行时自动初始化了空依赖锁文件与被忽略的依赖元数据目录，没有引入 Electron 等应用依赖。

需要只创建本地材料目录时直接运行 Node.js 命令；pnpm 入口运行同一脚本，但包管理器自身可能初始化工作区或检查更新。

## 工作区命名

| 路径 | 包名 |
| --- | --- |
| 根目录 | `supilot-workspace` |
| `apps/desktop` | `@supilot/desktop` |
| `packages/contracts` | `@supilot/contracts` |
| `packages/engine` | `@supilot/engine` |
| `packages/ui` | `@supilot/ui` |
| `packages/plugin-sdk` | `@supilot/plugin-sdk` |
| `plugins/diagnostics` | `@supilot/plugin-diagnostics` |
| `plugins/access` | `@supilot/plugin-access` |
| `plugins/surelay` | `@supilot/plugin-surelay` |

包保持私有。实际使用内部包时再建立真实的 `workspace:*` 依赖与导出入口，避免为不存在的源码声明入口。

## 实施阶段

| 阶段 | 交付内容 | 验收重点 |
| --- | --- | --- |
| 骨架（当前） | 目录、文档、规则、初始化脚本 | 目录有说明，Git 忽略边界正确，重复初始化不覆盖材料 |
| 界面原型 | 主工作区、插件操作页、批量任务页 | 对象与焦点明确，缩放可用，模拟数据明确标识 |
| 技术验证 | Electron + PTY + OpenSSH 的真实链路 | 认证、指纹、输入法、窗口尺寸、全屏程序、断线和退出 |
| 日常 MVP | 主机管理、稳定终端、只读诊断任务 | 完整打通添加主机 → 连接 → 操作 → 结果与记录 |
| 插件接入 | SuRelay 适配及访问保护 | 能力探测、版本边界、独立连接验证、失败与恢复 |
| 扩展交付 | 批量任务、文件传输、完整打包升级 | 并发、持久化、真实 Windows 安装产物和兼容性 |

界面原型和真实连接验证相互补充，不能用模拟状态替代真实链路。每个阶段完成后更新根 README 的实际状态。

## 后续工具链接入原则

1. 选定可兼容的 Electron、Node、pnpm、node-pty 和 SQLite 实现，并记录实际版本。
2. 建立 Main、Preload、Renderer 和 Engine 入口；验证分包与原生依赖打包路径。
3. 添加确实可运行的开发、类型检查、构建和打包命令，不添加无行为的占位成功命令。
4. 使用 pnpm 安装依赖并提交更新的锁文件；将原生模块所需的安装/构建许可限制在明确依赖上。
5. 统一导出入口和依赖方向，禁止 Renderer 间接打包 Node、凭据或后台实现。

## 验证边界

- 骨架/文档：目录、链接、配置语法、忽略规则、文件编码和空白问题。
- 脚本：真实执行、重复运行保留已有文件、从不同工作目录调用仍定位本项目。
- 源码：执行与改动相关的检查；进入正式可执行产物的修改完成完整构建与产物校验，不默认要求全量测试。
- SSH/PTY：在明确的测试 VPS 上验证，包含错误指纹、认证失败、断开、远端继续运行和资源释放；不能默认使用生产目标。
- UI：检查多终端、中文输入、焦点、日志高输出和 Windows 125%/150% 缩放。
- 打包：必须验证生成的 Windows 应用，不只验证开发服务器。签名和升级另有真实环境要求。

没有执行的验证明确写“未执行”并解释当前阶段。输出放 `.local/Test/` 或标准忽略的测试报告目录，正式测试代码和脱敏样例进入 Git。

## 仓库与 Git 交付

独立远端为 `git@github.com:suyi-92/SuPilot.git`，交付分支为 `main`；在 Server 中使用根目录 `SuPilot/` 子模块路径。新功能分支默认使用 `codex/` 前缀。

子项目交付先提交并推送 SuPilot，再按父项目授权范围记录 gitlink。首次登记同时变更 Server 的 `.gitmodules`；这些父项目变更可以保留暂存，登记不等于已经提交或授权推送 Server。
