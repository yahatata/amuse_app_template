# Phase4.3 — payroll ルール簡素化 & Callable admin 検証（change spec）

**目的**: G1（Firestore / payroll）の対応内容を **As-Is / To-Be・確認結果・実装順序** として固定する。  
**関連**: `SPEC_IMPLEMENTATION_DIFF.md` G1、`firestore.rules`、`functions/src/domains/attendance/callables/*`

---

## 1. 背景

- 旧ルールの **`isPayrollAdmin()`** は **`admins/{request.auth.uid}` の存在**に依存しており、**デバイス登録では `admins` を作らない**ため、**匿名 Auth + admin 端末**でも **read が拒否**されうる。
- **admin 専用の厳密な read** をルールだけで `devices.role` と一致させるには **索引 or Custom Claims** が必要で、**リリース速度**を優先する場合は **Callable 側で admin を担保**し、ルールは **認証済み read** に簡素化する方針とした。

---

## 2. As-Is（修正前の実装）

### 2-1. `firestore.rules`

| 項目 | 内容 |
|------|------|
| ヘルパー | `isPayrollAdmin()` = `isSignedIn()` **かつ** `exists(.../admins/$(request.auth.uid))` |
| `storeMeta/payrollConfig` | `allow read: if isPayrollAdmin();` |
| `monthlyPayroll/**` | 各層 `allow read: if isPayrollAdmin();` |
| `notifications` | read / 限定 update とも `isPayrollAdmin()` 依存 |

### 2-2. payroll 関連 Callable（admin 検証の有無）

| Callable | 認証 | `getCallerDeviceByUid` | `role === 'admin'` |
|----------|------|------------------------|----------------------|
| `executeMonthlyPayroll` | ✅ | ✅ | ✅ |
| `confirmPayrollRun` | ✅ | ✅ | ✅ |
| `cancelPayrollRun` | ✅ | ✅ | ✅ |
| `retryFailedStaffTasks` | ✅ | ✅ | ✅ |
| `getPayrollCandidates` | ✅ | ✅ | ✅ |
| `registerPaymentStatus` | ✅ | ✅ | ✅ |
| **`getPayrollData`** | ❌ | ❌ | ❌ |

**確認日**: 2026-03-27（コードレビュー）  
**注**: 上表は **修正前**のスナップショット。現リポジトリでは **`getPayrollData` に admin 検証を追加済み**。

---

## 3. To-Be（修正後の仕様）

### 3-1. `firestore.rules`

| 項目 | 内容 |
|------|------|
| ヘルパー | **`isPayrollAdmin()` を削除**（`admins` 依存を廃止） |
| `storeMeta/payrollConfig` | `allow read: if isSignedIn();` |
| `monthlyPayroll/**` | 全層 `allow read: if isSignedIn();` |
| `monthlyPayroll/**` write | **引き続き `allow write: if false;`**（Functions のみ） |
| `notifications` | `allow read: if isSignedIn();` |
| `notifications` update | `isSignedIn()` **かつ** `operationCategory == 'payroll'` **かつ** `isRead` / `isFlagged` のみ |

**受容リスク**: **同一 Firebase プロジェクトにログインできる任意の端末**（terminal 含む）が、ルール上 **payroll 系コレクションを直接読める**。機密性は **UI 利用想定 + Callable の admin 制御**でカバーする。

### 3-2. `getPayrollData`

- 他 payroll Callable と同様、**冒頭で**:
  - `request.auth` 必須
  - `getCallerDeviceByUid(callerUid)`
  - `isActive(device.status)`
  - `device.role === 'admin'`（失敗時 `PAYROLL_ERRORS.PERMISSION_DENIED`）

### 3-3. Flutter（Dart）

- **変更なしを原則**とする。匿名ログイン済みなら **`isSignedIn()`** を満たし、`monthlyPayroll` / `payrollConfig` / `notifications` の購読は **permission-denied が解消**されやすい。
- **未ログイン**で payroll 画面を開く実装が無い限り追加対応不要。

---

## 4. 確認結果（チェックリスト）

| # | 項目 | 結果 |
|---|------|------|
| 1 | payroll 系 Callable 一覧と admin 検証の棚卸し | ✅ `getPayrollData` を除き元から対応済み。`getPayrollData` は **修正済み** |
| 2 | `firestore.rules` から `isPayrollAdmin` / `admins` 参照を除去 | ✅ **実装済み** |
| 3 | `getPayrollData.ts` に admin 検証追加 | ✅ **実装済み** |
| 4 | `lib/payroll/*`・`PayrollConfigService` が **認証前提**か | ✅ 通常は匿名ログイン後のみ利用（追加修正は不要と判断） |
| 5 | `firebase deploy --only firestore:rules` / Functions デプロイ | ⏳ **運用側で実施** |

---

## 5. 実装順序（推奨）

1. **Functions**: `getPayrollData.ts` に admin 検証を追加 — **リポジトリ反映済み**。**本番・ステージングへのデプロイ**は運用で実施。
2. **Firestore ルール**: 本 change spec どおり **`isSignedIn()`** — **リポジトリ反映済み**。**`firebase deploy --only firestore:rules`** は運用で実施（クライアントが先に緩くなると一瞬だけ read が緩むため、**可能なら Functions と同じリリース単位**が望ましい）。
3. **結合確認**: admin 端末で `result_tab` / 通知一覧が読めること、terminal で **意図どおり read が緩む**ことを把握したうえで動作確認。
4. **ドキュメント**: `SPEC_IMPLEMENTATION_DIFF.md` G1 を本方針に合わせて更新（**済**）。

---

## 6. 不要ファイルの扱い（`unused_function_lib` / `lib/to_be_deleted`）

**本変更（G1 / payroll ルール・Callable）では、index から外す TypeScript ファイルは発生しなかった。**  
`getPayrollData.ts` は **引き続き** `domains/attendance/index.ts` および `functions/src/index.ts` から export する。

**Dart 側**も、ルール緩和・Callable 修正の結果として **削除・移動対象のファイルは無し**（`lib/payroll/*` はそのまま利用）。

---

## 7. 更新履歴

| 日付 | 内容 |
|------|------|
| 2026-03-27 | 初版（As-Is / To-Be・確認結果・実装順序） |
| 2026-03-27 | セクション 6 追加（不要ファイルなし）。As-Is 表注・チェックリスト文言を現状に合わせて更新 |
