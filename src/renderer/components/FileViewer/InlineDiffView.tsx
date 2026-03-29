import React, { useEffect, useState } from 'react'
import { colors } from '../../theme/colors'

interface Props {
  filePath: string
  repoRoot: string
}

function lineColor(line: string): { color: string; bg: string } {
  if (line.startsWith('+++') || line.startsWith('---')) return { color: colors.text.muted, bg: 'transparent' }
  if (line.startsWith('+')) return { color: '#3fb950', bg: '#3fb95014' }
  if (line.startsWith('-')) return { color: '#f85149', bg: '#f8514914' }
  if (line.startsWith('@@')) return { color: '#79c0ff', bg: '#79c0ff0a' }
  if (line.startsWith('diff ') || line.startsWith('index ')) return { color: colors.text.muted, bg: 'transparent' }
  return { color: colors.text.secondary, bg: 'transparent' }
}

export function InlineDiffView({ filePath, repoRoot }: Props) {
  const [diff, setDiff] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    window.gitchecker.getDiff(filePath, repoRoot)
      .then(setDiff)
      .catch(() => setDiff(''))
      .finally(() => setLoading(false))
  }, [filePath, repoRoot])

  if (loading) return <CenteredMsg>Loading…</CenteredMsg>

  const lines = diff ? diff.split('\n') : []
  if (lines.length === 0 || (lines.length === 1 && lines[0] === '')) {
    return <CenteredMsg>No diff available</CenteredMsg>
  }

  return (
    <div style={{ overflowY: 'auto', flex: 1, padding: '4px 0' }}>
      {lines.map((line, i) => {
        const { color, bg } = lineColor(line)
        return (
          <div
            key={i}
            style={{
              display: 'flex',
              fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
              fontSize: '12px',
              lineHeight: '1.6',
              backgroundColor: bg,
            }}
          >
            <span style={{ color: colors.text.muted, padding: '0 12px', flexShrink: 0, userSelect: 'none', minWidth: '3ch', textAlign: 'right' }}>
              {i + 1}
            </span>
            <span className="selectable" style={{ color, whiteSpace: 'pre', flex: 1, paddingRight: '8px', overflow: 'hidden' }}>
              {line || '\u00a0'}
            </span>
          </div>
        )
      })}
    </div>
  )
}

function CenteredMsg({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: '12px', color: colors.text.muted }}>
      {children}
    </div>
  )
}
