# JUNICHI v1.0 公開メモ
**英検準一級合格アプリ準一 (JUNICHI)**  
Phase 1 MVP / 初回公開版

---

## 1. 概要

JUNICHI v1.0 を公開しました。  
本バージョンは、**英検準一級の語彙学習に特化した Phase 1 MVP** です。

現時点では、短時間で反復学習できる **Vocabulary Audio Quiz** を中心機能として実装しています。  
ブラウザ上で動作する **PWA (Progressive Web App)** として公開しており、今後の listening / reading / writing / speaking 拡張、および Capacitor によるアプリ化を見据えた土台バージョンです。

---

## 2. 公開URL

**公開URL**  
https://wwm001.github.io/junichi/

---

## 3. 現在の位置づけ

本バージョンは以下の位置づけです。

- **JUNICHI v1.0**
- **Phase 1 MVP**
- **語彙クイズ特化版**
- **実機確認・運用確認を兼ねた初回公開版**

---

## 4. 実装済み機能

- 英単語の音声再生
- 4択の日本語意味クイズ
- ローカル進捗保存
- 間隔反復 (again / hard / good / easy)
- スマホ中心UI
- GitHub Pages での公開
- `build:` 表示による反映確認
- README / OPERATIONS / MIGRATION ドキュメント整備

---

## 5. 推奨ブラウザ

### 推奨
- **Google Chrome (Android)**

### 理由
- 実機で音声再生を確認済み
- 最新 build の反映確認がしやすい
- Phase 1 の音声学習用途として最も安定

---

## 6. 既知の制限

### 1. ブラウザごとに音声再生の成否が異なる
本バージョンは Web Speech API に依存しています。  
そのため、同じスマートフォン端末でも **ブラウザごとに音声再生可否が変わる** 場合があります。

### 2. DuckDuckGo Browser は現時点で非推奨
実機確認では、

- **Chrome**: 音声再生を確認
- **DuckDuckGo Browser**: 制限警告表示。音声学習用途では非推奨

という結果になりました。

これは JUNICHI のロジック不具合というより、  
**ブラウザ実行環境差による制限** と判断しています。

### 3. PWA / Service Worker / キャッシュの影響を受ける
更新直後、古いキャッシュや Service Worker が残っていると旧画面が表示されることがあります。

確認時は以下を推奨します。

- 画面下の `build:` 表示を確認
- シークレットタブや別ブラウザで開く
- ブラウザ側のキャッシュをクリアする

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

## 7. 実機確認結果

### Android 実機確認
確認端末: **Pixel 8**

### 確認済み項目
- 画面が開く → OK
- 単語クイズが表示される → OK
- 4択を押して進行する → OK
- リロード後も進捗が保持される → OK
- 画面下 `build:` 表示で反映確認可能 → OK

### 音声再生
- **Chrome** → OK
- **DuckDuckGo Browser** → 制限あり / 非推奨

### build 確認時点
- **build: 887938b**

---

## 8. GitHub Releases 用テキスト

## JUNICHI v1.0
Phase 1 MVP の初回公開版です。

### 追加内容
- Vocabulary Audio Quiz を実装
- 英単語音声再生
- 4択日本語意味クイズ
- ローカル進捗保存
- 間隔反復 (again / hard / good / easy)
- GitHub Pages 公開
- build 表示による反映確認
- README / OPERATIONS / MIGRATION 更新

### 推奨ブラウザ
- Google Chrome (Android)

### 既知の制限
- Web Speech API 依存のため、ブラウザごとに音声再生可否が異なる
- DuckDuckGo Browser では音声学習用途は現時点で非推奨
- キャッシュや Service Worker の影響で旧版表示になる場合がある

### 補足
- 実機確認端末: Pixel 8
- build 確認時点: 887938b

---

## 9. Discord共有用テキスト

JUNICHI v1.0 を公開しました。  
英検準一級向けの **語彙オーディオクイズ特化PWA** です。

公開URL:  
https://wwm001.github.io/junichi/

現時点のポイント:
- 英単語音声再生
- 4択日本語意味クイズ
- 進捗保存
- 間隔反復
- build表示で更新確認可能

実機確認では **Android Chrome で音声再生OK** でした。  
一方で **DuckDuckGo Browser は音声制限あり** だったため、現時点では **Chrome 推奨** です。

まだ Phase 1 MVP なので、今後は listening / reading / writing / speaking の拡張を予定しています。

---

## 10. 自分用記録

### 今回の到達点
- GitHub Pages 公開成功
- README に現状仕様・推奨ブラウザ・既知の制限を反映
- build 表示で更新確認できるようにした
- Android Chrome で音声再生確認
- DuckDuckGo Browser は制限ありと切り分け完了

### 技術的に確定したこと
- 問題は単純なコード不具合だけではなく、**ブラウザ依存** が大きい
- キャッシュ切り分けのために `build:` 表示は有効
- Chrome を推奨ブラウザとして明記するのが合理的
- Phase 1 では「まず動く語彙クイズ」を成立させる方針で正しい

### 今後の優先候補
1. 音声周りの安定化継続
2. 語彙データ拡張
3. UI の見やすさ改善
4. listening / reading モジュール追加
5. Capacitor 移行準備

---

## 11. 次フェーズ候補

- listening モジュール追加
- reading モジュール追加
- 学習分析画面の強化
- 問題数拡張
- カテゴリ管理
- ブラウザ差を吸収するためのネイティブ音声実装検討
- Capacitor によるアプリ化準備

---

## 12. 一言まとめ

**JUNICHI v1.0 は、英検準一級の語彙学習に特化した Phase 1 MVP として公開完了。  
Android Chrome を推奨ブラウザとし、ブラウザ差を既知の制限として明示した初回公開版。**
