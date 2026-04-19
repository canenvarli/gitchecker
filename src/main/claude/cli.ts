import { spawn } from 'child_process'
import { loadConfig } from '../config/store'

const DEFAULT_TIMEOUT_MS = 60_000

/** Thrown when the Claude CLI binary cannot be found on disk. */
export class ClaudeNotFoundError extends Error {
  constructor() {
    super('Claude CLI not found. Configure the binary path in Settings > Claude.')
    this.name = 'ClaudeNotFoundError'
  }
}

/**
 * When launched from Finder / Spotlight, Electron only sees the default macOS
 * GUI PATH (/usr/bin:/bin:/usr/sbin:/sbin).  Augment it with the directories
 * where CLI tools are commonly installed so we can find `claude`.
 */
function getAugmentedPath(): string {
  const base = global.process.env.PATH ?? '/usr/bin:/bin:/usr/sbin:/sbin'
  const home = global.process.env.HOME ?? ''
  const extras = [
    '/opt/homebrew/bin',          // Apple Silicon Homebrew
    '/usr/local/bin',             // Intel Homebrew / manual installs
    `${home}/.local/bin`,         // pipx, uv, etc.
    `${home}/.npm-global/bin`,    // npm global
    `${home}/.nvm/versions/node`, // nvm (partial — resolved below)
    `${home}/.claude/local`,      // Claude CLI local install
  ].filter(Boolean)

  const dirs = new Set(base.split(':'))
  for (const d of extras) dirs.add(d)
  return [...dirs].join(':')
}

/**
 * Invoke the Claude CLI in print mode.
 *
 * Security notes:
 *  - Prompt is written to stdin, NOT passed as a command-line argument.
 *    This prevents the prompt content (which may contain code diffs) from
 *    appearing in `ps aux` output and being readable by other OS processes.
 *  - Only ANTHROPIC_API_KEY is forwarded to the child environment; the rest
 *    of the parent environment is stripped to avoid leaking other secrets.
 */
export async function invokeClaude(
  prompt: string,
  timeoutMs: number = DEFAULT_TIMEOUT_MS,
): Promise<string> {
  // Resolve which binary to run: user override > auto-detect
  const config = loadConfig()
  const binary = config.claudeBinaryPath?.trim() || 'claude'

  return new Promise((resolve, reject) => {
    let claudeProcess: ReturnType<typeof spawn>

    // Minimal environment — forward only what Claude CLI needs
    const safeEnv: NodeJS.ProcessEnv = {}
    const allowedEnvKeys = [
      'ANTHROPIC_API_KEY',
      'ANTHROPIC_BASE_URL',
      'HOME',
      'TERM',
      'USER',
      'LANG',
      'LC_ALL',
      'CLAUDE_CONFIG_DIR',
    ]
    for (const key of allowedEnvKeys) {
      if (global.process.env[key] !== undefined) {
        safeEnv[key] = global.process.env[key]
      }
    }
    // Use augmented PATH so packaged app can find `claude` in Homebrew etc.
    safeEnv.PATH = getAugmentedPath()

    try {
      // Use --print (-p) without a positional arg so prompt is read from stdin
      claudeProcess = spawn(binary, ['--print'], {
        env: safeEnv,
        stdio: ['pipe', 'pipe', 'pipe'],
      })
    } catch {
      reject(new ClaudeNotFoundError())
      return
    }

    let stdout = ''
    let stderr = ''
    let timedOut = false

    const timer = setTimeout(() => {
      timedOut = true
      try {
        claudeProcess.kill('SIGTERM')
      } catch {
        // process may have already exited
      }
      resolve(generateFallback(prompt))
    }, timeoutMs)

    // Write prompt to stdin and close it so Claude knows input is done
    claudeProcess.stdin?.write(prompt, 'utf8')
    claudeProcess.stdin?.end()

    claudeProcess.stdout?.on('data', (chunk: Buffer) => {
      stdout += chunk.toString()
    })

    claudeProcess.stderr?.on('data', (chunk: Buffer) => {
      stderr += chunk.toString()
    })

    claudeProcess.on('error', (err: NodeJS.ErrnoException) => {
      clearTimeout(timer)
      if (timedOut) return
      if (err.code === 'ENOENT') {
        reject(new ClaudeNotFoundError())
      } else {
        resolve(generateFallback(prompt))
      }
    })

    claudeProcess.on('close', (code: number | null) => {
      clearTimeout(timer)
      if (timedOut) return

      if (code === 0 && stdout.trim()) {
        resolve(stdout.trim())
      } else {
        // Truncate stderr so it can never contain large diff content
        const errSnippet = stderr.trim().slice(0, 200)
        console.warn(`[claude cli] exited with code ${code}${errSnippet ? ': ' + errSnippet : ''}`)
        resolve(generateFallback(prompt))
      }
    })
  })
}

function generateFallback(prompt: string): string {
  if (prompt.includes('commit message') || prompt.includes('conventional commit')) {
    return 'chore: update files'
  }
  if (prompt.includes('merge conflict') || prompt.includes('conflict markers')) {
    return resolveConflictsFallback(prompt)
  }
  return 'chore: update'
}

function resolveConflictsFallback(prompt: string): string {
  // Resolve by taking the HEAD (ours) side of each conflict marker
  const lines = prompt.split('\n')
  const resolved: string[] = []
  let inConflict = false
  let takingOurs = false

  for (const line of lines) {
    if (line.startsWith('<<<<<<< ')) {
      inConflict = true
      takingOurs = true
      continue
    }
    if (line === '=======') {
      takingOurs = false
      continue
    }
    if (line.startsWith('>>>>>>> ')) {
      inConflict = false
      takingOurs = false
      continue
    }
    if (!inConflict || takingOurs) {
      resolved.push(line)
    }
  }

  return resolved.join('\n')
}
