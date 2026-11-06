// ベクトル図形 → 点 への変換
import {
  samplePolyline, dashPolyline, pointInRings, distToPolyline, mergeClose, bboxOfPoints
} from './geometry.js'
import { outlineOf, brailleDots, maskContains, bboxOf } from './model.js'
import { generatePattern } from './patterns.js'
import { getProfile, mapSize, snapToGrid, SIZE_ORDER } from './profiles.js'

const cache = new WeakMap()

// 矢印の羽根（開いた線の端）
function arrowHeads (path, which, len = 4, deg = 28) {
  const out = []
  const head = (tip, from) => {
    const a = Math.atan2(tip[1] - from[1], tip[0] - from[0])
    for (const s of [-1, 1]) {
      const b = a + Math.PI + s * (deg * Math.PI) / 180
      out.push([tip, [tip[0] + len * Math.cos(b), tip[1] + len * Math.sin(b)]])
    }
  }
  const n = path.length
  if (n < 2) return out
  // 端の向きは少し離れた点から取る（フリーハンドの細かいぶれ対策）
  const back = (i, dir) => {
    let j = i
    while (j + dir >= 0 && j + dir < n && Math.hypot(path[j][0] - path[i][0], path[j][1] - path[i][1]) < 2) j += dir
    return path[j]
  }
  if (which === 'end' || which === 'both') head(path[n - 1], back(n - 1, -1))
  if (which === 'start' || which === 'both') head(path[0], back(0, 1))
  return out
}

function strokeDots (path, closed, st) {
  const sp = Math.max(0.5, +st.spacing || 2)
  let parts
  if (st.line === 'dashed') parts = dashPolyline(path, sp * 3.01, sp * 2, closed).map(p => ({ p, c: false }))
  else if (st.line === 'dotted') parts = [{ p: path, c: closed, sp: sp * 2 }]
  else parts = [{ p: path, c: closed }]
  const out = []
  for (const part of parts) {
    for (const q of samplePolyline(part.p, part.sp || sp, { closed: part.c })) out.push(q)
  }
  return out
}

/** 1つの図形を点の並び [{x, y, size}] にする（格子合わせ前） */
export function objectDots (o, doc) {
  const key = o.type === 'braille' ? JSON.stringify(doc.settings.braille) : ''
  const hit = cache.get(o)
  if (hit && hit.key === key) return hit.dots
  const dots = computeDots(o, doc)
  cache.set(o, { key, dots })
  return dots
}

function computeDots (o, doc) {
  const st = o.style || {}
  const out = []
  if (o.type === 'dots') {
    for (const p of o.points) out.push({ x: p[0], y: p[1], size: p[2] || st.dot || 'M' })
    return out
  }
  if (o.type === 'braille') {
    for (const p of brailleDots(o, doc.settings.braille)) out.push({ x: p[0], y: p[1], size: o.dot || 'L' })
    return out
  }
  const { paths, closed } = outlineOf(o)
  // 面
  if (closed && st.fill) {
    const f = st.fill
    const box = bboxOf(o, doc)
    if (box) {
      const inset = st.stroke ? Math.max(0, +f.inset || 0) : 0
      const inside = o.type === 'mask' ? (p) => maskContains(o, p) : (p) => pointInRings(p, paths)
      for (const p of generatePattern(f.pattern, box, f)) {
        if (!inside(p)) continue
        if (inset > 0) {
          let d = Infinity
          for (const path of paths) d = Math.min(d, distToPolyline(p, path, true))
          if (d < inset) continue
        }
        out.push({ x: p[0], y: p[1], size: f.dot || 'S' })
      }
    }
  }
  // 輪郭線
  if (st.stroke !== false) {
    for (const path of paths) {
      for (const q of strokeDots(path, closed, st)) out.push({ x: q[0], y: q[1], size: st.dot || 'M' })
      if (!closed && st.arrow && st.arrow !== 'none') {
        for (const seg of arrowHeads(path, st.arrow, Math.max(3, (+st.spacing || 2) * 2))) {
          const s = samplePolyline(seg, +st.spacing || 2)
          s.shift() // 先端は線の端と同じなので重ねない
          for (const q of s) out.push({ x: q[0], y: q[1], size: st.dot || 'M' })
        }
      }
    }
  }
  return out
}

/**
 * 文書全体の点を求める。
 * opts: { profileId, snap (格子に合わせる), merge (近い点をまとめる), layerIds (対象のレイヤ) }
 * 戻り値の各点には layer（レイヤ id）が付く。
 */
export function documentDots (doc, opts = {}) {
  const profile = getProfile(opts.profileId || doc.profile)
  const snap = opts.snap !== false && !!profile.grid
  const all = []
  for (const layer of doc.layers) {
    if (opts.layerIds ? !opts.layerIds.includes(layer.id) : !layer.visible) continue
    for (const o of layer.objects) {
      for (const d of objectDots(o, doc)) {
        let { x, y } = d
        if (snap) [x, y] = snapToGrid(profile, x, y)
        all.push({ x, y, size: mapSize(profile, d.size), layer: layer.id })
      }
    }
  }
  const minDist = doc.settings.minDist != null ? +doc.settings.minDist : profile.minDist
  if (opts.merge === false || !(minDist > 0)) return all
  // 大きい点を優先して残す
  all.sort((a, b) => SIZE_ORDER[b.size] - SIZE_ORDER[a.size])
  return mergeClose(all, minDist, () => true)
}

export function dotsBox (dots) {
  if (!dots.length) return null
  return bboxOfPoints(dots.map(d => [d.x, d.y]))
}
