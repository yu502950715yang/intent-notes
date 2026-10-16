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

function runFormatGate(root: string): { code: number; stdout: string; stderr: string } {
  const r = spawnSync('node', ['skills/intent-notes/scripts/verify-note-format.ts', root], { encoding: 'utf8' })
  return { code: r.status ?? -1, stdout: r.stdout ?? '', stderr: r.stderr }
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

test('带 UTF-8 BOM 的合法笔记通过', () => {
  // Windows 的编辑器与重定向常写 BOM；不剥会让第 1 行判定恒失败，而报错完全不提 BOM
  const root = scaffold({ 'implemented/architecture/2026-01-01-bom.md': `\uFEFF${GOOD_IMPLEMENTED}` })
  try {
    const { code, stderr } = runFormatGate(root)
    assert.equal(code, 0, `BOM 让合法笔记被误判：${stderr}`)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('正文残留未替换的 {{...}} 占位判红', () => {
  const root = scaffold({
    'implemented/architecture/2026-01-01-t.md': GOOD_IMPLEMENTED.replace('现在时描述已落地事实。', '{{现在时描述已落地事实。}}'),
  })
  try {
    const { code, stderr } = runFormatGate(root)
    assert.equal(code, 1, '未替换的模板占位被放过了：正文可以是一堆 {{...}} 而门禁全绿')
    assert.match(stderr, /模板占位/)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('围栏里的 {{...}} 示例不算未替换占位', () => {
  // 记录模板语法的笔记会在代码块里写占位示例；只有围栏外的才是真占位
  const body = GOOD_IMPLEMENTED.replace(
    '现在时描述已落地事实。',
    ['模板长这样：', '', '```md', '## Decision', '', '{{现在时描述已落地事实。}}', '```'].join('\n'),
  )
  const root = scaffold({ 'implemented/architecture/2026-01-01-t.md': body })
  try {
    assert.equal(runFormatGate(root).code, 0)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('二级标题允许 CommonMark 的 ≤3 空格缩进（与门禁 3 同口径）', () => {
  const indented = GOOD_IMPLEMENTED.replace(/^## /gm, ' ## ')
  const root = scaffold({ 'implemented/architecture/2026-01-01-ind.md': indented })
  try {
    const { code, stderr } = runFormatGate(root)
    assert.equal(code, 0, `缩进的二级标题被误判（同一写法门禁 3 认）：${stderr}`)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('0 篇笔记时退 0，但摘要不自称「格式全部合规」', () => {
  // 根路径写错与 init 刚建完的空骨架都退 0：摘要必须让两者可分辨（与门禁 1 同口径）
  const root = scaffold({})
  try {
    const { code, stdout } = runFormatGate(root)
    assert.equal(code, 0)
    assert.doesNotMatch(stdout, /全部合规/)
    assert.match(stdout, /未发现任何笔记/)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('rejected 的状态行必须是 em dash + 原因', () => {
  // rejected 是「冻结的提案形态」：骨架与 proposed 同（含验收标准与风险），否则否决理由失去依据
  const rejected = (status: string): string =>
    ['# Agent Note: t', '', status, '', '## Problem', '', 'p', '', '## Proposal', '', '拟议内容', '', '## Alternatives considered', '', '- a', '', '## Acceptance criteria', '', 'a', '', '## Risks', '', 'r'].join('\n')
  const bad = scaffold({ 'rejected/feature/2026-01-01-a.md': rejected('Status: rejected - 全角连字符') })
  const good = scaffold({ 'rejected/feature/2026-01-01-a.md': rejected('Status: rejected — 改用方案 B') })
  try {
    assert.equal(runFormatGate(good).code, 0)
    assert.equal(runFormatGate(bad).code, 1)
  } finally {
    rmSync(bad, { recursive: true, force: true })
    rmSync(good, { recursive: true, force: true })
  }
})

test('rejected 缺验收标准或风险则判红（与 proposed 同骨架）', () => {
  const bare = ['# Agent Note: t', '', 'Status: rejected — 改用方案 B', '', '## Problem', '', 'p', '', '## Proposal', '', '拟议内容', '', '## Alternatives considered', '', '- a'].join('\n')
  const root = scaffold({ 'rejected/feature/2026-01-01-a.md': bare })
  try {
    const { code, stderr } = runFormatGate(root)
    assert.equal(code, 1, `rejected 丢了验收标准与风险却全绿：${stderr}`)
    assert.match(stderr, /## Acceptance criteria/)
    assert.match(stderr, /## Risks/)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('proposed 缺必备节判红', () => {
  const proposed = ['# Agent Note: t', '', 'Status: proposed', '', '## Problem', '', 'p', '', '## Alternatives considered', '', '- a'].join('\n')
  const root = scaffold({ 'proposed/feature/2026-01-01-a.md': proposed })
  try {
    const { code, stderr } = runFormatGate(root)
    assert.equal(code, 1)
    assert.match(stderr, /## Proposal/)
    assert.match(stderr, /## Acceptance criteria/)
    assert.match(stderr, /## Risks/)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('非归档笔记的第 4 行必须为空', () => {
  const body = GOOD_IMPLEMENTED.replace('Status: implemented\n', 'Status: implemented\nArchived: 2026-01-02\n')
  const root = scaffold({ 'implemented/architecture/2026-01-01-a.md': body })
  try {
    const { code, stderr } = runFormatGate(root)
    assert.equal(code, 1)
    assert.match(stderr, /line 4 must be blank/)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('archived 笔记出现提案用语判红', () => {
  const body = GOOD_ARCHIVED.replace('## Decision', '## Proposal')
  const root = scaffold({ 'archived/architecture/2026-01-01-a.md': body })
  try {
    const { code, stderr } = runFormatGate(root)
    assert.equal(code, 1)
    assert.match(stderr, /proposal-era heading/)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('存量收割可用 not-recorded 标记替代 Alternatives 节，但两者不能并存', () => {
  const marked = GOOD_IMPLEMENTED.replace('## Alternatives considered', '<!-- alternatives: not-recorded -->')
  const both = `${marked}\n## Alternatives considered\n\n- a\n`
  const okRoot = scaffold({ 'implemented/architecture/2026-01-01-a.md': marked })
  const badRoot = scaffold({ 'implemented/architecture/2026-01-01-a.md': both })
  try {
    assert.equal(runFormatGate(okRoot).code, 0)
    const { code, stderr } = runFormatGate(badRoot)
    assert.equal(code, 1)
    assert.match(stderr, /not-recorded/)
  } finally {
    rmSync(okRoot, { recursive: true, force: true })
    rmSync(badRoot, { recursive: true, force: true })
  }
})

test('双空格段头不得绕过提案用语禁用', () => {
  // CommonMark 里 `##  X` 与 `## X` 渲染结果相同：多一个空格不能变成逃生门
  const root = scaffold({
    'implemented/architecture/2026-01-01-a.md': GOOD_IMPLEMENTED.replace(
      '## Alternatives considered',
      '##  Acceptance criteria\n\nx\n\n## Alternatives considered',
    ),
  })
  try {
    const { code, stderr } = runFormatGate(root)
    assert.equal(code, 1, `双空格段头绕过了禁用：${stderr}`)
    assert.match(stderr, /proposal-era heading/)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('必备节写成双空格仍被认作该节（不得误红）', () => {
  const root = scaffold({
    'implemented/architecture/2026-01-01-a.md': GOOD_IMPLEMENTED.replace('## Decision', '##  Decision'),
  })
  try {
    const { code, stderr } = runFormatGate(root)
    assert.equal(code, 0, `双空格必备节被误红：${stderr}`)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('not-recorded 标记允许行尾空白', () => {
  const body = [
    '# Agent Note: t',
    '',
    'Status: implemented',
    '',
    '## Problem',
    '',
    'p',
    '',
    '## Decision',
    '',
    'd',
    '',
    '<!-- alternatives: not-recorded -->' + '   ',
    '',
    '## Consequences',
    '',
    '**收益：** a',
    '',
    '**代价：** b',
    '',
  ].join('\n')
  const root = scaffold({ 'implemented/architecture/2026-01-01-a.md': body })
  try {
    const { code, stderr } = runFormatGate(root)
    assert.equal(code, 0, `行尾空白让标记失效：${stderr}`)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})
