import { useEffect, useId, useRef, useState } from 'react'
import type { Host } from '@supilot/contracts'
import { Dialog } from '@supilot/ui'
import { ArrowUpRight, Search, Server } from 'lucide-react'
import { endpoint } from './format'

export function QuickOpen({
  hosts,
  onClose,
  onOpen
}: {
  hosts: Host[]
  onClose: () => void
  onOpen: (host: Host) => void
}) {
  const [query, setQuery] = useState('')
  const [index, setIndex] = useState(0)
  const input = useRef<HTMLInputElement>(null)
  const list = useRef<HTMLDivElement>(null)
  const id = useId()
  const matches = hosts.filter((host) =>
    `${host.name} ${host.address} ${host.group} ${host.tags.join(' ')}`
      .toLowerCase()
      .includes(query.trim().toLowerCase())
  )
  const selected = Math.min(index, Math.max(0, matches.length - 1))
  useEffect(() => {
    list.current?.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest' })
  }, [selected, query])
  const choose = (host: Host) => {
    onClose()
    onOpen(host)
  }
  return (
    <Dialog
      open
      onClose={onClose}
      title="快速打开主机"
      description="搜索名称、地址或标签，打开或切回已有会话。"
      className="quick-open"
      initialFocus={input}
    >
      <div className="quick-input">
        <Search size={17} />
        <input
          ref={input}
          role="combobox"
          aria-label="快速搜索主机"
          aria-expanded="true"
          aria-controls={id}
          aria-autocomplete="list"
          aria-activedescendant={matches.length ? `${id}-${selected}` : undefined}
          placeholder="输入主机名称、地址或标签…"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value)
            setIndex(0)
          }}
          onKeyDown={(event) => {
            if (event.nativeEvent.isComposing) return
            if (['ArrowDown', 'ArrowUp', 'Enter'].includes(event.key)) event.preventDefault()
            if (event.key === 'ArrowDown')
              setIndex(Math.max(0, Math.min(selected + 1, matches.length - 1)))
            if (event.key === 'ArrowUp') setIndex(Math.max(0, selected - 1))
            if (event.key === 'Enter' && matches[selected]) choose(matches[selected])
          }}
        />
        <kbd>Esc</kbd>
      </div>
      <div id={id} ref={list} role="listbox" aria-label="匹配的主机" className="quick-results">
        {matches.map((host, i) => (
          <div
            key={host.id}
            id={`${id}-${i}`}
            role="option"
            aria-selected={i === selected}
            className="quick-result"
            onMouseMove={() => setIndex(i)}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => choose(host)}
          >
            <Server size={16} />
            <div>
              <strong>{host.name}</strong>
              <small>{endpoint(host)}</small>
            </div>
            <span>{host.group || '未分组'}</span>
            <ArrowUpRight size={14} />
          </div>
        ))}
        {!matches.length && (
          <div className="quick-empty">
            {hosts.length
              ? '没有匹配的主机，试试地址或标签。'
              : '尚无主机，请先在左侧添加连接档案。'}
          </div>
        )}
      </div>
      <footer>
        <span>{matches.length} 台主机</span>
        <span>
          <kbd>↑</kbd>
          <kbd>↓</kbd> 选择 <kbd>Enter</kbd> 打开
        </span>
      </footer>
    </Dialog>
  )
}
