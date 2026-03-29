import chokidar from 'chokidar'
import path from 'path'
import { BrowserWindow } from 'electron'

let watcher: chokidar.FSWatcher | null = null
const debounceTimers = new Map<string, ReturnType<typeof setTimeout>>()
const DEBOUNCE_MS = 200

export function startWatcher(
  repoPaths: string[],
  win: BrowserWindow,
  onUpdate: () => Promise<void>,
): void {
  if (watcher) {
    watcher.close().catch(() => {})
    watcher = null
  }

  if (repoPaths.length === 0) return

  // Watch .git/index and .git/HEAD for each repo
  const watchPaths = repoPaths.flatMap(repoPath => [
    path.join(repoPath, '.git', 'index'),
    path.join(repoPath, '.git', 'HEAD'),
    path.join(repoPath, '.git', 'ORIG_HEAD'),
    path.join(repoPath, '.git', 'MERGE_HEAD'),
  ])

  watcher = chokidar.watch(watchPaths, {
    persistent: true,
    ignoreInitial: true,
    awaitWriteFinish: {
      stabilityThreshold: 100,
      pollInterval: 50,
    },
  })

  watcher.on('change', (changedPath: string) => {
    // Determine which repo this belongs to
    const repoPath = repoPaths.find(r => changedPath.startsWith(r))
    const key = repoPath ?? changedPath

    // Debounce per repo
    const existing = debounceTimers.get(key)
    if (existing) clearTimeout(existing)

    const timer = setTimeout(async () => {
      debounceTimers.delete(key)
      try {
        await onUpdate()
      } catch (err) {
        console.error('[watcher] onUpdate error:', err)
      }
    }, DEBOUNCE_MS)

    debounceTimers.set(key, timer)
  })

  watcher.on('error', (err: unknown) => {
    console.error('[watcher] chokidar error:', err)
  })

  // Suppress unused variable warning — win is used by caller via onUpdate closure
  void win
}

export function stopWatcher(): void {
  // Clear all pending debounce timers
  for (const timer of debounceTimers.values()) {
    clearTimeout(timer)
  }
  debounceTimers.clear()

  if (watcher) {
    watcher.close().catch(() => {})
    watcher = null
  }
}

export function restartWatcher(
  repoPaths: string[],
  win: BrowserWindow,
  onUpdate: () => Promise<void>,
): void {
  stopWatcher()
  startWatcher(repoPaths, win, onUpdate)
}
