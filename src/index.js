import { createUserMessage } from '@deepseek-ai/dsh-llm'
import { CommandDefinitionId } from '@deepseek-ai/dsh-commands/brand'
import { Config, NAME, PACKAGE_NAME, validateConfig } from './config.js'
import { createStore, PinError } from './store.js'
import { decide, isSubagentSession } from './decide.js'
import { renderNotice, renderSections } from './notice.js'
import { align } from './align.js'
import { findMessage, lastAssistant } from './messages.js'
import { makeRoutes, requiredString, ROUTE_PREFIX } from './routes.js'

export { Config }
export const name = PACKAGE_NAME
export const inject = ['storageDomain', 'commands']

export function createPlugin(ctx, inputConfig = {}, deps = {}) {
  const config = validateConfig(inputConfig)
  const store = createStore({ storageDomain: deps.storageDomain ?? ctx.storageDomain, config, now: deps.now, makeId: deps.makeId })
  const promptFibers = new Map()
  const assembledSections = new WeakMap()
  const status = new Map()
  let services = {}

  async function resolveEvents(sessionId) {
    const live = services.sessions?.get(sessionId)
    if (live) return live.snapshotEvents()
    const persistence = services.sessionPersistence
    if (!persistence) throw new PinError('no-session-service', '会话读取服务尚未就绪。', 503)
    if (!await persistence.stat(sessionId)) throw new PinError('session-not-found', '会话不存在。', 404)
    const handle = await persistence.open(sessionId, 'read')
    try { return (await handle.read()).events } finally { await handle.close() }
  }

  async function pinSelection(body, eventsOverride) {
    const sessionId = requiredString(body.sessionId, 'sessionId')
    const messageId = requiredString(body.messageId, 'messageId')
    const text = requiredString(body.text, 'text')
    for (const key of ['before', 'after']) if (body[key] !== undefined && typeof body[key] !== 'string') throw new PinError('bad-request', `${key} 必须是字符串。`)
    const found = findMessage(eventsOverride ?? await resolveEvents(sessionId), messageId)
    if (!found) throw new PinError('message-not-found', '未找到已定稿的用户或助手消息。', 404)
    const result = align(found.message.content, { text, before: (body.before ?? '').slice(-64), after: (body.after ?? '').slice(0, 64) })
    const { warning, ...data } = result
    const added = await store.add({ sessionId, messageId, role: found.message.role, ...data })
    return { ...added, ...(warning ? { warning } : {}), usage: store.usage(sessionId) }
  }

  async function preStep(payload, next) {
    const decision = await next()
    if (decision.kind !== 'enter' || !store.ready || isSubagentSession(payload.agent.session, config)) return decision
    const pins = store.list(payload.agent.session.id)
    if (!pins.length) return decision
    // pre-step messages are only the inbox claim. Read the surface AFTER downstream
    // compaction, then include admitted messages from all downstream listeners.
    const messages = [...payload.agent.session.deriveMessages(), ...decision.messages]
    const missing = decide(pins, messages, assembledSections.get(payload.agent)?.ids ?? [])
    if (!missing.length) return decision
    return { ...decision, messages: [...decision.messages, createUserMessage({
      content: [{ type: 'text', text: renderNotice(missing) }],
      source: { kind: NAME, form: 'notice', pinIds: missing.map(p => p.id) },
    })] }
  }

  async function requestError(payload, next) {
    const action = await next()
    if (action?.kind !== 'retry' || !store.ready || isSubagentSession(payload.agent.session, config)) return action
    const session = payload.agent.session
    const missing = decide(store.list(session.id), session.deriveMessages(), assembledSections.get(payload.agent)?.ids ?? [])
    if (missing.length) {
      // Overflow recovery retries inside step(), without another pre-step. Commit
      // only an EXISTING user/message event, after the downstream retry decision.
      session.append('user/message', createUserMessage({
        content: [{ type: 'text', text: renderNotice(missing) }],
        source: { kind: NAME, form: 'notice', pinIds: missing.map(p => p.id) },
      }), { surfaceOp: 'append' })
    }
    return action
  }

  function installStrict(agent) {
    if (promptFibers.has(agent) || isSubagentSession(agent.session, config)) return
    const fiber = agent.ctx.inject(['systemPrompt'], scope => {
      scope.systemPrompt.section({
        name: NAME, order: 9500, interpolate: false,
        text: () => {
          const pins = store.ready ? store.list(agent.session.id).filter(pin => pin.level !== 'pin') : []
          const text = renderSections(pins)
          assembledSections.set(agent, { ids: new Set(text ? pins.map(pin => pin.id) : []) })
          return text
        },
      })
    })
    promptFibers.set(agent, fiber)
  }
  async function disposeStrict(agent) {
    const fiber = promptFibers.get(agent)
    promptFibers.delete(agent)
    assembledSections.delete(agent)
    await fiber?.dispose()
  }

  async function command(invocation) {
    try {
      if (!store.ready) throw new PinError('not-ready', '钉子存储尚未就绪。', 503)
      const session = invocation.agent?.session
      if (!session) throw new PinError('no-session', '没有活跃会话。')
      const args = invocation.rawInput.trim().split(/\s+/)
      const action = args[0]
      const pins = store.list(session.id)
      let text
      if (action === 'list' && args.length === 1) {
        const usage = store.usage(session.id)
        text = `本会话 ${usage.count} 枚钉子，共 ${usage.chars} 字符，pin ${usage.pinChars}/${usage.limits.maxPinChars} 字符，resident ${usage.residentChars}/${usage.limits.maxResidentChars} 字符，highlight ${usage.highlightChars}/${usage.limits.maxHighlightChars} 字符，粗估 ${usage.estimatedTokens} tokens（非精确计量）。\n` + pins.map((p, i) => `${i + 1}. ${p.level} · ${p.fidelity} · ${p.text.length} 字符 · ${p.text.replace(/\s/g, ' ').slice(0, 80)}`).join('\n')
      } else if (action === 'last' && args.length === 1) {
        const found = lastAssistant(session.snapshotEvents())
        if (!found) throw new PinError('message-not-found', '没有可钉住的助手回复。')
        const parts = found.message.content.map((p, i) => ({ p, i })).filter(({ p }) => p.type === 'text' && p.text.length)
        // Preserve every text part as a single pin; never synthesize offsets across parts.
        const textParts = parts.map(({ p }) => p.text)
        const text = textParts.join('\n')
        const single = parts.length === 1
        const result = await store.add({ sessionId: session.id, messageId: found.message.id, role: 'assistant', text, partIndex: single ? parts[0].i : -1, start: single ? 0 : -1, end: single ? text.length : -1, fidelity: single ? 'source-exact' : 'rendered' })
        return { kind: 'success', text: `${result.already ? '已经钉住' : '已钉住'}助手回复全文（${text.length} 字符）。${single ? '' : '回复含多个 text part，按原顺序以换行连接，fidelity=rendered。'}` }
      } else if (action === 'level' && args.length === 3 && /^[1-9]\d*$/.test(args[1])) {
        const pin = pins[Number(args[1]) - 1]
        if (!pin) throw new PinError('bad-index', `序号越界；当前共有 ${pins.length} 枚。`)
        const result = await store.setLevel(session.id, pin.id, args[2])
        text = `已设置为 ${result.pin.level}。${result.pin.level !== 'pin' ? '会进入系统提示词，切换时前缀缓存会失效一次。' : ''}${config.mode === 'strict' ? 'profile strict 配置要求钉子至少常驻。' : ''}`
      } else if (['show', 'drop'].includes(action) && args.length === 2 && /^[1-9]\d*$/.test(args[1])) {
        const pin = pins[Number(args[1]) - 1]
        if (!pin) throw new PinError('bad-index', `序号越界；当前共有 ${pins.length} 枚。`)
        if (action === 'drop') { await store.remove(session.id, pin.id); text = '已解钉。' } else text = pin.text
      } else throw new PinError('usage', '用法：/hlpin list | last | show <序号> | drop <序号> | level <序号> pin|resident|highlight')
      return { kind: 'success', text }
    } catch (error) { return { kind: 'error', text: `${error.code ?? 'failed'}：${error.message}` } }
  }

  function start() {
    const ready = store.open().catch(error => ctx.logger.warn(`highlightpin storage: ${error.message}`))
    ctx.effect(() => () => store.close())
    // Outer listener computes after downstream pressure compaction.
    ctx.on('agent/pre-step', preStep, { prepend: true })
    ctx.on('agent/request-error', requestError, { prepend: true })
    ctx.on('agent/created', ({ agent }) => installStrict(agent))
    ctx.on('agent/disposed', ({ agent }) => { status.delete(agent.session.id); return disposeStrict(agent) })
    ctx.effect(() => async () => { for (const agent of [...promptFibers.keys()]) await disposeStrict(agent) })
    ctx.inject(['agents'], scope => { for (const agent of scope.agents.list()) installStrict(agent) })
    ctx.on('session/event', (session, event) => {
      if (event.type === 'compaction/end' && !event.data.error) status.set(session.id, { compacted: true, recalled: 0 })
      if (event.type === 'user/message' && event.data.source?.kind === NAME) {
        const state = status.get(session.id)
        if (state) state.recalled += event.data.source.pinIds?.length ?? 0
      }
    })
    ctx.effect(() => ctx.commands.register({ definitionId: CommandDefinitionId('dsh-highlightpin/hlpin'), name: 'hlpin', description: '划选定钉：list / last / show / drop / level', input: { hint: 'list | last | show <序号> | drop <序号> | level <序号> pin|resident|highlight' }, handler: command }))
    ctx.inject(['sessions'], scope => { services.sessions = scope.sessions })
    ctx.inject(['sessionPersistence'], scope => { services.sessionPersistence = scope.sessionPersistence })
    ctx.inject(['webServer', 'webRuntime'], scope => {
      const routes = makeRoutes({ store, pinSelection, trustedHosts: scope.webRuntime.trustedHosts, logger: ctx.logger, mode: config.mode, statusOf: id => status.get(id) ?? null })
      scope.effect(() => scope.webServer.register({ kind: 'prefix', path: ROUTE_PREFIX, handler: async (req, res) => {
        // UI status is derived only from committed events, never from a proposed decision.
        await routes(req, res)
      } }))
    })
    return ready
  }
  return { start, store, config, preStep, requestError, pinSelection, command, installStrict, disposeStrict, status }
}

export function apply(ctx, config) { const plugin = createPlugin(ctx, config); plugin.start(); return plugin }
