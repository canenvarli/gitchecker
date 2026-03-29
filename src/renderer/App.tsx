import { useState, useCallback, useEffect } from 'react'
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
import type { RepoStatus, SecretHit } from './types'
import { colors } from './theme/colors'

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

  // Which repo is focused in the sidebar (null = show all)
  const [selectedRepo, setSelectedRepo] = useState<string | null>(null)

  // Modal visibility
  const [showPushModal, setShowPushModal] = useState(false)
  const [showSettings, setShowSettings] = useState(false)

  // Secret detection
  const [secretHits, setSecretHits] = useState<SecretHit[]>([])
  const [showSecretWarning, setShowSecretWarning] = useState(false)
  const [pendingPushJobs, setPendingPushJobs] = useState<typeof jobs>([])

  // Conflict counter — increments per push session that had conflicts
  const [conflictCount, setConflictCount] = useState(0)

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

  // Track conflicts from completed push jobs
  useEffect(() => {
    if (!isPushing && jobs.length > 0) {
      const conflicts = jobs.filter((j) => j.status === 'conflict').length
      if (conflicts > 0) {
        setConflictCount((c) => c + conflicts)
      }
    }
  }, [isPushing, jobs])

  // Keyboard shortcut: Cmd+R to refresh
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.metaKey && e.key === 'r') {
        e.preventDefault()
        refresh()
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [refresh])

  const handlePushAll = useCallback(async () => {
    const dirty = repos.filter((r: RepoStatus) => r.isDirty)
    if (dirty.length === 0) return

    setShowPushModal(true)
    await initiatePush(dirty)
  }, [repos, initiatePush])

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
        onRefresh={refresh}
        onPushAll={handlePushAll}
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
        />

        {/* File list */}
        <FileList
          repos={repos}
          selectedRepo={selectedRepo}
        />
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
    </div>
  )
}
