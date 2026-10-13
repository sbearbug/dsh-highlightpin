import { PinError } from './store.js'
import { isTrustedApiRequest } from './trust-fence.js'
import packageInfo from '../package.json' with { type: 'json' }

export const ROUTE_PREFIX = '/highlightpin/api'
export const MAX_BODY_BYTES = 65536
export function readJson(req) {
  return new Promise((resolve, reject) => {
    let size = 0, chunks = [], failed = false
    const fail = error => { failed = true; chunks = []; reject(error) }
    req.on('data', chunk => {
      if (failed) return
      const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
      size += bytes.length
      if (size > MAX_BODY_BYTES) return fail(new PinError('body-too-large', '请求体超过 64 KB。', 413))
      chunks.push(bytes)
    })
    req.once('end', () => {
      if (failed) return
      try {
        const parsed = JSON.parse(Buffer.concat(chunks).toString('utf8'))
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error()
        resolve(parsed)
      } catch { fail(new PinError('bad-json', '请求体必须是 JSON 对象。')) }
    })
    req.once('error', () => fail(new PinError('bad-request', '请求读取失败。')))
    req.once('aborted', () => fail(new PinError('bad-request', '请求已中断。')))
  })
}

export function requiredString(value, name) {
  if (typeof value !== 'string' || !value.trim()) throw new PinError('bad-request', `${name} 必须是非空字符串。`)
  return value
}

export function makeRoutes({ store, pinSelection, trustedHosts = [], logger, mode, statusOf = () => null }) {
  const send = (res, status, body) => {
    res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' })
    res.end(JSON.stringify(body))
  }
  return async (req, res) => {
    try {
      if (!isTrustedApiRequest(req, trustedHosts)) throw new PinError('forbidden', '请求来源不受信任。', 403)
      if (String(req.headers['content-type'] ?? '').split(';')[0].trim().toLowerCase() !== 'application/json') throw new PinError('unsupported-media-type', '需要 application/json。', 415)
      if (!store.ready) throw new PinError('not-ready', '钉子存储尚未就绪。', 503)
      const url = new URL(req.url, 'http://localhost')
      if (url.pathname === `${ROUTE_PREFIX}/health` && req.method === 'GET') return send(res, 200, { ok: true, name: 'dsh-highlightpin', version: packageInfo.version, mode, ready: true })
      if (url.pathname === `${ROUTE_PREFIX}/pins` && req.method === 'GET') {
        const sessionId = requiredString(url.searchParams.get('session'), 'session')
        return send(res, 200, { ok: true, pins: store.list(sessionId), usage: store.usage(sessionId), mode: store.mode(sessionId), version: packageInfo.version, capabilities: { pinLevels: true }, status: statusOf(sessionId) })
      }
      if (url.pathname === `${ROUTE_PREFIX}/level` && req.method === 'POST') {
        const body = await readJson(req)
        return send(res, 200, await store.setLevel(requiredString(body.sessionId, 'sessionId'), requiredString(body.pinId, 'pinId'), body.level))
      }
      if (url.pathname === `${ROUTE_PREFIX}/mode` && req.method === 'POST') {
        const body = await readJson(req)
        return send(res, 200, await store.setMode(requiredString(body.sessionId, 'sessionId'), body.mode))
      }
      if (url.pathname === `${ROUTE_PREFIX}/pin` && req.method === 'POST') {
        const body = await readJson(req)
        return send(res, 200, await pinSelection(body))
      }
      if (url.pathname === `${ROUTE_PREFIX}/unpin` && req.method === 'POST') {
        const body = await readJson(req)
        const sessionId = requiredString(body.sessionId, 'sessionId'), pinId = requiredString(body.pinId, 'pinId')
        return send(res, 200, await store.remove(sessionId, pinId))
      }
      throw new PinError('not-found', '接口或方法不存在。', 404)
    } catch (error) {
      if (!(error instanceof PinError)) logger?.warn?.(`highlightpin route: ${error.message}`)
      const expected = error instanceof PinError
      send(res, expected ? error.status : 500, { ok: false, code: expected ? error.code : 'internal', message: expected ? error.message : '操作失败，请查看宿主日志。' })
    }
  }
}
