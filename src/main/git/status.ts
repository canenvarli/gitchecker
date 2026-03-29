import { simpleGit } from 'simple-git'
import path from 'path'
import type { RepoStatus, DirtyFile, FileStatus } from '../../renderer/types'
import { matchesIgnorePattern } from './scanner'

function mapStatusCode(code: string): FileStatus {
  switch (code.trim()) {
    case 'M': return 'M'
    case 'A': return 'A'
    case 'D': return 'D'
    case 'R': return 'R'
    case 'C': return 'C'
    case '?': return '?'
    default: return 'M'
  }
}

export async function getRepoStatus(repoPath: string): Promise<RepoStatus> {
  const git = simpleGit(repoPath)
  const name = path.basename(repoPath)

  let branch = 'HEAD'
  try {
    const branchResult = await git.revparse(['--abbrev-ref', 'HEAD'])
    branch = branchResult.trim()
  } catch {
    // detached HEAD or new repo with no commits
    try {
      const headContent = await git.raw(['symbolic-ref', '--short', 'HEAD'])
      branch = headContent.trim()
    } catch {
      branch = 'HEAD'
    }
  }

  let lastCommit: string | undefined
  try {
    const raw = await git.raw(['log', '-1', '--format=%cI'])
    if (raw.trim()) lastCommit = raw.trim()
  } catch {
    // new repo with no commits
  }

  const statusResult = await git.status()
  const files: DirtyFile[] = []

  // Staged files
  for (const f of statusResult.staged) {
    const rawFile = statusResult.files.find(sf => sf.path === f)
    let status: FileStatus = 'M'
    if (rawFile) {
      const idx = rawFile.index.trim()
      if (idx) status = mapStatusCode(idx)
    }
    files.push({ path: f, status, staged: true })
  }

  // Not staged / untracked
  for (const f of statusResult.files) {
    const alreadyAdded = files.some(existing => existing.path === f.path)
    if (alreadyAdded) continue

    const wt = f.working_dir.trim()
    const idx = f.index.trim()

    if (wt === '?' && idx === '?') {
      files.push({ path: f.path, status: '?', staged: false })
    } else if (wt) {
      files.push({ path: f.path, status: mapStatusCode(wt), staged: false })
    } else if (idx) {
      files.push({ path: f.path, status: mapStatusCode(idx), staged: true })
    }
  }

  return {
    name,
    rootPath: repoPath,
    branch,
    files,
    isDirty: files.length > 0,
    lastCommit,
  }
}

export async function getAllStatuses(
  repoPaths: string[],
  ignorePatterns: string[],
): Promise<RepoStatus[]> {
  const results = await Promise.allSettled(repoPaths.map(p => getRepoStatus(p)))

  const statuses: RepoStatus[] = []
  for (const result of results) {
    if (result.status === 'rejected') continue
    const repo = result.value

    // Filter out files that match ignore patterns
    const filteredFiles = repo.files.filter(
      f => !matchesIgnorePattern(f.path, ignorePatterns)
    )

    statuses.push({
      ...repo,
      files: filteredFiles,
      isDirty: filteredFiles.length > 0,
    })
  }

  return statuses
}
