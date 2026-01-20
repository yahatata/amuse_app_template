# ENABLE_SETTLEMENT_AGGREGATOR 環境変数設定完了報告

_作成日: 2025-12-20 (JST)_

## 設定完了状況

### ✅ ローカル開発環境（.env ファイル）

**設定完了**: `functions/.env` ファイルを作成し、`ENABLE_SETTLEMENT_AGGREGATOR=true` を設定しました。

**確認方法**:
```bash
cat functions/.env
```

**出力例**:
```
ENABLE_SETTLEMENT_AGGREGATOR=true
```

---

### ⚠️ 本番環境（Cloud Functions）

**注意**: 本番環境の環境変数は、Firebase Console で設定する必要があります。**Firebase CLI から直接設定することはできません。**

**設定手順**:
1. Firebase Console にアクセス: https://console.firebase.google.com/
2. プロジェクトを選択: `amuse-app-template`
3. 左メニュー → 「Functions」を選択
4. 「環境変数」タブをクリック
5. 「環境変数を追加」をクリック
   - 変数名: `ENABLE_SETTLEMENT_AGGREGATOR`
   - 値: `true`
6. 「追加」をクリック

**重要**: 環境変数を変更した後、**関数を再デプロイする必要があります**。

---

## デプロイコマンド

本番環境の環境変数を設定した後、以下のコマンドで関数を再デプロイしてください：

```bash
firebase deploy --only functions:billsOnSettle
```

または、すべての関数をデプロイする場合：

```bash
firebase deploy --only functions
```

---

## 設定確認方法

### ローカル開発環境

```bash
# .env ファイルの内容を確認
cat functions/.env

# Firebase Emulator でテスト（.env ファイルが自動的に読み込まれます）
firebase emulators:start --only functions,firestore
```

### 本番環境

1. Firebase Console → Functions → 環境変数 で確認
2. または、Cloud Functions のログで確認:
   ```bash
   firebase functions:log --only billsOnSettle
   ```

---

## 次のステップ

1. ✅ **ローカル開発環境**: `.env` ファイルで設定済み
2. ⏳ **本番環境**: Firebase Console で手動設定が必要
3. ⏳ **デプロイ**: 本番環境の環境変数を設定した後、関数を再デプロイ

---

## トラブルシューティング

### `.env` ファイルが読み込まれない場合

- `functions/.env` ファイルが存在するか確認
- Firebase Emulator を再起動
- `functions/src/index.ts` で `dotenv` が正しく読み込まれているか確認

### 本番環境で環境変数が反映されない場合

- Firebase Console で環境変数が正しく設定されているか確認
- 関数を再デプロイしているか確認
- Cloud Functions のログで `process.env.ENABLE_SETTLEMENT_AGGREGATOR` の値を確認
