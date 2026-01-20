# Analytics Monthly 更新ログ確認ガイド

_作成日: 2025-12-20 (JST)_

## ログの確認方法

`processBillAnalyticsAtomically` で出力されるログは、以下の方法で確認できます。

---

## 1. Google Cloud Console（推奨）

### アクセス方法

1. **Google Cloud Console にアクセス**
   - URL: https://console.cloud.google.com/
   - プロジェクトを選択: `amuse-app-template`

2. **Cloud Logging に移動**
   - 左側のメニューから「ロギング」→「ログエクスプローラー」を選択
   - または、直接 URL: https://console.cloud.google.com/logs/query

3. **ログの検索**

   **方法A: 関数名で検索**
   ```
   resource.type="cloud_function"
   resource.labels.function_name="billsOnSettle"
   jsonPayload.message="processBillAnalyticsAtomically: analyticsMonthly updates"
   ```

   **方法B: メッセージで検索**
   ```
   jsonPayload.message=~"processBillAnalyticsAtomically"
   ```

   **方法C: billId で検索**
   ```
   jsonPayload.billId="7553e1da-5bc9-47d5-80b6-1857b44f8a1b"
   ```

   **方法D: 期間を指定して検索**
   ```
   resource.type="cloud_function"
   resource.labels.function_name="billsOnSettle"
   jsonPayload.message="processBillAnalyticsAtomically: analyticsMonthly updates"
   timestamp>="2026-01-20T00:00:00Z"
   timestamp<="2026-01-20T23:59:59Z"
   ```

### ログの表示形式

ログは以下のような形式で表示されます：

```json
{
  "severity": "INFO",
  "message": "processBillAnalyticsAtomically: analyticsMonthly updates",
  "billId": "7553e1da-5bc9-47d5-80b6-1857b44f8a1b",
  "month": "2026-01",
  "businessDate": "2026-01-20",
  "updates": {
    "analyticsMonthly": {
      "2026-01": {
        "isNewDocument": false,
        "updatedFields": {
          "itemsSales": "increment(1000)",
          "grossSales": "increment(13000)",
          ...
        }
      }
    },
    "analyticsMonthly/days": {
      "2026-01/2026-01-20": {
        "isNewDocument": false,
        "updatedFields": {
          ...
        }
      }
    },
    "analyticsMonthly/byCategory": {
      "2026-01/summary": {
        "isNewDocument": false,
        "updatedFields": {
          ...
        }
      }
    },
    "analyticsMonthly/byUser": {
      "2026-01/jxxltCr1PoShWJQeSB0F8TYGjlw1": {
        "userId": "jxxltCr1PoShWJQeSB0F8TYGjlw1",
        "pokerName": "やはた",
        "isNewDocument": false,
        "updatedFields": {
          ...
        }
      }
    },
    "analyticsMonthly/byTemplateTournaments": {
      "2026-01/elSrtZZ7JTrshytJuMv2": {
        "templateKey": "elSrtZZ7JTrshytJuMv2",
        "templateName": "...",
        "isNewDocument": false,
        "updatedFields": {
          ...
        }
      }
    },
    "analyticsMonthly/aggregationMarkers": {
      "7553e1da-5bc9-47d5-80b6-1857b44f8a1b": {
        "billId": "7553e1da-5bc9-47d5-80b6-1857b44f8a1b",
        "businessDate": "2026-01-20",
        "processedAt": "serverTimestamp()"
      }
    }
  }
}
```

---

## 2. Firebase Console

### アクセス方法

1. **Firebase Console にアクセス**
   - URL: https://console.firebase.google.com/
   - プロジェクトを選択: `amuse-app-template`

2. **Functions に移動**
   - 左側のメニューから「Functions」を選択

3. **関数を選択**
   - `billsOnSettle` 関数をクリック

4. **ログタブを選択**
   - 「ログ」タブをクリック
   - または、直接 URL: https://console.firebase.google.com/project/amuse-app-template/functions/logs

5. **ログの検索**
   - 検索ボックスに `processBillAnalyticsAtomically` と入力
   - または、`analyticsMonthly updates` と入力

### 注意点

- Firebase Console のログは Google Cloud Console のログを参照しているため、表示内容は同じです
- ただし、検索機能やフィルタリング機能は Google Cloud Console の方が充実しています

---

## 3. Firebase CLI

### コマンド

```bash
# 最新のログを表示
firebase functions:log --only billsOnSettle

# 特定のメッセージを含むログを表示
firebase functions:log --only billsOnSettle | grep "processBillAnalyticsAtomically"

# 特定の期間のログを表示
firebase functions:log --only billsOnSettle --since 1h
```

### 注意点

- Firebase CLI のログは Google Cloud Console のログを参照しているため、表示内容は同じです
- ただし、大量のログがある場合、表示が遅くなる可能性があります

---

## 4. gcloud CLI（オプション）

### コマンド

```bash
# 最新のログを表示
gcloud functions logs read billsOnSettle --limit 50

# 特定のメッセージを含むログを表示
gcloud functions logs read billsOnSettle --limit 50 | grep "processBillAnalyticsAtomically"

# 特定の期間のログを表示
gcloud functions logs read billsOnSettle --limit 50 --format json | jq '.[] | select(.jsonPayload.message | contains("processBillAnalyticsAtomically"))'
```

### 注意点

- `gcloud` CLI がインストールされている必要があります
- 認証が必要な場合があります（`gcloud auth login`）

---

## 推奨される確認方法

### 1. Google Cloud Console（最も推奨）

**理由**:
- 最も詳細な検索・フィルタリング機能
- ログの構造化表示
- 期間指定が容易
- エクスポート機能

**手順**:
1. Google Cloud Console にアクセス
2. 「ロギング」→「ログエクスプローラー」を選択
3. 以下のクエリを入力：
   ```
   resource.type="cloud_function"
   resource.labels.function_name="billsOnSettle"
   jsonPayload.message="processBillAnalyticsAtomically: analyticsMonthly updates"
   ```

### 2. Firebase Console（簡易確認用）

**理由**:
- 簡単にアクセスできる
- 基本的な検索機能
- ログの構造化表示

**手順**:
1. Firebase Console にアクセス
2. 「Functions」→「billsOnSettle」→「ログ」を選択
3. 検索ボックスに `processBillAnalyticsAtomically` と入力

---

## ログの確認ポイント

### 1. 更新内容の確認

ログの `updates` フィールドに、すべての更新内容が含まれています：

- `analyticsMonthly`: 月次集計の更新内容
- `analyticsMonthly/days`: 日次集計の更新内容
- `analyticsMonthly/byCategory`: カテゴリ別集計の更新内容
- `analyticsMonthly/byUser`: ユーザー別集計の更新内容
- `analyticsMonthly/byTemplateTournaments`: トーナメント別集計の更新内容
- `analyticsMonthly/aggregationMarkers`: マーカーの作成内容

### 2. エラーの確認

ログにエラーが含まれている場合、以下のような形式で表示されます：

```json
{
  "severity": "ERROR",
  "message": "processBillAnalyticsAtomically: analytics update failed",
  "billId": "...",
  "error": "..."
}
```

### 3. スキップされた処理の確認

マーカーが既に存在する場合、以下のようなログが出力されます：

```json
{
  "severity": "INFO",
  "message": "processBillAnalyticsAtomically: marker already exists, skipping",
  "billId": "...",
  "month": "...",
  "businessDate": "...",
  "markerPath": "..."
}
```

---

## トラブルシューティング

### ログが表示されない場合

1. **関数がデプロイされているか確認**
   ```bash
   firebase functions:list
   ```

2. **環境変数が正しく設定されているか確認**
   - `ENABLE_SETTLEMENT_AGGREGATOR` が `true` に設定されているか確認

3. **ログの期間を確認**
   - ログは一定期間（通常7日間）のみ保持されます
   - 古いログは表示されない可能性があります

4. **権限を確認**
   - Google Cloud Console へのアクセス権限があるか確認

### ログの検索がうまくいかない場合

1. **クエリ構文を確認**
   - Google Cloud Console のログエクスプローラーのクエリ構文を確認

2. **関数名を確認**
   - 関数名が正しいか確認（`billsOnSettle`）

3. **メッセージを確認**
   - メッセージが完全一致しているか確認

---

## 参考リンク

- [Google Cloud Logging ドキュメント](https://cloud.google.com/logging/docs)
- [Firebase Functions ログ](https://firebase.google.com/docs/functions/manage-functions#view-logs)
- [Firebase CLI ログコマンド](https://firebase.google.com/docs/cli#functions_logs)
