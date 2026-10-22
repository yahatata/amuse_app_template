# P0-06 修正サマリ

_最終更新: 2025-11-10 (JST)_

## 変更内容

Nightly 系ジョブ（再計算・デュアルライト差分チェック・整合確認）の実行時刻を、固定 03:00 JST から `STORE_CLOSE_HOUR` 準拠の動的生成に変更しました。

## 変更ファイル一覧

### 新規作成
1. **`functions/src/config/ops.ts`**
   - `getStoreCloseHour()`: 環境変数または functions:config から STORE_CLOSE_HOUR を取得
   - `cronFromHourAndMinuteJst()`: JST 時刻から cron 文字列を生成（24以上は翌日繰り上がり）
   - `getNightlyCronTriplet()`: 3つの nightly ジョブの cron 文字列を生成

2. **`functions/src/scripts/nightlyRecalculateBalanceDue.ts`**
   - 夜間再計算スクリプト（スケルトン実装）
   - `STORE_CLOSE_HOUR:00 JST` に実行

3. **`functions/src/scripts/nightlyReconciliationCheck.ts`**
   - デュアルライト差分チェックスクリプト（スケルトン実装）
   - `STORE_CLOSE_HOUR:30 JST` に実行（+30分）

4. **`functions/src/scripts/nightlyIntegrityCheck.ts`**
   - 夜間整合確認スクリプト（スケルトン実装）
   - `(STORE_CLOSE_HOUR + 1):00 JST` に実行（+60分）

5. **`functions/__tests__/config/ops.spec.ts`**
   - `ops.ts` の単体テスト
   - STORE_CLOSE_HOUR=27/9/23 のケースをテスト

### 更新
1. **`functions/src/index.ts`**
   - 3つの nightly スクリプトの export を追加

2. **`docs/bills_migration/tools_and_operations_plan.md`**
   - 固定 03:00 JST の記述を削除
   - STORE_CLOSE_HOUR 準拠の説明を追加
   - スケジュール設定セクションを更新

3. **`docs/bills_migration/changelog.md`**
   - P0-06 修正を記録

4. **`docs/bills_migration/decision_log.md`**
   - Nightly ジョブスケジュールの決定事項を追記

## STORE_CLOSE_HOUR の扱い

- **定義**: `lib/globalConstant.dart` の `STORE_CLOSE_HOUR` と一致させる
- **値の範囲**: 0-48 の整数
- **意味**: 
  - **0-23**: 「当日の何時まで」を指定（例: 9 → 当日の9:00まで）
  - **24-48**: 「翌日の何時まで」を指定（例: 25 → 翌日の1:00まで、27 → 翌日の3:00まで）
  - 24以上を指定した場合、`normalizeStoreCloseHour()` で正規化して使用
- **例**: 
  - `STORE_CLOSE_HOUR=9` → 当日の 9:00 まで（9:00以降は当日の営業日）
  - `STORE_CLOSE_HOUR=25` → 翌日の 1:00 まで（当日の1:00以降は当日の営業日）
  - `STORE_CLOSE_HOUR=27` → 翌日の 3:00 まで（当日の3:00以降は当日の営業日）
- **Backend 設定**: 
  - 環境変数 `STORE_CLOSE_HOUR` を優先
  - 次に `functions:config().ops.store_close_hour`
  - デフォルト: 27（翌日の3:00 JST）
- **使用時**: 24以上の値を指定する場合は、必ず `normalizeStoreCloseHour()` で正規化してから使用すること

## スケジュール例

| STORE_CLOSE_HOUR | recalc | reconcile | integrity |
| --- | --- | --- | --- |
| 9 | 9:00 JST | 9:30 JST | 10:00 JST |
| 27 | 3:00 JST | 3:30 JST | 4:00 JST |
| 23 | 23:00 JST | 23:30 JST | 0:00 JST（翌日） |

## 注意事項

- Frontend と Backend で同じ値に揃えること（将来は Remote Config 経由の一元管理を検討）
- 既存の Nightly ロジック・フラグ・検証は変更なし（スケルトン実装のため）
- 実装は P1-10/P1-11 で完了予定

## テスト

- `functions/__tests__/config/ops.spec.ts` で以下をテスト:
  - STORE_CLOSE_HOUR=27 の場合の cron 生成
  - STORE_CLOSE_HOUR=9 の場合の cron 生成
  - STORE_CLOSE_HOUR=23 の場合の cron 生成（翌日繰り上がり）
  - デフォルト値（27）の場合の cron 生成
