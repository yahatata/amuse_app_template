# Phase4.3 仕様 ↔ 実装 差分詳細

**目的**: `specs/` の記載と実装の**差分のみ**を整理する。修正方針の判断材料用。

**参照元**: 仕様トレーサビリティレビュー（2026-03-22 時点のコードベース調査）。

---

## 凡例

| 記号 | 意味 |
|------|------|
| ✅ | 仕様どおり実装で表現できている |
| ⚠️ | 仕様と一部ずれる／条件が足りない／文言のみの差 |
| ❌ | 仕様の必須要素が未実装、または本番で成立しにくい |

---

## G1: Firestore セキュリティルール（重大）— **対応方針（確定・2026-03-27）**

### 仕様での前提

| 仕様 | 箇所 | 内容 |
|------|------|------|
| 通知の取得・更新 | `07_NOTIFICATION_SCHEDULER_SPEC` §5-1, §5-2 | Flutter から `notifications` を直接クエリ・`isRead` / `isFlagged` 更新 |
| 給与 UI | `06_UI_SPEC` / `05_PROCESS_FLOW_SPEC` | `monthlyPayroll` / `payrollRuns` / `staffResults` 等のクライアント読取 |
| payrollConfig 購読 | `02_CONFIG_SPEC` | `storeMeta/payrollConfig` を Flutter が読む（`PayrollConfigService`） |
| 共通原則の例外 | `04_CALLABLE_API_SPEC`（07 参照） | 通知の UI 状態のみクライアント直接更新可 |

### 確定した対応方針（リリース優先）

| レイヤ | 方針 |
|--------|------|
| **Firestore ルール** | **`admins/{uid}` 依存を廃止**。payroll 関連パスは **`request.auth != null`（`isSignedIn()`）なら read 可**。クライアント直接 **write は原則禁止**（給与データは Functions のみ）。通知は **`operationCategory == 'payroll'`** の **`isRead` / `isFlagged` のみ** update 可（従来どおりフィールド制限）。 |
| **Callable** | **変更・集計などの権限**は **`getCallerDeviceByUid` + `device.role === 'admin'` + `isActive`** で担保（既存 payroll Callable と同型）。**`getPayrollData`** にも同一検証を追加。 |
| **読み取りの機密性** | ルールでは **認証済み端末なら read 可**とし、**「admin 専用 read」は UI 寄り＋Callable 側の厳格化**で賄う（**同一プロジェクト内の terminal が Firestore を直接読むとデータが見える**リスクは許容）。 |

**詳細・実装手順**: `docs/config_migration/phase4_3/修正用フォルダ/ルール関連/CHANGE_SPEC_PAYROLL_RULES_AND_CALLABLES.md`

### 差分（旧記録 → 現状）

| 旧課題 | 解消内容 |
|--------|----------|
| `isPayrollAdmin()` が **`admins/{uid}`** を参照し **デバイス admin と不一致** | ルールから **`admins` 依存を削除**し **`isSignedIn()` に変更**。 |
| Callable の **`getPayrollData`** に **認証・admin 検証が無い** | **`getCallerDeviceByUid` + admin** を追加。 |
| ルールで admin read を厳密に書けない問題 | **索引／Claims は導入せず**、上記の **緩い read + Callable での admin** に寄せる。 |

**結果（G1）**: ✅ **方針に沿って実装すれば**、仕様が前提とする **Flutter からの read／通知更新** と **Callable 上の admin 専用処理**を両立しつつ、`admins` 未整備による **read 拒否**を解消する。

---

## G2: `attendanceLogs` — `monthly_payroll_reflect`（重大）

### 仕様

| 仕様 | 箇所 | 内容 |
|------|------|------|
| actionType | `04_CALLABLE_API_SPEC` §11 | `monthly_payroll_reflect` のタイミングは **`processStaffPayroll` 完了時** |

### 実装

| 状態 | コード / 根拠 |
|------|----------------|
| ❌ `processStaffPayroll` からは未呼出 | `functions/src/domains/attendance/tasks/processStaffPayroll.ts` に `writeAttendanceLog` / `monthly_payroll_reflect` の記述なし |
| ⚠️ 別経路のみ | `functions/src/domains/attendance/scheduler/monthlyPayrollTrigger.ts` が `actionType: 'monthly_payroll_reflect'` を書く（旧フロー。Phase4.3 の分散計算パスとは別） |

**結果**: 仕様表の「processStaffPayroll 完了時」と**一致しない**（ログ設計ギャップ）。

### 許容方針（確定・実装変更なし）

**現状の実装のまま本ギャップを許容する。**

- 分散計算（`processStaffPayroll`）完了時には `monthly_payroll_reflect` を `attendanceLogs` に書かない。
- 同種ログは **`monthlyPayrollTrigger` 経路にのみ**付与される（旧フロー）。
- 監査・運用上、上記の差分を受け入れ、`04_CALLABLE_API_SPEC` §11 の表現は**実装優先で読み替える**（将来、仕様の修正または実装追加のどちらかで揃える余地は残す）。

---

## G3: `payroll_attendance_corrected` 通知条件（中）

### 仕様

| 仕様 | 箇所 | 内容 |
|------|------|------|
| 手順 7 | `04_CALLABLE_API_SPEC` §1 | 手順6のとき、**帰属期間の `monthlyPayroll.status` が `confirmed` であれば** `payroll_attendance_corrected` を作成 |
| 同趣旨 | `05_PROCESS_FLOW_SPEC` §7、`03_DATA_MODEL_SPEC` 確定事項 #8 | 確定済み期間の修正 → 通知（自動再計算はしない） |

### 実装

| ファイル | 内容 |
|---------|------|
| `functions/src/domains/attendance/triggers/attendanceOnWrite.ts` | `beforeData.payrollStatus === 'reflected'` かつデータ変更で `corrected_after_reflection` になった**直後**に通知。**`monthlyPayroll` を読んで `confirmed` かどうかは見ていない**。 |

**結果**: ⚠️ **draft のまま reflected した勤怠を修正した場合**でも通知が出うる可能性があり、仕様の「confirmed 済み期間の修正」より**条件が広い**。

### 許容方針（確定・実装変更なし）

**現状の実装のまま本ギャップを許容する。**

- `attendanceOnWrite` は `monthlyPayroll.status === 'confirmed'` を参照せず、`reflected` → `corrected_after_reflection` 遷移で通知を作成し続ける。
- 仕様の「確定後の修正のみ通知」より通知が出る範囲が広い可能性を受け入れる（運用で許容）。

---

## G4: `processPayrollNotifications` の対象期間（中）

### 仕様

| 仕様 | 箇所 | 内容 |
|------|------|------|
| 処理の対象 | `07_NOTIFICATION_SCHEDULER_SPEC` §3-2 | 対象期間を特定: **currentPeriod / previousPeriod**、**必要に応じて前々月も** |
| 詳細手順 | 同 §3-3 | `[payroll_calc_remind]` 等で **previousPeriod** の periodEnd+N 日、等の列挙 |

### 実装

| ファイル | 内容 |
|---------|------|
| `functions/src/domains/attendance/tasks/processPayrollNotifications.ts` | `todayStr` と `getPayrollPeriodRange` から **「直前に完了した 1 期間」**（`recentPeriodKey`）**1 本**だけを読み、`evaluateScheduledNotifications` に渡す。**複数期間のループは無い**。 |

**結果**: ⚠️ 仕様文言の「当月・前月・前々月を順に見る」イメージと**完全一致ではない**（単一期間への簡略化）。**G6**（用語）とも関連。

### 許容方針（確定・実装変更なし）

**現状の実装のまま本ギャップを許容する。**

- `processPayrollNotifications` は **`recentPeriodKey`（直前に完了した 1 期間）のみ**を評価し、複数期間のループは行わない。
- 仕様 §3-2/3-3 の「複数期間を順に見る」文言との厳密一致は求めない（単一期間簡略化で運用する）。

---

## G5: `paymentDate` の型・運用（軽微・文書）

### 仕様

| 仕様 | 箇所 | 内容 |
|------|------|------|
| 型 | `02_CONFIG_SPEC` §3 | `paymentDate` を **string (YYYY-MM-DD)** 形式の例示と読める表現 |

### 実装

| ファイル | 内容 |
|---------|------|
| `functions/src/shared/config/payrollConfigLoader.ts` | `paymentDate` は **string \| null**（日のみ `"25"` 等も許容するマージ） |
| `functions/src/domains/attendance/tasks/processPayrollNotifications.ts` | `computeActualPaymentDate` は **日番号を数値パース**（`YYYY-MM-DD` 全文ではなく **1〜31 の日**として扱う想定） |
| Flutter `lib/payroll/widgets/payment_management.dart` 等 | `int.tryParse` で支払日を解釈 |

**結果**: ⚠️ 仕様表の **YYYY-MM-DD 固定**の書き方と、実装の **「日のみ」+ null** の運用が**表記上ずれる**。実装バグとは限らない（ドキュメント整合の問題）。

---

## G6: `07` §3-3 の current/previous 文言と実装の用語整合（軽微）

### 仕様

| 仕様 | 箇所 | 内容 |
|------|------|------|
| 期間の呼び方 | `07_NOTIFICATION_SCHEDULER_SPEC` §3-2, §3-3 | **currentPeriod / previousPeriod**、「当月・前月・前々月」等の列挙 |
| `[payroll_period_start]` 等 | 同 §3-3 | **currentPeriod** の `periodEnd + 1 日 == today` と読める記述 |

### 実装

| ファイル | 内容 |
|---------|------|
| `functions/src/domains/attendance/tasks/processPayrollNotifications.ts` | **「いま完了直後の 1 期間」**（recent）を中心に判定。仕様本文の **current/previous と 1:1 の対応表記ではない**。 |
| `payroll_period_start` 相当の判定 | 「`activePeriod.periodStart` の前日」から求めた **recent 期間**の `periodEnd+1` と `today` を比較 |

**結果**: ⚠️ **G4**（単一期間のみ）とセットで、仕様書の用語定義と実装の**文言整合の余地**がある（動作は意図に近い可能性）。

---

## G7: JST 保存と `serverTimestamp` の厳密な意味（軽微）

### 仕様

| 仕様 | 箇所 | 内容 |
|------|------|------|
| 日時 | `07_NOTIFICATION_SCHEDULER_SPEC` 冒頭 | すべて **JST として** Firestore に保存 |

### 実装

| ファイル | 内容 |
|---------|------|
| `functions/src/domains/attendance/helpers/payrollNotificationHelper.ts` | `createdAt: FieldValue.serverTimestamp()`（**UTC の Timestamp** が一般的） |

**結果**: ⚠️ 厳密には「JST で保存」ではなく **サーバー時刻（UTC）**。UI で JST 表示すれば実務上は問題になりにくい（**解釈差**）。

---

## 補足（ギャップ外）: `06_UI_SPEC` §1 と通知ベル

| 仕様 | 実装 |
|------|------|
| `06_UI_SPEC` §1 は **「給与計算」メニュー**のみ記載 | `lib/Home/adminHomePage.dart` に **通知ベル**あり（`07_NOTIFICATION_SCHEDULER_SPEC` の adminHome 要件） |

**結果**: ✅ 仕様間の役割分担として**矛盾ではない**（§1 に明示が無いだけ）。

---

## 共通原則「クライアントは Functions 経由で書き込み」+ 例外

### 仕様

- `04_CALLABLE_API_SPEC` 冒頭: 原則は Functions 経由。
- `07_NOTIFICATION_SCHEDULER_SPEC` §5-2: **通知の isRead / isFlagged** は例外として Flutter 直接更新可。

### 実装

- `notification_list.dart` が Firestore 直接 `update`。

### 差分

- ロジック上は ✅。G1 対応後は **通知更新は `isSignedIn()` + フィールド制限**（**G1 方針**参照）。

---

## 差分なし（整合として記録）

### `01_CALC_SPEC.md`

- 計算エンジン・検証テーブルテスト・`nightWorkMinutes` 休憩控除・`generateAnomalyFlags` スタブ: 実装と整合（詳細は `payrollCalcEngine.spec.ts` 等）。

### `03_DATA_MODEL_SPEC.md`

- attendance / monthlyPayroll 階層 / キャリーオーバー / `notifications` ドキュメント形状（Functions 作成）: データモデル面の**未記載の差分はなし**（G1 は **ルール簡素化 + Callable admin 検証**で対応）。

### `06_UI_SPEC.md` — 意図的未実装

| 項目 | 仕様 | 実装 |
|------|------|------|
| §4-7 印刷 | 「一旦無視」 | 未実装 ✅（仕様どおり） |

### `07` — 将来対応で明示されたもの

| 項目 | 仕様 | 実装 |
|------|------|------|
| プッシュ通知（FCM） | 初期リリース非対応 | 未実装 ✅ |
| スケジューラからの自動計算実行 | 初期リリース非対応 | 未実装 ✅ |

---

## インフラ（本ファイルのスコープ外の注意）

| 項目 | 備考 |
|------|------|
| **Cloud Scheduler → どの関数を叩くか** | `firestore.rules` では判定不可。**GCP / Firebase コンソールまたは `firebase.json` 外のデプロイ手順**で別途確認。 |
| **Cloud Tasks キュー名** | `processPayrollNotifications` 等の登録は **Functions デプロイと GCP 設定**に依存。 |

---

## ギャップ ID 早見表

| ID | 種別 | 仕様側 | 実装 / ルール側 |
|----|------|--------|----------------|
| **G1** | ルール + Callable | 07 §5-1/5-2, Flutter 直接アクセス | **対応方針確定**: ルールは `isSignedIn()` で read 緩和・`admins` 廃止。admin 境界は Callable + `getPayrollData` で `devices.role` 検証 |
| **G2** | ログ | 04 §11 `monthly_payroll_reflect` @ processStaffPayroll 完了 | `processStaffPayroll.ts` 未呼出；旧 `monthlyPayrollTrigger` のみ。**許容方針確定**（本文 G2 参照） |
| **G3** | 条件 | 04 §1 手順7: confirmed 時のみ corrected 通知 | `attendanceOnWrite.ts`: confirmed 未参照。**許容方針確定**（本文 G3 参照） |
| **G4** | 範囲 | 07 §3-2/3-3 複数期間のイメージ | `processPayrollNotifications.ts`: 単一期間キーのみ。**許容方針確定**（本文 G4 参照） |
| **G5** | 表記 | 02: paymentDate を YYYY-MM-DD と読める箇所 | Loader/スケジューラ/Flutter は日/null 運用 |
| **G6** | 文言 | 07 §3-3 current/previous | 実装は recent 1 期間中心（G4 と関連） |
| **G7** | 時刻 | 07: JST として保存 | `serverTimestamp()`（UTC） |

---

## 更新履歴

| 日付 | 内容 |
|------|------|
| 2026-03-22 | 初版作成（差分フォーカス） |
| 2026-03-27 | G1 を「対応方針確定」に更新: ルール簡素化（`isSignedIn`）、Callable で admin 担保、`getPayrollData` 修正。旧メモ（パス列挙・索引案）は本対応で置換。詳細は `修正用フォルダ/ルール関連/CHANGE_SPEC_PAYROLL_RULES_AND_CALLABLES.md` |
| 2026-03-28 | G2 に「許容方針（確定・実装変更なし）」を追記 |
| 2026-03-28 | G3・G4 に「許容方針（確定・実装変更なし）」を追記、早見表を更新 |
