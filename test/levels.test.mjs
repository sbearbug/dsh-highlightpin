import test from 'node:test'
import assert from 'node:assert/strict'
import { createStore, textHash } from '../src/store.js'
import { createPlugin } from '../src/index.js'
import { decide } from '../src/decide.js'
import { renderNotice, renderSections, NOTICE_HEADER, LEGACY_NOTICE_HEADER, RESIDENT_HEADER, HIGHLIGHT_HEADER } from '../src/notice.js'
import { Config, validateConfig } from '../src/config.js'
import { memoryStorage, pinInput, fakeContext, message } from './helpers.mjs'

function make(backend, config = {}) { let id = 0; return createStore({ storageDomain: backend.facility, config, makeId: () => `p_${++id}`, now: () => 1 }) }
test('version-1 old records, legacy strict mapping, explicit levels and rewrite survive reopen', async () => {
  const b = memoryStorage()
  b.records.sessions = { s: { mode: 'strict', pins: [{ ...pinInput(), id: 'p_old', createdAt: 1, textHash: textHash('原文事实') }] } }
  const store = make(b); await store.open()
  assert.equal(store.list('s')[0].level, 'resident')
  await store.setLevel('s', 'p_old', 'highlight')
  assert.equal(b.records.sessions.s.pins[0].level, 'highlight')
  await store.close()
  const next = make(b); await next.open()
  assert.equal(next.list('s')[0].level, 'highlight')
  await next.setLevel('s', 'p_old', 'pin'); assert.equal(next.list('s')[0].level, 'pin')
  await next.close()
})
test('legacy notice records default to pin and preserve optional level across schema rewrite', async () => {
  const b = memoryStorage()
  b.records.sessions = { s: { pins: [{ ...pinInput(), id: 'p_old', createdAt: 1, textHash: textHash('原文事实') }] } }
  const store = make(b); await store.open()
  assert.equal(store.list('s')[0].level, 'pin')
  await store.setLevel('s', 'p_old', 'resident')
  await store.add(pinInput({ messageId: 'new' }))
  assert.equal(b.records.sessions.s.pins[0].level, 'resident')
  await store.close()
  const reopened = make(b); await reopened.open()
  assert.equal(reopened.list('s').find(p => p.id === 'p_old').level, 'resident')
  assert.equal(reopened.list('s').find(p => p.messageId === 'new').level, 'pin')
  assert.equal(reopened.list('s').find(p => p.id === 'p_old').text, '原文事实')
  await reopened.close()
})
test('profile strict floors all pins to resident but preserves highlight', async () => {
  const b = memoryStorage(), store = make(b, { mode: 'strict', maxPinChars: 1, maxResidentChars: 4, maxHighlightChars: 4 }); await store.open()
  const p = await store.add(pinInput()); assert.equal(store.list('s')[0].level, 'resident')
  await assert.rejects(store.add(pinInput({ messageId: 'second' })), e => e.code === 'resident-budget-exceeded')
  await store.setLevel('s', p.pin.id, 'highlight'); assert.equal(store.list('s')[0].level, 'highlight')
  await store.setLevel('s', p.pin.id, 'pin'); assert.equal(store.list('s')[0].level, 'resident')
  await store.close()
})
for (const [config, firstLevel, secondLevel, code] of [
  [{ maxResidentChars: 4 }, 'resident', 'resident', 'resident-budget-exceeded'],
  [{ maxHighlightChars: 4 }, 'highlight', 'highlight', 'highlight-budget-exceeded'],
]) test(`promotion rejects ${code} atomically without changing other pins`, async () => {
  const b = memoryStorage(), store = make(b, config); await store.open()
  const a = await store.add(pinInput()), c = await store.add(pinInput({ messageId: 'other' }))
  await store.setLevel('s', a.pin.id, firstLevel)
  await assert.rejects(store.setLevel('s', c.pin.id, secondLevel), e => e.code === code)
  assert.deepEqual(store.list('s').map(p => p.level), [firstLevel, 'pin'])
  await store.setLevel('s', a.pin.id, 'pin')
  assert.equal(store.usage('s').residentChars, 0)
  await store.close()
})
test('each character pool is independent and promotions check only the target pool', async () => {
  const b = memoryStorage(), store = make(b, { maxPinChars: 4, maxResidentChars: 4, maxHighlightChars: 4 }); await store.open()
  const r = await store.add(pinInput()); await store.setLevel('s', r.pin.id, 'resident')
  const h = await store.add(pinInput({ messageId: 'h' })); await store.setLevel('s', h.pin.id, 'highlight')
  const p = await store.add(pinInput({ messageId: 'p' }))
  assert.equal(store.usage('s').chars, 12)
  for (const key of ['pinChars', 'residentChars', 'highlightChars']) assert.equal(store.usage('s')[key], 4)
  await assert.rejects(store.setLevel('s', p.pin.id, 'resident'), e => e.code === 'resident-budget-exceeded')
  await assert.rejects(store.setLevel('s', r.pin.id, 'highlight'), e => e.code === 'highlight-budget-exceeded')
  assert.deepEqual(store.list('s').map(p => p.level), ['resident', 'highlight', 'pin'])
  await store.setLevel('s', h.pin.id, 'pin') // Preserve the established always-allow-demotion rule.
  assert.equal(store.usage('s').pinChars, 8); assert.equal(store.usage('s').highlightChars, 0)
  await assert.rejects(store.add(pinInput({ messageId: 'more' })), e => e.code === 'pin-budget-exceeded')
  await store.close()
})
test('an over-budget legacy type cannot block additions or promotions in another type', async () => {
  const b = memoryStorage()
  b.records.sessions = { s: { pins: [{ ...pinInput({ text: '旧的超额资料' }), id: 'p_old', createdAt: 1, textHash: textHash('旧的超额资料'), level: 'resident' }] } }
  const store = make(b, { maxPinChars: 4, maxResidentChars: 1, maxHighlightChars: 4 }); await store.open()
  const p = await store.add(pinInput({ messageId: 'new' }))
  await store.setLevel('s', p.pin.id, 'highlight')
  assert.equal(store.usage('s').highlightChars, 4)
  assert.equal(store.list('s').find(p => p.id === 'p_old').text, '旧的超额资料')
  await store.close()
})
test('demotions remain allowed when legacy pins already exceed the new budgets', async () => {
  const b = memoryStorage(); b.records.sessions = { s: { pins: [{ ...pinInput({ text: '超过预算原文' }), id: 'p_old', createdAt: 1, textHash: textHash('超过预算原文'), level: 'highlight' }] } }
  const store = make(b, { maxResidentChars: 1, maxHighlightChars: 1 }); await store.open()
  await store.setLevel('s', 'p_old', 'resident'); assert.equal(store.list('s')[0].level, 'resident')
  await store.setLevel('s', 'p_old', 'pin'); assert.equal(store.list('s')[0].text, '超过预算原文')
  await store.close()
})
test('concurrent promotions share one write chain and failed backend writes do not update levels', async () => {
  const b = memoryStorage(), store = make(b, { maxHighlightChars: 4 }); await store.open()
  const a = await store.add(pinInput()), c = await store.add(pinInput({ messageId: 'other' }))
  const results = await Promise.allSettled([store.setLevel('s', a.pin.id, 'highlight'), store.setLevel('s', c.pin.id, 'highlight')])
  assert.equal(results.filter(r => r.status === 'fulfilled').length, 1)
  b.control.fail = true
  await assert.rejects(store.setLevel('s', a.pin.id, 'pin'), /disk-full/)
  assert.equal(store.list('s')[0].level, 'highlight')
  b.control.fail = false; await store.close()
})
test('new numeric limits reject unsafe or nonpositive values in schema and runtime', () => {
  for (const field of ['maxPinChars', 'maxResidentChars', 'maxHighlightChars']) for (const value of [0, -1, 0.5, Infinity, NaN]) {
    assert.throws(() => Config({ [field]: value })); assert.throws(() => validateConfig({ [field]: value }))
  }
})
test('resident/highlight sections have separate ordered headings, omit empty sections, and remain stable', () => {
  const makePin = (id, level) => ({ ...pinInput(), id, level, createdAt: 1, textHash: textHash('原文事实') })
  const r = makePin('p_r', 'resident'), h = makePin('p_h', 'highlight'), p = makePin('p_p', 'pin')
  const text = renderSections([h, p, r])
  assert.ok(text.startsWith(RESIDENT_HEADER)); assert.ok(text.includes(HIGHLIGHT_HEADER))
  assert.ok(!text.includes('p_p')); assert.equal(text, renderSections([r, h, p]))
  assert.ok(!renderSections([r]).includes(HIGHLIGHT_HEADER)); assert.equal(renderSections([p]), '')
  for (const title of [NOTICE_HEADER, LEGACY_NOTICE_HEADER]) {
    const notice = message('n', renderNotice([p]).replace(NOTICE_HEADER, title), 'user')
    notice.source = { kind: 'highlightpin', form: 'notice', pinIds: [p.id] }
    assert.equal(decide([p], [notice]).length, 0)
  }
})
test('excludeIds is pure and the absence of a snapshot does not lose resident/highlight pins', () => {
  const pins = ['pin', 'resident', 'highlight'].map((level, i) => ({ ...pinInput(), id: `p_${i}`, level, createdAt: i, textHash: textHash('原文事实') }))
  const exclude = new Set(['p_1', 'p_2'])
  assert.deepEqual(decide(pins, [], exclude).map(p => p.level), ['pin'])
  assert.equal(exclude.size, 2); assert.equal(decide(pins, []).length, 3)
})
test('both request paths exclude only the actual section snapshot, including same-step level changes', async () => {
  const b = memoryStorage(), context = fakeContext(b.facility), plugin = createPlugin(context.ctx)
  await plugin.start()
  const section = []
  let appended = []
  const agent = { session: { id: 's', header: {}, deriveMessages: () => [], append: (_type, m) => appended.push(m) }, ctx: { inject: (_names, fn) => { fn({ systemPrompt: { section: s => section.push(s) } }); return { dispose: async () => {} } } } }
  plugin.installStrict(agent)
  const pins = []
  for (const [i, level] of ['pin', 'resident', 'highlight'].entries()) {
    const p = await plugin.store.add(pinInput({ messageId: `m${i}` })); await plugin.store.setLevel('s', p.pin.id, level); pins.push(p.pin)
  }
  section[0].text()
  const first = await plugin.preStep({ agent }, async () => ({ kind: 'enter', messages: [] }))
  assert.deepEqual(first.messages[0].source.pinIds, [pins[0].id])
  await plugin.store.setLevel('s', pins[0].id, 'resident') // not in this step's snapshot yet
  await plugin.store.setLevel('s', pins[1].id, 'pin') // still in this step's snapshot
  const during = await plugin.preStep({ agent }, async () => ({ kind: 'enter', messages: [] }))
  assert.deepEqual(during.messages[0].source.pinIds, [pins[0].id])
  await plugin.requestError({ agent }, async () => ({ kind: 'retry' }))
  assert.deepEqual(appended[0].source.pinIds, [pins[0].id])
  section[0].text(); appended = []
  const next = await plugin.preStep({ agent }, async () => ({ kind: 'enter', messages: [] }))
  assert.deepEqual(next.messages[0].source.pinIds, [pins[1].id])
  await plugin.requestError({ agent }, async () => ({ kind: 'retry' }))
  assert.deepEqual(appended[0].source.pinIds, [pins[1].id])
  const noSnapshot = { session: agent.session }
  const fallback = await plugin.preStep({ agent: noSnapshot }, async () => ({ kind: 'enter', messages: [] }))
  assert.equal(fallback.messages[0].source.pinIds.length, 3)
  await plugin.requestError({ agent: noSnapshot }, async () => ({ kind: 'retry' }))
  assert.equal(appended.at(-1).source.pinIds.length, 3)
  await context.close()
})
test('storage open retries are bounded and can recover a transient failure', async () => {
  const b = memoryStorage(); let attempts = 0
  const store = createStore({ storageDomain: { open: spec => ++attempts < 3 ? Promise.reject(new Error('transient')) : b.facility.open(spec) } })
  await store.open(); assert.equal(attempts, 3); assert.equal(store.ready, true); await store.close()
  let permanent = 0
  const failed = createStore({ storageDomain: { open: async () => { permanent++; throw new Error('permanent') } } })
  await assert.rejects(failed.open(), /permanent/); assert.equal(permanent, 3); await failed.close()
})
