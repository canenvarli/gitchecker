import { useState, useCallback, useRef } from 'react'
import type { RepoStatus, PushJob, PushProgressEvent } from '../types'

export interface UsePushReturn {
  jobs: PushJob[]
  isPushing: boolean
  isGenerating: boolean
  initiatePush: (repos: RepoStatus[]) => Promise<void>
  confirmPush: (jobs: PushJob[]) => void
  cancelPush: () => void
  updateJobMessage: (repoName: string, message: string) => void
}

export function usePush(): UsePushReturn {
  const [jobs, setJobs] = useState<PushJob[]>([])
  const [isPushing, setIsPushing] = useState(false)
  const [isGenerating, setIsGenerating] = useState(false)
  const unsubProgressRef = useRef<(() => void) | null>(null)
  const unsubDoneRef = useRef<(() => void) | null>(null)

  const cleanupListeners = useCallback(() => {
    if (unsubProgressRef.current) {
      unsubProgressRef.current()
      unsubProgressRef.current = null
    }
    if (unsubDoneRef.current) {
      unsubDoneRef.current()
      unsubDoneRef.current = null
    }
  }, [])

  const initiatePush = useCallback(async (repos: RepoStatus[]) => {
    const dirtyRepos = repos.filter((r) => r.isDirty)
    if (dirtyRepos.length === 0) return

    setIsGenerating(true)
    setJobs([])

    try {
      const generatedJobs = await window.gitchecker.generateMessages(dirtyRepos)
      setJobs(generatedJobs)
    } catch (err) {
      console.error('Failed to generate commit messages:', err)
    } finally {
      setIsGenerating(false)
    }
  }, [])

  const confirmPush = useCallback((currentJobs: PushJob[]) => {
    if (currentJobs.length === 0) return

    cleanupListeners()
    setIsPushing(true)

    // Reset all job statuses to pending before starting
    setJobs(currentJobs.map((j) => ({ ...j, status: 'pending', log: [] })))

    const unsubProgress = window.gitchecker.onPushProgress((event: PushProgressEvent) => {
      setJobs((prev) =>
        prev.map((j) => {
          if (j.repo.name === event.repoName) {
            return {
              ...j,
              status: event.status,
              log: [...j.log, event.logLine].filter(Boolean),
            }
          }
          return j
        })
      )
    })
    unsubProgressRef.current = unsubProgress

    const unsubDone = window.gitchecker.onPushDone((finalJobs: PushJob[]) => {
      setJobs(finalJobs)
      setIsPushing(false)
      cleanupListeners()
    })
    unsubDoneRef.current = unsubDone

    window.gitchecker.startPush(currentJobs)
  }, [cleanupListeners])

  const cancelPush = useCallback(() => {
    cleanupListeners()
    setJobs([])
    setIsPushing(false)
    setIsGenerating(false)
  }, [cleanupListeners])

  const updateJobMessage = useCallback((repoName: string, message: string) => {
    setJobs((prev) =>
      prev.map((j) => {
        if (j.repo.name === repoName) {
          return { ...j, commitMessage: message }
        }
        return j
      })
    )
  }, [])

  return {
    jobs,
    isPushing,
    isGenerating,
    initiatePush,
    confirmPush,
    cancelPush,
    updateJobMessage,
  }
}
