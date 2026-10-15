> 短注：文中记载的「本机 pwsh / npm / git 无法执行」的环境阻碍现已消除（当前 130 个用例全绿）。

# 非代码工作目录的决策笔记 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让非代码的工作目录（需求 / PRD 文件夹）能用 intent-notes 留决策笔记——零程序改动，由 agent 代劳版本控制。

**Architecture:** 复用现有 git 锚点链路：`init` 在目标目录建 git 仓库，agent 提交产物后写笔记，锚点是 commit，门禁 3 实时校验。只改契约文档（`SKILL.md` / 新增一份 reference / `bootstrap-existing-project.md` / `notes-readme.md` 模板 / `README.md`）与一处测试齐备性清单。

**Tech Stack:** Node ≥ 22.18（原生 TypeScript 类型剥离，无构建步骤）、`node:test`、git、Markdown 契约文档。

**Spec:** `docs/superpowers/specs/2026-10-15-plain-directory-notes-design.md`

## Global Constraints

- 程序代码 `skills/intent-notes/scripts/`：**零改动**；门禁 1 / 2 / 3 行为不变
- 笔记段名保持 `## 涉及仓库`（门禁 3 按字面匹配）；**不引入** `## 涉及范围`、`dirs:`、内容哈希——那是备选方案 B，本次不实施
- 四个笔记模板（`proposed` / `implemented` / `archived` / `rejected`）**不改**
- `SKILL.md` 的 `description` 必须同时满足 `tests/templates.spec.ts` 的 6 条断言（见 Task 1）
- 新 reference 必须纳入 `tests/templates.spec.ts` 的齐备性清单（skill 是整目录复制部署，无排除清单）
- 测试命令用 glob 形式（Node 22 下 `node --test <目录>` 会报 `Cannot find module`）
- **环境阻碍**：本机 `pwsh` 启动即失败（exit code 3221225794 / `STATUS_DLL_INIT_FAILED`），`npm` 与 `git` 命令当前均无法执行。凡"运行验证"的步骤都标了「环境修复后执行」；环境未修好时，改为按步骤里给出的**逐条核对清单**人工确认，并在报告里注明未跑测试

---

### Task 1: `SKILL.md` 契约扩展

**Files:**
- Modify: `skills/intent-notes/SKILL.md`（第 3 行 frontmatter；第一节前插入新节；硬规则 6；第五节列表）

**Interfaces:**
- Consumes: 无
- Produces:
  - 新 reference 路径 `references/plain-directory-mode.md`（Task 2 创建，本任务的 description 与第五节都引用它）
  - 「第 0 节」确定的会话开始动作，三个命令原样：`git status --short`、`git log --oneline -5`、`node "<skill-dir>/scripts/verify-note-anchors.ts" "<工作目录>"`

- [ ] **Step 1: 替换 description**

把 `skills/intent-notes/SKILL.md` 第 3 行整行替换为（**必须是单行**，不得换行；`description:` 后的值会被 `tests/templates.spec.ts` 用 `/description:\s*(.+(?:\n\s+.+)*)/` 提取）：

```markdown
description: 在交付项目或工作目录里留下并维护决策笔记（Agent Notes）。当一次改动改了行为、架构、跨文件契约、流程与工具链、测试策略、需求方向或范围，或落盘/网络/配置格式时，就在当前项目的 .agents/notes/ 下新建或更新一篇笔记；也用于在已有项目里初始化这套笔记体系（用户说「给这个项目建决策笔记」或「给这个项目建笔记体系」时）。需求 / 文档类工作目录即使不是 git 仓库也适用（由 agent 代劳版本控制，见 references/plain-directory-mode.md）。纯机械改动（格式化、无歧义重命名、不改行为的样式或依赖补丁、照已有契约的常规 CRUD）不写。
```

- [ ] **Step 2: 逐条核对 6 条断言**

`npm test` 不可用时，用这 6 条人工核对（每条都必须成立）：

1. 文件仍以 `---\n` 开头，且含 `name: intent-notes`
2. `description:` 的值长度 > 40
3. 值中含 `改了行为`、`架构`、`跨文件契约`、`流程与工具链`、`测试策略`
4. 值中含 `初始化`
5. 值中含精确字符串 `用户说「给这个项目建决策笔记」`
6. 值中**不出现** `知识库`

- [ ] **Step 3: 插入「零、会话开始先查改动」**

在 `skills/intent-notes/SKILL.md` 的 `## 一、先判要不要写` 这一行**之前**插入：

```markdown
## 零、会话开始先查改动

**工作目录里存在 `.agents/notes/` 时，会话开始先做三件事**：

1. `git status --short` —— 有未提交改动，说明产物被改过，必须走第一节判定
2. `git log --oneline -5` —— 有 agent 未记录的新提交，同样走第一节判定
3. `node "<skill-dir>/scripts/verify-note-anchors.ts" "<工作目录>"` —— 红了先按报错处理，再谈本次任务

门禁不会自己启动：没有这一步，「该写却没写」没有任何机制能发现。

```

- [ ] **Step 4: 硬规则 6 补一句**

找到硬规则 6 那一行（以 `6. 代码与笔记在**同一次改动**里落地` 开头），在其末尾追加一句，改后为：

```markdown
6. 代码与笔记在**同一次改动**里落地（不是"同一次提交"）：笔记在项目根、代码在子仓库时，按「子仓库先提交代码 → 容器仓库提交笔记」成批提交——笔记的 commit 锚点只能指向**已存在**的 commit。别让笔记漂到下一个需求。同一仓库内（含非代码工作目录）同理：**先提交产物 → 再写笔记 → 最后提交笔记**。
```

- [ ] **Step 5: 第五节列表加一行**

把第五节里这两行：

```markdown
- 存量项目初始化：`references/bootstrap-existing-project.md`
- **笔记与 spec 的分工**：接口 / 格式 / 流程的**契约**归项目文档（`docs/`、下游改造说明等），**理由与取舍**归笔记；两者互链。写契约不等于写笔记，写笔记也不代替契约。
```

改为：

```markdown
- 存量项目初始化：`references/bootstrap-existing-project.md`
- 非代码工作目录（需求 / PRD 文件夹，由 agent 代劳版本控制）：`references/plain-directory-mode.md`
- **笔记与 spec 的分工**：接口 / 格式 / 流程的**契约**归项目文档（`docs/`、下游改造说明等），**理由与取舍**归笔记；两者互链。写契约不等于写笔记，写笔记也不代替契约。
```

- [ ] **Step 6: 运行测试验证**

Run: `npm test`
Expected: 全绿（尤其 `templates.spec.ts` 的两条 description 断言）

**环境修复后执行。** 未跑测试时必须改为 Step 2 的人工核对，并在完成报告里注明「测试未运行」。

- [ ] **Step 7: Commit**

```bash
git add skills/intent-notes/SKILL.md
git commit -m "docs: 触发与流程覆盖非代码工作目录"
```

### Task 2: 新增 `references/plain-directory-mode.md` 并纳入齐备性断言

**Files:**
- Create: `skills/intent-notes/references/plain-directory-mode.md`
- Modify: `tests/templates.spec.ts:78-92`（测试名 + 齐备性清单）

**Interfaces:**
- Consumes: Task 1 在 `SKILL.md` 的 description 与第五节里引用的路径字符串 `references/plain-directory-mode.md`（必须与创建路径逐字一致）
- Produces: 无（本任务不被其他任务消费）

- [ ] **Step 1: 创建 reference 文件**

创建 `skills/intent-notes/references/plain-directory-mode.md`，内容为：

````markdown
# 非代码工作目录

适用：需求 / PRD / 资料这类**非代码**的工作目录。使用者往往不使用 git，所以由 **agent 代劳版本控制**：agent 建仓库、提交产物、写笔记；使用者只说需求。

本模式**不改任何程序**：它复用现有的 git 锚点链路（`init` 建仓库、笔记锚定 commit、门禁 3 实时校验）。锚点比自研快照更强——保留完整历史，`backfill` 也可用。

## 前提（不满足就不要开始）

| 前提 | 检查 |
|---|---|
| Node ≥ 22.18 | `node --version` |
| git 可用 | `git --version` |
| 提交身份已配 | `git config user.email`、`git config user.name` |
| 目录在**本地磁盘** | 同步盘（OneDrive、企业网盘）的同步会损坏 `.git`，**不要**在这种目录上使用 |
| 目录**不在**任何 git 仓库内 | `git -C "<工作目录>" rev-parse --show-toplevel` 报 `not a git repository` 才是本形态 |

**目录已经在上层仓库里**（常见如代码仓库的 `docs/prd/`）时：直接用那个仓库走常规形态，**不要再嵌套 `init`**——嵌套的 `.git` 会被上层仓库当成 gitlink，两边的 `git status` 互相看不见对方的改动。

**git 不可用时：不要下载或安装任何软件。** 停止初始化，如实报告原始错误，让使用者决定（自己安装 git，或改走备选方案）。本 skill 的职责是记录决策，不是管理系统依赖。

**提交身份缺失时，在该目录内配，不要改全局配置**（免得用别人的名字污染全机提交）：

```bash
git -C "<工作目录>" config user.email "<你的邮箱>"
git -C "<工作目录>" config user.name "<你的名字>"
```

先自检、再 `init`：这样失败信息是人话，而不是一行裸命令错误。

## 初始化

本节是 `SKILL.md` 第零节 git 命令的**前置动作**：工作目录还没有 `.git` 时，先跑 `init`（它会 `git init`）；**在那之前**，第零节的 `git status --short` 与 `git log --oneline -5` 在该目录只会报 `fatal: not a git repository`，那是预期结果、不是故障。

```bash
node "<skill-dir>/scripts/init.ts" "<工作目录>"
git -C "<工作目录>" branch --show-current     # 记下分支名，笔记要照抄（可能是 master）
```

`init` 会：`git init`（目标无 `.git` 时）→ 建 `.agents/notes/` 四生命周期 × 六分类 → 写 `.agents/intent-notes/config.yml`（`repos: - path: .`）与 `.agents/notes/README.md` → 追加 `.gitignore` 片段。

**必补 `.gitignore`**（Office 锁文件不排除，每次打开文档都会产生假改动）：

```gitignore
~$*
.~lock.*
*.tmp
```

**先写工作目录自己的 `AGENTS.md`**：本形态没有子仓库指针，只需一条「重要改动需在本项目 `.agents/notes/` 留笔记」（见 `references/bootstrap-existing-project.md` 阶段 2）。

**然后做首次提交，把上面这些都纳入**——否则 `.agents/` 与 `.gitignore` 会永久停在 `git status` 里，第零节「有未提交改动」的判据每个会话都会被它们误触发一次（`.gitignore` 要先补好、`AGENTS.md` 要先写出来，否则首次提交要么漏掉规则、要么因 `pathspec did not match` 整条失败）：

```bash
git -C "<工作目录>" add .agents .gitignore AGENTS.md
git -C "<工作目录>" commit -m "chore: 建立 Agent Notes 骨架"
```

## 每次改动的流程

1. 改产物（PRD、需求文档）
2. `git status --short` 看改动范围
3. 按 `SKILL.md` 第一节判**要不要写笔记**
4. `git add` **指定文件**（不要 `git add -A`，免得把密码、原始素材、临时文件带进去）
5. `git commit`：中文，一句话说清改了什么
6. 写笔记（若需要）：在 `## 涉及仓库` 段写锚点行，格式真源是 `references/note-format.md` 的「涉及仓库」一节。这里只说两点最容易踩的：

   - 锚点行必须**顶格写、不要缩进**：门禁按行首匹配，缩进会被判「无法解析」
   - 三个占位换真值：仓库名用工作目录名（即 `config.yml` 里 `path: .` 那条的 `name`），分支名用 `git branch --show-current` 的结果，短哈希用上一步 commit 的短哈希

   以 `templates/implemented.md` 起步时，模板里 ``- `{{不涉及的仓库名}}` 不涉及`` 那一行**若没有对应仓库就整行删掉**——留着会被门禁 3 报「仓库 `占位内容` 未在项目声明中」，而本形态的首篇笔记没有第二个仓库，必然命中。
7. 提交笔记，**产物先提交、笔记后提交**（笔记的 commit 锚点只能指向已存在的 commit）：

   ```bash
   git add ".agents/notes/{lifecycle}/{class}/<笔记文件名>"
   git commit -m "notes: <一句话说清这篇笔记记的是什么>"
   ```

## 三个坑

- **第一篇笔记之前必须先有一次提交**：空仓库还没有分支 ref，此时写笔记会让门禁 3 报「分支不存在」
- **commit 前先看 `git status`**：由 agent 代劳提交，意味着可能把不该进仓库的东西提交进去
- **中文文件名会被转义**：默认 `core.quotepath=true` 下 `git status --short` 把中文名显示成 `"PRD-\347\231\273..."`。这只影响**显示**：未提交改动的信号完好，也能从 `git diff --stat` 看出是哪个文件；想让名字可读就 `git config core.quotepath false`

## 代价

Word / Excel / PPT 是二进制，每次改动全量入库，仓库会膨胀。PRD 这种量级可接受，但要知情。

## 不做的

只在本地做最小提交：不推远端、不开分支工作流、不配置 CI。
````

- [ ] **Step 2: 同步测试齐备性清单**

`tests/templates.spec.ts` 里那条测试改为（两处改动：测试名"六份"→"七份"，清单新增一行）：

```ts
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
```

- [ ] **Step 3: 运行测试验证**

Run: `npm test`
Expected: 全绿（新增断言检查新文件存在，必须已创建；若文件名拼错则红）

**环境修复后执行。**

- [ ] **Step 4: Commit**

```bash
git add skills/intent-notes/references/plain-directory-mode.md tests/templates.spec.ts
git commit -m "docs: 新增非代码工作目录的操作说明"
```

### Task 3: `bootstrap-existing-project.md` 加一节 + `notes-readme.md` 模板补句

**Files:**
- Modify: `skills/intent-notes/references/bootstrap-existing-project.md`（文件末尾追加一节）
- Modify: `skills/intent-notes/templates/notes-readme.md`（第 5 行后补一句）

**Interfaces:**
- Consumes: Task 2 创建的 `references/plain-directory-mode.md`
- Produces: 无

- [ ] **Step 1: `bootstrap-existing-project.md` 追加一节**

在文件末尾（`## 分批` 那一段之后）追加：

```markdown
## 非代码工作目录（另一种形态）

目标不是代码仓库，而是需求 / PRD / 资料文件夹时，流程按 `references/plain-directory-mode.md` 走。与上面四个阶段的差别：

- **阶段 1**：同一个 `init`，但由 agent 代劳版本控制（`init` 会 `git init`）；目录必须在**本地磁盘**
- **阶段 2**：**不需要**给子仓库铺指针（没有子仓库），只需写工作目录自己的 `AGENTS.md`
- **阶段 3**：**不适用**——没有 commit 历史可收割，从今天开始记
- **前提**：那台机器有 git。没有时**不要自行安装**，报告后由人决定
```

- [ ] **Step 2: `notes-readme.md` 模板补句**

把该文件里的：

```markdown
规则（何时写、怎么写、何时归档）见本项目的 `intent-notes` skill——通常位于 `.agents/skills/intent-notes/`。
```

改为：

```markdown
规则（何时写、怎么写、何时归档）见本项目的 `intent-notes` skill——通常位于 `.agents/skills/intent-notes/`。

本目录可能不是代码仓库：需求 / 资料类工作目录由 agent 代劳版本控制，见该 skill 的 `references/plain-directory-mode.md`。
```

- [ ] **Step 3: 运行测试验证**

Run: `npm test`
Expected: 全绿（`init.spec.ts` 会用到 `templates/notes-readme.md`，内容改动不得破坏它的存在性与 init 落盘断言）

**环境修复后执行。**

- [ ] **Step 4: Commit**

```bash
git add skills/intent-notes/references/bootstrap-existing-project.md skills/intent-notes/templates/notes-readme.md
git commit -m "docs: 存量初始化与非代码工作目录的衔接"
```

### Task 4: `README.md` 更新

**Files:**
- Modify: `README.md`（开头说明、本仓库结构、已知限制）

**Interfaces:**
- Consumes: Task 2 创建的 `references/plain-directory-mode.md`
- Produces: 无

- [ ] **Step 1: 开头补适用说明**

把这一段：

```markdown
笔记落在项目仓库的 `.agents/notes/` 下，跟着代码一起进版本控制。每条结论都挂**真实的**仓库 / 分支 / commit 锚点，由程序实时查 git 校验，不是让 AI 自由发挥。
```

改为：

```markdown
笔记落在项目仓库的 `.agents/notes/` 下，跟着代码一起进版本控制。每条结论都挂**真实的**仓库 / 分支 / commit 锚点，由程序实时查 git 校验，不是让 AI 自由发挥。

也适用于**不是代码仓库的工作目录**（需求 / PRD 文件夹）：由 agent 代劳版本控制，使用者不需要懂 git，见 `skills/intent-notes/references/plain-directory-mode.md`。
```

- [ ] **Step 2: 结构图的 references 数量**

把：

```markdown
│   ├── references/  (6)     # 格式细则、六分类判据、何时写、归档、自检、存量初始化
```

改为：

```markdown
│   ├── references/  (7)     # 格式细则、六分类判据、何时写、归档、自检、存量初始化、非代码工作目录
```

- [ ] **Step 3: 已知限制加一条**

在「已知限制」列表的**最后一条**（`ts(2591)` 那一条）之后追加：

```markdown
- **非代码工作目录要求那台机器有 git**，且目录在**本地磁盘**（同步盘会损坏 `.git`）；git 缺失时脚本 fail-closed 报错，**不会**自行安装
```

- [ ] **Step 4: 核对**

人工核对三条：`references/` 计数已从 6 改为 7；新增段落里引用的路径 `skills/intent-notes/references/plain-directory-mode.md` 真实存在；已知限制新增条目未与既有条目重复。

- [ ] **Step 5: Commit**

```bash
git add README.md
git commit -m "docs: README 覆盖非代码工作目录形态"
```

### Task 5: 端到端验证（真实需求文件夹）

**Files:**
- 不改仓库文件；全部动作发生在**临时目录**（本地磁盘）

**Interfaces:**
- Consumes: Task 1-4 的全部契约改动
- Produces: 验证结论（通过 / 缺口清单）

- [ ] **Step 1: 造一个模拟需求目录并初始化**

```bash
mkdir "$env:TEMP\prd-demo"        # 必须是本地磁盘，不要用同步盘
node "skills/intent-notes/scripts/init.ts" "$env:TEMP\prd-demo"
```

Expected: 打印「项目根将 git init」；落盘 `.git/`、`.agents/notes/{proposed,implemented,rejected,archived}/{feature,bug-fix,simplification,architecture,process,testing}/`、`.agents/intent-notes/config.yml`（含 `repos: - path: .`）、`.agents/notes/README.md`

**环境修复后执行**（本步依赖 git 与 pwsh）。

- [ ] **Step 2: 造产物并提交**

```bash
cd "$env:TEMP\prd-demo"
git branch --show-current                      # 记下分支名，下一步的笔记要照抄
git config user.email "demo@example.com"       # 临时目录里避免污染全局配置
git config user.name "demo"
Set-Content -Path "PRD-登录改版.md" -Value "# 登录改版 V1`n`n手机号 + 验证码登录。"
git add "PRD-登录改版.md"
git commit -m "docs: 登录改版需求 V1"
git log -1 --format=%h                          # 记下短哈希
```

- [ ] **Step 3: 写第一篇笔记并跑三门禁**

用 `skills/intent-notes/templates/implemented.md` 填一篇，放在 `implemented/feature/2026-10-15-login-revamp-v1.md`。**删掉模板里的 ``- `{{不涉及的仓库名}}` 不涉及`` 那一行**（留着它会被门禁 3 判红：`占位内容` 不在项目声明中），`## 涉及仓库` 只留一行：

```markdown
- `prd-demo` 分支 `<Step 2 的分支名>` commits `<Step 2 的短哈希>`
```

再跑：

```bash
node "skills/intent-notes/scripts/verify-note-tree.ts"   "$env:TEMP\prd-demo/.agents/notes"
node "skills/intent-notes/scripts/verify-note-format.ts" "$env:TEMP\prd-demo/.agents/notes"
node "skills/intent-notes/scripts/verify-note-anchors.ts" "$env:TEMP\prd-demo"
```

Expected: 三条都 exit 0；门禁 3 打印「锚点全部有效」

- [ ] **Step 4: 验证「改动可被发现」这一环**

```bash
cd "$env:TEMP\prd-demo"
Set-Content -Path "PRD-登录改版.md" -Value "# 登录改版 V2`n`n改为扫码登录。"
git status --short
```

Expected（实测输出，三部分都要在）:

```
 M "PRD-\347\231\273\345\275\225\346\224\271\347\211\210.md"
?? .agents/
?? .gitignore
```

- ` M "PRD-\347\231\273..."` 就是「第 0 节」依赖的信号：agent 在会话开始时据此发现产物被改过，进而判定要不要留笔记。中文名被转义只是默认 `core.quotepath=true` 的**显示**效果，信号完好。**这一环没有任何门禁保护，必须实测。**
- `?? .agents/` 与 `?? .gitignore` 是 `init` 的产物：**它们必须已经在首次提交里入库**（见 `plain-directory-mode.md` 的「初始化」节），否则会永久停在这里，让第 0 节「有未提交改动 → 必须走第一节判定」每个会话都被误触发一次。验证时看到这两行常驻即是缺口，不是噪声。

- [ ] **Step 5: 本仓库回归**

```bash
npm test
npm run typecheck
```

Expected: 101 用例全绿；`tsc --noEmit` 无错。

**环境修复后执行。**

- [ ] **Step 6: 报告**

向用户报告：三门禁结果、V1/V2 触发链路是否成立、回归是否全绿；未跑到的步骤列出原因（`pwsh` 不可用）。临时目录可删除。
