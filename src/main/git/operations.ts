import { simpleGit } from 'simple-git'
import fs from 'fs'
import path from 'path'

export async function pullRepo(
  repoPath: string,
  branch: string,
): Promise<{ hadConflict: boolean; conflictedFiles: string[] }> {
  const git = simpleGit(repoPath)

  try {
    await git.pull('origin', branch, { '--no-rebase': null })
    return { hadConflict: false, conflictedFiles: [] }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)

    // Check for merge conflict
    if (
      message.includes('CONFLICT') ||
      message.includes('conflict') ||
      message.includes('Automatic merge failed')
    ) {
      // Find conflicted files via git status
      const status = await git.status()
      const conflictedFiles = status.conflicted
      return { hadConflict: true, conflictedFiles }
    }

    // Not a conflict error — rethrow
    throw err
  }
}

export async function stageFile(repoPath: string, filePath: string): Promise<void> {
  const git = simpleGit(repoPath)
  await git.add(filePath)
}

export async function unstageFile(repoPath: string, filePath: string): Promise<void> {
  const git = simpleGit(repoPath)
  // git restore --staged <file>
  await git.raw(['restore', '--staged', filePath])
}

export async function stageAll(repoPath: string): Promise<void> {
  const git = simpleGit(repoPath)
  await git.add('-A')
}

export async function commitRepo(repoPath: string, message: string): Promise<void> {
  const git = simpleGit(repoPath)
  await git.commit(message)
}

export async function pushRepo(repoPath: string, branch: string): Promise<void> {
  const git = simpleGit(repoPath)
  await git.push('origin', branch)
}

export async function getDiff(repoPath: string, filePath?: string): Promise<string> {
  const git = simpleGit(repoPath)

  if (filePath) {
    // Try staged diff first, then unstaged
    let diff = await git.diff(['--cached', '--', filePath])
    if (!diff) {
      diff = await git.diff(['--', filePath])
    }
    if (!diff) {
      // Untracked file — show content
      const fullPath = path.join(repoPath, filePath)
      try {
        const content = fs.readFileSync(fullPath, 'utf-8')
        return `(untracked file)\n+++ ${filePath}\n` + content.split('\n').map(l => `+${l}`).join('\n')
      } catch {
        return '(binary or unreadable file)'
      }
    }
    return diff
  }

  // Full repo diff (staged + unstaged)
  const staged = await git.diff(['--cached'])
  const unstaged = await git.diff()
  return [staged, unstaged].filter(Boolean).join('\n')
}

export async function getConflictedContent(repoPath: string, filePath: string): Promise<string> {
  const fullPath = path.join(repoPath, filePath)
  return fs.readFileSync(fullPath, 'utf-8')
}

export async function writeResolvedConflict(
  repoPath: string,
  filePath: string,
  content: string,
): Promise<void> {
  const fullPath = path.join(repoPath, filePath)
  fs.writeFileSync(fullPath, content, 'utf-8')
}
