import test from 'node:test'
import assert from 'node:assert/strict'
import { createStore } from '../src/store.js'
import { memoryStorage, pinInput } from './helpers.mjs'

const make = (backend, config = {}) => { let serial = 0; return createStore({ storageDomain: backend.facility, config, now: () => 1, makeId: () => `p_${++serial}` }) }
test('official domain durability, close/reopen and per-session isolation', async () => {
  const backend = memoryStorage(), store = make(backend)
  await store.open(); await store.add(pinInput())
  assert.equal(store.list('s')[0].text, '原文事实'); assert.equal(store.list('other').length, 0)
  await store.close()
  const reopened = make(backend); await reopened.open()
  assert.equal(reopened.list('s')[0].text, '原文事实')
  await reopened.remove('s', 'p_1'); assert.equal(reopened.list('s').length, 0)
  await reopened.close()
  assert.equal(backend.control.closes, 2)
})
test('writes do not appear before durability and backend failures do not commit pins', async () => {
  const backend = memoryStorage(), store = make(backend); await store.open()
  await store.add(pinInput())
  let release
  backend.control.gate = new Promise(resolve => { release = resolve })
  const adding = store.add(pinInput({ messageId: 'new' }))
  await new Promise(resolve => setImmediate(resolve))
  assert.equal(store.list('s').length, 1)
  release(); await adding; assert.equal(store.list('s').length, 2)
  backend.control.gate = null; backend.control.fail = true
  await assert.rejects(store.add(pinInput({ messageId: 'fail' })), /disk-full/)
  await assert.rejects(store.remove('s', 'p_1'), /disk-full/)
  assert.equal(store.list('s').length, 2)
  backend.control.fail = false; await store.close()
})
test('concurrent first writes and duplicate requests cannot overwrite each other', async () => {
  const backend = memoryStorage(), store = make(backend); await store.open()
  const results = await Promise.all(Array.from({ length: 8 }, (_, i) => store.add(pinInput({ messageId: `m${i}` }))))
  assert.equal(results.length, 8); assert.equal(store.list('s').length, 8)
  const duplicates = await Promise.all([store.add(pinInput({ messageId: 'm0' })), store.add(pinInput({ messageId: 'm0' }))])
  assert.ok(duplicates.every(p => p.already)); assert.equal(store.list('s').length, 8)
  await store.close()
})
test('pin character pool rejects overflow without eviction or truncation', async () => {
  const backend = memoryStorage(), store = make(backend, { maxPinChars: 6 }); await store.open()
  const first = pinInput(); await store.add(first)
  await assert.rejects(store.add(pinInput({ messageId: 'm2' })), e => e.code === 'pin-budget-exceeded')
  assert.equal(store.list('s').length, 1); assert.equal(store.list('s')[0].text, first.text)
  assert.equal((await store.add(first)).already, true)
  await store.close()
})
test('removed count, single-pin and global caps do not limit short pins or a long original', async () => {
  const backend = memoryStorage(), store = make(backend, { maxPins: 1, maxHighlightPins: 1, maxTotalChars: 1 }); await store.open()
  for (let i = 0; i < 25; i++) await store.add(pinInput({ messageId: `m${i}` }))
  for (const pin of store.list('s').slice(0, 6)) await store.setLevel('s', pin.id, 'highlight')
  await store.add(pinInput({ messageId: 'long', text: 'x'.repeat(5000) }))
  assert.equal(store.list('s').length, 26); assert.equal(store.usage('s').highlightPins, 6)
  assert.equal(store.usage('s').pinChars, 5076)
  assert.equal(store.usage('s').limits.maxPins, undefined)
  assert.equal(store.usage('s').limits.maxTotalChars, undefined)
  await store.close()
})
test('rendered fallback dedupe includes text; equal offsets in distinct parts remain distinct', async () => {
  const backend = memoryStorage(), store = make(backend); await store.open()
  await store.add(pinInput({ partIndex: 0 })); await store.add(pinInput({ partIndex: 1 }))
  for (const text of ['one', 'two']) await store.add(pinInput({ partIndex: -1, start: -1, end: -1, fidelity: 'rendered', text }))
  assert.equal(store.list('s').length, 4)
  await store.close()
})
test('open/dispose race releases the official domain handle', async () => {
  const backend = memoryStorage(), store = make(backend)
  const opening = store.open(); await store.close(); await opening
  assert.equal(store.ready, false); assert.equal(backend.control.closes, 1)
})

test('per-session modes survive reopen, preserve pins and do not affect other sessions', async () => {
  const backend = memoryStorage(), store = make(backend); await store.open()
  await store.add(pinInput()); assert.equal(store.mode('s'), 'notice')
  await store.setMode('s', 'strict'); assert.equal(store.mode('s'), 'strict'); assert.equal(store.mode('other'), 'notice')
  await store.add(pinInput({ messageId: 'second' })); await store.remove('s', 'p_1')
  assert.equal(store.mode('s'), 'strict'); assert.equal(store.list('s').length, 1)
  await store.close()
  const reopened = make(backend); await reopened.open()
  assert.equal(reopened.mode('s'), 'strict'); assert.equal(reopened.list('s').length, 1)
  backend.control.fail = true
  await assert.rejects(reopened.setMode('s', 'notice'), /disk-full/)
  assert.equal(reopened.mode('s'), 'strict')
  await assert.rejects(reopened.setMode('s', 'other'), e => e.code === 'bad-mode')
  backend.control.fail = false; await reopened.close()
})
