# LINEミニアプリ・LIFF 処理内容の画面上表示

## 概要

LINEミニアプリ（LIFF）で、初期化処理などの進行状況を画面上に表示するデバッグ用の仕組みです。外部ブラウザでDevToolsを開けないLINEアプリ内WebViewでも、どこで処理が止まっているかやエラー内容を確認できます。

## 有効化方法

以下の config.js の `DEBUG_SHOW_LIFF_PROCESS` を `true` に変更します。

- スタッフ用: `public/staff/config.js`
- ユーザー用: `public/user/config.js`

```javascript
// デバッグ: LIFF初期化などの処理内容を画面上に表示する（true: 表示, false: 非表示）
DEBUG_SHOW_LIFF_PROCESS: true,  // false にすると非表示
```

## 表示形式

- 画面上部に黒背景のオーバーレイが表示される
- 各処理ステップが時系列で追記される
- **タイムスタンプ形式: 時:分:秒（例: 10:07:48）**
- エラー時は赤色で表示

## ログ出力の流れ

### スタッフ用

1. ページHTML解析完了
2. Firebaseモジュール開始 → __CONFIG__取得 → loadLinePlanFromFirestore
3. initLiffAndFirebaseAuth（liff.init → ログイン状態確認 → getIDToken → getFirebaseCustomToken → signInWithCustomToken）
4. DOMContentLoaded → generateBirthdayOptions → initLiffAndFirebaseAuth → checkStaffRegistration
5. checkStaffRegistration（スタッフ登録有無 → showPage実行）

### ユーザー用

1. ページHTML解析完了
2. initLiffAndFirebaseAuth（liff.init → ログイン状態確認 → getIDToken → getFirebaseCustomToken → signInWithCustomToken）
3. DOMContentLoaded → generateBirthdayOptions → initLiffAndFirebaseAuth → checkStoreRegistration
4. checkStoreRegistration（ユーザー登録有無 → ensureStaffRichMenu呼び出し など → showPage実行）

## 無効化

`DEBUG_SHOW_LIFF_PROCESS` を `false` に戻します。デプロイ後、オーバーレイは表示されません。
