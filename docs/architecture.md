# v0.1 架构与边界

本文描述当前实现，待实现扩展单独标注。

## 进程与依赖

| 位置                  | 当前职责                                                             |
| --------------------- | -------------------------------------------------------------------- |
| Renderer              | React 工作区与 xterm，经 Preload 访问后台                            |
| Preload               | sandbox 兼容 CJS 桥接：request、subscribe、attachTerminal、chooseKey |
| Main                  | 原生窗口、单实例、配置隔离、文件选择、IPC 授权、Engine 与退出流程    |
| Engine utilityProcess | SQLite、主机、OpenSSH、信任、PTY、任务、插件执行                     |

Main 校验 sender、mainFrame、精确 Renderer URL 和 Zod 请求；Engine 再校验。拒绝弹窗、导航、webview 及非必要权限，剪贴板仅开放给受信任主窗口。MessagePort 只能绑定已存在会话一次，输入、尺寸和 ACK 有运行时校验。Renderer 无通用 IPC、文件读写或任意命令 API。

依赖方向为 contracts → plugin-sdk / engine / ui / plugins → apps/desktop。contracts 平台中立，engine 不导入具体插件。应用 engine 入口仅装配 Diagnostics 和 Electron 传输，不维护第二套状态。

## 主机与存储

主机以 UUID 标识，保存名称、地址、公网端口、用户名、认证/私钥路径、分组、标签、备注。`local` 档案由 Engine 首次启动时根据当前计算机名和用户名自动创建，固定指向 `127.0.0.1`，仅作为明确的本机 SSH 入口，不会自动连接；sshdPort 是记录的远端监听端口，与连接使用的 port 独立。本机档案不能删除，避免每次启动重复出现。

Engine 是会话和任务事实来源。Zustand 仅保存布局与字体等 UI 状态；React 接收低频快照。操作页、信任挑战、会话和任务均冻结目标，导航选择与档案编辑不改变已创建对象。删除档案保留会话、任务快照与信任。

SQLite 使用 Electron 内置 Node 的 node:sqlite（当前仍带实验性 API 提示），WAL、schema version 1。主机/任务为 JSON 行。查询最近 200 条任务，创建前清理旧记录；每项最多 128 KiB，四项约 512 KiB/任务。v0.1 的有界日志直接保存在任务 JSON 中，没有额外日志文件/索引服务。

启动将未完成 running / cancel-requested 恢复为 unknown，不自动重跑。终端内容不落盘，会话不跨重启恢复。数据不加密，不保存密码/口令，私钥仅存路径引用。正式/开发/测试使用独立 userData，.local 不承担运行数据。

## 交互终端

xterm → MessagePort → Engine Sessions → node-pty → ConPTY → 系统 OpenSSH。高频输出直接进入 xterm，绕过 React/Zustand。每 16 ms 最多发送 16K 字符，未确认量达到 128K 字符时暂停 PTY，xterm 完成写入后 ACK；待发送超过 1M 字符时结束本地会话。滚动历史 5000 行，最多 16 个活跃会话。

ResizeObserver 和 xterm resize 同步尺寸，包含字号变化。标签切换仅隐藏，保持 xterm/端口挂载；关闭标签才释放。端口意外关闭时标记中断并释放 PTY。

初始 awaiting-auth。远端启动命令打印随机 UUID 的 OSC 握手，然后 exec 用户登录 Shell。UUID 只在认证后的 SSH exec 请求发送，预认证 banner 无从获知；增量解析器剥离标记，收到正确标记才 authenticated。不能以进程启动或普通“Authenticated”文本判断成功。

因此 v0.1 需要目标提供 Linux sh 与可运行登录 Shell。后续用户输入直接发送；诊断不使用该 PTY。node-pty 的 Windows 自然退出资源修复通过 pnpm patch 管理，见 patches/README.md。

## SSH 与信任

Windows 使用 System32/OpenSSH 的 ssh.exe、ssh-keyscan.exe，缺失时提示安装可选功能。专属 config/known_hosts；StrictHostKeyChecking=yes、UpdateHostKeys=no、GlobalKnownHostsFile=none，不读取用户默认 SSH 配置。关闭转发，连接超时 10 秒，启用 server alive。

扫描 ed25519/ecdsa/rsa 公钥并计算 SHA256。首次连接用户独立核对并确认，扫描本身不验证身份。挑战冻结目标，有一次性 token 与五分钟有效期；未信任不能执行。已知算法密钥变化或不再有匹配密钥时阻断，实际 OpenSSH 再核验 known_hosts，防止扫描后被替换。

不提供指纹删除/重装恢复，不清空信任，不创建/删除用户登录密钥。

## 只读任务

可信插件固定命令，Renderer 只指定插件 ID。每项独立非 PTY SSH、BatchMode=yes、公钥认证、忽略 stdin；最多 20 秒，stdout+stderr 合计 128 KiB。同机一任务，全局最多四任务，无排队或自动重试。

| 状态             | 含义                                        |
| ---------------- | ------------------------------------------- |
| running          | 执行中                                      |
| succeeded        | 检查完成；不可用项单独标 unavailable 并说明 |
| failed           | 明确执行/认证/信任/连接建立/本地启动失败    |
| interrupted      | SSH 意外中断，远端结果未确认                |
| cancel-requested | 已请求本地取消，尚未确认结果                |
| cancelled        | 尚未发出的检查取消                          |
| unknown          | 超时、超限、执行中取消、崩溃导致结果未知    |

步骤记录输出、退出码和状态；移除 ANSI CSI/NUL，以只读文本呈现。日志不含应用保存的密码，但系统信息可能包含运维元数据，不承诺通用自动脱敏。

## 生命周期、演示与后续

活跃会话/任务退出时提示，确认后关闭 PTY、取消任务、等待 Engine，超时再结束后台。远端是否停止不可保证。Engine 崩溃提示重启并标记中断/未知。

演示纯 Renderer 内存，14 台合成主机、模拟终端与任务，不调用连接/执行/主机写入 API。进入前须结束真实活跃操作，模拟窗格不标已连接。

SFTP、跳板机 UI、批量调度、凭据保存、访问保护执行器、重装恢复、第三方插件和升级均未实现，不提前堆积空接口。
