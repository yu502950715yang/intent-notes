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

test('链接目标含空格时仍做断链检查（不得假绿）', () => {
  // `[^)\s]+` 这类正则遇到空格就匹配不到，断链会被静默放过
  const root = scaffold({ 'implemented/feature/2026-01-01-a.md': note('见 [缺失](my file.md)。') })
  try {
    const { code, stderr } = runTreeGate(root)
    assert.equal(code, 1, `含空格的断链被放过了：${stderr}`)
    assert.match(stderr, /相对链接指向不存在的文件：my file\.md/)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('尖括号包裹的链接目标仍做断链检查', () => {
  const root = scaffold({ 'implemented/feature/2026-01-01-a.md': note('见 [缺失](<my file.md>)。') })
  try {
    const { code, stderr } = runTreeGate(root)
    assert.equal(code, 1, `尖括号目标被放过了：${stderr}`)
    assert.match(stderr, /相对链接指向不存在的文件：my file\.md/)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('引用式链接定义仍做断链检查', () => {
  const root = scaffold({
    'implemented/feature/2026-01-01-a.md': note(['见 [它][ref]。', '', '[ref]: missing-file.md'].join('\n')),
  })
  try {
    const { code, stderr } = runTreeGate(root)
    assert.equal(code, 1, `引用式定义的断链被放过了：${stderr}`)
    assert.match(stderr, /相对链接指向不存在的文件：missing-file\.md/)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('任意 scheme 的外链与协议相对 URL 不做断链检查', () => {
  const root = scaffold({
    'implemented/feature/2026-01-01-a.md': note('见 [邮件](mailto:a@b.com) 与 [协议相对](//example.com/x.md)。'),
  })
  try {
    const { code, stderr } = runTreeGate(root)
    assert.equal(code, 0, `外链被当成断链：${stderr}`)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('%20 编码与查询串指向真实文件时判绿', () => {
  const root = scaffold({
    'implemented/feature/2026-01-01-a.md': note('见 [空格](2026-01-02-my%20file.md) 与 [查询](2026-01-02-b.md?raw=1)。'),
    'implemented/feature/2026-01-02-my file.md': note('t'),
    'implemented/feature/2026-01-02-b.md': note('t'),
  })
  try {
    const { code, stderr } = runTreeGate(root)
    assert.equal(code, 0, `URL 编码/查询串被当成断链：${stderr}`)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('行内代码、缩进代码块与 HTML 注释里的示例链接不算真链接', () => {
  // 记录链接写法的合法笔记会在这些位置引示例；围栏已豁免，其余三种必须同口径
  const root = scaffold({
    'implemented/feature/2026-01-01-a.md': note(
      ['写法是 `[见](missing-inline.md)`。', '', '    [见](missing-indented.md)', '', '<!-- [见](missing-comment.md) -->'].join(
        '\n',
      ),
    ),
  })
  try {
    const { code, stderr } = runTreeGate(root)
    assert.equal(code, 0, `示例链接被当成断链：${stderr}`)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('archived 笔记的相对链接豁免（归档已冻结，不再跟着目标改名）', () => {
  // 归档承诺「不再编辑、移动、重格式化」；若链接仍被校验，目标改名后只能靠编辑归档笔记解红
  const root = scaffold({
    'archived/feature/2026-01-01-a.md': [
      '# Agent Note: t',
      '',
      'Status: implemented',
      'Archived: 2026-01-02',
      '',
      '## Problem',
      '',
      '见 [旧文档](../../docs/old.md)。',
    ].join('\n'),
  })
  try {
    const { code, stderr } = runTreeGate(root)
    assert.equal(code, 0, `归档笔记的断链被判红：${stderr}`)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})
