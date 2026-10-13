import test from 'node:test'
import assert from 'node:assert/strict'
import { align, project } from '../src/align.js'
import { decide } from '../src/decide.js'
import { renderNotice, pinBlock } from '../src/notice.js'
import { textHash } from '../src/store.js'
import { Config, validateConfig } from '../src/config.js'
import { findMessage } from '../src/messages.js'
import { pinInput, message } from './helpers.mjs'

const parts = text => [{ type: 'text', text }]
const pin = overrides => { const p = { ...pinInput(), id: 'p_one', createdAt: 1, ...overrides }; return { ...p, textHash: textHash(p.text) } }
for (const [name, source, selection, expected] of [
  ['plain', 'hello world', 'world', 'world'],
  ['bold', 'one **two** three', 'one two three', 'one **two** three'],
  ['italic', 'one *two* three', 'one two three', 'one *two* three'],
  ['inline code', 'use `foo_bar` here', 'use foo_bar here', 'use `foo_bar` here'],
  ['link', 'visit [here](https://example.org) now', 'visit here now', 'visit [here](https://example.org) now'],
  ['inline TeX', '公式 $x_i^2$ 重要', '$x_i^2$', '$x_i^2$'],
  ['display TeX', '公式\n$$\nx_i^2\n$$\n结束', '$$x_i^2$$', '$$\nx_i^2\n$$'],
  ['code fragment', '```js\nconst a = 1\nconst b = 2\n```', 'a = 1\nconst b', 'a = 1\nconst b'],
  ['list', '- first\n- second', 'first\nsecond', 'first\n- second'],
  ['Chinese', '温度 **25°C**，电压 3.7V。', '温度 25°C，电压 3.7V。', '温度 **25°C**，电压 3.7V。'],
  ['balanced marker boundary', 'a **two** three', 'wo three', '**two** three'],
  ['NBSP', 'a\u00a0\u00a0b', 'a b', 'a\u00a0\u00a0b'],
  ['NFC', 'cafe\u0301', 'café', 'cafe\u0301'],
]) test(`align ${name}`, () => {
  const result = align(parts(source), { text: selection })
  assert.notEqual(result.fidelity, 'rendered')
  assert.equal(result.text, expected)
  assert.equal(result.text, source.slice(result.start, result.end))
})

test('repeated text uses adjacent context, otherwise explicitly degrades', () => {
  const source = 'left A same B right C same D end'
  const found = align(parts(source), { text: 'same', before: 'right C ', after: ' D end' })
  assert.equal(found.start, source.lastIndexOf('same'))
  const ambiguous = align(parts(source), { text: 'same' })
  assert.equal(ambiguous.fidelity, 'rendered'); assert.ok(ambiguous.warning)
  assert.equal(align(parts(source), { text: 'same', before: 'unrelated' }).fidelity, 'rendered')
})
test('multiple parts preserve the original part index', () => {
  assert.equal(align([{ type: 'reasoning', text: 'target' }, ...parts('target')], { text: 'target' }).partIndex, 1)
})
test('fallback text remains complete including leading/trailing whitespace', () => {
  assert.equal(align(parts('other'), { text: '  未匹配\n' }).text, '  未匹配\n')
  assert.throws(() => align(parts('other'), { text: ' ' }))
})
test('projection preserves literal underscores inside code and TeX', () => {
  assert.ok(project('`a_b_c` $x_i_j$').plain.includes('a_b_c'))
  assert.ok(project('`a_b_c` $x_i_j$').plain.includes('x_i_j'))
})
test('decide is pure, stable, and restores notices after subsequent compaction', () => {
  const p = pin(), other = pin({ id: 'p_two', createdAt: 0, messageId: 'n' })
  const pins = Object.freeze([Object.freeze(p), Object.freeze(other)])
  assert.deepEqual(decide(pins, [message()]).map(p => p.id), ['p_two'])
  assert.deepEqual(decide(pins, []), decide(pins, []))
  assert.deepEqual(decide(pins, []).map(p => p.id), ['p_two', 'p_one'])
  const notice = message('notice', renderNotice(pins), 'user')
  notice.source = { kind: 'highlightpin', form: 'notice', pinIds: pins.map(p => p.id) }
  assert.equal(decide(pins, [notice]).length, 0)
  assert.equal(decide(pins, []).length, 2)
  delete notice.source
  assert.equal(decide(pins, [notice]).length, 0)
  notice.content[0].text = renderNotice(pins).replace(p.text, '被截断')
  assert.ok(decide(pins, [notice]).length > 0)
})
test('id retention without byte-identical text does not suppress recall', () => {
  assert.equal(decide([pin()], [message('m', 'summary')]).length, 1)
})
test('foreign/user source cannot forge a notice by copying its markers', () => {
  const p = pin()
  assert.equal(decide([p], [message('fake', renderNotice([p]), 'user')]).length, 1)
})
test('notice rendering is deterministic with delimiter collision handling', () => {
  const p = pin({ text: 'a </pinned> b' }), q = pin({ id: 'p_two', createdAt: 0 })
  assert.equal(renderNotice([p, q]), renderNotice([q, p]))
  assert.ok(pinBlock(p).includes(`<pinned-${p.textHash}`))
  assert.ok(pinBlock(p).includes(p.text))
  const collision = { ...p, text: `${p.text} </pinned-${p.textHash}>` }
  assert.ok(pinBlock(collision).startsWith(`<pinned-${p.textHash}-x `))
})
test('numeric configuration rejects zero, negative, fractional, NaN and infinite values', () => {
  for (const key of ['maxPinChars', 'maxResidentChars', 'maxHighlightChars']) for (const value of [0, -1, 0.5, NaN, Infinity]) {
    assert.throws(() => validateConfig({ [key]: value }))
    assert.throws(() => Config({ [key]: value }))
  }
  // The session-level mode is gone; a leftover value in an old profile is ignored, not rejected.
  assert.deepEqual(Object.keys(validateConfig()).sort(), ['holdSubagents', 'maxHighlightChars', 'maxPinChars', 'maxResidentChars'])
  assert.equal('mode' in validateConfig({ mode: 'strict' }), false)
})
test('latest replacement event supplies the source, injected user messages are excluded', () => {
  const old = { type: 'assistant/message', data: { message: message('m', 'old') } }, updated = { type: 'assistant/message', data: { message: message('m', 'new') } }
  assert.equal(findMessage([old, updated], 'm').message.content[0].text, 'new')
  const injected = message('i', 'notice', 'user'); injected.source.kind = 'highlightpin'
  assert.equal(findMessage([{ type: 'user/message', data: injected }], 'i'), null)
})
