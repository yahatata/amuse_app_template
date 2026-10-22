# P0-06 修正: 既存コードの STORE_CLOSE_HOUR 対応

_最終更新: 2025-11-10 (JST)_

## 変更内容

既存のコード（Dart ファイル、TypeScript ファイル）で `STORE_CLOSE_HOUR` が使われているすべての箇所を、今回の変更（24以上は翌日繰り上がり）に適合するよう修正しました。

## 変更ファイル一覧

### TypeScript ファイル（Functions）

1. **`functions/src/config/ops.ts`**（新規作成）
   - `normalizeStoreCloseHour()`: STORE_CLOSE_HOUR を正規化（24以上は翌日繰り上がり）

2. **`functions/src/analytics/helpers.ts`**
   - `normalizeStoreCloseHour()`: 正規化関数を追加
   - `resolveBusinessDate()`: `normalizeStoreCloseHour()` を使用するように修正
   - コメントを追加（STORE_CLOSE_HOUR の使われ方を明記）

3. **`functions/src/callables/getAccountingHistory.ts`**
   - ハードコード `const STORE_CLOSE_HOUR = 9;` を削除
   - `getStoreCloseHour()` と `normalizeStoreCloseHour()` を使用するように変更
   - import を追加: `import { getStoreCloseHour, normalizeStoreCloseHour } from '../config/ops';`

4. **`functions/src/attendance/determineAttendanceMode.ts`**
   - ハードコード `const STORE_CLOSE_HOUR = 9;` を削除
   - `getStoreCloseHour()` と `normalizeStoreCloseHour()` を使用するように変更
   - import を追加: `import { getStoreCloseHour, normalizeStoreCloseHour } from '../config/ops';`
   - `if (currentHour < STORE_CLOSE_HOUR)` → `if (currentHour < normalizedHour)` に変更

### Dart ファイル（Flutter）

5. **`lib/globalConstant.dart`**
   - `normalizeStoreCloseHour()`: 正規化関数を追加（static メソッド）
   - コメントを追加（STORE_CLOSE_HOUR の使われ方を明記）

6. **`lib/Accounting/accountingPage.dart`**
   - `_getBusinessDate()`: `GlobalConstants.STORE_CLOSE_HOUR` → `GlobalConstants.normalizeStoreCloseHour(GlobalConstants.STORE_CLOSE_HOUR)` に変更

7. **`lib/Accounting/accountingEditDialog.dart`**
   - `_getBusinessDate()`: `GlobalConstants.STORE_CLOSE_HOUR` → `GlobalConstants.normalizeStoreCloseHour(GlobalConstants.STORE_CLOSE_HOUR)` に変更
   - `_loadAvailableOptions()`: `GlobalConstants.STORE_CLOSE_HOUR` → `GlobalConstants.normalizeStoreCloseHour(GlobalConstants.STORE_CLOSE_HOUR)` に変更

8. **`lib/Accounting/accountingHistoryPage.dart`**
   - `_getBusinessDate()`: `GlobalConstants.STORE_CLOSE_HOUR` → `GlobalConstants.normalizeStoreCloseHour(GlobalConstants.STORE_CLOSE_HOUR)` に変更

9. **`lib/Home/systemSettingsPage.dart`**
   - 変更なし（`GlobalConstants.STORE_CLOSE_HOUR` をそのまま callable に渡しているため、問題なし）

## 修正のポイント

### 1. 正規化関数の追加
- TypeScript: `functions/src/config/ops.ts` と `functions/src/analytics/helpers.ts` に `normalizeStoreCloseHour()` を追加
- Dart: `lib/globalConstant.dart` に `normalizeStoreCloseHour()` を追加

### 2. ハードコードの削除
- `functions/src/callables/getAccountingHistory.ts`: `const STORE_CLOSE_HOUR = 9;` を削除
- `functions/src/attendance/determineAttendanceMode.ts`: `const STORE_CLOSE_HOUR = 9;` を削除

### 3. 動的取得への変更
- すべての箇所で `getStoreCloseHour()` または `GlobalConstants.STORE_CLOSE_HOUR` を使用
- 使用前に `normalizeStoreCloseHour()` で正規化（24以上は翌日繰り上がり）

### 4. 既存ロジックの維持
- 営業日計算ロジックは変更なし（`if (now.hour < normalizedHour)` の比較のみ変更）
- 勤務判定ロジックは変更なし（`if (currentHour < normalizedHour)` の比較のみ変更）

## 動作確認

- `STORE_CLOSE_HOUR=9` の場合: 既存と同じ動作（9:00 まで）
- `STORE_CLOSE_HOUR=27` の場合: 3:00 まで（27 % 24 = 3）
- `STORE_CLOSE_HOUR=23` の場合: 23:00 まで

## 注意事項

- Frontend と Backend で同じ値に揃えること（将来は Remote Config 経由の一元管理を検討）
- `normalizeStoreCloseHour()` は必ず使用すること（24以上の値を正規化）
- 既存の営業日計算ロジックは変更なし（正規化のみ追加）
