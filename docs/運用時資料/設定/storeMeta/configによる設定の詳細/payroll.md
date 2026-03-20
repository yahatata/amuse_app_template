# payroll（給与締め）

給与計算期間の開始日・終了日を定義する。`payroll.startDay` と `payroll.endDay` の 2 フィールドを持つ。

---

## 設定の説明

給与締め日は「前月 X 日〜今月 Y 日」の形式で勤怠集計・給与計算の期間を決める。店舗の契約・締め日によって 26〜25 日締め、1〜末日締めなどが異なる。

---

## 何を設定するのか

`storeMeta/config` の `payroll.startDay`（1〜31）、`payroll.endDay`（1〜31 または 0）。未指定時は `defaults.ts` の `startDay=26`, `endDay=25` が使われる。

- `endDay=0` の場合: 月を跨がず、`startDay` 日〜当月末日 の期間とする（例: startDay=1, endDay=0 → 1日〜末日）
- `endDay` が 1〜31 の場合: 前月 `startDay` 日〜今月 `endDay` 日 の期間とする（例: 26〜25 → 前月26日〜今月25日）

---

## 取得失敗時

- **読めるがフィールドが存在しない**: 必ずデフォルト（`startDay=26`, `endDay=25`）を適用。
- **読めない（Firestore 障害等）**: デフォルトを正としてデフォルト処理を行う。

詳細は `docs/運用時資料/設定/取得失敗時の挙動設計.md` を参照。

---

## 不具合時の対応

1. リトライを必ず行う。
2. A,B（設定値の誤り・運用ミス）: デフォルトで実行＋エラーコード。
3. C,D（コードのバグ・不整合）: デフォルトで実行可能な場合は実行＋エラーコード。それ以外は処理スキップ＋エラーコード＋画面警告。
4. 本設定は 1〜31 の数値のため常にデフォルトで実行可能。スキップは発生しない想定。
5. エラーコード: `CONFIG_FALLBACK` / `CONFIG_READ_ERROR` をログに出力。詳細は `docs/運用時資料/設定/設定の不具合時の対応.md` を参照。

---

## 現状持ちうる値

| フィールド | 値の範囲 | デフォルト | 意味 |
|------------|----------|------------|------|
| startDay | 1〜31 | 26 | 給与期間の開始日（日） |
| endDay | 0, 1〜31 | 25 | 給与期間の終了日（日）。0 は当月末日 |

---

## その設定により何が変わるのか

- 勤怠管理画面の給与計算期間表示・期間選択
- 給与データ取得（`getPayrollData` 呼び出し時の期間計算）
- 月次給与計算トリガ（`monthlyPayrollTrigger`）の実行期間（storeMeta/config から取得。CRON は 25 日 23:59 固定のため、endDay≠25 の店舗では CRON の見直しが必要）

---

## 影響を受けるファイル一覧

| 種別 | ファイル | 作用先 |
|------|----------|--------|
| ts | `functions/src/shared/config/defaults.ts` | デフォルト値定義 |
| ts | `functions/src/shared/config/configLoader.ts` | config 取得・フォールバック |
| ts | `functions/src/shared/config/types.ts` | StoreConfig 型定義 |
| ts | `functions/src/domains/attendance/callables/getPayrollData.ts` | 給与データ取得時の期間計算（Flutter から startDay/endDay を受けて使用） |
| ts | `functions/src/domains/attendance/scheduler/monthlyPayrollTrigger.ts` | 月次給与計算ジョブ（config から startDay/endDay を取得して期間計算） |
| dart | `lib/services/store_config_service.dart` | config パース・StoreConfigData |
| dart | `lib/services/store_config_defaults.dart` | デフォルト値（kDefaultPayrollStartDay, kDefaultPayrollEndDay） |
| dart | `lib/AttendanceManagement/all_staff_attendance_page_from_adminHome.dart` | 給与計算期間表示・期間選択・勤怠・給与データ取得 |
