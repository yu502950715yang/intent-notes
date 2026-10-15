import { test } from 'node:test'
import type { TestContext } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, symlinkSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { spawnSync } from 'node:child_process'
import { walkAgentNoteTree } from '../skills/intent-notes/scripts/note-tree.ts'

const skillRoot = resolve(import.meta.dirname, '../skills/intent-notes')

/** 建一个临时目录并登记清理；断言失败会提前 return，尾部 rmSync 写法会泄漏到 %TEMP%。 */
function tmp(t: TestContext, prefix: string): string {
  const dir = mkdtempSync(join(tmpdir(), prefix))
  t.after(() => rmSync(dir, { recursive: true, force: true }))
  return dir
}

/** 按给定相对路径列表建一棵临时树，每个文件写入最小合法内容。 */
function scaffold(t: TestContext, relPaths: string[]): string {
  const root = tmp(t, 'intent-notes-')
  for (const rel of relPaths) {
    const abs = join(root, rel)
    mkdirSync(dirname(abs), { recursive: true })
    writeFileSync(abs, '# Agent Note: t\n\nStatus: implemented\n')
  }
  return root
}

/** 造一个 Windows 免提权的 junction；target 必须绝对路径且已存在。 */
function junction(t: TestContext, target: string, link: string): void {
  mkdirSync(dirname(link), { recursive: true })
  symlinkSync(target, link, 'junction')
}

test('合法树：四个生命周期与各类分类均通过', (t) => {
  const root = scaffold(t, [
    'proposed/feature/2026-01-01-a.md',
    'implemented/architecture/2026-01-02-b.md',
    'rejected/simplification/2026-01-03-c.md',
    'archived/testing/2026-01-04-d.md',
  ])
  const { notes, errors } = walkAgentNoteTree(root)
  assert.deepEqual(errors, [])
  assert.equal(notes.length, 4)
  assert.deepEqual(
    notes.map(n => n.lifecycle).sort(),
    ['archived', 'implemented', 'proposed', 'rejected'],
  )
  assert.deepEqual(notes.map(n => n.rel).sort(), [
    'archived/testing/2026-01-04-d.md',
    'implemented/architecture/2026-01-02-b.md',
    'proposed/feature/2026-01-01-a.md',
    'rejected/simplification/2026-01-03-c.md',
  ])
  assert.deepEqual(notes.map(n => n.date).sort(), [
    '2026-01-01',
    '2026-01-02',
    '2026-01-03',
    '2026-01-04',
  ])
})

test('未知分类目录报错', (t) => {
  const root = scaffold(t, ['implemented/refactor/2026-01-01-a.md'])
  const { errors } = walkAgentNoteTree(root)
  assert.equal(errors.length, 1)
  assert.match(errors[0] ?? '', /未知分类目录 "refactor"/)
})

test('未知生命周期目录报错', (t) => {
  const root = scaffold(t, ['implemented/feature/2026-01-01-a.md', 'drafts/feature/2026-01-01-b.md'])
  const { errors } = walkAgentNoteTree(root)
  assert.equal(errors.length, 1)
  assert.match(errors[0] ?? '', /^structure: drafts\/ — 未知生命周期目录/)
})

test('INDEX.md 被明确拒绝', (t) => {
  const root = scaffold(t, ['INDEX.md', 'implemented/feature/2026-01-01-a.md'])
  const { errors } = walkAgentNoteTree(root)
  assert.equal(errors.length, 1)
  assert.match(errors[0] ?? '', /INDEX\.md/)
})

test('文件名不合规报错', (t) => {
  const root = scaffold(t, ['implemented/feature/notes-a.md'])
  const { errors } = walkAgentNoteTree(root)
  assert.equal(errors.length, 1)
  assert.match(errors[0] ?? '', /文件名必须为 yyyy-mm-dd-topic-title\.md/)
})

test('生命周期根下的未知 .md 报白名单违规，而不是「深度不是 3」', (t) => {
  const root = scaffold(t, ['implemented/notes.md'])
  const { errors } = walkAgentNoteTree(root)
  assert.equal(errors.length, 1)
  assert.match(errors[0] ?? '', /生命周期根下只允许白名单文件/)
  assert.doesNotMatch(errors[0] ?? '', /实际深度/)
})

test('深度超过 3 报错', (t) => {
  const root = scaffold(t, ['implemented/feature/nested/2026-01-01-a.md'])
  const { errors } = walkAgentNoteTree(root)
  assert.equal(errors.length, 1)
  assert.match(errors[0] ?? '', /期望 \{lifecycle\}\/\{class\}\/file\.md/)
})

test('生命周期根下的 AGENTS.md 豁免', (t) => {
  const root = scaffold(t, ['implemented/AGENTS.md', 'implemented/feature/2026-01-01-a.md'])
  const { notes, errors } = walkAgentNoteTree(root)
  assert.deepEqual(errors, [])
  assert.equal(notes.length, 1)
})

test('生命周期路径是文件而非目录时报错，而不是静默丢弃', (t) => {
  const root = tmp(t, 'intent-notes-')
  writeFileSync(join(root, 'implemented'), 'not a directory\n')
  const { notes, errors } = walkAgentNoteTree(root)
  assert.equal(notes.length, 0)
  assert.equal(errors.length, 1)
  assert.match(errors[0] ?? '', /目录不可读/)
})

test('root 不存在时报错、不抛异常，并把 errno 拼进消息', (t) => {
  const missing = join(tmp(t, 'intent-notes-'), 'nested')
  const { notes, errors } = walkAgentNoteTree(missing)
  assert.deepEqual(notes, [])
  assert.equal(errors.length, 1)
  assert.match(errors[0] ?? '', /不存在或不可读/)
  assert.match(errors[0] ?? '', /ENOENT/)
})

test('分类目录是 junction 时报错，而不是让其中的笔记静默消失', (t) => {
  const outside = tmp(t, 'intent-notes-outside-')
  writeFileSync(join(outside, '2026-01-05-x.md'), '# Agent Note: t\n\nStatus: implemented\n')
  const root = tmp(t, 'intent-notes-')
  junction(t, outside, join(root, 'implemented', 'bug-fix'))
  const { notes, errors } = walkAgentNoteTree(root)
  // 旧行为：notes=[] 且 errors=[] → 三道门禁齐喊「检查 0 篇笔记，结构全部合规」
  assert.deepEqual(notes, [])
  assert.equal(errors.length, 1)
  assert.match(errors[0] ?? '', /^structure: implemented\/bug-fix — 无法校验/)
})

test('顶层未知名 junction 报错，而不是连闭集报错都不触发', (t) => {
  const outside = tmp(t, 'intent-notes-outside-')
  mkdirSync(join(outside, 'feature'), { recursive: true })
  writeFileSync(join(outside, 'feature', '2026-01-06-y.md'), '# Agent Note: t\n\nStatus: implemented\n')
  const root = tmp(t, 'intent-notes-')
  junction(t, outside, join(root, 'drafts'))
  const { errors } = walkAgentNoteTree(root)
  assert.equal(errors.length, 1)
  assert.match(errors[0] ?? '', /^structure: drafts — 无法校验/)
})

test('notes 根下的散落 .md 报错', (t) => {
  const root = scaffold(t, ['implemented/feature/2026-01-01-a.md'])
  writeFileSync(join(root, '2026-01-02-stray.md'), '# stray\n')
  const { notes, errors } = walkAgentNoteTree(root)
  assert.equal(notes.length, 1)
  assert.equal(errors.length, 1)
  assert.match(errors[0] ?? '', /^structure: 2026-01-02-stray\.md — 笔记必须放在 \{lifecycle\}\/\{class\}\//)
})

test('notes 根下只放行 README.md / AGENTS.md / CLAUDE.md：空骨架仍然绿', (t) => {
  const root = scaffold(t, ['README.md', 'AGENTS.md', 'CLAUDE.md'])
  const { notes, errors } = walkAgentNoteTree(root)
  assert.deepEqual(errors, [])
  assert.deepEqual(notes, [])
})

test('非小写扩展名的笔记不再静默消失', (t) => {
  const root = scaffold(t, ['implemented/feature/2026-01-03-x.MD'])
  const { notes, errors } = walkAgentNoteTree(root)
  assert.deepEqual(notes, [])
  assert.equal(errors.length, 1)
  assert.match(errors[0] ?? '', /文件名必须为 yyyy-mm-dd-topic-title\.md/)
})

test('0 篇笔记时门禁 1 摘要提示根目录可疑，而非宣称结构全部合规', (t) => {
  // 跨文件钉子：摘要文案在 verify-note-tree.ts 里，改它必须同步改这条
  const root = tmp(t, 'intent-notes-')
  writeFileSync(join(root, 'README.md'), '# Agent Notes\n')
  const r = spawnSync('node', [join(skillRoot, 'scripts/verify-note-tree.ts'), root], {
    encoding: 'utf8',
    cwd: skillRoot,
  })
  assert.equal(r.status, 0, r.stderr ?? '')
  assert.match(r.stdout ?? '', /未发现任何笔记，请确认根目录正确/)
  assert.doesNotMatch(r.stdout ?? '', /结构全部合规/)
})
