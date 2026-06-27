# 収集ツール（src/）

営業利益ベースで「儲かっている会社」を調べるための一次データ収集ツール。
調査の考え方は [`../docs/儲かっている会社_調査フレームワーク.md`](../docs/儲かっている会社_調査フレームワーク.md) を参照。

## セットアップ

```bash
npm install            # puppeteer を入れる（ir コマンドで必要）
```

EDINET を使う場合は API キーが必要:

```bash
export EDINET_API_KEY="<金融庁EDINETで取得したキー>"
```

> キーは https://disclosure2.edinet-fsa.go.jp/ の「EDINET API」から登録して取得。

## 使い方

### チャネル1（IR）: EDINET から開示書類を収集

```bash
node index.js edinet --from 2025-05-01 --to 2025-05-31 --company ラクス
```

- 指定期間に提出された有報・四半期/半期報告書のメタデータ（docID, 企業名, 証券コード等）を収集
- `--company` は提出者名の部分一致フィルタ（省略で全件）
- 出力: `reports/edinet_<from>_<to>.json`
- 本体PDF/ZIPの取得は `src/edinet.js` の `downloadDocument(docID, outDir, type)` を利用

### チャネル4（企業リリース）: IR/LP/料金ページを収集

```bash
node index.js ir --url https://example.com/pricing --url https://example.com/cases
```

各ページから以下を抽出:

- 料金・単価表記（`priceMatches`）
- 導入社数・利用社数の周辺文と数値化（`adoptionMatches` / `adoptionNumbers`）
- 「選ばれる理由 / 強み / なぜ」系の見出し（`reasons`）
- 導入企業ロゴの alt テキスト（`logos`）
- 出力: `reports/ir_<date>.json`

> ⚠️ マーケ情報は誇張前提。導入社数は「デモ含む」等の可能性があり、割り引いて評価する。
> ⚠️ 各サイトの robots.txt / 利用規約を確認し、過度なアクセスをしない（`POLITE_DELAY_MS` で間隔調整可）。

## 環境変数

| 変数 | 既定 | 説明 |
|---|---|---|
| `EDINET_API_KEY` | （空） | EDINET API v2 の Subscription-Key |
| `SCRAPE_OUT_DIR` | `reports` | 出力ディレクトリ |
| `HEADLESS` | `true` | `false` でブラウザ画面表示 |
| `PUPPETEER_EXECUTABLE_PATH` | （自動） | Chromium パスを明示指定 |
| `POLITE_DELAY_MS` | `1500` | リクエスト間隔(ms) |

## ファイル構成

| ファイル | 役割 |
|---|---|
| `cli.js` | CLI エントリ（`edinet` / `ir` サブコマンド） |
| `edinet.js` | EDINET API v2 クライアント（チャネル1） |
| `ir-scraper.js` | 汎用 IR/LP スクレイパー（チャネル4） |
| `config.js` | 設定（環境変数で上書き） |
| `util.js` | 共通ユーティリティ |
