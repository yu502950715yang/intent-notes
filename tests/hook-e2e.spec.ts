/**
 * pre-commit 闸门的端到端用例：在真实 git 仓库里装上 hook 后 **真的提交一次**。
 *
 * 其余 install-hook 用例只断言 hook 的文本，而 hook 是门禁 4 唯一的自动触发点——
 * 「core.hooksPath 让闸门空转」「manifest 没 git add」「整树删除洗白」这几类问题
 * 只有真跑一遍 commit 才看得见。
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { spawnSync } from 'node:child_process'

const repoRoot = resolve(import.meta.dirname, '..')
const installHook = join(repoRoot, 'skills', 'intent-notes', 'scripts', 'install-hook.ts')
const sealCli = join(repoRoot, 'skills', 'intent-notes', 'scripts', 'verify-note-seal.ts')

const NOTES = '.agents/notes'
const NOTE = 'archived/bug-fix/2026-01-01-a.md'
const ARCHIVED_BODY = '# Agent Note: a\n\nStatus: implemented\nArchived: 2026-01-02\n\n## Problem\n\n动机。\n\n## Decision\n\n做法。\n\n## Affected repositories\n\n- `demo` 不涉及\n\n## Alternatives considered\n\n**甲。** 理由。\n\n## Consequences\n\n代价。\n'
const IMPLEMENTED_BODY = '# Agent Note: x\n\nStatus: implemented\n\n## Problem\n\n动机。\n\n## Decision\n\n做法。\n\n## Affected repositories\n\n- `demo` 不涉及\n\n## Alternatives considered\n\n**甲。** 理由。\n\n## Consequences\n\n代价。\n'

interface Ran {
  code: number
  stdout: string
  stderr: string
}

function gitAvailable(): boolean {
  return spawnSync('git', ['--version'], { encoding: 'utf8' }).status === 0
}

function git(cwd: string, args: string[]): Ran {
  const r = spawnSync('git', args, {
    encoding: 'utf8',
    cwd,
    env: { ...process.env, GIT_TERMINAL_PROMPT: '0' },
  })
  return { code: r.status ?? -1, stdout: r.stdout ?? '', stderr: r.stderr ?? '' }
}

/** 真实仓库 + 身份与换行配置：不依赖全局 core.autocrlf / commit.gpgsign。 */
function freshRepo(): string {
  const root = mkdtempSync(join(tmpdir(), 'intent-notes-e2e-'))
  git(root, ['init'])
  git(root, ['config', 'user.name', 'intent-notes test'])
  git(root, ['config', 'user.email', 'test@example.com'])
  git(root, ['config', 'core.autocrlf', 'false'])
  git(root, ['config', 'commit.gpgsign', 'false'])
  return root
}

function write(root: string, rel: string, body: string): void {
  const abs = join(root, rel)
  mkdirSync(dirname(abs), { recursive: true })
  writeFileSync(abs, body)
}

function commit(root: string, message: string): Ran {
  return git(root, ['commit', '-m', message])
}

/** 装 hook 并断言成功；Windows 上 hook 由 Git for Windows 的 sh 执行。 */
function install(root: string): void {
  const r = spawnSync('node', [installHook, root], { encoding: 'utf8', cwd: repoRoot })
  assert.equal(r.status, 0, r.stderr)
}

/** 直接跑门禁 4 CLI。 */
function seal(root: string, ...args: string[]): Ran {
  const r = spawnSync('node', [sealCli, join(root, NOTES), ...args], { encoding: 'utf8', cwd: root })
  return { code: r.status ?? -1, stdout: r.stdout ?? '', stderr: r.stderr ?? '' }
}

/** 备好一棵已封印、已提交的归档树（此时还没装 hook）。 */
function seedSealed(root: string): void {
  write(root, `${NOTES}/${NOTE}`, ARCHIVED_BODY)
  // 另放一篇活跃笔记：`git rm -r archived/` 会把空掉的父目录一并删掉，有它在 notes 根才活得下来，
  // 从而复现「归档整树被删、notes 根依旧存在」这一真实形态
  write(root, `${NOTES}/implemented/feature/2026-01-01-live.md`, IMPLEMENTED_BODY)
  const w = seal(root, '--write')
  assert.equal(w.code, 0, w.stderr)
  git(root, ['add', '-A'])
  const c = commit(root, 'seed：归档并封印一篇')
  assert.equal(c.code, 0, c.stderr)
}

function cleanup(root: string): void {
  rmSync(root, { recursive: true, force: true })
}

test('只改代码的 commit：成功且没有任何门禁输出（零开销）', (t) => {
  if (!gitAvailable()) return t.skip('本机没有 git')
  const root = freshRepo()
  seedSealed(root)
  install(root)
  write(root, 'src/a.txt', 'hello\n')
  git(root, ['add', 'src/a.txt'])

  const r = commit(root, '只改代码')
  assert.equal(r.code, 0, r.stderr)
  assert.doesNotMatch(r.stdout + r.stderr, /intent-notes:|verify-note/)
  cleanup(root)
})

test('篡改归档笔记 → commit 被拒', (t) => {
  if (!gitAvailable()) return t.skip('本机没有 git')
  const root = freshRepo()
  seedSealed(root)
  install(root)
  write(root, `${NOTES}/${NOTE}`, ARCHIVED_BODY.replace('做法。', '做法（被改过）。'))
  git(root, ['add', `${NOTES}/${NOTE}`])

  const r = commit(root, '篡改归档')
  assert.notEqual(r.code, 0, '闸门必须拦住这项提交')
  assert.match(r.stdout + r.stderr, /内容已改动/)
  cleanup(root)
})

test('--reseal --reason 之后 → commit 通过', (t) => {
  if (!gitAvailable()) return t.skip('本机没有 git')
  const root = freshRepo()
  seedSealed(root)
  install(root)
  write(root, `${NOTES}/${NOTE}`, ARCHIVED_BODY.replace('做法。', '做法（修正）。'))
  const reseal = seal(root, '--reseal', 'bug-fix/2026-01-01-a.md', '--reason', '错别字')
  assert.equal(reseal.code, 0, reseal.stderr)
  git(root, ['add', '-A'])

  const r = commit(root, '重新封印')
  assert.equal(r.code, 0, r.stderr)
  cleanup(root)
})

test('manifest 未 git add → commit 被拒（封印不随本次提交生效）', (t) => {
  if (!gitAvailable()) return t.skip('本机没有 git')
  const root = freshRepo()
  seedSealed(root)
  install(root)
  // 新归档一篇 → --write 会更新 manifest；只 add 笔记，故意不 add manifest
  const second = 'archived/feature/2026-02-02-b.md'
  write(root, `${NOTES}/${second}`, ARCHIVED_BODY.replace('a', 'b').replace('2026-01-02', '2026-02-03'))
  const w = seal(root, '--write')
  assert.equal(w.code, 0, w.stderr)
  git(root, ['add', `${NOTES}/${second}`])

  const r = commit(root, '归档但不带 manifest')
  assert.notEqual(r.code, 0)
  assert.match(r.stdout + r.stderr, /未 git add/)
  cleanup(root)
})

test('整树删除 archived/ → commit 被拒（整树删除不能靠空树洗白）', (t) => {
  if (!gitAvailable()) return t.skip('本机没有 git')
  const root = freshRepo()
  seedSealed(root)
  install(root)
  const rm = git(root, ['rm', '-r', `${NOTES}/archived`])
  assert.equal(rm.code, 0, rm.stderr)

  const r = commit(root, '删掉整棵归档树')
  assert.notEqual(r.code, 0)
  assert.match(r.stdout + r.stderr, /曾存在于版本控制中/)
  cleanup(root)
})

test('删掉 manifest 后 --write 被拒，仅 --first-seal 放行（封印重置不得无痕）', (t) => {
  if (!gitAvailable()) return t.skip('本机没有 git')
  const root = freshRepo()
  seedSealed(root)
  const manifest = join(root, NOTES, 'archived', 'manifest.json')
  rmSync(manifest)

  const blocked = seal(root, '--write')
  assert.equal(blocked.code, 1)
  assert.match(blocked.stderr, /曾存在于版本控制中/)
  assert.match(blocked.stderr, /--first-seal/)
  const allowed = seal(root, '--write', '--first-seal')
  assert.equal(allowed.code, 0, allowed.stderr)
  cleanup(root)
})

test('HEAD 里从未有过 manifest（真首次启用）→ --write 照常退 0，随后提交通过', (t) => {
  if (!gitAvailable()) return t.skip('本机没有 git')
  const root = freshRepo()
  // 先在没有 hook、也没有封印的情况下把归档笔记提交进版本控制（存量项目的历史形态）
  write(root, `${NOTES}/${NOTE}`, ARCHIVED_BODY)
  git(root, ['add', '-A'])
  assert.equal(commit(root, '先有归档笔记，还没有封印').code, 0)
  install(root)

  const w = seal(root, '--write')
  assert.equal(w.code, 0, w.stderr)
  git(root, ['add', '-A'])
  const r = commit(root, '首次封印')
  assert.equal(r.code, 0, r.stderr)
  cleanup(root)
})

test('core.autocrlf=true 的检出把笔记换成 CRLF → 门禁 4 仍绿（普通 clone 不误报）', (t) => {
  if (!gitAvailable()) return t.skip('本机没有 git')
  const root = freshRepo()
  git(root, ['config', 'core.autocrlf', 'true'])
  seedSealed(root)
  // 模拟普通 checkout / clone：删掉工作树再检出，Git 会按 autocrlf 写成 CRLF
  rmSync(join(root, NOTES, 'archived'), { recursive: true, force: true })
  const co = git(root, ['checkout', '-f', '--', `${NOTES}/archived`])
  assert.equal(co.code, 0, co.stderr)
  assert.ok(
    readFileSync(join(root, NOTES, NOTE), 'utf8').includes('\r\n'),
    '前置条件：这次检出必须真的产出 CRLF，否则用例没意义',
  )

  const r = seal(root)
  assert.equal(r.code, 0, r.stderr)
  cleanup(root)
})

test('归档树为空（无 archived/、无 manifest）→ commit 通过', (t) => {
  if (!gitAvailable()) return t.skip('本机没有 git')
  const root = freshRepo()
  install(root)
  write(root, `${NOTES}/implemented/feature/2026-01-01-x.md`, IMPLEMENTED_BODY)
  git(root, ['add', '-A'])

  const r = commit(root, '第一篇活跃笔记')
  assert.equal(r.code, 0, r.stderr)
  cleanup(root)
})
