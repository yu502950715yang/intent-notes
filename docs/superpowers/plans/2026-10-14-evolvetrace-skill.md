> 历史文档（写于项目名 EvolveTrace 时期）：其中的目录名、配置文件路径与命令为当时形态，已作废；现行形态以 `README.md` 与 `skills/intent-notes/` 为准。

# EvolveTrace Skill 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 交付一个中文单语的 Agent Skill 包，让 AI 在 polyrepo 交付项目里持续写下并维护 `.agents/notes/` 决策笔记，并配齐可机械执行的门禁与漏写补救工具。

**Architecture:** 规范层（`SKILL.md` + `references/` + `templates/`）与门禁层（`scripts/*.ts`）分离；门禁只做正则与闭集校验，靠非零退出码强制。事实层（仓库/分支/commit 是否真实存在）由脚本实时查 git，**不信任文档里的声明**。结构真源集中在 `scripts/note-tree.ts`，被三个门禁 import，避免规则分叉。

**Tech Stack:** Node.js v22.22.1（原生 TypeScript 类型剥离，无需编译、无需 tsx）、`node:test` 内置测试、`node:assert/strict`。**零运行时依赖。**

**Spec:** `docs/superpowers/specs/2026-10-14-evolvetrace-design.md`

## Global Constraints

以下每条对每个任务都生效，不再在任务里重复。

- **中文单语。** 所有给人/AI 读的契约文档用中文；但脚本里的机器校验标记（`# Agent Note: `、`Status:`、`## Problem`、`## Alternatives considered` 等）**保持英文原样**，因为门禁按字面匹配。
- **写盘类工具必须先打印计划。** 任何会写文件的命令，在写入**之前**把「将要做什么」逐条打到 stdout；`--dry-run` 走**同一份清单**、只是不执行，且必须真的不写任何文件。跳过某项时也要如实打印「已存在，跳过」，不能一律说「将写入」。
- **Node 下限 v22.18**。Node 从 22.18 起才**默认**开启原生 TypeScript 类型剥离（22.6–22.17 需 `--experimental-strip-types`），所以下限定为 22.18。脚本必须能被 `node scripts/xxx.ts` 直接运行，不得要求构建步骤。
- **零运行时依赖。** 不得引入任何 npm 包。测试用 `node:test`。`package.json` 里不得出现 `dependencies`。
- **ESM。** `package.json` 含 `"type": "module"`；相对 import 必须写全扩展名（`./note-tree.ts`），这是 Node 原生类型剥离的硬要求。
- **门禁非零退出。** 任何违规必须打印清单到 stderr 且 `process.exit(1)`；全部通过时打印一行摘要并 `process.exit(0)`。
- **门禁只读。** 本计划不实现任何 `--write` 或自动修复。
- **六分类闭集**：`feature`、`bug-fix`、`simplification`、`architecture`、`process`、`testing`。
- **四生命周期**：`proposed`、`implemented`、`rejected`、`archived`。归档路径中**刻意不含** `implemented` 层。
- **路径即身份**：`{lifecycle}/{class}/yyyy-mm-dd-topic.md`，深度固定为 3。
- **禁止 `INDEX.md`**，集中式索引是明确的反模式。
- **移植代码保留版权**：来自 DSH 的部分在文件头保留版权声明，写法照各任务代码块：`移植自 DeepSeek Harness 的 scripts/<原文件名>.ts（MIT, Copyright (c) 2026 DeepSeek）`。
- **测试命令必须用 glob 形式**：`node --test "scripts/*.spec.ts"`，且从仓库根执行。Node 22 存在回归（[nodejs/node#64637](https://github.com/nodejs/node/pull/64637)）：`node --test <目录>` 会把目录当模块加载并报 `Cannot find module`，因此**不得**使用目录形式。测试用相对路径 `scripts/xxx.ts` 调起子进程，所以必须从仓库根运行。
- **本计划不做**：跨项目、M4 看板、SHA-256 归档封印、commit-msg 加固钩子。

## 文件结构

| 文件 | 职责 | 来源 |
|---|---|---|
| `package.json` | 仅 `type: module` 与 scripts；无依赖 | 新建 |
| `.gitattributes` | `* text=auto eol=lf`，保证脚本与笔记在工作区始终是 LF（Windows 上 `core.autocrlf=true` 会把它们检出成 CRLF） | 新建 |
| `scripts/note-tree.ts` | **结构真源**：两个闭集、目录遍历、结构校验，返回 `{notes, errors}` | 移植改造 |
| `scripts/note-anchors.ts` | 解析笔记的 `## 涉及仓库` 段 | 新建 |
| `scripts/verify-note-tree.ts` | 门禁 1：结构、文件名、深度、拒绝 INDEX.md、相对链接 | 移植改造 |
| `scripts/verify-note-format.ts` | 门禁 2：头块、状态语法、必备节、implemented 禁提案用语、Alternatives 必写 | 移植改造 |
| `scripts/verify-note-anchors.ts` | 门禁 3：跨仓库校验声明的仓库/分支/commit/文件 | 新建 |
| `scripts/backfill.ts` | 从单个 commit 提取补写笔记所需的上下文 | 新建 |
| `scripts/init.ts` | 在目标项目建骨架：目录、`.gitignore` 片段、写 config 与 notes/README（**不安装 skill 文件**，那步需人工整目录复制） | 新建 |
| `SKILL.md` | 主契约，AI 读 | 新建 |
| `references/*.md` | 判据与流程，AI 按需读（6 份） | 新建 |
| `templates/*.md` | proposed / implemented / archived / rejected 填空模板（4 份） | 新建 |
| `scripts/*.spec.ts` | 上述脚本的测试，与脚本同目录 | 新建 |

**边界说明：** `note-tree.ts` 是唯一的"结构真相"，`verify-note-tree.ts` 只负责把它的结果变成退出码、并加上它不覆盖的检查（相对链接）。`note-anchors.ts` 同理服务于锚点门禁与 `backfill`。

---

### Task 1: 工具链与结构真源

**Files:**
- Create: `package.json`
- Create: `scripts/note-tree.ts`
- Test: `scripts/note-tree.spec.ts`

**Interfaces:**
- Consumes: 无（首个任务）
- Produces:
  - `AGENT_NOTE_LIFECYCLES: readonly ['proposed','implemented','rejected']`
  - `AGENT_NOTE_CLASSES: readonly ['feature','bug-fix','simplification','architecture','process','testing']`
  - `ARCHIVE_DIR: 'archived'`
  - `interface AgentNote { lifecycle: string; rel: string; date: string }`
  - `walkAgentNoteTree(root: string): { notes: AgentNote[]; errors: string[] }` —— 遍历含 `archived` 在内的四个生命周期

- [x] **Step 1: 验证 Node 能直接运行 TypeScript**

在 `D:\work\EvolveTrace` 下建 `scripts/probe.ts`：

```ts
const greeting: string = 'ok'
console.log(greeting)
```

Run: `node scripts/probe.ts`
Expected: 输出 `ok`，无报错。若报 `Unknown file extension ".ts"`，说明 Node 低于 v22.6，**停止并向我报告**——本计划整体依赖此能力。

删除探针：`Remove-Item scripts/probe.ts`

- [x] **Step 2: 写 package.json**

```json
{
  "name": "evolvetrace",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "description": "让 AI 在 polyrepo 交付项目里持续留下决策笔记的 Agent Skill 包",
  "license": "MIT",
  "engines": {
    "node": ">=22.18"
  },
  "scripts": {
    "test": "node --test \"scripts/*.spec.ts\"",
    "verify": "node scripts/verify-note-tree.ts && node scripts/verify-note-format.ts && node scripts/verify-note-anchors.ts"
  }
}
```

- [x] **Step 3: 写失败测试**

创建 `scripts/note-tree.spec.ts`：

```ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { walkAgentNoteTree } from './note-tree.ts'

/** 按给定相对路径列表建一棵临时树，每个文件写入最小合法内容。 */
function scaffold(relPaths: string[]): string {
  const root = mkdtempSync(join(tmpdir(), 'evolvetrace-'))
  for (const rel of relPaths) {
    const abs = join(root, rel)
    mkdirSync(dirname(abs), { recursive: true })
    writeFileSync(abs, '# Agent Note: t\n\nStatus: implemented\n')
  }
  return root
}

test('合法树：四个生命周期与各类分类均通过', () => {
  const root = scaffold([
    'proposed/feature/2026-01-01-a.md',
    'implemented/architecture/2026-01-02-b.md',
    'rejected/simplification/2026-01-03-c.md',
    'archived/testing/2026-01-04-d.md',
  ])
  const { notes, errors } = walkAgentNoteTree(root)
  assert.deepEqual(errors, [])
  assert.equal(notes.length, 4)
  assert.deepEqual(
    notes.map(n => n.lifecycle).sort(),
    ['archived', 'implemented', 'proposed', 'rejected'],
  )
  rmSync(root, { recursive: true, force: true })
})

test('未知分类目录报错', () => {
  const root = scaffold(['implemented/refactor/2026-01-01-a.md'])
  const { errors } = walkAgentNoteTree(root)
  assert.equal(errors.length, 1)
  assert.match(errors[0] ?? '', /未知分类目录 "refactor"/)
  rmSync(root, { recursive: true, force: true })
})

test('未知生命周期目录报错', () => {
  const root = scaffold(['implemented/feature/2026-01-01-a.md', 'drafts/feature/2026-01-01-b.md'])
  const { errors } = walkAgentNoteTree(root)
  assert.equal(errors.length, 1)
  assert.match(errors[0] ?? '', /未知生命周期目录/)
  assert.match(errors[0] ?? '', /drafts\//)
  rmSync(root, { recursive: true, force: true })
})

test('INDEX.md 被明确拒绝', () => {
  const root = scaffold(['INDEX.md', 'implemented/feature/2026-01-01-a.md'])
  const { errors } = walkAgentNoteTree(root)
  assert.equal(errors.length, 1)
  assert.match(errors[0] ?? '', /INDEX\.md/)
  rmSync(root, { recursive: true, force: true })
})

test('文件名不合规报错', () => {
  const root = scaffold(['implemented/feature/notes-a.md'])
  const { errors } = walkAgentNoteTree(root)
  assert.equal(errors.length, 1)
  assert.match(errors[0] ?? '', /文件名必须为 yyyy-mm-dd-topic\.md/)
  rmSync(root, { recursive: true, force: true })
})

test('深度不是 3 报错', () => {
  const root = scaffold(['implemented/2026-01-01-a.md'])
  const { errors } = walkAgentNoteTree(root)
  assert.equal(errors.length, 1)
  assert.match(errors[0] ?? '', /期望 \{lifecycle\}\/\{class\}\/file\.md/)
  rmSync(root, { recursive: true, force: true })
})

test('生命周期根下的 AGENTS.md 豁免', () => {
  const root = scaffold(['implemented/AGENTS.md', 'implemented/feature/2026-01-01-a.md'])
  const { notes, errors } = walkAgentNoteTree(root)
  assert.deepEqual(errors, [])
  assert.equal(notes.length, 1)
  rmSync(root, { recursive: true, force: true })
})
```

- [x] **Step 4: 跑测试确认失败**

Run: `node --test "scripts/*.spec.ts"`
Expected: FAIL，报 `Cannot find module './note-tree.ts'`。

- [x] **Step 5: 实现 note-tree.ts**

创建 `scripts/note-tree.ts`：

```ts
/**
 * Agent Note 树的结构真源：生命周期与分类都是闭集，被全部门禁 import。
 *
 * 移植自 DeepSeek Harness 的 scripts/agent-note-tree.ts（MIT, Copyright (c) 2026 DeepSeek），
 * 两处改造：① 改由调用方传入根目录，以便在任意目标项目上运行；
 * ② 去掉中英双语的 .zh.md 旁路，本体系为中文单语。
 */
import { readdirSync } from 'node:fs'
import { join } from 'node:path'

/** 活跃生命周期闭集（`.agents/notes/` 下的一级目录）。 */
export const AGENT_NOTE_LIFECYCLES = ['proposed', 'implemented', 'rejected'] as const

/**
 * 分类闭集（生命周期下的二级目录）。新增分类是刻意行为：必须同时改这里
 * 与 `references/classification.md`，门禁会拒绝任何未列出的目录。
 */
export const AGENT_NOTE_CLASSES = [
  'feature',
  'bug-fix',
  'simplification',
  'architecture',
  'process',
  'testing',
] as const

/** 归档目录：已实施的笔记冻结于此，路径中刻意不含 `implemented` 层。 */
export const ARCHIVE_DIR = 'archived'

/** 允许直接放在生命周期根下的非笔记 Markdown。 */
const ROOT_ALLOWLIST = new Set(['AGENTS.md', 'CLAUDE.md'])

/** 文件名必须形如 `yyyy-mm-dd-topic.md`。 */
const NOTE_FILENAME = /^\d{4}-\d{2}-\d{2}-.+\.md$/

/** 一棵树里的一篇 Agent Note。 */
export interface AgentNote {
  /** 所在生命周期目录名，可能是 `archived`。 */
  lifecycle: string
  /** 相对 root 的路径，正斜杠分隔。 */
  rel: string
  /** 文件名里的 `yyyy-mm-dd`。 */
  date: string
}

/** 递归列出某目录下全部 .md，返回相对 root 的正斜杠路径。 */
function listMarkdown(root: string, dir: string, prefix: string): string[] {
  const out: string[] = []
  let entries
  try {
    entries = readdirSync(join(root, dir), { withFileTypes: true })
  } catch {
    return out
  }
  for (const entry of entries) {
    const rel = prefix === '' ? entry.name : `${prefix}/${entry.name}`
    if (entry.isDirectory()) out.push(...listMarkdown(root, rel, rel))
    else if (entry.isFile() && entry.name.endsWith('.md')) out.push(rel)
  }
  return out
}

/**
 * 遍历 Agent Note 树并校验结构，覆盖 `proposed` / `implemented` / `rejected` / `archived`。
 * 返回全部合法笔记与逐条违规；调用方把非空 `errors` 视为致命。
 */
export function walkAgentNoteTree(root: string): { notes: AgentNote[]; errors: string[] } {
  const notes: AgentNote[] = []
  const errors: string[] = []

  let topLevel
  try {
    topLevel = readdirSync(root, { withFileTypes: true })
  } catch {
    return { notes, errors: [`structure: ${root} 不存在或不可读`] }
  }

  for (const entry of topLevel) {
    if (entry.name === 'INDEX.md') {
      errors.push('structure: INDEX.md — 集中式索引被禁止；请浏览 lifecycle/class 目录树或检索仓库')
      continue
    }
    const isKnown = (AGENT_NOTE_LIFECYCLES as readonly string[]).includes(entry.name)
    if (entry.isDirectory() && entry.name !== ARCHIVE_DIR && !isKnown) {
      errors.push(
        `structure: ${entry.name}/ — 未知生命周期目录（允许：${AGENT_NOTE_LIFECYCLES.join(', ')}，外加 ${ARCHIVE_DIR}/）`,
      )
    }
  }

  for (const lifecycle of [...AGENT_NOTE_LIFECYCLES, ARCHIVE_DIR]) {
    for (const match of listMarkdown(root, lifecycle, lifecycle).sort()) {
      const segs = match.split('/')
      if (segs.length === 2 && ROOT_ALLOWLIST.has(segs[1] ?? '')) continue
      const cls = segs[1]
      const base = segs[2]
      if (segs.length !== 3 || cls === undefined || base === undefined) {
        errors.push(`structure: ${match} — 期望 {lifecycle}/{class}/file.md（实际深度 ${segs.length}）`)
        continue
      }
      if (!(AGENT_NOTE_CLASSES as readonly string[]).includes(cls)) {
        errors.push(`structure: ${match} — 未知分类目录 "${cls}"（允许：${AGENT_NOTE_CLASSES.join(', ')}）`)
        continue
      }
      if (!NOTE_FILENAME.test(base)) {
        errors.push(`structure: ${match} — 文件名必须为 yyyy-mm-dd-topic.md`)
        continue
      }
      notes.push({ lifecycle, rel: match, date: base.slice(0, 10) })
    }
  }

  return { notes, errors }
}
```

- [x] **Step 6: 跑测试确认通过**

Run: `node --test "scripts/*.spec.ts"`
Expected: PASS，全部测试通过（累计数随任务递增，无需核对具体数字）。

- [x] **Step 7: 提交**

```bash
git add package.json scripts/note-tree.ts scripts/note-tree.spec.ts
git commit -m "feat: 结构真源 note-tree（闭集、遍历、结构校验）"
```

---

### Task 2: 两个结构/格式门禁

**Files:**
- Create: `scripts/verify-note-tree.ts`
- Create: `scripts/verify-note-format.ts`
- Create: `.gitattributes`
- Test: `scripts/verify-note-format.spec.ts`

**Interfaces:**
- Consumes: `walkAgentNoteTree`、`AGENT_NOTE_CLASSES`、`AGENT_NOTE_LIFECYCLES`（Task 1）
- Produces:
  - `parseNote(text: string): { firstH2: string | undefined; h2s: string[]; statusLine: string | undefined; prose: string[] }` —— 从 `verify-note-format.ts` 导出，供测试与后续任务复用
  - 两个可执行门禁：`node scripts/verify-note-tree.ts <root>`、`node scripts/verify-note-format.ts <root>`，root 省略时默认 `process.cwd()/.agents/notes`

- [x] **Step 1: 写失败测试**

创建 `scripts/verify-note-format.spec.ts`：

```ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { spawnSync } from 'node:child_process'

/** 建一棵树，notes 为 相对路径 -> 文件内容。 */
function scaffold(notes: Record<string, string>): string {
  const root = mkdtempSync(join(tmpdir(), 'evolvetrace-fmt-'))
  for (const [rel, body] of Object.entries(notes)) {
    const abs = join(root, rel)
    mkdirSync(dirname(abs), { recursive: true })
    writeFileSync(abs, body)
  }
  return root
}

function runFormatGate(root: string): { code: number; stderr: string } {
  const r = spawnSync('node', ['scripts/verify-note-format.ts', root], { encoding: 'utf8' })
  return { code: r.status ?? -1, stderr: r.stderr }
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
  // 若模块顶层仍有 process.exit，这个 import 会直接终止测试进程——测试失败本身就是哨兵
  const parsed = parseNote('# Agent Note: t\n\nStatus: implemented\n')
  assert.equal(parsed.statusLine, 'Status: implemented')
  assert.equal(parsed.firstH2, undefined)
})

test('parseNote 归一 CRLF 行尾', () => {
  const parsed = parseNote('# Agent Note: t\r\n\r\nStatus: implemented\r\n')
  assert.equal(parsed.statusLine, 'Status: implemented')
})
```

- [x] **Step 2: 跑测试确认失败**

Run: `node --test "scripts/*.spec.ts"`
Expected: FAIL，`scripts/verify-note-format.ts` 不存在导致退出码非预期。

- [x] **Step 3: 实现 verify-note-tree.ts**

```ts
/**
 * 门禁 1：结构。消费 note-tree.ts 的结果并补上它不覆盖的检查（笔记间相对链接）。
 *
 * 检查思路移植自 DeepSeek Harness 的 scripts/verify-agent-note-tree.ts（MIT, Copyright (c) 2026 DeepSeek）；
 * 相对链接的断链检查为本项目新增。
 *
 * 用法：node scripts/verify-note-tree.ts [root]
 * root 省略时取 <cwd>/.agents/notes。
 */
import { readFileSync, existsSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { walkAgentNoteTree } from './note-tree.ts'

const root = resolve(process.argv[2] ?? join(process.cwd(), '.agents', 'notes'))
const { notes, errors } = walkAgentNoteTree(root)

/** 提取 Markdown 行内链接目标，忽略锚点与外部 URL。 */
function localLinkTargets(text: string): string[] {
  const out: string[] = []
  const re = /\]\(([^)\s]+)\)/g
  let m: RegExpExecArray | null
  while ((m = re.exec(text)) !== null) {
    const target = m[1] ?? ''
    if (target.startsWith('http:') || target.startsWith('https:') || target.startsWith('#')) continue
    out.push(target.split('#')[0] ?? '')
  }
  return out
}

for (const note of notes) {
  const abs = join(root, note.rel)
  let text: string
  try {
    text = readFileSync(abs, 'utf8')
  } catch {
    errors.push(`structure: ${note.rel} — 不可读`)
    continue
  }
  for (const target of localLinkTargets(text)) {
    if (target === '') continue
    const resolved = resolve(dirname(abs), target)
    if (!existsSync(resolved)) {
      errors.push(`structure: ${note.rel} — 相对链接指向不存在的文件：${target}`)
    }
  }
}

if (errors.length === 0) {
  console.log(`verify-note-tree: 检查 ${notes.length} 篇笔记，结构全部合规。`)
  process.exit(0)
}
console.error('verify-note-tree: 发现违规：')
for (const e of errors) console.error(`  ${e}`)
process.exit(1)
```

- [x] **Step 4: 实现 verify-note-format.ts**

```ts
/**
 * 门禁 2：格式。校验头块、状态语法、必备节、implemented 禁提案用语、Alternatives 必写。
 * 结构与文件名属于 verify-note-tree，本脚本不重复。
 *
 * 移植自 DeepSeek Harness 的 scripts/verify-agent-note-format.ts（MIT, Copyright (c) 2026 DeepSeek），
 * 去掉其针对旧格式的 grandfather 注释分支与中英双语配对检查。
 *
 * 用法：node scripts/verify-note-format.ts [root]
 */
import { readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { walkAgentNoteTree } from './note-tree.ts'

/** 状态行语法，按生命周期区分。注意 rejected 用 em dash。 */
const STATUS: Record<string, RegExp> = {
  proposed: /^Status: proposed$/,
  implemented: /^Status: implemented$/,
  rejected: /^Status: rejected — .+$/,
  // 归档笔记由 implemented 冻结而来，状态必须保持 implemented，并另起一行 Archived: YYYY-MM-DD
  archived: /^Status: implemented$/,
}

/** 各生命周期在 ## Problem 之外必须具备的二级标题。 */
const REQUIRED: Record<string, string[]> = {
  proposed: ['## Proposal', '## Acceptance criteria', '## Risks'],
  implemented: ['## Decision', '## Consequences'],
  rejected: ['## Proposal'],
  archived: ['## Decision', '## Consequences'],
}

/** implemented 中禁止出现的提案用语（规格用语混进已交付记录）。 */
const BANNED_IMPLEMENTED = /^## (?:Proposal\b|Plan\b|Migration plan\b|Acceptance criteria\b)/i

/** 归档笔记第 4 行的归档日期标记；其余生命周期的第 4 行必须为空。 */
const ARCHIVED_LINE = /^Archived: \d{4}-\d{2}-\d{2}$/

/** 备选方案未记录的显式标记：仅用于从存量文档收割、原始材料确实没写备选的笔记。 */
const ALTERNATIVES_NOT_RECORDED = '<!-- alternatives: not-recorded -->'

export interface ParsedNote {
  /** 首个二级标题。 */
  firstH2: string | undefined
  /** 全部二级标题（按出现顺序，已去尾空白）。 */
  h2s: string[]
  /** 第 3 行状态行。 */
  statusLine: string | undefined
  /** 剔除代码围栏后的正文行。 */
  prose: string[]
}

/** 解析笔记文本。代码围栏内的 `##` 与 `Status:` 不算文档结构。 */
export function parseNote(text: string): ParsedNote {
  // 统一行尾：Windows 上 core.autocrlf=true 会把笔记检出成 CRLF，不归一会让每篇合规笔记都被误判
  const lines = text.replace(/\r\n?/g, '\n').split('\n')
  let inFence = false
  const prose: string[] = []
  for (const line of lines) {
    if (line.startsWith('```')) {
      inFence = !inFence
      continue
    }
    if (!inFence) prose.push(line)
  }
  const h2s = prose.filter(l => l.startsWith('## ')).map(l => l.trimEnd())
  return { firstH2: h2s[0], h2s, statusLine: lines[2], prose }
}

// ---- CLI：仅作为入口脚本运行时才执行；被 import 时不得有任何副作用 ----
if (process.argv[1] !== undefined && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  const root = resolve(process.argv[2] ?? join(process.cwd(), '.agents', 'notes'))
  const { notes, errors } = walkAgentNoteTree(root)

  for (const note of notes) {
    const fail = (msg: string): void => {
      errors.push(`format: ${note.rel} — ${msg}`)
    }
    let raw: string
    try {
      raw = readFileSync(join(root, note.rel), 'utf8')
    } catch {
      fail('不可读')
      continue
    }
    // 统一行尾：Windows 上 core.autocrlf=true 会把笔记检出成 CRLF，不归一会让每篇合规笔记都被误判
    const lines = raw.replace(/\r\n?/g, '\n').split('\n')
    const { firstH2, h2s, statusLine, prose } = parseNote(raw)

    if (!/^# Agent Note: \S/.test(lines[0] ?? '')) fail('line 1 must be `# Agent Note: <title>`')
    if (lines[1] !== '') fail('line 2 must be blank')
    const statusRe = STATUS[note.lifecycle]
    if (statusRe !== undefined && !statusRe.test(statusLine ?? '')) {
      fail(`line 3 must match the ${note.lifecycle} status grammar (${String(statusRe)})`)
    }
    // 第 4 行：归档笔记必须是 `Archived: YYYY-MM-DD`，其余生命周期必须为空
    if (note.lifecycle === 'archived') {
      if (!ARCHIVED_LINE.test(lines[3] ?? '')) fail('line 4 must be `Archived: YYYY-MM-DD` for an archived note')
    } else if (lines[3] !== '') {
      fail('line 4 must be blank')
    }

    const otherStatus = prose.filter(l => l.startsWith('Status:') && l !== statusLine)
    // statusLine 为空时不能拿它去统计空行，否则会叠一条与真实原因无关的误报
    if (otherStatus.length > 0 || (statusLine !== '' && prose.filter(l => l === statusLine).length > 1)) {
      fail('the line-3 `Status:` line must be the only one in the file')
    }

    if (firstH2 !== '## Problem') {
      fail(`first section must be \`## Problem\` (got ${JSON.stringify(firstH2 ?? '<none>')})`)
    }
    for (const required of REQUIRED[note.lifecycle] ?? []) {
      if (!h2s.includes(required)) fail(`missing the required \`${required}\` section`)
    }
    if (note.lifecycle === 'implemented' || note.lifecycle === 'archived') {
      for (const h2 of h2s.filter(h => BANNED_IMPLEMENTED.test(h))) {
        fail(`\`${h2}\` is a proposal-era heading; a delivered note states what is (fold it into Decision/Consequences)`)
      }
    }

    const hasAlternatives = h2s.includes('## Alternatives considered')
    const marked = prose.includes(ALTERNATIVES_NOT_RECORDED)
    if (hasAlternatives && marked) fail('同时带有 `## Alternatives considered` 与 not-recorded 标记，请删掉标记')
    if (!hasAlternatives && !marked) {
      fail('missing `## Alternatives considered`（存量收割的笔记若原始材料确实未记录备选，写 `<!-- alternatives: not-recorded -->`）')
    }
  }

  if (errors.length === 0) {
    console.log(`verify-note-format: 检查 ${notes.length} 篇笔记，格式全部合规。`)
    process.exit(0)
  }
  console.error('verify-note-format: 发现违规：')
  for (const e of errors) console.error(`  ${e}`)
  process.exit(1)
}
```

- [x] **Step 5: 跑测试确认通过**

Run: `node --test "scripts/*.spec.ts"`
Expected: PASS，全部测试通过（累计数随任务递增，无需核对具体数字）。

- [x] **Step 6: 写 .gitattributes，让工作区始终保持 LF**

创建 `.gitattributes`：

```
* text=auto eol=lf
```

Run: `git check-attr text eol -- scripts/note-tree.ts`
Expected: 输出里含 `text: auto` 与 `eol: lf`。

理由：Windows 上 `core.autocrlf=true`（本机即是）会把脚本与笔记检出成 CRLF。门禁已做行尾容错，但让工作区保持 LF 能消除整类差异。

- [x] **Step 7: 手工验证门禁 1**

Run: `node scripts/verify-note-tree.ts`（当前仓库尚无 `.agents/notes`）
Expected: 退出码 1 并输出 `<root> 不存在或不可读` —— 这正是我们要的失败行为。

- [x] **Step 8: 提交**

```bash
git add .gitattributes scripts/verify-note-tree.ts scripts/verify-note-format.ts scripts/verify-note-format.spec.ts
git commit -m "feat: 结构门禁与格式门禁"
```

---

### Task 3: 规范与模板

本任务产出全部给人/AI 读的契约文档。它是"零代码"的任务，但**可机械验收**：三个模板填入占位后必须通过 Task 2 的格式门禁——这保证模板与门禁永不脱节。

**Files:**
- Create: `SKILL.md`
- Create: `references/note-format.md`、`classification.md`、`when-to-write.md`、`archiving.md`、`quality-gate.md`、`bootstrap-existing-project.md`
- Create: `templates/proposed.md`、`implemented.md`、`archived.md`、`rejected.md`
- Test: `scripts/templates.spec.ts`

**Interfaces:**
- Consumes: `verify-note-format.ts` 门禁（Task 2）
- Produces: 占位符约定 **`{{...}}`**（双花括号，中文占位说明）；`SKILL.md` 的 YAML frontmatter 含 `name` 与 `description` 两个字段

- [x] **Step 1: 写失败测试**

创建 `scripts/templates.spec.ts`：

```ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { spawnSync } from 'node:child_process'

const repoRoot = resolve(import.meta.dirname, '..')

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
    const raw = readFileSync(join(repoRoot, template), 'utf8')
    const root = mkdtempSync(join(tmpdir(), 'evolvetrace-tpl-'))
    try {
      const abs = join(root, rel)
      mkdirSync(dirname(abs), { recursive: true })
      writeFileSync(abs, fill(raw))

      const fmt = spawnSync('node', [join(repoRoot, 'scripts/verify-note-format.ts'), root], {
        encoding: 'utf8',
        cwd: repoRoot,
      })
      assert.equal(fmt.status, 0, fmt.stderr ?? '')
      // 「0 篇笔记」时格式门禁同样退 0；这条断言防止路径规则变化让本用例静默恒真
      assert.match(fmt.stdout ?? '', /检查 1 篇笔记/)

      const tree = spawnSync('node', [join(repoRoot, 'scripts/verify-note-tree.ts'), root], {
        encoding: 'utf8',
        cwd: repoRoot,
      })
      assert.equal(tree.status, 0, tree.stderr ?? '')
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })
}

test('SKILL.md frontmatter 含 name 与 description，且 description 覆盖两类触发', () => {
  const skillPath = join(repoRoot, 'SKILL.md')
  assert.ok(existsSync(skillPath), 'SKILL.md 必须存在')
  const text = readFileSync(skillPath, 'utf8')
  // name 可以是 frontmatter 的第一个键（本计划的 SKILL.md 即如此），故前缀行必须可选
  assert.match(text, /^---\n(?:[\s\S]*?\n)?name:\s*evolvetrace\n/)
  const desc = /description:\s*(.+(?:\n\s+.+)*)/.exec(text)?.[1] ?? ''
  assert.ok(desc.length > 40, 'description 不能过短')
  assert.match(desc, /非平凡/, 'description 必须含「何时写」的判定')
  assert.match(desc, /初始化/, 'description 必须含存量项目初始化这一触发')
})

test('六份 references 与四份模板齐备', () => {
  for (const rel of [
    'references/note-format.md',
    'references/classification.md',
    'references/when-to-write.md',
    'references/archiving.md',
    'references/quality-gate.md',
    'references/bootstrap-existing-project.md',
    'templates/proposed.md',
    'templates/implemented.md',
    'templates/archived.md',
    'templates/rejected.md',
  ]) {
    assert.ok(existsSync(join(repoRoot, rel)), `${rel} 缺失`)
  }
})
```

- [x] **Step 2: 跑测试确认失败**

Run: `node --test "scripts/*.spec.ts"`
Expected: FAIL，`templates/proposed.md` 不存在。

- [x] **Step 3: 写四个模板**

`templates/proposed.md`：

```markdown
# Agent Note: {{标题}}

Status: proposed

## Problem

{{动机。不依赖下面的方案即可独立成立——读者只看这一节也该明白为什么非做不可。}}

## Proposal

{{拟议的变更，可用将来时。计划、迁移步骤、待解决问题放这里。}}

## 涉及仓库

- `{{仓库名}}` 分支 `{{分支名}}` commits `{{短哈希}}`

## Alternatives considered

**{{备选方案名}}。** {{它最强的理由是什么}}。{{为什么最终不选它}}。

## Acceptance criteria

{{什么可观察状态算完成。}}

## Risks

{{可能出错的事，以及本方案有意放弃的东西。}}
```

`templates/implemented.md`：

```markdown
# Agent Note: {{标题}}

Status: implemented

## Problem

{{动机。不依赖方案即可独立成立。}}

## Decision

{{现在时描述已交付事实。路径、符号、默认值变了就地改这里，不要追加变更流水账。}}

## 涉及仓库

- `{{仓库名}}` 分支 `{{分支名}}` commits `{{短哈希}}`
- `{{不涉及的仓库名}}` 不涉及

## Alternatives considered

**{{备选方案名}}。** {{它最强的理由}}。{{为什么最终不选它}}。

## Consequences

**收益：** {{...}}

**代价：** {{...}}
```

`templates/archived.md`：

```markdown
# Agent Note: {{标题}}

Status: implemented
Archived: {{YYYY-MM-DD}}

## Problem

{{动机。不依赖方案即可独立成立。}}

## Decision

{{现在时描述已交付事实。}}

## 涉及仓库

- `{{仓库名}}` 分支 `{{分支名}}` commits `{{短哈希}}`

## Alternatives considered

**{{备选方案名}}。** {{它最强的理由}}。{{为什么最终不选它}}。

## Consequences

**收益：** {{...}}

**代价：** {{...}}
```

`templates/rejected.md`：

```markdown
# Agent Note: {{标题}}

Status: rejected — {{一句话说明为什么否决}}

## Problem

{{当时的动机。}}

## Proposal

{{当时的提案，冻结保留，不要改写成对立面。}}

## 涉及仓库

- `{{仓库名}}` 不涉及

## Alternatives considered

**{{最终被采纳的那条路}}。** {{它最强的地方}}。{{为什么最终选了它。}}
```

- [x] **Step 4: 写 SKILL.md**

```markdown
---
name: evolvetrace
description: 在交付项目里留下并维护决策笔记（Agent Notes）。当一次改动是非平凡的——改了行为、架构、跨文件契约、流程与工具链、测试策略，或落盘/网络/配置格式——就在当前项目的 .agents/notes/ 下新建或更新一篇笔记；也用于在已有项目里初始化这套笔记体系（用户说「给这个项目建知识库」时）。纯机械改动（格式化、无歧义重命名、不改行为的样式或依赖补丁、常规 CRUD）不写。
---

# EvolveTrace

把决策的「为什么」和「放弃了什么」留在仓库里，供下一个改这段代码的人——无论人或 AI——读。

**本 skill 自包含**：目录结构、笔记格式、门禁校验、「何时写」的判定都不依赖任何其他方法论或工具链。装了 superpowers 之类的流程框架只是让触发更顺手，没装也照常工作。

## 一、先判要不要写

**非平凡 → 必须写。** 命中以下任一项：改了行为、改了架构、改了跨文件契约、改了流程与工具链、改了测试策略、改了落盘 / 网络 / 配置格式。

**机械改动 → 禁止写。** 纯排版格式化、错别字、无歧义重命名、不改行为的样式调整、不改行为的依赖补丁、版本打标、常规 CRUD、单模块内看 diff 即懂的显式逻辑修复。

判不准时从严。但记住：**过度留痕和完全不记，是同一个错误的两种样子。**

## 二、写之前判方向

- **往前看**：立新规——跨模块契约、状态流转规则、访问边界、运行时不变量
- **往回看**：记妥协——为看不见的约束放弃了更主流或更直觉的解法
- **做减法**：收窄——删代码、砍 API、下线流程的退出条件与迁移边界

## 三、目录即状态

`.agents/notes/{lifecycle}/{class}/yyyy-mm-dd-topic.md`（文件名日期 = **首次提出日**）

生命周期：`proposed`（待评审）→ `implemented`（已交付，与代码同步）→ `rejected`（被否决）/ `archived`（冻结的历史）。
分类闭集（不许自造）：`feature`、`bug-fix`、`simplification`、`architecture`、`process`、`testing`。

**禁止 `INDEX.md`**：集中式索引会与笔记树同时腐化，找笔记靠搜索与链接，不靠索引（门禁 1 在 `.agents/notes/` 根见到 `INDEX.md` 即判红）。

## 四、硬规则

1. 前三行严格为 `# Agent Note: <标题>`、空行、`Status: <状态>`；`Status` 必须与所在目录一致——**唯一例外是 `archived/`**：它保持 `Status: implemented`，并在第 4 行写 `Archived: YYYY-MM-DD`（其余生命周期的第 4 行必须为空）。
2. `## Alternatives considered` **必写**：每个真考虑过的备选，先写它最强的理由，再解释为什么不用。没有过的选项不要编。存量收割的笔记若原始材料确实未记录备选，写 `<!-- alternatives: not-recorded -->`。
3. 一条笔记**永远不被改写成另一个决定**；决定或理由翻转 → 新开一篇并互链。
4. `implemented` 描述**已交付事实**（现在时）；路径、符号、默认值变了就地改，**不要追加变更流水账**。
5. 每篇必须声明**涉及仓库**（`## 涉及仓库` 一节）：polyrepo 项目列出所有相关子仓库，单仓库项目也列出那唯一一个；锚点由门禁实时校验，**本节缺失会被锚点门禁直接判红**——没有逃生标记，「没有涉及仓库」写成一行 `不涉及`，不是省略本节（`archived/` 豁免，见 `references/archiving.md`）。
6. 代码与笔记**同一次提交**。
7. 新建前先搜同主题旧笔记，命中就就地更新或互链，不留重复记录。

## 五、详细规则（按需读取）

- **填空模板**：`templates/proposed.md`、`implemented.md`、`archived.md`、`rejected.md` —— 新建笔记时以对应模板起步，把 `{{...}}` 占位替换为真实内容
- 格式细则：`references/note-format.md`
- 六分类判据：`references/classification.md`
- 何时新建 / 就地改 / 归档 / 不该写：`references/when-to-write.md`
- 取代与归档：`references/archiving.md`
- 写完自检：`references/quality-gate.md`
- 存量项目初始化：`references/bootstrap-existing-project.md`

## 六、交给人之前

跑一遍 `references/quality-gate.md` 的自检，只向用户报告**缺口和写得好的地方**（≤5 行），缺口给具体修法。
```

- [x] **Step 5: 写六份 references**

`references/note-format.md`：

````markdown
# 笔记格式

`SKILL.md` 第三节的展开。写或改笔记时对照。

**禁止 `INDEX.md`**：集中式索引会与笔记树同时腐化，找笔记靠搜索与链接，不靠索引（门禁 1 在 `.agents/notes/` 根见到 `INDEX.md` 即判红）。

## 笔记树的结构红线（门禁 1）

除闭集（`{lifecycle}/{class}/`）、文件名 `yyyy-mm-dd-topic.md` 与相对链接断链检查外，门禁 1 还拒绝下列形态，实现在 `scripts/note-tree.ts`：

- **notes 根下只允许 `README.md`、`AGENTS.md`、`CLAUDE.md`**。其他 `.md` 判红：根级散落的笔记不属于任何生命周期，不报错就没有任何门禁看得见它。
- **`{lifecycle}/` 根下只允许 `AGENTS.md`、`CLAUDE.md`**：笔记必须落在 `{class}/` 里，直接放在生命周期根下判红。
- **非常规条目不静默跳过**：符号链接 / junction / 特殊文件报「无法校验（符号链接/junction/特殊文件）」，而不是被当成不存在——静默跳过等于让笔记凭空消失。
- **空树仍退 0**：`.agents/notes/` 下一篇笔记都没有时，门禁 1 打印「未发现任何笔记，请确认根目录正确（init 刚建完的空骨架属正常，仍退 0）」并**正常退出**。0 篇不是违规，别把它当错误；这句话只是让「根目录写错」与「合法空树」不至于输出同一行摘要。

## 头块（前三行，门禁逐字核对）

```markdown
# Agent Note: <标题>

Status: <状态>
```

`Status` 四种形态，必须与所在生命周期目录一致：

- `proposed/` → `Status: proposed`
- `implemented/` → `Status: implemented`
- `rejected/` → `Status: rejected — <一句话原因>`（注意是 em dash，全角破折号门禁不认）
- `archived/` → `Status: implemented`，且**第 4 行必须是** `Archived: YYYY-MM-DD`（其余生命周期的第 4 行必须为空）

**状态行不带日期与括号**：`proposed` / `implemented` / `archived` 是门禁的逐字要求（多写日期或括号会被判红）；`rejected` 只是**约定**——门禁只要求匹配 `/^Status: rejected — .+$/`，理由里带日期或括号不会红，但仍按本约定写。文件名记首次提出日，git 记其余一切。

## 正文骨架

每篇以 `## Problem` 开头——动机要能**脱离方案独立成立**。

| 生命周期 | 骨架 |
|---|---|
| `proposed` | `## Problem` → `## Proposal` → …自由节… → `## Alternatives considered` → `## Acceptance criteria` → `## Risks` |
| `implemented` | `## Problem` → `## Decision` → …自由节… → `## Alternatives considered` → `## Consequences` |
| `rejected` | 冻结的提案形态，结论在 `Status:` 行 |
| `archived` | 与 `implemented` 同骨架；`Status:` 保持 `implemented`，第 4 行为 `Archived: YYYY-MM-DD` |

**`implemented` 与 `archived` 都禁止出现**（门禁正则为大小写不敏感）：`## Proposal`、`## Plan`、`## Migration plan`、`## Acceptance criteria` —— 门禁会拒绝，因为这些是提案用语，混进已交付记录会让读者分不清"做了没有"；`archived` 由 `implemented` 冻结而来，同等适用。

`## Alternatives considered` **必写**（门禁 2 校验）。唯一的替代是门禁 2 接受的逃生标记：在正文写一行 `<!-- alternatives: not-recorded -->`，仅用于从存量文档收割、原始材料确实没记录备选的笔记。该标记与 `## Alternatives considered` **不能同时出现**，同时出现门禁判红。

## 涉及仓库

**本节缺失会被锚点门禁直接判红**——`verify-note-anchors.ts` 找不到 `## 涉及仓库` 段即报错并以非零码退出（`pnpm verify` 随之失败），没有 `<!-- n/a -->` 之类的逃生门；段内为空、行格式不对、出现第二个段头同样判红。所以「没有涉及仓库」也要写成一行 `不涉及`，而不是省略本节。**唯一例外是 `archived/`**：归档笔记整篇豁免锚点校验，该段可省可留，见 `references/archiving.md`。

```markdown
## 涉及仓库

- `cloud` 分支 `v140-视频监控AI分析` commits `36a846d` `1ec68fa`
- `uniapp` 不涉及
```

每行一个仓库，两种形态：带分支与 commit，或明确写「不涉及」。**锚点会被实时校验**——分支或 commit 不存在、commit 不在声明的分支上，门禁都会报错。`commits` 后**只列短哈希**，不要在同一行附其他反引号内容（会被判为格式错误）。文件是否存在**由人工自检**，本门禁不校验（`gitTracksFile` 为预留能力，尚未接入）。

项目根自身也是一个仓库：它的名字是 `.evolvetrace/config.yml` 里 `path: .` 对应的 `name`（默认取项目目录名）。单仓库项目下这就是唯一一行。

## 自由节

包拓扑、协议契约、schema 等放在 `Decision` 与 `Alternatives considered` 之间，保留可检索的机制名与 `must` / `may` / `never` 时序强调。一个事实只在一处讲透，其余用相对链接链过去。

## 时态

`proposed` 可用将来时；`implemented` 一律现在时，描述已落地事实。
````

`references/classification.md`：

```markdown
# 六分类判据

分类是**决策的性质**，不是代码的形态。目录位置即分类，门禁拒绝闭集之外的目录；新增分类需同时改 `scripts/note-tree.ts` 与本文件。

| 分类 | 覆盖范围 | 边界提示 |
|---|---|---|
| `feature` | 用户或模型看得见的新能力，包含不显然的行为选择 | 只加了能力、没改结构 → 这里 |
| `bug-fix` | 修正缺陷，或补上事故复盘暴露的缺口 | 只写"改了什么"不够，要写**根因** |
| `simplification` | **只删不增**：删代码、删行为、收窄对外范围 | 行为不变的普通重构也归这里 |
| `architecture` | **交付源码**怎么组织：包之间关系、模块边界、运行时词汇 | 与 `process` 的分界见下 |
| `process` | 围着代码转的工具、策略、工作流：门禁、包管理器、提交规范 | 不涉及运行时行为 |
| `testing` | 测试基础设施与策略：分层、验收方式、快照策略 | 具体某个测试用例的增删不单独成篇 |

## architecture 与 process 的分界

- **architecture** 关乎我们交付的源码本身
- **process** 关乎围绕源码的工具与工作流

## 为什么没有 refactor

它与 `simplification` 重叠，而后者的判别标准「**可观察行为是否改变**」已经覆盖了它：行为变了归对应类，没变就是 `simplification`。
```

`references/when-to-write.md`：

```markdown
# 何时写、何时就地改、何时不写

## 写

- 非平凡改动（见 `SKILL.md` 第一节清单）
- 一个理由被解释了第二遍——那就该写下来了
- 拍板了一条路线："就选 X"、"决定用 X"
- 比较中："X 和 Y 怎么选"——此时备选方案还在手上，是记录成本最低的时刻

## 就地改（不要新开一篇）

在**持有该决定**的旧笔记里修正事实：代码路径、方法签名、默认值、模块名。**核心理由不变**时一律就地改，不要追加变更流水账。

## 新开一篇

决定本身或理由翻转了 → 新开一篇，两篇互链，并处理旧篇（见 `archiving.md`）。**一条笔记永远不被改写成另一个决定。**

## 不写

`SKILL.md` 第一节的机械改动清单。列在这里的每一条，都**不要**给它开笔记。

## 新建前的固定动作

按模块名或机制关键词搜索 `.agents/notes/` 的活跃目录树，对每篇命中当场分类：无关 / 部分重叠（互链）/ 完全吸收（合并）/ 过时提案（转 rejected 或删）。分类结果与这篇新笔记一起落盘，**不许留到以后大扫除**。
```

`references/archiving.md`：

````markdown
# 取代与归档

## 归档的对象

**只有 `implemented` 能归档**，所以归档路径里刻意没有 `implemented` 层：`archived/{class}/yyyy-mm-dd-topic.md`。

## 归档笔记的格式

归档**不是**改状态，而是冻结：`Status:` 保持 `implemented`，并在**第 4 行**（紧接状态行之后）插入归档日期：

```markdown
# Agent Note: <标题>

Status: implemented
Archived: YYYY-MM-DD
```

其余骨架与 `implemented` 相同（`## Problem` → `## Decision` → `## Alternatives considered` → `## Consequences`）。门禁会校验第 4 行的存在与格式，也会拒绝归档笔记里的提案用语。可直接以 `templates/archived.md` 起步。

**归档笔记豁免锚点校验。** 锚点门禁（`verify-note-anchors.ts`）整篇跳过 `archived/` 下的笔记——归档已冻结、不再作为当前行为的权威依据，分支与 commit 不再实时核对；格式门禁的必备节里也不含 `## 涉及仓库`。所以从 `implemented` 冻结成 `archived` 时，该段**可以省略，也可以保留原样**：段内的分支、commit 随代码漂移不算失效，不必为它更新锚点，也不会因此判红（`templates/archived.md` 仍带该段，照抄或删掉都合规）。

## 删除，而不是归档

纯机械或仅描述小 UI 调整的 implemented 笔记，**直接删除**（含它的入站链接修复）。删除判据先于保留/归档判断。

**不要**为了凑数归档；字数与存续时间只是发现线索，**从来不是判据**。

## 该保留还是该归档

保留活跃，当以下任一项仍有可能指导未来的改动：

- 决策依据（rationale）
- 备选方案
- **否定性保证**（"这里绝不能做 X"）
- 持久化语义或协议语义
- 归属边界
- 安全规则
- **重新引入条件**（"将来若支持 Y，就该把这个加回来"）

否则归档。归档后**永久冻结**：不再编辑、翻译、重格式化、移动或删除，也不作为当前行为的权威依据。

归档时一次性定稿；**此后即使路径、符号或默认值变了也不再改**——`SKILL.md` 硬规则 4 的「就地改」只适用于活跃笔记，与本条不冲突。需要修正归档笔记里的内容就新开一篇并互链（见下节「被部分取代」）。

## 被完全取代

新笔记必须**先继承旧篇的全部独有内容**——决策依据、备选方案、后果、必需验证、明确指出的覆盖缺口——然后才允许删旧篇。**不得让 git 历史成为决策依据的唯一副本。**

## 被部分取代

两篇都留，互相加相对链接，只更新仍然成立的事实。

## proposed 不归档

过时的提案转 `rejected`，并写清为什么否决——**绝不归档**。

## rejected 的取舍

只在这个败选方案仍然是**一个诱人且影响重大的错误**时保留；否则整篇删除。
````

`references/quality-gate.md`：

```markdown
# 写完自检

结构靠脚本，意思靠人点头。写完过一遍下面五项，然后向用户报告**缺口与写得好的地方**，总量 ≤5 行。

## 1. Problem 能独立成立吗

只看 `## Problem` 一节，读者能否明白为什么非做不可？如果必须读了方案才懂动机，**动机还没写清**。

## 2. 备选是真考虑过的吗

`## Alternatives considered` 里每一条：
- 先写了它**最强的理由**吗（不是稻草人）
- 解释清楚为什么不用了吗
- 有没有编造从没考虑过的选项（有则删）

## 3. Consequences 两面都写了吗

`## Consequences` 必须**同时**写收益与代价。**没有代价的决定是挑选过的**，读者会怀疑。

## 4. 事实挂锚点了吗

路径、符号、默认值、分支、commit——是否都真实？**仓库、分支、commit** 由 `.agents/skills/evolvetrace/scripts/verify-note-anchors.ts` 实时查 git 校验；**文件是否存在由人工自检**，本门禁不校验（`gitTracksFile` 为预留能力，尚未接入），但写的时候就要自检，不要留给门禁擦屁股。

笔记里的**相对 Markdown 链接**另由门禁 1（`.agents/skills/evolvetrace/scripts/verify-note-tree.ts`）做**断链检查**：链接目标在磁盘上不存在即判红——别链到还没写的笔记，也别写错相对层级。

## 5. 时态与位置对吗

- `implemented` 全现在时；出现"计划""将要""待实现"就是放错地方了
- 决定了就放对生命周期目录，别把 `proposed` 的骨架留在 `implemented` 里

## 报告形态

只报缺口与亮点，每行一条，缺口带具体修法。不要复述笔记内容，不要客套。
```

`references/bootstrap-existing-project.md`：

````markdown
# 存量项目初始化

存量项目**不补齐历史**：很多决策的理由已不可考，硬补只会产出似是而非的推测。

原则：**建骨架 + 选择性收割 + 从今天开始记。**

## 阶段 1：建骨架（程序做，零判断）

```bash
# 在 EvolveTrace skill 仓库根执行，参数是目标项目根
node scripts/init.ts "D:\work\demo-project"
```

它做这些事：探测 git 子仓库清单 → 项目根 `git init`（若尚未）→ 建 `.agents/notes/` 四生命周期 × 六分类目录 → 写 `.evolvetrace/config.yml`（锚点门禁的仓库清单输入）与 `.agents/notes/README.md`（子仓库指针的落点）→ 追加 `.gitignore` 片段（只排除探测到的子仓库）。首次提交由人确认后执行。

**skill 文件本身不在 `init` 的职责内，需整目录复制到 `.agents/skills/evolvetrace/`**：`SKILL.md`、`references/`、`templates/`、`scripts/` **全部**（含 `scripts/note-text.ts` 这类被别的脚本 import 的模块，以及 `init.ts`、`backfill.ts`、`note-tree.ts` 等），只挑部分文件会在运行时 `ERR_MODULE_NOT_FOUND`。

## 阶段 2：重建项目 AGENTS.md（AI + 人确认）—— 最关键

1. 读现有 `AGENTS.md` 与各仓库内的模块 `AGENT.md`
2. 提取当前真正生效的规矩：构建命令、代码风格、提交规范、子仓库边界、跨仓库协作规则
3. **修正漂移**：把子仓库清单与磁盘实际目录对齐。清单来自 `.evolvetrace/config.yml` 的 `repos:` 段——比 `init` 探测到的更深层仓库，手工往这里补条目（每项 `- path:` 必须**先于** `name:`；**不要写行内注释**，`#` 会被当成值的一部分）
4. 每条规矩挂链接，指向对应笔记；笔记尚未写就时先指向已有的 spec / plan
5. 在**每个子仓库的 `AGENT.md`** 追加一条指针：

   > 重要改动需在本项目 `.agents/notes/` 留笔记；规则见 `../../AGENTS.md` 与 `../../.agents/notes/README.md`。

## 阶段 3：选择性收割（程序筛 + AI 判断）

先由程序筛候选：遍历已有的 specs / plans / sdd 与根目录需求文档，挑出含取舍、方案对比、根因分析的；并用「文档声明的文件 → `git log --all` → commit」标记其代码是否仍在。

再由 AI 逐份判断：

| 存量文档类型 | 处置 |
|---|---|
| 架构级决策（包结构、模块边界、跨服务契约） | 高优先收割 |
| 已约定的规范（版本前缀、提交格式、目录约定） | 高优先收割 |
| 根因修复 | 中优先 |
| 功能设计（已实现且稳定） | 选择性，只挑仍可能被推翻的 |
| 一次性排查脚本、临时方案、已被取代的实现 | 不收割 |
| 已被后续决策取代 | 不收割，或改写为 `rejected/` |

判据：**它还会不会指导未来的改动？** 预期产出远少于文档总数。

收割出的笔记若原始材料确实没记录备选方案，在 `## Alternatives considered` 位置写 `<!-- alternatives: not-recorded -->`。

## 阶段 4：转入日常

之后所有非平凡改动由 AI 顺手写新笔记。**初始化是一次性的，运行是持续的。**

## 分工

| 角色 | 职责 |
|---|---|
| 程序 | 探测、建骨架、筛候选、查锚点、跑门禁 |
| AI | 重建 `AGENTS.md`、逐份判断存量文档、写笔记、挂锚点 |
| 人 | **只做确认**：AI 抛出收割清单，人划掉不需要的 |

## 分批

初始化的候选文档可能很多。**程序先筛、分批交付**，或用 subagent 并行处理，不交给单个会话硬啃。
````

- [x] **Step 6: 跑测试确认通过**

Run: `node --test "scripts/*.spec.ts"`
Expected: PASS，全部测试通过（累计数随任务递增，无需核对具体数字）。

- [x] **Step 7: 提交**

```bash
git add SKILL.md references/ templates/ scripts/templates.spec.ts
git commit -m "docs: 主契约、六份判据文档与四份模板"
```

---

### Task 4: 多仓库锚点校验

这是本计划唯一**无法移植**的新代码，也是核心增值：它把笔记里"涉及仓库"的声明与真实 git 状态对上。

**Files:**
- Create: `scripts/note-anchors.ts`
- Create: `scripts/verify-note-anchors.ts`
- Test: `scripts/verify-note-anchors.spec.ts`

**Interfaces:**
- Consumes: `walkAgentNoteTree`（Task 1）
- Produces:
  - `interface DeclaredRepo { name: string; branch?: string; commits: string[]; notInvolved: boolean; line: number }`
  - `parseAnchors(text: string): { repos: DeclaredRepo[]; errors: string[] }`
  - `gitHasBranch(repoPath: string, branch: string): boolean`
  - `gitHasCommit(repoPath: string, sha: string): boolean`
  - `gitBranchContains(repoPath: string, branch: string, sha: string): boolean`
  - `gitTracksFile(repoPath: string, file: string): boolean`
  - `verifyAnchors(noteRel: string, text: string, repos: Map<string, string>): string[]` —— `repos` 为 仓库名 → 绝对路径

- [x] **Step 1: 写失败测试**

创建 `scripts/verify-note-anchors.spec.ts`。测试用真实的临时 git 仓库（`git init` + 提交），不 mock git——因为"事实必须实时查 git"正是本任务的核心约束。

```ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { spawnSync } from 'node:child_process'
import { parseNote } from './verify-note-format.ts'
import { parseAnchors, parseRepoList, verifyAnchors } from './note-anchors.ts'

function git(cwd: string, ...args: string[]): string {
  const r = spawnSync('git', args, { cwd, encoding: 'utf8' })
  assert.equal(r.status, 0, `git ${args.join(' ')} 失败：${r.stderr}`)
  return r.stdout.trim()
}

/** 建一个临时 git 仓库，在指定分支上产生一个 commit，返回 { path, sha }。 */
function makeRepo(branch: string, file = 'src/a.java'): { path: string; sha: string } {
  const path = mkdtempSync(join(tmpdir(), 'evolvetrace-repo-'))
  git(path, 'init', '-q', '-b', branch)
  git(path, 'config', 'user.email', 't@example.com')
  git(path, 'config', 'user.name', 't')
  const abs = join(path, file)
  mkdirSync(dirname(abs), { recursive: true })
  writeFileSync(abs, 'x\n')
  git(path, 'add', '.')
  git(path, 'commit', '-q', '-m', 'v140: 初始提交')
  return { path, sha: git(path, 'rev-parse', '--short', 'HEAD') }
}

const NOTE_OK = `# Agent Note: t

Status: implemented

## Problem

t

## Decision

t

## 涉及仓库

- \`cloud\` 分支 \`BRANCH\` commits \`SHA\`
- \`uniapp\` 不涉及

## Alternatives considered

**x。** y。z。

## Consequences

**收益：** a

**代价：** b
`

test('声明真实存在时通过', () => {
  const repo = makeRepo('v140-feature')
  const text = NOTE_OK.replace('BRANCH', 'v140-feature').replace('SHA', repo.sha)
  const errors = verifyAnchors('implemented/feature/2026-01-01-t.md', text, new Map([['cloud', repo.path], ['uniapp', join(repo.path, 'absent')]]))
  assert.deepEqual(errors, [])
  rmSync(repo.path, { recursive: true, force: true })
})

test('分支不存在则报错', () => {
  const repo = makeRepo('v140-feature')
  const text = NOTE_OK.replace('BRANCH', 'no-such-branch').replace('SHA', repo.sha)
  const errors = verifyAnchors('implemented/feature/2026-01-01-t.md', text, new Map([['cloud', repo.path], ['uniapp', join(repo.path, 'absent')]]))
  assert.equal(errors.length, 1)
  assert.match(errors[0] ?? '', /分支 no-such-branch 不存在/)
  rmSync(repo.path, { recursive: true, force: true })
})

test('commit 不在声明的分支上则报错', () => {
  const repo = makeRepo('v140-feature')
  git(repo.path, 'checkout', '-q', '-b', 'other')
  writeFileSync(join(repo.path, 'src', 'b.java'), 'y\n')
  git(repo.path, 'add', '.')
  git(repo.path, 'commit', '-q', '-m', 'other')
  const otherSha = git(repo.path, 'rev-parse', '--short', 'HEAD')
  // otherSha 只在 other 分支上，却声明为 v140-feature
  const text = NOTE_OK.replace('BRANCH', 'v140-feature').replace('SHA', otherSha)
  const errors = verifyAnchors('implemented/feature/2026-01-01-t.md', text, new Map([['cloud', repo.path], ['uniapp', join(repo.path, 'absent')]]))
  assert.equal(errors.length, 1)
  assert.match(errors[0] ?? '', /不在分支 v140-feature 上/)
  rmSync(repo.path, { recursive: true, force: true })
})

test('声明的仓库不存在则报错', () => {
  const repo = makeRepo('v140-feature')
  const text = NOTE_OK.replace('BRANCH', 'v140-feature').replace('SHA', repo.sha)
  const errors = verifyAnchors('implemented/feature/2026-01-01-t.md', text, new Map([['uniapp', join(repo.path, 'absent')]]))
  assert.equal(errors.length, 1)
  assert.match(errors[0] ?? '', /仓库 cloud 未在项目声明中/)
  rmSync(repo.path, { recursive: true, force: true })
})

test('解析：不涉及与正常行都能识别', () => {
  const text = ['## 涉及仓库', '', '- `cloud` 分支 `v140` commits `abc1234` `def5678`', '- `uniapp` 不涉及'].join('\n')
  const { repos, errors } = parseAnchors(text)
  assert.deepEqual(errors, [])
  assert.equal(repos.length, 2)
  assert.equal(repos[0]?.name, 'cloud')
  assert.equal(repos[0]?.branch, 'v140')
  assert.deepEqual(repos[0]?.commits, ['abc1234', 'def5678'])
  assert.equal(repos[1]?.notInvolved, true)
})

test('缺 ## 涉及仓库 段则报错', () => {
  const { repos, errors } = parseAnchors('# Agent Note: t\n\nStatus: implemented\n')
  assert.deepEqual(repos, [])
  assert.equal(errors.length, 1)
  assert.match(errors[0] ?? '', /缺少 `## 涉及仓库` 段/)
})

test('围栏内的 ## 涉及仓库 不算真段头', () => {
  // 记录本格式的笔记会在围栏里引示例；门禁必须认围栏外的真段头，否则既误红又漏校验
  const text = [
    '## Problem',
    '',
    '```markdown',
    '## 涉及仓库',
    '',
    '- `内层` 分支 `x` commits `abc1234`',
    '```',
    '',
    '## 涉及仓库',
    '',
    '- `cloud` 分支 `v140` commits `abc1234`',
  ].join('\n')
  const { repos, errors } = parseAnchors(text)
  assert.deepEqual(errors, [])
  assert.equal(repos.length, 1)
  assert.equal(repos[0]?.name, 'cloud')
})

test('commits 后第二个短哈希格式不对也要报错', () => {
  const text = ['## 涉及仓库', '', '- `cloud` 分支 `v140` commits `abc1234` `不是哈希`'].join('\n')
  const { errors } = parseAnchors(text)
  assert.equal(errors.length, 1)
  assert.match(errors[0] ?? '', /commit 短哈希格式不对/)
})

test('parseRepoList：路径或名称含空格也能解析', () => {
  // Windows 上带空格的项目路径常见；用 (\S+) 会静默丢弃整条，让锚点门禁恒红
  const config = [
    'project: my project',
    'repos:',
    '  - path: .',
    '    name: my project',
    '  - path: sub repo',
    '    name: sub repo',
    'sources:',
    '  - docs/x',
    '',
  ].join('\n')
  const repos = parseRepoList(config)
  assert.deepEqual([...repos.entries()], [['my project', '.'], ['sub repo', 'sub repo']])
})

test('parseRepoList：解析 repos 段为 名称 → 路径', () => {
  const config = [
    'project: demo',
    'repos:',
    '  - path: .',
    '    name: demo',
    '  - path: cloud',
    '    name: cloud',
    'sources:',
    '  - docs/superpowers/specs',
    '',
  ].join('\n')
  const repos = parseRepoList(config)
  assert.deepEqual([...repos.keys()], ['demo', 'cloud'])
  assert.equal(repos.get('demo'), '.')
  assert.equal(repos.get('cloud'), 'cloud')
})
```

- [x] **Step 2: 跑测试确认失败**

Run: `node --test "scripts/*.spec.ts"`
Expected: FAIL，`Cannot find module './note-anchors.ts'`。

- [x] **Step 3: 实现 note-anchors.ts**

```ts
/**
 * 解析并校验笔记的「涉及仓库」声明。
 *
 * 与 DSH 的差别：DSH 是 monorepo，笔记不需要声明涉及哪个仓库；
 * 本体系面向 polyrepo，声明必须锚定到真实的仓库、分支与 commit，
 * 且事实一律实时查 git，不信任文档里的声明。
 */
import { spawnSync } from 'node:child_process'

export interface DeclaredRepo {
  name: string
  /** 声明涉及时必填。 */
  branch?: string
  commits: string[]
  notInvolved: boolean
  /** 在笔记中的行号，从 1 开始，用于报错定位。 */
  line: number
}

export interface ParseResult {
  repos: DeclaredRepo[]
  errors: string[]
}

const SECTION = '## 涉及仓库'
const NOT_INVOLVED = /^-\s+`([^`]+)`\s+不涉及\s*$/

/**
 * 从笔记正文解析「涉及仓库」段。
 *
 * 代码围栏内的 `##` 不算文档结构（与 verify-note-format 的 parseNote 一致）——
 * 否则记录本格式的笔记会把围栏里的示例段头当成真段头，既误红合法笔记、又漏掉真锚点。
 */
export function parseAnchors(text: string): ParseResult {
  const lines = text.split('\n')
  const outside = (line: string): boolean => !line.startsWith('```')

  let start = -1
  let inFence = false
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? ''
    if (!outside(line)) { inFence = !inFence; continue }
    if (inFence) continue
    if (line.trimEnd() === SECTION) { start = i; break }
  }
  if (start === -1) {
    return { repos: [], errors: [`缺少 \`${SECTION}\` 段`] }
  }
  const repos: DeclaredRepo[] = []
  const errors: string[] = []

  inFence = false
  for (let i = start + 1; i < lines.length; i++) {
    const raw = lines[i] ?? ''
    if (!outside(raw)) { inFence = !inFence; continue }
    if (inFence) continue
    if (raw.startsWith('## ')) break
    const line = raw.trimEnd()
    if (line === '') continue

    const notInvolved = NOT_INVOLVED.exec(line)
    if (notInvolved !== null) {
      repos.push({ name: notInvolved[1] ?? '', commits: [], notInvolved: true, line: i + 1 })
      continue
    }

    const m = /^-\s+`([^`]+)`\s+分支\s+`([^`]+)`\s+commits\s+(.+)$/.exec(line)
    if (m === null) {
      errors.push(`第 ${i + 1} 行无法解析：期望「- \`仓库\` 分支 \`分支名\` commits \`短哈希\`…」或「- \`仓库\` 不涉及」`)
      continue
    }
    // commits 后可列多个短哈希：全部提取并逐个校验格式，否则第二个起会被静默放过
    const commitMatches = [...(m[3] ?? '').matchAll(/`([^`]+)`/g)].map(x => x[1] ?? '')
    if (commitMatches.length === 0) {
      errors.push(`第 ${i + 1} 行没有列出任何 commit 短哈希`)
      continue
    }
    const bad = commitMatches.filter(c => !/^[0-9a-f]{7,40}$/.test(c))
    if (bad.length > 0) {
      errors.push(`第 ${i + 1} 行的 commit 短哈希格式不对：${bad.map(c => `\`${c}\``).join(' ')}`)
      continue
    }
    repos.push({ name: m[1] ?? '', branch: m[2] ?? '', commits: commitMatches, notInvolved: false, line: i + 1 })
  }

  // 已有逐行错误时不再叠加「段为空」，否则同一行会报两条噪音错误
if (repos.length === 0 && errors.length === 0) errors.push(`${SECTION} 段为空：至少列出一个仓库，或写明「不涉及」`)
  return { repos, errors }
}

export interface GitResult {
  ok: boolean
  stdout: string
  stderr: string
}

export function git(repoPath: string, args: string[]): GitResult {
  const r = spawnSync('git', args, { cwd: repoPath, encoding: 'utf8' })
  // 保留 stderr：出问题时能区分「git 不在 PATH」「路径不是仓库」与「分支确实不存在」
  return { ok: r.status === 0, stdout: (r.stdout ?? '').trim(), stderr: (r.stderr ?? r.error?.message ?? '').trim() }
}

/**
 * 从 `.evolvetrace/config.yml` 的 `repos:` 段提取「仓库名 → 路径」。
 *
 * 放在本模块而不是 verify-note-anchors.ts，是因为后者是可执行脚本
 * （顶层会 process.exit），被 backfill 复用会在 import 时就触发执行。
 */
export function parseRepoList(configText: string): Map<string, string> {
  const repos = new Map<string, string>()
  let inRepos = false
  let pendingPath: string | undefined
  for (const raw of configText.split('\n')) {
    const line = raw.trimEnd()
    if (/^repos:\s*$/.test(line)) {
      inRepos = true
      continue
    }
    // 遇到下一个顶层键（sources: 等）即结束
    if (inRepos && /^\S/.test(line)) break
    if (!inRepos) continue
    // `- path:` 与 `name:` 分属两行，需跨行累积
    // 值取整行剩余（而非首个非空白词）：Windows 上路径/仓库名含空格很常见，
    // 用 (\S+) 会把这类条目静默丢弃，进而让锚点门禁对每篇笔记恒红
    const path = /^\s*-\s*path:\s*(.+?)\s*$/.exec(line)?.[1]
    if (path !== undefined) {
      pendingPath = path
      continue
    }
    const name = /^\s*name:\s*(.+?)\s*$/.exec(line)?.[1]
    if (name !== undefined && pendingPath !== undefined) {
      const unquote = (s: string): string => s.replace(/^["']|["']$/g, '')
      repos.set(unquote(name), unquote(pendingPath))
      pendingPath = undefined
    }
  }
  return repos
}

/** 仓库里是否存在该分支（本地或远程）。 */
export function gitHasBranch(repoPath: string, branch: string): boolean {
  const local = git(repoPath, ['show-ref', '--verify', '--quiet', `refs/heads/${branch}`])
  if (local.ok) return true
  const remote = git(repoPath, ['show-ref', '--verify', '--quiet', `refs/remotes/origin/${branch}`])
  return remote.ok
}

/** 仓库里是否存在该 commit（任意分支）。 */
export function gitHasCommit(repoPath: string, sha: string): boolean {
  return git(repoPath, ['cat-file', '-e', `${sha}^{commit}`]).ok
}

/** 该 commit 是否为指定分支的祖先。 */
export function gitBranchContains(repoPath: string, branch: string, sha: string): boolean {
  const candidates = [branch, `origin/${branch}`]
  for (const ref of candidates) {
    // 本地分支与远程分支可能只有一处存在，先确认 ref 本身可解析再判祖先关系
    if (!git(repoPath, ['rev-parse', '--verify', '--quiet', `${ref}^{commit}`]).ok) continue
    if (git(repoPath, ['merge-base', '--is-ancestor', sha, ref]).ok) return true
  }
  return false
}

/** 仓库是否跟踪该文件。 */
export function gitTracksFile(repoPath: string, file: string): boolean {
  return git(repoPath, ['cat-file', '-e', `HEAD:${file}`]).ok
}

/**
 * 校验单篇笔记的锚点。`repos` 为 仓库名 → 绝对路径。
 * 返回违规清单（空数组即通过）。
 */
export function verifyAnchors(noteRel: string, text: string, repos: Map<string, string>): string[] {
  const { repos: declared, errors } = parseAnchors(text)
  const out = errors.map(e => `anchors: ${noteRel} — ${e}`)
  for (const d of declared) {
    const path = repos.get(d.name)
    if (path === undefined) {
      out.push(`anchors: ${noteRel} — 仓库 ${d.name} 未在项目声明中（检查 .evolvetrace/config.yml）`)
      continue
    }
    if (d.notInvolved) continue
    const branch = d.branch ?? ''
    if (!gitHasBranch(path, branch)) {
      out.push(`anchors: ${noteRel} — 仓库 ${d.name} 的分支 ${branch} 不存在`)
      continue
    }
    for (const sha of d.commits) {
      if (!gitHasCommit(path, sha)) {
        out.push(`anchors: ${noteRel} — 仓库 ${d.name} 中不存在 commit ${sha}`)
        continue
      }
      if (!gitBranchContains(path, branch, sha)) {
        out.push(`anchors: ${noteRel} — 仓库 ${d.name} 的 commit ${sha} 不在分支 ${branch} 上`)
      }
    }
  }
  return out
}
```

- [x] **Step 4: 实现 verify-note-anchors.ts**

```ts
/**
 * 门禁 3：锚点。跨仓库校验每篇笔记「涉及仓库」段里的仓库、分支、commit。
 *
 * 事实一律实时查 git —— 已验证的教训：文档里声明的分支基线会与现实脱节。
 *
 * 用法：node scripts/verify-note-anchors.ts [项目根]
 * 项目根省略时取 cwd；仓库映射读 <项目根>/.evolvetrace/config.yml 的 repos 段。
 */
import { readFileSync, existsSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { walkAgentNoteTree } from './note-tree.ts'
import { parseRepoList, verifyAnchors } from './note-anchors.ts'

const projectRoot = resolve(process.argv[2] ?? process.cwd())
const notesRoot = join(projectRoot, '.agents', 'notes')
const configPath = join(projectRoot, '.evolvetrace', 'config.yml')

if (!existsSync(notesRoot)) {
  console.error(`verify-note-anchors: ${notesRoot} 不存在`)
  process.exit(1)
}
if (!existsSync(configPath)) {
  console.error(`verify-note-anchors: ${configPath} 不存在，无法得知仓库清单`)
  process.exit(1)
}

const rawRepos = parseRepoList(readFileSync(configPath, 'utf8'))
const repos = new Map<string, string>()
for (const [name, rel] of rawRepos) repos.set(name, resolve(projectRoot, rel))

const { notes, errors } = walkAgentNoteTree(notesRoot)
let checked = 0
for (const note of notes) {
  if (note.lifecycle === 'archived') continue // 归档笔记已冻结，锚点不再实时校验
  checked++
  const text = readFileSync(join(notesRoot, note.rel), 'utf8')
  errors.push(...verifyAnchors(note.rel, text, repos))
}

if (errors.length === 0) {
  console.log(`verify-note-anchors: 检查 ${checked} 篇笔记（归档已冻结，不计入），锚点全部有效（${repos.size} 个仓库）。`)
  process.exit(0)
}
console.error('verify-note-anchors: 发现违规：')
for (const e of errors) console.error(`  ${e}`)
process.exit(1)
```

- [x] **Step 5: 跑测试确认通过**

Run: `node --test "scripts/*.spec.ts"`
Expected: PASS，全部测试通过（累计数随任务递增，无需核对具体数字）。

- [x] **Step 6: 提交**

```bash
git add scripts/note-anchors.ts scripts/verify-note-anchors.ts scripts/verify-note-anchors.spec.ts
git commit -m "feat: 多仓库锚点校验门禁"
```

---

### Task 5: backfill——漏写补救

把一次漏写的提交变成一篇可补的笔记。它复用了初始化收割的**同一条链路**：`commit → 涉及文件 → 分支 → 版本前缀 → 所属需求`。

**Files:**
- Create: `scripts/backfill.ts`
- Test: `scripts/backfill.spec.ts`

**Interfaces:**
- Consumes: `git`、`parseRepoList`（Task 4）、`walkAgentNoteTree`（Task 1）
- Produces:
  - `interface CommitContext { repo: string; sha: string; subject: string; branches: string[]; files: string[]; versionPrefix?: string }`
  - `extractVersionPrefix(subject: string): string | undefined`
  - `collectCommitContext(repoName: string, repoPath: string, sha: string): CommitContext`
  - `renderBackfill(ctx: CommitContext, matchedNotes: string[]): string` —— 输出可直接贴进笔记的 markdown
  - CLI: `node scripts/backfill.ts <commit> [项目根]`

- [x] **Step 1: 写失败测试**

创建 `scripts/backfill.spec.ts`：

```ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { spawnSync } from 'node:child_process'
import { collectCommitContext, extractVersionPrefix, renderBackfill } from './backfill.ts'

function git(cwd: string, ...args: string[]): string {
  const r = spawnSync('git', args, { cwd, encoding: 'utf8' })
  assert.equal(r.status, 0, `git ${args.join(' ')} 失败：${r.stderr}`)
  return r.stdout.trim()
}

test('从提交主题提取版本前缀', () => {
  assert.equal(extractVersionPrefix('v140：【修复】关门漏判'), 'v140')
  assert.equal(extractVersionPrefix('V130: 预约导出修复'), 'V130')
  assert.equal(extractVersionPrefix('fix: 整改提示词'), undefined)
})

test('采集提交上下文：分支、文件、版本前缀', () => {
  const path = mkdtempSync(join(tmpdir(), 'evolvetrace-bf-'))
  git(path, 'init', '-q', '-b', 'v140-feature')
  git(path, 'config', 'user.email', 't@example.com')
  git(path, 'config', 'user.name', 't')
  const abs = join(path, 'src', 'a.java')
  mkdirSync(dirname(abs), { recursive: true })
  writeFileSync(abs, 'x\n')
  git(path, 'add', '.')
  git(path, 'commit', '-q', '-m', 'v140：监控AI分析控制器与定时任务')
  const sha = git(path, 'rev-parse', '--short', 'HEAD')

  const ctx = collectCommitContext('cloud', path, sha)
  assert.equal(ctx.repo, 'cloud')
  assert.equal(ctx.versionPrefix, 'v140')
  assert.deepEqual(ctx.branches, ['v140-feature'], `分支列表应只含清洗后的本地分支：${ctx.branches.join(',')}`)
  assert.deepEqual(ctx.files, ['src/a.java'])

  const md = renderBackfill(ctx, [])
  assert.match(md, /- `cloud` 分支 `v140-feature` commits `[0-9a-f]+`/)
  assert.match(md, /v140：监控AI分析控制器与定时任务/)
  assert.match(md, /src\/a\.java/)
  rmSync(path, { recursive: true, force: true })
})

test('renderBackfill 会列出匹配到的既有笔记', () => {
  const ctx = {
    repo: 'cloud',
    sha: 'abc1234',
    subject: 'v140：某改动',
    branches: ['v140'],
    files: ['src/a.java'],
    versionPrefix: 'v140',
  }
  const md = renderBackfill(ctx, ['implemented/architecture/2026-09-09-x.md'])
  assert.match(md, /implemented\/architecture\/2026-09-09-x\.md/)
})

test('merge commit 也能列出改动文件', () => {
  // `git show --name-only` 对 merge commit 默认返回空，会让「改动文件」与「相关笔记」整段消失
  const path = mkdtempSync(join(tmpdir(), 'evolvetrace-bf-merge-'))
  git(path, 'init', '-q', '-b', 'main')
  git(path, 'config', 'user.email', 't@example.com')
  git(path, 'config', 'user.name', 't')
  writeFileSync(join(path, 'base.txt'), 'base\n')
  git(path, 'add', '.')
  git(path, 'commit', '-q', '-m', 'base')
  git(path, 'checkout', '-q', '-b', 'side')
  writeFileSync(join(path, 'side.txt'), 'side\n')
  git(path, 'add', '.')
  git(path, 'commit', '-q', '-m', 'side')
  git(path, 'checkout', '-q', 'main')
  writeFileSync(join(path, 'main.txt'), 'main\n')
  git(path, 'add', '.')
  git(path, 'commit', '-q', '-m', 'main work')
  git(path, 'merge', '-q', '--no-ff', '-m', 'merge side', 'side')

  const ctx = collectCommitContext('cloud', path, 'HEAD')
  assert.deepEqual(ctx.files, ['side.txt'], `merge commit 应只取第一父线的改动：${JSON.stringify(ctx.files)}`)
  rmSync(path, { recursive: true, force: true })
})

test('无分支时不出 ## 涉及仓库 段，但保留事实载荷', () => {
  // 段内写 `(未知分支)` 过不了 verifyAnchors，写提示行过不了 parseAnchors——整段不出
  const ctx = { repo: 'cloud', sha: 'abc1234', subject: 'x', branches: [], files: ['a.txt'] }
  const md = renderBackfill(ctx, ['implemented/feature/2026-01-01-a.md'])
  assert.doesNotMatch(md, /^## 涉及仓库$/m) // 只禁段头行；行内提及不算
  assert.match(md, /未找到包含该提交的分支/)
  // 事实载荷必须保留，否则这条命令在无分支场景下几乎没用
  assert.match(md, /- 改动文件（1 个）：/)
  assert.match(md, /a\.txt/)
  assert.match(md, /implemented\/feature\/2026-01-01-a\.md/)
})

test('CLI：成功路径 exit 0，stdout 含锚点行且匹配到相关笔记', () => {
  const root = mkdtempSync(join(tmpdir(), 'evolvetrace-bf-ok-'))
  const sub = join(root, 'cloud')
  mkdirSync(sub, { recursive: true })
  git(sub, 'init', '-q', '-b', 'v140')
  git(sub, 'config', 'user.email', 't@example.com')
  git(sub, 'config', 'user.name', 't')
  writeFileSync(join(sub, 'a.txt'), 'x\n')
  git(sub, 'add', '.')
  git(sub, 'commit', '-q', '-m', 'v140：某改动')
  const sha = git(sub, 'rev-parse', 'HEAD')

  mkdirSync(join(root, '.evolvetrace'), { recursive: true })
  writeFileSync(join(root, '.evolvetrace', 'config.yml'), 'project: demo\nrepos:\n  - path: cloud\n    name: cloud\n')
  const notesDir = join(root, '.agents', 'notes', 'implemented', 'feature')
  mkdirSync(notesDir, { recursive: true })
  writeFileSync(join(notesDir, '2026-01-01-a.md'), '# Agent Note: a\n\nStatus: implemented\n\n## Problem\n\na.txt 相关\n')

  const r = spawnSync('node', ['scripts/backfill.ts', sha, root], { encoding: 'utf8' })
  assert.equal(r.status, 0, r.stderr)
  assert.match(r.stdout, /## 涉及仓库/)
  assert.match(r.stdout, /- `cloud` 分支 `v140` commits `[0-9a-f]{7,40}`/)
  assert.match(r.stdout, /implemented\/feature\/2026-01-01-a\.md/)
  rmSync(root, { recursive: true, force: true })
})

test('CLI：笔记树结构有问题时打 stderr 告警但仍 exit 0', () => {
  const root = mkdtempSync(join(tmpdir(), 'evolvetrace-bf-warn-'))
  const sub = join(root, 'cloud')
  mkdirSync(sub, { recursive: true })
  git(sub, 'init', '-q', '-b', 'main')
  git(sub, 'config', 'user.email', 't@example.com')
  git(sub, 'config', 'user.name', 't')
  writeFileSync(join(sub, 'a.txt'), 'x\n')
  git(sub, 'add', '.')
  git(sub, 'commit', '-q', '-m', 'x')
  const sha = git(sub, 'rev-parse', 'HEAD')

  mkdirSync(join(root, '.evolvetrace'), { recursive: true })
  writeFileSync(join(root, '.evolvetrace', 'config.yml'), 'project: demo\nrepos:\n  - path: cloud\n    name: cloud\n')
  // INDEX.md 被结构真源禁止，制造一条非空 errors
  mkdirSync(join(root, '.agents', 'notes'), { recursive: true })
  writeFileSync(join(root, '.agents', 'notes', 'INDEX.md'), '# idx\n')

  const r = spawnSync('node', ['scripts/backfill.ts', sha, root], { encoding: 'utf8' })
  assert.equal(r.status, 0, r.stderr)
  assert.match(r.stderr, /笔记树结构有问题/)
  rmSync(root, { recursive: true, force: true })
})

test('CLI：找不到 commit 时 exit 1 且不产出片段', () => {
  const root = mkdtempSync(join(tmpdir(), 'evolvetrace-bf-cli-'))
  mkdirSync(join(root, '.evolvetrace'), { recursive: true })
  writeFileSync(join(root, '.evolvetrace', 'config.yml'), 'project: demo\nrepos:\n  - path: .\n    name: demo\n')
  const r = spawnSync('node', ['scripts/backfill.ts', 'deadbeef', root], { encoding: 'utf8' })
  assert.equal(r.status, 1, r.stderr)
  assert.match(r.stderr, /都找不到 commit deadbeef/)
  assert.equal(r.stdout.trim(), '')
  rmSync(root, { recursive: true, force: true })
})

test('CLI：缺参数与缺 config 都 exit 1', () => {
  const noArg = spawnSync('node', ['scripts/backfill.ts'], { encoding: 'utf8' })
  assert.equal(noArg.status, 1)
  assert.match(noArg.stderr ?? '', /用法/)

  const empty = mkdtempSync(join(tmpdir(), 'evolvetrace-bf-nocfg-'))
  const noCfg = spawnSync('node', ['scripts/backfill.ts', 'HEAD', empty], { encoding: 'utf8' })
  assert.equal(noCfg.status, 1)
  assert.match(noCfg.stderr ?? '', /config\.yml 不存在/)
  rmSync(empty, { recursive: true, force: true })
})
```

- [x] **Step 2: 跑测试确认失败**

Run: `node --test "scripts/*.spec.ts"`
Expected: FAIL，`Cannot find module './backfill.ts'`。

- [x] **Step 3: 实现 backfill.ts**

创建 `scripts/backfill.ts`（`git` 与 `parseRepoList` 已由 Task 4 的 `note-anchors.ts` 导出）：

```ts
/**
 * backfill：从单个漏写的 commit 提取补写笔记所需的上下文。
 *
 * 与初始化阶段的「历史收割」共用同一条链路：
 *   commit → 涉及文件 → 分支 → 版本前缀 → 所属需求
 *
 * 用法：node scripts/backfill.ts <commit> [项目根]
 * 输出一段 markdown，交给 AI 据此写出一篇符合格式的笔记。
 */
import { existsSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { git, parseRepoList } from './note-anchors.ts'
import { walkAgentNoteTree } from './note-tree.ts'

export interface CommitContext {
  repo: string
  sha: string
  subject: string
  /** 包含该 commit 的分支（本地与远程，已清洗前缀）。 */
  branches: string[]
  files: string[]
  versionPrefix?: string
}

/** 从提交主题提取形如 `v140：` / `V130:` 的版本前缀。 */
export function extractVersionPrefix(subject: string): string | undefined {
  return /^\s*([vV]\d{3,4})\s*[：:]/.exec(subject)?.[1]
}

/** 采集一个 commit 的上下文。sha 可以是全哈希或短哈希。 */
export function collectCommitContext(repoName: string, repoPath: string, sha: string): CommitContext {
  const full = git(repoPath, ['rev-parse', sha])
  if (!full.ok) throw new Error(`仓库 ${repoName} 中找不到 commit ${sha}`)
  const commit = full.stdout
  // 直接取全哈希前 7 位：用户侧 core.abbrev < 7 时 `--short` 会给不足 7 位的哈希，
  // 而锚点门禁要求 ^[0-9a-f]{7,40}$
  const short = commit.slice(0, 7)

  const subjectRes = git(repoPath, ['log', '-1', '--format=%s', commit])
  if (!subjectRes.ok) throw new Error(`仓库 ${repoName} 无法读取 commit ${short} 的提交信息：${subjectRes.stderr}`)

  // merge commit 下 `git show --name-only` 默认返回空；--first-parent 对非 merge 输出完全一致
  const filesRes = git(repoPath, ['show', '--name-only', '--format=', '--first-parent', commit])
  if (!filesRes.ok) throw new Error(`仓库 ${repoName} 无法列出 commit ${short} 的改动文件：${filesRes.stderr}`)
  const files = filesRes.stdout.split('\n')
    .map(s => s.trim())
    .filter(s => s !== '')

  const branchesRes = git(repoPath, ['branch', '-a', '--contains', commit])
  if (!branchesRes.ok) throw new Error(`仓库 ${repoName} 无法列出包含 commit ${short} 的分支：${branchesRes.stderr}`)
  const branches = branchesRes.stdout.split('\n')
    // `+ ` 是链接 worktree 的标记（git branch -a 会打印 "+ work"），与 `* ` 一并清洗
    .map(s => s.trim().replace(/^[+*]\s*/, '').replace(/^remotes\/origin\//, ''))
    // 除 detached 的两种拼写（at/from）外，symref 行（`HEAD -> origin/main`）也不是可用分支名。
    // 只匹配带空格的箭头：git 允许分支名含 `->`（check-ref-format 通过），不能一概滤掉
    .filter(s => s !== '' && !s.startsWith('(HEAD detached ') && !s.includes(' -> '))

  const ctx: CommitContext = { repo: repoName, sha: short, subject: subjectRes.stdout, branches, files }
  const prefix = extractVersionPrefix(subjectRes.stdout)
  if (prefix !== undefined) ctx.versionPrefix = prefix
  return ctx
}

/** 渲染成可贴进笔记的 markdown 片段。 */
export function renderBackfill(ctx: CommitContext, matchedNotes: string[]): string {
  const primaryBranch = ctx.branches[0]
  // 没有分支就整段不出：段内写 `(未知分支)` 或提示行都会被自家门禁判红
  // （前者过不了 verifyAnchors，后者过不了 parseAnchors），等于制造必红片段。
  // 但事实载荷仍要给出——AI 补写笔记靠的就是它，丢了它这条命令在无分支场景下几乎没用。
  if (primaryBranch === undefined) {
    const facts: string[] = [
      '> 未找到包含该提交的分支，无法生成锚点行；请确认分支后手动补写仓库段。',
      '',
      `- 提交：\`${ctx.sha}\` ${ctx.subject}`,
    ]
    if (ctx.versionPrefix !== undefined) facts.push(`- 版本前缀：\`${ctx.versionPrefix}\``)
    facts.push(`- 改动文件（${ctx.files.length} 个）：`)
    for (const f of ctx.files) facts.push(`  - \`${f}\``)
    if (matchedNotes.length > 0) {
      facts.push('', '## 可能相关的既有笔记（请先查重，命中的就地更新或互链）', '')
      for (const n of matchedNotes) facts.push(`- \`${n}\``)
    }
    facts.push('', '> 请依据以上事实补写一篇笔记：Problem 写清动机，Decision 用现在时写已交付事实，', '> Alternatives considered 写当时真考虑过的备选（原始材料没记录则写 `<!-- alternatives: not-recorded -->`）。')
    return facts.join('\n')
  }

  const lines: string[] = []
  lines.push('## 涉及仓库', '')
  lines.push(`- \`${ctx.repo}\` 分支 \`${primaryBranch}\` commits \`${ctx.sha}\``)
  lines.push('', '## 待补写的事实', '')
  lines.push(`- 提交：\`${ctx.sha}\` ${ctx.subject}`)
  if (ctx.versionPrefix !== undefined) lines.push(`- 版本前缀：\`${ctx.versionPrefix}\``)
  lines.push(`- 包含该提交的分支：${ctx.branches.map(b => `\`${b}\``).join('、') || '（未找到）'}`)
  lines.push(`- 改动文件（${ctx.files.length} 个）：`)
  for (const f of ctx.files) lines.push(`  - \`${f}\``)
  if (matchedNotes.length > 0) {
    lines.push('', '## 可能相关的既有笔记（请先查重，命中的就地更新或互链）', '')
    for (const n of matchedNotes) lines.push(`- \`${n}\``)
  }
  lines.push('', '> 请依据以上事实补写一篇笔记：Problem 写清动机，Decision 用现在时写已交付事实，', '> Alternatives considered 写当时真考虑过的备选（原始材料没记录则写 `<!-- alternatives: not-recorded -->`）。')
  return lines.join('\n')
}

// ---- CLI ----
if (process.argv[1] !== undefined && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  const sha = process.argv[2]
  if (sha === undefined) {
    console.error('用法：node scripts/backfill.ts <commit> [项目根]')
    process.exit(1)
  }
  const projectRoot = resolve(process.argv[3] ?? process.cwd())
  const configPath = join(projectRoot, '.evolvetrace', 'config.yml')
  if (!existsSync(configPath)) {
    console.error(`backfill: ${configPath} 不存在`)
    process.exit(1)
  }
  const repos = parseRepoList(readFileSync(configPath, 'utf8'))
  const notesRoot = join(projectRoot, '.agents', 'notes')

  let ctx: CommitContext | undefined
  let repoName = ''
  for (const [name, rel] of repos) {
    const repoPath = resolve(projectRoot, rel)
    const probe = git(repoPath, ['cat-file', '-e', `${sha}^{commit}`])
    if (probe.ok) {
      ctx = collectCommitContext(name, repoPath, sha)
      repoName = name
      break
    }
  }
  if (ctx === undefined) {
    console.error(`backfill: 在声明的 ${repos.size} 个仓库里都找不到 commit ${sha}`)
    process.exit(1)
  }

  const matched: string[] = []
  if (existsSync(notesRoot)) {
    const { notes, errors } = walkAgentNoteTree(notesRoot)
    // note-tree 规定调用方把非空 errors 视为致命：静默会漏报相关笔记，诱导 AI 新建重复笔记
    if (errors.length > 0) {
      console.error('backfill: 笔记树结构有问题，可能漏报相关笔记：')
      for (const e of errors) console.error(`  ${e}`)
    }
    for (const note of notes) {
      if (note.lifecycle === 'archived') continue
      let text: string
      try {
        text = readFileSync(join(notesRoot, note.rel), 'utf8')
      } catch {
        console.error(`backfill: 笔记不可读，已跳过：${note.rel}`)
        continue
      }
      const touches = ctx.files.some(f => text.includes(f.split('/').pop() ?? '\u0000'))
      if (touches) matched.push(note.rel)
    }
  }

  console.log(renderBackfill(ctx, matched))
  console.error(`backfill: 命中仓库 ${repoName}，改动 ${ctx.files.length} 个文件，疑似相关笔记 ${matched.length} 篇`)
}
```

- [x] **Step 4: 跑测试确认通过**

Run: `node --test "scripts/*.spec.ts"`
Expected: PASS，全部测试通过（累计数随任务递增，无需核对具体数字）。

- [x] **Step 5: 在真实项目上手工验证**

Run（`demo-project` 已有真实 commit，用来验证链路端到端可用）：

```bash
node scripts/backfill.ts 36a846d "D:\work\demo-project"
```

Expected: 打印出 `## 涉及仓库` 片段，其中分支至少包含 `v140-视频监控AI分析`，改动文件为 `sql/v140/monitor_ai.sql`，版本前缀为 `v140`。

> 注意：这一步需要 `demo-project/.evolvetrace/config.yml` 存在。它由 Task 6 的 `init` 生成，因此**本步骤应在 Task 6 完成后、或在 Task 7 试点期间执行**。若此时尚未生成，跳过本步，改在 Task 7 中验证。

- [x] **Step 6: 提交**

```bash
git add scripts/backfill.ts scripts/backfill.spec.ts scripts/note-anchors.ts
git commit -m "feat: backfill 漏写补救，复用收割链路"
```

---

### Task 6: init——存量项目建骨架

**Files:**
- Create: `scripts/init.ts`
- Test: `scripts/init.spec.ts`

**Interfaces:**
- Consumes: `AGENT_NOTE_CLASSES`、`AGENT_NOTE_LIFECYCLES`、`ARCHIVE_DIR`（Task 1）
- Produces:
  - `detectSubRepos(projectRoot: string): string[]` —— 返回含 `.git` 的直接子目录名
  - `renderGitignore(subRepos: string[]): string`
  - `renderConfig(project: string, subRepos: string[]): string`
  - CLI: `node scripts/init.ts <项目根> [--dry-run]`

- [x] **Step 1: 写失败测试**

创建 `scripts/init.spec.ts`：

```ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, existsSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'
import { detectSubRepos, renderConfig, renderGitignore } from './init.ts'
import { parseRepoList } from './note-anchors.ts'

function git(cwd: string, ...args: string[]): void {
  const r = spawnSync('git', args, { cwd, encoding: 'utf8' })
  assert.equal(r.status, 0, r.stderr)
}

/** 造一个 polyrepo 项目：根无 git，下挂两个子仓库，外加一个非仓库目录。 */
function makePolyrepo(): string {
  const root = mkdtempSync(join(tmpdir(), 'evolvetrace-init-'))
  for (const name of ['cloud', 'vue']) {
    const p = join(root, name)
    mkdirSync(p, { recursive: true })
    git(p, 'init', '-q')
  }
  mkdirSync(join(root, 'docs'), { recursive: true })
  writeFileSync(join(root, 'AGENTS.md'), '# 项目规矩\n')
  return root
}

test('探测出子仓库，且不误报普通目录', () => {
  const root = makePolyrepo()
  assert.deepEqual(detectSubRepos(root).sort(), ['cloud', 'vue'])
  rmSync(root, { recursive: true, force: true })
})

test('gitignore 片段把每个子仓库都排除', () => {
  const text = renderGitignore(['cloud', 'vue'])
  assert.match(text, /^\/cloud\/$/m)
  assert.match(text, /^\/vue\/$/m)
})

test('config.yml 含项目根与全部子仓库', () => {
  const text = renderConfig('demo-project', ['cloud', 'vue'])
  assert.match(text, /^project: demo-project$/m)
  // 项目根必须在内：单仓库项目下它是唯一仓库，缺了它锚点门禁对每篇笔记恒红
  assert.match(text, /- path: \.\n\s+name: demo-project/)
  assert.match(text, /- path: cloud\n\s+name: cloud/)
  assert.match(text, /- path: vue\n\s+name: vue/)
})

test('init 端到端：建目录、写 config、写 gitignore、根目录 git init', () => {
  const root = makePolyrepo()
  const r = spawnSync('node', ['scripts/init.ts', root], { encoding: 'utf8' })
  assert.equal(r.status, 0, r.stderr)

  for (const lifecycle of ['proposed', 'implemented', 'rejected', 'archived']) {
    for (const cls of ['feature', 'bug-fix', 'simplification', 'architecture', 'process', 'testing']) {
      assert.ok(existsSync(join(root, '.agents', 'notes', lifecycle, cls)), `${lifecycle}/${cls} 未创建`)
    }
  }
  assert.ok(existsSync(join(root, '.evolvetrace', 'config.yml')))
  // 项目根必须出现在 repos 里，否则锚点门禁对单仓库项目恒红
  assert.match(readFileSync(join(root, '.evolvetrace', 'config.yml'), 'utf8'), /- path: \.\n\s+name: /)
  assert.ok(existsSync(join(root, '.agents', 'notes', 'README.md')), 'notes/README.md 未创建（子仓库指针会因此悬空）')
  assert.ok(existsSync(join(root, '.git')), '项目根应已 git init')
  assert.match(readFileSync(join(root, '.gitignore'), 'utf8'), /^\/cloud\/$/m)
  rmSync(root, { recursive: true, force: true })
})

test('--dry-run 不落盘，且先打印计划', () => {
  const root = makePolyrepo()
  const r = spawnSync('node', ['scripts/init.ts', root, '--dry-run'], { encoding: 'utf8' })
  assert.equal(r.status, 0, r.stderr)
  // 四个写入目标一个都不能出现——只查 .agents/.git 会漏掉「先写 config 再判 dry-run」的重构
  assert.equal(existsSync(join(root, '.agents')), false)
  assert.equal(existsSync(join(root, '.evolvetrace')), false)
  assert.equal(existsSync(join(root, '.gitignore')), false)
  assert.equal(existsSync(join(root, '.git')), false)
  assert.match(r.stdout, /init --dry-run/)
  rmSync(root, { recursive: true, force: true })
})

test('config.yml 已存在时不覆盖（人工补的 repos 条目会丢）', () => {
  const root = makePolyrepo()
  const cfgDir = join(root, '.evolvetrace')
  mkdirSync(cfgDir, { recursive: true })
  const handEdited = 'project: demo\nrepos:\n  - path: .\n    name: demo\n  - path: deep/inner\n    name: inner\n'
  writeFileSync(join(cfgDir, 'config.yml'), handEdited)

  const r = spawnSync('node', ['scripts/init.ts', root], { encoding: 'utf8' })
  assert.equal(r.status, 0, r.stderr)
  assert.equal(readFileSync(join(cfgDir, 'config.yml'), 'utf8'), handEdited, 'config.yml 被覆盖了')
  assert.match(r.stdout, /config\.yml 已存在，跳过/)
  rmSync(root, { recursive: true, force: true })
})

test('README.md 已存在时不覆盖（文件头承诺不修改既有文件）', () => {
  const root = makePolyrepo()
  const dir = join(root, '.agents', 'notes')
  mkdirSync(dir, { recursive: true })
  const mine = '# 我们自己的说明\n'
  writeFileSync(join(dir, 'README.md'), mine)

  const r = spawnSync('node', ['scripts/init.ts', root], { encoding: 'utf8' })
  assert.equal(r.status, 0, r.stderr)
  assert.equal(readFileSync(join(dir, 'README.md'), 'utf8'), mine, 'README.md 被覆盖了')
  assert.match(r.stdout, /README\.md` 已存在，跳过/)
  rmSync(root, { recursive: true, force: true })
})

test('名称含空白也能建骨架（parseRepoList 已放宽）', () => {
  const parent = mkdtempSync(join(tmpdir(), 'evolvetrace-init-sp-'))
  const root = join(parent, 'my project')
  mkdirSync(root, { recursive: true })
  const r = spawnSync('node', ['scripts/init.ts', root], { encoding: 'utf8' })
  assert.equal(r.status, 0, r.stderr)
  // 含空格的 config 必须能被自家锚点门禁的解析器读懂，否则门禁对每篇笔记恒红
  const cfg = readFileSync(join(root, '.evolvetrace', 'config.yml'), 'utf8')
  assert.deepEqual([...parseRepoList(cfg).entries()], [['my project', '.']])
  rmSync(parent, { recursive: true, force: true })
})
```

- [x] **Step 2: 跑测试确认失败**

Run: `node --test "scripts/*.spec.ts"`
Expected: FAIL，`Cannot find module './init.ts'`。

- [x] **Step 3: 实现 init.ts**

```ts
/**
 * 在目标项目建立 Agent Notes 骨架（存量项目初始化阶段 1）。
 *
 * 用法：node scripts/init.ts <项目根> [--dry-run]
 *
 * 只做机械动作，不含任何判断：探测子仓库、根目录 git init（若尚未）、
 * 建目录、写 .gitignore 片段与 .evolvetrace/config.yml。
 * 不提交、不修改任何既有文件的内容（.gitignore 仅追加缺失段）。
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, appendFileSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { spawnSync } from 'node:child_process'
import { AGENT_NOTE_CLASSES, AGENT_NOTE_LIFECYCLES, ARCHIVE_DIR } from './note-tree.ts'

const MARKER = '# --- EvolveTrace ---'

/** 找出项目根下含 .git 的直接子目录，即 polyrepo 的子仓库。 */
export function detectSubRepos(projectRoot: string): string[] {
  const out: string[] = []
  for (const entry of readdirSync(projectRoot, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue
    if (existsSync(join(projectRoot, entry.name, '.git'))) out.push(entry.name)
  }
  return out.sort()
}

/** 生成 .gitignore 片段：只排除探测到的子仓库，不掺入某个特定项目的模式。 */
export function renderGitignore(subRepos: string[]): string {
  const lines = [MARKER, ...subRepos.map(r => `/${r}/`), '']
  return lines.join('\n')
}

/** 生成 .evolvetrace/config.yml。仓库名默认取其目录名。 */
export function renderConfig(project: string, subRepos: string[]): string {
  const lines = [`project: ${project}`, 'repos:']
  // 项目根自身也是一个仓库：单仓库项目下它就是唯一仓库，polyrepo 下它承载 .agents/ 与笔记。
  // 不写入它会让单仓库项目的 repos 为空，锚点门禁对每篇笔记恒报「仓库未在项目声明中」。
  lines.push('  - path: .', `    name: ${project}`)
  for (const r of subRepos) lines.push(`  - path: ${r}`, `    name: ${r}`)
  lines.push('sources:', '  - docs/superpowers/specs', '  - docs/superpowers/plans', '  - docs/superpowers/sdd')
  return `${lines.join('\n')}\n`
}

const args = process.argv.slice(2)
const dryRun = args.includes('--dry-run')
const target = args.find(a => a !== '--dry-run')
if (target === undefined) {
  console.error('用法：node scripts/init.ts <项目根> [--dry-run]')
  process.exit(1)
}
const projectRoot = resolve(target)

if (!existsSync(projectRoot)) {
  console.error(`init: 项目根不存在：${projectRoot}`)
  process.exit(1)
}

const subRepos = detectSubRepos(projectRoot)
const project = projectRoot.split(/[\\/]/).filter(Boolean).pop() ?? 'project'

const configPath = join(projectRoot, '.evolvetrace', 'config.yml')
const gitignorePath = join(projectRoot, '.gitignore')
const existingGitignore = existsSync(gitignorePath) ? readFileSync(gitignorePath, 'utf8') : ''
// config 已存在就跳过：bootstrap 把「更深层子仓库」解法定为人工往 repos 补条目，
// 覆盖会静默抹掉那些条目，相关笔记随即回到「未在项目声明中」
const configExists = existsSync(configPath)
const needsRootGit = !existsSync(join(projectRoot, '.git'))
const needsGitignore = !existingGitignore.includes(MARKER)

const actions: string[] = []
actions.push(`项目根：${projectRoot}`)
actions.push(`探测到 ${subRepos.length} 个子仓库：${subRepos.join(', ') || '（无，可能是单仓库项目）'}`)
actions.push(needsRootGit ? '项目根将 git init' : '项目根已是 git 仓库，跳过 init')
actions.push(`将确保 ${AGENT_NOTE_LIFECYCLES.length + 1} 个生命周期 × ${AGENT_NOTE_CLASSES.length} 个分类目录存在`)
actions.push(configExists
  ? `${join('.evolvetrace', 'config.yml')} 已存在，跳过（手工补过 repos 条目的项目尤其不要覆盖）`
  : `将写入 ${join('.evolvetrace', 'config.yml')}`)
actions.push(existsSync(join(projectRoot, '.agents', 'notes', 'README.md'))
  ? '`.agents/notes/README.md` 已存在，跳过'
  : '将写入 `.agents/notes/README.md`')
actions.push(needsGitignore ? `将追加 .gitignore 片段（标记：${MARKER}）` : '.gitignore 已含 EvolveTrace 段，跳过')
actions.push('注意：skill 文件需人工复制到 .agents/skills/evolvetrace/，本工具不代劳')

// 写入前如实打印计划：dry-run 与真实执行走同一份清单
console.log(dryRun ? 'init --dry-run，未做任何改动：' : 'init: 将执行以下动作：')
for (const a of actions) console.log(`  ${a}`)
if (dryRun) process.exit(0)

if (needsRootGit) {
  const r = spawnSync('git', ['init', '-q'], { cwd: projectRoot, encoding: 'utf8' })
  if (r.status !== 0) {
    console.error(`init: git init 失败：${r.stderr}`)
    process.exit(1)
  }
}

for (const lifecycle of [...AGENT_NOTE_LIFECYCLES, ARCHIVE_DIR]) {
  for (const cls of AGENT_NOTE_CLASSES) {
    mkdirSync(join(projectRoot, '.agents', 'notes', lifecycle, cls), { recursive: true })
  }
}

mkdirSync(join(projectRoot, '.evolvetrace'), { recursive: true })
if (!configExists) writeFileSync(configPath, renderConfig(project, subRepos), 'utf8')

// 子仓库 AGENT.md 里的指针会引用这个文件，必须真的创建它，否则指针悬空。
// 已存在则跳过：文件头承诺「不修改任何既有文件的内容」，人工改过的说明不该被模板覆盖
const readmePath = join(projectRoot, '.agents', 'notes', 'README.md')
if (!existsSync(readmePath)) {
  writeFileSync(readmePath, [
    '# Agent Notes',
    '',
    '本目录存放本项目的决策笔记。规则见：',
    '',
    '- `.agents/skills/evolvetrace/SKILL.md`（主契约：何时写、怎么写、何时归档）',
    '- `.agents/skills/evolvetrace/references/note-format.md`（格式细则）',
    '',
    '新建笔记前先搜索同主题旧笔记；非平凡改动必须留笔记。',
    '',
  ].join('\n'), 'utf8')
}

if (needsGitignore) {
  appendFileSync(gitignorePath, `${existingGitignore === '' || existingGitignore.endsWith('\n') ? '' : '\n'}${renderGitignore(subRepos)}`, 'utf8')
}

console.log('init: 骨架已建立。')
console.log('下一步：把 skill 文件复制到 .agents/skills/evolvetrace/，然后按 references/bootstrap-existing-project.md 的阶段 2 重建 AGENTS.md。')
```

- [x] **Step 4: 跑测试确认通过**

Run: `node --test "scripts/*.spec.ts"`
Expected: PASS，全部测试通过（累计数随任务递增，无需核对具体数字）。

- [x] **Step 5: 提交**

```bash
git add scripts/init.ts scripts/init.spec.ts
git commit -m "feat: init 建骨架（探测子仓库、建目录、写 config 与 gitignore）"
```

---

### Task 7: 在 demo-project 试点（M3）

**这是本计划唯一会改动真实项目的任务。** 每个会写入的步骤前都必须取得用户明确同意。

**Files:**
- Modify（在目标项目内）: `demo-project/.gitignore`、`demo-project/AGENTS.md`
- Create（在目标项目内）: `demo-project/.agents/notes/**`、`demo-project/.evolvetrace/config.yml`、`demo-project/.agents/skills/evolvetrace/**`
- Modify（在目标项目内）: 5 个子仓库各自的 `AGENT.md`（仅追加指针）

**Interfaces:**
- Consumes: `init.ts`（Task 6）、`verify-note-*.ts`（Task 2/4）、`backfill.ts`（Task 5）
- Produces: 一个通过全部门禁的真实试点项目

- [x] **Step 1: 干跑，把将发生的事给用户看**

Run: `node scripts/init.ts "D:\work\demo-project" --dry-run`

把输出原样贴给用户，**等待明确同意**后再进行下一步。

- [x] **Step 2: 执行建骨架**

Run: `node scripts/init.ts "D:\work\demo-project"`

Expected: 项目根出现 `.git`、`.agents/notes/` 四×六目录、`.evolvetrace/config.yml`，`.gitignore` 追加了排除子仓库的片段。

- [x] **Step 3: 复制 skill 文件到试点项目**

把本仓库的 skill 目录**整目录**复制到 `demo-project/.agents/skills/evolvetrace/`：`SKILL.md`、`references/`、`templates/`、`scripts/` 全部都在（`scripts/` 里含 `note-text.ts`、`note-tree.ts`、`init.ts`、`backfill.ts` 等被互相 import 的模块，只复制其中几个会在运行时 `ERR_MODULE_NOT_FOUND`）。唯一可省的是 `scripts/*.spec.ts`。

- [x] **Step 4: 重建 AGENTS.md（AI 执行，需人确认）**

读 `demo-project/AGENTS.md` 与 5 个子仓库的 `AGENT.md`，产出一份修正后的项目 `AGENTS.md`：

- 子仓库清单改为与 `.evolvetrace/config.yml` 一致（**修正"三个子仓库"的漂移**）
- 每条规矩后挂链接，指向对应笔记或既有 spec / plan
- 新增一条规矩：「非平凡改动必须在本项目 `.agents/notes/` 留笔记，规则见 `.agents/skills/evolvetrace/SKILL.md`」

**改动前把完整的新旧对照贴给用户确认。**

- [x] **Step 5: 给 5 个子仓库铺指针**

在每个子仓库的 `AGENT.md` 末尾追加：

```markdown
## 决策笔记

重要改动需在本项目 `.agents/notes/` 留笔记；规则见 `../../AGENTS.md` 与 `../../.agents/skills/evolvetrace/SKILL.md`。
```

`uniapp_business` 目前没有 `AGENT.md`，**为它新建一个**（这也是它第一次有项目约定）。

- [x] **Step 6: 收割首批 3-5 篇笔记**

按 `references/bootstrap-existing-project.md` 阶段 3 的判据，从这批高优先候选里收割：

- `docs/superpowers/plans/2026-09-09-monitor-ai-video-analysis.md` → `implemented/architecture/`
- 版本前缀与提交规范（散在 `AGENTS.md` 与 commit 历史）→ `implemented/process/`
- `class_section_order` 的 NULL 语义根因（真实修复见 commit `00eb051`，2026-08-31，在 `master`；brief 原写的 `7a04b85` 是 RTSP 编码修复，属误引）→ `implemented/bug-fix/`
- 课表控制 SQL 改写为 Java 的等价性取舍（commit 里记录了对照文档）→ `implemented/architecture/`

每篇的「涉及仓库」段用 Task 5 的 `backfill` 生成候选，再人工核对。

- [x] **Step 7: 跑全部门禁**

```bash
cd "D:\work\demo-project"
node .agents/skills/evolvetrace/scripts/verify-note-tree.ts
node .agents/skills/evolvetrace/scripts/verify-note-format.ts
node .agents/skills/evolvetrace/scripts/verify-note-anchors.ts
```

Expected: 三个门禁全部退出码 0。

- [x] **Step 8: 提交并请用户验收**

```bash
cd "D:\work\demo-project"
git add .gitignore AGENTS.md .agents/ .evolvetrace/
git commit -m "chore: 引入 EvolveTrace 决策笔记体系"
```

验收标准（逐条向用户确认）：
1. 新会话只读 `AGENTS.md`，能否拿到当前全部规矩，且子仓库清单与实际一致？
2. 随机点开一篇笔记，能否顺着链接读到它对应规矩的"为什么、否决过什么"？
3. 在任意子仓库里发起一个非平凡改动，AI 是否自发写了笔记？

---

## Spec 覆盖对照

| spec 要求 | 落在哪个任务 |
|---|---|
| 产物：`SKILL.md` | Task 3 |
| 产物：`references/` 六份 | Task 3 |
| 产物：`templates/` 四份 | Task 3 |
| 产物：`scripts/` 三件门禁 | Task 2（tree/format）+ Task 4（anchors） |
| 四条核心判断之一「事实由程序锚定」 | Task 4 |
| 四条核心判断之四「机械门禁而非自觉」 | Task 2 / 4（非零退出） |
| 架构：四生命周期 × 六分类闭集 | Task 1（定义）+ Task 6（生成） |
| 架构：路径即身份、深度 3、拒绝 INDEX.md | Task 1（校验）+ Task 2（暴露为门禁） |
| 架构：笔记格式（头块 / 骨架 / Alternatives 必写） | Task 2（门禁）+ Task 3（文档与模板） |
| 架构：多仓库适配（涉及仓库声明） | Task 3（格式）+ Task 4（校验） |
| 存量初始化：阶段 1 建骨架 | Task 6 + Task 7 Step 2/3 |
| 存量初始化：阶段 2 重建 AGENTS.md | Task 7 Step 4 |
| 存量初始化：阶段 3 选择性收割 | Task 7 Step 6 |
| 存量初始化：阶段 4 转入日常 | Task 7 Step 8 的验收第 3 条 |
| 触发与强制：三层协同 | Task 3（description）+ Task 7 Step 4（AGENTS.md 规矩）+ Task 2/4（门禁） |
| 触发与强制：polyrepo 指针 | Task 7 Step 5 |
| 漏写与补救：`backfill` | Task 5 |
| 验证：门禁自身需要测试 | Task 2 / 4 / 5 / 6 各自的 `*.spec.ts` |
| 依赖与许可：保留 MIT 版权声明 | Global Constraints + Task 1/2 的文件头 |

**有意排除、不属本计划范围**：M4 单文件 HTML 看板、跨项目、SHA-256 归档封印、commit-msg 加固钩子。
