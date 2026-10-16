import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, cpSync, symlinkSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { spawnSync } from 'node:child_process'
import { collectCommitContext, extractVersionPrefix, parseBranchLines, renderBackfill } from '../skills/intent-notes/scripts/backfill-core.ts'

const skillRoot = resolve(import.meta.dirname, '../skills/intent-notes')

function git(cwd: string, ...args: string[]): string {
  // -c 覆盖全局 git 配置：gpgsign 会让 commit 失败，core.abbrev 会让 --short 不足 7 位而锚点门禁判红
  const r = spawnSync('git', ['-c', 'commit.gpgsign=false', '-c', 'core.abbrev=40', ...args], { cwd, encoding: 'utf8' })
  assert.equal(r.status, 0, `git ${args.join(' ')} 失败：${r.stderr}`)
  return r.stdout.trim()
}

/** 造一个「项目根 + cloud 子仓库 + 一份 commit」的 fixture。 */
function makeBackfillProject(prefix = 'intent-notes-bf-'): { root: string; sha: string } {
  const root = mkdtempSync(join(tmpdir(), prefix))
  const sub = join(root, 'cloud')
  mkdirSync(sub, { recursive: true })
  git(sub, 'init', '-q', '-b', 'v140')
  git(sub, 'config', 'user.email', 't@example.com')
  git(sub, 'config', 'user.name', 't')
  writeFileSync(join(sub, 'a.txt'), 'x\n')
  git(sub, 'add', '.')
  git(sub, 'commit', '-q', '-m', 'v140：某改动')
  const sha = git(sub, 'rev-parse', 'HEAD')
  mkdirSync(join(root, '.agents', 'intent-notes'), { recursive: true })
  writeFileSync(join(root, '.agents', 'intent-notes', 'config.yml'), 'project: demo\nrepos:\n  - path: cloud\n    name: cloud\n')
  return { root, sha }
}

/** 把整个 skill 目录复制到临时位置，并造一个指向它的 junction（模拟 skill 部署态）。 */
function makeJunctionDeploy(prefix: string): { link: string; base: string } {
  const base = mkdtempSync(join(tmpdir(), prefix))
  const deployed = join(base, 'intent-notes')
  cpSync(skillRoot, deployed, { recursive: true })   // 部署 = 整目录复制，与文档一致
  const link = join(base, 'skill-deploy')
  symlinkSync(deployed, link, 'junction')
  return { link, base }
}

test('从提交主题提取版本前缀', () => {
  assert.equal(extractVersionPrefix('v140：【修复】关门漏判'), 'v140')
  assert.equal(extractVersionPrefix('V130: 预约导出修复'), 'V130')
  assert.equal(extractVersionPrefix('fix: 整改提示词'), undefined)
})

test('版本前缀的位数边界：2–4 位命中，5 位以上不命中', () => {
  assert.equal(extractVersionPrefix('v14：两位版本'), 'v14')
  assert.equal(extractVersionPrefix('v141：三位版本'), 'v141')
  assert.equal(extractVersionPrefix('v1400：四位版本'), 'v1400')
  // 5 位是单号（issue/需求号）而非版本号：若认了它，笔记的版本锚点会指向一个不存在的版本
  assert.equal(extractVersionPrefix('v14001：五位不是版本'), undefined)
})

test('采集提交上下文：分支、文件、版本前缀', () => {
  const path = mkdtempSync(join(tmpdir(), 'intent-notes-bf-'))
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

test('分支清洗只剥「标记 + 空格」，不碰以 + 开头的真分支名', () => {
  // `+work` 与 `+` 都是合法 refname（check-ref-format 通过），`*work` 不是；
  // 但 `+ `/`* ` 这种两字符前缀不可能属于真名（refname 禁止空格）。
  // 旧写法 `/^[+*]\s*/` 会把真分支 `+work` 剥成 `work`——凭空造出一个不存在的分支名写进永久笔记。
  const stdout = [
    '+ work', // 链接 worktree 的标记
    '+work', // 真分支名，必须原样保留
    '* main', // 当前分支标记
    '+ +work', // worktree 标记 + 真名 `+work`
    '+', // 单字符真名，不能因为「像标记」被丢成空串
  ].join('\n')
  assert.deepEqual(parseBranchLines(stdout), ['work', '+work', 'main', '+work', '+'])
})

test('以 + 开头的真分支名端到端保留', () => {
  const path = mkdtempSync(join(tmpdir(), 'intent-notes-bf-plus-'))
  git(path, 'init', '-q', '-b', 'main')
  git(path, 'config', 'user.email', 't@example.com')
  git(path, 'config', 'user.name', 't')
  writeFileSync(join(path, 'a.txt'), 'x\n')
  git(path, 'add', '.')
  git(path, 'commit', '-q', '-m', 'x')
  git(path, 'branch', '+work')
  git(path, 'branch', '+')

  const ctx = collectCommitContext('cloud', path, 'HEAD')
  assert.deepEqual([...ctx.branches].sort(), ['+', '+work', 'main'], `真分支名被清洗坏了：${JSON.stringify(ctx.branches)}`)
  rmSync(path, { recursive: true, force: true })
})

test('color.branch=always 且 detached HEAD 时，不带 ANSI 的假分支名不得混进结果', () => {
  // 标记本身无色而名字带 ANSI：缺 `--no-color` 时 detached 行解析成 `\e[32m(HEAD detached at …)\e[m`，
  // 它不以 `(HEAD detached ` 开头 → 一个假分支名被写进锚点行。
  // 必须用「不在任何分支上的 detached commit」构造：否则 main 也 contains 该 commit，测不到这条路径。
  const path = mkdtempSync(join(tmpdir(), 'intent-notes-bf-color-'))
  git(path, 'init', '-q', '-b', 'main')
  git(path, 'config', 'user.email', 't@example.com')
  git(path, 'config', 'user.name', 't')
  git(path, 'config', 'color.branch', 'always')
  writeFileSync(join(path, 'a.txt'), 'x\n')
  git(path, 'add', '.')
  git(path, 'commit', '-q', '-m', 'x')
  git(path, 'checkout', '-q', '--detach', 'HEAD')
  git(path, 'commit', '-q', '--allow-empty', '-m', 'detached work')

  const ctx = collectCommitContext('cloud', path, 'HEAD')
  assert.deepEqual(ctx.branches, [], `detached 行被解析成了假分支：${JSON.stringify(ctx.branches)}`)
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
  const path = mkdtempSync(join(tmpdir(), 'intent-notes-bf-merge-'))
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
  // 版本前缀是可选增强：ctx 里没有就不出该行（无分支路径同样有守卫）
  assert.doesNotMatch(md, /版本前缀/)
  // 事实载荷必须保留，否则这条命令在无分支场景下几乎没用
  assert.match(md, /- 改动文件（1 个）：/)
  assert.match(md, /a\.txt/)
  assert.match(md, /implemented\/feature\/2026-01-01-a\.md/)
})

test('提交主题无版本前缀时，正常路径也不出现「版本前缀」行', () => {
  // 版本前缀只从提交主题提取，属可选增强：没有就整行不出，锚点行与事实载荷照常
  const ctx = { repo: 'demo', sha: 'abc1234', subject: 'fix: 登录态丢失', branches: ['main'], files: ['src/a.ts'] }
  const md = renderBackfill(ctx, [])
  assert.doesNotMatch(md, /版本前缀/)
  assert.match(md, /- `demo` 分支 `main` commits `abc1234`/)
  assert.match(md, /- 提交：`abc1234` fix: 登录态丢失/)
  assert.match(md, /- 改动文件（1 个）：/)
})

test('CLI：成功路径 exit 0，stdout 含锚点行且匹配到相关笔记', () => {
  const root = mkdtempSync(join(tmpdir(), 'intent-notes-bf-ok-'))
  const sub = join(root, 'cloud')
  mkdirSync(sub, { recursive: true })
  git(sub, 'init', '-q', '-b', 'v140')
  git(sub, 'config', 'user.email', 't@example.com')
  git(sub, 'config', 'user.name', 't')
  writeFileSync(join(sub, 'a.txt'), 'x\n')
  git(sub, 'add', '.')
  git(sub, 'commit', '-q', '-m', 'v140：某改动')
  const sha = git(sub, 'rev-parse', 'HEAD')

  mkdirSync(join(root, '.agents', 'intent-notes'), { recursive: true })
  writeFileSync(join(root, '.agents', 'intent-notes', 'config.yml'), 'project: demo\nrepos:\n  - path: cloud\n    name: cloud\n')
  const notesDir = join(root, '.agents', 'notes', 'implemented', 'feature')
  mkdirSync(notesDir, { recursive: true })
  writeFileSync(join(notesDir, '2026-01-01-a.md'), '# Agent Note: a\n\nStatus: implemented\n\n## Problem\n\na.txt 相关\n')

  const r = spawnSync('node', ['skills/intent-notes/scripts/backfill.ts', sha, root], { encoding: 'utf8' })
  assert.equal(r.status, 0, r.stderr)
  assert.match(r.stdout, /## 涉及仓库/)
  assert.match(r.stdout, /- `cloud` 分支 `v140` commits `[0-9a-f]{7,40}`/)
  assert.match(r.stdout, /implemented\/feature\/2026-01-01-a\.md/)
  rmSync(root, { recursive: true, force: true })
})

test('CLI：basename 命中到词边界为止（data.txt 不因含 a.txt 而误报）', () => {
  const root = mkdtempSync(join(tmpdir(), 'intent-notes-bf-bound-'))
  const sub = join(root, 'cloud')
  mkdirSync(sub, { recursive: true })
  git(sub, 'init', '-q', '-b', 'main')
  git(sub, 'config', 'user.email', 't@example.com')
  git(sub, 'config', 'user.name', 't')
  writeFileSync(join(sub, 'a.txt'), 'x\n')
  git(sub, 'add', '.')
  git(sub, 'commit', '-q', '-m', 'x')
  const sha = git(sub, 'rev-parse', 'HEAD')

  mkdirSync(join(root, '.agents', 'intent-notes'), { recursive: true })
  writeFileSync(join(root, '.agents', 'intent-notes', 'config.yml'), 'project: demo\nrepos:\n  - path: cloud\n    name: cloud\n')
  const noise = join(root, '.agents', 'notes', 'implemented', 'feature')
  mkdirSync(noise, { recursive: true })
  // 这篇正文里的 `data.txt` 含子串 `a.txt`：子串匹配会把它列进「可能相关」
  writeFileSync(join(noise, '2026-01-01-b.md'), '# Agent Note: b\n\nStatus: implemented\n\ndata.txt 相关\n')
  const real = join(root, '.agents', 'notes', 'implemented', 'bug-fix')
  mkdirSync(real, { recursive: true })
  writeFileSync(join(real, '2026-01-02-c.md'), '# Agent Note: c\n\nStatus: implemented\n\n改了 `a.txt`\n')

  const r = spawnSync('node', ['skills/intent-notes/scripts/backfill.ts', sha, root], { encoding: 'utf8' })
  assert.equal(r.status, 0, r.stderr)
  assert.match(r.stderr, /疑似相关笔记 1 篇/, `命中数不对：${r.stderr}`)
  assert.doesNotMatch(r.stdout, /2026-01-01-b\.md/, '子串命中把不相关的笔记列了进来')
  assert.match(r.stdout, /2026-01-02-c\.md/)
  rmSync(root, { recursive: true, force: true })
})

test('backfill.ts 保持纯 CLI：不得再导出任何东西', () => {
  // 无导出才无人 import 它——纯 CLI 一旦被 import 就会无条件执行。
  // 有导出就说明纯逻辑长回了 CLI 文件，守卫的 fail-open 也会跟着长回来。
  const src = readFileSync(join(skillRoot, 'scripts', 'backfill.ts'), 'utf8')
  assert.doesNotMatch(src, /^export /m, 'backfill.ts 又导出了东西：纯逻辑应留在 backfill-core.ts')
})

test('CLI：笔记树结构有问题时 fail-closed，不静默漏报相关笔记', () => {
  const root = mkdtempSync(join(tmpdir(), 'intent-notes-bf-warn-'))
  const sub = join(root, 'cloud')
  mkdirSync(sub, { recursive: true })
  git(sub, 'init', '-q', '-b', 'main')
  git(sub, 'config', 'user.email', 't@example.com')
  git(sub, 'config', 'user.name', 't')
  writeFileSync(join(sub, 'a.txt'), 'x\n')
  git(sub, 'add', '.')
  git(sub, 'commit', '-q', '-m', 'x')
  const sha = git(sub, 'rev-parse', 'HEAD')

  mkdirSync(join(root, '.agents', 'intent-notes'), { recursive: true })
  writeFileSync(join(root, '.agents', 'intent-notes', 'config.yml'), 'project: demo\nrepos:\n  - path: cloud\n    name: cloud\n')
  // INDEX.md 被结构真源禁止，制造一条非空 errors
  mkdirSync(join(root, '.agents', 'notes'), { recursive: true })
  writeFileSync(join(root, '.agents', 'notes', 'INDEX.md'), '# idx\n')

  const r = spawnSync('node', ['skills/intent-notes/scripts/backfill.ts', sha, root], { encoding: 'utf8' })
  // 结构错误会漏报「疑似相关笔记」，静默放过等于诱导 AI 新建重复笔记
  assert.equal(r.status, 1, `结构错误被静默放过：${r.stdout}`)
  assert.match(r.stderr, /笔记树结构有问题/)
  assert.equal(r.stdout.trim(), '', '结构不可信时不该产出片段')
  rmSync(root, { recursive: true, force: true })
})

test('CLI：容器根尚未首次提交时，子仓库的 commit 仍可补写', () => {
  // 笔记可以先于容器根的首次提交存在；此时 path: . 不是 git 仓库，不该整体阻断 backfill
  const root = mkdtempSync(join(tmpdir(), 'intent-notes-bf-container-'))
  const sub = join(root, 'cloud')
  mkdirSync(sub, { recursive: true })
  git(sub, 'init', '-q', '-b', 'v140')
  git(sub, 'config', 'user.email', 't@example.com')
  git(sub, 'config', 'user.name', 't')
  writeFileSync(join(sub, 'a.txt'), 'x\n')
  git(sub, 'add', '.')
  git(sub, 'commit', '-q', '-m', 'v140：某改动')
  const sha = git(sub, 'rev-parse', 'HEAD')
  mkdirSync(join(root, '.agents', 'intent-notes'), { recursive: true })
  writeFileSync(
    join(root, '.agents', 'intent-notes', 'config.yml'),
    'project: demo\nrepos:\n  - path: .\n    name: demo\n  - path: cloud\n    name: cloud\n',
  )

  const r = spawnSync('node', ['skills/intent-notes/scripts/backfill.ts', sha, root], { encoding: 'utf8' })
  assert.equal(r.status, 0, `容器根不是仓库时 backfill 整体失败：${r.stderr}`)
  assert.match(r.stdout, /- `cloud` 分支 `v140`/)
  rmSync(root, { recursive: true, force: true })
})

test('CLI：容器根落在上层仓库内时仍 exit 1（豁免只覆盖「完全不在仓库内」）', () => {
  const outer = mkdtempSync(join(tmpdir(), 'intent-notes-bf-outer-'))
  const root = join(outer, 'proj')
  const sub = join(root, 'cloud')
  mkdirSync(sub, { recursive: true })
  git(outer, 'init', '-q', '-b', 'main')
  git(sub, 'init', '-q', '-b', 'v140')
  git(sub, 'config', 'user.email', 't@example.com')
  git(sub, 'config', 'user.name', 't')
  writeFileSync(join(sub, 'a.txt'), 'x\n')
  git(sub, 'add', '.')
  git(sub, 'commit', '-q', '-m', 'v140：某改动')
  const sha = git(sub, 'rev-parse', 'HEAD')
  mkdirSync(join(root, '.agents', 'intent-notes'), { recursive: true })
  writeFileSync(
    join(root, '.agents', 'intent-notes', 'config.yml'),
    'project: demo\nrepos:\n  - path: .\n    name: demo\n  - path: cloud\n    name: cloud\n',
  )

  const r = spawnSync('node', ['skills/intent-notes/scripts/backfill.ts', sha, root], { encoding: 'utf8' })
  assert.equal(r.status, 1, `上层仓库的 commit 被记到了 demo 名下：${r.stdout}`)
  assert.match(r.stderr, /不是独立仓库根/, r.stderr)
  rmSync(outer, { recursive: true, force: true })
})

test('CLI：找不到 commit 时 exit 1 且不产出片段', () => {
  const root = mkdtempSync(join(tmpdir(), 'intent-notes-bf-cli-'))
  // 仓库真实存在（否则走的是「路径不是仓库」那一态），只有 commit 不在
  git(root, 'init', '-q', '-b', 'main')
  mkdirSync(join(root, '.agents', 'intent-notes'), { recursive: true })
  writeFileSync(join(root, '.agents', 'intent-notes', 'config.yml'), 'project: demo\nrepos:\n  - path: .\n    name: demo\n')
  const r = spawnSync('node', ['skills/intent-notes/scripts/backfill.ts', 'deadbeef', root], { encoding: 'utf8' })
  assert.equal(r.status, 1, r.stderr)
  assert.match(r.stderr, /都找不到 commit deadbeef/)
  // 「commit 确实不在」与「git 不在 PATH」「路径不是仓库」必须可区分，否则用户无从下手
  assert.match(r.stderr, /Not a valid object name/, `探测失败的 stderr 被丢掉了：${r.stderr}`)
  assert.equal(r.stdout.trim(), '')
  rmSync(root, { recursive: true, force: true })
})

test('CLI：路径不存在时仓库根预检就点明，不再刷「都找不到 commit」', () => {
  const root = mkdtempSync(join(tmpdir(), 'intent-notes-bf-probe-'))
  mkdirSync(join(root, '.agents', 'intent-notes'), { recursive: true })
  writeFileSync(join(root, '.agents', 'intent-notes', 'config.yml'), 'project: demo\nrepos:\n  - path: nope\n    name: nope\n')
  const r = spawnSync('node', ['skills/intent-notes/scripts/backfill.ts', 'HEAD', root], { encoding: 'utf8' })
  assert.equal(r.status, 1, r.stderr)
  assert.match(r.stderr, /仓库清单预检失败/)
  assert.match(r.stderr, /nope/, `未指出是哪个仓库有问题：${r.stderr}`)
  // 「路径不存在」与「不是独立仓库根」「commit 确实不在」必须可区分，否则用户无从下手
  assert.match(r.stderr, /路径不存在/, `未点明原因：${r.stderr}`)
  rmSync(root, { recursive: true, force: true })
})

test('CLI：git 不在 PATH 时也给出可区分的原因', () => {
  const { root } = makeBackfillProject('intent-notes-bf-nogit-')
  // 清空 PATH 模拟 git 未安装：node 用绝对路径启动，只有 git 的查找会失败
  const r = spawnSync(process.execPath, ['skills/intent-notes/scripts/backfill.ts', 'HEAD', root], {
    encoding: 'utf8',
    env: { ...process.env, PATH: '', Path: '' },
  })
  assert.equal(r.status, 1, r.stderr)
  assert.match(r.stderr, /ENOENT/, `「git 不在 PATH」与「commit 确实不在」没区分开：${r.stderr}`)
  assert.match(r.stderr, /git 不可用/, `未点明 git 不可用：${r.stderr}`)
  rmSync(root, { recursive: true, force: true })
})

test('经 junction 调用 backfill 不得静默不产出', () => {
  // 部署态把 skill 目录做成 junction 是合法做法。旧写法拿 `import.meta.url` 与 argv[1] 比对
  // 判断主入口，经 junction 到达时两侧不等 → 整个 CLI 被跳过 → exit 0 且零输出。
  // 采集/渲染拆进 backfill-core.ts 后本文件是纯 CLI、不再需要守卫；本用例把 fail-open 钉住。
  const { link, base } = makeJunctionDeploy('intent-notes-deploy-bf-')
  const { root, sha } = makeBackfillProject('intent-notes-bf-junc-')
  try {
    const r = spawnSync('node', [join(link, 'scripts', 'backfill.ts'), sha, root], { encoding: 'utf8', cwd: skillRoot })
    assert.equal(r.status, 0, r.stderr)
    assert.match(r.stdout, /## 涉及仓库/, `经 junction 调用时被跳过了：stdout=${JSON.stringify(r.stdout)} stderr=${JSON.stringify(r.stderr)}`)
    assert.match(r.stdout, /- `cloud` 分支 `v140` commits `[0-9a-f]{7,40}`/)
  } finally {
    rmSync(root, { recursive: true, force: true })
    rmSync(base, { recursive: true, force: true })
  }
})

test('CLI：缺参数与缺 config 都 exit 1', () => {
  const noArg = spawnSync('node', ['skills/intent-notes/scripts/backfill.ts'], { encoding: 'utf8' })
  assert.equal(noArg.status, 1)
  assert.match(noArg.stderr ?? '', /用法/)

  const empty = mkdtempSync(join(tmpdir(), 'intent-notes-bf-nocfg-'))
  const noCfg = spawnSync('node', ['skills/intent-notes/scripts/backfill.ts', 'HEAD', empty], { encoding: 'utf8' })
  assert.equal(noCfg.status, 1)
  assert.match(noCfg.stderr ?? '', /config\.yml 不存在/)
  rmSync(empty, { recursive: true, force: true })
})

test('非 ASCII 文件名不被 git 八进制转义：写进笔记的必须是真实路径', () => {
  // core.quotepath 默认开启时 git 输出 `"\344\270\255\346\226\207.txt"`。AI 照抄进笔记就是
  // 假路径（grep/定位全失效），basename 启发式也永远匹配不上旧笔记，反而诱导新建重复笔记。
  const path = mkdtempSync(join(tmpdir(), 'intent-notes-bf-nonascii-'))
  git(path, 'init', '-q', '-b', 'main')
  git(path, 'config', 'user.email', 't@example.com')
  git(path, 'config', 'user.name', 't')
  writeFileSync(join(path, '中文文件.txt'), 'x\n')
  git(path, 'add', '.')
  git(path, 'commit', '-q', '-m', 'feat: 中文文件名')

  const ctx = collectCommitContext('cloud', path, 'HEAD')
  assert.deepEqual(ctx.files, ['中文文件.txt'], `路径被 git 转义了：${JSON.stringify(ctx.files)}`)
  rmSync(path, { recursive: true, force: true })
})

test('CLI：repos 条目不是独立仓库根时 exit 1，不得把上层仓库的 commit 记成子仓库', () => {
  // git 会向上寻找仓库：path 只是上层仓库里的普通目录时，cat-file 探测会命中上层仓库，
  // 渲染出的锚点行把外层 commit 记在子仓库名下——错锚点会被 AI 贴进永久笔记。
  const root = mkdtempSync(join(tmpdir(), 'intent-notes-bf-notroot-'))
  git(root, 'init', '-q', '-b', 'main')
  git(root, 'config', 'user.email', 't@example.com')
  git(root, 'config', 'user.name', 't')
  mkdirSync(join(root, 'inner'), { recursive: true })
  writeFileSync(join(root, 'inner', 'x.txt'), 'x\n')
  git(root, 'add', '.')
  git(root, 'commit', '-q', '-m', 'x')
  const sha = git(root, 'rev-parse', 'HEAD')

  mkdirSync(join(root, '.agents', 'intent-notes'), { recursive: true })
  writeFileSync(
    join(root, '.agents', 'intent-notes', 'config.yml'),
    'project: demo\nrepos:\n  - path: inner\n    name: inner\n  - path: .\n    name: outer\n',
  )

  const r = spawnSync('node', ['skills/intent-notes/scripts/backfill.ts', sha, root], { encoding: 'utf8' })
  assert.equal(r.status, 1, `上层仓库的 commit 被当成了 inner 的提交：${r.stdout}`)
  assert.match(r.stderr, /不是独立仓库根/, `未按仓库根预检报错：${r.stderr}`)
  assert.doesNotMatch(r.stdout, /- `inner` 分支/)
  rmSync(root, { recursive: true, force: true })
})

test('renderBackfill 自带用法指引：片段不得整段粘贴', () => {
  // 片段里有自己的 `## 涉及仓库` 段头；整体粘进笔记会造出第二个段头，门禁 3 判「重复段」
  const ctx = { repo: 'cloud', sha: 'abc1234', subject: 'x', branches: ['v140'], files: ['a.txt'] }
  const md = renderBackfill(ctx, [])
  assert.match(md, /不要整段粘贴/, `缺少用法指引：${md}`)
})

test('无分支路径的片段同样带用法指引', () => {
  const ctx = { repo: 'cloud', sha: 'abc1234', subject: 'x', branches: [], files: ['a.txt'] }
  assert.match(renderBackfill(ctx, []), /不要整段粘贴/)
})

test('按指引只搬锚点行时，片段能过门禁 3（端到端）', () => {
  const { root, sha } = makeBackfillProject('intent-notes-bf-paste-')
  try {
    const r = spawnSync('node', ['skills/intent-notes/scripts/backfill.ts', sha, root], { encoding: 'utf8' })
    assert.equal(r.status, 0, r.stderr)
    const anchorLine = r.stdout.split('\n').find(l => l.startsWith('- `cloud` 分支 '))
    assert.ok(anchorLine !== undefined, `片段里没有锚点行：${r.stdout}`)

    const dir = join(root, '.agents', 'notes', 'implemented', 'feature')
    mkdirSync(dir, { recursive: true })
    const note = [
      '# Agent Note: t', '', 'Status: implemented', '', '## Problem', '', 'p',
      '', '## Decision', '', 'd',
      '', '## 涉及仓库', '', anchorLine,
      '', '## Alternatives considered', '', '- a',
      '', '## Consequences', '', 'c', '',
    ].join('\n')
    writeFileSync(join(dir, '2026-01-01-t.md'), note)

    const gate = spawnSync('node', ['skills/intent-notes/scripts/verify-note-anchors.ts', root], { encoding: 'utf8' })
    assert.equal(gate.status, 0, `只搬锚点行仍被判红：${gate.stderr}`)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})
