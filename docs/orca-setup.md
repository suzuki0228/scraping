# Orca セットアップガイド（デスクトップ + モバイル）

新世代AI IDE **Orca** は、Claude Code・Codex などの複数AIコーディングエージェントを
**git worktree で隔離しながら並列・協調**させて開発できる **ADE（Agent Development Environment）** です。
無料・オープンソース（MIT）。本体は **PCに入れるデスクトップアプリ**で、スマホは**コンパニオン（遠隔監視）アプリ**です。

セットアップは次の4ステップ：

1. Orca 本体（デスクトップ）を入れる
2. エージェントCLIを入れてログイン
3. リポジトリを追加して起動
4. モバイルアプリをペアリング（外出先から監視・操作）

---

## ① Orca 本体のインストール（OS別）

### macOS
```bash
brew install --cask stablyai/orca/orca
```
Homebrew が無い場合は[公式ダウンロード](https://www.onorca.dev/download)から DMG（Apple Silicon / Intel）。

### Windows
[公式ダウンロード](https://www.onorca.dev/download)から Windows 10/11 x64 インストーラ（.exe / .msi）を実行。

### Linux
- Arch 系: `yay -S stably-orca-bin`
- その他: [公式ダウンロード](https://www.onorca.dev/download)の **AppImage** または **.deb**

> 既定で自動アップデート（stable チャンネル）。新機能を早く試すなら RC ビルドも選択可。

---

## ② エージェントCLIの準備

Orca 自体は無料だが、**各エージェントのサブスク/API は自分で用意**する。
まずは **Claude Code** だけでOK。後から増やせる。

> 前提: `git` と `Node.js（npm）` が必要。未導入なら先に入れる。
> mac: `brew install git node` / Windows: 各公式インストーラ。

### Claude Code（まずこれ）
```bash
npm install -g @anthropic-ai/claude-code
claude        # 初回起動 → ブラウザでログイン（Claude Pro/Max 契約 or APIキー）
```

### Codex（OpenAI / 任意）
```bash
npm install -g @openai/codex
codex
```

### Gemini CLI（Google / 任意）
```bash
npm install -g @google/gemini-cli
gemini
```

---

## ③ 初回起動の流れ

1. Orca を起動 → **ホームディレクトリへのアクセス許可**を求められる
2. 既存設定（`~/.claude`、`~/.codex`、Ghostty）があれば**自動インポート**を提案 → 取り込めばログイン済みを引き継ぐ
3. 空のランディング画面で **「リポジトリを追加」** → 使いたい git プロジェクトを選択
4. プロンプト入力 → エージェント選択（Claude Code / Codex…）→ **各タスクが独立 worktree で起動**
5. 複数エージェントに同じ依頼を投げ、出た diff を**横並び比較 → 良い方をマージ**

### 協調の使いどころ
- 同じ課題を Claude Code と Codex に**同時に解かせて勝者をマージ**
- 内蔵ブラウザの **Design Mode** で UI 要素をクリック → そのままコンテキスト投入
- diff に**行単位で注釈**を付けて修正を差し戻し、IDE を離れずコミット

---

## ④ モバイルアプリ（iOS / Android）でも使う

スマホ版は**コンパニオン（遠隔監視＋軽い操作）**。エージェントの状態確認、ターミナルの直近ログ閲覧、
プロンプトへの返信、worktree のスリープ、ソース管理レビュー、アカウント切替などが手元でできる。

### インストール
- **iOS**: [App Store の Orca IDE](https://apps.apple.com/us/app/orca-ide/id6766130217)（または TestFlight）。iOS 16+ 推奨
- **Android**: 公式の APK を[ダウンロード](https://www.onorca.dev/download)

### ペアリング手順
1. **デスクトップ側**: Orca のアカウント / ステータスメニューから「ペアリング」を開く → **ワンタイムのコード（QR）**が表示される
2. **モバイル側**: コンパニオンアプリを開き「Pair」→ **QR をスキャン**（またはコードを貼り付け／ディープリンク）
3. ペアリング後は端末トークンで自動再接続

### 注意点
- 通信は**端末同士のエンドツーエンド暗号化**（クラウド中継なし）
- **デスクトップの Orca を閉じると接続は切れる**（再起動すると自動再接続）
- 同一 Wi-Fi 上が前提。外出先から本格的に動かしたい場合は、**SSH worktree でリモートマシン上にエージェントを置く**構成が有効

---

## 参考リンク
- [Orca 公式サイト](https://www.onorca.dev/)
- [ダウンロード](https://www.onorca.dev/download)
- [Install ドキュメント](https://www.onorca.dev/docs/install)
- [モバイルコンパニオン ドキュメント](https://www.onorca.dev/docs/mobile)
- [GitHub: stablyai/orca](https://github.com/stablyai/orca)
