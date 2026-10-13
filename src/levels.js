export const LEVELS = ['pin', 'resident', 'highlight']
export function effectiveLevel(pin, legacyMode, profileMode) {
  const level = pin.level ?? (legacyMode === 'strict' ? 'resident' : 'pin')
  return profileMode === 'strict' && level === 'pin' ? 'resident' : level
}
export function levelUsage(pins) {
  const chars = level => pins.filter(p => (p.level ?? 'pin') === level).reduce((n, p) => n + p.text.length, 0)
  return { pinChars: chars('pin'), residentChars: chars('resident'), highlightPins: pins.filter(p => p.level === 'highlight').length, highlightChars: chars('highlight') }
}
