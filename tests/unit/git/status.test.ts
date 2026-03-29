import { simpleGit } from 'simple-git'
import type { SimpleGit, StatusResult } from 'simple-git'
import { getRepoStatus, getAllStatuses } from '@main/git/status'

// ---- mock simple-git -------------------------------------------------------

jest.mock('simple-git')

const mockSimpleGit = simpleGit as jest.MockedFunction<typeof simpleGit>

// Shared mock git instance returned by every simpleGit() call
const mockGit = {
  revparse: jest.fn(),
  raw: jest.fn(),
  status: jest.fn(),
}

beforeEach(() => {
  jest.clearAllMocks()
  mockSimpleGit.mockReturnValue(mockGit as unknown as SimpleGit)
})

// ---- helper ----------------------------------------------------------------

function buildStatusResult(overrides: Partial<StatusResult> = {}): StatusResult {
  return {
    not_added: [],
    conflicted: [],
    created: [],
    deleted: [],
    ignored: null as unknown as never,
    modified: [],
    renamed: [],
    staged: [],
    files: [],
    ahead: 0,
    behind: 0,
    current: 'main',
    tracking: 'origin/main',
    detached: false,
    isClean: () => true,
    ...overrides,
  } as StatusResult
}

// ---- tests -----------------------------------------------------------------

describe('getRepoStatus', () => {
  const REPO_PATH = '/fake/repos/my-project'

  it('returns the correct repo name from the directory basename', async () => {
    mockGit.revparse.mockResolvedValue('main\n')
    mockGit.status.mockResolvedValue(buildStatusResult())

    const result = await getRepoStatus(REPO_PATH)
    expect(result.name).toBe('my-project')
    expect(result.rootPath).toBe(REPO_PATH)
  })

  it('returns correct branch name', async () => {
    mockGit.revparse.mockResolvedValue('feature/my-branch\n')
    mockGit.status.mockResolvedValue(buildStatusResult())

    const result = await getRepoStatus(REPO_PATH)
    expect(result.branch).toBe('feature/my-branch')
  })

  it('falls back to HEAD when revparse throws', async () => {
    mockGit.revparse.mockRejectedValue(new Error('detached HEAD'))
    mockGit.raw.mockRejectedValue(new Error('no HEAD'))
    mockGit.status.mockResolvedValue(buildStatusResult())

    const result = await getRepoStatus(REPO_PATH)
    expect(result.branch).toBe('HEAD')
  })

  it('isDirty is false when no files changed', async () => {
    mockGit.revparse.mockResolvedValue('main\n')
    mockGit.status.mockResolvedValue(buildStatusResult({ files: [], staged: [] }))

    const result = await getRepoStatus(REPO_PATH)
    expect(result.isDirty).toBe(false)
    expect(result.files).toHaveLength(0)
  })

  it('isDirty is true when files are present', async () => {
    mockGit.revparse.mockResolvedValue('main\n')
    mockGit.status.mockResolvedValue(buildStatusResult({
      staged: ['src/index.ts'],
      files: [{ path: 'src/index.ts', index: 'M', working_dir: ' ', from: '' }],
    }))

    const result = await getRepoStatus(REPO_PATH)
    expect(result.isDirty).toBe(true)
  })

  it('maps modified (M) staged file correctly', async () => {
    mockGit.revparse.mockResolvedValue('main\n')
    mockGit.status.mockResolvedValue(buildStatusResult({
      staged: ['src/app.ts'],
      files: [{ path: 'src/app.ts', index: 'M', working_dir: ' ', from: '' }],
    }))

    const result = await getRepoStatus(REPO_PATH)
    const file = result.files.find(f => f.path === 'src/app.ts')
    expect(file).toBeDefined()
    expect(file!.status).toBe('M')
    expect(file!.staged).toBe(true)
  })

  it('maps untracked (?) file correctly', async () => {
    mockGit.revparse.mockResolvedValue('main\n')
    mockGit.status.mockResolvedValue(buildStatusResult({
      staged: [],
      files: [{ path: 'new-file.ts', index: '?', working_dir: '?', from: '' }],
    }))

    const result = await getRepoStatus(REPO_PATH)
    const file = result.files.find(f => f.path === 'new-file.ts')
    expect(file).toBeDefined()
    expect(file!.status).toBe('?')
    expect(file!.staged).toBe(false)
  })

  it('maps added (A) staged file correctly', async () => {
    mockGit.revparse.mockResolvedValue('main\n')
    mockGit.status.mockResolvedValue(buildStatusResult({
      staged: ['brand-new.ts'],
      files: [{ path: 'brand-new.ts', index: 'A', working_dir: ' ', from: '' }],
    }))

    const result = await getRepoStatus(REPO_PATH)
    const file = result.files.find(f => f.path === 'brand-new.ts')
    expect(file).toBeDefined()
    expect(file!.status).toBe('A')
    expect(file!.staged).toBe(true)
  })

  it('maps deleted (D) file correctly', async () => {
    mockGit.revparse.mockResolvedValue('main\n')
    mockGit.status.mockResolvedValue(buildStatusResult({
      staged: ['old-file.ts'],
      files: [{ path: 'old-file.ts', index: 'D', working_dir: ' ', from: '' }],
    }))

    const result = await getRepoStatus(REPO_PATH)
    const file = result.files.find(f => f.path === 'old-file.ts')
    expect(file).toBeDefined()
    expect(file!.status).toBe('D')
  })

  it('maps renamed (R) staged file correctly', async () => {
    mockGit.revparse.mockResolvedValue('main\n')
    mockGit.status.mockResolvedValue(buildStatusResult({
      staged: ['new-name.ts'],
      files: [{ path: 'new-name.ts', index: 'R', working_dir: ' ', from: 'old-name.ts' }],
    }))

    const result = await getRepoStatus(REPO_PATH)
    const file = result.files.find(f => f.path === 'new-name.ts')
    expect(file).toBeDefined()
    expect(file!.status).toBe('R')
  })

  it('maps unstaged modified file (working_dir = M) correctly', async () => {
    mockGit.revparse.mockResolvedValue('main\n')
    mockGit.status.mockResolvedValue(buildStatusResult({
      staged: [],
      files: [{ path: 'src/utils.ts', index: ' ', working_dir: 'M', from: '' }],
    }))

    const result = await getRepoStatus(REPO_PATH)
    const file = result.files.find(f => f.path === 'src/utils.ts')
    expect(file).toBeDefined()
    expect(file!.status).toBe('M')
    expect(file!.staged).toBe(false)
  })

  it('does not duplicate files that are already staged', async () => {
    mockGit.revparse.mockResolvedValue('main\n')
    mockGit.status.mockResolvedValue(buildStatusResult({
      staged: ['src/dup.ts'],
      files: [
        { path: 'src/dup.ts', index: 'M', working_dir: ' ', from: '' },
      ],
    }))

    const result = await getRepoStatus(REPO_PATH)
    const matches = result.files.filter(f => f.path === 'src/dup.ts')
    expect(matches).toHaveLength(1)
  })
})

// ---- getAllStatuses ---------------------------------------------------------

describe('getAllStatuses', () => {
  const REPO_A = '/fake/repos/repo-a'
  const REPO_B = '/fake/repos/repo-b'

  it('filters files matching ignorePatterns', async () => {
    mockGit.revparse.mockResolvedValue('main\n')
    mockGit.status.mockResolvedValue(buildStatusResult({
      staged: ['package-lock.json', 'src/index.ts'],
      files: [
        { path: 'package-lock.json', index: 'M', working_dir: ' ', from: '' },
        { path: 'src/index.ts', index: 'M', working_dir: ' ', from: '' },
      ],
    }))

    const statuses = await getAllStatuses([REPO_A], ['package-lock.json'])
    const files = statuses[0].files
    expect(files.some(f => f.path === 'package-lock.json')).toBe(false)
    expect(files.some(f => f.path === 'src/index.ts')).toBe(true)
  })

  it('sets isDirty to false after filtering removes all files', async () => {
    mockGit.revparse.mockResolvedValue('main\n')
    mockGit.status.mockResolvedValue(buildStatusResult({
      staged: ['package-lock.json'],
      files: [{ path: 'package-lock.json', index: 'M', working_dir: ' ', from: '' }],
    }))

    const statuses = await getAllStatuses([REPO_A], ['*.lock', 'package-lock.json'])
    expect(statuses[0].isDirty).toBe(false)
  })

  it('filters with glob wildcard pattern', async () => {
    mockGit.revparse.mockResolvedValue('main\n')
    mockGit.status.mockResolvedValue(buildStatusResult({
      staged: ['yarn.lock', 'src/main.ts'],
      files: [
        { path: 'yarn.lock', index: 'M', working_dir: ' ', from: '' },
        { path: 'src/main.ts', index: 'M', working_dir: ' ', from: '' },
      ],
    }))

    const statuses = await getAllStatuses([REPO_A], ['*.lock'])
    expect(statuses[0].files.map(f => f.path)).not.toContain('yarn.lock')
    expect(statuses[0].files.map(f => f.path)).toContain('src/main.ts')
  })

  it('skips repos that throw during getRepoStatus', async () => {
    mockGit.revparse.mockResolvedValue('main\n')
    // First call succeeds, second throws
    mockGit.status
      .mockResolvedValueOnce(buildStatusResult())
      .mockRejectedValueOnce(new Error('git not found'))

    const statuses = await getAllStatuses([REPO_A, REPO_B], [])
    // Only one result (the successful one)
    expect(statuses).toHaveLength(1)
  })

  it('returns empty array when all repos fail', async () => {
    mockGit.revparse.mockRejectedValue(new Error('fail'))
    mockGit.raw.mockRejectedValue(new Error('fail'))
    mockGit.status.mockRejectedValue(new Error('fail'))

    const statuses = await getAllStatuses([REPO_A, REPO_B], [])
    expect(statuses).toHaveLength(0)
  })

  it('returns an entry for each healthy repo', async () => {
    mockGit.revparse.mockResolvedValue('main\n')
    mockGit.status.mockResolvedValue(buildStatusResult())

    const statuses = await getAllStatuses([REPO_A, REPO_B], [])
    expect(statuses).toHaveLength(2)
  })
})
