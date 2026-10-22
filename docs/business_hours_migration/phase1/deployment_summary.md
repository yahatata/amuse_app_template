# Phase1: state doc導入 - デプロイ完了サマリー

## デプロイ日時
2025年1月27日

## デプロイ内容

### 1. Firestore Rules
- **ステータス**: ✅ デプロイ成功
- **適用内容**:
  - `storeMeta/currentBusinessDay`ドキュメントのルール追加
  - `storeMeta/currentBusinessDay/logs`サブコレクションのルール追加
  - 読み取り: 全ユーザー許可
  - 書き込み: Functions経由のみ（UIからの直接書き込み禁止）

### 2. Functions
- **ステータス**: ✅ デプロイ成功
- **デプロイされた関数**:
  - `openStore` - 手動開店関数
  - `closeStore` - 手動閉店関数

### 3. UI実装（一時的な開閉店管理機能）
- **ステータス**: ✅ 実装完了
- **実装内容**:
  - `lib/Home/terminalHomePage.dart`のAppBarに開閉店管理ボタンを追加
  - 管理者デバイスのみ表示
  - ダイアログから開店/閉店を実行可能
  - **重要**: `FirebaseFunctions.instanceFor(region: 'us-central1')`を使用してリージョンを明示的に指定

---

## 修正・追加ファイル一覧

### Functions側
1. `functions/src/callables/storeManagement/open/index.ts`（新規作成）
2. `functions/src/callables/storeManagement/close/index.ts`（新規作成）
3. `functions/src/callables/storeManagement/open/openStore.ts`（修正: リージョン指定`us-central1`を追加）
4. `functions/src/callables/storeManagement/close/closeStore.ts`（修正: リージョン指定`us-central1`を追加）

### UI側（Dart）
1. `lib/Home/terminalHomePage.dart`（修正）
   - AppBarに開閉店管理ボタン追加
   - `_showStoreManagementDialog()`メソッド追加
   - `_callOpenStore()`メソッド追加（リージョン指定: `FirebaseFunctions.instanceFor(region: 'us-central1')`）
   - `_callCloseStore()`メソッド追加（リージョン指定: `FirebaseFunctions.instanceFor(region: 'us-central1')`）

---

## デプロイ時の対応

### 環境変数の設定
- `.env.amuse-app-template`に`LINE_PLAN=communication`を追加
- 理由: 他の関数（`createShiftRequest.ts`など）が`LINE_PLAN`を`defineString`で定義しているため、ビルド時に環境変数の存在チェックが行われる

### リージョン指定の追加
- `openStore`と`closeStore`に`region: 'us-central1'`を追加
- 理由: Firebase Functions v2では、リージョンを明示的に指定する必要がある場合がある
- Dart側でも`FirebaseFunctions.instanceFor(region: 'us-central1')`を使用してリージョンを指定

---

## 確認方法

### 1. UIでの確認
1. アプリを起動し、管理者デバイスでログイン
2. Terminal Home画面のAppBar右上に「開閉店管理」ボタン（店舗アイコン）が表示されることを確認
3. ボタンをタップすると、開店/閉店を選択するダイアログが表示されることを確認

### 2. 開店機能の確認
1. ダイアログで「開店」を選択
2. ローディング表示が表示されることを確認
3. 成功時: 「開店しました。営業日: YYYY-MM-DD」のSnackBarが表示される
4. Firestoreコンソールで`storeMeta/currentBusinessDay`の`status`が`'running'`、`currentBusinessDateKey`が設定されていることを確認

### 3. 閉店機能の確認
1. 開店状態で、ダイアログで「閉店」を選択
2. ローディング表示が表示されることを確認
3. 成功時: 「閉店しました。最終営業日: YYYY-MM-DD」のSnackBarが表示される
4. Firestoreコンソールで`storeMeta/currentBusinessDay`の`status`が`'closed'`、`currentBusinessDateKey`が`null`になることを確認

### 4. エラーケースの確認
1. 既に開店状態で開店を試みる: 「Store is already running」エラー
2. 既に閉店状態で閉店を試みる: 「Store is already closed」エラー
3. 非管理者でボタンが表示されないことを確認

---

## 注意事項

- **一時的な実装**: UIの開閉店管理機能は一時的なものです。将来的には専用の管理画面に移行する予定
- **管理者権限**: 開閉店管理ボタンは管理者デバイスのみに表示されます
- **初期化**: 初回使用前に`createInitialStateDoc.ts`スクリプトを実行する必要があります
