// A conservative Markdown projection, not a Markdown renderer. Unknown constructs
// stay literal and fail safely to rendered fidelity. All successful ranges slice source.
export function project(source) {
  const visible = Array(source.length).fill(true)
  const spans = []
  const hide = (a, b) => { for (let i = a; i < b; i++) visible[i] = false }
  const protect = Array(source.length).fill(false)
  const markCode = (a, b) => { for (let i = a; i < b; i++) protect[i] = true }
  // Fence metadata is not visible. Preserve code bytes, including partial selections.
  const fences = /^( {0,3})(`{3,}|~{3,})[^\n]*\n([\s\S]*?)^ {0,3}\2[ \t]*(?:\n|$)/gm
  for (const m of source.matchAll(fences)) {
    const body = m.index + m[0].indexOf('\n') + 1
    hide(m.index, body)
    hide(body + m[3].length, m.index + m[0].length)
    markCode(body, body + m[3].length)
  }
  for (const m of source.matchAll(/(`+)([^`\n]+)\1/g)) {
    if (protect[m.index]) continue
    const innerStart = m.index + m[1].length
    const innerEnd = m.index + m[0].length - m[1].length
    hide(m.index, innerStart); hide(innerEnd, m.index + m[0].length)
    markCode(innerStart, innerEnd)
    spans.push({ start: m.index, end: m.index + m[0].length, innerStart, innerEnd })
  }
  for (const m of source.matchAll(/(\${1,2})([\s\S]*?)\1/g)) {
    if (protect[m.index]) continue
    markCode(m.index, m.index + m[0].length)
    const bodyStart = m.index + m[1].length
    const leading = m[2].length - m[2].trimStart().length
    const trailing = m[2].length - m[2].trimEnd().length
    hide(bodyStart, bodyStart + leading)
    hide(bodyStart + m[2].length - trailing, bodyStart + m[2].length)
  }
  // Keep labels; opening/closing syntax is included when the entire label is selected.
  for (const m of source.matchAll(/(?<!!)\[([^\]\n]+)\]\([^\n)]*\)/g)) {
    if (protect[m.index]) continue
    const innerStart = m.index + 1, innerEnd = innerStart + m[1].length
    hide(m.index, innerStart); hide(innerEnd, m.index + m[0].length)
    spans.push({ start: m.index, end: m.index + m[0].length, innerStart, innerEnd })
  }
  for (const m of source.matchAll(/(\*\*|__|~~|\*|_)(?=\S)([^\n]*?\S)\1/g)) {
    if (protect[m.index]) continue
    if (m[1] === '_' && /[\p{L}\p{N}]/u.test(source[m.index - 1] ?? '')) continue
    const innerStart = m.index + m[1].length
    const innerEnd = m.index + m[0].length - m[1].length
    hide(m.index, innerStart); hide(innerEnd, m.index + m[0].length)
    spans.push({ start: m.index, end: m.index + m[0].length, innerStart, innerEnd })
  }
  for (const m of source.matchAll(/^ {0,3}(?:#{1,6}[ \t]+|>[ \t]?|[-+*][ \t]+|\d+[.)][ \t]+)/gm)) {
    if (!protect[m.index]) hide(m.index, m.index + m[0].length)
  }
  let raw = '', rawMap = [], rawEnds = []
  for (let i = 0; i < source.length; i++) {
    if (!visible[i]) continue
    if (!protect[i] && source[i] === '\\' && /[\\`*{}\[\]()#+.!_>~-]/.test(source[i + 1] ?? '')) {
      i++
      raw += source[i]; rawMap.push(i - 1); rawEnds.push(i + 1)
    } else {
      raw += source[i]; rawMap.push(i); rawEnds.push(i + 1)
    }
  }
  let plain = '', map = [], ends = []
  const segments = new Intl.Segmenter('und', { granularity: 'grapheme' }).segment(raw)
  for (const { segment, index } of segments) {
    const normalized = segment.normalize('NFC').replace(/\s/gu, ' ')
    for (const char of normalized) {
      if (char === ' ' && plain.endsWith(' ')) { ends[ends.length - 1] = rawEnds[index + segment.length - 1]; continue }
      plain += char
      for (let j = 0; j < char.length; j++) { map.push(rawMap[index]); ends.push(rawEnds[index + segment.length - 1]) }
    }
  }
  return { plain, map, ends, spans }
}

function occurrences(source, needle) {
  const positions = []
  if (!needle) return positions
  for (let i = source.indexOf(needle); i !== -1; i = source.indexOf(needle, i + 1)) positions.push(i)
  return positions
}

const normalize = text => project(text).plain.trim()
function score(candidate, before, after) {
  const left = normalize(candidate.source.slice(0, candidate.start)).slice(-64)
  const right = normalize(candidate.source.slice(candidate.end)).slice(0, 64)
  const b = normalize(before).slice(-64), a = normalize(after).slice(0, 64)
  let same = 0, total = b.length + a.length
  for (let i = 1; i <= Math.min(left.length, b.length); i++) { if (left.at(-i) !== b.at(-i)) break; same++ }
  for (let i = 0; i < Math.min(right.length, a.length); i++) { if (right[i] !== a[i]) break; same++ }
  return total ? same / total : 0
}

function choose(candidates, before, after) {
  if (candidates.length === 1) return candidates[0]
  const ranked = candidates.map(c => ({ ...c, score: score(c, before, after) })).sort((a, b) => b.score - a.score)
  if (!ranked.length || ranked[0].score < 0.6 || ranked[0].score - ranked[1].score < 0.15) return null
  return ranked[0]
}

export function align(parts, { text, before = '', after = '' }) {
  if (typeof text !== 'string' || !text.trim()) throw new TypeError('selection must not be empty')
  const sources = parts.map((part, partIndex) => ({ source: part.type === 'text' ? part.text : null, partIndex })).filter(p => typeof p.source === 'string')
  const exact = sources.flatMap(p => occurrences(p.source, text).map(start => ({ ...p, start, end: start + text.length })))
  let candidate = choose(exact, before, after)
  if (candidate) return { partIndex: candidate.partIndex, start: candidate.start, end: candidate.end, text: candidate.source.slice(candidate.start, candidate.end), fidelity: 'source-exact' }
  // If exact occurrences are ambiguous, do not re-label the same ambiguity as normalized.
  if (!exact.length) {
    const needle = normalize(text)
    const projected = sources.flatMap(p => {
      const projection = project(p.source)
      return occurrences(projection.plain, needle).map(index => {
        let start = projection.map[index], end = projection.ends[index + needle.length - 1]
        // Expand only touched marker boundaries; interior code fragments stay interior.
        let changed = true
        while (changed) {
          changed = false
          for (const span of projection.spans) {
            const wholeInner = start <= span.innerStart && end >= span.innerEnd
            const crossesOpen = start < span.innerStart && end > span.innerStart && end < span.end
            const crossesClose = start > span.start && start < span.innerEnd && end > span.innerEnd
            if ((wholeInner || crossesOpen || crossesClose) && (start > span.start || end < span.end)) {
              start = Math.min(start, span.start); end = Math.max(end, span.end); changed = true
            }
          }
        }
        return { ...p, start, end }
      })
    })
    candidate = choose(projected, before, after)
    if (candidate) return { partIndex: candidate.partIndex, start: candidate.start, end: candidate.end, text: candidate.source.slice(candidate.start, candidate.end), fidelity: 'source-normalized' }
  }
  return { partIndex: -1, start: -1, end: -1, text, fidelity: 'rendered', warning: '未能对齐到源文本，存的是显示文本。' }
}
