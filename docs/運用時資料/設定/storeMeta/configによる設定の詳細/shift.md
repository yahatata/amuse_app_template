# shift（シフト運用）

submissionStartDay / submissionEndDay / schedulingStartDay（storeMeta/config 内）

> ※ requiredStaffByTimeSlot は **storeMeta/requiredStaffByTimeSlot** に分離済み。  
> 詳細は `storeMeta/requiredStaffByTimeSlot.md` を参照。

---

## 設定の説明

シフト提出期間とシフトを組む期間の日付を、対象月の前月の日付で定義する。店舗の運用スケジュール（締切・提出期間）に合わせて変更する。

---

## 何を設定するのか

`storeMeta/config` の `shift.submissionStartDay`（1〜28）、`shift.submissionEndDay`（1〜28）、`shift.schedulingStartDay`（1〜28）。未指定時は `defaults.ts` の値が使われる。

- **submissionStartDay**: ①提出期間の開始日（前月の何日から）。例: 1 → 前月1日から
- **submissionEndDay**: ①提出期間の終了日（前月の何日まで）。例: 15 → 前月15日まで
- **schedulingStartDay**: ②シフトを組む期間の開始日（前月の何日から。以降は管理者の裁量で最終確定可能）。例: 16 → 前月16日から

※ 対象月が 2 月の場合、前月は 1 月。2 月シフトの提出期間は 1 月 1 日〜15 日、シフトを組む期間は 1 月 16 日以降。

---

## 取得失敗時

- **読めるがフィールドが存在しない**: 必ずデフォルト（`submissionStartDay=1`, `submissionEndDay=15`, `schedulingStartDay=16`）を適用。
- **読めない（Firestore 障害等）**: デフォルトを正としてデフォルト処理を行う。

詳細は `docs/運用時資料/設定/取得失敗時の挙動設計.md` を参照。

---

## 不具合時の対応

1. リトライを必ず行う。
2. A,B（設定値の誤り・運用ミス）: デフォルトで実行＋エラーコード。
3. C,D（コードのバグ・不整合）: デフォルトで実行可能な場合は実行＋エラーコード。それ以外は処理スキップ＋エラーコード＋画面警告。
4. 本設定は 1〜28 の数値のため常にデフォルトで実行可能。スキップは発生しない想定。
5. エラーコード: `CONFIG_FALLBACK` / `CONFIG_READ_ERROR` をログに出力。詳細は `docs/運用時資料/設定/設定の不具合時の対応.md` を参照。

---

## 現状持ちうる値

| フィールド | 値の範囲 | デフォルト | 意味 |
|------------|----------|------------|------|
| submissionStartDay | 1〜28 | 1 | 提出期間の開始日（前月の何日から） |
| submissionEndDay | 1〜28 | 15 | 提出期間の終了日（前月の何日まで） |
| schedulingStartDay | 1〜28 | 16 | シフトを組む期間の開始日（前月の何日から） |

---

## その設定により何が変わるのか

- シフト画面の①提出期間・②シフト組む期間の表示（「前月○日〜○日」「前月○日〜」）
- 提出期間内か・シフト組む期間内かの判定（shiftHomePage の `_isInSubmissionPeriod` / `_isInSchedulingPeriod`）
- タブの表示・ボタンの有効化の切り替え
- シフト申請・修正可否の判定（`createMultipleShifts`・`updateShiftRequest` の `isInShiftSchedulingPeriod`）

---

## 影響を受けるファイル一覧

| 種別 | ファイル | 作用先 |
|------|----------|--------|
| ts | `functions/src/shared/config/defaults.ts` | デフォルト値定義 |
| ts | `functions/src/shared/config/configLoader.ts` | config 取得・フォールバック |
| ts | `functions/src/shared/config/types.ts` | StoreConfig 型定義 |
| ts | `functions/src/domains/shift/services/helpers.ts` | isInShiftSchedulingPeriod（schedulingStartDay を引数で受け取る） |
| ts | `functions/src/domains/staff/callables/createMultipleShifts.ts` | config 取得→isInShiftSchedulingPeriod に schedulingStartDay を渡す |
| ts | `functions/src/domains/staff/callables/updateShiftRequest.ts` | config 取得→isInShiftSchedulingPeriod に schedulingStartDay を渡す |
| dart | `lib/services/store_config_service.dart` | config パース・StoreConfigData |
| dart | `lib/services/store_config_defaults.dart` | デフォルト値（kDefaultShiftSubmissionStartDay 等） |
| dart | `lib/StaffDate/shiftHomePage.dart` | 提出期間・シフト組む期間の判定・表示 |
