// 面の表現（塗りパターン）
// 各パターンは「領域の外接矩形」に候補点を並べる関数。内外判定・輪郭からの距離は raster.js が行う。
import { rng } from './geometry.js'

// 回転した座標系で格子を作るための補助
function rotatedFrame (box, angleDeg) {
  const cx = (box.minX + box.maxX) / 2; const cy = (box.minY + box.maxY) / 2
  const r = Math.hypot(box.maxX - box.minX, box.maxY - box.minY) / 2 + 1
  const a = (angleDeg * Math.PI) / 180; const c = Math.cos(a); const s = Math.sin(a)
  const toWorld = (u, v) => [cx + u * c - v * s, cy + u * s + v * c]
  return { r, toWorld, cx, cy }
}

// 平行な線を並べ、線上に pitch 間隔で点を置く
function lines (box, spacing, pitch, angle, offsetFn = null, stagger = 0) {
  const { r, toWorld } = rotatedFrame(box, angle)
  const out = []
  let k = 0
  for (let v = -Math.floor(r / spacing) * spacing; v <= r; v += spacing, k++) {
    const shift = stagger ? (k % 2) * stagger : 0
    for (let u = -Math.floor(r / pitch) * pitch + shift; u <= r; u += pitch) {
      const dv = offsetFn ? offsetFn(u, k) : 0
      out.push(toWorld(u, v + dv))
    }
  }
  return out
}

export const PATTERNS = {
  grid: {
    label: '格子点',
    gen: (b, p) => lines(b, p.spacing, p.spacing, p.angle)
  },
  hex: {
    label: '千鳥（三角格子）',
    gen: (b, p) => lines(b, p.spacing * Math.sqrt(3) / 2, p.spacing, p.angle, null, p.spacing / 2)
  },
  dense: {
    label: 'ベタ（最小間隔）',
    gen: (b, p) => lines(b, p.pitch, p.pitch, p.angle)
  },
  hlines: {
    label: '横線',
    gen: (b, p) => lines(b, p.spacing, p.pitch, p.angle)
  },
  vlines: {
    label: '縦線',
    gen: (b, p) => lines(b, p.spacing, p.pitch, p.angle + 90)
  },
  diag: {
    label: '斜線（／）',
    gen: (b, p) => lines(b, p.spacing, p.pitch, p.angle - 45)
  },
  diag2: {
    label: '斜線（＼）',
    gen: (b, p) => lines(b, p.spacing, p.pitch, p.angle + 45)
  },
  cross: {
    label: '格子線（＋）',
    gen: (b, p) => [...lines(b, p.spacing, p.pitch, p.angle), ...lines(b, p.spacing, p.pitch, p.angle + 90)]
  },
  xcross: {
    label: '斜め格子（×）',
    gen: (b, p) => [...lines(b, p.spacing, p.pitch, p.angle + 45), ...lines(b, p.spacing, p.pitch, p.angle - 45)]
  },
  wave: {
    label: '波線',
    gen: (b, p) => lines(b, p.spacing, p.pitch, p.angle, u => Math.sin((u / (p.spacing * 2)) * Math.PI * 2) * p.spacing * 0.3)
  },
  zigzag: {
    label: 'ジグザグ',
    gen: (b, p) => lines(b, p.spacing, p.pitch, p.angle, u => {
      const T = p.spacing * 1.5; const t = ((u % T) + T) % T / T
      return (t < 0.5 ? t * 2 - 0.5 : 1.5 - t * 2) * p.spacing * 0.5
    })
  },
  dashed: {
    label: '破線（横）',
    gen: (b, p) => {
      // 3点描いて2点休む。段ごとに半周期ずらす
      const { r, toWorld } = rotatedFrame(b, p.angle)
      const out = []
      let k = 0
      for (let v = -Math.floor(r / p.spacing) * p.spacing; v <= r; v += p.spacing, k++) {
        let i = 0
        for (let u = -Math.floor(r / p.pitch) * p.pitch; u <= r; u += p.pitch, i++) {
          if (((i + (k % 2) * 2) % 5) < 3) out.push(toWorld(u, v))
        }
      }
      return out
    }
  },
  brick: {
    label: 'レンガ',
    gen: (b, p) => {
      const out = []
      const { r, toWorld } = rotatedFrame(b, p.angle)
      const h = p.spacing; const w = p.spacing * 2
      let row = 0
      for (let v = -Math.ceil(r / h) * h; v <= r; v += h, row++) {
        for (let u = -Math.ceil(r / p.pitch) * p.pitch; u <= r; u += p.pitch) out.push(toWorld(u, v))
        const off = (row % 2) * w / 2
        for (let u = -Math.ceil(r / w) * w + off; u <= r; u += w) {
          for (let t = p.pitch; t < h - p.pitch * 0.5; t += p.pitch) out.push(toWorld(u, v + t))
        }
      }
      return out
    }
  },
  checker: {
    label: '市松',
    gen: (b, p) => {
      const blk = p.spacing * 2
      return lines(b, p.pitch, p.pitch, p.angle).filter(pt => {
        const { cx, cy } = rotatedFrame(b, 0)
        const a = (-p.angle * Math.PI) / 180
        const x = (pt[0] - cx) * Math.cos(a) - (pt[1] - cy) * Math.sin(a)
        const y = (pt[0] - cx) * Math.sin(a) + (pt[1] - cy) * Math.cos(a)
        return (Math.floor(x / blk) + Math.floor(y / blk)) % 2 === 0
      })
    }
  },
  circles: {
    label: '同心円',
    gen: (b, p) => {
      const cx = (b.minX + b.maxX) / 2; const cy = (b.minY + b.maxY) / 2
      const R = Math.hypot(b.maxX - b.minX, b.maxY - b.minY) / 2
      const out = [[cx, cy]]
      for (let r = p.spacing; r <= R; r += p.spacing) {
        const n = Math.max(6, Math.round((2 * Math.PI * r) / p.pitch))
        for (let i = 0; i < n; i++) out.push([cx + r * Math.cos((i / n) * 2 * Math.PI), cy + r * Math.sin((i / n) * 2 * Math.PI)])
      }
      return out
    }
  },
  radial: {
    label: '放射線',
    gen: (b, p) => {
      const cx = (b.minX + b.maxX) / 2; const cy = (b.minY + b.maxY) / 2
      const R = Math.hypot(b.maxX - b.minX, b.maxY - b.minY) / 2
      const n = Math.max(6, Math.round(360 / Math.max(5, p.spacing * 3)))
      const out = [[cx, cy]]
      for (let i = 0; i < n; i++) {
        const a = (i / n) * 2 * Math.PI + (p.angle * Math.PI) / 180
        for (let r = p.pitch * 2; r <= R; r += p.pitch) out.push([cx + r * Math.cos(a), cy + r * Math.sin(a)])
      }
      return out
    }
  },
  random: {
    label: 'ランダム（砂目）',
    gen: (b, p) => {
      // ダーツ投げ法：間隔 spacing 未満にならないように置く
      const rand = rng(p.seed || 12345)
      const area = (b.maxX - b.minX) * (b.maxY - b.minY)
      const tries = Math.min(200000, Math.ceil((area / (p.spacing * p.spacing)) * 30))
      const cell = p.spacing / Math.SQRT2
      const grid = new Map(); const out = []
      for (let t = 0; t < tries; t++) {
        const x = b.minX + rand() * (b.maxX - b.minX); const y = b.minY + rand() * (b.maxY - b.minY)
        const i = Math.floor(x / cell); const j = Math.floor(y / cell)
        let ok = true
        for (let di = -2; di <= 2 && ok; di++) {
          for (let dj = -2; dj <= 2 && ok; dj++) {
            const q = grid.get((i + di) + ',' + (j + dj))
            if (q && Math.hypot(q[0] - x, q[1] - y) < p.spacing) ok = false
          }
        }
        if (ok) { grid.set(i + ',' + j, [x, y]); out.push([x, y]) }
      }
      return out
    }
  }
}

export const PATTERN_IDS = Object.keys(PATTERNS)

export function generatePattern (id, box, params) {
  const pat = PATTERNS[id] || PATTERNS.grid
  const p = {
    spacing: Math.max(0.8, +params.spacing || 3),
    pitch: Math.max(0.6, +params.pitch || 1.6),
    angle: +params.angle || 0,
    seed: params.seed
  }
  return pat.gen(box, p)
}
