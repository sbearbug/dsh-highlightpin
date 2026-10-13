export const MESSAGE_SELECTOR = '[data-chat-node-key]'
export const UI_SELECTOR = 'button, [role="button"], [data-code-block-banner], [data-line-number], .line-number, .hljs-ln-numbers, [data-variant="think"], [data-message-attachments], [aria-hidden="true"]'
const BLOCKS = new Set(['P', 'LI', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'PRE', 'BLOCKQUOTE', 'DIV', 'UL', 'OL', 'TR'])
const elementOf = node => node?.nodeType === 1 ? node : node?.parentElement

export function serialize(node) {
  if (node.nodeType === 3) return node.data
  if (node.nodeType !== 1 && node.nodeType !== 11) return ''
  if (node.nodeType === 1) {
    // KaTeX contains an aria-hidden visual duplicate: handle formula first.
    if (node.matches('.katex-display, .katex')) {
      const tex = node.querySelector('annotation[encoding="application/x-tex"]')?.textContent
      if (tex == null) throw new Error('公式缺少 TeX annotation，无法可靠保存。')
      const delimiter = node.matches('.katex-display') ? '$$' : '$'
      return delimiter + tex + delimiter
    }
    if (node.matches(UI_SELECTOR)) return ''
    if (node.tagName === 'BR') return '\n'
  }
  let text = '', previousBlock = false
  for (const child of node.childNodes) {
    const value = serialize(child)
    if (!value) continue
    const block = child.nodeType === 1 && (BLOCKS.has(child.tagName) || child.matches('.katex-display'))
    if ((block || previousBlock) && text && !text.endsWith('\n') && !value.startsWith('\n')) text += '\n'
    text += value
    previousBlock = block
  }
  return text
}

export function snapMath(range) {
  const snapped = range.cloneRange()
  const start = elementOf(range.startContainer)?.closest('.katex-display, .katex')
  const end = elementOf(range.endContainer)?.closest('.katex-display, .katex')
  const formula = el => el?.closest('.katex-display') ?? el
  if (start) snapped.setStartBefore(formula(start))
  if (end) snapped.setEndAfter(formula(end))
  return snapped
}

export function captureSelection(selection, { sessionId, nodes }) {
  if (!selection || selection.isCollapsed || selection.rangeCount !== 1) return { empty: true }
  const original = selection.getRangeAt(0)
  const startEl = elementOf(original.startContainer), endEl = elementOf(original.endContainer)
  const root = startEl?.closest(MESSAGE_SELECTOR)
  if (!root || root !== endEl?.closest(MESSAGE_SELECTOR)) return { error: '请在同一条已定稿消息内划选，不能跨消息。' }
  const owner = root.closest('[data-conversation-session]')
  if (!owner || owner.getAttribute('data-conversation-session') !== sessionId) return { error: '选区不属于当前会话，请在当前会话中重新划选。' }
  const chrome = el => el.closest('button, [role="button"], [data-code-block-banner], [data-line-number], .line-number, .hljs-ln-numbers, [data-variant="think"], [data-message-attachments]')
  if (chrome(startEl) || chrome(endEl)) return { error: '请选择消息正文，不能钉住操作按钮或推理节点。' }
  const node = nodes.get(root.getAttribute('data-chat-node-key'))
  let messageId
  if (['user', 'steering'].includes(node?.kind) && node.data?.source?.kind === 'user') messageId = node.data.messageId ?? node.id
  if (node?.kind === 'assistant-step' && node.data?.status !== 'running' && node.data?.finalNode?.kind === 'assistant') messageId = node.data.finalNode.messageId
  if (!messageId || root.getAttribute('data-chat-group-part') === 'reasoning') return { error: '仅支持已定稿的用户和助手正文；流式回复、工具输出暂不支持。' }
  try {
    const range = snapMath(original)
    const text = serialize(range.cloneContents())
    if (!text.trim()) return { empty: true }
    const beforeRange = root.ownerDocument.createRange()
    beforeRange.selectNodeContents(root)
    beforeRange.setEnd(range.startContainer, range.startOffset)
    const afterRange = root.ownerDocument.createRange()
    afterRange.selectNodeContents(root)
    afterRange.setStart(range.endContainer, range.endOffset)
    return { value: { sessionId, messageId, text, before: serialize(beforeRange.cloneContents()).slice(-64), after: serialize(afterRange.cloneContents()).slice(0, 64) } }
  } catch (error) { return { error: error.message } }
}
