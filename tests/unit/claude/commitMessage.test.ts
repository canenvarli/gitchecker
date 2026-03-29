import { generateCommitMessage } from '@main/claude/commitMessage'
import { invokeClaude } from '@main/claude/cli'
import { getDiff } from '@main/git/operations'

// ---- mocks -----------------------------------------------------------------

jest.mock('@main/claude/cli', () => ({
  invokeClaude: jest.fn(),
}))

jest.mock('@main/git/operations', () => ({
  getDiff: jest.fn(),
}))

const mockInvokeClaude = invokeClaude as jest.MockedFunction<typeof invokeClaude>
const mockGetDiff = getDiff as jest.MockedFunction<typeof getDiff>

// ---- helpers ---------------------------------------------------------------

const REPO_PATH = '/fake/repos/my-app'
const REPO_NAME = 'my-app'

const SAMPLE_DIFF = `diff --git a/src/index.ts b/src/index.ts
index abc1234..def5678 100644
--- a/src/index.ts
+++ b/src/index.ts
@@ -1,5 +1,6 @@
 import express from 'express'
+import cors from 'cors'

 const app = express()
+app.use(cors())`

beforeEach(() => {
  jest.clearAllMocks()
})

// ---- tests -----------------------------------------------------------------

describe('generateCommitMessage', () => {
  it('calls getDiff with the repo path', async () => {
    mockGetDiff.mockResolvedValue(SAMPLE_DIFF)
    mockInvokeClaude.mockResolvedValue('feat(api): add cors middleware')

    await generateCommitMessage(REPO_PATH, REPO_NAME)

    expect(mockGetDiff).toHaveBeenCalledWith(REPO_PATH)
  })

  it('includes the diff content in the prompt passed to invokeClaude', async () => {
    mockGetDiff.mockResolvedValue(SAMPLE_DIFF)
    mockInvokeClaude.mockResolvedValue('feat: add cors middleware')

    await generateCommitMessage(REPO_PATH, REPO_NAME)

    const promptArg = mockInvokeClaude.mock.calls[0][0] as string
    expect(promptArg).toContain(SAMPLE_DIFF)
  })

  it('includes the repo name in the prompt', async () => {
    mockGetDiff.mockResolvedValue(SAMPLE_DIFF)
    mockInvokeClaude.mockResolvedValue('feat: some change')

    await generateCommitMessage(REPO_PATH, REPO_NAME)

    const promptArg = mockInvokeClaude.mock.calls[0][0] as string
    expect(promptArg).toContain(REPO_NAME)
  })

  it('prompt requests conventional commit format', async () => {
    mockGetDiff.mockResolvedValue(SAMPLE_DIFF)
    mockInvokeClaude.mockResolvedValue('feat: something')

    await generateCommitMessage(REPO_PATH, REPO_NAME)

    const promptArg = mockInvokeClaude.mock.calls[0][0] as string
    expect(promptArg.toLowerCase()).toContain('conventional commit')
  })

  it('prompt mentions valid conventional commit types', async () => {
    mockGetDiff.mockResolvedValue(SAMPLE_DIFF)
    mockInvokeClaude.mockResolvedValue('feat: something')

    await generateCommitMessage(REPO_PATH, REPO_NAME)

    const promptArg = mockInvokeClaude.mock.calls[0][0] as string
    // At minimum, the prompt should list several types
    expect(promptArg).toContain('feat')
    expect(promptArg).toContain('fix')
    expect(promptArg).toContain('chore')
  })

  it('returns the trimmed/cleaned Claude response', async () => {
    mockGetDiff.mockResolvedValue(SAMPLE_DIFF)
    mockInvokeClaude.mockResolvedValue('  feat(api): add cors support  \n\nsome extra line')

    const result = await generateCommitMessage(REPO_PATH, REPO_NAME)

    // Should be trimmed and only the first line
    expect(result).toBe('feat(api): add cors support')
  })

  it('strips surrounding quotes from Claude response', async () => {
    mockGetDiff.mockResolvedValue(SAMPLE_DIFF)
    mockInvokeClaude.mockResolvedValue('"feat: add feature"')

    const result = await generateCommitMessage(REPO_PATH, REPO_NAME)
    expect(result).toBe('feat: add feature')
  })

  it('strips surrounding backtick quotes from Claude response', async () => {
    mockGetDiff.mockResolvedValue(SAMPLE_DIFF)
    mockInvokeClaude.mockResolvedValue('`fix: correct logic`')

    const result = await generateCommitMessage(REPO_PATH, REPO_NAME)
    expect(result).toBe('fix: correct logic')
  })

  it('returns fallback when invokeClaude returns empty string', async () => {
    mockGetDiff.mockResolvedValue(SAMPLE_DIFF)
    mockInvokeClaude.mockResolvedValue('')

    const result = await generateCommitMessage(REPO_PATH, REPO_NAME)
    expect(result).toBe(`chore(${REPO_NAME}): update files`)
  })

  it('returns fallback when invokeClaude returns only whitespace', async () => {
    mockGetDiff.mockResolvedValue(SAMPLE_DIFF)
    mockInvokeClaude.mockResolvedValue('   \n  ')

    const result = await generateCommitMessage(REPO_PATH, REPO_NAME)
    expect(result).toBe(`chore(${REPO_NAME}): update files`)
  })

  it('returns fallback when diff is empty', async () => {
    mockGetDiff.mockResolvedValue('')

    const result = await generateCommitMessage(REPO_PATH, REPO_NAME)

    // Should not call Claude at all
    expect(mockInvokeClaude).not.toHaveBeenCalled()
    expect(result).toBe(`chore(${REPO_NAME}): update files`)
  })

  it('returns fallback when getDiff throws', async () => {
    mockGetDiff.mockRejectedValue(new Error('git error'))

    const result = await generateCommitMessage(REPO_PATH, REPO_NAME)

    expect(mockInvokeClaude).not.toHaveBeenCalled()
    expect(result).toBe(`chore(${REPO_NAME}): update files`)
  })

  it('wraps non-conventional message in chore: prefix', async () => {
    mockGetDiff.mockResolvedValue(SAMPLE_DIFF)
    // Response without conventional type
    mockInvokeClaude.mockResolvedValue('Added cors to the application')

    const result = await generateCommitMessage(REPO_PATH, REPO_NAME)
    expect(result).toMatch(/^chore: /)
  })

  it('passes a valid conventional commit message through unchanged', async () => {
    mockGetDiff.mockResolvedValue(SAMPLE_DIFF)
    mockInvokeClaude.mockResolvedValue('fix(auth): handle token expiry edge case')

    const result = await generateCommitMessage(REPO_PATH, REPO_NAME)
    expect(result).toBe('fix(auth): handle token expiry edge case')
  })

  it('truncates message longer than 72 characters', async () => {
    mockGetDiff.mockResolvedValue(SAMPLE_DIFF)
    // 73 chars of valid conventional commit
    const longMessage = 'feat: ' + 'x'.repeat(67)  // 6 + 67 = 73 chars
    mockInvokeClaude.mockResolvedValue(longMessage)

    const result = await generateCommitMessage(REPO_PATH, REPO_NAME)
    expect(result.length).toBeLessThanOrEqual(72)
  })

  it('truncates very large diffs before sending to Claude', async () => {
    const hugeDiff = 'x'.repeat(20_000)
    mockGetDiff.mockResolvedValue(hugeDiff)
    mockInvokeClaude.mockResolvedValue('chore: update files')

    await generateCommitMessage(REPO_PATH, REPO_NAME)

    const promptArg = mockInvokeClaude.mock.calls[0][0] as string
    // The prompt should not contain the full 20k diff — it should be truncated
    expect(promptArg).toContain('truncated')
    expect(promptArg.length).toBeLessThan(20_000)
  })

  it('passes the timeout argument to invokeClaude', async () => {
    mockGetDiff.mockResolvedValue(SAMPLE_DIFF)
    mockInvokeClaude.mockResolvedValue('feat: something')

    await generateCommitMessage(REPO_PATH, REPO_NAME)

    const timeoutArg = mockInvokeClaude.mock.calls[0][1] as number
    expect(typeof timeoutArg).toBe('number')
    expect(timeoutArg).toBeGreaterThan(0)
  })
})
