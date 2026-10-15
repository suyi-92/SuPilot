# 目录与 Git 边界

本索引覆盖当前建立的全部业务目录。每个正式目录还包含就近 README，源码尚未实现的目录通过 README 保留。目录说明和包清单属于正式项目内容。

## 正式目录

下列目录中的正式源码、说明、配置、资源及脱敏样例应纳入 Git，构建产物按忽略规则排除。

| 路径 | 用途 | 限制 |
| --- | --- | --- |
| [`apps/`](../apps/README.md) | 存放实际可打包运行的应用；当前只有 desktop。 | 应用负责装配内部包；不把通用核心业务复制到应用入口。 |
| [`apps/desktop/`](../apps/desktop/README.md) | Electron 应用及进程入口、React 工作区、静态打包资源。 | 当前无可运行入口、electron-vite 配置或依赖；只有目录和私有包声明。 |
| [`apps/desktop/src/`](../apps/desktop/src/README.md) | 按 main、preload、engine、renderer 分开维护进程入口与界面。 | 不能混用 Renderer 与后台依赖；当前没有业务源码。 |
| [`apps/desktop/src/main/`](../apps/desktop/src/main/README.md) | 窗口、菜单、生命周期、系统集成、凭据保护和消息授权；装配后台与内置插件。 | 保持主进程响应，不承担长时任务；不向 Renderer 暴露任意执行入口。 |
| [`apps/desktop/src/preload/`](../apps/desktop/src/preload/README.md) | 在隔离上下文中向 Renderer 提供最小、类型化接口。 | 不是独立进程；不透传通用 ipcRenderer，不处理业务任务或泄露凭据。 |
| [`apps/desktop/src/engine/`](../apps/desktop/src/engine/README.md) | 启动 utilityProcess，装配核心服务和内置插件，处理 Electron 特有生命周期与传输适配。 | 通用业务放 packages/engine；进程入口不维护第二份会话或数据库状态。 |
| [`apps/desktop/src/renderer/`](../apps/desktop/src/renderer/README.md) | React 页面、xterm.js 视图、主机导航、工作区与任务展示。 | 只通过 Preload 访问后台；不导入 Node、数据库或后台插件入口。 |
| [`apps/desktop/src/renderer/app/`](../apps/desktop/src/renderer/app/README.md) | 应用入口、主题挂载、全局设置和界面级状态。 | Zustand 只保存界面状态；运行中的 SSH 和任务由后台维护。 |
| [`apps/desktop/src/renderer/workspace/`](../apps/desktop/src/renderer/workspace/README.md) | 标签页、分屏、面板尺寸、焦点、布局保存和恢复。 | 视图挂载或卸载不能意外启动或销毁 SSH；布局使用稳定会话引用。 |
| [`apps/desktop/src/renderer/features/`](../apps/desktop/src/renderer/features/README.md) | 按 hosts、terminal、operations、tasks 划分用户功能。 | 共享通用组件放 packages/ui；业务状态经 contracts 接收，不直接调用 Engine 实现。 |
| [`apps/desktop/src/renderer/features/hosts/`](../apps/desktop/src/renderer/features/hosts/README.md) | 搜索、分组、标签、主机编辑、连接端点与最近检查摘要。 | 列表选中、活跃会话和表单目标分开；不把缓存状态冒充实时在线。 |
| [`apps/desktop/src/renderer/features/terminal/`](../apps/desktop/src/renderer/features/terminal/README.md) | xterm.js 挂载、键盘输入、粘贴、滚动、尺寸、焦点与配色。 | SSH/PTY 生命周期归后台；高频输出不逐块写入 React/Zustand，不插入任务自动按键。 |
| [`apps/desktop/src/renderer/features/operations/`](../apps/desktop/src/renderer/features/operations/README.md) | 统一插件操作列表、参数表单、复杂工作标签和需要用户输入的步骤。 | 打开表单即固定目标；不在界面直接拼接 shell，不允许导航选择改变已打开操作对象。 |
| [`apps/desktop/src/renderer/features/tasks/`](../apps/desktop/src/renderer/features/tasks/README.md) | 批量任务列表、单机步骤、结构化结果、只读日志、取消请求与恢复入口。 | 准确呈现等待、失败和结果未知；不能把本地取消请求显示成远端已经取消。 |
| [`apps/desktop/resources/`](../apps/desktop/resources/README.md) | 将来存放图标、品牌资源以及经过确认的打包附属文件。 | 纳入 Git 的应是源资源；安装包放忽略的 release，打包签名密钥放仓库外。 |
| [`packages/`](../packages/README.md) | contracts、engine、ui 与 plugin-sdk 的实现边界。 | 按明确依赖方向复用，不将此目录变成无归属的 utils 集合。 |
| [`packages/contracts/`](../packages/contracts/README.md) | 消息、DTO、错误与事件结构，以及运行时校验规则。 | 保持平台中立；不依赖 Electron、React、具体插件或 Node 专有对象。 |
| [`packages/contracts/src/`](../packages/contracts/src/README.md) | 后续实现可序列化协议、校验器和错误码。 | 先落实真实调用场景再定义接口；TypeScript 类型不能代替边界校验。 |
| [`packages/engine/`](../packages/engine/README.md) | 主机、SSH、会话、任务、信任、持久化和插件调用。 | 不依赖界面或具体服务插件；通过注入接口使用凭据和平台能力。 |
| [`packages/engine/src/`](../packages/engine/src/README.md) | 按 hosts、ssh、sessions、trust、tasks、storage、plugins 组织。 | 避免跨模块直接修改内部状态；连接与任务的事实来源在此，不在 Renderer。 |
| [`packages/engine/src/hosts/`](../packages/engine/src/hosts/README.md) | 稳定主机 ID、分组、标签、连接端点、认证引用和已知远端信息。 | 公网端口与远端监听端口分开；不将 IP 当唯一身份或保存明文秘密。 |
| [`packages/engine/src/ssh/`](../packages/engine/src/ssh/README.md) | 系统/随包 OpenSSH 探测、命令参数、SSH 配置、Agent、跳板机与传输适配。 | 所有连接遵守核心信任策略；系统配置不静默覆盖，参数与远程转义需分别处理。 |
| [`packages/engine/src/sessions/`](../packages/engine/src/sessions/README.md) | PTY 创建、输入输出、尺寸、会话状态、连接退出与资源释放。 | 不与自动化任务共享可输入终端；背压、缓冲上限和断开行为必须明确。 |
| [`packages/engine/src/trust/`](../packages/engine/src/trust/README.md) | 服务器指纹验证、应用 known_hosts、重装后重新登记和信任记录。 | 不能全局跳过验证、清空系统记录，或将主机密钥与用户登录私钥混为一谈。 |
| [`packages/engine/src/tasks/`](../packages/engine/src/tasks/README.md) | 并发、同机资源锁、固定目标、任务状态、取消/恢复和共同访问保护流程。 | 结果未知时不盲目重试；不同进程崩溃或 SSH 断开不能推断远端已经停止。 |
| [`packages/engine/src/storage/`](../packages/engine/src/storage/README.md) | SQLite 访问、schema 迁移、主机与任务存储、日志索引和留存策略。 | 此处只存源码和正式迁移，实际数据库/日志位于应用数据目录；不持久化明文秘密。 |
| [`packages/engine/src/plugins/`](../packages/engine/src/plugins/README.md) | 注册表、兼容检查、有限执行上下文和插件生命周期。 | 由应用注册具体插件；核心不 import SuRelay 等具体实现，声明权限不等于安全沙箱。 |
| [`packages/ui/`](../packages/ui/README.md) | 基础交互组件、主题、语义状态、表单与步骤展示。 | 不直接请求后台或绑定 SuRelay；业务目标、数据和事件由使用方传入。 |
| [`packages/ui/src/`](../packages/ui/src/README.md) | 组合 components 与 themes，后续按实际组件需求扩展。 | 不重新实现成熟组件已有的键盘与可访问性交互，不引入 Node 模块。 |
| [`packages/ui/src/components/`](../packages/ui/src/components/README.md) | 按钮、表单、菜单、弹窗、状态标签、日志和步骤等可复用组件。 | 保留可见焦点、可访问名称、键盘导航与语义状态；复杂业务页面仍归应用或插件。 |
| [`packages/ui/src/themes/`](../packages/ui/src/themes/README.md) | 应用颜色、字体、间距、控件密度和语义状态变量。 | 应用主题与终端 ANSI 配色独立；实际对比度需验证，不散落硬编码主题颜色。 |
| [`packages/plugin-sdk/`](../packages/plugin-sdk/README.md) | 插件描述、操作、探测、事件和有限核心服务接口。 | 初期服务内置可信插件，不承诺稳定公共 SDK 或任意第三方代码隔离。 |
| [`packages/plugin-sdk/src/`](../packages/plugin-sdk/src/README.md) | 实现与 contracts 一致的类型、校验和辅助工具。 | 不得暴露裸数据库、明文秘密或不受控进程执行；按真实插件需求迭代版本。 |
| [`plugins/`](../plugins/README.md) | 由项目维护并随应用发布的 diagnostics、access、surelay 适配。 | 插件可被禁用；不在加载时自动安装远端服务，不直接读写核心数据库。 |
| [`plugins/diagnostics/`](../plugins/diagnostics/README.md) | 系统、环境、服务的只读探测和诊断。 | 默认只读；权限不足、未知、不支持与服务未安装分别表达，输出按规则脱敏。 |
| [`plugins/diagnostics/src/`](../plugins/diagnostics/src/README.md) | 定义探测能力、诊断操作、参数与结构化结果。 | 通过 SDK 执行，不另行启动 SSH 或读取其他会话；检查时间随结果返回。 |
| [`plugins/access/`](../plugins/access/README.md) | 公钥部署、登录策略、端口和访问路径调整。 | 指纹、凭据和访问保护属于核心；改变连接路径前后必须执行共同验证流程。 |
| [`plugins/access/src/`](../plugins/access/src/README.md) | 系统适配和多阶段 SSH 加固操作。 | 保留旧访问通道，验证新的独立连接后再收紧；不冒充云安全组已放行。 |
| [`plugins/surelay/`](../plugins/surelay/README.md) | 探测与调用远端 SuRelay，提供统一操作表单、任务和结果。 | SuRelay 服务端仍独立维护；不复制源码、不硬编码兄弟目录、不假设完整 JSON 接口已存在。 |
| [`plugins/surelay/src/`](../plugins/surelay/src/README.md) | 实现版本/能力探测、参数转换、操作调用和结果解释。 | 先只读后变更；能力不明时不得自动重装，不解析 TUI 坐标；SSH/防火墙操作统一协调。 |
| [`docs/`](../docs/README.md) | 架构、目录、界面、插件、开发说明以及后续正式决策。 | 纳入 Git；不放个人原始讨论、真实主机信息或秘密。设计与已实现能力明确区分。 |
| [`scripts/`](../scripts/README.md) | 可移植的初始化、构建、打包和维护工具；当前只有 init-local.mjs。 | 纳入 Git，不依赖 .local 或个人路径；测试驱动放 tests，本机专用工具放 .local/Script。 |
| [`tests/`](../tests/README.md) | 需要长期维护的跨模块、真实应用验证与合成样例。 | 当前只有目录说明，没有测试套件；本地结果放 .local/Test，秘密和生产目标不进入测试文件。 |
| [`tests/integration/`](../tests/integration/README.md) | 跨包、任务引擎、持久化和 SSH 边界的有意义验证。 | 真实连接需明确测试环境；不能默认使用真实生产资产或把环境缺失当通过。 |
| [`tests/e2e/`](../tests/e2e/README.md) | 真实窗口、连接、键盘、布局、生命周期及打包产物的关键流程。 | 测试工具待选型；截图/录像/报告放忽略目录，合成基准如需提交应明确归属。 |
| [`tests/fixtures/`](../tests/fixtures/README.md) | 合成或脱敏的协议、配置、事件和失败场景样例。 | 可纳入 Git；禁止真实秘密与主机资产。不要用全局忽略扩展名掩盖样例审查。 |

## 本机工作材料

| 路径 | 用途 | 保留与清理边界 |
| --- | --- | --- |
| `.local/` | 本机工作材料根目录，整体不进 Git | 不作为正式构建、测试或应用运行的依赖；不得整体清空 |
| `.local/Docs/` | 草稿、讨论、个人参考 | 有共享价值的资料整理到 docs；重要材料自行备份 |
| `.local/Script/` | 本机专用、长期保留的非测试辅助工具 | 项目必需的工具应移到 scripts，不依赖个人绝对路径 |
| `.local/Test/` | 本地测试驱动、结果、截图 | 可重复正式检查整理到 tests；结果先脱敏 |
| `.local/Tmp/<任务名>/` | 按任务隔离的一次性探针、中间文件和临时下载 | 确认目标绝对路径后仅清理对应任务材料，不删除其他任务 |

使用 `node scripts/init-local.mjs` 创建本地目录及说明。脚本不覆盖已有材料，不删除文件；忽略目录中的说明由脚本首次创建，规则更新以后以正式文档为准。

Windows 通常不区分路径大小写，不要用根目录 `Docs` 与 `docs` 试图区分本地/正式内容；将本地材料集中到 `.local`。

## 根文件

| 文件 | 用途与限制 |
| --- | --- |
| `README.md` | 产品入口、实际状态、目录与启动说明；不夸大已实现功能 |
| `AGENTS.md` | 权威协作规则 |
| `package.json` | 根包与真实可执行脚本，当前只有 local:init |
| `pnpm-workspace.yaml` | 发现 apps/*、packages/*、plugins/* 下的包 |
| `.gitignore` | 排除本地材料、依赖、产物和环境文件，不应掩盖正式测试样例 |
| `.gitattributes` | 文本行尾与二进制属性 |
| `.editorconfig` | 编码、缩进和文件结尾规范 |
| `pnpm-lock.yaml` | 已由 pnpm 11.25.0 生成空依赖锁文件；后续安装依赖由 pnpm 更新，纳入 Git，不手工创建 |

## 生成物与应用数据

- `node_modules/`、`.pnpm-store/`、`out/`、`dist/`、`release/`、测试报告与覆盖率目录不进入 Git；它们可能出现在工作区根目录或包目录。
- 实际应用数据库、专属 SSH 配置、known_hosts、任务记录和日志存入 Electron `app.getPath('userData')` 对应位置，开发与正式数据分开。
- 密码、口令、Token 由凭据保护机制管理；私钥使用文件引用或 Agent 等方式，不拷入仓库或普通数据库字段。
- 截图、测试输出和示例配置须脱敏；例子使用虚构名称及文档用途地址。
- `.gitignore` 不会取消已经跟踪的文件，也不能充当秘密保护系统。误纳入秘密需要单独处理，不能只加一条忽略规则。
- Git 不保存空目录，目录 README 负责让骨架可保留。“纳入 Git”表示归属要求，实际暂存与提交状态以 Git 为准。
- `.git/` 是本地仓库元数据，不是业务目录，不手动修改或纳入其他仓库。
