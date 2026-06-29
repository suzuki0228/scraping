"use strict";

/**
 * 「儲かっている会社」調査ツール CLI。
 *
 * 使い方:
 *   node src/cli.js edinet --from 2025-05-01 --to 2025-05-31 --company ラクス
 *   node src/cli.js ir --url https://example.com/pricing [--url ...]
 *
 * 詳細は docs/儲かっている会社_調査フレームワーク.md を参照。
 */

const fs = require("fs");
const edinet = require("./edinet");
const ir = require("./ir-scraper");
const ranking = require("./ranking");
const config = require("./config");
const { writeOut, fmtDate } = require("./util");

function parseArgs(argv) {
  const args = { _: [], url: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--url") args.url.push(argv[++i]);
    else if (a.startsWith("--")) args[a.slice(2)] = argv[++i];
    else args._.push(a);
  }
  return args;
}

function help() {
  console.log(`
儲かっている会社 調査ツール

  node src/cli.js edinet --from <YYYY-MM-DD> --to <YYYY-MM-DD> [--company <名称>]
      チャネル1(IR): EDINET から有報・決算系書類のメタデータを収集。
      要 EDINET_API_KEY 環境変数。--company で提出者名を部分一致フィルタ。

  node src/cli.js ir --url <URL> [--url <URL> ...]
      チャネル4: IR/LP/料金ページから単価・導入社数・訴求文を収集。

  node src/cli.js rank --input <financials.json> [--target <円>]
      財務データJSON([{name,secCode,netSales,operatingIncome}])から
      営業利益・営業利益率ランキングを生成。--target で目標営業利益を渡すと
      「目標×10」の足切り判定(§0)も出す。

  出力は ${config.outDir}/ に JSON / Markdown で保存される。
`);
}

async function runEdinet(args) {
  const to = args.to || fmtDate(new Date());
  const from = args.from || to;
  console.log(`[edinet] ${from} 〜 ${to} を走査中${args.company ? `（企業: ${args.company}）` : ""}...`);
  const results = await edinet.searchByCompany(from, to, args.company || "");
  const file = `edinet_${from}_${to}${args.company ? "_" + args.company : ""}.json`;
  const p = writeOut(config.outDir, file, results);
  console.log(`[edinet] ${results.length}件 → ${p}`);
}

async function runIr(args) {
  if (!args.url.length) {
    console.error("--url を1つ以上指定してください");
    process.exit(1);
  }
  console.log(`[ir] ${args.url.length}件のページをスクレイプ中...`);
  const results = await ir.scrapePages(args.url);
  const stamp = fmtDate(new Date());
  const p = writeOut(config.outDir, `ir_${stamp}.json`, results);
  console.log(`[ir] 完了 → ${p}`);
}

async function runRank(args) {
  if (!args.input) {
    console.error("--input <financials.json> を指定してください");
    process.exit(1);
  }
  const rows = JSON.parse(fs.readFileSync(args.input, "utf8"));
  const result = ranking.buildRanking(rows, {
    targetOperatingIncome: args.target ? Number(args.target) : 0,
  });
  const stamp = fmtDate(new Date());
  const md = ranking.toMarkdown(result);
  const pJson = writeOut(config.outDir, `ranking_${stamp}.json`, result);
  const pMd = writeOut(config.outDir, `ranking_${stamp}.md`, md);
  console.log(md);
  console.log(`[rank] → ${pJson}\n[rank] → ${pMd}`);
}

async function main() {
  const argv = process.argv.slice(2);
  const args = parseArgs(argv);
  const cmd = args._[0];

  switch (cmd) {
    case "edinet":
      return runEdinet(args);
    case "ir":
      return runIr(args);
    case "rank":
      return runRank(args);
    default:
      help();
  }
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
