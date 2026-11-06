// 実行: cd tenzoo && node --test test/
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { kanaToBraille, brailleToKana, bitsToUnicode, dotsToBits } from '../js/braille.js'
import { parseEDL, writeEDL, EDL_UNIT_X, EDL_UNIT_Y } from '../js/io/edl.js'
import { samplePolyline, pointInRings, mergeClose, dashPolyline, mRotate, apply } from '../js/geometry.js'
import { PATTERN_IDS, generatePattern } from '../js/patterns.js'
import { newDocument, transformObject, outlineOf, maskFromGrid, maskContains, maskOutline, normalizeDocument, defaultStyle, defaultFill } from '../js/model.js'
import { objectDots, documentDots } from '../js/raster.js'
import { parsePathD, parseTransform, imageToDots } from '../js/io/import.js'
import { dotsToSVG, dotsToPDF, serializeDocument } from '../js/io/export.js'

const uni = s => kanaToBraille(s).cells.map(c => c === -1 ? '\n' : bitsToUnicode(c)).join('')

test('点字：清音・濁音・拗音・数字・英字', () => {
  assert.equal(uni('あいうえお'), '⠁⠃⠉⠋⠊')
  assert.equal(uni('かさたなはまらやわ'), '⠡⠱⠕⠅⠥⠵⠑⠌⠄')
  assert.equal(uni('が'), '⠐⠡')
  assert.equal(uni('ぱ'), '⠠⠥')
  assert.equal(uni('きょう'), '⠈⠪⠉')
  assert.equal(uni('ぎゃ'), '⠘⠡')
  assert.equal(uni('ぴゅ'), '⠨⠭')
  assert.equal(uni('がっこう'), '⠐⠡⠂⠪⠉')
  assert.equal(uni('ラーメン'), '⠑⠒⠿⠴')
  assert.equal(uni('123'), '⠼⠁⠃⠉')
  assert.equal(uni('1えん'), '⠼⠁⠤⠋⠴') // つなぎ符
  assert.equal(uni('abc'), '⠰⠁⠃⠉')
  assert.equal(uni('A'), '⠰⠠⠁')
  assert.equal(uni('ティー'), '⠈⠗⠒')
  assert.equal(uni('ファ'), '⠢⠥')
  assert.equal(uni('ディ'), '⠘⠗')
  assert.equal(uni('ウィ'), '⠢⠃')
  assert.equal(uni('あ い'), '⠁⠀⠃')
  assert.deepEqual(kanaToBraille('漢字').unknown, ['漢', '字'])
  assert.equal(uni('⠿⠁'), '⠿⠁')
})

test('点字：簡易逆変換', () => {
  assert.equal(brailleToKana(kanaToBraille('きょうは がっこう').cells), 'きょうは がっこう')
  assert.equal(dotsToBits('123456'), 63)
})

test('エーデル：読み書きで同じ文字列に戻る', () => {
  const src = 'EDELB5,39,46\r\n2ASAMBWAMCLAM\r\n1ADATAJAT'
  // 各行の座標は4文字単位。2行目は3点、3行目は2点
  const e = parseEDL(src.replace('2ASAMBWAMCLAM', '2ASAMBWAMCLAM'))
  assert.equal(e.paper, 'B5')
  assert.equal(e.dots.length, 5)
  assert.deepEqual(e.dots[0], { x: 45 * EDL_UNIT_X, y: 39 * EDL_UNIT_Y, size: 'L', ux: 45, uy: 39, kind: '2' })
  // mm の座標だけから書き戻しても同じになる
  const { text } = writeEDL(e.dots.map(d => ({ x: d.x, y: d.y, size: d.size })))
  assert.equal(text, src)
})

test('エーデル：並べ替え・重複除去・範囲外', () => {
  const dots = [
    { x: 10, y: 20, size: 'S' }, { x: 2, y: 20, size: 'S' }, { x: 2, y: 20, size: 'S' },
    { x: 5, y: 1, size: 'L' }, { x: 999, y: 1, size: 'M' }
  ]
  const { text, warnings } = writeEDL(dots)
  const lines = text.split('\r\n')
  assert.match(lines[0], /^EDELB5,3,58$/)
  assert.equal(lines.length, 3)
  assert.equal(lines[1][0], '2')
  assert.equal(lines[2][0], '3')
  assert.equal((lines[2].length - 1) / 4, 2)
  assert.equal(warnings.length, 1)
  assert.throws(() => parseEDL('hello'))
})

test('幾何：角を残して線に点を置く', () => {
  const pts = samplePolyline([[0, 0], [10, 0], [10, 10]], 2)
  assert.ok(pts.some(p => Math.hypot(p[0] - 10, p[1]) < 1e-9), '角に点がある')
  assert.equal(pts.length, 11)
  const ring = samplePolyline([[0, 0], [10, 0], [10, 10], [0, 10]], 2.5, { closed: true })
  assert.equal(ring.length, 16)
  assert.ok(pointInRings([5, 5], [[[0, 0], [10, 0], [10, 10], [0, 10]]]))
  assert.ok(!pointInRings([5, 5], [[[0, 0], [10, 0], [10, 10], [0, 10]], [[3, 3], [7, 3], [7, 7], [3, 7]]]), '穴の中は外')
  const merged = mergeClose([{ x: 0, y: 0, size: 'L' }, { x: 0.5, y: 0, size: 'S' }, { x: 3, y: 0, size: 'S' }], 1)
  assert.equal(merged.length, 2)
  assert.equal(merged[0].size, 'L')
  assert.equal(dashPolyline([[0, 0], [20, 0]], 3, 2).length, 4)
})

test('面の表現：すべてのパターンが点を返し、領域内で絞られる', () => {
  const doc = newDocument()
  for (const id of PATTERN_IDS) {
    const pts = generatePattern(id, { minX: 0, minY: 0, maxX: 30, maxY: 30 }, { spacing: 3, pitch: 1.5, angle: 15, seed: 1 })
    assert.ok(pts.length > 10, id)
    const o = { id: 'x', type: 'rect', x: 0, y: 0, w: 30, h: 30, style: { ...defaultStyle(), stroke: false, fill: { ...defaultFill(), pattern: id } } }
    const dots = objectDots(o, doc)
    assert.ok(dots.length > 5, id)
    assert.ok(dots.every(d => d.x >= 0 && d.x <= 30 && d.y >= 0 && d.y <= 30), id + ' は範囲内')
  }
})

test('塗り：輪郭からの余白', () => {
  const doc = newDocument()
  const o = { id: 'r', type: 'rect', x: 0, y: 0, w: 20, h: 20, style: { ...defaultStyle(), stroke: true, fill: { ...defaultFill(), pattern: 'grid', spacing: 1, inset: 3 } } }
  const dots = objectDots(o, doc).filter(d => d.size === 'S')
  assert.ok(dots.length > 0)
  assert.ok(dots.every(d => d.x >= 3 - 1e-9 && d.x <= 17 + 1e-9 && d.y >= 3 - 1e-9 && d.y <= 17 + 1e-9))
})

test('変換：回転・拡大で図形の種類を保つ', () => {
  const r = { id: 'a', type: 'rect', x: 0, y: 0, w: 10, h: 4, rot: 0, style: defaultStyle() }
  const rr = transformObject(r, mRotate(Math.PI / 2, 5, 2))
  assert.equal(rr.type, 'rect')
  assert.ok(Math.abs(rr.rot - Math.PI / 2) < 1e-9)
  const before = outlineOf(r).paths[0].map(p => apply(mRotate(Math.PI / 2, 5, 2), p))
  const after = outlineOf(rr).paths[0]
  for (const p of before) assert.ok(after.some(q => Math.hypot(p[0] - q[0], p[1] - q[1]) < 1e-6))
  // 回転した長方形を縦横別に拡大すると折れ線になる
  const sk = transformObject({ ...r, rot: 0.3 }, [2, 0, 0, 1, 0, 0])
  assert.equal(sk.type, 'path')
  const e = transformObject({ id: 'e', type: 'ellipse', cx: 0, cy: 0, rx: 5, ry: 2, rot: 0, style: defaultStyle() }, [2, 0, 0, 3, 1, 1])
  assert.deepEqual([e.cx, e.cy, e.rx, e.ry], [1, 1, 10, 6])
})

test('マスク（塗りつぶし領域）', () => {
  const g = new Uint8Array(16)
  for (const k of [5, 6, 9, 10]) g[k] = 1
  const m = maskFromGrid(g, 4, 4, 0, 0, 1)
  assert.ok(maskContains(m, [1.5, 1.5]))
  assert.ok(!maskContains(m, [0.5, 0.5]))
  const rings = maskOutline(m)
  assert.equal(rings.length, 1)
  assert.equal(rings[0].length, 4)
})

test('文書：レイヤごと・格子合わせ・近い点のまとめ', () => {
  const doc = newDocument()
  doc.layers[0].objects.push({ id: 'd', type: 'dots', points: [[10, 10, 'L'], [10.3, 10, 'S'], [20, 10, 'M']], style: defaultStyle() })
  const all = documentDots(doc, { snap: false, merge: false })
  assert.equal(all.length, 3)
  const merged = documentDots(doc)
  assert.equal(merged.length, 2)
  assert.ok(merged.some(d => d.size === 'L'))
  for (const d of documentDots(doc, { merge: false })) {
    assert.ok(Math.abs(d.x / EDL_UNIT_X - Math.round(d.x / EDL_UNIT_X)) < 1e-6)
  }
  doc.layers[0].visible = false
  assert.equal(documentDots(doc).length, 0)
})

test('tenzoo 形式：保存して読み戻せる', () => {
  const doc = newDocument('A4')
  doc.layers[0].objects.push({ id: 'b', type: 'braille', x: 10, y: 10, text: 'てんず', style: defaultStyle() })
  const back = normalizeDocument(JSON.parse(serializeDocument(doc)))
  assert.equal(back.page.width, 210)
  assert.equal(back.layers[0].objects[0].text, 'てんず')
  assert.throws(() => normalizeDocument({ format: 'other' }))
})

test('SVG のパスと変換の解析', () => {
  const subs = parsePathD('M10 10 h 20 v 20 H 10 Z M 50 50 c 10 0 10 10 0 10 a 5 5 0 0 1 10 0')
  assert.equal(subs.length, 2)
  assert.equal(subs[0].closed, true)
  assert.deepEqual(subs[0].points.slice(0, 4), [[10, 10], [30, 10], [30, 30], [10, 30]])
  const last = subs[1].points[subs[1].points.length - 1]
  assert.ok(Math.hypot(last[0] - 60, last[1] - 60) < 1e-6)
  const m = parseTransform('translate(10 20) scale(2)')
  assert.deepEqual(apply(m, [1, 1]), [12, 22])
})

test('画像から点（自動点図化）', () => {
  const w = 20; const h = 20
  const data = new Uint8ClampedArray(w * h * 4).fill(255)
  for (let y = 5; y < 15; y++) for (let x = 5; x < 15; x++) { const k = (y * w + x) * 4; data[k] = data[k + 1] = data[k + 2] = 0 }
  const img = { width: w, height: h, data }
  const fill = imageToDots(img, { x: 0, y: 0, w: 20, h: 20 }, { mode: 'fill', spacing: 1 })
  const edge = imageToDots(img, { x: 0, y: 0, w: 20, h: 20 }, { mode: 'edge', spacing: 1 })
  assert.equal(fill.length, 100)
  assert.equal(edge.length, 36)
})

test('書き出し：SVG と PDF', () => {
  const dots = [{ x: 10, y: 10, size: 'L' }, { x: 20, y: 10, size: 'S' }]
  const svg = dotsToSVG(dots, { width: 182, height: 257 })
  assert.match(svg, /width="182mm"/)
  assert.equal((svg.match(/<circle/g) || []).length, 2)
  const pdf = new TextDecoder().decode(dotsToPDF([{ dots, page: { width: 182, height: 257 } }]))
  assert.match(pdf, /^%PDF-1\.4/)
  assert.match(pdf, /%%EOF\n$/)
  // xref の位置が正しいこと
  const sx = +pdf.match(/startxref\n(\d+)/)[1]
  assert.equal(pdf.slice(sx, sx + 4), 'xref')
})
