"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { normalize, splitByScriptBoundary, searchRecords } = require("./normalize.js");
const lookup = require("../data/lookup.json");

test("番地の表記の区切りを統一する: 154番地の3 = 154-3", () => {
  assert.equal(normalize("154番地の3"), normalize("154-3"));
  assert.equal(normalize("154番地の3"), "154-3");
});

test("漢数字の丁目を算用数字に変換する: 一丁目 = 1丁目", () => {
  assert.equal(normalize("一丁目"), normalize("1丁目"));
  assert.equal(normalize("一丁目"), "1丁目");
});

test("全角英数字・全角ハイフンを半角に統一する: Ａ－10 = A-10", () => {
  assert.equal(normalize("Ａ－10"), normalize("A-10"));
  assert.equal(normalize("Ａ－10"), "A-10");
});

test("漢数字の合成表記(百五十四)を解決する", () => {
  assert.equal(normalize("百五十四"), "154");
  assert.equal(normalize("大字木上百五十四番地の3"), normalize("大字木上154-3"));
});

test("半角カタカナを全角カタカナに統一する", () => {
  assert.equal(normalize("ｶｰﾑﾀｳﾝ"), normalize("カームタウン"));
});

test("空白は除去する(全角空白含む)", () => {
  assert.equal(normalize("大字 木上 154"), normalize("大字木上154"));
  assert.equal(normalize("大字　木上　154"), normalize("大字木上154"));
});

test("英字の大文字・小文字を同一視する", () => {
  assert.equal(normalize("a-10"), normalize("A-10"));
});

test("null・undefined・空文字は空文字を返す", () => {
  assert.equal(normalize(null), "");
  assert.equal(normalize(undefined), "");
  assert.equal(normalize(""), "");
});

test("マイナス記号(−)の全角ハイフン(－)・長音記号(ー)も区切りとして同一視する", () => {
  assert.equal(normalize("A−10"), normalize("A-10"));
  assert.equal(normalize("Aー10"), normalize("A-10"));
});

test("splitByScriptBoundary: かな漢字と英数字の境界で分割する", () => {
  assert.deepEqual(splitByScriptBoundary("カームタウンA-10"), ["カームタウン", "A-10"]);
  assert.deepEqual(splitByScriptBoundary("木上台1丁目"), ["木上台", "1", "丁目"]);
});

test("カームタウンA-10 → 該当1件(フォールバック経由)", () => {
  // 実データのaliasは「カームタウン木ノ上A－10」で、「カームタウン」と「A-10」の
  // 間に地区名(木ノ上)を挟むため、単純な部分一致では0件になる。文字種境界での
  // トークン分割(「カームタウン」「A-10」)によるAND検索にフォールバックしてヒットする。
  const result = searchRecords(lookup.records, "カームタウンA-10");
  assert.equal(result.usedFallback, true);
  assert.equal(result.hits.length, 1);
  assert.equal(result.hits[0].id, "kinoue-0001");
});

test("空白区切りの複数キーワード(カームタウン A-10)は最初からAND検索(フォールバックではない)", () => {
  const result = searchRecords(lookup.records, "カームタウン A-10");
  assert.equal(result.usedFallback, false);
  assert.equal(result.hits.length, 1);
  assert.equal(result.hits[0].id, "kinoue-0001");
});

test("searchRecords: 通常の部分一致は引き続きフォールバックなしで動作する", () => {
  const result = searchRecords(lookup.records, "大字木上154番地の3");
  assert.equal(result.usedFallback, false);
  assert.ok(result.hits.length > 0);
  assert.ok(result.hits.some((r) => r.id === "kinoue-0001"));
});
