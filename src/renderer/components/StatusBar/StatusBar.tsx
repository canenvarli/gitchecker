import React, { useState, useEffect } from 'react'
import type { Config } from '../../types'
import { colors } from '../../theme/colors'

interface StatusBarProps {
  config: Config | null
  lastScan: Date | null
  conflictCount: number
}

function formatLastScan(date: Date | null): string {
  if (!date) return 'Never scanned'
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000)
  if (seconds < 3) return 'just now'
  if (seconds < 60) return `${seconds}s ago`
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  return `${Math.floor(minutes / 60)}h ago`
}

export function StatusBar({ config, lastScan, conflictCount }: StatusBarProps) {
  const [, setTick] = useState(0)

  // Re-render every second to update the relative time display
  useEffect(() => {
    const interval = setInterval(() => setTick((t) => t + 1), 1000)
    return () => clearInterval(interval)
  }, [])

  const rootCount = config?.watchRoots.length ?? 0

  return (
    <div
      style={{
        height: '28px',
        backgroundColor: colors.bg.secondary,
        borderTop: `1px solid ${colors.border}`,
        display: 'flex',
        alignItems: 'center',
        paddingLeft: '16px',
        paddingRight: '16px',
        gap: '0',
        flexShrink: 0,
      }}
    >
      <StatusSegment>
        <span style={{ color: colors.status.A }}>◉</span>
        <span style={{ marginLeft: '5px' }}>
          Watching {rootCount} {rootCount === 1 ? 'root' : 'roots'}
        </span>
      </StatusSegment>

      <Separator />

      <StatusSegment>
        Last scan: {formatLastScan(lastScan)}
      </StatusSegment>

      <Separator />

      <StatusSegment>
        {conflictCount > 0 ? (
          <span style={{ color: colors.status.C }}>
            {conflictCount} {conflictCount === 1 ? 'conflict' : 'conflicts'}
          </span>
        ) : (
          <span>0 conflicts</span>
        )}
      </StatusSegment>
    </div>
  )
}

function StatusSegment({ children }: { children: React.ReactNode }) {
  return (
    <span
      style={{
        fontSize: '11px',
        color: colors.text.muted,
        display: 'flex',
        alignItems: 'center',
        whiteSpace: 'nowrap',
      }}
    >
      {children}
    </span>
  )
}

function Separator() {
  return (
    <span
      style={{
        color: colors.border,
        margin: '0 10px',
        fontSize: '11px',
      }}
    >
      •
    </span>
  )
}
