// 契约真源与门禁行为的配套性：文档漏写一步，实操者会先被门禁判红再自己反推原因。
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { spawnSync } from 'node:child_process'
import { fenceAwareLines } from '../skills/intent-notes/scripts/note-text.ts'

const skillRoot = resolve(import.meta.dirname, '../skills/intent-notes')
const read = (rel: string) => readFileSync(join(skillRoot, rel), 'utf8')

/**
 * 取 `heading` 到下一个同级/更高级标题之间的正文。
 *
 * 必须走围栏感知的行：`note-format.md` 的示例代码块里也有 `## Affected repositories`，
 * 按裸文本切会把示例段当成真段，断言随即落空。
 */
function section(text: string, heading: string): string {
  const out: string[] = []
  let inside = false
  for (const { text: line } of fenceAwareLines(text)) {
    if (!inside) {
      if (line.trim() === heading) inside = true
      continue
    }
    if (/^#{1,3} /.test(line)) break
    out.push(line)
  }
  return out.join('\n')
}

function runGate1(root: string) {
  return spawnSync('node', [join(skillRoot, 'scripts/verify-note-tree.ts'), root], {
    encoding: 'utf8',
    cwd: skillRoot,
  })
}

test('archiving.md 的归档流程要求先修复活跃笔记的入站链接', () => {
  const text = read('references/archiving.md')
  // 只看归档流程（封印之前），不看「删除，而不是归档」那一节：归档把路径从
  // implemented/{class}/ 换成 archived/{class}/，活跃笔记里指向旧路径的相对链接会立刻断链，
  // 门禁 1 判红——这一步属于归档动作本身，不能只写在删除场景里。
  const flow = text.slice(0, text.indexOf('## 删除，而不是归档'))
  assert.match(flow, /入站链接/, '归档流程没写入站链接修复')
})

test('templates/proposed.md 给出提案阶段的锚点写法', () => {
  const seg = section(read('templates/proposed.md'), '## Affected repositories')
  // 提案尚未实施，没有 commit 可指；模板只给「分支 + commits」会让照模板写的提案被门禁 3 判红
  assert.match(seg, /不涉及/, 'proposed 模板未给出提案阶段（无 commit 可指）的锚点写法')
})

test('note-format.md 说明提案阶段的锚点写法', () => {
  const seg = section(read('references/note-format.md'), '## Affected repositories')
  assert.match(seg, /proposed|提案/, 'note-format.md 的锚点一节没说明提案阶段怎么填')
})

test('SKILL.md 执行清单把归档与修复入站链接并列', () => {
  assert.match(read('SKILL.md'), /入站链接/, 'SKILL.md 没提归档要修入站链接')
})

test('归档被活跃笔记引用的笔记后，门禁 1 必须报断链', () => {
  const root = mkdtempSync(join(tmpdir(), 'intent-notes-refs-'))
  try {
    const impl = join(root, 'implemented', 'feature', '2026-01-01-a.md')
    const active = join(root, 'rejected', 'bug-fix', '2026-01-02-b.md')
    mkdirSync(dirname(impl), { recursive: true })
    mkdirSync(dirname(active), { recursive: true })
    writeFileSync(impl, '# Agent Note: a\n\nStatus: implemented\n\n## Problem\n\na\n')
    writeFileSync(active, '# Agent Note: b\n\nStatus: rejected — x\n\n## Problem\n\n见 [a](../../implemented/feature/2026-01-01-a.md)。\n')

    const before = runGate1(root)
    assert.equal(before.status, 0, before.stderr ?? '')

    // 归档：移动 + 第 4 行插 Archived（此处只关心路径变化对活跃笔记链接的影响）
    const archived = join(root, 'archived', 'feature', '2026-01-01-a.md')
    mkdirSync(dirname(archived), { recursive: true })
    writeFileSync(archived, '# Agent Note: a\n\nStatus: implemented\nArchived: 2026-01-02\n\n## Problem\n\na\n')
    rmSync(impl)

    const after = runGate1(root)
    assert.equal(after.status, 1, '归档后活跃笔记的入站链接断链，门禁 1 必须判红')
    assert.match(after.stderr ?? '', /相对链接指向不存在的文件/)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})
