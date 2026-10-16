import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync, cpSync, symlinkSync } from 'node:fs'
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

/** 取出 hook 里 `SKILL='…'` 的值（单引号赋值，内嵌单引号按 `'\''` 转义），用于断言脚本路径的写法。 */
function skillPathOf(hook: string): string {
  const m = /^SKILL='(.*)'$/m.exec(hook)
  assert.ok(m !== null, 'hook 里缺少 SKILL 赋值行')
  return (m[1] ?? '').replace(/'\\''/g, "'")
}

/** git 不可用的环境里跳过依赖真实仓库的用例，而不是假绿。 */
function gitAvailable(): boolean {
  return spawnSync('git', ['--version'], { encoding: 'utf8' }).status === 0
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
  // 封印清单必须与笔记一起进 index，否则 commit 里的 manifest 与笔记不符
  assert.match(hook, /git diff --quiet -- "\$MANIFEST"/)
  assert.match(hook, /git ls-files --error-unmatch -- "\$MANIFEST"/)
  assert.match(hook, /archived\/manifest\.json 未 git add/)
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

test('core.hooksPath 指向别处 → 报错退 1 且不落盘（否则 git 根本读不到）', (t) => {
  if (!gitAvailable()) {
    t.skip('本机没有 git')
    return
  }
  const root = mkdtempSync(join(tmpdir(), 'intent-notes-hookspath-'))
  spawnSync('git', ['-C', root, 'init'], { encoding: 'utf8' })
  spawnSync('git', ['-C', root, 'config', 'core.hooksPath', '.husky'], { encoding: 'utf8' })
  const r = run([root])
  assert.equal(r.code, 1)
  assert.match(r.stderr, /core\.hooksPath/)
  assert.match(r.stderr, /\.husky/)
  assert.equal(existsSync(join(root, '.git', 'hooks', 'pre-commit')), false)
  rmSync(root, { recursive: true, force: true })
})

test('pre-commit 是指向项目外的悬空链接 → 拒绝，不沿链接写出去', (t) => {
  const root = freshProject()
  const outside = mkdtempSync(join(tmpdir(), 'intent-notes-outside-'))
  const victim = join(outside, 'pwned')
  try {
    // 目标不存在：existsSync 跟随链接会返回 false，老代码会一路 writeFileSync 写出去
    symlinkSync(victim, join(root, '.git', 'hooks', 'pre-commit'), 'file')
  } catch (e) {
    t.skip(`本机无法创建文件型符号链接（${(e as NodeJS.ErrnoException).code}）`)
    rmSync(root, { recursive: true, force: true })
    rmSync(outside, { recursive: true, force: true })
    return
  }
  const r = run([root])
  assert.equal(r.code, 1)
  assert.match(r.stderr, /不是普通文件/)
  assert.equal(existsSync(victim), false, '项目外不得被创建')
  rmSync(root, { recursive: true, force: true })
  rmSync(outside, { recursive: true, force: true })
})

test('.git 是链接到真实目录 → 放行（不是 gitdir 指针文件）', (t) => {
  const root = mkdtempSync(join(tmpdir(), 'intent-notes-gitlink-'))
  const realGit = join(root, 'real-git')
  mkdirSync(join(realGit, 'hooks'), { recursive: true })
  try {
    symlinkSync(realGit, join(root, '.git'), process.platform === 'win32' ? 'junction' : 'dir')
  } catch (e) {
    t.skip(`本机无法创建目录型链接（${(e as NodeJS.ErrnoException).code}）`)
    rmSync(root, { recursive: true, force: true })
    return
  }
  const r = run([root])
  assert.equal(r.code, 0, r.stderr)
  assert.equal(existsSync(join(realGit, 'hooks', 'pre-commit')), true)
  rmSync(root, { recursive: true, force: true })
})

test('.git/hooks 是普通文件 → 拒绝写入', () => {
  const root = mkdtempSync(join(tmpdir(), 'intent-notes-hooksfile-'))
  mkdirSync(join(root, '.git'), { recursive: true })
  writeFileSync(join(root, '.git', 'hooks'), 'not a directory\n')
  const r = run([root])
  assert.equal(r.code, 1)
  assert.match(r.stderr, /不是普通目录/)
  rmSync(root, { recursive: true, force: true })
})

test('skill 路径含 $ 时用单引号赋值（shell 不展开，反引号同理）', () => {
  const root = freshProject()
  const skillDir = join(root, 'sk$ill', 'intent-notes')
  mkdirSync(join(skillDir, 'scripts'), { recursive: true })
  cpSync(scriptPath, join(skillDir, 'scripts', 'install-hook.ts'))
  const r = spawnSync('node', [join(skillDir, 'scripts', 'install-hook.ts'), root], { encoding: 'utf8', cwd: repoRoot })
  assert.equal(r.status, 0, r.stderr)
  const hook = readFileSync(join(root, '.git', 'hooks', 'pre-commit'), 'utf8')
  const line = hook.split('\n').find(l => l.startsWith('SKILL=')) ?? ''
  assert.equal(line, "SKILL='sk$ill/intent-notes'")
  assert.equal(skillPathOf(hook), 'sk$ill/intent-notes')
  rmSync(root, { recursive: true, force: true })
})
