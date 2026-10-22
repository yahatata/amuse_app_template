# Phase4 01: determineAttendanceMode 改修 — 変更仕様書（changeSpec）

**対象**: [IMPLEMENTATION_PLAN.md](./IMPLEMENTATION_PLAN.md) に基づく実装

**最終更新**: 2025-03-04

---

## 1. 概要

### 1.1 目的

- STORE_CLOSE_HOUR に依存しない設計へ移行
- 出勤・退勤を明示的に分離（clockIn / clockOut Callable）
- 経過時間による例外を廃止
- attendances の日付フィールドは `date` に統一（currentBusinessDate は持たせない）
- 閉店後1時間猶予、getUnclockedStaffForClose の営業日フィルタ廃止、closedAt 付与

### 1.2 attendance の date フィールドの扱い（セクション0）

| 項目 | 内容 |
|------|------|
| フィールド名 | `date` のまま（変更しない） |
| 格納タイミング | clockIn 実行時の JST 日付（YYYY-MM-DD）を格納 |
| 用途 | ① 表示用（どの日付の attendance として表示するか）② 給与計算（X日〜Y日の勤怠を対象とするか） |
| clockIn / clockOut での利用 | 判定には使わない（エラー・警告は closedStoreWithoutClockOut, clockIn, clockOut で判定） |
| 閉店処理での利用 | 使わない |

### 1.3 前提となる決定事項

| # | 項目 | 内容 |
|---|------|------|
| 1 | 勤怠記録タブ | 当日+翌日＋別枠（closedStoreWithoutClockOut=false & clockOut=null） |
| 2 | status ≠ running 時 | 勤怠=lastClosedBusinessDateKey の日付、シフト=翌日（無い場合は当日 JST 基準） |
| 3 | 閉店後猶予 | 1時間固定。閉店前確認画面に文言表示 |
| 4 | getUnclockedStaffForClose | 営業日フィルタなし、未退勤をすべて返す |
| 5 | 閉店処理 | date は使わない。closedStoreWithoutClockOut + closedAt 付与 |
| 9 | 経過時間例外 | **廃止** |
| 10 | lastClosedBusinessDateKey 無し | 当日（JST）を基準 |

---

## 2. 現状（As-Is）

### 2.1 対象ファイル一覧

#### Functions（TypeScript）

| ファイル | 現状 |
|----------|------|
| `domains/attendance/callables/determineAttendanceMode.ts` | getStoreCloseHour 使用、締め時間で出勤/退勤自動判定 |
| `domains/attendance/callables/createClockInRecord.ts` | `date` 使用、JST 当日で重複チェック |
| `domains/attendance/callables/createManualClockInRecord.ts` | 同上 |
| `domains/attendance/callables/updateClockOutRecord.ts` | docId 指定、経過時間チェックなし（既に廃止相当） |
| `domains/attendance/callables/getStaffListForAttendance.ts` | `date`、JST 当日で attendances/shifts 取得 |
| `domains/attendance/callables/getAllStaffAttendance.ts` | `date` で期間指定 |
| `domains/attendance/callables/getStaffAttendance.ts` | `date` で期間指定 |
| `domains/attendance/callables/approveAttendanceCorrectionRequest.ts` | `date` で attendance 検索 |
| `domains/attendance/callables/checkExistingCorrectionRequest.ts` | `date` で検索 |
| `domains/attendance/callables/createAttendanceCorrectionRequest.ts` | `date` を request に含む |
| `domains/storeMeta/services/getUnclockedStaffForClose.ts` | `date` + businessDate でフィルタ |
| `domains/storeMeta/services/getCloseIntegrityData.ts` | getUnclockedStaffForCloseCore(db, businessDate) 呼び出し |
| `domains/storeMeta/callables/closeStoreTerminal.ts` | markUnclockedAndForceEnd で `date` フィルタ、closedAt 未付与 |
| `shared/time/configOps.ts` | getStoreCloseHour, normalizeStoreCloseHour 等 |

#### Dart（Flutter）

| ファイル | 現状 |
|----------|------|
| `lib/AttendanceManagement/attendanceService.dart` | clockIn, clockOut, createClockInRecord, updateClockOutRecord 等。determineAttendanceMode は廃止済み |
| `lib/AttendanceManagement/qrScanPage.dart` | 出勤/退勤を選択 → QR 読み取り → clockIn / clockOut 呼び出し |
| `lib/Home/close_pre_confirmation_page.dart` | getCloseIntegrityData 呼び出し。「閉店処理後から1時間以内」の文言**表示済み**（未退勤スタッフ枠の subtitle） |
| `lib/Home/unclocked_attendance_list_page.dart` | Firestore snapshot、`orderBy('date', ...)`、clockOut null |

#### Firestore

| 項目 | 現状 |
|------|------|
| attendances フィールド | `date`（YYYY-MM-DD） |
| インデックス | `staffId`+`date`, `date`+`clockOut`+`clockIn` 等 |

---

## 3. 実装順序と検証ポイント

### 全体フロー

```
Phase 0: 準備・共通ロジック
  ↓ 【検証: ビルド・既存テスト】
Phase 1: storeMeta 連携・営業日取得
  ↓ 【検証: 単体テスト作成・実行】
Phase 2: getUnclockedStaffForClose / closeStoreTerminal 改修
  ↓ 【検証: phase4_03 テスト・手動確認】
Phase 3: clockIn / clockOut 新規作成
  ↓ 【検証: 単体テスト作成・実行】
Phase 4: createClockInRecord / createManualClockInRecord 改修（date で営業日を格納）
  ↓ 【検証: ビルド・既存呼び出し確認】
Phase 5: date を全箇所で統一参照（getStaffListForAttendance 等）
  ↓ 【検証: ビルド・統合テスト】
Phase 6: Dart 改修（qrScanPage, close_pre_confirmation 等）
  ↓ 【検証: アプリビルド・手動 E2E】
Phase 7: determineAttendanceMode 廃止・configOps 整理
  ↓ 【検証: ビルド・デプロイ確認】
```

---

## 4. Phase 0: 準備

### 4.1 タスク

- [ ] リポジトリの最新取得・ブランチ作成
- [ ] IMPLEMENTATION_PLAN.md、本 changeSpec の内容確認

### 4.2 検証

- `cd functions && npm run build` が成功すること
- 既存の `phase4_03_nightlyIntegrityCheck.spec.ts` が通ること（該当する場合）

---

## 5. Phase 1: storeMeta 連携・営業日取得

### 5.1 タスク

#### 1-1. getCurrentBusinessDateKeyOrThrow 拡張（status ≠ running 対応）

**ファイル**: `functions/src/domains/storeMeta/repos/getCurrentBusinessDateKeyOrThrow.ts`

| 変更 | 内容 |
|------|------|
| 新規 | `getDisplayBusinessDateKeyOrThrow()` を追加。status=running なら currentBusinessDateKey、そうでなければ lastClosedBusinessDateKey。**lastClosedBusinessDateKey が無い場合は JST 当日**を返す |
| 備考 | getCloseIntegrityData は status=running 時のみ呼ばれるため、既存 getCurrentBusinessDateKeyOrThrow はそのまま使用可 |

**実装方針**: `getDisplayBusinessDateKeyForNonRunning()` のような関数を追加し、閉店済み時の表示日取得に利用する。JST 当日は `generateJstDateKey` 等を使用。

#### 1-2. repos の export 更新

**ファイル**: `functions/src/domains/storeMeta/repos/` または index

- 上記関数を必要に応じて export

### 5.2 検証

- 新規関数の単体テストを作成・実行
- `npm run build` が成功すること

---

## 6. Phase 2: getUnclockedStaffForClose / closeStoreTerminal

### 6.1 タスク

#### 2-1. getUnclockedStaffForCloseCore 改修

**ファイル**: `functions/src/domains/storeMeta/services/getUnclockedStaffForClose.ts`

| 変更 | 内容 |
|------|------|
| Core 関数 | `getUnclockedStaffForCloseCore(db)` — **businessDate 引数を削除** |
| クエリ | `where('clockOut', '==', null)` のみ。**date フィルタを削除**。取得後に `clockIn != null` でフィルタ |
| インデックス | `clockOut` 単一 or 複合。必要に応じて firestore.indexes.json に追加 |

**該当コード（現状）**:

```typescript
// 変更前
const attendancesSnap = await db
  .collection('attendances')
  .where('date', '==', businessDate)
  .where('clockOut', '==', null)
  .get();
```

**変更後**:

```typescript
const attendancesSnap = await db
  .collection('attendances')
  .where('clockOut', '==', null)
  .get();
// その後 .filter(doc => doc.data().clockIn != null)
```

**注意**: 店舗スコープ（storeId）が attendances に存在する場合、そのフィルタは維持する。単一店舗想定の場合はスコープが暗黙の場合あり。

#### 2-2. getUnclockedStaffForClose Callable

| 変更 | 内容 |
|------|------|
| 呼び出し | `getCurrentBusinessDateKeyOrThrow()` の呼び出しを**削除**。Core に db のみ渡す |

#### 2-3. getCloseIntegrityData 改修

**ファイル**: `functions/src/domains/storeMeta/services/getCloseIntegrityData.ts`

| 変更 | 内容 |
|------|------|
| 呼び出し | `getUnclockedStaffForCloseCore(db, businessDate)` → `getUnclockedStaffForCloseCore(db)` |
| 備考 | unsettledBills, unclosedTournaments は businessDate を継続使用（getCurrentBusinessDateKeyOrThrow） |

#### 2-4. closeStoreTerminal markUnclockedAndForceEnd

**ファイル**: `functions/src/domains/storeMeta/callables/closeStoreTerminal.ts`

| 変更 | 内容 |
|------|------|
| クエリ | `where('date', '==', closedBusinessDate)` を**削除**。`where('clockOut', '==', null)` のみ |
| 更新 | `closedStoreWithoutClockOut: true` に加え **`closedAt: FieldValue.serverTimestamp()`** を付与 |
| 備考 | 既に clockOut がある doc は取得されないため、上書きの心配なし |

**該当コード（185〜204 行目付近）**:

```typescript
// 変更前
const attendancesSnap = await db
  .collection('attendances')
  .where('date', '==', closedBusinessDate)
  .where('clockOut', '==', null)
  .get();
// ...
batch.update(doc.ref, {
  closedStoreWithoutClockOut: true,
  updatedAt: FieldValue.serverTimestamp(),
});
```

```typescript
// 変更後
const attendancesSnap = await db
  .collection('attendances')
  .where('clockOut', '==', null)
  .get();
// docs をループし、clockIn != null のもののみ
batch.update(doc.ref, {
  closedStoreWithoutClockOut: true,
  closedAt: FieldValue.serverTimestamp(),
  updatedAt: FieldValue.serverTimestamp(),
});
```

### 6.2 検証

- `functions/__tests__/config_migration/phase4_03_nightlyIntegrityCheck.spec.ts` を更新して getUnclockedStaffForClose の営業日フィルタ廃止を反映
- テスト実行: `cd functions && npm test -- phase4_03`
- 閉店前確認画面で未退勤スタッフが正しく表示されることを手動確認（エミュレータ or 実機）

---

## 7. Phase 3: clockIn / clockOut 新規作成

### 7.1 タスク

#### 3-1. clockIn Callable 新規作成

**ファイル**: `functions/src/domains/attendance/callables/clockIn.ts`（新規）

| 項目 | 内容 |
|------|------|
| 入力 | `{ staffId: string, staffName: string }` |
| 営業日 | storeMeta の status が running なら currentBusinessDateKey、そうでなければ JST 当日（generateJstDateKey） |
| 警告 | そのスタッフに closedStoreWithoutClockOut===true の attendance が存在 → 出勤可、warning を返す |
| エラー | そのスタッフに closedStoreWithoutClockOut!==true かつ clockIn あり & clockOut null の attendance が**全期間で**1 件以上存在 → 出勤不可 |
| 成功時 | createClockInRecord を内部呼び出し（または同等ロジック）。closedStoreWithoutClockOut: false をデフォルトで付与 |

#### 3-2. clockOut Callable 新規作成

**ファイル**: `functions/src/domains/attendance/callables/clockOut.ts`（新規）

| 項目 | 内容 |
|------|------|
| 入力 | `{ staffId: string }` または `{ docId: string }` |
| 営業日 | clockIn と同様。status が running でない場合は JST 当日 |
| 警告 | そのスタッフに closedStoreWithoutClockOut===true の attendance が存在 → 退勤可、warning を返す |
| エラー | 退勤対象（staffId + 当日 + clockOut null + clockIn あり）が存在しない → 退勤不可 |
| 1時間猶予 | closedStoreWithoutClockOut かつ closedAt があり、now - closedAt < 1時間 なら**通常退勤可**（パスワード不要） |
| 成功時 | updateClockOutRecord 相当の処理。**経過時間チェックは行わない**（廃止） |

#### 3-3. attendance/index の export

**ファイル**: `functions/src/domains/attendance/index.ts`

- `clockIn`, `clockOut` を export 追加

### 7.2 検証

- clockIn / clockOut の単体テストファイルを新規作成
- 警告・エラー・通常の各パターンをテスト
- `npm run build` が成功すること

---

## 8. Phase 4: createClockInRecord / createManualClockInRecord

### 8.1 タスク

#### 4-1. 営業日取得ロジックの共通化

- storeMeta の currentBusinessDay を参照し、status が running なら currentBusinessDateKey を使用
- status が running でない場合は JST 当日を使用（`generateJstDateKey`）

#### 4-2. createClockInRecord 改修

**ファイル**: `functions/src/domains/attendance/callables/createClockInRecord.ts`

| 変更 | 内容 |
|------|------|
| フィールド | `date` に営業日を格納（currentBusinessDate は持たせない） |
| 重複チェック | `where('date', '==', businessDate)` |
| 新規フィールド | `closedStoreWithoutClockOut: false` を付与 |

#### 4-3. createManualClockInRecord 改修

**ファイル**: `functions/src/domains/attendance/callables/createManualClockInRecord.ts`

- createClockInRecord と同様。`date` に営業日を格納、`closedStoreWithoutClockOut: false`

#### 4-4. 手動打刻と QR 打刻の Callable 経路

| 種別 | 起動関数 | 備考 |
|------|----------|------|
| QR 打刻 | clockIn / clockOut | 警告・エラー判定あり |
| 手動打刻 | clockIn / clockOut を経由する設計とする | 処理内容は基本的に同じなので統一。手動登録は設定により許可/非許可を分岐（今後の実装）。はじめに起動する関数は QR 用と同様のもの（clockIn/clockOut）とする |

### 8.2 検証

- 既存の createClockInRecord 呼び出し元（qrScanPage 等）が引き続き動作するか確認
- 注意: この時点では Dart はまだ determineAttendanceMode を使用しているため、clockIn/clockOut は直接呼ばれない。createClockInRecord/updateClockOutRecord は引き続き使用される

---

## 9. Phase 5: date の統一参照

### 9.1 タスク

attendances は `date` フィールドのみを使用。currentBusinessDate は持たせない。

#### 5-1. getStaffListForAttendance

**ファイル**: `functions/src/domains/attendance/callables/getStaffListForAttendance.ts`

- 営業日取得を storeMeta 連携に変更（status=running 時は currentBusinessDateKey、そうでなければ JST 当日）
- `where('date', '==', todayString)` でクエリ

#### 5-2. getAllStaffAttendance / getStaffAttendance

- `date` でクエリ

#### 5-3. approveAttendanceCorrectionRequest / checkExistingCorrectionRequest / createAttendanceCorrectionRequest

- `date` を参照・使用

#### 5-4. firestore.indexes.json

- attendances は `date` を含む既存インデックスを継続使用

### 9.2 検証

- Firestore エミュレータでインデックスエラーが発生しないことを確認
- `npm run build` が成功すること
- 勤怠一覧・修正リクエスト等の既存機能が動作することを手動確認

---

## 10. Phase 6: Dart 改修

### 10.1 タスク

#### 6-1. qrScanPage / attendanceService

- `determineAttendanceMode` は廃止。attendanceService から呼び出す必要はない
- 勤怠管理・スタッフ打刻ページから**直接「出勤」「退勤」を選択**し、それぞれの QR 読み取りページに遷移するフロー
- 出勤時: `clockIn` を呼び出し
- 退勤時: `clockOut` を呼び出し（staffId または docId を渡す）
- 警告・エラーの表示（warning は続行可、error は処理不可）

#### 6-2. close_pre_confirmation_page

- 「閉店処理後から1時間以内は通常フローでの退勤が可能です」の文言を**必須表示**として追加
- 画面内の適切な位置（例: 未退勤スタッフ枠の上または下）に配置

#### 6-3. unclocked_attendance_list_page

- Firestore クエリは `orderBy('date', ...)` のまま
- フィールド参照は `d['date']` を参照

#### 6-4. 勤怠記録タブ・シフト一覧（該当画面がある場合）

- status ≠ running 時: lastClosedBusinessDateKey の日付（無い場合は JST 当日）で勤怠表示
- シフト一覧: lastClosedBusinessDateKey の翌日（無い場合は JST 翌日）
- 勤怠記録タブの別枠: closedStoreWithoutClockOut=false かつ clockOut=null を表示

### 10.2 検証

- `flutter build` が成功すること
- 出勤・退勤フローを手動で E2E 確認
- 閉店前確認画面で文言が表示されることを確認
- 閉店後1時間以内の通常退勤が可能であることを確認

---

## 11. Phase 7: determineAttendanceMode 廃止・configOps 整理

### 11.1 タスク

#### 7-1. determineAttendanceMode を unused に移動【完了】

- `functions/src/unused_function_lib/determineAttendanceMode.ts` に移動
- `domains/attendance/index.ts` から export を削除
- Dart `attendanceService.dart` から `determineAttendanceMode` メソッドおよび `AttendanceJudgmentResult` クラスを削除

#### 7-2. configOps の整理【完了】

- `functions/src/unused_function_lib/configOps.ts` に移動
- `shared/time/index.ts` から configOps の export を削除
- analytics `helpers.ts` の `resolveBusinessDate` における `normalizeStoreCloseHour` 依存を解消（`storeCloseHour % 24` をインライン化）
- `__tests__/config/ops.spec.ts` の import パスを更新

#### 7-3. ルート index の export 確認

- `domains/attendance` を経由する export のため、attendance/index.ts の削除で対応済み

### 11.2 検証

- `npm run build` が成功すること
- デプロイ後、既存機能に影響がないことを確認

---

## 12. 検証・テスト一覧

### 12.1 単体テスト（作成・更新）

| 対象 | ファイル | 内容 |
|------|----------|------|
| getUnclockedStaffForCloseCore | `phase4_03_nightlyIntegrityCheck.spec.ts` 等 | 営業日フィルタなしで未退勤をすべて返すこと |
| clockIn | 新規 `clockIn.spec.ts` | 警告・エラー・通常の各パターン |
| clockOut | 新規 `clockOut.spec.ts` | 警告・エラー・通常、1時間猶予のパターン |
| closeStoreTerminal | 既存 or 拡張 | closedAt 付与の確認 |

### 12.2 統合・手動確認

| 項目 | 内容 |
|------|------|
| 出勤フロー | QR スキャン → 出勤 → 記録作成 |
| 退勤フロー | QR スキャン → 退勤 → 記録更新 |
| 閉店前確認 | 未退勤スタッフ表示、「閉店処理後から1時間以内」文言表示 |
| 閉店処理 | 未退勤に closedStoreWithoutClockOut + closedAt 付与 |
| 閉店後1時間以内 | 通常の clockOut で退勤可能 |
| 閉店後1時間超過 | 未退勤一覧からパスワード認証で退勤 |
| status ≠ running | lastClosedBusinessDateKey 無し時は JST 当日を基準に表示 |

---

## 13. リスク・注意事項

### 13.1 データ移行

- attendances は `date` フィールドのみを使用。`currentBusinessDate` は持たせない

### 13.2 インデックス

- `clockOut` 単一でのクエリは、件数が多くなる可能性あり。必要に応じて storeId 等でスコープを絞る
- 複合インデックス `clockOut` + `clockIn` 等の追加を検討

### 13.3 getCloseIntegrityData の businessDate

- 未会計 bills、未 close トーナメントは引き続き currentBusinessDateKey（status=running 時）を使用
- getCloseIntegrityData は閉店前確認画面で呼ばれるため、通常は status=running

---

## 14. チェックリスト（実装時）

### Phase 0
- [ ] ブランチ作成、ドキュメント確認
- [ ] ビルド成功、既存テスト通過

### Phase 1
- [ ] getDisplayBusinessDateKeyOrThrow（または相当）実装
- [ ] 単体テスト作成・実行

### Phase 2
- [ ] getUnclockedStaffForCloseCore 営業日フィルタ削除
- [ ] getCloseIntegrityData 呼び出し修正
- [ ] closeStoreTerminal に closedAt 付与、date フィルタ削除
- [ ] phase4_03 テスト更新・実行
- [ ] 閉店前確認の手動確認

### Phase 3
- [ ] clockIn / clockOut 新規作成
- [ ] 単体テスト作成・実行

### Phase 4
- [ ] createClockInRecord / createManualClockInRecord の date で営業日格納（currentBusinessDate は持たせない）
- [ ] closedStoreWithoutClockOut: false 付与

### Phase 5
- [ ] getStaffListForAttendance 等の date を統一参照
- [ ] firestore.indexes.json は date の既存インデックスを継続使用

### Phase 6
- [ ] qrScanPage: determineAttendanceMode 廃止、clockIn/clockOut 呼び出し
- [ ] close_pre_confirmation_page: 文言追加
- [ ] unclocked_attendance_list_page: date を参照
- [ ] アプリビルド・E2E 手動確認

### Phase 7
- [x] determineAttendanceMode を unused_function_lib に移動
- [x] configOps を unused_function_lib に移動（analytics 依存解消後に実施）
- [ ] 最終ビルド・デプロイ確認
