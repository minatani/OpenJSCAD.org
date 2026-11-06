// tenzoo のアプリ本体：パネル、ダイアログ、ファイル操作、キー操作
import {
  state, on, commit, notify, undo, redo, canUndo, canRedo, loadDocument, selectedObjects, replaceObject,
  deleteSelection, copySelection, paste, duplicateSelection, selectAll, arrange, flattenSelection,
  addLayer, deleteLayer, duplicateLayer, moveLayer, mergeLayers, moveSelectionToLayer, addObject, transformSelection,
  selectionBox
} from './store.js'
import { canvas, resize, fitPage, zoomTo, requestRender, bumpVersion, viewSize, currentDots } from './view.js'
import { initTools, TOOL_HINTS, finishPoly, cancelTool, isDrawingPoly, keyboardCursor, keyboardDot, setSpace } from './tools.js'
import { newDocument, newId, defaultStyle, defaultFill, bboxOf, activeLayer, isClosed } from './model.js'
import { PATTERNS, PATTERN_IDS, generatePattern } from './patterns.js'
import { PROFILES, PAPERS, DOT_SIZES, getProfile } from './profiles.js'
import { documentDots } from './raster.js'
import { kanaToBraille, bitsToUnicode, SIX_KEY, brailleToKana } from './braille.js'
import { parseEDL, writeEDL, bytesToLatin1, latin1ToBytes, isEDL } from './io/edl.js'
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
function toast (msg, ms = 3200) {
  const t = $('#toast')
  t.textContent = msg
  t.classList.add('show')
  clearTimeout(toastTimer)
  toastTimer = setTimeout(() => t.classList.remove('show'), ms)
}
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
  const inp = h('input', { type: 'number', min, max, step, value, 'aria-label': label })
  inp.addEventListener('change', () => { const v = parseFloat(inp.value); if (!isNaN(v)) onChange(Math.max(min, Math.min(max, v))) })
  return h('div', { class: 'row' }, h('label', {}, label), inp, h('span', { class: 'val' }, unit))
}
function rangeRow (label, value, onChange, { min = 0, max = 10, step = 0.1, unit = 'mm', live = false } = {}) {
  const val = h('span', { class: 'val' }, `${value}${unit}`)
  const inp = h('input', { type: 'range', min, max, step, value, 'aria-label': label })
  inp.addEventListener('input', () => { val.textContent = `${inp.value}${unit}`; if (live) onChange(parseFloat(inp.value), true) })
  inp.addEventListener('change', () => onChange(parseFloat(inp.value), false))
  return h('div', { class: 'row' }, h('label', {}, label), inp, val)
}
function selRow (label, value, options, onChange) {
  const sel = h('select', { 'aria-label': label }, ...Object.entries(options).map(([v, t]) => h('option', { value: v, selected: v === value }, t)))
  sel.addEventListener('change', () => onChange(sel.value))
  return h('div', { class: 'row' }, h('label', {}, label), sel)
}
function checkRow (label, value, onChange) {
  const id = 'c' + Math.random().toString(36).slice(2)
  const inp = h('input', { type: 'checkbox', id, checked: !!value })
  inp.addEventListener('change', () => onChange(inp.checked))
  return h('div', { class: 'row' }, inp, h('label', { for: id, style: 'min-width:0;color:inherit' }, label))
}
function segRow (label, value, options, onChange) {
  const seg = h('div', { class: 'seg', role: 'group', 'aria-label': label })
  for (const [v, t] of Object.entries(options)) {
    seg.append(h('button', { type: 'button', 'aria-pressed': String(v === value), onclick: () => onChange(v) }, t))
  }
  return h('div', { class: 'row' }, h('label', {}, label), seg)
}
const sec = (title, ...kids) => h('div', { class: 'sec' }, h('h3', {}, title), ...kids)

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
function renderStylePanel () {
  const box = $('#tab-style')
  const sel = selectedObjects()
  const kids = []
  // 編集対象：選択中の図形があればそれ、なければ次に描く図形の設定
  const target = sel.length ? sel[0] : null
  const st = target && target.style ? target.style : state.drawStyle
  const setStyle = (patch) => {
    if (sel.length) {
      for (const o of sel) replaceObject(o.id, { ...o, style: { ...o.style, ...patch } })
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
    kids.push(sec('消しゴム', rangeRow('大きさ（半径）', state.eraserSize || 3, v => { state.eraserSize = v }, { min: 1, max: 15, step: 0.5 })))
  }

  // 点字
  if (target && target.type === 'braille') {
    kids.push(sec('点字',
      h('div', { class: 'braille-preview', 'aria-label': '点字の表示' }, kanaToBraille(target.text || '').cells.map(c => c === -1 ? '\n' : bitsToUnicode(c)).join('')),
      h('div', { class: 'btns' }, h('button', { class: 'btn', onclick: () => editBraille(target) }, '文字を編集…')),
      segRow('点の大きさ', target.dot || 'L', { L: '大', M: '中', S: '小' }, v => { replaceObject(target.id, { ...target, dot: v }); commit() })
    ))
  }

  const vectorSel = sel.filter(o => o.type !== 'dots' && o.type !== 'braille')
  const showLine = !fillMode && (vectorSel.length || (!sel.length && !['dot', 'eraser', 'braille', 'select', 'pan'].includes(state.tool)) || (!sel.length && state.tool === 'select'))
  if (showLine) {
    kids.push(sec('輪郭線',
      checkRow('輪郭線を点で描く', st.stroke !== false, v => setStyle({ stroke: v })),
      segRow('点の大きさ', st.dot || 'M', { L: '大', M: '中', S: '小' }, v => setStyle({ dot: v })),
      rangeRow('点の間隔', st.spacing || 2, v => setStyle({ spacing: v }), { min: 1, max: 8, step: 0.1 }),
      segRow('線の種類', st.line || 'solid', { solid: '実線', dashed: '破線', dotted: '点線' }, v => setStyle({ line: v })),
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
        grid.append(h('button', { type: 'button', title: PATTERNS[id].label, 'aria-label': PATTERNS[id].label, 'aria-pressed': String(fill.pattern === id), onclick: () => setFill({ pattern: id }) }, patternSwatch(id, { ...fill, pattern: id })))
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

// ================= パネル：レイヤ =================
const mergeChecks = new Set()
function renderLayersPanel () {
  const box = $('#tab-layers')
  const list = h('ul', { class: 'layer-list', 'aria-label': 'レイヤの一覧（上が手前）' })
  for (const l of [...state.doc.layers].reverse()) {
    const name = h('input', { class: 'name', value: l.name, 'aria-label': 'レイヤ名' })
    name.addEventListener('change', () => { l.name = name.value || l.name; commit('layers') })
    name.addEventListener('focus', () => { if (state.doc.activeLayer !== l.id) { state.doc.activeLayer = l.id; renderLayersPanel() } })
    const color = h('input', { type: 'color', value: l.color, class: 'swatch', title: '表示の色', 'aria-label': '表示の色' })
    color.addEventListener('change', () => { l.color = color.value; commit('layers') })
    const chk = h('input', { type: 'checkbox', title: 'まとめる対象に含める', 'aria-label': `${l.name} をまとめる対象に含める`, checked: mergeChecks.has(l.id) })
    chk.addEventListener('change', () => { chk.checked ? mergeChecks.add(l.id) : mergeChecks.delete(l.id); renderLayersPanel() })
    list.append(h('li', { class: 'layer-item' + (l.id === state.doc.activeLayer ? ' active' : ''), onclick: (e) => { if (e.target === e.currentTarget) { state.doc.activeLayer = l.id; renderLayersPanel() } } },
      chk, color, name,
      h('span', { class: 'count' }, String(l.objects.length)),
      h('button', { class: 'icon-btn', title: l.visible ? '隠す' : '表示する', 'aria-label': l.visible ? `${l.name} を隠す` : `${l.name} を表示`, onclick: () => { l.visible = !l.visible; commit('layers') } }, svgUse(l.visible ? 'i-eye' : 'i-eye-off')),
      h('button', { class: 'icon-btn', title: l.locked ? 'ロック解除' : 'ロック', 'aria-label': l.locked ? `${l.name} のロックを解除` : `${l.name} をロック`, onclick: () => { l.locked = !l.locked; commit('layers') } }, svgUse(l.locked ? 'i-lock' : 'i-unlock'))
    ))
  }
  const act = activeLayer(state.doc)
  const checked = state.doc.layers.filter(l => mergeChecks.has(l.id)).map(l => l.id)
  box.replaceChildren(
    sec('レイヤ', list,
      h('div', { class: 'btns', style: 'margin-top:8px' },
        h('button', { class: 'btn', onclick: () => addLayer() }, '＋ 追加'),
        h('button', { class: 'btn', onclick: () => duplicateLayer(act.id) }, '複製'),
        h('button', { class: 'btn', onclick: () => moveLayer(act.id, 1) }, '↑ 手前へ'),
        h('button', { class: 'btn', onclick: () => moveLayer(act.id, -1) }, '↓ 奥へ'),
        h('button', { class: 'btn danger', onclick: async () => { if (await confirmDlg(`レイヤ「${act.name}」を削除しますか？`)) deleteLayer(act.id) } }, '削除')
      ),
      h('p', { class: 'note' }, '色の付いた行が作業中のレイヤです。図形はそこに描かれます。レイヤが2枚以上見えているときは、点をレイヤの色で表示します。')
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
function renderUnderlayPanel () {
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
function renderPagePanel () {
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
  const prev = h('div', { class: 'braille-preview', 'aria-live': 'polite' })
  const warn = h('p', { class: 'note' })
  const keysBox = h('div', { class: 'sixkey' })
  const pressed = new Set()
  const update = () => {
    const { cells, unknown } = kanaToBraille(ta.value)
    prev.textContent = cells.map(c => c === -1 ? '\n' : bitsToUnicode(c)).join('') || '　'
    warn.textContent = unknown.length ? `点字にできない文字：${unknown.join(' ')}（漢字は読みのかなで入力してください）` : ''
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
    h('p', { class: 'note' }, '点字の表示：'), prev, warn,
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
      const o = addObject({ type: 'braille', x: at[0], y: at[1], text, dot: 'L', style: { ...defaultStyle() } })
      if (o) { state.selection = new Set([o.id]); commit() }
    } else {
      replaceObject(obj.id, { ...obj, text })
      commit()
    }
  })
}

// ================= ファイル =================
function pickFile (accept, handler) {
  const inp = $('#file-input')
  inp.accept = accept
  inp.value = ''
  inp.onchange = () => { if (inp.files[0]) handler(inp.files[0]) }
  inp.click()
}

async function openFile (file) {
  const name = file.name
  const ext = (name.match(/\.([^.]+)$/) || [])[1]?.toLowerCase()
  try {
    if (ext === 'tenzoo' || ext === 'json') {
      const doc = JSON.parse(await file.text())
      loadDocument(doc)
      fitPage()
      toast(`「${state.doc.meta.title}」を開きました。`)
      return
    }
    if (ext === 'edl') {
      const text = bytesToLatin1(new Uint8Array(await file.arrayBuffer()))
      if (!isEDL(text)) throw new Error('エーデルの点図ファイルではないようです。')
      const r = await dialog('エーデル形式（.edl）を開く', h('p', {}, '新しい図として開くか、今の図に新しいレイヤとして追加するかを選んでください。'),
        [{ label: 'キャンセル', value: 'no' }, { label: 'レイヤとして追加', value: 'layer' }, { label: '新しい図として開く', value: 'new', primary: true }])
      if (r === 'no' || !r) return
      importEDL(text, name, r === 'new')
      return
    }
    if (ext === 'ezi') {
      await dialog('.ezi ファイルについて', h('div', {},
        h('p', {}, '.ezi はエーデル 6.06 以降で .edl に付いて保存される図形データです。'),
        h('p', {}, '形式の仕様が公開されていないため、tenzoo ではまだ読み込めません。同じ名前の .edl ファイルを開いてください（点の情報はすべて .edl に入っています）。'),
        h('p', { class: 'note' }, '解析用に .ezi と .edl の組の見本を提供していただければ、対応を検討します。')
      ))
      return
    }
    if (ext === 'svg') return importImage(file)
    if (file.type.startsWith('image/') || ['png', 'jpg', 'jpeg', 'gif', 'bmp', 'webp'].includes(ext)) return importImage(file)
    throw new Error('この種類のファイルは開けません。')
  } catch (e) {
    console.error(e)
    toast('開けませんでした：' + e.message, 5000)
  }
}

function importEDL (text, name, asNew) {
  const edl = parseEDL(text)
  const title = name.replace(/\.[^.]+$/, '')
  if (asNew) {
    const doc = newDocument('B5')
    doc.meta.title = title
    doc.profile = 'esa721'
    doc.layers[0].name = title
    doc.layers[0].objects.push({ id: newId(), type: 'dots', source: 'edl', points: edl.dots.map(d => [d.x, d.y, d.size]), style: defaultStyle() })
    // 取り込んだ点の位置関係はそのまま保つ（近い点をまとめない）
    doc.settings.minDist = 0
    loadDocument(doc)
    fitPage()
  } else {
    const l = addLayer(title)
    l.objects.push({ id: newId(), type: 'dots', source: 'edl', points: edl.dots.map(d => [d.x, d.y, d.size]), style: defaultStyle() })
    commit('layers')
  }
  toast(`エーデルの点図（点 ${edl.dots.length} 個）を読み込みました。`)
}

function saveTenzoo () {
  download(serializeDocument(state.doc), baseName() + '.tenzoo', 'application/json')
  state.dirty = false
  toast('tenzoo 形式で保存しました。')
}

function exportDots (layerIds, merge = true, profileId) {
  return documentDots(state.doc, { layerIds, merge, profileId })
}

async function exportDialog () {
  const opts = { format: 'edl', layers: 'visible', merge: true, dotScale: 1, dpi: 300, perLayer: false }
  const body = h('div', {})
  const draw = () => {
    body.replaceChildren(
      segRow('形式', opts.format, { edl: 'エーデル', pdf: 'PDF', svg: 'SVG', png: 'PNG', tenzoo: 'tenzoo' }, v => { opts.format = v; draw() }),
      h('p', { class: 'note' }, {
        edl: 'エーデル（.edl）形式。ESA721 などの点字プリンタでの印刷や、エーデルでの編集に使えます。点の位置はエーデルの格子に合わせます。',
        pdf: '実寸の PDF。立体コピー（カプセルペーパー）の原稿や、確認用の印刷に。',
        svg: '実寸の SVG（ベクトル）。他のソフトでの加工や、他の点字プリンタのドライバに。',
        png: '実寸の画像（解像度指定）。立体コピーの原稿などに。',
        tenzoo: 'tenzoo 形式。図形・レイヤ・下絵をすべて保存します（あとで編集するとき用）。'
      }[opts.format]),
      opts.format !== 'tenzoo' && segRow('対象', opts.layers, { visible: '見えているレイヤ', all: 'すべてのレイヤ', active: '作業中のレイヤ' }, v => { opts.layers = v; draw() }),
      opts.format !== 'tenzoo' && checkRow('レイヤごとに別のファイルにする', opts.perLayer, v => { opts.perLayer = v }),
      opts.format !== 'tenzoo' && checkRow('近すぎる点をまとめる', opts.merge, v => { opts.merge = v }),
      ['pdf', 'png', 'svg'].includes(opts.format) && rangeRow('点の大きさの倍率', opts.dotScale, v => { opts.dotScale = v }, { min: 0.5, max: 2, step: 0.05, unit: '倍' }),
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
      const pages = layerSets.map(s => ({ dots: exportDots(s.ids, opts.merge, state.doc.profile === 'esa721' ? 'esa721' : undefined), page: state.doc.page }))
      download(dotsToPDF(pages, { dotScale: opts.dotScale }), baseName() + '.pdf', 'application/pdf')
      return toast('PDF を書き出しました。')
    }
    for (const s of layerSets) {
      if (opts.format === 'edl') {
        const dots = exportDots(s.ids, opts.merge, 'esa721')
        const { text, warnings } = writeEDL(dots, { paper: 'B5' })
        download(latin1ToBytes(text), s.name + '.edl', 'application/octet-stream')
        if (warnings.length) toast(warnings.join(' '), 6000)
        else toast('エーデル形式で書き出しました。')
      } else if (opts.format === 'svg') {
        download(dotsToSVG(exportDots(s.ids, opts.merge), state.doc.page, { dotScale: opts.dotScale, title: s.name }), s.name + '.svg', 'image/svg+xml')
      } else if (opts.format === 'png') {
        download(await dotsToPNG(exportDots(s.ids, opts.merge), state.doc.page, opts.dpi, { dotScale: opts.dotScale }), s.name + '.png', 'image/png')
      }
    }
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
  let paper = 'B5'; let profile = 'esa721'
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
    ['V', '選択・移動'], ['P', '点'], ['L', '直線'], ['Y', '折れ線'], ['C', '曲線'], ['F', 'フリーハンド'], ['R / E', '四角 / 円'],
    ['Shift+R / E / F / Y', '範囲を塗る（四角 / 楕円 / 投げ縄 / 多角形）'], ['G', '囲まれた所を塗る'], ['B', '点字'], ['X', '消しゴム'], ['H・Space押しながら', '表示の移動'],
    ['Ctrl+Z / Ctrl+Y', '元に戻す / やり直す'], ['Ctrl+C / V / D', 'コピー / 貼り付け / 複製'], ['Ctrl+A', '作業中レイヤの図形をすべて選択'],
    ['Delete', '選択した図形を削除'], ['矢印キー', '選択中の図形を 0.5mm 移動（Shift で 5mm）。点の道具ではカーソル移動'],
    ['Space / Enter（点の道具）', 'カーソル位置に点を打つ'], ['Backspace（点の道具）', 'カーソル位置の点を消す'],
    ['+ / - / 0', '拡大 / 縮小 / 用紙全体'], ['Enter / Esc', '折れ線を終える / 描きかけを取り消す'], ['Ctrl+S', 'tenzoo 形式で保存'], ['Ctrl+O', '開く']
  ]
  dialog('使い方', h('div', { class: 'help' },
    h('p', {}, '点図は「図形（ベクトル）」として描き、書き出すときに点にします。点の間隔や面の表現は、あとからいつでも変えられます。'),
    h('p', {}, 'スマートフォン・タブレットでは、2本指で拡大縮小・移動できます。右上のパネルボタンで設定パネルを開きます。'),
    h('table', {}, ...rows.map(([k, v]) => h('tr', {}, h('td', {}, h('kbd', {}, k)), h('td', {}, v))))
  ))
}
function aboutDialog () {
  dialog('tenzoo について', h('div', {},
    h('p', {}, 'tenzoo は、ブラウザだけで動く点図（触図）エディタです。インストール不要で、データはこの端末の中だけで処理されます（サーバーには送られません）。'),
    h('p', {}, 'エーデル形式（.edl）の読み書き、レイヤ、ベクトル図形、16 種類の面の表現、画像の下絵・自動点図化、SVG 取り込み、PDF・SVG・PNG への書き出しに対応しています。'),
    h('p', { class: 'note' }, '.edl の形式は公開仕様がないため、実物のファイルの解析結果に基づいています（tenji-editor［MIT License］の解析を参考にしました）。エーデルは藤野稔寛氏によるソフトウェアです。tenzoo はエーデルの作者とは関係のない独立したソフトウェアです。'),
    h('p', { class: 'note' }, 'tenzoo 0.1.0 / MIT License')
  ))
}

// ================= 全体の更新・初期化 =================
function showTab (name, open = true) {
  $$('.tabs [role="tab"]').forEach(b => b.setAttribute('aria-selected', String(b.dataset.tab === name)))
  $$('.tab-body').forEach(b => { b.hidden = b.id !== 'tab-' + name })
  if (open && $('.workspace').classList.contains('panel-hidden')) { $('.workspace').classList.remove('panel-hidden'); setTimeout(resize, 0) }
  renderPanels()
}
function currentTab () { return $('.tabs [aria-selected="true"]').dataset.tab }
function renderPanels () {
  const t = currentTab()
  if (t === 'style') renderStylePanel()
  else if (t === 'layers') renderLayersPanel()
  else if (t === 'underlay') renderUnderlayPanel()
  else renderPagePanel()
}

function setTool (t) {
  if (isDrawingPoly()) finishPoly(false)
  cancelTool()
  state.tool = t
  if (t !== 'dot') state.cursor = null
  $$('#toolbar [data-tool]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.tool === t)))
  canvas.style.cursor = t === 'pan' ? 'grab' : t === 'select' ? 'default' : 'crosshair'
  hint(TOOL_HINTS[t])
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
    localStorage.setItem('tenzoo:prefs', JSON.stringify({ showGrid: state.showGrid, snapGrid: state.snapGrid, gridSize: state.gridSize, theme: document.documentElement.dataset.theme || 'auto', panel: window.matchMedia('(max-width: 720px)').matches ? undefined : !$('.workspace').classList.contains('panel-hidden') }))
  } catch (e) { }
}
function loadPrefs () {
  try {
    const p = JSON.parse(localStorage.getItem('tenzoo:prefs') || '{}')
    if (p.showGrid != null) state.showGrid = p.showGrid
    if (p.snapGrid != null) state.snapGrid = p.snapGrid
    if (p.gridSize) state.gridSize = p.gridSize
    if (p.theme && p.theme !== 'auto') document.documentElement.dataset.theme = p.theme
    // スマートフォンでは、はじめはパネルを閉じておく（図が見えるように）
    if (p.panel === false || (p.panel == null && window.matchMedia('(max-width: 720px)').matches)) $('.workspace').classList.add('panel-hidden')
  } catch (e) { }
}

// ---- キー操作
function onKey (e) {
  const tag = (e.target.tagName || '').toLowerCase()
  if (['input', 'textarea', 'select'].includes(tag) || $('#dlg').open) return
  const k = e.key; const ctrl = e.ctrlKey || e.metaKey
  if (ctrl) {
    const lk = k.toLowerCase()
    if (lk === 'z' && !e.shiftKey) { e.preventDefault(); undo() } else if (lk === 'y' || (lk === 'z' && e.shiftKey)) { e.preventDefault(); redo() } else if (lk === 'c') { if (copySelection()) toast('コピーしました。') } else if (lk === 'x') { if (copySelection()) deleteSelection() } else if (lk === 'v') { e.preventDefault(); paste() } else if (lk === 'd') { e.preventDefault(); duplicateSelection() } else if (lk === 'a') { e.preventDefault(); setTool('select'); selectAll() } else if (lk === 's') { e.preventDefault(); saveTenzoo() } else if (lk === 'o') { e.preventDefault(); pickFile('.tenzoo,.json,.edl,.ezi,image/*,.svg', openFile) }
    return
  }
  if (k === ' ' && state.tool !== 'dot') { if (!e.repeat) setSpace(true); e.preventDefault(); return }
  if (k === 'Escape') { if (isDrawingPoly()) cancelTool(); else { state.selection.clear(); notify('selection') } return }
  if (k === 'Enter' && isDrawingPoly()) { finishPoly(state.tool === 'fillpoly'); return }
  if (state.tool === 'dot' && (k.startsWith('Arrow') || k === ' ' || k === 'Enter' || k === 'Backspace')) {
    e.preventDefault()
    if (k.startsWith('Arrow')) keyboardCursor(k, e.shiftKey)
    else keyboardDot(k === 'Backspace')
    return
  }
  if ((k === 'Delete' || k === 'Backspace') && state.selection.size) { e.preventDefault(); deleteSelection(); return }
  if (k.startsWith('Arrow') && state.selection.size) {
    e.preventDefault()
    const s = e.shiftKey ? 5 : 0.5
    const d = { ArrowLeft: [-s, 0], ArrowRight: [s, 0], ArrowUp: [0, -s], ArrowDown: [0, s] }[k]
    transformSelection([1, 0, 0, 1, d[0], d[1]])
    commit()
    return
  }
  if (k === '+' || k === '=') { zoomTo(state.view.zoom * 1.25); updateChrome(); return }
  if (k === '-') { zoomTo(state.view.zoom / 1.25); updateChrome(); return }
  if (k === '0') { fitPage(); updateChrome(); return }
  const map = e.shiftKey
    ? { R: 'fillrect', E: 'fillellipse', F: 'filllasso', Y: 'fillpoly' }
    : { v: 'select', p: 'dot', l: 'line', y: 'polyline', c: 'curve', f: 'freehand', r: 'rect', e: 'ellipse', g: 'bucket', b: 'braille', x: 'eraser', h: 'pan' }
  const t = map[e.shiftKey ? k.toUpperCase() : k.toLowerCase()]
  if (t) setTool(t)
}

function init () {
  loadPrefs()
  initTools({
    editBraille, toast, status,
    bboxOf: o => bboxOf(o, state.doc),
    afterCreate: (o) => { if (state.tool === 'braille') state.selection = new Set([o.id]) }
  })
  // 道具バー
  $$('#toolbar [data-tool]').forEach(b => b.addEventListener('click', () => setTool(b.dataset.tool)))
  // タブ
  $$('.tabs [role="tab"]').forEach(b => b.addEventListener('click', () => showTab(b.dataset.tab)))
  // 上部バー
  $('#btn-undo').addEventListener('click', undo)
  $('#btn-redo').addEventListener('click', redo)
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
  mbtn.addEventListener('click', (e) => { e.stopPropagation(); menu.hidden = !menu.hidden; mbtn.setAttribute('aria-expanded', String(!menu.hidden)) })
  document.addEventListener('click', (e) => { if (!menu.hidden && !menu.contains(e.target)) { menu.hidden = true; mbtn.setAttribute('aria-expanded', 'false') } })
  menu.addEventListener('click', (e) => {
    const cmd = e.target.dataset.cmd
    if (!cmd) return
    menu.hidden = true
    ;({
      new: newDoc,
      open: () => pickFile('.tenzoo,.json,.edl,.ezi,image/*,.svg', openFile),
      save: saveTenzoo,
      'save-edl': () => {
        try {
          const { text, warnings } = writeEDL(exportDots(state.doc.layers.filter(l => l.visible).map(l => l.id), true, 'esa721'))
          download(latin1ToBytes(text), baseName() + '.edl', 'application/octet-stream')
          toast(warnings.length ? warnings.join(' ') : 'エーデル形式で保存しました。', warnings.length ? 6000 : 3000)
        } catch (err) { toast(err.message) }
      },
      'import-image': () => pickFile('image/*,.svg', importImage),
      'import-svg': () => pickFile('.svg,image/svg+xml', importSVG),
      print: printDoc,
      help: helpDialog,
      about: aboutDialog
    })[cmd]?.()
  })
  // ドラッグ＆ドロップで開く
  const cw = $('#canvas-wrap')
  cw.addEventListener('dragover', e => { e.preventDefault() })
  cw.addEventListener('drop', e => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) openFile(f) })

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
  const doc = newDocument('B5')
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
  L3.objects.push({ id: newId(), type: 'braille', x: 40, y: 190, text: 'いえ と き', dot: 'L', style: st() })
  doc.layers.push(L2, L3)
  loadDocument(doc)
  fitPage()
}

init()
