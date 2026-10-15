# Intent Notes

让 AI 在你自己的项目里留下**决策笔记**——记的不是「改了什么」（git 已经记了），而是**「为什么这么改、当时放弃了什么」**。

笔记落在项目仓库的 `.agents/notes/` 下，跟着代码一起进版本控制。每条结论都挂**真实的**仓库 / 分支 / commit 锚点，由程序实时查 git 校验，不是让 AI 自由发挥。

也适用于**不是代码仓库的工作目录**（需求 / PRD 文件夹）：由 agent 代劳版本控制，使用者不需要懂 git，见 `skills/intent-notes/references/plain-directory-mode.md`。

一个自包含的 Agent Skill 包：Node ≥ 22.18，运行时零依赖。

## 它解决什么

用 AI 开发时，代码的产出速度超过人能吸收的速度。需求从哪一刻开始变的、方向为什么成了现在这样、想改某个功能该从哪下手——答案散在聊天记录、commit message 和你的记忆里，**AI 下一次开新会话就全丢了**。

Intent Notes 把这些答案变成仓库里的一等公民：**理由与取舍**留在 `.agents/notes/`，短规矩留在 `AGENTS.md` 并逐条链到笔记。新会话读完 `AGENTS.md` 就拿到当前全部规矩，再顺着链接追到每条规矩的「为什么定、否决过什么、什么条件下可以重启」。

不做的事：不画代码结构图与调用图，不做语义检索；不生成也不改写 spec / plan；不跨项目汇总。

## 快速开始

这一段全是在 **agent 里说一句话、然后确认**，人不用自己敲脚本——脚本是 agent 的活（它到底跑了什么，见下文「命令速查」）。

### 第一步：让 agent 把 skill 放进扫描根（一次性）

DSH 的项目级 skill 扫描根是 `<项目根>/.agents/skills/`；换别的 harness 就放进它自己的扫描根，想在所有项目里都能用就放用户级——**该放哪由 harness 决定，不归本 skill 规定**，skill 内不假设自己的位置，装在哪都照常工作。

对 agent 说：

> 把 `<本仓库>\skills\intent-notes\` 整目录复制到本项目的 `.agents\skills\` 下，不要挑文件。

必须是**整目录**：`scripts/` 里的模块互相 import，手挑几个文件会在运行时 `ERR_MODULE_NOT_FOUND`。放好后**开一个新会话**，agent 的 skill 目录里才会出现它。

### 第二步：一句话让它开始记笔记

对 agent 说：

> 给这个项目建决策笔记。

「给这个项目建决策笔记」与口语一点的「给这个项目建笔记体系」都写在 `SKILL.md` 的 description 里，agent 据此加载这个 skill，并按 `references/bootstrap-existing-project.md` 走完四个阶段。

**它不是知识库。** 建的就是 `.agents/notes/` 那棵**决策笔记**树：没有索引（禁 `INDEX.md`）、不做语义检索、也不补齐历史——只从今天开始，把「为什么这么改、当时放弃了什么」留在仓库里。你只在下面几个确认点上表态：

| agent 会做的事 | 你要确认的 |
|---|---|
| 先干跑 `init`，把计划列出来：探测到哪几个子仓库、要不要 `git init`、会写哪些文件 | 项目路径与子仓库清单没探错 |
| 建骨架：`.agents/notes/` 的四生命周期 × 六分类目录、`.agents/intent-notes/config.yml`、`.agents/notes/README.md`、`.gitignore` 片段 | 不用动手。已存在的 `config.yml` 与 `notes/README.md` **跳过不覆盖**，人工补过的内容不会被模板冲掉 |
| 重建项目 `AGENTS.md`：读现有 `AGENTS.md` 与各仓库的 `AGENT.md`，提取**当前真正生效**的规矩，把漂移的仓库清单与磁盘对齐，每条挂链接 | **最关键的一步**——核对它列出的规矩确实是当前生效的 |
| 给每个子仓库的 `AGENT.md` 追加一行指针 | 不用管。polyrepo 里 agent 常在子仓库里干活，那里读不到项目根的 `AGENTS.md`，所以指针必须逐仓库铺开 |
| 抛出一份历史文档收割清单（AI 按 `sources:` 列出的目录遍历筛选），逐份说明收还是不收 | **划掉不需要的**。预期产出远少于文档总数 |
| 跑三道门禁并报告结果 | 空骨架时门禁 1 打印「未发现任何笔记，请确认根目录正确…」并**正常退 0**——0 篇不是违规 |
| 请你确认首次提交 | 说「提交」就行 |

建完之后就转入日常运行。

## 日常怎么用

### 人：正常提需求就行

**不需要手动调用这个 skill。** 改动命中下一节那份清单时 AI 会顺手写一篇笔记；你要做的事只有确认和兜底：

| 你想做的 | 怎么做 |
|---|---|
| 确认它写了 | 看 `.agents/notes/`，或直接搜关键词（找笔记靠搜索与链接，没有索引文件） |
| 它漏写了 | 口头兜底「这次改动记一篇 note」，或让它跑 `backfill`（见下） |
| 验收一篇笔记 | 看 `skills/intent-notes/references/quality-gate.md` 的五项自检；AI 报告缺口与亮点即可 |
| 遇到契约问题 | **契约（接口 / 格式 / 流程）写进项目 `docs/`，理由与取舍写进笔记**，两者互链——写契约不等于写笔记 |

**提交顺序**：代码在子仓库、笔记在项目根时，按「**子仓库先提交代码 → 容器仓库提交笔记**」。笔记的 commit 锚点只能指向**已存在**的 commit，所以不是「同一次提交」而是「同一次改动」。

### AI：命中清单才写

- 会话开始时 agent 只看到 skill 的 name + description，命中「何时写」才会加载
- **必须写**：改了行为 / 架构 / 跨文件契约 / 流程与工具链 / 测试策略 / 落盘、网络、配置格式
- **看着像机械、实则定了新契约**的必须写：新建此前不存在的类型、字段集、接口形状，或引入新依赖。判据是**这次改动有没有为别人定下新的「必须这样写」**
- **禁止写**：纯排版格式化、错别字、无歧义重命名、不改行为的样式或依赖补丁、版本打标、**照已有契约**的常规 CRUD
- 判不准从严；但记住：**过度留痕和完全不记，是同一个错误的两种样子**

### 一篇笔记长什么样

`.agents/notes/implemented/architecture/2026-09-07-order-status-single-source.md`（示例，仓库名与锚点按实际替换）：

```markdown
# Agent Note: order-status-single-source

Status: implemented

## Problem

订单状态同时由 `cloud` 的 `OrderService` 与 `vue` 的本地缓存维护，两边判据不同，
同一订单在两个页面显示不同状态，用户投诉后才被发现。

## Decision

`cloud` 为唯一真源，`GET /order/{id}` 返回 `status` 与 `statusRev`；`vue` 只渲染，
不再本地推进状态，轮询间隔固定 30s。

## 涉及仓库

- `cloud` 分支 `v140-order-sync` commits `36a846d`
- `vue` 不涉及

## Alternatives considered

**两边都推进、用时间戳取新。** 改动最小，不引入新接口。但两端时钟不可信，
且「谁更新」的分歧会随字段增加而复现，故不用。

**引入 MQ 推送状态变更。** 实时性最好。但当前无 MQ 基建，为单一字段引入消息
中间件不划算，故不用。

## Consequences

**收益：** 状态口径只剩一处，新增状态只需改 `cloud`。
**代价：** `vue` 端最坏 30s 延迟，弱网下更久；轮询带来恒定请求量。
```

**机器标记一律照抄、不要翻译**：`# Agent Note: `、`Status: `、`Archived: `、`## Problem`、`## Proposal`、`## Decision`、`## Alternatives considered`、`## Acceptance criteria`、`## Risks`、`## Consequences` 保持英文，`## 涉及仓库` 保持中文。门禁按字面匹配——把 `## Problem` 译成 `## 问题` 会直接判红。

## 笔记体系速查

```
.agents/notes/{lifecycle}/{class}/yyyy-mm-dd-topic-title.md
```

| 维度 | 取值 |
|---|---|
| 生命周期 | 三对状态转换：`proposed`（待评审）→ `implemented`（已交付，与代码同步）、`proposed` → `rejected`（被否决）、`implemented` → `archived`（冻结的历史） |
| 分类（闭集，不许自造） | `feature`、`bug-fix`、`simplification`、`architecture`、`process`、`testing` |
| 文件名 | 日期是主题**首次提出日**；`topic-title` 是唯一的自由位：英文小写、连字符分词、2–7 词，写决策或机制名（`capability-seams`），不写动作与整句 |

几条最容易踩的规则：

- **目录即状态**：`Status:` 必须与所在目录一致。唯一例外是 `archived/`——它保持 `Status: implemented`，并在第 4 行写 `Archived: YYYY-MM-DD`
- **`## Alternatives considered` 必写**：每个真考虑过的备选，先写它最强的理由，再写为什么不用；**没有过的选项不要编**（存量收割确实无记录时写 `<!-- alternatives: not-recorded -->`，与本节头不能同时出现）
- **`## 涉及仓库` 缺失直接判红**：没有涉及仓库也要按 `` - `仓库名` 不涉及 `` 的形态写一行（仓库名照抄 `config.yml`），不是省略本节
- **一条笔记永远不被改写成另一个决定**：决定或理由翻转 → 新开一篇并互链
- **禁止 `INDEX.md`**：集中式索引会与笔记树同时腐化；notes 根下只放 `README.md` / `AGENTS.md` / `CLAUDE.md`，笔记必须落在 `{class}/` 里
- **归档不是改状态而是冻结**：归档后不再编辑、翻译、移动，且整篇豁免锚点校验

判据真源是 `skills/intent-notes/`（`SKILL.md` + `references/`，尤其 `note-format.md`、`classification.md`、`when-to-write.md`、`archiving.md`）。**本 README 只是导览，可能滞后于 skill**——冲突时以 `references/` 为准。

## 三道门禁

| 门禁 | 脚本 | 接的参数 | 守什么 |
|---|---|---|---|
| 1 结构 | `verify-note-tree.ts` | **notes 根**（省略取 `<cwd>/.agents/notes`） | 生命周期与分类闭集、目录深度、文件名形态、禁 `INDEX.md`、笔记间相对链接断链；notes 根与生命周期根**只拒绝其他 `.md`**（白名单外的 `.md` 判红），非 `.md` 文件目前静默通过；符号链接 / junction / 特殊文件报「无法校验（符号链接/junction/特殊文件）」而非静默跳过；空树仍退 0 |
| 2 格式 | `verify-note-format.ts` | **notes 根** | 头三行、`Status` 与目录一致、`## Problem` 打头、必备节齐全、`implemented` / `archived` 禁提案用语、`Alternatives` 必写 |
| 3 锚点 | `verify-note-anchors.ts` | **项目根**（省略取 `cwd`） | 仓库 / 分支 / commit **实时查 git**：分支不存在、commit 不在声明的分支上、声明的路径不是独立仓库根，都报错；`archived/` 整篇豁免 |

三条都是 **fail-closed**：读不到、查不到一律报错，绝不静默放绿。

**门禁 1 / 2 接 notes 根，门禁 3 接项目根——参数语义不同是这里最容易踩的坑。** 最不会错的用法是 `cd` 到项目根后不带参数。

**什么时候跑**：每次会话开始跑门禁 3（`SKILL.md` 第零节）；每次写完笔记跑门禁 1、2——门禁 3 只管锚点，结构与格式错误没有别的机制能发现。日常动作已写进 `skills/intent-notes/SKILL.md` 第六节与 `references/quality-gate.md` 第 0 步。

## 命令速查

以下命令**由 agent 执行，人不需要敲**；列在这里是为了审查它到底跑了什么、排错，或在没有 agent 的环境里手工跑。`<skill>` = `<项目根>/.agents/skills/intent-notes`（按你 harness 实际的扫描根替换），都在项目根执行：

```powershell
node <skill>/scripts/init.ts <项目根> [--dry-run]      # 建骨架（存量项目初始化阶段 1）
node <skill>/scripts/verify-note-tree.ts    [notes 根]  # 门禁 1：结构
node <skill>/scripts/verify-note-format.ts  [notes 根]  # 门禁 2：格式
node <skill>/scripts/verify-note-anchors.ts [项目根]    # 门禁 3：锚点
node <skill>/scripts/backfill.ts <commit> [项目根]      # 漏写补救
```

`backfill` **只读**，不写任何文件：它从那一个 commit 的改动文件清单（`git show --name-only`，不含 diff 内容）、分支、版本前缀里提取上下文，往 stdout 输出一段 markdown，交给 AI 据此补出一篇符合格式的笔记。它与初始化阶段的「历史收割」是同一条链路（`commit → 涉及文件 → 分支 → 版本前缀 → 所属需求`）的两种规模。

## 存量项目初始化

存量项目**不补齐历史**——很多决策的理由已不可考，硬补只会产出似是而非的推测。原则：**建骨架 + 选择性收割 + 从今天开始记。**

| 阶段 | 谁做 | 做什么 |
|---|---|---|
| 1 建骨架 | 程序 | `init`：探测、建目录、写 config 与 notes/README（即上文快速开始的第一步、第二步） |
| 2 重建 `AGENTS.md` | AI + 人确认 | 提取当前生效的规矩、修正漂移、每条挂链接（**最关键**） |
| 3 选择性收割 | AI 遍历筛 + AI 判断 | 从既有 specs / plans / sdd 里挑出含取舍与根因分析的写成笔记。判据是**它还会不会指导未来的改动**，预期产出远少于文档总数 |
| 4 转入日常 | AI | 之后所有命中清单的改动顺手写笔记。**初始化是一次性的，运行是持续的** |

阶段 2 还有一件 polyrepo 必需的收尾：agent 在**每个子仓库**的 `AGENT.md` 追加一行指针——否则规矩只对「在项目根工作的会话」生效，而对真正干活的子仓库会话失效：

> 重要改动需在本项目 `.agents/notes/` 留笔记；规则见 `../../AGENTS.md` 与 `../../.agents/notes/README.md`。

分工：**程序**探测、建骨架、查锚点、跑门禁；**AI** 重建 `AGENTS.md`、判断存量文档、写笔记、铺指针；**人只做确认**——AI 抛出收割清单，人划掉不需要的。

## 本仓库结构

```
intent-notes/
├── skills/intent-notes/     ← 唯一的部署产物：整目录复制走
│   ├── SKILL.md             # 主契约：何时写 / 怎么写 / 何时归档
│   ├── references/  (7)     # 格式细则、六分类判据、何时写、归档、自检、存量初始化、非代码工作目录
│   ├── templates/   (5)     # 四种生命周期的填空模板 + notes/README.md 模板
│   └── scripts/     (10)    # 三道门禁 + init + backfill + 5 个纯模块
├── tests/                   # 9 个 spec（130 用例）
├── docs/superpowers/        # 历史与当次 spec / plan（早期几份写于旧名 EvolveTrace 时，保留不改）
├── .superpowers/            # 开发账本（gitignored）
└── package.json  tsconfig.json  README.md  .gitignore  .gitattributes
```

纯模块（无副作用、可安全 import）：`note-tree.ts`（结构真源，三个门禁都 import）、`note-text.ts`（围栏感知的 Markdown 正文提取）、`note-anchors.ts`（锚点解析 + 实时查 git）、`init-core.ts`、`backfill-core.ts`。

`tests/`、`package.json`、`tsconfig.json`、`docs/`、`README.md` 都是**开发层，不进部署**。所以「部署 = 复制一个目录」，没有任何排除清单。

## 已知限制

- 部署必须**整目录复制**：`scripts/` 里的模块互相 import（如被门禁 import 的 `note-text.ts`），少一个就 `ERR_MODULE_NOT_FOUND`——fail-loud，不会静默
- `config.yml` 的 `repos:` 段**键序不限**（`path:` / `name:` 谁先都行），但**不要写行内注释**（`#` 会被当成值的一部分）；段内的注释行必须与条目**同缩进**——顶格的 `#` 会终止整个段的解析，其后的仓库条目被静默丢弃（实测：后面声明的仓库被完全遗忘，退出码仍为 0）
- `detectSubRepos` 只探**一层**直接子目录；更深层的仓库需手工往 `repos:` 补条目（`init` 对已存在的 `config.yml` 跳过不覆盖，不会抹掉你的补充）
- `config.yml` 的 `sources:` 段**没有任何程序消费者**（`scripts/` 下没有候选筛选程序）：它只由 `init-core.ts` 写入，供人阅读、AI 遍历筛选
- 笔记里引用的**文件是否存在由人工自检**，锚点门禁只管仓库 / 分支 / commit（`gitTracksFile` 是预留能力，尚未接入）
- **门禁查不了「该写却没写」**：那是语义判断，正则做不到。靠 `AGENTS.md` 规矩 + 子仓库指针预防、口头触发兜底、`backfill` 补救
- 构建产物类的排除规则（`*.apk`、`.tmp-*` 之类）**不写进 `.gitignore` 模板**——通用工具不硬编码特定项目的模式，请自行添加
- 部署副本里的 `scripts/*.ts` 可能在编辑器报 `ts(2591) 找不到名称 "node:fs"`——那是宿主项目没装 `@types/node`，**不影响运行**（Node 的类型剥离不做类型检查），不要为此改脚本
- **非代码工作目录要求那台机器有 git**，且目录在**本地磁盘**（同步盘会损坏 `.git`）；git 缺失时脚本 fail-closed 报错，**不会**自行安装

## 设计取舍

- **记录责任在 AI，不在人**：不给人加额外负担。参照同机制的上游体系：4 个月积累 1225 篇（约每天 10 篇），不可能是人写的
- **规矩与理由分离**：`AGENTS.md` 放当前生效的短规矩并链到笔记，笔记放长尾的理由与取舍。混在一起会让 `AGENTS.md` 膨胀到没人读
- **事实由程序锚定，语义由 AI 合成**：门禁管格式与事实，意思由人点头
- **机械门禁而非自觉**：对 AI 来说，写在散文里的规矩等于没有规矩
- **不绑方法论**：不依赖 superpowers 之类流程框架。装了只是触发更顺手——brainstorming 结束时手上正好有 2–3 个方案及取舍，此刻落笔记成本最低；存量收割的最佳原料也是已有的 specs / plans。没装照常工作，只是「考虑过但没选的方案」缺记录
- **过度留痕和完全不记，是同一个错误的两种样子**：机械改动不写笔记

完整的设计论证（与上游体系的差异、被砍掉的机制、验证过程）见 `docs/superpowers/specs/2026-10-14-evolvetrace-design.md`——写于项目叫 EvolveTrace 时，文件名与其中的路径是当时的。其中 `.evolvetrace/config.yml`、`.agents/skills/evolvetrace/`、`evolvetrace backfill` 等路径与命令均已作废，现行形态以本 README 与 `skills/intent-notes/` 为准。

## 开发与测试

```powershell
npm install          # 仅开发需要：typescript + @types/node；仓库未提交 lockfile，且 typescript@^7.0.2 是 caret 范围，安装结果不可复现
npm test             # node --test "tests/*.spec.ts" → 130 用例
npm run typecheck    # tsc --noEmit（strict，19 个文件）
```

- 运行时**零依赖**：`node --test` 与三道门禁都不需要 `node_modules`
- 要求 **Node ≥ 22.18**（原生 TypeScript 类型剥离自该版本起默认开启，无构建步骤）
- 测试必须用 glob 形式：Node 22 的 `node --test <目录>` 会报 `Cannot find module`
- `package.json` 不再提供 `verify` 脚本：本仓库自身不是笔记项目（没有 `.agents/notes`），该脚本命令写死相对本仓库根解析的路径，没有任何成功路径。三道门禁请在**已初始化项目的根目录**按上文「命令速查」用 `node <skill>/scripts/verify-note-*.ts` 执行
- 改 skill 的流程：**先要一条失败的测试（RED → GREEN）**；改完跑 `npm test` + `npm run typecheck`

本项目以 [MIT](LICENSE) 许可发布。门禁 1 / 2 移植改造自 DeepSeek Harness（MIT, Copyright (c) 2026 DeepSeek），门禁 3 的跨仓库锚点校验、`init`、`backfill` 为本项目新写。
