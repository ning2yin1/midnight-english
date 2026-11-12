# Midnight English ☾

日常の日本語を、自分の英語にする瞬間英作文PWA。HTML / CSS / JavaScriptのみで動作し、外部API・ログイン・実行時ライブラリは不要です。

## ローカル起動

Node.js 22以上（テスト用）とPython 3を利用できます。依存パッケージのインストールやビルドは不要です。

```sh
cd /workspace/midnight-english
npm start
```

開発時はHTTPサーバーの `/midnight-english/` にアクセスします（ポート4173）。`file://` ではService Workerは動きません。任意の静的HTTPサーバーでも起動できます。PWAはHTTPSまたはlocalhostで利用してください。

## 使い方

1. 「追加」にChatGPTが生成した下記形式のJSONを貼り付けます。
2. プレビューを開くと各項目を編集できます。重複項目は初期状態で選択しません。再選択時も上書きせず別のフレーズとして保存します。
3. ホームでモードを選びクイズを開始します。1ステージ最大10問、重複なし。「覚えた」は除外されます。
4. 日本語を見て考え、「答えを見る」から自己判定します。ヒントを見た場合「言えた！」は選べません。
5. 詳細画面から編集・削除・習得状態の切り替えができます。
6. 設定からJSONバックアップを書き出せます。iPhoneではダウンロードしたファイルをファイルアプリなどへ保存してください。

```json
{
  "phrases": [
    {
      "ja": "今日は早く寝よう。",
      "en": "I'll go to bed early tonight.",
      "alternatives": ["I'm going to have an early night."],
      "hint": "I'll ____ to bed early tonight.",
      "notes": [
        {
          "expression": "go to bed",
          "meaning": "寝る、床に就く",
          "example": "I usually go to bed at eleven."
        }
      ]
    }
  ]
}
```

`ja` と `en` は必須です。他の項目は省略可能です。ノートの編集欄はJSON配列です。入力エラーでは保存しません。

## データと成績

IndexedDBの単一トランザクションで、フレーズ・成績・履歴・設定・クイズ進行を保存します。画面表示時に出題回数を加算し、正解はヒント未使用で自己判定した場合のみ加算します。同じ問題での再表示や連打では加算しません。途中終了した未判定の問題も出題済みとして残るため、正解率の分母に含まれます。出題中フレーズの削除には先にクイズ終了が必要です。

バックアップは `type: midnight-english-backup`, `version: 1` の独立形式です。検証と確認後、単一トランザクションで全データを置き換えます。失敗時は既存データを保持し、復元後は途中のクイズを終了します。端末・ブラウザー間の同期はありません。同じアプリを複数タブで同時編集せず、ひとつの画面で利用してください。

Safariのサイトデータ消去、OSのストレージ整理、アプリ削除でデータを失う可能性があります。定期的に端末外へバックアップしてください。ホーム画面版とSafariで保存領域が別になる場合があります。

## PWA・音声

初回オンラインアクセス時にアプリ一式をキャッシュします。以後はオフライン起動・登録・検索・編集・クイズ・バックアップを利用できます。音声はボタン操作時のみ再生し、端末の英語音声が利用できない場合は案内を表示します。オフライン音声の可否はiOSのインストール済み音声に依存します。

iPhoneではSafariの共有メニュー →「ホーム画面に追加」。アイコンは `icons/` 内のSVGとPNGを置き換えられます。アプリ更新時は `sw.js` の `CACHE` のバージョンを増やします。新しいService Workerは旧画面を閉じた後に有効になります。キャッシュ更新はIndexedDBを削除しません。

## 検証

```sh
npm test
# 任意のブラウザー統合テスト（Playwrightが必要）
# npm install --no-save --package-lock=false playwright
CHROMIUM_PATH=/usr/bin/chromium node tests/browser.cjs
```

ブラウザーテストは `npm start` の起動後に実行します。Playwrightはアプリの実行には不要です。テストは新しいブラウザーコンテキスト内だけでデータを操作します。ブラウザーの起動パスは `CHROMIUM_PATH` で指定できます。

成績の重複防止・ヒント判定・JSON検証・出題抽出・復元検証はNodeの既存テストランナーで確認します。ブラウザーテストは登録・編集・削除・習得・10問・成績保持・バックアップ・オフライン・390px表示・サブパスを確認します。音声呼び出しはテスト用音声で検証し、実機の発声・Safariのホーム画面追加はiPhoneで確認してください。

## GitHub Pagesへの公開

1. この実装をGitHubの `main` ブランチへコミット・プッシュします。
2. リポジトリの **Settings → Pages → Build and deployment** で **Deploy from a branch** を選択します。
3. ブランチ **main**、フォルダー **/ (root)** を選んで保存します。
4. デプロイ完了後、`https://ning2yin1.github.io/midnight-english/` を開きます。

ビルド・環境変数・シークレットは不要です。相対URLでサブパスに対応しています。公開操作はこの実装作業では実行していません。

## ファイル構成

- `app.js`: 画面・操作・音声・インポート/エクスポート
- `core.js`: 入力検証・出題・成績・バックアップ検証
- `db.js`: IndexedDB読み書き
- `style.css`: iPhone優先レイアウトとMoonlit Lavenderテーマ
- `sw.js`, `manifest.webmanifest`, `icons/`: オフラインとPWA
- `tests/`: ユニット・ブラウザー統合テスト
