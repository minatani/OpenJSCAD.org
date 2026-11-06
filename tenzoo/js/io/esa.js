// ESA721 に送るデータ（プロッタモード）を作る。RS-232C で直接送る機能は持たず、ファイルとして保存する。
// 送り方の例（Windows）: copy /b 図.esa COM1   （通信条件はプリンタに合わせる）
//
// 書式は minatani/edlprt（ESA721 Ver'95 説明書と、エーデルの印刷ソフト EBP の解析）に合わせる:
//   1ページ = ESC ESC G → 点 → CR → FF → ESC ESC D 1
//   点 = YHI YLO XHI XLO の4文字（省略しない）。Y は横（edl の x）、X は縦（edl の y）
//   点の大きさ ESC ESC D 0/1/2（小/中/大）は変わるときだけ送る
//   点種別印刷（EBP と同じく 中→小→大 の順に1種類ずつ。各回の前に GS で用紙を少し戻す）
//   縦横比の補正（EBP の 0/50/100%）

const ESC = 0x1b; const CR = 0x0d; const FF = 0x0c; const GS = 0x1d
const DOT_CMD = { 1: 0x30, 2: 0x31, 3: 0x32 }
const SIZE_PASSES = [2, 1, 3]
const PASS_BACK = 20

const chars = (x, y) => [Math.floor(y / 32) + 32, (y % 32) + 96, Math.floor(x / 32) + 32, (x % 32) + 64]

/** EBP の縦横比の補正（edl の y → プリンタの X） */
export function aspectX (y, aspect) {
  if (aspect == null) return y
  if (aspect === 0) return y + 3
  if (aspect === 50) return Math.floor((y - 6) * 1.0324 + 6.5) + 3
  return Math.floor(y * 1.0571 + 0.5) + 3
}

/**
 * pages: [[{ ux, uy, k }]]（k: 1 小, 2 中, 3 大）。opts: { bySize, aspect, lastRow }
 * 戻り値: { bytes: Uint8Array, dropped }
 */
export function encodeESA (pages, opts = {}) {
  const out = []
  let dropped = 0
  const push = (...b) => { for (const v of b) out.push(v) }
  for (const page of pages) {
    let pts = []
    for (const d of page) {
      const px = aspectX(d.uy, opts.aspect)
      if (opts.lastRow != null && px > opts.lastRow) { dropped++; continue }
      pts.push({ s: d.k, px, py: d.ux })
    }
    pts.sort((a, b) => a.px - b.px || a.py - b.py)
    if (opts.bySize) {
      const order = []
      for (const s of SIZE_PASSES) {
        const run = pts.filter(p => p.s === s)
        if (!run.length) continue
        order.push({ s: null, px: Math.max(run[0].px - PASS_BACK, 0), py: run[0].py })
        order.push(...run)
      }
      pts = order
    }
    push(ESC, ESC, 0x47) // G
    let size = null
    for (const p of pts) {
      if (p.s == null) { push(GS, ...chars(p.px, p.py)); continue }
      if (p.s !== size) { push(ESC, ESC, 0x44, DOT_CMD[p.s]); size = p.s }
      push(...chars(p.px, p.py))
    }
    push(CR, FF, ESC, ESC, 0x44, 0x31)
  }
  return { bytes: Uint8Array.from(out), dropped }
}
