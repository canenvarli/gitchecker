import { ipcMain, shell, BrowserWindow } from 'electron'
import path from 'path'
import { scanAllRepos } from '../git/scanner'
import { getAllStatuses } from '../git/status'
import { pullRepo, stageFile, unstageFile, stageAll, commitRepo, pushRepo, getDiff } from '../git/operations'
import { autoResolveMergeConflicts } from '../git/merge'
import { generateCommitMessage } from '../claude/commitMessage'
import { scanReposForSecrets } from '../secrets/scanner'
import { loadConfig, updateConfig } from '../config/store'
import { restartWatcher } from '../git/watcher'
import type { PushJob, PushProgressEvent, RepoStatus } from '../../renderer/types'

// Module-level state — kept for potential future use (e.g., diff against cached)
const _currentRepos: RepoStatus[] = []

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
  ipcMain.handle('git:openFile', async (_event, { path: filePath, repoRoot }: { path: string; repoRoot: string }) => {
    const fullPath = path.isAbsolute(filePath) ? filePath : path.join(repoRoot, filePath)
    await shell.openPath(fullPath)
  })

  // ──────────────────────────────────────────────
  // git:openInFinder
  // ──────────────────────────────────────────────
  ipcMain.handle('git:openInFinder', async (_event, { path: filePath, repoRoot }: { path: string; repoRoot: string }) => {
    const fullPath = path.isAbsolute(filePath) ? filePath : path.join(repoRoot, filePath)
    shell.showItemInFolder(fullPath)
  })

  // ──────────────────────────────────────────────
  // git:stageFile
  // ──────────────────────────────────────────────
  ipcMain.handle('git:stageFile', async (_event, { path: filePath, repoRoot }: { path: string; repoRoot: string }) => {
    await stageFile(repoRoot, filePath)
    await refreshRepos(mainWindow)
  })

  // ──────────────────────────────────────────────
  // git:unstageFile
  // ──────────────────────────────────────────────
  ipcMain.handle('git:unstageFile', async (_event, { path: filePath, repoRoot }: { path: string; repoRoot: string }) => {
    await unstageFile(repoRoot, filePath)
    await refreshRepos(mainWindow)
  })

  // ──────────────────────────────────────────────
  // git:getDiff
  // ──────────────────────────────────────────────
  ipcMain.handle('git:getDiff', async (_event, { path: filePath, repoRoot }: { path: string; repoRoot: string }) => {
    return getDiff(repoRoot, filePath)
  })

  // ──────────────────────────────────────────────
  // push:generateMessages
  // ──────────────────────────────────────────────
  ipcMain.handle('push:generateMessages', async (_event, repos: RepoStatus[]) => {
    const jobs = await Promise.allSettled(
      repos.map(async (repo): Promise<PushJob> => {
        const commitMessage = await generateCommitMessage(repo.rootPath, repo.name)
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
          // Step 1: Pull
          emitProgress(repo.name, 'pulling', `Pulling ${repo.branch} from origin...`)
          const { hadConflict, conflictedFiles } = await pullRepo(repo.rootPath, repo.branch)

          if (hadConflict) {
            emitProgress(repo.name, 'conflict', `Merge conflict in ${conflictedFiles.length} file(s), auto-resolving...`)
            await autoResolveMergeConflicts(repo.rootPath, conflictedFiles, (line) => {
              emitProgress(repo.name, 'conflict', line)
            })
            emitProgress(repo.name, 'conflict', 'Conflicts resolved')
          } else {
            emitProgress(repo.name, 'pulling', 'Pull complete')
          }

          // Step 2: Stage all
          emitProgress(repo.name, 'staging', 'Staging all changes...')
          await stageAll(repo.rootPath)
          emitProgress(repo.name, 'staging', 'Staged')

          // Step 3: Commit
          emitProgress(repo.name, 'committing', `Committing: ${commitMessage}`)
          await commitRepo(repo.rootPath, commitMessage)
          emitProgress(repo.name, 'committing', 'Committed')

          // Step 4: Push
          emitProgress(repo.name, 'pushing', `Pushing to origin/${repo.branch}...`)
          await pushRepo(repo.rootPath, repo.branch)
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
}
