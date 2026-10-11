/**
 * building.ts が使う文字列の畳み込み(overture-address-ja の text.ts から fold のみを最小限コピー)。
 */
/** 数字の間にあるときだけハイフンとして扱う長音・ダッシュ類 */
const DASH_CLASS = '[\\u2010-\\u2015\\u2212\\uFF0D\\u30FC\\uFE63\\u2500\\u2501-]';
/**
 * 住所文字列を NFKC で正規化し、空白とダッシュを整える。
 * - 全角英数→半角、全角空白→半角空白
 * - 数字・英字に挟まれたダッシュ類(−ー‐ 等)を `-` に統一
 * @param s 入力文字列
 * @returns 畳み込み後の文字列(null/undefined は空文字)
 */
export function fold(s) {
    if (s == null)
        return '';
    let t = s.normalize('NFKC');
    // 制御文字(改行・タブ等)は空白へ
    t = t.replace(/[\u0000-\u001f\u007f]+/g, ' ');
    // 数字や英字の隣にあるダッシュ類だけハイフンへ(カタカナの長音は壊さない)
    t = t.replace(new RegExp(`(?<=[0-9A-Za-z])${DASH_CLASS}+(?=[0-9A-Za-z])`, 'g'), '-');
    // 数字どうしを結ぶハイフンの前後の空白(`13 - 1` `13 -1`)は詰める(NJA が番地を「13」で切るのを防ぐ)
    t = t.replace(/(?<=\d)\s*-\s*(?=\d)/g, '-');
    t = t.replace(/\s+/g, ' ').trim();
    return t;
}
