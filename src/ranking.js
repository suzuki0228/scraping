"use strict";

/**
 * 営業利益・営業利益率ランキング生成。
 *
 * 入力: [{ name, secCode?, netSales, operatingIncome }] の配列
 *   netSales        = 売上高
 *   operatingIncome = 営業利益
 *
 * 出力: 営業利益でソートしたランキング（営業利益率を計算）と、
 *       「目標営業利益の10倍」足切り基準の判定。
 *
 * フレームワーク §0 の足切り基準（目標の10倍を稼ぐ会社が多数あるか）を機械的にチェックする。
 */

/** 1社分のメトリクスを計算 */
function computeMetrics(row) {
  const netSales = Number(row.netSales) || 0;
  const operatingIncome = Number(row.operatingIncome) || 0;
  const margin = netSales > 0 ? operatingIncome / netSales : null;
  return { ...row, netSales, operatingIncome, operatingMargin: margin };
}

/**
 * ランキングを生成する。
 * @param {Array} rows 企業財務データ
 * @param {object} opts { targetOperatingIncome?: number } 目標営業利益（足切り判定用）
 */
function buildRanking(rows, opts = {}) {
  const target = Number(opts.targetOperatingIncome) || 0;
  const threshold = target * 10; // §0 の足切り: 目標の10倍

  const enriched = rows.map(computeMetrics);

  const byIncome = [...enriched].sort((a, b) => b.operatingIncome - a.operatingIncome);
  const byMargin = [...enriched].sort(
    (a, b) => (b.operatingMargin ?? -Infinity) - (a.operatingMargin ?? -Infinity)
  );

  const passCount = target ? enriched.filter((r) => r.operatingIncome >= threshold).length : null;

  return {
    target,
    threshold,
    // §0: 目標の10倍を稼ぐ会社が「容易に多数」あるか
    cutoff: target
      ? {
          threshold,
          passCount,
          verdict:
            passCount >= 3
              ? "合格: 目標の10倍を稼ぐ会社が複数存在する"
              : "要注意: 目標の10倍を稼ぐ会社が少ない。領域を見直すべきかも",
        }
      : null,
    byOperatingIncome: byIncome,
    byOperatingMargin: byMargin,
  };
}

/** 金額を読みやすい億/万表記に */
function fmtYen(n) {
  if (n == null) return "-";
  const abs = Math.abs(n);
  if (abs >= 1e8) return `${(n / 1e8).toFixed(1)}億円`;
  if (abs >= 1e4) return `${(n / 1e4).toFixed(0)}万円`;
  return `${n}円`;
}

const fmtPct = (m) => (m == null ? "-" : `${(m * 100).toFixed(1)}%`);

/** ランキングを Markdown テーブルに整形 */
function toMarkdown(ranking) {
  const lines = [];
  lines.push("# 営業利益ランキング\n");

  if (ranking.cutoff) {
    lines.push(`## 足切り判定（目標営業利益: ${fmtYen(ranking.target)}）\n`);
    lines.push(`- 基準（目標×10）: **${fmtYen(ranking.threshold)}**`);
    lines.push(`- 基準を超える会社数: **${ranking.cutoff.passCount}社**`);
    lines.push(`- 判定: **${ranking.cutoff.verdict}**\n`);
  }

  lines.push("## 営業利益順\n");
  lines.push("| 順位 | 企業 | コード | 売上高 | 営業利益 | 営業利益率 |");
  lines.push("|---:|---|---|---:|---:|---:|");
  ranking.byOperatingIncome.forEach((r, i) => {
    lines.push(
      `| ${i + 1} | ${r.name} | ${r.secCode || "-"} | ${fmtYen(r.netSales)} | ${fmtYen(
        r.operatingIncome
      )} | ${fmtPct(r.operatingMargin)} |`
    );
  });

  lines.push("\n## 営業利益率順\n");
  lines.push("| 順位 | 企業 | コード | 営業利益率 | 営業利益 | 売上高 |");
  lines.push("|---:|---|---|---:|---:|---:|");
  ranking.byOperatingMargin.forEach((r, i) => {
    lines.push(
      `| ${i + 1} | ${r.name} | ${r.secCode || "-"} | ${fmtPct(r.operatingMargin)} | ${fmtYen(
        r.operatingIncome
      )} | ${fmtYen(r.netSales)} |`
    );
  });

  return lines.join("\n") + "\n";
}

module.exports = { buildRanking, toMarkdown, computeMetrics, fmtYen, fmtPct };
