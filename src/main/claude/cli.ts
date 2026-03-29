import { spawn } from 'child_process'

const DEFAULT_TIMEOUT_MS = 60_000

export async function invokeClaude(
  prompt: string,
  timeoutMs: number = DEFAULT_TIMEOUT_MS,
): Promise<string> {
  return new Promise((resolve) => {
    let process: ReturnType<typeof spawn>

    try {
      process = spawn('claude', ['-p', prompt], {
        env: { ...global.process.env },
        stdio: ['ignore', 'pipe', 'pipe'],
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
        process.kill('SIGTERM')
      } catch {
        // process may have already exited
      }
      resolve(generateFallback(prompt))
    }, timeoutMs)

    process.stdout?.on('data', (chunk: Buffer) => {
      stdout += chunk.toString()
    })

    process.stderr?.on('data', (chunk: Buffer) => {
      stderr += chunk.toString()
    })

    process.on('error', (err: NodeJS.ErrnoException) => {
      clearTimeout(timer)
      if (timedOut) return

      if (err.code === 'ENOENT') {
        // claude CLI not in PATH
        resolve(generateFallback(prompt))
      } else {
        resolve(generateFallback(prompt))
      }
    })

    process.on('close', (code: number | null) => {
      clearTimeout(timer)
      if (timedOut) return

      if (code === 0 && stdout.trim()) {
        resolve(stdout.trim())
      } else {
        // Non-zero exit or empty output
        const errInfo = stderr.trim()
        console.warn(`[claude cli] exited with code ${code}${errInfo ? ': ' + errInfo : ''}`)
        resolve(generateFallback(prompt))
      }
    })
  })
}

function generateFallback(prompt: string): string {
  // Detect what kind of prompt this is and return a sensible fallback
  if (prompt.includes('commit message') || prompt.includes('conventional commit')) {
    return 'chore: update files'
  }
  if (prompt.includes('merge conflict') || prompt.includes('conflict markers')) {
    // Return the prompt content with conflicts resolved by taking "ours" side
    return resolveConflictsFallback(prompt)
  }
  return 'chore: update'
}

function resolveConflictsFallback(prompt: string): string {
  // Extract the file content from the prompt and resolve by taking HEAD (ours) side
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
