import { useState } from 'react'
import { FullFileView } from './FullFileView'
import { SideBySideView } from './SideBySideView'
import { InlineDiffView } from './InlineDiffView'
import { colors } from '../../theme/colors'
import type { SelectedFile } from '../../types'

type Tab = 'file' | 'side-by-side' | 'diff'

interface FileViewerProps {
  selected: SelectedFile
  height: number
  onClose: () => void
}

export function FileViewer({ selected, height, onClose }: FileViewerProps) {
  const [tab, setTab] = useState<Tab>('diff')

  // Switch to 'file' tab for untracked files since there's no diff
  const effectiveTab = selected.status === '?' && tab !== 'file' ? 'file' : tab

  const tabs: Array<{ id: Tab; label: string }> = [
    { id: 'file', label: 'File' },
    { id: 'side-by-side', label: 'Side by Side' },
    { id: 'diff', label: 'Inline Diff' },
  ]

  return (
    <div style={{
      height,
      display: 'flex',
      flexDirection: 'column',
      backgroundColor: colors.bg.primary,
      borderTop: `1px solid ${colors.border}`,
      overflow: 'hidden',
      flexShrink: 0,
    }}>
      {/* Header bar: file path + tabs + close */}
      <div style={{
        display: 'flex',
        alignItems: 'stretch',
        borderBottom: `1px solid ${colors.border}`,
        backgroundColor: colors.bg.secondary,
        flexShrink: 0,
        height: '34px',
      }}>
        {/* File path */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          padding: '0 12px',
          fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
          fontSize: '12px',
          color: colors.text.secondary,
          flex: 1,
          overflow: 'hidden',
        }}>
          <span style={{ opacity: 0.5, marginRight: '6px', fontSize: '10px' }}>{selected.repoName}/</span>
          <span style={{ color: colors.text.primary, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {selected.path}
          </span>
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', alignItems: 'stretch' }}>
          {tabs.map((t) => {
            const isActive = effectiveTab === t.id
            const disabled = selected.status === '?' && t.id !== 'file'
            return (
              <button
                key={t.id}
                onClick={() => !disabled && setTab(t.id)}
                style={{
                  height: '100%',
                  padding: '0 14px',
                  fontSize: '12px',
                  fontWeight: isActive ? 600 : 400,
                  color: disabled ? colors.text.muted : isActive ? colors.text.primary : colors.text.muted,
                  background: 'none',
                  border: 'none',
                  borderBottom: `2px solid ${isActive ? colors.accent : 'transparent'}`,
                  cursor: disabled ? 'not-allowed' : 'pointer',
                  outline: 'none',
                  opacity: disabled ? 0.4 : 1,
                  transition: 'color 0.1s',
                  whiteSpace: 'nowrap',
                }}
              >
                {t.label}
              </button>
            )
          })}
        </div>

        {/* Close button */}
        <button
          onClick={onClose}
          title="Close viewer (Escape)"
          style={{
            width: '34px',
            height: '100%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'none',
            border: 'none',
            borderLeft: `1px solid ${colors.border}`,
            cursor: 'pointer',
            color: colors.text.muted,
            fontSize: '16px',
          }}
        >
          ×
        </button>
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        {effectiveTab === 'file' && (
          <FullFileView filePath={selected.path} repoRoot={selected.repoRoot} />
        )}
        {effectiveTab === 'side-by-side' && (
          <SideBySideView filePath={selected.path} repoRoot={selected.repoRoot} />
        )}
        {effectiveTab === 'diff' && (
          <InlineDiffView filePath={selected.path} repoRoot={selected.repoRoot} />
        )}
      </div>
    </div>
  )
}
