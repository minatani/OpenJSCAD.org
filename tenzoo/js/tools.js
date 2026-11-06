// 道具（マウス・ペン・タッチの操作）
import {
  state, commit, notify, addObject, replaceObject, selectedObjects, transformSelection
} from './store.js'
import {
  canvas, toDoc, toScreen, requestRender, overlay, zoomTo, selectionScreenBox, handles,
  strokePath, drawDots, bumpVersion
} from './view.js'
import { hitTest, outlineOf, maskFromGrid, defaultStyle, activeLayer, transformObject } from './model.js'
import { simplify, mTranslate, mScale, mRotate, dist } from './geometry.js'
import { objectDots } from './raster.js'
import { snapToGrid, getProfile } from './profiles.js'
import { typeName, describeObject, describeAt } from './a11y.js'

let ui = null // app.js から渡される UI の関数（点字の入力ダイアログなど）
export function initTools (uiApi) { ui = uiApi; bindPointer() }

export const TOOL_HINTS = {
  select: 'クリックで選択、ドラッグで移動。四隅で拡大縮小、上の丸で回転。Shift で追加選択。',
  dot: 'クリックで点を打ちます。ドラッグで連続して打てます。矢印キー＋スペースでも打てます。',
  line: 'ドラッグで直線。Shift で 15° ごと。',
  polyline: 'クリックで頂点を追加。ダブルクリックか Enter で終了、始点をクリックで閉じた図形に。',
  curve: 'クリックで通る点を追加。ダブルクリックか Enter で終了、始点をクリックで閉じます。',
  freehand: 'ドラッグで自由に描きます。始点の近くで離すと閉じた図形になります。',
  rect: 'ドラッグで四角形。Shift で正方形。',
  ellipse: 'ドラッグで楕円。Shift で正円。',
  fillrect: 'ドラッグした四角の範囲を、選んだ面の表現で塗ります。',
  fillellipse: 'ドラッグした楕円の範囲を塗ります。',
  filllasso: '囲むようにドラッグした範囲を塗ります。',
  fillpoly: 'クリックで範囲の頂点を置き、ダブルクリックか Enter で塗ります。',
  bucket: '線で囲まれた所をクリックすると、その内側を塗ります。',
  arc: '始点・終点・ふくらみの位置の順に3回クリックすると円弧になります。',
  braille: '点字を置きたい場所をクリックします。既存の点字をクリックすると編集します。',
  eraser: 'ドラッグで点を消します（図形は点に変換してから消します）。',
  pan: 'ドラッグで表示を動かします。ピンチ・ホイールで拡大縮小。'
}

const tol = () => 6 / state.view.zoom // 当たり判定の幅（画面で 6px）

function snapPt (p) {
  if (state.snapGrid) {
    const g = state.gridSize
    return [Math.round(p[0] / g) * g, Math.round(p[1] / g) * g]
  }
  return p
}
function angleSnap (a, b) {
  const ang = Math.atan2(b[1] - a[1], b[0] - a[0])
  const st = Math.PI / 12
  const s = Math.round(ang / st) * st
  const L = dist(a, b)
  return [a[0] + L * Math.cos(s), a[1] + L * Math.sin(s)]
}

// 新しい図形のスタイル
function drawStyle () { return structuredClone(state.drawStyle) }
function fillShapeStyle () {
  return { ...structuredClone(state.drawStyle), stroke: state.fillOutline, fill: structuredClone(state.fillStyle) }
}

function hitObject (p) {
  const layers = [...state.doc.layers].reverse()
  // 作業中のレイヤを優先
  const act = activeLayer(state.doc)
  layers.sort((a, b) => (b === act) - (a === act))
  for (const l of layers) {
    if (!l.visible || l.locked) continue
    for (let i = l.objects.length - 1; i >= 0; i--) {
      if (hitTest(l.objects[i], p, tol(), state.doc)) return { layer: l, object: l.objects[i] }
    }
  }
  return null
}

// ---- 各道具の振る舞い
let drag = null // ドラッグ中の情報
let poly = null // 折れ線・曲線の描きかけ
let kbAnchor = null // キーボードで置いた始点（直線・四角・円など）

function preview (o) {
  // 描きかけの図形を点で見せる
  overlay.draw = (c) => {
    try {
      const dots = objectDots({ ...o, id: '_' }, state.doc)
      drawDots(c, dots)
      if (o.type !== 'dots') {
        const { paths, closed } = outlineOf(o)
        for (const p of paths) strokePath(c, p, closed, 'rgba(37,99,235,.5)', [4, 4])
      }
    } catch (e) { /* 描きかけの不完全な図形は無視 */ }
  }
  requestRender()
}

function finishShape (o) {
  overlay.draw = null
  const obj = addObject(o)
  if (obj) {
    commit()
    if (ui.afterCreate) ui.afterCreate(obj)
    ui.announce(`${typeName(obj)}を追加しました。点 ${objectDots(obj, state.doc).length} 個。`)
  }
  requestRender()
}

function shapeFromDrag (tool, a, b, shift) {
  if (tool === 'line') {
    if (shift) b = angleSnap(a, b)
    return { type: 'path', closed: false, points: [a, b], style: drawStyle() }
  }
  let x = Math.min(a[0], b[0]); let y = Math.min(a[1], b[1])
  let w = Math.abs(b[0] - a[0]); let h = Math.abs(b[1] - a[1])
  if (shift) { const s = Math.max(w, h); w = h = s; x = b[0] < a[0] ? a[0] - s : a[0]; y = b[1] < a[1] ? a[1] - s : a[1] }
  const style = tool.startsWith('fill') ? fillShapeStyle() : drawStyle()
  if (tool === 'rect' || tool === 'fillrect') return { type: 'rect', x, y, w, h, rot: 0, style }
  return { type: 'ellipse', cx: x + w / 2, cy: y + h / 2, rx: w / 2, ry: h / 2, rot: 0, style }
}

const tools = {
  select: {
    down (p, e) {
      const b = selectionScreenBox()
      const [sx, sy] = toScreen(p[0], p[1])
      if (b) {
        const h = handles(b).find(h => Math.abs(h.x - sx) < 9 && Math.abs(h.y - sy) < 9)
        if (h) {
          drag = { mode: h.id === 'rot' ? 'rotate' : 'scale', handle: h.id, start: p, box: b.doc, orig: selectedObjects().map(o => structuredClone(o)) }
          return
        }
      }
      const hit = hitObject(p)
      if (hit) {
        if (e.shiftKey) {
          if (state.selection.has(hit.object.id)) state.selection.delete(hit.object.id)
          else state.selection.add(hit.object.id)
        } else if (!state.selection.has(hit.object.id)) {
          state.selection.clear(); state.selection.add(hit.object.id)
        }
        state.doc.activeLayer = hit.layer.id
        drag = { mode: 'move', start: p, last: p, moved: false }
        notify('selection')
      } else {
        if (!e.shiftKey) state.selection.clear()
        drag = { mode: 'marquee', start: p, cur: p }
        notify('selection')
      }
    },
    move (p, e) {
      if (!drag) return
      if (drag.mode === 'move') {
        let q = p
        if (e.shiftKey) { // 縦横に限定
          const dx = Math.abs(p[0] - drag.start[0]); const dy = Math.abs(p[1] - drag.start[1])
          q = dx > dy ? [p[0], drag.start[1]] : [drag.start[0], p[1]]
        }
        const dx = q[0] - drag.last[0]; const dy = q[1] - drag.last[1]
        if (dx || dy) { transformSelection(mTranslate(dx, dy)); drag.last = q; drag.moved = true; bumpVersion(); notify('transient') }
      } else if (drag.mode === 'marquee') {
        drag.cur = p
        const a = drag.start
        overlay.draw = (c) => strokePath(c, [a, [p[0], a[1]], p, [a[0], p[1]]], true, '#2563eb', [4, 3])
        requestRender()
      } else if (drag.mode === 'scale' || drag.mode === 'rotate') {
        const b = drag.box
        let m
        if (drag.mode === 'rotate') {
          const cx = (b.minX + b.maxX) / 2; const cy = (b.minY + b.maxY) / 2
          let a = Math.atan2(p[1] - cy, p[0] - cx) - Math.atan2(drag.start[1] - cy, drag.start[0] - cx)
          if (e.shiftKey) a = Math.round(a / (Math.PI / 12)) * (Math.PI / 12)
          m = mRotate(a, cx, cy)
        } else {
          const hd = drag.handle
          const ax = hd.includes('w') ? b.maxX : hd.includes('e') ? b.minX : (b.minX + b.maxX) / 2
          const ay = hd.includes('n') ? b.maxY : hd.includes('s') ? b.minY : (b.minY + b.maxY) / 2
          const bw = Math.max(1e-6, b.maxX - b.minX); const bh = Math.max(1e-6, b.maxY - b.minY)
          let sx = hd.includes('e') ? (p[0] - b.minX) / bw : hd.includes('w') ? (b.maxX - p[0]) / bw : 1
          let sy = hd.includes('s') ? (p[1] - b.minY) / bh : hd.includes('n') ? (b.maxY - p[1]) / bh : 1
          if (e.shiftKey || (hd.length === 2 && !e.altKey && state.keepAspect)) { const s = Math.max(Math.abs(sx), Math.abs(sy)); sx = Math.sign(sx || 1) * s; sy = Math.sign(sy || 1) * s }
          if (Math.abs(sx) < 0.02) sx = 0.02 * Math.sign(sx || 1)
          if (Math.abs(sy) < 0.02) sy = 0.02 * Math.sign(sy || 1)
          m = mScale(sx, sy, ax, ay)
        }
        for (const o of drag.orig) replaceObject(o.id, transformObject(o, m))
        bumpVersion(); notify('transient')
      }
    },
    up (p) {
      if (!drag) return
      if (drag.mode === 'marquee') {
        overlay.draw = null
        const a = drag.start; const b = drag.cur
        const x0 = Math.min(a[0], b[0]); const x1 = Math.max(a[0], b[0]); const y0 = Math.min(a[1], b[1]); const y1 = Math.max(a[1], b[1])
        if (x1 - x0 > 0.5 || y1 - y0 > 0.5) {
          for (const l of state.doc.layers) {
            if (!l.visible || l.locked) continue
            for (const o of l.objects) {
              const ob = ui.bboxOf(o)
              if (ob && ob.minX >= x0 && ob.maxX <= x1 && ob.minY >= y0 && ob.maxY <= y1) state.selection.add(o.id)
            }
          }
        }
        notify('selection')
      } else if (drag.mode === 'move') {
        if (drag.moved) commit()
      } else {
        commit()
      }
      drag = null
      requestRender()
    },
    dbl (p) {
      const hit = hitObject(p)
      if (hit && hit.object.type === 'braille') ui.editBraille(hit.object)
    }
  },

  dot: {
    down (p) {
      p = snapPt(p)
      state.cursor = p.slice() // キーボードでの続きはここから
      drag = { pts: [[...p, state.dotSize]], last: p }
      preview({ type: 'dots', points: drag.pts })
    },
    move (p) {
      if (!drag) return
      p = snapPt(p)
      const sp = Math.max(1, +state.drawStyle.spacing || 2)
      while (dist(drag.last, p) >= sp) {
        const L = dist(drag.last, p)
        const q = [drag.last[0] + (p[0] - drag.last[0]) * sp / L, drag.last[1] + (p[1] - drag.last[1]) * sp / L]
        drag.pts.push([...q, state.dotSize]); drag.last = q
      }
      preview({ type: 'dots', points: drag.pts })
    },
    up () {
      if (!drag) return
      finishShape({ type: 'dots', points: drag.pts, style: { ...defaultStyle(), dot: state.dotSize } })
      drag = null
    }
  },

  // 直線・四角・楕円・範囲塗り（四角・楕円）
  ...Object.fromEntries(['line', 'rect', 'ellipse', 'fillrect', 'fillellipse'].map(t => [t, {
    down (p) { drag = { start: snapPt(p) } },
    move (p, e) { if (drag) preview(shapeFromDrag(t, drag.start, snapPt(p), e.shiftKey)) },
    up (p, e) {
      if (!drag) return
      const o = shapeFromDrag(t, drag.start, snapPt(p), e.shiftKey)
      drag = null
      const small = o.type === 'path' ? dist(o.points[0], o.points[1]) < 0.5 : (o.w != null ? Math.min(o.w, o.h) : Math.min(o.rx, o.ry) * 2) < 0.5
      if (small) { overlay.draw = null; requestRender(); return }
      finishShape(o)
    }
  }])),

  freehand: {
    down (p) { drag = { pts: [p] } },
    move (p) {
      if (!drag) return
      if (dist(drag.pts[drag.pts.length - 1], p) > 0.3) drag.pts.push(p)
      preview({ type: 'freehand', points: drag.pts, closed: false, style: drawStyle() })
    },
    up () {
      if (!drag) return
      let pts = simplify(drag.pts, 0.25)
      const closed = pts.length > 3 && dist(pts[0], pts[pts.length - 1]) < 4 / Math.max(0.5, state.view.zoom / 3)
      if (closed) pts = pts.slice(0, -1)
      drag = null
      if (pts.length < 2) { overlay.draw = null; requestRender(); return }
      finishShape({ type: 'freehand', points: pts, closed, style: drawStyle() })
    }
  },

  filllasso: {
    down (p) { drag = { pts: [p] } },
    move (p) {
      if (!drag) return
      if (dist(drag.pts[drag.pts.length - 1], p) > 0.3) drag.pts.push(p)
      preview({ type: 'freehand', points: drag.pts, closed: true, style: fillShapeStyle() })
    },
    up () {
      if (!drag) return
      const pts = simplify(drag.pts, 0.25)
      drag = null
      if (pts.length < 3) { overlay.draw = null; requestRender(); return }
      finishShape({ type: 'freehand', points: pts, closed: true, style: fillShapeStyle() })
    }
  },

  ...Object.fromEntries(['polyline', 'curve', 'fillpoly', 'arc'].map(t => [t, {
    down (p, e) {
      p = snapPt(p)
      if (!poly) { poly = { tool: t, pts: [p] }; polyPreview(p); return }
      const last = poly.pts[poly.pts.length - 1]
      if (t === 'arc') { // 始点・終点・ふくらみの3点で決まる
        if (dist(p, last) > 0.2 || poly.pts.length === 2) poly.pts.push(p)
        if (poly.pts.length === 3) finishPoly(false)
        else polyPreview(p)
        return
      }
      if (e.shiftKey) p = angleSnap(last, p)
      // 始点の近くをクリック → 閉じて終了
      if (poly.pts.length >= 3 && dist(p, poly.pts[0]) < tol() * 1.5) { finishPoly(true); return }
      if (dist(p, last) > 0.2) poly.pts.push(p)
      polyPreview(p)
    },
    hover (p, e) {
      if (!poly) return
      p = snapPt(p)
      if (e.shiftKey) p = angleSnap(poly.pts[poly.pts.length - 1], p)
      polyPreview(p)
    },
    dbl () { if (poly && t !== 'arc') finishPoly(t === 'fillpoly') }
  }])),

  bucket: {
    down (p) { bucketFill(p) }
  },

  braille: {
    down (p) {
      const hit = hitObject(p)
      if (hit && hit.object.type === 'braille') { ui.editBraille(hit.object); return }
      ui.editBraille(null, snapPt(p))
    }
  },

  eraser: {
    down (p) { drag = { changed: false }; erase(p) },
    move (p) { if (drag) erase(p); eraserCursor(p) },
    hover (p) { eraserCursor(p) },
    up () { if (drag && drag.changed) commit(); drag = null }
  },

  pan: {} // パンは共通処理
}

function polyPreview (cur) {
  const t = poly.tool
  const pts = [...poly.pts, cur]
  const o = t === 'arc'
    ? (pts.length >= 3 ? { type: 'arc', points: pts.slice(0, 3), style: drawStyle() } : { type: 'path', points: pts, closed: false, style: drawStyle() })
    : t === 'curve'
    ? { type: 'curve', points: pts, closed: false, style: drawStyle() }
    : { type: 'path', points: pts, closed: t === 'fillpoly', style: t === 'fillpoly' ? fillShapeStyle() : drawStyle() }
  preview(o)
  const prev = overlay.draw
  overlay.draw = (c) => {
    prev(c)
    for (const q of poly.pts) { const [sx, sy] = toScreen(q[0], q[1]); c.strokeStyle = '#2563eb'; c.strokeRect(sx - 3, sy - 3, 6, 6) }
  }
}

export function finishPoly (closed) {
  if (!poly) return
  const t = poly.tool
  let pts = poly.pts
  // ダブルクリックで同じ点が二重になっているのを除く（円弧は3点をそのまま使う）
  if (t !== 'arc') pts = pts.filter((q, i) => i === 0 || dist(q, pts[i - 1]) > 0.2)
  poly = null
  overlay.draw = null
  if (t === 'arc') {
    if (poly === null && pts.length < 3) { requestRender(); return }
  }
  if (pts.length < 2 || (t === 'fillpoly' && pts.length < 3)) { requestRender(); return }
  if (t === 'arc') finishShape(pts.length >= 3 ? { type: 'arc', points: pts.slice(0, 3), style: drawStyle() } : { type: 'path', points: pts.slice(0, 2), closed: false, style: drawStyle() })
  else if (t === 'curve') finishShape({ type: 'curve', points: pts, closed, style: drawStyle() })
  else if (t === 'fillpoly') finishShape({ type: 'path', points: pts, closed: true, style: fillShapeStyle() })
  else finishShape({ type: 'path', points: pts, closed, style: drawStyle() })
}
export function cancelTool () {
  poly = null; drag = null; kbAnchor = null; overlay.draw = null; requestRender()
}
export const isDrawingPoly = () => !!poly

// ---- 消しゴム
function eraserCursor (p) {
  const r = Math.max(1.5, +state.eraserSize || 3)
  overlay.draw = (c) => {
    const [sx, sy] = toScreen(p[0], p[1])
    c.strokeStyle = '#dc2626'; c.lineWidth = 1
    c.beginPath(); c.arc(sx, sy, r * state.view.zoom, 0, Math.PI * 2); c.stroke()
  }
  requestRender()
}
function erase (p) {
  const r = Math.max(1.5, +state.eraserSize || 3)
  for (const l of state.doc.layers) {
    if (!l.visible || l.locked) continue
    for (const o of [...l.objects]) {
      let dots
      if (o.type === 'dots') dots = o.points
      else {
        // 消しゴムの範囲にかかる図形だけ点に変換する
        const od = objectDots(o, state.doc)
        if (!od.some(d => Math.hypot(d.x - p[0], d.y - p[1]) <= r)) continue
        dots = od.map(d => [d.x, d.y, d.size])
        if (!state.__eraseWarned) { state.__eraseWarned = true; ui.toast('図形を点に変換して消しています（元に戻すで戻せます）。') }
      }
      const keep = dots.filter(q => Math.hypot(q[0] - p[0], q[1] - p[1]) > r)
      if (keep.length === dots.length && o.type === 'dots') continue
      drag.changed = true
      if (!keep.length) l.objects = l.objects.filter(x => x.id !== o.id)
      else replaceObject(o.id, { type: 'dots', points: keep, style: o.type === 'dots' ? o.style : { ...defaultStyle() } })
    }
  }
  bumpVersion()
}

// ---- 囲まれた所を塗る（塗りつぶし）
function bucketFill (p) {
  const cell = 0.5 // mm
  const page = state.doc.page
  const w = Math.ceil(page.width / cell); const h = Math.ceil(page.height / cell)
  const wall = new Uint8Array(w * h)
  // 見えている図形の輪郭と点を壁として描く
  const plot = (x, y, rad) => {
    const r = Math.ceil(rad / cell)
    const ci = Math.floor(x / cell); const cj = Math.floor(y / cell)
    for (let j = cj - r; j <= cj + r; j++) {
      for (let i = ci - r; i <= ci + r; i++) {
        if (i < 0 || j < 0 || i >= w || j >= h) continue
        if ((i - ci) ** 2 + (j - cj) ** 2 <= r * r) wall[j * w + i] = 1
      }
    }
  }
  const lineTo = (a, b, rad) => {
    const L = dist(a, b); const n = Math.max(1, Math.ceil(L / (cell * 0.7)))
    for (let k = 0; k <= n; k++) plot(a[0] + (b[0] - a[0]) * k / n, a[1] + (b[1] - a[1]) * k / n, rad)
  }
  for (const l of state.doc.layers) {
    if (!l.visible) continue
    for (const o of l.objects) {
      if (o.type === 'dots' || o.type === 'braille') {
        // 点の並びは、近い点どうしをつないで壁にする
        const ds = objectDots(o, state.doc)
        for (const d of ds) plot(d.x, d.y, 0.6)
        if (o.type === 'dots' && ds.length < 4000) {
          const lim = Math.max(2.6, (+state.drawStyle.spacing || 2) * 1.6)
          const grid = new Map()
          for (const d of ds) { const k = Math.floor(d.x / lim) + ',' + Math.floor(d.y / lim); if (!grid.has(k)) grid.set(k, []); grid.get(k).push(d) }
          for (const d of ds) {
            const gi = Math.floor(d.x / lim); const gj = Math.floor(d.y / lim)
            for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) for (const e of grid.get((gi + a) + ',' + (gj + b)) || []) if (e !== d && Math.hypot(e.x - d.x, e.y - d.y) <= lim) lineTo([d.x, d.y], [e.x, e.y], 0.4)
          }
        }
        continue
      }
      const { paths, closed } = outlineOf(o)
      for (const path of paths) {
        for (let i = 1; i < path.length; i++) lineTo(path[i - 1], path[i], 0.5)
        if (closed && path.length > 2) lineTo(path[path.length - 1], path[0], 0.5)
      }
    }
  }
  const si = Math.floor(p[0] / cell); const sj = Math.floor(p[1] / cell)
  if (si < 0 || sj < 0 || si >= w || sj >= h || wall[sj * w + si]) { ui.toast('線の上ではなく、囲まれた内側をクリックしてください。'); return }
  const fill = new Uint8Array(w * h)
  const stack = [sj * w + si]
  let count = 0; let leaked = false
  while (stack.length) {
    const k = stack.pop()
    if (fill[k] || wall[k]) continue
    fill[k] = 1; count++
    const i = k % w; const j = (k - i) / w
    if (i === 0 || j === 0 || i === w - 1 || j === h - 1) leaked = true
    if (i > 0) stack.push(k - 1)
    if (i < w - 1) stack.push(k + 1)
    if (j > 0) stack.push(k - w)
    if (j < h - 1) stack.push(k + w)
  }
  if (leaked && count > w * h * 0.6) { ui.toast('囲まれていない所です。線のすき間を閉じるか、範囲塗りの道具を使ってください。'); return }
  // 壁の分だけ外へ広げて、輪郭線に近づける
  const grown = fill.slice()
  for (let j = 1; j < h - 1; j++) for (let i = 1; i < w - 1; i++) {
    const k = j * w + i
    if (!fill[k] && wall[k] && (fill[k - 1] || fill[k + 1] || fill[k - w] || fill[k + w])) grown[k] = 1
  }
  // 範囲を切り出す
  let i0 = w; let j0 = h; let i1 = -1; let j1 = -1
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) if (grown[j * w + i]) { i0 = Math.min(i0, i); i1 = Math.max(i1, i); j0 = Math.min(j0, j); j1 = Math.max(j1, j) }
  const cw = i1 - i0 + 1; const ch = j1 - j0 + 1
  const sub = new Uint8Array(cw * ch)
  for (let j = 0; j < ch; j++) for (let i = 0; i < cw; i++) sub[j * cw + i] = grown[(j + j0) * w + (i + i0)]
  const mask = maskFromGrid(sub, cw, ch, i0 * cell, j0 * cell, cell)
  // 塗りつぶしでは輪郭線は既にあるので、輪郭は描かない（ただし内側の余白は保つ）
  mask.style = { ...fillShapeStyle(), stroke: false }
  mask.style.fill.inset = 0
  // 余白：壁からの距離が inset 未満のセルを外す
  const inset = +state.fillStyle.inset || 0
  if (inset > 0) {
    const r = Math.ceil(inset / cell)
    const sub2 = sub.slice()
    for (let j = 0; j < ch; j++) for (let i = 0; i < cw; i++) {
      if (!sub[j * cw + i]) continue
      let near = false
      for (let b = -r; b <= r && !near; b++) for (let a = -r; a <= r && !near; a++) {
        if (a * a + b * b > r * r) continue
        const gi = i + i0 + a; const gj = j + j0 + b
        if (gi < 0 || gj < 0 || gi >= w || gj >= h || wall[gj * w + gi]) near = true
      }
      if (near) sub2[j * cw + i] = 0
    }
    const m2 = maskFromGrid(sub2, cw, ch, i0 * cell, j0 * cell, cell)
    mask.rows = m2.rows
  }
  finishShape(mask)
}

// ---- ポインタの共通処理（ピンチ・パンを含む）
const pointers = new Map()
let gesture = null
let spaceDown = false
export const setSpace = v => { spaceDown = v; canvas.style.cursor = v ? 'grab' : '' }

function evPt (e) {
  const r = canvas.getBoundingClientRect()
  return [e.clientX - r.left, e.clientY - r.top]
}

function bindPointer () {
  let lastTap = 0; let lastTapPt = null
  canvas.addEventListener('pointerdown', (e) => {
    canvas.focus({ preventScroll: true })
    canvas.setPointerCapture(e.pointerId)
    pointers.set(e.pointerId, evPt(e))
    if (pointers.size === 2) {
      // 2本指：描きかけを取り消してピンチへ
      if (drag && state.tool !== 'select') { drag = null; overlay.draw = null }
      if (drag && drag.mode === 'move' && drag.moved) commit()
      drag = null
      const [a, b] = [...pointers.values()]
      gesture = { d: dist(a, b), mid: [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2], zoom: state.view.zoom }
      return
    }
    if (pointers.size > 2) return
    const sp = evPt(e)
    if (state.tool === 'pan' || spaceDown || e.button === 1) {
      gesture = { pan: true, last: sp }
      canvas.style.cursor = 'grabbing'
      return
    }
    if (e.button !== 0 && e.pointerType === 'mouse') return
    if (state.tool !== 'dot') state.cursor = null // マウス・タッチを使ったらキーボードのカーソルは消す
    kbAnchor = null
    const p = toDoc(...sp)
    const t = tools[state.tool]
    // ダブルクリック／ダブルタップ
    const now = performance.now()
    const isDbl = lastTapPt && now - lastTap < 350 && dist(lastTapPt, sp) < 12
    lastTap = now; lastTapPt = sp
    if (isDbl && t.dbl) { t.dbl(p, e); lastTapPt = null; return }
    if (t.down) t.down(p, e)
  })
  canvas.addEventListener('pointermove', (e) => {
    const sp = evPt(e)
    if (pointers.has(e.pointerId)) pointers.set(e.pointerId, sp)
    if (gesture && gesture.pan) {
      state.view.panX += sp[0] - gesture.last[0]; state.view.panY += sp[1] - gesture.last[1]
      gesture.last = sp
      requestRender(); notify('view')
      return
    }
    if (gesture && pointers.size === 2) {
      const [a, b] = [...pointers.values()]
      const mid = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]
      state.view.panX += mid[0] - gesture.mid[0]; state.view.panY += mid[1] - gesture.mid[1]
      gesture.mid = mid
      zoomTo(gesture.zoom * dist(a, b) / gesture.d, mid[0], mid[1])
      notify('view')
      return
    }
    const p = toDoc(...sp)
    ui.status(p)
    const t = tools[state.tool]
    if (pointers.has(e.pointerId)) { if (t.move) t.move(p, e) } else if (t.hover) t.hover(p, e)
  })
  const end = (e) => {
    const had = pointers.has(e.pointerId)
    pointers.delete(e.pointerId)
    if (gesture) {
      if (pointers.size === 0) { gesture = null; canvas.style.cursor = spaceDown ? 'grab' : '' }
      return
    }
    if (!had) return
    const t = tools[state.tool]
    if (t.up) t.up(toDoc(...evPt(e)), e)
  }
  canvas.addEventListener('pointerup', end)
  canvas.addEventListener('pointercancel', (e) => { pointers.delete(e.pointerId); gesture = null; if (drag) { drag = null; overlay.draw = null; requestRender() } })
  canvas.addEventListener('wheel', (e) => {
    e.preventDefault()
    const sp = evPt(e)
    if (e.ctrlKey || e.metaKey || !e.shiftKey) {
      // ホイール＝拡大縮小（トラックパッドの2本指スクロールは移動）
      if (!e.ctrlKey && Math.abs(e.deltaX) > 0 && e.deltaMode === 0 && Math.abs(e.deltaY) < 50 && !Number.isInteger(e.deltaY)) {
        state.view.panX -= e.deltaX; state.view.panY -= e.deltaY; requestRender(); notify('view'); return
      }
      zoomTo(state.view.zoom * Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0015)), sp[0], sp[1])
    } else {
      state.view.panX -= e.deltaY; requestRender()
    }
    notify('view')
  }, { passive: false })
  canvas.addEventListener('contextmenu', e => e.preventDefault())
}

// ---- キーボードで描く（エーデルのようにカーソルを動かして点・頂点を置く）
// 矢印: 1mm（Shift 5mm、Ctrl 10mm。方眼に吸着するときは方眼の間隔）
export function keyboardCursor (key, mods = {}) {
  const step = mods.ctrl ? 10 : mods.shift ? 5 : (state.snapGrid ? state.gridSize : 1)
  if (!state.cursor) state.cursor = [Math.round(state.doc.page.width / 2), Math.round(state.doc.page.height / 2)]
  const c = state.cursor
  if (key === 'ArrowLeft') c[0] -= step
  else if (key === 'ArrowRight') c[0] += step
  else if (key === 'ArrowUp') c[1] -= step
  else if (key === 'ArrowDown') c[1] += step
  c[0] = Math.round(Math.max(0, Math.min(state.doc.page.width, c[0])) * 100) / 100
  c[1] = Math.round(Math.max(0, Math.min(state.doc.page.height, c[1])) * 100) / 100
  keyboardPreview()
  ui.status(c)
  ui.cursorMoved(c)
  requestRender()
}
export function setCursor (p) {
  state.cursor = [p[0], p[1]]
  keyboardPreview()
  ui.status(state.cursor)
  requestRender()
}
function keyboardPreview () {
  const c = state.cursor
  if (!c) return
  if (kbAnchor) preview(shapeFromDrag(state.tool, kbAnchor, c, false))
  else if (poly) polyPreview(c)
}
export const cursorInfo = () => state.cursor ? describeAt(state.doc, state.cursor, (o, p) => hitTest(o, p, 1.0, state.doc)) : ''

const TWO_POINT = ['line', 'rect', 'ellipse', 'fillrect', 'fillellipse']
/**
 * カーソルの位置で道具を使う。
 * mode: 'put'（Enter・Space）| 'finish'（Shift+Enter：開いたまま終える）| 'close'（Ctrl+Enter：閉じて終える）| 'back'（Backspace）
 */
export function keyboardAction (mode = 'put') {
  if (!state.cursor) state.cursor = [Math.round(state.doc.page.width / 2), Math.round(state.doc.page.height / 2)]
  const c = state.cursor.slice()
  const t = state.tool
  const say = ui.announce
  if (t === 'dot') { keyboardDot(mode === 'back'); return }
  if (TWO_POINT.includes(t)) {
    if (mode === 'back') { kbAnchor = null; overlay.draw = null; requestRender(); say('始点を取り消しました。'); return }
    if (!kbAnchor) { kbAnchor = c; preview(shapeFromDrag(t, c, c, false)); say(`始点 x ${c[0]} y ${c[1]}。終点へ動かして Enter。`); return }
    const o = shapeFromDrag(t, kbAnchor, c, false)
    kbAnchor = null
    const small = o.type === 'path' ? dist(o.points[0], o.points[1]) < 0.5 : (o.w != null ? Math.min(o.w, o.h) : Math.min(o.rx, o.ry) * 2) < 0.5
    if (small) { overlay.draw = null; requestRender(); say('始点と同じ位置なので取り消しました。'); return }
    finishShape(o)
    return
  }
  if (['polyline', 'curve', 'fillpoly', 'arc'].includes(t)) {
    if (mode === 'finish' || mode === 'close') {
      if (!poly) { say('描きかけの線はありません。'); return }
      finishPoly(mode === 'close' || t === 'fillpoly')
      return
    }
    if (mode === 'back') {
      if (poly && poly.pts.length > 1) { poly.pts.pop(); keyboardPreview(); say(`頂点を1つ取り消しました。残り ${poly.pts.length} 個。`) } else { cancelTool(); say('取り消しました。') }
      return
    }
    tools[t].down(c, { shiftKey: false })
    if (poly) {
      const n = poly.pts.length
      say(t === 'arc'
        ? ['', '始点を置きました。終点へ動かして Enter。', '終点を置きました。ふくらみの位置へ動かして Enter。'][n]
        : `頂点 ${n} 個目。Shift+Enter で終える${t === 'fillpoly' ? '' : '、Ctrl+Enter で閉じて終える'}。`)
    }
    return
  }
  if (t === 'bucket') { bucketFill(c); return }
  if (t === 'braille') { tools.braille.down(c); return }
  if (t === 'eraser') {
    drag = { changed: false }; erase(c)
    if (drag.changed) { commit(); say('消しました。') } else say('消す点がありません。')
    drag = null
    return
  }
  if (t === 'select') {
    const hit = hitObject(c)
    if (!hit) { say('ここには図形がありません。'); return }
    if (mode !== 'finish') state.selection.clear()
    state.selection.add(hit.object.id)
    state.doc.activeLayer = hit.layer.id
    notify('selection')
    say(`選択：${describeObject(hit.object, state.doc)}`)
  }
}
export function keyboardDot (remove = false) {
  if (!state.cursor) return
  const c = snapToGrid(getProfile(state.doc.profile), state.cursor[0], state.cursor[1])
  const layer = activeLayer(state.doc)
  if (remove) {
    let n = 0
    for (const o of layer.objects) {
      if (o.type !== 'dots') continue
      const keep = o.points.filter(q => Math.hypot(q[0] - c[0], q[1] - c[1]) > 0.8)
      n += o.points.length - keep.length
      if (keep.length !== o.points.length) replaceObject(o.id, { ...o, points: keep })
    }
    layer.objects = layer.objects.filter(o => o.type !== 'dots' || o.points.length)
    commit()
    ui.announce(n ? `点を ${n} 個消しました。` : 'ここに点はありません。')
    return
  }
  const last = layer.objects[layer.objects.length - 1]
  // 続けて打つ点は同じ図形にまとめる
  if (last && last.type === 'dots' && last.kbd && !layer.locked) {
    replaceObject(last.id, { ...last, points: [...last.points, [c[0], c[1], state.dotSize]] })
    commit()
    ui.announce('点')
    return
  }
  const obj = addObject({ type: 'dots', kbd: true, points: [[c[0], c[1], state.dotSize]], style: { ...defaultStyle(), dot: state.dotSize } })
  if (obj) { commit(); ui.announce('点') }
}
export const hasKeyboardDraft = () => !!(kbAnchor || poly)
