# tenzoo のデータ形式

## 1. 考え方

- **ベクトルで保存する**：線・図形・面は「形」と「点の打ち方（スタイル）」で保存し、点そのものは保存しない。
  拡大縮小や点の間隔の変更、出力先の変更をしても情報が劣化しない。
- **出力先に依存しない**：座標はすべて mm（用紙の左上が原点、y は下向き）。プリンタの格子・点の種類への変換は出力時に
  プロファイル（`js/profiles.js`）で行う。ESA721 の3種の点はもちろん、他の点字プリンタや立体コピーにも同じデータから出せる。
- **拡張できる**：JSON なので、知らないキーは読み飛ばせる。`version` で形式の版を区別する。
- **点の大きさは論理名**（`L` 大点 / `M` 中点 / `S` 小点）。実際の直径・高さはプロファイルが決める。

## 2. tenzoo 形式（.tenzoo）

UTF-8 の JSON。

```jsonc
{
  "format": "tenzoo",          // 固定
  "version": 1,                // 形式の版
  "meta": { "title": "家と木", "created": "ISO 8601", "modified": "ISO 8601", "app": "tenzoo" },
  "page": { "paper": "B5", "width": 182, "height": 257 },   // mm
  "profile": "esa721",          // 既定の出力先（esa721 | generic25 | dpi20 | swell | free）
  "settings": {
    "minDist": null,            // 点どうしの最小距離 mm（null ならプロファイルの既定値）
    "braille": { "dotPitchX": 2.4, "dotPitchY": 2.4, "cellPitch": 6.0, "linePitch": 10.0 }
  },
  "layers": [                   // 配列の先頭が一番奥
    {
      "id": "L...", "name": "外形", "visible": true, "locked": false, "color": "#1d4ed8",
      "objects": [ /* 図形（下記） */ ]
    }
  ],
  "activeLayer": "L...",
  "underlays": [                // 下絵（印刷されない）
    { "id": "u...", "name": "photo.jpg", "src": "data:image/jpeg;base64,...",
      "x": 10, "y": 20, "w": 160, "h": 120, "baseW": 160, "baseH": 120, "opacity": 0.4, "visible": true }
  ]
}
```

### 2.1 図形に共通のスタイル

```jsonc
"style": {
  "stroke": true,          // 輪郭線を点で描く
  "dot": "M",              // 輪郭線の点の大きさ L | M | S
  "spacing": 2.0,          // 輪郭線の点の間隔 mm（角には必ず点を置き、辺を均等に割る）
  "line": "solid",         // solid | dashed | dotted
  "arrow": "none",         // none | start | end | both（開いた線のみ）
  "fill": null | {         // 面（閉じた図形のみ）
    "pattern": "grid",     // grid hex dense hlines vlines diag diag2 cross xcross wave zigzag dashed brick checker circles radial random
    "spacing": 3.0,        // 線どうし・点どうしの間隔 mm
    "pitch": 1.6,          // 線の中の点の間隔 mm
    "angle": 0,            // 度
    "dot": "S",            // 面の点の大きさ
    "inset": 1.5           // 輪郭線からの余白 mm（stroke が true のとき有効）
  }
}
```

### 2.2 図形の種類

| type | 内容 |
|---|---|
| `path` | 折れ線・直線・多角形。`points: [[x,y],...]`, `closed` |
| `curve` | 通過点を結ぶ滑らかな曲線（Catmull-Rom）。`points`, `closed` |
| `freehand` | 手描き。`points`, `closed` |
| `rect` | 四角形。`x, y, w, h, rot`（rot は中心まわりのラジアン） |
| `ellipse` | 楕円。`cx, cy, rx, ry, rot` |
| `braille` | 点字。`x, y`（左上の点の中心）, `text`（かな・英数字・Unicode 点字）, `dot`（既定 L）, `metrics`（任意で寸法を上書き） |
| `dots` | 点の集まり（.edl からの読み込み、点の道具、点への変換結果）。`points: [[x, y, size], ...]` |
| `mask` | 塗りつぶしで作った領域。`x, y, cell`（セルの大きさ mm）, `w, h`（セル数）, `rows`（各行のラン `[開始, 長さ, ...]`） |

すべての図形は `id` と `style` を持つ。将来の図形の種類は新しい `type` として追加する（古い版は知らない種類を無視できる）。

## 3. エーデル形式（.edl）

公開仕様はなく、実物ファイルの解析による。テキスト（ASCII）、行末 CRLF、末尾に EOF（0x1A）が付く場合がある。

```
EDELB5,39,677                 ← "EDEL" + 用紙名 + "," + 最小の y + "," + 最大の y
2DPAMF@AMGDAMH...             ← 点の種類（1桁）＋ 点の座標（4文字）の繰り返し
1ADATAJATASAT...
```

- 座標は x・y それぞれ2文字の 26 進数：値 = (文字1 − 64) × 26 + (文字2 − 64)（`@`=0, `A`=1 … `Z`=26）。最大 701
- 点は y の小さい順、同じ y では x の小さい順。点の種類が変わるところで行を変える
- 点の種類：`2` 大点（点字の点）、`1` 中点、`3` 小点（`4` は詳細不明、大点として扱う）
- 1目盛り：x ≒ 0.4mm、y ≒ 0.343mm（2.4/7 mm）。点字の点間隔からの推定
- tenzoo での対応：`2`↔`L`、`1`↔`M`、`3`↔`S`

## 4. 点への変換の手順（出力時）

1. 表示中（または指定）のレイヤの図形ごとに、輪郭線の点・面の点・点字の点を求める（mm）
2. 出力先プロファイルに格子があれば、各点を格子に合わせる
3. 出力先にない点の種類を、使える種類に置き換える
4. 「点どうしの最小距離」より近い点を、大きい点を優先して1つにまとめる
5. 各形式（.edl / SVG / PDF / PNG）に書き出す
