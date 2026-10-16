import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync, cpSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { isAbsolute, join, resolve } from 'node:path'
import { spawnSync } from 'node:child_process'

const repoRoot = resolve(import.meta.dirname, '..')
const scriptPath = join(repoRoot, 'skills', 'intent-notes', 'scripts', 'install-hook.ts')

function freshProject(): string {
  const root = mkdtempSync(join(tmpdir(), 'intent-notes-hook-'))
  mkdirSync(join(root, '.git', 'hooks'), { recursive: true })
  return root
}

function run(args: string[]): { code: number; stdout: string; stderr: string } {
  const r = spawnSync('node', ['skills/intent-notes/scripts/install-hook.ts', ...args], { encoding: 'utf8', cwd: repoRoot })
  return { code: r.status ?? -1, stdout: r.stdout ?? '', stderr: r.stderr ?? '' }
}

/** 取出 hook 里 `SKILL="..."` 的值，用于断言脚本路径的写法。 */
function skillPathOf(hook: string): string {
  const m = /^SKILL="(.+)"$/m.exec(hook)
  assert.ok(m !== null, 'hook 里缺少 SKILL 赋值行')
  return m[1]
}

test('无 .git → 报先跑 init 并退 1', () => {
  const root = mkdtempSync(join(tmpdir(), 'intent-notes-nogit-'))
  const r = run([root])
  assert.equal(r.code, 1)
  assert.match(r.stderr, /init/)
  rmSync(root, { recursive: true, force: true })
})

test('写入 hook，含两段按路径触发与 node 缺失时的拒绝', () => {
  const root = freshProject()
  const r = run([root])
  assert.equal(r.code, 0, r.stderr)
  const hook = readFileSync(join(root, '.git', 'hooks', 'pre-commit'), 'utf8')
  assert.match(hook, /^#!\/bin\/sh/)
  assert.match(hook, /git diff --cached --quiet -- "\$NOTES\/archived"/)
  assert.match(hook, /verify-note-seal\.ts/)
  assert.match(hook, /verify-note-tree\.ts/)
  assert.match(hook, /verify-note-format\.ts/)
  assert.match(hook, /command -v node/)
  rmSync(root, { recursive: true, force: true })
})

test('内容一致时重复安装退 0 且不重写', () => {
  const root = freshProject()
  run([root])
  const hookPath = join(root, '.git', 'hooks', 'pre-commit')
  const first = readFileSync(hookPath, 'utf8')
  const r = run([root])
  assert.equal(r.code, 0, r.stderr)
  assert.match(r.stdout, /已安装/)
  assert.equal(readFileSync(hookPath, 'utf8'), first)
  rmSync(root, { recursive: true, force: true })
})

test('已有他人 pre-commit → 拒绝且原文不动，--force 才覆盖', () => {
  const root = freshProject()
  const hookPath = join(root, '.git', 'hooks', 'pre-commit')
  writeFileSync(hookPath, '#!/bin/sh\necho 别人的钩子\n')
  const r = run([root])
  assert.equal(r.code, 1)
  assert.match(r.stderr, /已存在/)
  assert.equal(readFileSync(hookPath, 'utf8'), '#!/bin/sh\necho 别人的钩子\n')
  assert.equal(run([root, '--force']).code, 0)
  assert.match(readFileSync(hookPath, 'utf8'), /Intent Notes pre-commit/)
  rmSync(root, { recursive: true, force: true })
})

test('--dry-run 不落盘', () => {
  const root = freshProject()
  const r = run([root, '--dry-run'])
  assert.equal(r.code, 0, r.stderr)
  assert.equal(existsSync(join(root, '.git', 'hooks', 'pre-commit')), false)
  rmSync(root, { recursive: true, force: true })
})

test('缺参数退 1 并给出用法', () => {
  const r = run([])
  assert.equal(r.code, 1)
  assert.match(r.stderr, /用法/)
})

test('skill 在项目外写绝对路径，在项目内写相对路径（两条分支都转正斜杠）', () => {
  const outside = freshProject()
  assert.equal(run([outside]).code, 0)
  const outsideHook = readFileSync(join(outside, '.git', 'hooks', 'pre-commit'), 'utf8')
  // 项目整体搬走时绝对路径会失效，所以项目外只能绝对路径、项目内必须相对路径
  assert.ok(isAbsolute(skillPathOf(outsideHook)), `项目外应写绝对路径，实际：${skillPathOf(outsideHook)}`)
  rmSync(outside, { recursive: true, force: true })

  const inside = freshProject()
  const scripts = join(inside, 'skills', 'intent-notes', 'scripts')
  mkdirSync(scripts, { recursive: true })
  cpSync(scriptPath, join(scripts, 'install-hook.ts'))
  const r = spawnSync('node', [join(scripts, 'install-hook.ts'), inside], { encoding: 'utf8', cwd: repoRoot })
  assert.equal(r.status, 0, r.stderr)
  const insideHook = readFileSync(join(inside, '.git', 'hooks', 'pre-commit'), 'utf8')
  assert.equal(skillPathOf(insideHook), 'skills/intent-notes')
  // 反斜杠在 sh 里是转义符，两条分支都不能出现
  assert.ok(!outsideHook.includes('\\') && !insideHook.includes('\\'), '生成的 hook 里不应有反斜杠')
  rmSync(inside, { recursive: true, force: true })
})

test('.git 是 gitdir 指针文件（worktree）→ 退 1 且不落盘', () => {
  const root = mkdtempSync(join(tmpdir(), 'intent-notes-worktree-'))
  writeFileSync(join(root, '.git'), 'gitdir: /elsewhere/.git/worktrees/demo\n')
  const r = run([root])
  assert.equal(r.code, 1)
  assert.match(r.stderr, /gitdir/)
  assert.equal(existsSync(join(root, '.git', 'hooks', 'pre-commit')), false)
  rmSync(root, { recursive: true, force: true })
})

test('pre-commit 是目录 → 报错退 1，不抛裸 EISDIR', () => {
  const root = freshProject()
  mkdirSync(join(root, '.git', 'hooks', 'pre-commit'), { recursive: true })
  const r = run([root])
  assert.equal(r.code, 1)
  assert.match(r.stderr, /不是普通文件/)
  assert.doesNotMatch(r.stderr, /EISDIR/)
  rmSync(root, { recursive: true, force: true })
})
