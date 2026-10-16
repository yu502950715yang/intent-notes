import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { spawnSync } from 'node:child_process'

function scaffold(notes: Record<string, string>): string {
  const root = mkdtempSync(join(tmpdir(), 'intent-notes-audit-'))
  for (const [rel, body] of Object.entries(notes)) {
    const abs = join(root, rel)
    mkdirSync(dirname(abs), { recursive: true })
    writeFileSync(abs, body)
  }
  return root
}

function run(root: string, today = '2026-01-31'): { code: number; stdout: string } {
  const r = spawnSync('node', ['skills/intent-notes/scripts/audit-notes.ts', root], {
    encoding: 'utf8',
    env: { ...process.env, INTENT_NOTES_TODAY: today },
  })
  return { code: r.status ?? -1, stdout: r.stdout ?? '' }
}

const body = (extra = ''): string => `# Agent Note: x\n\nStatus: implemented\n\n## Problem\n\n动机。\n\n## Decision\n\n${extra}\n\n## Alternatives considered\n\n**甲。** 理由。\n\n## Consequences\n\n代价。\n`

test('汇总四个生命周期的篇数，并按存续天数降序排列', () => {
  const root = scaffold({
    'implemented/feature/2026-01-01-old.md': body(),
    'implemented/bug-fix/2026-01-21-new.md': body(),
    'proposed/feature/2026-01-10-p.md': '# Agent Note: p\n\nStatus: proposed\n',
    'rejected/feature/2026-01-11-r.md': '# Agent Note: r\n\nStatus: rejected — 否决\n',
    'archived/feature/2026-01-02-a.md': '# Agent Note: a\n\nStatus: implemented\nArchived: 2026-01-03\n',
  })
  const { code, stdout } = run(root)
  assert.equal(code, 0, stdout)
  assert.match(stdout, /implemented 2 篇 · archived 1 篇 · proposed 1 篇 · rejected 1 篇/)
  const oldAt = stdout.indexOf('2026-01-01-old.md')
  const newAt = stdout.indexOf('2026-01-21-new.md')
  assert.ok(oldAt > 0 && newAt > 0 && oldAt < newAt, '应把存续更久的排在前面')
  assert.match(stdout, /30天/, '2026-01-01 到 2026-01-31 是 30 天')
  assert.match(stdout, /10天/, '2026-01-21 到 2026-01-31 是 10 天')
  rmSync(root, { recursive: true, force: true })
})

test('必须打印「不是判据」声明', () => {
  const root = scaffold({ 'implemented/feature/2026-01-01-a.md': body() })
  const { stdout } = run(root)
  assert.match(stdout, /从来不是归档判据/)
  rmSync(root, { recursive: true, force: true })
})

test('入链数只算活跃笔记，归档笔记的出站链接不计，且按来源去重', () => {
  const root = scaffold({
    'implemented/feature/2026-01-01-target.md': body(),
    'implemented/feature/2026-01-02-src.md': body('见 [目标](../feature/2026-01-01-target.md) 与 [目标2](../feature/2026-01-01-target.md)。'),
    'archived/feature/2026-01-03-old.md': '# Agent Note: o\n\nStatus: implemented\nArchived: 2026-01-04\n\n见 [目标](../implemented/feature/2026-01-01-target.md)。\n',
  })
  const { stdout } = run(root)
  const line = stdout.split('\n').find(l => l.includes('2026-01-01-target.md')) ?? ''
  assert.match(line, /1入链/, `同一篇链两次算一篇：${line}`)
  rmSync(root, { recursive: true, force: true })
})

test('空树退 0 并输出 0 篇', () => {
  const root = mkdtempSync(join(tmpdir(), 'intent-notes-audit-empty-'))
  const { code, stdout } = run(root)
  assert.equal(code, 0)
  assert.match(stdout, /implemented 0 篇/)
  rmSync(root, { recursive: true, force: true })
})

// 上一条用例里归档笔记的链接写的是 `../implemented/...`，从 archived/feature/ 出发解析不到目标，
// 于是它只钉住了「来源必须活跃」，没钉住「归档的出站链接不计」。这条用真能解析到目标的链接补上。
test('归档笔记指向活跃笔记且链接可解析时，仍不计入入链', () => {
  const root = scaffold({
    'implemented/feature/2026-01-01-target.md': body(),
    'archived/feature/2026-01-03-old.md':
      '# Agent Note: o\n\nStatus: implemented\nArchived: 2026-01-04\n\n见 [目标](../../implemented/feature/2026-01-01-target.md)。\n',
  })
  const { stdout } = run(root)
  const line = stdout.split('\n').find(l => l.includes('2026-01-01-target.md')) ?? ''
  assert.match(line, /0入链/, `归档笔记的出站链接不该计入：${line}`)
  rmSync(root, { recursive: true, force: true })
})

test('自链接不计入自己的入链，断链也不会造成误计', () => {
  const root = scaffold({
    'implemented/feature/2026-01-01-self.md': body(
      '见 [自己](2026-01-01-self.md) 与 [自己](./2026-01-01-self.md)，还有 [断链](missing.md)。',
    ),
    'implemented/feature/2026-01-02-other.md': body('见 [那篇](2026-01-01-self.md)。'),
  })
  const { stdout } = run(root)
  const selfLine = stdout.split('\n').find(l => l.includes('2026-01-01-self.md')) ?? ''
  const otherLine = stdout.split('\n').find(l => l.includes('2026-01-02-other.md')) ?? ''
  assert.match(selfLine, /1入链/, `自链接不该算进自己：${selfLine}`)
  assert.match(otherLine, /0入链/, `断链不该造成误计：${otherLine}`)
  rmSync(root, { recursive: true, force: true })
})
