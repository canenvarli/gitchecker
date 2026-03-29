import React from 'react'
import type { RepoStatus } from '../../types'
import { colors } from '../../theme/colors'

interface RepoListProps {
  repos: RepoStatus[]
  selectedRepo: string | null
  onSelect: (rootPath: string | null) => void
}

export function RepoList({ repos, selectedRepo, onSelect }: RepoListProps) {
  return (
    <div
      style={{
        width: '200px',
        minWidth: '200px',
        backgroundColor: colors.bg.secondary,
        borderRight: `1px solid ${colors.border}`,
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
      }}
    >
      {/* Section header */}
      <div
        style={{
          padding: '10px 12px 6px',
          fontSize: '10px',
          fontWeight: 700,
          letterSpacing: '0.08em',
          color: colors.text.muted,
          textTransform: 'uppercase',
          cursor: selectedRepo ? 'pointer' : 'default',
          userSelect: 'none',
        }}
        onClick={() => onSelect(null)}
        title="Show all repos"
      >
        REPOS
      </div>

      {/* Repo rows */}
      <div style={{ flex: 1, overflowY: 'auto' }}>
        {repos.length === 0 ? (
          <div
            style={{
              padding: '12px',
              fontSize: '12px',
              color: colors.text.muted,
              textAlign: 'center',
            }}
          >
            No repos found
          </div>
        ) : (
          repos.map((repo) => (
            <RepoRow
              key={repo.rootPath}
              repo={repo}
              selected={selectedRepo === repo.rootPath}
              onSelect={onSelect}
            />
          ))
        )}
      </div>

      {/* Add Root button */}
      <div
        style={{
          borderTop: `1px solid ${colors.border}`,
          padding: '8px',
        }}
      >
        <AddRootButton />
      </div>
    </div>
  )
}

interface RepoRowProps {
  repo: RepoStatus
  selected: boolean
  onSelect: (rootPath: string | null) => void
}

const RepoRow = React.memo(function RepoRow({ repo, selected, onSelect }: RepoRowProps) {
  const [hovered, setHovered] = React.useState(false)

  const dirtyColor = colors.status.M
  const cleanColor = colors.text.muted

  return (
    <div
      onClick={() => onSelect(selected ? null : repo.rootPath)}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      title={repo.rootPath}
      style={{
        padding: '6px 12px',
        cursor: 'pointer',
        backgroundColor: selected
          ? colors.bg.hover
          : hovered
          ? `${colors.bg.hover}88`
          : 'transparent',
        borderLeft: `2px solid ${selected ? colors.accent : 'transparent'}`,
        display: 'flex',
        flexDirection: 'column',
        gap: '2px',
        transition: 'background-color 0.1s',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
        {/* Dirty indicator dot */}
        <span
          style={{
            width: '7px',
            height: '7px',
            borderRadius: '50%',
            backgroundColor: repo.isDirty ? dirtyColor : cleanColor,
            opacity: repo.isDirty ? 1 : 0.4,
            flexShrink: 0,
          }}
        />

        {/* Repo name */}
        <span
          style={{
            fontSize: '13px',
            fontWeight: repo.isDirty ? 500 : 400,
            color: repo.isDirty ? colors.text.primary : colors.text.secondary,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            flex: 1,
          }}
        >
          {repo.name}
        </span>

        {/* File count badge */}
        {repo.isDirty && (
          <span
            style={{
              fontSize: '10px',
              fontWeight: 600,
              color: dirtyColor,
              backgroundColor: `${dirtyColor}22`,
              borderRadius: '8px',
              padding: '0 5px',
              lineHeight: '16px',
              flexShrink: 0,
            }}
          >
            {repo.files.length}
          </span>
        )}
      </div>

      {/* Branch */}
      <div
        style={{
          marginLeft: '13px',
          fontSize: '11px',
          color: colors.text.muted,
          fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}
      >
        [{repo.branch}]
      </div>
    </div>
  )
})

function AddRootButton() {
  const [hovered, setHovered] = React.useState(false)
  return (
    <button
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onClick={() => {
        // TODO: open directory picker dialog via IPC
      }}
      style={{
        width: '100%',
        height: '28px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '5px',
        fontSize: '12px',
        color: hovered ? colors.text.secondary : colors.text.muted,
        backgroundColor: hovered ? colors.bg.hover : 'transparent',
        border: `1px dashed ${hovered ? colors.border : colors.bg.hover}`,
        borderRadius: '6px',
        cursor: 'pointer',
        transition: 'all 0.1s',
      }}
    >
      + Add Root
    </button>
  )
}
