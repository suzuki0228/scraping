"use strict";

const fs = require("fs");
const path = require("path");

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** reports/ などに JSON / テキストを書き出す */
function writeOut(outDir, filename, data) {
  fs.mkdirSync(outDir, { recursive: true });
  const p = path.join(outDir, filename);
  const body = typeof data === "string" ? data : JSON.stringify(data, null, 2);
  fs.writeFileSync(p, body);
  return p;
}

/** 文字列から最初に一致した数値(カンマ・全角対応)を返す。見つからなければ null */
function extractNumber(text) {
  if (!text) return null;
  const normalized = String(text)
    .replace(/[０-９]/g, (d) => "0123456789"["０１２３４５６７８９".indexOf(d)])
    .replace(/[，]/g, ",");
  const m = normalized.match(/-?[\d,]+(?:\.\d+)?/);
  if (!m) return null;
  return Number(m[0].replace(/,/g, ""));
}

/** YYYY-MM-DD を返す */
function fmtDate(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

module.exports = { sleep, writeOut, extractNumber, fmtDate };
