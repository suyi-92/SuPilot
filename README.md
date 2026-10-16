# SuPilot v0.1

**终端优先、本地优先的 Windows VPS 桌面工作区。**

已提供可运行的 Electron 应用：主机档案 → SSH 终端 → 标签与双窗格 → 独立只读诊断 → 持久任务记录。SuRelay 是可选扩展，无需安装即可使用全部 v0.1 功能。

界面采用 **VS Code Dark+ 风格**：48px 活动栏、远程资源树、编辑区标签、可展开任务面板和状态栏。主机表单、诊断与任务详情使用统一的平直布局；原生 Windows 窗口框架保留。

## 启动与构建

日常使用可直接双击根目录的 [启动SuPilot.cmd](启动SuPilot.cmd)，启动 `release/win-unpacked/SuPilot.exe`。脚本按自身位置定位应用，不依赖当前工作目录；缺少产物时会提示构建命令，不会自动安装依赖或重新构建。

开发环境：Windows x64、Node.js 22.16+（推荐 24 LTS）、pnpm 11.25.0。连接需要 Windows 系统 OpenSSH 客户端。

```powershell
pnpm install --frozen-lockfile
pnpm dev
```

```powershell
pnpm typecheck
pnpm build
pnpm package:win
.\release\win-unpacked\SuPilot.exe
```

产物是 **release/win-unpacked/** 整个目录。复制时保留全部文件，不能只复制 exe；无需另装 Node.js。当前为未签名目录应用，没有安装器、自动升级或应用内更新。

## 使用

1. “添加主机”：填写名称、地址、**公网连接端口**、用户名，选择 SSH Agent 或已有私钥。远端 sshd 监听端口只记录，不用于连接。
   首次启动会自动创建一个“本机 · <计算机名>”档案，只指向 `127.0.0.1`，不会自动连接；若要打开它，Windows 需要启用 OpenSSH Server。
2. 双击主机打开或切换会话；“新建会话”允许同机多个连接。首次连接显示 SHA256 指纹，需通过云控制台等独立渠道核对后确认。
3. 左右/上下分屏每个标签最多两个窗格，蓝色边界表示输入焦点。切换标签或收起侧栏不会关闭会话。
4. “系统诊断”绑定固定目标，通过独立 SSH 通道查询。任务记录显示步骤、输出和退出码，可复制日志。
5. “演示模式”提供 14 台合成主机、两个模拟终端和不同任务状态。所有演示操作仅在内存中，不创建真实连接或任务。

Ctrl+C / D / R 交给 Shell；Ctrl+Shift+C / V 复制粘贴。设置中分别调整界面字号、终端字号及 ANSI 配色。保留原生 Windows 标题栏、最大化和吸附行为。

顶部“快速打开主机”支持名称、地址、分组和标签搜索，↑/↓ 选择、Enter 打开或复用会话，Esc 关闭；左侧筛选独立保留。“打开的会话”可切回已有终端。新配置默认界面 13px、终端 14px、Dark+ ANSI；已有字号和 ANSI 偏好继续保留，可在左下角设置中切换。

主机表单底部固定保存与取消，验证错误可直接跳转到字段，关闭未保存表单或切换模式会提示。任务可按状态、主机筛选；日志默认保留列对齐，可切换自动换行。窄窗口通过浮动详情栏和紧凑任务选择器保留完整操作。

## 已实现

- SQLite 主机新增、编辑、删除、搜索、分组、标签、备注与稳定 UUID。
- 操作、会话和任务创建时冻结连接参数；编辑档案不改变已有对象。
- xterm → 专用 MessagePort → node-pty / ConPTY → 系统 OpenSSH，含背压、尺寸同步和释放。
- 应用专属 SSH 配置与 known_hosts；首次信任确认、已知指纹变化阻断。
- Diagnostics 内置插件：系统/内核、运行时间、磁盘、内存，每项独立 SSH 连接。
- 同机任务互斥、有限并发、超时、输出限额、取消请求、失败/中断/未知状态及历史恢复。
- 中文紧凑工作区、完整主机表单、操作/任务页、空状态、错误反馈、窄窗口及专注布局。

## 认证与能力边界

优先使用系统 Agent 或现有私钥引用，不复制私钥、不保存密码/口令。交互终端由 OpenSSH 处理口令或密码提示。后台诊断只使用 BatchMode 公钥认证，需要可用 Agent 或可直接使用的密钥，不等待输入。

启动 ssh.exe 不等于认证成功：收到认证后远端启动命令返回的随机握手标记才显示已连接。v0.1 交互目标需要 Linux 的 sh 和登录 Shell。诊断考虑 Debian/Ubuntu/Alpine 基本工具差异，但尚未在真实发行版验证。

关闭应用会提示活跃会话/任务并关闭本地 SSH，无法保证远端程序停止；未确认结果显示未知。应用不是常驻守护服务。

不导入或改写系统 SSH 配置/known_hosts，不支持指纹重装重置、密码保存、跳板机 UI。Access / SuRelay 仅为明确标注的规划入口，无部署、加固、防火墙或卸载能力。批量调度、SFTP、云 API、第三方插件、云同步、自动升级与复杂监控均未实现。

## 数据

由 app.getPath('userData') 派生，Windows 通常为：

| 模式           | 目录                                |
| -------------- | ----------------------------------- |
| 正式           | %APPDATA%/SuPilot                   |
| 开发/未打包    | %APPDATA%/SuPilot-dev               |
| SUPILOT_TEST=1 | %APPDATA%/SuPilot-test              |
| 演示           | Renderer 内存，无真实主机数据库写入 |

SQLite 为 supilot.sqlite（含 WAL），SSH 文件为 ssh/config、ssh/known_hosts。任务存储有限检查输出，可能含主机名称、挂载路径等运维信息；数据库不加密。密码/口令不入库，交互终端内容不持久化。UI 设置/面板尺寸使用当前配置的浏览器存储。

## 验证

```powershell
pnpm test
pnpm test:desktop
node tests/e2e/desktop.mjs --packaged
```

集成测试覆盖协议、目标快照、恢复、超时/取消/输出限额、真实本机 OpenSSH/ConPTY、认证失败和指纹变化。桌面测试实际启动 Electron 和打包 exe，覆盖持久化、界面、原生模块、剪贴板及独立诊断。截图与报告保存在被忽略的 .local/Test/，详见 [开发与验证](docs/development.md)。

**本机 SSH 测试返回合成数据，不能替代真实 VPS 验证。** 未执行真实 VPS、中文 IME 候选选择、真实 Linux vim/top、系统显示缩放切换；已验证 Unicode、ANSI 替代屏幕、900×650 窗口及 Chromium 125%/150% 缩放。

## 项目与文档

沿用 pnpm workspace：apps/desktop、packages/contracts、engine、ui、plugin-sdk 和 plugins/diagnostics。核心不 import 具体插件，由应用装配层注册。

- [架构](docs/architecture.md)
- [界面](docs/ui-guidelines.md)
- [插件](docs/plugin-contract.md)
- [开发验证](docs/development.md)
- [目录与 Git 边界](docs/directory-map.md)
- [协作规则](AGENTS.md)

SuPilot 是独立仓库，远端 git@github.com:suyi-92/SuPilot.git。Server 只记录 gitlink；开发不等于授权提交、推送或修改父项目索引。真实数据在仓库外；依赖、产物与 .local 被忽略。pnpm local:init 仍可幂等创建本地材料目录。
