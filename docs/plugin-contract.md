# v0.1 内置插件契约

仅支持可信、随应用发布的只读插件，不是稳定公共 SDK 或安全沙箱。

## 现有接口

packages/plugin-sdk/src/index.ts 定义 DiagnosticPlugin：id、name、version、description、sdkVersion: 1、readOnly: true，以及 checks（id、title、command）。

Engine.register 检查版本、只读声明和重复 ID。apps/desktop/src/engine/index.ts 装配并注册 Diagnostics，核心不 import 具体插件。command 只来自可信源码，Renderer 不能提交命令。只读声明不等于沙箱，新增插件须审查命令和输出。插件无裸数据库、凭据或其他终端访问权。

## Diagnostics

| 步骤       | 当前命令/降级                               |
| ---------- | ------------------------------------------- |
| 系统与内核 | /etc/os-release（缺失明确说明）、uname -srm |
| 运行时间   | uptime，否则 /proc/uptime                   |
| 磁盘       | df -Pk                                      |
| 内存       | /proc/meminfo，否则 free -k                 |

考虑 Debian/Ubuntu/Alpine 基本差异，尚未在真实发行版测试。退出 127 标 unavailable，其他非零为失败；不虚构数值。结果保留原始输出、退出码、步骤状态和任务时间，不提前解析为监控仪表。

每项独立 SSH，BatchMode 公钥认证，20 秒、128 KiB。同机互斥，全局最多四任务。执行/取消/未知处理及存储由 Engine 负责，插件不直接启动 SSH 或操作数据库。

## 统一界面

Operations、TaskDetail、Status、步骤与只读日志提供统一呈现。操作页绑定固定目标，结果保存到 SQLite，底部任务区或中央标签可查看。导航选择不会改变已打开操作。

## Access 与 SuRelay

目前是规划目录，不注册可执行插件。应用有“规划中”说明和禁用按钮，不发起远端请求。

Access 未来提供公钥接入、登录策略与端口变更，实施时必须保留旧通道、验证独立新连接后再收紧。SuRelay 为可选服务适配，后续先探测版本/能力、接入非交互机器接口；不复制服务端源码、不依赖兄弟目录、不解析 TUI 坐标。

有副作用的工作流、文件传输、恢复/补偿和第三方加载均不在本轮 SDK 内。
