import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { spawnSync } from 'node:child_process'
import { parseAnchors } from '../skills/intent-notes/scripts/note-anchors.ts'

const skillRoot = resolve(import.meta.dirname, '../skills/intent-notes')

/** 把模板里的 {{...}} 占位替换为可读文本，模拟 AI 填写后的结果。 */
function fill(template: string): string {
  // 归档日期必须填成合法日期，否则 archived 模板会因第 4 行格式不合法而必然失败
  return template
    .replace(/\{\{YYYY-MM-DD\}\}/g, '2026-01-02')
    .replace(/\{\{[^}]*\}\}/g, '占位内容')
}

const CASES: Array<{ template: string; rel: string }> = [
  { template: 'templates/proposed.md', rel: 'proposed/feature/2026-01-01-t.md' },
  { template: 'templates/implemented.md', rel: 'implemented/feature/2026-01-01-t.md' },
  { template: 'templates/archived.md', rel: 'archived/feature/2026-01-01-t.md' },
  { template: 'templates/rejected.md', rel: 'rejected/feature/2026-01-01-t.md' },
]

for (const { template, rel } of CASES) {
  test(`${template} 填入占位后同时通过结构门禁与格式门禁`, () => {
    const raw = readFileSync(join(skillRoot, template), 'utf8')
    const root = mkdtempSync(join(tmpdir(), 'intent-notes-tpl-'))
    try {
      const abs = join(root, rel)
      mkdirSync(dirname(abs), { recursive: true })
      writeFileSync(abs, fill(raw))

      const fmt = spawnSync('node', [join(skillRoot, 'scripts/verify-note-format.ts'), root], {
        encoding: 'utf8',
        cwd: skillRoot,
      })
      assert.equal(fmt.status, 0, fmt.stderr ?? '')
      // 「0 篇笔记」时格式门禁同样退 0；这条断言防止路径规则变化让本用例静默恒真
      assert.match(fmt.stdout ?? '', /检查 1 篇笔记/)

      const tree = spawnSync('node', [join(skillRoot, 'scripts/verify-note-tree.ts'), root], {
        encoding: 'utf8',
        cwd: skillRoot,
      })
      assert.equal(tree.status, 0, tree.stderr ?? '')
      // 结构门禁在真的空树时也退 0（init 刚建完的空骨架必须绿），无法靠退出码判空绿，
      // 只能同型断言篇数：路径规则一改、临时树扫不到，这条会立刻红
      assert.match(tree.stdout ?? '', /检查 1 篇笔记/)
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })
}

test('SKILL.md frontmatter 含 name 与 description，且 description 覆盖两类触发', () => {
  const skillPath = join(skillRoot, 'SKILL.md')
  assert.ok(existsSync(skillPath), 'SKILL.md 必须存在')
  const text = readFileSync(skillPath, 'utf8')
  // name 可以是 frontmatter 的第一个键（本计划的 SKILL.md 即如此），故前缀行必须可选
  assert.match(text, /^---\n(?:[\s\S]*?\n)?name:\s*intent-notes\n/)
  const desc = /description:\s*(.+(?:\n\s+.+)*)/.exec(text)?.[1] ?? ''
  assert.ok(desc.length > 40, 'description 不能过短')
  // 守「判据写在 description 里」这个意图，不守「非平凡」这个行话标签：删掉标签判定更准，测试不该因此变红
  for (const judge of ['改了行为', '架构', '跨文件契约', '流程与工具链', '测试策略']) assert.ok(desc.includes(judge), `description 必须含判据「${judge}」`)
  assert.match(desc, /初始化/, 'description 必须含存量项目初始化这一触发')
})

test('description 的初始化触发只用「笔记」这一叫法，不提「知识库」', () => {
  const text = readFileSync(join(skillRoot, 'SKILL.md'), 'utf8')
  const desc = /description:\s*(.+(?:\n\s+.+)*)/.exec(text)?.[1] ?? ''
  // 产物是 .agents/notes/ 的决策笔记树，口语也说「笔记」
  assert.match(desc, /用户说「给这个项目建决策笔记」/, 'description 未给出以「笔记」为主的触发示例')
  // 「知识库」会让人以为有索引、能检索、还补齐了历史——本体系明确都不做
  assert.doesNotMatch(desc, /知识库/, '本体系做的是决策笔记树而非知识库，description 不应出现这个词')
})

test('七份 references 与四份模板齐备', () => {
  for (const rel of [
    'references/note-format.md',
    'references/classification.md',
    'references/when-to-write.md',
    'references/archiving.md',
    'references/quality-gate.md',
    'references/bootstrap-existing-project.md',
    'references/plain-directory-mode.md',
    'templates/proposed.md',
    'templates/implemented.md',
    'templates/archived.md',
    'templates/rejected.md',
  ]) {
    assert.ok(existsSync(join(skillRoot, rel)), `${rel} 缺失`)
  }
})

test('四份模板的锚点段头必须被门禁 3 认作段头', () => {
  // 模板与门禁的段名是一对契约：任一侧改名而另一侧没跟，照模板写出的笔记会整篇判红
  for (const rel of ['templates/proposed.md', 'templates/implemented.md', 'templates/archived.md', 'templates/rejected.md']) {
    const { errors } = parseAnchors(fill(readFileSync(join(skillRoot, rel), 'utf8')))
    // 占位值不是合法短哈希，会另报格式错；这里只钉「段头被识别」这一条
    assert.ok(
      !errors.some(e => e.includes('缺少') || e.includes('已改名')),
      `${rel} 的锚点段头未被门禁 3 识别：${errors.join(' | ')}`,
    )
  }
})
