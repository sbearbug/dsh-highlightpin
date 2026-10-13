import test from 'node:test'
import assert from 'node:assert/strict'
import { Readable } from 'node:stream'
import { makeRoutes, MAX_BODY_BYTES } from '../src/routes.js'
import { isTrustedApiRequest } from '../src/trust-fence.js'
import { createPlugin } from '../src/index.js'
import { fakeContext, memoryStorage, message } from './helpers.mjs'

async function call(handler, { path = '/pin', method = 'POST', headers = {}, body = '{}', chunks } = {}) {
  const req = Readable.from(chunks ?? [Buffer.from(body)])
  req.url = `/highlightpin/api${path}`; req.method = method
  req.headers = { host: '127.0.0.1:19387', 'content-type': 'application/json', ...headers }
  const result = {}
  const res = { writeHead: status => { result.status = status }, end: body => { result.body = JSON.parse(body) } }
  await handler(req, res)
  return result
}
async function fixture() {
  const backend = memoryStorage()
  const events = [{ type: 'assistant/message', data: { message: message('m', 'a **b** c') } }]
  const context = fakeContext(backend.facility, { sessions: { get: id => id === 's' ? { snapshotEvents: () => events } : undefined }, sessionPersistence: { stat: async () => undefined } })
  const plugin = createPlugin(context.ctx)
  await plugin.start()
  const route = makeRoutes({ store: plugin.store, pinSelection: plugin.pinSelection, trustedHosts: ['trusted.example:8080'], logger: context.ctx.logger, mode: 'notice' })
  return { ...context, backend, plugin, route }
}
test('trust fence rejects missing/invalid Host, cross-site, foreign origin and wrong origin port', () => {
  const fence = headers => isTrustedApiRequest({ headers }, ['trusted.example:8080'])
  for (const headers of [{}, { host: 'evil.example' }, { host: 'localhost', origin: 'null' }, { host: 'localhost:19387', origin: 'http://localhost:19388' }, { host: 'localhost', 'sec-fetch-site': 'cross-site' }, { host: 'localhost', origin: 'https://evil.example' }, { host: 'localhost@evil.example' }]) assert.equal(fence(headers), false)
  assert.equal(fence({ host: 'localhost:19387', origin: 'http://localhost:19387' }), true)
  assert.equal(fence({ host: '127.0.0.1:19387' }), true)
  assert.equal(fence({ host: 'trusted.example:8080' }), true)
  assert.equal(fence({ host: 'trusted.example:8081' }), false)
})
test('routes preserve source text, list fidelity/budgets and delete pins', async () => {
  const h = await fixture()
  const added = await call(h.route, { body: JSON.stringify({ sessionId: 's', messageId: 'm', text: 'a b c' }) })
  assert.equal(added.status, 200); assert.equal(added.body.pin.text, 'a **b** c')
  const listed = await call(h.route, { path: '/pins?session=s', method: 'GET' })
  assert.equal(listed.body.pins[0].fidelity, 'source-normalized'); assert.equal(listed.body.usage.chars, 9)
  const removed = await call(h.route, { path: '/unpin', body: JSON.stringify({ sessionId: 's', pinId: added.body.pin.id }) })
  assert.equal(removed.status, 200); assert.equal(h.plugin.store.list('s').length, 0)
  assert.equal((await call(h.route, { path: '/health', method: 'GET' })).body.ready, true)
  await h.close()
})
test('HTTP errors have explicit status and common error shape', async () => {
  const h = await fixture()
  for (const [input, status, code] of [
    [{ headers: { host: undefined } }, 403, 'forbidden'],
    [{ headers: { 'content-type': 'text/plain' } }, 415, 'unsupported-media-type'],
    [{ headers: { 'content-type': undefined } }, 415, 'unsupported-media-type'],
    [{ body: '{' }, 400, 'bad-json'],
    [{ body: 'null' }, 400, 'bad-json'],
    [{ body: '[]' }, 400, 'bad-json'],
    [{ body: '{}' }, 400, 'bad-request'],
    [{ path: '/unknown' }, 404, 'not-found'],
    [{ path: '/pins', method: 'GET' }, 400, 'bad-request'],
    [{ body: JSON.stringify({ sessionId: 's', messageId: 'unknown', text: 'a' }) }, 404, 'message-not-found'],
    [{ body: JSON.stringify({ sessionId: 's', messageId: 'm', text: 123 }) }, 400, 'bad-request'],
    [{ body: JSON.stringify({ sessionId: 's', messageId: 'm', text: 'a', before: [] }) }, 400, 'bad-request'],
  ]) {
    const result = await call(h.route, input)
    assert.equal(result.status, status); assert.equal(result.body.code, code); assert.equal(result.body.ok, false); assert.equal(typeof result.body.message, 'string')
  }
  await h.close()
})
test('oversized requests are bounded in bytes and respond 413 instead of destroying the response socket', async () => {
  const h = await fixture()
  const result = await call(h.route, { chunks: [Buffer.alloc(MAX_BODY_BYTES - 1, 32), Buffer.from('中')] })
  assert.equal(result.status, 413); assert.equal(result.body.code, 'body-too-large')
  assert.equal(h.plugin.store.list('s').length, 0)
  await h.close()
})
test('not-ready returns 503 and write failure cannot falsely report success', async () => {
  const h = await fixture()
  const unready = makeRoutes({ store: { ready: false } })
  assert.equal((await call(unready)).status, 503)
  h.backend.control.fail = true
  const failed = await call(h.route, { body: JSON.stringify({ sessionId: 's', messageId: 'm', text: 'a b c' }) })
  assert.equal(failed.status, 500); assert.equal(h.plugin.store.list('s').length, 0)
  h.backend.control.fail = false; await h.close()
})
test('rendered downgrade is explicit in HTTP response and is never truncated', async () => {
  const h = await fixture()
  const result = await call(h.route, { body: JSON.stringify({ sessionId: 's', messageId: 'm', text: '  屏幕文本不同\n' }) })
  assert.equal(result.body.pin.fidelity, 'rendered'); assert.ok(result.body.warning)
  assert.equal(result.body.pin.text, '  屏幕文本不同\n')
  await h.close()
})

test('mode route validates and persists a current-session choice behind the same fence', async () => {
  const h = await fixture()
  const result = await call(h.route, { path: '/mode', body: JSON.stringify({ sessionId: 's', mode: 'strict' }) })
  assert.equal(result.status, 200); assert.equal(result.body.mode, 'strict')
  assert.equal((await call(h.route, { path: '/pins?session=s', method: 'GET' })).body.mode, 'strict')
  assert.equal((await call(h.route, { path: '/pins?session=other', method: 'GET' })).body.mode, 'notice')
  const invalid = await call(h.route, { path: '/mode', body: JSON.stringify({ sessionId: 's', mode: 'other' }) })
  assert.equal(invalid.status, 400); assert.equal(h.plugin.store.mode('s'), 'strict')
  assert.equal((await call(h.route, { path: '/mode', headers: { 'sec-fetch-site': 'cross-site' } })).status, 403)
  await h.close()
})

test('per-pin level route exposes usage, validates input and retains its JSON/fence protections', async () => {
  const h = await fixture()
  const added = await call(h.route, { body: JSON.stringify({ sessionId: 's', messageId: 'm', text: 'a b c' }) })
  const body = { sessionId: 's', pinId: added.body.pin.id, level: 'highlight' }
  const changed = await call(h.route, { path: '/level', body: JSON.stringify(body) })
  assert.equal(changed.status, 200); assert.equal(changed.body.pin.level, 'highlight')
  const listed = await call(h.route, { path: '/pins?session=s', method: 'GET' })
  assert.equal(listed.body.usage.highlightPins, 1); assert.equal(listed.body.usage.highlightChars, 9); assert.equal(listed.body.usage.residentChars, 0); assert.equal(listed.body.usage.pinChars, 0)
  assert.equal((await call(h.route, { path: '/level', body: JSON.stringify({ ...body, level: 'bad' }) })).status, 400)
  assert.equal((await call(h.route, { path: '/level', headers: { 'content-type': 'text/plain' } })).status, 415)
  assert.equal((await call(h.route, { path: '/level', headers: { 'sec-fetch-site': 'cross-site' } })).status, 403)
  await h.close()
})
