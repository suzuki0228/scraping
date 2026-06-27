"use strict";

/**
 * チャネル4（企業によるリリース）: 汎用 IR / LP / 営業資料ページ スクレイパー。
 *
 * 単価・プラン・導入社数・導入企業ロゴ・「なぜ自社か」の訴求文 などを
 * 顧客向けページから収集する。単価 × 導入社数 ≒ 売上推定 に使う。
 *
 * ⚠️ マーケ情報は誇張前提。取れた数値は割り引いて評価すること
 *   （「導入社数（デモ含む）」のトリックに注意）。
 * ⚠️ 各サイトの robots.txt / 利用規約を必ず確認し、過度なアクセスをしないこと。
 */

const config = require("./config");
const { sleep, extractNumber } = require("./util");

// puppeteer は重いので遅延ロード（edinet/help は puppeteer 無しでも動く）
function loadPuppeteer() {
  try {
    return require("puppeteer");
  } catch (e) {
    throw new Error(
      "puppeteer が見つかりません。`npm install` を実行してください。詳細: " + e.message
    );
  }
}

/**
 * 1ページから企業情報の手がかりを抽出する。
 * @param {string} url 対象URL（IRページ / LP / 料金ページ等）
 * @returns {Promise<object>} 抽出結果
 */
async function scrapePage(url) {
  const puppeteer = loadPuppeteer();
  const browser = await puppeteer.launch({
    headless: config.puppeteer.headless,
    executablePath: config.puppeteer.executablePath,
    args: config.puppeteer.args,
  });
  try {
    const page = await browser.newPage();
    await page.setUserAgent(
      "Mozilla/5.0 (compatible; research-bot/1.0; +profitable-business-research)"
    );
    await page.goto(url, { waitUntil: "networkidle2", timeout: 60000 });
    await sleep(config.politeDelayMs);

    const data = await page.evaluate(() => {
      const text = document.body.innerText || "";
      const title = document.title || "";

      // 「導入社数 / 導入企業数 / 社が利用」周辺の文を拾う
      const adoptionMatches = [];
      const adoptionRe = /(.{0,20}(?:導入|利用|契約|アカウント).{0,10}(?:社数|企業数|社|件|アカウント).{0,20})/g;
      let m;
      while ((m = adoptionRe.exec(text)) && adoptionMatches.length < 20) {
        adoptionMatches.push(m[1].trim());
      }

      // 料金表記（円 / 月額 / ¥）周辺
      const priceMatches = [];
      const priceRe = /(.{0,15}(?:月額|料金|プラン|初期費用)?.{0,5}(?:¥|￥|\d[\d,]*\s*円).{0,15})/g;
      let p;
      while ((p = priceRe.exec(text)) && priceMatches.length < 30) {
        const s = p[1].trim();
        if (/(¥|￥|円)/.test(s)) priceMatches.push(s);
      }

      // 「選ばれる理由 / 強み / なぜ」周辺の見出し
      const reasons = [];
      document.querySelectorAll("h1,h2,h3,h4").forEach((h) => {
        const t = (h.innerText || "").trim();
        if (/(選ば|理由|強み|なぜ|特長|特徴|メリット|No\.?1|シェア)/.test(t)) {
          reasons.push(t);
        }
      });

      // 導入企業ロゴ(画像のalt)を拾う
      const logos = [];
      document.querySelectorAll("img[alt]").forEach((img) => {
        const alt = (img.getAttribute("alt") || "").trim();
        if (alt && /(導入|事例|お客様|ロゴ|株式会社|Inc|Corp)/.test(alt)) {
          logos.push(alt);
        }
      });

      return {
        title,
        adoptionMatches: [...new Set(adoptionMatches)],
        priceMatches: [...new Set(priceMatches)],
        reasons: [...new Set(reasons)],
        logos: [...new Set(logos)].slice(0, 50),
      };
    });

    // 代表的な「導入社数」候補を数値化
    const adoptionNumbers = data.adoptionMatches
      .map((s) => ({ raw: s, value: extractNumber(s) }))
      .filter((x) => x.value && x.value >= 1);

    return {
      url,
      scrapedAt: new Date().toISOString(),
      ...data,
      adoptionNumbers,
      caveat:
        "マーケ情報は誇張前提。導入社数は『デモ含む』等の可能性あり、割り引いて評価すること。",
    };
  } finally {
    await browser.close();
  }
}

/**
 * 複数URLを順に（直列・間隔を空けて）スクレイプする。
 */
async function scrapePages(urls) {
  const out = [];
  for (const url of urls) {
    try {
      out.push(await scrapePage(url));
    } catch (e) {
      out.push({ url, error: e.message });
    }
    await sleep(config.politeDelayMs);
  }
  return out;
}

module.exports = { scrapePage, scrapePages };
