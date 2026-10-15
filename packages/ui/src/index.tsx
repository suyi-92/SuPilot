import * as DialogPrimitive from '@radix-ui/react-dialog'
import * as Tooltip from '@radix-ui/react-tooltip'
import { X, Check, AlertTriangle, Circle, LoaderCircle, CircleHelp } from 'lucide-react'
import type { ButtonHTMLAttributes, ReactNode, RefObject } from 'react'
import { useRef } from 'react'

// Use Radix focus containment and dismissal when a docked panel becomes an overlay.
export function SidePanel({
  floating,
  title,
  onClose,
  children
}: {
  floating: boolean
  title: string
  onClose: () => void
  children: ReactNode
}) {
  const returnFocus = useRef<HTMLElement | null>(null)
  if (!floating)
    return (
      <aside className="details-sidebar" aria-label={title}>
        {children}
      </aside>
    )
  return (
    <DialogPrimitive.Root
      open
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
    >
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="details-backdrop" />
        <DialogPrimitive.Content
          className="details-sidebar peek"
          aria-describedby={undefined}
          onOpenAutoFocus={() => {
            returnFocus.current = document.activeElement as HTMLElement
          }}
          onCloseAutoFocus={(event) => {
            event.preventDefault()
            if (returnFocus.current?.isConnected) returnFocus.current.focus({ preventScroll: true })
          }}
        >
          <DialogPrimitive.Title className="sr-only">{title}</DialogPrimitive.Title>
          {children}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  )
}

export function Button({
  variant = 'default',
  className = '',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'default' | 'primary' | 'danger' | 'ghost'
}) {
  return <button className={`button button-${variant} ${className}`} {...props} />
}
export function IconButton({
  label,
  children,
  className = '',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return (
    <Tooltip.Root>
      <Tooltip.Trigger asChild>
        <button type="button" aria-label={label} className={`icon-button ${className}`} {...props}>
          {children}
        </button>
      </Tooltip.Trigger>
      <Tooltip.Portal>
        <Tooltip.Content className="tooltip" sideOffset={6}>
          {label}
          <Tooltip.Arrow />
        </Tooltip.Content>
      </Tooltip.Portal>
    </Tooltip.Root>
  )
}
export function TooltipProvider({ children }: { children: ReactNode }) {
  return <Tooltip.Provider delayDuration={400}>{children}</Tooltip.Provider>
}
export function Dialog({
  open,
  onClose,
  title,
  description,
  className = '',
  initialFocus,
  children
}: {
  open: boolean
  onClose: () => void
  title: string
  description: string
  className?: string
  initialFocus?: RefObject<HTMLElement | null>
  children: ReactNode
}) {
  return (
    <DialogPrimitive.Root
      open={open}
      onOpenChange={(v) => {
        if (!v) onClose()
      }}
    >
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="dialog-overlay" />
        <DialogPrimitive.Content
          className={`dialog-content ${className}`}
          onOpenAutoFocus={(event) => {
            if (initialFocus?.current) {
              event.preventDefault()
              initialFocus.current.focus()
            }
          }}
        >
          <div className="dialog-header">
            <DialogPrimitive.Title>{title}</DialogPrimitive.Title>
            <DialogPrimitive.Close asChild>
              <button className="icon-button" aria-label="关闭对话框">
                <X size={17} />
              </button>
            </DialogPrimitive.Close>
          </div>
          <DialogPrimitive.Description>{description}</DialogPrimitive.Description>
          {children}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  )
}
const labels: Record<string, string> = {
  running: '运行中',
  succeeded: '已完成',
  failed: '失败',
  'cancel-requested': '请求取消中',
  cancelled: '已取消',
  interrupted: '连接中断',
  unknown: '结果待确认',
  pending: '尚未执行',
  unavailable: '不可用',
  'awaiting-auth': '等待认证',
  authenticated: '已认证',
  closed: '已结束'
}
export function Status({ state }: { state: string }) {
  const Icon =
    state === 'succeeded' || state === 'authenticated'
      ? Check
      : state === 'running' || state === 'cancel-requested' || state === 'awaiting-auth'
        ? LoaderCircle
        : state === 'failed' || state === 'interrupted'
          ? AlertTriangle
          : state === 'unknown'
            ? CircleHelp
            : Circle
  return (
    <span className={`status status-${state}`}>
      <Icon
        size={13}
        className={state === 'running' || state === 'awaiting-auth' ? 'spin' : ''}
        aria-hidden="true"
      />
      {labels[state] || state}
    </span>
  )
}
