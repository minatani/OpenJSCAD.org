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
    // エーデルの座標の1目盛り。実物ファイルの解析による推定値（x 0.4mm, y ≒0.343mm）
    grid: { dx: 0.4, dy: 2.4 / 7, ox: 0, oy: 0 },
    maxUnits: { x: 701, y: 701 },
    sizes: { L: true, M: true, S: true },
    minDist: 1.0,
    note: '3種類の点（大・中・小）。座標はエーデル（.edl）の格子に合わせます。'
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

export const PAPERS = {
  B5: { label: 'B5 縦 (182×257)', w: 182, h: 257 },
  B5L: { label: 'B5 横 (257×182)', w: 257, h: 182 },
  A4: { label: 'A4 縦 (210×297)', w: 210, h: 297 },
  A4L: { label: 'A4 横 (297×210)', w: 297, h: 210 },
  A3: { label: 'A3 縦 (297×420)', w: 297, h: 420 },
  TENJI: { label: '点字用紙 (約 254×279)', w: 254, h: 279 },
  CUSTOM: { label: 'ユーザー定義', w: 200, h: 200 }
}
