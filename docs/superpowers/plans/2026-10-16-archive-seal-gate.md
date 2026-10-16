# 归档封印闸门、候选清单与取代性检查落点实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 给 `.agents/notes/` 装上机械闸门——归档不可改（门禁 4 + pre-commit）、活跃笔记每次 commit 判一次结构/格式、会话开始打印归档候选清单。

**Architecture:** 三个纯模块（`note-links` / `seal-core` / 既有 `note-tree`）+ 三个纯 CLI（`verify-note-seal` / `audit-notes` / `install-hook`）。封印用「只追加」的 SHA-256 manifest 表达不可变性；两个例外通道（`--reseal` / `--forget`）直接改写 `artifacts` 并留痕于 `history`；`history` 不参与判定。闸门按路径触发，未触碰笔记的 commit 零开销。

**Tech Stack:** Node ≥ 22.18 原生 TypeScript（无构建、无运行时依赖）、`node:test` + `node:assert/strict`、`node:crypto`、POSIX sh（git hook）。

**Spec:** `docs/superpowers/specs/2026-10-16-archive-seal-gate-design.md`

## Global Constraints

- **Node ≥ 22.18**（`package.json` 的 `engines`），脚本用 `.ts` 直接跑，**不引入任何运行时依赖**（只用 `node:` 内置模块）。
- **纯模块 vs 纯 CLI 的分工**：`scripts/*-core.ts` 与 `scripts/note-*.ts` 是无模块级副作用、可安全 import 的纯模块；门禁类脚本（`verify-*.ts`、`audit-notes.ts`、`install-hook.ts`、`init.ts`、`backfill.ts`）是**不导出任何东西的纯 CLI**——不要给 CLI 加 `import.meta.url === argv[1]` 入口守卫（那条守卫经 symlink/junction 到达时 fail-open，整段 CLI 被静默跳过）。
- **路径参数口径**：门禁 1 / 2 / 4 与 audit 接 **notes 根**（`<项目根>/.agents/notes`，省略时取 `<cwd>/.agents/notes`）；门禁 3 接**项目根**；`install-hook` 接**项目根**。参数语义不同是最容易踩的坑。
- **fail-closed**：读不到、解析不了、路径不对一律报错退 1，绝不静默跳过。空树退 0（与门禁 1/2 同口径）。
- **文案与注释用中文**；注释一行说清「是什么 / 为什么」，不复述代码。
- **提交信息**：标题一行 + 正文最多 3 行。
- **测试**：`node --test "tests/*.spec.ts"`；CLI 用例用 `spawnSync('node', ['skills/intent-notes/scripts/<x>.ts', root])`，**cwd 是仓库根**；临时树用 `mkdtempSync`，测完 `rmSync`。
- **门禁报错前缀**：门禁 4 用 `seal:`（与门禁 1 的 `structure:`、门禁 2 的 `format:` 对齐）。

---

## File Structure

| 文件 | 职责 |
|---|---|
| `skills/intent-notes/scripts/note-links.ts` | **新增**，纯模块：从一行 Markdown 正文里提取本地链接目标 + 缩进代码块判定 |
| `skills/intent-notes/scripts/verify-note-tree.ts` | 修改：改为 import 上述两个函数（行为不变） |
| `skills/intent-notes/scripts/seal-core.ts` | **新增**，纯模块：manifest 读写、SHA-256、只追加校验、`reseal`/`forget` |
| `skills/intent-notes/scripts/verify-note-seal.ts` | **新增**，纯 CLI：门禁 4，含 `--write` / `--reseal` / `--forget` |
| `skills/intent-notes/scripts/audit-notes.ts` | **新增**，纯 CLI：归档候选清单，只读 |
| `skills/intent-notes/scripts/install-hook.ts` | **新增**，纯 CLI：装 `.git/hooks/pre-commit` |
| 4 个 reference + SKILL.md + 模板 + README | 修改：规则落点与命令文档 |
| `tests/note-links.spec.ts` 等 5 个 | **新增**测试 |

---

## Task 1: 提取 `note-links.ts`（纯重构）

把门禁 1 里的两个私有函数提取成可复用纯模块，为 audit 的入链统计铺路。**这一步不允许有任何行为变化**，既有 `tests/verify-note-tree.spec.ts` 是回归保护。

**Files:**
- Create: `skills/intent-notes/scripts/note-links.ts`
- Modify: `skills/intent-notes/scripts/verify-note-tree.ts:1-51`
- Test: `tests/note-links.spec.ts`

**Interfaces:**
- Consumes: 无（只依赖正则与字符串）
- Produces:
  - `isIndentedCodeBlock(line: string, prev: string | undefined): boolean`
  - `localLinkTargets(line: string): string[]`

- [ ] **Step 1: 写失败测试**

创建 `tests/note-links.spec.ts`：

```ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { isIndentedCodeBlock, localLinkTargets } from '../skills/intent-notes/scripts/note-links.ts'

test('行内链接与引用式定义都能提取', () => {
  assert.deepEqual(localLinkTargets('见 [旧篇](../implemented/feature/2026-01-01-a.md)。'), [
    '../implemented/feature/2026-01-01-a.md',
  ])
  assert.deepEqual(localLinkTargets('[ref]: ./b.md'), ['./b.md'])
})

test('`<...>` 包裹与含空格的目标按原样提取', () => {
  assert.deepEqual(localLinkTargets('见 [x](<./a b.md>)'), ['./a b.md'])
  assert.deepEqual(localLinkTargets('见 [x](<./a.md>)'), ['./a.md'])
})

test('行内代码 span 与 HTML 注释里的示例链接不算真链接', () => {
  assert.deepEqual(localLinkTargets('写法是 `[x](./example.md)`。'), [])
  assert.deepEqual(localLinkTargets('<!-- [x](./example.md) -->'), [])
})

test('外部 scheme 与协议相对 URL 不是仓库内路径', () => {
  assert.deepEqual(localLinkTargets('[x](https://example.com/a.md)'), [])
  assert.deepEqual(localLinkTargets('[x](mailto:a@b.c)'), [])
  assert.deepEqual(localLinkTargets('[x](//host/a.md)'), [])
})

test('纯锚点跳过；%XX 解码、锚点与查询串剔除', () => {
  assert.deepEqual(localLinkTargets('[x](#section)'), [])
  assert.deepEqual(localLinkTargets('[x](./a%20b.md#L3?q=1)'), ['./a b.md'])
})

test('非法 %XX 按原样返回，照常去查而不是静默放过', () => {
  assert.deepEqual(localLinkTargets('[x](./a%ZZ.md)'), ['./a%ZZ.md'])
})

test('缩进代码块判定：前一行是空行（或文件开头）才算', () => {
  assert.equal(isIndentedCodeBlock('    indented', undefined), true)
  assert.equal(isIndentedCodeBlock('    indented', ''), true)
  assert.equal(isIndentedCodeBlock('    indented', '- 列表项'), false)
  assert.equal(isIndentedCodeBlock('普通正文', undefined), false)
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `node --test tests/note-links.spec.ts`
Expected: FAIL — `Cannot find module '../skills/intent-notes/scripts/note-links.ts'`

- [ ] **Step 3: 建 `note-links.ts`，内容为原函数的逐字搬运**

```ts
/**
 * 一行 Markdown 正文里的本地链接目标提取：门禁 1 的断链检查与 audit 的入链统计共用一份。
 *
 * 拆出来是为了让 audit 不必复制粘贴一套链接解析——两份实现漂移会让「断链」与「入链」
 * 对同一篇笔记给出不同答案。
 *
 * 纯模块：无模块级副作用，调用方可安全 import。
 */

/** `##` 前缩进 ≥4 且自成一段的行是缩进代码块；列表续行前面不是空行，不会被误判。 */
export function isIndentedCodeBlock(line: string, prev: string | undefined): boolean {
  return /^ {4,}\S/.test(line) && (prev === undefined || prev.trim() === '')
}

/**
 * 提取一行的**本地**链接目标（行内链接 + 引用式定义）。
 *
 * - 行内代码 span 与 HTML 注释里的示例链接不算真链接（与代码围栏豁免同口径）
 * - 任意 scheme（`mailto:` 等）与协议相对 URL（`//host/x`）不是仓库内路径，跳过
 * - 目标先 %XX 解码、再去锚点与查询串，才能与磁盘上的真实文件名对齐
 */
export function localLinkTargets(line: string): string[] {
  const out: string[] = []
  const push = (raw: string): void => {
    let target = raw.trim().replace(/^</, '').replace(/>$/, '')
    if (target === '' || target.startsWith('#')) return
    if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(target) || target.startsWith('//')) return
    try {
      target = decodeURIComponent(target)
    } catch {
      // 非法 %XX：按原样去查，让它照常报断链，而不是静默放过
    }
    target = (target.split('#')[0] ?? '').split('?')[0] ?? ''
    if (target !== '') out.push(target)
  }
  const text = line.replace(/<!--.*?-->/g, '').replace(/`+[^`]*`+/g, '')
  // 行内链接必须容忍空格与 `<...>`；引用式定义（`[ref]: path`）同样是真链接
  for (const re of [/\]\(\s*(<[^>]*>|[^)]*?)\s*\)/g, /^\s*\[[^\]]+\]:\s*(\S+)/g]) {
    let m: RegExpExecArray | null
    while ((m = re.exec(text)) !== null) push(m[1] ?? '')
  }
  return out
}
```

- [ ] **Step 4: 改 `verify-note-tree.ts` 为 import，删掉本地副本**

改动点（三处）：

1. 第 10-13 行的 import 块改为：

```ts
import { readFileSync, existsSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { ARCHIVE_DIR, walkAgentNoteTree } from './note-tree.ts'
import { isIndentedCodeBlock, localLinkTargets } from './note-links.ts'
import { fenceAwareLines, toLines } from './note-text.ts'
```

2. 删除第 18-51 行（`isIndentedCodeBlock` 与 `localLinkTargets` 的**全部**本地定义，含注释）。

3. 文件头注释补一句来源：

```ts
/**
 * 门禁 1：结构。消费 note-tree.ts 的结果并补上它不覆盖的检查（笔记间相对链接）。
 *
 * 检查思路移植自 DeepSeek Harness 的 scripts/verify-agent-note-tree.ts（MIT, Copyright (c) 2026 DeepSeek）；
 * 相对链接的断链检查为本项目新增。链接解析在 note-links.ts，与 audit 的入链统计共用。
 *
 * 用法：node scripts/verify-note-tree.ts [notes 根]（省略则取 <cwd>/.agents/notes；门禁 3 接的是项目根）
 */
```

- [ ] **Step 5: 跑全量测试，确认零回归**

Run: `node --test "tests/*.spec.ts"`
Expected: 全部通过；`tests/verify-note-tree.spec.ts` 与 `tests/note-text.spec.ts` 无一失败

- [ ] **Step 6: 提交**

```bash
git add skills/intent-notes/scripts/note-links.ts skills/intent-notes/scripts/verify-note-tree.ts tests/note-links.spec.ts
git commit -m "refactor: 提取 note-links 供门禁与 audit 共用"
```

---

## Task 2: `seal-core.ts`——封印的纯逻辑

**Files:**
- Create: `skills/intent-notes/scripts/seal-core.ts`
- Test: `tests/seal.spec.ts`

**Interfaces:**
- Consumes: `note-tree.ts` 的 `ARCHIVE_DIR`
- Produces:
  - `SEAL_MANIFEST: string`（`'manifest.json'`）、`SEAL_VERSION: number`（`1`）
  - `interface SealHistoryEntry { action: 'reseal' | 'forget'; path: string; at: string; reason: string; from: string; to?: string }`
  - `interface SealManifest { version: number; artifacts: Record<string, string>; history: SealHistoryEntry[] }`
  - `archiveRoot(notesRoot: string): string`
  - `listSealedFiles(notesRoot: string): { files: string[]; errors: string[] }`
  - `hashFile(abs: string): string`
  - `readManifest(notesRoot: string): { manifest?: SealManifest; error?: string }`
  - `checkSeal(notesRoot: string): { errors: string[]; sealed: number }`
  - `writeSeal(notesRoot: string): { errors: string[]; added: string[] }`
  - `resealOne(notesRoot: string, rel: string, reason: string, at: string): { errors: string[] }`
  - `forgetOne(notesRoot: string, rel: string, reason: string, at: string): { errors: string[] }`

- [ ] **Step 1: 写失败测试**

创建 `tests/seal.spec.ts`：

```ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import {
  checkSeal, forgetOne, readManifest, resealOne, writeSeal, SEAL_MANIFEST,
} from '../skills/intent-notes/scripts/seal-core.ts'

/** 建一棵 notes 树，notes 为 相对路径 -> 文件内容。 */
function scaffold(notes: Record<string, string>): string {
  const root = mkdtempSync(join(tmpdir(), 'intent-notes-seal-'))
  for (const [rel, body] of Object.entries(notes)) {
    const abs = join(root, rel)
    mkdirSync(dirname(abs), { recursive: true })
    writeFileSync(abs, body)
  }
  return root
}

const NOTE = 'bug-fix/2026-01-01-a.md'
const ARCHIVED: Record<string, string> = { [`archived/${NOTE}`]: '# Agent Note: a\n\nStatus: implemented\nArchived: 2026-01-02\n\n## Problem\n\nx\n' }

function manifestOf(root: string): { artifacts: Record<string, string>; history: unknown[] } {
  return JSON.parse(readFileSync(join(root, 'archived', SEAL_MANIFEST), 'utf8'))
}

test('空归档树：通过，且不要求 manifest 存在', () => {
  const root = scaffold({ 'implemented/feature/2026-01-01-x.md': 'x' })
  const { errors, sealed } = checkSeal(root)
  assert.deepEqual(errors, [])
  assert.equal(sealed, 0)
  rmSync(root, { recursive: true, force: true })
})

test('--write 首次封印：manifest 不存在时封存全部条目', () => {
  const root = scaffold(ARCHIVED)
  const { errors, added } = writeSeal(root)
  assert.deepEqual(errors, [])
  assert.deepEqual(added, [NOTE])
  assert.match(manifestOf(root).artifacts[NOTE] ?? '', /^[0-9a-f]{64}$/)
  assert.deepEqual(checkSeal(root).errors, [])
  rmSync(root, { recursive: true, force: true })
})

test('--write 幂等：无新增时不改 manifest', () => {
  const root = scaffold(ARCHIVED)
  writeSeal(root)
  const before = readFileSync(join(root, 'archived', SEAL_MANIFEST), 'utf8')
  const { errors, added } = writeSeal(root)
  assert.deepEqual(errors, [])
  assert.deepEqual(added, [])
  assert.equal(readFileSync(join(root, 'archived', SEAL_MANIFEST), 'utf8'), before)
  rmSync(root, { recursive: true, force: true })
})

test('新增一篇归档后 --write 只追加，既有条目不动', () => {
  const root = scaffold(ARCHIVED)
  writeSeal(root)
  const second = 'feature/2026-02-02-b.md'
  mkdirSync(join(root, 'archived', 'feature'), { recursive: true })
  writeFileSync(join(root, 'archived', second), '# Agent Note: b\n\nStatus: implemented\nArchived: 2026-02-03\n')
  const { errors, added } = writeSeal(root)
  assert.deepEqual(errors, [])
  assert.deepEqual(added, [second])
  assert.equal(Object.keys(manifestOf(root).artifacts).length, 2)
  rmSync(root, { recursive: true, force: true })
})

test('既有条目被改后 --write 报错且不写入（只追加的核心保证）', () => {
  const root = scaffold(ARCHIVED)
  writeSeal(root)
  const before = readFileSync(join(root, 'archived', SEAL_MANIFEST), 'utf8')
  writeFileSync(join(root, 'archived', NOTE), '# Agent Note: a 改过\n\nStatus: implemented\nArchived: 2026-01-02\n')
  const { errors, added } = writeSeal(root)
  assert.equal(errors.length, 1)
  assert.match(errors[0] ?? '', /既有封存条目已改动/)
  assert.deepEqual(added, [])
  assert.equal(readFileSync(join(root, 'archived', SEAL_MANIFEST), 'utf8'), before)
  rmSync(root, { recursive: true, force: true })
})

test('未封存 → 判红', () => {
  const root = scaffold(ARCHIVED)
  writeFileSync(join(root, 'archived', SEAL_MANIFEST), JSON.stringify({ version: 1, artifacts: {}, history: [] }))
  const { errors } = checkSeal(root)
  assert.equal(errors.length, 1)
  assert.match(errors[0] ?? '', /未封存/)
  rmSync(root, { recursive: true, force: true })
})

test('内容改动 → 判红', () => {
  const root = scaffold(ARCHIVED)
  writeSeal(root)
  writeFileSync(join(root, 'archived', NOTE), '# Agent Note: a 改过\n\nStatus: implemented\nArchived: 2026-01-02\n')
  const { errors } = checkSeal(root)
  assert.equal(errors.length, 1)
  assert.match(errors[0] ?? '', /内容已改动/)
  rmSync(root, { recursive: true, force: true })
})

test('删除 → 判红', () => {
  const root = scaffold(ARCHIVED)
  writeSeal(root)
  rmSync(join(root, 'archived', NOTE))
  const { errors } = checkSeal(root)
  assert.equal(errors.length, 1)
  assert.match(errors[0] ?? '', /已删除/)
  rmSync(root, { recursive: true, force: true })
})

test('manifest 缺失但有归档笔记 → 报整棵树未封存', () => {
  const root = scaffold(ARCHIVED)
  const { errors } = checkSeal(root)
  assert.equal(errors.length, 1)
  assert.match(errors[0] ?? '', /未封存/)
  rmSync(root, { recursive: true, force: true })
})

test('manifest 非法 JSON → fail-closed', () => {
  const root = scaffold(ARCHIVED)
  writeFileSync(join(root, 'archived', SEAL_MANIFEST), '{ not json')
  const { errors } = checkSeal(root)
  assert.equal(errors.length, 1)
  assert.match(errors[0] ?? '', /无法解析/)
  assert.equal(writeSeal(root).errors.length, 1)
  rmSync(root, { recursive: true, force: true })
})

test('--reseal 更新封印并留痕；缺理由或内容未变都拒绝', () => {
  const root = scaffold(ARCHIVED)
  writeSeal(root)
  writeFileSync(join(root, 'archived', NOTE), '# Agent Note: a 修正\n\nStatus: implemented\nArchived: 2026-01-02\n')
  assert.deepEqual(resealOne(root, NOTE, '', '2026-03-01').errors.length, 1)
  assert.deepEqual(resealOne(root, NOTE, '首次归档时日期写错', '2026-03-01').errors, [])
  assert.deepEqual(checkSeal(root).errors, [])
  const m = manifestOf(root) as { history: Array<Record<string, string>> }
  assert.equal(m.history.length, 1)
  assert.equal(m.history[0]?.action, 'reseal')
  assert.equal(m.history[0]?.at, '2026-03-01')
  assert.match(m.history[0]?.from ?? '', /^[0-9a-f]{64}$/)
  assert.match(m.history[0]?.to ?? '', /^[0-9a-f]{64}$/)
  // 内容未变时再 reseal 是滥用，拒绝
  assert.equal(resealOne(root, NOTE, '再来一次', '2026-03-02').errors.length, 1)
  rmSync(root, { recursive: true, force: true })
})

test('--reseal 对未封存路径拒绝', () => {
  const root = scaffold(ARCHIVED)
  writeSeal(root)
  assert.equal(resealOne(root, 'feature/2026-09-09-nope.md', '理由', '2026-03-01').errors.length, 1)
  rmSync(root, { recursive: true, force: true })
})

test('--forget 删除条目并留痕；文件仍在时拒绝', () => {
  const root = scaffold(ARCHIVED)
  writeSeal(root)
  assert.equal(forgetOne(root, NOTE, '', '2026-03-01').errors.length, 1)
  assert.equal(forgetOne(root, NOTE, '误归档', '2026-03-01').errors.length, 1, '文件仍在时应拒绝')
  rmSync(join(root, 'archived', NOTE))
  assert.deepEqual(forgetOne(root, NOTE, '误归档', '2026-03-01').errors, [])
  assert.deepEqual(checkSeal(root).errors, [])
  const m = manifestOf(root) as { artifacts: Record<string, string>; history: Array<Record<string, string>> }
  assert.equal(m.artifacts[NOTE], undefined)
  assert.equal(m.history[0]?.action, 'forget')
  rmSync(root, { recursive: true, force: true })
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `node --test tests/seal.spec.ts`
Expected: FAIL — 找不到 `seal-core.ts`

- [ ] **Step 3: 实现 `seal-core.ts`**

```ts
/**
 * 归档封印的纯逻辑：SHA-256 manifest 的读写与只追加校验。
 *
 * 只追加是这套机制成立的前提——若允许重录既有条目，「改文件 + 重录」就成了自洽的合法
 * 操作，manifest 随即失去意义。唯一的例外通道是 reseal（改内容）与 forget（撤销误归档），
 * 两者都直接改写 artifacts，并在 history 留痕供审计；history 不参与判定。
 *
 * 纯模块：无模块级副作用，CLI 与 spec 都可安全 import。
 */
import { createHash } from 'node:crypto'
import { readFileSync, readdirSync, writeFileSync, existsSync, statSync, type Dirent } from 'node:fs'
import { join } from 'node:path'
import { ARCHIVE_DIR } from './note-tree.ts'

/** 封印清单文件名，位于 `archived/` 根下。 */
export const SEAL_MANIFEST = 'manifest.json'

/** 清单结构版本，将来改结构时递增。 */
export const SEAL_VERSION = 1

/** 例外通道的审计记录；不参与门禁判定。 */
export interface SealHistoryEntry {
  action: 'reseal' | 'forget'
  path: string
  at: string
  reason: string
  from: string
  to?: string
}

export interface SealManifest {
  version: number
  artifacts: Record<string, string>
  history: SealHistoryEntry[]
}

/** archived/ 的绝对路径。 */
export function archiveRoot(notesRoot: string): string {
  return join(notesRoot, ARCHIVE_DIR)
}

function isRealDir(entry: Dirent, abs: string): boolean {
  if (entry.isDirectory()) return true
  if (!entry.isSymbolicLink()) return false
  try {
    return statSync(abs).isDirectory()
  } catch {
    return false
  }
}

/**
 * 列出 archived/ 下的全部笔记，返回相对 `archived/` 的路径（字典序）。
 *
 * 与门禁 1 同口径：非常规条目（链接 / 特殊文件）报错而不是静默跳过——静默跳过等于
 * 让归档笔记凭空逃出封印。
 */
export function listSealedFiles(notesRoot: string): { files: string[]; errors: string[] } {
  const root = archiveRoot(notesRoot)
  const files: string[] = []
  const errors: string[] = []
  if (!existsSync(root)) return { files, errors }
  const walk = (rel: string): void => {
    const abs = rel === '' ? root : join(root, rel)
    let entries: Dirent[]
    try {
      entries = readdirSync(abs, { withFileTypes: true })
    } catch (e) {
      errors.push(`seal: ${ARCHIVE_DIR}/${rel} — 目录不可读（${(e as NodeJS.ErrnoException).code ?? 'unknown'}）`)
      return
    }
    for (const entry of entries) {
      const childRel = rel === '' ? entry.name : `${rel}/${entry.name}`
      const childAbs = join(root, childRel)
      if (isRealDir(entry, childAbs)) {
        walk(childRel)
        continue
      }
      if (entry.isFile()) {
        // 清单自身不是封存产物
        if (childRel !== SEAL_MANIFEST && entry.name.toLowerCase().endsWith('.md')) files.push(childRel)
        continue
      }
      errors.push(`seal: ${ARCHIVE_DIR}/${childRel} — 无法校验（无法读取的条目）`)
    }
  }
  walk('')
  return { files: files.sort(), errors }
}

/** 文件内容的 sha256（小写 hex）。 */
export function hashFile(abs: string): string {
  return createHash('sha256').update(readFileSync(abs)).digest('hex')
}

/** 读清单。不存在时 manifest 为 undefined 且无 error；存在但不可解析时报 error。 */
export function readManifest(notesRoot: string): { manifest?: SealManifest; error?: string } {
  const abs = join(archiveRoot(notesRoot), SEAL_MANIFEST)
  if (!existsSync(abs)) return {}
  let raw: string
  try {
    raw = readFileSync(abs, 'utf8')
  } catch {
    return { error: `seal: ${ARCHIVE_DIR}/${SEAL_MANIFEST} — 不可读` }
  }
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return { error: `seal: ${ARCHIVE_DIR}/${SEAL_MANIFEST} — 无法解析（不是合法 JSON）` }
  }
  const m = parsed as Partial<SealManifest> | null
  if (m === null || typeof m !== 'object' || typeof m.artifacts !== 'object' || m.artifacts === null) {
    return { error: `seal: ${ARCHIVE_DIR}/${SEAL_MANIFEST} — 无法解析（缺少 artifacts 对象）` }
  }
  return {
    manifest: {
      version: typeof m.version === 'number' ? m.version : SEAL_VERSION,
      artifacts: m.artifacts as Record<string, string>,
      history: Array.isArray(m.history) ? (m.history as SealHistoryEntry[]) : [],
    },
  }
}

/** 序列化：固定 2 空格缩进与结尾换行，让 diff 稳定。 */
export function renderManifest(m: SealManifest): string {
  return `${JSON.stringify({ version: m.version, artifacts: m.artifacts, history: m.history }, null, 2)}\n`
}

function writeManifest(notesRoot: string, m: SealManifest): void {
  writeFileSync(join(archiveRoot(notesRoot), SEAL_MANIFEST), renderManifest(m), 'utf8')
}

/** 门禁 4 的核心：逐条比对磁盘与清单，返回全部违规。 */
export function checkSeal(notesRoot: string): { errors: string[]; sealed: number } {
  const { files, errors } = listSealedFiles(notesRoot)
  const { manifest, error } = readManifest(notesRoot)
  if (error !== undefined) return { errors: [...errors, error], sealed: 0 }
  if (manifest === undefined) {
    // 空归档树 + 无清单是正常状态；有文件却没清单才是漏了 --write
    if (files.length === 0) return { errors, sealed: 0 }
    errors.push(
      `seal: ${ARCHIVE_DIR} — 归档树未封存（缺少 ${ARCHIVE_DIR}/${SEAL_MANIFEST}）；先跑 verify-note-seal.ts --write`,
    )
    return { errors, sealed: 0 }
  }
  const onDisk = new Set(files)
  for (const rel of files) {
    const recorded = manifest.artifacts[rel]
    if (recorded === undefined) {
      errors.push(`seal: ${ARCHIVE_DIR}/${rel} — 未封存；归档后请跑 verify-note-seal.ts --write`)
      continue
    }
    if (recorded !== hashFile(join(archiveRoot(notesRoot), rel))) {
      errors.push(`seal: ${ARCHIVE_DIR}/${rel} — 内容已改动（归档已冻结）；确需修正请跑 --reseal --reason=…`)
    }
  }
  for (const rel of Object.keys(manifest.artifacts)) {
    if (!onDisk.has(rel)) {
      errors.push(`seal: ${ARCHIVE_DIR}/${rel} — 已删除（归档不得删除）；误归档请跑 --forget --reason=…`)
    }
  }
  return { errors, sealed: files.length }
}

/**
 * `--write`：封印全部未记录产物。
 *
 * 先证明既有条目一条未变，再仅追加——任何既有条目哈希不符即整体报错且**不做任何写入**，
 * 否则「先改文件再 --write」就会静默把改动洗成合法。
 */
export function writeSeal(notesRoot: string): { errors: string[]; added: string[] } {
  const { files, errors } = listSealedFiles(notesRoot)
  const { manifest, error } = readManifest(notesRoot)
  if (error !== undefined) return { errors: [...errors, error], added: [] }
  const current: SealManifest = manifest ?? { version: SEAL_VERSION, artifacts: {}, history: [] }
  const added: string[] = []
  for (const rel of files) {
    const abs = join(archiveRoot(notesRoot), rel)
    const hash = hashFile(abs)
    const recorded = current.artifacts[rel]
    if (recorded === undefined) {
      added.push(rel)
      continue
    }
    if (recorded !== hash) {
      errors.push(
        `seal: ${ARCHIVE_DIR}/${rel} — 既有封存条目已改动，--write 只追加不重录；确需修正请跑 --reseal --reason=…`,
      )
    }
  }
  const onDisk = new Set(files)
  for (const rel of Object.keys(current.artifacts)) {
    if (!onDisk.has(rel)) {
      errors.push(`seal: ${ARCHIVE_DIR}/${rel} — 已封存产物消失；误删请跑 --forget --reason=…`)
    }
  }
  if (errors.length > 0) return { errors, added: [] }
  if (added.length === 0) return { errors: [], added: [] }
  for (const rel of added) current.artifacts[rel] = hashFile(join(archiveRoot(notesRoot), rel))
  writeManifest(notesRoot, current)
  return { errors: [], added }
}

/**
 * `--reseal`：更新单篇已封存产物的哈希，并在 history 留痕。
 *
 * 这是唯一的「改已封存内容」通道，因此要求路径已封存、内容确已变化、理由非空。
 */
export function resealOne(notesRoot: string, rel: string, reason: string, at: string): { errors: string[] } {
  if (reason.trim() === '') return { errors: [`seal: --reseal 必须带 --reason=<理由>`] }
  const { manifest, error } = readManifest(notesRoot)
  if (error !== undefined) return { errors: [error] }
  if (manifest === undefined) return { errors: [`seal: ${ARCHIVE_DIR} — 尚未封存，先跑 --write`] }
  const recorded = manifest.artifacts[rel]
  if (recorded === undefined) return { errors: [`seal: ${ARCHIVE_DIR}/${rel} — 未封存，不能 --reseal`] }
  const abs = join(archiveRoot(notesRoot), rel)
  if (!existsSync(abs)) return { errors: [`seal: ${ARCHIVE_DIR}/${rel} — 文件不存在`] }
  const hash = hashFile(abs)
  if (hash === recorded) return { errors: [`seal: ${ARCHIVE_DIR}/${rel} — 内容未变，无需 --reseal`] }
  manifest.artifacts[rel] = hash
  manifest.history.push({ action: 'reseal', path: rel, at, reason, from: recorded, to: hash })
  writeManifest(notesRoot, manifest)
  return { errors: [] }
}

/** `--forget`：撤销一次误归档。要求文件已删除——「删掉再声明」比「声明即消失」更难误用。 */
export function forgetOne(notesRoot: string, rel: string, reason: string, at: string): { errors: string[] } {
  if (reason.trim() === '') return { errors: [`seal: --forget 必须带 --reason=<理由>`] }
  const { manifest, error } = readManifest(notesRoot)
  if (error !== undefined) return { errors: [error] }
  if (manifest === undefined) return { errors: [`seal: ${ARCHIVE_DIR} — 尚未封存，先跑 --write`] }
  const recorded = manifest.artifacts[rel]
  if (recorded === undefined) return { errors: [`seal: ${ARCHIVE_DIR}/${rel} — 未封存，不能 --forget`] }
  if (existsSync(join(archiveRoot(notesRoot), rel))) {
    return { errors: [`seal: ${ARCHIVE_DIR}/${rel} — 文件仍在，请先删除该文件再跑 --forget`] }
  }
  delete manifest.artifacts[rel]
  manifest.history.push({ action: 'forget', path: rel, at, reason, from: recorded })
  writeManifest(notesRoot, manifest)
  return { errors: [] }
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `node --test tests/seal.spec.ts`
Expected: 全部 PASS

- [ ] **Step 5: 提交**

```bash
git add skills/intent-notes/scripts/seal-core.ts tests/seal.spec.ts
git commit -m "feat: 归档封印的只追加 SHA-256 manifest 纯逻辑"
```

---

## Task 3: `verify-note-seal.ts`——门禁 4 CLI

**Files:**
- Create: `skills/intent-notes/scripts/verify-note-seal.ts`
- Test: `tests/verify-note-seal.spec.ts`

**Interfaces:**
- Consumes: Task 2 的 `checkSeal` / `writeSeal` / `resealOne` / `forgetOne`
- Produces: 纯 CLI（不导出），用法
  `node scripts/verify-note-seal.ts [notes 根] [--write | --reseal <class>/<file>.md --reason <文本> | --forget <class>/<file>.md --reason <文本>]`

- [ ] **Step 1: 写失败测试**

创建 `tests/verify-note-seal.spec.ts`：

```ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { spawnSync } from 'node:child_process'

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
  const r = spawnSync('node', ['skills/intent-notes/scripts/verify-note-seal.ts', ...args], { encoding: 'utf8' })
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

test('未知参数退 1 且给出用法', () => {
  const r = run(['--nope'])
  assert.equal(r.code, 1)
  assert.match(r.stderr, /用法/)
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `node --test tests/verify-note-seal.spec.ts`
Expected: FAIL — 找不到脚本

- [ ] **Step 3: 实现 CLI**

```ts
/**
 * 门禁 4：归档封印。校验 `archived/` 下每篇笔记与 `Archived:` 行之外的内容是否与封印一致。
 *
 * 三种写模式（都只由人显式触发）：
 *   --write                     封印全部未记录产物；既有条目一律不重录
 *   --reseal <rel> --reason <文本>   修改已封存内容（留痕）
 *   --forget <rel> --reason <文本>   撤销一次误归档（文件需先删除，留痕）
 *
 * 用法：node scripts/verify-note-seal.ts [notes 根] [--write | --reseal <rel> --reason <文本> | --forget <rel> --reason <文本>]
 * （省略 notes 根则取 <cwd>/.agents/notes；门禁 4 与门禁 1/2 同口径接 notes 根）
 */
import { existsSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { checkSeal, forgetOne, resealOne, writeSeal } from './seal-core.ts'

const USAGE =
  '用法：node scripts/verify-note-seal.ts [notes 根] [--write | --reseal <rel> --reason <文本> | --forget <rel> --reason <文本>]'

const args = process.argv.slice(2)
const flags = new Set(args.filter(a => a.startsWith('--')))

/** 取 `--x` 紧跟的值；也接受 `--x=值`（理由可能带空格）。 */
function valueOf(name: string): string | undefined {
  const inline = args.find(a => a.startsWith(`${name}=`))
  if (inline !== undefined) return inline.slice(name.length + 1)
  const i = args.indexOf(name)
  return i >= 0 ? args[i + 1] : undefined
}

// 拼错的 flag 不能被静默当成 notes 根：那会报「根不存在」，离真正原因很远
const KNOWN_FLAGS = ['--write', '--reseal', '--forget', '--reason']
for (const f of flags) {
  if (!KNOWN_FLAGS.some(k => f === k || f.startsWith(`${k}=`))) {
    console.error(`verify-note-seal: 未知参数 ${f}\n${USAGE}`)
    process.exit(1)
  }
}

const resealPath = valueOf('--reseal')
const forgetPath = valueOf('--forget')
const reasonValue = valueOf('--reason')
// flag 的值不以 `--` 开头，会被当成位置参数；先剔除它们，剩下的第一个才是 notes 根
const consumed = new Set([resealPath, forgetPath, reasonValue].filter((v): v is string => v !== undefined))
const positional = args.filter(a => !a.startsWith('--') && !consumed.has(a))
const notesRoot = resolve(positional[0] ?? join(process.cwd(), '.agents', 'notes'))
const target = resealPath ?? forgetPath

if (flags.has('--write') && (flags.has('--reseal') || flags.has('--forget'))) {
  console.error('verify-note-seal: --write 不能与 --reseal / --forget 同时使用')
  process.exit(1)
}
if (flags.has('--reseal') && flags.has('--forget')) {
  console.error('verify-note-seal: --reseal 与 --forget 不能同时使用')
  process.exit(1)
}
if (!existsSync(notesRoot)) {
  console.error(`verify-note-seal: ${notesRoot} — 不存在或不可读`)
  process.exit(1)
}

if (flags.has('--write')) {
  const { errors, added } = writeSeal(notesRoot)
  if (errors.length > 0) {
    console.error('verify-note-seal --write 拒绝执行：')
    for (const e of errors) console.error(`  ${e}`)
    process.exit(1)
  }
  console.log(
    added.length === 0
      ? 'verify-note-seal --write: 无新增产物，封印清单未改动。'
      : `verify-note-seal --write: 已封印 ${added.length} 篇新产物。`,
  )
  process.exit(0)
}

if (flags.has('--reseal') || flags.has('--forget')) {
  if (target === undefined) {
    console.error(`${USAGE}\nverify-note-seal: --reseal / --forget 需要 <class>/<file>.md 路径`)
    process.exit(1)
  }
  const at = new Date().toLocaleDateString('sv-SE') // sv-SE 即 YYYY-MM-DD 本地日期
  const { errors } = flags.has('--reseal')
    ? resealOne(notesRoot, target, reasonValue ?? '', at)
    : forgetOne(notesRoot, target, reasonValue ?? '', at)
  if (errors.length > 0) {
    for (const e of errors) console.error(e)
    process.exit(1)
  }
  console.log(`verify-note-seal: 已${flags.has('--reseal') ? '重新封印' : '撤销封存'} archived/${target}`)
  process.exit(0)
}

const { errors, sealed } = checkSeal(notesRoot)
if (errors.length === 0) {
  console.log(
    sealed === 0
      ? 'verify-note-seal: 归档树为空，封印无需校验（空树属正常，仍退 0）。'
      : `verify-note-seal: 检查 ${sealed} 篇归档笔记，封印全部一致。`,
  )
  process.exit(0)
}
console.error('verify-note-seal: 发现违规：')
for (const e of errors) console.error(`  ${e}`)
process.exit(1)
```

- [ ] **Step 4: 跑测试确认通过**

Run: `node --test tests/verify-note-seal.spec.ts`
Expected: 全部 PASS

- [ ] **Step 5: 在真实仓库上干跑一次（无笔记树，应退 0）**

Run: `node skills/intent-notes/scripts/verify-note-seal.ts 2>&1; echo "exit=$?"`
Expected: 报 notes 根不存在并退 1（本仓库自身不是笔记项目，这是正确行为，与门禁 1/2 同口径）

- [ ] **Step 6: 提交**

```bash
git add skills/intent-notes/scripts/verify-note-seal.ts tests/verify-note-seal.spec.ts
git commit -m "feat: 门禁 4 归档封印校验与写入 CLI"
```

---

## Task 4: `archiving.md` 补「封印」一节

**Files:**
- Modify: `skills/intent-notes/references/archiving.md`

**Interfaces:**
- Consumes: Task 3 的三个命令
- Produces: 文档，无代码接口

- [ ] **Step 1: 在「归档笔记的格式」一节之后插入新节**

在 `## 归档笔记的格式` 一节的末尾（`**归档笔记豁免锚点校验。**…` 段之后）、`## 删除，而不是归档` 之前插入：

```markdown
## 封印：归档不可变的机械保证

归档后**永久冻结**不是一句约定——`archived/` 下每篇笔记的内容都有 SHA-256 封印存在 `archived/manifest.json` 里，由**门禁 4**（`verify-note-seal.ts`）校验，并由 `pre-commit`（见 `install-hook.ts`）在每次提交时强制。

归档一篇笔记时必须**在同一次改动里**完成封印：

```bash
node "<skill-dir>/scripts/verify-note-seal.ts" "<项目根>/.agents/notes" --write   # 门禁 4：封印新产物
node "<skill-dir>/scripts/verify-note-seal.ts" "<项目根>/.agents/notes"           # 只校验
```

**清单只追加**：`--write` 先证明既有条目一条未变，再加入新产物；任何既有条目哈希不符即整体拒绝。所以「改文件 + 重跑 `--write`」洗不白改动。

**要改已封存的内容**（唯一的例外通道，会留痕在 `manifest.json` 的 `history` 里）：

```bash
node "<skill-dir>/scripts/verify-note-seal.ts" "<notes 根>" --reseal <class>/<file>.md --reason "<为什么必须改>"
```

**误归档**（整篇都不该存在）时，先删文件、再撤销封存：

```bash
node "<skill-dir>/scripts/verify-note-seal.ts" "<notes 根>" --forget <class>/<file>.md --reason "<为什么撤销>"
```

门禁 4 只认 `artifacts`：`--reseal` 把哈希更新为新值，`--forget` 删掉条目，`history` 仅供审计、不参与判定——否则「有人回滚了 manifest 而文件是新内容」这类真实的不一致也会被放行。

**存量项目首次启用**：`implemented/` 里已有归档笔记时，先跑一次 `--write` 把整棵树封上（见 `bootstrap-existing-project.md`）。
```

- [ ] **Step 2: 在「该保留还是该归档」一节之后补一段「怎么发现候选」**

在 `## 该保留还是该归档` 一节末尾（`…需要修正归档笔记里的内容就新开一篇并互链（见下节「被部分取代」）。` 之后）、`## 被完全取代` 之前插入：

```markdown
**怎么发现候选**：会话开始时跑 `audit-notes.ts`，它会列出 `implemented/` 全部笔记的存续天数、字数与入链数。清单只提供线索——**字数与存续时间从来不是判据**，是否归档仍是读一遍内容后的语义判断（判据就是本节那七条）。
```

- [ ] **Step 3: 提交**

```bash
git add skills/intent-notes/references/archiving.md
git commit -m "docs: archiving 补封印流程与候选发现"
```

---

## Task 5: `install-hook.ts`——装上闸门

**Files:**
- Create: `skills/intent-notes/scripts/install-hook.ts`
- Test: `tests/install-hook.spec.ts`

**Interfaces:**
- Consumes: 无（只读自身位置 + 写目标项目）
- Produces: 纯 CLI（不导出），用法 `node scripts/install-hook.ts <项目根> [--dry-run] [--force]`

- [ ] **Step 1: 写失败测试**

创建 `tests/install-hook.spec.ts`：

```ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'

function freshProject(): string {
  const root = mkdtempSync(join(tmpdir(), 'intent-notes-hook-'))
  mkdirSync(join(root, '.git', 'hooks'), { recursive: true })
  return root
}

function run(args: string[]): { code: number; stdout: string; stderr: string } {
  const r = spawnSync('node', ['skills/intent-notes/scripts/install-hook.ts', ...args], { encoding: 'utf8' })
  return { code: r.status ?? -1, stdout: r.stdout ?? '', stderr: r.stderr }
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
```

- [ ] **Step 2: 跑测试确认失败**

Run: `node --test tests/install-hook.spec.ts`
Expected: FAIL — 找不到脚本

- [ ] **Step 3: 实现 CLI**

```ts
/**
 * 把笔记闸门装进目标项目的 .git/hooks/pre-commit。
 *
 * 与 init.ts 分开：init 承诺「不修改任何既有文件的内容」，而装 hook 会动 .git/。
 * 已有 pre-commit 时**拒绝**而不是合并——宁可让人显式处理，也不静默接管别人的钩子。
 *
 * 用法：node scripts/install-hook.ts <项目根> [--dry-run] [--force]
 */
import { chmodSync, existsSync, lstatSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { isAbsolute, join, relative, resolve } from 'node:path'

const args = process.argv.slice(2)
const dryRun = args.includes('--dry-run')
const force = args.includes('--force')
const target = args.find(a => !a.startsWith('--'))
if (target === undefined) {
  console.error('用法：node scripts/install-hook.ts <项目根> [--dry-run] [--force]')
  process.exit(1)
}
if (target.startsWith('--')) {
  console.error(`install-hook: 未知参数 ${target}；用法：node scripts/install-hook.ts <项目根> [--dry-run] [--force]`)
  process.exit(1)
}
const projectRoot = resolve(target)

if (!existsSync(projectRoot)) {
  console.error(`install-hook: 项目根不存在：${projectRoot}`)
  process.exit(1)
}
if (!existsSync(join(projectRoot, '.git'))) {
  console.error(`install-hook: ${projectRoot} 不是 git 仓库，请先跑 init.ts 建骨架`)
  process.exit(1)
}

// skill 目录：脚本在 <skill>/scripts/ 下，上一级即 skill 根
const skillDir = resolve(import.meta.dirname, '..')
const rel = relative(projectRoot, skillDir)
/** 项目内用相对路径（可随项目迁移），项目外用绝对路径。两种都转正斜杠，避免在 sh 里转义反斜杠。 */
const skillPath = rel !== '' && !rel.startsWith('..') && !isAbsolute(rel)
  ? rel.replace(/\\/g, '/')
  : skillDir.replace(/\\/g, '/')

const hookPath = join(projectRoot, '.git', 'hooks', 'pre-commit')

const HOOK = `#!/bin/sh
# Intent Notes pre-commit：笔记闸门（由 install-hook.ts 生成）
# 按路径触发：未触碰 .agents/notes/ 时零开销。
set -e
SKILL="${skillPath}"
NOTES=".agents/notes"

if ! command -v node >/dev/null 2>&1; then
  echo "intent-notes: 找不到 node，跳过笔记闸门；请安装 Node >= 22.18 后重跑 install-hook" >&2
  exit 1
fi

if ! git diff --cached --quiet -- "$NOTES/archived"; then
  node "$SKILL/scripts/verify-note-seal.ts" "$NOTES" || exit 1
fi

if ! git diff --cached --quiet -- "$NOTES"; then
  node "$SKILL/scripts/verify-note-tree.ts" "$NOTES" || exit 1
  node "$SKILL/scripts/verify-note-format.ts" "$NOTES" || exit 1
fi
`

const existing = existsSync(hookPath) ? readFileSync(hookPath, 'utf8') : undefined
if (existing === HOOK) {
  console.log(`install-hook: 已安装（内容一致），跳过。${hookPath}`)
  process.exit(0)
}
if (existing !== undefined && !force) {
  console.error(`install-hook: ${hookPath} 已存在且内容不同，拒绝覆盖。`)
  console.error('  手动接入：把下面这段并入你现有的 pre-commit，或加 --force 覆盖（会丢掉原有内容）：')
  console.error('')
  console.error(HOOK)
  process.exit(1)
}

if (dryRun) {
  console.log(`install-hook --dry-run：将写入 ${hookPath}`)
  console.log(`  skill 路径：${skillPath}`)
  process.exit(0)
}

mkdirSync(join(projectRoot, '.git', 'hooks'), { recursive: true })
if (existsSync(hookPath) && !lstatSync(hookPath).isFile()) {
  console.error(`install-hook: ${hookPath} 已存在但不是普通文件，拒绝写入`)
  process.exit(1)
}
writeFileSync(hookPath, HOOK, 'utf8')
// Windows 上 chmod 无效但不报错；Git for Windows 不看权限位
chmodSync(hookPath, 0o755)

console.log(`install-hook: 已安装 ${hookPath}`)
console.log('  改笔记时每次 commit 会跑门禁 4 / 1 / 2；只改代码的 commit 零开销。')
```

- [ ] **Step 4: 跑测试确认通过**

Run: `node --test tests/install-hook.spec.ts`
Expected: 全部 PASS

- [ ] **Step 5: 提交**

```bash
git add skills/intent-notes/scripts/install-hook.ts tests/install-hook.spec.ts
git commit -m "feat: 装 pre-commit 笔记闸门（按路径触发）"
```

---

## Task 6: `audit-notes.ts`——归档候选清单

**Files:**
- Create: `skills/intent-notes/scripts/audit-notes.ts`
- Test: `tests/audit-notes.spec.ts`

**Interfaces:**
- Consumes: `note-tree.ts` 的 `walkAgentNoteTree`；`note-text.ts` 的 `fenceAwareLines`、`proseLines`、`toLines`；`note-links.ts` 的 `isIndentedCodeBlock`、`localLinkTargets`
- Produces: 纯 CLI（不导出），用法 `node scripts/audit-notes.ts [notes 根]`；认环境变量 `INTENT_NOTES_TODAY=YYYY-MM-DD` 覆盖"今天"

- [ ] **Step 1: 写失败测试**

创建 `tests/audit-notes.spec.ts`：

```ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { spawnSync } from 'node:child_process'

function scaffold(notes: Record<string, string>): string {
  const root = mkdtempSync(join(tmpdir(), 'intent-notes-audit-'))
  for (const [rel, body] of Object.entries(notes)) {
    const abs = join(root, rel)
    mkdirSync(dirname(abs), { recursive: true })
    writeFileSync(abs, body)
  }
  return root
}

function run(root: string, today = '2026-01-31'): { code: number; stdout: string } {
  const r = spawnSync('node', ['skills/intent-notes/scripts/audit-notes.ts', root], {
    encoding: 'utf8',
    env: { ...process.env, INTENT_NOTES_TODAY: today },
  })
  return { code: r.status ?? -1, stdout: r.stdout ?? '' }
}

const body = (extra = ''): string => `# Agent Note: x\n\nStatus: implemented\n\n## Problem\n\n动机。\n\n## Decision\n\n${extra}\n\n## Alternatives considered\n\n**甲。** 理由。\n\n## Consequences\n\n代价。\n`

test('汇总四个生命周期的篇数，并按存续天数降序排列', () => {
  const root = scaffold({
    'implemented/feature/2026-01-01-old.md': body(),
    'implemented/bug-fix/2026-01-21-new.md': body(),
    'proposed/feature/2026-01-10-p.md': '# Agent Note: p\n\nStatus: proposed\n',
    'rejected/feature/2026-01-11-r.md': '# Agent Note: r\n\nStatus: rejected — 否决\n',
    'archived/feature/2026-01-02-a.md': '# Agent Note: a\n\nStatus: implemented\nArchived: 2026-01-03\n',
  })
  const { code, stdout } = run(root)
  assert.equal(code, 0, stdout)
  assert.match(stdout, /implemented 2 篇 · archived 1 篇 · proposed 1 篇 · rejected 1 篇/)
  const oldAt = stdout.indexOf('2026-01-01-old.md')
  const newAt = stdout.indexOf('2026-01-21-new.md')
  assert.ok(oldAt > 0 && newAt > 0 && oldAt < newAt, '应把存续更久的排在前面')
  assert.match(stdout, /30天/, '2026-01-01 到 2026-01-31 是 30 天')
  assert.match(stdout, /10天/, '2026-01-21 到 2026-01-31 是 10 天')
  rmSync(root, { recursive: true, force: true })
})

test('必须打印「不是判据」声明', () => {
  const root = scaffold({ 'implemented/feature/2026-01-01-a.md': body() })
  const { stdout } = run(root)
  assert.match(stdout, /从来不是归档判据/)
  rmSync(root, { recursive: true, force: true })
})

test('入链数只算活跃笔记，归档笔记的出站链接不计，且按来源去重', () => {
  const root = scaffold({
    'implemented/feature/2026-01-01-target.md': body(),
    'implemented/feature/2026-01-02-src.md': body('见 [目标](../feature/2026-01-01-target.md) 与 [目标2](../feature/2026-01-01-target.md)。'),
    'archived/feature/2026-01-03-old.md': '# Agent Note: o\n\nStatus: implemented\nArchived: 2026-01-04\n\n见 [目标](../implemented/feature/2026-01-01-target.md)。\n',
  })
  const { stdout } = run(root)
  const line = stdout.split('\n').find(l => l.includes('2026-01-01-target.md')) ?? ''
  assert.match(line, /1入链/, `同一篇链两次算一篇：${line}`)
  rmSync(root, { recursive: true, force: true })
})

test('空树退 0 并输出 0 篇', () => {
  const root = mkdtempSync(join(tmpdir(), 'intent-notes-audit-empty-'))
  const { code, stdout } = run(root)
  assert.equal(code, 0)
  assert.match(stdout, /implemented 0 篇/)
  rmSync(root, { recursive: true, force: true })
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `node --test tests/audit-notes.spec.ts`
Expected: FAIL — 找不到脚本

- [ ] **Step 3: 实现 CLI**

```ts
/**
 * 归档候选清单：列出 implemented/ 全部笔记的存续天数、字数与入链数。
 *
 * 只读、不判红、不写文件。它的存在是为了让「有没有该归档的」变成每次会话开始看得见的
 * 一张表，而不是凭记忆——**清单只提供线索**，是否归档仍是读一遍内容后的语义判断。
 *
 * 用法：node scripts/audit-notes.ts [notes 根]
 *   环境变量 INTENT_NOTES_TODAY=YYYY-MM-DD 覆盖「今天」（供测试固定时间）
 */
import { readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { ARCHIVE_DIR, walkAgentNoteTree } from './note-tree.ts'
import { fenceAwareLines, proseLines, toLines } from './note-text.ts'
import { isIndentedCodeBlock, localLinkTargets } from './note-links.ts'

const notesRoot = resolve(process.argv[2] ?? join(process.cwd(), '.agents', 'notes'))
const { notes, errors } = walkAgentNoteTree(notesRoot)

if (errors.length > 0) {
  console.error('audit-notes: 笔记树结构有问题，先按门禁 1 修完再看清单：')
  for (const e of errors) console.error(`  ${e}`)
  process.exit(1)
}

/** 本地日期 YYYY-MM-DD；`INTENT_NOTES_TODAY` 供测试注入。 */
function today(): string {
  const injected = process.env.INTENT_NOTES_TODAY
  return injected !== undefined && /^\d{4}-\d{2}-\d{2}$/.test(injected)
    ? injected
    : new Date().toLocaleDateString('sv-SE')
}

/** 两个 YYYY-MM-DD 之间的整天数（后者减前者）。 */
function daysBetween(from: string, to: string): number {
  const a = Date.parse(`${from}T00:00:00Z`)
  const b = Date.parse(`${to}T00:00:00Z`)
  return Math.round((b - a) / 86_400_000)
}

const counts = { proposed: 0, implemented: 0, rejected: 0, [ARCHIVE_DIR]: 0 } as Record<string, number>
for (const note of notes) counts[note.lifecycle] = (counts[note.lifecycle] ?? 0) + 1

/** 活跃笔记的绝对路径集合，用于把一条链接解析回目标笔记。 */
const active = notes.filter(n => n.lifecycle !== ARCHIVE_DIR)
const absOf = (rel: string): string => resolve(join(notesRoot, rel))

const inbound = new Map<string, number>()
for (const note of active) {
  let text: string
  try {
    text = readFileSync(join(notesRoot, note.rel), 'utf8')
  } catch {
    continue // 不可读由门禁 1 报，清单不重复报
  }
  const rawLines = toLines(text)
  const hit = new Set<string>()
  for (const line of fenceAwareLines(text)) {
    if (isIndentedCodeBlock(line.text, rawLines[line.index - 1])) continue
    for (const target of localLinkTargets(line.text)) {
      const resolved = resolve(dirname(join(notesRoot, note.rel)), target)
      if (resolved !== absOf(note.rel)) hit.add(resolved)
    }
  }
  for (const target of hit) inbound.set(target, (inbound.get(target) ?? 0) + 1)
}

/** 非空白字符数：中英文混排下比 split(/\s+/) 更接近「有多少内容」。 */
function wordCount(text: string): number {
  return proseLines(text).join('\n').replace(/\s/g, '').length
}

const now = today()
const rows = notes
  .filter(n => n.lifecycle === 'implemented')
  .map(n => {
    let text = ''
    try {
      text = readFileSync(join(notesRoot, n.rel), 'utf8')
    } catch {
      // 不可读由门禁 1 报
    }
    return { rel: n.rel, days: daysBetween(n.date, now), words: wordCount(text), links: inbound.get(absOf(n.rel)) ?? 0 }
  })
  .sort((a, b) => b.days - a.days)

console.log(
  `audit-notes: implemented ${counts.implemented ?? 0} 篇 · ${ARCHIVE_DIR} ${counts[ARCHIVE_DIR] ?? 0} 篇 · proposed ${counts.proposed ?? 0} 篇 · rejected ${counts.rejected ?? 0} 篇`,
)
console.log('')
console.log('字数与存续时间只是发现线索，从来不是归档判据（见 references/archiving.md）。')
if (rows.length === 0) {
  console.log('implemented/ 下没有笔记，无候选。')
} else {
  console.log('按存续天数降序：')
  for (const r of rows) console.log(`  ${r.days}天  ${r.words}字  ${r.links}入链  ${r.rel}`)
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `node --test tests/audit-notes.spec.ts`
Expected: 全部 PASS

- [ ] **Step 5: 提交**

```bash
git add skills/intent-notes/scripts/audit-notes.ts tests/audit-notes.spec.ts
git commit -m "feat: audit 输出归档候选清单"
```

---

## Task 7: 规则落点与文档同步

**Files:**
- Modify: `skills/intent-notes/SKILL.md`
- Modify: `skills/intent-notes/references/when-to-write.md`
- Modify: `skills/intent-notes/references/quality-gate.md`
- Modify: `skills/intent-notes/references/bootstrap-existing-project.md`
- Modify: `skills/intent-notes/templates/notes-readme.md`
- Modify: `README.md`

**Interfaces:**
- Consumes: Task 3 / 5 / 6 的命令名与参数
- Produces: 文档，无代码接口

- [ ] **Step 1: `SKILL.md` 第零节由三件事扩为四件事**

把第一节前的第零节最后一行「门禁不会自己启动…」之前插入第 4 条，并把开头改成四件事：

```markdown
4. `node "<skill-dir>/scripts/audit-notes.ts" "<工作目录>/.agents/notes"` —— 打印 `implemented/` 候选清单（存续天数、字数、入链数），当场过一遍：有该归档的就归档并封印
```

同时把该节开头 `会话开始先做三件事` 改为 `会话开始先做四件事`。

- [ ] **Step 2: `SKILL.md` 硬规则加第 9 条**

在硬规则 8 之后追加：

```markdown
9. 新建或更新笔记前，先按模块名或机制关键词搜 `.agents/notes/` 活跃目录树并**当场分类**：无关 / 部分重叠（互链）/ 完全吸收（合并）/ 过时。出现**完全取代**时，在同一批改动里归档被取代的 `implemented` 笔记并跑封印（门禁 4，见 `references/archiving.md`）。分类结果与这篇新笔记一起落盘，**不留到以后大扫除**。
```

- [ ] **Step 3: `SKILL.md` 第六节补门禁 4 与 hook**

在该节的代码块里追加两行，并在其后补一段：

````markdown
```bash
node "<skill-dir>/scripts/verify-note-tree.ts"   "<项目根>/.agents/notes"   # 门禁 1：结构
node "<skill-dir>/scripts/verify-note-format.ts" "<项目根>/.agents/notes"   # 门禁 2：格式
node "<skill-dir>/scripts/verify-note-seal.ts"   "<项目根>/.agents/notes"   # 门禁 4：归档封印
```

**归档了就必须封印**：把笔记移进 `archived/` 后立刻跑 `verify-note-seal.ts … --write`，否则门禁 4 会报「未封存」。

**机械闸门（推荐装一次）**：`node "<skill-dir>/scripts/install-hook.ts" "<项目根>"` 会把门禁 4 / 1 / 2 装进 `.git/hooks/pre-commit`——归档有变就查封印，笔记有变就查结构格式，只改代码的 commit 零开销。装了它，「忘了跑门禁」就不再依赖记性。
````

- [ ] **Step 4: `when-to-write.md` 的「新建前的固定动作」改为引用硬规则 9**

把 `## 新建前的固定动作` 整节替换为：

```markdown
## 新建前的固定动作

见 `SKILL.md` 硬规则 9：搜同主题旧笔记并当场分类（无关 / 部分重叠 / 完全吸收 / 过时），分类结果与新笔记一起落盘。判据只写在硬规则 9 一处，本文件不复述。
```

（原节末尾那句「判据只在那一处，别在别处复制」随之删除——它已由这里兑现。）

- [ ] **Step 5: `quality-gate.md` 第 0 步纳入门禁 4**

把第 0 步的代码块替换为：

````markdown
```bash
node "<skill-dir>/scripts/verify-note-tree.ts"   "<notes 根>"   # 门禁 1：结构、目录深度、文件名、相对链接
node "<skill-dir>/scripts/verify-note-format.ts" "<notes 根>"   # 门禁 2：头块、Status、必备节、Alternatives
node "<skill-dir>/scripts/verify-note-seal.ts"   "<notes 根>"   # 门禁 4：归档封印（改了归档 / 忘了 --write 都在这报）
```

**门禁 1 / 2 / 4 接 notes 根（`<项目根>/.agents/notes`），门禁 3 接项目根**——参数语义不同是这里最容易踩的坑；门禁 3（`verify-note-anchors.ts`）查什么见第 4 项。红了**就地修完再往下走**，不要带着红门禁交给人。
````

- [ ] **Step 6: `bootstrap-existing-project.md` 补首次封印**

在「阶段 3：选择性收割」之后追加一小节：

```markdown
## 阶段 4：给已有归档上封印

存量项目往往已有 `archived/` 笔记（本 skill 之前没有封印机制）。在阶段 3 结束后跑一次全量封印，把整棵归档树记进 `archived/manifest.json`：

```bash
node "<skill-dir>/scripts/verify-note-seal.ts" "<项目根>/.agents/notes" --write
```

**必须在开始用 hook 之前做**：没有 manifest 时门禁 4 会把每篇归档笔记都报成「未封存」。这一步是一次性的——此后每归档一篇跑 `--write` 只追加。
```

- [ ] **Step 7: `templates/notes-readme.md` 的归档一行补封印说明**

把归档那一行改为：

```markdown
| `archived/` | 冻结的历史。只有 `implemented/` 能进这里，路径中刻意不含 `implemented` 层。内容由 `archived/manifest.json` 的 SHA-256 封印保护，改不了——要改得跑 `--reseal` 并写明理由 |
```

- [ ] **Step 8: `README.md` 同步四处**

1. 门禁表格（`## 三道门禁`）标题改为 `## 四道门禁`，并在表格末尾加一行：

```markdown
| 4 封印 | `verify-note-seal.ts` | **notes 根** | `archived/` 下每篇与 `archived/manifest.json` 的 SHA-256 是否一致：未封存 / 内容已改动 / 已删除都判红。清单**只追加**，`--write` 只加新产物；改内容要 `--reseal --reason`，撤销误归档要 `--forget --reason`。空归档树退 0 |
```

2. 命令速查块追加三行：

```bash
node <skill>/scripts/verify-note-seal.ts   [notes 根] [--write | --reseal <rel> --reason <文本> | --forget <rel> --reason <文本>]
node <skill>/scripts/audit-notes.ts        [notes 根]   # 归档候选清单（只读，不判红）
node <skill>/scripts/install-hook.ts       <项目根> [--dry-run] [--force]  # 装 pre-commit
```

3. 目录结构里的 `scripts/     (10)` 改为 `scripts/     (15)`；纯模块列表 `note-tree.ts` / `note-text.ts` 之后补 `note-links.ts`、`seal-core.ts`（5 → 7）。

4. 已知限制一节追加两条：

```markdown
- **`--no-verify` 能绕过 pre-commit 闸门**：它是默认路径纠偏，不是安全边界；「该写却没写」也查不了（语义判断）
- **「只有 implemented 能归档」检测不了**：从 `proposed/` 直接移进 `archived/` 并同时改好 `Status` 与骨架，门禁会全绿——要检测只能翻 git 历史，对存量归档无效，本 skill 不做
```

- [ ] **Step 9: 跑门禁 1/2 的既有测试 + 全量测试**

Run: `node --test "tests/*.spec.ts"`
Expected: 全部通过（README 与 reference 的改动不影响脚本）

- [ ] **Step 10: 提交**

```bash
git add skills/intent-notes/SKILL.md skills/intent-notes/references skills/intent-notes/templates/notes-readme.md README.md
git commit -m "docs: 规则落点提到硬规则 9，同步四道门禁与 hook"
```

---

## 验收（全部任务完成后）

在**一个真实的已初始化项目**上跑一遍端到端：

- [ ] `cd <项目根> && node <skill>/scripts/install-hook.ts .` → 装好 hook
- [ ] 改一篇 `archived/` 笔记 → `git commit` → **被拒**并提示 `--reseal`
- [ ] `--reseal <rel> --reason "试改"` → 再 `git commit` → 通过
- [ ] 故意写一篇格式错的 `implemented/` 笔记 → `git commit` → **被拒**（门禁 2）
- [ ] 只改代码、不碰 `.agents/notes/` → `git commit` → 通过且无额外输出
- [ ] `node <skill>/scripts/audit-notes.ts <项目根>/.agents/notes` → 打印候选清单与「不是判据」声明

---

## Self-Review

**Spec coverage：**

| Spec 章节 | 覆盖任务 |
|---|---|
| 一、归档封印契约（manifest / 只追加 / 四种判定 / `--write` / `--reseal` / `--forget`） | Task 2、3 |
| 二、闸门接入（`install-hook` / hook 内容 / node 缺失拒绝 / 路径触发） | Task 5 |
| 三、取代性检查落点（硬规则 9 / when-to-write 改引用） | Task 7 Step 1-4 |
| 四、归档候选清单（只读 / 三项指标 / 排序 / 判据声明 / 挂点 / 纯重构） | Task 1、6；挂点见 Task 7 Step 1 |
| 五、改动清单 18 项 | Task 1-7 全覆盖 |
| 测试计划 5 个 spec | Task 1、2、3、5、6 各含一个 |
| 实施顺序三阶段 | 阶段 1 = Task 1；阶段 2 = Task 2-4；阶段 3 = Task 5-7 |

**类型一致性**（跨任务引用同一符号，已逐条核对）：

- `note-links.ts` 导出 `isIndentedCodeBlock` / `localLinkTargets` → Task 1 定义，Task 6 消费 ✅
- `seal-core.ts` 导出 `checkSeal` / `writeSeal` / `resealOne` / `forgetOne` / `SEAL_MANIFEST` → Task 2 定义，Task 3 消费、测试消费 ✅
- `writeSeal` 返回 `{ errors, added }`；`checkSeal` 返回 `{ errors, sealed }`；`resealOne` / `forgetOne` 返回 `{ errors }` → 三个 CLI 分支各自解构正确 ✅
- `listSealedFiles` 返回 `{ files, errors }` → 内部两处调用都解构 ✅
- 报错前缀统一 `seal: `，门禁 1 仍是 `structure: `、门禁 2 是 `format: ` ✅

**Placeholder scan：** 无 TBD / TODO /「类似 Task N」；每个代码步骤都给了完整可粘贴内容。
