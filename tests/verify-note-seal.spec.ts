import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { spawnSync } from 'node:child_process'

// 脚本路径相对仓库根解析：不锁 cwd 的话，从 tests/ 目录跑会整片失败
const repoRoot = resolve(import.meta.dirname, '..')

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
  const r = spawnSync('node', ['skills/intent-notes/scripts/verify-note-seal.ts', ...args], {
    encoding: 'utf8',
    cwd: repoRoot,
  })
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

test('模式旗标只认裸形式：--write=1 退 1，不再静默降级成只校验', () => {
  const root = scaffold(ARCHIVED)
  for (const bad of ['--write=1', '--first-seal=1', '--reseal=bug-fix/2026-01-01-a.md', '--forget=bug-fix/2026-01-01-a.md']) {
    const r = run([root, bad])
    assert.equal(r.code, 1, `${bad} 应退 1`)
    assert.match(r.stderr, /不接受值/)
    assert.doesNotMatch(r.stdout, /检查/)
  }
  assert.equal(existsSync(join(root, 'archived', 'manifest.json')), false, '拒绝时不得落盘')
  rmSync(root, { recursive: true, force: true })
})

test('--reason= 的内联形式必须保留，--first-seal 只能与 --write 连用', () => {
  const root = scaffold(ARCHIVED)
  run([root, '--write'])
  const note = join(root, 'archived', 'bug-fix', '2026-01-01-a.md')
  writeFileSync(note, '# Agent Note: a 改\n\nStatus: implemented\nArchived: 2026-01-02\n')
  assert.equal(run([root, '--reseal', 'bug-fix/2026-01-01-a.md', '--reason=日期写错']).code, 0)
  const bad = run([root, '--first-seal'])
  assert.equal(bad.code, 1)
  assert.match(bad.stderr, /只能与 --write 连用/)
  rmSync(root, { recursive: true, force: true })
})

test('非 git 仓库里 --write --first-seal 照常退 0（探测不到 HEAD 不误伤首次启用）', () => {
  const root = scaffold(ARCHIVED)
  assert.equal(run([root, '--write', '--first-seal']).code, 0)
  assert.equal(run([root]).code, 0)
  rmSync(root, { recursive: true, force: true })
})
