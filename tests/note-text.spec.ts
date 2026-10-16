import { test } from 'node:test'
import assert from 'node:assert/strict'
import { fenceAwareLines, parseNote, proseLines } from '../skills/intent-notes/scripts/note-text.ts'

test('4 反引号外套 3 反引号：内层围栏不闭合外层', () => {
  const text = [
    '````markdown',
    '```markdown',
    '## Affected repositories',
    '',
    '- `内层` 不涉及',
    '```',
    '````',
    '',
    '## Affected repositories',
    '',
    '- `cloud` 不涉及',
  ].join('\n')
  const prose = proseLines(text)
  assert.equal(prose.filter(l => l === '## Affected repositories').length, 1, '真段头应当只剩一个')
  assert.ok(!prose.includes('- `内层` 不涉及'), '围栏里的示例行不该进正文')
  assert.ok(prose.includes('- `cloud` 不涉及'))
})

test('外层 4 反引号必须用 ≥4 反引号闭合', () => {
  const prose = proseLines(['````', '```', '## 仍在围栏内', '````', '## 出来了'].join('\n'))
  assert.deepEqual(prose, ['## 出来了'])
})

test('`~~~` 与 ` ``` ` 不互相闭合', () => {
  const prose = proseLines(['```', '~~~', '## 仍在围栏内', '```', '## 出来了'].join('\n'))
  assert.deepEqual(prose, ['## 出来了'])
})

test('闭合围栏不能带 info string', () => {
  const prose = proseLines(['```', '```js', '## 仍在围栏内', '```', '## 出来了'].join('\n'))
  assert.deepEqual(prose, ['## 出来了'])
})

test('反引号围栏的 info string 含反引号时不是开启围栏', () => {
  // CommonMark：反引号围栏的 info string 不得含反引号，这种行是普通段落
  const prose = proseLines(['```a`b', '## 是正文', '```', '## 在围栏内'].join('\n'))
  assert.deepEqual(prose, ['```a`b', '## 是正文'])
})

test('未闭合的围栏吃到文末', () => {
  const prose = proseLines(['## 正文', '```', '## 没了'].join('\n'))
  assert.deepEqual(prose, ['## 正文'])
})

test('fenceAwareLines 带回原行号', () => {
  const lines = fenceAwareLines(['a', '```', 'b', '```', 'c'].join('\n'))
  assert.deepEqual(lines, [{ index: 0, text: 'a' }, { index: 4, text: 'c' }])
})

test('parseNote 忽略围栏内的 ## 与 Status:', () => {
  const text = [
    '# Agent Note: t', '', 'Status: implemented', '',
    '## Problem', '',
    '```markdown',
    'Status: proposed',
    '## Proposal',
    '```', '',
    '## Decision', '',
    '## Alternatives considered', '',
    '## Consequences', '',
  ].join('\n')
  const parsed = parseNote(text)
  assert.equal(parsed.firstH2, '## Problem')
  assert.deepEqual(parsed.h2s, ['## Problem', '## Decision', '## Alternatives considered', '## Consequences'])
  assert.ok(!parsed.prose.includes('Status: proposed'))
})
