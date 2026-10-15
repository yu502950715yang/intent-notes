import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { spawnSync } from 'node:child_process'
import { gitTracksFile } from '../skills/intent-notes/scripts/note-anchors.ts'

function git(cwd: string, ...args: string[]): void {
  const r = spawnSync('git', args, { cwd, encoding: 'utf8' })
  assert.equal(r.status, 0, `git ${args.join(' ')} 失败：${r.stderr}`)
}

test('gitTracksFile 以 HEAD 为准判断文件是否被跟踪', () => {
  const repo = mkdtempSync(join(tmpdir(), 'intent-notes-anchors-'))
  try {
    git(repo, 'init', '-q', '-b', 'main')
    git(repo, 'config', 'user.email', 't@example.com')
    git(repo, 'config', 'user.name', 't')
    const tracked = join(repo, 'src', 'a.ts')
    mkdirSync(dirname(tracked), { recursive: true })
    writeFileSync(tracked, 'x\n')
    git(repo, 'add', '.')
    git(repo, 'commit', '-q', '-m', 'init')

    assert.equal(gitTracksFile(repo, 'src/a.ts'), true, 'HEAD 里的文件应判为已跟踪')

    // 只在工作区存在、从未提交 → HEAD 树里没有
    writeFileSync(join(repo, 'untracked.ts'), 'x\n')
    assert.equal(gitTracksFile(repo, 'untracked.ts'), false)

    // 已 add 未 commit 也不算：基准是 HEAD，不是暂存区（否则会为未落地的改动背书）
    writeFileSync(join(repo, 'staged.ts'), 'x\n')
    git(repo, 'add', 'staged.ts')
    assert.equal(gitTracksFile(repo, 'staged.ts'), false, '暂存区不算：判断基准是 HEAD')

    // 未初始化的目录里 cat-file 失败，必须退 false 而不是抛异常
    const plain = mkdtempSync(join(tmpdir(), 'intent-notes-anchors-plain-'))
    try {
      assert.equal(gitTracksFile(plain, 'a.ts'), false)
    } finally {
      rmSync(plain, { recursive: true, force: true })
    }
  } finally {
    rmSync(repo, { recursive: true, force: true })
  }
})
