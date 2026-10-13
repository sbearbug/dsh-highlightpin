// Independent implementation of the Host / Origin / Fetch Metadata checks.
export function isTrustedApiRequest(req, trustedHosts = []) {
  const host = req.headers.host
  if (typeof host !== 'string' || /[\s/@?#\\]/u.test(host)) return false
  let url
  try { url = new URL(`http://${host}`) } catch { return false }
  const loopback = url.hostname === 'localhost' || url.hostname === '[::1]' || /^127(?:\.(?:\d{1,3})){3}$/.test(url.hostname) && url.hostname.split('.').every(n => Number(n) <= 255)
  const trusted = trustedHosts.some(entry => {
    try {
      const value = new URL(`http://${entry}`)
      return value.port ? value.host === url.host : value.hostname === url.hostname
    } catch { return false }
  })
  if (!loopback && !trusted) return false
  if (req.headers['sec-fetch-site'] === 'cross-site') return false
  const origin = req.headers.origin
  if (origin === undefined) return true
  if (typeof origin !== 'string') return false
  try {
    const value = new URL(origin)
    // Compare authority including port; browser https requests default to 443.
    const requestAuthority = new URL(`${value.protocol}//${host}`).host
    return ['http:', 'https:'].includes(value.protocol) && value.host === requestAuthority
  } catch { return false }
}
