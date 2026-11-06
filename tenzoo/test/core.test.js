// 実行: cd tenzoo && node --test test/
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { kanaToBraille, brailleToKana, bitsToUnicode, dotsToBits } from '../js/braille.js'
import { parseEDL, writeEDL, writeEDLPages, EDL_UNIT_X, EDL_UNIT_Y } from '../js/io/edl.js'
import { parseEZI, elementDots, arcGeometry, eziToObjects, objectsToEZI, parseSEBK, writeSEBK, combineEdlEzi, EMPTY_FUMI } from '../js/io/ezi.js'
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
  // 解析資料の例：NMAG → x=377, y=33
  const src = 'EDELB5,33,46\r\n2NMAGASAM\r\n1ADATAJAT\r\n3LHAT'
  const e = parseEDL(src)
  assert.equal(e.paper, 'B5')
  assert.equal(e.dots.length, 5)
  assert.deepEqual(e.dots[0], { x: 377 * EDL_UNIT_X, y: 33 * EDL_UNIT_Y, size: 'M', side: 'front', ux: 377, uy: 33, kind: '2' })
  assert.equal(e.dots[2].size, 'S') // 1 = 小
  assert.equal(e.dots[4].size, 'L') // 3 = 大
  // mm の座標だけから書き戻しても同じになる（最後の行のあとに改行はない）
  const { text } = writeEDL(e.dots.map(d => ({ x: d.x, y: d.y, size: d.size })))
  assert.equal(text, src)
})

test('エーデル：1目盛りは ESA721 の1ステップ（1マス=15、1行=33）', () => {
  assert.ok(Math.abs(15 * EDL_UNIT_X - 5.181) < 0.001)
  assert.ok(Math.abs(33 * EDL_UNIT_Y - 10.4775) < 0.001)
})

test('エーデル：A4 の上位文字・複数ページ・両面の拡張', () => {
  // y=743 = 28*26+15 → 上位 '\'
  const e = parseEDL('EDELA4,743,743\r\n2@K\\O')
  assert.equal(e.paper, 'A4')
  assert.equal(e.dots[0].uy, 743)
  const w = writeEDL([{ ux: 11, uy: 743, size: 'M' }], { paper: 'A4' })
  assert.equal(w.text, 'EDELA4,743,743\r\n2@K\\O')
  // B5 の範囲（x ≦ 479）を超える点は省く
  assert.equal(writeEDL([{ ux: 480, uy: 10, size: 'M' }, { ux: 479, uy: 10, size: 'M' }]).count, 1)
  // 複数ページ
  const m = parseEDL('EDELB5,1,1\r\n2@A@A\r\nEDELB5,2,2\r\n1@B@B')
  assert.equal(m.pages.length, 2)
  assert.equal(m.pages[1].dots[0].size, 'S')
  const mp = writeEDLPages([{ dots: [{ ux: 1, uy: 1, size: 'M' }] }, { dots: [{ ux: 2, uy: 2, size: 'S' }] }])
  assert.equal(mp.text, 'EDELB5,1,1\r\n2@A@A\r\nEDELB5,2,2\r\n1@B@B')
  // 両面：4～6 は裏面の 1～3
  const d = parseEDL('EDELB5,5,5\r\n5@E@E')
  assert.deepEqual([d.dots[0].side, d.dots[0].size], ['back', 'M'])
  assert.equal(writeEDL([{ ux: 5, uy: 5, size: 'M', side: 'back' }]).text, 'EDELB5,5,5\r\n5@E@E')
})

test('エーデル：並べ替え・重複除去・範囲外', () => {
  const dots = [
    { x: 10, y: 20, size: 'S' }, { x: 2, y: 20, size: 'S' }, { x: 2, y: 20, size: 'S' },
    { x: 5, y: 1, size: 'L' }, { x: 999, y: 1, size: 'M' }
  ]
  const { text, warnings } = writeEDL(dots)
  const lines = text.split('\r\n')
  assert.match(lines[0], /^EDELB5,3,63$/)
  assert.equal(lines.length, 3)
  assert.equal(lines[1][0], '3')
  assert.equal(lines[2][0], '1')
  assert.equal((lines[2].length - 1) / 4, 2)
  assert.equal(warnings.length, 1)
  assert.throws(() => parseEDL('hello'))
})

test('.ezi：線分と円弧の点の置き方', () => {
  const els = parseEZI('2\r\n101 2 7 307 63 377 33 0 0 0 0 \r\n102 1 6 100 100 160 100 130 80 0 0 \r\n')
  assert.equal(els.length, 2)
  // 長さ 76.2、間隔 7 → n = 11 等分、12 点（両端を含む）
  const d = elementDots(els[0])
  assert.equal(d.length, 12)
  assert.deepEqual(d[0], [307, 63]); assert.deepEqual(d[11], [377, 33])
  // 円弧：弦 60、ふくらみ h=20 → 半径 (900+400)/40 = 32.5。すべての点が円上
  const g = arcGeometry(...els[1].pts)
  assert.ok(Math.abs(g.R - 32.5) < 1e-9)
  for (const [x, y] of elementDots(els[1])) assert.ok(Math.abs(Math.hypot(x - g.ox, y - g.oy) - g.R) <= 1)
  const ad = elementDots(els[1])
  assert.deepEqual(ad[0], [100, 100]); assert.deepEqual(ad[ad.length - 1], [160, 100])
  assert.ok(ad.some(([x, y]) => Math.hypot(x - 130, y - 80) <= 3.5), '頂点の近くを通る（点の間隔 6 の半分ほど）')
  assert.ok(ad.every(([, y]) => y <= 100), '弦より上にふくらむ')
})

test('.ezi：図形にして書き戻す・tenzoo の点がエーデルの点と一致', () => {
  const src = '3\r\n101 2 7 10 10 80 10 0 0 0 0 \r\n101 2 7 80 10 80 60 0 0 0 0 \r\n102 3 5 100 100 160 100 130 80 0 0 \r\n'
  const els = parseEZI(src)
  const objs = eziToObjects(els)
  assert.equal(objs.length, 2) // つながる線分は折れ線1本に
  assert.equal(objs[0].object.points.length, 3)
  assert.equal(objs[1].object.type, 'arc')
  const doc = newDocument()
  // raster の点（mm）が .ezi から求めた目盛りの点と一致する
  const want = new Set([...elementDots(els[0]), ...elementDots(els[1])].map(([x, y]) => x + ',' + y))
  const got = objectDots(objs[0].object, doc).map(d => Math.round(d.x / EDL_UNIT_X) + ',' + Math.round(d.y / EDL_UNIT_Y))
  assert.deepEqual(new Set(got), want)
  assert.ok(objs[1].object.style.dot === 'L')
  const back = objectsToEZI(objs.map(o => o.object))
  assert.equal(back.text, src)
})

test('.sebk：入れ物の読み書きと .edl との組み合わせ', () => {
  const ezi = '1\r\n101 2 7 10 10 80 10 0 0 0 0 \r\n'
  const lineDots = elementDots(parseEZI(ezi)[0]).map(([ux, uy]) => ({ ux, uy, size: 'M' }))
  // .edl：線の点 + 手で打った大点 1 個
  const edl = writeEDL([...lineDots, { ux: 200, uy: 200, size: 'L' }]).text
  const sebk = writeSEBK(edl, ezi)
  assert.ok(sebk.startsWith(`Zu_1.edl,${edl.length} EDEL`))
  assert.equal(EMPTY_FUMI.length, 810)
  const entries = parseSEBK(sebk)
  assert.equal(entries[0].body, edl)
  assert.equal(entries[1].body, ezi)
  const c = combineEdlEzi(entries[0].body, entries[1].body)
  assert.equal(c.stats.shown, 1)
  assert.equal(c.stats.restDots, 1) // 手で打った点だけが点のレイヤに
  assert.equal(c.layers.length, 2)
  // .edl に無い線は隠したレイヤへ
  const c2 = combineEdlEzi(writeEDL([{ ux: 300, uy: 300, size: 'L' }]).text, ezi)
  assert.equal(c2.stats.hidden, 1)
  assert.equal(c2.layers.find(l => !l.visible).objects.length, 1)
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

test('ESA721 送信用データ：edlprt と同じバイト列', async () => {
  const { encodeESA, aspectX } = await import('../js/io/esa.js')
  // edl の (x=377, y=33) 中点 → ESC ESC G, ESC ESC D 1, YHI YLO XHI XLO, CR FF ESC ESC D 1
  const { bytes } = encodeESA([[{ ux: 377, uy: 33, k: 2 }]])
  const want = [27, 27, 71, 27, 27, 68, 49, 377 / 32 + 32 | 0, 377 % 32 + 96, 33 / 32 + 32 | 0, 33 % 32 + 64, 13, 12, 27, 27, 68, 49]
  assert.deepEqual([...bytes], want)
  assert.equal(aspectX(100, 100), Math.floor(100 * 1.0571 + 0.5) + 3)
  // 点種別印刷：中 → 小 → 大、各回の前に GS
  const bs = encodeESA([[{ ux: 1, uy: 50, k: 3 }, { ux: 2, uy: 40, k: 1 }, { ux: 3, uy: 30, k: 2 }]], { bySize: true }).bytes
  assert.equal([...bs].filter(b => b === 0x1d).length, 3)
  const sizes = []; for (let i = 0; i + 3 < bs.length; i++) if (bs[i] === 27 && bs[i + 1] === 27 && bs[i + 2] === 68) sizes.push(bs[i + 3])
  assert.deepEqual(sizes.slice(0, 3), [49, 48, 50])
})

test('.edl：同じ座標の点は大きい方を残す・B5 は 684 行まで', () => {
  const w = writeEDL([{ ux: 5, uy: 5, size: 'S' }, { ux: 5, uy: 5, size: 'L' }, { ux: 5, uy: 700, size: 'M' }])
  assert.equal(w.text, 'EDELB5,5,5\r\n3@E@E')
  assert.equal(w.warnings.length, 1)
  assert.equal(writeEDL([{ ux: 5, uy: 700, size: 'M' }], { area: { x: 479, y: 725 } }).count, 1)
})

test('記号・周りの点を消す余白・二重線', async () => {
  const { markerDots } = await import('../js/model.js')
  const doc = newDocument()
  const m = { id: 'm', type: 'marker', x: 50, y: 50, shape: 'cross', style: { ...defaultStyle(), dot: 'L', clear: 3 } }
  assert.equal(markerDots(m).length, 5)
  const line = { id: 'l', type: 'path', closed: false, points: [[30, 50], [70, 50]], style: defaultStyle() }
  doc.layers[0].objects.push(line, m)
  const near = d => d.obj === 'l' && Math.abs(d.x - 50) < 5
  assert.ok(documentDots(doc, { merge: false, clear: false }).some(near))
  assert.ok(!documentDots(doc, { merge: false }).some(near), '記号の余白の中の線の点は消える')
  const dbl = objectDots({ id: 'd', type: 'path', closed: false, points: [[0, 10], [20, 10]], style: { ...defaultStyle(), line: 'double', width: 3 } }, doc)
  assert.ok(dbl.some(d => Math.abs(d.y - 8.5) < 1e-6) && dbl.some(d => Math.abs(d.y - 11.5) < 1e-6))
})

test('点図の検査', async () => {
  const { checkDocument } = await import('../js/check.js')
  const doc = newDocument()
  doc.layers[0].objects.push(
    { id: 'b', type: 'braille', x: 20, y: 20, text: 'あ', style: defaultStyle() },
    { id: 'l', type: 'path', closed: false, points: [[15, 21], [40, 21]], style: defaultStyle() },
    { id: 'o', type: 'dots', points: [[195, 250, 'M']], style: defaultStyle() }
  )
  const r = checkDocument(doc)
  const kinds = r.items.map(i => i.kind)
  assert.ok(kinds.includes('braille'))
  assert.ok(kinds.includes('outside'))
  assert.ok(kinds.includes('close'))
})

// edlprt の実物ファイルがある場合だけ（EDLPRT_EXAMPLES に examples のパス）
test('実物：edlprt の .edl・.sebk・.ezi', { skip: !process.env.EDLPRT_EXAMPLES }, async () => {
  const fs = await import('node:fs')
  const X = process.env.EDLPRT_EXAMPLES + '/'
  const rd = f => [...fs.readFileSync(X + f)].map(c => String.fromCharCode(c)).join('')
  for (const f of fs.readdirSync(X).filter(n => n.endsWith('.edl'))) {
    const t = rd(f); const e = parseEDL(t)
    if (e.pages.length > 1 || e.dots.some(d => d.side === 'back')) continue
    assert.equal(writeEDL(e.dots.map(d => ({ ux: d.ux, uy: d.uy, size: d.size })), { paper: e.paper, area: { x: 9999, y: 9999 } }).text, t, f)
  }
  for (const f of ['zu1.sebk', 'map.sebk']) {
    const t = rd(f); const en = parseSEBK(t)
    assert.equal(writeSEBK(en[0].body, en[1].body, en[0].name.replace(/\.edl$/, '')), t, f)
    const c = combineEdlEzi(en[0].body, en[1].body)
    assert.ok(c.stats.shown > 20)
  }
})
