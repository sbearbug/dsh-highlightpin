import { DomainFacility } from '@deepseek-ai/dsh-storage-domain'

// Real official domain runtime, with only its durable backend replaced. This
// exercises the real write chain and commit-before-memory semantics.
export function memoryStorage() {
  const records = {}, changes = [], control = { fail: false, gate: null, closes: 0 }
  const facility = new DomainFacility({
    logger: { warn() {} }, emit: (name, value) => changes.push({ name, value }),
    storage: { backend: { get: () => ({ kv: { open: async () => ({
      loadAll: async () => ({ tables: structuredClone(records), global: null }),
      putRecord: async (table, key, value) => {
        if (control.gate) await control.gate
        if (control.fail) throw new Error('disk-full')
        records[table] ??= {}; records[table][key] = structuredClone(value)
      },
      deleteRecord: async (table, key) => { delete records[table]?.[key] },
      close: async () => { control.closes++ },
    }) } }) } },
  }, { backend: 'memory' })
  return { facility, records, changes, control }
}

export const pinInput = (overrides = {}) => ({ sessionId: 's', messageId: 'm', role: 'assistant', partIndex: 0, start: 0, end: 4, text: '原文事实', fidelity: 'source-exact', ...overrides })
export const message = (id = 'm', text = '原文事实', role = 'assistant') => ({ id, role, content: [{ type: 'text', text }], ...(role === 'user' ? { source: { kind: 'user' } } : {}) })

export function fakeContext(storageDomain, extra = {}) {
  const listeners = {}, cleanups = [], routes = [], commands = [], logs = []
  const ctx = {
    storageDomain, logger: { warn: value => logs.push(value) },
    commands: { register: value => { commands.push(value); return () => commands.splice(commands.indexOf(value), 1) } },
    on: (name, handler, options) => { listeners[name] = { handler, options }; return () => {} },
    effect: fn => { const disposer = fn(); if (typeof disposer === 'function') cleanups.push(disposer); return disposer },
    inject: (names, callback) => {
      if (names.every(name => name in ctx)) callback(ctx)
      return { dispose: async () => {} }
    },
    ...extra,
  }
  return { ctx, listeners, cleanups, routes, commands, logs, async close() { for (const dispose of cleanups.reverse()) await dispose() } }
}
