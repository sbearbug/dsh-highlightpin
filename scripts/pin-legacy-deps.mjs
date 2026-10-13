/**
 * 把官方依赖钉到某一条 DSH 版本线上（就地改写 package.json）。
 *
 * 用途：`check-legacy` CI 作业用它在旧 DSH 线上重跑离线测试套件，
 * 让 package.json 里放宽后的 peer 范围不是一个空承诺。
 *
 * 用法：node scripts/pin-legacy-deps.mjs 0.1.7-rc.2
 *
 * 只改三类：
 *   - peerDependencies 里受 DSH 门禁检查的三个包 → `>=<version> <0.3.0-0`
 *   - devDependencies 里同名包 + dsh-session → 精确版本（测试要真实安装它们）
 *   - engines.dsh → `>=<version>`
 * 其余依赖（zod、esbuild、jsdom、react、schemastery）不动。
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const version = process.argv[2]
if (typeof version !== 'string' || !/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(version)) {
  console.error('用法：node scripts/pin-legacy-deps.mjs <精确版本>，例如 0.1.7-rc.2')
  process.exit(1)
}

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const file = path.join(root, 'package.json')
const manifest = JSON.parse(fs.readFileSync(file, 'utf8'))

/** 受 DSH 兼容门禁检查的包（名字为 @deepseek-ai/dsh 或 @deepseek-ai/dsh-*）。 */
const GATED_PEERS = ['@deepseek-ai/dsh-commands', '@deepseek-ai/dsh-llm', '@deepseek-ai/dsh-storage-domain']
/** 测试需要真实安装的包：上面三个 + 只在测试里用到的 dsh-session。 */
const INSTALLED = [...GATED_PEERS, '@deepseek-ai/dsh-session']

for (const name of GATED_PEERS) {
  if (manifest.peerDependencies?.[name] !== undefined) manifest.peerDependencies[name] = `>=${version} <0.3.0-0`
}
for (const name of INSTALLED) {
  if (manifest.devDependencies?.[name] !== undefined) manifest.devDependencies[name] = version
}
if (manifest.engines !== undefined) manifest.engines.dsh = `>=${version}`

fs.writeFileSync(file, `${JSON.stringify(manifest, null, 2)}\n`)
console.log(`已把官方依赖钉到 ${version}`)
