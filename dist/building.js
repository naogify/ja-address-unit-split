/**
 * 建物名・階・部屋番号・棟の分離(設計は docs/DESIGN-building-split.md)。
 *
 * 入力は「番地より後ろの文字列」(番地までの境界は呼び出し側で決める。例: overture-address-ja の `other`)。
 * 方針: 精度優先。建物と確信できないものは building に入れず `unparsed` に残す(文字は捨てない)。
 */
import { fold } from './text.js';
/**
 * 建物語(語尾)辞書。Overture 日本10万行の level 8 建物文字列(5,526 件)の語尾頻度から作った
 * (ビル 2,160 / マンション 77 / ハイツ 71 / 会館 40 / プラザ 37 / 本館 24 / 号館 24 / 番館 17 …)。
 * 高精度の語(どこにあっても建物語)。
 */
const SUFFIX_WORDS = [
    'ビルディング', 'ビルヂング', 'ビルヂィング', 'ビル', 'マンション', 'ハイツ', 'コーポラス', 'コーポ', 'アパートメント',
    'アパート', 'レジデンス', 'ハイム', 'メゾン', 'ヴィラ', 'ビラ', 'ハウス', 'タワー', 'タワ', 'プラザ', 'センター', 'センタ',
    'スクエア', 'ヒルズ', 'テラス', 'ガーデンズ', 'ガーデン', 'プレイス', 'パレス', 'コート', 'シティ', 'ステーション', 'ステージ',
    'モール', 'パーク', 'ビレッジ', 'キャンパス', 'ストア', 'ホテル', 'ハウジング', '団地', '住宅', '会館', '本館', '新館', '別館',
    '東館', '西館', '南館', '北館', '号館', '番館', 'ロイヤル', 'グランド', 'ヴィレッジ',
];
/** 語尾にあるときだけ建物語として扱う語(単独の漢字は町名と紛れるため) */
const END_WORDS = ['荘', '館', '店内', '店舗', '本店', '支店', '営業所', '事務所', '工場', '学校', '病院', '庁舎', '内', '店', '院', '校', '園', '駅'];
/** 英語の建物語(ローマ字の建物名を建物と認める) */
const LATIN_WORD = /\b(building|bldg|b\.?l\.?d\.?|tower|plaza|hotel|center|centre|hills|mansion|house|court|square|park|residence|terrace|heights|palace|annex|mall|station|garden|city|apartment|apartments|biru)\b/i;
/** 建物ではなく付近を示す語(末尾にあれば unparsed へ) */
const NOISE_END = /(付近|周辺|近辺|地先|辺り|あたり|ほか|他|等)$/;
/** 町名・区名だけが残ったもの(例: `北区` `富山市` `西町南`)は建物ではない */
const PLACE_ONLY = /^[一-龥]{1,8}[市区町村郡]$/;
const SUFFIX_RE = new RegExp(SUFFIX_WORDS.join('|'));
const END_RE = new RegExp(`(?:${END_WORDS.join('|')})$`);
/**
 * 建物名の表示用正規化(NFKC・空白整理・同義吸収)。
 * @param s 建物名
 * @returns 表示用の建物名
 */
export function normalizeBuildingDisplay(s) {
    return fold(s)
        .replace(/ビルヂィング|ビルヂング|ビルディング/g, 'ビル')
        .replace(/(?<=[\u3040-\u30ff\u3400-\u9fff])\s+(?=[\u3040-\u30ff\u3400-\u9fff])/g, '')
        .trim();
}
/**
 * 建物名をキー用に正規化する(`keyWithUnit` の建物部分)。
 * 規則: 表示用正規化 → 空白・中黒・ハイフン・長音符・区切り文字 `|`・括弧類を除去 → 英字を大文字化 → ヶ/ヵ を ケ/カ に統一。
 * @param building 建物名(null 可)
 * @returns キー用の文字列(無ければ空文字)
 */
export function normalizeBuildingName(building) {
    if (!building)
        return '';
    return normalizeBuildingDisplay(building)
        .replace(/[\s・･·\-‐ー|()（）「」『』【】\[\]]/g, '')
        .toUpperCase()
        .replace(/[ヶヵ]/g, (c) => (c === 'ヶ' ? 'ケ' : 'カ'));
}
/**
 * 1〜99 の漢数字を整数にする(`十二` → 12、`三` → 3)。階の表記用。
 * @param k 漢数字
 * @returns 整数(解釈できなければ 0)
 */
function kanjiToInt(k) {
    const d = '一二三四五六七八九';
    const ten = k.indexOf('十');
    if (ten < 0)
        return d.indexOf(k) + 1;
    const head = ten === 0 ? 1 : d.indexOf(k.slice(0, ten)) + 1;
    const tail = k.slice(ten + 1);
    return head * 10 + (tail ? d.indexOf(tail) + 1 : 0);
}
/** 空の分離結果 */
function empty() {
    return {
        building: null, buildingRaw: null, floor: null, floors: null, floorRaw: null, room: null, roomRaw: null, wing: null,
        unparsed: '', evidence: { building: 'none', floor: null, room: null },
    };
}
/**
 * 番地より後ろの文字列から、棟・階・部屋・建物名を分離する。
 * 処理順: ①4段番地の末尾(`-407`)→ ②棟 → ③階(地下・M・屋上・範囲)→ ④部屋(号室・#・Room)
 *         → ⑤ノイズ語・地名の除去 → ⑥建物名の判定(語尾辞書 → 施設語 → カタカナ連)→ ⑦建物直後・単独の裸の数字は部屋。
 * @param tail 番地より後ろの文字列(例 `アラキビルB1F` `3階301号室` `#102` `Shin-Marunouchi Building B1`)
 * @param opts master: 建物名マスターで建物名を確認する関数(A: 照合して切る)
 * @returns 分離結果
 */
export function splitUnitTail(tail, opts = {}) {
    const out = empty();
    // Overture/JFF ではカタカナの長音符が半角ハイフンで書かれる(`コ-ポ` `グリ-ンコ-ト`)ので、カタカナに挟まれた/後続する `-` は `ー` に直す
    const original = fold(tail).replace(/(?<=[ァ-ヶ])-(?=[ァ-ヶ]|\s|\d|$)/g, 'ー')
        // 区切りに使われる `/` `_` は空白に直す
        .replace(/\s*[/／_＿]\s*/g, ' ');
    let s = original;
    if (!s)
        return out;
    // ① 4段番地の末尾(NJA が `1-6-8` で止まり `-407` が残る)
    const h4 = /^-(\d{3,4})(?=\D|$)/.exec(s);
    if (h4) {
        out.room = h4[1];
        out.roomRaw = h4[0];
        out.evidence.room = 'hyphen4';
        s = s.slice(h4[0].length);
    }
    s = s.replace(/^[\s,、・\-@]+/, '');
    // ② 棟(A棟 / 3号棟 / 東棟)
    s = s.replace(/([A-Za-z0-9東西南北])\s*(?:号棟|棟)/, (_m, w) => {
        out.wing = w.toUpperCase();
        return ' ';
    });
    // 階の並記(`1・2F` `3,4階`)の先頭側にも F を補い、階の表記として取り切る
    s = s.replace(/(\d{1,3})\s*([・･,、])\s*(?=\d{1,3}\s*(?:F|階))/g, '$1F$2');
    // ③ 階: 漢数字の階(`二階` `地下一階`)を算用数字に直してから、地下 → 屋上 → M2F → 通常(範囲・並記)
    s = s.replace(/([一二三四五六七八九十]{1,3})階/g, (_m, k) => `${kanjiToInt(k)}階`);
    s = s.replace(/(?:地下|\bB)\s*-?(\d{1,2})\s*(?:F|階)?(?![0-9])/i, (m, n) => {
        out.floor = -Number(n);
        out.floorRaw = m.trim();
        out.evidence.floor = 'basement';
        return ' ';
    });
    if (out.floor == null) {
        s = s.replace(/(?:屋上|\bRF\b)/i, (m) => {
            out.floorRaw = m;
            out.evidence.floor = 'roof';
            return ' ';
        });
    }
    if (out.floor == null && out.floorRaw == null) {
        s = s.replace(/\bM\s*(\d{1,2})\s*F\b|中\s*(\d{1,2})\s*階/i, (m, a, b) => {
            out.floor = Number(a ?? b);
            out.floorRaw = m.trim();
            out.evidence.floor = 'mezzanine';
            return ' ';
        });
    }
    if (out.floor == null && out.floorRaw == null) {
        s = s.replace(/(\d{1,3})\s*(?:F|階)(?:\s*([-~〜・,、])\s*(\d{1,3})\s*(?:F|階)?)?/i, (m, a, sep, b) => {
            out.floor = Number(a);
            out.floorRaw = m.trim();
            out.evidence.floor = 'token';
            if (b) {
                const lo = Number(a);
                const hi = Number(b);
                out.floors = sep && /[-~〜]/.test(sep) && hi > lo && hi - lo < 60 ? Array.from({ length: hi - lo + 1 }, (_v, i) => lo + i) : [lo, hi];
                out.evidence.floor = 'range';
            }
            return ' ';
        });
    }
    // 連続する階表記(`4F5F`)の2つ目以降は階の併記として畳む
    s = s.replace(/(?<=\s|^)(\d{1,3})\s*(?:F|階)(?=\s|$|,|、)/gi, (_m, n) => {
        if (out.floors == null && out.floor != null && Number(n) !== out.floor)
            out.floors = [out.floor, Number(n)];
        return ' ';
    });
    // ④ 部屋: 301号室 / 101号 / #301 / Room 12 / No.5
    s = s.replace(/([0-9A-Za-z]{1,6}(?:-[0-9A-Za-z]{1,4})?)\s*号室/, (m, n) => {
        out.room = n;
        out.roomRaw = m.trim();
        out.evidence.room = 'token';
        return ' ';
    });
    if (out.room == null) {
        s = s.replace(/(?:#|No\.?\s*|Room\s*|Rm\.?\s*|Suite\s*|Ste\.?\s*)([0-9][0-9A-Za-z-]{0,7}|[A-Za-z]\d{1,4})/i, (m, n) => {
            out.room = n;
            out.roomRaw = m.trim();
            out.evidence.room = 'token';
            return ' ';
        });
    }
    if (out.room == null) {
        s = s.replace(/(?<![0-9])(\d{2,4})\s*号(?![館棟室])/, (m, n) => {
            out.room = n;
            out.roomRaw = m.trim();
            out.evidence.room = 'token';
            return ' ';
        });
    }
    s = s.replace(/\s+/g, ' ').trim();
    // ⑤ ノイズ語(付近・周辺)は unparsed へ
    const noise = [];
    while (NOISE_END.test(s)) {
        const m = NOISE_END.exec(s);
        noise.unshift(m[0]);
        s = s.slice(0, m.index).trim();
    }
    // ⑦a 建物語の直後に付いた裸の数字(`〇〇ビル401` `〇〇ビル 101`)は部屋
    if (out.room == null) {
        const m = /^(.*?(?:ビルディング|ビルヂング|ビル|ハイツ|マンション|コーポ|荘|館|ハウス|レジデンス|テラス|コート|アパート|メゾン|ヴィラ|ハイム|タワー|プラザ|パレス|シティ|Building|Bldg))\s*(\d{2,4}[A-Za-z]?)$/i.exec(s);
        if (m) {
            s = m[1];
            out.room = m[2].toUpperCase();
            out.roomRaw = m[2];
            out.evidence.room = 'bare-after-building';
        }
    }
    // ⑦a' 建物語で終わらない名前(`ソフィア上野301` `エスト京橋 1A`)の末尾の部屋: 3〜4桁、または 数字+英字1文字。名前側が建物らしいときだけ
    if (out.room == null) {
        const m = /^(.{3,}?[^\d\s\-A-Za-z])\s*(\d{3,4}[A-Za-z]?|\d{1,2}-[A-Za-z]|\d[A-Za-z]|[A-Za-z]\d{2,4})$/.exec(s);
        if (m && (SUFFIX_RE.test(m[1]) || END_RE.test(m[1]) || /[ァ-ヶー]{3,}/.test(m[1]))) {
            s = m[1];
            out.room = m[2].toUpperCase();
            out.roomRaw = m[2];
            out.evidence.room = 'bare-after-building';
        }
    }
    // ⑦b 全体が裸の数字(`103` `301`)は部屋
    if (out.room == null && /^\d{2,4}[A-Za-z]?$/.test(s)) {
        out.room = s.toUpperCase();
        out.roomRaw = s;
        out.evidence.room = 'bare';
        s = '';
    }
    // ⑥ 建物名の判定(精度優先: 確信できなければ unparsed)
    const rawSegs = s.split(/[\s,、]+/).filter(Boolean);
    // 連続する英字だけの語は1つの語句にまとめる(`Shin-Marunouchi Building`)
    const isLatin = (x) => !/[\u3040-\u30ff\u3400-\u9fff]/.test(x) && /[A-Za-z]/.test(x);
    const segs = [];
    for (const seg of rawSegs) {
        if (segs.length > 0 && isLatin(seg) && isLatin(segs[segs.length - 1]))
            segs[segs.length - 1] += ` ${seg}`;
        else
            segs.push(seg);
    }
    const kept = [];
    const dropped = [];
    // 階の表記が付いているときは、その前の名前は建物・テナント名である確度が高い(floor-anchor 規則)
    const anchored = out.floor != null || out.floorRaw != null || out.evidence.room === 'bare-after-building';
    for (const seg of segs) {
        const latinOnly = isLatin(seg);
        if (PLACE_ONLY.test(seg) && !SUFFIX_RE.test(seg) && !END_RE.test(seg))
            dropped.push(seg);
        else if (!anchored && latinOnly && seg.replace(/[^A-Za-z]/g, '').length >= 3 && !LATIN_WORD.test(seg))
            dropped.push(seg);
        else if (/^[-\d]+$/.test(seg))
            dropped.push(seg);
        else
            kept.push(seg);
    }
    let cand = kept.join(' ').trim();
    // 番地・町名の食い残し(`北条宮の町390…` `日本橋兜町22-6 …`)は建物ではないので unparsed に回す
    const addrLike = /\d+-\d+|[町村区丁]\d{1,4}(?!\s*(?:階|F))/.test(cand);
    let rule = 'none';
    if (cand && !addrLike) {
        if (opts.master?.(normalizeBuildingName(cand)))
            rule = 'master';
        else if (SUFFIX_RE.test(cand))
            rule = 'suffix';
        else if (END_RE.test(cand) && cand.replace(END_RE, '').length >= 2)
            rule = 'facility';
        else if (/[\u3040-\u30ff\u3400-\u9fff]/.test(cand) === false && LATIN_WORD.test(cand))
            rule = 'latin-suffix';
        else if (/[ァ-ヶー]{4,}/.test(cand))
            rule = 'katakana';
        else if (anchored && cand.length >= 2 && !/^[.\-]/.test(cand) && !PLACE_ONLY.test(cand) && !/^[A-Za-z]$/.test(cand) && !/[A-Za-z]\.\d/.test(cand) && !/^(?:店舗|店内|事務所|倉庫|駐車場|テナント|住居|自宅)$/.test(cand))
            rule = 'floor-anchor';
    }
    // 建物名の末尾に残った出入口・方角・区画記号(`-G` `南東`)は建物名から外して unparsed へ
    const residue = [];
    if (rule !== 'none') {
        const t = /^(.*(?:ビル|館|マンション|ハイツ|タワー|プラザ|[ァ-ヶー]{2,}))(?:\s*[-ー]?([A-Za-z])|\s*([東西南北]{1,2}))$/.exec(cand);
        if (t && t[1].length >= 2) {
            residue.push((t[2] ?? t[3]));
            cand = t[1].trim();
        }
    }
    if (rule !== 'none') {
        // 全体が括弧で囲まれた建物名(`(呉ポートピアパーク内)`)は括弧を外す
        cand = cand.replace(/^[(（]([^()（）]+)[)）]$/, '$1');
        out.buildingRaw = cand;
        out.building = normalizeBuildingDisplay(cand);
        out.evidence.building = rule;
        out.unparsed = [...dropped, ...residue, ...noise].join(' ').trim();
    }
    else {
        // 建物と確信できなければ、元の順序のまま全部 unparsed に残す
        out.unparsed = [...segs, ...noise].join(' ').trim();
    }
    return out;
}
