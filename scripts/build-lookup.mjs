#!/usr/bin/env node
/* ==========================================================================
 * data/sources/*.csv → src/data/lookup.json 変換スクリプト
 *
 * 使い方:
 *   node scripts/build-lookup.mjs
 *
 * 追加依存なし(Node 標準モジュールのみ)。データ更新時に手動で実行する。
 * 検証に1つでも違反があればビルドを失敗させ、行番号付きでエラーを表示する。
 * ========================================================================== */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { normalize } = require("../src/js/normalize.js");

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const SOURCES_DIR = path.join(ROOT, "data", "sources");
const DISTRICTS_PATH = path.join(ROOT, "data", "districts.json");
const OUTPUT_PATH = path.join(ROOT, "src", "data", "lookup.json");
// GitHub Pages は src/ 配下のみ配信するため、検索 UI が実行時に地区の
// 緯度経度を参照できるよう districts.json も src/data/ へ複製する。
const DISTRICTS_OUTPUT_PATH = path.join(ROOT, "src", "data", "districts.json");

const REQUIRED_HEADER = [
  "seq",
  "old_address",
  "alias",
  "new_town",
  "block",
  "house",
  "source_doc",
  "source_page",
  "confidence",
  "note",
];

// alias / source_page / note は空欄を許容する
const REQUIRED_NONEMPTY_COLUMNS = [
  "seq",
  "old_address",
  "new_town",
  "block",
  "house",
  "source_doc",
  "confidence",
];

const NUMERIC_COLUMNS = ["block", "house"];

// ----- CSV パーサ(ダブルクォート・埋め込み改行対応、追加依存なし) -----
function parseCsv(text) {
  const rows = [];
  let field = "";
  let row = [];
  let inQuotes = false;
  let line = 1;
  let rowStartLine = 1;
  let i = 0;
  const n = text.length;

  function pushField() {
    row.push(field);
    field = "";
  }
  function pushRow() {
    pushField();
    rows.push({ values: row, line: rowStartLine });
    row = [];
    rowStartLine = line;
  }

  while (i < n) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i++;
        continue;
      }
      if (c === "\n") line++;
      field += c;
      i++;
      continue;
    }
    if (c === '"') {
      inQuotes = true;
      i++;
      continue;
    }
    if (c === ",") {
      pushField();
      i++;
      continue;
    }
    if (c === "\r") {
      i++;
      continue;
    }
    if (c === "\n") {
      pushRow();
      line++;
      i++;
      continue;
    }
    field += c;
    i++;
  }
  if (field.length > 0 || row.length > 0) {
    pushRow();
  }

  // 完全に空の行(空フィールド1つのみ)は無視する
  return rows.filter((r) => !(r.values.length === 1 && r.values[0] === ""));
}

// ----- メイン処理 -----
function main() {
  if (!fs.existsSync(DISTRICTS_PATH)) {
    console.error(`エラー: 地区メタデータが見つかりません: ${DISTRICTS_PATH}`);
    process.exit(1);
  }
  const districts = JSON.parse(fs.readFileSync(DISTRICTS_PATH, "utf8"));
  const districtByName = new Map(districts.map((d) => [d.name, d]));

  if (!fs.existsSync(SOURCES_DIR)) {
    console.error(`エラー: データソースディレクトリが見つかりません: ${SOURCES_DIR}`);
    process.exit(1);
  }
  // data/sources/ 直下の CSV のうち、対照簿 v2 の10列ヘッダーを持つものだけを
  // 変換対象とする。処理管理台帳など別形式のファイルは、ファイル名に依存せず
  // ヘッダー形式で判別してスキップする(名指しの除外リストは持たない)。
  const allCsvFiles = fs
    .readdirSync(SOURCES_DIR)
    .filter((f) => f.toLowerCase().endsWith(".csv"))
    .sort();

  const csvFiles = allCsvFiles.filter((f) => {
    const firstLine = fs
      .readFileSync(path.join(SOURCES_DIR, f), "utf8")
      .split("\n")[0]
      .trim();
    const header = firstLine.split(",");
    const isSourceCsv = REQUIRED_HEADER.every((col, i) => header[i] === col);
    if (!isSourceCsv) {
      console.warn(
        `[skip] ${f}: ヘッダー不一致のため対照簿データとして扱わずスキップしました`
      );
    }
    return isSourceCsv;
  });

  if (csvFiles.length === 0) {
    console.error(`エラー: ${SOURCES_DIR} に CSV ファイルがありません`);
    process.exit(1);
  }

  const errors = [];
  const allRecords = [];
  const fileSummaries = [];

  for (const filename of csvFiles) {
    const filePath = path.join(SOURCES_DIR, filename);
    const districtName = filename.replace(/\.csv$/i, "");
    const text = fs.readFileSync(filePath, "utf8");
    const rows = parseCsv(text);

    if (rows.length === 0) {
      errors.push(`${filename}: データが空です`);
      continue;
    }

    const header = rows[0].values;
    const headerMatches =
      header.length === REQUIRED_HEADER.length &&
      header.every((h, idx) => h === REQUIRED_HEADER[idx]);

    if (!headerMatches) {
      errors.push(
        `${filename}: ヘッダーが v2 仕様と一致しません\n` +
          `  期待: ${REQUIRED_HEADER.join(",")}\n` +
          `  実際: ${header.join(",")}`
      );
      continue;
    }

    const districtEntry = districtByName.get(districtName);
    if (!districtEntry) {
      errors.push(
        `${filename}: data/districts.json に一致する地区("${districtName}")が見つかりません`
      );
      continue;
    }

    const dataRows = rows.slice(1);
    const seenKeys = new Map(); // 完全重複検知用(seq を除く全列で判定)
    let fileErrorCount = 0;
    const fileRecords = [];

    for (const { values, line } of dataRows) {
      if (values.length !== REQUIRED_HEADER.length) {
        errors.push(
          `${filename}:${line}: 列数が一致しません(期待 ${REQUIRED_HEADER.length} 列、実際 ${values.length} 列)`
        );
        fileErrorCount++;
        continue;
      }

      const row = {};
      REQUIRED_HEADER.forEach((col, idx) => {
        row[col] = values[idx].trim();
      });

      let rowHasError = false;

      for (const col of REQUIRED_NONEMPTY_COLUMNS) {
        if (row[col] === "") {
          errors.push(`${filename}:${line}: 必須列 "${col}" が空です`);
          fileErrorCount++;
          rowHasError = true;
        }
      }

      for (const col of NUMERIC_COLUMNS) {
        if (row[col] !== "" && !/^[0-9]+$/.test(row[col])) {
          errors.push(
            `${filename}:${line}: "${col}" が数字ではありません("${row[col]}")`
          );
          fileErrorCount++;
          rowHasError = true;
        }
      }

      const dupKey = REQUIRED_HEADER.filter((c) => c !== "seq")
        .map((c) => row[c])
        .join("|");
      if (seenKeys.has(dupKey)) {
        errors.push(
          `${filename}:${line}: 完全重複行です(初出: ${seenKeys.get(dupKey)}行目)`
        );
        fileErrorCount++;
        rowHasError = true;
      } else {
        seenKeys.set(dupKey, line);
      }

      if (rowHasError) continue;

      const normSource = [row.old_address, row.alias, row.new_town]
        .filter(Boolean)
        .join(" ");

      fileRecords.push({
        id: `${districtEntry.slug}-${String(row.seq).padStart(4, "0")}`,
        district: districtEntry.name,
        old: row.old_address,
        alias: row.alias,
        new_town: row.new_town,
        block: row.block,
        house: row.house,
        date: districtEntry.date || "",
        conf: row.confidence,
        norm: normalize(normSource),
      });
    }

    fileSummaries.push({
      filename,
      district: districtName,
      dataRows: dataRows.length,
      errorCount: fileErrorCount,
      recordCount: fileRecords.length,
    });

    if (fileErrorCount === 0) {
      allRecords.push(...fileRecords);
    }
  }

  console.log("=== data/sources/*.csv 検証結果 ===");
  for (const s of fileSummaries) {
    console.log(
      `  ${s.filename}: ${s.dataRows} 行中 ${s.recordCount} 件を変換(エラー ${s.errorCount} 件)`
    );
  }
  console.log("");

  if (errors.length > 0) {
    console.error(`ビルド失敗: ${errors.length} 件の検証エラー`);
    console.error("");
    for (const e of errors) {
      console.error("  - " + e);
    }
    process.exit(1);
  }

  const lookup = {
    meta: {
      generated: new Date().toISOString().slice(0, 10),
      source: "大分市 住居表示旧新対照簿",
      districts: fileSummaries.length,
    },
    records: allRecords,
  };

  fs.mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true });
  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(lookup, null, 2) + "\n", "utf8");
  fs.writeFileSync(
    DISTRICTS_OUTPUT_PATH,
    JSON.stringify(districts, null, 2) + "\n",
    "utf8"
  );

  console.log(`OK: ${allRecords.length} 件のレコードを ${path.relative(ROOT, OUTPUT_PATH)} に出力しました`);
  console.log(`OK: 地区メタデータを ${path.relative(ROOT, DISTRICTS_OUTPUT_PATH)} に複製しました`);
}

main();
