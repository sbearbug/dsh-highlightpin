import Schema from '@deepseek-ai/schemastery'

export const NAME = 'highlightpin'
export const PACKAGE_NAME = 'dsh-highlightpin'
export const DEFAULTS = Object.freeze({ maxPinChars: 16000, maxResidentChars: 6000, maxHighlightChars: 2000, holdSubagents: false })
export const Config = Schema.object({
  maxPinChars: Schema.number().min(1).step(1).default(16000).description('pin 类型原文合计上限；不截断'),
  maxResidentChars: Schema.number().min(1).step(1).default(6000).description('resident 类型原文合计上限'),
  maxHighlightChars: Schema.number().min(1).step(1).default(2000).description('highlight 原文合计上限'),
  holdSubagents: Schema.boolean().default(false).description('是否向子代理会话补注'),
})

export function validateConfig(input = {}) {
  // Only the keys in DEFAULTS are read, so settings removed since 0.1.0 (the session-level mode,
  // and the earlier count/global caps) left over in an old profile are ignored, not rejected.
  const config = Object.fromEntries(Object.entries(DEFAULTS).map(([key, value]) => [key, input[key] === undefined ? value : input[key]]))
  for (const key of ['maxPinChars', 'maxResidentChars', 'maxHighlightChars']) {
    if (!Number.isSafeInteger(config[key]) || config[key] < 1) throw new TypeError(`${key} must be a positive integer`)
  }
  if (typeof config.holdSubagents !== 'boolean') throw new TypeError('holdSubagents must be boolean')
  return Object.freeze(config)
}
