import React, { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import type { Config } from '../../types'
import { colors } from '../../theme/colors'

interface SettingsModalProps {
  config: Config
  onUpdate: (partial: Partial<Config>) => void
  onClose: () => void
}

type Tab = 'roots' | 'ignored' | 'patterns'

export function SettingsModal({ config, onUpdate, onClose }: SettingsModalProps) {
  const [activeTab, setActiveTab] = useState<Tab>('roots')

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [onClose])

  return createPortal(
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 1000,
        backgroundColor: 'rgba(0,0,0,0.7)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '24px',
      }}
      onClick={onClose}
    >
      <div
        style={{
          backgroundColor: colors.bg.secondary,
          border: `1px solid ${colors.border}`,
          borderRadius: '12px',
          width: '100%',
          maxWidth: '560px',
          maxHeight: '80vh',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 24px 64px rgba(0,0,0,0.7)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          style={{
            padding: '18px 24px 0',
            borderBottom: `1px solid ${colors.border}`,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', marginBottom: '16px' }}>
            <div style={{ fontSize: '15px', fontWeight: 700, color: colors.text.primary, flex: 1 }}>
              ⚙ Settings
            </div>
            <button
              onClick={onClose}
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

          {/* Tabs */}
          <div style={{ display: 'flex', gap: '0' }}>
            {(['roots', 'ignored', 'patterns'] as Tab[]).map((tab) => (
              <TabButton
                key={tab}
                label={tab === 'roots' ? 'Watch Roots' : tab === 'ignored' ? 'Ignored Repos' : 'Ignore Patterns'}
                active={activeTab === tab}
                onClick={() => setActiveTab(tab)}
              />
            ))}
          </div>
        </div>

        {/* Tab body */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '16px 24px' }}>
          {activeTab === 'roots' && (
            <WatchRootsTab
              roots={config.watchRoots}
              onUpdate={(watchRoots) => onUpdate({ watchRoots })}
            />
          )}
          {activeTab === 'ignored' && (
            <IgnoredReposTab
              ignored={config.ignoredRepos}
              onUpdate={(ignoredRepos) => onUpdate({ ignoredRepos })}
            />
          )}
          {activeTab === 'patterns' && (
            <IgnorePatternsTab
              patterns={config.ignorePatterns}
              onUpdate={(ignorePatterns) => onUpdate({ ignorePatterns })}
            />
          )}
        </div>

        {/* Footer */}
        <div
          style={{
            padding: '14px 24px',
            borderTop: `1px solid ${colors.border}`,
            display: 'flex',
            justifyContent: 'flex-end',
          }}
        >
          <SettingsButton variant="primary" onClick={onClose}>
            Done
          </SettingsButton>
        </div>
      </div>
    </div>,
    document.body
  )
}

function TabButton({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: '6px 14px',
        fontSize: '12px',
        fontWeight: active ? 600 : 400,
        color: active ? colors.text.primary : colors.text.muted,
        background: 'none',
        border: 'none',
        borderBottom: `2px solid ${active ? colors.accent : 'transparent'}`,
        cursor: 'pointer',
        marginBottom: '-1px',
        transition: 'color 0.1s, border-color 0.1s',
        outline: 'none',
      }}
    >
      {label}
    </button>
  )
}

// Watch Roots Tab
function WatchRootsTab({ roots, onUpdate }: { roots: string[]; onUpdate: (r: string[]) => void }) {
  const [newRoot, setNewRoot] = useState('')
  const [adding, setAdding] = useState(false)

  function addRoot() {
    const trimmed = newRoot.trim()
    if (trimmed && !roots.includes(trimmed)) {
      onUpdate([...roots, trimmed])
    }
    setNewRoot('')
    setAdding(false)
  }

  function removeRoot(path: string) {
    onUpdate(roots.filter((r) => r !== path))
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
      <SectionDescription>
        Directories to scan for git repositories. GitChecker will watch all repos found in these roots.
      </SectionDescription>

      {roots.length === 0 && (
        <EmptyState>No watch roots configured</EmptyState>
      )}

      {roots.map((root) => (
        <PathRow key={root} path={root} onRemove={() => removeRoot(root)} />
      ))}

      {adding ? (
        <div style={{ display: 'flex', gap: '6px' }}>
          <input
            autoFocus
            value={newRoot}
            onChange={(e) => setNewRoot(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') addRoot()
              if (e.key === 'Escape') { setAdding(false); setNewRoot('') }
            }}
            placeholder="/Users/you/projects"
            className="selectable"
            style={inputStyle}
          />
          <SettingsButton variant="primary" onClick={addRoot}>Add</SettingsButton>
          <SettingsButton variant="secondary" onClick={() => { setAdding(false); setNewRoot('') }}>Cancel</SettingsButton>
        </div>
      ) : (
        <AddButton onClick={() => setAdding(true)}>+ Add Root</AddButton>
      )}
    </div>
  )
}

// Ignored Repos Tab
function IgnoredReposTab({ ignored, onUpdate }: { ignored: string[]; onUpdate: (r: string[]) => void }) {
  const [newPath, setNewPath] = useState('')
  const [adding, setAdding] = useState(false)

  function addIgnored() {
    const trimmed = newPath.trim()
    if (trimmed && !ignored.includes(trimmed)) {
      onUpdate([...ignored, trimmed])
    }
    setNewPath('')
    setAdding(false)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
      <SectionDescription>
        Absolute paths to repos that should be excluded from scanning.
      </SectionDescription>

      {ignored.length === 0 && (
        <EmptyState>No ignored repos</EmptyState>
      )}

      {ignored.map((path) => (
        <PathRow key={path} path={path} onRemove={() => onUpdate(ignored.filter((p) => p !== path))} />
      ))}

      {adding ? (
        <div style={{ display: 'flex', gap: '6px' }}>
          <input
            autoFocus
            value={newPath}
            onChange={(e) => setNewPath(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') addIgnored()
              if (e.key === 'Escape') { setAdding(false); setNewPath('') }
            }}
            placeholder="/Users/you/projects/some-repo"
            className="selectable"
            style={inputStyle}
          />
          <SettingsButton variant="primary" onClick={addIgnored}>Add</SettingsButton>
          <SettingsButton variant="secondary" onClick={() => { setAdding(false); setNewPath('') }}>Cancel</SettingsButton>
        </div>
      ) : (
        <AddButton onClick={() => setAdding(true)}>+ Add Ignored Repo</AddButton>
      )}
    </div>
  )
}

// Ignore Patterns Tab
function IgnorePatternsTab({ patterns, onUpdate }: { patterns: string[]; onUpdate: (p: string[]) => void }) {
  const [newPattern, setNewPattern] = useState('')
  const [adding, setAdding] = useState(false)
  const [editing, setEditing] = useState<{ idx: number; value: string } | null>(null)

  function addPattern() {
    const trimmed = newPattern.trim()
    if (trimmed && !patterns.includes(trimmed)) {
      onUpdate([...patterns, trimmed])
    }
    setNewPattern('')
    setAdding(false)
  }

  function saveEdit() {
    if (!editing) return
    const trimmed = editing.value.trim()
    if (trimmed) {
      const updated = [...patterns]
      updated[editing.idx] = trimmed
      onUpdate(updated)
    }
    setEditing(null)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
      <SectionDescription>
        Glob patterns for files to ignore. E.g. <code style={{ fontFamily: 'monospace', fontSize: '11px', color: colors.accent }}>*.lock</code>, <code style={{ fontFamily: 'monospace', fontSize: '11px', color: colors.accent }}>node_modules/**</code>
      </SectionDescription>

      {patterns.length === 0 && (
        <EmptyState>No ignore patterns</EmptyState>
      )}

      {patterns.map((pattern, idx) => (
        editing?.idx === idx ? (
          <div key={idx} style={{ display: 'flex', gap: '6px' }}>
            <input
              autoFocus
              value={editing.value}
              onChange={(e) => setEditing({ idx, value: e.target.value })}
              onKeyDown={(e) => {
                if (e.key === 'Enter') saveEdit()
                if (e.key === 'Escape') setEditing(null)
              }}
              className="selectable"
              style={inputStyle}
            />
            <SettingsButton variant="primary" onClick={saveEdit}>Save</SettingsButton>
            <SettingsButton variant="secondary" onClick={() => setEditing(null)}>Cancel</SettingsButton>
          </div>
        ) : (
          <PatternRow
            key={idx}
            pattern={pattern}
            onEdit={() => setEditing({ idx, value: pattern })}
            onRemove={() => onUpdate(patterns.filter((_, i) => i !== idx))}
          />
        )
      ))}

      {adding ? (
        <div style={{ display: 'flex', gap: '6px' }}>
          <input
            autoFocus
            value={newPattern}
            onChange={(e) => setNewPattern(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') addPattern()
              if (e.key === 'Escape') { setAdding(false); setNewPattern('') }
            }}
            placeholder="e.g. *.lock or dist/**"
            className="selectable"
            style={inputStyle}
          />
          <SettingsButton variant="primary" onClick={addPattern}>Add</SettingsButton>
          <SettingsButton variant="secondary" onClick={() => { setAdding(false); setNewPattern('') }}>Cancel</SettingsButton>
        </div>
      ) : (
        <AddButton onClick={() => setAdding(true)}>+ Add Pattern</AddButton>
      )}
    </div>
  )
}

// Shared sub-components

function PathRow({ path, onRemove }: { path: string; onRemove: () => void }) {
  const [hovered, setHovered] = React.useState(false)
  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        padding: '7px 10px',
        backgroundColor: hovered ? colors.bg.tertiary : colors.bg.primary,
        border: `1px solid ${colors.border}`,
        borderRadius: '6px',
        transition: 'background-color 0.1s',
      }}
    >
      <span
        className="selectable"
        style={{
          flex: 1,
          fontSize: '12px',
          fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
          color: colors.text.secondary,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}
        title={path}
      >
        {path}
      </span>
      <SmallButton onClick={onRemove} danger>Remove</SmallButton>
    </div>
  )
}

function PatternRow({
  pattern,
  onEdit,
  onRemove,
}: {
  pattern: string
  onEdit: () => void
  onRemove: () => void
}) {
  const [hovered, setHovered] = React.useState(false)
  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        padding: '7px 10px',
        backgroundColor: hovered ? colors.bg.tertiary : colors.bg.primary,
        border: `1px solid ${colors.border}`,
        borderRadius: '6px',
        transition: 'background-color 0.1s',
      }}
    >
      <code
        style={{
          flex: 1,
          fontSize: '12px',
          fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
          color: colors.accent,
        }}
      >
        {pattern}
      </code>
      <SmallButton onClick={onEdit}>Edit</SmallButton>
      <SmallButton onClick={onRemove} danger>Remove</SmallButton>
    </div>
  )
}

function SmallButton({
  onClick,
  danger,
  children,
}: {
  onClick: () => void
  danger?: boolean
  children: React.ReactNode
}) {
  const [hovered, setHovered] = React.useState(false)
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        height: '22px',
        padding: '0 8px',
        fontSize: '11px',
        fontWeight: 500,
        cursor: 'pointer',
        border: `1px solid ${danger ? colors.status.D + '66' : colors.border}`,
        borderRadius: '4px',
        backgroundColor: hovered
          ? danger
            ? `${colors.status.D}22`
            : colors.bg.hover
          : 'transparent',
        color: danger ? colors.status.D : colors.text.muted,
        transition: 'background-color 0.1s',
        outline: 'none',
        flexShrink: 0,
      }}
    >
      {children}
    </button>
  )
}

function AddButton({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  const [hovered, setHovered] = React.useState(false)
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        height: '32px',
        padding: '0 12px',
        fontSize: '12px',
        fontWeight: 500,
        cursor: 'pointer',
        border: `1px dashed ${hovered ? colors.border : colors.bg.hover}`,
        borderRadius: '6px',
        backgroundColor: 'transparent',
        color: hovered ? colors.text.secondary : colors.text.muted,
        transition: 'all 0.1s',
        outline: 'none',
        alignSelf: 'flex-start',
      }}
    >
      {children}
    </button>
  )
}

function SectionDescription({ children }: { children: React.ReactNode }) {
  return (
    <p style={{ fontSize: '12px', color: colors.text.muted, lineHeight: '1.5', marginBottom: '4px' }}>
      {children}
    </p>
  )
}

function EmptyState({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        padding: '16px',
        textAlign: 'center',
        fontSize: '12px',
        color: colors.text.muted,
        border: `1px dashed ${colors.border}`,
        borderRadius: '6px',
      }}
    >
      {children}
    </div>
  )
}

const inputStyle: React.CSSProperties = {
  flex: 1,
  height: '32px',
  padding: '0 10px',
  fontSize: '12px',
  fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
  backgroundColor: colors.bg.primary,
  border: `1px solid ${colors.border}`,
  borderRadius: '6px',
  color: colors.text.primary,
  outline: 'none',
}

function SettingsButton({
  variant,
  onClick,
  children,
}: {
  variant: 'primary' | 'secondary'
  onClick: () => void
  children: React.ReactNode
}) {
  const [hovered, setHovered] = React.useState(false)

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
        border: `1px solid ${variant === 'primary' ? colors.accent : colors.border}`,
        backgroundColor:
          variant === 'primary'
            ? hovered ? '#388bfd' : colors.accent
            : hovered ? colors.bg.hover : colors.bg.tertiary,
        color: variant === 'primary' ? '#fff' : colors.text.secondary,
        transition: 'background-color 0.1s',
        outline: 'none',
        whiteSpace: 'nowrap',
      }}
    >
      {children}
    </button>
  )
}
