import fs from 'fs'
import path from 'path'

const MAX_DEPTH = 3
const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', 'build', '.cache', '__pycache__', '.tox', 'vendor', 'Pods'])

function matchesPattern(name: string, pattern: string): boolean {
  // Simple glob matching: supports * as wildcard and ** for path separator wildcard
  const escaped = pattern
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*\*/g, '§DOUBLESTAR§')
    .replace(/\*/g, '[^/]*')
    .replace(/§DOUBLESTAR§/g, '.*')
  const regex = new RegExp(`^${escaped}$`)
  return regex.test(name)
}

function shouldIgnoreDir(dirName: string): boolean {
  return SKIP_DIRS.has(dirName) || dirName.startsWith('.')
}

async function findGitRepos(
  dir: string,
  depth: number,
  ignoredRepos: string[],
  results: string[],
): Promise<void> {
  if (depth > MAX_DEPTH) return

  let entries: fs.Dirent[]
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true })
  } catch {
    return
  }

  // Check if this directory itself is a git repo
  const hasGitDir = entries.some(e => e.isDirectory() && e.name === '.git')
  if (hasGitDir) {
    const normalized = path.normalize(dir)
    if (!ignoredRepos.includes(normalized)) {
      results.push(normalized)
    }
    // Don't recurse deeper into a git repo (we found what we need at this level)
    return
  }

  // Recurse into subdirectories
  for (const entry of entries) {
    if (!entry.isDirectory()) continue
    if (shouldIgnoreDir(entry.name)) continue
    await findGitRepos(path.join(dir, entry.name), depth + 1, ignoredRepos, results)
  }
}

export async function scanAllRepos(
  watchRoots: string[],
  ignoredRepos: string[],
): Promise<string[]> {
  const results: string[] = []
  const normalizedIgnored = ignoredRepos.map(r => path.normalize(r))

  for (const root of watchRoots) {
    if (!fs.existsSync(root)) continue
    await findGitRepos(root, 0, normalizedIgnored, results)
  }

  // Deduplicate
  return [...new Set(results)]
}

export function matchesIgnorePattern(filePath: string, patterns: string[]): boolean {
  const basename = path.basename(filePath)
  for (const pattern of patterns) {
    if (matchesPattern(basename, pattern)) return true
    if (matchesPattern(filePath, pattern)) return true
  }
  return false
}
