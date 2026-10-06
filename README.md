# @naogify/ja-address-unit-split

日本の住所の「**番地より後ろの文字列**」から、建物名・階・部屋番号・棟を切り分けるライブラリ（private・未公開）。

`naogify/overture-address-ja`（Overture の住所を正規化するだけのライブラリ）から、「一つのプログラムには一つのこと」の方針で分割した。住所の正規化（都道府県・市区町村・町字・番地まで）はあちらの仕事で、こちらは**その後ろの文字列**だけを扱う。

## 入出力

- 入力: 番地より後ろの文字列（例 `パレスビル3F 301号室`）。番地までの境界は呼び出し側で決める（`overture-address-ja` の `other` など）。
- 出力（`splitUnitTail(tail)`）: `building` / `buildingRaw` / `floor`（地下は負数）/ `floors` / `floorRaw` / `room` / `roomRaw` / `wing` / `unparsed` / `evidence`（どの規則で切ったか）。
- 精度優先。建物と確信できないものは `building` に入れず `unparsed` に残す（文字は捨てない）。
- `normalizeBuildingName(building)` は名寄せ用の建物名キー（空白・中黒・ハイフン・長音符・括弧の除去、大文字化）。

```ts
import { splitUnitTail } from '@naogify/ja-address-unit-split';

const r = splitUnitTail('パレスビル3F 301号室');
// r.building === 'パレスビル', r.floor === 3, r.room === '301'
```

## 設計・測定

- 設計: [docs/DESIGN-building-split.md](docs/DESIGN-building-split.md)
- **未測の項目**（建物名マスターの効果、標本300の目視精度、同一 key ペアでの建物一致率 など）は `naogify/overture-address-ja` の issue #1 を参照。

## テスト

```
npm install
npm test
```

## ライセンス

MIT
