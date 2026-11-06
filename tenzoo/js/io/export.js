// 書き出し：SVG / PNG / PDF / tenzoo 形式
import { DOT_SIZES } from '../profiles.js'
import { FORMAT, FORMAT_VERSION } from '../model.js'

// ---- tenzoo 形式（JSON）。拡張子 .tenzoo
// ベクトル図形・レイヤ・下絵（画像は data URL で埋め込み）をすべて保持する。
export function serializeDocument (doc) {
  const d = structuredClone(doc)
  d.format = FORMAT
  d.version = FORMAT_VERSION
  d.meta = { ...d.meta, modified: new Date().toISOString(), app: 'tenzoo' }
  return JSON.stringify(d, null, 1)
}

const f2 = n => (Math.round(n * 1000) / 1000).toString()

/**
 * 点の SVG（実寸 mm）。
 * mode: 'dots'（点を円で描く）| 'swell'（立体コピー用：黒の円）
 * opts.outlines: [{paths, closed}] を細線で重ねる（確認用）
 */
export function dotsToSVG (dots, page, opts = {}) {
  const color = opts.color || '#000'
  const bySize = { L: [], M: [], S: [] }
  for (const d of dots) (bySize[d.size] || bySize.M).push(d)
  const scale = opts.dotScale || 1
  let body = ''
  for (const [s, list] of Object.entries(bySize)) {
    if (!list.length) continue
    const r = (DOT_SIZES[s].d / 2) * scale
    body += `<g data-size="${s}" fill="${color}">` + list.map(d => `<circle cx="${f2(d.x)}" cy="${f2(d.y)}" r="${f2(r)}"/>`).join('') + '</g>\n'
  }
  if (opts.outlines) {
    body += '<g fill="none" stroke="#999" stroke-width="0.2">' + opts.outlines.map(o => o.paths.map(p =>
      `<${o.closed ? 'polygon' : 'polyline'} points="${p.map(q => f2(q[0]) + ',' + f2(q[1])).join(' ')}"/>`).join('')).join('') + '</g>\n'
  }
  const title = opts.title ? `<title>${escapeXml(opts.title)}</title>` : ''
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${page.width}mm" height="${page.height}mm" viewBox="0 0 ${page.width} ${page.height}">${title}
<rect width="100%" height="100%" fill="#fff"/>
${body}</svg>
`
}

export const escapeXml = s => String(s).replace(/[<>&"']/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;' }[c]))

// ---- PNG（ブラウザのみ）。dpi 指定で実寸の画像を作る
export async function dotsToPNG (dots, page, dpi = 300, opts = {}) {
  const pxPerMm = dpi / 25.4
  const W = Math.round(page.width * pxPerMm); const H = Math.round(page.height * pxPerMm)
  const canvas = typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(W, H) : Object.assign(document.createElement('canvas'), { width: W, height: H })
  const ctx = canvas.getContext('2d')
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, W, H)
  ctx.fillStyle = opts.color || '#000'
  const scale = opts.dotScale || 1
  for (const d of dots) {
    ctx.beginPath()
    ctx.arc(d.x * pxPerMm, d.y * pxPerMm, (DOT_SIZES[d.size] || DOT_SIZES.M).d / 2 * scale * pxPerMm, 0, Math.PI * 2)
    ctx.fill()
  }
  let blob = canvas.convertToBlob ? await canvas.convertToBlob({ type: 'image/png' }) : await new Promise(resolve => canvas.toBlob(resolve, 'image/png'))
  blob = await setPngDpi(blob, dpi)
  return blob
}

// PNG に pHYs チャンクを入れて、印刷時に実寸になるようにする
async function setPngDpi (blob, dpi) {
  const buf = new Uint8Array(await blob.arrayBuffer())
  const ppm = Math.round(dpi / 0.0254)
  const chunk = new Uint8Array(21)
  const dv = new DataView(chunk.buffer)
  dv.setUint32(0, 9)
  chunk.set([0x70, 0x48, 0x59, 0x73], 4) // 'pHYs'
  dv.setUint32(8, ppm); dv.setUint32(12, ppm); chunk[16] = 1
  dv.setUint32(17, crc32(chunk.subarray(4, 17)))
  // IHDR の直後（8 + 25 バイト）に差し込む
  const at = 33
  const out = new Uint8Array(buf.length + 21)
  out.set(buf.subarray(0, at)); out.set(chunk, at); out.set(buf.subarray(at), at + 21)
  return new Blob([out], { type: 'image/png' })
}
let CRC_TABLE
function crc32 (u8) {
  if (!CRC_TABLE) {
    CRC_TABLE = new Uint32Array(256)
    for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; CRC_TABLE[n] = c >>> 0 }
  }
  let c = 0xffffffff
  for (let i = 0; i < u8.length; i++) c = CRC_TABLE[(c ^ u8[i]) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

// ---- PDF（実寸、ベクトル）。立体コピー用の印刷原稿などに。
// 依存ライブラリなしの最小実装：点は円（ベジェ4本）で黒く塗る。
export function dotsToPDF (pages, opts = {}) {
  const mm = 72 / 25.4
  const K = 0.5522847498
  const objs = []
  const add = s => { objs.push(s); return objs.length }
  const catalogId = add(null); const pagesId = add(null)
  const pageIds = []
  const scale = opts.dotScale || 1
  for (const pg of pages) {
    const { dots, page } = pg
    const H = page.height * mm
    let cs = '0 g\n'
    for (const d of dots) {
      const r = (DOT_SIZES[d.size] || DOT_SIZES.M).d / 2 * scale * mm
      const x = d.x * mm; const y = H - d.y * mm; const k = r * K
      cs += `${n(x + r)} ${n(y)} m ${n(x + r)} ${n(y + k)} ${n(x + k)} ${n(y + r)} ${n(x)} ${n(y + r)} c ` +
        `${n(x - k)} ${n(y + r)} ${n(x - r)} ${n(y + k)} ${n(x - r)} ${n(y)} c ` +
        `${n(x - r)} ${n(y - k)} ${n(x - k)} ${n(y - r)} ${n(x)} ${n(y - r)} c ` +
        `${n(x + k)} ${n(y - r)} ${n(x + r)} ${n(y - k)} ${n(x + r)} ${n(y)} c f\n`
    }
    const contentId = add(`<< /Length ${cs.length} >>\nstream\n${cs}endstream`)
    pageIds.push(add(`<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 ${n(page.width * mm)} ${n(H)}] /Contents ${contentId} 0 R /Resources << >> >>`))
  }
  objs[catalogId - 1] = `<< /Type /Catalog /Pages ${pagesId} 0 R >>`
  objs[pagesId - 1] = `<< /Type /Pages /Kids [${pageIds.map(i => i + ' 0 R').join(' ')}] /Count ${pageIds.length} >>`
  let out = '%PDF-1.4\n'
  const offsets = []
  objs.forEach((o, i) => { offsets.push(out.length); out += `${i + 1} 0 obj\n${o}\nendobj\n` })
  const xref = out.length
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n` + offsets.map(o => String(o).padStart(10, '0') + ' 00000 n \n').join('')
  out += `trailer\n<< /Size ${objs.length + 1} /Root ${catalogId} 0 R >>\nstartxref\n${xref}\n%%EOF\n`
  return new TextEncoder().encode(out)
}
const n = v => (Math.round(v * 100) / 100).toString()

// 点字テキスト（Unicode 点字）として書き出す。点字図形の確認用
export function cellsToUnicodeText (cells) {
  return cells.map(c => c === -1 ? '\n' : String.fromCharCode(0x2800 + c)).join('')
}
