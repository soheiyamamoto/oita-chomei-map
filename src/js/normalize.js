/* ==========================================================================
 * 住所検索用 正規化モジュール
 * - ビルドスクリプト(scripts/build-lookup.mjs)と検索UI(src/js/app.js)の
 *   両方から同一ロジックを共有するための唯一の実装。
 * - ビルドツール不使用の方針に合わせ、Node(CommonJS require)からも
 *   ブラウザ(<script> でのグローバル参照)からも読み込める形にする。
 * ========================================================================== */
(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.OitaNormalize = factory();
  }
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  // ----- 漢数字 → 算用数字 -----
  var KANJI_DIGITS = {
    "〇": 0, "一": 1, "二": 2, "三": 3, "四": 4,
    "五": 5, "六": 6, "七": 7, "八": 8, "九": 9,
  };
  var KANJI_UNITS = { "十": 10, "百": 100, "千": 1000 };
  var KANJI_NUMERAL_RE = /[〇一二三四五六七八九十百千]+/g;

  // 「百五十四」→ 154 のような合成表記を解決する(千・百・十の位取り)。
  function kanjiRunToArabic(run) {
    var section = 0;
    var current = 0;
    for (var i = 0; i < run.length; i++) {
      var ch = run[i];
      if (Object.prototype.hasOwnProperty.call(KANJI_DIGITS, ch)) {
        current = KANJI_DIGITS[ch];
      } else if (Object.prototype.hasOwnProperty.call(KANJI_UNITS, ch)) {
        section += (current || 1) * KANJI_UNITS[ch];
        current = 0;
      }
    }
    return String(section + current);
  }

  function convertKanjiNumerals(str) {
    return str.replace(KANJI_NUMERAL_RE, kanjiRunToArabic);
  }

  // ----- 全角英数字・記号 → 半角 -----
  function fullwidthToHalfwidth(str) {
    return str
      .replace(/[！-～]/g, function (ch) {
        return String.fromCharCode(ch.charCodeAt(0) - 0xfee0);
      })
      .replace(/　/g, " ");
  }

  // ----- 半角カタカナ → 全角カタカナ -----
  var HALFWIDTH_KATAKANA_BASE = {
    "ｦ": "ヲ", "ｱ": "ア", "ｲ": "イ", "ｳ": "ウ", "ｴ": "エ", "ｵ": "オ",
    "ｶ": "カ", "ｷ": "キ", "ｸ": "ク", "ｹ": "ケ", "ｺ": "コ",
    "ｻ": "サ", "ｼ": "シ", "ｽ": "ス", "ｾ": "セ", "ｿ": "ソ",
    "ﾀ": "タ", "ﾁ": "チ", "ﾂ": "ツ", "ﾃ": "テ", "ﾄ": "ト",
    "ﾅ": "ナ", "ﾆ": "ニ", "ﾇ": "ヌ", "ﾈ": "ネ", "ﾉ": "ノ",
    "ﾊ": "ハ", "ﾋ": "ヒ", "ﾌ": "フ", "ﾍ": "ヘ", "ﾎ": "ホ",
    "ﾏ": "マ", "ﾐ": "ミ", "ﾑ": "ム", "ﾒ": "メ", "ﾓ": "モ",
    "ﾔ": "ヤ", "ﾕ": "ユ", "ﾖ": "ヨ",
    "ﾗ": "ラ", "ﾘ": "リ", "ﾙ": "ル", "ﾚ": "レ", "ﾛ": "ロ",
    "ﾜ": "ワ", "ﾝ": "ン",
    "ｧ": "ァ", "ｨ": "ィ", "ｩ": "ゥ", "ｪ": "ェ", "ｫ": "ォ",
    "ｬ": "ャ", "ｭ": "ュ", "ｮ": "ョ", "ｯ": "ッ", "ｰ": "ー",
  };
  var VOICED_MAP = {
    "カ": "ガ", "キ": "ギ", "ク": "グ", "ケ": "ゲ", "コ": "ゴ",
    "サ": "ザ", "シ": "ジ", "ス": "ズ", "セ": "ゼ", "ソ": "ゾ",
    "タ": "ダ", "チ": "ヂ", "ツ": "ヅ", "テ": "デ", "ト": "ド",
    "ハ": "バ", "ヒ": "ビ", "フ": "ブ", "ヘ": "ベ", "ホ": "ボ",
    "ウ": "ヴ",
  };
  var SEMIVOICED_MAP = { "ハ": "パ", "ヒ": "ピ", "フ": "プ", "ヘ": "ペ", "ホ": "ポ" };

  function halfwidthKatakanaToFullwidth(str) {
    // 濁点・半濁点付き(2文字)を先に結合してから、残りを単純変換する。
    str = str.replace(/([ｦ-ﾝ])ﾞ/g, function (_, c) {
      var base = HALFWIDTH_KATAKANA_BASE[c];
      return VOICED_MAP[base] || base + "゛";
    });
    str = str.replace(/([ｦ-ﾝ])ﾟ/g, function (_, c) {
      var base = HALFWIDTH_KATAKANA_BASE[c];
      return SEMIVOICED_MAP[base] || base + "゜";
    });
    str = str.replace(/[ｦ-ﾟ]/g, function (c) {
      return HALFWIDTH_KATAKANA_BASE[c] || c;
    });
    return str;
  }

  // ----- 区切り文字の統一 -----
  // 「番地の」「番地」「の」「−」「-」「ー」はすべて同一区切りとみなす。
  // 「番地の」→「番地」→「の」の順で長い一致を優先しないと、
  // 「154番地の3」の「の」だけが先に消費されてしまう。
  var DELIMITER_RE = /番地の|番地|の|[−\-ー]/g;

  function unifyDelimiters(str) {
    return str.replace(DELIMITER_RE, "-");
  }

  /**
   * 住所・通称の検索用正規化。
   * 同一ロジックをビルド時(norm フィールド生成)と検索時(入力側)の
   * 両方に適用することで、表記ゆれを吸収して一致判定する。
   */
  function normalize(input) {
    if (input === null || input === undefined) return "";
    var s = String(input);
    s = fullwidthToHalfwidth(s);
    s = halfwidthKatakanaToFullwidth(s);
    s = convertKanjiNumerals(s);
    s = unifyDelimiters(s);
    s = s.toUpperCase();
    s = s.replace(/\s+/g, "");
    return s;
  }

  return { normalize: normalize };
});
