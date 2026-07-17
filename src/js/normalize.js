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

  // ----- 文字種境界での分割(かな漢字 ⇔ 英数字・記号) -----
  // 「カームタウンA-10」のように、通称(かな)と建物番号(英数字)が
  // 連続している表記をトークンに分けるために使う。
  var JA_CHAR_RE = /[々〆぀-ゟ゠-ヿｦ-ﾝ㐀-䶿一-鿿]/;

  function splitByScriptBoundary(str) {
    var tokens = [];
    var current = "";
    var currentClass = null;

    for (var i = 0; i < str.length; i++) {
      var ch = str[i];
      var cls = JA_CHAR_RE.test(ch) ? "JA" : "OTHER";
      if (currentClass === null) {
        currentClass = cls;
        current = ch;
      } else if (cls === currentClass) {
        current += ch;
      } else {
        tokens.push(current);
        current = ch;
        currentClass = cls;
      }
    }
    if (current) tokens.push(current);

    return tokens
      .map(function (t) {
        return t.trim();
      })
      .filter(function (t) {
        return t.length > 0;
      });
  }

  // ----- 複数トークンの AND 検索 -----
  function andSearch(records, tokens) {
    var normTokens = tokens
      .map(normalize)
      .filter(function (t) {
        return t.length > 0;
      });
    if (normTokens.length === 0) return [];

    return records.filter(function (r) {
      return normTokens.every(function (t) {
        return r.norm.indexOf(t) !== -1;
      });
    });
  }

  /**
   * 住所検索の本体(2段階)。
   * 1. 空白区切りで複数キーワードが入力された場合は、最初から全キーワードの
   *    AND 検索とする(usedFallback: false)。
   * 2. 単一トークンの場合は、まず正規化した全文字列での部分一致を試す。
   * 3. 部分一致が 0 件のときに限り、文字種境界(かな漢字⇔英数字)でトークンに
   *    分割し、AND 検索にフォールバックする(usedFallback: true)。
   *    例:「カームタウンA-10」→「カームタウン」と「A-10」の間に地区名
   *    (「木ノ上」)を挟む実データでも、この段階でヒットする。
   */
  function searchRecords(records, rawQuery) {
    var trimmed = String(rawQuery === null || rawQuery === undefined ? "" : rawQuery).trim();
    if (!trimmed) return { hits: [], usedFallback: false };

    var whitespaceTokens = trimmed.split(/\s+/).filter(function (t) {
      return t.length > 0;
    });

    if (whitespaceTokens.length > 1) {
      return { hits: andSearch(records, whitespaceTokens), usedFallback: false };
    }

    var q = normalize(trimmed);
    var directHits = records.filter(function (r) {
      return r.norm.indexOf(q) !== -1;
    });
    if (directHits.length > 0) {
      return { hits: directHits, usedFallback: false };
    }

    var boundaryTokens = splitByScriptBoundary(trimmed);
    if (boundaryTokens.length > 1) {
      var fallbackHits = andSearch(records, boundaryTokens);
      if (fallbackHits.length > 0) {
        return { hits: fallbackHits, usedFallback: true };
      }
    }

    return { hits: [], usedFallback: false };
  }

  return {
    normalize: normalize,
    splitByScriptBoundary: splitByScriptBoundary,
    searchRecords: searchRecords,
  };
});
