// エーデル（EDEL）の点図ファイル .edl の読み書き
//
// 形式（実物のファイルの解析による。公開仕様はない）:
//   1行目  "EDEL" + 用紙名 + "," + 最小のy + "," + 最大のy     例: EDELB5,39,677
//   2行目～ 「点の種類（1桁）」＋「点の座標（x 2文字, y 2文字）」の繰り返し
//   座標は 2 文字の 26 進数（'@'=0, 'A'=1, … 'Z'=26）で、値 = (c1-64)*26 + (c2-64)
//   点は y の小さい順、同じ y では x の小さい順に並び、点の種類が変わるところで行を変える
//   行末は CRLF。末尾に EOF(0x1A) が付くことがある
//   点の種類: '2'=大点（点字の点）, '1'=中点, '3'=小点
//   1目盛りは x が約 0.4mm、y が約 0.343mm（= 2.4/7 mm）と推定される
//
// この解析結果は tenji-editor（MIT License, https://github.com/setsukashiraishi-hub/tenji-editor）
// による実物ファイル 109 点の解析を参考にしている。

import { PROFILES } from '../profiles.js'

const G = PROFILES.esa721.grid
export const EDL_UNIT_X = G.dx
export const EDL_UNIT_Y = G.dy
export const EDL_MAX = 701

const KIND_TO_SIZE = { 1: 'M', 2: 'L', 3: 'S', 4: 'L' }
const SIZE_TO_KIND = { M: '1', L: '2', S: '3' }

const dec2 = (s, i) => (s.charCodeAt(i) - 64) * 26 + (s.charCodeAt(i + 1) - 64)
const enc2 = n => String.fromCharCode(64 + Math.floor(n / 26)) + String.fromCharCode(64 + (n % 26))

export function isEDL (text) { return /^EDEL/.test(text) }

/**
 * .edl の文字列を読む。
 * 戻り値: { paper, dots: [{x, y, size, ux, uy, kind}], header }
 */
export function parseEDL (text) {
  const lines = String(text).replace(/\x1a/g, '').split(/\r?\n/)
  const header = lines[0] || ''
  if (!isEDL(header)) throw new Error('エーデルの点図ファイル（.edl）ではないようです。')
  const paper = header.slice(4).split(',')[0] || 'B5'
  const dots = []
  for (const ln of lines.slice(1)) {
    if (!ln) continue
    const kind = ln[0]
    for (let i = 1; i + 3 < ln.length; i += 4) {
      const ux = dec2(ln, i); const uy = dec2(ln, i + 2)
      dots.push({ x: ux * EDL_UNIT_X, y: uy * EDL_UNIT_Y, size: KIND_TO_SIZE[kind] || 'M', ux, uy, kind })
    }
  }
  return { paper, dots, header }
}

/**
 * 点の並びを .edl の文字列にする。
 * dots: [{x, y, size}]（mm）。opts: { paper: 'B5' }
 * 戻り値: { text, warnings }
 */
export function writeEDL (dots, opts = {}) {
  const warnings = []
  const seen = new Set(); const pts = []
  let clipped = 0
  for (const d of dots) {
    const ux = d.ux != null ? d.ux : Math.round(d.x / EDL_UNIT_X)
    const uy = d.uy != null ? d.uy : Math.round(d.y / EDL_UNIT_Y)
    if (ux < 0 || uy < 0 || ux > EDL_MAX || uy > EDL_MAX) { clipped++; continue }
    const k = ux + ',' + uy
    if (seen.has(k)) continue
    seen.add(k)
    pts.push({ ux, uy, kind: d.kind && /^[1-4]$/.test(d.kind) ? d.kind : (SIZE_TO_KIND[d.size] || '1') })
  }
  if (clipped) warnings.push(`エーデルの座標範囲（約 ${(EDL_MAX * EDL_UNIT_X).toFixed(0)}×${(EDL_MAX * EDL_UNIT_Y).toFixed(0)}mm）の外にある点 ${clipped} 個を省きました。`)
  if (!pts.length) throw new Error('書き出す点がありません。')
  pts.sort((a, b) => a.uy - b.uy || a.ux - b.ux)
  const out = [`EDEL${opts.paper || 'B5'},${pts[0].uy},${pts[pts.length - 1].uy}`]
  let line = ''; let kind = null
  for (const p of pts) {
    if (p.kind !== kind) { if (line) out.push(line); kind = p.kind; line = kind }
    line += enc2(p.ux) + enc2(p.uy)
  }
  if (line) out.push(line)
  return { text: out.join('\r\n'), warnings }
}

// バイト列 ⇔ 文字列（.edl は ASCII のみ）
export const bytesToLatin1 = u8 => { let s = ''; for (let i = 0; i < u8.length; i++) s += String.fromCharCode(u8[i]); return s }
export const latin1ToBytes = s => Uint8Array.from(s, c => c.charCodeAt(0) & 0xff)
