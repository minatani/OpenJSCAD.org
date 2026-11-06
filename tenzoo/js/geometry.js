// 幾何ユーティリティ（単位はすべて mm、原点は用紙左上、y は下向き）

export const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1])

export function bboxOfPoints (pts) {
  let minX = Infinity; let minY = Infinity; let maxX = -Infinity; let maxY = -Infinity
  for (const p of pts) {
    if (p[0] < minX) minX = p[0]
    if (p[1] < minY) minY = p[1]
    if (p[0] > maxX) maxX = p[0]
    if (p[1] > maxY) maxY = p[1]
  }
  return { minX, minY, maxX, maxY }
}

export function unionBox (a, b) {
  if (!a) return b
  if (!b) return a
  return {
    minX: Math.min(a.minX, b.minX),
    minY: Math.min(a.minY, b.minY),
    maxX: Math.max(a.maxX, b.maxX),
    maxY: Math.max(a.maxY, b.maxY)
  }
}

// ---- アフィン変換 [a, b, c, d, e, f] : x' = a x + c y + e, y' = b x + d y + f
export const IDENTITY = [1, 0, 0, 1, 0, 0]
export const mTranslate = (tx, ty) => [1, 0, 0, 1, tx, ty]
export const mScale = (sx, sy, cx = 0, cy = 0) => [sx, 0, 0, sy, cx - sx * cx, cy - sy * cy]
export function mRotate (rad, cx = 0, cy = 0) {
  const c = Math.cos(rad); const s = Math.sin(rad)
  return [c, s, -s, c, cx - c * cx + s * cy, cy - s * cx - c * cy]
}
export function mMul (m, n) { // m ∘ n （n を先に適用）
  return [
    m[0] * n[0] + m[2] * n[1],
    m[1] * n[0] + m[3] * n[1],
    m[0] * n[2] + m[2] * n[3],
    m[1] * n[2] + m[3] * n[3],
    m[0] * n[4] + m[2] * n[5] + m[4],
    m[1] * n[4] + m[3] * n[5] + m[5]
  ]
}
export const apply = (m, p) => [m[0] * p[0] + m[2] * p[1] + m[4], m[1] * p[0] + m[3] * p[1] + m[5]]

// 相似変換（回転・一様拡大・鏡映）かどうか
export function isSimilarity (m, eps = 1e-6) {
  const l1 = Math.hypot(m[0], m[1]); const l2 = Math.hypot(m[2], m[3])
  const dot = m[0] * m[2] + m[1] * m[3]
  return Math.abs(l1 - l2) < eps * Math.max(1, l1) && Math.abs(dot) < eps * Math.max(1, l1 * l2)
}

// ---- 曲線
// Catmull-Rom スプライン（制御点を通る滑らかな曲線）を折れ線に
export function catmullRom (pts, closed = false, seg = 12) {
  if (pts.length < 3) return pts.slice()
  const out = []
  const n = pts.length
  const get = i => closed ? pts[(i + n) % n] : pts[Math.max(0, Math.min(n - 1, i))]
  const last = closed ? n : n - 1
  for (let i = 0; i < last; i++) {
    const p0 = get(i - 1); const p1 = get(i); const p2 = get(i + 1); const p3 = get(i + 2)
    for (let k = 0; k < seg; k++) {
      const t = k / seg; const t2 = t * t; const t3 = t2 * t
      out.push([
        0.5 * ((2 * p1[0]) + (-p0[0] + p2[0]) * t + (2 * p0[0] - 5 * p1[0] + 4 * p2[0] - p3[0]) * t2 + (-p0[0] + 3 * p1[0] - 3 * p2[0] + p3[0]) * t3),
        0.5 * ((2 * p1[1]) + (-p0[1] + p2[1]) * t + (2 * p0[1] - 5 * p1[1] + 4 * p2[1] - p3[1]) * t2 + (-p0[1] + 3 * p1[1] - 3 * p2[1] + p3[1]) * t3)
      ])
    }
  }
  if (!closed) out.push(pts[n - 1].slice())
  return out
}

export function cubicBezier (p0, p1, p2, p3, seg = 16) {
  const out = []
  for (let k = 1; k <= seg; k++) {
    const t = k / seg; const u = 1 - t
    out.push([
      u * u * u * p0[0] + 3 * u * u * t * p1[0] + 3 * u * t * t * p2[0] + t * t * t * p3[0],
      u * u * u * p0[1] + 3 * u * u * t * p1[1] + 3 * u * t * t * p2[1] + t * t * t * p3[1]
    ])
  }
  return out
}

export function ellipsePoints (cx, cy, rx, ry, rot = 0, seg = 0) {
  const n = seg || Math.max(24, Math.ceil((rx + ry) * 2))
  const c = Math.cos(rot); const s = Math.sin(rot)
  const out = []
  for (let i = 0; i < n; i++) {
    const t = (i / n) * Math.PI * 2
    const x = rx * Math.cos(t); const y = ry * Math.sin(t)
    out.push([cx + x * c - y * s, cy + x * s + y * c])
  }
  return out
}

export function rectPoints (x, y, w, h, rot = 0) {
  const cx = x + w / 2; const cy = y + h / 2
  const pts = [[x, y], [x + w, y], [x + w, y + h], [x, y + h]]
  if (!rot) return pts
  const m = mRotate(rot, cx, cy)
  return pts.map(p => apply(m, p))
}

// ---- 円弧（始点 a・終点 b を通り、点 c が弦からのふくらみを与える。エーデルの .ezi と同じ定義）
/** 円弧（始点 a・終点 b・ふくらみを与える点 c）の中心・半径・角度。ほぼ直線なら null */
export function arcGeometry (a, b, c) {
  const mx = (a[0] + b[0]) / 2; const my = (a[1] + b[1]) / 2
  const cx = b[0] - a[0]; const cy = b[1] - a[1]
  const chord = Math.hypot(cx, cy)
  if (chord < 1e-9) return null
  const nx = -cy / chord; const ny = cx / chord // 弦の法線
  const h = (c[0] - mx) * nx + (c[1] - my) * ny
  if (Math.abs(h) < 1e-6 * Math.max(1, chord)) return null
  const R = (chord * chord / 4 + h * h) / (2 * Math.abs(h))
  const k = h - Math.sign(h) * R
  const ox = mx + nx * k; const oy = my + ny * k
  const a1 = Math.atan2(a[1] - oy, a[0] - ox)
  const a2 = Math.atan2(b[1] - oy, b[0] - ox)
  const apex = Math.atan2(my + ny * h - oy, mx + nx * h - ox)
  const T = Math.PI * 2
  const norm = t => ((t % T) + T) % T
  let d = norm(a2 - a1)
  if (norm(apex - a1) > d) d -= T // 頂点を通る向きに回る
  return { ox, oy, R, a1, d }
}

export function arcPolyline (a, b, c, segLen = 1) {
  const g = arcGeometry(a, b, c)
  if (!g) return [a, b]
  const n = Math.max(8, Math.ceil(Math.abs(g.d) * g.R / segLen))
  const out = []
  for (let i = 0; i <= n; i++) { const t = g.a1 + g.d * i / n; out.push([g.ox + g.R * Math.cos(t), g.oy + g.R * Math.sin(t)]) }
  return out
}


// 折れ線の長さ
export function polylineLength (pts, closed = false) {
  let L = 0
  for (let i = 1; i < pts.length; i++) L += dist(pts[i - 1], pts[i])
  if (closed && pts.length > 2) L += dist(pts[pts.length - 1], pts[0])
  return L
}

/**
 * 折れ線に沿って等間隔に点を置く。
 * keepCorners=true のときは、頂点（角）に必ず点を置き、各辺を均等に割る。
 * 点図では角が触ってわかることが大切なので、既定は角を残す。
 */
export function samplePolyline (pts, spacing, { closed = false, keepCorners = true, cornerAngle = 25 } = {}) {
  if (pts.length === 0) return []
  if (pts.length === 1) return [pts[0].slice()]
  const path = closed ? [...pts, pts[0]] : pts
  if (!keepCorners) return sampleEven(path, spacing, closed)
  // 角（曲がり角が cornerAngle 度以上）で区切り、区間ごとに均等割り
  const idx = [0]
  const lim = Math.cos((cornerAngle * Math.PI) / 180)
  for (let i = 1; i < path.length - 1; i++) {
    const a = path[i - 1]; const b = path[i]; const c = path[i + 1]
    const v1 = [b[0] - a[0], b[1] - a[1]]; const v2 = [c[0] - b[0], c[1] - b[1]]
    const l1 = Math.hypot(...v1); const l2 = Math.hypot(...v2)
    if (l1 < 1e-9 || l2 < 1e-9) continue
    const cos = (v1[0] * v2[0] + v1[1] * v2[1]) / (l1 * l2)
    if (cos < lim) idx.push(i)
  }
  idx.push(path.length - 1)
  // 閉じた図形で角が一つもないとき（円など）は全体を均等割り
  if (closed && idx.length === 2) return sampleEven(path, spacing, true)
  const out = []
  for (let k = 0; k < idx.length - 1; k++) {
    const seg = path.slice(idx[k], idx[k + 1] + 1)
    const s = sampleEven(seg, spacing, false)
    if (k > 0) s.shift()
    out.push(...s)
  }
  if (closed && out.length > 1 && dist(out[0], out[out.length - 1]) < spacing * 0.5) out.pop()
  return out
}

// 道のり等分（端点を含む）。closed のときは終点を落とす
function sampleEven (path, spacing, closed) {
  const L = polylineLength(path)
  if (L < 1e-9) return [path[0].slice()]
  const n = Math.max(1, Math.round(L / spacing))
  const step = L / n
  const out = [path[0].slice()]
  let seg = 0; let segStart = 0
  let segLen = dist(path[0], path[1])
  for (let k = 1; k <= n; k++) {
    const target = k * step
    while (seg < path.length - 2 && segStart + segLen < target - 1e-9) {
      segStart += segLen
      seg++
      segLen = dist(path[seg], path[seg + 1])
    }
    const t = segLen > 0 ? Math.min(1, (target - segStart) / segLen) : 0
    const a = path[seg]; const b = path[seg + 1]
    out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t])
  }
  if (closed) out.pop()
  return out
}

// 点と線分の距離
export function distToSegment (p, a, b) {
  const vx = b[0] - a[0]; const vy = b[1] - a[1]
  const L2 = vx * vx + vy * vy
  let t = L2 ? ((p[0] - a[0]) * vx + (p[1] - a[1]) * vy) / L2 : 0
  t = Math.max(0, Math.min(1, t))
  return Math.hypot(p[0] - (a[0] + t * vx), p[1] - (a[1] + t * vy))
}

export function distToPolyline (p, pts, closed = false) {
  let d = Infinity
  for (let i = 1; i < pts.length; i++) d = Math.min(d, distToSegment(p, pts[i - 1], pts[i]))
  if (closed && pts.length > 2) d = Math.min(d, distToSegment(p, pts[pts.length - 1], pts[0]))
  if (pts.length === 1) d = dist(p, pts[0])
  return d
}

// 偶奇規則による内外判定（複数の輪＝穴あきに対応）
export function pointInRings (p, rings) {
  let inside = false
  const x = p[0]; const y = p[1]
  for (const ring of rings) {
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const xi = ring[i][0]; const yi = ring[i][1]; const xj = ring[j][0]; const yj = ring[j][1]
      if (((yi > y) !== (yj > y)) && (x < ((xj - xi) * (y - yi)) / (yj - yi) + xi)) inside = !inside
    }
  }
  return inside
}

export function polygonArea (ring) {
  let a = 0
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) a += (ring[j][0] + ring[i][0]) * (ring[j][1] - ring[i][1])
  return a / 2
}

// 折れ線の平行移動（法線方向に d だけずらす、角は単純平均）
export function offsetPolyline (pts, d, closed = false) {
  const n = pts.length
  if (n < 2) return pts.slice()
  const out = []
  for (let i = 0; i < n; i++) {
    const prev = closed ? pts[(i - 1 + n) % n] : pts[Math.max(0, i - 1)]
    const next = closed ? pts[(i + 1) % n] : pts[Math.min(n - 1, i + 1)]
    let dx = next[0] - prev[0]; let dy = next[1] - prev[1]
    const L = Math.hypot(dx, dy) || 1
    dx /= L; dy /= L
    out.push([pts[i][0] - dy * d, pts[i][1] + dx * d])
  }
  return out
}

// 破線：折れ線を「on の長さ、off の長さ」で切り出した区間の配列にする
export function dashPolyline (pts, on, off, closed = false) {
  const path = closed ? [...pts, pts[0]] : pts
  const out = []
  let cur = [path[0].slice()]; let drawing = true; let left = on
  for (let i = 1; i < path.length; i++) {
    let a = path[i - 1]; const b = path[i]
    let segLen = dist(a, b)
    while (segLen > 1e-9) {
      if (segLen >= left) {
        const t = left / segLen
        const p = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]
        if (drawing) { cur.push(p); out.push(cur) } else cur = [p]
        drawing = !drawing
        segLen -= left
        a = p
        left = drawing ? on : off
        if (drawing) cur = [p]
      } else {
        if (drawing) cur.push(b.slice())
        left -= segLen
        segLen = 0
      }
    }
  }
  if (drawing && cur.length > 1) out.push(cur)
  return out
}

// 点列を簡略化（Ramer–Douglas–Peucker）
export function simplify (pts, tol) {
  if (pts.length < 3) return pts.slice()
  const keep = new Uint8Array(pts.length)
  keep[0] = keep[pts.length - 1] = 1
  const stack = [[0, pts.length - 1]]
  while (stack.length) {
    const [s, e] = stack.pop()
    let maxD = 0; let idx = -1
    for (let i = s + 1; i < e; i++) {
      const d = distToSegment(pts[i], pts[s], pts[e])
      if (d > maxD) { maxD = d; idx = i }
    }
    if (maxD > tol && idx > 0) {
      keep[idx] = 1
      stack.push([s, idx], [idx, e])
    }
  }
  return pts.filter((_, i) => keep[i])
}

// 近い点をまとめる（空間ハッシュ）。keepFn(a, b) が true なら a を残す
export function mergeClose (dots, minDist, prefer = (a, b) => (a.r || 0) >= (b.r || 0)) {
  if (minDist <= 0) return dots.slice()
  const cell = minDist
  const grid = new Map()
  const out = []
  const key = (i, j) => i * 1e6 + j
  for (const d of dots) {
    const i = Math.floor(d.x / cell); const j = Math.floor(d.y / cell)
    let hit = null
    for (let di = -1; di <= 1 && !hit; di++) {
      for (let dj = -1; dj <= 1 && !hit; dj++) {
        const list = grid.get(key(i + di, j + dj))
        if (!list) continue
        for (const o of list) {
          if (Math.hypot(o.x - d.x, o.y - d.y) < minDist) { hit = o; break }
        }
      }
    }
    if (hit) {
      if (!prefer(hit, d)) Object.assign(hit, d, { x: hit.x, y: hit.y, size: d.size })
      continue
    }
    const nd = { ...d }
    out.push(nd)
    const k = key(i, j)
    if (!grid.has(k)) grid.set(k, [])
    grid.get(k).push(nd)
  }
  return out
}

// 擬似乱数（シード付き、再現性のため）
export function rng (seed = 1) {
  let s = seed >>> 0 || 1
  return () => {
    s ^= s << 13; s >>>= 0
    s ^= s >>> 17
    s ^= s << 5; s >>>= 0
    return s / 4294967296
  }
}
