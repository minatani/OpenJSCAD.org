// アプリの状態と操作（元に戻す・やり直すを含む）
import {
  newDocument, newLayer, newId, activeLayer, findObject, defaultStyle, defaultFill, transformObject,
  bboxOf, normalizeDocument, LAYER_COLORS
} from './model.js'
import { unionBox, mTranslate } from './geometry.js'
import { objectDots } from './raster.js'

const listeners = new Set()
export const on = fn => { listeners.add(fn); return () => listeners.delete(fn) }
const emit = (what) => { for (const fn of listeners) fn(what) }

export const state = {
  doc: newDocument('B5'),
  selection: new Set(),
  tool: 'select',
  // 新しく描く図形のスタイル（何も選んでいないときにパネルで変える）
  drawStyle: { ...defaultStyle() },
  fillStyle: { ...defaultFill() },
  fillOutline: true,
  dotSize: 'M', // 点の道具の大きさ
  view: { zoom: 3, panX: 40, panY: 40 },
  display: 'dots',
  showGrid: false,
  gridSize: 5,
  snapGrid: false,
  previewSnap: true, // プリンタの格子に合わせて表示
  cursor: null, // キーボード操作のカーソル（mm）
  dirty: false
}

// ---- 元に戻す
const undoStack = []; const redoStack = []
const LIMIT = 200
let lastSnapshot = JSON.stringify(state.doc)

export function commit (what = 'doc') {
  const snap = JSON.stringify(state.doc)
  if (snap === lastSnapshot) { emit(what); return }
  undoStack.push(lastSnapshot)
  if (undoStack.length > LIMIT) undoStack.shift()
  redoStack.length = 0
  lastSnapshot = snap
  state.doc.meta.modified = new Date().toISOString()
  state.dirty = true
  emit(what)
}
export function undo () {
  if (!undoStack.length) return
  redoStack.push(lastSnapshot)
  lastSnapshot = undoStack.pop()
  state.doc = JSON.parse(lastSnapshot)
  pruneSelection()
  emit('doc')
}
export function redo () {
  if (!redoStack.length) return
  undoStack.push(lastSnapshot)
  lastSnapshot = redoStack.pop()
  state.doc = JSON.parse(lastSnapshot)
  pruneSelection()
  emit('doc')
}
export const canUndo = () => undoStack.length > 0
export const canRedo = () => redoStack.length > 0

export function loadDocument (doc, { keepHistory = false } = {}) {
  state.doc = normalizeDocument(doc)
  state.selection.clear()
  if (!keepHistory) { undoStack.length = 0; redoStack.length = 0 }
  lastSnapshot = JSON.stringify(state.doc)
  state.dirty = false
  emit('load')
}

function pruneSelection () {
  for (const id of [...state.selection]) if (!findObject(state.doc, id)) state.selection.delete(id)
}

export const notify = what => emit(what)

// ---- 図形の追加・変更
export function addObject (o, layerId) {
  const layer = layerId ? state.doc.layers.find(l => l.id === layerId) : activeLayer(state.doc)
  if (!layer) return null
  if (layer.locked) { emit({ toast: `レイヤ「${layer.name}」はロックされています。` }); return null }
  if (!layer.visible) layer.visible = true
  const obj = { id: newId(), ...o }
  layer.objects.push(obj)
  return obj
}

export function replaceObject (id, newObj) {
  for (const l of state.doc.layers) {
    const i = l.objects.findIndex(o => o.id === id)
    if (i >= 0) { l.objects[i] = { ...newObj, id }; return l.objects[i] }
  }
  return null
}

export function selectedObjects () {
  const out = []
  for (const l of state.doc.layers) for (const o of l.objects) if (state.selection.has(o.id)) out.push(o)
  return out
}

export function selectionBox () {
  let b = null
  for (const o of selectedObjects()) b = unionBox(b, bboxOf(o, state.doc))
  return b
}

export function transformSelection (m) {
  for (const o of selectedObjects()) replaceObject(o.id, transformObject(o, m))
}

export function deleteSelection () {
  if (!state.selection.size) return
  for (const l of state.doc.layers) l.objects = l.objects.filter(o => !state.selection.has(o.id) || l.locked)
  state.selection.clear()
  commit()
}

let clipboard = null
export function copySelection () {
  const objs = selectedObjects()
  if (objs.length) clipboard = structuredClone(objs)
  return objs.length
}
export function paste (offset = 5) {
  if (!clipboard) return
  const layer = activeLayer(state.doc)
  if (layer.locked) { emit({ toast: 'レイヤがロックされています。' }); return }
  state.selection.clear()
  const m = mTranslate(offset, offset)
  clipboard = clipboard.map(o => transformObject(o, m))
  for (const o of clipboard) {
    const n = { ...structuredClone(o), id: newId() }
    layer.objects.push(n)
    state.selection.add(n.id)
  }
  commit()
}
export function duplicateSelection () { if (copySelection()) paste(5) }

export function selectAll () {
  state.selection.clear()
  const layer = activeLayer(state.doc)
  for (const o of layer.objects) state.selection.add(o.id)
  emit('selection')
}

// 重なり順
export function arrange (dir) {
  for (const l of state.doc.layers) {
    const sel = l.objects.filter(o => state.selection.has(o.id))
    if (!sel.length) continue
    const rest = l.objects.filter(o => !state.selection.has(o.id))
    l.objects = dir === 'front' ? [...rest, ...sel] : [...sel, ...rest]
  }
  commit()
}

// 選んだ図形を点に変換（ベクトル情報は失われる）
export function flattenSelection () {
  for (const o of selectedObjects()) {
    const dots = objectDots(o, state.doc)
    replaceObject(o.id, { type: 'dots', points: dots.map(d => [d.x, d.y, d.size]), style: { ...defaultStyle() } })
  }
  commit()
}

// ---- レイヤ
export function addLayer (name) {
  const l = newLayer(name || `レイヤ ${state.doc.layers.length + 1}`, state.doc.layers.length)
  state.doc.layers.push(l)
  state.doc.activeLayer = l.id
  commit('layers')
  return l
}
export function deleteLayer (id) {
  if (state.doc.layers.length <= 1) { emit({ toast: '最後のレイヤは削除できません。' }); return }
  state.doc.layers = state.doc.layers.filter(l => l.id !== id)
  if (state.doc.activeLayer === id) state.doc.activeLayer = state.doc.layers[state.doc.layers.length - 1].id
  pruneSelection()
  commit('layers')
}
export function duplicateLayer (id) {
  const i = state.doc.layers.findIndex(l => l.id === id)
  if (i < 0) return
  const src = state.doc.layers[i]
  const l = { ...structuredClone(src), id: newId('L'), name: src.name + ' のコピー', color: LAYER_COLORS[state.doc.layers.length % LAYER_COLORS.length] }
  l.objects = l.objects.map(o => ({ ...o, id: newId() }))
  state.doc.layers.splice(i + 1, 0, l)
  state.doc.activeLayer = l.id
  commit('layers')
}
export function moveLayer (id, dir) {
  const ls = state.doc.layers
  const i = ls.findIndex(l => l.id === id); const j = i + dir
  if (i < 0 || j < 0 || j >= ls.length) return
  ;[ls[i], ls[j]] = [ls[j], ls[i]]
  commit('layers')
}
/**
 * レイヤをまとめる。ids の順（下から上）に図形を連結し、一番下のレイヤに入れる。
 * flatten=true なら、まとめた結果を1つの点の図形にする（プリンタの格子に合わせる前の座標）。
 */
export function mergeLayers (ids, { flatten = false, name } = {}) {
  const ls = state.doc.layers.filter(l => ids.includes(l.id))
  if (ls.length < 1) return
  const target = ls[0]
  let objs = ls.flatMap(l => l.objects)
  if (flatten) {
    const pts = []
    for (const o of objs) for (const d of objectDots(o, state.doc)) pts.push([d.x, d.y, d.size])
    objs = pts.length ? [{ id: newId(), type: 'dots', points: pts, style: { ...defaultStyle() } }] : []
  }
  target.objects = objs
  if (name) target.name = name
  else if (ls.length > 1) target.name = ls.map(l => l.name).join('＋')
  state.doc.layers = state.doc.layers.filter(l => l === target || !ids.includes(l.id))
  state.doc.activeLayer = target.id
  target.visible = true
  pruneSelection()
  commit('layers')
}
export function moveSelectionToLayer (layerId) {
  const target = state.doc.layers.find(l => l.id === layerId)
  if (!target) return
  const moving = []
  for (const l of state.doc.layers) {
    if (l === target) continue
    const keep = []
    for (const o of l.objects) (state.selection.has(o.id) ? moving : keep).push(o)
    l.objects = keep
  }
  target.objects.push(...moving)
  commit('layers')
}
