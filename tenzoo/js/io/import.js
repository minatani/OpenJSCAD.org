// 取り込み：画像（下絵・自動点図化）、SVG（ベクトル図形として）
import { apply, mMul, IDENTITY, cubicBezier, bboxOfPoints, simplify } from '../geometry.js'
import { newId, defaultStyle } from '../model.js'

// ---- 画像 → 点（自動点図化）
// img: { width, height, data(RGBA) }。place: { x, y, w, h }（用紙上の位置 mm）
// opts: { mode: 'fill'|'edge'|'levels', threshold(0-255), spacing(mm), size, invert }
export function imageToDots (img, place, opts = {}) {
  const sp = Math.max(0.6, +opts.spacing || 2)
  const th = opts.threshold != null ? +opts.threshold : 128
  const mode = opts.mode || 'fill'
  const nx = Math.max(1, Math.floor(place.w / sp)); const ny = Math.max(1, Math.floor(place.h / sp))
  const lum = new Float32Array(nx * ny)
  const pxW = img.width / nx; const pxH = img.height / ny
  // 各格子の範囲の平均の明るさ（透明は白とみなす）
  for (let j = 0; j < ny; j++) {
    for (let i = 0; i < nx; i++) {
      let sum = 0; let cnt = 0
      const x0 = Math.floor(i * pxW); const x1 = Math.max(x0 + 1, Math.floor((i + 1) * pxW))
      const y0 = Math.floor(j * pxH); const y1 = Math.max(y0 + 1, Math.floor((j + 1) * pxH))
      const stepX = Math.max(1, Math.floor((x1 - x0) / 4)); const stepY = Math.max(1, Math.floor((y1 - y0) / 4))
      for (let y = y0; y < y1 && y < img.height; y += stepY) {
        for (let x = x0; x < x1 && x < img.width; x += stepX) {
          const k = (y * img.width + x) * 4
          const a = img.data[k + 3] / 255
          const l = 0.299 * img.data[k] + 0.587 * img.data[k + 1] + 0.114 * img.data[k + 2]
          sum += l * a + 255 * (1 - a); cnt++
        }
      }
      let v = cnt ? sum / cnt : 255
      if (opts.invert) v = 255 - v
      lum[j * nx + i] = v
    }
  }
  const dark = (i, j) => i >= 0 && j >= 0 && i < nx && j < ny && lum[j * nx + i] < th
  const pts = []
  const at = (i, j) => [place.x + (i + 0.5) * (place.w / nx), place.y + (j + 0.5) * (place.h / ny)]
  for (let j = 0; j < ny; j++) {
    for (let i = 0; i < nx; i++) {
      const v = lum[j * nx + i]
      if (mode === 'levels') {
        if (v < th * 0.5) pts.push([...at(i, j), 'L'])
        else if (v < th * 0.8) pts.push([...at(i, j), 'M'])
        else if (v < th) { if ((i + j) % 2 === 0) pts.push([...at(i, j), 'S']) }
        continue
      }
      if (!dark(i, j)) continue
      if (mode === 'edge' && dark(i - 1, j) && dark(i + 1, j) && dark(i, j - 1) && dark(i, j + 1)) continue
      pts.push([...at(i, j), opts.size || 'M'])
    }
  }
  return pts
}

// ---- 画像ファイルを読み込む（ブラウザ）
export function loadImageFile (file) {
  return new Promise((resolve, reject) => {
    const fr = new FileReader()
    fr.onerror = () => reject(fr.error)
    fr.onload = () => {
      const img = new Image()
      img.onload = () => resolve({ img, dataURL: fr.result })
      img.onerror = () => reject(new Error('画像を読み込めませんでした（対応していない形式の可能性があります）。'))
      img.src = fr.result
    }
    fr.readAsDataURL(file)
  })
}

export function imageDataOf (img, maxSide = 1600) {
  const k = Math.min(1, maxSide / Math.max(img.naturalWidth || img.width, img.naturalHeight || img.height))
  const w = Math.max(1, Math.round((img.naturalWidth || img.width) * k)); const h = Math.max(1, Math.round((img.naturalHeight || img.height) * k))
  const c = document.createElement('canvas')
  c.width = w; c.height = h
  const ctx = c.getContext('2d', { willReadFrequently: true })
  ctx.drawImage(img, 0, 0, w, h)
  return ctx.getImageData(0, 0, w, h)
}

// 用紙に収まる配置（余白 margin mm、縦横比を保つ）
export function fitPlacement (iw, ih, page, margin = 10) {
  const W = page.width - margin * 2; const H = page.height - margin * 2
  const k = Math.min(W / iw, H / ih)
  const w = iw * k; const h = ih * k
  return { x: (page.width - w) / 2, y: (page.height - h) / 2, w, h }
}

// ---- SVG のパス文字列 d を折れ線（複数）にする
export function parsePathD (d) {
  const toks = String(d).match(/[a-zA-Z]|[-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?/g) || []
  const subs = []; let cur = null
  let i = 0; let cmd = ''
  let x = 0; let y = 0; let sx = 0; let sy = 0
  let lastC = null; let lastQ = null
  const num = () => parseFloat(toks[i++])
  const start = () => { cur = { points: [[x, y]], closed: false }; subs.push(cur) }
  while (i < toks.length) {
    if (/[a-zA-Z]/.test(toks[i])) cmd = toks[i++]
    const rel = cmd === cmd.toLowerCase()
    const C = cmd.toUpperCase()
    const ox = rel ? x : 0; const oy = rel ? y : 0
    if (C === 'Z') {
      if (cur) { cur.closed = true; x = sx; y = sy }
      cur = null; lastC = lastQ = null
      continue
    }
    if (i >= toks.length || /[a-zA-Z]/.test(toks[i])) { i++; continue }
    if (C === 'M') {
      x = ox + num(); y = oy + num(); sx = x; sy = y
      start()
      cmd = rel ? 'l' : 'L'
      lastC = lastQ = null
      continue
    }
    if (!cur) start()
    if (C === 'L') { x = ox + num(); y = oy + num(); cur.points.push([x, y]); lastC = lastQ = null } else if (C === 'H') { x = ox + num(); cur.points.push([x, y]); lastC = lastQ = null } else if (C === 'V') { y = (rel ? y : 0) + num(); cur.points.push([x, y]); lastC = lastQ = null } else if (C === 'C' || C === 'S') {
      let c1
      if (C === 'C') c1 = [ox + num(), oy + num()]
      else c1 = lastC ? [2 * x - lastC[0], 2 * y - lastC[1]] : [x, y]
      const c2 = [ox + num(), oy + num()]; const p = [ox + num(), oy + num()]
      cur.points.push(...cubicBezier([x, y], c1, c2, p))
      lastC = c2; lastQ = null; x = p[0]; y = p[1]
    } else if (C === 'Q' || C === 'T') {
      let q
      if (C === 'Q') q = [ox + num(), oy + num()]
      else q = lastQ ? [2 * x - lastQ[0], 2 * y - lastQ[1]] : [x, y]
      const p = [ox + num(), oy + num()]
      const c1 = [x + (2 / 3) * (q[0] - x), y + (2 / 3) * (q[1] - y)]
      const c2 = [p[0] + (2 / 3) * (q[0] - p[0]), p[1] + (2 / 3) * (q[1] - p[1])]
      cur.points.push(...cubicBezier([x, y], c1, c2, p))
      lastQ = q; lastC = null; x = p[0]; y = p[1]
    } else if (C === 'A') {
      const rx = Math.abs(num()); const ry = Math.abs(num()); const phi = num(); const large = num(); const sweep = num()
      const p = [ox + num(), oy + num()]
      cur.points.push(...arcPoints([x, y], p, rx, ry, phi, large, sweep))
      x = p[0]; y = p[1]; lastC = lastQ = null
    } else { i++ }
  }
  return subs.filter(s => s.points.length > 1)
}

// SVG の円弧（端点表記）を折れ線に
function arcPoints (p0, p1, rx, ry, phiDeg, large, sweep) {
  if (!rx || !ry) return [p1]
  const phi = (phiDeg * Math.PI) / 180; const c = Math.cos(phi); const s = Math.sin(phi)
  const dx = (p0[0] - p1[0]) / 2; const dy = (p0[1] - p1[1]) / 2
  const x1 = c * dx + s * dy; const y1 = -s * dx + c * dy
  const lam = (x1 * x1) / (rx * rx) + (y1 * y1) / (ry * ry)
  if (lam > 1) { rx *= Math.sqrt(lam); ry *= Math.sqrt(lam) }
  const num = rx * rx * ry * ry - rx * rx * y1 * y1 - ry * ry * x1 * x1
  const den = rx * rx * y1 * y1 + ry * ry * x1 * x1
  let k = Math.sqrt(Math.max(0, num / den))
  if (+large === +sweep) k = -k
  const cx1 = (k * rx * y1) / ry; const cy1 = (-k * ry * x1) / rx
  const cx = c * cx1 - s * cy1 + (p0[0] + p1[0]) / 2; const cy = s * cx1 + c * cy1 + (p0[1] + p1[1]) / 2
  const ang = (ux, uy, vx, vy) => Math.atan2(ux * vy - uy * vx, ux * vx + uy * vy)
  const t1 = ang(1, 0, (x1 - cx1) / rx, (y1 - cy1) / ry)
  let dt = ang((x1 - cx1) / rx, (y1 - cy1) / ry, (-x1 - cx1) / rx, (-y1 - cy1) / ry)
  if (!+sweep && dt > 0) dt -= 2 * Math.PI
  if (+sweep && dt < 0) dt += 2 * Math.PI
  const n = Math.max(4, Math.ceil(Math.abs(dt) / (Math.PI / 16)))
  const out = []
  for (let i = 1; i <= n; i++) {
    const t = t1 + (dt * i) / n
    out.push([cx + rx * Math.cos(t) * c - ry * Math.sin(t) * s, cy + rx * Math.cos(t) * s + ry * Math.sin(t) * c])
  }
  return out
}

// transform 属性 → 行列
export function parseTransform (str) {
  let m = IDENTITY
  if (!str) return m
  const re = /(matrix|translate|scale|rotate|skewX|skewY)\s*\(([^)]*)\)/g
  let r
  while ((r = re.exec(str))) {
    const a = r[2].split(/[\s,]+/).filter(Boolean).map(Number)
    let t = IDENTITY
    switch (r[1]) {
      case 'matrix': t = a; break
      case 'translate': t = [1, 0, 0, 1, a[0] || 0, a[1] || 0]; break
      case 'scale': t = [a[0], 0, 0, a[1] != null ? a[1] : a[0], 0, 0]; break
      case 'rotate': {
        const rad = ((a[0] || 0) * Math.PI) / 180; const c = Math.cos(rad); const s = Math.sin(rad)
        const cx = a[1] || 0; const cy = a[2] || 0
        t = [c, s, -s, c, cx - c * cx + s * cy, cy - s * cx - c * cy]
        break
      }
      case 'skewX': t = [1, 0, Math.tan((a[0] * Math.PI) / 180), 1, 0, 0]; break
      case 'skewY': t = [1, Math.tan((a[0] * Math.PI) / 180), 0, 1, 0, 0]; break
    }
    m = mMul(m, t)
  }
  return m
}

/**
 * SVG 文字列をベクトル図形（tenzoo の path 図形）にする。ブラウザの DOMParser を使う。
 * 用紙に収まるよう拡大縮小する。塗りのある閉じた図形は fill を付ける（opts.fill）。
 */
export function svgToObjects (svgText, page, opts = {}) {
  const dom = new DOMParser().parseFromString(svgText, 'image/svg+xml')
  if (dom.querySelector('parsererror')) throw new Error('SVG を解析できませんでした。')
  const shapes = []
  const walk = (el, m) => {
    if (el.nodeType !== 1) return
    const tag = el.localName
    if (['defs', 'clipPath', 'mask', 'symbol', 'metadata', 'title', 'desc', 'style', 'script'].includes(tag)) return
    const mm = mMul(m, parseTransform(el.getAttribute('transform')))
    const g = k => parseFloat(el.getAttribute(k) || '0')
    const fillAttr = (el.getAttribute('fill') || (el.getAttribute('style') || '').match(/fill:\s*([^;]+)/)?.[1] || '').trim()
    const filled = fillAttr !== 'none'
    const push = (points, closed) => { if (points.length > 1) shapes.push({ points: points.map(p => apply(mm, p)), closed, filled: closed && filled }) }
    switch (tag) {
      case 'line': push([[g('x1'), g('y1')], [g('x2'), g('y2')]], false); break
      case 'polyline': case 'polygon': {
        const a = (el.getAttribute('points') || '').trim().split(/[\s,]+/).map(Number)
        const pts = []
        for (let i = 0; i + 1 < a.length; i += 2) pts.push([a[i], a[i + 1]])
        push(pts, tag === 'polygon')
        break
      }
      case 'rect': { const x = g('x'); const y = g('y'); const w = g('width'); const h = g('height'); push([[x, y], [x + w, y], [x + w, y + h], [x, y + h]], true); break }
      case 'circle': case 'ellipse': {
        const cx = g('cx'); const cy = g('cy'); const rx = tag === 'circle' ? g('r') : g('rx'); const ry = tag === 'circle' ? g('r') : g('ry')
        const n = 48; const pts = []
        for (let i = 0; i < n; i++) pts.push([cx + rx * Math.cos((i / n) * 2 * Math.PI), cy + ry * Math.sin((i / n) * 2 * Math.PI)])
        push(pts, true)
        break
      }
      case 'path': for (const s of parsePathD(el.getAttribute('d'))) push(s.points, s.closed); break
    }
    for (const ch of el.children) walk(ch, mm)
  }
  walk(dom.documentElement, IDENTITY)
  if (!shapes.length) throw new Error('SVG の中に取り込める図形がありませんでした。')
  // 用紙に合わせる
  const all = shapes.flatMap(s => s.points)
  const b = bboxOfPoints(all)
  const margin = opts.margin != null ? opts.margin : 10
  const k = Math.min((page.width - margin * 2) / Math.max(1e-6, b.maxX - b.minX), (page.height - margin * 2) / Math.max(1e-6, b.maxY - b.minY))
  const ox = (page.width - (b.maxX - b.minX) * k) / 2; const oy = (page.height - (b.maxY - b.minY) * k) / 2
  return shapes.map(s => {
    const pts = simplify(s.points.map(p => [ox + (p[0] - b.minX) * k, oy + (p[1] - b.minY) * k]), 0.15)
    const style = { ...defaultStyle(), ...(opts.style || {}) }
    if (s.filled && opts.fill) style.fill = { ...opts.fill }
    return { id: newId(), type: 'path', closed: s.closed, points: pts, style }
  })
}
