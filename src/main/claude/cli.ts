import { spawn } from 'child_process'

const DEFAULT_TIMEOUT_MS = 60_000

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
  return new Promise((resolve) => {
    let claudeProcess: ReturnType<typeof spawn>

    // Minimal environment — forward only what Claude CLI needs
    const safeEnv: NodeJS.ProcessEnv = {}
    const allowedEnvKeys = [
      'ANTHROPIC_API_KEY',
      'ANTHROPIC_BASE_URL',
      'HOME',
      'PATH',
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

    try {
      // Use --print (-p) without a positional arg so prompt is read from stdin
      claudeProcess = spawn('claude', ['--print'], {
        env: safeEnv,
        stdio: ['pipe', 'pipe', 'pipe'],
      })
    } catch {
      resolve(generateFallback(prompt))
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
        // claude CLI not installed / not in PATH
        resolve(generateFallback(prompt))
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
