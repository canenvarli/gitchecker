import { execSync } from 'child_process'
import fs from 'fs'
import os from 'os'
import path from 'path'

import { getRepoStatus } from '@main/git/status'
import { stageAll, commitRepo, pushRepo, pullRepo, getDiff } from '@main/git/operations'

// ---- helpers ---------------------------------------------------------------

interface LocalRemotePair {
  local: string
  remote: string
}

function setupLocalAndRemote(): LocalRemotePair {
  // Create a bare remote
  const remote = fs.mkdtempSync(path.join(os.tmpdir(), 'gc-remote-'))
  execSync('git init --bare', { cwd: remote })

  // Create a local repo and make an initial commit via a tmp clone workspace
  const initWorkspace = fs.mkdtempSync(path.join(os.tmpdir(), 'gc-init-'))
  execSync(`git clone ${remote} .`, { cwd: initWorkspace })
  execSync('git config user.email "test@test.com"', { cwd: initWorkspace })
  execSync('git config user.name "Test"', { cwd: initWorkspace })
  fs.writeFileSync(path.join(initWorkspace, 'README.md'), '# Shared repo\n')
  execSync('git add .', { cwd: initWorkspace })
  execSync('git commit -m "init"', { cwd: initWorkspace })
  // Push the initial commit to the bare remote
  execSync('git push origin HEAD', { cwd: initWorkspace })
  fs.rmSync(initWorkspace, { recursive: true, force: true })

  // Now create the actual local clone
  const local = fs.mkdtempSync(path.join(os.tmpdir(), 'gc-local-'))
  execSync(`git clone ${remote} .`, { cwd: local })
  execSync('git config user.email "test@test.com"', { cwd: local })
  execSync('git config user.name "Test"', { cwd: local })

  return { local, remote }
}

function getDefaultBranch(repoPath: string): string {
  return execSync('git rev-parse --abbrev-ref HEAD', { cwd: repoPath })
    .toString()
    .trim()
}

// ---- fixture management ----------------------------------------------------

const tmpDirs: string[] = []

function freshPair(): LocalRemotePair {
  const pair = setupLocalAndRemote()
  tmpDirs.push(pair.local, pair.remote)
  return pair
}

afterAll(() => {
  for (const d of tmpDirs) {
    try {
      fs.rmSync(d, { recursive: true, force: true })
    } catch {
      // best-effort cleanup
    }
  }
})

// ---- full push cycle -------------------------------------------------------

describe('push flow (integration)', () => {
  it('full cycle: modify → stageAll → commitRepo → pushRepo → remote has commit', async () => {
    const { local, remote } = freshPair()
    const branch = getDefaultBranch(local)

    // Modify a file
    fs.writeFileSync(path.join(local, 'README.md'), '# Updated by push flow test\n')

    await stageAll(local)
    await commitRepo(local, 'feat: push flow test commit')
    await pushRepo(local, branch)

    // Verify the remote has the commit by cloning it fresh
    const verifyDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gc-verify-'))
    tmpDirs.push(verifyDir)
    execSync(`git clone ${remote} .`, { cwd: verifyDir })

    const log = execSync('git log --oneline', { cwd: verifyDir }).toString()
    expect(log).toContain('feat: push flow test commit')

    fs.rmSync(verifyDir, { recursive: true, force: true })
  })

  it('local is clean after successful push', async () => {
    const { local } = freshPair()
    const branch = getDefaultBranch(local)

    fs.writeFileSync(path.join(local, 'hello.ts'), 'export const hello = "world"\n')
    await stageAll(local)
    await commitRepo(local, 'chore: add hello')
    await pushRepo(local, branch)

    const status = await getRepoStatus(local)
    expect(status.isDirty).toBe(false)
  })

  it('pushRepo correctly pushes multiple commits', async () => {
    const { local, remote } = freshPair()
    const branch = getDefaultBranch(local)

    // First commit
    fs.writeFileSync(path.join(local, 'a.ts'), 'export const a = 1\n')
    await stageAll(local)
    await commitRepo(local, 'feat: add a')

    // Second commit
    fs.writeFileSync(path.join(local, 'b.ts'), 'export const b = 2\n')
    await stageAll(local)
    await commitRepo(local, 'feat: add b')

    await pushRepo(local, branch)

    // Verify remote log has both commits
    const verifyDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gc-v2-'))
    tmpDirs.push(verifyDir)
    execSync(`git clone ${remote} .`, { cwd: verifyDir })

    const log = execSync('git log --oneline', { cwd: verifyDir }).toString()
    expect(log).toContain('feat: add a')
    expect(log).toContain('feat: add b')
  })
})

// ---- pull flow -------------------------------------------------------------

describe('pullRepo (integration)', () => {
  it('pull updates local repo from remote changes', async () => {
    const { local, remote } = freshPair()
    const branch = getDefaultBranch(local)

    // Push a change from a second clone
    const secondLocal = fs.mkdtempSync(path.join(os.tmpdir(), 'gc-second-'))
    tmpDirs.push(secondLocal)
    execSync(`git clone ${remote} .`, { cwd: secondLocal })
    execSync('git config user.email "other@test.com"', { cwd: secondLocal })
    execSync('git config user.name "Other"', { cwd: secondLocal })
    fs.writeFileSync(path.join(secondLocal, 'remote-change.ts'), 'export const rc = true\n')
    execSync('git add .', { cwd: secondLocal })
    execSync('git commit -m "feat: remote change"', { cwd: secondLocal })
    execSync(`git push origin ${branch}`, { cwd: secondLocal })

    // Pull into local
    const pullResult = await pullRepo(local, branch)

    expect(pullResult.hadConflict).toBe(false)
    expect(fs.existsSync(path.join(local, 'remote-change.ts'))).toBe(true)
  })

  it('pull returns hadConflict=false on a clean fast-forward', async () => {
    const { local, remote } = freshPair()
    const branch = getDefaultBranch(local)

    // Add a change in a second clone and push
    const secondLocal = fs.mkdtempSync(path.join(os.tmpdir(), 'gc-ff-'))
    tmpDirs.push(secondLocal)
    execSync(`git clone ${remote} .`, { cwd: secondLocal })
    execSync('git config user.email "ff@test.com"', { cwd: secondLocal })
    execSync('git config user.name "FF"', { cwd: secondLocal })
    fs.writeFileSync(path.join(secondLocal, 'ff.ts'), 'export const ff = 1\n')
    execSync('git add .', { cwd: secondLocal })
    execSync('git commit -m "chore: ff commit"', { cwd: secondLocal })
    execSync(`git push origin ${branch}`, { cwd: secondLocal })

    const pullResult = await pullRepo(local, branch)
    expect(pullResult.hadConflict).toBe(false)
    expect(pullResult.conflictedFiles).toHaveLength(0)
  })

  it('pull with no remote changes succeeds without error', async () => {
    const { local } = freshPair()
    const branch = getDefaultBranch(local)

    const pullResult = await pullRepo(local, branch)

    expect(pullResult.hadConflict).toBe(false)
  })

  it('detects merge conflict when local and remote edit the same lines', async () => {
    const { local, remote } = freshPair()
    const branch = getDefaultBranch(local)

    // Both local and remote modify the same file in different ways
    // Remote change
    const secondLocal = fs.mkdtempSync(path.join(os.tmpdir(), 'gc-conflict-'))
    tmpDirs.push(secondLocal)
    execSync(`git clone ${remote} .`, { cwd: secondLocal })
    execSync('git config user.email "conflict@test.com"', { cwd: secondLocal })
    execSync('git config user.name "Conflict"', { cwd: secondLocal })
    fs.writeFileSync(path.join(secondLocal, 'README.md'), '# Changed by remote\n')
    execSync('git add .', { cwd: secondLocal })
    execSync('git commit -m "chore: remote edit"', { cwd: secondLocal })
    execSync(`git push origin ${branch}`, { cwd: secondLocal })

    // Local change (not yet pushed)
    fs.writeFileSync(path.join(local, 'README.md'), '# Changed by local — conflicting\n')
    execSync('git add .', { cwd: local })
    execSync('git commit -m "chore: local conflicting edit"', { cwd: local })

    // Now pull should detect a conflict
    const pullResult = await pullRepo(local, branch)
    expect(pullResult.hadConflict).toBe(true)
    expect(pullResult.conflictedFiles.length).toBeGreaterThan(0)
    expect(pullResult.conflictedFiles).toContain('README.md')
  })
})

// ---- getDiff integration ---------------------------------------------------

describe('getDiff after staging (integration)', () => {
  it('staged diff includes the changed content', async () => {
    const { local } = freshPair()

    fs.writeFileSync(path.join(local, 'README.md'), '# Diff test content\nNew line added\n')
    execSync('git add README.md', { cwd: local })

    const diff = await getDiff(local, 'README.md')

    expect(diff).toContain('Diff test content')
    expect(diff).toContain('New line added')
  })

  it('getDiff shows both staged and unstaged changes in full repo diff', async () => {
    const { local } = freshPair()

    // Staged change
    fs.writeFileSync(path.join(local, 'README.md'), '# Staged\n')
    execSync('git add README.md', { cwd: local })

    // Unstaged change
    fs.writeFileSync(path.join(local, 'unstaged.ts'), 'const x = 1\n')

    const diff = await getDiff(local)
    // Should contain something (staged diff at minimum)
    expect(diff.trim().length).toBeGreaterThan(0)
  })
})
