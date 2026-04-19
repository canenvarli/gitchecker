/**
 * Electron preload script — Security bridge between main and renderer.
 *
 * Security invariants enforced here:
 *   - contextIsolation: true  → renderer cannot reach Node.js / Electron APIs directly
 *   - nodeIntegration: false  → renderer has no require(), process, etc.
 *   - Only whitelisted IPC channels are callable from the renderer
 *   - Raw ipcRenderer is never exposed; every call goes through a named wrapper
 *   - Listener registrations validate that the callback is a function
 *   - Every listener registration returns a cleanup function to prevent memory leaks
 */

import { contextBridge, ipcRenderer } from 'electron'

// ---------------------------------------------------------------------------
// Inline types — must not import from src/renderer to keep the preload bundle
// self-contained and prevent the renderer bundle from influencing the sandbox.
// ---------------------------------------------------------------------------

type FileStatus = 'M' | 'A' | 'D' | '?' | 'R' | 'C'

interface DirtyFile {
  path: string
  status: FileStatus
  staged: boolean
}

interface RepoStatus {
  name: string
  rootPath: string
  branch: string
  files: DirtyFile[]
  isDirty: boolean
}

interface Config {
  watchRoots: string[]
  ignoredRepos: string[]
  ignorePatterns: string[]
  claudeBinaryPath: string
}

type PushStatus =
  | 'pending'
  | 'pulling'
  | 'staging'
  | 'committing'
  | 'pushing'
  | 'done'
  | 'error'
  | 'conflict'

interface PushJob {
  repo: RepoStatus
  commitMessage: string
  status: PushStatus
  log: string[]
  error?: string
}

interface SecretHit {
  repoName: string
  file: string
  line: number
  pattern: string
  preview: string
}

interface PushProgressEvent {
  repoName: string
  status: PushStatus
  logLine: string
}

// ---------------------------------------------------------------------------
// Channel whitelists — explicit allowlists; nothing outside these sets can be
// invoked or subscribed to from renderer code.
// ---------------------------------------------------------------------------

const INVOKE_CHANNELS = new Set([
  'git:refresh',
  'git:openFile',
  'git:openInFinder',
  'git:stageFile',
  'git:unstageFile',
  'git:getDiff',
  'git:addToGitignore',
  'git:readFile',
  'git:readFileHead',
  'git:deleteFile',
  'push:generateMessages',
  'push:start',
  'config:get',
  'config:set',
  'secrets:scan',
  'dialog:openDirectory',
  'dialog:openFile',
] as const)

const LISTEN_CHANNELS = new Set([
  'git:status',
  'push:progress',
  'push:done',
  'secrets:found',
  'claude:notFound',
] as const)

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Safe invoke wrapper — asserts channel is in the whitelist before calling
 * ipcRenderer.invoke so the renderer can never construct an arbitrary channel
 * name at runtime and reach unlisted handlers.
 */
function safeInvoke<T>(channel: string, ...args: unknown[]): Promise<T> {
  if (!INVOKE_CHANNELS.has(channel as never)) {
    return Promise.reject(new Error(`Blocked: invoke on unlisted channel "${channel}"`))
  }
  return ipcRenderer.invoke(channel, ...args) as Promise<T>
}

/**
 * Safe listener registration — asserts channel is in the listen whitelist,
 * validates the callback is actually a function, registers the IPC listener,
 * and returns a cleanup function that removes only the specific handler
 * registered in this call (no broad removeAllListeners).
 */
function safeOn<T>(channel: string, cb: (data: T) => void): () => void {
  if (!LISTEN_CHANNELS.has(channel as never)) {
    throw new Error(`Blocked: listen on unlisted channel "${channel}"`)
  }
  if (typeof cb !== 'function') {
    throw new TypeError(`safeOn: callback for "${channel}" must be a function`)
  }

  // Wrap so we strip the Electron event object before passing data to renderer
  const handler = (_event: Electron.IpcRendererEvent, data: T): void => cb(data)
  ipcRenderer.on(channel, handler)

  // Return cleanup so the renderer (e.g. React useEffect) can unsubscribe
  return () => {
    ipcRenderer.removeListener(channel, handler)
  }
}

// ---------------------------------------------------------------------------
// Exposed API
// ---------------------------------------------------------------------------

contextBridge.exposeInMainWorld('gitchecker', {
  // -- Git status & file operations ------------------------------------------

  /** Trigger a full status refresh across all watched roots. */
  refresh(): void {
    ipcRenderer.invoke('git:refresh').catch(() => {
      // fire-and-forget; errors are surfaced via git:status events
    })
  },

  /** Open a file in the system default editor. */
  openFile(path: string, repoRoot: string): void {
    ipcRenderer.invoke('git:openFile', path, repoRoot).catch(() => {
      // fire-and-forget
    })
  },

  /** Reveal a file in Finder (macOS). */
  openInFinder(path: string, repoRoot: string): void {
    ipcRenderer.invoke('git:openInFinder', path, repoRoot).catch(() => {
      // fire-and-forget
    })
  },

  /** Stage a single file. */
  stageFile(path: string, repoRoot: string): Promise<void> {
    return safeInvoke<void>('git:stageFile', path, repoRoot)
  },

  /** Unstage a single file. */
  unstageFile(path: string, repoRoot: string): Promise<void> {
    return safeInvoke<void>('git:unstageFile', path, repoRoot)
  },

  /** Fetch the unified diff for a file. */
  getDiff(path: string, repoRoot: string): Promise<string> {
    return safeInvoke<string>('git:getDiff', path, repoRoot)
  },

  // -- Push flow -------------------------------------------------------------

  /** Ask the AI to draft commit messages for the given repos. */
  generateMessages(repos: RepoStatus[]): Promise<PushJob[]> {
    return safeInvoke<PushJob[]>('push:generateMessages', repos)
  },

  /** Kick off the push sequence for the supplied jobs. */
  startPush(jobs: PushJob[]): void {
    ipcRenderer.invoke('push:start', jobs).catch(() => {
      // fire-and-forget; progress surfaced via push:progress / push:done events
    })
  },

  // -- Config ----------------------------------------------------------------

  /** Read the current persisted configuration. */
  getConfig(): Promise<Config> {
    return safeInvoke<Config>('config:get')
  },

  /** Merge a partial config object into the stored config and return the result. */
  setConfig(partial: Partial<Config>): Promise<Config> {
    return safeInvoke<Config>('config:set', partial)
  },

  // -- Claude ----------------------------------------------------------------

  /** Subscribe to claude-not-found events (binary missing from PATH). */
  onClaudeNotFound(cb: () => void): () => void {
    return safeOn<undefined>('claude:notFound', () => cb())
  },

  /** Open a native file picker and return the selected path, or null if cancelled. */
  pickClaudeBinary(): Promise<string | null> {
    return safeInvoke<string | null>('dialog:openFile')
  },

  // -- Secrets ---------------------------------------------------------------

  /** Run the secret-scanning pass over the given repos. */
  scanSecrets(repos: RepoStatus[]): Promise<SecretHit[]> {
    return safeInvoke<SecretHit[]>('secrets:scan', repos)
  },

  /** Append a pattern to the repo's .gitignore (creates it if absent). */
  addToGitignore(pattern: string, repoRoot: string): Promise<void> {
    return safeInvoke<void>('git:addToGitignore', { pattern, repoRoot })
  },

  /** Open a native directory picker. Returns selected paths or [] if cancelled. */
  openDirectoryPicker(): Promise<string[]> {
    return safeInvoke<string[]>('dialog:openDirectory')
  },

  /** Read the working-tree content of a file. */
  readFile(filePath: string, repoRoot: string): Promise<string> {
    return safeInvoke<string>('git:readFile', filePath, repoRoot)
  },

  /** Read the HEAD-committed content of a file. Returns null for untracked files. */
  readFileHead(filePath: string, repoRoot: string): Promise<string | null> {
    return safeInvoke<string | null>('git:readFileHead', filePath, repoRoot)
  },

  /** Move an untracked file to Trash. */
  deleteFile(filePath: string, repoRoot: string): Promise<void> {
    return safeInvoke<void>('git:deleteFile', filePath, repoRoot)
  },

  // -- Main → Renderer listeners --------------------------------------------

  /**
   * Subscribe to git status broadcasts.
   * Returns a cleanup function — call it in useEffect's return to avoid leaks.
   */
  onGitStatus(cb: (repos: RepoStatus[]) => void): () => void {
    return safeOn<RepoStatus[]>('git:status', cb)
  },

  /**
   * Subscribe to per-repo push progress events.
   * Returns a cleanup function.
   */
  onPushProgress(cb: (event: PushProgressEvent) => void): () => void {
    return safeOn<PushProgressEvent>('push:progress', cb)
  },

  /**
   * Subscribe to the push-completed event (fires once per push run).
   * Returns a cleanup function.
   */
  onPushDone(cb: (jobs: PushJob[]) => void): () => void {
    return safeOn<PushJob[]>('push:done', cb)
  },

  /**
   * Subscribe to secrets-found events (emitted after a scan completes).
   * Returns a cleanup function.
   */
  onSecretsFound(cb: (hits: SecretHit[]) => void): () => void {
    return safeOn<SecretHit[]>('secrets:found', cb)
  },
})
