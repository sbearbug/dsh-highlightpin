import test from 'node:test'
import assert from 'node:assert/strict'
import vm from 'node:vm'
import { readFile } from 'node:fs/promises'
import { JSDOM } from 'jsdom'
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import * as jsxRuntime from 'react/jsx-runtime'

test('real React dock clears cancelled selections, protects only pin activation and controls per-pin levels', async () => {
  const dom = new JSDOM('<div data-conversation-session="s"><div data-chat-node-key="n"><p>用户原文</p></div></div><div id="mount"></div>')
  const saved = new Map(['window', 'document', 'IS_REACT_ACT_ENVIRONMENT'].map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]))
  globalThis.window = dom.window; globalThis.document = dom.window.document; globalThis.IS_REACT_ACT_ENVIRONMENT = true
  let loaded, component
  const calls = [], pins = []
  dom.window.__ModuleLoader__ = { load: value => { loaded = value } }
  vm.runInNewContext(await readFile(new URL('../lib/client.js', import.meta.url), 'utf8'), { window: dom.window, document: dom.window.document, fetch: async (url, options) => {
    const body = options.body ? JSON.parse(options.body) : null
    calls.push({ url, body })
    let response
    if (url.endsWith('/level')) { pins[0].level = body.level; response = { ok: true, pin: { ...pins[0] } } }
    else if (url.endsWith('/pin')) { const pin = { id: 'p_1', role: 'user', text: body.text, fidelity: 'source-exact', level: 'pin' }; pins.push(pin); response = { ok: true, pin } }
    else response = { ok: true, pins: pins.map(p => ({ ...p })), capabilities: { pinLevels: true }, usage: { count: pins.length, chars: 4, estimatedTokens: 2, pinChars: 4, residentChars: 0, highlightPins: 0, highlightChars: 0, limits: { maxPinChars: 16000, maxResidentChars: 6000, maxHighlightChars: 2000, mode: 'notice' } } }
    return { ok: true, json: async () => response }
  } })
  const mod = loaded.factory(name => name === 'react' ? React : jsxRuntime)
  mod.apply({ slots: { inject: (_name, fn) => fn(), register: (_options, value) => { component = value; return () => {} } } })
  const container = dom.window.document.getElementById('mount'), root = createRoot(container)
  const nodes = new Map([['n', { kind: 'user', id: 'm', data: { source: { kind: 'user' } } }]])
  const render = sessionId => React.createElement(component, { session: { sessionId }, useChat: selector => selector({ nodes }) })
  const click = async button => { await act(async () => { button.click() }) }
  try {
    await act(async () => { root.render(render('s')) })
    assert.equal(container.querySelectorAll('.hlpin-tools button').length, 2)
    assert.equal(container.querySelector('.hlpin-panel'), null)
    const range = dom.window.document.createRange(); range.selectNodeContents(dom.window.document.querySelector('p'))
    await act(async () => { dom.window.getSelection().addRange(range); dom.window.document.dispatchEvent(new dom.window.Event('selectionchange')) })
    const pinButton = container.querySelector('[aria-label="钉住选区"]')
    assert.equal(pinButton.disabled, false)
    await act(async () => { dom.window.getSelection().removeAllRanges(); dom.window.document.dispatchEvent(new dom.window.Event('selectionchange')) })
    assert.equal(pinButton.disabled, true, 'cancelling a selection must disable pinning')
    assert.equal(pinButton.getAttribute('data-ready'), 'false')
    await click(pinButton)
    assert.equal(calls.filter(c => c.url.endsWith('/pin')).length, 0, 'cancelled text must not be submitted')
    const select = async () => act(async () => {
      dom.window.getSelection().removeAllRanges(); dom.window.getSelection().addRange(range)
      dom.window.document.dispatchEvent(new dom.window.Event('selectionchange'))
    })
    await select()
    await act(async () => {
      dom.window.getSelection().collapseToEnd()
      dom.window.document.dispatchEvent(new dom.window.Event('selectionchange'))
    })
    assert.equal(pinButton.disabled, true, 'a collapsed range must disable pinning too')
    range.selectNodeContents(dom.window.document.querySelector('p'))
    await select()
    await act(async () => {
      pinButton.dispatchEvent(new dom.window.MouseEvent('mousedown', { bubbles: true, cancelable: true }))
      dom.window.getSelection().removeAllRanges()
      dom.window.document.dispatchEvent(new dom.window.Event('selectionchange'))
    })
    await act(async () => {
      dom.window.document.dispatchEvent(new dom.window.Event('pointercancel'))
    })
    assert.equal(pinButton.disabled, true, 'a cancelled pin gesture must release its cached selection')
    range.selectNodeContents(dom.window.document.querySelector('p'))
    await select()
    await act(async () => {
      pinButton.dispatchEvent(new dom.window.MouseEvent('pointerdown', { bubbles: true }))
      dom.window.getSelection().removeAllRanges()
      dom.window.document.dispatchEvent(new dom.window.Event('selectionchange'))
      dom.window.document.body.dispatchEvent(new dom.window.MouseEvent('pointerup', { bubbles: true }))
      await new Promise(resolve => dom.window.setTimeout(resolve, 5))
    })
    assert.equal(pinButton.disabled, true, 'releasing outside the button must not leave a stale activation')
    range.selectNodeContents(dom.window.document.querySelector('p'))
    await select()
    await act(async () => {
      pinButton.dispatchEvent(new dom.window.MouseEvent('mousedown', { bubbles: true, cancelable: true }))
      dom.window.getSelection().removeAllRanges()
      dom.window.document.dispatchEvent(new dom.window.Event('selectionchange'))
      pinButton.dispatchEvent(new dom.window.MouseEvent('mouseup', { bubbles: true }))
      pinButton.click()
    })
    assert.equal(pins[0].text, '用户原文')
    assert.equal(pinButton.disabled, true)
    assert.equal(container.querySelector('.hlpin-count').textContent, '1')
    const feedback = container.querySelector('.hlpin-feedback')
    assert.equal(feedback.parentElement, container.querySelector('.hlpin-tools'))
    const arrow = container.querySelector('.hlpin-arrow'); await click(arrow)
    assert.equal(container.querySelectorAll('[role="group"]').length, 1)
    assert.ok(container.textContent.includes('pin 4/16000 字符'))
    assert.ok(container.textContent.includes('resident 0/6000 字符'))
    assert.ok(container.textContent.includes('highlight 0/2000 字符'))
    assert.ok(!container.textContent.includes('/20 枚'))
    assert.equal(container.querySelector('[role="group"]').getAttribute('aria-label'), '钉子 1 的级别')
    for (const [i, level] of ['pin', 'resident', 'highlight'].entries()) {
      await click(container.querySelectorAll('.hlpin-mode')[i])
      assert.equal(pins[0].level, level)
      assert.equal(container.querySelectorAll('.hlpin-mode')[i].getAttribute('aria-pressed'), 'true')
    }
    assert.ok(container.textContent.includes('会进入系统提示词'))
    assert.ok(container.textContent.includes('前缀缓存会失效一次'))
    assert.ok(calls.some(c => c.body?.sessionId === 's' && c.body?.level === 'highlight'))
    await click(arrow); assert.equal(container.querySelector('.hlpin-panel'), null)
    await act(async () => { root.render(render('other')) })
    assert.equal(container.querySelector('.hlpin-panel'), null)
  } finally {
    await act(async () => { root.unmount() }); dom.window.close()
    for (const [key, descriptor] of saved) { if (descriptor) Object.defineProperty(globalThis, key, descriptor); else delete globalThis[key] }
  }
})

test('late load failure cannot reopen dismissed details; arrow, close and Escape remove the panel', async () => {
  const dom = new JSDOM('<style>section[hidden]{display:block!important}</style><div id="mount"></div>')
  const saved = new Map(['window', 'document', 'IS_REACT_ACT_ENVIRONMENT'].map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]))
  globalThis.window = dom.window; globalThis.document = dom.window.document; globalThis.IS_REACT_ACT_ENVIRONMENT = true
  let loaded, component, rejectInitial, requests = 0
  const initial = new Promise((_resolve, reject) => { rejectInitial = reject })
  const response = { ok: true, pins: [], mode: 'notice', usage: { count: 0, chars: 0, estimatedTokens: 0, limits: { maxPinChars: 16000, maxResidentChars: 6000, maxHighlightChars: 2000 } } }
  dom.window.__ModuleLoader__ = { load: value => { loaded = value } }
  vm.runInNewContext(await readFile(new URL('../lib/client.js', import.meta.url), 'utf8'), {
    window: dom.window, document: dom.window.document,
    fetch: async () => { if (++requests === 1) return initial; return { ok: true, json: async () => response } },
  })
  const mod = loaded.factory(name => name === 'react' ? React : jsxRuntime)
  mod.apply({ slots: { inject: (_name, fn) => fn(), register: (_options, value) => { component = value; return () => {} } } })
  const container = dom.window.document.getElementById('mount'), root = createRoot(container)
  const nodes = new Map()
  const click = async button => { await act(async () => { button.click() }) }
  try {
    await act(async () => { root.render(React.createElement(component, { sessionId: 's', useChat: selector => selector({ nodes }) })) })
    const arrow = container.querySelector('.hlpin-arrow')
    await click(arrow); assert.equal(arrow.getAttribute('aria-expanded'), 'true')
    await click(arrow); assert.equal(arrow.getAttribute('aria-expanded'), 'false')
    await act(async () => { rejectInitial(new Error('late network failure')); await initial.catch(() => {}) })
    assert.equal(arrow.getAttribute('aria-expanded'), 'false', 'late refresh errors must not change user-controlled expansion')
    assert.equal(container.querySelector('.hlpin-panel'), null, 'collapsed details must be absent, regardless of host hidden CSS')
    assert.ok(!container.textContent.includes('late network failure'), 'obsolete request errors are ignored')
    await click(arrow)
    await click(container.querySelector('[aria-label="关闭钉子详情"]'))
    assert.equal(container.querySelector('.hlpin-panel'), null)
    await click(arrow)
    await act(async () => { container.querySelector('.hlpin-panel').dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true })) })
    assert.equal(container.querySelector('.hlpin-panel'), null)
    for (let i = 0; i < 3; i++) {
      await click(arrow); assert.ok(container.querySelector('.hlpin-panel'))
      await click(arrow); assert.equal(container.querySelector('.hlpin-panel'), null)
    }
  } finally {
    await act(async () => { root.unmount() })
    dom.window.close()
    for (const [key, descriptor] of saved) { if (descriptor) Object.defineProperty(globalThis, key, descriptor); else delete globalThis[key] }
  }
})

test('an older same-session refresh cannot overwrite the newest pin level', async () => {
  const dom = new JSDOM('<div id="mount"></div>')
  const saved = new Map(['window', 'document', 'IS_REACT_ACT_ENVIRONMENT'].map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]))
  globalThis.window = dom.window; globalThis.document = dom.window.document; globalThis.IS_REACT_ACT_ENVIRONMENT = true
  let loaded, component, requests = 0
  const resolvers = []
  const response = level => ({ ok: true, json: async () => ({ ok: true, capabilities: { pinLevels: true }, pins: [{ id: 'p_1', level, text: '原文', role: 'user', fidelity: 'source-exact' }], usage: { count: 1, chars: 2, limits: { maxPinChars: 16000, maxResidentChars: 6000, maxHighlightChars: 2000 } } }) })
  dom.window.__ModuleLoader__ = { load: value => { loaded = value } }
  vm.runInNewContext(await readFile(new URL('../lib/client.js', import.meta.url), 'utf8'), {
    window: dom.window, document: dom.window.document,
    fetch: async () => ++requests === 1 ? response('pin') : new Promise(resolve => resolvers.push(resolve)),
  })
  const mod = loaded.factory(name => name === 'react' ? React : jsxRuntime)
  mod.apply({ slots: { inject: (_name, fn) => fn(), register: (_options, value) => { component = value; return () => {} } } })
  const container = dom.window.document.getElementById('mount'), root = createRoot(container), nodes = new Map()
  try {
    await act(async () => root.render(React.createElement(component, { sessionId: 's', useChat: fn => fn({ nodes }) })))
    await act(async () => container.querySelector('.hlpin-arrow').click()) // old refresh pending
    await act(async () => container.querySelector('[aria-label="刷新钉子"]').click()) // new refresh pending
    assert.equal(resolvers.length, 2)
    await act(async () => resolvers[1](response('highlight')))
    assert.equal(container.querySelectorAll('.hlpin-mode')[2].getAttribute('aria-pressed'), 'true')
    await act(async () => resolvers[0](response('resident')))
    assert.equal(container.querySelectorAll('.hlpin-mode')[2].getAttribute('aria-pressed'), 'true')
    assert.equal(container.querySelectorAll('.hlpin-mode')[1].getAttribute('aria-pressed'), 'false')
  } finally {
    await act(async () => root.unmount()); dom.window.close()
    for (const [key, descriptor] of saved) { if (descriptor) Object.defineProperty(globalThis, key, descriptor); else delete globalThis[key] }
  }
})
