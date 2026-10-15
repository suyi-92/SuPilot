import type { PluginInfo } from '@supilot/contracts'

export interface ReadOnlyCheck {
  id: string
  title: string
  command: string
}
// Only trusted, bundled plugins are registered by the application composition root.
// Commands never come from Renderer. This contract is not a sandbox for third-party code.
export interface DiagnosticPlugin extends PluginInfo {
  sdkVersion: 1
  readOnly: true
  checks: readonly ReadOnlyCheck[]
}
