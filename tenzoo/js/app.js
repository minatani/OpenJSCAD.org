// tenzoo のアプリ本体：パネル、ダイアログ、ファイル操作、キー操作
import {
  state, on, commit, notify, undo, redo, canUndo, canRedo, loadDocument, selectedObjects, replaceObject,
  deleteSelection, copySelection, paste, duplicateSelection, selectAll, arrange, flattenSelection,
  addLayer, deleteLayer, duplicateLayer, moveLayer, mergeLayers, moveSelectionToLayer, addObject, transformSelection,
  selectionBox
} from './store.js'
import { canvas, resize, fitPage, zoomTo, requestRender, bumpVersion, viewSize, currentDots } from './view.js'
import { snapCell, initTools, TOOL_HINTS, finishPoly, cancelTool, isDrawingPoly, keyboardCursor, keyboardAction, setCursor, cursorInfo, hasKeyboardDraft, setSpace } from './tools.js'
import { say, describeObject, docSummary as summaryText, typeName } from './a11y.js'
import { newDocument, newLayer, newId, defaultStyle, defaultFill, bboxOf, activeLayer, isClosed, MARKERS } from './model.js'
import { PATTERNS, PATTERN_IDS, generatePattern } from './patterns.js'
import { PROFILES, PAPERS, DOT_SIZES, getProfile, edlPaperOf } from './profiles.js'
import { documentDots } from './raster.js'
import { kanaToBraille, bitsToUnicode, SIX_KEY, brailleToKana } from './braille.js'
import { parseEDL, bytesToLatin1, latin1ToBytes, isEDL, EDL_UNIT_X, EDL_UNIT_Y } from './io/edl.js'
import { isEZI, parseSEBK, writeSEBK, combineEdlEzi, buildEdelFiles, UNIT_AVG } from './io/ezi.js'
import { encodeESA } from './io/esa.js'
import { checkDocument } from './check.js'
import { serializeDocument, dotsToSVG, dotsToPNG, dotsToPDF } from './io/export.js'
import { loadImageFile, imageDataOf, imageToDots, fitPlacement, svgToObjects } from './io/import.js'
import { mScale, mRotate } from './geometry.js'

const $ = (s, el = document) => el.querySelector(s)
const $$ = (s, el = document) => [...el.querySelectorAll(s)]
const h = (tag, attrs = {}, ...kids) => {
  const el = document.createElement(tag)
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue
    if (k.startsWith('on')) el.addEventListener(k.slice(2), v)
    else if (k === 'class') el.className = v
    else if (k === 'html') el.innerHTML = v
    else if (k in el && typeof v !== 'string') el[k] = v
    else el.setAttribute(k, v === true ? '' : v)
  }
  for (const c of kids.flat()) if (c != null && c !== false) el.append(c.nodeType ? c : document.createTextNode(c))
  return el
}

// ---- 共通の小物
let toastTimer
let cursorSayTimer
// 画面に短く表示する（読み上げは announce で）
function showToast (msg, ms = 3200) {
  const t = $('#toast')
  t.textContent = msg
  t.classList.add('show')
  clearTimeout(toastTimer)
  toastTimer = setTimeout(() => t.classList.remove('show'), ms)
}
// スクリーンリーダで読み上げる。visual=true なら画面にも表示
function announce (msg, visual = false, ms) {
  clearTimeout(cursorSayTimer) // 待っているカーソル位置の読み上げで上書きしない
  say(msg)
  if (visual) showToast(msg, ms || Math.max(3200, msg.length * 90))
}
const toast = (msg, ms) => announce(msg, true, ms)
function hint (msg) {
  const el = $('#hint')
  el.textContent = msg || ''
  el.classList.toggle('show', !!msg)
  clearTimeout(hint.t)
  if (msg) hint.t = setTimeout(() => el.classList.remove('show'), 5000)
}
function status (p) {
  const n = currentDots().length
  $('#status').textContent = (p ? `x ${p[0].toFixed(1)}  y ${p[1].toFixed(1)} mm　` : '') + `点 ${n}`
}
const docSummary = () => summaryText(state.doc, currentDots().length)
const TOOL_NAMES = {
  select: '選択', dot: '点', line: '直線', polyline: '折れ線', curve: '曲線', arc: '円弧', freehand: '手描き', rect: '四角形', ellipse: '円・楕円',
  fillrect: '四角の範囲を塗る', fillellipse: '楕円の範囲を塗る', filllasso: '投げ縄の範囲を塗る', fillpoly: '多角形の範囲を塗る', bucket: '囲まれた所を塗る',
  braille: '点字', marker: '記号', eraser: '消しゴム', pan: '表示の移動'
}

function download (data, name, type) {
  const blob = data instanceof Blob ? data : new Blob([data], { type })
  const a = h('a', { href: URL.createObjectURL(blob), download: name })
  document.body.append(a); a.click(); a.remove()
  setTimeout(() => URL.revokeObjectURL(a.href), 4000)
}
const baseName = () => (state.doc.meta.title || 'tenzoo').replace(/[\\/:*?"<>|]/g, '_')

// ダイアログ（Promise で結果を返す）
function dialog (title, body, actions = [{ label: '閉じる', value: 'close' }]) {
  const dlg = $('#dlg')
  $('#dlg-title').textContent = title
  const b = $('#dlg-body'); b.replaceChildren(...(Array.isArray(body) ? body : [body]))
  const act = $('#dlg-actions'); act.replaceChildren()
  for (const a of actions) act.append(h('button', { class: 'btn' + (a.primary ? ' primary' : ''), value: a.value, type: 'submit' }, a.label))
  dlg.showModal()
  return new Promise(resolve => {
    dlg.addEventListener('close', () => resolve(dlg.returnValue), { once: true })
  })
}

// 入力欄の部品
function numRow (label, value, onChange, { min = 0, max = 100, step = 0.1, unit = 'mm' } = {}) {
  const inp = h('input', { type: 'number', min, max, step, value, 'aria-label': `${label}（${unit}）`, 'data-k': 'n:' + label })
  inp.addEventListener('change', () => { const v = parseFloat(inp.value); if (!isNaN(v)) onChange(Math.max(min, Math.min(max, v))) })
  return h('div', { class: 'row' }, h('label', { 'aria-hidden': 'true' }, label), inp, h('span', { class: 'val', 'aria-hidden': 'true' }, unit))
}
function rangeRow (label, value, onChange, { min = 0, max = 10, step = 0.1, unit = 'mm', live = false } = {}) {
  const val = h('span', { class: 'val', 'aria-hidden': 'true' }, `${value}${unit}`)
  const inp = h('input', { type: 'range', min, max, step, value, 'aria-label': label, 'aria-valuetext': `${value}${unit}`, 'data-k': 'r:' + label })
  inp.addEventListener('input', () => { val.textContent = `${inp.value}${unit}`; inp.setAttribute('aria-valuetext', `${inp.value}${unit}`); if (live) onChange(parseFloat(inp.value), true) })
  inp.addEventListener('change', () => onChange(parseFloat(inp.value), false))
  return h('div', { class: 'row' }, h('label', { 'aria-hidden': 'true' }, label), inp, val)
}
function selRow (label, value, options, onChange) {
  const sel = h('select', { 'aria-label': label, 'data-k': 's:' + label }, ...Object.entries(options).map(([v, t]) => h('option', { value: v, selected: v === value }, t)))
  sel.addEventListener('change', () => onChange(sel.value))
  return h('div', { class: 'row' }, h('label', { 'aria-hidden': 'true' }, label), sel)
}
function checkRow (label, value, onChange) {
  const id = 'c' + Math.random().toString(36).slice(2)
  const inp = h('input', { type: 'checkbox', id, checked: !!value, 'data-k': 'c:' + label })
  inp.addEventListener('change', () => onChange(inp.checked))
  return h('div', { class: 'row' }, inp, h('label', { for: id, style: 'min-width:0;color:inherit' }, label))
}
function segRow (label, value, options, onChange) {
  const seg = h('div', { class: 'seg', role: 'group', 'aria-label': label })
  for (const [v, t] of Object.entries(options)) {
    seg.append(h('button', { type: 'button', 'aria-pressed': String(v === value), 'data-k': `g:${label}:${v}`, 'aria-label': `${label}：${t}`, onclick: () => onChange(v) }, t))
  }
  return h('div', { class: 'row' }, h('label', { 'aria-hidden': 'true' }, label), seg)
}
const sec = (title, ...kids) => h('div', { class: 'sec' }, h('h2', {}, title), ...kids)

// パネルを作り直しても、キーボードのフォーカスを同じ部品に戻す（スクリーンリーダで迷わないように）
// 描き直しは少し遅らせてまとめる（Tab キーでの移動が終わってから描き直し、移動先と同じ部品にフォーカスを戻す）
const pendingRenders = new Set()
function withFocus (render) {
  if (pendingRenders.has(render)) return
  pendingRenders.add(render)
  setTimeout(() => {
    pendingRenders.delete(render)
    const ae = document.activeElement
    const key = ae && ae.closest && ae.closest('#panel') ? ae.dataset.k : null
    const scroller = ae && ae.closest && ae.closest('.tab-body')
    const top = scroller ? scroller.scrollTop : 0
    render()
    if (scroller) scroller.scrollTop = top
    if (key) {
      const el = document.querySelector(`#panel [data-k="${CSS.escape(key)}"]`)
      if (el && el !== document.activeElement) el.focus({ preventScroll: true })
    }
  }, 0)
}

// パターンの見本
function patternSwatch (id, fill) {
  const c = h('canvas', { width: 72, height: 72 })
  const ctx = c.getContext('2d')
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, 72, 72)
  const k = 72 / 24 // 24mm 四方を描く
  const pts = generatePattern(id, { minX: 0, minY: 0, maxX: 24, maxY: 24 }, { ...fill, seed: 7 })
  ctx.fillStyle = '#111'
  for (const p of pts) {
    if (p[0] < 0.5 || p[1] < 0.5 || p[0] > 23.5 || p[1] > 23.5) continue
    ctx.beginPath(); ctx.arc(p[0] * k, p[1] * k, Math.max(1.2, (DOT_SIZES[fill.dot] || DOT_SIZES.S).d / 2 * k * 0.8), 0, Math.PI * 2); ctx.fill()
  }
  return c
}

// ================= パネル：図形 =================
const renderStylePanel = () => withFocus(renderStylePanel_)
function renderStylePanel_ () {
  const box = $('#tab-style')
  const sel = selectedObjects()
  const kids = []
  // 編集対象：選択中の図形があればそれ、なければ次に描く図形の設定
  const target = sel.length ? sel[0] : null
  const st = target && target.style ? target.style : state.drawStyle
  const setStyle = (patch) => {
    if (sel.length) {
      for (const o of sel) {
        const n = { ...o, style: { ...o.style, ...patch } }
        // エーデル由来の線は、間隔を目盛りの整数に合わせて保つ
        if (o.edel && patch.spacing != null) n.edel = { ...o.edel, s: Math.max(1, Math.round(patch.spacing / UNIT_AVG)) }
        replaceObject(o.id, n)
      }
      commit()
    } else {
      Object.assign(state.drawStyle, patch)
      renderStylePanel()
    }
  }
  kids.push(h('p', { class: 'note' }, sel.length ? `選択中の図形 ${sel.length} 個を変更します。` : 'これから描く図形の設定です。図形を選ぶと、その図形を変更できます。'))

  const fillTools = ['fillrect', 'fillellipse', 'filllasso', 'fillpoly', 'bucket']
  const fillMode = !sel.length && fillTools.includes(state.tool)

  if (!sel.length && state.tool === 'dot') {
    kids.push(sec('点の道具',
      segRow('点の大きさ', state.dotSize, { L: '大', M: '中', S: '小' }, v => { state.dotSize = v; renderStylePanel() }),
      numRow('連続の間隔', state.drawStyle.spacing, v => { state.drawStyle.spacing = v }, { min: 0.8, max: 20 })
    ))
  }
  if (!sel.length && state.tool === 'eraser') {
    kids.push(sec('消しゴム',
      segRow('消し方', state.eraserMode || 'brush', { brush: 'なぞって消す', rect: '四角の範囲を消す' }, v => { state.eraserMode = v; renderStylePanel() }),
      (state.eraserMode || 'brush') === 'brush' && rangeRow('大きさ（半径）', state.eraserSize || 3, v => { state.eraserSize = v }, { min: 1, max: 15, step: 0.5 })))
  }
  // 記号
  const markerSel = sel.filter(o => o.type === 'marker')
  if (markerSel.length || (!sel.length && state.tool === 'marker')) {
    const m0 = markerSel[0]
    const setM = (patch, stylePatch) => {
      if (markerSel.length) { for (const o of markerSel) replaceObject(o.id, { ...o, ...patch, style: { ...o.style, ...(stylePatch || {}) } }); commit() } else {
        if (patch.shape) state.markerShape = patch.shape
        if (stylePatch && stylePatch.dot) state.markerDot = stylePatch.dot
        if (stylePatch && stylePatch.clear != null) state.markerClear = stylePatch.clear
        renderStylePanel()
      }
    }
    kids.push(sec('記号',
      segRow('形', m0 ? m0.shape : (state.markerShape || 'star'), Object.fromEntries(Object.entries(MARKERS).map(([k, v]) => [k, v.label])), v => setM({ shape: v })),
      segRow('点の大きさ', m0 ? m0.style.dot : (state.markerDot || 'L'), { L: '大', M: '中', S: '小' }, v => setM({}, { dot: v })),
      rangeRow('周りの点を消す余白', m0 ? (m0.style.clear || 0) : (state.markerClear != null ? state.markerClear : 3.5), v => setM({}, { clear: v }), { min: 0, max: 8, step: 0.5 }),
      h('p', { class: 'note' }, '記号の形は navimap-assistant・edlprt の地図記号と同じです。余白の中にある、ほかの図形の点は書き出し・表示のときに消えます。')
    ))
  }

  // 点字
  if (target && target.type === 'braille') {
    kids.push(sec('点字',
      h('div', { class: 'braille-preview', 'aria-label': '点字の表示' }, kanaToBraille(target.text || '').cells.map(c => c === -1 ? '\n' : bitsToUnicode(c)).join('')),
      h('div', { class: 'btns' }, h('button', { class: 'btn', onclick: () => editBraille(target) }, '文字を編集…')),
      segRow('点の大きさ', target.dot || 'M', { L: '大', M: '中', S: '小' }, v => { replaceObject(target.id, { ...target, dot: v }); commit() }),
      rangeRow('周りの点を消す余白', (target.style && target.style.clear) || 0, v => { replaceObject(target.id, { ...target, style: { ...target.style, clear: v } }); commit() }, { min: 0, max: 6, step: 0.5 }),
      h('div', { class: 'btns' }, h('button', { class: 'btn', onclick: () => { const q = snapCell([target.x, target.y]); replaceObject(target.id, { ...target, x: q[0], y: q[1] }); commit(); announce('点字をマス目に合わせました。') } }, 'マス目に合わせる'))
    ))
  }

  const vectorSel = sel.filter(o => o.type !== 'dots' && o.type !== 'braille' && o.type !== 'marker')
  const showLine = !fillMode && (vectorSel.length || (!sel.length && !['dot', 'eraser', 'braille', 'marker', 'select', 'pan'].includes(state.tool)) || (!sel.length && state.tool === 'select'))
  if (showLine) {
    kids.push(sec('輪郭線',
      checkRow('輪郭線を点で描く', st.stroke !== false, v => setStyle({ stroke: v })),
      segRow('点の大きさ', st.dot || 'M', { L: '大', M: '中', S: '小' }, v => setStyle({ dot: v })),
      rangeRow('点の間隔', st.spacing || 2, v => setStyle({ spacing: v }), { min: 1, max: 8, step: 0.1 }),
      segRow('線の種類', st.line || 'solid', { solid: '実線', dashed: '破線', dotted: '点線', double: '二重線' }, v => setStyle({ line: v })),
      st.line === 'double' && rangeRow('二重線の幅', st.width || 2.8, v => setStyle({ width: v }), { min: 1.5, max: 8, step: 0.1 }),
      segRow('矢印', st.arrow || 'none', { none: 'なし', end: '終点', start: '始点', both: '両端' }, v => setStyle({ arrow: v }))
    ))
  }
  if (sel.some(o => o.type === 'dots')) {
    const dsel = sel.filter(o => o.type === 'dots')
    kids.push(sec('点の図形',
      segRow('すべての点を', '', { L: '大点に', M: '中点に', S: '小点に' }, v => {
        for (const o of dsel) replaceObject(o.id, { ...o, points: o.points.map(p => [p[0], p[1], v]) })
        commit()
      })
    ))
  }

  // 面（塗り）
  const closedSel = sel.filter(o => isClosed(o))
  if (fillMode || closedSel.length || (!sel.length && ['rect', 'ellipse', 'polyline', 'curve', 'freehand'].includes(state.tool))) {
    const fill = sel.length ? (closedSel[0].style.fill || null) : (fillMode ? state.fillStyle : state.drawStyle.fill)
    const setFill = (patch) => {
      if (sel.length) {
        for (const o of closedSel) {
          const f = patch === null ? null : { ...(o.style.fill || defaultFill()), ...patch }
          replaceObject(o.id, { ...o, style: { ...o.style, fill: f } })
        }
        commit()
      } else if (fillMode) {
        Object.assign(state.fillStyle, patch); renderStylePanel()
      } else {
        state.drawStyle.fill = patch === null ? null : { ...(state.drawStyle.fill || defaultFill()), ...patch }
        renderStylePanel()
      }
    }
    const fkids = []
    if (!fillMode) fkids.push(checkRow('内側を塗る', !!fill, v => setFill(v ? {} : null)))
    if (fillMode) {
      fkids.push(checkRow('輪郭線も描く', state.fillOutline, v => { state.fillOutline = v; renderStylePanel() }))
      if (state.fillOutline) {
        fkids.push(segRow('輪郭の点', state.drawStyle.dot, { L: '大', M: '中', S: '小' }, v => { state.drawStyle.dot = v; renderStylePanel() }))
        fkids.push(rangeRow('輪郭の間隔', state.drawStyle.spacing, v => { state.drawStyle.spacing = v }, { min: 1, max: 8 }))
      }
    }
    if (fill) {
      const grid = h('div', { class: 'pattern-grid', role: 'group', 'aria-label': '面の表現' })
      for (const id of PATTERN_IDS) {
        grid.append(h('button', { type: 'button', title: PATTERNS[id].label, 'aria-label': PATTERNS[id].label, 'data-k': 'p:' + id, 'aria-pressed': String(fill.pattern === id), onclick: () => setFill({ pattern: id }) }, patternSwatch(id, { ...fill, pattern: id })))
      }
      fkids.push(h('div', { class: 'note' }, `面の表現：${(PATTERNS[fill.pattern] || PATTERNS.grid).label}`), grid)
      fkids.push(rangeRow('線・点の間隔', fill.spacing, v => setFill({ spacing: v }), { min: 1, max: 12, step: 0.1 }))
      fkids.push(rangeRow('線の中の点の間隔', fill.pitch, v => setFill({ pitch: v }), { min: 0.8, max: 5, step: 0.1 }))
      fkids.push(rangeRow('角度', fill.angle || 0, v => setFill({ angle: v }), { min: -90, max: 90, step: 5, unit: '°' }))
      fkids.push(segRow('点の大きさ', fill.dot || 'S', { L: '大', M: '中', S: '小' }, v => setFill({ dot: v })))
      fkids.push(rangeRow('輪郭からの余白', fill.inset != null ? fill.inset : 1.5, v => setFill({ inset: v }), { min: 0, max: 6, step: 0.1 }))
    }
    kids.push(sec(fillMode ? '範囲を塗る' : '面（塗り）', ...fkids))
  }

  if (sel.length === 1) kids.push(geometrySection(sel[0]))
  if (sel.length) {
    const layers = Object.fromEntries(state.doc.layers.map(l => [l.id, l.name]))
    kids.push(sec('操作',
      h('div', { class: 'btns' },
        h('button', { class: 'btn', onclick: () => duplicateSelection() }, '複製'),
        h('button', { class: 'btn', onclick: () => { const b = selectionBox(); transformSelection(mScale(-1, 1, (b.minX + b.maxX) / 2, 0)); commit() } }, '左右反転'),
        h('button', { class: 'btn', onclick: () => { const b = selectionBox(); transformSelection(mScale(1, -1, 0, (b.minY + b.maxY) / 2)); commit() } }, '上下反転'),
        h('button', { class: 'btn', onclick: () => { const b = selectionBox(); transformSelection(mRotate(Math.PI / 2, (b.minX + b.maxX) / 2, (b.minY + b.maxY) / 2)); commit() } }, '90°回転'),
        h('button', { class: 'btn', onclick: () => arrange('front') }, '最前面へ'),
        h('button', { class: 'btn', onclick: () => arrange('back') }, '最背面へ'),
        h('button', { class: 'btn', onclick: () => { flattenSelection(); toast('点に変換しました。') } }, '点に変換'),
        h('button', { class: 'btn danger', onclick: () => deleteSelection() }, '削除')
      ),
      selRow('レイヤへ移動', '', { '': '（選ぶ）', ...layers }, v => { if (v) moveSelectionToLayer(v) })
    ))
  }
  box.replaceChildren(...kids)
}

// 選んだ図形の位置・大きさを数値で直す
const fmtPts = pts => pts.map(p => `${+p[0].toFixed(2)},${+p[1].toFixed(2)}`).join(' ')
function parsePts (text) {
  const nums = String(text).split(/[\s,;、　]+/).filter(Boolean).map(Number)
  if (nums.some(isNaN) || nums.length < 4 || nums.length % 2) return null
  const out = []
  for (let i = 0; i < nums.length; i += 2) out.push([nums[i], nums[i + 1]])
  return out
}
function geometrySection (o) {
  const set = (patch) => { const n = replaceObject(o.id, { ...o, ...patch }); commit(); if (n) announce(describeObject(n, state.doc, { detail: false })) }
  const num = (label, key, opts = {}) => numRow(label, +(+o[key]).toFixed(2), v => set({ [key]: v }), { min: -1000, max: 1000, step: 0.1, ...opts })
  const deg = (label = '回転') => numRow(label, Math.round((o.rot || 0) * 180 / Math.PI), v => set({ rot: v * Math.PI / 180 }), { min: -360, max: 360, step: 1, unit: '度' })
  const kids = [h('p', { class: 'note', 'aria-live': 'off' }, describeObject(o, state.doc))]
  if (o.type === 'rect') kids.push(num('左', 'x'), num('上', 'y'), num('幅', 'w', { min: 0.1 }), num('高さ', 'h', { min: 0.1 }), deg())
  else if (o.type === 'ellipse') kids.push(num('中心 x', 'cx'), num('中心 y', 'cy'), num('横半径', 'rx', { min: 0.1 }), num('縦半径', 'ry', { min: 0.1 }), deg())
  else if (o.type === 'braille') kids.push(num('左上 x', 'x'), num('左上 y', 'y'))
  else if (['path', 'curve', 'freehand', 'arc'].includes(o.type)) {
    const ta = h('textarea', { 'aria-label': o.type === 'arc' ? '円弧の3点（始点、終点、ふくらみの位置）。x,y を空白で区切る（mm）' : '頂点の座標。x,y を空白で区切る（mm）', 'data-k': 'pts' }, fmtPts(o.points))
    ta.addEventListener('change', () => {
      const pts = parsePts(ta.value)
      if (!pts || (o.type === 'arc' && pts.length !== 3)) { announce('座標の書き方が正しくありません。例：10,20 50,20 50,60', true); return }
      set({ points: pts })
    })
    kids.push(h('div', { class: 'geom' }, h('p', { class: 'note' }, o.type === 'arc' ? '3点の座標（始点 終点 ふくらみ）：' : '頂点の座標（mm、x,y を空白区切り）：'), ta))
    if (o.type !== 'arc') kids.push(checkRow('閉じた図形にする', !!o.closed, v => set({ closed: v })))
  } else if (o.type === 'dots' || o.type === 'mask') {
    const b = bboxOf(o, state.doc)
    if (b) {
      kids.push(numRow('左（移動）', +b.minX.toFixed(2), v => { transformSelection([1, 0, 0, 1, v - b.minX, 0]); commit() }, { min: -1000, max: 1000 }))
      kids.push(numRow('上（移動）', +b.minY.toFixed(2), v => { transformSelection([1, 0, 0, 1, 0, v - b.minY]); commit() }, { min: -1000, max: 1000 }))
    }
  }
  return sec('位置と大きさ（mm）', ...kids)
}

// ================= パネル：一覧（図形をことばで確認・選択） =================
const renderListPanel = () => withFocus(renderListPanel_)
function renderListPanel_ () {
  const box = $('#tab-list')
  const kids = [
    h('p', { class: 'note' }, docSummary()),
    h('div', { class: 'btns' },
      h('button', { class: 'btn primary', 'data-k': 'b:numadd', onclick: () => addByNumbersDialog() }, '数値を指定して図形を追加…'),
      h('button', { class: 'btn', 'data-k': 'b:selnone', onclick: () => { state.selection.clear(); notify('selection'); announce('選択を解除しました。') } }, '選択を解除'))
  ]
  for (const l of [...state.doc.layers].reverse()) {
    kids.push(h('h2', { class: 'layer-head' }, `レイヤ「${l.name}」${l.id === state.doc.activeLayer ? '（作業中）' : ''}${l.visible ? '' : '（非表示）'}${l.locked ? '（ロック）' : ''}：図形 ${l.objects.length} 個`))
    if (!l.objects.length) continue
    const ul = h('ul', { class: 'obj-list', 'aria-label': `レイヤ「${l.name}」の図形` })
    l.objects.forEach((o, i) => {
      const selected = state.selection.has(o.id)
      ul.append(h('li', {},
        h('button', {
          class: 'obj', type: 'button', 'aria-pressed': String(selected), 'data-k': 'o:' + o.id,
          onclick: (e) => {
            if (state.tool !== 'select') setTool('select')
            if (!e.shiftKey && !e.ctrlKey) state.selection.clear()
            selected && (e.shiftKey || e.ctrlKey) ? state.selection.delete(o.id) : state.selection.add(o.id)
            state.doc.activeLayer = l.id
            notify('selection')
            announce(state.selection.has(o.id) ? `選択しました。図形タブで編集できます。` : '選択を外しました。')
          }
        }, `${i + 1}. ${describeObject(o, state.doc)}`),
        h('button', { class: 'btn', type: 'button', 'aria-label': `${i + 1}番目の図形を編集`, onclick: () => {
          if (state.tool !== 'select') setTool('select')
          state.selection = new Set([o.id]); state.doc.activeLayer = l.id
          notify('selection'); showTab('style')
          setTimeout(() => { const f = $('#tab-style input, #tab-style textarea'); if (f) f.focus() }, 30)
        } }, '編集')
      ))
    })
    kids.push(ul)
  }
  box.replaceChildren(...kids)
}

// ================= パネル：レイヤ =================
const mergeChecks = new Set()
const renderLayersPanel = () => withFocus(renderLayersPanel_)
function renderLayersPanel_ () {
  const box = $('#tab-layers')
  const list = h('ul', { class: 'layer-list', 'aria-label': 'レイヤの一覧（上が手前）' })
  const layersTop = [...state.doc.layers].reverse()
  layersTop.forEach((l, idx) => {
    const pos = `${idx + 1}枚目`
    const radio = h('input', { type: 'radio', name: 'active-layer', checked: l.id === state.doc.activeLayer, 'aria-label': `${l.name}（${pos}${l.visible ? '' : '、非表示'}${l.locked ? '、ロック中' : ''}${l.side === 'back' ? '、裏面' : ''}、図形 ${l.objects.length} 個）を作業中にする`, 'data-k': 'la:' + l.id })
    radio.addEventListener('change', () => { state.doc.activeLayer = l.id; renderLayersPanel(); announce(`作業中のレイヤ：${l.name}`) })
    const name = h('input', { class: 'name', value: l.name, 'aria-label': `${pos}のレイヤ名`, 'data-k': 'ln:' + l.id })
    name.addEventListener('change', () => { l.name = name.value || l.name; commit('layers') })
    const color = h('input', { type: 'color', value: l.color, class: 'swatch', title: '表示の色', 'aria-label': `${l.name} の表示の色`, 'data-k': 'lc:' + l.id })
    color.addEventListener('change', () => { l.color = color.value; commit('layers') })
    const chk = h('input', { type: 'checkbox', title: 'まとめる対象に含める', 'aria-label': `${l.name} をまとめる対象に含める`, checked: mergeChecks.has(l.id), 'data-k': 'lm:' + l.id })
    chk.addEventListener('change', () => { chk.checked ? mergeChecks.add(l.id) : mergeChecks.delete(l.id); renderLayersPanel() })
    list.append(h('li', { class: 'layer-item' + (l.id === state.doc.activeLayer ? ' active' : ''), 'aria-current': l.id === state.doc.activeLayer ? 'true' : null },
      radio, chk, color, name,
      h('span', { class: 'count', 'aria-hidden': 'true' }, String(l.objects.length)),
      h('button', { class: 'icon-btn', title: l.visible ? '隠す' : '表示する', 'aria-label': `${l.name} を表示`, 'aria-pressed': String(l.visible), 'data-k': 'lv:' + l.id, onclick: () => { l.visible = !l.visible; commit('layers'); announce(`${l.name} を${l.visible ? '表示しました' : '隠しました'}`) } }, svgUse(l.visible ? 'i-eye' : 'i-eye-off')),
      h('button', { class: 'icon-btn', title: l.locked ? 'ロック解除' : 'ロック', 'aria-label': `${l.name} をロック`, 'aria-pressed': String(!!l.locked), 'data-k': 'lk:' + l.id, onclick: () => { l.locked = !l.locked; commit('layers'); announce(`${l.name} を${l.locked ? 'ロックしました' : 'ロック解除しました'}`) } }, svgUse(l.locked ? 'i-lock' : 'i-unlock'))
    ))
  })
  const act = activeLayer(state.doc)
  const checked = state.doc.layers.filter(l => mergeChecks.has(l.id)).map(l => l.id)
  box.replaceChildren(
    sec('レイヤ', list,
      h('div', { class: 'btns', style: 'margin-top:8px' },
        h('button', { class: 'btn', 'data-k': 'b:add', onclick: () => { const l = addLayer(); announce(`${l.name} を追加し、作業中にしました。`) } }, '＋ 追加'),
        h('button', { class: 'btn', 'data-k': 'b:dup', onclick: () => duplicateLayer(act.id) }, '複製'),
        h('button', { class: 'btn', 'data-k': 'b:up', onclick: () => { moveLayer(act.id, 1); announce(`${act.name} を手前へ移しました。`) } }, '↑ 手前へ'),
        h('button', { class: 'btn', 'data-k': 'b:down', onclick: () => { moveLayer(act.id, -1); announce(`${act.name} を奥へ移しました。`) } }, '↓ 奥へ'),
        h('button', { class: 'btn danger', 'data-k': 'b:del', onclick: async () => { if (await confirmDlg(`レイヤ「${act.name}」を削除しますか？`)) { deleteLayer(act.id); announce('レイヤを削除しました。') } } }, '削除')
      ),
      segRow('作業中のレイヤの面', act.side === 'back' ? 'back' : 'front', { front: '表', back: '裏（両面印刷）' }, v => { act.side = v; commit('layers') }),
      h('p', { class: 'note' }, '一覧の上が手前です。丸いボタン（ラジオボタン）で作業中のレイヤを選びます。図形は作業中のレイヤに描かれます。「裏」にしたレイヤの点は、両面用の拡張 .edl（大きさ 4～6）で裏面に打つ点として書き出します（表から見た位置で描きます）。')
    ),
    sec('レイヤをまとめる（マージ）',
      h('p', { class: 'note' }, `チェックしたレイヤ（${checked.length} 枚）を1枚にまとめます。`),
      h('div', { class: 'btns' },
        h('button', { class: 'btn', disabled: checked.length < 2, onclick: () => { mergeLayers(checked); mergeChecks.clear(); toast('レイヤをまとめました（図形はそのまま）。') } }, '図形のまままとめる'),
        h('button', { class: 'btn', disabled: checked.length < 1, onclick: () => { mergeLayers(checked, { flatten: true }); mergeChecks.clear(); toast('点にしてまとめました。') } }, '点にしてまとめる')
      ),
      h('div', { class: 'btns', style: 'margin-top:6px' },
        h('button', { class: 'btn', onclick: () => { state.doc.layers.forEach(l => mergeChecks.add(l.id)); renderLayersPanel() } }, 'すべてチェック'),
        h('button', { class: 'btn', onclick: () => { state.doc.layers.filter(l => l.visible).forEach(l => mergeChecks.add(l.id)); renderLayersPanel() } }, '見えているものをチェック'),
        h('button', { class: 'btn', onclick: () => { mergeChecks.clear(); renderLayersPanel() } }, 'チェックを外す')
      )
    )
  )
}
const svgUse = id => { const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); const u = document.createElementNS('http://www.w3.org/2000/svg', 'use'); u.setAttribute('href', '#' + id); s.append(u); return s }
async function confirmDlg (msg) {
  const r = await dialog('確認', h('p', {}, msg), [{ label: 'キャンセル', value: 'no' }, { label: 'はい', value: 'yes', primary: true }])
  return r === 'yes'
}

// ================= パネル：下絵 =================
const renderUnderlayPanel = () => withFocus(renderUnderlayPanel_)
function renderUnderlayPanel_ () {
  const box = $('#tab-underlay')
  const kids = [sec('下絵（原図）',
    h('p', { class: 'note' }, '写真・スキャン画像・図などを下に敷いて、なぞって描けます。下絵は印刷・書き出しされません。'),
    h('div', { class: 'btns' }, h('button', { class: 'btn primary', onclick: () => pickFile('image/*,.svg', importImage) }, '画像を取り込む…'))
  )]
  for (const u of state.doc.underlays) {
    const set = (patch, live) => { Object.assign(u, patch); live ? requestRender() : commit('underlay') }
    kids.push(sec(u.name || '画像',
      checkRow('表示する', u.visible, v => set({ visible: v })),
      rangeRow('濃さ', Math.round((u.opacity ?? 0.4) * 100), (v, live) => set({ opacity: v / 100 }, live), { min: 5, max: 100, step: 5, unit: '%', live: true }),
      rangeRow('大きさ', Math.round(u.w / u.baseW * 100), (v, live) => {
        const cx = u.x + u.w / 2; const cy = u.y + u.h / 2
        const w = u.baseW * v / 100; const hh = u.baseH * v / 100
        set({ w, h: hh, x: cx - w / 2, y: cy - hh / 2 }, live)
      }, { min: 10, max: 300, step: 1, unit: '%', live: true }),
      numRow('左', +u.x.toFixed(1), v => set({ x: v }), { min: -500, max: 500 }),
      numRow('上', +u.y.toFixed(1), v => set({ y: v }), { min: -500, max: 500 }),
      h('div', { class: 'btns' },
        h('button', { class: 'btn', onclick: () => { const p = fitPlacement(u.baseW, u.baseH, state.doc.page); set(p) } }, '用紙に合わせる'),
        h('button', { class: 'btn', onclick: () => autoDotsDialog(u) }, '自動で点図にする…'),
        h('button', { class: 'btn danger', onclick: () => { state.doc.underlays = state.doc.underlays.filter(x => x !== u); commit('underlay') } }, '取り除く')
      )
    ))
  }
  box.replaceChildren(...kids)
}

async function importImage (file) {
  if (/\.svg$/i.test(file.name) || file.type === 'image/svg+xml') {
    const r = await dialog('SVG の取り込み', h('p', {}, 'SVG を「図形」として取り込むと、線を点図の線として編集できます。「下絵」として取り込むと、なぞるための画像になります。'),
      [{ label: 'キャンセル', value: 'no' }, { label: '下絵として', value: 'under' }, { label: '図形として', value: 'vector', primary: true }])
    if (r === 'vector') return importSVG(file)
    if (r !== 'under') return
  }
  try {
    const { img, dataURL } = await loadImageFile(file)
    const iw = img.naturalWidth || 300; const ih = img.naturalHeight || 300
    const place = fitPlacement(iw, ih, state.doc.page)
    // 大きすぎる画像は縮めて埋め込む（保存ファイルが重くなりすぎないように）
    let src = dataURL
    if (Math.max(iw, ih) > 2400 || dataURL.length > 4e6) {
      const k = 2400 / Math.max(iw, ih)
      const c = h('canvas', { width: Math.round(iw * k), height: Math.round(ih * k) })
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height)
      src = c.toDataURL('image/jpeg', 0.85)
    }
    state.doc.underlays.push({ id: newId('u'), name: file.name, src, ...place, baseW: place.w, baseH: place.h, opacity: 0.4, visible: true })
    commit('underlay')
    showTab('underlay')
    toast('下絵を取り込みました。なぞって描くか、「自動で点図にする」を試してください。')
  } catch (e) { toast(e.message) }
}

async function importSVG (file) {
  try {
    const text = await file.text()
    const objs = svgToObjects(text, state.doc.page, { style: state.drawStyle, fill: state.fillStyle })
    const l = addLayer(file.name.replace(/\.[^.]+$/, ''))
    for (const o of objs) l.objects.push(o)
    commit('layers')
    toast(`SVG から図形を ${objs.length} 個取り込みました（新しいレイヤ）。`)
  } catch (e) { toast(e.message) }
}

async function autoDotsDialog (u) {
  const opts = { mode: 'fill', threshold: 128, spacing: 2.0, size: 'M', invert: false }
  const preview = h('canvas', { width: 320, height: 320, style: 'width:100%;max-width:320px;border:1px solid var(--border);border-radius:8px;background:#fff;display:block;margin:auto' })
  const img = new Image()
  await new Promise(resolve => { img.onload = resolve; img.onerror = resolve; img.src = u.src })
  const data = imageDataOf(img, 1200)
  const draw = () => {
    const pts = imageToDots(data, { x: u.x, y: u.y, w: u.w, h: u.h }, opts)
    const ctx = preview.getContext('2d')
    const k = Math.min(320 / u.w, 320 / u.h)
    preview.height = Math.round(u.h * k)
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, preview.width, preview.height)
    ctx.fillStyle = '#111'
    for (const p of pts) { ctx.beginPath(); ctx.arc((p[0] - u.x) * k, (p[1] - u.y) * k, Math.max(0.8, DOT_SIZES[p[2]].d / 2 * k), 0, Math.PI * 2); ctx.fill() }
    info.textContent = `点 ${pts.length} 個`
    return pts
  }
  const info = h('p', { class: 'note' })
  const body = [
    h('p', { class: 'note' }, '画像の暗い部分を点にします。結果は新しいレイヤに入ります（下絵はそのまま）。'),
    segRow('方法', opts.mode, { fill: '塗り', edge: '輪郭', levels: '濃淡' }, v => { opts.mode = v; refresh() }),
    rangeRow('しきい値', opts.threshold, v => { opts.threshold = v; draw() }, { min: 10, max: 250, step: 1, unit: '', live: true }),
    rangeRow('点の間隔', opts.spacing, v => { opts.spacing = v; draw() }, { min: 1, max: 6, step: 0.1, live: true }),
    segRow('点の大きさ', opts.size, { L: '大', M: '中', S: '小' }, v => { opts.size = v; refresh() }),
    checkRow('白黒を反転', opts.invert, v => { opts.invert = v; draw() }),
    preview, info
  ]
  const wrap = h('div', {}, ...body)
  function refresh () {
    // 押されたボタンの状態を更新
    $$('.seg', wrap).forEach((seg, i) => {
      const val = i === 0 ? opts.mode : opts.size
      const keys = i === 0 ? ['fill', 'edge', 'levels'] : ['L', 'M', 'S']
      $$('button', seg).forEach((b, j) => b.setAttribute('aria-pressed', String(keys[j] === val)))
    })
    draw()
  }
  draw()
  const r = await dialog('自動で点図にする', wrap, [{ label: 'キャンセル', value: 'no' }, { label: '点図にする', value: 'ok', primary: true }])
  if (r !== 'ok') return
  const pts = draw()
  if (!pts.length) { toast('点がありません。しきい値を変えてください。'); return }
  const l = addLayer(`自動点図（${u.name || '画像'}）`)
  l.objects.push({ id: newId(), type: 'dots', points: pts, style: { ...defaultStyle(), dot: opts.size } })
  commit('layers')
  toast(`点 ${pts.length} 個のレイヤを作りました。`)
}

// ================= パネル：用紙・出力 =================
const renderPagePanel = () => withFocus(renderPagePanel_)
function renderPagePanel_ () {
  const box = $('#tab-page')
  const d = state.doc
  const prof = getProfile(d.profile)
  const papers = Object.fromEntries(Object.entries(PAPERS).map(([k, v]) => [k, v.label]))
  box.replaceChildren(
    sec('用紙',
      selRow('用紙', d.page.paper, papers, v => {
        const p = PAPERS[v]
        d.page.paper = v
        if (v !== 'CUSTOM') { d.page.width = p.w; d.page.height = p.h }
        commit('page'); fitPage()
      }),
      numRow('幅', d.page.width, v => { d.page.width = v; d.page.paper = 'CUSTOM'; commit('page') }, { min: 20, max: 1000 }),
      numRow('高さ', d.page.height, v => { d.page.height = v; d.page.paper = 'CUSTOM'; commit('page') }, { min: 20, max: 1000 })
    ),
    sec('出力先（プリンタ）',
      selRow('出力先', d.profile, Object.fromEntries(Object.values(PROFILES).map(p => [p.id, p.label])), v => { d.profile = v; commit('page') }),
      h('p', { class: 'note' }, prof.note),
      checkRow('出力先の格子に合わせて表示する', state.previewSnap, v => { state.previewSnap = v; bumpVersion(); renderPagePanel() }),
      numRow('点どうしの最小距離', d.settings.minDist != null ? d.settings.minDist : prof.minDist, v => { d.settings.minDist = v; commit('page') }, { min: 0, max: 5 }),
      h('p', { class: 'note' }, 'これより近い点は、大きい方を残して1つにまとめます（重なった点で用紙が破れるのを防ぎます）。0 でまとめません。')
    ),
    sec('点字の寸法',
      numRow('点の間隔（横）', d.settings.braille.dotPitchX, v => { d.settings.braille.dotPitchX = v; commit('page') }, { min: 1, max: 5 }),
      numRow('点の間隔（縦）', d.settings.braille.dotPitchY, v => { d.settings.braille.dotPitchY = v; commit('page') }, { min: 1, max: 5 }),
      numRow('マスの間隔', d.settings.braille.cellPitch, v => { d.settings.braille.cellPitch = v; commit('page') }, { min: 3, max: 12 }),
      numRow('行の間隔', d.settings.braille.linePitch, v => { d.settings.braille.linePitch = v; commit('page') }, { min: 5, max: 20 })
    ),
    sec('点字のマス目・読み',
      checkRow('点字のマス目と行・マスの番号を表示', state.showCells, v => { state.showCells = v; requestRender(); savePrefs() }),
      checkRow('点字を置くときマス目に合わせる', state.snapCells, v => { state.snapCells = v; savePrefs() }),
      checkRow('点字の読み（墨字）を重ねて表示', state.showReading, v => { state.showReading = v; requestRender(); savePrefs() }),
      checkRow('B5 で ESA721 の範囲いっぱい（725 行）まで使う（エーデルの図は 684 行まで）', !!d.settings.edlFullArea, v => { d.settings.edlFullArea = v; commit('page') })
    ),
    sec('方眼・吸着',
      checkRow('方眼を表示', state.showGrid, v => { state.showGrid = v; requestRender(); savePrefs() }),
      checkRow('方眼に吸着して描く', state.snapGrid, v => { state.snapGrid = v; savePrefs() }),
      numRow('方眼の間隔', state.gridSize, v => { state.gridSize = v; requestRender(); savePrefs() }, { min: 1, max: 50, step: 0.5 })
    ),
    sec('画面',
      selRow('配色', document.documentElement.dataset.theme || 'auto', { auto: '端末の設定に合わせる', light: 'ライト', dark: 'ダーク' }, v => {
        if (v === 'auto') delete document.documentElement.dataset.theme
        else document.documentElement.dataset.theme = v
        savePrefs()
      })
    )
  )
}

// ================= 点字の入力 =================
function editBraille (obj, at) {
  const isNew = !obj
  let text = obj ? obj.text || '' : ''
  const ta = h('textarea', { 'aria-label': '点字にする文（かな・英数字）', placeholder: 'かな・英数字で入力（例：とうきょう えき）。漢字は読みをかなで。' }, text)
  const prev = h('div', { class: 'braille-preview', role: 'region', 'aria-label': '点字の表示' })
  const warn = h('p', { class: 'note', 'aria-live': 'polite' })
  const readback = h('p', { class: 'note' })
  const keysBox = h('div', { class: 'sixkey' })
  const pressed = new Set()
  const update = () => {
    const { cells, unknown } = kanaToBraille(ta.value)
    prev.textContent = cells.map(c => c === -1 ? '\n' : bitsToUnicode(c)).join('') || '　'
    warn.textContent = unknown.length ? `点字にできない文字：${unknown.join(' ')}（漢字は読みのかなで入力してください）` : ''
    readback.textContent = cells.length ? `点字の読み（確認用）：${brailleToKana(cells)}（${cells.filter(c => c !== -1).length} マス）` : ''
  }
  ta.addEventListener('input', update)
  // 6点入力：F D S J K L を同時に押して離すと1マス
  let sixMode = false
  const sixBtn = h('button', { type: 'button', class: 'btn', 'aria-pressed': 'false' }, '6点入力 オフ')
  const chord = new Set()
  sixBtn.addEventListener('click', () => {
    sixMode = !sixMode
    sixBtn.setAttribute('aria-pressed', String(sixMode))
    sixBtn.textContent = sixMode ? '6点入力 オン（F D S J K L）' : '6点入力 オフ'
    ta.focus()
  })
  ta.addEventListener('keydown', (e) => {
    if (!sixMode || e.ctrlKey || e.metaKey || e.altKey) return
    const k = e.key.toLowerCase()
    if (SIX_KEY[k]) { e.preventDefault(); chord.add(SIX_KEY[k]); pressed.add(SIX_KEY[k]); return }
    if (k === ' ' && !chord.size) { e.preventDefault(); insert('⠀') }
  })
  ta.addEventListener('keyup', (e) => {
    if (!sixMode) return
    const k = e.key.toLowerCase()
    if (SIX_KEY[k]) {
      e.preventDefault()
      pressed.delete(SIX_KEY[k])
      if (!pressed.size && chord.size) {
        let b = 0; for (const d of chord) b |= 1 << (d - 1)
        chord.clear()
        insert(bitsToUnicode(b))
      }
    }
  })
  function insert (s) {
    const st = ta.selectionStart; const en = ta.selectionEnd
    ta.value = ta.value.slice(0, st) + s + ta.value.slice(en)
    ta.selectionStart = ta.selectionEnd = st + s.length
    update()
  }
  // タッチ用の6点ボタン
  const touchChord = new Set()
  for (const d of [1, 4, 2, 5, 3, 6]) {
    const b = h('button', { type: 'button', 'aria-pressed': 'false', 'aria-label': `${d}の点` }, String(d))
    b.addEventListener('click', () => { touchChord.has(d) ? touchChord.delete(d) : touchChord.add(d); b.setAttribute('aria-pressed', String(touchChord.has(d))) })
    keysBox.append(b)
  }
  const touchPut = h('button', { type: 'button', class: 'btn' }, 'このマスを入れる')
  touchPut.addEventListener('click', () => {
    let b = 0; for (const d of touchChord) b |= 1 << (d - 1)
    insert(bitsToUnicode(b)); touchChord.clear(); $$('button', keysBox).forEach(x => x.setAttribute('aria-pressed', 'false'))
  })
  update()
  const body = h('div', {},
    ta, h('div', { class: 'row' }, sixBtn),
    h('p', { class: 'note', 'aria-hidden': 'true' }, '点字の表示：'), prev, readback, warn,
    h('details', {}, h('summary', {}, 'タッチで6点入力'), keysBox, h('div', { class: 'btns', style: 'justify-content:center' }, touchPut)),
    h('p', { class: 'note' }, '分かち書き・マスあけは入力したとおりになります。Unicode 点字（⠁など）もそのまま使えます。')
  )
  setTimeout(() => ta.focus(), 50)
  dialog(isNew ? '点字を置く' : '点字を編集', body, [{ label: 'キャンセル', value: 'no' }, ...(isNew ? [] : [{ label: '削除', value: 'del' }]), { label: 'OK', value: 'ok', primary: true }]).then(r => {
    if (r === 'del' && obj) { state.selection = new Set([obj.id]); deleteSelection(); return }
    if (r !== 'ok') return
    text = ta.value
    if (!text.trim()) return
    if (isNew) {
      const o = addObject({ type: 'braille', x: at[0], y: at[1], text, dot: 'M', style: { ...defaultStyle() } })
      if (o) { state.selection = new Set([o.id]); commit() }
    } else {
      replaceObject(obj.id, { ...obj, text })
      commit()
    }
  })
}

// ================= ファイル =================
function pickFile (accept, handler, multiple = false) {
  const inp = $('#file-input')
  inp.accept = accept
  inp.multiple = multiple
  inp.value = ''
  inp.onchange = () => { if (inp.files.length) handler(multiple ? [...inp.files] : inp.files[0]) }
  inp.click()
}

const extOf = name => ((name.match(/\.([^.]+)$/) || [])[1] || '').toLowerCase()
const stem = name => name.replace(/\.[^.]+$/, '')
const OPEN_ACCEPT = '.tenzoo,.json,.edl,.ezi,.sebk,image/*,.svg'

// 複数のファイルを開く（.edl と .ezi の組は1つの図としてまとめる）
async function openFiles (files) {
  files = [...files]
  const edls = files.filter(f => extOf(f.name) === 'edl'); const ezis = files.filter(f => extOf(f.name) === 'ezi')
  if (edls.length === 1 && ezis.length === 1) return openEdel(await readLatin1(edls[0]), await readLatin1(ezis[0]), stem(edls[0].name))
  for (const f of files) await openFile(f)
}
async function readLatin1 (file) { return bytesToLatin1(new Uint8Array(await file.arrayBuffer())) }

async function openFile (file) {
  const name = file.name
  const ext = extOf(name)
  try {
    if (ext === 'tenzoo' || ext === 'json') {
      const doc = JSON.parse(await file.text())
      loadDocument(doc)
      fitPage()
      announce(`「${state.doc.meta.title}」を開きました。${docSummary()}`, true)
      return
    }
    if (ext === 'edl') {
      const text = await readLatin1(file)
      if (!isEDL(text)) throw new Error('エーデルの点図ファイルではないようです。')
      return openEdel(text, null, stem(name))
    }
    if (ext === 'ezi') {
      const text = await readLatin1(file)
      if (!isEZI(text)) throw new Error('エーデルの図形データ（.ezi）ではないようです。')
      return openEdel(null, text, stem(name))
    }
    if (ext === 'sebk') {
      const entries = parseSEBK(await readLatin1(file))
      const edl = entries.find(e => /\.edl$/i.test(e.name)); const ezi = entries.find(e => /\.ezi$/i.test(e.name))
      return openEdel(edl && edl.body, ezi && ezi.body, stem(name))
    }
    if (ext === 'svg') return importImage(file)
    if (file.type.startsWith('image/') || ['png', 'jpg', 'jpeg', 'gif', 'bmp', 'webp'].includes(ext)) return importImage(file)
    throw new Error('この種類のファイルは開けません。')
  } catch (e) {
    console.error(e)
    toast('開けませんでした：' + e.message, 6000)
  }
}

// エーデルのデータ（.edl・.ezi・.sebk）を開く
async function openEdel (edlText, eziText, title) {
  const r = await dialog('エーデルのデータを開く', h('p', {}, '新しい図として開くか、今の図にレイヤとして追加するかを選んでください。'),
    [{ label: 'キャンセル', value: 'no' }, { label: 'レイヤとして追加', value: 'layer' }, { label: '新しい図として開く', value: 'new', primary: true }])
  if (r !== 'new' && r !== 'layer') return
  const groups = [] // [{ name, visible, side, objects }]
  let paper = 'B5'; let msg = ''
  if (edlText && !eziText) {
    const edl = parseEDL(edlText)
    paper = edl.paper
    edl.pages.forEach((pg, i) => {
      const pre = edl.pages.length > 1 ? `${title} ${i + 1}ページ` : title
      const front = pg.dots.filter(d => d.side === 'front'); const back = pg.dots.filter(d => d.side === 'back')
      const mk = ds => ({ id: newId(), type: 'dots', source: 'edl', points: ds.map(d => [d.x, d.y, d.size]), style: defaultStyle() })
      if (front.length) groups.push({ name: pre, visible: i === 0, objects: [mk(front)] })
      if (back.length) groups.push({ name: pre + '（裏面）', visible: i === 0, side: 'back', objects: [mk(back)] })
    })
    const n = edl.pages.reduce((a, p) => a + p.dots.length, 0)
    msg = `エーデルの点図（点 ${n} 個${edl.pages.length > 1 ? `、${edl.pages.length} ページ。2ページ目以降は隠したレイヤです` : ''}）を読み込みました。`
  } else {
    const c = combineEdlEzi(edlText, eziText)
    paper = c.paper
    for (const l of c.layers) groups.push({ ...l, name: `${title}：${l.name}` })
    msg = `エーデルの図を読み込みました。線 ${c.stats.elements} 本から図形 ${c.stats.shown} 個` +
      (edlText ? `、.edl だけにある点 ${c.stats.restDots} 個` : '') + (c.stats.hidden ? `、.edl に無い図形 ${c.stats.hidden} 個（隠したレイヤ）` : '') + '。'
  }
  if (r === 'new') {
    const doc = newDocument(paper === 'A4' ? 'EA4' : 'EB5')
    doc.meta.title = title
    doc.profile = 'esa721'
    doc.layers = []
    groups.forEach((g, i) => doc.layers.push({ ...newLayer(g.name, i), visible: g.visible !== false, side: g.side || 'front', objects: g.objects }))
    if (!doc.layers.length) doc.layers.push(newLayer('レイヤ 1'))
    doc.activeLayer = doc.layers[0].id
    doc.settings.minDist = 0 // 取り込んだ点の位置関係を保つ
    loadDocument(doc)
    fitPage()
  } else {
    for (const g of groups) {
      const l = addLayer(g.name)
      l.visible = g.visible !== false; l.side = g.side || 'front'
      l.objects.push(...g.objects)
    }
    commit('layers')
  }
  announce(msg, true)
}

function saveTenzoo () {
  download(serializeDocument(state.doc), baseName() + '.tenzoo', 'application/json')
  state.dirty = false
  announce('tenzoo 形式で保存しました。', true)
}

function exportDots (layerIds, merge = true, profileId) {
  return documentDots(state.doc, { layerIds, merge, profileId })
}
const frontOnly = ds => ds.filter(d => d.side !== 'back')

// エーデル形式で保存する（.edl、.edl+.ezi、.sebk）
// ESA721 に送るデータ（.esa）を保存する
function saveESA (ids, name, merge, opts) {
  const paper = edlPaperOf(state.doc.page, true)
  const full = edlPaperOf(state.doc.page, !!state.doc.settings.edlFullArea)
  const dots = exportDots(ids, merge, 'esa721').filter(d => d.side !== 'back')
  const best = new Map()
  let out = 0
  for (const d of dots) {
    const ux = Math.round(d.x / EDL_UNIT_X); const uy = Math.round(d.y / EDL_UNIT_Y)
    if (ux < 0 || uy < 0 || ux > paper.area.x || uy > full.area.y) { out++; continue }
    const k = { S: 1, M: 2, L: 3 }[d.size] || 2
    const key = ux + ',' + uy
    if (!best.has(key) || best.get(key).k < k) best.set(key, { ux, uy, k })
  }
  if (!best.size) throw new Error('書き出す点がありません。')
  const { bytes, dropped } = encodeESA([[...best.values()]], { bySize: opts.bySize, aspect: opts.aspect, lastRow: paper.area.y })
  download(bytes, name + '.esa', 'application/octet-stream')
  announce(`ESA721 用のデータ（点 ${best.size - dropped} 個${opts.bySize ? '、点種別印刷' : ''}${opts.aspect != null ? `、縦横比の補正 ${opts.aspect}%` : ''}）を保存しました。${out + dropped ? `用紙の範囲外の点 ${out + dropped} 個を省きました。` : ''}`, true, 6000)
}

function saveEdel (ids, name, kind = 'edl', merge = true) {
  const paper = edlPaperOf(state.doc.page, !!state.doc.settings.edlFullArea)
  const dots = exportDots(ids, merge, 'esa721')
  const objs = state.doc.layers.filter(l => ids.includes(l.id) && l.side !== 'back').flatMap(l => l.objects)
  const { edl, ezi } = buildEdelFiles(dots, objs, paper)
  const warn = [...edl.warnings]
  if (kind === 'sebk') {
    download(latin1ToBytes(writeSEBK(edl.text, ezi.text)), name + '.sebk', 'application/octet-stream')
  } else {
    download(latin1ToBytes(edl.text), name + '.edl', 'application/octet-stream')
    if (kind === 'ezi') setTimeout(() => download(latin1ToBytes(ezi.text), name + '.ezi', 'application/octet-stream'), 400)
  }
  if (kind !== 'edl' && ezi.skipped) warn.push(`点・点字・塗りの図形 ${ezi.skipped} 個は .ezi では表せないため、.edl だけに入れました。`)
  announce(`エーデル形式（${kind === 'sebk' ? '.sebk' : kind === 'ezi' ? '.edl と .ezi' : '.edl'}、${paper.name}、点 ${edl.count} 個）で保存しました。${warn.join(' ')}`, true, warn.length ? 7000 : 3500)
}

async function exportDialog () {
  const opts = { format: 'edl', layers: 'visible', merge: true, dotScale: 1, dpi: 300, perLayer: false, bySize: false, aspect: 'none' }
  const body = h('div', {})
  const draw = () => {
    body.replaceChildren(
      selRow('形式', opts.format, { edl: 'エーデル（.edl）', ezi: 'エーデル（.edl＋.ezi）', sebk: 'エーデル（.sebk）', esa: 'ESA721 送信用データ（.esa）', pdf: 'PDF', svg: 'SVG', png: 'PNG', tenzoo: 'tenzoo' }, v => { opts.format = v; draw() }),
      h('p', { class: 'note' }, {
        edl: 'エーデルの点図（.edl）。ESA721 での印刷や、エーデルでの表示に使えます。点の位置は ESA721 の格子に合わせ、用紙は「出力」の設定から B5 か A4 を選びます。',
        ezi: '.edl と、線・円弧を編集できる図形データ .ezi の組（試験的）。エーデルで線を編集し直したいときに。',
        sebk: '.edl と .ezi を1つにまとめた .sebk（試験的）。',
        esa: 'ESA721 にそのまま送れるプロッタのデータ（edlprt・エーデルの印刷ソフト EBP と同じ書式）。tenzoo からは直接送りません。Windows では「copy /b 図.esa COM1」などで送れます。',
        pdf: '実寸の PDF。立体コピー（カプセルペーパー）の原稿や、確認用の印刷に。',
        svg: '実寸の SVG（ベクトル）。他のソフトでの加工や、他の点字プリンタのドライバに。',
        png: '実寸の画像（解像度指定）。立体コピーの原稿などに。',
        tenzoo: 'tenzoo 形式。図形・レイヤ・下絵をすべて保存します（あとで編集するとき用）。'
      }[opts.format]),
      opts.format !== 'tenzoo' && segRow('対象', opts.layers, { visible: '見えているレイヤ', all: 'すべてのレイヤ', active: '作業中のレイヤ' }, v => { opts.layers = v; draw() }),
      opts.format !== 'tenzoo' && checkRow('レイヤごとに別のファイルにする', opts.perLayer, v => { opts.perLayer = v }),
      opts.format !== 'tenzoo' && checkRow('近すぎる点をまとめる', opts.merge, v => { opts.merge = v }),
      ['pdf', 'png', 'svg'].includes(opts.format) && rangeRow('点の大きさの倍率', opts.dotScale, v => { opts.dotScale = v }, { min: 0.5, max: 2, step: 0.05, unit: '倍' }),
      opts.format === 'esa' && checkRow('点種別印刷（中→小→大の順に1種類ずつ打つ。EBP と同じ）', opts.bySize, v => { opts.bySize = v }),
      opts.format === 'esa' && selRow('縦横比の補正（EBP）', opts.aspect, { none: 'しない', 0: '0%（3行下げるだけ）', 50: '50%', 100: '100%（エーデルの図向け）' }, v => { opts.aspect = v }),
      opts.format === 'png' && selRow('解像度', String(opts.dpi), { 150: '150 dpi', 300: '300 dpi', 600: '600 dpi' }, v => { opts.dpi = +v })
    )
  }
  draw()
  const r = await dialog('書き出し', body, [{ label: 'キャンセル', value: 'no' }, { label: '書き出す', value: 'ok', primary: true }])
  if (r !== 'ok') return
  if (opts.format === 'tenzoo') return saveTenzoo()
  const layerSets = []
  const pick = opts.layers === 'all' ? state.doc.layers : opts.layers === 'active' ? [activeLayer(state.doc)] : state.doc.layers.filter(l => l.visible)
  if (opts.perLayer) for (const l of pick) layerSets.push({ name: baseName() + '_' + l.name, ids: [l.id] })
  else layerSets.push({ name: baseName(), ids: pick.map(l => l.id) })
  try {
    if (opts.format === 'pdf') {
      const pages = layerSets.map(s => ({ dots: frontOnly(exportDots(s.ids, opts.merge, state.doc.profile === 'esa721' ? 'esa721' : undefined)), page: state.doc.page }))
      download(dotsToPDF(pages, { dotScale: opts.dotScale }), baseName() + '.pdf', 'application/pdf')
      return announce('PDF を書き出しました。', true)
    }
    for (const [i, s] of layerSets.entries()) {
      if (i) await new Promise(resolve => setTimeout(resolve, 400)) // 連続ダウンロードの間をあける
      if (['edl', 'ezi', 'sebk'].includes(opts.format)) saveEdel(s.ids, s.name, opts.format, opts.merge)
      else if (opts.format === 'esa') saveESA(s.ids, s.name, opts.merge, { bySize: opts.bySize, aspect: opts.aspect === 'none' ? null : +opts.aspect })
      else if (opts.format === 'svg') download(dotsToSVG(frontOnly(exportDots(s.ids, opts.merge)), state.doc.page, { dotScale: opts.dotScale, title: s.name }), s.name + '.svg', 'image/svg+xml')
      else if (opts.format === 'png') download(await dotsToPNG(frontOnly(exportDots(s.ids, opts.merge)), state.doc.page, opts.dpi, { dotScale: opts.dotScale }), s.name + '.png', 'image/png')
    }
    if (['svg', 'png'].includes(opts.format)) announce(`${opts.format.toUpperCase()} を書き出しました。`, true)
  } catch (e) { toast('書き出せませんでした：' + e.message, 5000) }
}

function printDoc () {
  const svg = dotsToSVG(exportDots(state.doc.layers.filter(l => l.visible).map(l => l.id), true), state.doc.page)
  const p = state.doc.page
  const frame = h('iframe', { style: 'position:fixed;right:0;bottom:0;width:0;height:0;border:0', title: '印刷用' })
  document.body.append(frame)
  const d = frame.contentDocument
  d.open()
  d.write(`<!doctype html><html><head><meta charset="utf-8"><title>${baseName()}</title><style>@page{size:${p.width}mm ${p.height}mm;margin:0}html,body{margin:0}svg{display:block;width:${p.width}mm;height:${p.height}mm}</style></head><body>${svg.replace(/^<\?xml[^>]*>/, '')}</body></html>`)
  d.close()
  setTimeout(() => { frame.contentWindow.focus(); frame.contentWindow.print(); setTimeout(() => frame.remove(), 2000) }, 300)
}

async function newDoc () {
  if (state.dirty && !(await confirmDlg('保存していない変更があります。新しい図を作りますか？'))) return
  const body = h('div', {})
  let paper = 'EB5'; let profile = 'esa721'
  body.append(
    selRow('用紙', paper, Object.fromEntries(Object.entries(PAPERS).map(([k, v]) => [k, v.label])), v => { paper = v }),
    selRow('出力先', profile, Object.fromEntries(Object.values(PROFILES).map(p => [p.id, p.label])), v => { profile = v })
  )
  const r = await dialog('新規作成', body, [{ label: 'キャンセル', value: 'no' }, { label: '作成', value: 'ok', primary: true }])
  if (r !== 'ok') return
  const doc = newDocument(paper)
  doc.profile = profile
  loadDocument(doc)
  fitPage()
}

function helpDialog () {
  const rows = [
    ['V', '選択・移動'], ['P', '点'], ['L', '直線'], ['Y', '折れ線'], ['C', '曲線'], ['A', '円弧'], ['F', 'フリーハンド'], ['R / E', '四角 / 円'],
    ['Shift+R / E / F / Y', '範囲を塗る（四角 / 楕円 / 投げ縄 / 多角形）'], ['G', '囲まれた所を塗る'], ['B', '点字'], ['K', '記号（星・十字など）'], ['I', '点図の検査（近すぎる点・密集・範囲外・点字にかかる線）'], ['X', '消しゴム'], ['H・Space押しながら', '表示の移動'],
    ['矢印キー（用紙で）', 'カーソルを 1mm 移動（Shift 5mm、Ctrl 10mm）。選択中の図形があるときは図形を 0.5mm 移動（Shift 5mm）'],
    ['Enter / Space（用紙で）', 'カーソルの位置で道具を使う：点を打つ、始点・終点を置く、頂点を置く、塗る、点字を置く、図形を選ぶ'],
    ['Shift+Enter / Ctrl+Enter', '折れ線・曲線を終える / 閉じて終える'], ['Backspace（用紙で）', '点を消す（点の道具）、最後の頂点を取り消す'],
    ['W', '現在の状態（道具・レイヤ・カーソル位置とそこにある図形・選択中の図形）を読み上げ'], ['Q', '図の概要を読み上げ'],
    ['N', '数値を指定して図形を追加'], ['M', 'カーソルを座標で移動'],
    ['Ctrl+Z / Ctrl+Y', '元に戻す / やり直す'], ['Ctrl+C / V / D', 'コピー / 貼り付け / 複製'], ['Ctrl+A', '作業中レイヤの図形をすべて選択'],
    ['Delete', '選択した図形を削除'], ['Escape', '描きかけの取り消し、選択の解除'],
    ['+ / - / 0', '拡大 / 縮小 / 用紙全体'], ['Ctrl+S', 'tenzoo 形式で保存'], ['Ctrl+O', '開く']
  ]
  dialog('使い方', h('div', { class: 'help' },
    h('p', {}, '点図は「図形（ベクトル）」として描き、書き出すときに点にします。点の間隔や面の表現は、あとからいつでも変えられます。'),
    h('p', {}, 'スマートフォン・タブレットでは、2本指で拡大縮小・移動できます。右上のパネルボタンで設定パネルを開きます。'),
    h('h3', {}, 'スクリーンリーダでの使い方'),
    h('p', {}, '用紙（描画領域）にフォーカスを移し、矢印キーでカーソルを動かして Enter で点・頂点を置くと、マウスなしで点・直線・折れ線・円弧・四角・円・範囲の塗り・点字・消去ができます。カーソルの座標とそこにある図形は自動で読み上げます。'),
    h('p', {}, '「N」で座標を数値で指定して図形を追加できます。設定パネルの「一覧」タブで、すべての図形をことばで確認・選択し、「図形」タブで位置・大きさ・点の間隔・面の表現を数値で変更できます。フリーハンドなど一部の道具はマウス・タッチ専用です。'),
    h('table', {}, ...rows.map(([k, v]) => h('tr', {}, h('td', {}, h('kbd', {}, k)), h('td', {}, v))))
  ))
}
function aboutDialog () {
  dialog('tenzoo について', h('div', {},
    h('p', {}, 'tenzoo は、ブラウザだけで動く点図（触図）エディタです。インストール不要で、データはこの端末の中だけで処理されます（サーバーには送られません）。'),
    h('p', {}, 'エーデル形式（.edl）の読み書き、レイヤ、ベクトル図形、17 種類の面の表現、画像の下絵・自動点図化、SVG 取り込み、PDF・SVG・PNG への書き出しに対応しています。'),
    h('p', { class: 'note' }, 'エーデルの形式（.edl・.ezi・.sebk）は公開仕様がないため、利用者による実物ファイルと ESA721 の説明書の解析、および tenji-editor［MIT License］の解析に基づいています。エーデルは藤野稔寛氏によるソフトウェアです。tenzoo はエーデルの作者とは関係のない独立したソフトウェアです。'),
    h('p', { class: 'note' }, 'tenzoo 0.2.0 / MIT License')
  ))
}

// ================= 全体の更新・初期化 =================
function showTab (name, open = true) {
  $$('.tabs [role="tab"]').forEach(b => { b.setAttribute('aria-selected', String(b.dataset.tab === name)); b.tabIndex = b.dataset.tab === name ? 0 : -1 })
  $$('.tab-body').forEach(b => { b.hidden = b.id !== 'tab-' + name })
  if (open && $('.workspace').classList.contains('panel-hidden')) { $('.workspace').classList.remove('panel-hidden'); setTimeout(resize, 0) }
  renderPanels()
}
function currentTab () { return $('.tabs [aria-selected="true"]').dataset.tab }
function renderPanels () {
  const t = currentTab()
  if (t === 'style') renderStylePanel()
  else if (t === 'list') renderListPanel()
  else if (t === 'layers') renderLayersPanel()
  else if (t === 'underlay') renderUnderlayPanel()
  else renderPagePanel()
}

function setTool (t) {
  if (isDrawingPoly()) finishPoly(false)
  cancelTool()
  state.tool = t
  $$('#toolbar [data-tool]').forEach(b => { b.setAttribute('aria-pressed', String(b.dataset.tool === t)); b.tabIndex = b.dataset.tool === t ? 0 : -1 })
  canvas.style.cursor = t === 'pan' ? 'grab' : t === 'select' ? 'default' : 'crosshair'
  hint(TOOL_HINTS[t])
  announce(`道具：${TOOL_NAMES[t] || t}。${TOOL_HINTS[t] || ''}`)
  if (t !== 'select') { state.selection.clear() }
  if (currentTab() === 'style') renderStylePanel()
  requestRender()
}

function updateChrome () {
  $('#btn-undo').disabled = !canUndo()
  $('#btn-redo').disabled = !canRedo()
  $('#btn-zoom-fit').textContent = Math.round(state.view.zoom / (96 / 25.4) * 100) + '%'
  $('#doc-title').textContent = state.doc.meta.title || '無題'
  document.title = `${state.doc.meta.title || '無題'} - tenzoo`
}

on((what) => {
  if (what && what.toast) { toast(what.toast); return }
  if (what === 'view') { updateChrome(); return }
  bumpVersion()
  updateChrome()
  status()
  if (what === 'transient') return
  renderPanels()
  scheduleAutosave()
})

// ---- 自動保存（この端末のブラウザ内）
let autosaveTimer
function scheduleAutosave () {
  clearTimeout(autosaveTimer)
  autosaveTimer = setTimeout(() => {
    try { localStorage.setItem('tenzoo:autosave', serializeDocument(state.doc)) } catch (e) { /* 容量超過などは無視 */ }
  }, 1500)
}
function savePrefs () {
  try {
    localStorage.setItem('tenzoo:prefs', JSON.stringify({ showGrid: state.showGrid, snapGrid: state.snapGrid, showCells: state.showCells, snapCells: state.snapCells, showReading: state.showReading, gridSize: state.gridSize, theme: document.documentElement.dataset.theme || 'auto', panel: window.matchMedia('(max-width: 720px)').matches ? undefined : !$('.workspace').classList.contains('panel-hidden') }))
  } catch (e) { }
}
function loadPrefs () {
  try {
    const p = JSON.parse(localStorage.getItem('tenzoo:prefs') || '{}')
    if (p.showGrid != null) state.showGrid = p.showGrid
    if (p.snapGrid != null) state.snapGrid = p.snapGrid
    if (p.gridSize) state.gridSize = p.gridSize
    for (const k of ['showCells', 'snapCells', 'showReading']) if (p[k] != null) state[k] = p[k]
    if (p.theme && p.theme !== 'auto') document.documentElement.dataset.theme = p.theme
    // スマートフォンでは、はじめはパネルを閉じておく（図が見えるように）
    if (p.panel === false || (p.panel == null && window.matchMedia('(max-width: 720px)').matches)) $('.workspace').classList.add('panel-hidden')
  } catch (e) { }
}

// ---- キー操作
// 用紙（キャンバス）にフォーカスがあるとき：矢印でカーソル、Enter・Space で道具を使う
function cursorMoved (c) {
  clearTimeout(cursorSayTimer)
  cursorSayTimer = setTimeout(() => {
    const info = cursorInfo()
    say(`x ${+c[0].toFixed(1)}、y ${+c[1].toFixed(1)}${info ? '、' + info : ''}`)
  }, 220)
}
function whereAmI () {
  const c = state.cursor
  const sel = selectedObjects()
  const parts = [`道具：${TOOL_NAMES[state.tool]}`, `作業中のレイヤ：${activeLayer(state.doc).name}`]
  if (c) parts.push(`カーソル x ${+c[0].toFixed(1)}、y ${+c[1].toFixed(1)}${cursorInfo() ? '、' + cursorInfo() : ''}`)
  else parts.push('カーソルは出ていません（用紙で矢印キーを押すと出ます）')
  if (sel.length === 1) parts.push(`選択中：${describeObject(sel[0], state.doc)}`)
  else if (sel.length) parts.push(`選択中の図形 ${sel.length} 個`)
  announce(parts.join('。') + '。')
}

function onKey (e) {
  const tag = (e.target.tagName || '').toLowerCase()
  if (['input', 'textarea', 'select'].includes(tag) || $('#dlg').open) return
  const k = e.key; const ctrl = e.ctrlKey || e.metaKey
  const onCanvas = document.activeElement === canvas
  // 用紙の上でのキーボード描画
  if (onCanvas && !e.altKey) {
    const kb = state.cursor || hasKeyboardDraft()
    if (k.startsWith('Arrow') && !(state.tool === 'select' && state.selection.size && !state.cursor)) {
      e.preventDefault(); keyboardCursor(k, { shift: e.shiftKey, ctrl }); return
    }
    if (k === 'Enter') {
      e.preventDefault()
      if (!kb && isDrawingPoly()) { finishPoly(state.tool === 'fillpoly'); return } // マウスで描いた折れ線を終える
      keyboardAction(ctrl ? 'close' : e.shiftKey ? 'finish' : 'put'); return
    }
    if (k === ' ' && (kb || state.tool === 'dot')) { e.preventDefault(); keyboardAction('put'); return }
    if (k === 'Backspace' && (state.tool === 'dot' || hasKeyboardDraft())) { e.preventDefault(); keyboardAction('back'); return }
  }
  if (ctrl) {
    const lk = k.toLowerCase()
    if (lk === 'z' && !e.shiftKey) { e.preventDefault(); doUndo() } else if (lk === 'y' || (lk === 'z' && e.shiftKey)) { e.preventDefault(); doRedo() } else if (lk === 'c') { const n = copySelection(); if (n) announce(`${n} 個コピーしました。`) } else if (lk === 'x') { if (copySelection()) { deleteSelection(); announce('切り取りました。') } } else if (lk === 'v') { e.preventDefault(); paste(); announce(`${state.selection.size} 個貼り付けました。`) } else if (lk === 'd') { e.preventDefault(); duplicateSelection(); announce('複製しました。') } else if (lk === 'a') { e.preventDefault(); setTool('select'); selectAll(); announce(`作業中のレイヤの図形 ${state.selection.size} 個を選択しました。`) } else if (lk === 's') { e.preventDefault(); saveTenzoo() } else if (lk === 'o') { e.preventDefault(); pickFile(OPEN_ACCEPT, openFiles, true) }
    return
  }
  if (k === ' ' && state.tool !== 'dot') { if (!e.repeat) setSpace(true); e.preventDefault(); return }
  if (k === 'Escape') {
    if (isDrawingPoly() || hasKeyboardDraft()) { cancelTool(); announce('描きかけを取り消しました。') } else if (state.selection.size) { state.selection.clear(); notify('selection'); announce('選択を解除しました。') }
    return
  }
  if (k === 'Enter' && isDrawingPoly()) { finishPoly(state.tool === 'fillpoly'); return }
  if ((k === 'Delete' || k === 'Backspace') && state.selection.size) { e.preventDefault(); const n = state.selection.size; deleteSelection(); announce(`${n} 個削除しました。`); return }
  if (k.startsWith('Arrow') && state.selection.size) {
    e.preventDefault()
    const s = e.shiftKey ? 5 : 0.5
    const d = { ArrowLeft: [-s, 0], ArrowRight: [s, 0], ArrowUp: [0, -s], ArrowDown: [0, s] }[k]
    transformSelection([1, 0, 0, 1, d[0], d[1]])
    commit()
    const b = selectionBox()
    if (b) say(`左 ${+b.minX.toFixed(1)}、上 ${+b.minY.toFixed(1)}`)
    return
  }
  if (k === '+' || k === '=') { zoomTo(state.view.zoom * 1.25); updateChrome(); return }
  if (k === '-') { zoomTo(state.view.zoom / 1.25); updateChrome(); return }
  if (k === '0') { fitPage(); updateChrome(); return }
  if (e.altKey) return
  const lk = k.toLowerCase()
  if (!e.shiftKey && lk === 'w') { whereAmI(); return }
  if (!e.shiftKey && lk === 'q') { announce(docSummary()); return }
  if (!e.shiftKey && lk === 'n') { addByNumbersDialog(); return }
  if (!e.shiftKey && lk === 'm') { moveCursorDialog(); return }
  if (!e.shiftKey && lk === 'i') { checkDialog(); return }
  const map = e.shiftKey
    ? { R: 'fillrect', E: 'fillellipse', F: 'filllasso', Y: 'fillpoly' }
    : { v: 'select', p: 'dot', l: 'line', y: 'polyline', c: 'curve', a: 'arc', f: 'freehand', r: 'rect', e: 'ellipse', g: 'bucket', b: 'braille', k: 'marker', x: 'eraser', h: 'pan' }
  const t = map[e.shiftKey ? k.toUpperCase() : lk]
  if (t) setTool(t)
}
function doUndo () { if (!canUndo()) { announce('元に戻す操作はありません。'); return } undo(); announce('元に戻しました。') }
function doRedo () { if (!canRedo()) { announce('やり直す操作はありません。'); return } redo(); announce('やり直しました。') }

// 点図の検査
async function checkDialog () {
  const r = checkDocument(state.doc)
  const items = r.items.map(it => h('li', {}, it.text))
  announce(r.summary)
  await dialog('点図の検査', h('div', {}, h('p', {}, r.summary), items.length ? h('ul', {}, ...items) : h('p', {}, '問題は見つかりませんでした。'),
    h('p', { class: 'note' }, '目安は navimap-assistant の検査（点どうし約1.7mm 以上、60×60 目盛りに 60 点まで）に合わせています。')))
}

// カーソルの位置を数値で指定
async function moveCursorDialog () {
  const c = state.cursor || [Math.round(state.doc.page.width / 2), Math.round(state.doc.page.height / 2)]
  const v = { x: c[0], y: c[1] }
  const body = h('div', {}, numRow('x', v.x, n => { v.x = n }, { min: 0, max: state.doc.page.width }), numRow('y', v.y, n => { v.y = n }, { min: 0, max: state.doc.page.height }))
  const r = await dialog('カーソルを移動', body, [{ label: 'キャンセル', value: 'no' }, { label: '移動', value: 'ok', primary: true }])
  if (r !== 'ok') return
  setCursor([v.x, v.y])
  canvas.focus()
  cursorMoved(state.cursor)
}

// 数値を指定して図形を追加（スクリーンリーダでも図を作れるように）
async function addByNumbersDialog () {
  const c = state.cursor || [20, 20]
  const v = { type: 'line', x1: c[0], y1: c[1], x2: c[0] + 40, y2: c[1], x: c[0], y: c[1], w: 40, h: 30, cx: c[0] + 20, cy: c[1] + 20, rx: 20, ry: 20, pts: '', text: '', fill: false, n: 6, r: 20 }
  const body = h('div', {})
  const types = { line: '直線', polyline: '折れ線', polygon: '多角形', regular: '正多角形', rect: '四角形', ellipse: '円・楕円', arc: '円弧', dots: '点', braille: '点字', marker: '記号' }
  const draw = () => {
    const kids = [selRow('図形', v.type, types, t => { v.type = t; draw(); setTimeout(() => $('#dlg [data-k="s:図形"]')?.focus(), 0) })]
    const N = (label, key, opts) => numRow(label, v[key], n => { v[key] = n }, { min: -1000, max: 1000, ...opts })
    const T = (label, key, ph) => { const ta = h('textarea', { 'aria-label': label, placeholder: ph }, v[key]); ta.addEventListener('input', () => { v[key] = ta.value }); return h('div', { class: 'geom' }, h('p', { class: 'note', 'aria-hidden': 'true' }, label), ta) }
    if (v.type === 'line') kids.push(N('始点 x', 'x1'), N('始点 y', 'y1'), N('終点 x', 'x2'), N('終点 y', 'y2'))
    else if (v.type === 'polyline' || v.type === 'polygon') kids.push(T('頂点の座標（mm）。x,y を空白で区切る', 'pts', '例：20,20 80,20 50,70'))
    else if (v.type === 'arc') kids.push(T('始点・終点・ふくらみの位置の3点（mm）', 'pts', '例：20,60 80,60 50,40'))
    else if (v.type === 'dots') kids.push(T('点の座標（mm）。x,y を空白で区切る', 'pts', '例：30,30 35,30 40,30'))
    else if (v.type === 'regular') kids.push(N('中心 x', 'cx'), N('中心 y', 'cy'), N('外接円の半径', 'r', { min: 1 }), N('角の数', 'n', { min: 3, max: 60, step: 1, unit: '個' }))
    else if (v.type === 'rect') kids.push(N('左', 'x'), N('上', 'y'), N('幅', 'w', { min: 0.1 }), N('高さ', 'h', { min: 0.1 }))
    else if (v.type === 'ellipse') kids.push(N('中心 x', 'cx'), N('中心 y', 'cy'), N('横半径', 'rx', { min: 0.1 }), N('縦半径', 'ry', { min: 0.1 }))
    else if (v.type === 'braille') { kids.push(N('左上 x', 'x'), N('左上 y', 'y'), T('点字にする文（かな・英数字）', 'text', '例：てんず')) }
    else if (v.type === 'marker') { kids.push(N('中心 x', 'x'), N('中心 y', 'y'), selRow('記号の形', v.shape || 'star', Object.fromEntries(Object.entries(MARKERS).map(([k, m]) => [k, m.label])), sh => { v.shape = sh })) }
    if (['polygon', 'regular', 'rect', 'ellipse'].includes(v.type)) kids.push(checkRow('内側を面で塗る（「図形」タブの面の設定を使います）', v.fill, b => { v.fill = b }))
    kids.push(h('p', { class: 'note' }, '座標は用紙の左上を原点とする mm です。線の点の大きさや間隔は「図形」タブの設定を使います。'))
    body.replaceChildren(...kids)
  }
  draw()
  const r = await dialog('数値を指定して図形を追加', body, [{ label: 'キャンセル', value: 'no' }, { label: '追加', value: 'ok', primary: true }])
  if (r !== 'ok') return
  const style = structuredClone(state.drawStyle)
  if (v.fill) style.fill = structuredClone(state.drawStyle.fill || state.fillStyle)
  let o = null
  const pts = parsePts(v.pts) || (v.type === 'dots' ? (() => { const n = String(v.pts).split(/[\s,;]+/).filter(Boolean).map(Number); return n.length === 2 && !n.some(isNaN) ? [[n[0], n[1]]] : null })() : null)
  switch (v.type) {
    case 'line': o = { type: 'path', closed: false, points: [[v.x1, v.y1], [v.x2, v.y2]], style }; break
    case 'polyline': case 'polygon': if (pts) o = { type: 'path', closed: v.type === 'polygon', points: pts, style }; break
    case 'arc': if (pts && pts.length === 3) o = { type: 'arc', points: pts, style }; break
    case 'dots': if (pts) o = { type: 'dots', points: pts.map(p => [p[0], p[1], state.dotSize]), style }; break
    case 'regular': {
      const P = []
      for (let i = 0; i < v.n; i++) { const t = -Math.PI / 2 + i * 2 * Math.PI / v.n; P.push([v.cx + v.r * Math.cos(t), v.cy + v.r * Math.sin(t)]) }
      o = { type: 'path', closed: true, points: P, style }
      break
    }
    case 'rect': o = { type: 'rect', x: v.x, y: v.y, w: v.w, h: v.h, rot: 0, style }; break
    case 'ellipse': o = { type: 'ellipse', cx: v.cx, cy: v.cy, rx: v.rx, ry: v.ry, rot: 0, style }; break
    case 'braille': if (v.text.trim()) o = { type: 'braille', x: v.x, y: v.y, text: v.text, dot: 'M', style }; break
    case 'marker': o = { type: 'marker', x: v.x, y: v.y, shape: v.shape || 'star', style: { ...style, dot: 'L', clear: 3.5 } }; break
  }
  if (!o) { announce('座標や文の入力が正しくないため、追加できませんでした。例：20,20 80,20 50,70', true); return }
  const obj = addObject(o)
  if (!obj) return
  state.selection = new Set([obj.id])
  commit()
  announce(`追加しました：${describeObject(obj, state.doc, { detail: false })}`, true)
}

function init () {
  loadPrefs()
  initTools({
    editBraille, toast, status, announce, cursorMoved,
    bboxOf: o => bboxOf(o, state.doc),
    afterCreate: (o) => { if (state.tool === 'braille') state.selection = new Set([o.id]) }
  })
  // 道具バー
  const toolBtns = $$('#toolbar [data-tool]')
  toolBtns.forEach(b => b.addEventListener('click', () => setTool(b.dataset.tool)))
  // 道具バー・タブ：矢印キーで移動（ロービングタブインデックス）
  const roving = (items, e, horizontal) => {
    const i = items.indexOf(document.activeElement)
    if (i < 0) return null
    const next = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[e.key]
    let j = null
    if (next != null && (horizontal ? ['ArrowLeft', 'ArrowRight'] : ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown']).includes(e.key)) j = (i + next + items.length) % items.length
    if (e.key === 'Home') j = 0
    if (e.key === 'End') j = items.length - 1
    if (j == null) return null
    e.preventDefault(); e.stopPropagation()
    items[j].focus()
    return items[j]
  }
  $('#toolbar').addEventListener('keydown', e => { const t = roving(toolBtns, e, false); if (t) { toolBtns.forEach(b => { b.tabIndex = b === t ? 0 : -1 }) } })
  const tabs = $$('.tabs [role="tab"]')
  tabs.forEach(b => b.addEventListener('click', () => showTab(b.dataset.tab)))
  $('.tabs').addEventListener('keydown', e => { const t = roving(tabs, e, true); if (t) showTab(t.dataset.tab) })
  // 上部バー
  $('#btn-undo').addEventListener('click', doUndo)
  $('#btn-redo').addEventListener('click', doRedo)
  $('#btn-zoom-in').addEventListener('click', () => { zoomTo(state.view.zoom * 1.25); updateChrome() })
  $('#btn-zoom-out').addEventListener('click', () => { zoomTo(state.view.zoom / 1.25); updateChrome() })
  $('#btn-zoom-fit').addEventListener('click', () => { fitPage(); updateChrome() })
  $('#sel-display').addEventListener('change', (e) => { state.display = e.target.value; requestRender() })
  $('#btn-export').addEventListener('click', exportDialog)
  $('#btn-panel').addEventListener('click', () => { $('.workspace').classList.toggle('panel-hidden'); savePrefs(); setTimeout(resize, 0) })
  $('#doc-title').addEventListener('click', async () => {
    const inp = h('input', { type: 'text', value: state.doc.meta.title || '', 'aria-label': '図の名前', style: 'width:100%;height:36px;border:1px solid var(--border);border-radius:6px;padding:0 8px;background:var(--surface)' })
    setTimeout(() => inp.select(), 30)
    const r = await dialog('図の名前', inp, [{ label: 'キャンセル', value: 'no' }, { label: 'OK', value: 'ok', primary: true }])
    if (r === 'ok' && inp.value.trim()) { state.doc.meta.title = inp.value.trim(); commit('meta') }
  })
  // メニュー
  const menu = $('#menu'); const mbtn = $('#btn-menu')
  const items = $$('[role="menuitem"]', menu)
  const closeMenu = (focusBtn) => { menu.hidden = true; mbtn.setAttribute('aria-expanded', 'false'); if (focusBtn) mbtn.focus() }
  const openMenu = (last = false) => { menu.hidden = false; mbtn.setAttribute('aria-expanded', 'true'); (last ? items[items.length - 1] : items[0]).focus() }
  mbtn.addEventListener('click', (e) => { e.stopPropagation(); menu.hidden ? openMenu() : closeMenu() })
  mbtn.addEventListener('keydown', e => { if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); openMenu(e.key === 'ArrowUp') } })
  document.addEventListener('click', (e) => { if (!menu.hidden && !menu.contains(e.target)) closeMenu() })
  menu.addEventListener('keydown', e => {
    const i = items.indexOf(document.activeElement)
    if (e.key === 'Escape' || e.key === 'Tab') { if (e.key === 'Escape') e.preventDefault(); closeMenu(e.key === 'Escape'); return }
    const j = { ArrowDown: i + 1, ArrowUp: i - 1, Home: 0, End: items.length - 1 }[e.key]
    if (j != null) { e.preventDefault(); items[(j + items.length) % items.length].focus() }
  })
  menu.addEventListener('click', (e) => {
    const cmd = e.target.dataset.cmd
    if (!cmd) return
    closeMenu(true)
    ;({
      new: newDoc,
      open: () => pickFile(OPEN_ACCEPT, openFiles, true),
      save: saveTenzoo,
      'save-edl': () => { try { saveEdel(state.doc.layers.filter(l => l.visible).map(l => l.id), baseName(), 'edl') } catch (err) { toast(err.message) } },
      'import-image': () => pickFile('image/*,.svg', importImage),
      'import-svg': () => pickFile('.svg,image/svg+xml', importSVG),
      'add-numeric': addByNumbersDialog,
      summary: () => announce(docSummary(), true),
      check: checkDialog,
      print: printDoc,
      help: helpDialog,
      about: aboutDialog
    })[cmd]?.()
  })
  // ドラッグ＆ドロップで開く
  const cw = $('#canvas-wrap')
  cw.addEventListener('dragover', e => { e.preventDefault() })
  cw.addEventListener('drop', e => { e.preventDefault(); if (e.dataTransfer.files.length) openFiles(e.dataTransfer.files) })

  document.addEventListener('keydown', onKey)
  document.addEventListener('keyup', e => { if (e.key === ' ') setSpace(false) })
  window.addEventListener('resize', resize)
  window.addEventListener('beforeunload', e => { if (state.dirty) { e.preventDefault(); e.returnValue = '' } })
  new ResizeObserver(resize).observe(cw)

  // 前回の作業を復元
  let restored = false
  try {
    const saved = localStorage.getItem('tenzoo:autosave')
    if (saved) {
      const d = JSON.parse(saved)
      if (d.layers && d.layers.some(l => l.objects.length) || (d.underlays && d.underlays.length)) {
        loadDocument(d)
        restored = true
      }
    }
  } catch (e) { }
  resize()
  fitPage()
  setTool('select')
  showTab('style', false)
  updateChrome()
  status()
  if (restored) toast('前回の作業を復元しました（この端末のブラウザに自動保存されています）。')
  else hint('道具を選んで描きはじめましょう。メニュー（☰）から .edl や画像も開けます。')

  // オフラインで使えるように（対応ブラウザのみ）
  if ('serviceWorker' in navigator && location.protocol === 'https:') {
    navigator.serviceWorker.register('sw.js').catch(() => {})
  }
  // 起動時の URL にファイルが指定されていれば開く（?open=サンプル）
  const q = new URLSearchParams(location.search).get('sample')
  if (q === 'demo') loadDemo()
}

// デモ用の図
function loadDemo () {
  const doc = newDocument('EB5')
  doc.meta.title = 'デモ：家と木'
  const L1 = doc.layers[0]; L1.name = '外形'
  const st = (patch = {}) => ({ ...defaultStyle(), ...patch })
  L1.objects.push(
    { id: newId(), type: 'rect', x: 40, y: 110, w: 70, h: 60, rot: 0, style: st() },
    { id: newId(), type: 'path', closed: true, points: [[35, 110], [75, 75], [115, 110]], style: st({ dot: 'L', spacing: 2.2 }) },
    { id: newId(), type: 'rect', x: 66, y: 140, w: 18, h: 30, rot: 0, style: st({ fill: { ...defaultFill(), pattern: 'hlines', spacing: 2.5 } }) },
    { id: newId(), type: 'path', closed: false, points: [[10, 170], [172, 170]], style: st({ dot: 'L' }) }
  )
  const L2 = { id: newId('L'), name: '木', visible: true, locked: false, color: '#15803d', objects: [] }
  L2.objects.push(
    { id: newId(), type: 'ellipse', cx: 145, cy: 115, rx: 20, ry: 24, rot: 0, style: st({ fill: { ...defaultFill(), pattern: 'hex', spacing: 3 } }) },
    { id: newId(), type: 'rect', x: 141, y: 139, w: 8, h: 31, rot: 0, style: st({ fill: { ...defaultFill(), pattern: 'vlines', spacing: 2.4, inset: 1.2 } }) }
  )
  const L3 = { id: newId('L'), name: '点字', visible: true, locked: false, color: '#7e22ce', objects: [] }
  L3.objects.push({ id: newId(), type: 'braille', x: 40, y: 190, text: 'いえ と き', dot: 'M', style: st() })
  doc.layers.push(L2, L3)
  loadDocument(doc)
  fitPage()
}

init()
