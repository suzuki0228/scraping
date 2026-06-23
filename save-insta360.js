/**
 * Insta360 クラウド共有ページから動画を保存するスクリプト
 *
 * 使い方:
 *   node save-insta360.js "<共有URL>"
 *
 * 例:
 *   node save-insta360.js "https://cloud-jp.insta360.com/share/jp/XXXXXXXX/player"
 *
 * 動作:
 *   1. Puppeteer でページを開く
 *   2. 裏で流れる動画ファイル(mp4 / m3u8 等)の通信を傍受してURLを収集
 *   3. ページ内に「ダウンロード」ボタンがあれば自動クリックも試みる
 *   4. 取得できた動画ファイルのうち一番大きいものを ./downloads に保存
 */

const fs = require("fs");
const path = require("path");
const puppeteer = require("puppeteer");

// 保存先ディレクトリ
const OUT_DIR = path.join(__dirname, "downloads");

// 動画っぽいURLかどうかを判定
function looksLikeMedia(url) {
  return /\.(mp4|mov|insv|m3u8|webm)(\?|$)/i.test(url);
}

async function downloadToFile(url, headers, destPath) {
  const res = await fetch(url, { headers });
  if (!res.ok) {
    throw new Error(`ダウンロード失敗 HTTP ${res.status}: ${url}`);
  }
  const arrayBuffer = await res.arrayBuffer();
  fs.writeFileSync(destPath, Buffer.from(arrayBuffer));
  return fs.statSync(destPath).size;
}

(async () => {
  const shareUrl = process.argv[2];
  if (!shareUrl) {
    console.error("使い方: node save-insta360.js \"<共有URL>\"");
    process.exit(1);
  }

  if (!fs.existsSync(OUT_DIR)) {
    fs.mkdirSync(OUT_DIR, { recursive: true });
  }

  console.log("ブラウザを起動します...");
  const browser = await puppeteer.launch({
    headless: "new",
    ignoreHTTPSErrors: true, // プロキシ環境などで証明書エラーを回避
    acceptInsecureCerts: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });

  const page = await browser.newPage();
  await page.setUserAgent(
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
      "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
  );

  // 傍受した動画候補URL（重複排除のため Map: url -> contentLength）
  const mediaCandidates = new Map();

  page.on("response", async (response) => {
    try {
      const url = response.url();
      const ct = response.headers()["content-type"] || "";
      const len = Number(response.headers()["content-length"] || 0);
      if (looksLikeMedia(url) || ct.startsWith("video/")) {
        // 既存より大きいサイズがわかれば更新
        const prev = mediaCandidates.get(url) || 0;
        mediaCandidates.set(url, Math.max(prev, len));
        console.log(`  [検出] ${ct || "?"} ${len ? `${len} bytes` : ""} ${url}`);
      }
    } catch (_) {
      /* ignore */
    }
  });

  console.log(`ページを開きます: ${shareUrl}`);
  await page.goto(shareUrl, { waitUntil: "networkidle2", timeout: 60000 });

  // 再生ボタンやダウンロードボタンを探してクリックを試みる
  await page.waitForTimeout?.(3000).catch(() => {});
  await new Promise((r) => setTimeout(r, 3000));

  // ダウンロード/再生 ボタンらしき要素をクリック（あれば）
  const clicked = await page.evaluate(() => {
    const keywords = ["download", "ダウンロード", "保存", "play", "再生"];
    const els = Array.from(document.querySelectorAll("a,button,[role=button],div,span"));
    let hit = false;
    for (const el of els) {
      const text = (el.textContent || "").trim().toLowerCase();
      const aria = (el.getAttribute("aria-label") || "").toLowerCase();
      const title = (el.getAttribute("title") || "").toLowerCase();
      if (keywords.some((k) => text.includes(k) || aria.includes(k) || title.includes(k))) {
        try {
          el.click();
          hit = true;
        } catch (_) {}
      }
    }
    return hit;
  });
  if (clicked) console.log("再生/ダウンロードらしきボタンをクリックしました。");

  // 動画読み込みのため少し待機
  console.log("動画の通信を待っています...");
  await new Promise((r) => setTimeout(r, 8000));

  await browser.close();

  if (mediaCandidates.size === 0) {
    console.error(
      "\n動画ファイルを検出できませんでした。\n" +
        "・共有元がダウンロードを許可していない\n" +
        "・360度動画で特殊なストリーミング形式(m3u8の断片)になっている\n" +
        "可能性があります。headless: false にして実際の画面を見ながら調整してください。"
    );
    process.exit(2);
  }

  // 一番サイズの大きい候補を選ぶ（m3u8は最後の手段）
  const sorted = [...mediaCandidates.entries()].sort((a, b) => {
    const am3u8 = /\.m3u8/i.test(a[0]) ? 1 : 0;
    const bm3u8 = /\.m3u8/i.test(b[0]) ? 1 : 0;
    if (am3u8 !== bm3u8) return am3u8 - bm3u8; // m3u8は後回し
    return b[1] - a[1]; // サイズ降順
  });

  console.log("\n検出した動画候補:");
  sorted.forEach(([u, s], i) => console.log(`  ${i + 1}. (${s} bytes) ${u}`));

  const [bestUrl] = sorted[0];

  if (/\.m3u8/i.test(bestUrl)) {
    console.log(
      "\n検出できたのが m3u8(HLSストリーミング)のみでした。\n" +
        "この場合は ffmpeg で結合保存できます:\n" +
        `  ffmpeg -i "${bestUrl}" -c copy downloads/output.mp4\n`
    );
    process.exit(0);
  }

  // ファイル名を決めて保存
  const urlObj = new URL(bestUrl);
  const base = path.basename(urlObj.pathname) || "insta360_video.mp4";
  const destPath = path.join(OUT_DIR, base);

  console.log(`\n保存中: ${destPath}`);
  const size = await downloadToFile(
    bestUrl,
    {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
        "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      Referer: shareUrl,
    },
    destPath
  );
  console.log(`完了！ ${size} bytes 保存しました -> ${destPath}`);
})().catch((err) => {
  console.error("エラー:", err);
  process.exit(1);
});
