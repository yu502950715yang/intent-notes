/**
 * init 的纯逻辑：探测子仓库、渲染待写入的两份文本。
 *
 * 拆出来是为了让 init.ts 成为**无导出的纯 CLI**——旧写法靠
 * `fileURLToPath(import.meta.url) === resolve(process.argv[1])` 判断主入口，
 * 经 symlink/junction 到达时两侧不等，骨架静默不落盘（exit 0、零输出）。
 * 本模块只读文件系统、无模块级副作用，spec 直接 import 它。
 */
import { existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

export const MARKER = '# --- Intent Notes ---'

/** 找出项目根下含 .git 的直接子目录，即 polyrepo 的子仓库。 */
export function detectSubRepos(projectRoot: string): string[] {
  const out: string[] = []
  for (const entry of readdirSync(projectRoot, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue
    if (existsSync(join(projectRoot, entry.name, '.git'))) out.push(entry.name)
  }
  return out.sort()
}

/** 生成 .gitignore 片段：只排除探测到的子仓库，不掺入某个特定项目的模式。 */
export function renderGitignore(subRepos: string[]): string {
  const lines = [MARKER, ...subRepos.map(r => `/${r}/`), '']
  return lines.join('\n')
}

/** 生成 .agents/intent-notes/config.yml。仓库名默认取其目录名。 */
export function renderConfig(project: string, subRepos: string[]): string {
  const lines = [`project: ${project}`, 'repos:']
  // 项目根自身也是一个仓库：单仓库项目下它就是唯一仓库，polyrepo 下它承载 .agents/ 与笔记。
  // 不写入它会让单仓库项目的 repos 为空，锚点门禁对每篇笔记恒报「仓库未在项目声明中」。
  lines.push('  - path: .', `    name: ${project}`)
  for (const r of subRepos) lines.push(`  - path: ${r}`, `    name: ${r}`)
  lines.push('sources:', '  - docs/superpowers/specs', '  - docs/superpowers/plans', '  - docs/superpowers/sdd')
  return `${lines.join('\n')}\n`
}
