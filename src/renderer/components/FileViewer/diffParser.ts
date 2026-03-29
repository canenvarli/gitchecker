export type RowType = 'hunk-header' | 'context' | 'removed' | 'added' | 'changed'

export interface SideBySideRow {
  type: RowType
  leftNum?: number
  rightNum?: number
  left?: string   // old (HEAD) content
  right?: string  // new (working) content
}

export function buildSideBySide(diff: string): SideBySideRow[] {
  // Parse unified diff into typed lines first
  type Parsed =
    | { t: 'hunk'; text: string }
    | { t: 'removed'; num: number; content: string }
    | { t: 'added'; num: number; content: string }
    | { t: 'context'; oldNum: number; newNum: number; content: string }

  const parsed: Parsed[] = []
  let oldLine = 1
  let newLine = 1

  for (const line of diff.split('\n')) {
    if (line.startsWith('@@')) {
      const m = line.match(/@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/)
      if (m) { oldLine = parseInt(m[1]); newLine = parseInt(m[2]) }
      parsed.push({ t: 'hunk', text: line })
    } else if (line.startsWith('---') || line.startsWith('+++') || line.startsWith('diff ') || line.startsWith('index ')) {
      // skip file headers
    } else if (line.startsWith('-')) {
      parsed.push({ t: 'removed', num: oldLine++, content: line.slice(1) })
    } else if (line.startsWith('+')) {
      parsed.push({ t: 'added', num: newLine++, content: line.slice(1) })
    } else if (line.startsWith(' ')) {
      parsed.push({ t: 'context', oldNum: oldLine++, newNum: newLine++, content: line.slice(1) })
    }
  }

  // Second pass: pair up consecutive removed/added blocks
  const rows: SideBySideRow[] = []
  let i = 0
  while (i < parsed.length) {
    const p = parsed[i]
    if (p.t === 'hunk') {
      rows.push({ type: 'hunk-header', left: p.text, right: p.text })
      i++
    } else if (p.t === 'context') {
      rows.push({ type: 'context', leftNum: p.oldNum, rightNum: p.newNum, left: p.content, right: p.content })
      i++
    } else if (p.t === 'removed') {
      // Collect block of removed, then block of added
      const rem: Array<{ num: number; content: string }> = []
      while (i < parsed.length && parsed[i].t === 'removed') {
        const r = parsed[i] as { t: 'removed'; num: number; content: string }
        rem.push(r)
        i++
      }
      const add: Array<{ num: number; content: string }> = []
      while (i < parsed.length && parsed[i].t === 'added') {
        const a = parsed[i] as { t: 'added'; num: number; content: string }
        add.push(a)
        i++
      }
      const max = Math.max(rem.length, add.length)
      for (let j = 0; j < max; j++) {
        const r = rem[j]
        const a = add[j]
        if (r && a) {
          rows.push({ type: 'changed', leftNum: r.num, rightNum: a.num, left: r.content, right: a.content })
        } else if (r) {
          rows.push({ type: 'removed', leftNum: r.num, left: r.content })
        } else {
          rows.push({ type: 'added', rightNum: a.num, right: a.content })
        }
      }
    } else if (p.t === 'added') {
      const a = p as { t: 'added'; num: number; content: string }
      rows.push({ type: 'added', rightNum: a.num, right: a.content })
      i++
    } else {
      i++
    }
  }

  return rows
}
