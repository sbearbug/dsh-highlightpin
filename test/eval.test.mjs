import test from 'node:test'
import assert from 'node:assert/strict'
import { score } from '../eval/score.mjs'
test('L2 scorer keeps missing telemetry null, counts exact bytes, and rejects duplicated samples', () => {
  const facts = [{ id: 'p', expected: 'cafe\u0301', pinned: true }, { id: 'u', expected: '3.70', pinned: false }]
  const runs = [{ condition: 'notice', seed: '1', factId: 'p', answer: 'café' }, { condition: 'notice', seed: '1', factId: 'u', answer: 'value: 3.70', usage: { prompt_cache_hit_tokens: 80, prompt_cache_miss_tokens: 20 }, injectedTokens: 10 }]
  const result = score({ facts, runs })[0]
  assert.equal(result.pinnedRecall, 0); assert.equal(result.unpinnedRecall, 1)
  assert.equal(result.cacheHitRatio, 0.8); assert.equal(result.meanInjectedTokens, 10)
  const noTelemetry = score({ facts, runs: [runs[0]] })[0]
  assert.equal(noTelemetry.cacheHitRatio, null); assert.equal(noTelemetry.meanInjectedTokens, null)
  assert.throws(() => score({ facts, runs: [runs[0], runs[0]] }), /duplicate/)
})

test('three-level experiment conditions and unprompted mention rate remain separate from recall', () => {
  const facts = [{ id: 'p', expected: '重点原文', pinned: true }]
  const runs = ['pin', 'resident', 'highlight'].flatMap(condition => [
    { condition, seed: '1', factId: 'p', answer: '重点原文', probeType: 'recall' },
    { condition, seed: '1', factId: 'p', answer: '一个无关的答案', probeType: 'unprompted', promptMentionsFact: false, mentionsFact: condition === 'highlight' },
  ])
  const groups = score({ facts, runs })
  assert.ok(groups.every(g => g.pinnedRecall === 1 && g.pinned.total === 1))
  assert.deepEqual(groups.map(g => g.activeMentionRate), [0, 0, 1])
  assert.throws(() => score({ facts, runs: [{ ...runs[1], promptMentionsFact: true }] }), /promptMentionsFact/)
})
