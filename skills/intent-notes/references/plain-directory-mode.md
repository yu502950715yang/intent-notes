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

**git 不可用时：不要下载或安装任何软件。** 停止初始化，如实报告原始错误，让使用者决定（自己安装 git，或改走备选方案）。本 skill 的职责是记录决策，不是管理系统依赖。

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

## 每次改动的流程

1. 改产物（PRD、需求文档）
2. `git status --short` 看改动范围
3. 按 `SKILL.md` 第一节判**要不要写笔记**
4. `git add` **指定文件**（不要 `git add -A`，免得把密码、原始素材、临时文件带进去）
5. `git commit`：中文，一句话说清改了什么
6. 写笔记（若需要）：`## 涉及仓库` 写 `- \`<目录名>\` 分支 \`<分支名>\` commits \`<刚得到的短哈希>\``
7. 提交笔记：**产物先提交、笔记后提交**（笔记的 commit 锚点只能指向已存在的 commit）

## 两个坑

- **第一篇笔记之前必须先有一次提交**：空仓库还没有分支 ref，此时写笔记会让门禁 3 报「分支不存在」
- **commit 前先看 `git status`**：由 agent 代劳提交，意味着可能把不该进仓库的东西提交进去

## 代价

Word / Excel / PPT 是二进制，每次改动全量入库，仓库会膨胀。PRD 这种量级可接受，但要知情。

## 不做的

只在本地做最小提交：不推远端、不开分支工作流、不配置 CI。
