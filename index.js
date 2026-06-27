"use strict";

/**
 * エントリポイント。実体は src/cli.js。
 *   node index.js edinet --from 2025-05-01 --to 2025-05-31 --company ラクス
 *   node index.js ir --url https://example.com/pricing
 *
 * 調査手順は docs/儲かっている会社_調査フレームワーク.md を参照。
 */
require("./src/cli");
