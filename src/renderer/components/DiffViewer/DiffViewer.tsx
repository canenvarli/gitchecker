import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { colors } from '../../theme/colors'

interface DiffViewerProps {
  filePath: string
  repoRoot: string
  onClose: () => void
}

function colorForLine(line: string): { color: string; bg?: string } {
  if (line.startsWith('+++') || line.startsWith('---')) return { color: colors.text.muted }
  if (line.startsWith('+')) return { color: '#3fb950', bg: '#3fb95012' }
  if (line.startsWith('-')) return { color: '#f85149', bg: '#f8514912' }
  if (line.startsWith('@@')) return { color: '#79c0ff' }
  if (line.startsWith('diff ') || line.startsWith('index ')) return { color: colors.text.muted }
  return { color: colors.text.secondary }
}

export function DiffViewer({ filePath, repoRoot, onClose }: DiffViewerProps) {
  const [diff, setDiff] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    window.gitchecker.getDiff(filePath, repoRoot)
      .then((d) => setDiff(d))
      .catch(() => setDiff(''))
      .finally(() => setLoading(false))
  }, [filePath, repoRoot])

  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  const lines = diff ? diff.split('\n') : []

  return createPortal(
    <div
      style={{ position: 'fixed', inset: 0, zIndex: 2000, backgroundColor: 'rgba(0,0,0,0.75)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '32px' }}
      onClick={onClose}
    >
      <div
        style={{ backgroundColor: colors.bg.secondary, border: `1px solid ${colors.border}`,
          borderRadius: '10px', width: '100%', maxWidth: '800px', maxHeight: '80vh',
          display: 'flex', flexDirection: 'column', boxShadow: '0 24px 64px rgba(0,0,0,0.8)' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px',
          padding: '12px 16px', borderBottom: `1px solid ${colors.border}`, flexShrink: 0 }}>
          <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '12px',
            color: colors.text.primary, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {filePath}
          </span>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer',
            color: colors.text.muted, fontSize: '18px', lineHeight: 1, padding: '0 4px' }}>×</button>
        </div>
        {/* Content */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '12px 0' }}>
          {loading && (
            <div style={{ padding: '24px', textAlign: 'center', color: colors.text.muted, fontSize: '13px' }}>
              Loading diff…
            </div>
          )}
          {!loading && lines.length === 0 && (
            <div style={{ padding: '24px', textAlign: 'center', color: colors.text.muted, fontSize: '13px' }}>
              No changes to display
            </div>
          )}
          {!loading && lines.map((line, i) => {
            const { color, bg } = colorForLine(line)
            return (
              <div key={i} style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '12px',
                lineHeight: '1.6', padding: '0 16px', color, backgroundColor: bg ?? 'transparent',
                whiteSpace: 'pre', overflow: 'hidden' }}>
                {line || '\u00a0'}
              </div>
            )
          })}
        </div>
      </div>
    </div>,
    document.body
  )
}
