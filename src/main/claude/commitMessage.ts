import { invokeClaude } from './cli'
import { getDiff } from '../git/operations'
import { simpleGit } from 'simple-git'

const CONVENTIONAL_TYPES = ['feat', 'fix', 'chore', 'refactor', 'docs', 'test', 'style', 'build', 'ci', 'perf']

export const DEFAULT_COMMIT_PROMPT = `You are a senior engineer writing a git commit message for the repository "{{repoName}}".

Analyze the diff carefully. Produce a commit message using these rules:

TYPE — pick the most accurate one:
  feat     → new user-facing capability
  fix      → corrects broken or incorrect behavior
  refactor → restructures code with no behavior change
  perf     → measurably improves performance
  docs     → documentation only
  test     → adds or updates tests
  style    → formatting, whitespace, no logic change
  build    → build scripts, tooling, dependencies
  ci       → CI/CD pipeline changes
  chore    → everything else (config, generated files, minor cleanup)

SCOPE — lowercase name of the main module, component, or area changed (optional but preferred).

SUBJECT — imperative mood ("add X" not "added X"), lowercase, no trailing period, under 72 chars total for the first line.

BODY — calibrate to the size of the change:
  Small  (≤2 files, <30 lines changed)  → subject line only, no body
  Medium (3–10 files or 30–150 lines)   → subject + 1–2 sentences explaining the intent
  Large  (>10 files or >150 lines)      → subject + bullet list covering each major area changed

Multi-line format (only for medium/large):
type(scope): subject line

- what changed in area 1
- what changed in area 2

Stats: {{fileCount}} files changed, +{{additions}} −{{deletions}}

Output ONLY the commit message — no explanation, no markdown fences, no surrounding quotes.

Diff:
{{diff}}`

interface DiffStats {
  fileCount: number
  additions: number
  deletions: number
}

async function getDiffStats(repoPath: string): Promise<DiffStats> {
  try {
    const git = simpleGit(repoPath)
    const summary = await git.diffSummary(['HEAD'])
    return {
      fileCount: summary.files.length,
      additions: summary.insertions,
      deletions: summary.deletions,
    }
  } catch {
    return { fileCount: 0, additions: 0, deletions: 0 }
  }
}

export async function generateCommitMessage(
  repoPath: string,
  repoName: string,
  promptTemplate?: string,
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

  const stats = await getDiffStats(repoPath)

  // Truncate very large diffs to avoid token limits
  const maxDiffLength = 12_000
  const truncatedDiff = diff.length > maxDiffLength
    ? diff.slice(0, maxDiffLength) + '\n... (diff truncated)'
    : diff

  const template = promptTemplate?.trim() || DEFAULT_COMMIT_PROMPT

  const prompt = template
    .replace(/\{\{repoName\}\}/g, repoName)
    .replace(/\{\{fileCount\}\}/g, String(stats.fileCount))
    .replace(/\{\{additions\}\}/g, String(stats.additions))
    .replace(/\{\{deletions\}\}/g, String(stats.deletions))
    .replace(/\{\{diff\}\}/g, truncatedDiff)

  const result = await invokeClaude(prompt, 30_000)
  return cleanCommitMessage(result, repoName)
}

function cleanCommitMessage(raw: string, repoName: string): string {
  const trimmed = raw.trim()

  // Strip markdown code fences if Claude wrapped it
  const unfenced = trimmed.replace(/^```[^\n]*\n?/, '').replace(/\n?```$/, '').trim()

  if (!unfenced) {
    return `chore(${repoName}): update files`
  }

  // Strip surrounding quotes from first line only
  const firstLine = unfenced.split('\n')[0].replace(/^["'`]|["'`]$/g, '').trim()

  // Check for valid conventional commit type
  const hasValidType = CONVENTIONAL_TYPES.some(t =>
    firstLine.startsWith(t + ':') || firstLine.startsWith(t + '(')
  )

  if (!hasValidType) {
    return `chore: ${firstLine.slice(0, 60)}`
  }

  // Clamp subject line to 72 chars but keep body lines intact
  const lines = unfenced.split('\n')
  if (lines[0].length > 72) {
    lines[0] = lines[0].slice(0, 72)
  }

  return lines.join('\n').trim()
}
