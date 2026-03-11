# Phase0B Before/After 決定メモ（タスク3 成果物）

作成日: 2026-03-04  
参照: [PHASE0B_TARGET_LIST.md](./PHASE0B_TARGET_LIST.md), [PHASE0B_REFERENCE_MAP.md](./PHASE0B_REFERENCE_MAP.md), [STOREMETA_CONFIG_SPEC.md](./STOREMETA_CONFIG_SPEC.md)

---

## 原則（D-0003）

- 会計・営業日・締め処理の最終決定者は **Functions**
- Flutter は表示/入力補助に限定し、最終判定を持たない

---

## 共通方針（storeMeta/config）

- **To-Be SSoT**: Firestore `storeMeta/config`（単一ドキュメント）
- **読み取り優先度**: ① storeMeta/config ② `defaults.ts` ③ 各 TS 内直書き（未設定時はエラーにしない）
- **デフォルト値集約**: `functions/src/shared/config/defaults.ts`（各設定の意味をコメントで記載）
- **更新経路**: 開発者による CLI 投入（主）、Firebase Console（副）
- **詳細**: [STOREMETA_CONFIG_SPEC.md](./STOREMETA_CONFIG_SPEC.md)

---

## 1. D-06: STORE_CLOSE_HOUR

| 項目 | 内容 |
|------|------|
| 現 SSoT | Functions env / functions.config（`getStoreCloseHour()`） |
| To-Be SSoT | **廃止**。Phase4 で完全に廃止。storeMeta/config には入れない。 |
| 残す側 | なし（廃止） |
| 廃止側 | Dart、Functions とも廃止 |
| Phase4 方針 | determineAttendanceMode: 出勤/退勤分離。nightly ジョブ: 閉店処理/Cloud Task 起動。 |

---

## 2. D-10: ENABLE_AUTO_OPEN_CLOSE, TASK_*_OFFSET_MINUTES

| 項目 | 内容 |
|------|------|
| 現 SSoT | Functions env（weeklyPlanner.ts） |
| To-Be SSoT | storeMeta/config（`autoOpenClose.enabled`, `taskCloseOffsetMinutes`, `taskOpenOffsetMinutes`） |
| 残す側 | storeMeta/config |
| 廃止側 | Dart globalConstant、Functions env 直接参照 |
| 補足 | 読み取りは ① storeMeta/config ② defaults.ts ③ 直書き |

---

## 3. R-09: requiredStaffByTimeSlot

| 項目 | 内容 |
|------|------|
| 現 SSoT | 重複（Dart globalConstant + TS 各 callable 内ローカル定義） |
| To-Be SSoT | storeMeta/config または別ドキュメント（曜日ごとに異なる可能性あり、実装時に検討） |
| 残す側 | storeMeta/config（または shift 用別 doc） |
| 廃止側 | Dart、TS 各所の重複定義 |
| 補足 | 曜日ごとの分離が必要な場合はドキュメント分離を検討 |

---

## 4. R-10: businessHoursStyles

| 項目 | 内容 |
|------|------|
| 現 SSoT | 重複（Dart + styles.ts） |
| To-Be SSoT | storeMeta/config（`businessHoursStyles`） |
| 残す側 | storeMeta/config |
| 廃止側 | Dart globalConstant、TS styles.ts の直接定義 |
| 補足 | Functions を SSoT とする。Flutter は API 経由で取得。 |

---

## 5. R-11, R-12: 会計ポリシー

| 項目 | 内容 |
|------|------|
| 現 SSoT | 重複（Dart + TS 各所ハードコード） |
| To-Be SSoT | storeMeta/config（`billing.paymentPolicy.*`, `billing.sideGameChipRate`） |
| 残す側 | storeMeta/config |
| 廃止側 | Dart、paymentSplitCalculator/accounting 等のハードコード |
| 補足 | D-0003 により Functions を SSoT。paymentSplitCalculator を単一参照元とする。 |

---

## 6. D-04: linePlan

| 項目 | 内容 |
|------|------|
| 現 SSoT | 三箇所（Dart + Functions defineString + public/staff/config.js） |
| To-Be SSoT | storeMeta/config（`linePlan`） |
| 残す側 | storeMeta/config |
| 廃止側 | Dart globalConstant、Functions defineString、public/config.js の重複 |
| 補足 | 1 箇所に集約。Flutter / staff config は API または Firestore 購読で取得。 |

---

## 7. CALC_BUSINESS_DATE_BUFFER_MINUTES（補足）

| 項目 | 内容 |
|------|------|
| 現 SSoT | Dart + TS（calcBusinessDateHelpers.ts で `return 70`） |
| To-Be SSoT | storeMeta/config（`businessDay.calcBufferMinutes`） |
| 残す側 | storeMeta/config |
| 廃止側 | Dart、TS 内の直書き |
| 補足 | 読み取り優先度 ①→②→③ を適用 |
