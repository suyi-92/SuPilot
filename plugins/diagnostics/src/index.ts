import type { DiagnosticPlugin } from '@supilot/plugin-sdk'

export const diagnostics: DiagnosticPlugin = {
  id: 'diagnostics',
  name: '系统诊断',
  version: '0.1.0',
  sdkVersion: 1,
  readOnly: true,
  description: '通过独立 SSH 通道检查系统、运行时间、磁盘和内存。',
  checks: [
    {
      id: 'system',
      title: '系统与内核',
      command:
        "if [ -r /etc/os-release ]; then cat /etc/os-release; else printf 'os-release unavailable\\n'; fi; uname -srm"
    },
    {
      id: 'uptime',
      title: '运行时间',
      command:
        'if command -v uptime >/dev/null 2>&1; then uptime; elif [ -r /proc/uptime ]; then cat /proc/uptime; else exit 127; fi'
    },
    { id: 'disk', title: '磁盘使用', command: 'df -Pk' },
    {
      id: 'memory',
      title: '内存信息',
      command:
        'if [ -r /proc/meminfo ]; then cat /proc/meminfo; elif command -v free >/dev/null 2>&1; then free -k; else exit 127; fi'
    }
  ]
}
