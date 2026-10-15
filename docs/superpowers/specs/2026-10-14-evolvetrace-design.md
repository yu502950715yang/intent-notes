> 历史文档（写于项目名 EvolveTrace 时期）：其中的目录名、配置文件路径与命令为当时形态，已作废；现行形态以 `README.md` 与 `skills/intent-notes/` 为准。

# EvolveTrace 设计规格：让 AI 在交付项目里留下决策笔记

Status: proposed

## 问题

用 AI 开发时，代码的产出速度超过了人能吸收的速度。业界已给这个现象命名：

- **cognitive debt**（Margaret-Anne Storey，2026-02）：系统结构演进的速度超过团队理解它的速度
- **comprehension debt**（Addy Osmani，2026-03）：代码总量与人类真正理解的部分之间不断扩大的缺口；危险在于它不触发任何现有度量
- **intent debt**（Storey 三层框架）：意图与约束没有被记录

Anthropic 的随机对照实验（52 名工程师）显示：用 AI 完成任务的组，后续理解测验低 17%（50% vs 67%）；伤害主要来自被动委托，而非提问式使用。

本项目作者的具体痛点（原话）：

1. 记不住需求是从什么时间变的
2. 项目的发展方向为什么是这样的
3. 想修改某个功能该从哪里下手

## 现状实测（2026-10-14）

- `D:\work` 下有 70 个项目目录，两种结构并存：
  - **polyrepo**：根目录不是 git 仓库，下挂多个 git 子仓库 —— 7 个
  - **单仓库**：根目录本身就是 git 仓库 —— 5 个
- 以 `demo-project` 为例：一个交付项目 = 5 个 git 子仓库、29 个 `pom.xml`、47 份 `docs/superpowers/` 文档（9 plans + 6 specs + sdd 执行账本）
- **项目根不是 git 仓库** —— 那 47 份文档与项目 `AGENTS.md` 完全没有版本历史
- 项目 `AGENTS.md` 已漂移：声明"包含三个独立 Git 子仓库"，实际 5 个
- 文档化程度极不均衡：cloud 16 个 AGENT.md、vue 11 个、uniapp 0 个
- 已在 10 个项目使用 superpowers 产出 specs / plans / sdd

## 目标

让 AI 在交付项目里持续留下决策笔记（`.agents/notes/`）。使任何新会话——无论是人还是 AI——读完项目 `AGENTS.md` 就能拿到当前生效的全部规矩，并能顺着链接追到每条规矩的"为什么这么定、否决过什么、什么条件下可以重启"。

## 非目标

- 不做跨项目（留给后续）
- 不生成、不改写源文档；`spec` / `plan` 仍由 superpowers 产出
- 不做代码结构图、调用图、语义检索（GitNexus / Serena 的领域）
- 不做团队治理机制（加权审批、CI 矩阵）
- 不要求**人**额外记录

## 四条核心设计判断

1. **记录责任在 AI，不在人。** 依据：DSH 的 `.agents/notes/AGENTS.md` 原文 "Agent Notes are effectively RFCs written by agents"；且 DSH 4 个月 1225 篇（约每天 10 篇），不可能是人写的。
2. **规矩与理由分离。** `AGENTS.md` 放当前生效的短规矩，每条链接到一篇 Note；Note 放长尾的理由与取舍。混在一起会让 `AGENTS.md` 膨胀到没人读。
3. **事实由程序锚定，语义由 AI 合成。** AI 写的每条结论必须挂锚点（commit / 分支 / `file:line` / spec 章节）。锚点是机械校验对象，失效即报错。
4. **机械门禁而非自觉。** 依据：DSH "对 AI 来说，写在散文里的规矩等于没有规矩"。门禁 = 正则 + 闭集 + 非零退出，不需要复杂逻辑。

## 产物：一个 Agent Skill 包（中文单语）

```
EvolveTrace/
├── SKILL.md                    # 主契约：何时写 / 怎么写 / 何时就地改 / 何时归档
├── references/
│   ├── note-format.md          # 头块、正文骨架、笔记树的结构红线
│   ├── classification.md       # 六分类判据与边界
│   ├── when-to-write.md        # 新建 / 就地改 / 归档 / 明确不该写
│   ├── archiving.md            # 取代与归档（含归档笔记的锚点豁免）
│   ├── quality-gate.md         # 写完自检
│   └── bootstrap-existing-project.md   # 存量项目初始化（四阶段）
├── templates/
│   ├── proposed.md
│   ├── implemented.md
│   ├── archived.md
│   └── rejected.md
└── scripts/
    ├── note-tree.ts            # 结构真源：闭集、目录遍历、结构校验（三个门禁都 import）
    ├── note-text.ts            # Markdown 正文提取（围栏感知），门禁 2 与锚点解析共用
    ├── note-anchors.ts         # 解析 `## 涉及仓库` 段 + 实时查 git 校验锚点
    ├── verify-note-tree.ts     # 门禁 1：结构、文件名、深度、相对链接、拒绝 INDEX.md
    ├── verify-note-format.ts   # 门禁 2：头块、状态语法、必备节、Alternatives 必写
    ├── verify-note-anchors.ts  # 门禁 3：跨仓库校验仓库/分支/commit（归档笔记豁免）
    ├── init.ts / init-core.ts  # 存量项目建骨架：探测子仓库、写 config.yml 与 .gitignore
    ├── backfill.ts / backfill-core.ts # 漏写补救：从单个 commit 提取补写上下文
    └── *.spec.ts               # 门禁与工具的 node:test 测试（7 份）
```

非测试脚本 10 份、约 1150 行，另有 7 份 `*.spec.ts` 测试。结构真源 `note-tree.ts` 与门禁 1、2 移植改造自 DSH（`note-text.ts` 的围栏感知解析、门禁 3、`init`、`backfill` 为新写）。主要工作量在把规范按本场景写对。

## 架构

### 项目内布局（以 `demo-project` 为例）

```
demo-project/                     ← 需 git init（umbrella repo）
├── .gitignore                  ← 排除探测到的子仓库
├── AGENTS.md                   ← 项目级规矩，每条链到 Note
├── .agents/
│   ├── notes/
│   │   ├── README.md           ← 规则，AI 与人共用
│   │   ├── proposed/{feature,bug-fix,simplification,architecture,process,testing}/
│   │   ├── implemented/{同 6 类}/
│   │   ├── rejected/{同 6 类}/
│   │   └── archived/{同 6 类}/
│   └── skills/evolvetrace/     ← 可选：项目内一份
├── docs/superpowers/           ← 已有的 47 份文档，纳入版本控制
└── demo-svc_v121_*（5 个）    ← 被 .gitignore 排除，各自独立
```

### 笔记格式

前三行严格固定：

```markdown
# Agent Note: <title>

Status: <status>
```

正文骨架按生命周期区分：

| 生命周期 | 骨架 |
|---|---|
| `proposed/` | `## Problem` → `## Proposal` → …自由节… → `## Alternatives considered` → `## Acceptance criteria` → `## Risks` |
| `implemented/` | `## Problem` → `## Decision`（现在时） → …自由节… → `## Alternatives considered` → `## Consequences` |
| `rejected/` | 冻结的 proposal 形态，结论写在 `Status:` 行 |
| `archived/` | 与 `implemented/` 同骨架；`Status:` 保持 `implemented`，且**第 4 行必须是** `Archived: YYYY-MM-DD`（其余生命周期的第 4 行必须为空） |

`## Alternatives considered` 每篇必写：先写被否方案最强的理由，再解释为什么不用。没有过的选项不要编。

### 何时写、何时不写

**命中以下任一项即非平凡，必须写：** 改了行为、改了架构（源码怎么组织、包怎么连）、改了跨文件契约、改了流程与工具链、改了测试策略、改了落盘 / 网络 / 配置格式。

**明确不该写，直接交代码：** 纯排版格式化、错别字、无歧义重命名；样式调整（不改行为）；不改行为的依赖补丁、版本打标；常规 CRUD、单模块内看 diff 即懂的显式逻辑修复。

原则：**代码与测试说不出来的意图、边界、取舍，就是非平凡。** 判不准时从严；但"过度留痕和完全不记，是同一个错误的两种样子"。

写之前先判这篇要守住什么方向：

- **往前看**：给系统立新规——跨模块契约、状态流转规则、访问边界、运行时不变量
- **往回看**：为看不见的约束做过的妥协——当年放弃了更主流或更直觉的解法
- **做减法**：删代码、砍 API、下线流程的退出条件与迁移边界

这套判定写进 `SKILL.md` 的 `description`，使 AI 在合适时机自动加载本 skill。

### 多仓库适配（本项目相对 DSH 的核心差异）

DSH 是 monorepo，`.agents/notes/` 在一个仓库里天然自洽。本项目是 polyrepo：一个交付项目挂多个 git 子仓库，而项目根跨仓库。差异带来三件事：

1. notes 放**项目根**（不在任何子仓库内），因此项目根需要 git init
2. 每篇笔记必须声明**涉及哪些仓库与分支**
3. `verify-note-anchors.ts` 必须**跨仓库**校验这些声明

笔记中新增的声明栏（行形态与 `templates/implemented.md` 逐字一致；每行一个仓库，两种形态——带分支与 commit，或明确写「不涉及」。多个 commit 写在同一行的 `commits` 之后，只列短哈希）：

```markdown
## 涉及仓库

- `{{仓库名}}` 分支 `{{分支名}}` commits `{{短哈希}}`
- `{{不涉及的仓库名}}` 不涉及
```

该段缺失、段内为空或行格式不对，锚点门禁都会判红（仓库行必须逐字写成上面两种形态之一）；文件是否存在**由人工自检**，门禁不校验。

### 门禁

| 脚本 | 校验内容 |
|---|---|
| `verify-note-tree` | 生命周期与分类闭集、文件名 `yyyy-mm-dd-topic.md`、目录深度、笔记间相对链接、拒绝 `INDEX.md`；notes 根与生命周期根只允许白名单文件（`README.md`/`AGENTS.md`/`CLAUDE.md`）；链接/junction/特殊文件报「无法校验」而非静默跳过（空树仍退 0） |
| `verify-note-format` | 三行头块、`Status` 语法与所在文件夹一致、首节必须是 `## Problem`、必备节齐全、`implemented` 禁止提案用语、`## Alternatives considered` 必写 |
| `verify-note-anchors` | 声明的仓库目录存在、分支存在、commit 存在且在声明分支上（缺 `## 涉及仓库` 段或段内为空即红；引用文件是否仍存在**由人工自检**，本门禁不校验） |

## 存量项目初始化

存量项目（如 `demo-project`：2 年历史、5 个子仓库、47 份已有文档）**不能补齐历史**。原因：很多决策的理由已不可考，硬补只会写出似是而非的推测；DSH 的 1225 篇笔记也全部产生于体系建立之后，没有回溯补写。

原则：**建骨架 + 选择性收割 + 从今天开始记。**

### 阶段 1：建骨架（程序做，零判断）

- 探测项目结构：git 仓库清单、各自分支、文档源位置 → 生成 `.evolvetrace/config.yml`
- 项目根 `git init`（polyrepo 必需）+ 写 `.gitignore`（只排除探测到的子仓库）
- 建立 `.agents/notes/` 四生命周期 × 六分类目录
- 写 `.agents/notes/README.md`
- **skill 目录（`SKILL.md`、`references/`、`templates/`、`scripts/`）不在 `init` 职责内**，需人工整目录复制到 `.agents/skills/evolvetrace/`——只挑部分文件会在运行时 `ERR_MODULE_NOT_FOUND`（见 `references/bootstrap-existing-project.md` 阶段 1）
- 首次提交

### 阶段 2：重建项目 `AGENTS.md`（AI + 人确认）—— 最关键

- 读现有 `AGENTS.md` 与各仓库内的模块 `AGENT.md`
- 提取当前真正生效的规矩：构建命令、代码风格、提交规范、子仓库边界、跨仓库协作规则
- **修正漂移**，并使仓库清单可被机械校验（声明 vs 实际目录）
- 每条规矩挂链接，指向对应笔记；笔记尚未写就时先指向已有的 spec / plan

完成后，新会话读完这一份即取得当前全部规矩。

### 阶段 3：选择性收割历史决策（程序筛 + AI 判断）

**程序先筛候选**：遍历已有的 specs / plans / sdd 与根目录需求文档，挑出含取舍、方案对比、根因分析的；并用「文档声明的文件 → `git log --all` → commit」标记其代码是否仍在。

**AI 再逐份判断**：

| 存量文档类型 | 处置 |
|---|---|
| 架构级决策（包结构、模块边界、跨服务契约） | 高优先收割 |
| 已约定的规范（版本前缀、提交格式、目录约定） | 高优先收割 |
| 根因修复 | 中优先 |
| 功能设计（已实现且稳定） | 选择性，只挑仍可能被推翻的 |
| 一次性排查脚本、临时方案、已被取代的实现 | 不收割 |
| 已被后续决策取代 | 不收割，或改写为 `rejected/` |

判据沿用归档的刻度：**它还会不会指导未来的改动？** 预期产出 10-25 篇，而非全部 47 篇。

### 阶段 4：转入日常

之后所有非平凡改动由 AI 顺手写新笔记。**初始化是一次性的，运行是持续的。**

### 分工

| 角色 | 职责 |
|---|---|
| 程序 | 探测、建骨架、筛候选、查锚点、跑门禁 |
| AI | 重建 `AGENTS.md`、逐份判断存量文档、写笔记、挂锚点 |
| 人 | **只做确认**：AI 抛出收割清单，人划掉不需要的 |

### 分批与规模控制

初始化时 AI 需处理 47 份文档 + 27 个模块 `AGENT.md`，应由程序先筛、分批交付，或用 subagent 并行处理，不交给单个会话硬啃。

`SKILL.md` 的 `description` 除「何时写」的判定外，还需包含**存量项目初始化**这一触发场景，使用户说「给这个项目建知识库」时能加载本 skill。

## 与 superpowers 的边界

**本 skill 不依赖 superpowers。** 目录结构、笔记格式、门禁校验、「何时写」的判定全部自包含。DSH 本身即反例：它有 1225 篇笔记，而完全不使用 superpowers——其机制是 `AGENTS.md` + `.agents/skills/` + agent 自行判定。

superpowers 只提供两条**可选**加速路径：

1. **触发点**：brainstorming 结束时，AI 手上已有「2-3 个方案及取舍」，顺手落成一篇 Note 的边际成本最低
2. **存量收割来源**：已有的 specs / plans 是初始化阶段最优质的收割原料

在**没有** superpowers 的项目里，AI 依据「非平凡改动」判定直接写笔记（由 `SKILL.md` 的 `description` 触发），存量收割的来源退化为 git commit 与代码本身。此时「考虑过但没选的方案」缺记录，笔记质量会略低——但这正是本体系要从装上那天起开始积累的东西。

| | superpowers | `.agents/notes` |
|---|---|---|
| 管什么 | 过程：这次做什么、怎么做 | 决策与现状：为什么选 A、现在这个决定是什么 |
| 生命周期 | 一次性，写完基本不动 | 活的，代码变了就地同步事实（路径、符号、默认值） |
| 重叠点 | brainstorming 要求提 2-3 个方案及取舍 | `## Alternatives considered` |

两者重叠处合并为一次动作：AI 完成 brainstorming 后，顺手把决策落成一篇 Note，两侧都不产生重复正文。**未装 superpowers 时这台并动作消失，但笔记机制本身不受影响。**

## 触发与强制：三层协同

**单靠一个 skill 不足以让 AI 持续写笔记。** skill 是按需加载的：agent 在会话开始时只看到 name + description，自行判断是否加载；它可能认为"这次改动不必"，从而跳过。必须三层叠加：

| 层 | 载体 | 作用 | 时机 |
|---|---|---|---|
| **规矩** | 项目 `AGENTS.md` 里的一条 | 声明"非平凡改动必须留笔记"并链到规则 | **每次会话自动读到** |
| **流程** | `.agents/skills/evolvetrace/SKILL.md` | 何时写、怎么写、何时就地改、何时归档 | agent 判断需要时加载 |
| **强制** | `scripts/verify-note-*.ts` | 格式与锚点不合规即非零退出 | 提交前与 CI |

只有规矩没有流程 → 知道要写但写不对；只有流程没有规矩 → agent 不一定加载 skill；没有强制 → 写了不合规也无人发现，最终腐化（现状：项目根 `AGENTS.md` 已漂移且无人察觉）。

**因此人不需要手动调用 skill**：正常提需求，AI 在非平凡改动时写笔记。养成期可口头兜底（"这次改动记一篇 note"）。

### polyrepo 特有的指针问题

agent 的工作目录常常是**某一个子仓库**，此时读到的是该仓库的 `AGENT.md`（`demo-project` 的 cloud 有 16 个、vue 有 11 个），**读不到项目根的 `AGENTS.md`**。因此初始化时必须往每个子仓库的 `AGENT.md` 写入一条指针：

> 重要改动需在本项目 `.agents/notes/` 留笔记；规则见 `../../AGENTS.md` 与 `../../.agents/notes/README.md`。

DSH 是 monorepo，根 `AGENTS.md` 一处即可（其 `CLAUDE.md` 为符号链接）；本项目是 polyrepo，指针必须逐仓库铺开，否则规则只对"在项目根工作的会话"生效，而对真正干活的子仓库会话失效。

### 漏写与补救

**门禁能校验"写了的话格式对不对"，不能校验"该写却没写"**——后者是语义判断，正则做不到。这是三层机制里唯一的软肋，DSH 同样没有解决。因此需要三层应对：

| 层 | 手段 | 说明 |
|---|---|---|
| 预防 | `AGENTS.md` 的规矩 + 子仓库指针 | 降低漏写率，但不是零 |
| 兜底 | 口头触发（"这次改动记一篇 note"）或显式调用 skill | 最自然，随时可用 |
| **补救** | **`evolvetrace backfill <commit>`** | 事后补写，把"永久丢失"变成"可补" |

`backfill` 与初始化阶段的"历史收割"是**同一能力的不同规模**：

| | 范围 | 输入 |
|---|---|---|
| bootstrap 收割 | 批量（数十份历史文档） | 已有的 specs / plans |
| backfill 补救 | 单次（一个漏写的 commit） | 该 commit 的 diff、涉及文件、分支、版本前缀 |

二者共用同一条已验证链路：`commit → 涉及文件 → 分支 → 版本前缀 → 所属需求`。

**可选加固（暂不实施）**：commit-msg 钩子要求每次提交显式表态——链到一篇 note，或带 `[no-note]` 声明本次为机械改动；两者皆无则拒绝提交。优点是把"无声跳过"变为"当场判断"；缺点是可能被习惯性写成 `[no-note]`。先以"预防 + backfill"运行一段时间，依实际漏写率决定是否加这道门。

## 部署

- **规范与模板**：随项目走，与项目一起版本控制（AI 要读，且与项目内容强相关）
- **门禁脚本**：全局一份（`~/.agents/skills/evolvetrace/scripts/`）或每项目一份，两种皆可

## 明确砍掉的 DSH 机制

| DSH 机制 | 处置 | 原因 |
|---|---|---|
| 英中双语 + `.i18n.yaml` 三文件组 + 配对门禁 | 砍掉 | 中文单语 |
| `archived/` SHA-256 封印 + 三文件配对 | 保留 `archived/` 目录与"冻结不改"规则，**不做 SHA-256 封印** | 个人项目：项目根进 git 后，git 历史已足以证明归档后有没有被改；DSH 的封印是给无 git 的降级场景用的 |
| 加权审批（review-ownership） | 砍掉 | 单人开发 |
| 取代检查（每次新建触发全树审计） | 保留但简化 | 核心是"新笔记必须搜索同主题旧笔记并当场分类" |
| 删除规则（机械性笔记直接删，不是一律归档） | 保留 | 防止语料无限膨胀 |
| 归档判据反对按字数/时长/配额 | 保留 | 用带字数的对照样本校准判断 |

## 验证

**已验证（2026-10-14）**：`plan 的文件集 → git log --all → commit 集合` 这条召回链在 `demo-project` 上跑通——从 plan 声明的 27 个文件出发，自动找到 progress.md 记录的 10 个 commit，**10/10 命中**，且横跨 cloud 与 vue 两个仓库。

**验证中暴露的必须处理项**：该功能的代码在 `v140-视频监控AI分析` 分支上，而仓库当前工作分支是 `v140-课表控制逻辑修改`；`progress.md` 声明的分支基线（cloud=`v140-视频监控AI分析`、vue=`v140`）与现实已经脱节。因此锚点校验必须**实时查 git**，不能信任文档里的声明。

**门禁自身需要测试**：DSH 的做法是为每个脚本配 `*.spec.ts` 并接进 CI；本项目至少要为 `verify-note-anchors` 写测试（跨仓库、分支不存在、commit 不在声明分支上三种情况）。

## 里程碑

1. **M1 规范与模板**：`SKILL.md`、`references/`、`templates/` 中文化并按本场景裁剪
2. **M2 门禁**：移植两个校验脚本，实现 `verify-note-anchors`
3. **M3 试点**：在 `demo-project` 跑通——项目根 git init、AI 写首批笔记、门禁通过、`AGENTS.md` 挂上链接
4. **M4 看板（可选）**：单文件 HTML，聚合笔记时间线与漂移警报

## 依赖与许可

DSH 仓库为 **MIT**（`LICENSE`：Copyright (c) 2026 DeepSeek；`package.json` `"license": "MIT"`），脚本可直接移植并保留版权声明。`write-notes-like-deepseek` 同为 MIT，其 `SKILL.md` 与 `references/` 可作为中文文案基础。
