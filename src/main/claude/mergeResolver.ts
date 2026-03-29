import { invokeClaude } from './cli'

interface ConflictBlock {
  ours: string
  theirs: string
  base?: string
}

function extractConflictBlocks(content: string): ConflictBlock[] {
  const blocks: ConflictBlock[] = []
  const lines = content.split('\n')

  let i = 0
  while (i < lines.length) {
    if (lines[i].startsWith('<<<<<<< ')) {
      let ours = ''
      let theirs = ''
      let base: string | undefined
      let inOurs = true
      let inBase = false
      i++

      while (i < lines.length && !lines[i].startsWith('>>>>>>> ')) {
        if (lines[i] === '=======') {
          inOurs = false
          inBase = false
          i++
          continue
        }
        if (lines[i].startsWith('||||||| ')) {
          // diff3 style — base section
          inOurs = false
          inBase = true
          base = ''
          i++
          continue
        }
        if (inOurs) {
          ours += lines[i] + '\n'
        } else if (inBase) {
          base = (base ?? '') + lines[i] + '\n'
        } else {
          theirs += lines[i] + '\n'
        }
        i++
      }
      blocks.push({ ours: ours.trimEnd(), theirs: theirs.trimEnd(), base })
    }
    i++
  }
  return blocks
}

export async function resolveConflict(
  conflictContent: string,
  filePath: string,
): Promise<string> {
  const blocks = extractConflictBlocks(conflictContent)

  const prompt = `You are resolving a git merge conflict in the file: ${filePath}

The file contains merge conflict markers. Your task is to produce the fully resolved version of the file — with ALL conflict markers removed and the code logically merged.

Rules:
1. Remove all <<<<<<< HEAD, =======, and >>>>>>> markers
2. Merge the changes intelligently — prefer keeping both changes when they don't logically conflict
3. If changes are truly mutually exclusive, prefer the incoming branch changes (theirs)
4. Preserve all non-conflicting content exactly as-is
5. Return ONLY the resolved file content — no explanation, no markdown, no code fences

There are ${blocks.length} conflict block(s) in this file.

Full file content with conflict markers:
\`\`\`
${conflictContent}
\`\`\`

Return the complete resolved file content:`

  const resolved = await invokeClaude(prompt, 90_000)

  // Strip markdown code fences if claude wrapped the response
  const stripped = stripCodeFences(resolved)

  // Sanity check: if the response still has conflict markers, fall back to taking ours
  if (stripped.includes('<<<<<<<') || stripped.includes('>>>>>>>')) {
    return fallbackResolve(conflictContent)
  }

  return stripped
}

function stripCodeFences(content: string): string {
  const lines = content.split('\n')

  // Remove leading ``` or ```language line
  if (lines[0].startsWith('```')) {
    lines.shift()
  }
  // Remove trailing ```
  if (lines[lines.length - 1].trim() === '```') {
    lines.pop()
  }

  return lines.join('\n')
}

function fallbackResolve(content: string): string {
  // Take "ours" (HEAD) side for all conflicts
  const lines = content.split('\n')
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
