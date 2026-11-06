// エーデルの図形データ .ezi と、図をまとめた .sebk の読み書き
//
// .ezi（解析資料による。docs/format.md も参照）
//   1行目: 要素の数。2行目から1行1要素、空白区切りの整数 11 個（行末に空白）、CRLF
//   101 <大きさ> <間隔> x1 y1 x2 y2 0 0 0 0         線分
//   102 <大きさ> <間隔> x1 y1 x2 y2 x3 y3 0 0       円弧（始点・終点を通り、3点目が弦からのふくらみ h を与える）
//   座標・間隔の単位は .edl と同じ目盛り（ESA721 の1ステップ）
//   点の置き方: 長さ L、間隔 s として n = round(L/s)（1以上）に等分し、両端を含む n+1 点を整数に丸める
//   （.5 の丸め方は未解明。ここでは四捨五入。差は1目盛り以内）
// .sebk
//   「名前,大きさ 本体（大きさバイト）」を区切りなしで連結したもの（圧縮なし）
//   例: Zu_1.edl,2406 <edl> Zu_1.ezi,2025 <ezi> fumi.data,1 32 21 ,<NUL…>
//   fumi.data は構造未解明（点字の文書領域らしい）。読み込みでは無視し、書き出しでは空のものを付ける

import { EDL_UNIT_X, EDL_UNIT_Y, SIZE_TO_KIND, parseEDL, writeEDL } from './edl.js'
import { newId, defaultStyle, outlineOf } from '../model.js'
import { samplePolyline, arcGeometry } from '../geometry.js'
export { arcGeometry, arcPolyline } from '../geometry.js'

export const UNIT_AVG = (EDL_UNIT_X + EDL_UNIT_Y) / 2
const KIND_TO_SIZE = { 1: 'S', 2: 'M', 3: 'L' }
const toMM = (ux, uy) => [ux * EDL_UNIT_X, uy * EDL_UNIT_Y]
const toU = p => [p[0] / EDL_UNIT_X, p[1] / EDL_UNIT_Y]

export function isEZI (text) {
  const lines = String(text).split(/\r?\n/).filter(l => l.trim())
  return lines.length >= 1 && /^\d+\s*$/.test(lines[0]) && (lines.length === 1 || /^\d{3}(\s+-?\d+){10}\s*$/.test(lines[1]))
}

/** .ezi を読む。戻り値: [{ type, size, s, pts: [[x,y]...] (目盛り), raw }] */
export function parseEZI (text) {
  const lines = String(text).replace(/\x1a/g, '').split(/\r?\n/).filter(l => l.trim())
  if (!lines.length || !/^\d+\s*$/.test(lines[0])) throw new Error('エーデルの図形データ（.ezi）ではないようです。')
  const out = []
  for (const ln of lines.slice(1)) {
    const v = ln.trim().split(/\s+/).map(Number)
    if (v.length < 7 || v.some(isNaN)) continue
    const [type, size, s] = v
    const pts = type === 102 ? [[v[3], v[4]], [v[5], v[6]], [v[7], v[8]]] : [[v[3], v[4]], [v[5], v[6]]]
    out.push({ type, size, s, pts, raw: v })
  }
  return out
}

// ---- 目盛りの空間で、要素の点を求める（エーデルと同じ置き方）
function divide (a, b, n) {
  const out = []
  for (let i = 0; i <= n; i++) out.push([a[0] + (b[0] - a[0]) * i / n, a[1] + (b[1] - a[1]) * i / n])
  return out
}

/** 要素1つの点（目盛りの整数座標） */
export function elementDots (el) {
  const s = Math.max(1, el.s)
  let pts
  if (el.type === 102) {
    const g = arcGeometry(...el.pts)
    if (!g) pts = divide(el.pts[0], el.pts[1], Math.max(1, Math.round(Math.hypot(el.pts[1][0] - el.pts[0][0], el.pts[1][1] - el.pts[0][1]) / s)))
    else {
      const n = Math.max(1, Math.round(Math.abs(g.d) * g.R / s))
      pts = []
      for (let i = 0; i <= n; i++) { const t = g.a1 + g.d * i / n; pts.push([g.ox + g.R * Math.cos(t), g.oy + g.R * Math.sin(t)]) }
    }
  } else {
    const [a, b] = el.pts
    pts = divide(a, b, Math.max(1, Math.round(Math.hypot(b[0] - a[0], b[1] - a[1]) / s)))
  }
  return pts.map(p => [Math.round(p[0]), Math.round(p[1])])
}

/**
 * tenzoo の図形のうち、エーデル由来（edel プロパティあり）の線・円弧の点を、エーデルと同じ方法で求める（mm）。
 * raster.js から使う。
 */
export function edelObjectDots (o) {
  const s = o.edel.s
  const els = []
  if (o.type === 'arc') els.push({ type: 102, s, pts: o.points.map(toU) })
  else {
    const P = o.points.map(toU)
    for (let i = 1; i < P.length; i++) els.push({ type: 101, s, pts: [P[i - 1], P[i]] })
    if (o.closed && P.length > 2) els.push({ type: 101, s, pts: [P[P.length - 1], P[0]] })
  }
  const seen = new Set(); const out = []
  for (const el of els) {
    for (const [ux, uy] of elementDots(el)) {
      const k = ux + ',' + uy
      if (seen.has(k)) continue
      seen.add(k)
      out.push(toMM(ux, uy))
    }
  }
  return out
}

/**
 * .ezi の要素を tenzoo の図形にする。端点がつながる同じ大きさ・間隔の線分は折れ線にまとめる。
 * 戻り値: [{ object, elements: [index...] }]
 */
export function eziToObjects (els) {
  const out = []
  let cur = null
  els.forEach((el, i) => {
    const size = KIND_TO_SIZE[el.size] || 'M'
    const style = { ...defaultStyle(), dot: size, spacing: +(el.s * UNIT_AVG).toFixed(2) }
    if (el.type === 102) {
      cur = null
      out.push({ object: { id: newId(), type: 'arc', points: el.pts.map(p => toMM(...p)), style, edel: { s: el.s } }, elements: [i] })
      return
    }
    if (el.type !== 101) { cur = null; return } // 未知の要素は読み飛ばす
    const a = el.pts[0]; const b = el.pts[1]
    if (cur && cur.size === el.size && cur.s === el.s && cur.last[0] === a[0] && cur.last[1] === a[1]) {
      cur.entry.object.points.push(toMM(...b))
      cur.entry.elements.push(i)
      cur.last = b
      // 始点に戻ったら閉じた図形にする
      const f = cur.first
      if (b[0] === f[0] && b[1] === f[1] && cur.entry.object.points.length > 3) {
        cur.entry.object.points.pop(); cur.entry.object.closed = true; cur = null
      }
      return
    }
    const entry = { object: { id: newId(), type: 'path', closed: false, points: [toMM(...a), toMM(...b)], style, edel: { s: el.s } }, elements: [i] }
    out.push(entry)
    cur = { entry, size: el.size, s: el.s, last: b, first: a }
  })
  return out
}

/**
 * tenzoo の図形を .ezi の文字列にする（線・円弧のみ。面・点・点字は .ezi では表せないので .edl だけに入る）。
 * 戻り値: { text, count, skipped }
 */
export function objectsToEZI (objects) {
  const lines = []
  let skipped = 0
  const P = p => toU(p).map(Math.round)
  const push = (type, kind, s, pts) => {
    const v = [type, kind, s, ...pts.flat()]
    while (v.length < 11) v.push(0)
    lines.push(v.join(' ') + ' ')
  }
  for (const o of objects) {
    const st = o.style || {}
    if (o.type === 'dots' || o.type === 'braille' || o.type === 'marker' || o.type === 'mask' || st.stroke === false) { skipped++; continue }
    const kind = +(SIZE_TO_KIND[st.dot] || '2')
    const s = o.edel ? o.edel.s : Math.max(1, Math.round((+st.spacing || 2) / UNIT_AVG))
    if (o.type === 'arc') {
      const g = arcGeometry(...o.points.map(toU))
      // 3点目は弧の頂点（ふくらみの大きさだけが意味を持つ）
      let apex = o.points[2]
      if (g) { const t = g.a1 + g.d / 2; apex = toMM(g.ox + g.R * Math.cos(t), g.oy + g.R * Math.sin(t)) }
      push(102, kind, s, [P(o.points[0]), P(o.points[1]), P(apex)])
      continue
    }
    if (o.type === 'path' && (o.edel || !st.line || st.line === 'solid')) {
      // 直線の折れ線はそのまま線分に
      const pts = o.points.map(P)
      for (let i = 1; i < pts.length; i++) push(101, kind, s, [pts[i - 1], pts[i]])
      if (o.closed && pts.length > 2) push(101, kind, s, [pts[pts.length - 1], pts[0]])
      continue
    }
    // 曲線・円・四角など：点の間隔ごとの短い線分にする（各線分の両端が点になる）
    const { paths, closed } = outlineOf(o)
    for (const path of paths) {
      const smp = samplePolyline(path, +st.spacing || 2, { closed }).map(P)
      if (closed && smp.length > 2) smp.push(smp[0])
      for (let i = 1; i < smp.length; i++) push(101, kind, s, [smp[i - 1], smp[i]])
    }
  }
  return { text: [String(lines.length), ...lines].join('\r\n') + '\r\n', count: lines.length, skipped }
}

// ---- .sebk
export function isSEBK (text) { return /^[^,\s]{1,64}\.(edl|ezi),\d+ /.test(text) }

/** 戻り値: [{ name, body }]（fumi.data 以降は raw に入れる） */
export function parseSEBK (text) {
  const entries = []
  let i = 0
  while (i < text.length) {
    const comma = text.indexOf(',', i)
    if (comma < 0) break
    const name = text.slice(i, comma)
    if (name === 'fumi.data' || !/^[\w.-]+$/.test(name)) { entries.push({ name, raw: text.slice(i) }); break }
    const sp = text.indexOf(' ', comma)
    const size = parseInt(text.slice(comma + 1, sp), 10)
    if (!(size >= 0)) throw new Error('.sebk の構造を読み取れませんでした。')
    entries.push({ name, body: text.slice(sp + 1, sp + 1 + size) })
    i = sp + 1 + size
  }
  if (!entries.some(e => /\.edl$/i.test(e.name) || /\.ezi$/i.test(e.name))) throw new Error('.sebk の中に図のデータが見つかりませんでした。')
  return entries
}

// 中身の無い fumi.data（実物の .sebk 2点で同一だった 810 バイト）
export const EMPTY_FUMI = 'fumi.data,1 32 21 ,' + '\0'.repeat(788) + '00 '

export function writeSEBK (edlText, eziText, name = 'Zu_1') {
  return `${name}.edl,${edlText.length} ${edlText}${name}.ezi,${eziText.length} ${eziText}${EMPTY_FUMI}`
}

/**
 * .edl と .ezi を組み合わせて tenzoo のレイヤにする。
 * - .ezi の線・円弧 → 編集できる図形（エーデルと同じ点の置き方を保つ）
 * - .ezi の要素のうち .edl に点がほとんど無いもの → 隠したレイヤへ（エーデルで消した・隠した線など）
 * - .edl の点のうち .ezi から作れないもの（手で打った点・点字・塗りなど） → 点のレイヤ
 * 戻り値: { layers: [{ name, visible, objects }], paper, stats }
 */
export function combineEdlEzi (edlText, eziText) {
  const edl = edlText ? parseEDL(edlText) : null
  const els = eziText ? parseEZI(eziText) : []
  const page = edl ? edl.pages[0] : null
  const edlSet = new Map()
  if (page) for (const d of page.dots) if (d.side === 'front') edlSet.set(d.ux + ',' + d.uy, d)
  const groups = eziToObjects(els)
  const shown = []; const hidden = []
  const covered = new Set()
  for (const g of groups) {
    const ds = []
    for (const i of g.elements) ds.push(...elementDots(els[i]))
    let hit = 0
    for (const [x, y] of ds) if (near(edlSet, x, y)) hit++
    if (!edl || hit >= ds.length * 0.5) {
      shown.push(g.object)
      for (const [x, y] of ds) for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) covered.add((x + a) + ',' + (y + b))
    } else hidden.push(g.object)
  }
  const rest = page ? page.dots.filter(d => d.side === 'back' || !covered.has(d.ux + ',' + d.uy)) : []
  const layers = []
  if (shown.length) layers.push({ name: '線（.ezi）', visible: true, objects: shown })
  if (rest.length) {
    const front = rest.filter(d => d.side === 'front'); const back = rest.filter(d => d.side === 'back')
    if (front.length) layers.push({ name: edl && els.length ? '点（.edl のみ）' : '点', visible: true, objects: [dotsObject(front)] })
    if (back.length) layers.push({ name: '裏面の点', visible: true, side: 'back', objects: [dotsObject(back)] })
  }
  if (hidden.length) layers.push({ name: '.edl に無い線（.ezi のみ）', visible: false, objects: hidden })
  const maxX = Math.max(0, ...(page ? page.dots.map(d => d.ux) : []), ...els.flatMap(e => e.pts.map(p => p[0])))
  const paper = page ? page.paper : (maxX >= 480 ? 'A4' : 'B5')
  return { layers, paper, stats: { elements: els.length, shown: shown.length, hidden: hidden.length, edlDots: page ? page.dots.length : 0, restDots: rest.length } }
}
const near = (set, x, y) => { for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) if (set.has((x + a) + ',' + (y + b))) return true; return false }
const dotsObject = ds => ({ id: newId(), type: 'dots', source: 'edl', points: ds.map(d => [d.x, d.y, d.size]), style: defaultStyle() })

// 書き出し用：.edl と .ezi をまとめて作る
export function buildEdelFiles (dots, objects, paperInfo) {
  const edl = writeEDL(dots, { paper: paperInfo.name, area: paperInfo.area })
  const ezi = objectsToEZI(objects)
  return { edl, ezi }
}
