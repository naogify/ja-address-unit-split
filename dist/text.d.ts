/**
 * building.ts が使う文字列の畳み込み(overture-address-ja の text.ts から fold のみを最小限コピー)。
 */
/**
 * 住所文字列を NFKC で正規化し、空白とダッシュを整える。
 * - 全角英数→半角、全角空白→半角空白
 * - 数字・英字に挟まれたダッシュ類(−ー‐ 等)を `-` に統一
 * @param s 入力文字列
 * @returns 畳み込み後の文字列(null/undefined は空文字)
 */
export declare function fold(s: string | null | undefined): string;
