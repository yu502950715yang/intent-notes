import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { spawnSync } from 'node:child_process'

function scaffold(notes: Record<string, string>): string {
  const root = mkdtempSync(join(tmpdir(), 'intent-notes-sealgate-'))
  for (const [rel, body] of Object.entries(notes)) {
    const abs = join(root, rel)
    mkdirSync(dirname(abs), { recursive: true })
    writeFileSync(abs, body)
  }
  return root
}

function run(args: string[]): { code: number; stdout: string; stderr: string } {
  const r = spawnSync('node', ['skills/intent-notes/scripts/verify-note-seal.ts', ...args], { encoding: 'utf8' })
  return { code: r.status ?? -1, stdout: r.stdout ?? '', stderr: r.stderr }
}

const ARCHIVED = { 'archived/bug-fix/2026-01-01-a.md': '# Agent Note: a\n\nStatus: implemented\nArchived: 2026-01-02\n' }

test('全绿时退 0 并打印检查篇数', () => {
  const root = scaffold(ARCHIVED)
  assert.equal(run([root, '--write']).code, 0)
  const r = run([root])
  assert.equal(r.code, 0, r.stderr)
  assert.match(r.stdout, /检查 1 篇/)
  rmSync(root, { recursive: true, force: true })
})

test('未封存退 1，报错前缀为 seal:', () => {
  const root = scaffold(ARCHIVED)
  const r = run([root])
  assert.equal(r.code, 1)
  assert.match(r.stderr, /seal: /)
  rmSync(root, { recursive: true, force: true })
})

test('--write 二次运行退 0 并报无新增产物', () => {
  const root = scaffold(ARCHIVED)
  run([root, '--write'])
  const r = run([root, '--write'])
  assert.equal(r.code, 0, r.stderr)
  assert.match(r.stdout, /无新增产物/)
  rmSync(root, { recursive: true, force: true })
})

test('--reseal 缺 --reason 退 1；带理由退 0', () => {
  const root = scaffold(ARCHIVED)
  run([root, '--write'])
  writeFileSync(join(root, 'archived/bug-fix/2026-01-01-a.md'), '# Agent Note: a 改\n\nStatus: implemented\nArchived: 2026-01-02\n')
  assert.equal(run([root, '--reseal', 'bug-fix/2026-01-01-a.md']).code, 1)
  assert.equal(run([root, '--reseal', 'bug-fix/2026-01-01-a.md', '--reason', '日期写错']).code, 0)
  assert.equal(run([root]).code, 0)
  rmSync(root, { recursive: true, force: true })
})

test('notes 根不存在 → fail-closed', () => {
  const r = run([join(tmpdir(), 'intent-notes-nonexistent-xyz')])
  assert.equal(r.code, 1)
  rmSync(join(tmpdir(), 'intent-notes-nonexistent-xyz'), { recursive: true, force: true })
})

test('notes 根是存在的普通文件 → fail-closed 退 1', () => {
  const holder = mkdtempSync(join(tmpdir(), 'intent-notes-sealgate-'))
  const file = join(holder, 'not-a-dir.md')
  writeFileSync(file, '# Agent Note: a\n')
  const r = run([file])
  assert.equal(r.code, 1)
  assert.match(r.stderr, /verify-note-seal: /)
  rmSync(holder, { recursive: true, force: true })
})

test('notes 根是可读目录但无 archived/ → 空树退 0 并警示确认根目录', () => {
  // 形如把项目根当 notes 根传入（门禁 3 的口径）：目录存在、archived/ 不存在
  const root = mkdtempSync(join(tmpdir(), 'intent-notes-sealgate-'))
  mkdirSync(join(root, '.agents', 'notes'), { recursive: true })
  const r = run([root])
  assert.equal(r.code, 0, r.stderr)
  assert.match(r.stdout, /请确认根目录正确/)
  rmSync(root, { recursive: true, force: true })
})

test('未知参数退 1 且给出用法', () => {
  const r = run(['--nope'])
  assert.equal(r.code, 1)
  assert.match(r.stderr, /用法/)
})
