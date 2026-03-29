export type FileStatus = 'M' | 'A' | 'D' | '?' | 'R' | 'C'

export interface SelectedFile {
  path: string
  repoRoot: string
  repoName: string
  status: FileStatus
}

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
  lastCommit?: string  // ISO 8601 timestamp of most recent commit
}

export interface Config {
  watchRoots: string[]
  ignoredRepos: string[]    // absolute paths
  ignorePatterns: string[]  // glob patterns e.g. "*.lock"
  commitPrompt: string      // template passed to Claude; supports {{repoName}}, {{fileCount}}, {{additions}}, {{deletions}}, {{diff}}
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

  // .gitignore
  addToGitignore: (pattern: string, repoRoot: string) => Promise<void>
  openDirectoryPicker: () => Promise<string[]>
  readFile: (filePath: string, repoRoot: string) => Promise<string>
  readFileHead: (filePath: string, repoRoot: string) => Promise<string | null>
  deleteFile: (filePath: string, repoRoot: string) => Promise<void>
}

declare global {
  interface Window {
    gitchecker: IPCApi
  }
}
