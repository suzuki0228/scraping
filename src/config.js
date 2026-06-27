"use strict";

/**
 * 設定値。環境変数で上書き可能。
 *
 * EDINET API v2 は購読キー(Subscription-Key)が必要。
 * 金融庁のEDINETでアカウント登録して取得し、環境変数 EDINET_API_KEY に設定する。
 *   https://disclosure2.edinet-fsa.go.jp/  → 「EDINET API」から登録
 */
module.exports = {
  // EDINET API
  edinet: {
    apiKey: process.env.EDINET_API_KEY || "",
    base: "https://api.edinet-fsa.go.jp/api/v2",
  },

  // 出力先（reports/ 配下）
  outDir: process.env.SCRAPE_OUT_DIR || "reports",

  // puppeteer
  puppeteer: {
    headless: process.env.HEADLESS !== "false", // 既定はheadless。HEADLESS=false で画面表示
    // リモート/コンテナ環境向け。プリインストールChromiumを使う場合は実行時に指定
    executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  },

  // 礼儀: リクエスト間隔(ms)。相手サーバに負荷をかけない
  politeDelayMs: Number(process.env.POLITE_DELAY_MS || 1500),
};
