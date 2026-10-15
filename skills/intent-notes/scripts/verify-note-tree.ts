/**
 * 门禁 1：结构。消费 note-tree.ts 的结果并补上它不覆盖的检查（笔记间相对链接）。
 *
 * 检查思路移植自 DeepSeek Harness 的 scripts/verify-agent-note-tree.ts（MIT, Copyright (c) 2026 DeepSeek）；
 * 相对链接的断链检查为本项目新增。
 *
 * 用法：node scripts/verify-note-tree.ts [notes 根]（省略则取 <cwd>/.agents/notes；门禁 3 接的是项目根）
 * root 省略时取 <cwd>/.agents/notes。
 */
import { readFileSync, existsSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { walkAgentNoteTree } from './note-tree.ts'
import { fenceAwareLines } from './note-text.ts'

const root = resolve(process.argv[2] ?? join(process.cwd(), '.agents', 'notes'))
const { notes, errors } = walkAgentNoteTree(root)

/** 提取 Markdown 行内链接目标，忽略锚点与外部 URL。 */
function localLinkTargets(text: string): string[] {
  const out: string[] = []
  const re = /\]\(([^)\s]+)\)/g
  let m: RegExpExecArray | null
  while ((m = re.exec(text)) !== null) {
    const target = m[1] ?? ''
    if (target.startsWith('http:') || target.startsWith('https:') || target.startsWith('#')) continue
    out.push(target.split('#')[0] ?? '')
  }
  return out
}

for (const note of notes) {
  const abs = join(root, note.rel)
  let text: string
  try {
    text = readFileSync(abs, 'utf8')
  } catch {
    errors.push(`structure: ${note.rel} — 不可读`)
    continue
  }
  // 必须按围栏解析：记录本格式的笔记会在代码块里引示例链接，扫全文会把示例当断链误红
  for (const line of fenceAwareLines(text)) {
    for (const target of localLinkTargets(line.text)) {
      if (target === '') continue
      const resolved = resolve(dirname(abs), target)
      if (!existsSync(resolved)) {
        errors.push(`structure: ${note.rel}:${line.index + 1} — 相对链接指向不存在的文件：${target}`)
      }
    }
  }
}

if (errors.length === 0) {
  // 0 篇不能说「全部合规」：根目录写错与 init 刚建完的空骨架会输出同一句话（两者都退 0）
  console.log(
    notes.length === 0
      ? 'verify-note-tree: 未发现任何笔记，请确认根目录正确（init 刚建完的空骨架属正常，仍退 0）。'
      : `verify-note-tree: 检查 ${notes.length} 篇笔记，结构全部合规。`,
  )
  process.exit(0)
}
console.error('verify-note-tree: 发现违规：')
for (const e of errors) console.error(`  ${e}`)
process.exit(1)
