import React, { useState, useCallback } from 'react'
import type { RepoStatus, DirtyFile } from '../../types'
import { StatusBadge } from '../StatusBadge/StatusBadge'
import { ContextMenu, ContextMenuItem } from './ContextMenu'
import { DiffViewer } from '../DiffViewer/DiffViewer'
import { colors } from '../../theme/colors'

interface FileListProps {
  repos: RepoStatus[]
  selectedRepo: string | null
  onSelectFile: (file: DirtyFile, repo: RepoStatus) => void
  selectedFilePath?: string
}

export function FileList({ repos, selectedRepo, onSelectFile, selectedFilePath }: FileListProps) {
  const visibleRepos = selectedRepo
    ? repos.filter((r) => r.rootPath === selectedRepo)
    : repos

  const dirtyRepos = visibleRepos.filter((r) => r.isDirty)

  if (dirtyRepos.length === 0) {
    return (
      <div
        style={{
          flex: 1,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexDirection: 'column',
          gap: '10px',
          color: colors.text.muted,
        }}
      >
        <span style={{ fontSize: '32px', opacity: 0.3 }}>◆</span>
        <div style={{ fontSize: '14px' }}>
          {selectedRepo ? 'No changes in this repo' : 'All repos are clean'}
        </div>
        <div style={{ fontSize: '12px', opacity: 0.6 }}>
          Watching for file changes…
        </div>
      </div>
    )
  }

  return (
    <div
      style={{
        flex: 1,
        overflowY: 'auto',
        padding: '12px',
        display: 'flex',
        flexDirection: 'column',
        gap: '16px',
      }}
    >
      {dirtyRepos.map((repo) => (
        <RepoSection key={repo.rootPath} repo={repo} onSelectFile={onSelectFile} selectedFilePath={selectedFilePath} />
      ))}
    </div>
  )
}

interface RepoSectionProps {
  repo: RepoStatus
  onSelectFile: (file: DirtyFile, repo: RepoStatus) => void
  selectedFilePath?: string
}

function RepoSection({ repo, onSelectFile, selectedFilePath }: RepoSectionProps) {
  const [collapsed, setCollapsed] = useState(false)

  return (
    <div>
      {/* Section header */}
      <div
        onClick={() => setCollapsed((c) => !c)}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          marginBottom: '4px',
          cursor: 'pointer',
          userSelect: 'none',
        }}
      >
        <span
          style={{
            fontSize: '10px',
            color: colors.text.muted,
            transform: collapsed ? 'rotate(-90deg)' : 'rotate(0deg)',
            transition: 'transform 0.15s',
            display: 'inline-block',
            lineHeight: 1,
          }}
        >
          ▾
        </span>
        <span
          style={{
            fontSize: '11px',
            fontWeight: 600,
            color: colors.text.secondary,
            textTransform: 'uppercase',
            letterSpacing: '0.05em',
          }}
        >
          {repo.name}
        </span>
        <span
          style={{
            fontSize: '11px',
            color: colors.text.muted,
            fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
          }}
        >
          [{repo.branch}]
        </span>
        <span
          style={{
            fontSize: '11px',
            color: colors.text.muted,
          }}
        >
          ({repo.files.length})
        </span>
        <div
          style={{
            flex: 1,
            height: '1px',
            backgroundColor: colors.border,
            marginLeft: '4px',
          }}
        />
      </div>

      {/* File rows */}
      {!collapsed && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1px' }}>
          {repo.files.map((file) => (
            <FileRow
              key={`${repo.rootPath}::${file.path}`}
              file={file}
              repo={repo}
              onSelectFile={onSelectFile}
              isSelected={file.path === selectedFilePath}
            />
          ))}
        </div>
      )}
    </div>
  )
}

interface FileRowProps {
  file: DirtyFile
  repo: RepoStatus
  onSelectFile: (file: DirtyFile, repo: RepoStatus) => void
  isSelected: boolean
}

const FileRow = React.memo(function FileRow({ file, repo, onSelectFile, isSelected }: FileRowProps) {
  const [hovered, setHovered] = useState(false)
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null)
  const [diffFile, setDiffFile] = useState<{ path: string; repoRoot: string } | null>(null)

  const handleClick = useCallback(() => {
    onSelectFile(file, repo)
  }, [file, repo, onSelectFile])

  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    setContextMenu({ x: e.clientX, y: e.clientY })
  }, [])

  const closeContextMenu = useCallback(() => setContextMenu(null), [])

  // Derive gitignore pattern options from the file path (no Node.js path module in renderer)
  const lastDot = file.path.lastIndexOf('.')
  const ext = lastDot > file.path.lastIndexOf('/') + 1 ? file.path.slice(lastDot + 1) : ''
  const lastSlash = file.path.lastIndexOf('/')
  const parentDir = lastSlash > 0 ? file.path.slice(0, lastSlash) : '.'

  const contextItems: ContextMenuItem[] = [
    {
      label: 'Open in Editor',
      action: () => window.gitchecker.openFile(file.path, repo.rootPath),
    },
    {
      label: 'Open in Finder',
      action: () => window.gitchecker.openInFinder(file.path, repo.rootPath),
    },
    {
      label: 'Copy Path',
      action: () => navigator.clipboard.writeText(`${repo.rootPath}/${file.path}`),
    },
    { label: '', action: () => {}, separator: true },
    file.staged
      ? {
          label: 'Unstage File',
          action: () => window.gitchecker.unstageFile(file.path, repo.rootPath),
        }
      : {
          label: 'Stage File',
          action: () => window.gitchecker.stageFile(file.path, repo.rootPath),
        },
    {
      label: 'View Diff',
      action: () => setDiffFile({ path: file.path, repoRoot: repo.rootPath }),
    },
    { label: '', action: () => {}, separator: true },
    {
      label: 'Ignore this file',
      action: () => window.gitchecker.addToGitignore(file.path, repo.rootPath),
    },
    ...(ext ? [{
      label: `Ignore *.${ext} files`,
      action: () => window.gitchecker.addToGitignore(`*.${ext}`, repo.rootPath),
    }] : []),
    ...(parentDir !== '.' ? [{
      label: `Ignore ${parentDir}/`,
      action: () => window.gitchecker.addToGitignore(`${parentDir}/`, repo.rootPath),
    }] : []),
    ...(file.status === '?' ? [
      { label: '', action: () => {}, separator: true },
      {
        label: 'Delete File',
        action: () => window.gitchecker.deleteFile(file.path, repo.rootPath),
        danger: true,
      },
    ] : []),
  ]

  return (
    <>
      <div
        onClick={handleClick}
        onContextMenu={handleContextMenu}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          padding: '4px 8px',
          borderRadius: '5px',
          cursor: 'pointer',
          backgroundColor: isSelected ? colors.accent + '22' : hovered ? colors.bg.tertiary : 'transparent',
          transition: 'background-color 0.1s',
        }}
      >
        <StatusBadge status={file.status} staged={file.staged} />

        <span
          className="selectable"
          title={`${repo.rootPath}/${file.path}`}
          style={{
            fontSize: '12px',
            fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
            color: file.staged ? colors.text.primary : colors.text.secondary,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            flex: 1,
          }}
        >
          {file.path}
        </span>

        {file.staged && (
          <span
            title="Staged"
            style={{
              fontSize: '10px',
              color: colors.status.A,
              backgroundColor: `${colors.status.A}22`,
              border: `1px solid ${colors.status.A}44`,
              borderRadius: '4px',
              padding: '0 4px',
              lineHeight: '14px',
              flexShrink: 0,
            }}
          >
            staged
          </span>
        )}
      </div>

      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          items={contextItems}
          onClose={closeContextMenu}
        />
      )}

      {diffFile && (
        <DiffViewer
          filePath={diffFile.path}
          repoRoot={diffFile.repoRoot}
          onClose={() => setDiffFile(null)}
        />
      )}
    </>
  )
})
