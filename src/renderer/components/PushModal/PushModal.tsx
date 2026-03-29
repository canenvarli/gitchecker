import React, { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import type { PushJob, SecretHit } from '../../types'
import { ProgressLog } from '../ProgressLog/ProgressLog'
import { colors } from '../../theme/colors'

interface PushModalProps {
  jobs: PushJob[]
  isGenerating: boolean
  isPushing: boolean
  secretHits: SecretHit[]
  onConfirm: (jobs: PushJob[]) => void
  onCancel: () => void
  onEditMessage: (repoName: string, message: string) => void
}

export function PushModal({
  jobs,
  isGenerating,
  isPushing,
  secretHits,
  onConfirm,
  onCancel,
  onEditMessage,
}: PushModalProps) {
  // Close on Escape (only when not actively pushing)
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape' && !isPushing) onCancel()
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [isPushing, onCancel])

  const allDone = jobs.length > 0 && jobs.every((j) => j.status === 'done' || j.status === 'error')

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
      onClick={!isPushing ? onCancel : undefined}
    >
      <div
        style={{
          backgroundColor: colors.bg.secondary,
          border: `1px solid ${colors.border}`,
          borderRadius: '12px',
          width: '100%',
          maxWidth: '640px',
          maxHeight: '85vh',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 24px 64px rgba(0,0,0,0.7)',
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
            gap: '10px',
          }}
        >
          <span style={{ fontSize: '16px' }}>⚡</span>
          <div>
            <div style={{ fontSize: '15px', fontWeight: 700, color: colors.text.primary }}>
              {isPushing ? 'Pushing…' : allDone ? 'Push Complete' : 'Ready to Push'}
            </div>
            {!isPushing && !allDone && !isGenerating && jobs.length > 0 && (
              <div style={{ fontSize: '12px', color: colors.text.muted, marginTop: '2px' }}>
                Review commit messages before pushing {jobs.length}{' '}
                {jobs.length === 1 ? 'repo' : 'repos'}
              </div>
            )}
          </div>
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '16px 24px' }}>
          {isGenerating && (
            <GeneratingState />
          )}

          {!isGenerating && isPushing && (
            <ProgressLog jobs={jobs} />
          )}

          {!isGenerating && !isPushing && allDone && (
            <ProgressLog jobs={jobs} />
          )}

          {!isGenerating && !isPushing && !allDone && jobs.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {secretHits.length > 0 && (
                <SecretWarningInline count={secretHits.length} />
              )}
              {jobs.map((job) => (
                <JobEditRow
                  key={job.repo.rootPath}
                  job={job}
                  onEditMessage={onEditMessage}
                />
              ))}
            </div>
          )}
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
          {allDone ? (
            <ModalButton variant="primary" onClick={onCancel}>
              Close
            </ModalButton>
          ) : isPushing ? (
            <div style={{ fontSize: '12px', color: colors.text.muted, alignSelf: 'center' }}>
              Push in progress…
            </div>
          ) : (
            <>
              <ModalButton variant="secondary" onClick={onCancel} disabled={isGenerating}>
                Cancel
              </ModalButton>
              <ModalButton
                variant="primary"
                onClick={() => onConfirm(jobs)}
                disabled={isGenerating || jobs.length === 0}
              >
                Push All ⚡ {jobs.length} {jobs.length === 1 ? 'repo' : 'repos'}
              </ModalButton>
            </>
          )}
        </div>
      </div>
    </div>,
    document.body
  )
}

function GeneratingState() {
  const [frame, setFrame] = React.useState(0)
  const frames = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏']

  useEffect(() => {
    const t = setInterval(() => setFrame((f) => (f + 1) % frames.length), 80)
    return () => clearInterval(t)
  }, [frames.length])

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '40px 0',
        gap: '12px',
      }}
    >
      <span style={{ fontSize: '24px', color: colors.accent }}>{frames[frame]}</span>
      <div style={{ fontSize: '14px', color: colors.text.secondary }}>
        Claude is writing commit messages…
      </div>
      <div style={{ fontSize: '12px', color: colors.text.muted }}>
        Analyzing your changes
      </div>
    </div>
  )
}

function SecretWarningInline({ count }: { count: number }) {
  return (
    <div
      style={{
        backgroundColor: `${colors.status.D}11`,
        border: `1px solid ${colors.status.D}44`,
        borderRadius: '8px',
        padding: '10px 14px',
        display: 'flex',
        alignItems: 'center',
        gap: '10px',
      }}
    >
      <span style={{ fontSize: '16px' }}>⚠️</span>
      <div>
        <div style={{ fontSize: '13px', fontWeight: 600, color: colors.status.D }}>
          {count} possible {count === 1 ? 'secret' : 'secrets'} detected
        </div>
        <div style={{ fontSize: '11px', color: colors.text.muted, marginTop: '2px' }}>
          Review carefully before pushing — credentials may be exposed
        </div>
      </div>
    </div>
  )
}

interface JobEditRowProps {
  job: PushJob
  onEditMessage: (repoName: string, message: string) => void
}

function JobEditRow({ job, onEditMessage }: JobEditRowProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto'
      textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`
    }
  }, [job.commitMessage])

  const dirtyCount = job.repo.files.length
  const stagedCount = job.repo.files.filter((f) => f.staged).length

  return (
    <div
      style={{
        backgroundColor: colors.bg.tertiary,
        border: `1px solid ${colors.border}`,
        borderRadius: '8px',
        overflow: 'hidden',
      }}
    >
      {/* Repo header */}
      <div
        style={{
          padding: '10px 14px',
          backgroundColor: colors.bg.secondary,
          borderBottom: `1px solid ${colors.border}`,
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
        }}
      >
        <span
          style={{
            width: '8px',
            height: '8px',
            borderRadius: '50%',
            backgroundColor: colors.status.M,
            flexShrink: 0,
          }}
        />
        <span style={{ fontSize: '13px', fontWeight: 600, color: colors.text.primary }}>
          {job.repo.name}
        </span>
        <span
          style={{
            fontSize: '11px',
            color: colors.text.muted,
            fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
          }}
        >
          [{job.repo.branch}]
        </span>
        <div style={{ flex: 1 }} />
        <span style={{ fontSize: '11px', color: colors.text.muted }}>
          {dirtyCount} {dirtyCount === 1 ? 'file' : 'files'}
          {stagedCount > 0 && ` · ${stagedCount} staged`}
        </span>
      </div>

      {/* Commit message textarea */}
      <div style={{ padding: '10px 14px' }}>
        <textarea
          ref={textareaRef}
          className="selectable"
          value={job.commitMessage}
          onChange={(e) => onEditMessage(job.repo.name, e.target.value)}
          placeholder="Enter commit message…"
          style={{
            width: '100%',
            minHeight: '56px',
            resize: 'none',
            overflow: 'hidden',
            backgroundColor: colors.bg.primary,
            border: `1px solid ${colors.border}`,
            borderRadius: '6px',
            padding: '8px 10px',
            fontSize: '12px',
            fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
            color: colors.text.primary,
            lineHeight: '1.5',
            outline: 'none',
          }}
          onFocus={(e) => {
            e.target.style.borderColor = colors.accent
          }}
          onBlur={(e) => {
            e.target.style.borderColor = colors.border
          }}
        />
      </div>
    </div>
  )
}

interface ModalButtonProps {
  variant: 'primary' | 'secondary'
  onClick: () => void
  disabled?: boolean
  children: React.ReactNode
}

function ModalButton({ variant, onClick, disabled, children }: ModalButtonProps) {
  const [hovered, setHovered] = React.useState(false)

  const bgColor = variant === 'primary'
    ? disabled
      ? colors.bg.hover
      : hovered
      ? '#388bfd'
      : colors.accent
    : hovered
    ? colors.bg.hover
    : colors.bg.tertiary

  return (
    <button
      onClick={onClick}
      disabled={disabled}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        height: '34px',
        padding: '0 18px',
        borderRadius: '6px',
        fontSize: '13px',
        fontWeight: 500,
        cursor: disabled ? 'not-allowed' : 'pointer',
        border: `1px solid ${variant === 'primary' ? (disabled ? colors.border : colors.accent) : colors.border}`,
        backgroundColor: bgColor,
        color: variant === 'primary' ? (disabled ? colors.text.muted : '#fff') : colors.text.secondary,
        transition: 'background-color 0.1s',
        outline: 'none',
        opacity: disabled ? 0.6 : 1,
      }}
    >
      {children}
    </button>
  )
}
