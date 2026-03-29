export type FileStatus = 'M' | 'A' | 'D' | '?' | 'R' | 'C'

export interface DirtyFile {
  path: string      // relative to repo root
  status: FileStatus
  staged: boolean
}

export interface RepoStatus {
  name: string      // dirname
  rootPath: string  // absolute path
  branch: string
  files: DirtyFile[]
  isDirty: boolean
}

export interface Config {
  watchRoots: string[]
  ignoredRepos: string[]    // absolute paths
  ignorePatterns: string[]  // glob patterns e.g. "*.lock"
}

export type PushStatus =
  | 'pending'
  | 'pulling'
  | 'staging'
  | 'committing'
  | 'pushing'
  | 'done'
  | 'error'
  | 'conflict'

export interface PushJob {
  repo: RepoStatus
  commitMessage: string
  status: PushStatus
  log: string[]
  error?: string
}

export interface SecretHit {
  repoName: string
  file: string
  line: number
  pattern: string
  preview: string
}

export interface PushProgressEvent {
  repoName: string
  status: PushStatus
  logLine: string
}

export interface IPCApi {
  // Git status
  onGitStatus: (cb: (repos: RepoStatus[]) => void) => () => void
  refresh: () => void
  openFile: (path: string, repoRoot: string) => void
  openInFinder: (path: string, repoRoot: string) => void
  stageFile: (path: string, repoRoot: string) => Promise<void>
  unstageFile: (path: string, repoRoot: string) => Promise<void>
  getDiff: (path: string, repoRoot: string) => Promise<string>

  // Push flow
  generateMessages: (repos: RepoStatus[]) => Promise<PushJob[]>
  startPush: (jobs: PushJob[]) => void
  onPushProgress: (cb: (event: PushProgressEvent) => void) => () => void
  onPushDone: (cb: (jobs: PushJob[]) => void) => () => void

  // Config
  getConfig: () => Promise<Config>
  setConfig: (config: Partial<Config>) => Promise<Config>

  // Secrets
  onSecretsFound: (cb: (hits: SecretHit[]) => void) => () => void
  scanSecrets: (repos: RepoStatus[]) => Promise<SecretHit[]>
}

declare global {
  interface Window {
    gitchecker: IPCApi
  }
}
