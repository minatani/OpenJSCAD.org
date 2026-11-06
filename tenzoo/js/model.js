// 図面データのモデル
// 図形はすべてベクトル（mm 単位）で持ち、点への変換は出力・表示のときに行う（raster.js）。
import {
  catmullRom, ellipsePoints, rectPoints, bboxOfPoints, apply, isSimilarity, mMul, mTranslate,
  distToPolyline, pointInRings, unionBox
} from './geometry.js'
import { kanaToBraille, cellsToDots, DEFAULT_BRAILLE_METRICS } from './braille.js'
import { PAPERS } from './profiles.js'

export const FORMAT = 'tenzoo'
export const FORMAT_VERSION = 1

let seq = 0
export const newId = (p = 'o') => p + Date.now().toString(36) + (seq++).toString(36) + Math.random().toString(36).slice(2, 5)

export const LAYER_COLORS = ['#1d4ed8', '#c2410c', '#15803d', '#7e22ce', '#be123c', '#0e7490', '#a16207', '#334155']

export function defaultStyle () {
  return {
    stroke: true,
    dot: 'M',
    spacing: 2.0,
    line: 'solid',
    arrow: 'none',
    fill: null
  }
}

export function defaultFill () {
  return { pattern: 'grid', spacing: 3.0, pitch: 1.6, angle: 0, dot: 'S', inset: 1.5 }
}

export function newLayer (name, i = 0) {
  return { id: newId('L'), name, visible: true, locked: false, color: LAYER_COLORS[i % LAYER_COLORS.length], objects: [] }
}

export function newDocument (paper = 'B5') {
  const p = PAPERS[paper] || PAPERS.B5
  const layer = newLayer('レイヤ 1')
  return {
    format: FORMAT,
    version: FORMAT_VERSION,
    meta: { title: '無題', created: new Date().toISOString(), modified: new Date().toISOString(), app: 'tenzoo' },
    page: { paper, width: p.w, height: p.h },
    profile: 'esa721',
    settings: { minDist: null, braille: { ...DEFAULT_BRAILLE_METRICS } },
    layers: [layer],
    activeLayer: layer.id,
    underlays: []
  }
}

export const CLOSABLE = new Set(['rect', 'ellipse', 'path', 'curve', 'freehand', 'mask'])
export const isClosed = o => o.type === 'rect' || o.type === 'ellipse' || o.type === 'mask' || !!o.closed

/**
 * 図形の輪郭を折れ線の配列で返す。
 * 戻り値: { paths: [[x,y]...][], closed: boolean }
 */
export function outlineOf (o) {
  switch (o.type) {
    case 'path': return { paths: [o.points], closed: !!o.closed }
    case 'freehand': return { paths: [o.points], closed: !!o.closed }
    case 'curve': return { paths: [catmullRom(o.points, !!o.closed, 10)], closed: !!o.closed }
    case 'rect': return { paths: [rectPoints(o.x, o.y, o.w, o.h, o.rot || 0)], closed: true }
    case 'ellipse': return { paths: [ellipsePoints(o.cx, o.cy, Math.abs(o.rx), Math.abs(o.ry), o.rot || 0)], closed: true }
    case 'mask': return { paths: maskOutline(o), closed: true }
    default: return { paths: [], closed: false }
  }
}

// 点字図形の点（mm）
export function brailleCells (o) {
  if (Array.isArray(o.cells) && o.cells.length && !o.text) return o.cells
  return kanaToBraille(o.text || '').cells
}
export function brailleDots (o, docMetrics) {
  const m = { ...DEFAULT_BRAILLE_METRICS, ...(docMetrics || {}), ...(o.metrics || {}) }
  return cellsToDots(brailleCells(o), o.x, o.y, m)
}

export function bboxOf (o, doc) {
  if (o.type === 'dots') {
    if (!o.points.length) return null
    return bboxOfPoints(o.points)
  }
  if (o.type === 'braille') {
    const pts = brailleDots(o, doc && doc.settings.braille)
    if (!pts.length) return { minX: o.x, minY: o.y, maxX: o.x + 6, maxY: o.y + 6 }
    return bboxOfPoints(pts)
  }
  if (o.type === 'mask') return { minX: o.x, minY: o.y, maxX: o.x + o.w * o.cell, maxY: o.y + o.h * o.cell }
  const { paths } = outlineOf(o)
  let b = null
  for (const p of paths) if (p.length) b = unionBox(b, bboxOfPoints(p))
  return b
}

// 図形の当たり判定（距離 tol mm 以内か、塗りのある閉図形の内側）
export function hitTest (o, p, tol, doc) {
  if (o.type === 'dots') return o.points.some(q => Math.hypot(q[0] - p[0], q[1] - p[1]) <= tol + 0.6)
  if (o.type === 'braille') {
    const b = bboxOf(o, doc)
    return p[0] >= b.minX - tol && p[0] <= b.maxX + tol && p[1] >= b.minY - tol && p[1] <= b.maxY + tol
  }
  if (o.type === 'mask') return maskContains(o, p)
  const { paths, closed } = outlineOf(o)
  for (const path of paths) if (distToPolyline(p, path, closed) <= tol) return true
  if (closed && o.style && o.style.fill && pointInRings(p, paths)) return true
  return false
}

// ---- 変換
export function transformObject (o, m) {
  const t = structuredClone(o)
  const tp = q => { const r = apply(m, q); return q.length > 2 ? [r[0], r[1], ...q.slice(2)] : r }
  switch (t.type) {
    case 'dots': case 'path': case 'freehand': case 'curve':
      t.points = t.points.map(tp)
      return t
    case 'braille': {
      const [x, y] = apply(m, [t.x, t.y])
      t.x = x; t.y = y
      return t
    }
    case 'mask': {
      // 平行移動だけ受け付ける（拡大・回転は点図の格子とずれるため）
      const [x, y] = apply(m, [t.x, t.y])
      t.x = x; t.y = y
      return t
    }
    case 'rect': case 'ellipse': {
      const rot = t.rot || 0
      const axisAligned = Math.abs(m[1]) < 1e-9 && Math.abs(m[2]) < 1e-9 && Math.abs(Math.sin(rot * 2)) < 1e-9
      if (isSimilarity(m) || axisAligned) {
        // 図形の局所 x 軸・y 軸がどう写るかで、新しい大きさと向きを決める（長方形・楕円は鏡映に対して対称）
        const ux = [Math.cos(rot), Math.sin(rot)]; const uy = [-Math.sin(rot), Math.cos(rot)]
        const vx = [m[0] * ux[0] + m[2] * ux[1], m[1] * ux[0] + m[3] * ux[1]]
        const vy = [m[0] * uy[0] + m[2] * uy[1], m[1] * uy[0] + m[3] * uy[1]]
        const kx = Math.hypot(...vx); const ky = Math.hypot(...vy)
        const nr = axisAligned ? rot : normAngle(Math.atan2(vx[1], vx[0]))
        if (t.type === 'rect') {
          const c = apply(m, [t.x + t.w / 2, t.y + t.h / 2])
          const w = Math.abs(t.w) * kx; const h = Math.abs(t.h) * ky
          t.x = c[0] - w / 2; t.y = c[1] - h / 2; t.w = w; t.h = h; t.rot = nr
        } else {
          const c = apply(m, [t.cx, t.cy])
          t.cx = c[0]; t.cy = c[1]; t.rx = Math.abs(t.rx) * kx; t.ry = Math.abs(t.ry) * ky; t.rot = nr
        }
        return t
      }
      // それ以外（回転した図形の縦横別拡大など）は折れ線に置き換える
      const pts = outlineOf(o).paths[0].map(q => apply(m, q))
      return { id: t.id, type: 'path', closed: true, points: pts, style: t.style }
    }
  }
  return t
}
const normAngle = a => { const T = Math.PI * 2; a %= T; return Math.abs(a) < 1e-12 ? 0 : a }

export function translateObject (o, dx, dy) { return transformObject(o, mTranslate(dx, dy)) }
export { mMul }

// ---- 範囲塗り用のマスク（ビットマップ領域）
// rows: 各行のラン [開始, 長さ, 開始, 長さ, ...]
export function maskFromGrid (grid, w, h, x, y, cell) {
  const rows = []
  for (let j = 0; j < h; j++) {
    const r = []; let i = 0
    while (i < w) {
      if (grid[j * w + i]) {
        const s = i
        while (i < w && grid[j * w + i]) i++
        r.push(s, i - s)
      } else i++
    }
    rows.push(r)
  }
  return { type: 'mask', x, y, w, h, cell, rows }
}
export function maskContains (o, p) {
  const i = Math.floor((p[0] - o.x) / o.cell); const j = Math.floor((p[1] - o.y) / o.cell)
  if (j < 0 || j >= o.h || i < 0 || i >= o.w) return false
  const r = o.rows[j]
  for (let k = 0; k < r.length; k += 2) if (i >= r[k] && i < r[k] + r[k + 1]) return true
  return false
}
// マスクの境界を、セルの縁をたどった輪にする（輪郭線の表示・点打ちに使う）
export function maskOutline (o) {
  const W = o.w; const H = o.h
  const inside = (i, j) => i >= 0 && j >= 0 && i < W && j < H && maskContains(o, [o.x + (i + 0.5) * o.cell, o.y + (j + 0.5) * o.cell])
  // 縁の辺を集める（向き付き：内側を左に見る）
  const edges = new Map()
  const add = (x1, y1, x2, y2) => edges.set(x1 + ',' + y1, [x2, y2])
  for (let j = 0; j < H; j++) {
    for (let i = 0; i < W; i++) {
      if (!inside(i, j)) continue
      if (!inside(i, j - 1)) add(i, j, i + 1, j)
      if (!inside(i + 1, j)) add(i + 1, j, i + 1, j + 1)
      if (!inside(i, j + 1)) add(i + 1, j + 1, i, j + 1)
      if (!inside(i - 1, j)) add(i, j + 1, i, j)
    }
  }
  const rings = []
  while (edges.size) {
    const [startKey] = edges.keys()
    let [x, y] = startKey.split(',').map(Number)
    const ring = []
    let guard = 0
    while (guard++ < 1e6) {
      const k = x + ',' + y
      const nxt = edges.get(k)
      if (!nxt) break
      edges.delete(k)
      ring.push([o.x + x * o.cell, o.y + y * o.cell])
      ;[x, y] = nxt
    }
    // 一直線上の頂点を省く
    const simp = ring.filter((p, i) => {
      const a = ring[(i - 1 + ring.length) % ring.length]; const b = ring[(i + 1) % ring.length]
      return Math.abs((p[0] - a[0]) * (b[1] - a[1]) - (p[1] - a[1]) * (b[0] - a[0])) > 1e-9
    })
    if (simp.length >= 3) rings.push(simp)
  }
  return rings
}

// ---- 文書の操作補助
export function findLayer (doc, id) { return doc.layers.find(l => l.id === id) }
export function activeLayer (doc) { return findLayer(doc, doc.activeLayer) || doc.layers[0] }
export function findObject (doc, id) {
  for (const l of doc.layers) {
    const o = l.objects.find(x => x.id === id)
    if (o) return { layer: l, object: o }
  }
  return null
}

// 読み込んだ文書の検証と補完（古い版・壊れたデータへの備え）
export function normalizeDocument (d) {
  if (!d || d.format !== FORMAT) throw new Error('tenzoo 形式のファイルではありません。')
  if (d.version > FORMAT_VERSION) console.warn('新しい版の tenzoo 形式です。一部の情報が失われる可能性があります。')
  const base = newDocument(d.page && d.page.paper)
  const doc = { ...base, ...d }
  doc.page = { ...base.page, ...(d.page || {}) }
  doc.settings = { ...base.settings, ...(d.settings || {}), braille: { ...base.settings.braille, ...((d.settings || {}).braille || {}) } }
  doc.layers = (d.layers && d.layers.length ? d.layers : base.layers).map((l, i) => ({
    ...newLayer(l.name || `レイヤ ${i + 1}`, i), ...l, objects: (l.objects || []).map(o => ({ id: o.id || newId(), ...o, style: { ...defaultStyle(), ...(o.style || {}) } }))
  }))
  if (!doc.layers.find(l => l.id === doc.activeLayer)) doc.activeLayer = doc.layers[0].id
  doc.underlays = d.underlays || []
  return doc
}
