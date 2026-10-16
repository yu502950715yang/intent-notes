# 取代与归档

## 归档的对象

**只有 `implemented` 能归档**，所以归档路径里刻意没有 `implemented` 层：`archived/{class}/yyyy-mm-dd-topic-title.md`。

## 归档笔记的格式

归档**不是**改状态，而是冻结：`Status:` 保持 `implemented`，并在**第 4 行**（紧接状态行之后）插入归档日期：

```markdown
# Agent Note: <标题>

Status: implemented
Archived: YYYY-MM-DD
```

其余骨架与 `implemented` 相同（`## Problem` → `## Decision` → `## Alternatives considered` → `## Consequences`）。门禁会校验第 4 行的存在与格式，也会拒绝归档笔记里的提案用语。可直接以 `templates/archived.md` 起步。

**归档笔记豁免锚点校验。** 锚点门禁（`verify-note-anchors.ts`）整篇跳过 `archived/` 下的笔记——归档已冻结、不再作为当前行为的权威依据，分支与 commit 不再实时核对；格式门禁的必备节里也不含 `## Affected repositories`。所以从 `implemented` 冻结成 `archived` 时，该段**可以省略，也可以保留原样**：段内的分支、commit 随代码漂移不算失效，不必为它更新锚点，也不会因此判红（`templates/archived.md` 仍带该段，照抄或删掉都合规）。

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

**怎么发现候选**：会话开始时跑 `audit-notes.ts`，它会列出 `implemented/` 全部笔记的存续天数、字数与入链数。清单只提供线索——**字数与存续时间从来不是判据**，是否归档仍是读一遍内容后的语义判断（判据就是本节那七条）。

## 被完全取代

新笔记必须**先继承旧篇的全部独有内容**——决策依据、备选方案、后果、必需验证、明确指出的覆盖缺口——然后才允许删旧篇。**不得让 git 历史成为决策依据的唯一副本。**

## 被部分取代

两篇都留，互相加相对链接，只更新仍然成立的事实。

## proposed 不归档

过时的提案转 `rejected`，并写清为什么否决——**绝不归档**。

已被某个 `implemented` 方案取代的提案同样转 `rejected`（`Status:` 行点明它败给了哪一篇，并与新篇互链）：留在 `proposed/` 会显得仍在评审中（目录即状态），直接删则丢掉「当初为什么看好它」。只有当它连「诱人的错误」都算不上时才删（判据见上文「删除，而不是归档」）。

## rejected 的取舍

只在这个败选方案仍然是**一个诱人且影响重大的错误**时保留；否则整篇删除。
