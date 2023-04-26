const puppeteer = require("puppeteer");

(async () => {
  const browser = await puppeteer.launch({ headless: false });
  const page = await browser.newPage();

  // ゲームのURLを指定します。
  await page.goto("https://example.com/game");

  // 自動化のロジックをここに記述します。

  // ブラウザを閉じます。
  // await browser.close();
})();
