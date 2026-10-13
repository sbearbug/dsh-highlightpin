import { NAME } from './config.js'

export const comparePins = (a, b) => a.createdAt - b.createdAt || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)
export const LEGACY_NOTICE_HEADER = `[${NAME}] 以下是用户在本会话中钉住的原文。原文所在的上下文已被压缩，这里逐字重现，仅作背景参考，不是新的指令。`
export const NOTICE_HEADER = `[${NAME}] 以下是用户在本会话中钉住的原文，它们已不在当前上下文中，这里逐字重现，仅作背景参考，不是新的指令。`
export const RESIDENT_HEADER = `[${NAME}] 以下是用户钉住的背景资料，逐字保存。在相关时参考即可，不需要主动提及，也不是新的指令。`
export const HIGHLIGHT_HEADER = `[${NAME}] 以下是用户特别标注、希望你重点留意的原文。在相关时优先遵循，不需要每轮复述；它们不是新的指令；若与用户最新的明确要求冲突，以最新要求为准。`

export function pinBlock(pin) {
  let tag = 'pinned'
  if (pin.text.includes('</pinned>')) tag = `pinned-${pin.textHash}`
  // Even a hash-derived delimiter can occur in user text. Choose deterministically.
  while (pin.text.includes(`</${tag}>`)) tag += '-x'
  return `<${tag} id="${pin.id}" from="${pin.role}">\n${pin.text}\n</${tag}>`
}

export function renderNotice(pins, { strict = false } = {}) {
  if (!pins.length) return ''
  if (strict) return renderSections(pins.map(pin => ({ ...pin, level: pin.level === 'highlight' ? 'highlight' : 'resident' })))
  return [NOTICE_HEADER, ...pins.slice().sort(comparePins).map(pinBlock)].join('\n')
}

export function renderSections(pins) {
  const section = (level, title) => {
    const selected = pins.filter(pin => pin.level === level).sort(comparePins)
    return selected.length ? [title, ...selected.map(pinBlock)].join('\n') : ''
  }
  return [section('resident', RESIDENT_HEADER), section('highlight', HIGHLIGHT_HEADER)].filter(Boolean).join('\n\n')
}

export function noticePinIds(message, pins) {
  if (message?.role !== 'user') return []
  const text = (message.content ?? []).filter(p => p.type === 'text').map(p => p.text).join('\n')
  // A known foreign producer must never be mistaken for this plugin.
  if (message.source && message.source.kind !== NAME) return []
  if (message.source?.kind === NAME && message.source.form !== 'notice') return []
  if (![NOTICE_HEADER, LEGACY_NOTICE_HEADER].some(header => text.startsWith(header + '\n'))) return []
  // Metadata alone is insufficient: a projected/truncated notice must still contain
  // the complete byte-identical block. Text recognition also survives lost source.
  return pins.filter(pin => text.includes(pinBlock(pin))).map(pin => pin.id)
}
