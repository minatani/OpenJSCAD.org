// 出力先（点字プリンタ・立体コピー）のプロファイル
// 図面はベクトルで持ち、出力の直前にここで決めた格子・点の大きさに合わせる。
// 新しいプリンタは、この一覧に足せば使えるようにしてある。

// tenzoo の点の大きさの区分（論理名）。表示用の直径は mm
export const DOT_SIZES = {
  L: { label: '大点', d: 1.6 },
  M: { label: '中点', d: 1.2 },
  S: { label: '小点', d: 0.8 }
}
export const SIZE_ORDER = { S: 0, M: 1, L: 2 }

export const PROFILES = {
  esa721: {
    id: 'esa721',
    label: 'ESA721（エーデル互換）',
    kind: 'emboss',
    // ESA721 のプロッタの1ステップ＝エーデル（.edl）座標の1目盛り。
    // 横（edl の x、ESA721 の Y 軸）0.3454mm、縦（edl の y、ESA721 の X 軸）0.3175mm。1マス=15、1行=33
    grid: { dx: 0.3454, dy: 0.3175, ox: 0, oy: 0 },
    sizes: { L: true, M: true, S: true },
    minDist: 1.0,
    note: '3種類の点（小・中・大）。座標はエーデル（.edl）の格子（ESA721 の1ステップ）に合わせます。'
  },
  generic25: {
    id: 'generic25',
    label: '汎用点字プリンタ（2.5mm格子・1種類の点）',
    kind: 'emboss',
    grid: { dx: 2.5, dy: 2.5, ox: 0, oy: 0 },
    sizes: { M: true },
    minDist: 2.4,
    note: '点の位置が粗い格子に限られる機種向けの目安です。機種に合わせて格子を変えてください。'
  },
  dpi20: {
    id: 'dpi20',
    label: '20dpi 格子のプリンタ（約1.27mm）',
    kind: 'emboss',
    grid: { dx: 25.4 / 20, dy: 25.4 / 20, ox: 0, oy: 0 },
    sizes: { L: true, M: true, S: true },
    minDist: 1.2,
    note: '20dpi 前後の格子で点の高さを変えられる機種向けの目安です。'
  },
  swell: {
    id: 'swell',
    label: '立体コピー（カプセルペーパー）',
    kind: 'swell',
    grid: null,
    sizes: { L: true, M: true, S: true },
    minDist: 0.6,
    note: '格子に合わせず、黒く塗った点・面をそのまま印刷します（PDF・PNG・SVG）。'
  },
  free: {
    id: 'free',
    label: '格子なし（ベクトルそのまま）',
    kind: 'vector',
    grid: null,
    sizes: { L: true, M: true, S: true },
    minDist: 0,
    note: '格子に合わせません。'
  }
}

export function getProfile (id) {
  return PROFILES[id] || PROFILES.esa721
}

// 点の大きさをプロファイルで使えるものに置き換える
export function mapSize (profile, size) {
  if (profile.sizes[size]) return size
  const order = ['M', 'L', 'S']
  return order.find(s => profile.sizes[s]) || 'M'
}

export function snapToGrid (profile, x, y) {
  const g = profile.grid
  if (!g) return [x, y]
  return [g.ox + Math.round((x - g.ox) / g.dx) * g.dx, g.oy + Math.round((y - g.oy) / g.dy) * g.dy]
}

// 用紙。EB5 / EA4 はエーデル・ESA721 の「B5」「A4」（点字用紙。ISO の B5・A4 とは別）
// area: ESA721 で点を打てる範囲（edl 座標の目盛り）。B5 は 32マス×22行、A4 は 40マス×24行
export const PAPERS = {
  // area.y はエーデルが図を描ける最後の行（B5 は 684。EBP が印刷時に 725 行まで伸ばす）、fullY は ESA721 の最後の行
  EB5: { label: '点字用紙 B5（8×10インチ・32マス×22行）', w: 203.2, h: 254, edl: 'B5', cols: 32, rows: 22, area: { x: 479, y: 684, fullY: 725 } },
  EA4: { label: '点字用紙 A4（10×11インチ・40マス×24行）', w: 254, h: 279.4, edl: 'A4', cols: 40, rows: 24, area: { x: 599, y: 790, fullY: 790 } },
  B5: { label: 'B5 縦 (182×257)', w: 182, h: 257 },
  B5L: { label: 'B5 横 (257×182)', w: 257, h: 182 },
  A4: { label: 'A4 縦 (210×297)', w: 210, h: 297 },
  A4L: { label: 'A4 横 (297×210)', w: 297, h: 210 },
  A3: { label: 'A3 縦 (297×420)', w: 297, h: 420 },
  CUSTOM: { label: 'ユーザー定義', w: 200, h: 200 }
}

// エーデル形式で書き出すときの用紙名と点を打てる範囲
// full=true なら ESA721 の範囲いっぱい（B5 で 725 行）まで使う
export function edlPaperOf (page, full = false) {
  const p = PAPERS[page && page.paper]
  // 幅で判断（A4 の幅 600 目盛り ≒ 207mm を超えるなら A4）
  const q = p && p.edl ? p : (page && page.width > 203.3 ? PAPERS.EA4 : PAPERS.EB5)
  return { name: q.edl, area: { x: q.area.x, y: full ? q.area.fullY : q.area.y }, cols: q.cols, rows: q.rows }
}
