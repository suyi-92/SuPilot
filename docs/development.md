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

演示为纯内存数据源。集成测试在独立临时目录动态生成密钥和数据库，并显式禁用用户 SSH 配置导入，仅连接本机 127.0.0.1；不会连接用户资产或修改系统 SSH 文件。桌面测试关闭自身会话并删除自身创建的主机，保留测试配置中的任务历史；不触碰正式配置。

## 本轮验证（2026-10-16）

| 检查                   | 结果/范围                                                             |
| ---------------------- | --------------------------------------------------------------------- |
| pnpm dev               | 实际启动 Vite/Electron；受信任页面 IPC、Engine、SQLite 与演示界面通过 |
| pnpm typecheck / build | 通过，生成四个入口对应产物                                            |
| pnpm package:win       | Windows x64 目录产物生成，定制图标与 asar 原生解包                    |
| pnpm test              | 8 项通过，无跳过；进程自然结束                                        |
| 桌面/打包 E2E          | 实际启动应用，完成下列关键路径                                        |
| 视觉检查               | 已查看主工作区、操作页、任务页及窄窗口截图                            |
| Git                    | git diff --check；只修改 SuPilot，不提交/推送，不改父索引             |

八项集成测试覆盖：请求/终端参数校验，SQLite/冻结快照/崩溃恢复，SSH 配置别名与 Include 导入，认证标记流边界和 banner 冒充，子进程超时/取消/输出上限/启动失败，系统 OpenSSH+ConPTY 本机回环认证/错误指纹/独立诊断，任务取消/不可用/中断/未知状态。

桌面 E2E 覆盖：

- 非法参数和第二个 BrowserWindow 的 IPC 请求被拒绝。
- 表单新增主机、公网与 sshd 端口区分、退出重启后持久化、删除；固定保存操作、错误摘要与字段焦点、未保存关闭/模式切换保护。
- Engine 首次启动只读解析并持久化用户 `~/.ssh/config` 的 Host 档案，确认保留别名、端口、用户和私钥引用，只创建档案、不打开会话，重启不重复导入。
- 演示 14 主机、两个窗格、标签/方向切换、操作/任务结果，真实 Engine 不产生演示会话或任务。
- 石墨灰终端工作区：快速打开搜索/Enter 复用会话/Esc 关闭、左侧标签筛选、单击主机不改变当前工作目标、“打开的会话”导航、任务列对齐；视觉检查使用测试配置中的 13px UI / 14px 终端，并分别覆盖 Dark+、Graphite、Classic ANSI 配色。
- 任务状态/主机筛选同步详情，空结果清空详情，外部指定记录重置旧筛选；只读日志对齐和可选换行。
- 900×650 布局及 Chromium 125%/150% 缩放，详情栏优先隐藏；浮动详情焦点约束和 Esc 关闭，紧凑任务选择、窄窗口固定保存操作、标签键盘导航。
- 实际应用的 utilityProcess 加载自身 node-pty / SQLite，本地 PowerShell ConPTY 输入输出、111 列尺寸、中文和 11000 字符粘贴。
- 完整 xterm → MessagePort → Engine → ConPTY → 系统 OpenSSH 链路，首次指纹确认、认证标记、Unicode、Ctrl+C/D/R、替代屏幕、超过 200 KiB 输出、切换标签后会话保留。
- UI 剪贴板长粘贴与任务日志复制。
- 四条独立诊断 SSH 连接，交互终端输入未被注入；正常退出与释放。

UI 2.1 局部收尾的桌面回归输出位于 `.local/Test/ui-round2.1/`：850×600 最小窗口配合 12/13/17px UI 字号，额外检查主机摘要“新建”按钮的 SVG/文字子节点边界、拖窄主机栏后的恢复、终端名称/端点/操作几何关系，并通过本机回环 SSH 向真实 xterm 写入受控 16 色 ANSI 样本。Dark+、Graphite、Classic 各保存一张实际渲染截图；UI 设置恢复为测试配置的 Dark+，不修改正式用户偏好。

第三轮记录保留在 `.local/Test/ui-round3/`。原报告中的窗口矩阵实际位于终端工作台，不能作为四页面矩阵验收；3.1 使用 `tests/e2e/page-matrix.mjs` 补充欢迎、主机表单、诊断、任务四页面各 12 组尺寸/字号测量，仍保留原终端矩阵。新增测试与报告约定见 [桌面测试说明](../tests/e2e/README.md)。

## UI 3.1 局部收尾（2026-10-17）

只修改 Renderer 的表单错误上下文、欢迎页首次快照结果与摘要色彩语义。真实 HostInput 未改；Agent 切换不丢失路径值，对仍有效的路径错误保留修正入口。首次读取失败不再判断无主机或缺少 OpenSSH，订阅的新快照不被较早请求覆盖。部分不可用摘要使用 warning，但真实任务 state 和 Status 保持原值。受限高度的表单为固定保存区预留滚动空间，避免高级字段帮助文字被挡住。

验证输出位于 `.local/Test/ui-round3.1/`，交付包位于 `.local/Test/ui-round3.1-delivery/`。`node tests/e2e/ui-round31.mjs` 挂载真实 App/CSS 和隔离合成 API，覆盖罕见状态、保存/复制失败与 48 行页面矩阵；合成测试不经过 Engine 或 IPC。`pnpm test:desktop` 与新构建后的 `node tests/e2e/desktop.mjs --packaged` 另外执行四页面矩阵和全部原有真实回环、目标、焦点、ANSI、IPC 回归。没有用合成结果替代 Windows 应用验证。

`pnpm test` 现在有 11 项，包括真实 HostInput 的端口、字符串、标签、用户名及路径限制，首次快照展示状态和全部任务结果语义。测试脚本使用现有依赖；未增加框架。源码包由当前工作文件逐项读取，包含既有未提交修改和新增测试，不从 HEAD 导出。

证据保留任务起始源文件副本/哈希、以这些字节运行的失败回放、当前代码的通过报告及原始 PNG/日志/测量。回放有独立时间戳，不能当作修改前的历史运行时间。早期脚本测量和宿主初始化问题、实际表单遮挡失败及修正均保留说明；最终报告与探索记录分开。ConPTY 测试曾因长粘贴回显将最早检查标记挤出 262144 字符尾部而失败；现按流累计同样五个标记，保持退出码和 20 秒超时断言，原始失败报告保留。

## 证据与局限

.local/Test/ 中有 integration.log、build.log、package-win.log、dev-validation.json、desktop-validation.json、packaged-validation.json、native-result.json 及截图。测试故意触发非法 IPC，日志中的对应拒绝是预期；测试结果以断言/报告为准。构建可能提示 Zod 注释移除，未影响产物。

截图文件：workspace.png、operation.png、tasks.png、welcome.png、host-form.png、workspace-small.png、workspace-125.png、workspace-150.png、terminal-fullscreen.png、terminal-loopback.png，以及 quick-open.png、host-form-error.png、task-failed.png、host-form-small.png、tasks-small.png、details-small.png。

未执行：真实 VPS 与 Debian/Ubuntu/Alpine 实机诊断、实际 Agent/加密私钥提示流程、Windows 中文 IME 候选选择、真实 Linux vim/top、系统 DPI 设置切换/跨屏吸附、长时间运行与其他 Windows 版本。回环 ssh2 服务只返回合成结果；Unicode/ANSI/Chromium 缩放不是以上验证的替代品。未获授权的生产主机从未连接。

## Git

SuPilot 独立仓库，远端 git@github.com:suyi-92/SuPilot.git，父 Server 仅记录 gitlink。本次仅开发，不暂存、提交或推送；已有父暂存状态应保留。后续提交与父指针更新仍按双方 AGENTS.md 的授权规则执行。
