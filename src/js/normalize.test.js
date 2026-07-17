"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { normalize } = require("./normalize.js");

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
