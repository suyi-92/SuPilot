# 开发与验证

## 环境与依赖

本轮环境：Windows 11 x64（10.0.22631）、Node.js 26.0.0、pnpm 11.25.0、系统 OpenSSH 8.6p1。开发建议 Node.js 24 LTS（最低 22.16+）；最终应用使用 Electron 自带 Node，无需用户安装 Node。

| 依赖                   | 本轮锁定/解析版本                      |
| ---------------------- | -------------------------------------- |
| Electron               | 40.10.6                                |
| electron-vite / Vite   | 6.0.0 / 6.4.4                          |
| electron-builder       | 26.15.3                                |
| React                  | 19.3.0                                 |
| Tailwind               | 4.3.3                                  |
| node-pty               | 1.1.0，附 pnpm Windows 释放补丁        |
| xterm / fit            | 5.5.0 / 0.10.0                         |
| react-resizable-panels | 2.1.9                                  |
| Zustand                | 5.0.15                                 |
| 组件与校验             | Radix Dialog/Tooltip/Slot、Lucide、Zod |

所有真实依赖通过 pnpm 安装并生成 pnpm-lock.yaml，没有手写锁文件。workspace 保持现有包名与 private 属性。原生构建权限限于工作区 allowBuilds 列表；node-pty 使用随包 Windows 预构建，SQLite 使用 Electron 内置 node:sqlite，避免再增加一个原生驱动。SQLite API 当前仍有实验性提示。

electron-builder 从已安装的 node_modules/electron/dist 复制同一 Electron 运行时，避免打包时重复联网下载；本命令在 Windows x64 上运行。node-pty 解包到 app.asar.unpacked，npmRebuild=false；每次相关依赖升级必须重新验证最终产物，不能只测系统 Node。补丁由 pnpm patch/patch-commit 管理，说明在 patches/README.md；这里的 patch-commit 不是 Git 提交。

## 命令

在 SuPilot 根目录执行：

```powershell
pnpm install --frozen-lockfile
pnpm dev
pnpm typecheck
pnpm build
pnpm package:win
pnpm test
pnpm test:desktop
node tests/e2e/desktop.mjs --packaged
```

build 包含 typecheck；package:win 包含完整 build，输出 release/win-unpacked/SuPilot.exe 及完整依赖目录。不要单独搬走 exe。应用未签名，没有安装器/更新器。test:desktop 使用构建后的 out，因此先 build；--packaged 使用实际产物，因此先 package:win。

仅初始化本机材料可运行 pnpm local:init 或 node scripts/init-local.mjs。构建/正式测试不依赖 .local 中的源码，截图/报告才写入其中。

Electron 首次安装需下载官方二进制；网络受限时配置当前命令的代理，不修改全局系统代理。应校验官方校验和，不能使用来源不明的 Electron 替代包。

## 目录与包

| 目录                     | 包名                                                     |
| ------------------------ | -------------------------------------------------------- |
| 根                       | supilot-workspace                                        |
| apps/desktop             | @supilot/desktop                                         |
| packages/contracts       | @supilot/contracts                                       |
| packages/engine          | @supilot/engine                                          |
| packages/ui              | @supilot/ui                                              |
| packages/plugin-sdk      | @supilot/plugin-sdk                                      |
| plugins/diagnostics      | @supilot/plugin-diagnostics                              |
| plugins/access / surelay | @supilot/plugin-access / @supilot/plugin-surelay（规划） |

## 数据隔离

正式、开发、SUPILOT_TEST=1 分别使用 appData 下 SuPilot、SuPilot-dev、SuPilot-test，再作为 userData 传入 Engine。SQLite 与 SSH 信任均在对应配置目录；不要将真实资产复制到测试配置。

演示为纯内存数据源。集成测试在独立临时目录动态生成密钥和数据库，仅连接本机 127.0.0.1；不会连接用户资产或修改系统 SSH 文件。桌面测试关闭自身会话并删除自身创建的主机，保留测试配置中的任务历史；不触碰正式配置。

## 本轮验证（2026-10-15）

| 检查                   | 结果/范围                                                             |
| ---------------------- | --------------------------------------------------------------------- |
| pnpm dev               | 实际启动 Vite/Electron；受信任页面 IPC、Engine、SQLite 与演示界面通过 |
| pnpm typecheck / build | 通过，生成四个入口对应产物                                            |
| pnpm package:win       | Windows x64 目录产物生成，定制图标与 asar 原生解包                    |
| pnpm test              | 6 项通过，无跳过；进程自然结束                                        |
| 桌面/打包 E2E          | 实际启动应用，完成下列关键路径                                        |
| 视觉检查               | 已查看主工作区、操作页、任务页及窄窗口截图                            |
| Git                    | git diff --check；只修改 SuPilot，不提交/推送，不改父索引             |

六项集成测试覆盖：请求/终端参数校验，SQLite/冻结快照/崩溃恢复，认证标记流边界和 banner 冒充，子进程超时/取消/输出上限/启动失败，系统 OpenSSH+ConPTY 本机回环认证/错误指纹/独立诊断，任务取消/不可用/中断/未知状态。

桌面 E2E 覆盖：

- 非法参数和第二个 BrowserWindow 的 IPC 请求被拒绝。
- 表单新增主机、公网与 sshd 端口区分、退出重启后持久化、删除；固定保存操作、错误摘要与字段焦点、未保存关闭/模式切换保护。
- Engine 首次启动自动识别并持久化本机 SSH 档案，确认只创建档案、不打开会话，重启不重复创建。
- 演示 14 主机、两个窗格、标签/方向切换、操作/任务结果，真实 Engine 不产生演示会话或任务。
- VS Code 风格工作区：快速打开搜索/Enter 复用会话/Esc 关闭、左侧标签筛选、单击主机不改变当前工作目标、“打开的会话”导航、任务列对齐；视觉检查使用测试配置中的 13px UI / 14px Dark+ 终端。
- 任务状态/主机筛选同步详情，空结果清空详情，外部指定记录重置旧筛选；只读日志对齐和可选换行。
- 900×650 布局及 Chromium 125%/150% 缩放，详情栏优先隐藏；浮动详情焦点约束和 Esc 关闭，紧凑任务选择、窄窗口固定保存操作、标签键盘导航。
- 实际应用的 utilityProcess 加载自身 node-pty / SQLite，本地 PowerShell ConPTY 输入输出、111 列尺寸、中文和 11000 字符粘贴。
- 完整 xterm → MessagePort → Engine → ConPTY → 系统 OpenSSH 链路，首次指纹确认、认证标记、Unicode、Ctrl+C/D/R、替代屏幕、超过 200 KiB 输出、切换标签后会话保留。
- UI 剪贴板长粘贴与任务日志复制。
- 四条独立诊断 SSH 连接，交互终端输入未被注入；正常退出与释放。

## 证据与局限

.local/Test/ 中有 integration.log、build.log、package-win.log、dev-validation.json、desktop-validation.json、packaged-validation.json、native-result.json 及截图。测试故意触发非法 IPC，日志中的对应拒绝是预期；测试结果以断言/报告为准。构建可能提示 Zod 注释移除，未影响产物。

截图文件：workspace.png、operation.png、tasks.png、welcome.png、host-form.png、workspace-small.png、workspace-125.png、workspace-150.png、terminal-fullscreen.png、terminal-loopback.png，以及 quick-open.png、host-form-error.png、task-failed.png、host-form-small.png、tasks-small.png、details-small.png。

未执行：真实 VPS 与 Debian/Ubuntu/Alpine 实机诊断、实际 Agent/加密私钥提示流程、Windows 中文 IME 候选选择、真实 Linux vim/top、系统 DPI 设置切换/跨屏吸附、长时间运行与其他 Windows 版本。回环 ssh2 服务只返回合成结果；Unicode/ANSI/Chromium 缩放不是以上验证的替代品。未获授权的生产主机从未连接。

## Git

SuPilot 独立仓库，远端 git@github.com:suyi-92/SuPilot.git，父 Server 仅记录 gitlink。本次仅开发，不暂存、提交或推送；已有父暂存状态应保留。后续提交与父指针更新仍按双方 AGENTS.md 的授权规则执行。
