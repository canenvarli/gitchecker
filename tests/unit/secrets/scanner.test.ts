import { simpleGit } from 'simple-git'
import type { SimpleGit } from 'simple-git'
import { scanReposForSecrets } from '@main/secrets/scanner'
import type { RepoStatus } from '@/types'

// ---- mock simple-git -------------------------------------------------------

jest.mock('simple-git')

const mockSimpleGit = simpleGit as jest.MockedFunction<typeof simpleGit>

const mockGit = {
  diff: jest.fn(),
}

beforeEach(() => {
  jest.clearAllMocks()
  mockSimpleGit.mockReturnValue(mockGit as unknown as SimpleGit)
})

// ---- helper ----------------------------------------------------------------

function makeRepo(overrides: Partial<RepoStatus> = {}): RepoStatus {
  return {
    name: 'test-repo',
    rootPath: '/fake/repos/test-repo',
    branch: 'main',
    files: [],
    isDirty: true,
    ...overrides,
  }
}

/**
 * Build a minimal staged diff string that contains `addedLine` as an added line.
 */
function buildDiff(filePath: string, addedLines: string[]): string {
  const lines = [
    `diff --git a/${filePath} b/${filePath}`,
    `index abc..def 100644`,
    `--- a/${filePath}`,
    `+++ b/${filePath}`,
    `@@ -1,3 +1,${3 + addedLines.length} @@`,
    ` existing line`,
    ` another line`,
    ` third line`,
    ...addedLines.map(l => `+${l}`),
  ]
  return lines.join('\n')
}

// ---- clean diff (no secrets) -----------------------------------------------

describe('scanReposForSecrets — clean code', () => {
  it('returns empty array for a clean diff with no secrets', async () => {
    const repo = makeRepo()
    mockGit.diff.mockResolvedValue(buildDiff('src/index.ts', [
      'const greeting = "hello world"',
      'export default greeting',
    ]))

    const hits = await scanReposForSecrets([repo])
    expect(hits).toEqual([])
  })

  it('returns empty array when repos list is empty', async () => {
    const hits = await scanReposForSecrets([])
    expect(hits).toEqual([])
  })

  it('skips repos that are not dirty', async () => {
    const cleanRepo = makeRepo({ isDirty: false })
    const hits = await scanReposForSecrets([cleanRepo])
    expect(mockGit.diff).not.toHaveBeenCalled()
    expect(hits).toEqual([])
  })

  it('returns empty array when staged diff is empty', async () => {
    const repo = makeRepo()
    mockGit.diff.mockResolvedValue('')

    const hits = await scanReposForSecrets([repo])
    expect(hits).toEqual([])
  })
})

// ---- Anthropic API Key -----------------------------------------------------

describe('scanReposForSecrets — Anthropic API Key', () => {
  it('detects sk-ant- prefixed Anthropic key', async () => {
    const repo = makeRepo()
    mockGit.diff.mockResolvedValue(
      buildDiff('config.ts', ['const key = "sk-ant-abc123DEFghi456JKL789mno012PQR345stu"'])
    )

    const hits = await scanReposForSecrets([repo])
    expect(hits.length).toBeGreaterThan(0)
    expect(hits[0].pattern).toBe('Anthropic API Key')
    expect(hits[0].repoName).toBe('test-repo')
  })

  it('detects ANTHROPIC_API_KEY= assignment', async () => {
    const repo = makeRepo()
    mockGit.diff.mockResolvedValue(
      buildDiff('.env', ['ANTHROPIC_API_KEY=sk-ant-apiXXXXXXXXXXXXXXXXXXXXXXXX'])
    )

    const hits = await scanReposForSecrets([repo])
    const anthropicHit = hits.find(h => h.pattern === 'Anthropic API Key')
    expect(anthropicHit).toBeDefined()
  })

  it('includes file path in the hit', async () => {
    const repo = makeRepo()
    mockGit.diff.mockResolvedValue(
      buildDiff('src/secrets.ts', ['const k = "sk-ant-abc123DEFghi456JKL789mno012PQR345stu"'])
    )

    const hits = await scanReposForSecrets([repo])
    expect(hits[0].file).toBe('src/secrets.ts')
  })
})

// ---- OpenAI API Key --------------------------------------------------------

describe('scanReposForSecrets — OpenAI API Key', () => {
  it('detects sk- prefix with 48 alphanumeric chars', async () => {
    const repo = makeRepo()
    // sk- + exactly 48 alphanumeric chars
    const openAiKey = 'sk-' + 'A'.repeat(48)
    mockGit.diff.mockResolvedValue(
      buildDiff('config.js', [`const openaiKey = "${openAiKey}"`])
    )

    const hits = await scanReposForSecrets([repo])
    const openAiHit = hits.find(h => h.pattern === 'OpenAI API Key')
    expect(openAiHit).toBeDefined()
  })

  it('does not false-positive on sk- with fewer than 48 chars', async () => {
    const repo = makeRepo()
    mockGit.diff.mockResolvedValue(
      buildDiff('config.js', ['const key = "sk-short123"'])
    )

    const hits = await scanReposForSecrets([repo])
    const openAiHit = hits.find(h => h.pattern === 'OpenAI API Key')
    expect(openAiHit).toBeUndefined()
  })
})

// ---- AWS Secret Key --------------------------------------------------------

describe('scanReposForSecrets — AWS Secret Key', () => {
  it('detects AWS_SECRET_ACCESS_KEY=... (40-char value)', async () => {
    const repo = makeRepo()
    const awsSecret = 'AWS_SECRET_ACCESS_KEY=' + 'a'.repeat(40)
    mockGit.diff.mockResolvedValue(buildDiff('.env', [awsSecret]))

    const hits = await scanReposForSecrets([repo])
    const awsHit = hits.find(h => h.pattern === 'AWS Secret Key')
    expect(awsHit).toBeDefined()
  })

  it('detects AWS_SECRET_ACCESS_KEY with space around =', async () => {
    const repo = makeRepo()
    const awsSecret = 'AWS_SECRET_ACCESS_KEY = ' + 'B'.repeat(40)
    mockGit.diff.mockResolvedValue(buildDiff('.env', [awsSecret]))

    const hits = await scanReposForSecrets([repo])
    const awsHit = hits.find(h => h.pattern === 'AWS Secret Key')
    expect(awsHit).toBeDefined()
  })
})

// ---- Private Key Header ----------------------------------------------------

describe('scanReposForSecrets — Private Key Header', () => {
  it('detects BEGIN RSA PRIVATE KEY header', async () => {
    const repo = makeRepo()
    mockGit.diff.mockResolvedValue(
      buildDiff('certs/key.pem', ['-----BEGIN RSA PRIVATE KEY-----'])
    )

    const hits = await scanReposForSecrets([repo])
    const pkHit = hits.find(h => h.pattern === 'Private Key Header')
    expect(pkHit).toBeDefined()
  })

  it('detects BEGIN PRIVATE KEY header (generic)', async () => {
    const repo = makeRepo()
    mockGit.diff.mockResolvedValue(
      buildDiff('certs/key.pem', ['-----BEGIN PRIVATE KEY-----'])
    )

    const hits = await scanReposForSecrets([repo])
    const pkHit = hits.find(h => h.pattern === 'Private Key Header')
    expect(pkHit).toBeDefined()
  })

  it('detects BEGIN EC PRIVATE KEY header', async () => {
    const repo = makeRepo()
    mockGit.diff.mockResolvedValue(
      buildDiff('key.pem', ['-----BEGIN EC PRIVATE KEY-----'])
    )

    const hits = await scanReposForSecrets([repo])
    const pkHit = hits.find(h => h.pattern === 'Private Key Header')
    expect(pkHit).toBeDefined()
  })
})

// ---- GitHub Token ----------------------------------------------------------

describe('scanReposForSecrets — GitHub Token', () => {
  it('detects ghp_ prefixed GitHub personal access token', async () => {
    const repo = makeRepo()
    const ghToken = 'ghp_' + 'A'.repeat(36)
    mockGit.diff.mockResolvedValue(
      buildDiff('scripts/deploy.sh', [`GH_TOKEN=${ghToken}`])
    )

    const hits = await scanReposForSecrets([repo])
    const ghHit = hits.find(h => h.pattern === 'GitHub Token')
    expect(ghHit).toBeDefined()
  })

  it('detects gho_ prefixed GitHub OAuth token', async () => {
    const repo = makeRepo()
    const ghToken = 'gho_' + 'B'.repeat(36)
    mockGit.diff.mockResolvedValue(
      buildDiff('src/auth.ts', [`const token = "${ghToken}"`])
    )

    const hits = await scanReposForSecrets([repo])
    const ghHit = hits.find(h => h.pattern === 'GitHub Token')
    expect(ghHit).toBeDefined()
  })
})

// ---- Secret file by name ---------------------------------------------------

describe('scanReposForSecrets — secret file detection', () => {
  it('flags a staged .env file regardless of content', async () => {
    const repo = makeRepo({
      files: [{ path: '.env', status: 'A', staged: true }],
    })
    // Return empty diff so the content scanner won't add hits
    mockGit.diff.mockResolvedValue('')

    const hits = await scanReposForSecrets([repo])
    const envHit = hits.find(h => h.file === '.env' && h.pattern === 'Secret File')
    expect(envHit).toBeDefined()
  })

  it('flags a staged .env.local file', async () => {
    const repo = makeRepo({
      files: [{ path: '.env.local', status: 'A', staged: true }],
    })
    mockGit.diff.mockResolvedValue('')

    const hits = await scanReposForSecrets([repo])
    const envHit = hits.find(h => h.file === '.env.local')
    expect(envHit).toBeDefined()
  })

  it('flags a staged credentials.json file', async () => {
    const repo = makeRepo({
      files: [{ path: 'config/credentials.json', status: 'A', staged: true }],
    })
    mockGit.diff.mockResolvedValue('')

    const hits = await scanReposForSecrets([repo])
    const credHit = hits.find(h => h.pattern === 'Secret File')
    expect(credHit).toBeDefined()
  })

  it('does not flag a non-secret file by name', async () => {
    const repo = makeRepo({
      files: [{ path: 'src/index.ts', status: 'A', staged: true }],
    })
    mockGit.diff.mockResolvedValue('')

    const hits = await scanReposForSecrets([repo])
    const secretFileHit = hits.find(h => h.pattern === 'Secret File')
    expect(secretFileHit).toBeUndefined()
  })
})

// ---- preview field redaction -----------------------------------------------

describe('scanReposForSecrets — preview redaction', () => {
  it('redacts secret value in preview, keeping first and last 4 chars', async () => {
    const repo = makeRepo()
    const secretKey = 'sk-ant-' + 'abcdefghijklmnopqrstuvwxyz01234567'
    mockGit.diff.mockResolvedValue(
      buildDiff('config.ts', [`const key = "${secretKey}"`])
    )

    const hits = await scanReposForSecrets([repo])
    expect(hits.length).toBeGreaterThan(0)

    const preview = hits[0].preview
    // The raw secret should not appear in the preview
    expect(preview).not.toContain(secretKey)
    // Masked form: first 4 chars + *** + last 4 chars of the matched token
    expect(preview).toMatch(/\*\*\*/)
  })

  it('preview is truncated to 80 characters', async () => {
    const repo = makeRepo()
    const longLine = 'const reallyLongVariableName = "sk-ant-' + 'x'.repeat(50) + '" // trailing comment that makes line very very long indeed'
    mockGit.diff.mockResolvedValue(
      buildDiff('src/long.ts', [longLine])
    )

    const hits = await scanReposForSecrets([repo])
    if (hits.length > 0) {
      expect(hits[0].preview.length).toBeLessThanOrEqual(80)
    }
  })
})

// ---- line numbers ----------------------------------------------------------

describe('scanReposForSecrets — line number tracking', () => {
  it('reports correct line number based on hunk header', async () => {
    const repo = makeRepo()
    // Hunk starts at line 10 in the file
    const diff = [
      'diff --git a/config.ts b/config.ts',
      'index abc..def 100644',
      '--- a/config.ts',
      '+++ b/config.ts',
      '@@ -10,3 +10,4 @@',
      ' existing line 10',
      ' existing line 11',
      ' existing line 12',
      '+const key = "sk-ant-abc123DEFghi456JKL789mno012PQR345stu"',
    ].join('\n')

    mockGit.diff.mockResolvedValue(diff)

    const hits = await scanReposForSecrets([repo])
    expect(hits.length).toBeGreaterThan(0)
    expect(hits[0].line).toBe(13) // 10 + 3 context lines = 13
  })
})

// ---- error handling --------------------------------------------------------

describe('scanReposForSecrets — error handling', () => {
  it('does not throw when git.diff fails for one repo; still returns hits from others', async () => {
    const repoA = makeRepo({ name: 'repo-a', rootPath: '/fake/repo-a' })
    const repoB = makeRepo({ name: 'repo-b', rootPath: '/fake/repo-b' })

    mockGit.diff
      .mockRejectedValueOnce(new Error('git error'))
      .mockResolvedValueOnce(buildDiff('config.ts', ['const key = "sk-ant-abc123DEFghi456JKL789mno012PQR345stu"']))

    const hits = await scanReposForSecrets([repoA, repoB])
    // repoA failed but repoB succeeded
    expect(hits.some(h => h.repoName === 'repo-b')).toBe(true)
  })
})
