import test from 'node:test'
import assert from 'node:assert/strict'
import { JSDOM } from 'jsdom'
import { captureSelection, serialize, snapMath } from '../src/client/selection.js'

function fixture(html) {
  const dom = new JSDOM(`<div data-conversation-session="s"><div data-chat-node-key="n">${html}</div><div data-chat-node-key="other">other</div></div>`)
  const document = dom.window.document
  const nodes = new Map([['n', { id: 'm', kind: 'assistant-step', data: { status: 'settled', finalNode: { kind: 'assistant', messageId: 'm' } } }]])
  const range = document.createRange(), selection = dom.window.getSelection()
  return { dom, document, range, selection, nodes, close: () => dom.window.close() }
}
test('block boundaries, br, code bytes and UI removal', () => {
  const f = fixture('<p>first<br>line</p><p>second</p><div class="md-code-block"><div data-code-block-banner>JavaScript<button>copy</button></div><pre><code>const x = 1;\n  x++;</code></pre></div>')
  assert.equal(serialize(f.document.querySelector('[data-chat-node-key]')), 'first\nline\nsecond\nconst x = 1;\n  x++;')
  f.close()
})
for (const display of [false, true]) test(`KaTeX ${display ? 'display' : 'inline'} extracts annotation and snaps partial formula boundaries`, () => {
  const math = '<span class="katex"><span class="katex-mathml"><annotation encoding="application/x-tex">x_i^2</annotation></span><span class="katex-html" aria-hidden="true">visualduplicate</span></span>'
  const f = fixture(`<p>前文 ${display ? `<span class="katex-display">${math}</span>` : math} 后文</p>`)
  const textNode = f.document.querySelector('.katex-html').firstChild
  f.range.setStart(textNode, 1); f.range.setEnd(textNode, 3)
  f.selection.addRange(f.range)
  const value = captureSelection(f.selection, { sessionId: 's', nodes: f.nodes }).value
  assert.equal(value.text, display ? '$$x_i^2$$' : '$x_i^2$')
  assert.equal(value.messageId, 'm'); assert.ok(value.before.endsWith('前文 ')); assert.ok(value.after.startsWith(' 后文'))
  assert.equal(serialize(snapMath(f.range).cloneContents()), value.text)
  f.close()
})
test('partial code selections preserve whitespace and do not expand to the entire block', () => {
  const f = fixture('<pre><code>line 1\n  line 2\nline 3\n</code></pre>')
  const text = f.document.querySelector('code').firstChild
  f.range.setStart(text, 7); f.range.setEnd(text, 16); f.selection.addRange(f.range)
  assert.equal(captureSelection(f.selection, { sessionId: 's', nodes: f.nodes }).value.text, '  line 2\n')
  f.close()
})
test('element offsets use ranges for context rather than treating offsets as character indices', () => {
  const f = fixture('<p>before <strong>selected</strong> after</p>'), p = f.document.querySelector('p')
  f.range.setStart(p, 1); f.range.setEnd(p, 2); f.selection.addRange(f.range)
  const value = captureSelection(f.selection, { sessionId: 's', nodes: f.nodes }).value
  assert.equal(value.text, 'selected'); assert.equal(value.before, 'before '); assert.equal(value.after, ' after')
  f.close()
})
test('cross-message, streaming, tool and reasoning selections are explicitly rejected', () => {
  const f = fixture('<p>assistant</p>')
  f.range.setStart(f.document.querySelector('p').firstChild, 0)
  f.range.setEnd(f.document.querySelector('[data-chat-node-key="other"]').firstChild, 3)
  f.selection.addRange(f.range)
  assert.ok(captureSelection(f.selection, { sessionId: 's', nodes: f.nodes }).error.includes('跨消息'))
  f.selection.removeAllRanges(); f.range.selectNodeContents(f.document.querySelector('p')); f.selection.addRange(f.range)
  for (const node of [{ kind: 'assistant-step', data: { status: 'running' } }, { kind: 'tool-call', data: {} }]) {
    f.nodes.set('n', node)
    assert.ok(captureSelection(f.selection, { sessionId: 's', nodes: f.nodes }).error)
  }
  f.close()
})
test('user identity comes from the projected Chat node, not a guessed DOM attribute', () => {
  const f = fixture('<p>用户正文</p>')
  f.nodes.set('n', { id: 'user_id', kind: 'user', data: { source: { kind: 'user' } } })
  f.range.selectNodeContents(f.document.querySelector('p')); f.selection.addRange(f.range)
  assert.equal(captureSelection(f.selection, { sessionId: 's', nodes: f.nodes }).value.messageId, 'user_id')
  f.close()
})
test('serialized selection survives detached virtual/paged DOM nodes', () => {
  const f = fixture('<p>已经缓存</p>')
  f.range.selectNodeContents(f.document.querySelector('p')); f.selection.addRange(f.range)
  const cached = captureSelection(f.selection, { sessionId: 's', nodes: f.nodes }).value
  f.document.querySelector('[data-chat-node-key]').remove(); f.selection.removeAllRanges()
  assert.equal(cached.text, '已经缓存'); assert.ok(captureSelection(f.selection, { sessionId: 's', nodes: f.nodes }).empty)
  f.close()
})

test('identical Chat node keys in another session cannot capture the wrong source message', () => {
  const f = fixture('<p>另一个会话</p>')
  f.range.selectNodeContents(f.document.querySelector('p')); f.selection.addRange(f.range)
  assert.ok(captureSelection(f.selection, { sessionId: 'other-session', nodes: f.nodes }).error.includes('当前会话'))
  f.close()
})
