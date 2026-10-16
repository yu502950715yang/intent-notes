import { test } from 'node:test'
import assert from 'node:assert/strict'
import { isIndentedCodeBlock, localLinkTargets } from '../skills/intent-notes/scripts/note-links.ts'

test('行内链接与引用式定义都能提取', () => {
  assert.deepEqual(localLinkTargets('见 [旧篇](../implemented/feature/2026-01-01-a.md)。'), [
    '../implemented/feature/2026-01-01-a.md',
  ])
  assert.deepEqual(localLinkTargets('[ref]: ./b.md'), ['./b.md'])
})

test('`<...>` 包裹与含空格的目标按原样提取', () => {
  assert.deepEqual(localLinkTargets('见 [x](<./a b.md>)'), ['./a b.md'])
  assert.deepEqual(localLinkTargets('见 [x](<./a.md>)'), ['./a.md'])
})

test('行内代码 span 与 HTML 注释里的示例链接不算真链接', () => {
  assert.deepEqual(localLinkTargets('写法是 `[x](./example.md)`。'), [])
  assert.deepEqual(localLinkTargets('<!-- [x](./example.md) -->'), [])
})

test('外部 scheme 与协议相对 URL 不是仓库内路径', () => {
  assert.deepEqual(localLinkTargets('[x](https://example.com/a.md)'), [])
  assert.deepEqual(localLinkTargets('[x](mailto:a@b.c)'), [])
  assert.deepEqual(localLinkTargets('[x](//host/a.md)'), [])
})

test('纯锚点跳过；%XX 解码、锚点与查询串剔除', () => {
  assert.deepEqual(localLinkTargets('[x](#section)'), [])
  assert.deepEqual(localLinkTargets('[x](./a%20b.md#L3?q=1)'), ['./a b.md'])
})

test('非法 %XX 按原样返回，照常去查而不是静默放过', () => {
  assert.deepEqual(localLinkTargets('[x](./a%ZZ.md)'), ['./a%ZZ.md'])
})

test('缩进代码块判定：前一行是空行（或文件开头）才算', () => {
  assert.equal(isIndentedCodeBlock('    indented', undefined), true)
  assert.equal(isIndentedCodeBlock('    indented', ''), true)
  assert.equal(isIndentedCodeBlock('    indented', '- 列表项'), false)
  assert.equal(isIndentedCodeBlock('普通正文', undefined), false)
})
