// 点図の検査：印刷・触読の前に、よくある問題を見つける
// 目安は navimap-assistant の検査に合わせる（点どうし 5 目盛り≒1.7mm 以上、60×60 目盛りに 60 点まで）
import { documentDots } from './raster.js'
import { bboxOf } from './model.js'
import { edlPaperOf } from './profiles.js'
import { EDL_UNIT_X, EDL_UNIT_Y } from './io/edl.js'
import { typeName } from './a11y.js'

export const CHECK = { minDist: 1.6, denseCell: 60, denseLimit: 60, brailleMargin: 1.5 }
const n1 = v => (Math.round(v * 10) / 10).toString()

export function checkDocument (doc, opts = {}) {
  const c = { ...CHECK, ...opts }
  const dots = documentDots(doc, { merge: false }).filter(d => d.side === 'front')
  const items = []
  // 1. 近すぎる点（別の図形どうし。同じ図形の中は意図した間隔とみなす）
  const cell = c.minDist
  const grid = new Map()
  let close = 0; const where = []
  for (const d of dots) {
    const gx = Math.floor(d.x / cell); const gy = Math.floor(d.y / cell)
    for (let a = -1; a <= 1; a++) {
      for (let b = -1; b <= 1; b++) {
        for (const e of grid.get((gx + a) + ',' + (gy + b)) || []) {
          if (e.obj !== d.obj && Math.hypot(e.x - d.x, e.y - d.y) < c.minDist) { close++; const w = `x ${n1(d.x)} y ${n1(d.y)}`; if (where.length < 5 && !where.includes(w)) where.push(w) }
        }
      }
    }
    const k = gx + ',' + gy
    if (!grid.has(k)) grid.set(k, [])
    grid.get(k).push(d)
  }
  if (close) items.push({ kind: 'close', count: close, text: `別の図形の点どうしが ${c.minDist}mm より近い所が ${close} か所あります（例：${where.join('、')}）。書き出しの「近すぎる点をまとめる」で1つにまとめられます。` })
  // 2. 点が密集している所
  const cw = c.denseCell * EDL_UNIT_X; const ch = c.denseCell * EDL_UNIT_Y
  const dense = new Map()
  for (const d of dots) { const k = Math.floor(d.x / cw) + ',' + Math.floor(d.y / ch); dense.set(k, (dense.get(k) || 0) + 1) }
  const many = [...dense.entries()].filter(([, v]) => v > c.denseLimit)
  if (many.length) {
    items.push({ kind: 'dense', count: many.length, text: `点が密集している所が ${many.length} か所あります（約 ${n1(cw)}×${n1(ch)}mm に ${c.denseLimit} 点より多い）：` + many.slice(0, 4).map(([k, v]) => { const [i, j] = k.split(',').map(Number); return `x ${n1(i * cw)}～${n1((i + 1) * cw)} y ${n1(j * ch)}～${n1((j + 1) * ch)} に ${v} 点` }).join('、') + '。点の間隔を広げると触りやすくなります。' })
  }
  // 3. ESA721 で打てない所の点
  if (doc.profile === 'esa721') {
    const p = edlPaperOf(doc.page, !!(doc.settings && doc.settings.edlFullArea))
    const out = dots.filter(d => Math.round(d.x / EDL_UNIT_X) > p.area.x || Math.round(d.y / EDL_UNIT_Y) > p.area.y || d.x < 0 || d.y < 0)
    if (out.length) items.push({ kind: 'outside', count: out.length, text: `点字用紙 ${p.name} の点を打てる範囲（横 ${p.area.x}、縦 ${p.area.y} 目盛りまで）の外に点が ${out.length} 個あります。エーデル形式などに書き出すと省かれます。` })
  }
  // 4. 点字に重なる・近すぎる点
  for (const l of doc.layers) {
    if (!l.visible) continue
    for (const o of l.objects) {
      if (o.type !== 'braille') continue
      const b = bboxOf(o, doc)
      const m = c.brailleMargin
      const hit = dots.filter(d => d.obj !== o.id && d.x >= b.minX - m && d.x <= b.maxX + m && d.y >= b.minY - m && d.y <= b.maxY + m)
      if (hit.length) items.push({ kind: 'braille', count: hit.length, text: `点字「${(o.text || '').replace(/\n/g, ' ')}」（x ${n1(b.minX)} y ${n1(b.minY)}）のすぐ近くに、ほかの図形の点が ${hit.length} 個あります。点字が読みにくくなります。点字の「周りの点を消す余白」を使うか、位置をずらしてください。` })
    }
  }
  // 5. 記号どうしが近い
  const markers = doc.layers.filter(l => l.visible).flatMap(l => l.objects.filter(o => o.type === 'marker'))
  for (let i = 0; i < markers.length; i++) {
    for (let j = i + 1; j < markers.length; j++) {
      if (Math.hypot(markers[i].x - markers[j].x, markers[i].y - markers[j].y) < 6) items.push({ kind: 'marker', count: 1, text: `${typeName(markers[i])}（x ${n1(markers[i].x)} y ${n1(markers[i].y)}）と ${typeName(markers[j])} が近すぎます（6mm 未満）。` })
    }
  }
  const summary = items.length ? `点図の検査：点 ${dots.length} 個。気になる所が ${items.length} 件あります。` : `点図の検査：点 ${dots.length} 個。問題は見つかりませんでした。`
  return { summary, items, dots: dots.length }
}
