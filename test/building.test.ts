/**
 * 建物名・階・部屋・棟の分離テスト(設計: docs/DESIGN-building-split.md)。
 * パターンは Overture 日本全件(日本語 freeform 2,282,646 行)の実測から:
 * 階 77,261・地下 5,679・号室 1,518・#部屋 47・建物語尾 76,688・4段番地 5,201 行・付近/周辺 2,633 行 など。
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeBuildingName, normalizeBuildingDisplay, splitUnitTail } from '../src/building.js';

/** [建物, 階, 部屋] だけ取り出す */
const bfr = (s: string) => {
  const u = splitUnitTail(s);
  return [u.building, u.floor, u.room];
};

test('階: 3F / 3階 / 9階(番地直後) → floor と floorRaw', () => {
  assert.deepEqual(bfr('3F'), [null, 3, null]);
  assert.deepEqual(bfr('9階'), [null, 9, null]);
  assert.equal(splitUnitTail('3F').floorRaw, '3F');
  assert.equal(splitUnitTail('3F').evidence.floor, 'token');
});

test('階の範囲・併記: 1F・2F / 3F-5F / 4F5F は floor が先頭、floors が全体', () => {
  assert.equal(splitUnitTail('1F・2F').floor, 1);
  assert.deepEqual(splitUnitTail('1F・2F').floors, [1, 2]);
  assert.deepEqual(splitUnitTail('3F-5F').floors, [3, 4, 5]);
  assert.deepEqual(splitUnitTail('4F5F').floors, [4, 5]);
  assert.equal(splitUnitTail('3階').floors, null);
});

test('地下: B1F / B1 / 地下1階 / ビル直後の B1 は負の階', () => {
  assert.equal(splitUnitTail('B1F').floor, -1);
  assert.equal(splitUnitTail('B2F').floor, -2);
  assert.deepEqual(bfr('アラキビルB1F'), ['アラキビル', -1, null]);
  assert.deepEqual(bfr('第五榎本ビルB1'), ['第五榎本ビル', -1, null]);
  assert.equal(splitUnitTail('池袋グローブ 地下1階').floor, -1);
  assert.equal(splitUnitTail('B1F').evidence.floor, 'basement');
});

test('M2F(中2階)と屋上は階の原文を残す', () => {
  assert.equal(splitUnitTail('M2F').floor, 2);
  assert.equal(splitUnitTail('M2F').evidence.floor, 'mezzanine');
  const r = splitUnitTail('屋上');
  assert.equal(r.floor, null);
  assert.equal(r.floorRaw, '屋上');
});

test('部屋: 301号室 / 101号 / #101 / ＃501 / Room 12', () => {
  assert.equal(splitUnitTail('301号室').room, '301');
  assert.equal(splitUnitTail('101号').room, '101');
  assert.equal(splitUnitTail('#101').room, '101');
  assert.equal(splitUnitTail('＃501').room, '501');
  assert.equal(splitUnitTail('Room 12').room, '12');
  assert.equal(splitUnitTail('301号室').roomRaw, '301号室');
});

test('号館・番館は部屋ではなく建物名の一部', () => {
  assert.deepEqual(bfr('ウエルブ六甲道3番街3番館'), ['ウエルブ六甲道3番街3番館', null, null]);
  assert.equal(splitUnitTail('2号館').room, null);
});

test('階と部屋の併記: よねはくビル3階301号室', () => {
  assert.deepEqual(bfr('よねはくビル3階301号室'), ['よねはくビル', 3, '301']);
});

test('建物名直後の裸の数字は部屋(ツワブキ肥後橋ビル401)、根拠は bare-after-building', () => {
  assert.deepEqual(bfr('ツワブキ肥後橋ビル401'), ['ツワブキ肥後橋ビル', null, '401']);
  assert.equal(splitUnitTail('ツワブキ肥後橋ビル401').evidence.room, 'bare-after-building');
  assert.deepEqual(bfr('アーバンネット札幌ビル 101'), ['アーバンネット札幌ビル', null, '101']);
});

test('単独の裸の数字(103)は建物ではなく部屋(bare)', () => {
  assert.deepEqual(bfr('103'), [null, null, '103']);
  assert.equal(splitUnitTail('103').evidence.room, 'bare');
  assert.equal(splitUnitTail('301').building, null);
});

test('4段番地(1-6-8-407)の末尾は NJA が残した `-407` を部屋に(hyphen4)', () => {
  const u = splitUnitTail('-407 プレザントハウス');
  assert.deepEqual([u.room, u.building], ['407', 'プレザントハウス']);
  assert.equal(u.evidence.room, 'hyphen4');
});

test('先頭に部屋(#501 リスペースワン)・カンマ区切り', () => {
  assert.deepEqual(bfr('#501 リスペースワン'), ['リスペースワン', null, '501']);
  // なるぱーく は語尾辞書にもカタカナ連4にも当たらないが、階が付いているので floor-anchor で建物にする。区名は unparsed
  assert.deepEqual(bfr('なるぱーく1F, 緑区'), ['なるぱーく', 1, null]);
  assert.equal(splitUnitTail('なるぱーく1F, 緑区').evidence.building, 'floor-anchor');
  assert.equal(splitUnitTail('なるぱーく1F, 緑区').unparsed, '緑区');
});

test('棟: A棟 / 3号棟 は wing に分け、建物名に混ぜない', () => {
  const a = splitUnitTail('第一ハイツ A棟 201号室');
  assert.deepEqual([a.building, a.wing, a.room], ['第一ハイツ', 'A', '201']);
  assert.equal(splitUnitTail('3号棟').wing, '3');
});

test('ローマ字の建物(Building/Bldg)は建物、語尾のない英字(取りこぼしたローマ字の町名)は unparsed', () => {
  assert.deepEqual(bfr('Shin-Marunouchi Building B1'), ['Shin-Marunouchi Building', -1, null]);
  assert.deepEqual(bfr('Hishida Building 4階'), ['Hishida Building', 4, null]);
  const u = splitUnitTail('Hondori Minami');
  assert.equal(u.building, null);
  assert.equal(u.unparsed, 'Hondori Minami');
});

test('施設名: 〜内 / 〜店 / 〜店内 は facility として建物扱い', () => {
  assert.equal(splitUnitTail('ブックセンター内').building, 'ブックセンター内');
  assert.equal(splitUnitTail('西友 高砂駅前店').evidence.building, 'facility');
});

test('付近・周辺はノイズ語として unparsed へ。建物にしない', () => {
  const u = splitUnitTail('付近');
  assert.equal(u.building, null);
  assert.equal(u.unparsed, '付近');
  assert.equal(splitUnitTail('アラキビル付近').building, 'アラキビル');
});

test('町名・区名だけの残り(北区 / 富山市)は建物ではない', () => {
  assert.equal(splitUnitTail('北区').building, null);
  assert.equal(splitUnitTail('北区').unparsed, '北区');
});

test('カタカナ連(語尾辞書に無い固有名)は katakana 規則。4文字未満は採らない', () => {
  assert.equal(splitUnitTail('リスペースワン').evidence.building, 'katakana');
  assert.equal(splitUnitTail('シバタ').building, null);
});

test('建物名マスターで確認できれば master 規則で建物にする(A)', () => {
  const master = (n: string) => n === normalizeBuildingName('なるぱーく');
  const u = splitUnitTail('なるぱーく1F', { master });
  assert.equal(u.building, 'なるぱーく');
  assert.equal(u.evidence.building, 'master');
  assert.equal(u.floor, 1);
});

test('建物名の正規化: 同義吸収・全角半角・空白・大文字小文字・区切り文字', () => {
  assert.equal(normalizeBuildingDisplay('アラキビルディング'), 'アラキビル');
  assert.equal(normalizeBuildingName('アラキビル'), normalizeBuildingName('ｱﾗｷﾋﾞﾙ'));
  assert.equal(normalizeBuildingName('アラキビルヂング'), normalizeBuildingName('アラキビル'));
  assert.equal(normalizeBuildingName('Shin-Marunouchi Building'), normalizeBuildingName('SHIN MARUNOUCHI  BUILDING'));
  assert.equal(normalizeBuildingName('リバティベルズ シバタ'), normalizeBuildingName('リバティベルズシバタ'));
  assert.equal(normalizeBuildingName('ビル｜A'), normalizeBuildingName('ビルA'));
  assert.equal(normalizeBuildingName(null), '');
  assert.notEqual(normalizeBuildingName('第一ビル'), normalizeBuildingName('第二ビル'));
});

test('空文字は何も出さない', () => {
  const u = splitUnitTail('');
  assert.deepEqual([u.building, u.floor, u.room, u.wing, u.unparsed], [null, null, null, null, '']);
});

test('floor-anchor: 階が付いた語尾なしの名前(ららぽーと横浜 3階 / Espoir Kanayama 1F)は建物。階が無ければ建物にしない', () => {
  assert.deepEqual(bfr('ららぽーと横浜 3階'), ['ららぽーと横浜', 3, null]);
  assert.equal(splitUnitTail('Espoir Kanayama, 1F').building, 'Espoir Kanayama');
  assert.equal(splitUnitTail('Espoir Kanayama').building, null);
  // 番地の食い残しは階が付いても建物にしない
  assert.equal(splitUnitTail('CH.158 1階').building, null);
});

test('漢数字の階・B-1・語尾なし名の末尾の部屋(ソフィア上野301 / エスト京橋 1A)', () => {
  assert.equal(splitUnitTail('地下一階').floor, -1);
  assert.equal(splitUnitTail('三階').floor, 3);
  assert.equal(splitUnitTail('フジキビル B-1').floor, -1);
  const a = splitUnitTail('ソフィア上野301');
  assert.deepEqual([a.building, a.room], ['ソフィア上野', '301']);
  const b = splitUnitTail('エスト京橋 1A');
  assert.deepEqual([b.building, b.room], ['エスト京橋', '1A']);
});

test('建物名の末尾の方角・区画記号は unparsed、地名+番号の食い残しと「店舗」だけは建物にしない', () => {
  const a = splitUnitTail('大雄ビル 3階南');
  assert.deepEqual([a.building, a.unparsed], ['大雄ビル', '南']);
  assert.equal(splitUnitTail('北条宮の町390フィオーレ北条1F').building, null);
  assert.equal(splitUnitTail('1階店舗').building, null);
  assert.equal(splitUnitTail('美園').building, null);
});

test('ビル語の直後の2桁の数字も部屋(アラキビル 12)', () => {
  const a = splitUnitTail('アラキビル 12');
  assert.deepEqual([a.building, a.room, a.evidence.room], ['アラキビル', '12', 'bare-after-building']);
});

test('カタカナの長音符が半角ハイフンで書かれた建物名(グリ-ンコ-ト)は ー に直して建物語を検出する', () => {
  const a = splitUnitTail(', グリ-ンコ-ト');
  assert.deepEqual([a.building, a.evidence.building], ['グリーンコート', 'suffix']);
  // 4段番地の `-407` や階の `1F-A` はカタカナに挟まれないので影響しない
  assert.equal(splitUnitTail('-407').room, '407');
});

test('実データの残り欠陥: 階の並記・区切り記号・括弧・1-A・B111・語尾が町の建物名', () => {
  const a = splitUnitTail('SSスチ-ル仙台駅前ビル1・2F');
  assert.deepEqual([a.building, a.floor, a.floors], ['SSスチール仙台駅前ビル', 1, [1, 2]]);
  assert.equal(splitUnitTail('ソシオ大宮 3F / 4F').building, 'ソシオ大宮');
  assert.equal(splitUnitTail('(呉ポートピアパーク内)').building, '呉ポートピアパーク内');
  const b = splitUnitTail('ハートイン大曽根 1-A');
  assert.deepEqual([b.building, b.room], ['ハートイン大曽根', '1-A']);
  const c = splitUnitTail('ダイアパレス新宿一丁目B111');
  assert.deepEqual([c.building, c.room], ['ダイアパレス新宿一丁目', 'B111']);
  // カタカナ+町で終わる建物名は地名ではない(漢字だけの `緑区` は地名)
  assert.equal(splitUnitTail('マージュ木屋町 3F').building, 'マージュ木屋町');
  assert.equal(splitUnitTail('エルムの街ショッピングセンタ-1F').building, 'エルムの街ショッピングセンター');
});
