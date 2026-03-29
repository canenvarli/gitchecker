import React from 'react'
import type { FileStatus } from '../../types'
import { colors } from '../../theme/colors'

interface StatusBadgeProps {
  status: FileStatus
  staged?: boolean
}

const STATUS_LABELS: Record<FileStatus, string> = {
  M: 'M',
  A: 'A',
  D: 'D',
  '?': '?',
  R: 'R',
  C: 'C',
}

const STATUS_TITLES: Record<FileStatus, string> = {
  M: 'Modified',
  A: 'Added',
  D: 'Deleted',
  '?': 'Untracked',
  R: 'Renamed',
  C: 'Conflict',
}

export const StatusBadge = React.memo(function StatusBadge({ status, staged }: StatusBadgeProps) {
  const color = colors.status[status] ?? colors.text.muted

  return (
    <span
      title={`${STATUS_TITLES[status]}${staged ? ' (staged)' : ''}`}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: '18px',
        height: '18px',
        borderRadius: '3px',
        fontSize: '11px',
        fontWeight: 700,
        fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
        color: color,
        backgroundColor: `${color}22`,
        border: `1px solid ${color}44`,
        flexShrink: 0,
        lineHeight: 1,
        opacity: staged ? 1 : 0.75,
      }}
    >
      {STATUS_LABELS[status]}
    </span>
  )
})
