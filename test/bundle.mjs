import assert from 'node:assert/strict'
import vm from 'node:vm'
import { readFile } from 'node:fs/promises'
const source = await readFile(new URL('../lib/client.js', import.meta.url), 'utf8')
let loaded
vm.runInNewContext(source, { window: { __ModuleLoader__: { load: value => { loaded = value } } } })
assert.equal(loaded.id, 'dsh-highlightpin')
const mod = loaded.factory(name => {
  if (name === 'react') return { createElement() {}, useCallback() {}, useEffect() {}, useRef() {}, useState() {} }
  if (name === 'react/jsx-runtime') return { jsx() {}, jsxs() {} }
  throw new Error(`Unexpected dependency: ${name}`)
})
assert.equal(typeof mod.apply, 'function')
const registrations = []
mod.apply({ slots: { inject: (name, fn) => { assert.equal(name, 'conversation.input.dock'); fn() }, register: (options, component) => { registrations.push({ options, component }); return () => {} } } })
assert.equal(registrations.length, 1); assert.equal(registrations[0].options.id, 'highlightpin')
assert.equal(typeof registrations[0].component, 'function')
assert.ok(!source.includes('@deepseek-ai/dsh-client-'))
console.log('Client loader factory and dock registration verified.')
