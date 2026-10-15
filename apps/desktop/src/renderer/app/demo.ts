import type { Host, Snapshot, Task } from '@supilot/contracts'

export function demoSnapshot(): Snapshot {
  const names = [
    '东京 · 边缘节点 01',
    '新加坡 · 应用服务',
    '香港 · 数据库只读副本',
    '法兰克福 · 欧洲业务入口',
    '洛杉矶 · 构建服务',
    '东京 · 边缘节点 02',
    '上海 · 内部开发环境',
    '北京 · 联调与测试',
    '广州 · Alpine 实验节点',
    '成都 · 容器测试',
    '长期归档 · 数据同步备用节点',
    '开发沙箱 01',
    '开发沙箱 02',
    '临时测试 · 等待配置'
  ]
  const hosts: Host[] = names.map((name, i) => ({
    id: `00000000-0000-4000-8000-${String(i + 1).padStart(12, '0')}`,
    name,
    address: `192.0.2.${10 + i}`,
    port: i === 2 ? 22022 : 22,
    sshdPort: 22,
    username: i < 6 ? 'ops' : 'dev',
    auth: 'agent',
    keyPath: '',
    group: i < 6 ? '生产环境 · 合成数据' : i < 11 ? '开发与测试' : '沙箱',
    tags: i < 6 ? ['edge', 'debian'] : ['lab', i === 8 ? 'alpine' : 'ubuntu'],
    notes: '文档保留地址，仅用于演示。不会发起真实网络连接。',
    updatedAt: new Date().toISOString()
  }))
  const tasks: Task[] = ['succeeded', 'running', 'failed', 'unknown'].map((state, i) => ({
    id: `demo-task-${i}`,
    pluginId: 'diagnostics',
    title: '系统诊断',
    target: hosts[i],
    state: state as Task['state'],
    createdAt: new Date(Date.now() - (i + 1) * 180000).toISOString(),
    finishedAt: i !== 1 ? new Date(Date.now() - i * 180000).toISOString() : undefined,
    demo: true,
    message: [
      '只读检查已完成。以下为合成结果，不代表真实主机。',
      '模拟任务正在检查磁盘。不会执行远程命令。',
      '模拟认证失败：SSH Agent 中没有可用密钥。',
      '模拟连接中断：最后一步的远端结果待确认。'
    ][i],
    steps: [
      {
        id: 'system',
        title: '系统与内核',
        state: i === 2 ? 'failed' : 'succeeded',
        output:
          i === 2
            ? 'Permission denied (publickey).\n请将已有密钥加载到 SSH Agent 后重试。'
            : 'PRETTY_NAME="Debian GNU/Linux 12 (bookworm)"\nLinux 6.1.0-28-amd64 x86_64'
      },
      {
        id: 'uptime',
        title: '运行时间',
        state: i === 2 ? 'pending' : 'succeeded',
        output: i === 2 ? '' : '14:32:08 up 28 days, 6:41, 1 user, load average: 0.08, 0.12, 0.09'
      },
      {
        id: 'disk',
        title: '磁盘使用',
        state: i === 1 ? 'running' : i === 2 ? 'pending' : 'succeeded',
        output:
          i === 0 || i === 3
            ? 'Filesystem      1024-blocks      Used Available Capacity Mounted on\n/dev/vda1          41151808   8230361  30807872      21% /\ntmpfs               999424         0    999424       0% /dev/shm'
            : ''
      },
      {
        id: 'memory',
        title: '内存信息',
        state: i === 0 ? 'succeeded' : i === 3 ? 'unknown' : 'pending',
        output:
          i === 0
            ? 'MemTotal:        1998848 kB\nMemFree:          861440 kB\nMemAvailable:    1327104 kB\nSwapTotal:       1048576 kB\nSwapFree:        1048576 kB'
            : ''
      }
    ]
  }))
  return {
    hosts,
    tasks,
    sessions: [0, 1].map((i) => ({
      id: `demo-session-${i}`,
      target: hosts[i],
      state: 'awaiting-auth',
      createdAt: new Date().toISOString(),
      demo: true,
      message: '模拟终端 · 无网络连接'
    })),
    plugins: [
      {
        id: 'diagnostics',
        name: '系统诊断',
        description: '系统、运行时间、磁盘、内存',
        version: '0.1.0',
        readOnly: true
      }
    ],
    sshAvailable: true,
    dataPath: '演示内存数据源 · 不写入真实数据库'
  }
}
export const demoTerminal = (host: Host, index: number) =>
  [
    '\x1b[38;2;227;187;116m  演示终端 · 合成内容 · 未连接任何服务器\x1b[0m\r\n',
    `\x1b[38;2;125;206;176m${host.username}@${index % 2 ? 'sg-app-01' : 'tyo-edge-01'}\x1b[0m \x1b[38;2;130;144;164m~\x1b[0m $ ${index % 2 ? 'df -h' : 'uname -srm'}\r\n`,
    index % 2
      ? 'Filesystem      Size  Used Avail Use% Mounted on\r\n/dev/vda1        40G  7.9G   30G  21% /\r\ntmpfs           976M     0  976M   0% /dev/shm\r\n'
      : 'Linux 6.1.0-28-amd64 x86_64\r\n',
    `\r\n\x1b[38;2;125;206;176m${host.username}@${index % 2 ? 'sg-app-01' : 'tyo-edge-01'}\x1b[0m \x1b[38;2;130;144;164m~\x1b[0m $ ${index % 2 ? 'uptime' : 'cat /etc/os-release'}\r\n`,
    index % 2
      ? '14:32:08 up 28 days, 6:41, 1 user\r\nload average: 0.08, 0.12, 0.09\r\n'
      : 'PRETTY_NAME="Debian GNU/Linux 12 (bookworm)"\r\nNAME="Debian GNU/Linux"\r\nVERSION_ID="12"\r\nVERSION_CODENAME=bookworm\r\n',
    '\r\n\x1b[38;2;130;144;164m# 右侧查看连接档案；系统诊断在独立任务中执行。\r\n# 此窗格仅演示排版，键盘输入不会被执行。\x1b[0m\r\n',
    `\r\n\x1b[38;2;125;206;176m${host.username}@${index % 2 ? 'sg-app-01' : 'tyo-edge-01'}\x1b[0m \x1b[38;2;130;144;164m~\x1b[0m $ `
  ].join('')
