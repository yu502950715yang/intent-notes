# 归档封印闸门、归档候选清单与取代性检查落点

日期：2026-10-16
状态：待评审

## 背景

本 skill 把「归档后永久冻结」写成了硬约定（`references/archiving.md`）：不再编辑、翻译、重格式化、移动或删除。但目前**没有任何机制执行它**：

- 门禁 1（`verify-note-tree.ts`）对 `archived/` **整篇豁免**——连笔记间相对链接的断链都不查
- 门禁 2（`verify-note-format.ts`）只校验头三行、必备节与提案用语，**不管内容是否被改过**
- 门禁 3（`verify-note-anchors.ts`）同样整篇跳过 `archived/`
- 三道门禁**都没有任何事件触发**。`SKILL.md` 第一节自己写着「门禁不会自己启动」

这里有**两个**独立的问题，之前的设计只覆盖了第一个：

**问题一：归档之后守不住。** 改成「顺手同步一下旧路径」「补个翻译」都不会报错。

**问题二：归档根本不发生。** 实际使用中 `implemented/bug-fix/` 只进不出、`archived/` 长期为空。原因是「某篇 implemented 是否还值得留在活跃树里」这个判断只在 agent 主动翻 `references/archiving.md` 时才会发生——而没有任何东西提示它「该翻一翻了」。这一条**没有机械解法**（判据是语义的），但可以把「发现候选」这一步机械化。

对照 DeepSeek Harness（本 skill 门禁 1/2 的移植来源），它靠两处机械闸门覆盖同一套语义：

| 检查 | DSH 的触发点 |
|---|---|
| 活跃笔记的格式与分类（`verify-agent-note-format` / `-classification`） | PR CI 的 `check:ci:static` |
| 归档封印（`verify-archived-agent-notes`） | 本地 `pre-commit` + `pre-merge-commit`（glob `.agents/notes/archived/**`），CI 再查一次 |
| 新建时查取代关系、归档候选分类 | `dsh-archive-agent-notes` skill + 人发起的 prune 提交（**无脚本**，Package.json 里没有任何 supersession 检查） |

`lefthook.yml` 的分层原则写在文件头：`Keep these local checkpoints fast; CI owns the full repository-wide gate matrix.`——**归档封印进本地 hook 的原因是不可逆**：改了就回不去，必须在落盘那一刻截住。

**本 skill 不能照搬这个分层**：它没有 CI，也不该给目标项目装 CI（那些项目不一定有 PR 流程）。若照 DSH 把活跃笔记的检查「推给 CI」，等于推给一个不存在的时机。

## 目标与非目标

目标：

1. 让「归档被改动」成为可机械发现的事实，并在 `git commit` 处截住（门禁 4 + pre-commit）
2. 让活跃笔记的结构与格式在同一次 `git commit` 处被判一遍——补上 DSH 用 CI 覆盖的那一半
3. 让「有哪些 implemented 可能该归档」变成会话开始时看得见的一张清单，而不是凭记忆
4. 把「新建前必查取代性」从按需读取的 reference 提升为硬规则，且**只保留一处权威描述**

非目标：

- **不自动归档**：归档判据是语义的，脚本只列事实、不下结论、不排序成「优先级」
- **不防绕过**：`git commit --no-verify` 仍可跳过。这是提醒与默认路径，不是安全边界
- **不检测「该写却没写」**：语义判断，脚本做不到（DSH 也做不到）
- **不做 CI 集成**：skill 无法替目标项目决定 CI
- **不改门禁 1/2/3 的既有语义**：只新增门禁 4、一个 audit 输出，以及一次纯重构
- **不做多语言配对**：本体系是中文单语单文件，无 `.zh.md` / `.i18n.yaml`

## 调查结论（设计依据）

| 问题 | 结论 | 依据 |
|---|---|---|
| `manifest.json` 放在 `archived/` 会不会被门禁 1 判红？ | 不会。门禁 1 只收集 `.md`，非 `.md` 文件静默通过 | `note-tree.ts:72` 只 push `endsWith('.md')` |
| 目标项目一定有 git 吗？ | 有。`init` 在目标无 `.git` 时无条件 `git init`，且会拒绝在悬空 gitdir 上建骨架 | `init.ts:65,95-109` |
| 新增脚本会不会打破齐备性测试？ | 不会。既有清单只枚举 references 与 templates | `tests/templates.spec.ts:79-87`、`tests/init.spec.ts:281` |
| 本地 hook 能拦住「改文件 + 重录 manifest」吗？ | 只有 manifest 是**只追加**时能。DSH 的 manifest 正是只追加的 | `verify-archived-agent-notes.ts` 的 append-only 语义 |
| DSH 的 baseline ref 我们能复用吗？ | 不需要。它用于 CI 防「PR 内自洽篡改」；本地只追加语义已覆盖同一目的 | `DSH_ARCHIVE_BASE_REF` 在本地退化为 `HEAD` |
| 算入链数能复用门禁 1 的链接解析吗？ | 不能直接复用——`localLinkTargets` 与 `isIndentedCodeBlock` 是 `verify-note-tree.ts` 的**私有函数** | `verify-note-tree.ts:19-51` 无 export |
| 「只有 implemented 能归档」门禁看得出吗？ | 看不出。从 `proposed/` 直接移入 `archived/` 并同时改好 `Status` 与骨架，门禁 2 会全绿 | 需翻 git 历史才能检测，见「被否决的方案」 |

## 采用方案

### 一、归档封印契约

**产物**：`.agents/notes/archived/manifest.json`

```json
{
  "version": 1,
  "artifacts": { "bug-fix/2026-07-19-windows-atomic-write.md": "<sha256 hex>" },
  "history": []
}
```

**哈希对象**：笔记文件的原始字节（UTF-8 原文，含行尾与结尾换行）。`manifest.json` 自身不参与封存。

**只追加**：这是整个机制成立的前提。任何允许「重录既有条目」的设计都会让「改文件 + 重录」变成自洽的合法操作，manifest 随即失去意义。

**门禁 4 的四种判定**（`verify-note-seal.ts`，接 notes 根，与门禁 1/2 同参数口径）：

| 现象 | 判定 |
|---|---|
| 磁盘有、manifest 无 | `未封存`——归档后没跑 `--write` |
| 哈希不符 | `内容已改动`——除 `history` 里的 reseal 记录外一律判红 |
| manifest 有、磁盘无 | `已删除`——除 `history` 里的 forget 记录外一律判红 |
| `manifest.json` 缺失但有归档笔记 | 报「整棵归档树未封存」，并提示首次封印命令 |

**`--write`（封印入口）**：

- manifest 不存在 → 把磁盘上全部归档笔记一次性封存（存量项目首次启用走这条）
- manifest 存在 → **先证明所有既有条目未变**，再仅追加新条目；任何既有条目哈希变化即报错退出，不做任何写入
- 幂等：无新增、无变化时输出「无新增产物」并退 0

**两个显式例外通道**（都只接受**单个**路径、都必须带 `--reason`——避免把例外变成常规操作）：

- `--reseal <class>/<file>.md --reason=<text>`：修改已封存内容。向 `history` 追加 `{ action: 'reseal', path, at, reason, from, to }`
- `--forget <class>/<file>.md --reason=<text>`：撤销一次误归档，此后不再要求该文件存在。向 `history` 追加 `{ action: 'forget', path, at, reason, from }`

门禁 4 的放行规则：哈希不符时，若 `history` 中存在该路径的 `reseal` 且其 `to` 等于磁盘当前哈希，则放行；文件缺失时，若存在该路径的 `forget`，则放行。`at` 取**本地日期** `YYYY-MM-DD`。

删除**不会**被静默接受：「误归档」必须走 `--forget` 并留下理由，这条记录就是它日后被追问时的答案。

### 二、闸门接入（pre-commit）

**新增 `scripts/install-hook.ts`**，用法 `node scripts/install-hook.ts <项目根> [--dry-run] [--force]`：

1. 校验 `<项目根>/.git` 存在，否则报「先跑 init」并退出
2. 目标 `<项目根>/.git/hooks/pre-commit`
   - 不存在 → 写入（权限 `0o755`）
   - 已存在且内容与本次生成的**完全一致** → 报「已安装」，退 0（幂等，可反复跑）
   - 已存在且内容不同 → **拒绝写入**，打印手动接入片段与 `--force` 提示
3. 脚本路径：install-hook 据自身位置（`import.meta.dirname`）算出 skill 相对项目根的路径。相对路径不以 `..` 开头时写相对路径（可随项目迁移），否则写绝对路径
4. `--dry-run` 只打印计划，不落盘——与 `init.ts` 的既有约定一致

**生成的 hook 内容**（POSIX sh，Git for Windows 亦由 sh 执行）：

```sh
#!/bin/sh
# Intent Notes pre-commit：笔记闸门（由 install-hook.ts 生成）
# 按路径触发：未触碰 .agents/notes/ 时零开销。
set -e
SKILL="<相对或绝对路径>"
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
```

`git diff --cached --quiet -- <path>` 的退出码：0 = 无差异，非 0 = 有差异或出错。用 `if !` 判定，出错时偏向执行门禁（fail-safe）。不依赖 `grep`/`echo` 之外的工具，也不依赖 Node 以外的运行时。

**找不到 `node` 时拒绝提交，而不是放行**：与本 skill 门禁的 fail-closed 传统一致。静默放行会让「装了 Node 才有闸门」悄悄退化成「没装 Node 就永远没有闸门」，而使用者无从察觉。

**为什么归档只跑封印、活跃笔记才跑 1/2**：归档树封存后不再变化，封印校验是哈希比对；门禁 1/2 要扫全树，只在笔记真的被碰过时才付这个成本。

### 三、取代性检查的落点

现在「新建前的固定动作」写在 `references/when-to-write.md`——那是**按需读取**的文件，而它能生效的前提是 agent 已经决定要写笔记。真正会漏掉的场景是「改完代码、根本没意识到要写笔记」。

因此把规则提升到 `SKILL.md` 第 4 节硬规则（skill 一旦加载即在上下文里）：

> 9. 新建或更新笔记前，先按模块名或机制关键词搜 `.agents/notes/` 活跃目录树并**当场分类**：无关 / 部分重叠（互链）/ 完全吸收（合并）/ 过时。出现**完全取代**时，在同一批改动里归档被取代的 `implemented` 笔记并跑封印（门禁 4）。分类结果与这篇新笔记一起落盘，**不留到以后大扫除**。

`when-to-write.md` 的「新建前的固定动作」一节**改为引用硬规则 9**，不再重复展开——该文件开头自己写着「判据只在那一处，别在别处复制」。

### 四、归档候选清单（audit）

**新增 `scripts/audit-notes.ts`**，用法 `node scripts/audit-notes.ts [notes 根]`。

**只读**：不判红、不写文件，退出码 0（参数或 notes 根不可读时才非 0）。它**不是门禁**，不进 hook、不进 CI。

**输出**：

```
audit-notes: implemented 12 篇 · archived 26 篇 · proposed 1 篇 · rejected 3 篇

逐篇（按存续天数降序）：
  87天  410字  0入链  bug-fix/2026-07-21-compaction-summary-reuse.md
  80天  596字  2入链  process/2026-07-26-ci-failover-runbook.md
  …
```

- **存续天数** = 今天 − 文件名里的首次提出日（本地日期，按日取整）
- **字数** = 去围栏后的正文字数（复用 `note-text.ts` 的 `proseLines`）
- **入链数** = 有多少**活跃**笔记（`proposed` / `implemented` / `rejected`）通过相对 Markdown 链接指向它，**按来源笔记去重**（同一篇链它三次仍算 1）。`archived/` 内的出站链接不计——归档已冻结，不再是当前权威依据
- 排序只按存续天数降序，**不按入链数或综合分排序**：避免把线索包装成结论

**输出必须同时打印这句话**：`字数与存续时间只是发现线索，从来不是归档判据（见 references/archiving.md）。`——`archiving.md` 已明写「不要为了凑数归档」，清单若被当成待办配额就背离了设计意图。

**挂点**：`SKILL.md` 第零节由「会话开始三件事」扩为**四件事**，第四件是跑 audit。这样每次会话开始，「有哪些 implemented 可能该归档」都会被打印一次；分类仍是 agent 与人当场做的语义判断。

**为它做的纯重构**：`localLinkTargets` 与 `isIndentedCodeBlock` 从 `verify-note-tree.ts` 提取到新纯模块 `scripts/note-links.ts` 并导出，两处共用。`verify-note-tree.ts` 的行为**不得改变**——既有 `tests/verify-note-tree.spec.ts` 就是这次重构的回归保护。

### 五、改动清单

| # | 文件 | 改什么 |
|---|---|---|
| 1 | `skills/intent-notes/scripts/note-links.ts` | **新增**：从 `verify-note-tree.ts` 提取 `localLinkTargets` / `isIndentedCodeBlock` 并导出（纯重构，无行为变化） |
| 2 | `skills/intent-notes/scripts/verify-note-tree.ts` | 改为 import 上述两个函数，删除本地副本 |
| 3 | `skills/intent-notes/scripts/seal-core.ts` | **新增**：纯逻辑（SHA-256、manifest 读写、只追加校验、history 记录） |
| 4 | `skills/intent-notes/scripts/verify-note-seal.ts` | **新增**：门禁 4 CLI，接 notes 根 |
| 5 | `skills/intent-notes/scripts/audit-notes.ts` | **新增**：归档候选清单，只读 |
| 6 | `skills/intent-notes/scripts/install-hook.ts` | **新增**：安装 pre-commit，接项目根 |
| 7 | `skills/intent-notes/SKILL.md` | 第零节三件事 → 四件事（加 audit）；硬规则加第 9 条；第六节把门禁 4 与 hook 纳入自检 |
| 8 | `skills/intent-notes/references/archiving.md` | 新增「封印」一节（manifest / `--write` / `--reseal` / `--forget` / 首次启用）；新增「用 audit 清单发现候选，但清单不是判据」 |
| 9 | `skills/intent-notes/references/when-to-write.md` | 「新建前的固定动作」改为引用硬规则 9 |
| 10 | `skills/intent-notes/references/quality-gate.md` | 第 0 步纳入门禁 4 |
| 11 | `skills/intent-notes/references/bootstrap-existing-project.md` | 存量项目首次启用时跑一次 `--write` 全量封印 |
| 12 | `skills/intent-notes/templates/notes-readme.md` | 归档一节补一句封印说明 |
| 13 | `README.md` | 三道门禁 → 四道；新增 hook 安装说明与 audit 说明；命令速查补四条；目录结构 `scripts/ (10)` → 15；纯模块列表 5 → 7 |
| 14 | `tests/note-links.spec.ts` | **新增**：提取出的两个函数直接单测（含围栏/行内代码豁免、`%XX` 解码、锚点与查询串剔除） |
| 15 | `tests/seal.spec.ts` | **新增**：core 层单测 |
| 16 | `tests/verify-note-seal.spec.ts` | **新增**：CLI 行为与退出码 |
| 17 | `tests/audit-notes.spec.ts` | **新增**：天数/字数/入链计数与排序 |
| 18 | `tests/install-hook.spec.ts` | **新增**：写入 / 幂等 / 冲突拒绝 / `--dry-run` |

既有测试除 `tests/verify-note-tree.spec.ts`（作为重构回归保护，**不应改动**）外均不涉及。`templates.spec.ts` 的齐备性清单只枚举 references 与 templates，新脚本不触发它。

## 实施顺序

三块可独立验证，建议按此顺序落地（`writing-plans` 据此拆阶段）：

1. **纯重构先行**：提取 `note-links.ts`，`verify-note-tree.ts` 改为 import。验收标准是既有 `tests/verify-note-tree.spec.ts` 与 `tests/note-text.spec.ts` 全绿、零行为变化。单独提交，便于回滚。
2. **归档封印**：`seal-core.ts` + `verify-note-seal.ts` + 两者测试 + `archiving.md`。此阶段结束时封印可手动跑通，但还没有触发点。
3. **闸门与清单**：`install-hook.ts` + `audit-notes.ts` + 两者测试 + `SKILL.md` / `README.md` / 其余 reference 与模板。

阶段 2 与 3 各自独立可用：只装封印（手动跑）也能挡住改动，只是没有自动触发；只装 hook 则会在封印缺失时判红。

## 测试计划

沿用 `tests/*.spec.ts` 的既有模式（`node --test`，`spawnSync('node', [...])` 跑 CLI，临时目录 `mkdtempSync`）。

`tests/note-links.spec.ts`（提取出的纯函数）：

- 行内链接、引用式定义、`<...>` 包裹、含空格的目标都能提取
- 行内代码 span 与 HTML 注释里的示例链接不提取
- 外部 scheme 与协议相对 URL 不提取
- `%XX` 解码、锚点与查询串剔除
- 缩进代码块判定与既有行为一致

`tests/seal.spec.ts`（core 层）：

- 空 manifest + 空归档树 → 通过
- `--write` 首次封印：manifest 不存在时写入全部条目
- 二次 `--write`：无新增时幂等，输出「无新增产物」
- 新增一篇归档后 `--write`：只追加新条目，既有条目不动
- 既有条目被改后 `--write`：**报错退出且不写入**（只追加的核心保证）
- 内容改动 → 门禁判定为「已改动」
- 未封存 → 判定为「未封存」
- 删除 → 判定为「已删除」
- `--reseal` 缺 `--reason` → 拒绝
- `--reseal` 后门禁放行；`history` 记录含 `action`/`from`/`to`/`at`/`reason`
- `--forget` 缺 `--reason` → 拒绝
- `--forget` 后删除不再判红；`history` 记录含 `action`/`from`/`at`/`reason`
- manifest 损坏（非法 JSON）→ fail-closed 报错

`tests/verify-note-seal.spec.ts`（CLI 层）：

- 全绿时退出码 0，打印检查篇数
- 各类违规退出码 1 且报错前缀为 `seal:`
- notes 根不存在 / 不可读 → 与门禁 1/2 同口径报错

`tests/audit-notes.spec.ts`：

- 天数计算：用文件名日期与固定「今天」注入——实现读环境变量 `INTENT_NOTES_TODAY`（`YYYY-MM-DD`），未设置时取系统本地日期；测试据此固定时间，避免用例随真实日期漂移
- 字数只算去围栏后的正文
- 入链计数：来自活跃笔记的链接计入；来自 `archived/` 的链接**不**计入；断链不计入
- 排序按存续天数降序
- 摘要行四个生命周期篇数正确
- 必须打印「不是判据」那句声明
- 空树 → 退 0，输出 0 篇

`tests/install-hook.spec.ts`：

- 无 `.git` → 报「先跑 init」并退 1
- 正常写入 `.git/hooks/pre-commit`，文件含两段按路径触发的判定
- 内容一致时重复安装 → 退 0 且不重写
- 已有他人 pre-commit → 拒绝写入、原文不被改动、提示 `--force`
- `--force` → 覆盖
- `--dry-run` → 不落盘
- skill 在项目内 → hook 写相对路径；skill 在项目外 → 写绝对路径

## 风险与已知限制

1. **`--no-verify` 可绕过**：接受。这是默认路径纠偏，不是安全边界
2. **清单可能被当成 KPI**：audit 是唯一会被误用的新东西。缓解手段是强制打印「不是判据」声明、不按入链数排序、不输出「建议归档」之类的结论
3. **「只有 implemented 能归档」检测不了**：见「被否决的方案」
4. **skill 目录移动后 hook 失效**：用相对路径时 skill 移动即报错（报错清晰），重跑 `install-hook` 即可恢复
5. **manifest 是第二份状态**：它的不变质完全依赖「只追加」。手动编辑 `manifest.json` 会使封印失效，但门禁 4 会因哈希不符暴露这种编辑
6. **Windows**：`chmod 0o755` 无效但不报错；hook 由 Git for Windows 的 sh 执行，`node` 必须在 `PATH`
7. **hook 与项目既有 pre-commit 冲突**：不覆盖，拒绝并给手动片段——宁可让人显式合并
8. **`git diff --cached --quiet` 在浅克隆/无 HEAD 仓库**：首次 commit 时 git 以空树比较，行为正常；退出码非 0 一律偏向执行门禁
9. **audit 的存续天数依赖系统时钟**：日期只用于排序展示，不参与任何判定

## 被否决的方案

**纯 git 检测（不存 manifest）**：用 `git diff` 判定 `archived/` 下已跟踪文件是否被修改或删除。零新增状态，但表达不了合法例外（`--reseal` / `--forget` 无从留痕），且封印证据绑死在 git 历史里。DSH 的 manifest 已被证明可行，移植成本低于自研规则。

**只跑归档封印，不跑门禁 1/2**：这是最贴近 DSH 原始分层的做法。否决理由是本 skill **没有 CI**——照此会把活跃笔记的机械检查推给一个不存在的时机，等于维持现状。

**把门禁 3（锚点）也放进 hook**：每篇笔记要多次 git 子进程（仓库根、分支、commit），polyrepo 下明显拖慢 commit；而它已在「会话开始」环节被覆盖。

**覆盖式 `--write`（允许重录既有条目）**：实现更简单，但会让「改归档文件 + 重跑 --write」成为自洽的合法操作，manifest 随即失去意义。只追加是不可退让的那一条。

**精确白名单例外（DSH 式）**：在脚本里硬编码允许的 old→new 转换。最可控，但每次真实需求都要改代码并发版；本 skill 的归档规模远小于 DSH，`--reseal --reason` 的留痕已经够用。

**挂进 `init.ts`（`--install-hook` flag）**：省一条命令，但 `init` 现在承诺「不修改任何既有文件的内容」，装 hook 会打破它；且重跑幂等语义要重新设计。独立脚本边界更清楚。

**用 git 历史检测「跳级归档」**（新笔记必须曾在 `implemented/` 下出现过）：能堵住「`proposed` 直接移入 `archived/` 并伪造骨架」，但实现要 `git log --follow --diff-filter=R` 追溯重命名，脆弱且对存量归档完全无效（它们本来就没有这段历史）。DSH 也没做。记为已知限制而非功能。

**让脚本直接判定「该归档了」**：拒绝。归档判据是语义的（决策依据、否定性保证、重新引入条件……），任何按字数或存续时间的自动判定都会与本 skill 反复强调的「不要为了凑数归档」直接冲突。脚本只列事实。
