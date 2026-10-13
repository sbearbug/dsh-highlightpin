import React, { useCallback, useEffect, useId, useRef, useState } from 'react'
import { captureSelection } from './selection.js'
import { composerMaterial } from './material.js'

const API = '/highlightpin/api'
const headers = { 'content-type': 'application/json' }
const CSS = `
.hlpin-dock{box-sizing:border-box;width:calc(100% - 2 * var(--dsh-composer-side-clearance,16px));max-width:var(--dsh-composer-card-max-width,840px);margin:0 auto;padding:0 12px 6px;color:var(--dsw-alias-label-primary);font-size:12px}
.hlpin-tools{display:flex;align-items:center;gap:10px;min-height:32px;min-width:0}
.hlpin-controls{display:inline-flex;align-items:center;gap:2px;flex:none;padding:2px 4px}
.hlpin-controls,.hlpin-panel{--dsw-elevation-stroke-color:var(--dsw-alias-border-l2);border:var(--hlpin-material-border,0);border-radius:var(--hlpin-material-radius,var(--dsw-radius-panel));background-color:var(--hlpin-material-bg,var(--dsw-specific-input-major));background-image:var(--hlpin-material-image,none);box-shadow:var(--hlpin-material-shadow,var(--dsw-elevation-soft));backdrop-filter:var(--hlpin-material-blur,none);-webkit-backdrop-filter:var(--hlpin-material-blur,none)}
.hlpin-feedback{min-width:0;margin:0;color:var(--dsw-alias-label-secondary);line-height:1.6;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.hlpin-dock button{font:inherit;color:inherit;cursor:pointer;box-sizing:border-box}
.hlpin-icon{display:inline-flex;align-items:center;justify-content:center;gap:5px;height:28px;min-width:28px;padding:4px 6px;border:0;border-radius:7px;background:transparent;color:var(--dsw-alias-label-secondary)!important}
.hlpin-icon:hover{background:var(--dsw-alias-interactive-bg-hover)}
.hlpin-icon[data-ready=true]{color:var(--dsw-alias-label-primary)!important;background:var(--dsw-alias-interactive-bg-hover)}
.hlpin-dock button:disabled{opacity:.45;cursor:default}
.hlpin-dock button:focus-visible{outline:2px solid var(--dsw-alias-label-primary);outline-offset:2px}
.hlpin-count{font-size:11px;font-variant-numeric:tabular-nums;min-width:10px}
.hlpin-arrow svg{transition:transform .15s}.hlpin-arrow[aria-expanded=true] svg{transform:rotate(180deg)}
.hlpin-panel{margin:8px 0 2px;padding:12px}
.hlpin-panel-head{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:10px}.hlpin-panel-actions{display:flex;gap:2px}
.hlpin-panel-title{font-weight:600}.hlpin-modes{display:flex;flex-wrap:wrap;gap:6px;margin:6px 0}
.hlpin-mode,.hlpin-remove{border:1px solid var(--dsw-alias-border-l3);border-radius:7px;padding:5px 8px;background:transparent}
.hlpin-mode[aria-pressed=true]{background:var(--dsw-alias-interactive-bg-hover);border-color:var(--dsw-alias-label-secondary)}
.hlpin-muted{color:var(--dsw-alias-label-secondary);line-height:1.6}.hlpin-list{display:flex;flex-direction:column;gap:10px;max-height:260px;overflow:auto;margin-top:10px}
.hlpin-item{display:flex;gap:8px;align-items:flex-start;border-top:1px solid var(--dsw-alias-border-l3);padding-top:10px}.hlpin-item>div{flex:1;min-width:0}
.hlpin-item pre{white-space:pre-wrap;overflow-wrap:anywhere;margin:4px 0;max-height:160px;overflow:auto;font:inherit;line-height:1.6}
.hlpin-hint{margin-top:8px;white-space:pre-wrap;line-height:1.6}.hlpin-live{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip-path:inset(50%);white-space:nowrap}
@media(prefers-reduced-motion:reduce){.hlpin-arrow svg{transition:none}}
`

async function request(path, body) {
  const response = await fetch(API + path, body === undefined ? { headers } : { method: 'POST', headers, body: JSON.stringify(body) })
  const result = await response.json()
  if (path === '/level' && response.status === 404) throw new Error('宿主仍在运行旧版插件，尚无钉子级别接口。请完全退出并重新启动 DSH，再刷新页面；钉子不会丢失。')
  if (!response.ok || !result.ok) throw new Error(result.message ?? result.code ?? `HTTP ${response.status}`)
  return result
}
function PinIcon() {
  return <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m16 3 5 5-4 2-3 5-2 1-4-4 1-2 5-3zM8 16l-5 5M6 10l8 8" /></svg>
}
const fidelityLabel = { 'source-exact': '源文本精确', 'source-normalized': '已对齐源文本', rendered: '显示文本' }

export function PinDock({ session, sessionId: explicitId, useChat }) {
  const sessionId = explicitId ?? session?.sessionId
  const nodes = useChat(state => state.nodes)
  const panelId = useId()
  const dockRef = useRef(null)
  const pinPress = useRef(false)
  const [material, setMaterial] = useState({})
  const [expanded, setExpanded] = useState(false)
  const [selection, setSelection] = useState(null)
  const [pins, setPins] = useState([])
  const [usage, setUsage] = useState(null)
  const [backendWarning, setBackendWarning] = useState('')
  const [status, setStatus] = useState(null)
  const [hint, setHint] = useState('')
  const [busy, setBusy] = useState(false)
  const currentSession = useRef(sessionId)
  const pending = useRef(false)
  const refreshId = useRef(0)
  currentSession.current = sessionId
  useEffect(() => {
    const dock = dockRef.current
    const update = () => {
      const next = composerMaterial(dock)
      setMaterial(previous => JSON.stringify(previous) === JSON.stringify(next) ? previous : next)
    }
    update()
    const observer = new window.MutationObserver(update)
    for (const target of [document.documentElement, document.body]) observer.observe(target, { attributes: true, attributeFilter: ['class', 'style', 'data-theme'] })
    observer.observe(document.head, { childList: true, subtree: true, characterData: true, attributes: true })
    const seat = dock?.closest('[data-composer-seat]')
    if (seat) observer.observe(seat, { childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'style'] })
    const media = window.matchMedia?.('(prefers-color-scheme: dark)')
    media?.addEventListener('change', update)
    return () => { observer.disconnect(); media?.removeEventListener('change', update) }
  }, [sessionId])
  const refresh = useCallback(async () => {
    const id = ++refreshId.current
    try {
      const result = await request(`/pins?session=${encodeURIComponent(sessionId)}`)
      if (currentSession.current !== sessionId || id !== refreshId.current) return
      setPins(result.pins); setUsage(result.usage); setStatus(result.status)
      setBackendWarning(result.capabilities?.pinLevels ? '' : '当前宿主可能仍运行旧版插件，未提供三档级别接口。请完全退出并重新启动 DSH，再刷新页面。')
    } catch (error) {
      if (currentSession.current === sessionId && id === refreshId.current) throw error
    }
  }, [sessionId])

  useEffect(() => {
    setExpanded(false); setSelection(null); setPins([]); setUsage(null); setBackendWarning(''); setStatus(null); setHint('')
    refresh().catch(error => { if (currentSession.current === sessionId) setHint(error.message) })
    return () => { refreshId.current++ }
  }, [sessionId, refresh])

  useEffect(() => {
    let releaseTimer
    const finishPress = () => {
      pinPress.current = false
      if (window.getSelection()?.isCollapsed) setSelection(null)
    }
    // click follows pointerup/mouseup. Keep the serialized text only for that
    // activation, then release it even if the gesture was cancelled or dragged away.
    const releasePress = () => {
      window.clearTimeout(releaseTimer)
      releaseTimer = window.setTimeout(finishPress, 0)
    }
    const onChange = () => {
      const result = captureSelection(window.getSelection(), { sessionId, nodes })
      if (result.value) { setSelection(result.value); setHint('') }
      else if (result.error) { pinPress.current = false; setSelection(null); setHint(result.error) }
      else if (!pinPress.current) setSelection(null)
    }
    document.addEventListener('selectionchange', onChange)
    document.addEventListener('pointerup', releasePress)
    document.addEventListener('mouseup', releasePress)
    document.addEventListener('pointercancel', finishPress)
    document.addEventListener('keydown', finishPress)
    window.addEventListener('blur', finishPress)
    return () => {
      window.clearTimeout(releaseTimer)
      pinPress.current = false
      document.removeEventListener('selectionchange', onChange)
      document.removeEventListener('pointerup', releasePress)
      document.removeEventListener('mouseup', releasePress)
      document.removeEventListener('pointercancel', finishPress)
      document.removeEventListener('keydown', finishPress)
      window.removeEventListener('blur', finishPress)
    }
  }, [sessionId, nodes])

  const mutate = async (path, body) => {
    if (pending.current) return
    pending.current = true; refreshId.current++; setBusy(true)
    try {
      const result = await request(path, body)
      if (currentSession.current !== sessionId) return
      if (path === '/level') {
        setHint(`已设置为 ${result.pin.level}。${result.pin.level !== 'pin' ? '会进入系统提示词，切换时前缀缓存会失效一次。' : ''}${usage?.limits.mode === 'strict' ? '当前 profile strict 配置要求钉子至少常驻。' : ''}`)
      } else {
        setHint(result.warning ?? (result.already ? '这段已经钉过了。' : path === '/pin' ? `已钉住 ${result.pin.text.length} 字符。` : '已解钉。'))
        if (path === '/pin') setSelection(null)
      }
      await refresh()
    } catch (error) { if (currentSession.current === sessionId) setHint(error.message) }
    finally { pending.current = false; setBusy(false) }
  }
  const pinReady = Boolean(selection && selection.sessionId === sessionId)
  const pinTitle = pinReady ? `钉住选区（${selection.text.length} 字符）：${selection.text}` : hint || '在同一条已定稿消息中划选正文后钉住'
  const toggleDetails = () => {
    if (!expanded) refresh().catch(error => setHint(error.message))
    setExpanded(value => !value)
  }
  return <div className="hlpin-dock" ref={dockRef} style={material} onKeyDown={event => { if (event.key === 'Escape' && expanded) { setExpanded(false); event.stopPropagation() } }}>
    <style>{CSS}</style>
    <div className="hlpin-tools">
      <div className="hlpin-controls">
      <button className="hlpin-icon" type="button" aria-label="钉住选区" data-ready={pinReady} disabled={busy || !pinReady} onPointerDown={() => { pinPress.current = true }} onMouseDown={e => { pinPress.current = true; e.preventDefault() }} onClick={() => { pinPress.current = false; mutate('/pin', selection) }} title={pinTitle}><PinIcon />{pins.length > 0 && <span className="hlpin-count">{pins.length}</span>}</button>
      <button className="hlpin-icon hlpin-arrow" type="button" aria-label={expanded ? '收起钉子详情' : '展开钉子详情'} aria-expanded={expanded} aria-controls={panelId} onMouseDown={e => e.preventDefault()} onClick={toggleDetails} title={`钉子详情与级别设置${hint ? ` · ${hint}` : ''}`}><svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m4 6 4 4 4-4" /></svg></button>
      </div>
      {!expanded && hint && <span className="hlpin-feedback" title={hint}>{hint}</span>}
    </div>
    {expanded && <section className="hlpin-panel" id={panelId} aria-label="钉子详情">
      <div className="hlpin-panel-head"><span className="hlpin-panel-title">当前会话的钉子</span><div className="hlpin-panel-actions"><button className="hlpin-icon" type="button" disabled={busy} onClick={() => refresh().catch(error => setHint(error.message))} aria-label="刷新钉子" title="刷新钉子"><svg width="15" height="15" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden="true"><path d="M16 7a6 6 0 1 0 .1 6M16 3v4h-4" /></svg></button><button className="hlpin-icon" type="button" onClick={() => setExpanded(false)} aria-label="关闭钉子详情" title="关闭"><svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden="true"><path d="m4 4 8 8M12 4l-8 8" /></svg></button></div></div>
      {backendWarning && <div className="hlpin-hint" role="alert">{backendWarning}</div>}
      <div className="hlpin-muted">pin 按需补回 · resident 中性常驻 · highlight 重点常驻。每枚钉子独立选择。</div>
      <div className="hlpin-muted">{usage ? `${usage.count} 枚 · pin ${usage.pinChars ?? 0}/${usage.limits.maxPinChars ?? 16000} 字符 · resident ${usage.residentChars ?? 0}/${usage.limits.maxResidentChars ?? 6000} 字符 · highlight ${usage.highlightChars ?? 0}/${usage.limits.maxHighlightChars ?? 2000} 字符` : '加载钉子…'}{status?.compacted ? ` · 上次压缩后已补注 ${status.recalled} 枚` : ''}</div>
      {pins.length ? <div className="hlpin-list">{pins.map((pin, i) => <div className="hlpin-item" key={pin.id}>
        <div><span>{i + 1}. {pin.level ?? 'pin'} · {pin.role === 'assistant' ? '助手' : '用户'} · {fidelityLabel[pin.fidelity]} · {pin.text.length} 字符</span><pre>{pin.text}</pre>
          <div className="hlpin-modes" role="group" aria-label={`钉子 ${i + 1} 的级别`}>{[['pin', '按需补回'], ['resident', '中性常驻'], ['highlight', '重点常驻']].map(([level, label]) => <button className="hlpin-mode" type="button" key={level} aria-pressed={(pin.level ?? 'pin') === level} disabled={busy} onClick={() => mutate('/level', { sessionId, pinId: pin.id, level })}>{level} · {label}</button>)}</div>
        </div><button className="hlpin-remove" type="button" disabled={busy} onClick={() => mutate('/unpin', { sessionId, pinId: pin.id })}>解钉</button>
      </div>)}</div> : <div className="hlpin-muted">还没有钉子。划选正文后，点击上方的图钉按钮。</div>}
      {hint && <div className="hlpin-hint">{hint}</div>}
    </section>}
    <span className="hlpin-live" role="status">{hint}</span>
  </div>
}

export const inject = ['slots']
export function apply(ctx) {
  ctx.slots.inject('conversation.input.dock', () => ctx.slots.register({ name: 'conversation.input.dock', id: 'highlightpin', order: 100, label: '划选定钉' }, PinDock))
}
