import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, cpSync, symlinkSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { spawnSync } from 'node:child_process'
import { parseNote } from '../skills/intent-notes/scripts/note-text.ts'

const skillRoot = resolve(import.meta.dirname, '../skills/intent-notes')

/** 建一棵树，notes 为 相对路径 -> 文件内容。 */
function scaffold(notes: Record<string, string>): string {
  const root = mkdtempSync(join(tmpdir(), 'intent-notes-fmt-'))
  for (const [rel, body] of Object.entries(notes)) {
    const abs = join(root, rel)
    mkdirSync(dirname(abs), { recursive: true })
    writeFileSync(abs, body)
  }
  return root
}

function runFormatGate(root: string): { code: number; stderr: string } {
  const r = spawnSync('node', ['skills/intent-notes/scripts/verify-note-format.ts', root], { encoding: 'utf8' })
  return { code: r.status ?? -1, stderr: r.stderr }
}

const GOOD_IMPLEMENTED = `# Agent Note: 示例决策

Status: implemented

## Problem

动机，不依赖方案即可独立成立。

## Decision

现在时描述已落地事实。

## Alternatives considered

**维持现状。** 最省事，但代价是重复踩坑。

## Consequences

收益与代价都写。
`

/** archived 笔记：Status 保持 implemented，第 4 行是归档日期。 */
const GOOD_ARCHIVED = GOOD_IMPLEMENTED.replace(
  'Status: implemented\n',
  'Status: implemented\nArchived: 2026-01-02\n',
)

test('合法 implemented 笔记通过', () => {
  const root = scaffold({ 'implemented/architecture/2026-01-01-ok.md': GOOD_IMPLEMENTED })
  const { code, stderr } = runFormatGate(root)
  assert.equal(code, 0, stderr)
  rmSync(root, { recursive: true, force: true })
})

test('第 1 行不是 Agent Note 标题则报错', () => {
  const root = scaffold({
    'implemented/architecture/2026-01-01-bad.md': GOOD_IMPLEMENTED.replace('# Agent Note: 示例决策', '# 示例决策'),
  })
  const { code, stderr } = runFormatGate(root)
  assert.equal(code, 1)
  assert.match(stderr, /line 1 must be/)
  rmSync(root, { recursive: true, force: true })
})

test('Status 与所在生命周期不一致则报错', () => {
  const root = scaffold({
    'proposed/architecture/2026-01-01-bad.md': GOOD_IMPLEMENTED,
  })
  const { code, stderr } = runFormatGate(root)
  assert.equal(code, 1)
  assert.match(stderr, /line 3 must match the proposed status grammar/)
  rmSync(root, { recursive: true, force: true })
})

test('缺 ## Alternatives considered 则报错', () => {
  const root = scaffold({
    'implemented/architecture/2026-01-01-bad.md': GOOD_IMPLEMENTED.replace('## Alternatives considered', '## 备选'),
  })
  const { code, stderr } = runFormatGate(root)
  assert.equal(code, 1)
  assert.match(stderr, /missing .*Alternatives considered/)
  rmSync(root, { recursive: true, force: true })
})

test('implemented 里出现提案用语则报错', () => {
  const root = scaffold({
    'implemented/architecture/2026-01-01-bad.md': GOOD_IMPLEMENTED.replace(
      '## Decision',
      '## Decision\n\n## Acceptance criteria\n\n不该出现。',
    ),
  })
  const { code, stderr } = runFormatGate(root)
  assert.equal(code, 1)
  assert.match(stderr, /proposal-era heading/)
  rmSync(root, { recursive: true, force: true })
})

test('文件里出现第二个 Status: 行则报错', () => {
  const root = scaffold({
    'implemented/architecture/2026-01-01-bad.md': `${GOOD_IMPLEMENTED}\nStatus: implemented\n`,
  })
  const { code, stderr } = runFormatGate(root)
  assert.equal(code, 1)
  assert.match(stderr, /must be the only one/)
  rmSync(root, { recursive: true, force: true })
})

test('首个二级标题不是 ## Problem 则报错', () => {
  const root = scaffold({
    'implemented/architecture/2026-01-01-bad.md': GOOD_IMPLEMENTED.replace('## Problem', '## 背景'),
  })
  const { code, stderr } = runFormatGate(root)
  assert.equal(code, 1)
  assert.match(stderr, /first section must be/)
  rmSync(root, { recursive: true, force: true })
})

test('合法 archived 笔记（Status 保持 implemented，第 4 行为归档日期）通过', () => {
  const root = scaffold({ 'archived/architecture/2026-01-01-ok.md': GOOD_ARCHIVED })
  const { code, stderr } = runFormatGate(root)
  assert.equal(code, 0, stderr)
  rmSync(root, { recursive: true, force: true })
})

test('archived 笔记的状态必须是 implemented', () => {
  const root = scaffold({
    'archived/architecture/2026-01-01-bad.md': GOOD_ARCHIVED.replace('Status: implemented', 'Status: 胡说八道'),
  })
  const { code, stderr } = runFormatGate(root)
  assert.equal(code, 1)
  assert.match(stderr, /line 3 must match the archived status grammar/)
  rmSync(root, { recursive: true, force: true })
})

test('archived 笔记缺少 Archived 行则报错', () => {
  const root = scaffold({
    'archived/architecture/2026-01-01-bad.md': GOOD_IMPLEMENTED,
  })
  const { code, stderr } = runFormatGate(root)
  assert.equal(code, 1)
  assert.match(stderr, /line 4 must be `Archived: YYYY-MM-DD`/)
  rmSync(root, { recursive: true, force: true })
})

test('archived 笔记的归档日期格式必须是 YYYY-MM-DD', () => {
  const root = scaffold({
    'archived/architecture/2026-01-01-bad.md': GOOD_ARCHIVED.replace('Archived: 2026-01-02', 'Archived: 昨天'),
  })
  const { code, stderr } = runFormatGate(root)
  assert.equal(code, 1)
  assert.match(stderr, /line 4 must be `Archived: YYYY-MM-DD`/)
  rmSync(root, { recursive: true, force: true })
})

test('CRLF 行尾的合法笔记通过', () => {
  // Windows 上 core.autocrlf=true 会把笔记检出成 CRLF；门禁必须容错，否则所有笔记被误判
  const crlf = GOOD_IMPLEMENTED.replace(/\n/g, '\r\n')
  const root = scaffold({ 'implemented/architecture/2026-01-01-ok.md': crlf })
  const { code, stderr } = runFormatGate(root)
  assert.equal(code, 0, stderr)
  rmSync(root, { recursive: true, force: true })
})

test('parseNote 可被 import 且不触发 CLI 副作用', () => {
  // 若 note-text.ts 顶层有 process.exit 之类的副作用，这个 import 会直接终止测试进程——测试失败本身就是哨兵
  const parsed = parseNote('# Agent Note: t\n\nStatus: implemented\n')
  assert.equal(parsed.statusLine, 'Status: implemented')
  assert.equal(parsed.firstH2, undefined)
})

test('parseNote 归一 CRLF 行尾', () => {
  const parsed = parseNote('# Agent Note: t\r\n\r\nStatus: implemented\r\n')
  assert.equal(parsed.statusLine, 'Status: implemented')
})

test('经 junction 调用门禁 2 不得静默放绿', () => {
  // 部署态把 skill 目录做成 junction/symlink 是合法做法。旧写法拿 `import.meta.url` 与
  // argv[1] 比对判断主入口，经 junction 到达时两侧不等 → 整个 CLI 被跳过 → exit 0 且无输出。
  // 解析器拆进 note-text.ts 后本文件是纯 CLI、不再需要守卫；本用例把 fail-open 钉住。
  const base = mkdtempSync(join(tmpdir(), 'intent-notes-deploy-'))
  const deployed = join(base, 'intent-notes')
  const link = join(base, 'skill-deploy')
  try {
    cpSync(skillRoot, deployed, { recursive: true })   // 部署 = 整目录复制，与文档一致
    // junction 指向临时副本：清理时即便被穿透也伤不到仓库本体
    symlinkSync(deployed, link, 'junction')

    const root = scaffold({
      'implemented/architecture/2026-01-01-bad.md': GOOD_IMPLEMENTED.replace('# Agent Note: 示例决策', '# 示例决策'),
    })
    try {
      const r = spawnSync('node', [join(link, 'scripts', 'verify-note-format.ts'), root], { encoding: 'utf8', cwd: skillRoot })
      assert.equal(r.status, 1, `经 junction 调用时门禁被跳过了：status=${String(r.status)} stdout=${r.stdout} stderr=${r.stderr}`)
      assert.match(r.stderr, /line 1 must be/)
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  } finally {
    rmSync(base, { recursive: true, force: true })
  }
})
