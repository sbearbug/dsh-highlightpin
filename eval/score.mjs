import { readFile, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

// No whitespace normalization: count byte-identical fact containment only.
export function score(data) {
  if (!Array.isArray(data.facts) || !Array.isArray(data.runs)) throw new TypeError('facts and runs must be arrays')
  const facts = new Map(data.facts.map(f => [f.id, f]))
  const groups = new Map(), seen = new Set()
  for (const run of data.runs) {
    const fact = facts.get(run.factId)
    if (!fact || typeof fact.expected !== 'string' || !fact.expected || typeof fact.pinned !== 'boolean') throw new TypeError('invalid fact')
    if (!['none', 'bite', 'pin', 'resident', 'highlight'].includes(run.condition) || typeof run.answer !== 'string' || typeof run.seed !== 'string') throw new TypeError('invalid run')
    const probeType = run.probeType ?? 'recall'
    if (!['recall', 'unprompted'].includes(probeType)) throw new TypeError('invalid probeType')
    if (probeType === 'unprompted' && run.promptMentionsFact !== false) throw new TypeError('unprompted probes require promptMentionsFact=false')
    const key = JSON.stringify([run.condition, run.seed, run.factId, probeType])
    if (seen.has(key)) throw new TypeError('duplicate condition/seed/fact run')
    seen.add(key)
    const group = groups.get(run.condition) ?? { condition: run.condition, pinned: { hits: 0, total: 0 }, unpinned: { hits: 0, total: 0 }, activeMention: { mentions: 0, total: 0 }, cacheHitTokens: 0, cacheMissTokens: 0, measuredCacheRequests: 0, injectedTokens: 0, measuredInjectionRequests: 0 }
    const exact = Buffer.from(run.answer).includes(Buffer.from(fact.expected))
    if (probeType === 'unprompted') {
      group.activeMention.total++
      if (typeof run.mentionsFact === 'boolean' ? run.mentionsFact : exact) group.activeMention.mentions++
    } else {
      const category = fact.pinned ? group.pinned : group.unpinned
      category.total++
      if (exact) category.hits++
    }
    const usage = run.usage
    if (usage && Number.isFinite(usage.prompt_cache_hit_tokens) && Number.isFinite(usage.prompt_cache_miss_tokens) && usage.prompt_cache_hit_tokens >= 0 && usage.prompt_cache_miss_tokens >= 0) {
      group.cacheHitTokens += usage.prompt_cache_hit_tokens; group.cacheMissTokens += usage.prompt_cache_miss_tokens; group.measuredCacheRequests++
    }
    if (Number.isFinite(run.injectedTokens) && run.injectedTokens >= 0) { group.injectedTokens += run.injectedTokens; group.measuredInjectionRequests++ }
    groups.set(run.condition, group)
  }
  return [...groups.values()].map(group => ({
    ...group, pinnedRecall: group.pinned.total ? group.pinned.hits / group.pinned.total : null,
    unpinnedRecall: group.unpinned.total ? group.unpinned.hits / group.unpinned.total : null,
    activeMentionRate: group.activeMention.total ? group.activeMention.mentions / group.activeMention.total : null,
    cacheHitRatio: group.measuredCacheRequests && group.cacheHitTokens + group.cacheMissTokens > 0 ? group.cacheHitTokens / (group.cacheHitTokens + group.cacheMissTokens) : null,
    meanInjectedTokens: group.measuredInjectionRequests ? group.injectedTokens / group.measuredInjectionRequests : null,
  }))
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  if (!process.argv[2]) throw new Error('Usage: node eval/score.mjs <real-captures.json> [output.json]')
  const result = score(JSON.parse(await readFile(process.argv[2], 'utf8')))
  if (process.argv[3]) await writeFile(process.argv[3], JSON.stringify(result, null, 2) + '\n')
  console.log(JSON.stringify(result, null, 2))
}
