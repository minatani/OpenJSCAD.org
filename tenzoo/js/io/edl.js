// エーデル（EDEL）の点図ファイル .edl の読み書き
//
// 公開仕様はなく、次の解析結果による（docs/format.md も参照）:
//   1行目  "EDEL" + 用紙名（B5 / A4）+ "," + 点の最小の y + "," + 最大の y     例: EDELB5,33,485
//   2行目～ 「点の大きさ（1桁）」＋「点の座標（x 2文字, y 2文字）」の繰り返し
//   座標は 2 文字の 26 進数（'@'=0 …）で、値 = (上位-64)*26 + (下位-64)。A4 では上位に '[' '\'（27, 28）も現れる
//   点は (y, x) の昇順。点の大きさが変わるところで行を変える。行末は CRLF、最後の行のあとに改行はない
//   点の大きさ: 1=小, 2=中（点字の点）, 3=大（ESA721 の ESC ESC D 0/1/2）
//   1目盛り＝ESA721 の1ステップ: 横 0.3454mm、縦 0.3175mm（1マス=15、1行=33）
//   B5（8×10インチ）は x 0～479、A4（10×11インチ）は x 0～599。用紙の外の点は書かない
// 拡張（エーデル本体の形式ではない。edlprt の解析資料による）:
//   - 複数ページ: "EDEL..." のヘッダ行がページの始まり
//   - 両面: 大きさ 4/5/6 は裏面の 1/2/3（表から見た座標）

import { PROFILES } from '../profiles.js'

const G = PROFILES.esa721.grid
export const EDL_UNIT_X = G.dx
export const EDL_UNIT_Y = G.dy
export const EDL_MAX = 31 * 26 + 25 // 2文字で表せる最大（上位 '_' まで）
export const EDL_AREAS = { B5: { x: 479, y: 726 }, A4: { x: 599, y: 790 } }

const KIND_TO_SIZE = { 1: 'S', 2: 'M', 3: 'L' }
export const SIZE_TO_KIND = { S: '1', M: '2', L: '3' }

const dec2 = (s, i) => (s.charCodeAt(i) - 64) * 26 + (s.charCodeAt(i + 1) - 64)
const enc2 = n => String.fromCharCode(64 + Math.floor(n / 26)) + String.fromCharCode(64 + (n % 26))

export function isEDL (text) { return /^EDEL/.test(text) }

/**
 * .edl の文字列を読む（複数ページの拡張にも対応）。
 * 戻り値: { pages: [{ paper, header, dots: [{x, y, size, side, ux, uy, kind}] }] }
 * 互換のため、1ページ目の paper / dots も上に置く。
 */
export function parseEDL (text) {
  const lines = String(text).replace(/\x1a/g, '').split(/\r?\n/)
  if (!isEDL(lines[0] || '')) throw new Error('エーデルの点図ファイル（.edl）ではないようです。')
  const pages = []
  let page = null
  for (const ln of lines) {
    if (!ln) continue
    if (isEDL(ln)) {
      page = { header: ln, paper: ln.slice(4).split(',')[0] || 'B5', dots: [] }
      pages.push(page)
      continue
    }
    let k = +ln[0]
    if (!(k >= 1 && k <= 6)) continue
    const side = k >= 4 ? 'back' : 'front'
    if (k >= 4) k -= 3
    for (let i = 1; i + 3 < ln.length; i += 4) {
      const ux = dec2(ln, i); const uy = dec2(ln, i + 2)
      page.dots.push({ x: ux * EDL_UNIT_X, y: uy * EDL_UNIT_Y, size: KIND_TO_SIZE[k], side, ux, uy, kind: String(k) })
    }
  }
  return { pages, paper: pages[0].paper, dots: pages[0].dots }
}

/**
 * 点の並びを1ページ分の .edl にする。
 * dots: [{x, y, size, side?}]（mm、または ux/uy 目盛り）。opts: { paper: 'B5'|'A4', area: {x, y} }
 * 戻り値: { text, warnings, count }
 */
export function writeEDL (dots, opts = {}) {
  const paper = opts.paper || 'B5'
  const area = opts.area || EDL_AREAS[paper] || EDL_AREAS.B5
  const warnings = []
  const seen = new Set(); const pts = []
  let clipped = 0; let back = 0
  for (const d of dots) {
    const ux = d.ux != null ? d.ux : Math.round(d.x / EDL_UNIT_X)
    const uy = d.uy != null ? d.uy : Math.round(d.y / EDL_UNIT_Y)
    if (ux < 0 || uy < 0 || ux > area.x || uy > area.y) { clipped++; continue }
    let kind = +(SIZE_TO_KIND[d.size] || '2')
    if (d.side === 'back') { kind += 3; back++ }
    const key = ux + ',' + uy + ',' + (kind > 3 ? 'b' : 'f')
    if (seen.has(key)) continue
    seen.add(key)
    pts.push({ ux, uy, kind: String(kind) })
  }
  if (clipped) warnings.push(`用紙（${paper}）の点を打てる範囲の外にある点 ${clipped} 個を省きました。`)
  if (back) warnings.push(`裏面の点 ${back} 個を両面用の拡張形式（大きさ 4～6）で書きました。エーデル本体では開けない可能性があります。`)
  if (!pts.length) throw new Error('書き出す点がありません。')
  pts.sort((a, b) => a.uy - b.uy || a.ux - b.ux)
  const out = [`EDEL${paper},${pts[0].uy},${pts[pts.length - 1].uy}`]
  let line = ''; let kind = null
  for (const p of pts) {
    if (p.kind !== kind) { if (line) out.push(line); kind = p.kind; line = kind }
    line += enc2(p.ux) + enc2(p.uy)
  }
  if (line) out.push(line)
  return { text: out.join('\r\n'), warnings, count: pts.length }
}

/** 複数ページ（拡張）。pages: [{ dots, paper, area }] */
export function writeEDLPages (pages) {
  const parts = pages.map(p => writeEDL(p.dots, p))
  return { text: parts.map(p => p.text).join('\r\n'), warnings: [...new Set(parts.flatMap(p => p.warnings))], count: parts.reduce((a, p) => a + p.count, 0) }
}

// バイト列 ⇔ 文字列（.edl は ASCII のみ）
export const bytesToLatin1 = u8 => { let s = ''; for (let i = 0; i < u8.length; i++) s += String.fromCharCode(u8[i]); return s }
export const latin1ToBytes = s => Uint8Array.from(s, c => c.charCodeAt(0) & 0xff)
