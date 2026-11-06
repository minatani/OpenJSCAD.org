// 日本語点字（6点）の変換
// セルは 6 ビットの数で表す：1の点=bit0, 2=bit1, 3=bit2, 4=bit3, 5=bit4, 6=bit5（Unicode 点字と同じ並び）

export const dotsToBits = s => [...String(s)].reduce((b, ch) => (ch >= '1' && ch <= '6') ? b | (1 << (ch - 1)) : b, 0)
export const bitsToDots = b => [1, 2, 3, 4, 5, 6].filter(i => b & (1 << (i - 1))).join('')
export const bitsToUnicode = b => String.fromCharCode(0x2800 + (b & 0x3f))
export const unicodeToBits = ch => ch.charCodeAt(0) - 0x2800

const D = dotsToBits

// 清音（母音部分 + 子音部分）
const VOWEL = { a: '1', i: '12', u: '14', e: '124', o: '24' }
const CONS = { '': '', k: '6', s: '56', t: '35', n: '3', h: '36', m: '356', r: '5' }
const ROWS = {
  '': 'あいうえお', k: 'かきくけこ', s: 'さしすせそ', t: 'たちつてと', n: 'なにぬねの',
  h: 'はひふへほ', m: 'まみむめも', r: 'らりるれろ'
}
const VOWELS = ['a', 'i', 'u', 'e', 'o']

const BASIC = new Map()
for (const [c, row] of Object.entries(ROWS)) {
  [...row].forEach((ch, i) => BASIC.set(ch, D(VOWEL[VOWELS[i]] + CONS[c])))
}
Object.entries({
  や: '34', ゆ: '346', よ: '345', わ: '3', ゐ: '23', ゑ: '235', を: '35', ん: '356', っ: '2', ー: '25'
}).forEach(([k, v]) => BASIC.set(k, D(v)))

// 濁音・半濁音
const DAKU = 'がぎぐげござじずぜぞだぢづでどばびぶべぼ'
const DAKU_BASE = 'かきくけこさしすせそたちつてとはひふへほ'
const HANDAKU = 'ぱぴぷぺぽ'
const HANDAKU_BASE = 'はひふへほ'

// 拗音
const YOON = {
  きゃ: 'か', きゅ: 'く', きょ: 'こ', しゃ: 'さ', しゅ: 'す', しょ: 'そ', ちゃ: 'た', ちゅ: 'つ', ちょ: 'と',
  にゃ: 'な', にゅ: 'ぬ', にょ: 'の', ひゃ: 'は', ひゅ: 'ふ', ひょ: 'ほ', みゃ: 'ま', みゅ: 'む', みょ: 'も',
  りゃ: 'ら', りゅ: 'る', りょ: 'ろ'
}
const YOON_DAKU = {
  ぎゃ: 'か', ぎゅ: 'く', ぎょ: 'こ', じゃ: 'さ', じゅ: 'す', じょ: 'そ', ぢゃ: 'た', ぢゅ: 'つ', ぢょ: 'と',
  びゃ: 'は', びゅ: 'ふ', びょ: 'ほ'
}
const YOON_HANDAKU = { ぴゃ: 'は', ぴゅ: 'ふ', ぴょ: 'ほ' }
// 特殊音（主なもの）。前置する符号 + 基になる清音
//   4=拗音系（イェ・シェ・ティ…）, 45=その濁音, 46=テュ・フュ, 456=デュ・ヴュ
//   26=合拗音系（ウィ・クァ・ツァ・トゥ・ファ…）, 256=その濁音
const SPECIAL = {
  いぇ: ['4', 'え'], きぇ: ['4', 'け'], しぇ: ['4', 'せ'], ちぇ: ['4', 'て'], にぇ: ['4', 'ね'], ひぇ: ['4', 'へ'],
  じぇ: ['45', 'せ'], ぢぇ: ['45', 'て'],
  てぃ: ['4', 'ち'], でぃ: ['45', 'ち'], てゅ: ['46', 'つ'], でゅ: ['456', 'つ'], ふゅ: ['46', 'ふ'], ゔゅ: ['456', 'ふ'],
  うぃ: ['26', 'い'], うぇ: ['26', 'え'], うぉ: ['26', 'お'],
  くぁ: ['26', 'か'], くぃ: ['26', 'き'], くぇ: ['26', 'け'], くぉ: ['26', 'こ'],
  ぐぁ: ['256', 'か'], ぐぃ: ['256', 'き'], ぐぇ: ['256', 'け'], ぐぉ: ['256', 'こ'],
  つぁ: ['26', 'た'], つぃ: ['26', 'ち'], つぇ: ['26', 'て'], つぉ: ['26', 'と'],
  とぅ: ['26', 'つ'], どぅ: ['256', 'つ'],
  ふぁ: ['26', 'は'], ふぃ: ['26', 'ひ'], ふぇ: ['26', 'へ'], ふぉ: ['26', 'ほ'],
  ゔぁ: ['256', 'は'], ゔぃ: ['256', 'ひ'], ゔぇ: ['256', 'へ'], ゔぉ: ['256', 'ほ']
}

const PUNCT = {
  '。': ['256'], '、': ['56'], '？': ['26'], '?': ['26'], '！': ['235'], '!': ['235'],
  '・': ['5'], '「': ['36'], '」': ['36'], '（': ['2356'], '）': ['2356'], '(': ['2356'], ')': ['2356'],
  '　': [''], ' ': [''], '～': ['25', '25'], '…': ['2', '2', '2'], '-': ['36'], '－': ['36']
}

const DIGIT = { 1: '1', 2: '12', 3: '14', 4: '145', 5: '15', 6: '124', 7: '1245', 8: '125', 9: '24', 0: '245' }
const ALPHA = 'a:1 b:12 c:14 d:145 e:15 f:124 g:1245 h:125 i:24 j:245 k:13 l:123 m:134 n:1345 o:135 p:1234 q:12345 r:1235 s:234 t:2345 u:136 v:1236 w:2456 x:1346 y:13456 z:1356'
  .split(' ').reduce((m, kv) => { const [k, v] = kv.split(':'); m[k] = v; return m }, {})

const NUMSIGN = D('3456')
const GAIJI = D('56') // 外字符
const CAPS = D('6') // 大文字符
const TSUNAGI = D('36') // つなぎ符

const kataToHira = s => s.replace(/[ァ-ヶ]/g, ch => String.fromCharCode(ch.charCodeAt(0) - 0x60))
const toHalfAlnum = s => s.replace(/[Ａ-Ｚａ-ｚ０-９]/g, ch => String.fromCharCode(ch.charCodeAt(0) - 0xfee0))

/**
 * かな・英数字の文字列を点字セル（ビット値の配列）に変換する。
 * - 漢字は変換できない（読みのかなで入力する）。分かち書きは入力どおり（空白＝マスあけ）。
 * - Unicode 点字文字（⠁ など）はそのまま通す。
 * 戻り値: { cells: number[], unknown: string[] }
 */
export function kanaToBraille (text) {
  const s = toHalfAlnum(kataToHira(String(text))).replace(/\r\n?/g, '\n')
  const cells = []; const unknown = []
  let i = 0
  let inNum = false; let inAlpha = false
  const push = (...bits) => cells.push(...bits)
  while (i < s.length) {
    const ch = s[i]; const two = s.slice(i, i + 2)
    if (ch === '\n') { cells.push(-1); inNum = inAlpha = false; i++; continue } // 改行は -1
    const code = ch.charCodeAt(0)
    if (code >= 0x2800 && code <= 0x28ff) { push(code - 0x2800); i++; inNum = inAlpha = false; continue }
    if (/[0-9]/.test(ch)) {
      if (!inNum) push(NUMSIGN)
      inNum = true; inAlpha = false
      push(D(DIGIT[ch])); i++
      continue
    }
    if ((ch === '.' || ch === ',') && inNum && /[0-9]/.test(s[i + 1] || '')) {
      push(ch === '.' ? D('2') : D('3')); i++; continue
    }
    if (/[A-Za-z]/.test(ch)) {
      if (!inAlpha) push(GAIJI)
      if (ch >= 'A' && ch <= 'Z') push(CAPS)
      inAlpha = true; inNum = false
      push(D(ALPHA[ch.toLowerCase()])); i++
      continue
    }
    // 数字のあとに「あ行・ら行」が来るときはつなぎ符
    const wasNum = inNum
    inNum = false
    if (ch !== ' ' && ch !== '　') inAlpha = false
    if (wasNum && /[あいうえおらりるれろ]/.test(ch)) push(TSUNAGI)

    if (SPECIAL[two]) { const [pre, base] = SPECIAL[two]; push(D(pre), BASIC.get(base)); i += 2; continue }
    if (YOON[two]) { push(D('4'), BASIC.get(YOON[two])); i += 2; continue }
    if (YOON_DAKU[two]) { push(D('45'), BASIC.get(YOON_DAKU[two])); i += 2; continue }
    if (YOON_HANDAKU[two]) { push(D('46'), BASIC.get(YOON_HANDAKU[two])); i += 2; continue }
    if (BASIC.has(ch)) { push(BASIC.get(ch)); i++; continue }
    let k = DAKU.indexOf(ch)
    if (k >= 0) { push(D('5'), BASIC.get(DAKU_BASE[k])); i++; continue }
    k = HANDAKU.indexOf(ch)
    if (k >= 0) { push(D('6'), BASIC.get(HANDAKU_BASE[k])); i++; continue }
    if (ch === 'ゔ') { push(D('5'), BASIC.get('う')); i++; continue }
    if (PUNCT[ch]) { for (const p of PUNCT[ch]) push(D(p)); i++; continue }
    // 小書きの母音などは大きい字として扱う
    const small = 'ぁぃぅぇぉゃゅょゎ'.indexOf(ch)
    if (small >= 0) { push(BASIC.get('あいうえおやゆよわ'[small])); i++; continue }
    unknown.push(ch)
    i++
  }
  return { cells, unknown: [...new Set(unknown)] }
}

// 点字セル → 読み（確認用の簡易逆変換。かなのみ）
const REVERSE = new Map([...BASIC.entries()].map(([k, v]) => [v, k]))
export function brailleToKana (cells) {
  let out = ''; let mode = ''; let numMode = false
  const rDigit = Object.fromEntries(Object.entries(DIGIT).map(([k, v]) => [D(v), k]))
  const rAlpha = Object.fromEntries(Object.entries(ALPHA).map(([k, v]) => [D(v), k]))
  let alpha = false; let cap = false
  for (const c of cells) {
    if (c === -1) { out += '\n'; numMode = alpha = false; continue }
    if (c === 0) { out += ' '; numMode = alpha = false; continue }
    if (c === NUMSIGN) { numMode = true; continue }
    if (c === GAIJI && !numMode) { alpha = true; continue }
    if (numMode && rDigit[c] !== undefined) { out += rDigit[c]; continue }
    if (alpha) {
      if (c === CAPS) { cap = true; continue }
      if (rAlpha[c]) { out += cap ? rAlpha[c].toUpperCase() : rAlpha[c]; cap = false; continue }
    }
    if (numMode && c === TSUNAGI) { numMode = false; continue }
    numMode = false
    if (c === D('5') || c === D('6') || c === D('4') || c === D('45') || c === D('46')) { mode = c; continue }
    const base = REVERSE.get(c)
    if (!base) { out += bitsToUnicode(c); mode = ''; continue }
    if (mode === D('5')) { const k = DAKU_BASE.indexOf(base); out += k >= 0 ? DAKU[k] : base === 'う' ? 'ゔ' : base }
    else if (mode === D('6')) { const k = HANDAKU_BASE.indexOf(base); out += k >= 0 ? HANDAKU[k] : base }
    else if (mode === D('4')) { const e = Object.entries(YOON).find(([, b]) => b === base); out += e ? e[0] : base }
    else if (mode === D('45')) { const e = Object.entries(YOON_DAKU).find(([, b]) => b === base); out += e ? e[0] : base }
    else if (mode === D('46')) { const e = Object.entries(YOON_HANDAKU).find(([, b]) => b === base); out += e ? e[0] : base }
    else out += base
    mode = ''
  }
  return out
}

// 6点入力のキー割り当て（F=1, D=2, S=3, J=4, K=5, L=6）
export const SIX_KEY = { f: 1, d: 2, s: 3, j: 4, k: 5, l: 6 }

/**
 * 点字セルの並びを点の座標（mm）にする。
 * metrics: { dotPitchX, dotPitchY, cellPitch, linePitch }
 */
export function cellsToDots (cells, x0, y0, metrics) {
  const { dotPitchX, dotPitchY, cellPitch, linePitch } = metrics
  const dots = []
  let col = 0; let row = 0
  for (const c of cells) {
    if (c === -1) { row++; col = 0; continue }
    for (let b = 0; b < 6; b++) {
      if (!(c & (1 << b))) continue
      const dx = b < 3 ? 0 : 1; const dy = b % 3
      dots.push([x0 + col * cellPitch + dx * dotPitchX, y0 + row * linePitch + dy * dotPitchY])
    }
    col++
  }
  return dots
}

export const DEFAULT_BRAILLE_METRICS = { dotPitchX: 2.4, dotPitchY: 2.4, cellPitch: 6.0, linePitch: 10.0 }
