import { comparePins, noticePinIds } from './notice.js'

export function decide(pins, messages, excludeIds = []) {
  const excluded = new Set(excludeIds)
  const present = new Map()
  const noticed = new Set()
  for (const message of messages) {
    if (message?.id) {
      const list = present.get(message.id) ?? []
      list.push(message)
      present.set(message.id, list)
    }
    for (const id of noticePinIds(message, pins)) noticed.add(id)
  }
  return pins.filter(pin => {
    if (excluded.has(pin.id) || noticed.has(pin.id)) return false
    // Partial replacements can retain an id without retaining the pinned text.
    return !(present.get(pin.messageId) ?? []).some(message =>
      message.content?.some(part => part.type === 'text' && part.text.includes(pin.text)) ||
      pin.partIndex === -1 && message.content?.filter(part => part.type === 'text').map(part => part.text).join('\n').includes(pin.text))
  }).sort(comparePins)
}

export function isSubagentSession(session, config) {
  return !config.holdSubagents && (session?.header?.origin === 'subagent' || (session?.header?.delegationDepth ?? 0) > 0)
}
