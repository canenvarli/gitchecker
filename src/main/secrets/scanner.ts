import type { SecretHit, RepoStatus } from '../../renderer/types'
import { simpleGit } from 'simple-git'
import path from 'path'

interface SecretPattern {
  name: string
  pattern: RegExp
}

const SECRET_PATTERNS: SecretPattern[] = [
  { name: 'Anthropic API Key', pattern: /sk-ant-[a-zA-Z0-9\-_]{20,}/ },
  { name: 'OpenAI API Key', pattern: /sk-[a-zA-Z0-9]{48}/ },
  { name: 'AWS Secret Key', pattern: /(?:AWS_SECRET_ACCESS_KEY|aws_secret)[^\S\r\n]*[=:][^\S\r\n]*[A-Za-z0-9/+=]{40}/ },
  { name: 'Generic API Key', pattern: /[A-Z_]{2,}(?:API_KEY|SECRET_KEY|ACCESS_TOKEN)[^\S\r\n]*[=:][^\S\r\n]*\S{16,}/ },
  { name: 'Private Key Header', pattern: /-----BEGIN (?:RSA |EC )?PRIVATE KEY-----/ },
  { name: 'GitHub Token', pattern: /gh[pousr]_[A-Za-z0-9]{36}/ },
  { name: 'Stripe Key', pattern: /sk_(?:live|test)_[a-zA-Z0-9]{24,}/ },
  { name: 'Slack Token', pattern: /xox[baprs]-[a-zA-Z0-9\-]{10,}/ },
  { name: 'Google API Key', pattern: /AIza[0-9A-Za-z\-_]{35}/ },
  { name: 'JWT Token', pattern: /eyJ[A-Za-z0-9\-_]+\.eyJ[A-Za-z0-9\-_]+\.[A-Za-z0-9\-_]+/ },
]

const SECRET_FILE_PATTERNS = [
  /^\.env(\.|$)/,
  /credentials\.json$/,
  /secrets\.json$/,
  /\.pem$/,
  /\.key$/,
  /service-account.*\.json$/,
]

function maskSecret(value: string): string {
  if (value.length <= 8) return '***'
  return value.slice(0, 4) + '***' + value.slice(-4)
}

function isSecretFile(filePath: string): boolean {
  const basename = path.basename(filePath)
  return SECRET_FILE_PATTERNS.some(pattern => pattern.test(basename))
}

function scanLineForSecrets(
  line: string,
  lineNumber: number,
  filePath: string,
  repoName: string,
): SecretHit[] {
  const hits: SecretHit[] = []

  for (const { name, pattern } of SECRET_PATTERNS) {
    const match = pattern.exec(line)
    if (match) {
      const preview = line.trim().slice(0, 80).replace(match[0], maskSecret(match[0]))
      hits.push({
        repoName,
        file: filePath,
        line: lineNumber,
        pattern: name,
        preview,
      })
    }
  }

  return hits
}

async function scanRepo(repo: RepoStatus): Promise<SecretHit[]> {
  const git = simpleGit(repo.rootPath)
  const hits: SecretHit[] = []

  // Check if any staged files are secret files by name
  const stagedFiles = repo.files.filter(f => f.staged || f.status === 'A')
  for (const f of stagedFiles) {
    if (isSecretFile(f.path)) {
      hits.push({
        repoName: repo.name,
        file: f.path,
        line: 0,
        pattern: 'Secret File',
        preview: `File "${path.basename(f.path)}" appears to be a secrets/credentials file`,
      })
    }
  }

  // Get the staged diff and scan it line by line
  let stagedDiff: string
  try {
    stagedDiff = await git.diff(['--cached'])
  } catch {
    return hits
  }

  if (!stagedDiff) return hits

  // Parse the diff to get file context and line numbers
  let currentFile = ''
  let lineNumber = 0

  for (const line of stagedDiff.split('\n')) {
    // Track current file
    if (line.startsWith('+++ b/')) {
      currentFile = line.slice(6)
      lineNumber = 0
      continue
    }

    // Parse hunk header to get starting line number
    const hunkMatch = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/.exec(line)
    if (hunkMatch) {
      lineNumber = parseInt(hunkMatch[1], 10) - 1
      continue
    }

    // Only scan added lines
    if (line.startsWith('+') && !line.startsWith('+++')) {
      lineNumber++
      const content = line.slice(1)
      const lineHits = scanLineForSecrets(content, lineNumber, currentFile, repo.name)
      hits.push(...lineHits)
    } else if (!line.startsWith('-')) {
      lineNumber++
    }
  }

  return hits
}

export async function scanReposForSecrets(repos: RepoStatus[]): Promise<SecretHit[]> {
  const dirtyRepos = repos.filter(r => r.isDirty)
  const results = await Promise.allSettled(dirtyRepos.map(repo => scanRepo(repo)))

  const allHits: SecretHit[] = []
  for (const result of results) {
    if (result.status === 'fulfilled') {
      allHits.push(...result.value)
    }
  }

  return allHits
}
