import { createHash, randomUUID } from 'node:crypto'
import { z } from 'zod'
import { defineDomain, domainTable } from '@deepseek-ai/dsh-storage-domain'
import { validateConfig } from './config.js'
import { comparePins } from './notice.js'
import { LEVELS, effectiveLevel, levelUsage } from './levels.js'

export const textHash = text => createHash('sha256').update(text, 'utf8').digest('hex').slice(0, 16)
const pinSchema = z.object({
  id: z.string().regex(/^p_[a-zA-Z0-9_-]+$/), sessionId: z.string().min(1), messageId: z.string().min(1),
  role: z.enum(['user', 'assistant']), partIndex: z.number().int().min(-1), start: z.number().int().min(-1), end: z.number().int().min(-1),
  text: z.string().min(1), textHash: z.string().regex(/^[a-f0-9]{16}$/),
  fidelity: z.enum(['source-exact', 'source-normalized', 'rendered']), createdAt: z.number().finite(),
  level: z.enum(['pin', 'resident', 'highlight']).optional(),
})
// A record from before 0.1.1 may still carry a `mode` field; the schema drops it on read.
export const domainSpec = defineDomain({ name: 'highlightpin', version: 1, tables: { sessions: domainTable(z.object({ pins: z.array(pinSchema) })) } })
export class PinError extends Error {
  constructor(code, message, status = 400) { super(message); this.code = code; this.status = status }
}

export function createStore({ storageDomain, config = {}, now = Date.now, makeId = () => `p_${randomUUID().replaceAll('-', '')}` }) {
  const limits = validateConfig(config)
  let domain, opening, closed = false, chain = Promise.resolve()
  function requireReady() { if (!domain || closed) throw new PinError('not-ready', '钉子存储尚未就绪。', 503); return domain.table('sessions') }
  function enqueue(fn) { const task = chain.then(fn); chain = task.catch(() => {}); return task }
  const resolvePins = record => (record?.pins ?? []).map(pin => ({ ...pin, level: effectiveLevel(pin) })).sort(comparePins)
  const list = sessionId => resolvePins(requireReady().get(sessionId))
  function checkLevelBudget(pins, levels) {
    const usage = levelUsage(pins)
    for (const level of levels) {
      const key = `max${level[0].toUpperCase()}${level.slice(1)}Chars`
      if (usage[`${level}Chars`] > limits[key]) throw new PinError(`${level}-budget-exceeded`, `${level} 原文超过 ${limits[key]} 字符。`)
    }
  }
  return {
    get ready() { return Boolean(domain) && !closed },
    open() {
      if (closed) return Promise.reject(new PinError('not-ready', '存储已关闭。', 503))
      return opening ??= (async () => {
        for (let attempt = 0; attempt < 3; attempt++) {
          try {
            const value = await storageDomain.open(domainSpec)
            if (closed) { await value.close(); return }
            domain = value; return
          } catch (error) {
            if (closed || attempt === 2) throw error
            await new Promise(resolve => setTimeout(resolve, 100 * (attempt + 1)))
          }
        }
      })()
    },
    list,
    setLevel(sessionId, pinId, level) {
      if (!LEVELS.includes(level)) return Promise.reject(new PinError('bad-level', '级别必须是 pin、resident 或 highlight。'))
      return enqueue(async () => {
        const table = requireReady(), record = table.get(sessionId)
        const pin = record?.pins.find(p => p.id === pinId)
        if (!pin) throw new PinError('pin-not-found', '钉子不存在。', 404)
        const old = pin.level ?? 'pin'
        const next = { ...record, pins: record.pins.map(p => p.id === pinId ? { ...p, level } : p) }
        // Always allow demotions and no-op changes, even if legacy data is over budget.
        if (LEVELS.indexOf(level) > LEVELS.indexOf(old)) checkLevelBudget(resolvePins(next), [effectiveLevel({ level })])
        await table.update(sessionId, () => next)
        return { ok: true, pin: list(sessionId).find(p => p.id === pinId), usage: this.usage(sessionId) }
      })
    },
    usage(sessionId) { const pins = list(sessionId), chars = pins.reduce((n, p) => n + p.text.length, 0); return { count: pins.length, chars, estimatedTokens: Math.ceil(chars / 2), ...levelUsage(pins), limits } },
    add(input) {
      return enqueue(async () => {
        const table = requireReady()
        const pin = pinSchema.parse({ ...input, level: input.level ?? 'pin', id: makeId(), textHash: textHash(input.text), createdAt: now() })
        const pins = list(pin.sessionId)
        const duplicate = pins.find(p => p.messageId === pin.messageId && p.partIndex === pin.partIndex && p.start === pin.start && p.end === pin.end && (pin.fidelity !== 'rendered' || p.text === pin.text))
        if (duplicate) return { ok: true, already: true, pin: duplicate }
        const level = effectiveLevel(pin)
        checkLevelBudget([...pins, { ...pin, level }], [level])
        if (table.get(pin.sessionId) === undefined) await table.put(pin.sessionId, { pins: [] })
        await table.update(pin.sessionId, record => ({ ...record, pins: [...record.pins, pin] }))
        return { ok: true, already: false, pin }
      })
    },
    remove(sessionId, pinId) {
      return enqueue(async () => {
        const table = requireReady(), pins = list(sessionId)
        if (!pins.some(p => p.id === pinId)) throw new PinError('pin-not-found', '钉子不存在。', 404)
        await table.update(sessionId, record => ({ ...record, pins: record.pins.filter(p => p.id !== pinId) }))
        return { ok: true, removed: 1 }
      })
    },
    async close() { closed = true; await chain; await opening?.catch(() => {}); if (domain) { await domain.close(); domain = undefined } },
  }
}
