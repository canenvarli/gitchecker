import React, { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { colors } from '../../theme/colors'

interface ClaudeNotFoundProps {
  onSave: (path: string) => void
  onDismiss: () => void
}

export function ClaudeNotFoundModal({ onSave, onDismiss }: ClaudeNotFoundProps) {
  const [value, setValue] = useState('')

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onDismiss()
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [onDismiss])

  async function handleBrowse() {
    const picked = await window.gitchecker.pickClaudeBinary()
    if (picked) setValue(picked)
  }

  function handleSave() {
    if (value.trim()) onSave(value.trim())
  }

  return createPortal(
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 2000,
        backgroundColor: 'rgba(0,0,0,0.75)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '24px',
      }}
      onClick={onDismiss}
    >
      <div
        style={{
          backgroundColor: colors.bg.secondary,
          border: `1px solid ${colors.border}`,
          borderRadius: '12px',
          width: '100%',
          maxWidth: '480px',
          boxShadow: '0 24px 64px rgba(0,0,0,0.7)',
          display: 'flex',
          flexDirection: 'column',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{
          padding: '18px 24px',
          borderBottom: `1px solid ${colors.border}`,
          display: 'flex',
          alignItems: 'center',
        }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: '15px', fontWeight: 700, color: colors.text.primary }}>
              Claude CLI Not Found
            </div>
          </div>
          <button
            onClick={onDismiss}
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              color: colors.text.muted,
              fontSize: '18px',
              lineHeight: 1,
              padding: '2px 6px',
              borderRadius: '4px',
            }}
          >
            ×
          </button>
        </div>

        {/* Body */}
        <div style={{ padding: '16px 24px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <p style={{ fontSize: '13px', color: colors.text.secondary, lineHeight: '1.5', margin: 0 }}>
            GitChecker couldn't find the <code style={{
              fontFamily: "'JetBrains Mono', monospace",
              fontSize: '12px',
              color: colors.accent,
              backgroundColor: colors.bg.tertiary,
              padding: '1px 5px',
              borderRadius: '3px',
            }}>claude</code> binary.
            Point to it below so AI commit messages and merge resolution work correctly.
          </p>

          <div style={{ display: 'flex', gap: '6px' }}>
            <input
              autoFocus
              value={value}
              onChange={(e) => setValue(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && value.trim()) handleSave() }}
              placeholder="/opt/homebrew/bin/claude"
              className="selectable"
              style={{
                flex: 1,
                height: '34px',
                padding: '0 10px',
                fontSize: '12px',
                fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
                backgroundColor: colors.bg.primary,
                border: `1px solid ${colors.border}`,
                borderRadius: '6px',
                color: colors.text.primary,
                outline: 'none',
              }}
            />
            <BtnSecondary onClick={handleBrowse}>Browse</BtnSecondary>
          </div>

          <p style={{ fontSize: '11px', color: colors.text.muted, lineHeight: '1.4', margin: 0 }}>
            Tip: run <code style={{
              fontFamily: "'JetBrains Mono', monospace",
              fontSize: '10px',
              color: colors.text.secondary,
            }}>which claude</code> in your terminal to find the path.
            You can also change this later in Settings &gt; Claude.
          </p>
        </div>

        {/* Footer */}
        <div style={{
          padding: '14px 24px',
          borderTop: `1px solid ${colors.border}`,
          display: 'flex',
          justifyContent: 'flex-end',
          gap: '8px',
        }}>
          <BtnSecondary onClick={onDismiss}>Dismiss</BtnSecondary>
          <BtnPrimary onClick={handleSave} disabled={!value.trim()}>Save Path</BtnPrimary>
        </div>
      </div>
    </div>,
    document.body,
  )
}

function BtnPrimary({ onClick, disabled, children }: { onClick: () => void; disabled?: boolean; children: React.ReactNode }) {
  const [hovered, setHovered] = useState(false)
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        height: '32px',
        padding: '0 14px',
        borderRadius: '6px',
        fontSize: '12px',
        fontWeight: 500,
        cursor: disabled ? 'default' : 'pointer',
        border: `1px solid ${colors.accent}`,
        backgroundColor: disabled ? colors.bg.tertiary : hovered ? '#388bfd' : colors.accent,
        color: disabled ? colors.text.muted : '#fff',
        transition: 'background-color 0.1s',
        outline: 'none',
        whiteSpace: 'nowrap',
        opacity: disabled ? 0.5 : 1,
      }}
    >
      {children}
    </button>
  )
}

function BtnSecondary({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  const [hovered, setHovered] = useState(false)
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        height: '32px',
        padding: '0 14px',
        borderRadius: '6px',
        fontSize: '12px',
        fontWeight: 500,
        cursor: 'pointer',
        border: `1px solid ${colors.border}`,
        backgroundColor: hovered ? colors.bg.hover : colors.bg.tertiary,
        color: colors.text.secondary,
        transition: 'background-color 0.1s',
        outline: 'none',
        whiteSpace: 'nowrap',
      }}
    >
      {children}
    </button>
  )
}
