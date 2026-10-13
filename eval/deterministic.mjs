import assert from 'node:assert/strict'
import { writeFile } from 'node:fs/promises'
import { decide } from '../src/decide.js'
import { renderNotice, renderSections, pinBlock } from '../src/notice.js'
import { textHash } from '../src/store.js'

const facts = [
  '实验温度为 25.0°C，允许偏差 ±0.2°C。',
  '电压窗口：1.0–3.0 V；截止电流为 0.015 A。',
  '禁止删除原始数据；文件名必须保持 sample_07.csv。',
  '```js\nconst threshold = 0.037;\nif (x > threshold) return false;\n```',
  '$\\nabla_\\theta J(\\theta)=0$',
  '$$\nE = mc^2\n$$',
  '批次 B 的参考值是 73.918。', '未钉事实：编号 9821。',
]
const pins = facts.slice(0, 6).map((text, i) => ({ id: `p_${i}`, sessionId: 'fixture', messageId: `m_${i}`, role: 'assistant', partIndex: 0, start: 0, end: text.length, text, textHash: textHash(text), fidelity: 'source-exact', createdAt: i }))
const original = facts.map((text, i) => ({ id: `m_${i}`, role: 'assistant', content: [{ type: 'text', text }] }))
assert.equal(decide(pins, original).length, 0)
const summaryOnly = [{ id: 'summary', role: 'user', content: [{ type: 'text', text: '这里是故意不包含任何事实的受控摘要。' }], source: { kind: 'compaction' } }]
const missing = decide(pins, summaryOnly)
const notice = renderNotice(missing)
const resident = renderSections(pins.map(p => ({ ...p, level: 'resident' })))
const highlight = renderSections(pins.map(p => ({ ...p, level: 'highlight' })))
const retained = text => pins.filter(pin => Buffer.from(text).includes(Buffer.from(pin.text))).length
assert.equal(retained(notice), 6)
assert.equal(retained(resident), 6); assert.equal(retained(highlight), 6)
const injected = { id: 'notice', role: 'user', content: [{ type: 'text', text: notice }], source: { kind: 'highlightpin', form: 'notice', pinIds: pins.map(p => p.id) } }
assert.equal(decide(pins, [...summaryOnly, injected]).length, 0)
assert.equal(decide(pins, summaryOnly).length, 6)
for (const pin of pins) assert.ok(notice.includes(pinBlock(pin)))
const results = {
  kind: 'controlled-input-preservation-fixture', llmUsed: false, liveDshUsed: false,
  pinnedFacts: pins.length, originalPresentExtraPins: 0,
  notice: { byteIdenticalFactsPresent: retained(notice), injectionChars: notice.length, injectionUtf8Bytes: Buffer.byteLength(notice) },
  pin: { byteIdenticalFactsPresent: retained(notice) },
  resident: { byteIdenticalFactsPresent: retained(resident), systemChars: resident.length },
  highlight: { byteIdenticalFactsPresent: retained(highlight), systemChars: highlight.length },
  noticePresentExtraPins: 0, noticeShadowedRecalledPins: missing.length,
  caveat: 'This is deterministic input preservation, not measured LLM recall, real compaction, token usage or cache performance.',
}
await writeFile(new URL('deterministic-results.json', import.meta.url), JSON.stringify(results, null, 2) + '\n')
console.log(JSON.stringify(results, null, 2))
