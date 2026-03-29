import React, { useEffect, useRef } from 'react'
import type { PushJob, PushStatus } from '../../types'
import { colors } from '../../theme/colors'

interface ProgressLogProps {
  jobs: PushJob[]
}

export function ProgressLog({ jobs }: ProgressLogProps) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
      {jobs.map((job) => (
        <JobProgressRow key={job.repo.rootPath} job={job} />
      ))}
    </div>
  )
}

function JobProgressRow({ job }: { job: PushJob }) {
  const logRef = useRef<HTMLDivElement>(null)

  // Auto-scroll log to bottom when new lines come in
  useEffect(() => {
    if (logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight
    }
  }, [job.log.length])

  return (
    <div
      style={{
        backgroundColor: colors.bg.tertiary,
        border: `1px solid ${getBorderColor(job.status)}`,
        borderRadius: '8px',
        overflow: 'hidden',
      }}
    >
      {/* Header row */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '10px',
          padding: '10px 14px',
          backgroundColor: colors.bg.secondary,
          borderBottom: job.log.length > 0 ? `1px solid ${colors.border}` : 'none',
        }}
      >
        <StatusIcon status={job.status} />

        <span
          style={{
            fontSize: '13px',
            fontWeight: 600,
            color: colors.text.primary,
          }}
        >
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

        <StatusLabel status={job.status} error={job.error} />
      </div>

      {/* Log lines */}
      {job.log.length > 0 && (
        <div
          ref={logRef}
          style={{
            maxHeight: '100px',
            overflowY: 'auto',
            padding: '8px 14px',
          }}
        >
          {job.log.map((line, idx) => (
            <div
              key={idx}
              style={{
                fontSize: '11px',
                fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
                color: colors.text.muted,
                lineHeight: '18px',
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-all',
              }}
            >
              {line}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function getBorderColor(status: PushStatus): string {
  switch (status) {
    case 'done': return `${colors.status.A}66`
    case 'error': return `${colors.status.D}66`
    case 'conflict': return `${colors.status.C}66`
    default: return colors.border
  }
}

function StatusIcon({ status }: { status: PushStatus }) {
  const style: React.CSSProperties = {
    fontSize: '14px',
    lineHeight: 1,
    flexShrink: 0,
  }

  switch (status) {
    case 'done':
      return <span style={{ ...style, color: colors.status.A }}>✓</span>
    case 'error':
      return <span style={{ ...style, color: colors.status.D }}>✕</span>
    case 'conflict':
      return <span style={{ ...style, color: colors.status.C }}>⚡</span>
    case 'pending':
      return <span style={{ ...style, color: colors.text.muted }}>○</span>
    default:
      // Spinning dots for in-progress states
      return <SpinnerIcon />
  }
}

function SpinnerIcon() {
  const [frame, setFrame] = React.useState(0)
  const frames = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏']

  useEffect(() => {
    const t = setInterval(() => setFrame((f) => (f + 1) % frames.length), 80)
    return () => clearInterval(t)
  }, [frames.length])

  return (
    <span
      style={{
        fontSize: '14px',
        color: colors.accent,
        lineHeight: 1,
        flexShrink: 0,
      }}
    >
      {frames[frame]}
    </span>
  )
}

function StatusLabel({ status, error }: { status: PushStatus; error?: string }) {
  const labelMap: Record<PushStatus, string> = {
    pending: 'Pending',
    pulling: 'Pulling…',
    staging: 'Staging…',
    committing: 'Committing…',
    pushing: 'Pushing…',
    done: 'Done',
    error: error ?? 'Error',
    conflict: 'Conflict auto-resolved',
  }

  const colorMap: Record<PushStatus, string> = {
    pending: colors.text.muted,
    pulling: colors.accent,
    staging: colors.accent,
    committing: colors.accent,
    pushing: colors.accent,
    done: colors.status.A,
    error: colors.status.D,
    conflict: colors.status.C,
  }

  return (
    <span
      style={{
        fontSize: '12px',
        color: colorMap[status],
        fontWeight: 500,
      }}
    >
      {labelMap[status]}
    </span>
  )
}
