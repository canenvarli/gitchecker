import { resolveConflict } from '../claude/mergeResolver'
import { getConflictedContent, writeResolvedConflict, stageFile } from './operations'

export async function autoResolveMergeConflicts(
  repoPath: string,
  conflictedFiles: string[],
  logFn: (line: string) => void,
): Promise<void> {
  if (conflictedFiles.length === 0) return

  logFn(`Auto-resolving ${conflictedFiles.length} conflicted file(s) via Claude...`)

  const results = await Promise.allSettled(
    conflictedFiles.map(async (filePath) => {
      logFn(`  Resolving: ${filePath}`)

      const content = await getConflictedContent(repoPath, filePath)

      if (!content.includes('<<<<<<<')) {
        // Not actually conflicted — just stage it
        await stageFile(repoPath, filePath)
        logFn(`  ${filePath}: no conflict markers found, staged as-is`)
        return
      }

      const resolved = await resolveConflict(content, filePath)
      await writeResolvedConflict(repoPath, filePath, resolved)
      await stageFile(repoPath, filePath)

      logFn(`  ${filePath}: auto-resolved`)
    })
  )

  for (let i = 0; i < results.length; i++) {
    const result = results[i]
    if (result.status === 'rejected') {
      const filePath = conflictedFiles[i]
      logFn(`  ERROR resolving ${filePath}: ${result.reason instanceof Error ? result.reason.message : String(result.reason)}`)
      throw new Error(`Failed to auto-resolve conflict in ${filePath}`)
    }
  }

  logFn('Auto-resolve complete')
}
