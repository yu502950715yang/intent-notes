# intent-notes 仓库布局重构 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把 skill 本体收进 `skills/intent-notes/`，测试移到 `tests/`，使「部署 = 复制一个目录」不再需要任何排除清单。

**Architecture:** 仓库根变成纯开发/发布层（package.json、tsconfig、README、docs、tests），只有 `skills/intent-notes/` 是部署产物。skill 的 `name` 必须等于父目录名（agentskills 规范硬要求），所以容器目录名只能是 `skills/intent-notes/`；这与 [anthropics/skills](https://github.com/anthropics/skills)（`skills/<name>/` + 根级 `.claude-plugin/`）和 [obra/superpowers](https://github.com/obra/superpowers)（`skills/<name>/` + 根级 `tests/`）的布局一致。

**Tech Stack:** Node ≥ 22.18 原生 TypeScript 类型剥离（无构建步骤）、`node --test`、`tsc --noEmit`（devDeps: typescript / @types/node）。

**Spec:** 本次决策来自会话内分析（无独立 spec 文件）。约束依据：agentskills 规范 `name` 字段 "Must match the parent directory name"；主流布局实物见上面两个仓库。

## Global Constraints

- Node ≥ 22.18；运行时零依赖（`node --test` 与三道门禁都不需要 `node_modules`）。
- **skill `name` 必须等于其父目录名** → 含 `SKILL.md` 的目录必须是 `skills/intent-notes/`，不可叫 `skill/` 或 `intent-notes-skill/`。
- **部署集 = `skills/intent-notes/` 一个目录，不能有任何排除项**（specs、package.json、tsconfig.json、node_modules、docs、.superpowers、README 全都在它外面）。
- 所有文本文件 **LF、无 BOM**；`_write` 用 `[System.IO.File]::WriteAllText($p, $t, (New-Object System.Text.UTF8Encoding($false)))`。
- **本次是纯结构重构，行为不变**：SKILL.md 正文、笔记格式、机器标记、三道门禁的判定逻辑一律不动。SKILL.md 里 `templates/…`、`references/…` 是相对 **skill 根**的引用，部署后仍成立，**不改**。
- 历史文档 `docs/superpowers/**`、`.superpowers/**` **不回改**。
- 起点基线：`node --test "scripts/*.spec.ts"` = **97/97 pass**、`npm run typecheck` = 0。

## File Structure

```
D:\work\EvolveTrace\
├── skills\intent-notes\        ← 部署产物（唯一需要复制的目录）
│   ├── SKILL.md
│   ├── references\  (6)
│   ├── templates\   (4)
│   └── scripts\     (10 个非 spec)
├── tests\                      ← 8 个 spec（从 scripts/ 移出）
├── docs\superpowers\           ← 历史 spec/plan（不动；本计划也放这里）
├── .superpowers\               ← 开发账本（gitignored）
├── package.json  tsconfig.json  README.md  .gitignore  .gitattributes
```

---

### Task 1: 目录搬迁与路径修复

**Files:**
- Move: `SKILL.md` → `skills/intent-notes/SKILL.md`；`references/`、`templates/` 同理
- Move: `scripts/{backfill,backfill-core,init,init-core,note-anchors,note-text,note-tree,verify-note-anchors,verify-note-format,verify-note-tree}.ts` → `skills/intent-notes/scripts/`
- Move: `scripts/{backfill,init,note-anchors,note-text,note-tree,templates,verify-note-anchors,verify-note-format}.spec.ts` → `tests/`
- Modify: 8 个 spec 的 import 与路径；`package.json`；`tsconfig.json`

**Interfaces:**
- Produces: `skillRoot`（spec 内新变量）= `resolve(import.meta.dirname, '../skills/intent-notes')`，替代原 `repoRoot`。
- 部署目录契约：`skills/intent-notes/` 内含 `SKILL.md` + `references/` + `templates/` + `scripts/`（脚本互相 import，缺一即 `ERR_MODULE_NOT_FOUND`）。

- [ ] **Step 1: 建立容器并搬迁 skill 内容（保留 git 历史）**

```powershell
cd D:\work\EvolveTrace
New-Item -ItemType Directory skills\intent-notes -Force | Out-Null
git mv SKILL.md skills\intent-notes\SKILL.md
git mv references skills\intent-notes\references
git mv templates skills\intent-notes\templates
New-Item -ItemType Directory skills\intent-notes\scripts -Force | Out-Null
Get-ChildItem scripts\*.ts | Where-Object Name -notlike '*.spec.ts' | ForEach-Object {
  git mv $_.FullName (Join-Path 'skills\intent-notes\scripts' $_.Name)
}
New-Item -ItemType Directory tests -Force | Out-Null
Get-ChildItem scripts\*.spec.ts | ForEach-Object { git mv $_.FullName (Join-Path 'tests' $_.Name) }
Remove-Item scripts -Force -ErrorAction SilentlyContinue   # 应已空
```

- [ ] **Step 2: 确认搬迁结果（此时测试必然红：import 断了）**

Run: `git status --short; Get-ChildItem skills\intent-notes -Recurse -File | Measure-Object`
Expected: 21 个文件在 `skills/intent-notes/` 下；`tests/` 有 8 个 spec；`scripts/` 消失。
Run: `node --test "tests/*.spec.ts" 2>&1 | Select-String -Pattern '^# (tests|pass|fail)'`
Expected: **FAIL**（`ERR_MODULE_NOT_FOUND`）——这是"先看它失败"。

- [ ] **Step 3: 改 8 个 spec 的 `repoRoot` → `skillRoot`**

对下表每个文件做两件替换（PowerShell 直写，逐文件断言命中）：

| 文件 | 替换 |
|---|---|
| `tests/init.spec.ts` | `const repoRoot = resolve(import.meta.dirname, '..')` → `const skillRoot = resolve(import.meta.dirname, '../skills/intent-notes')`；然后全文 `repoRoot` → `skillRoot` |
| `tests/backfill.spec.ts` | 同上 |
| `tests/note-tree.spec.ts` | 同上 |
| `tests/templates.spec.ts` | 同上 |
| `tests/verify-note-anchors.spec.ts` | 同上 |
| `tests/verify-note-format.spec.ts` | 同上 |

（`note-anchors.spec.ts`、`note-text.spec.ts` 无 `repoRoot`，跳过。注意顺序：先改定义行，再全文替换 `repoRoot`，否则定义行会被改两次。）

- [ ] **Step 4: 改 8 个 spec 的 import 路径**

| 文件 | 旧 | 新 |
|---|---|---|
| `tests/init.spec.ts` | `'./init-core.ts'`、`'./note-anchors.ts'` | `'../skills/intent-notes/scripts/init-core.ts'`、`'../skills/intent-notes/scripts/note-anchors.ts'` |
| `tests/backfill.spec.ts` | `'./backfill-core.ts'` | `'../skills/intent-notes/scripts/backfill-core.ts'` |
| `tests/note-tree.spec.ts` | `'./note-tree.ts'` | `'../skills/intent-notes/scripts/note-tree.ts'` |
| `tests/note-text.spec.ts` | `'./note-text.ts'` | `'../skills/intent-notes/scripts/note-text.ts'` |
| `tests/note-anchors.spec.ts` | `'./note-anchors.ts'` | `'../skills/intent-notes/scripts/note-anchors.ts'` |
| `tests/verify-note-anchors.spec.ts` | `'./note-anchors.ts'` | `'../skills/intent-notes/scripts/note-anchors.ts'` |
| `tests/verify-note-format.spec.ts` | `'./note-text.ts'` | `'../skills/intent-notes/scripts/note-text.ts'` |

- [ ] **Step 5: 改依赖 cwd 的相对 spawn 路径**

这些调用没有 `cwd`，靠测试进程 cwd（仓库根）；路径字符串要跟着搬。

| 文件 | 旧 | 新 | 处数 |
|---|---|---|---|
| `tests/init.spec.ts` | `['scripts/init.ts'` …`]` | `['skills/intent-notes/scripts/init.ts'` …`]` | 5 |
| `tests/backfill.spec.ts` | `['scripts/backfill.ts'` …`]` | `['skills/intent-notes/scripts/backfill.ts'` …`]` | 8 |
| `tests/verify-note-format.spec.ts` | `['scripts/verify-note-format.ts', root]` | `['skills/intent-notes/scripts/verify-note-format.ts', root]` | 1 |

同时 `tests/backfill.spec.ts:39` / `tests/init.spec.ts:22` 的 `readdirSync(join(skillRoot, 'scripts'))` 由 Step 3 的全文替换自动修好。

- [ ] **Step 6: 改 package.json 与 tsconfig.json**

`package.json`：

```json
"test": "node --test \"tests/*.spec.ts\"",
"typecheck": "tsc --noEmit",
"verify": "node skills/intent-notes/scripts/verify-note-tree.ts && node skills/intent-notes/scripts/verify-note-format.ts && node skills/intent-notes/scripts/verify-note-anchors.ts"
```

`tsconfig.json` 的 `include` 改为：`["skills/**/*.ts", "tests/**/*.ts"]`

- [ ] **Step 7: 跑全量（必须 97/97）**

Run: `node --test "tests/*.spec.ts" 2>&1 | Select-String -Pattern '^# (tests|pass|fail)'`
Expected: `# tests 97 / # pass 97 / # fail 0`

Run: `npm run typecheck` → 退出码 0

- [ ] **Step 8: 提交**

```
refactor: skill 移入 skills/intent-notes/，测试移到 tests/

部署 = 复制一个目录，不再需要排除清单；97 spec 与 tsc --noEmit 全绿。
```

---

### Task 2: 部署模拟改为整目录复制（新增断言）

**Files:**
- Modify: `tests/init.spec.ts:18-29`、`tests/backfill.spec.ts:35-48`、`tests/verify-note-format.spec.ts:186-196`

**Interfaces:**
- Consumes: Task 1 的 `skillRoot`。
- Produces: `makeJunctionDeploy()` 返回 `{ link, base }`，其中 `link` 指向**部署后的 skill 根**（不再是 `scripts/` 子目录）；调用方改用 `join(link, 'scripts', '<cli>.ts')`。

- [ ] **Step 1: 改 helper 为整目录复制**

三个 helper 都改成（以 `tests/init.spec.ts` 为例）：

```ts
function makeJunctionDeploy(): { link: string; base: string } {
  const base = mkdtempSync(join(tmpdir(), 'intent-notes-deploy-init-'))
  const deployed = join(base, 'intent-notes')
  cpSync(skillRoot, deployed, { recursive: true })   // 部署 = 整目录复制，与文档一致
  const link = join(base, 'skill-scripts')
  symlinkSync(deployed, link, 'junction')
  return { link, base }
}
```

import 行补 `cpSync`，删掉不再使用的 `readdirSync`/`copyFileSync`（`init.spec.ts` 的 `readFileSync` 仍在用，保留）。

- [ ] **Step 2: 调用方改路径**

| 位置 | 旧 | 新 |
|---|---|---|
| `init.spec.ts:167` | `join(link, 'init.ts')` | `join(link, 'scripts', 'init.ts')` |
| `backfill.spec.ts:328` | `join(link, 'backfill.ts')` | `join(link, 'scripts', 'backfill.ts')` |
| `verify-note-format.spec.ts:201` | `join(link, 'verify-note-format.ts')` | `join(link, 'scripts', 'verify-note-format.ts')` |

- [ ] **Step 3: 新增「部署目录自包含」断言（写在 `tests/init.spec.ts` 末尾）**

```ts
test('部署目录自包含：无 spec、无开发配置', () => {
  const { base } = makeJunctionDeploy()
  try {
    const deployed = join(base, 'intent-notes')
    const all = readdirSync(deployed, { recursive: true }) as string[]
    assert.equal(all.some(f => f.endsWith('.spec.ts')), false, '部署副本里不应有 spec')
    for (const dev of ['package.json', 'tsconfig.json', 'README.md', 'node_modules']) {
      assert.equal(existsSync(join(deployed, dev)), false, `部署副本里不应有 ${dev}`)
    }
    for (const need of ['SKILL.md', 'references', 'templates', 'scripts']) {
      assert.ok(existsSync(join(deployed, need)), `部署副本缺少 ${need}`)
    }
  } finally { rmSync(base, { recursive: true, force: true }) }
})
```

- [ ] **Step 4: 跑（应绿；若红说明 skill 目录不自包含）**

Run: `node --test "tests/*.spec.ts" 2>&1 | Select-String -Pattern '^# (tests|pass|fail)'`
Expected: `# tests 98 / # pass 98 / # fail 0`

**变异验证**（证明断言不是恒真）：临时在 `skills/intent-notes/scripts/` 里放一个 `probe.spec.ts`，重跑 → 该测试必须红；删掉后复绿。

- [ ] **Step 5: 提交**

```
test: 部署模拟改为整目录复制，并断言部署目录自包含
```

---

### Task 3: 文档与 init 文案对齐

**Files:**
- Modify: `README.md`（快速开始、三层结构、开发、已知限制）、`references/bootstrap-existing-project.md`(:10-16)、`skills/intent-notes/scripts/init.ts`(:60、:109)

- [ ] **Step 1: bootstrap 的命令与部署段**

```markdown
# 在 intent-notes 仓库根执行，参数是目标项目根
node skills/intent-notes/scripts/init.ts "D:\work\demo-project"
```

部署段（:16）改为：**整目录复制 `skills/intent-notes/` → `<项目>/.agents/skills/intent-notes/`，内部不要再挑文件**；删除原有的「只排除开发产物：…」清单（tests 与开发配置现在都在 skill 目录之外，无需排除）。

- [ ] **Step 2: init.ts 两处文案**

- `:60` → `actions.push('注意：skill 需人工把 skills/intent-notes/ 整目录复制到 .agents/skills/intent-notes/，本工具不代劳')`
- `:109` → `console.log('下一步：把 skills/intent-notes/ 整目录复制到 .agents/skills/intent-notes/，然后按 references/bootstrap-existing-project.md 的阶段 2 重建 AGENTS.md。')`

- [ ] **Step 3: README**

- 快速开始：`node skills/intent-notes/scripts/init.ts "<项目>"`；第 2 步改为「把 `skills/intent-notes/` 整目录复制到 `<项目>/.agents/skills/intent-notes/`」，删掉排除清单行。
- 三层结构表：路径前加 `skills/intent-notes/` 前缀。
- 开发：`node --test "tests/*.spec.ts"`、`npm run typecheck`。
- 已知限制：保留 `ts(2591)` 那条（部署副本里仍可能出现）。

- [ ] **Step 4: 验证并提交**

Run: `node --test "tests/*.spec.ts"` → 98/98；`npm run typecheck` → 0
Run（应无残留）：`Select-String -Path README.md,references\*.md,skills\intent-notes\scripts\*.ts -Pattern '(^|[^/])scripts/(init|backfill|verify-note)'`

```
docs: 路径与部署说明对齐新布局（部署=复制一个目录）
```

---

### Task 4: 端到端部署演练

- [ ] **Step 1: 造一个 polyrepo 临时项目并初始化**

```powershell
$proj = Join-Path $env:TEMP 'intent-notes-e2e'
Remove-Item -Recurse -Force $proj -ErrorAction SilentlyContinue
New-Item -ItemType Directory "$proj\cloud","$proj\vue" -Force | Out-Null
git -C "$proj\cloud" init -q; git -C "$proj\vue" init -q
node skills\intent-notes\scripts\init.ts $proj
```

Expected: 项目根出现 `.git`、`.agents/notes/` 4×6 目录、`.agents/intent-notes/config.yml`、`.gitignore` 片段。

- [ ] **Step 2: 按新文档部署（整目录复制，无排除）**

```powershell
$dst = "$proj\.agents\skills\intent-notes"
New-Item -ItemType Directory (Split-Path $dst) -Force | Out-Null
Copy-Item skills\intent-notes $dst -Recurse
Get-ChildItem $dst -Recurse -File | Where-Object Name -like '*.spec.ts' | Measure-Object   # 期望 0
```

- [ ] **Step 3: 三道门禁对空树**

```powershell
node "$dst\scripts\verify-note-tree.ts" $proj
node "$dst\scripts\verify-note-format.ts" $proj
node "$dst\scripts\verify-note-anchors.ts" $proj
```

Expected: 全退 0（门禁 1 打印「未发现任何笔记…init 刚建完的空骨架属正常」）。

- [ ] **Step 4: 记录证据**（各命令退出码 + 门禁 1 的摘要行），并 `Remove-Item -Recurse -Force $proj` 清理。

---

## Self-Review

**Spec coverage**：布局（Task 1）、部署单目录（Task 2 + Task 3 文档）、端到端可用（Task 4）。命名约束（`name` = 父目录名）由 `skills/intent-notes/` 满足，且 `tests/templates.spec.ts:61` 的 frontmatter 断言会在 Task 1 后继续守住 `name: intent-notes`。

**Placeholder scan**：无 TBD/「类似上文」；所有替换都给了旧值与新值。

**Type consistency**：`skillRoot` 在 Task 1 引入、Task 2 使用；`makeJunctionDeploy()` 的返回类型保持 `{ link, base }`，只是 `link` 语义从「scripts 目录」变成「skill 根」——Task 2 Step 2 同步改了三个调用方。

## Execution Handoff

两个执行方式：
1. **Subagent-Driven**：每个 Task 派一个新 subagent，任务间评审。本重构任务间强耦合（搬迁与路径修复必须同一原子改动），拆给多个 subagent 只会增加来回，收益低。
2. **Inline Execution**（推荐）：本会话内按 Task 顺序执行，Task 1 结束时用 97/97 与 `tsc --noEmit` 作为检查点，Task 3 后再次全量验证。
