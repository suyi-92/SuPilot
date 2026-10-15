# SuPilot

**终端优先、本地优先、可通过插件扩展的 VPS 桌面控制中心。**

SuPilot 用于管理主机、SSH 终端、连接凭据和批量运维任务。SuRelay 是可选的服务插件；不安装 SuRelay 时，未来的 SuPilot 仍应提供完整的主机与终端功能。Pilot 取“领航、操控”的含义。

## 当前状态

本仓库目前是**项目骨架**，还没有可运行的 Electron 应用。

- 已建立：独立本地 Git 仓库、pnpm workspace 声明、模块目录、目录说明、协作规则、本地工作区初始化脚本。
- 尚未实现：窗口、SSH、终端、数据库、任务引擎、插件运行机制、打包与自动升级。
- 各包的 `package.json` 仅声明名称和私有属性，未声明源码入口或应用依赖。
- 尚未选定应用依赖的具体版本；已使用 pnpm 11.25.0 验证工作区并由工具生成空依赖的 `pnpm-lock.yaml`。后续增改依赖时同步更新锁文件，不能手工伪造。
- 当前唯一可执行的项目脚本是 `local:init`。没有 `dev`、`build`、`test`、`package` 命令，也没有假装成功的占位命令。

## 产品方向

- Windows 优先，保留 macOS/Linux 的平台适配边界。
- 左侧主机导航，中央终端与操作标签页，右侧详情和底部任务区按需展开。
- 新 VPS 接入、重装后的身份重新登记、日常 SSH、脚本操作和批量任务统一管理。
- 常用命令可以成为快捷操作；复杂部署通过功能插件提供表单、步骤和结果。
- 初期插件由项目维护并随应用发布；插件接口本身不是安全沙箱。
- 初期通过 SSH 工作，不要求 VPS 常驻管理 Agent，不依赖自建云端管理服务。

## 技术方向

下表是已讨论的选型方向，不代表依赖已经安装或兼容性已经验证。

| 部分 | 方案 |
| --- | --- |
| 桌面与开发构建 | Electron、TypeScript、electron-vite |
| 界面 | React、Tailwind CSS、shadcn/ui 的 Radix 组件方案 |
| 布局与图标 | react-resizable-panels、Lucide React |
| 界面状态 | Zustand；只保存界面状态，不替代后台会话和任务状态 |
| 终端 | xterm.js、node-pty、Windows ConPTY |
| SSH | OpenSSH；交互会话与自动化任务使用独立执行通道 |
| 持久化 | SQLite；驱动、迁移工具和原生模块打包方案待技术验证 |
| 工作区 | pnpm workspace；单个桌面应用和内部包 |

## 目录总览

```text
SuPilot/
├─ apps/desktop/             桌面应用、进程入口、界面与打包资源
├─ packages/
│  ├─ contracts/             跨进程协议与运行时校验
│  ├─ engine/                主机、SSH、会话、任务、存储与插件注册
│  ├─ ui/                    统一基础组件、主题和语义状态展示
│  └─ plugin-sdk/            插件契约、执行上下文和辅助工具
├─ plugins/
│  ├─ diagnostics/           系统探测与诊断插件
│  ├─ access/                SSH 接入与加固插件
│  └─ surelay/               SuRelay 服务适配插件
├─ docs/                     正式文档，纳入 Git
├─ scripts/                  可移植的项目辅助脚本，纳入 Git
├─ tests/                    正式跨模块测试和脱敏样例，纳入 Git
├─ .local/                   仅本机使用，整体不纳入 Git
│  ├─ Docs/                  草稿、讨论记录与个人参考
│  ├─ Script/                长期保留的本机辅助工具
│  ├─ Test/                  本地测试驱动、结果与截图
│  └─ Tmp/<任务名>/          一次性探针与中间材料
├─ AGENTS.md                 权威协作规则
├─ AGENT.md                  指向 AGENTS.md 的兼容说明
├─ package.json              根工作区声明和已实现的脚本
└─ pnpm-workspace.yaml       内部包发现规则
```

各目录内的 `README.md` 说明本目录职责和限制；完整索引见 [目录与 Git 边界](docs/directory-map.md)。空目录通过说明文件保留，不创建没有含义的空白业务代码。

## 本地初始化

需要 Node.js 22 或更高版本，仅使用 Node.js 内置模块，无需先安装依赖：

```powershell
node scripts/init-local.mjs
```

也可以在已经配置好 pnpm 时使用：

```powershell
pnpm local:init
```

脚本可重复运行，只创建缺失的 `.local/` 目录和说明文件，不清空、不覆盖已有材料，不访问 VPS，不修改系统 SSH 配置。

这些命令仅初始化本地材料目录，不启动应用。具体开发环境、选型验证和实现阶段见 [开发说明](docs/development.md)。

## Git 与数据边界

- 正式源码、文档、构建脚本、测试、脱敏样例以及锁文件应进入 Git；“应进入”不代表初始化时已经暂存或提交。
- `.local/`、依赖、缓存、编译产物和安装包被忽略。Git 不备份这些内容，重要个人材料需要另行备份。
- 应用运行数据放入 Electron `app.getPath('userData')` 对应目录；开发与正式应用使用分开的数据目录。
- 登录密码、私钥、私钥口令、Cloudflare Token、真实主机清单和实际运行数据库不进入仓库。秘密由系统凭据保护或 SSH Agent 等机制管理。
- 不按文件扩展名全局忽略所有数据库、证书或密钥样例；正式测试样例必须合成或脱敏并经检查，真实材料放在仓库之外。

## 与 Server、SuRelay 的关系

SuPilot 是独立仓库，位于 Server 根目录，不属于 `infrastructure/SuRelay` 的源码目录。`plugins/surelay/` 只存适配代码，不复制 SuRelay 服务端项目，也不依赖开发机上的绝对兄弟目录。

项目远端为 `git@github.com:suyi-92/SuPilot.git`，交付分支为 `main`。在 Server 中以根目录 `SuPilot/` 子模块独立维护；独立克隆本仓库也可使用相同的目录和初始化流程。

子项目提交和推送，与父项目 `.gitmodules`、gitlink 的提交和推送分开处理。登记或更新父项目指针前，需确保目标提交已存在于子项目远端；登记子模块不等于授权提交 Server。实际登记与暂存状态以父仓库 Git 状态为准。

## 文档入口

- [协作规则](AGENTS.md)：修改范围、架构约束、验证和交付。
- [目录与 Git 边界](docs/directory-map.md)：所有目录的用途、限制和持久化位置。
- [架构边界](docs/architecture.md)：进程、依赖方向、SSH 与任务生命周期。
- [界面约定](docs/ui-guidelines.md)：工作区、主题、操作对象、终端与状态。
- [插件约定](docs/plugin-contract.md)：插件分层、执行接口和 SuRelay 接入。
- [开发说明](docs/development.md)：当前可运行的步骤、实施顺序和验收。
