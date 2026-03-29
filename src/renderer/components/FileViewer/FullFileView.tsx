import React, { useEffect, useState } from 'react'
import { colors } from '../../theme/colors'

interface Props {
  filePath: string
  repoRoot: string
}

export function FullFileView({ filePath, repoRoot }: Props) {
  const [content, setContent] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)

  useEffect(() => {
    setLoading(true)
    setError(false)
    window.gitchecker.readFile(filePath, repoRoot)
      .then(setContent)
      .catch(() => { setContent(null); setError(true) })
      .finally(() => setLoading(false))
  }, [filePath, repoRoot])

  if (loading) return <CenteredMsg>Loading…</CenteredMsg>
  if (error) return <CenteredMsg>Could not read file</CenteredMsg>

  const lines = content ? content.split('\n') : []

  return (
    <div style={{ overflowY: 'auto', flex: 1, padding: '4px 0' }}>
      {lines.map((line, i) => (
        <div
          key={i}
          style={{ display: 'flex', fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
            fontSize: '12px', lineHeight: '1.6' }}
        >
          <span style={{ color: colors.text.muted, padding: '0 12px', flexShrink: 0,
            userSelect: 'none', minWidth: '3ch', textAlign: 'right' }}>
            {i + 1}
          </span>
          <span className="selectable" style={{ color: colors.text.primary, whiteSpace: 'pre',
            flex: 1, paddingRight: '8px', overflow: 'hidden' }}>
            {line || '\u00a0'}
          </span>
        </div>
      ))}
    </div>
  )
}

function CenteredMsg({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: '12px', color: '#6e7681' }}>
      {children}
    </div>
  )
}
