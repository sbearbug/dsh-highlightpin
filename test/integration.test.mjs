import test from 'node:test'
import assert from 'node:assert/strict'
import { Session } from '@deepseek-ai/dsh-session'
import { createUserMessage, createAssistantMessage, createSystemMessage } from '@deepseek-ai/dsh-llm'
import { createPlugin } from '../src/index.js'
import { memoryStorage, fakeContext, pinInput, message } from './helpers.mjs'

async function harness(config = {}, extra = {}) {
  const backend = memoryStorage(), context = fakeContext(backend.facility, extra)
  const plugin = createPlugin(context.ctx, config)
  await plugin.start()
  return { ...context, plugin, backend }
}

test('real Session surface: no duplicate while original/notice present; reinject after repeated replacement', async () => {
  const h = await harness(), session = new Session('s')
  session.append('system/message', { turn: 1, step: 1, message: createSystemMessage('system') }, { surfaceOp: 'append' })
  const original = createUserMessage({ content: [{ type: 'text', text: '原文事实' }], source: { kind: 'user' } })
  const originalEvent = session.append('user/message', original, { surfaceOp: 'append' })
  await h.plugin.store.add(pinInput({ messageId: original.id, role: 'user' }))
  const payload = { agent: { session }, messages: [] }
  const enter = () => ({ kind: 'enter', messages: [], startsRequestSeries: true })
  assert.equal((await h.plugin.preStep(payload, async () => enter())).messages.length, 0)
  const checkpoint = createUserMessage({ content: [{ type: 'text', text: '摘要' }], source: { kind: 'compaction' } })
  session.append('user/message', checkpoint, { surfaceOp: { op: 'replace', startSeq: originalEvent.seq, endSeq: originalEvent.seq }, sourceEventSeqs: [originalEvent.seq] })
  const rejected = await h.plugin.preStep(payload, async () => ({ kind: 'reject', reason: 'guard' }))
  assert.equal(rejected.kind, 'reject')
  const result = await h.plugin.preStep(payload, async () => enter())
  assert.equal(result.startsRequestSeries, true); assert.equal(result.messages.length, 1)
  assert.ok(result.messages[0].content[0].text.includes('原文事实'))
  const noticeEvent = session.append('user/message', result.messages[0], { surfaceOp: 'append' })
  assert.equal((await h.plugin.preStep(payload, async () => enter())).messages.length, 0)
  session.append('user/message', checkpoint, { surfaceOp: { op: 'replace', startSeq: noticeEvent.seq, endSeq: noticeEvent.seq }, sourceEventSeqs: [noticeEvent.seq] })
  const second = await h.plugin.preStep(payload, async () => enter())
  assert.equal(second.messages[0].content[0].text, result.messages[0].content[0].text)
  const restored = new Session('s', session.snapshotEvents(), session.header)
  assert.equal((await h.plugin.preStep({ agent: { session: restored }, messages: [] }, async () => enter())).messages.length, 1)
  await h.close()
})

test('pre-step observes compaction completed by downstream listeners, not the inbox-only payload', async () => {
  const h = await harness(); await h.plugin.store.add(pinInput())
  let history = [message()]
  const session = { id: 's', header: {}, deriveMessages: () => history }
  const payload = { agent: { session }, messages: [] }
  assert.equal((await h.plugin.preStep(payload, async () => ({ kind: 'enter', messages: [] }))).messages.length, 0)
  const result = await h.plugin.preStep(payload, async () => { history = []; return { kind: 'enter', messages: [message('new', 'new', 'user')] } })
  assert.equal(result.messages.length, 2)
  assert.deepEqual(h.listeners['agent/pre-step'].options, { prepend: true })
  await h.close()
})

test('provider overflow retry repairs the real Session before the same-step request is rebuilt', async () => {
  const h = await harness(), session = new Session('s')
  const original = createUserMessage({ content: [{ type: 'text', text: '原文事实' }], source: { kind: 'user' } })
  const event = session.append('user/message', original, { surfaceOp: 'append' })
  await h.plugin.store.add(pinInput({ messageId: original.id, role: 'user' }))
  const payload = { agent: { session } }
  await h.plugin.requestError(payload, async () => {
    session.append('user/message', createUserMessage({ content: [{ type: 'text', text: '摘要' }], source: { kind: 'compaction' } }), { surfaceOp: { op: 'replace', startSeq: event.seq, endSeq: event.seq }, sourceEventSeqs: [event.seq] })
    return { kind: 'retry' }
  })
  const notices = session.deriveMessages().filter(m => m.source.kind === 'highlightpin')
  assert.equal(notices.length, 1); assert.ok(notices[0].content[0].text.includes('原文事实'))
  const length = session.snapshotEvents().length
  await h.plugin.requestError(payload, async () => ({ kind: 'retry' }))
  assert.equal(session.snapshotEvents().length, length)
  await h.plugin.requestError(payload, async () => undefined)
  assert.equal(session.snapshotEvents().length, length)
  await h.close()
})

test('downstream notice contributions suppress duplicates; a failed side effect does not consume recall', async () => {
  const h = await harness(); await h.plugin.store.add(pinInput())
  const payload = { agent: { session: { id: 's', header: {}, deriveMessages: () => [] } }, messages: [] }
  const first = await h.plugin.preStep(payload, async () => ({ kind: 'enter', messages: [] }))
  const combined = await h.plugin.preStep(payload, async () => first)
  assert.equal(combined.messages.length, 1)
  // The first proposed decision never reached Session.append. Next step still recalls.
  assert.equal((await h.plugin.preStep(payload, async () => ({ kind: 'enter', messages: [] }))).messages.length, 1)
  await h.close()
})

test('subagents are excluded unless explicitly enabled', async () => {
  for (const holdSubagents of [false, true]) {
    const h = await harness({ holdSubagents }); await h.plugin.store.add(pinInput())
    for (const header of [{ origin: 'subagent' }, { delegationDepth: 1 }]) {
      const result = await h.plugin.preStep({ agent: { session: { id: 's', header, deriveMessages: () => [] } } }, async () => ({ kind: 'enter', messages: [] }))
      assert.equal(result.messages.length, holdSubagents ? 1 : 0)
    }
    await h.close()
  }
})

test('strict uses literal system sections only, follows edits, and disposes fibers', async () => {
  const h = await harness({ mode: 'strict' }), sections = []; let disposed = 0
  const agent = { session: { id: 's', header: {}, deriveMessages: () => [] }, ctx: { inject: (_services, callback) => { callback({ systemPrompt: { section: s => sections.push(s) } }); return { dispose: async () => { disposed++ } } } } }
  h.plugin.installStrict(agent); h.plugin.installStrict(agent)
  assert.equal(sections.length, 1); assert.equal(sections[0].interpolate, false); assert.equal(sections[0].text(), '')
  const added = await h.plugin.store.add(pinInput({ text: '{{literal}}', end: 11 }))
  assert.ok(sections[0].text().includes('{{literal}}'))
  assert.equal((await h.plugin.preStep({ agent }, async () => ({ kind: 'enter', messages: [] }))).messages.length, 0)
  await h.plugin.store.remove('s', added.pin.id); assert.equal(sections[0].text(), '')
  await h.plugin.disposeStrict(agent); assert.equal(disposed, 1)
  await h.close()
})

test('headless command lifecycle and last/show/drop/list preserve complete source', async () => {
  const h = await harness(), session = new Session('s')
  const reply = createAssistantMessage({ content: [{ type: 'text', text: '完整回复\n$E=mc^2$' }], source: { provider: 'test', model: 'test' } })
  session.append('assistant/message', { turn: 1, step: 1, stream: [], message: reply }, { surfaceOp: 'append' })
  const cmd = rawInput => h.plugin.command({ agent: { session }, rawInput })
  assert.equal(h.commands[0].name, 'hlpin')
  assert.equal((await cmd('last')).kind, 'success')
  assert.equal((await cmd('show 1')).text, reply.content[0].text)
  assert.equal((await cmd('level 1 resident')).kind, 'success')
  assert.ok((await cmd('list')).text.includes('resident'))
  assert.equal((await cmd('level 1 highlight')).kind, 'success')
  assert.equal((await cmd('level 1 bad')).kind, 'error')
  assert.equal((await cmd('level 0 pin')).kind, 'error')
  assert.equal((await cmd('level 1 pin')).kind, 'success')
  assert.ok((await cmd('list')).text.includes('source-exact'))
  for (const invalid of ['drop 0', 'drop -1', 'drop 2', 'drop 1 x', 'last x', 'show x']) assert.equal((await cmd(invalid)).kind, 'error')
  assert.equal((await cmd('drop 1')).kind, 'success')
  assert.equal(h.plugin.store.list('s').length, 0)
  await h.close(); assert.equal(h.commands.length, 0)
})

test('selection looks up the latest source from persistence and closes read handles', async () => {
  let closed = 0
  const events = [{ type: 'assistant/message', data: { message: message('m', 'a **b** c') } }]
  const h = await harness({}, { sessions: { get: () => undefined }, sessionPersistence: { stat: async () => ({}), open: async () => ({ read: async () => ({ events }), close: async () => { closed++ } }) } })
  const result = await h.plugin.pinSelection({ sessionId: 's', messageId: 'm', text: 'a b c' })
  assert.equal(result.pin.text, 'a **b** c'); assert.equal(result.pin.fidelity, 'source-normalized'); assert.equal(closed, 1)
  await h.close()
})

test('compaction status is display-only and counts committed notices only', async () => {
  const h = await harness()
  const observe = h.listeners['session/event'].handler
  observe({ id: 's' }, { type: 'compaction/end', data: { error: { message: 'fail' } } })
  assert.equal(h.plugin.status.has('s'), false)
  observe({ id: 's' }, { type: 'compaction/end', data: {} })
  observe({ id: 's' }, { type: 'user/message', data: { source: { kind: 'highlightpin', form: 'notice', pinIds: ['p_one', 'p_two'] } } })
  assert.equal(h.plugin.status.get('s').recalled, 2)
  await h.close()
})

test('mode changes update existing agent sections and keep an admitted step on its assembled mode', async () => {
  const h = await harness(), sections = []
  const agent = { session: { id: 's', header: {}, deriveMessages: () => [] }, ctx: { inject: (_names, cb) => { cb({ systemPrompt: { section: value => sections.push(value) } }); return { dispose: async () => {} } } } }
  h.plugin.installStrict(agent); await h.plugin.store.add(pinInput())
  assert.equal(sections[0].text(), '')
  // UI switches while downstream compaction is pending; this step's assembly was notice.
  const current = await h.plugin.preStep({ agent }, async () => { await h.plugin.store.setMode('s', 'strict'); return { kind: 'enter', messages: [] } })
  assert.equal(current.messages.length, 1)
  assert.ok(sections[0].text().includes('原文事实'))
  assert.equal((await h.plugin.preStep({ agent }, async () => ({ kind: 'enter', messages: [] }))).messages.length, 0)
  await h.plugin.store.setMode('s', 'notice'); assert.equal(sections[0].text(), '')
  assert.equal((await h.plugin.preStep({ agent }, async () => ({ kind: 'enter', messages: [] }))).messages.length, 1)
  await h.close()
})
