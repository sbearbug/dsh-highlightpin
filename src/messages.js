export function eventMessage(event) {
  if (event?.type === 'user/message') return event.data
  if (event?.type === 'assistant/message') return event.data?.message
  return null
}

export function findMessage(events, messageId) {
  let found = null
  for (const event of events) {
    const message = eventMessage(event)
    if (message?.id === messageId) found = { message, event }
  }
  if (!found || !['user', 'assistant'].includes(found.message.role)) return null
  if (found.message.role === 'user' && found.message.source?.kind !== 'user') return null
  return found
}

export function lastAssistant(events) {
  let id = null
  for (const event of events) {
    const m = eventMessage(event)
    if (m?.role === 'assistant' && m.content?.some(p => p.type === 'text' && p.text.trim())) id = m.id
  }
  return id ? findMessage(events, id) : null
}
