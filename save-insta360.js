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

// ---- HLS(m3u8)保存まわり ----
const { execFileSync } = require("child_process");

const DL_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
    "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  Referer: "https://cloud-jp.insta360.com/",
};

async function fetchText(url) {
  const r = await fetch(url, { headers: DL_HEADERS });
  if (!r.ok) throw new Error(`HTTP ${r.status}: ${url}`);
  return r.text();
}

async function fetchBuf(url) {
  const r = await fetch(url, { headers: DL_HEADERS });
  if (!r.ok) throw new Error(`HTTP ${r.status}: ${url}`);
  return Buffer.from(await r.arrayBuffer());
}

// セグメント名/プレイリスト名を絶対URL化し、resourceKey を引き継ぐ
function resolveWithKey(name, baseUrl, resourceKey) {
  const u = new URL(name, baseUrl);
  if (resourceKey && !u.searchParams.has("resourceKey")) {
    u.searchParams.set("resourceKey", resourceKey);
  }
  return u.toString();
}

function hasFfmpeg() {
  try {
    execFileSync("ffmpeg", ["-version"], { stdio: "ignore" });
    return true;
  } catch (_) {
    return false;
  }
}

// 1つのバリアント(=1レンズ)のセグメントを全部落として結合
async function downloadVariant(variantUrl, resourceKey, outBase) {
  const text = await fetchText(variantUrl);

  if (/#EXT-X-KEY/i.test(text)) {
    const keyLine = (text.match(/#EXT-X-KEY[^\n]*/) || [""])[0];
    console.warn(
      `  ⚠️ 暗号化(EXT-X-KEY)が含まれています。復号できない可能性があります:\n    ${keyLine}`
    );
  }

  const lines = text.split(/\r?\n/);
  const mapMatch = text.match(/#EXT-X-MAP:URI="([^"]+)"/i);
  const segments = lines.filter((l) => l && !l.startsWith("#"));

  // init セグメント + 各メディアセグメント
  const parts = [];
  if (mapMatch) parts.push(mapMatch[1]);
  parts.push(...segments);

  console.log(`  セグメント数: ${parts.length}（init含む）`);

  const rawPath = `${outBase}.m4s`;
  const ws = fs.createWriteStream(rawPath);

  // 順序を保ちつつ少し並列で取得（8個ずつのバッチ）
  const BATCH = 8;
  let done = 0;
  for (let i = 0; i < parts.length; i += BATCH) {
    const chunk = parts.slice(i, i + BATCH);
    const bufs = await Promise.all(
      chunk.map((name) => fetchBuf(resolveWithKey(name, variantUrl, resourceKey)))
    );
    for (const b of bufs) ws.write(b);
    done += chunk.length;
    process.stdout.write(`\r  ダウンロード: ${done}/${parts.length}`);
  }
  ws.end();
  await new Promise((res, rej) => ws.on("finish", res).on("error", rej));
  process.stdout.write("\n");

  // ffmpeg があれば mp4 に変換
  if (hasFfmpeg()) {
    const mp4Path = `${outBase}.mp4`;
    execFileSync("ffmpeg", ["-y", "-i", rawPath, "-c", "copy", mp4Path], {
      stdio: "ignore",
    });
    fs.unlinkSync(rawPath);
    return mp4Path;
  }
  return rawPath; // ffmpegが無ければ生の .m4s を残す
}

// master.m3u8 から全レンズを保存
async function downloadHls(masterUrl, resourceKey) {
  console.log(`\nHLS(m3u8)を検出。全セグメントをダウンロードします。`);
  const masterText = await fetchText(masterUrl);

  // master 内のバリアントプレイリスト(.m3u8) を抽出。無ければ master 自体をメディアプレイリスト扱い
  let variants = masterText
    .split(/\r?\n/)
    .filter((l) => l && !l.startsWith("#") && /\.m3u8/i.test(l));
  if (variants.length === 0) variants = [masterUrl];

  const saved = [];
  for (let i = 0; i < variants.length; i++) {
    const vUrl = resolveWithKey(variants[i], masterUrl, resourceKey);
    console.log(`\n[ストリーム ${i}] ${variants[i]}`);
    const outBase = path.join(OUT_DIR, `insta360_stream${i}`);
    const out = await downloadVariant(vUrl, resourceKey, outBase);
    saved.push(out);
    console.log(`  保存: ${out}`);
  }
  return saved;
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
    headless: true,
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

  // m3u8(HLS)が見つかった場合は自動でセグメント結合保存する
  if (sorted.some(([u]) => /\.m3u8/i.test(u))) {
    // resourceKey を持つ候補から鍵を取り出す
    let resourceKey = null;
    for (const [u] of sorted) {
      const rk = new URL(u).searchParams.get("resourceKey");
      if (rk) {
        resourceKey = rk;
        break;
      }
    }
    // master プレイリストを優先（無ければ resourceKey 付き m3u8、それも無ければ先頭の m3u8）
    const m3u8s = sorted.map(([u]) => u).filter((u) => /\.m3u8/i.test(u));
    const masterUrl =
      m3u8s.find((u) => /master/i.test(u) && u.includes("resourceKey")) ||
      m3u8s.find((u) => /master/i.test(u)) ||
      m3u8s.find((u) => u.includes("resourceKey")) ||
      m3u8s[0];

    if (!hasFfmpeg()) {
      console.warn(
        "\n⚠️ ffmpeg が見つかりません。生の .m4s で保存します。\n" +
          "   mp4 にするには ffmpeg をインストールしてください（Mac: brew install ffmpeg）。"
      );
    }

    const saved = await downloadHls(masterUrl, resourceKey);
    console.log("\n完了！ 以下を保存しました:");
    saved.forEach((p) => console.log("  - " + p));
    console.log(
      "\n※ Insta360の360度カメラは前後2つのレンズ映像(stream0 / stream1)に分かれています。\n" +
        "  通常の動画として見るならどちらかを再生、正式な360度編集は Insta360 Studio に取り込んでください。"
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
