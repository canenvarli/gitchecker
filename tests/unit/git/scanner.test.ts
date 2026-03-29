import fs from 'fs'
import os from 'os'
import path from 'path'
import { scanAllRepos, matchesIgnorePattern } from '@main/git/scanner'

// ---- helpers ---------------------------------------------------------------

function tmpDir(suffix: string): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), `gc-scanner-${suffix}-`))
}

function makeGitRepo(dir: string): void {
  fs.mkdirSync(path.join(dir, '.git'), { recursive: true })
}

// ---- fixture management ----------------------------------------------------

let dirsToCleanUp: string[] = []

afterEach(() => {
  for (const d of dirsToCleanUp) {
    fs.rmSync(d, { recursive: true, force: true })
  }
  dirsToCleanUp = []
})

// ---- tests -----------------------------------------------------------------

describe('scanAllRepos', () => {
  it('returns empty array for a nonexistent root', async () => {
    const result = await scanAllRepos(['/nonexistent/path/that/cannot/exist'], [])
    expect(result).toEqual([])
  })

  it('returns empty array when watchRoots is empty', async () => {
    const result = await scanAllRepos([], [])
    expect(result).toEqual([])
  })

  it('finds a git repo directly at the watch root', async () => {
    const root = tmpDir('direct')
    dirsToCleanUp.push(root)
    makeGitRepo(root)

    const result = await scanAllRepos([root], [])
    expect(result).toContain(path.normalize(root))
  })

  it('finds a git repo nested one level below watch root', async () => {
    const root = tmpDir('nested')
    dirsToCleanUp.push(root)
    const repoDir = path.join(root, 'my-project')
    fs.mkdirSync(repoDir)
    makeGitRepo(repoDir)

    const result = await scanAllRepos([root], [])
    expect(result).toContain(path.normalize(repoDir))
  })

  it('finds multiple repos under the same watch root', async () => {
    const root = tmpDir('multi')
    dirsToCleanUp.push(root)

    const repoA = path.join(root, 'project-a')
    const repoB = path.join(root, 'project-b')
    fs.mkdirSync(repoA)
    fs.mkdirSync(repoB)
    makeGitRepo(repoA)
    makeGitRepo(repoB)

    const result = await scanAllRepos([root], [])
    expect(result).toContain(path.normalize(repoA))
    expect(result).toContain(path.normalize(repoB))
    expect(result).toHaveLength(2)
  })

  it('respects ignoredRepos list — excluded paths are not returned', async () => {
    const root = tmpDir('ignored')
    dirsToCleanUp.push(root)

    const repoA = path.join(root, 'keep-this')
    const repoB = path.join(root, 'ignore-this')
    fs.mkdirSync(repoA)
    fs.mkdirSync(repoB)
    makeGitRepo(repoA)
    makeGitRepo(repoB)

    const result = await scanAllRepos([root], [repoB])
    expect(result).toContain(path.normalize(repoA))
    expect(result).not.toContain(path.normalize(repoB))
  })

  it('skips node_modules directories', async () => {
    const root = tmpDir('nodemod')
    dirsToCleanUp.push(root)

    // A valid repo at the top level
    const validRepo = path.join(root, 'valid-project')
    fs.mkdirSync(validRepo)
    makeGitRepo(validRepo)

    // A .git inside node_modules — should be skipped
    const nodeModules = path.join(root, 'node_modules', 'some-pkg')
    fs.mkdirSync(nodeModules, { recursive: true })
    makeGitRepo(nodeModules)

    const result = await scanAllRepos([root], [])
    expect(result).toContain(path.normalize(validRepo))
    expect(result.some(r => r.includes('node_modules'))).toBe(false)
  })

  it('skips hidden directories (starting with .)', async () => {
    const root = tmpDir('hidden')
    dirsToCleanUp.push(root)

    const hiddenDir = path.join(root, '.hidden-project')
    fs.mkdirSync(hiddenDir)
    makeGitRepo(hiddenDir)

    const result = await scanAllRepos([root], [])
    // The root itself is not a git repo, and .hidden-project is skipped
    expect(result).toHaveLength(0)
  })

  it('does not recurse deeper than MAX_DEPTH (3)', async () => {
    const root = tmpDir('depth')
    dirsToCleanUp.push(root)

    // depth 3 from root: root/a/b/c — should NOT be found (depth 3 is 0-indexed, so
    // scanAllRepos starts with depth=0 for root; depth 3 = 4 levels deep)
    const tooDeep = path.join(root, 'level1', 'level2', 'level3', 'deep-repo')
    fs.mkdirSync(tooDeep, { recursive: true })
    makeGitRepo(tooDeep)

    const result = await scanAllRepos([root], [])
    expect(result.some(r => r.includes('deep-repo'))).toBe(false)
  })

  it('finds a repo at exactly depth 3 (borderline)', async () => {
    const root = tmpDir('depth3')
    dirsToCleanUp.push(root)

    // depth 3 from root: root/l1/l2/l3 — this should be found (depth == MAX_DEPTH)
    const atDepth = path.join(root, 'l1', 'l2', 'l3')
    fs.mkdirSync(atDepth, { recursive: true })
    makeGitRepo(atDepth)

    const result = await scanAllRepos([root], [])
    expect(result).toContain(path.normalize(atDepth))
  })

  it('handles symlinks gracefully without throwing', async () => {
    const root = tmpDir('symlink')
    dirsToCleanUp.push(root)

    const realRepo = tmpDir('symlink-target')
    dirsToCleanUp.push(realRepo)
    makeGitRepo(realRepo)

    // Create a symlink inside root pointing to the real repo
    const linkPath = path.join(root, 'linked-repo')
    try {
      fs.symlinkSync(realRepo, linkPath)
    } catch {
      // Skip on systems that don't support symlinks
      return
    }

    // Should not throw; symlink target may or may not be found depending on
    // whether the OS resolves it, but no exception should be raised
    await expect(scanAllRepos([root], [])).resolves.toBeDefined()
  })

  it('deduplicates results when the same repo is reachable via multiple roots', async () => {
    const root = tmpDir('dedup')
    dirsToCleanUp.push(root)
    makeGitRepo(root)

    // Pass the same root twice
    const result = await scanAllRepos([root, root], [])
    expect(result.filter(r => r === path.normalize(root))).toHaveLength(1)
  })

  it('handles unreadable directories without throwing', async () => {
    // Passing a path that exists as a file (not a directory) should be handled
    const root = tmpDir('unreadable')
    dirsToCleanUp.push(root)
    const filePath = path.join(root, 'not-a-dir.txt')
    fs.writeFileSync(filePath, 'content')

    // Should not throw
    await expect(scanAllRepos([filePath], [])).resolves.toEqual([])
  })
})

// ---- matchesIgnorePattern --------------------------------------------------

describe('matchesIgnorePattern', () => {
  it('returns false when patterns array is empty', () => {
    expect(matchesIgnorePattern('package-lock.json', [])).toBe(false)
  })

  it('matches exact filename', () => {
    expect(matchesIgnorePattern('package-lock.json', ['package-lock.json'])).toBe(true)
  })

  it('matches with * wildcard (single segment)', () => {
    expect(matchesIgnorePattern('file.lock', ['*.lock'])).toBe(true)
    expect(matchesIgnorePattern('other.json', ['*.lock'])).toBe(false)
  })

  it('matches basename even when full path is provided', () => {
    expect(matchesIgnorePattern('some/deep/path/file.lock', ['*.lock'])).toBe(true)
  })

  it('returns false when no pattern matches', () => {
    expect(matchesIgnorePattern('main.ts', ['*.lock', '*.json', '.DS_Store'])).toBe(false)
  })

  it('matches .DS_Store exactly', () => {
    expect(matchesIgnorePattern('.DS_Store', ['.DS_Store'])).toBe(true)
  })
})
