import { create } from 'zustand'

function initial() {
  try {
    return JSON.parse(localStorage.getItem('supilot-ui') || '{}')
  } catch {
    return {}
  }
}
const saved = initial()
type UI = {
  sidebar: boolean
  details: boolean
  tasks: boolean
  focus: boolean
  uiSize: number
  terminalSize: number
  ansi: 'dark-plus' | 'graphite' | 'classic'
  set: (values: Partial<Omit<UI, 'set'>>) => void
}
export const useUI = create<UI>((set, get) => ({
  sidebar: true,
  details: true,
  tasks: false,
  focus: false,
  uiSize: Math.min(17, Math.max(12, Number(saved.uiSize) || 13)),
  terminalSize: Math.min(22, Math.max(11, Number(saved.terminalSize) || 14)),
  ansi: saved.ansi === 'classic' || saved.ansi === 'graphite' ? saved.ansi : 'dark-plus',
  set: (values) => {
    set(values)
    const s = get()
    localStorage.setItem(
      'supilot-ui',
      JSON.stringify({ uiSize: s.uiSize, terminalSize: s.terminalSize, ansi: s.ansi })
    )
  }
}))
