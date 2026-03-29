import { ipcMain, shell, BrowserWindow, dialog } from 'electron'
import path from 'path'
import fs from 'fs'
import { scanAllRepos } from '../git/scanner'
import { getAllStatuses } from '../git/status'
import { pullRepo, stageFile, unstageFile, stageAll, commitRepo, pushRepo, getDiff } from '../git/operations'
import { autoResolveMergeConflicts } from '../git/merge'
import { generateCommitMessage } from '../claude/commitMessage'
import { scanReposForSecrets } from '../secrets/scanner'
import { loadConfig, updateConfig } from '../config/store'
import { restartWatcher } from '../git/watcher'
import type { PushJob, PushProgressEvent, RepoStatus } from '../../renderer/types'

// Module-level state — authoritative list of repos currently being monitored
const _currentRepos: RepoStatus[] = []

// ─────────────────────────────────────────────────────────────────────────────
// Security helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Validate that repoRoot is one of the repos we are actively monitoring.
 * Prevents the renderer from pointing git operations at arbitrary paths.
 */
function validateRepoRoot(repoRoot: string): string {
  const resolved = path.resolve(repoRoot)
  const isKnown = _currentRepos.some(r => path.resolve(r.rootPath) === resolved)
  if (!isKnown) {
    throw new Error(`Access denied: ${resolved} is not a monitored repository`)
  }
  return resolved
}

/**
 * Validate that filePath is a relative path that stays inside repoRoot.
 * Rejects absolute paths and any path containing ".." segments.
 */
function validateFilePath(repoRoot: string, filePath: string): string {
  if (path.isAbsolute(filePath)) {
    throw new Error('File path must be relative to the repo root')
  }
  // Normalise to remove redundant separators without resolving symlinks
  const normalised = path.normalize(filePath)
  if (normalised.startsWith('..')) {
    throw new Error('Path traversal denied')
  }
  // Double-check after resolution
  const full = path.resolve(repoRoot, normalised)
  const root = path.resolve(repoRoot)
  if (full !== root && !full.startsWith(root + path.sep)) {
    throw new Error('Path traversal denied')
  }
  return normalised
}

/**
 * Validate a .gitignore pattern: must not contain newlines or null bytes
 * (which could inject extra lines into the .gitignore file).
 */
function validateGitignorePattern(pattern: string): string {
  if (typeof pattern !== 'string' || pattern.length === 0 || pattern.length > 256) {
    throw new Error('Invalid gitignore pattern')
  }
  if (/[\r\n\0]/.test(pattern)) {
    throw new Error('Gitignore pattern must not contain newlines or null bytes')
  }
  return pattern.trim()
}

export async function refreshRepos(win: BrowserWindow): Promise<RepoStatus[]> {
  const config = loadConfig()
  const repoPaths = await scanAllRepos(config.watchRoots, config.ignoredRepos)
  const statuses = await getAllStatuses(repoPaths, config.ignorePatterns)
  _currentRepos.length = 0
  _currentRepos.push(...statuses)

  if (!win.isDestroyed()) {
    win.webContents.send('git:status', statuses)
  }

  return statuses
}

export function registerIpcHandlers(mainWindow: BrowserWindow): void {
  // ──────────────────────────────────────────────
  // git:refresh
  // ──────────────────────────────────────────────
  ipcMain.handle('git:refresh', async () => {
    return refreshRepos(mainWindow)
  })

  // ──────────────────────────────────────────────
  // git:openFile
  // ──────────────────────────────────────────────
  ipcMain.handle('git:openFile', async (_event, filePath: string, repoRoot: string) => {
    const root = validateRepoRoot(repoRoot)
    const file = validateFilePath(root, filePath)
    await shell.openPath(path.join(root, file))
  })

  // ──────────────────────────────────────────────
  // git:openInFinder
  // ──────────────────────────────────────────────
  ipcMain.handle('git:openInFinder', async (_event, filePath: string, repoRoot: string) => {
    const root = validateRepoRoot(repoRoot)
    const file = validateFilePath(root, filePath)
    shell.showItemInFolder(path.join(root, file))
  })

  // ──────────────────────────────────────────────
  // git:stageFile
  // ──────────────────────────────────────────────
  ipcMain.handle('git:stageFile', async (_event, filePath: string, repoRoot: string) => {
    const root = validateRepoRoot(repoRoot)
    const file = validateFilePath(root, filePath)
    await stageFile(root, file)
    await refreshRepos(mainWindow)
  })

  // ──────────────────────────────────────────────
  // git:unstageFile
  // ──────────────────────────────────────────────
  ipcMain.handle('git:unstageFile', async (_event, filePath: string, repoRoot: string) => {
    const root = validateRepoRoot(repoRoot)
    const file = validateFilePath(root, filePath)
    await unstageFile(root, file)
    await refreshRepos(mainWindow)
  })

  // ──────────────────────────────────────────────
  // git:getDiff
  // ──────────────────────────────────────────────
  ipcMain.handle('git:getDiff', async (_event, filePath: string, repoRoot: string) => {
    const root = validateRepoRoot(repoRoot)
    const file = validateFilePath(root, filePath)
    return getDiff(root, file)
  })

  // ──────────────────────────────────────────────
  // push:generateMessages
  // ──────────────────────────────────────────────
  ipcMain.handle('push:generateMessages', async (_event, repos: RepoStatus[]) => {
    const config = loadConfig()
    const jobs = await Promise.allSettled(
      repos.map(async (repo): Promise<PushJob> => {
        const root = validateRepoRoot(repo.rootPath)
        const commitMessage = await generateCommitMessage(root, repo.name, config.commitPrompt)
        return {
          repo,
          commitMessage,
          status: 'pending',
          log: [],
        }
      })
    )

    return jobs.map((result, i): PushJob => {
      if (result.status === 'fulfilled') return result.value
      return {
        repo: repos[i],
        commitMessage: `chore: update ${repos[i].name}`,
        status: 'pending',
        log: [],
        error: result.reason instanceof Error ? result.reason.message : String(result.reason),
      }
    })
  })

  // ──────────────────────────────────────────────
  // push:start
  // ──────────────────────────────────────────────
  ipcMain.handle('push:start', async (_event, jobs: PushJob[]) => {
    const finalJobs: PushJob[] = jobs.map(j => ({ ...j, log: [...j.log] }))

    function emitProgress(repoName: string, status: PushJob['status'], logLine: string): void {
      const event: PushProgressEvent = { repoName, status, logLine }
      if (!mainWindow.isDestroyed()) {
        mainWindow.webContents.send('push:progress', event)
      }

      // Update local job state
      const job = finalJobs.find(j => j.repo.name === repoName)
      if (job) {
        job.status = status
        job.log.push(logLine)
      }
    }

    await Promise.allSettled(
      finalJobs.map(async (job) => {
        const { repo, commitMessage } = job

        try {
          const root = validateRepoRoot(repo.rootPath)

          // Step 1: Pull
          emitProgress(repo.name, 'pulling', `Pulling ${repo.branch} from origin...`)
          const { hadConflict, conflictedFiles } = await pullRepo(root, repo.branch)

          if (hadConflict) {
            emitProgress(repo.name, 'conflict', `Merge conflict in ${conflictedFiles.length} file(s), auto-resolving...`)
            await autoResolveMergeConflicts(root, conflictedFiles, (line) => {
              emitProgress(repo.name, 'conflict', line)
            })
            emitProgress(repo.name, 'conflict', 'Conflicts resolved')
          } else {
            emitProgress(repo.name, 'pulling', 'Pull complete')
          }

          // Step 2: Stage all
          emitProgress(repo.name, 'staging', 'Staging all changes...')
          await stageAll(root)
          emitProgress(repo.name, 'staging', 'Staged')

          // Step 3: Commit
          emitProgress(repo.name, 'committing', `Committing: ${commitMessage}`)
          await commitRepo(root, commitMessage)
          emitProgress(repo.name, 'committing', 'Committed')

          // Step 4: Push
          emitProgress(repo.name, 'pushing', `Pushing to origin/${repo.branch}...`)
          await pushRepo(root, repo.branch)
          emitProgress(repo.name, 'done', 'Push complete')

          job.status = 'done'
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err)
          job.status = 'error'
          job.error = message
          emitProgress(repo.name, 'error', `Error: ${message}`)
        }
      })
    )

    // Refresh repos after all pushes
    try {
      await refreshRepos(mainWindow)
    } catch {
      // Non-fatal
    }

    // Emit final done event
    if (!mainWindow.isDestroyed()) {
      mainWindow.webContents.send('push:done', finalJobs)
    }

    return finalJobs
  })

  // ──────────────────────────────────────────────
  // config:get
  // ──────────────────────────────────────────────
  ipcMain.handle('config:get', () => {
    return loadConfig()
  })

  // ──────────────────────────────────────────────
  // config:set
  // ──────────────────────────────────────────────
  ipcMain.handle('config:set', async (_event, partial: Partial<import('../../renderer/types').Config>) => {
    const updated = updateConfig(partial)

    // Re-scan and restart watcher with new config
    const repoPaths = await scanAllRepos(updated.watchRoots, updated.ignoredRepos)
    restartWatcher(repoPaths, mainWindow, async () => { await refreshRepos(mainWindow) })
    await refreshRepos(mainWindow)

    return updated
  })

  // ──────────────────────────────────────────────
  // secrets:scan
  // ──────────────────────────────────────────────
  ipcMain.handle('secrets:scan', async (_event, repos: RepoStatus[]) => {
    return scanReposForSecrets(repos)
  })

  // ──────────────────────────────────────────────
  // git:addToGitignore
  // ──────────────────────────────────────────────
  ipcMain.handle('git:addToGitignore', async (_event, { pattern, repoRoot }: { pattern: string; repoRoot: string }) => {
    const root = validateRepoRoot(repoRoot)
    const safePattern = validateGitignorePattern(pattern)
    const gitignorePath = path.join(root, '.gitignore')
    let content = ''
    try {
      content = fs.readFileSync(gitignorePath, 'utf8')
    } catch {
      // File doesn't exist yet — will be created
    }
    const lines = content.split('\n').map((l) => l.trim())
    if (!lines.includes(safePattern)) {
      const sep = content === '' || content.endsWith('\n') ? '' : '\n'
      fs.writeFileSync(gitignorePath, content + sep + safePattern + '\n', 'utf8')
    }

    // For tracked files, .gitignore alone doesn't stop git from showing them.
    // Find any tracked files now covered by the new pattern and untrack them.
    try {
      const { simpleGit } = await import('simple-git')
      const git = simpleGit(repoRoot)
      const ignoredTracked = await git.raw(['ls-files', '--ignored', '--exclude-standard'])
      const filesToUntrack = ignoredTracked.trim().split('\n').filter(Boolean)
      if (filesToUntrack.length > 0) {
        await git.raw(['rm', '--cached', '--', ...filesToUntrack])
      }
    } catch {
      // Non-fatal — file may simply not be tracked
    }

    await refreshRepos(mainWindow)
  })

  // ──────────────────────────────────────────────
  // dialog:openDirectory
  // ──────────────────────────────────────────────
  ipcMain.handle('dialog:openDirectory', async () => {
    const result = await dialog.showOpenDialog({
      properties: ['openDirectory', 'multiSelections'],
      title: 'Select Watch Root',
      buttonLabel: 'Add Root',
    })
    return result.canceled ? [] : result.filePaths
  })

  // ──────────────────────────────────────────────
  // git:readFile — read working tree file contents
  // ──────────────────────────────────────────────
  ipcMain.handle('git:readFile', async (_event, filePath: string, repoRoot: string) => {
    const root = validateRepoRoot(repoRoot)
    const file = validateFilePath(root, filePath)
    return fs.readFileSync(path.join(root, file), 'utf8')
  })

  // ──────────────────────────────────────────────
  // git:deleteFile — move an untracked file to Trash
  // ──────────────────────────────────────────────
  ipcMain.handle('git:deleteFile', async (_event, filePath: string, repoRoot: string) => {
    const root = validateRepoRoot(repoRoot)
    const file = validateFilePath(root, filePath)
    await shell.trashItem(path.join(root, file))
    await refreshRepos(mainWindow)
  })

  // ──────────────────────────────────────────────
  // git:readFileHead — read file at HEAD revision
  // ──────────────────────────────────────────────
  ipcMain.handle('git:readFileHead', async (_event, filePath: string, repoRoot: string) => {
    const root = validateRepoRoot(repoRoot)
    const file = validateFilePath(root, filePath)
    try {
      const { simpleGit } = await import('simple-git')
      const git = simpleGit(root)
      const gitPath = file.replace(/\\/g, '/')
      return await git.show([`HEAD:${gitPath}`])
    } catch {
      return null  // File doesn't exist at HEAD (new/untracked file)
    }
  })
}
