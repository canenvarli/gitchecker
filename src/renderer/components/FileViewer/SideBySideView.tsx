import React, { useEffect, useState } from 'react'
import { buildSideBySide, SideBySideRow } from './diffParser'
import { colors } from '../../theme/colors'

interface Props {
  filePath: string
  repoRoot: string
}

const REMOVED_BG = '#f8514914'
const ADDED_BG = '#3fb95014'
const CHANGED_BG_LEFT = '#d2992214'
const CHANGED_BG_RIGHT = '#3fb95014'
const HUNK_BG = '#79c0ff0a'

function bgFor(row: SideBySideRow, side: 'left' | 'right'): string {
  switch (row.type) {
    case 'removed': return side === 'left' ? REMOVED_BG : 'transparent'
    case 'added': return side === 'right' ? ADDED_BG : 'transparent'
    case 'changed': return side === 'left' ? CHANGED_BG_LEFT : CHANGED_BG_RIGHT
    case 'hunk-header': return HUNK_BG
    default: return 'transparent'
  }
}

function colorFor(row: SideBySideRow, side: 'left' | 'right'): string {
  if (row.type === 'hunk-header') return '#79c0ff'
  if (row.type === 'removed' && side === 'left') return '#f85149'
  if (row.type === 'added' && side === 'right') return '#3fb950'
  if (row.type === 'changed') return side === 'left' ? '#d29922' : '#3fb950'
  return colors.text.secondary
}

export function SideBySideView({ filePath, repoRoot }: Props) {
  const [rows, setRows] = useState<SideBySideRow[] | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    window.gitchecker.getDiff(filePath, repoRoot)
      .then((diff) => setRows(buildSideBySide(diff)))
      .catch(() => setRows([]))
      .finally(() => setLoading(false))
  }, [filePath, repoRoot])

  if (loading) return <CenteredMsg>Loading…</CenteredMsg>
  if (!rows || rows.length === 0) return <CenteredMsg>No diff available</CenteredMsg>

  return (
    <div style={{ overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column' }}>
      {/* Column headers */}
      <div style={{ display: 'flex', borderBottom: `1px solid ${colors.border}`, flexShrink: 0 }}>
        <div style={headerStyle}>HEAD</div>
        <div style={{ width: '1px', backgroundColor: colors.border, flexShrink: 0 }} />
        <div style={headerStyle}>Working tree</div>
      </div>
      {/* Rows */}
      <div style={{ flex: 1, overflowY: 'auto' }}>
        {rows.map((row, i) => (
          <div key={i} style={{ display: 'flex', minHeight: '21px' }}>
            {/* Left */}
            <div style={{ flex: 1, display: 'flex', backgroundColor: bgFor(row, 'left'), overflow: 'hidden' }}>
              <span style={{ color: colors.text.muted, padding: '0 6px', flexShrink: 0, fontSize: '11px',
                fontFamily: 'monospace', lineHeight: '1.6', userSelect: 'none', minWidth: '32px', textAlign: 'right' }}>
                {row.leftNum ?? ''}
              </span>
              <span className="selectable" style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '12px',
                lineHeight: '1.6', color: colorFor(row, 'left'), whiteSpace: 'pre', overflow: 'hidden',
                flex: 1, paddingRight: '4px' }}>
                {row.left ?? '\u00a0'}
              </span>
            </div>
            {/* Divider */}
            <div style={{ width: '1px', backgroundColor: colors.border, flexShrink: 0 }} />
            {/* Right */}
            <div style={{ flex: 1, display: 'flex', backgroundColor: bgFor(row, 'right'), overflow: 'hidden' }}>
              <span style={{ color: colors.text.muted, padding: '0 6px', flexShrink: 0, fontSize: '11px',
                fontFamily: 'monospace', lineHeight: '1.6', userSelect: 'none', minWidth: '32px', textAlign: 'right' }}>
                {row.rightNum ?? ''}
              </span>
              <span className="selectable" style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '12px',
                lineHeight: '1.6', color: colorFor(row, 'right'), whiteSpace: 'pre', overflow: 'hidden',
                flex: 1, paddingRight: '4px' }}>
                {row.right ?? '\u00a0'}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

const headerStyle: React.CSSProperties = {
  flex: 1,
  padding: '4px 8px',
  fontSize: '10px',
  fontWeight: 700,
  letterSpacing: '0.06em',
  textTransform: 'uppercase',
  color: '#6e7681',
}

function CenteredMsg({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: '12px', color: '#6e7681' }}>
      {children}
    </div>
  )
}
