import { useState, useEffect, useCallback } from 'react'
import type { Config } from '../types'

export interface UseConfigReturn {
  config: Config | null
  updateConfig: (partial: Partial<Config>) => Promise<void>
  isLoading: boolean
}

export function useConfig(): UseConfigReturn {
  const [config, setConfig] = useState<Config | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    let mounted = true
    setIsLoading(true)
    window.gitchecker.getConfig().then((cfg) => {
      if (mounted) {
        setConfig(cfg)
        setIsLoading(false)
      }
    }).catch(() => {
      if (mounted) {
        setIsLoading(false)
      }
    })
    return () => { mounted = false }
  }, [])

  const updateConfig = useCallback(async (partial: Partial<Config>) => {
    const updated = await window.gitchecker.setConfig(partial)
    setConfig(updated)
  }, [])

  return { config, updateConfig, isLoading }
}
