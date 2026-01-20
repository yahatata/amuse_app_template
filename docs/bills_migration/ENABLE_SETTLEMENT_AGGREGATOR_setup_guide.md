# ENABLE_SETTLEMENT_AGGREGATOR 環境変数設定ガイド

_作成日: 2025-12-20 (JST)_

## 概要

`ENABLE_SETTLEMENT_AGGREGATOR` は、`bills.onSettle` トリガで `enqueueSettlement` を実行するかどうかを制御する環境変数です。

`functions/src/triggers/bills.onSettle.ts` で以下のように使用されています：

```typescript
if (process.env.ENABLE_SETTLEMENT_AGGREGATOR === 'true') {
  await enqueueSettlement(billDoc);
}
```

## 設定方法

### 方法1: Firebase Console で設定（本番環境・推奨）

本番環境（デプロイ後の Cloud Functions）で環境変数を設定する場合は、Firebase Console を使用します。

#### 手順

1. **Firebase Console にアクセス**
   - https://console.firebase.google.com/ にアクセス
   - プロジェクトを選択（`amuse-app-template`）

2. **Functions の環境変数設定ページに移動**
   - 左メニューから「Functions」を選択
   - 「環境変数」タブをクリック
   - または、「設定」→「Functions」→「環境変数」を選択

3. **環境変数を追加**
   - 「環境変数を追加」をクリック
   - 変数名: `ENABLE_SETTLEMENT_AGGREGATOR`
   - 値: `true`
   - 「追加」をクリック

4. **関数を再デプロイ**
   - 環境変数を変更した場合、関数を再デプロイする必要があります
   ```bash
   firebase deploy --only functions:billsOnSettle
   ```

#### 注意事項

- 環境変数を変更した後、**関数を再デプロイする必要があります**
- 値は文字列 `'true'` でなければなりません（真偽値ではありません）
- 環境変数の変更は、再デプロイ後に反映されます

---

### 方法2: `.env` ファイルで設定（ローカル開発環境）

ローカル開発環境（Firebase Emulator でのテスト）で環境変数を設定する場合は、`.env` ファイルを使用します。

#### 手順

1. **`.env` ファイルを作成**（`functions` ディレクトリに）

   ```bash
   cd functions
   touch .env
   ```

2. **`.env` ファイルに環境変数を追加**

   ```
   ENABLE_SETTLEMENT_AGGREGATOR=true
   ```

3. **`.env` ファイルが `.gitignore` に含まれていることを確認**

   `.gitignore` に以下が含まれていることを確認：
   ```
   functions/.env
   ```

4. **Firebase Emulator でテスト**

   ```bash
   firebase emulators:start --only functions,firestore
   ```

#### 注意事項

- `.env` ファイルは Git にコミットしないでください（`.gitignore` に含まれている必要があります）
- `.env` ファイルは開発時のみ有効です（`functions/src/index.ts` で `dotenv` が使用されています）
- 本番環境では Firebase Console で設定した値が使用されます

---

### 方法3: コマンドラインで設定（一時的な設定）

一時的に環境変数を設定してテストする場合：

```bash
export ENABLE_SETTLEMENT_AGGREGATOR=true
firebase emulators:start --only functions,firestore
```

または、1行で実行：

```bash
ENABLE_SETTLEMENT_AGGREGATOR=true firebase emulators:start --only functions,firestore
```

---

## 動作確認

### 1. 環境変数が設定されているか確認

**ローカル開発環境（Emulator）**:

```bash
# .env ファイルを確認
cat functions/.env
```

**本番環境（Cloud Functions）**:

- Firebase Console の「Functions」→「環境変数」で確認
- または、Cloud Functions のログで確認

### 2. `bills.onSettle` トリガの動作を確認

1. `bills` ドキュメントの `status` を `settled` に変更
2. Cloud Functions のログを確認
   ```bash
   firebase functions:log --only billsOnSettle
   ```
3. `enqueueSettlement` が呼び出されているか確認
   - `ENABLE_SETTLEMENT_AGGREGATOR=true` の場合: `enqueueSettlement` が呼び出される
   - `ENABLE_SETTLEMENT_AGGREGATOR` が設定されていない、または `'true'` でない場合: `enqueueSettlement` は呼び出されない

### 3. `analyticsMonthly` の更新を確認

1. `analyticsMonthly/{month}` ドキュメントを確認
2. `aggregationMarkers/{billId}` が作成されているか確認

---

## トラブルシューティング

### 環境変数が反映されない場合

1. **本番環境の場合**:
   - Firebase Console で環境変数が正しく設定されているか確認
   - 関数を再デプロイしているか確認
   ```bash
   firebase deploy --only functions:billsOnSettle
   ```

2. **ローカル開発環境の場合**:
   - `.env` ファイルが `functions` ディレクトリに存在するか確認
   - `.env` ファイルの内容が正しいか確認（`ENABLE_SETTLEMENT_AGGREGATOR=true`）
   - Firebase Emulator を再起動

### 環境変数の値が正しくない場合

- 値は文字列 `'true'` でなければなりません（`true`、`1`、`yes` などは無効）
- 大文字・小文字は区別されます（`True`、`TRUE` は無効）

---

## 推奨設定

### 開発環境（ローカル）

`.env` ファイルで設定：
```
ENABLE_SETTLEMENT_AGGREGATOR=true
```

### 本番環境（Cloud Functions）

Firebase Console で設定：
- 変数名: `ENABLE_SETTLEMENT_AGGREGATOR`
- 値: `true`

---

## 関連ドキュメント

- `functions/src/triggers/bills.onSettle.ts`: `ENABLE_SETTLEMENT_AGGREGATOR` の使用箇所
- `functions/src/index.ts`: `.env` ファイルの読み込み処理
- `docs/bills_migration/analytics_update_unification_test_plan.md`: 手動テストの実施方法
