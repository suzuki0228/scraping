"use strict";

/**
 * チャネル1（IR）: EDINET API v2 クライアント。
 *
 * 上場企業の有価証券報告書・四半期/半期報告書などの開示書類を検索・取得する。
 * 営業利益・コスト構造・変動要因を読むための一次ソース。
 *
 * 使い方:
 *   const edinet = require("./edinet");
 *   // 指定日に提出された書類の一覧（メタデータ）
 *   const docs = await edinet.listDocuments("2025-05-15");
 *   // 有報・決算系だけに絞る
 *   const reports = edinet.filterAnnualReports(docs);
 *   // 書類本体(ZIP)をダウンロード
 *   await edinet.downloadDocument(docID, "reports/edinet");
 *
 * 注意: EDINET API v2 は Subscription-Key が必須。config.edinet.apiKey に設定する。
 */

const fs = require("fs");
const path = require("path");
const config = require("./config");
const { sleep } = require("./util");

function assertKey() {
  if (!config.edinet.apiKey) {
    throw new Error(
      "EDINET_API_KEY が未設定です。https://disclosure2.edinet-fsa.go.jp/ でAPIキーを取得し、" +
        "環境変数 EDINET_API_KEY に設定してください。"
    );
  }
}

/**
 * 指定日(YYYY-MM-DD)に提出された書類の一覧を取得する。
 * type=2 で書類のメタデータ一覧を返す。
 */
async function listDocuments(date) {
  assertKey();
  const url = new URL(`${config.edinet.base}/documents.json`);
  url.searchParams.set("date", date);
  url.searchParams.set("type", "2");
  url.searchParams.set("Subscription-Key", config.edinet.apiKey);

  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`EDINET listDocuments 失敗: ${res.status} ${res.statusText}`);
  }
  const json = await res.json();
  return json.results || [];
}

/**
 * 有価証券報告書・四半期報告書・決算短信に関連する書類だけ抽出する。
 * docTypeCode: 120=有価証券報告書, 140=四半期報告書, 160=半期報告書 など。
 */
function filterAnnualReports(docs) {
  const wanted = new Set(["120", "130", "140", "150", "160"]);
  return docs.filter((d) => wanted.has(d.docTypeCode));
}

/**
 * 提出者名(企業名)の部分一致で絞り込む。
 */
function filterByFilerName(docs, keyword) {
  return docs.filter((d) => (d.filerName || "").includes(keyword));
}

/**
 * 書類本体をダウンロードする。
 * type: 1=提出書類本体(ZIP), 2=PDF, 5=英文, etc.
 */
async function downloadDocument(docID, outDir, type = 1) {
  assertKey();
  const url = new URL(`${config.edinet.base}/documents/${docID}`);
  url.searchParams.set("type", String(type));
  url.searchParams.set("Subscription-Key", config.edinet.apiKey);

  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`EDINET downloadDocument 失敗: ${res.status} ${res.statusText}`);
  }
  fs.mkdirSync(outDir, { recursive: true });
  const ext = type === 2 ? "pdf" : "zip";
  const outPath = path.join(outDir, `${docID}.${ext}`);
  const buf = Buffer.from(await res.arrayBuffer());
  fs.writeFileSync(outPath, buf);
  return outPath;
}

/**
 * 期間(YYYY-MM-DD 〜 YYYY-MM-DD)を1日ずつ走査し、企業名キーワードに一致する
 * 有報・決算系書類のメタデータを集める。負荷を避けるため politeDelay を挟む。
 */
async function searchByCompany(fromDate, toDate, companyKeyword) {
  const results = [];
  const cur = new Date(fromDate);
  const end = new Date(toDate);
  while (cur <= end) {
    const date = cur.toISOString().slice(0, 10);
    try {
      const docs = await listDocuments(date);
      let hits = filterAnnualReports(docs);
      if (companyKeyword) hits = filterByFilerName(hits, companyKeyword);
      for (const h of hits) {
        results.push({
          date,
          docID: h.docID,
          filerName: h.filerName,
          docTypeCode: h.docTypeCode,
          docDescription: h.docDescription,
          secCode: h.secCode,
        });
      }
    } catch (e) {
      console.error(`[edinet] ${date} 取得失敗: ${e.message}`);
    }
    await sleep(config.politeDelayMs);
    cur.setDate(cur.getDate() + 1);
  }
  return results;
}

module.exports = {
  listDocuments,
  filterAnnualReports,
  filterByFilerName,
  downloadDocument,
  searchByCompany,
};
