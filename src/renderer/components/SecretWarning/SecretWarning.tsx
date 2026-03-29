import React from 'react'
import { createPortal } from 'react-dom'
import type { SecretHit } from '../../types'
import { colors } from '../../theme/colors'

interface SecretWarningProps {
  hits: SecretHit[]
  onCancel: () => void
  onProceed: () => void
}

function redactPreview(preview: string): string {
  // Replace anything that looks like a key value (long alphanumeric sequences) with ***
  return preview.replace(/([A-Za-z0-9_\-]{8,})/g, (match) => {
    // Keep short words and common tokens visible, redact long ones
    if (match.length >= 16) return '***REDACTED***'
    if (match.length >= 10) return match.slice(0, 3) + '***'
    return match
  })
}

export function SecretWarning({ hits, onCancel, onProceed }: SecretWarningProps) {
  return createPortal(
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 10000,
        backgroundColor: 'rgba(0,0,0,0.75)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '24px',
      }}
    >
      <div
        style={{
          backgroundColor: colors.bg.secondary,
          border: `1px solid ${colors.status.D}66`,
          borderRadius: '12px',
          width: '100%',
          maxWidth: '560px',
          maxHeight: '80vh',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: `0 0 0 1px ${colors.status.D}33, 0 24px 48px rgba(0,0,0,0.6)`,
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          style={{
            padding: '20px 24px 16px',
            borderBottom: `1px solid ${colors.border}`,
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
          }}
        >
          <span style={{ fontSize: '22px' }}>⚠️</span>
          <div>
            <div
              style={{
                fontSize: '15px',
                fontWeight: 700,
                color: colors.status.D,
              }}
            >
              Possible Secrets Detected
            </div>
            <div style={{ fontSize: '12px', color: colors.text.muted, marginTop: '2px' }}>
              {hits.length} {hits.length === 1 ? 'match' : 'matches'} found across{' '}
              {new Set(hits.map((h) => h.repoName)).size}{' '}
              {new Set(hits.map((h) => h.repoName)).size === 1 ? 'repo' : 'repos'}
            </div>
          </div>
        </div>

        {/* Hits list */}
        <div style={{ overflowY: 'auto', padding: '12px 24px', flex: 1 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {hits.map((hit, idx) => (
              <SecretHitRow key={idx} hit={hit} />
            ))}
          </div>
        </div>

        {/* Footer */}
        <div
          style={{
            padding: '16px 24px',
            borderTop: `1px solid ${colors.border}`,
            display: 'flex',
            justifyContent: 'flex-end',
            gap: '8px',
          }}
        >
          <ActionButton variant="secondary" onClick={onCancel}>
            Cancel
          </ActionButton>
          <ActionButton variant="danger" onClick={onProceed}>
            Push Anyway ⚠️
          </ActionButton>
        </div>
      </div>
    </div>,
    document.body
  )
}

function SecretHitRow({ hit }: { hit: SecretHit }) {
  return (
    <div
      style={{
        backgroundColor: colors.bg.tertiary,
        border: `1px solid ${colors.status.D}33`,
        borderRadius: '6px',
        padding: '10px 12px',
        display: 'flex',
        flexDirection: 'column',
        gap: '4px',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <span
          style={{
            fontSize: '11px',
            fontWeight: 600,
            color: colors.status.D,
            backgroundColor: `${colors.status.D}22`,
            border: `1px solid ${colors.status.D}44`,
            borderRadius: '4px',
            padding: '1px 6px',
          }}
        >
          {hit.pattern}
        </span>
        <span style={{ fontSize: '12px', color: colors.text.secondary }}>
          {hit.repoName}
        </span>
        <span style={{ fontSize: '11px', color: colors.text.muted }}>
          line {hit.line}
        </span>
      </div>
      <div
        style={{
          fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
          fontSize: '11px',
          color: colors.text.muted,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}
        title={hit.file}
      >
        {hit.file}
      </div>
      <div
        className="selectable"
        style={{
          fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
          fontSize: '11px',
          color: colors.status.M,
          backgroundColor: colors.bg.primary,
          borderRadius: '4px',
          padding: '4px 8px',
          marginTop: '2px',
          whiteSpace: 'pre',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
        }}
      >
        {redactPreview(hit.preview)}
      </div>
    </div>
  )
}

function ActionButton({
  variant,
  onClick,
  children,
}: {
  variant: 'secondary' | 'danger'
  onClick: () => void
  children: React.ReactNode
}) {
  const [hovered, setHovered] = React.useState(false)

  const bgColor = variant === 'danger'
    ? hovered ? '#da3633' : '#b91c1c'
    : hovered ? colors.bg.hover : colors.bg.tertiary

  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        height: '32px',
        padding: '0 16px',
        borderRadius: '6px',
        fontSize: '13px',
        fontWeight: 500,
        cursor: 'pointer',
        border: `1px solid ${variant === 'danger' ? colors.status.D : colors.border}`,
        backgroundColor: bgColor,
        color: variant === 'danger' ? '#fff' : colors.text.secondary,
        transition: 'background-color 0.1s',
        outline: 'none',
      }}
    >
      {children}
    </button>
  )
}
