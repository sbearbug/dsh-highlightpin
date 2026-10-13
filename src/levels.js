export const LEVELS = ['pin', 'resident', 'highlight']
export function effectiveLevel(pin) {
  return pin.level ?? 'pin'
}
export function levelUsage(pins) {
  const chars = level => pins.filter(p => (p.level ?? 'pin') === level).reduce((n, p) => n + p.text.length, 0)
  return { pinChars: chars('pin'), residentChars: chars('resident'), highlightPins: pins.filter(p => p.level === 'highlight').length, highlightChars: chars('highlight') }
}
