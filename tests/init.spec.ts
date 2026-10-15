import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, existsSync, readFileSync, readdirSync, cpSync, symlinkSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { spawnSync } from 'node:child_process'
import { detectSubRepos, renderConfig, renderGitignore } from '../skills/intent-notes/scripts/init-core.ts'
import { parseRepoList } from '../skills/intent-notes/scripts/note-anchors.ts'

const skillRoot = resolve(import.meta.dirname, '../skills/intent-notes')

function git(cwd: string, ...args: string[]): void {
  const r = spawnSync('git', args, { cwd, encoding: 'utf8' })
  assert.equal(r.status, 0, r.stderr)
}

/** 把整个 skill 目录复制到临时位置，并造一个指向它的 junction（模拟 skill 部署态）。 */
function makeJunctionDeploy(): { link: string; base: string } {
  const base = mkdtempSync(join(tmpdir(), 'intent-notes-deploy-init-'))
  const deployed = join(base, 'intent-notes')
  cpSync(skillRoot, deployed, { recursive: true })   // 部署 = 整目录复制，与文档一致
  const link = join(base, 'skill-deploy')
  symlinkSync(deployed, link, 'junction')
  return { link, base }
}

/** 造一个 polyrepo 项目：根无 git，下挂两个子仓库，外加一个非仓库目录。 */
function makePolyrepo(): string {
  const root = mkdtempSync(join(tmpdir(), 'intent-notes-init-'))
  for (const name of ['cloud', 'vue']) {
    const p = join(root, name)
    mkdirSync(p, { recursive: true })
    git(p, 'init', '-q')
  }
  mkdirSync(join(root, 'docs'), { recursive: true })
  writeFileSync(join(root, 'AGENTS.md'), '# 项目规矩\n')
  return root
}

test('探测出子仓库，且不误报普通目录', () => {
  const root = makePolyrepo()
  assert.deepEqual(detectSubRepos(root).sort(), ['cloud', 'vue'])
  rmSync(root, { recursive: true, force: true })
})

test('gitignore 片段把每个子仓库都排除', () => {
  const text = renderGitignore(['cloud', 'vue'])
  assert.match(text, /^\/cloud\/$/m)
  assert.match(text, /^\/vue\/$/m)
})

test('config.yml 含项目根与全部子仓库', () => {
  const text = renderConfig('demo-project', ['cloud', 'vue'])
  assert.match(text, /^project: demo-project$/m)
  // 项目根必须在内：单仓库项目下它是唯一仓库，缺了它锚点门禁对每篇笔记恒红
  assert.match(text, /- path: \.\n\s+name: demo-project/)
  assert.match(text, /- path: cloud\n\s+name: cloud/)
  assert.match(text, /- path: vue\n\s+name: vue/)
})

test('init 端到端：建目录、写 config、写 gitignore、根目录 git init', () => {
  const root = makePolyrepo()
  const r = spawnSync('node', ['skills/intent-notes/scripts/init.ts', root], { encoding: 'utf8' })
  assert.equal(r.status, 0, r.stderr)

  for (const lifecycle of ['proposed', 'implemented', 'rejected', 'archived']) {
    for (const cls of ['feature', 'bug-fix', 'simplification', 'architecture', 'process', 'testing']) {
      assert.ok(existsSync(join(root, '.agents', 'notes', lifecycle, cls)), `${lifecycle}/${cls} 未创建`)
    }
  }
  assert.ok(existsSync(join(root, '.agents', 'intent-notes', 'config.yml')))
  // 项目根必须出现在 repos 里，否则锚点门禁对单仓库项目恒红
  assert.match(readFileSync(join(root, '.agents', 'intent-notes', 'config.yml'), 'utf8'), /- path: \.\n\s+name: /)
  assert.ok(existsSync(join(root, '.agents', 'notes', 'README.md')), 'notes/README.md 未创建（子仓库指针会因此悬空）')
  assert.ok(existsSync(join(root, '.git')), '项目根应已 git init')
  assert.match(readFileSync(join(root, '.gitignore'), 'utf8'), /^\/cloud\/$/m)
  rmSync(root, { recursive: true, force: true })
})

test('--dry-run 不落盘，且先打印计划', () => {
  const root = makePolyrepo()
  const r = spawnSync('node', ['skills/intent-notes/scripts/init.ts', root, '--dry-run'], { encoding: 'utf8' })
  assert.equal(r.status, 0, r.stderr)
  // 四个写入目标一个都不能出现——只查 .agents/.git 会漏掉「先写 config 再判 dry-run」的重构
  assert.equal(existsSync(join(root, '.agents')), false)
  assert.equal(existsSync(join(root, '.agents', 'intent-notes')), false)
  assert.equal(existsSync(join(root, '.gitignore')), false)
  assert.equal(existsSync(join(root, '.git')), false)
  assert.match(r.stdout, /init --dry-run/)
  rmSync(root, { recursive: true, force: true })
})

test('config.yml 已存在时不覆盖（人工补的 repos 条目会丢）', () => {
  const root = makePolyrepo()
  const cfgDir = join(root, '.agents', 'intent-notes')
  mkdirSync(cfgDir, { recursive: true })
  const handEdited = 'project: demo\nrepos:\n  - path: .\n    name: demo\n  - path: deep/inner\n    name: inner\n'
  writeFileSync(join(cfgDir, 'config.yml'), handEdited)

  const r = spawnSync('node', ['skills/intent-notes/scripts/init.ts', root], { encoding: 'utf8' })
  assert.equal(r.status, 0, r.stderr)
  assert.equal(readFileSync(join(cfgDir, 'config.yml'), 'utf8'), handEdited, 'config.yml 被覆盖了')
  // 计划清单统一用「字面量 + 反引号」：断言写全路径，防止 join() 出的反斜杠路径再混回来
  assert.match(r.stdout, /`\.agents\/intent-notes\/config\.yml` 已存在，跳过/)
  rmSync(root, { recursive: true, force: true })
})

test('README.md 已存在时不覆盖（文件头承诺不修改既有文件）', () => {
  const root = makePolyrepo()
  const dir = join(root, '.agents', 'notes')
  mkdirSync(dir, { recursive: true })
  const mine = '# 我们自己的说明\n'
  writeFileSync(join(dir, 'README.md'), mine)

  const r = spawnSync('node', ['skills/intent-notes/scripts/init.ts', root], { encoding: 'utf8' })
  assert.equal(r.status, 0, r.stderr)
  assert.equal(readFileSync(join(dir, 'README.md'), 'utf8'), mine, 'README.md 被覆盖了')
  assert.match(r.stdout, /`\.agents\/notes\/README\.md` 已存在，跳过/)
  rmSync(root, { recursive: true, force: true })
})

test('notes/README.md 解释整棵目录树（生命周期 + 分类 + 索引禁令）', () => {
  const root = makePolyrepo()
  const r = spawnSync('node', ['skills/intent-notes/scripts/init.ts', root], { encoding: 'utf8' })
  assert.equal(r.status, 0, r.stderr)
  const readme = readFileSync(join(root, '.agents', 'notes', 'README.md'), 'utf8')

  // init 一次建出 24 个空目录。README 不解释它们，翻到这个目录的人只能靠猜
  for (const lifecycle of ['proposed', 'implemented', 'rejected', 'archived']) {
    assert.match(readme, new RegExp(`\`${lifecycle}/\``), `README 未解释生命周期目录 ${lifecycle}/`)
  }
  for (const cls of ['feature', 'bug-fix', 'simplification', 'architecture', 'process', 'testing']) {
    assert.match(readme, new RegExp(`\`${cls}\``), `README 未解释分类 ${cls}`)
  }
  assert.match(readme, /INDEX\.md/, 'README 未写禁止 INDEX.md')
  // README 不会随 skill 升级更新（init 跳过已存在的），所以只能是概览：判据必须回指 skill
  assert.match(readme, /intent-notes/, 'README 未指向 skill')
  rmSync(root, { recursive: true, force: true })
})

test('模板缺失时 fail-closed：不静默生成缺说明的 README', () => {
  const { base } = makeJunctionDeploy()
  const root = makePolyrepo()
  try {
    rmSync(join(base, 'intent-notes', 'templates', 'notes-readme.md'))
    const r = spawnSync('node', [join(base, 'intent-notes', 'scripts', 'init.ts'), root], { encoding: 'utf8' })
    assert.notEqual(r.status, 0, '模板缺失却成功了：notes/README.md 会静默缺失、子仓库指针悬空')
    assert.match(r.stderr, /缺少模板/)
    // 检查必须在任何写入之前，否则会留下半截骨架
    assert.equal(existsSync(join(root, '.agents')), false, '模板缺失时仍落了盘')
    assert.equal(existsSync(join(root, '.git')), false, '模板缺失时仍做了 git init')
  } finally {
    rmSync(root, { recursive: true, force: true })
    rmSync(base, { recursive: true, force: true })
  }
})

test('名称含空白也能建骨架（parseRepoList 已放宽）', () => {
  const parent = mkdtempSync(join(tmpdir(), 'intent-notes-init-sp-'))
  const root = join(parent, 'my project')
  mkdirSync(root, { recursive: true })
  const r = spawnSync('node', ['skills/intent-notes/scripts/init.ts', root], { encoding: 'utf8' })
  assert.equal(r.status, 0, r.stderr)
  // 含空格的 config 必须能被自家锚点门禁的解析器读懂，否则门禁对每篇笔记恒红
  const cfg = readFileSync(join(root, '.agents', 'intent-notes', 'config.yml'), 'utf8')
  assert.deepEqual([...parseRepoList(cfg).entries()], [['my project', '.']])
  rmSync(parent, { recursive: true, force: true })
})

test('import init-core.ts 不触发 CLI 副作用', () => {
  // 纯逻辑已拆进 init-core.ts。若它顶层无条件执行（或有人把 CLI 挪回去），这个 import
  // 会拿 cwd 当项目根建骨架；这里用临时目录当 cwd，把那次误写暴露成断言。
  const root = makePolyrepo()
  const url = new URL('../skills/intent-notes/scripts/init-core.ts', import.meta.url).href
  const r = spawnSync('node', ['--input-type=module', '-e', `await import(${JSON.stringify(url)})`], {
    cwd: root,
    encoding: 'utf8',
  })
  assert.equal(r.status, 0, r.stderr)
  assert.equal(existsSync(join(root, '.agents')), false, 'import 触发了 CLI：在 cwd 里建了笔记骨架')
  assert.equal(existsSync(join(root, '.agents', 'intent-notes')), false, 'import 触发了 CLI：在 cwd 里写了 config.yml')
  rmSync(root, { recursive: true, force: true })
})

test('init.ts 保持纯 CLI：不得再导出任何东西', () => {
  // 无导出才无人 import 它——纯 CLI 一旦被 import 就会无条件执行。
  // 有导出就说明纯逻辑长回了 CLI 文件，守卫的 fail-open 也会跟着长回来。
  const src = readFileSync(join(skillRoot, 'scripts', 'init.ts'), 'utf8')
  assert.doesNotMatch(src, /^export /m, 'init.ts 又导出了东西：纯逻辑应留在 init-core.ts')
})

test('经 junction 调用 init 不得静默不落盘', () => {
  // 部署态把 skill 目录做成 junction 是合法做法。旧写法拿 `import.meta.url` 与 argv[1] 比对
  // 判断主入口，经 junction 到达时两侧不等 → 整个 CLI 被跳过 → exit 0 且骨架一个都没建。
  // 探测/渲染拆进 init-core.ts 后本文件是纯 CLI、不再需要守卫；本用例把 fail-open 钉住。
  const { link, base } = makeJunctionDeploy()
  const root = makePolyrepo()
  try {
    const r = spawnSync('node', [join(link, 'scripts', 'init.ts'), root], { encoding: 'utf8', cwd: skillRoot })
    assert.equal(r.status, 0, r.stderr)
    assert.match(r.stdout, /init: 骨架已建立/, `经 junction 调用时被跳过了：stdout=${JSON.stringify(r.stdout)} stderr=${JSON.stringify(r.stderr)}`)
    assert.ok(existsSync(join(root, '.agents', 'notes', 'implemented', 'feature')), '经 junction 调用时骨架未落盘')
    assert.ok(existsSync(join(root, '.agents', 'intent-notes', 'config.yml')), '经 junction 调用时 config.yml 未落盘')
    assert.match(readFileSync(join(root, '.gitignore'), 'utf8'), /^\/cloud\/$/m)
  } finally {
    rmSync(root, { recursive: true, force: true })
    rmSync(base, { recursive: true, force: true })
  }
})

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
  } finally {
    rmSync(base, { recursive: true, force: true })
  }
})
