# MIGRATION: PWA から Capacitor (iOS/Android) への移行計画

このドキュメントは **英検準一級合格アプリ準一 (JUNICHI)** を、現在の GitHub Pages 向け PWA から、将来的に Capacitor ベースの iOS/Android アプリへ移行する手順をまとめたものです。

## 現在の前提 (Phase 1)

- 静的サイトとしてデプロイ可能
- React + TypeScript + Vite
- 音声は `SpeechService` を通してブラウザ実装を利用
- 進捗保存は `ProgressStorage` を通して `localStorage` を利用

この分離により、移行時はサービス実装の差し替え中心で進められます。

## 移行ステップ

### 1. Web 側品質の固定

- `npm test` が安定して通る状態にする
- `npm run build` が常に成功する状態にする
- domain / service / storage の責務分離を維持する

### 2. Capacitor 導入

```bash
npm install @capacitor/core @capacitor/cli
npx cap init "英検準一級合格アプリ準一" "com.example.junichi"
```

### 3. ビルド出力連携

- `dist/` を Capacitor の `webDir` に設定
- `npm run build && npx cap sync` で配布物同期

### 4. iOS / Android プラットフォーム追加

```bash
npx cap add ios
npx cap add android
```

### 5. 依存機能の差し替え

優先度の高い差し替え対象:

- SpeechService (Web Speech API → ネイティブ TTS / plugin)
- ProgressStorage (必要に応じて Capacitor Storage/SQLite へ)
- 通知やバックグラウンド処理 (将来要件に応じて)

### 6. 実機テスト

- iOS / Android の小画面で UI 検証
- 音声再生、進捗保存、オフライン学習導線の確認
- アプリ再開時の状態復元確認

### 7. ストア公開準備 (Phase 3 以降)

- アイコン / スプラッシュ / スクリーンショット
- 権限説明文・プライバシーポリシー
- App Store / Google Play メタデータ整備

## 移行時に守る設計ルール

- domain ロジックは UI・プラットフォームから独立させる
- ブラウザ API 直接呼び出しを UI 内に閉じ込めない
- 新機能 (listening / reading / writing / speaking) も同様に service adapter 経由で実装する

## まとめ

Phase 1 は PWA として学習体験を早く検証し、Phase 2 以降で機能拡張、Phase 3 で Capacitor によるネイティブ配布へ進むのが推奨ルートです。
