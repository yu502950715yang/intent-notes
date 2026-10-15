import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { spawnSync } from 'node:child_process'

const skillRoot = resolve(import.meta.dirname, '../skills/intent-notes')

/** 按「相对路径 → 内容」造一棵笔记树，返回 notes 根。 */
function scaffold(files: Record<string, string>): string {
  const root = mkdtempSync(join(tmpdir(), 'intent-notes-tree-'))
  for (const [rel, text] of Object.entries(files)) {
    const abs = join(root, rel)
    mkdirSync(dirname(abs), { recursive: true })
    writeFileSync(abs, text)
  }
  return root
}

function runTreeGate(root: string): { code: number; stdout: string; stderr: string } {
  const r = spawnSync('node', [join(skillRoot, 'scripts', 'verify-note-tree.ts'), root], { encoding: 'utf8' })
  return { code: r.status ?? 1, stdout: r.stdout ?? '', stderr: r.stderr ?? '' }
}

/** 结构与格式合规与否无关：门禁 1 只看树形与链接。 */
function note(body: string): string {
  return ['# Agent Note: t', '', 'Status: implemented', '', '## Problem', '', body].join('\n')
}

test('相对链接指向不存在的文件时判红，并给出行号', () => {
  const root = scaffold({ 'implemented/feature/2026-01-01-a.md': note('见 [缺失](missing-file.md)。') })
  try {
    const { code, stderr } = runTreeGate(root)
    assert.equal(code, 1)
    assert.match(stderr, /相对链接指向不存在的文件：missing-file\.md/)
    assert.match(stderr, /2026-01-01-a\.md:7/, `未给出行号：${stderr}`)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('相对链接指向存在的文件时判绿', () => {
  const root = scaffold({
    'implemented/feature/2026-01-01-a.md': note('见 [另一篇](2026-01-02-b.md)。'),
    'implemented/feature/2026-01-02-b.md': note('t'),
  })
  try {
    const { code, stdout } = runTreeGate(root)
    assert.equal(code, 0, stdout)
    assert.match(stdout, /检查 2 篇笔记，结构全部合规。/)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('外部 URL 与纯锚点不做断链检查', () => {
  const root = scaffold({
    'implemented/feature/2026-01-01-a.md': note(
      ['见 [外链](https://example.com/x.md)、[明文链接](http://example.com/y) 与 [锚点](#problem)。'].join('\n'),
    ),
  })
  try {
    assert.equal(runTreeGate(root).code, 0)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('带锚点的本地链接只校验文件部分', () => {
  const ok = scaffold({
    'implemented/feature/2026-01-01-a.md': note(['[同篇](2026-01-01-a.md#problem)'].join('\n')),
  })
  const bad = scaffold({ 'implemented/feature/2026-01-01-a.md': note('[断链](missing.md#l1)') })
  try {
    assert.equal(runTreeGate(ok).code, 0)
    assert.equal(runTreeGate(bad).code, 1)
  } finally {
    rmSync(ok, { recursive: true, force: true })
    rmSync(bad, { recursive: true, force: true })
  }
})

test('代码围栏里的示例链接不算真链接', () => {
  // 记录本格式的笔记会在围栏里引示例（见 references/note-format.md）。门禁 3 已按围栏解析
  // （note-anchors.ts 的 fenceAwareLines），门禁 1 必须同口径，否则合法笔记被误红。
  const root = scaffold({
    'implemented/feature/2026-01-01-a.md': note(
      ['记录本格式时会在围栏里引示例：', '', '```md', '见 [下游说明](missing-file.md)。', '```', '', '正文没有真链接。'].join('\n'),
    ),
  })
  try {
    const { code, stderr } = runTreeGate(root)
    assert.equal(code, 0, `围栏里的示例链接被当成了真链接：${stderr}`)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('四反引号外套三反引号时，内层示例链接同样不算真链接', () => {
  const root = scaffold({
    'implemented/feature/2026-01-01-a.md': note(
      [
        '嵌套围栏：',
        '',
        '````md',
        '```md',
        '见 [内层示例](missing-inner.md)。',
        '```',
        '````',
        '',
        '正文没有真链接。',
      ].join('\n'),
    ),
  })
  try {
    assert.equal(runTreeGate(root).code, 0)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('0 篇笔记时退 0 但摘要点明「未发现任何笔记」', () => {
  // 根目录写错与 init 刚建完的空骨架都退 0：摘要必须让两者可分辨
  const root = scaffold({})
  try {
    const { code, stdout } = runTreeGate(root)
    assert.equal(code, 0)
    assert.match(stdout, /未发现任何笔记/)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})
