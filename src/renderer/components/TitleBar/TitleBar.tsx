import React from 'react'
import type { RepoStatus } from '../../types'
import { colors } from '../../theme/colors'

interface TitleBarProps {
  repos: RepoStatus[]
  selectedRepo: string | null
  onRefresh: () => void
  onPushAll: () => void
  onPushSelected: () => void
  onSettings: () => void
  isPushing: boolean
  isGenerating: boolean
}

export function TitleBar({ repos, selectedRepo, onRefresh, onPushAll, onPushSelected, onSettings, isPushing, isGenerating }: TitleBarProps) {
  const dirtyCount = repos.filter((r) => r.isDirty).length
  const canPush = dirtyCount > 0 && !isPushing && !isGenerating

  const selectedRepoObj = selectedRepo ? repos.find((r) => r.rootPath === selectedRepo) ?? null : null
  const canPushSelected = selectedRepoObj?.isDirty === true && !isPushing && !isGenerating

  return (
    <div
      className="drag-region"
      style={{
        height: '52px',
        backgroundColor: colors.bg.secondary,
        borderBottom: `1px solid ${colors.border}`,
        display: 'flex',
        alignItems: 'center',
        paddingLeft: '80px', // leave room for native traffic-light buttons
        paddingRight: '12px',
        flexShrink: 0,
      }}
    >
      {/* App identity */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          flex: 1,
        }}
      >
        <span
          style={{
            fontSize: '16px',
            color: colors.accent,
            lineHeight: 1,
          }}
        >
          ◆
        </span>
        <span
          style={{
            fontSize: '14px',
            fontWeight: 600,
            color: colors.text.primary,
            letterSpacing: '-0.01em',
          }}
        >
          GitChecker
        </span>

        {dirtyCount > 0 && (
          <span
            style={{
              fontSize: '11px',
              fontWeight: 600,
              color: colors.status.M,
              backgroundColor: `${colors.status.M}22`,
              border: `1px solid ${colors.status.M}44`,
              borderRadius: '10px',
              padding: '1px 7px',
              lineHeight: '16px',
            }}
          >
            {dirtyCount} dirty {dirtyCount === 1 ? 'repo' : 'repos'}
          </span>
        )}
      </div>

      {/* Actions — must opt out of drag region */}
      <div
        className="no-drag"
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
        }}
      >
        <TitleBarButton
          onClick={onSettings}
          title="Settings"
          disabled={isPushing}
        >
          ⚙ Settings
        </TitleBarButton>

        <TitleBarButton
          onClick={onRefresh}
          title="Refresh (⌘R)"
          disabled={isPushing}
        >
          ⟳ Refresh
        </TitleBarButton>

        {selectedRepoObj && (
          <TitleBarButton
            onClick={onPushSelected}
            title={canPushSelected ? `Push ${selectedRepoObj.name}` : `${selectedRepoObj.name} has no changes`}
            disabled={!canPushSelected}
            accent
          >
            {isGenerating ? (
              <span style={{ opacity: 0.6 }}>generating…</span>
            ) : isPushing ? (
              <span style={{ opacity: 0.6 }}>pushing…</span>
            ) : (
              <>⚡ Push {selectedRepoObj.name}</>
            )}
          </TitleBarButton>
        )}

        <TitleBarButton
          onClick={onPushAll}
          title={canPush ? `Push all dirty repos (${dirtyCount})` : 'No dirty repos to push'}
          disabled={!canPush}
          accent
        >
          {isGenerating ? (
            <span style={{ opacity: 0.6 }}>generating…</span>
          ) : isPushing ? (
            <span style={{ opacity: 0.6 }}>pushing…</span>
          ) : (
            <>⚡ Push All</>
          )}
        </TitleBarButton>
      </div>
    </div>
  )
}

interface TitleBarButtonProps {
  onClick: () => void
  title?: string
  disabled?: boolean
  accent?: boolean
  children: React.ReactNode
}

function TitleBarButton({ onClick, title, disabled, accent, children }: TitleBarButtonProps) {
  const [hovered, setHovered] = React.useState(false)

  const baseStyle: React.CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '4px',
    height: '30px',
    padding: '0 12px',
    borderRadius: '6px',
    fontSize: '13px',
    fontWeight: 500,
    cursor: disabled ? 'not-allowed' : 'pointer',
    border: `1px solid ${colors.border}`,
    transition: 'background-color 0.1s, opacity 0.1s',
    outline: 'none',
    whiteSpace: 'nowrap',
  }

  if (accent && !disabled) {
    return (
      <button
        onClick={onClick}
        title={title}
        disabled={disabled}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        style={{
          ...baseStyle,
          backgroundColor: hovered ? '#388bfd' : colors.accent,
          color: '#ffffff',
          border: `1px solid ${hovered ? '#388bfd' : colors.accent}`,
          opacity: disabled ? 0.4 : 1,
        }}
      >
        {children}
      </button>
    )
  }

  return (
    <button
      onClick={onClick}
      title={title}
      disabled={disabled}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        ...baseStyle,
        backgroundColor: hovered ? colors.bg.hover : colors.bg.tertiary,
        color: disabled ? colors.text.muted : colors.text.secondary,
        opacity: disabled ? 0.5 : 1,
      }}
    >
      {children}
    </button>
  )
}
