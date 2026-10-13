import { build } from 'esbuild'
import { readFile, mkdir, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
const root = new URL('../', import.meta.url)
const pkg = JSON.parse(await readFile(new URL('package.json', root), 'utf8'))
const result = await build({ entryPoints: [fileURLToPath(new URL('src/client/index.jsx', root))], bundle: true, write: false, format: 'cjs', platform: 'browser', target: 'es2022', jsx: 'automatic', external: ['react', 'react/jsx-runtime'], legalComments: 'none' })
const output = `window.__ModuleLoader__.load({id:${JSON.stringify(pkg.name)},factory:(require)=>{\nvar module={exports:{}};var exports=module.exports;\n${result.outputFiles[0].text}\nreturn module.exports;\n}});\n`
await mkdir(new URL('lib/', root), { recursive: true })
await writeFile(new URL('lib/client.js', root), output)
console.log(`Built lib/client.js (${Buffer.byteLength(output)} bytes)`)
