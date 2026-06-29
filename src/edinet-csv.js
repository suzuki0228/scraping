"use strict";

/**
 * EDINET の書類CSV（type=5）から主要財務数値を抽出する。
 *
 * EDINET API の type=5 はCSVを格納したZIPを返す。展開後のCSVは
 * 「UTF-16LE / タブ区切り」で、各行に XBRL の要素ID・値が並ぶ。
 * 本モジュールは展開済みCSVファイル（またはCSV文字列）から
 * 売上高・営業利益を取り出す。
 *
 * 使い方:
 *   const { parseFinancialsFromCsv } = require("./edinet-csv");
 *   const fin = parseFinancialsFromCsv(fs.readFileSync("xxx.csv", "utf16le"));
 *   // => { netSales, operatingIncome }
 *
 * ※ ZIPの展開は依存を増やさないため範囲外。`unzip` 等で展開してから渡すこと。
 */

const fs = require("fs");

// 売上高・営業利益に対応する代表的な XBRL 要素ID（接頭辞は無視して末尾一致で判定）
const NET_SALES_KEYS = [
  "NetSales",
  "NetSalesSummaryOfBusinessResults",
  "Revenue",
  "RevenuesIFRS",
  "NetSalesIFRS",
  "OperatingRevenue",
  "OrdinaryRevenue",
];
const OPERATING_INCOME_KEYS = [
  "OperatingIncome",
  "OperatingIncomeLoss",
  "OperatingIncomeSummaryOfBusinessResults",
  "OperatingProfitLossIFRS",
  "ProfitLossFromOperatingActivitiesIFRS",
];

function matchesAny(elementId, keys) {
  // 例: "jpcrp_cor:NetSales" / "jppfs_cor:OperatingIncome" の末尾を見る
  const tail = String(elementId).split(":").pop();
  return keys.includes(tail);
}

/**
 * CSV文字列(タブ区切り)から財務数値を抽出する。
 * 当期・連結・通期(当年度)の値を優先的に拾う。
 */
function parseFinancialsFromCsv(csvText) {
  const lines = csvText.split(/\r?\n/);
  if (!lines.length) return { netSales: null, operatingIncome: null };

  // ヘッダ行から列インデックスを特定（EDINET CSVの標準列名）
  const header = lines[0].split("\t").map((s) => s.replace(/^"|"$/g, ""));
  const idxElement = header.findIndex((h) => h.includes("要素ID"));
  const idxContext = header.findIndex((h) => h.includes("コンテキストID"));
  const idxValue = header.findIndex((h) => h.includes("値"));

  // ヘッダが取れない場合は固定列(0,1,...,末尾)にフォールバック
  const eIdx = idxElement >= 0 ? idxElement : 0;
  const cIdx = idxContext >= 0 ? idxContext : 1;
  const vIdx = idxValue >= 0 ? idxValue : header.length - 1;

  let netSales = null;
  let operatingIncome = null;

  const preferContext = (ctx) =>
    /CurrentYear/i.test(ctx) && !/NonConsolidated/i.test(ctx); // 当期・連結優先

  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split("\t").map((s) => s.replace(/^"|"$/g, ""));
    if (cols.length <= Math.max(eIdx, cIdx, vIdx)) continue;
    const element = cols[eIdx];
    const context = cols[cIdx] || "";
    const raw = cols[vIdx];
    const value = Number(String(raw).replace(/,/g, ""));
    if (!Number.isFinite(value)) continue;

    if (matchesAny(element, NET_SALES_KEYS)) {
      if (netSales == null || preferContext(context)) netSales = value;
    } else if (matchesAny(element, OPERATING_INCOME_KEYS)) {
      if (operatingIncome == null || preferContext(context)) operatingIncome = value;
    }
  }

  return { netSales, operatingIncome };
}

/** ファイルパスから読み込んで抽出（UTF-16LE想定、ダメならUTF-8で再試行） */
function parseFinancialsFromFile(filePath) {
  let text = fs.readFileSync(filePath, "utf16le");
  if (!text.includes("\t")) text = fs.readFileSync(filePath, "utf8");
  return parseFinancialsFromCsv(text);
}

module.exports = { parseFinancialsFromCsv, parseFinancialsFromFile };
