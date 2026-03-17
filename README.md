# 英検準一級合格アプリ準一 (JUNICHI)

英検準一級対策向けのモバイルファースト学習アプリです。Phase 1 は **語彙オーディオクイズ** に特化した PWA (Progressive Web App) として実装されています。

## 実装済み (Phase 1 MVP)

- Vite + React + TypeScript 構成
- モバイルファースト UI
- ローカル JSON 語彙データ読み込み
- 4択日本語意味クイズ
- Web Speech API (`speechSynthesis`) による英単語読み上げ
- 初回タップ時の音声初期化・再試行によるモバイル再生安定化
- 学習進捗のローカル保存 (`localStorage`)
- 間隔反復 (again / hard / good / easy)
- シンプルな進捗表示
- PWA 設定 (manifest / service worker / installable)
- オフライン向けコア学習フロー (静的アセットキャッシュ)
- GitHub Pages デプロイ用 GitHub Actions
- コアロジックテスト (進捗・採点・SRS)

## 画面イメージ

- クイズカード: 単語表示、音声再生、4択回答
- 結果表示: 正誤フィードバック
- 復習評価: again / hard / good / easy
- 進捗パネル: 回答数 / 正解数 / 正答率 / 即時復習数

## フォルダ構成

```text
.
├─ public/
│  ├─ icons/
│  └─ manifest.webmanifest
├─ src/
│  ├─ app/
│  ├─ components/
│  ├─ data/
│  ├─ domain/
│  ├─ services/
│  ├─ storage/
│  └─ styles/
├─ .github/workflows/
├─ MIGRATION.md
└─ README.md
```

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

起動後、表示された URL (通常 `http://localhost:5173`) を開きます。

## テスト

```bash
npm test
```

## 本番ビルド

```bash
npm run build
```

出力先は `dist/` です。

## GitHub Pages デプロイ

1. GitHub リポジトリの **Settings > Pages** で Source を **GitHub Actions** に設定
2. `main` ブランチへ push
3. `.github/workflows/deploy.yml` がテスト・ビルド・デプロイを実行

`GITHUB_ACTIONS=true` 環境で `vite.config.ts` の `base` が `/junichi/` になるため、GitHub Pages 配信パスに対応します。

## アーキテクチャ方針

- ドメインロジック (`src/domain`) と UI を分離
- ブラウザ依存処理は `src/services` / `src/storage` に隔離
- 音声機能は `SpeechService` として抽象化し、将来ネイティブ実装へ差し替え可能
- データアクセスは `src/data` + storage 層に分離し、将来 API 化しやすい構造

## 次フェーズで予定していること

- listening / reading / writing / speaking モジュールの追加
- 学習分析画面の拡張
- 問題セット拡張とカテゴリ管理
- Capacitor への移行開始

詳細は `MIGRATION.md` を参照してください。
