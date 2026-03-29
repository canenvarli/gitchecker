import { invokeClaude } from './cli'
import { getDiff } from '../git/operations'

const CONVENTIONAL_TYPES = ['feat', 'fix', 'chore', 'refactor', 'docs', 'test', 'style', 'build', 'ci', 'perf']

export async function generateCommitMessage(
  repoPath: string,
  repoName: string,
): Promise<string> {
  let diff: string
  try {
    diff = await getDiff(repoPath)
  } catch {
    return `chore(${repoName}): update files`
  }

  if (!diff.trim()) {
    return `chore(${repoName}): update files`
  }

  // Truncate very large diffs to avoid token limits
  const maxDiffLength = 8_000
  const truncatedDiff = diff.length > maxDiffLength
    ? diff.slice(0, maxDiffLength) + '\n... (diff truncated)'
    : diff

  const prompt = `Generate a git commit message for the following diff in the repository "${repoName}".

Requirements:
- Use conventional commit format: type(scope): description
- Valid types: ${CONVENTIONAL_TYPES.join(', ')}
- Scope should be the main module/component/file affected (optional but preferred)
- Description: imperative mood, lowercase, no period at end, specific about what changed
- Keep the entire message under 72 characters
- Output ONLY the commit message — no explanation, no quotes, no markdown
- 1 line only — no body

Diff:
${truncatedDiff}

Commit message:`

  const result = await invokeClaude(prompt, 30_000)

  // Validate and clean up
  const cleaned = cleanCommitMessage(result, repoName)
  return cleaned
}

function cleanCommitMessage(raw: string, repoName: string): string {
  // Take only the first line
  const firstLine = raw.split('\n')[0].trim()

  // Strip surrounding quotes if any
  const unquoted = firstLine.replace(/^["'`]|["'`]$/g, '').trim()

  if (!unquoted) {
    return `chore(${repoName}): update files`
  }

  // Check if it starts with a valid conventional commit type
  const hasValidType = CONVENTIONAL_TYPES.some(t =>
    unquoted.startsWith(t + ':') || unquoted.startsWith(t + '(')
  )

  if (!hasValidType) {
    // Try to wrap it as chore
    const truncated = unquoted.slice(0, 60)
    return `chore: ${truncated}`
  }

  // Ensure under 72 chars
  if (unquoted.length > 72) {
    return unquoted.slice(0, 72)
  }

  return unquoted
}
