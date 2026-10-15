import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { spawnSync } from 'node:child_process'
import { parseAnchors, parseRepoList, parseRepoListChecked, checkRepoRoots, verifyAnchors } from '../skills/intent-notes/scripts/note-anchors.ts'

const skillRoot = resolve(import.meta.dirname, '../skills/intent-notes')

function git(cwd: string, ...args: string[]): string {
  // -c 覆盖全局 git 配置：gpgsign 会让 commit 失败，core.abbrev 会让 --short 不足 7 位而锚点门禁判红
  const r = spawnSync('git', ['-c', 'commit.gpgsign=false', '-c', 'core.abbrev=40', ...args], { cwd, encoding: 'utf8' })
  assert.equal(r.status, 0, `git ${args.join(' ')} 失败：${r.stderr}`)
  return r.stdout.trim()
}

/** 建一个临时 git 仓库，在指定分支上产生一个 commit，返回 { path, sha }。 */
function makeRepo(branch: string, file = 'src/a.java'): { path: string; sha: string } {
  const path = mkdtempSync(join(tmpdir(), 'intent-notes-repo-'))
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

/** 门禁 3 只看锚点段；其余节只要让它是树里的一篇笔记即可。 */
const NOTE_MIN = `# Agent Note: t

Status: implemented

## Problem

t

## Decision

t

## 涉及仓库

- \`cloud\` 不涉及

## Alternatives considered

**x。** y。z。

## Consequences

**收益：** a

**代价：** b
`

/** 在项目根（须是独立仓库根）里放一篇笔记与一份 config.yml。 */
function scaffoldNote(projectRoot: string, note: string, reposYaml: string): void {
  const abs = join(projectRoot, '.agents', 'notes', 'implemented', 'feature', '2026-01-01-t.md')
  mkdirSync(dirname(abs), { recursive: true })
  writeFileSync(abs, note)
  mkdirSync(join(projectRoot, '.agents', 'intent-notes'), { recursive: true })
  writeFileSync(join(projectRoot, '.agents', 'intent-notes', 'config.yml'), `project: t\nrepos:\n${reposYaml}`)
}

/** 跑真正的门禁 3 CLI，返回退出码与输出。 */
function runAnchorGate(projectRoot: string): { code: number; stdout: string; stderr: string } {
  const r = spawnSync('node', [join(skillRoot, 'scripts', 'verify-note-anchors.ts'), projectRoot], {
    encoding: 'utf8',
    cwd: skillRoot,
  })
  return { code: r.status ?? -1, stdout: r.stdout ?? '', stderr: r.stderr ?? '' }
}

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

test('parseRepoList：name 写在 path 之前也能解析', () => {
  // bootstrap 阶段 2 是人工补 repos 条目，YAML 键序对写的人没有约束；
  // 只认 path 在前的写法会让整条静默消失，门禁随即对相关笔记报「未在项目声明中」
  const config = [
    'project: demo',
    'repos:',
    '  - name: cloud',
    '    path: cloud',
    '  - name: demo',
    '    path: .',
    'sources:',
    '  - docs/superpowers/specs',
    '',
  ].join('\n')
  assert.deepEqual([...parseRepoList(config).entries()], [['cloud', 'cloud'], ['demo', '.']])
})

test('parseRepoListChecked：重复仓库名报错而非静默覆盖', () => {
  const config = ['repos:', '  - path: a', '    name: cloud', '  - path: b', '    name: cloud', ''].join('\n')
  const { repos, errors } = parseRepoListChecked(config)
  assert.equal(repos.get('cloud'), 'a')
  assert.equal(errors.length, 1)
  assert.match(errors[0] ?? '', /仓库名 `cloud` 重复/)
})

test('parseRepoList：条目与 repos: 同缩进（合法 YAML）也能解析', () => {
  const config = ['project: demo', 'repos:', '- name: cloud', '  path: cloud', 'sources:', '  - x', ''].join('\n')
  assert.deepEqual([...parseRepoList(config).entries()], [['cloud', 'cloud']])
})

test('门禁 3 端到端：独立仓库根 + 真实锚点则通过', () => {
  // 预检引入了新的致命分支，需要一条绿灯路径钉住「不会恒红」
  const repo = makeRepo('main')
  try {
    // NOTE_OK 里的 uniapp 是「不涉及」，但声明里出现的仓库必须在 config 中有条目
    scaffoldNote(
      repo.path,
      NOTE_OK.replace('BRANCH', 'main').replace('SHA', repo.sha),
      '  - path: .\n    name: cloud\n  - path: .\n    name: uniapp\n',
    )
    const { code, stdout } = runAnchorGate(repo.path)
    assert.equal(code, 0, stdout)
    assert.match(stdout, /锚点全部有效/)
  } finally {
    rmSync(repo.path, { recursive: true, force: true })
  }
})

test('嵌套围栏（4 套 3）里的示例段不得顶替真段：门禁 3 必须报红', () => {  const repo = makeRepo('main')
  try {
    const note = [
      '# Agent Note: t', '', 'Status: implemented', '',
      '## Problem', '',
      '记录本格式的笔记会引示例：', '',
      '````markdown',
      '```markdown',
      '## 涉及仓库', '',
      '- `cloud` 不涉及',
      '```',
      '````', '',
      '## 涉及仓库', '',
      `- \`cloud\` 分支 \`no-such-branch\` commits \`${repo.sha}\``, '',
      '## Decision', '', 't', '',
      '## Alternatives considered', '', 'x', '',
      '## Consequences', '', 't', '',
    ].join('\n')
    // 内层 3 反引号若被当成闭合行，真段会被示例段顶替，真段里的假分支永远查不出来
    const parsed = parseAnchors(note)
    assert.deepEqual(parsed.errors, [])
    assert.deepEqual(parsed.repos.map(r => r.name), ['cloud'])

    scaffoldNote(repo.path, note, '  - path: .\n    name: cloud\n')
    const { code, stderr } = runAnchorGate(repo.path)
    assert.equal(code, 1, `门禁 3 静默放绿：${stderr}`)
    assert.match(stderr, /分支 no-such-branch 不存在/)
  } finally {
    rmSync(repo.path, { recursive: true, force: true })
  }
})

test('重复的 ## 涉及仓库 段报错（第二个段不会被静默放过）', () => {
  const text = [
    '## 涉及仓库', '',
    '- `cloud` 分支 `v140` commits `abc1234`', '',
    '## Decision', '', 't', '',
    '## 涉及仓库', '',
    '- `cloud` 分支 `no-such-branch` commits `abc1234`',
  ].join('\n')
  const { repos, errors } = parseAnchors(text)
  assert.equal(errors.length, 1)
  assert.match(errors[0] ?? '', /重复的 `## 涉及仓库` 段/)
  assert.equal(repos.length, 1)
})

test('## 涉及仓库 允许 ≤3 空格缩进', () => {
  const { repos, errors } = parseAnchors(['## Problem', '', '  ## 涉及仓库', '', '- `cloud` 不涉及'].join('\n'))
  assert.deepEqual(errors, [])
  assert.equal(repos.length, 1)
})

test('子目录不是独立仓库根时门禁 3 报红（禁止锚定到上层仓库）', () => {
  const repo = makeRepo('main')
  try {
    // cloud 只是普通目录，却被 config 声明成一个仓库；git 会向上找到 root 仓库，
    // 于是 root 的分支与 commit 被当成 cloud 的事实，假锚点全判有效
    mkdirSync(join(repo.path, 'cloud'), { recursive: true })
    const note = [
      '# Agent Note: t', '', 'Status: implemented', '',
      '## Problem', '', 't', '',
      '## Decision', '', 't', '',
      '## 涉及仓库', '',
      `- \`cloud\` 分支 \`main\` commits \`${repo.sha}\``, '',
      '## Alternatives considered', '', 'x', '',
      '## Consequences', '', 't', '',
    ].join('\n')
    scaffoldNote(repo.path, note, '  - path: .\n    name: root\n  - path: cloud\n    name: cloud\n')
    const { code, stderr } = runAnchorGate(repo.path)
    assert.equal(code, 1, `锚点校验到上层仓库却放绿：${stderr}`)
    assert.match(stderr, /不是独立仓库根/)
  } finally {
    rmSync(repo.path, { recursive: true, force: true })
  }
})

test('checkRepoRoots：独立仓库根通过，上层仓库/不存在/非仓库都报出', () => {
  const repo = makeRepo('main')
  const child = join(repo.path, 'sub')
  const plain = mkdtempSync(join(tmpdir(), 'intent-notes-plain-'))
  try {
    mkdirSync(child, { recursive: true })
    const issues = checkRepoRoots(new Map([
      ['ok', repo.path],
      ['child', child],
      ['missing', join(repo.path, 'nope')],
      ['plain', plain],
    ]))
    assert.equal(issues.find(i => i.name === 'ok'), undefined)
    assert.match(issues.find(i => i.name === 'child')?.reason ?? '', /不是独立仓库根/)
    assert.equal(issues.find(i => i.name === 'missing')?.reason, '路径不存在')
    // tmp 目录若被某个外层仓库覆盖，报「属于上层仓库」同样算检出——两种都不能放过
    assert.ok(issues.find(i => i.name === 'plain') !== undefined)
  } finally {
    rmSync(repo.path, { recursive: true, force: true })
    rmSync(plain, { recursive: true, force: true })
  }
})

test('config 里 repos 为空时门禁 3 报一次配置错，而不是逐篇刷屏', () => {
  const repo = makeRepo('main')
  try {
    scaffoldNote(repo.path, NOTE_MIN, '')
    const { code, stderr } = runAnchorGate(repo.path)
    assert.equal(code, 1)
    assert.match(stderr, /没有解析出任何仓库/)
    // 逐篇报错的行都以 `  anchors: <笔记> —` 开头；这一条不该出现
    assert.doesNotMatch(stderr, /^ {2}anchors:/m)
  } finally {
    rmSync(repo.path, { recursive: true, force: true })
  }
})

test('config 里仓库名重复时门禁 3 报配置错', () => {
  const repo = makeRepo('main')
  try {
    scaffoldNote(repo.path, NOTE_MIN, '  - path: .\n    name: cloud\n  - path: .\n    name: cloud\n')
    const { code, stderr } = runAnchorGate(repo.path)
    assert.equal(code, 1)
    assert.match(stderr, /仓库清单配置有误/)
    assert.match(stderr, /重复/)
  } finally {
    rmSync(repo.path, { recursive: true, force: true })
  }
})

test('parseRepoList：repos 段内的顶格注释不得截断后续条目', () => {
  // 顶格 `#` 是合法 YAML。旧写法把「非空白开头」一律当成下一个顶层键并 break，
  // 注释之后的仓库条目被静默丢弃：声明它的笔记误报「未在项目声明中」，
  // 而本该涉及它却写「不涉及」的笔记永远查不出来。
  const config = [
    'repos:',
    '  - name: a',
    '    path: .',
    '# 下面这个注释顶格，是合法 YAML',
    '  - name: b',
    '    path: ./b',
  ].join('\n')
  const { repos, errors } = parseRepoListChecked(config)
  assert.deepEqual([...repos.entries()], [['a', '.'], ['b', './b']], `条目被注释截断了：${JSON.stringify([...repos])}`)
  assert.deepEqual(errors, [])
})

test('parseRepoList：repos 段内的缩进注释不改变解析结果', () => {
  const config = [
    'repos:',
    '  # 缩进注释',
    '  - name: a',
    '    path: .',
    '    # 条目内注释',
    '  - name: b',
    '    path: ./b',
    'sources:',
    '  - docs',
  ].join('\n')
  const { repos, errors } = parseRepoListChecked(config)
  assert.deepEqual([...repos.entries()], [['a', '.'], ['b', './b']])
  assert.deepEqual(errors, [])
})

test('分支与 commit 只存在于 origin/* 时锚点仍然有效', () => {
  // 本地 checkout 通常没有其他分支的本地 ref：只查 refs/heads/ 会把团队的 feature 分支判为不存在
  const bare = mkdtempSync(join(tmpdir(), 'intent-notes-bare-'))
  const work = mkdtempSync(join(tmpdir(), 'intent-notes-work-'))
  const parent = mkdtempSync(join(tmpdir(), 'intent-notes-cloneparent-'))
  const clone = join(parent, 'work')
  try {
    git(bare, 'init', '-q', '--bare', '-b', 'main')
    git(work, 'init', '-q', '-b', 'main')
    git(work, 'config', 'user.email', 't@example.com')
    git(work, 'config', 'user.name', 't')
    writeFileSync(join(work, 'a.txt'), 'x\n')
    git(work, 'add', '.')
    git(work, 'commit', '-q', '-m', 'v140: 初始')
    git(work, 'remote', 'add', 'origin', bare)
    git(work, 'push', '-q', 'origin', 'main')
    git(work, 'checkout', '-q', '-b', 'feature/x')
    writeFileSync(join(work, 'b.txt'), 'y\n')
    git(work, 'add', '.')
    git(work, 'commit', '-q', '-m', 'v140: feature')
    git(work, 'push', '-q', 'origin', 'feature/x')
    const sha = git(work, 'rev-parse', 'HEAD')

    git(parent, 'clone', '-q', bare, clone)
    const localHead = spawnSync('git', ['show-ref', '--verify', '--quiet', 'refs/heads/feature/x'], { cwd: clone })
    assert.notEqual(localHead.status, 0, '克隆里竟有本地 feature/x，这一用例测不到远程兜底')

    const note = [
      '# Agent Note: t', '', 'Status: implemented', '', '## Problem', '', 'p',
      '', '## Decision', '', 'd',
      '', '## 涉及仓库', '', `- \`self\` 分支 \`feature/x\` commits \`${sha}\``,
      '', '## Alternatives considered', '', '- a',
      '', '## Consequences', '', 'c', '',
    ].join('\n')
    const out = verifyAnchors('implemented/feature/2026-01-01-a.md', note, new Map([['self', clone]]))
    assert.deepEqual(out, [], `远程分支锚点被判无效：${out.join(' | ')}`)
  } finally {
    rmSync(bare, { recursive: true, force: true })
    rmSync(work, { recursive: true, force: true })
    rmSync(parent, { recursive: true, force: true })
  }
})
