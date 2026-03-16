# Firebase Functions デプロイ整合性レポート

リポジトリ内の index エクスポート（unused フォルダ除く）と、実際にデプロイされている関数の差分を確認した結果です。

---

## 確認方法

1. **リポジトリ**: `functions/src/index.ts` および各ドメインの `index.ts` から export されている関数
2. **デプロイ状態**: `firebase deploy --only functions --dry-run` の出力（または `firebase functions:list`）
3. **ビルド検証**: `functions/lib/` のビルド結果で `clockIn` / `clockOut` がエクスポートされていることを確認済み

---

## 1. リポジトリにあり・index に追加済みだがデプロイされていない関数

| 関数名 | ドメイン | index パス | 備考 |
|--------|----------|------------|------|
| **clockIn** | attendance | `domains/attendance/index.ts` | **出勤ボタンが呼ぶ関数。未デプロイのため not-found の原因** |
| **clockOut** | attendance | `domains/attendance/index.ts` | **退勤ボタンが呼ぶ関数。未デプロイ** |

**対処**: `firebase deploy --only functions` を実行してデプロイする必要があります。

---

## 2. デプロイされているがリポジトリの index からは export していない関数

これらの関数は `unused_function_lib` にあり、メインの `index.ts` からは export していません。過去のデプロイ時に含まれていたものがリモートに残っています。

| 関数名 | 所在地 | 備考 |
|--------|--------|------|
| **determineAttendanceMode** | `unused_function_lib/determineAttendanceMode.ts` | Phase4 01 で clockIn/clockOut に分離し廃止 |
| **getAccountingHistory** | `unused_function_lib/getAccountingHistory.ts` | Phase0B でデプロイ対象から除外 |
| **nightlyIntegrityCheck** | `unused_function_lib/nightlyIntegrityCheck.ts` | Phase4 03 で unused に移管 |
| **nightlyRecalculateBalanceDue** | `unused_function_lib/nightlyRecalculateBalanceDue.ts` | Phase4 02 で unused に移管 |
| **nightlyReconciliationCheck** | `unused_function_lib/nightlyReconciliationCheck.ts` | Phase0B で廃止、unused に移動 |

**注意**: これらの関数は本番では使用しない想定です。`clockIn` / `clockOut` をデプロイすると、次回デプロイ時に上記が削除されるかは、Firebase のデプロイ挙動に依存します（通常、ローカルに存在しない関数は削除対象になります）。

---

## 3. index のエクスポート確認結果

### 3.1 メイン index (`functions/src/index.ts`)

- `export * from "./domains/attendance"` により `domains/attendance/index.ts` の全 export が含まれる
- `clockIn` / `clockOut` は `domains/attendance/index.ts` で正しく export されている
- メイン index は unused フォルダを import していない ✅

### 3.2 attendance ドメイン (`functions/src/domains/attendance/index.ts`)

```ts
export { clockIn } from "./callables/clockIn";
export { clockOut } from "./callables/clockOut";
// ... 他 14 件
```

- `clockIn` / `clockOut` は正しく export 済み ✅
- `determineAttendanceMode` はコメントのみで、unused に移動済み

### 3.3 ビルド出力 (`functions/lib/domains/attendance/index.js`)

- `clockIn` / `clockOut` がビルド結果に含まれていることを確認済み ✅

---

## 4. 結論

| 項目 | 状態 |
|------|------|
| **clockIn / clockOut の index 追加** | ✅ 正しく追加されている |
| **clockIn / clockOut のビルド** | ✅ ビルドに含まれる |
| **clockIn / clockOut のデプロイ** | ❌ **未デプロイ** |
| **出勤で not-found になる原因** | `clockIn` がデプロイされていないため、呼び出し先が存在しない |

### 推奨アクション

1. **即時対応**: `firebase login --reauth` で認証を更新したうえで、`firebase deploy --only functions` を実行し、`clockIn` と `clockOut` をデプロイする。
2. **運用方針**: unused 由来の 5 関数（determineAttendanceMode 等）は、次回フルデプロイ時に削除される可能性がある。明示的に残したい場合は、スタブとしてメイン index に追加する現行の `processShiftsByStaff` / `updateAdministrativeMenuWithDescription` と同様の対応を検討する。
