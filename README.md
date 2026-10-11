# ja-address-unit-split

> Splits the part of a Japanese address *after the block number* into building name, floor, room number and wing.
> Rule-based, precision-first: anything not clearly a building stays in `unparsed` (no characters are dropped).
> Pairs with [`overture-address-ja`](https://github.com/naogify/overture-address-ja), which normalizes the part *before* the block number.

日本の住所の「**番地より後ろの文字列**」から、**建物名・階・部屋番号・棟**を切り分けるライブラリです。

- 状態: private・npm 未公開（Node.js 18 以上、TypeScript / ESM）
- 辞書と規則だけで動きます（外部サービス・住所データへのアクセスなし）。精度優先で、建物と確信できないものは `building` に入れず `unparsed` に残します。

## 何をする／何をしないか

| する | しない |
|---|---|
| 番地より後ろの文字列から、建物名・階（地下は負数）・部屋・棟を切る | 住所の正規化（都道府県・市区町村・町字・番地まで）→ [`naogify/overture-address-ja`](https://github.com/naogify/overture-address-ja) の仕事 |
| 名寄せ用に建物名を揃える（`normalizeBuildingName`） | NJA（`@geolonia/normalize-japanese-addresses`）を呼ばない。ネットワークもデータも使わない |
| 切れなかった文字を `unparsed` にそのまま残す、どの規則で切ったかを `evidence` に残す | 番地の境界の判定。入力は呼び出し側が「番地より後ろ」にして渡す |
| | 名寄せの鍵の生成、建物名の補完・推定（階を部屋番号から推定することもしない） |

「番地より後ろ」は、たとえば `overture-address-ja` の `normalizeAddress()` が返す `other`（建物名・階・部屋が残っている）をそのまま渡せます。

## 入出力の例

下の出力は、実際にこのリポジトリのコードを動かして得た値です（`null` のフィールドは省略して書いています）。

```ts
import { splitUnitTail } from '@naogify/ja-address-unit-split';

splitUnitTail('パレスビル3F 301号室');
// → building: 'パレスビル', floor: 3, floorRaw: '3F', room: '301', roomRaw: '301号室', unparsed: ''
//   evidence: { building: 'suffix', floor: 'token', room: 'token' }

splitUnitTail('ららぽーと横浜 3階');
// → building: 'ららぽーと横浜', floor: 3, floorRaw: '3階', unparsed: ''
//   evidence: { building: 'floor-anchor', floor: 'token', room: null }

splitUnitTail('A棟 2F');
// → floor: 2, floorRaw: '2F', wing: 'A', unparsed: ''           （建物名は無し）

splitUnitTail('103');
// → room: '103', roomRaw: '103'                                 （裸の数字は部屋。階は推定しない）

splitUnitTail('付近');
// → unparsed: '付近'                                            （建物ではないので building に入れない）
```

名寄せ用の建物名キー:

```ts
import { normalizeBuildingName } from '@naogify/ja-address-unit-split';

normalizeBuildingName('パレス・ビル');  // → 'パレスビル'（空白・中黒・ハイフン・長音符・括弧の除去、英字は大文字化）
```

### 出力フィールド（`splitUnitTail(tail)`）

| フィールド | 意味 |
|---|---|
| `building` / `buildingRaw` | 建物名。表示用（NFKC・空白整理・ビルディング/ビルヂング→ビル）／原文（NFKC のみ） |
| `floor` / `floors` / `floorRaw` | 階（地下は負数。複数階は最初の階が `floor`、全部が `floors`）／階の原文（`3F` `地下1階` `屋上`） |
| `room` / `roomRaw` | 部屋番号／原文 |
| `wing` | 棟（`A棟` `3号棟`。`3号館` `東館` は建物名の一部） |
| `unparsed` | 切れなかった残り（文字を捨てない） |
| `evidence` | どの規則で切ったか: `building` = `master` / `suffix` / `facility` / `latin-suffix` / `katakana` / `floor-anchor` / `none`、`floor` = `token` / `range` / `basement` / `mezzanine` / `roof`、`room` = `token` / `bare-after-building` / `bare` / `hyphen4` |

オプション: `splitUnitTail(tail, { master })`。`master` は「この建物名は実在する」と答える関数（建物名マスターの照合用。省略可）。

## 建物名を決める規則の優先順

上から順に当たったものを採用し、どれにも当たらなければ建物なしです。

1. `master` — 呼び出し側が渡したマスターに載っている名前
2. `suffix` — 語尾辞書（ビル・マンション・ハイツ・会館・プラザ…。Overture の日本の住所の建物文字列の語尾頻度から作成）
3. `facility` — 施設語（店・院・校・園・駅・事務所…。語尾にあるときだけ）
4. `latin-suffix` — ローマ字の建物語（Building / Tower / Plaza…）
5. `katakana` — 4 文字以上のカタカナ連
6. `floor-anchor` — 階が付いている語尾なしの名前（`ららぽーと横浜 3階`）

除外（`unparsed` へ）: `付近` `周辺` `地先`、漢字だけの `〇〇区` `〇〇町`、番地の食い残し、建物語を含まない英字だけの語（ローマ字町名）。階・部屋・棟の書き方の一覧、`keyWithUnit` の定義など詳細は [docs/DESIGN-building-split.md](docs/DESIGN-building-split.md) にあります。

## 実測

[設計書 §5](docs/DESIGN-building-split.md) の値です。**ライブラリの 1 つ前のコード（最終修正の 1 つ前）での全件ラン**の数字で、最終版での再測定はしていません。対象は、住所の番地まで届いた行（Overture 1,792,735 行）です。

| | Overture（日本の住所） |
|---|---:|
| 番地まで届いた行 | 1,792,735 |
| うち 建物あり | 160,898（9.0%） |
| うち 階あり | 120,489（6.7%） |
| うち 部屋あり | 27,227（1.5%） |
| うち 棟あり | 1,154 |
| うち いずれか | 188,146（**10.5%**） |
| うち `unparsed` が残る | 40,652 |

- 建物情報が取れる行はもともと少数です（約 1 割）。残りの約 9 割は、番地の後ろに建物情報が無い行です。
- 建物名マスター（国税庁 法人番号）で照合して切る効果は +0.2%（相対）と小さく、同梱していません（`master` オプションで利用者が用意する形）。

精度（標本の目視、シード固定。一部は修正前の版）:

- 修正後の版で標本 150 行を目視: 建物の種類が誤り 0〜2 件、末尾に余計な文字が混入 約 7%（10 件）、建物の見逃し 1 件。
- 修正前の版では、建物語の無い建物名の見逃しが約 26% あり、これを受けて `floor-anchor` を追加しました。

## 限界・既知の問題

- **先頭に施設名が来る形**（`ツルハドラッグ 松本島立店, 松本市…`）は未対応です。
- **NJA の漢数字変換**: `overture-address-ja` 経由で渡す場合、NJA が `other` 内の漢数字を算用数字に変換することがあります（`一の宮ビル` → `1-宮ビル`）。`buildingRaw` が原文と異なります（標本 150 件中 2 件）。
- **4 段番地（`1-6-8-407`）**: 末尾の `-NNN`（3〜4 桁）を部屋とみなす規則（`hyphen4`）があり、本物の 4 段番地を誤認する可能性があります。**誤認率は未測**です。
- 裸の数字（`301`）は部屋とし、階は推定しません。
- JFF（食品営業許可データ）の標本目視は未実施です。最終版での全件再ランも未実施です。
- 雑居ビル・駅ビル・モールの別店舗は、建物・階が取れない限り区別できません。

## 開発

```bash
npm install
npm test           # 26 件
npm run typecheck  # tsc --noEmit
npm run build      # dist/ に出力
```

```
src/        building.ts（splitUnitTail・規則・語尾辞書）、text.ts、index.ts
test/       building.test.ts
docs/       DESIGN-building-split.md（設計と測定の記録）
```

設計書には、元のリポジトリの用語（`normalize.ts` / `keyWithUnit` / `addrUnverified` など）が残っています（冒頭の「移管の注記」を参照）。

## 関連リポジトリ

- [`naogify/overture-address-ja`](https://github.com/naogify/overture-address-ja): Overture の日本の住所を都道府県・市区町村・町字・番地に正規化する（このライブラリの入力 = その `other`）
- [`naogify/ja-person-name`](https://github.com/naogify/ja-person-name): 作成中
- [`naogify/geosearch-poi`](https://github.com/naogify/geosearch-poi): 利用側（POI 検索）

いずれも private です。

## ライセンス

MIT（[LICENSE](LICENSE)）

## `dist/` をコミットしている理由

このパッケージは npm レジストリに出していない private リポジトリで、利用側は
`npm install github:naogify/ja-address-unit-split#<SHA>` の形で git から直接入れる。
git 依存の取得では `npm install` 時にビルドが走らないため、`package.json` の
`main`（`./dist/index.js`）が存在しないと import できない。そこでビルド結果の
`dist/` をリポジトリに含めている（同じ構成の `japanese-person-name-detector` /
`japanese-person-name-dictionary` と同じ扱い）。

`src/` を変えたら `npm run build` を実行し、`dist/` の差分も一緒にコミットすること。
