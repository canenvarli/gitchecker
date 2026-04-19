import { useState, useCallback, useEffect, useRef } from 'react'
import { TitleBar } from './components/TitleBar/TitleBar'
import { RepoList } from './components/RepoList/RepoList'
import { FileList } from './components/FileList/FileList'
import { PushModal } from './components/PushModal/PushModal'
import { SettingsModal } from './components/Settings/SettingsModal'
import { SecretWarning } from './components/SecretWarning/SecretWarning'
import { StatusBar } from './components/StatusBar/StatusBar'
import { useRepos } from './hooks/useRepos'
import { usePush } from './hooks/usePush'
import { useConfig } from './hooks/useConfig'
import { useToast } from './hooks/useToast'
import type { RepoStatus, SecretHit, SelectedFile, DirtyFile } from './types'
import { colors } from './theme/colors'
import { FileViewer } from './components/FileViewer/FileViewer'
import { ToastContainer } from './components/Toast/Toast'
import { ClaudeNotFoundModal } from './components/ClaudeNotFound/ClaudeNotFound'

export default function App() {
  const { repos, refresh, lastScan } = useRepos()
  const { config, updateConfig } = useConfig()
  const {
    jobs,
    isPushing,
    isGenerating,
    initiatePush,
    confirmPush,
    cancelPush,
    updateJobMessage,
  } = usePush()
  const { toasts, showToast, dismissToast } = useToast()

  // Which repo is focused in the sidebar (null = show all)
  const [selectedRepo, setSelectedRepo] = useState<string | null>(null)

  // Inline file viewer
  const [selectedFile, setSelectedFile] = useState<SelectedFile | null>(null)
  const [viewerHeight, setViewerHeight] = useState(300)
  const isDragging = useRef(false)
  const dragStartY = useRef(0)
  const dragStartHeightRef = useRef(0)

  // Modal visibility
  const [showPushModal, setShowPushModal] = useState(false)
  const [showSettings, setShowSettings] = useState(false)

  // Secret detection
  const [secretHits, setSecretHits] = useState<SecretHit[]>([])
  const [showSecretWarning, setShowSecretWarning] = useState(false)
  const [pendingPushJobs, setPendingPushJobs] = useState<typeof jobs>([])

  // Conflict counter — increments per push session that had conflicts
  const [conflictCount, setConflictCount] = useState(0)

  // Claude not-found popup
  const [showClaudeNotFound, setShowClaudeNotFound] = useState(false)

  // Listen for secrets found events from IPC
  useEffect(() => {
    const unsub = window.gitchecker.onSecretsFound((hits) => {
      if (hits.length > 0) {
        setSecretHits(hits)
        setShowSecretWarning(true)
      }
    })
    return unsub
  }, [])

  // Listen for claude-not-found events from IPC
  useEffect(() => {
    const unsub = window.gitchecker.onClaudeNotFound(() => {
      setShowClaudeNotFound(true)
    })
    return unsub
  }, [])

  // Track conflicts from completed push jobs
  useEffect(() => {
    if (!isPushing && jobs.length > 0) {
      const conflicts = jobs.filter((j) => j.status === 'conflict').length
      if (conflicts > 0) {
        setConflictCount((c) => c + conflicts)
      }
    }
  }, [isPushing, jobs])

  // Keyboard shortcut: Cmd+R to refresh, Escape to close file viewer
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.metaKey && e.key === 'r') {
        e.preventDefault()
        refresh()
      } else if (e.key === 'Escape' && selectedFile) {
        setSelectedFile(null)
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [refresh, selectedFile])

  // Global unhandled promise rejection handler — surfaces IPC errors as toasts
  useEffect(() => {
    function handleUnhandled(e: PromiseRejectionEvent) {
      showToast(`Error: ${e.reason?.message ?? String(e.reason)}`)
    }
    window.addEventListener('unhandledrejection', handleUnhandled)
    return () => window.removeEventListener('unhandledrejection', handleUnhandled)
  }, [showToast])

  const handlePushAll = useCallback(async () => {
    const dirty = repos.filter((r: RepoStatus) => r.isDirty)
    if (dirty.length === 0) return

    setShowPushModal(true)
    await initiatePush(dirty)
  }, [repos, initiatePush])

  const handlePushSelected = useCallback(async () => {
    const repo = repos.find((r: RepoStatus) => r.rootPath === selectedRepo)
    if (!repo?.isDirty) return

    setShowPushModal(true)
    await initiatePush([repo])
  }, [repos, selectedRepo, initiatePush])

  const handleConfirmPush = useCallback(
    async (currentJobs: typeof jobs) => {
      // Scan for secrets before pushing
      const dirtyRepos = currentJobs.map((j) => j.repo)
      const hits = await window.gitchecker.scanSecrets(dirtyRepos)

      if (hits.length > 0) {
        setSecretHits(hits)
        setPendingPushJobs(currentJobs)
        setShowSecretWarning(true)
        return
      }

      confirmPush(currentJobs)
    },
    [confirmPush]
  )

  const handleSecretProceed = useCallback(() => {
    setShowSecretWarning(false)
    setSecretHits([])
    if (pendingPushJobs.length > 0) {
      confirmPush(pendingPushJobs)
      setPendingPushJobs([])
    }
  }, [confirmPush, pendingPushJobs])

  const handleSecretCancel = useCallback(() => {
    setShowSecretWarning(false)
    setSecretHits([])
    setPendingPushJobs([])
  }, [])

  const handleDividerMouseDown = useCallback((e: React.MouseEvent) => {
    isDragging.current = true
    dragStartY.current = e.clientY
    dragStartHeightRef.current = viewerHeight
    document.body.style.userSelect = 'none'
    document.body.style.cursor = 'row-resize'

    function onMove(ev: MouseEvent) {
      if (!isDragging.current) return
      const delta = dragStartY.current - ev.clientY
      setViewerHeight(Math.max(100, Math.min(600, dragStartHeightRef.current + delta)))
    }
    function onUp() {
      isDragging.current = false
      document.body.style.userSelect = ''
      document.body.style.cursor = ''
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
    }
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
  }, [viewerHeight])

  const handleSelectFile = useCallback((file: DirtyFile, repo: RepoStatus) => {
    setSelectedFile({
      path: file.path,
      repoRoot: repo.rootPath,
      repoName: repo.name,
      status: file.status,
    })
  }, [])

  const handleCancelPush = useCallback(() => {
    cancelPush()
    setShowPushModal(false)
  }, [cancelPush])

  const showModal = showPushModal && (isGenerating || jobs.length > 0)

  return (
    <div
      style={{
        width: '100vw',
        height: '100vh',
        backgroundColor: colors.bg.primary,
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
      }}
    >
      {/* Title bar */}
      <TitleBar
        repos={repos}
        selectedRepo={selectedRepo}
        onRefresh={refresh}
        onPushAll={handlePushAll}
        onPushSelected={handlePushSelected}
        onSettings={() => setShowSettings(true)}
        isPushing={isPushing}
        isGenerating={isGenerating}
      />

      {/* Main content */}
      <div
        style={{
          flex: 1,
          display: 'flex',
          overflow: 'hidden',
        }}
      >
        {/* Sidebar */}
        <RepoList
          repos={repos}
          selectedRepo={selectedRepo}
          onSelect={setSelectedRepo}
          onAddRoot={async (paths) => {
            try {
              const current = await window.gitchecker.getConfig()
              const merged = [...new Set([...current.watchRoots, ...paths])]
              await window.gitchecker.setConfig({ watchRoots: merged })
            } catch (err) {
              showToast(`Error adding root: ${err instanceof Error ? err.message : String(err)}`)
            }
          }}
        />

        {/* Right column: file list + optional viewer */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <div style={{ flex: 1, overflow: 'hidden', minHeight: 0 }}>
            <FileList
              repos={repos}
              selectedRepo={selectedRepo}
              onSelectFile={handleSelectFile}
              selectedFilePath={selectedFile?.path}
            />
          </div>

          {selectedFile && (
            <>
              {/* Draggable divider */}
              <div
                onMouseDown={handleDividerMouseDown}
                style={{
                  height: '5px',
                  cursor: 'row-resize',
                  backgroundColor: colors.border,
                  flexShrink: 0,
                  transition: 'background-color 0.1s',
                }}
                onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = colors.accent + '88')}
                onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = colors.border)}
              />
              <FileViewer
                selected={selectedFile}
                height={viewerHeight}
                onClose={() => setSelectedFile(null)}
              />
            </>
          )}
        </div>
      </div>

      {/* Status bar */}
      <StatusBar
        config={config}
        lastScan={lastScan}
        conflictCount={conflictCount}
      />

      {/* Push modal overlay */}
      {showModal && (
        <PushModal
          jobs={jobs}
          isGenerating={isGenerating}
          isPushing={isPushing}
          secretHits={secretHits}
          onConfirm={handleConfirmPush}
          onCancel={handleCancelPush}
          onEditMessage={updateJobMessage}
        />
      )}

      {/* Settings modal */}
      {showSettings && config && (
        <SettingsModal
          config={config}
          onUpdate={updateConfig}
          onClose={() => setShowSettings(false)}
        />
      )}

      {/* Secret warning overlay */}
      {showSecretWarning && secretHits.length > 0 && (
        <SecretWarning
          hits={secretHits}
          onCancel={handleSecretCancel}
          onProceed={handleSecretProceed}
        />
      )}

      {/* Claude not-found popup */}
      {showClaudeNotFound && (
        <ClaudeNotFoundModal
          onSave={async (binaryPath) => {
            await updateConfig({ claudeBinaryPath: binaryPath })
            setShowClaudeNotFound(false)
            showToast('Claude path saved. Retry your push to use AI commit messages.')
          }}
          onDismiss={() => setShowClaudeNotFound(false)}
        />
      )}

      {/* Toast notifications */}
      <ToastContainer toasts={toasts} onDismiss={dismissToast} />
    </div>
  )
}
