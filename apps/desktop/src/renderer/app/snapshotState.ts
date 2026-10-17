export type SnapshotLoadState = 'loading' | 'ready' | 'error'

export function snapshotLoadState(loading: boolean, ready: boolean, error?: string): SnapshotLoadState {
  if (error && !ready) return 'error'
  if (loading || !ready) return 'loading'
  return 'ready'
}
