import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync, existsSync, symlinkSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import {
  checkSeal, forgetOne, listSealedFiles, readManifest, resealOne, writeSeal, SEAL_MANIFEST,
} from '../skills/intent-notes/scripts/seal-core.ts'

/** 建一棵 notes 树，notes 为 相对路径 -> 文件内容。 */
function scaffold(notes: Record<string, string>): string {
  const root = mkdtempSync(join(tmpdir(), 'intent-notes-seal-'))
  for (const [rel, body] of Object.entries(notes)) {
    const abs = join(root, rel)
    mkdirSync(dirname(abs), { recursive: true })
    writeFileSync(abs, body)
  }
  return root
}

const NOTE = 'bug-fix/2026-01-01-a.md'
const ARCHIVED: Record<string, string> = { [`archived/${NOTE}`]: '# Agent Note: a\n\nStatus: implemented\nArchived: 2026-01-02\n\n## Problem\n\nx\n' }

function manifestOf(root: string): { artifacts: Record<string, string>; history: unknown[] } {
  return JSON.parse(readFileSync(join(root, 'archived', SEAL_MANIFEST), 'utf8'))
}

test('空归档树：通过，且不要求 manifest 存在', () => {
  const root = scaffold({ 'implemented/feature/2026-01-01-x.md': 'x' })
  const { errors, sealed } = checkSeal(root)
  assert.deepEqual(errors, [])
  assert.equal(sealed, 0)
  rmSync(root, { recursive: true, force: true })
})

test('--write 首次封印：manifest 不存在时封存全部条目', () => {
  const root = scaffold(ARCHIVED)
  const { errors, added } = writeSeal(root)
  assert.deepEqual(errors, [])
  assert.deepEqual(added, [NOTE])
  assert.match(manifestOf(root).artifacts[NOTE] ?? '', /^[0-9a-f]{64}$/)
  assert.deepEqual(checkSeal(root).errors, [])
  rmSync(root, { recursive: true, force: true })
})

test('--write 幂等：无新增时不改 manifest', () => {
  const root = scaffold(ARCHIVED)
  writeSeal(root)
  const before = readFileSync(join(root, 'archived', SEAL_MANIFEST), 'utf8')
  const { errors, added } = writeSeal(root)
  assert.deepEqual(errors, [])
  assert.deepEqual(added, [])
  assert.equal(readFileSync(join(root, 'archived', SEAL_MANIFEST), 'utf8'), before)
  rmSync(root, { recursive: true, force: true })
})

test('新增一篇归档后 --write 只追加，既有条目不动', () => {
  const root = scaffold(ARCHIVED)
  writeSeal(root)
  const second = 'feature/2026-02-02-b.md'
  mkdirSync(dirname(join(root, 'archived', second)), { recursive: true })
  writeFileSync(join(root, 'archived', second), '# Agent Note: b\n\nStatus: implemented\nArchived: 2026-02-03\n')
  const { errors, added } = writeSeal(root)
  assert.deepEqual(errors, [])
  assert.deepEqual(added, [second])
  assert.equal(Object.keys(manifestOf(root).artifacts).length, 2)
  rmSync(root, { recursive: true, force: true })
})

test('既有条目被改后 --write 报错且不写入（只追加的核心保证）', () => {
  const root = scaffold(ARCHIVED)
  writeSeal(root)
  const before = readFileSync(join(root, 'archived', SEAL_MANIFEST), 'utf8')
  writeFileSync(join(root, 'archived', NOTE), '# Agent Note: a 改过\n\nStatus: implemented\nArchived: 2026-01-02\n')
  const { errors, added } = writeSeal(root)
  assert.equal(errors.length, 1)
  assert.match(errors[0] ?? '', /既有封存条目已改动/)
  assert.deepEqual(added, [])
  assert.equal(readFileSync(join(root, 'archived', SEAL_MANIFEST), 'utf8'), before)
  rmSync(root, { recursive: true, force: true })
})

test('未封存 → 判红', () => {
  const root = scaffold(ARCHIVED)
  writeFileSync(join(root, 'archived', SEAL_MANIFEST), JSON.stringify({ version: 1, artifacts: {}, history: [] }))
  const { errors } = checkSeal(root)
  assert.equal(errors.length, 1)
  assert.match(errors[0] ?? '', /未封存/)
  rmSync(root, { recursive: true, force: true })
})

test('内容改动 → 判红', () => {
  const root = scaffold(ARCHIVED)
  writeSeal(root)
  writeFileSync(join(root, 'archived', NOTE), '# Agent Note: a 改过\n\nStatus: implemented\nArchived: 2026-01-02\n')
  const { errors } = checkSeal(root)
  assert.equal(errors.length, 1)
  assert.match(errors[0] ?? '', /内容已改动/)
  rmSync(root, { recursive: true, force: true })
})

test('删除 → 判红', () => {
  const root = scaffold(ARCHIVED)
  writeSeal(root)
  rmSync(join(root, 'archived', NOTE))
  const { errors } = checkSeal(root)
  assert.equal(errors.length, 1)
  assert.match(errors[0] ?? '', /已删除/)
  rmSync(root, { recursive: true, force: true })
})

test('manifest 缺失但有归档笔记 → 报整棵树未封存', () => {
  const root = scaffold(ARCHIVED)
  const { errors } = checkSeal(root)
  assert.equal(errors.length, 1)
  assert.match(errors[0] ?? '', /未封存/)
  rmSync(root, { recursive: true, force: true })
})

test('manifest 非法 JSON → fail-closed', () => {
  const root = scaffold(ARCHIVED)
  writeFileSync(join(root, 'archived', SEAL_MANIFEST), '{ not json')
  const { errors } = checkSeal(root)
  assert.equal(errors.length, 1)
  assert.match(errors[0] ?? '', /无法解析/)
  assert.equal(writeSeal(root).errors.length, 1)
  rmSync(root, { recursive: true, force: true })
})

test('--reseal 更新封印并留痕；缺理由或内容未变都拒绝', () => {
  const root = scaffold(ARCHIVED)
  writeSeal(root)
  writeFileSync(join(root, 'archived', NOTE), '# Agent Note: a 修正\n\nStatus: implemented\nArchived: 2026-01-02\n')
  assert.deepEqual(resealOne(root, NOTE, '', '2026-03-01').errors.length, 1)
  assert.deepEqual(resealOne(root, NOTE, '首次归档时日期写错', '2026-03-01').errors, [])
  assert.deepEqual(checkSeal(root).errors, [])
  const m = manifestOf(root) as { history: Array<Record<string, string>> }
  assert.equal(m.history.length, 1)
  assert.equal(m.history[0]?.action, 'reseal')
  assert.equal(m.history[0]?.at, '2026-03-01')
  assert.match(m.history[0]?.from ?? '', /^[0-9a-f]{64}$/)
  assert.match(m.history[0]?.to ?? '', /^[0-9a-f]{64}$/)
  // 内容未变时再 reseal 是滥用，拒绝
  assert.equal(resealOne(root, NOTE, '再来一次', '2026-03-02').errors.length, 1)
  rmSync(root, { recursive: true, force: true })
})

test('--reseal 对未封存路径拒绝', () => {
  const root = scaffold(ARCHIVED)
  writeSeal(root)
  assert.equal(resealOne(root, 'feature/2026-09-09-nope.md', '理由', '2026-03-01').errors.length, 1)
  rmSync(root, { recursive: true, force: true })
})

test('--forget 删除条目并留痕；文件仍在时拒绝', () => {
  const root = scaffold(ARCHIVED)
  writeSeal(root)
  assert.equal(forgetOne(root, NOTE, '', '2026-03-01').errors.length, 1)
  assert.equal(forgetOne(root, NOTE, '误归档', '2026-03-01').errors.length, 1, '文件仍在时应拒绝')
  rmSync(join(root, 'archived', NOTE))
  assert.deepEqual(forgetOne(root, NOTE, '误归档', '2026-03-01').errors, [])
  assert.deepEqual(checkSeal(root).errors, [])
  const m = manifestOf(root) as { artifacts: Record<string, string>; history: Array<Record<string, string>> }
  assert.equal(m.artifacts[NOTE], undefined)
  assert.equal(m.history[0]?.action, 'forget')
  rmSync(root, { recursive: true, force: true })
})

test('哈希对象是归一化行尾的文本：LF 与 CRLF 两种字节互相视为未改动', () => {
  const lf = '# Agent Note: a\n\nStatus: implemented\nArchived: 2026-01-02\n\n## Problem\n\nx\n'
  const crlf = lf.replace(/\n/g, '\r\n')

  // 先用 LF 字节封印，再被 checkout 成 CRLF（core.autocrlf=true 的常见结果）
  const rootA = scaffold({ [`archived/${NOTE}`]: lf })
  writeSeal(rootA)
  writeFileSync(join(rootA, 'archived', NOTE), crlf)
  assert.deepEqual(checkSeal(rootA).errors, [], 'CRLF 检出不得被判「内容已改动」')
  assert.deepEqual(writeSeal(rootA).errors, [], '--write 也不得报「既有封存条目已改动」')
  rmSync(rootA, { recursive: true, force: true })

  // 反向：用 CRLF 字节封印，工作树回到 LF
  const rootB = scaffold({ [`archived/${NOTE}`]: crlf })
  writeSeal(rootB)
  writeFileSync(join(rootB, 'archived', NOTE), lf)
  assert.deepEqual(checkSeal(rootB).errors, [])
  rmSync(rootB, { recursive: true, force: true })
})

test('空归档树 + headHasSeal=false（真首次启用）照常退 0', () => {
  const root = scaffold({ 'implemented/feature/2026-01-01-x.md': 'x' })
  assert.deepEqual(checkSeal(root, { headHasSeal: false }).errors, [])
  // 走到过封印的项目里整棵树连 manifest 一起没了 → 判红（整树删除不能靠「空树正常」洗白）
  assert.match(checkSeal(root, { headHasSeal: true }).errors.join('\n'), /曾存在于版本控制中/)
  rmSync(root, { recursive: true, force: true })
})

test('HEAD 里曾有封印而磁盘上没有 manifest → 判红，仅 --first-seal 放行 --write', () => {
  const root = scaffold(ARCHIVED)
  const manifestAbs = join(root, 'archived', SEAL_MANIFEST)
  assert.match(checkSeal(root, { headHasSeal: true }).errors.join('\n'), /曾存在于版本控制中/)
  const blocked = writeSeal(root, { headHasSeal: true })
  assert.equal(blocked.errors.length, 1)
  assert.match(blocked.errors[0] ?? '', /--first-seal/)
  assert.deepEqual(blocked.added, [])
  assert.equal(existsSync(manifestAbs), false, '被拒时不得落盘')

  // 显式逃生门：确实要重新起封印
  assert.deepEqual(writeSeal(root, { headHasSeal: true, firstSeal: true }).errors, [])
  assert.deepEqual(checkSeal(root, { headHasSeal: true }).errors, [])
  rmSync(root, { recursive: true, force: true })
})

test('manifest 被改写成空 artifacts → 疑似重置，--write 拒绝按篡改后的字节重封', () => {
  const root = scaffold(ARCHIVED)
  writeSeal(root)
  const emptied = '{\n  "artifacts": {}\n}\n'
  writeFileSync(join(root, 'archived', SEAL_MANIFEST), emptied)
  const { errors, added } = writeSeal(root, { headHasSeal: true })
  assert.equal(errors.length, 1)
  assert.match(errors[0] ?? '', /疑似被重置/)
  assert.deepEqual(added, [])
  assert.equal(readFileSync(join(root, 'archived', SEAL_MANIFEST), 'utf8'), emptied, '--write 不得覆盖')
  // 清空后仍要能走显式逃生门重新封印
  assert.deepEqual(writeSeal(root, { headHasSeal: true, firstSeal: true }).errors, [])
  rmSync(root, { recursive: true, force: true })
})

test('history 不参与判定：artifacts 被人为回滚成旧哈希 → 判「内容已改动」', () => {
  const root = scaffold(ARCHIVED)
  writeSeal(root)
  const oldHash = manifestOf(root).artifacts[NOTE]
  writeFileSync(join(root, 'archived', NOTE), '# Agent Note: a 修正\n\nStatus: implemented\nArchived: 2026-01-02\n')
  assert.deepEqual(resealOne(root, NOTE, '日期写错', '2026-03-01').errors, [])
  // 回滚 artifacts、留下 reseal 记录：若判定读 history，这次回滚就会被放行
  const rolled = manifestOf(root)
  rolled.artifacts[NOTE] = oldHash
  writeFileSync(join(root, 'archived', SEAL_MANIFEST), `${JSON.stringify(rolled, null, 2)}\n`)
  const { errors } = checkSeal(root)
  assert.equal(errors.length, 1)
  assert.match(errors[0] ?? '', /内容已改动/)
  rmSync(root, { recursive: true, force: true })
})

test('archived/ 下的目录型链接 → 报错不跟随，绝不封印扫描根之外的笔记', (t) => {
  const root = scaffold(ARCHIVED)
  // 链接指向 archived/ 之外的目录，用来证明「不跟随」：跟随会把外部笔记一并卷进封印
  const outside = join(root, 'outside')
  mkdirSync(outside, { recursive: true })
  writeFileSync(join(outside, '2026-01-01-outside.md'), '# 外部笔记\n')
  const link = join(root, 'archived', 'linked')
  try {
    symlinkSync(outside, link, process.platform === 'win32' ? 'junction' : 'dir')
  } catch (e) {
    t.skip(`本机无法创建目录型链接（${(e as NodeJS.ErrnoException).code}）`)
    rmSync(root, { recursive: true, force: true })
    return
  }
  const { files, errors } = listSealedFiles(root)
  assert.deepEqual(files, [NOTE], '链接不得被跟随')
  assert.equal(errors.length, 1)
  assert.match(errors[0] ?? '', /无法校验（符号链接\/junction\/特殊文件）/)
  assert.match(errors[0] ?? '', /^seal: archived\/linked — /)
  // 与门禁 1 同口径：链接存在即判红，--write 也不得放行
  assert.match(checkSeal(root).errors.join('\n'), /无法校验（符号链接\/junction\/特殊文件）/)
  const { errors: writeErrors, added } = writeSeal(root)
  assert.equal(writeErrors.length, 1)
  assert.deepEqual(added, [])
  assert.equal(existsSync(join(root, 'archived', SEAL_MANIFEST)), false, '--write 不得落盘')
  rmSync(link, { recursive: true, force: true })
  rmSync(root, { recursive: true, force: true })
})
