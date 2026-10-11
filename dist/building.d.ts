/** 建物名の検出に使った規則 */
export type BuildingRule = 'suffix' | 'facility' | 'katakana' | 'latin-suffix' | 'floor-anchor' | 'master' | 'jigyosyo' | 'none';
/** 分離結果 */
export interface BuildingSplit {
    /** 建物名(NFKC・空白整理・ビルディング/ビルヂング→ビル の同義吸収をした表示用) */
    building: string | null;
    /** 建物名の原文(NFKC のみ) */
    buildingRaw: string | null;
    /** 階(地下は負数)。複数階は最初の階 */
    floor: number | null;
    /** 複数階の表記(`1F・2F` → [1,2]、`3F-5F` → [3,4,5])。単一階なら null */
    floors: number[] | null;
    /** 階の原文(`3F` `地下1階` `屋上`) */
    floorRaw: string | null;
    /** 部屋番号 */
    room: string | null;
    /** 部屋の原文 */
    roomRaw: string | null;
    /** 棟(`A棟` `3号棟`) */
    wing: string | null;
    /** 分離できなかった残り(文字を捨てない) */
    unparsed: string;
    /** 規則ごとの根拠 */
    evidence: {
        building: BuildingRule;
        floor: 'token' | 'range' | 'basement' | 'mezzanine' | 'roof' | null;
        room: 'token' | 'bare-after-building' | 'bare' | 'hyphen4' | null;
    };
}
/**
 * 建物名の表示用正規化(NFKC・空白整理・同義吸収)。
 * @param s 建物名
 * @returns 表示用の建物名
 */
export declare function normalizeBuildingDisplay(s: string): string;
/**
 * 建物名をキー用に正規化する(`keyWithUnit` の建物部分)。
 * 規則: 表示用正規化 → 空白・中黒・ハイフン・長音符・区切り文字 `|`・括弧類を除去 → 英字を大文字化 → ヶ/ヵ を ケ/カ に統一。
 * @param building 建物名(null 可)
 * @returns キー用の文字列(無ければ空文字)
 */
export declare function normalizeBuildingName(building: string | null): string;
/**
 * 番地より後ろの文字列から、棟・階・部屋・建物名を分離する。
 * 処理順: ①4段番地の末尾(`-407`)→ ②棟 → ③階(地下・M・屋上・範囲)→ ④部屋(号室・#・Room)
 *         → ⑤ノイズ語・地名の除去 → ⑥建物名の判定(語尾辞書 → 施設語 → カタカナ連)→ ⑦建物直後・単独の裸の数字は部屋。
 * @param tail 番地より後ろの文字列(例 `アラキビルB1F` `3階301号室` `#102` `Shin-Marunouchi Building B1`)
 * @param opts master: 建物名マスターで建物名を確認する関数(A: 照合して切る)
 * @returns 分離結果
 */
export declare function splitUnitTail(tail: string, opts?: {
    master?: (name: string) => boolean;
}): BuildingSplit;
