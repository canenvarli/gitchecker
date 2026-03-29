import { execSync } from 'child_process'
import fs from 'fs'
import os from 'os'
import path from 'path'

import { getRepoStatus } from '@main/git/status'
import { stageFile, unstageFile, stageAll, commitRepo, getDiff } from '@main/git/operations'

// ---- helpers ---------------------------------------------------------------

function createTmpRepo(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gc-ops-'))
  execSync('git init', { cwd: dir })
  execSync('git config user.email "test@test.com"', { cwd: dir })
  execSync('git config user.name "Test"', { cwd: dir })
  // create initial commit so HEAD exists
  fs.writeFileSync(path.join(dir, 'README.md'), '# Test\n')
  execSync('git add .', { cwd: dir })
  execSync('git commit -m "init"', { cwd: dir })
  return dir
}

// ---- fixture management ----------------------------------------------------

const tmpDirs: string[] = []

function freshRepo(): string {
  const dir = createTmpRepo()
  tmpDirs.push(dir)
  return dir
}

afterAll(() => {
  for (const d of tmpDirs) {
    fs.rmSync(d, { recursive: true, force: true })
  }
})

// ---- getRepoStatus ---------------------------------------------------------

describe('getRepoStatus (integration)', () => {
  it('returns correct FileStatus M for a modified (unstaged) file', async () => {
    const repoPath = freshRepo()
    // Modify a tracked file without staging
    fs.writeFileSync(path.join(repoPath, 'README.md'), '# Modified\n')

    const status = await getRepoStatus(repoPath)

    const file = status.files.find(f => f.path === 'README.md')
    expect(file).toBeDefined()
    expect(file!.status).toBe('M')
    expect(file!.staged).toBe(false)
  })

  it('returns ? for an untracked file', async () => {
    const repoPath = freshRepo()
    fs.writeFileSync(path.join(repoPath, 'untracked.ts'), 'const x = 1\n')

    const status = await getRepoStatus(repoPath)

    const file = status.files.find(f => f.path === 'untracked.ts')
    expect(file).toBeDefined()
    expect(file!.status).toBe('?')
    expect(file!.staged).toBe(false)
  })

  it('returns A for a newly staged file', async () => {
    const repoPath = freshRepo()
    fs.writeFileSync(path.join(repoPath, 'new-file.ts'), 'export const x = 1\n')
    execSync('git add new-file.ts', { cwd: repoPath })

    const status = await getRepoStatus(repoPath)

    const file = status.files.find(f => f.path === 'new-file.ts')
    expect(file).toBeDefined()
    expect(file!.status).toBe('A')
    expect(file!.staged).toBe(true)
  })

  it('returns D for a deleted (staged) file', async () => {
    const repoPath = freshRepo()
    execSync('git rm README.md', { cwd: repoPath })

    const status = await getRepoStatus(repoPath)

    const file = status.files.find(f => f.path === 'README.md')
    expect(file).toBeDefined()
    expect(file!.status).toBe('D')
  })

  it('reports isDirty as true when changes exist', async () => {
    const repoPath = freshRepo()
    fs.writeFileSync(path.join(repoPath, 'README.md'), '# Changed\n')

    const status = await getRepoStatus(repoPath)
    expect(status.isDirty).toBe(true)
  })

  it('reports isDirty as false on a clean repo', async () => {
    const repoPath = freshRepo()

    const status = await getRepoStatus(repoPath)
    expect(status.isDirty).toBe(false)
    expect(status.files).toHaveLength(0)
  })

  it('returns correct branch name', async () => {
    const repoPath = freshRepo()
    // Determine the default branch name (could be main or master)
    const defaultBranch = execSync('git rev-parse --abbrev-ref HEAD', { cwd: repoPath })
      .toString()
      .trim()

    const status = await getRepoStatus(repoPath)
    expect(status.branch).toBe(defaultBranch)
  })

  it('returns correct repo name from path basename', async () => {
    const repoPath = freshRepo()
    const status = await getRepoStatus(repoPath)
    expect(status.name).toBe(path.basename(repoPath))
  })
})

// ---- stageFile -------------------------------------------------------------

describe('stageFile (integration)', () => {
  it('stages a specific file — status changes from ? to A', async () => {
    const repoPath = freshRepo()
    fs.writeFileSync(path.join(repoPath, 'to-stage.ts'), 'const a = 1\n')

    await stageFile(repoPath, 'to-stage.ts')

    const status = await getRepoStatus(repoPath)
    const file = status.files.find(f => f.path === 'to-stage.ts')
    expect(file).toBeDefined()
    expect(file!.staged).toBe(true)
    expect(file!.status).toBe('A')
  })

  it('stages a modified tracked file', async () => {
    const repoPath = freshRepo()
    fs.writeFileSync(path.join(repoPath, 'README.md'), '# Updated\n')

    await stageFile(repoPath, 'README.md')

    const status = await getRepoStatus(repoPath)
    const file = status.files.find(f => f.path === 'README.md')
    expect(file).toBeDefined()
    expect(file!.staged).toBe(true)
    expect(file!.status).toBe('M')
  })
})

// ---- unstageFile -----------------------------------------------------------

describe('unstageFile (integration)', () => {
  it('unstages a staged file — it becomes unstaged again', async () => {
    const repoPath = freshRepo()
    // Modify a tracked file and stage it
    fs.writeFileSync(path.join(repoPath, 'README.md'), '# Updated\n')
    execSync('git add README.md', { cwd: repoPath })

    await unstageFile(repoPath, 'README.md')

    const status = await getRepoStatus(repoPath)
    const file = status.files.find(f => f.path === 'README.md')
    expect(file).toBeDefined()
    expect(file!.staged).toBe(false)
  })
})

// ---- stageAll --------------------------------------------------------------

describe('stageAll (integration)', () => {
  it('stages all changes including new and modified files', async () => {
    const repoPath = freshRepo()

    // A modified tracked file
    fs.writeFileSync(path.join(repoPath, 'README.md'), '# Modified\n')
    // A new untracked file
    fs.writeFileSync(path.join(repoPath, 'new.ts'), 'export {}\n')

    await stageAll(repoPath)

    const status = await getRepoStatus(repoPath)
    const stagedFiles = status.files.filter(f => f.staged)
    expect(stagedFiles.length).toBeGreaterThanOrEqual(2)

    const readme = status.files.find(f => f.path === 'README.md')
    const newFile = status.files.find(f => f.path === 'new.ts')
    expect(readme!.staged).toBe(true)
    expect(newFile!.staged).toBe(true)
  })

  it('results in a clean status after stageAll + commit', async () => {
    const repoPath = freshRepo()
    fs.writeFileSync(path.join(repoPath, 'README.md'), '# v2\n')

    await stageAll(repoPath)
    await commitRepo(repoPath, 'chore: update readme')

    const status = await getRepoStatus(repoPath)
    expect(status.isDirty).toBe(false)
  })
})

// ---- getDiff ---------------------------------------------------------------

describe('getDiff (integration)', () => {
  it('returns non-empty diff for a modified file', async () => {
    const repoPath = freshRepo()
    fs.writeFileSync(path.join(repoPath, 'README.md'), '# Changed content\nNew line\n')
    execSync('git add README.md', { cwd: repoPath })

    const diff = await getDiff(repoPath, 'README.md')

    expect(diff.length).toBeGreaterThan(0)
    expect(diff).toContain('README.md')
  })

  it('returns content as diff for an untracked file', async () => {
    const repoPath = freshRepo()
    fs.writeFileSync(path.join(repoPath, 'untracked.ts'), 'const value = 42\n')

    const diff = await getDiff(repoPath, 'untracked.ts')

    expect(diff.length).toBeGreaterThan(0)
    expect(diff).toContain('42')
  })

  it('returns full repo diff when no filePath provided', async () => {
    const repoPath = freshRepo()
    fs.writeFileSync(path.join(repoPath, 'README.md'), '# Changed\n')
    execSync('git add README.md', { cwd: repoPath })
    fs.writeFileSync(path.join(repoPath, 'another.ts'), 'const x = 1\n')

    const diff = await getDiff(repoPath)

    expect(diff.length).toBeGreaterThan(0)
  })

  it('returns empty string when there are no changes', async () => {
    const repoPath = freshRepo()

    const diff = await getDiff(repoPath)
    expect(diff.trim()).toBe('')
  })
})

// ---- commitRepo ------------------------------------------------------------

describe('commitRepo (integration)', () => {
  it('creates a commit visible in git log', async () => {
    const repoPath = freshRepo()
    fs.writeFileSync(path.join(repoPath, 'README.md'), '# Committed\n')
    execSync('git add .', { cwd: repoPath })

    await commitRepo(repoPath, 'feat: add content to readme')

    const log = execSync('git log --oneline -1', { cwd: repoPath }).toString()
    expect(log).toContain('feat: add content to readme')
  })

  it('advances HEAD after commit', async () => {
    const repoPath = freshRepo()
    const headBefore = execSync('git rev-parse HEAD', { cwd: repoPath }).toString().trim()

    fs.writeFileSync(path.join(repoPath, 'README.md'), '# New\n')
    execSync('git add .', { cwd: repoPath })
    await commitRepo(repoPath, 'chore: update')

    const headAfter = execSync('git rev-parse HEAD', { cwd: repoPath }).toString().trim()
    expect(headAfter).not.toBe(headBefore)
  })

  it('results in a clean working tree after staging all and committing', async () => {
    const repoPath = freshRepo()
    fs.writeFileSync(path.join(repoPath, 'src.ts'), 'export const x = 1\n')
    execSync('git add .', { cwd: repoPath })

    await commitRepo(repoPath, 'feat: add src file')

    const status = await getRepoStatus(repoPath)
    expect(status.isDirty).toBe(false)
  })
})
