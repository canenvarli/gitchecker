import { useState, useEffect, useCallback, useRef } from 'react'
import type { RepoStatus } from '../types'

export interface UseReposReturn {
  repos: RepoStatus[]
  refresh: () => void
  lastScan: Date | null
}

export function useRepos(): UseReposReturn {
  const [repos, setRepos] = useState<RepoStatus[]>([])
  const [lastScan, setLastScan] = useState<Date | null>(null)
  const unsubscribeRef = useRef<(() => void) | null>(null)

  const refresh = useCallback(() => {
    window.gitchecker.refresh()
  }, [])

  useEffect(() => {
    // Subscribe to git status updates
    const unsub = window.gitchecker.onGitStatus((incoming) => {
      setRepos(incoming)
      setLastScan(new Date())
    })
    unsubscribeRef.current = unsub

    // Trigger initial fetch
    refresh()

    return () => {
      if (unsubscribeRef.current) {
        unsubscribeRef.current()
        unsubscribeRef.current = null
      }
    }
  }, [refresh])

  return { repos, refresh, lastScan }
}
