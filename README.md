# 英検準一級合格アプリ準一 (JUNICHI)

英検準一級対策向けのモバイルファースト学習アプリです。  
Phase 1 は **語彙オーディオクイズ** に特化した PWA (Progressive Web App) として実装されています。

---

## 現在のバージョン位置づけ

このリポジトリは **JUNICHI v1.0 / Phase 1 MVP** として、次のコア機能を提供します。

- 英単語の音声再生
- 4択の日本語意味クイズ
- ローカル進捗保存
- 間隔反復 (again / hard / good / easy)
- GitHub Pages での公開
- スマホ中心の短時間学習

---

## 実装済み機能

- Vite + React + TypeScript 構成
- モバイルファースト UI
- ローカル JSON 語彙データ読み込み
- 4択日本語意味クイズ
- Web Speech API (`speechSynthesis`) による英単語読み上げ
- 学習進捗のローカル保存 (`localStorage`)
- 間隔反復 (again / hard / good / easy)
- シンプルな進捗表示
- PWA 設定 (manifest / service worker / installable)
- GitHub Pages デプロイ用 GitHub Actions
- コアロジックテスト (進捗・採点・SRS)
- build 表示による反映確認

---

## 推奨ブラウザ

現時点の実機確認では、音声再生の安定性から **Google Chrome を推奨ブラウザ** とします。

### 推奨

- **Google Chrome (Android)**
  - 実機で音声再生を確認済み
  - 最新 build 反映の確認もしやすい

### 非推奨 / 制限あり

- **DuckDuckGo Browser (Android)**
  - 最新 build の表示は確認できた
  - ただし音声再生がブラウザ側制限により利用できない場合がある
  - このため、JUNICHI の音声学習用途には現時点では非推奨

> 重要: これは JUNICHI のロジック不具合というより、ブラウザ実行環境の差による制限です。

---

## 既知の制限

### 1. ブラウザごとに音声再生可否が異なる

Phase 1 は Web Speech API に依存しています。  
そのため、同じスマートフォンでも **ブラウザごとに音声再生の成否が変わる** 場合があります。

### 2. PWA / Service Worker / キャッシュの影響を受ける

更新直後、古いキャッシュや古い Service Worker が残っていると、旧版画面が表示されることがあります。

その場合は次を確認してください。

- 画面下の `build:` 表示が最新か
- シークレットタブや別ブラウザで同じ URL を開く
- ブラウザ側キャッシュをクリアする

### 3. 音声再生は初回タップ時に不安定なことがある

スマホブラウザでは初回タップで音声初期化が必要な場合があります。  
反応しない場合は、同じ単語で **もう一度再生ボタンをタップ** してください。

### 4. Phase 1 は語彙クイズ専用

現時点では以下は未実装です。

- speech recognition
- listening module
- reading module
- writing correction
- speaking simulation
- user account
- backend / cloud sync

---

## 画面上の build 表示について

画面下に `build: XXXXXXX` が表示されます。

これは次のために入れています。

- 最新版が読み込まれているかの確認
- キャッシュが残っていないかの切り分け
- 実機テスト時のバージョン識別

不具合報告時は、可能なら **build 番号も一緒に記録** してください。

---

## セットアップ

### 必要環境

- Node.js 20 以上推奨
- npm

### インストール

```bash
npm install
```

### ローカル起動

```bash
npm run dev
```

起動後、表示された URL をブラウザで開いて確認します。

---

## テスト

```bash
npm test
```

---

## 本番ビルド

```bash
npm run build
```

出力先は `dist/` です。

---

## GitHub Pages デプロイ

1. `main` にコミット
2. GitHub Actions が自動実行
3. build / deploy 成功後に GitHub Pages へ反映

公開URL:

```text
https://wwm001.github.io/junichi/
```

---

## スマホ実機テスト時の推奨確認項目

- クイズ画面が開くか
- 音声再生ボタンが押せるか
- 音声が鳴るか
- 4択が進行するか
- リロード後も進捗が残るか
- `build:` 表示が意図した更新番号か

---

## アーキテクチャ方針

- ドメインロジック (`src/domain`) と UI を分離
- ブラウザ依存処理は `src/services` / `src/storage` に隔離
- 音声機能は `SpeechService` として抽象化し、将来ネイティブ実装へ差し替え可能
- データアクセスは `src/data` + storage 層に分離し、将来 API 化しやすい構造

---

## 次フェーズで予定していること

- listening / reading / writing / speaking モジュール追加
- 語彙セット拡張
- 学習分析の強化
- Capacitor 化によるアプリ公開準備
- ブラウザ差異を吸収するネイティブ音声実装への移行検討

---

## 関連ドキュメント

- `MIGRATION.md`
- `OPERATIONS.md`

