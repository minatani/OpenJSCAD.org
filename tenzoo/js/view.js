// キャンバスへの描画と、画面座標 ⇔ 用紙座標（mm）の変換
import { state } from './store.js'
import { documentDots } from './raster.js'
import { outlineOf, bboxOf } from './model.js'
import { DOT_SIZES, getProfile, edlPaperOf } from './profiles.js'

export const canvas = document.getElementById('canvas')
const ctx = canvas.getContext('2d')
const wrap = document.getElementById('canvas-wrap')
let W = 0; let H = 0; let dpr = 1
const images = new Map() // 下絵の Image キャッシュ

export const toScreen = (x, y) => [x * state.view.zoom + state.view.panX, y * state.view.zoom + state.view.panY]
export const toDoc = (sx, sy) => [(sx - state.view.panX) / state.view.zoom, (sy - state.view.panY) / state.view.zoom]

export function resize () {
  const r = wrap.getBoundingClientRect()
  dpr = window.devicePixelRatio || 1
  W = r.width; H = r.height
  canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr)
  requestRender()
}
export const viewSize = () => [W, H]

export function zoomTo (z, cx = W / 2, cy = H / 2) {
  z = Math.max(0.5, Math.min(60, z))
  const [x, y] = toDoc(cx, cy)
  state.view.zoom = z
  state.view.panX = cx - x * z
  state.view.panY = cy - y * z
  requestRender()
}
export function fitPage () {
  const p = state.doc.page
  const m = 24
  const z = Math.min((W - m * 2) / p.width, (H - m * 2) / p.height)
  state.view.zoom = Math.max(0.5, z)
  state.view.panX = (W - p.width * state.view.zoom) / 2
  state.view.panY = (H - p.height * state.view.zoom) / 2
  requestRender()
}

// 道具が描く一時的な図形（描きかけ）
export const overlay = { draw: null }

let pending = false
export function requestRender () {
  if (pending) return
  pending = true
  requestAnimationFrame(() => { pending = false; render() })
}

// 点の計算結果の保持。文書が変わったら bumpVersion() で捨てる
let dotsCache = { ver: -1, dots: [] }
let version = 0
export function bumpVersion () { version++; requestRender() }

export function currentDots () {
  if (dotsCache.ver === version && dotsCache.doc === state.doc && dotsCache.snap === state.previewSnap) return dotsCache.dots
  const dots = documentDots(state.doc, { snap: state.previewSnap, merge: state.previewSnap })
  dotsCache = { ver: version, doc: state.doc, dots, snap: state.previewSnap }
  return dots
}

export function render () {
  const { doc, view } = state
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  ctx.clearRect(0, 0, W, H)
  const z = view.zoom
  // 用紙
  const [px, py] = toScreen(0, 0)
  ctx.save()
  ctx.shadowColor = 'rgba(0,0,0,.25)'; ctx.shadowBlur = 12; ctx.shadowOffsetY = 2
  ctx.fillStyle = '#fff'
  ctx.fillRect(px, py, doc.page.width * z, doc.page.height * z)
  ctx.restore()

  ctx.save()
  ctx.beginPath(); ctx.rect(px, py, doc.page.width * z, doc.page.height * z); ctx.clip()

  // 下絵
  for (const u of doc.underlays) {
    if (!u.visible) continue
    let img = images.get(u.id)
    if (!img || img.src !== u.src) {
      img = new Image(); img.onload = requestRender; img.src = u.src
      images.set(u.id, img)
    }
    if (!img.complete) continue
    ctx.globalAlpha = u.opacity != null ? u.opacity : 0.4
    const [ux, uy] = toScreen(u.x, u.y)
    ctx.drawImage(img, ux, uy, u.w * z, u.h * z)
    ctx.globalAlpha = 1
  }

  // 方眼
  if (state.showGrid) {
    const g = state.gridSize
    ctx.strokeStyle = 'rgba(29,78,216,.12)'; ctx.lineWidth = 1
    ctx.beginPath()
    for (let x = 0; x <= doc.page.width; x += g) { const [sx] = toScreen(x, 0); ctx.moveTo(Math.round(sx) + 0.5, py); ctx.lineTo(Math.round(sx) + 0.5, py + doc.page.height * z) }
    for (let y = 0; y <= doc.page.height; y += g) { const [, sy] = toScreen(0, y); ctx.moveTo(px, Math.round(sy) + 0.5); ctx.lineTo(px + doc.page.width * z, Math.round(sy) + 0.5) }
    ctx.stroke()
  }
  // ESA721 で点を打てる範囲
  const profile = getProfile(doc.profile)
  if (profile.id === 'esa721') {
    const area = edlPaperOf(doc.page).area
    const mx = (area.x + 0.5) * profile.grid.dx; const my = (area.y + 0.5) * profile.grid.dy
    if (mx < doc.page.width || my < doc.page.height) {
      ctx.save(); ctx.setLineDash([4, 4]); ctx.strokeStyle = 'rgba(200,60,60,.5)'
      const [ex, ey] = toScreen(mx, my)
      ctx.strokeRect(px + 0.5, py + 0.5, ex - px, ey - py)
      ctx.restore()
    }
  }

  const layerColor = new Map(doc.layers.map(l => [l.id, l.color]))
  const multi = doc.layers.filter(l => l.visible).length > 1
  // 図形の線
  if (state.display === 'vector' || state.display === 'both') {
    ctx.lineWidth = 1.2
    for (const l of doc.layers) {
      if (!l.visible) continue
      ctx.strokeStyle = state.display === 'vector' ? l.color : 'rgba(80,90,110,.55)'
      for (const o of l.objects) drawOutline(o)
    }
  }
  // 点
  if (state.display !== 'vector') {
    const dots = currentDots()
    const tactile = state.display === 'tactile'
    for (const d of dots) {
      const r = (DOT_SIZES[d.size] || DOT_SIZES.M).d / 2 * z
      const [sx, sy] = toScreen(d.x, d.y)
      if (sx < -r || sy < -r || sx > W + r || sy > H + r) continue
      if (tactile) {
        const gr = ctx.createRadialGradient(sx - r * 0.35, sy - r * 0.35, r * 0.1, sx, sy, r * 1.1)
        gr.addColorStop(0, '#ffffff'); gr.addColorStop(0.55, '#d6d9de'); gr.addColorStop(1, '#8b9099')
        ctx.fillStyle = gr
      } else {
        ctx.fillStyle = multi ? layerColor.get(d.layer) || '#111' : '#111'
      }
      ctx.beginPath()
      ctx.arc(sx, sy, Math.max(0.8, r), 0, Math.PI * 2)
      if (d.side === 'back') { // 裏面の点は輪で表す（表から触るとへこみ）
        ctx.strokeStyle = ctx.fillStyle; ctx.lineWidth = Math.max(1, r * 0.35); ctx.stroke()
      } else ctx.fill()
    }
  }
  ctx.restore()

  // 選択
  if (state.selection.size) {
    ctx.save()
    ctx.strokeStyle = '#2563eb'; ctx.lineWidth = 1.5
    for (const l of doc.layers) for (const o of l.objects) if (state.selection.has(o.id)) drawOutline(o)
    const b = selectionScreenBox()
    if (b) {
      ctx.setLineDash([5, 4]); ctx.lineWidth = 1
      ctx.strokeRect(b.x, b.y, b.w, b.h)
      ctx.setLineDash([])
      ctx.fillStyle = '#fff'
      for (const h of handles(b)) {
        ctx.beginPath()
        if (h.id === 'rot') ctx.arc(h.x, h.y, 6, 0, Math.PI * 2)
        else ctx.rect(h.x - 5, h.y - 5, 10, 10)
        ctx.fill(); ctx.stroke()
      }
    }
    ctx.restore()
  }

  // 描きかけ
  if (overlay.draw) { ctx.save(); overlay.draw(ctx); ctx.restore() }

  // キーボードカーソル
  if (state.cursor) {
    const [cx, cy] = toScreen(state.cursor[0], state.cursor[1])
    ctx.save(); ctx.strokeStyle = '#dc2626'; ctx.lineWidth = 1.5
    ctx.beginPath(); ctx.moveTo(cx - 10, cy); ctx.lineTo(cx + 10, cy); ctx.moveTo(cx, cy - 10); ctx.lineTo(cx, cy + 10); ctx.stroke()
    ctx.beginPath(); ctx.arc(cx, cy, 4, 0, Math.PI * 2); ctx.stroke()
    ctx.restore()
  }
}

function drawOutline (o) {
  if (o.type === 'dots' || o.type === 'braille') {
    const b = bboxOf(o, state.doc)
    if (!b) return
    const [x0, y0] = toScreen(b.minX - 1, b.minY - 1); const [x1, y1] = toScreen(b.maxX + 1, b.maxY + 1)
    ctx.save(); ctx.setLineDash([2, 3]); ctx.strokeRect(x0, y0, x1 - x0, y1 - y0); ctx.restore()
    return
  }
  const { paths, closed } = outlineOf(o)
  ctx.beginPath()
  for (const p of paths) {
    p.forEach((q, i) => { const [sx, sy] = toScreen(q[0], q[1]); i ? ctx.lineTo(sx, sy) : ctx.moveTo(sx, sy) })
    if (closed) ctx.closePath()
  }
  ctx.stroke()
}

export function selectionScreenBox () {
  let b = null
  for (const l of state.doc.layers) {
    for (const o of l.objects) {
      if (!state.selection.has(o.id)) continue
      const ob = bboxOf(o, state.doc)
      if (!ob) continue
      b = b ? { minX: Math.min(b.minX, ob.minX), minY: Math.min(b.minY, ob.minY), maxX: Math.max(b.maxX, ob.maxX), maxY: Math.max(b.maxY, ob.maxY) } : ob
    }
  }
  if (!b) return null
  const [x0, y0] = toScreen(b.minX, b.minY); const [x1, y1] = toScreen(b.maxX, b.maxY)
  const pad = 6
  return { x: x0 - pad, y: y0 - pad, w: Math.max(1, x1 - x0) + pad * 2, h: Math.max(1, y1 - y0) + pad * 2, doc: b }
}

export function handles (b) {
  const { x, y, w, h } = b
  return [
    { id: 'nw', x, y }, { id: 'n', x: x + w / 2, y }, { id: 'ne', x: x + w, y },
    { id: 'e', x: x + w, y: y + h / 2 }, { id: 'se', x: x + w, y: y + h },
    { id: 's', x: x + w / 2, y: y + h }, { id: 'sw', x, y: y + h }, { id: 'w', x, y: y + h / 2 },
    { id: 'rot', x: x + w / 2, y: y - 22 }
  ]
}

// 道具から使う描画補助
export function strokePath (c, pts, closed = false, color = '#2563eb', dash = null) {
  if (!pts.length) return
  c.strokeStyle = color; c.lineWidth = 1.5
  if (dash) c.setLineDash(dash)
  c.beginPath()
  pts.forEach((q, i) => { const [sx, sy] = toScreen(q[0], q[1]); i ? c.lineTo(sx, sy) : c.moveTo(sx, sy) })
  if (closed) c.closePath()
  c.stroke()
  c.setLineDash([])
}
export function drawDots (c, dots, color = 'rgba(37,99,235,.85)') {
  c.fillStyle = color
  for (const d of dots) {
    const [sx, sy] = toScreen(d.x, d.y)
    const r = Math.max(0.8, (DOT_SIZES[d.size] || DOT_SIZES.M).d / 2 * state.view.zoom)
    c.beginPath(); c.arc(sx, sy, r, 0, Math.PI * 2); c.fill()
  }
}
