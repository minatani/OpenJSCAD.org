// スクリーンリーダ向け：読み上げ（ライブリージョン）と、図形・文書の言葉による説明
import { bboxOf, brailleCells } from './model.js'
import { brailleToKana } from './braille.js'
import { PATTERNS } from './patterns.js'
import { DOT_SIZES, PAPERS } from './profiles.js'
import { polylineLength } from './geometry.js'

export const TYPE_NAMES = {
  dots: '点', path: '折れ線', curve: '曲線', freehand: '手描きの線', rect: '四角形', ellipse: '楕円', arc: '円弧',
  braille: '点字', mask: '塗りつぶした範囲', marker: '記号'
}
const n1 = v => (Math.round(v * 10) / 10).toString()
const SIZE = s => (DOT_SIZES[s] || DOT_SIZES.M).label

const MARKER_NAMES = { star: '星', cross: '十字', square: '四角', diamond: 'ひし形', circle: '丸', triangle: '三角', dot: '1点' }
export function typeName (o) {
  if (o.type === 'marker') return `記号（${MARKER_NAMES[o.shape] || o.shape}）`
  if (o.type === 'path') {
    if (o.points.length === 2 && !o.closed) return '直線'
    if (o.closed) return o.points.length === 3 ? '三角形' : `${o.points.length}角形`
  }
  if (o.type === 'ellipse' && Math.abs(o.rx - o.ry) < 0.05) return '円'
  if (o.type === 'rect' && Math.abs(o.w - o.h) < 0.05) return '正方形'
  return TYPE_NAMES[o.type] || o.type
}

/** 図形1つを言葉で説明する（一覧・読み上げ用） */
export function describeObject (o, doc, { detail = true } = {}) {
  const parts = [typeName(o)]
  const st = o.style || {}
  switch (o.type) {
    case 'dots': parts.push(`${o.points.length} 個`); break
    case 'marker': parts.push(`中心 x ${n1(o.x)} y ${n1(o.y)}`, SIZE(st.dot || 'L')); if (st.clear) parts.push(`周りの余白 ${n1(st.clear)}mm`); break
    case 'braille': {
      const kana = o.text || brailleToKana(brailleCells(o))
      parts.push(`「${kana.replace(/\n/g, ' ')}」`, `左上 x ${n1(o.x)} y ${n1(o.y)}`)
      break
    }
    case 'rect': parts.push(`左上 x ${n1(o.x)} y ${n1(o.y)}、幅 ${n1(o.w)} 高さ ${n1(o.h)}`); if (o.rot) parts.push(`回転 ${Math.round(o.rot * 180 / Math.PI)}度`); break
    case 'ellipse':
      parts.push(`中心 x ${n1(o.cx)} y ${n1(o.cy)}`, Math.abs(o.rx - o.ry) < 0.05 ? `半径 ${n1(o.rx)}` : `横半径 ${n1(o.rx)} 縦半径 ${n1(o.ry)}`)
      if (o.rot) parts.push(`回転 ${Math.round(o.rot * 180 / Math.PI)}度`)
      break
    case 'path':
      if (o.points.length === 2 && !o.closed) parts.push(`始点 x ${n1(o.points[0][0])} y ${n1(o.points[0][1])} から 終点 x ${n1(o.points[1][0])} y ${n1(o.points[1][1])}、長さ ${n1(polylineLength(o.points))}`)
      else parts.push(`頂点 ${o.points.length} 個、始点 x ${n1(o.points[0][0])} y ${n1(o.points[0][1])}`)
      break
    case 'arc':
      parts.push(`始点 x ${n1(o.points[0][0])} y ${n1(o.points[0][1])} から 終点 x ${n1(o.points[1][0])} y ${n1(o.points[1][1])}`)
      break
    default: {
      const b = bboxOf(o, doc)
      if (b) parts.push(`範囲 x ${n1(b.minX)}～${n1(b.maxX)}、y ${n1(b.minY)}～${n1(b.maxY)}`)
    }
  }
  if (!detail) return parts.join('、')
  if (['path', 'curve', 'freehand', 'rect', 'ellipse', 'arc'].includes(o.type)) {
    if (st.stroke === false) parts.push('輪郭なし')
    else {
      parts.push(`${SIZE(st.dot)}、間隔 ${n1(+st.spacing || 2)}mm`)
      if (st.line === 'dashed') parts.push('破線')
      if (st.line === 'dotted') parts.push('点線')
      if (st.line === 'double') parts.push(`二重線（幅 ${n1(+st.width || 2.8)}mm）`)
      if (st.arrow && st.arrow !== 'none') parts.push({ end: '終点に矢印', start: '始点に矢印', both: '両端に矢印' }[st.arrow])
    }
  }
  if (st.fill && (o.closed || ['rect', 'ellipse', 'mask'].includes(o.type))) {
    parts.push(`面：${(PATTERNS[st.fill.pattern] || PATTERNS.grid).label}、間隔 ${n1(st.fill.spacing)}mm、${SIZE(st.fill.dot)}`)
  }
  if (o.edel) parts.push('エーデルの線')
  return parts.join('、')
}

/** 文書の概要 */
export function docSummary (doc, dotCount) {
  const p = PAPERS[doc.page.paper]
  const paper = p ? p.label : `${n1(doc.page.width)}×${n1(doc.page.height)}mm`
  const vis = doc.layers.filter(l => l.visible).length
  const objs = doc.layers.reduce((a, l) => a + l.objects.length, 0)
  return `用紙 ${paper}。レイヤ ${doc.layers.length} 枚（見えているもの ${vis} 枚）。図形 ${objs} 個。点 ${dotCount} 個。`
}

/** 点 p の近くにある図形の説明（カーソルの読み上げ用） */
export function describeAt (doc, p, hit) {
  const names = []
  for (const l of doc.layers) {
    if (!l.visible) continue
    for (const o of l.objects) if (hit(o, p)) names.push(typeName(o))
  }
  return names.length ? names.slice(0, 3).join('、') + (names.length > 3 ? ` ほか ${names.length - 3} 個` : '') + 'の上' : ''
}

// ---- ライブリージョン
let liveEl = null; let timer = null
export function say (msg) {
  if (!liveEl) liveEl = document.getElementById('sr-live')
  if (!liveEl || !msg) return
  // 同じ文でも読み上げられるよう、いったん空にしてから入れる
  liveEl.textContent = ''
  clearTimeout(timer)
  timer = setTimeout(() => { liveEl.textContent = msg }, 60)
}

