# changeSpec: 保守運用向けエラーログ拡張（Functions）

## 1. 変更目的

- Cloud Functions の保守運用向けログを、**確定済みの差分仕様**（`エラーログ拡張仕様書_差分実装版.md`）に沿って **実コードへ反映**する。
- モニタアプリ側で横断的に使えるよう、`errorSource` / `service` / `function_custom` 時の `errorKey`、および `external_api` 向け判定材料を **`logOpsError` 経由の 1 行ログ**に載せる。
- **`failureType` の完全削除は本 changeSpec のスコープ外**（仕様上は廃止方向・段階的に除去。差分仕様 §5.5）。**新規追加・新規参照はしない。** 既存の `functionEntry` / `context` の意味づけを壊さず、**1 失敗 = 1 `logger.error` 行**の方針を維持する。

---

## 2. 実装スコープ

仕様書 **§17 今回の実装項目候補**の全体。具体的には次を含む。

| # | 項目 |
|---|------|
| 1 | `logOpsError` のインターフェース拡張（payload 直下項目の追加） |
| 2 | `errorSource` の導入と出力 |
| 3 | `service` の導出と出力（**正は** `functionEntry_service_対応表.md` **への参照**。コード側は実装案 §7・§14） |
| 4 | `external_api` 用材料（`sourceProduct` / `sdkCode` / `httpStatus` / `detailReason`）の付与 |
| 5 | `function_common` 用材料の整理（`cause` / `errorMessage` / `errorName` 等。**`failureType` を中心とした分類は行わない**） |
| 6 | `function_custom` 用 `errorKey` 入口（`FunctionCustomError` 経由） |
| 7 | **`functionEntry` → `service` の対応関係をコードから参照できるようにする**（仕様 §17-7 の「対応表の定義」。**本質は対応表を正とすること**。実装形態は §7 参照） |
| 8 | `function_custom` 対象業務群（会計 / 店舗開閉 / トーナメント）への **実装反映** |
| 9 | 正式 `errorKey` 一覧（確定一覧＋仕様備考）の **コードへの反映** |
| 10 | 対応箇所を **条件分岐 / `throw` / `catch` / `return { success: false }` 単位**で整理し、差分を実装 |
| 11 | `FunctionCustomError` クラスの新設 |
| 12 | custom 対象箇所の **throw ベース統一**（`return { success: false }` 契約は対象外） |
| 13 | **catch 補強**（一次抽出・二次確認済みの 15 候補の最終反映） |

---

## 3. 対象外

仕様書 **§18 今回の実装対象外**に準拠。特に次は本 changeSpec の実装対象に **含めない**。

- モニタアプリ UI・通知仕様
- Functions 側での最終重要度計算、`service` による重要度補正
- 共通分類キーの正式運用・通知閾値
- **給与・勤怠・シフト**等の `function_custom`（今回の業務群は会計 / 店舗開閉 / トーナメントのみ）
- 認証・権限・単純 `invalid-argument`・単純 not-found の **custom 化**
- 外部 API / SDK 失敗そのものを **`function_custom` の `errorKey` で表す**こと（分類は `external_api` 側）
- **`return { success: false, ... }` の I/O 契約変更**（throw への全面移行は行わない）
- 仕様 §4.2 にある **「`success: false` のみの経路への新規 ERROR ログ追加」**を目的とした別ラインの全面追加（※ catch 補強 §13 は「想定外 → `internal`」経路の観測改善であり、本 changeSpec で明示した範囲に限る）
- **`failureType` のコードベース全体からの完全削除**（**後続の専用タスク**。本タスクでは **新規追加・新規参照なし**、変更で触れる箇所では **可能なら除去**）

---

## 4. 前提資料

| 資料 | パス / 役割 |
|------|-------------|
| 差分仕様 | `docs/共通化/flutter/04_仕様書/エラーログ拡張/エラーログ拡張仕様書_差分実装版.md` |
| functionEntry → service | `docs/共通化/flutter/04_仕様書/エラーログ拡張/functionEntry_service_対応表.md`（**正**。推測で service を決めない） |
| catch 一次抽出 | `functions/scripts/auditLogopsCatch.cjs`（`--missing-only --suspect`） |
| 本 changeSpec | `docs/共通化/flutter/05_changeSpec/changeSpec_エラーログ拡張.md`（当ファイル） |

### 4.1 ソースとビルド成果物（`functions/`）

本リポジトリの Cloud Functions は次のとおりである。

- **編集するのは TypeScript（`functions/src/**/*.ts`）のみ**とする。`functions/lib/**/*.js` は **`npm run build`（`package.json` の `tsc`）による生成物**であり、手で編集しない。
- 実行時エントリは `functions/package.json` の `"main": "lib/index.js"` に従い、**デプロイ・実行で読み込まれるのは `lib/` 側の `.js`**（例: 現行の `functions/lib/shared/logging/logOpsError.js` は `logOpsError.ts` に対応）。

| 種別 | パス |
|------|------|
| **現行 `logOpsError`（ソース・拡張対象）** | `functions/src/shared/logging/logOpsError.ts` |
| **現行 `logOpsError`（ビルド出力・参照用）** | `functions/lib/shared/logging/logOpsError.js` |
| **`FunctionCustomError`（新規・案）** | ソース: `functions/src/shared/logging/functionCustomError.ts` → ビルド出力: `functions/lib/shared/logging/functionCustomError.js`（`logOpsError` と同じ `shared/logging` 配下・ファイル名は先頭小文字の camelCase に合わせる） |

本 changeSpec でパスを示すときは **原則 `functions/src/` のソースパス**を正とする（ドメイン呼び出し側の修正も `src` 上の `.ts`）。

---

## 5. 確定済み仕様の要約

- **errorSource**: `external_api` | `function_common` | `function_custom`（判定順は差分仕様 §7.1）。
- **errorKey**: `function_custom` のときのみ明示付与。それ以外は未設定でよい。
- **専用エラー型**: `FunctionCustomError`（`Error` 継承）。必須: `errorKey`, `message`。任意: `context`, `cause`。**ログ文脈用フィールド（`service` / `functionEntry` 等）は持たない。**
- **custom 実装**: 対象箇所は原則 `FunctionCustomError` を `throw`。業務エラーとして custom に載せると確定した既存 `HttpsError` のみ置換。想定内 `HttpsError`（`unauthenticated` / `invalid-argument` / `permission-denied` 等）は維持。
- **`return { success: false, ... }`**: 今回の **throw ベース custom 統一の対象外**（契約維持）。
- **payload 直下・主軸**（差分仕様 §8.5 / §14）:  
  **`errorSource`**, **`service`**, `functionEntry`, `operation`, `projectId`, `errorMessage`, `errorName`, `context`, **`errorKey`**（custom のみ）, **`sourceProduct`**, **`sdkCode`**, **`httpStatus`**, **`detailReason`**。  
  **`failureType`** は As-Is 互換で残り得るが**主軸ではない**・本タスクでは**新規に渡さない**（差分仕様 §5.5・§8.6）。  
  省略可能条件は確定仕様どおり（`errorKey` は custom のみ、external 4項目は `external_api` のみ・取得分のみ）。
- **正式 errorKey 一覧**: 会計 / 店舗開閉 / トーナメントの確定一覧（`ACCOUNTING_ACTIVE_STAY_CONFLICT`, `STORE_PROCESSING_KIND_MISMATCH` を含む）を正とする。

---

## 6. 実装方針

1. **単一のログ出口**は引き続き `logOpsError` → `logger.error` 1 回。新規の別ログ関数は増やさない。
2. **拡張フィールド**は `LogOpsErrorArgs` に追加し、`logOpsError` 内で payload 直下へマージする。既存呼び出しは **省略時は従来どおり動く**ようデフォルト（例: `errorSource` 未指定時は共通処理で決定）を定義する。
3. **`function_custom`**: `FunctionCustomError` を投げたうえで、**§7.2** のとおり **callable / trigger 境界**で `logOpsError` 後に `HttpsError` へ変換する。
4. **`external_api`**: 既存の外部 SDK / HTTP 失敗の `catch` で、`cause` の shape から §9–§10 の材料を抽出できるよう、**補助指定**（少なくとも `sourceProduct` の補助）と **共通の正規化関数**を用意する（配置は **§7.1**）。
5. **`function_common`**: `FunctionCustomError` / `external_api` 判定に当てはまらない通常失敗。`errorSource` は明示またはフォールバックで `function_common`。
6. **対応表**: `service` は **`functionEntry_service_対応表.md`** を唯一の正とし、コード側は **§7** の実装案で参照。**未登録は `unknown_service`**（対応表の方針どおり）。
7. **既存 `logOpsError` の `failureType`**: **§14.2** のとおり（本 changeSpec で変更するファイル内の呼び出しでは削除してよい；未変更ファイルに残るものは今回許容）。

---

## 7. 共通処理の配置方針と責務の固定（初回実装）

**初回実装では次の三点に固定する。** これ以外のパターン（callable 共通ラッパ一括導入等）は **§18 保留**。

### 7.1 共通処理（`logOpsError` 側）

| 項目 | 方針 |
|------|------|
| **置き場所** | `functions/src/shared/logging/` 配下に集約（例: `logOpsError.ts` から import する分類用モジュール）。**ファイル名は実装時に決定**（本 changeSpecでは仮名を使わない）。ビルド後は `functions/lib/shared/logging/` に同名の `.js` が出力される（§4.1）。 |
| **責務** | **`errorSource` の最終判定**、**payload 構築**（差分仕様 §14 準拠）、`cause` が `FunctionCustomError` のときの分岐、**`external_api` shape からの材料抽出**（差分仕様 §15.6）。 |
| **`service` 解決** | `functionEntry` 文字列 → **対応表に基づくマップ**。**ログに実際に出す `functionEntry` がキー**（対応表の「export 外」行を含む）。 |
| **既存呼び出し** | 既存の `logOpsError({...})` は、`errorSource` / `service` を省略可能にし、**省略時は `cause` および呼び出し文脈から共通処理が `errorSource` 等を補完**（**`failureType` による補完は行わない**）。 |

### 7.2 `FunctionCustomError` → `HttpsError` 変換の責務（callable / trigger 境界）

| 項目 | 方針 |
|------|------|
| **責務の位置** | **`each` `onCall` / `onRequest` / トリガハンドラの上位 `catch`**（またはその直下で呼ぶ **薄い** ドメイン固有ヘルパ）。**共通処理（分類ロジック本体）はここに置かない。** |
| **流れ** | `catch` で `instanceof FunctionCustomError` を検知 → **`logOpsError`**（`errorSource: function_custom`, `errorKey` 等を渡す）→ **続けて** クライアント向け **`HttpsError`** に変換して throw（またはトリガ相当の扱い）。 |
| **禁止** | 分類の「最終判定の脳」を各 callable に複製しない。**判定ルールは `logOpsError` 呼び出し前に渡す材料と `logOpsError` 内部に集約**。 |

### 7.3 Callable 共通ラッパ

| 項目 | 方針 |
|------|------|
| **初回** | **導入しない（保留）**。`onCall` 全件ラップは Firebase v2 との整合・移行コストが読めないため、**§18** に回す。 |

### 7.4 `functionEntry` → `service` をコードで参照する実装案（**確定ではない**）

- **仕様上の本質**: 対応表を **正**として参照すること。
- **実装案（一例）**: 対応表の主表＋ export 外を、**単一の TypeScript 定数マップ**（例: `Record<string, ServiceId>`）として `shared/logging` 近傍に置く。
- **ファイル名・モジュール分割**は **未確定**（`serviceByFunctionEntry.ts` 等の名称は **便宜上の呼び方にすぎず、確定名ではない**）。実装 PR で決定する。
- **運用**: 対応表を更新したら **同じ PR でマップを更新**する（本 changeSpec §14.4）。

---

## 8. `FunctionCustomError` 導入方針

| 項目 | 内容 |
|------|------|
| **ファイル（ソース）** | 新規 `functions/src/shared/logging/functionCustomError.ts`（`logOpsError.ts` と同一ディレクトリ。クラス名 `FunctionCustomError` と揃えた **camelCase ファイル名**）。ビルド出力は `functions/lib/shared/logging/functionCustomError.js`（§4.1）。 |
| **定義** | `export class FunctionCustomError extends Error`。`readonly errorKey: string`、`message`、`context?`、`cause?`。仕様 §12.6 準拠。 |
| **利用** | 会計 / 店舗開閉 / トーナメントの **custom 確定箇所**のみで `throw`（ドメイン側は `functions/src/domains/**` の各 `.ts`）。 |
| **境界** | **`HttpsError` への変換は §7.2 に従い callable / trigger 境界のみ**（共通ラッパに依存しない）。 |

---

## 9. `logOpsError` 拡張方針（payload 構造の固定）

**次の 4 点は実装でブレないように強制する。**

| ルール | 内容 |
|--------|------|
| **① `context` はネストのまま維持** | 既存どおり、`context` は **1 オブジェクト**として `payload.context`（または仕様で定義したキー）に載せる。**補助情報（`reason`, `phase`, ID 等）はこのオブジェクト内**（差分仕様 §14.3）。 |
| **② 新規の共通項目は payload 直下** | `errorSource`, `service`, `errorKey`, `sourceProduct`, `sdkCode`, `httpStatus`, `detailReason` および既存の `functionEntry`, `operation`, `projectId`, `errorMessage`, `errorName` 等は **payload 直下**（差分仕様 §14.1・§8.5）。As-Is の `failureType` は互換で残り得るが **本タスクで新規に追加しない**。 |
| **③ 既存 `context` の中身をフラット展開しない** | 後方互換のため、**従来 `context` に入っていたキーを payload 直下に繰り上げない**（新規集計軸として昇格させる場合は別 change で扱う）。 |
| **④ 型** | `LogOpsErrorArgs` に任意フィールドとして追加: `errorSource?`, `service?`, `errorKey?`, `sourceProduct?`, `sdkCode?`, `httpStatus?`, `detailReason?`。 |

| 項目 | 内容 |
|------|------|
| **`cause` が `FunctionCustomError` の場合** | `errorSource = function_custom`、`errorKey` は例外から、`errorMessage` は `message` を優先（§7.1 の共通処理で統一）。 |
| **後方互換** | 既存の数百箇所の呼び出しを一括で書き換えず、**未指定フィールドは §7.1 の共通処理で埋める**。 |

---

## 10. `errorSource` / `service` / external 項目の配線方針

| 分類 | 配線 |
|------|------|
| **service** | 必ず `functionEntry` から **対応表由来のマップ**（§7.4）。呼び出し側で service 文字列を直書きしない（新規分は **対応表に先に追記**）。 |
| **errorSource** | 優先: (1) `FunctionCustomError` → `function_custom`、(2) external shape 判定 → `external_api`、(3) それ以外 → `function_common`（差分仕様 §7 の順序に従う実装）。**判定の実装場所は §7.1**。 |
| **external_api** | LINE / Cloud Tasks / Secret Manager 等。4 項目は **取得できたもののみ**。 |
| **httpStatus** | 数値または文字列で Cloud Logging 上区別しやすい形に正規化（型は実装で固定）。 |

---

## 11. custom 対象箇所の反映方針

- **対象業務群**: 会計、店舗開閉、トーナメント（`service` は対応表のとおり `accounting` / `store` / `close_process` / `tournament` / `tournament_schedule` 等）。
- **作業手順**（仕様 §16.4 / §16.8）:
  1. 対象ドメインの **条件分岐・`throw`・業務 return** を棚卸し（**関数単位で終わらせない**）。
  2. 正式 `errorKey` に **統合**（仕様 §16.7）。
  3. custom にすべき箇所のみ `FunctionCustomError` に差し替え、**§7.2** で `logOpsError` + `HttpsError`。
- **`return { success: false }`**: **今回は throw 化しない**。ログが必要な場合は **別タスク**。

---

## 12. 正式 errorKey と対応箇所のマッピング方針（本文に代表例を載せる）

- **正**: 確定 errorKey 一覧 + 差分仕様 §16.7 の統合ルール。
- **別添の全表**（ファイルパス × 行 × 分岐 × key）は **実装と並走して埋める**が、**「後でマッピング表を作る」だけで終われないよう**、本 changeSpec 本文に **業務群ごとの代表ファイル・代表分岐**を示す。

### 12.1 会計（代表）

| 代表ファイル（`functions/src/` から） | 代表分岐（例） | 割り当て errorKey の例 |
|----------------------------------------|----------------|-------------------------|
| `domains/bills/repos/startAccounting.ts` | 既に会計開始済み（`accountingStartedAt` 等） | `ACCOUNTING_ALREADY_STARTED` |
| `domains/bills/repos/appendItem.ts` | idempotency / リクエスト整合と結果の不一致 | `ACCOUNTING_IDEMPOTENCY_MISMATCH` |
| `domains/bills/repos/createBillWithActiveStay.ts` | **既に active stay が存在する競合**、**重複入店に相当する active stay 競合**（広い「bill 状態不整合」には拡張しない） | `ACCOUNTING_ACTIVE_STAY_CONFLICT`（確定一覧・独立キーの意味を狭く保つ） |
| `domains/bills/callables/accounting.ts` | 会計フロー上の状態不正 | `ACCOUNTING_INVALID_STATE` 等（詳細は §16.7 統合ルール） |

※ **全分岐の網羅は別添マッピング表で管理**。上記は **着手点の固定**。

### 12.2 店舗開閉（代表）

| 代表ファイル | 代表分岐（例） | 割り当て errorKey の例 |
|--------------|----------------|-------------------------|
| `domains/storeMeta/repos/getCurrentBusinessDateKeyOrThrow.ts` | **状態 doc 不存在** | `STORE_STATE_DOC_MISSING` |
| 同上 | **営業日を解決できない**（`running` でない・`currentBusinessDateKey` 不適切等） | `STORE_BUSINESS_DATE_UNAVAILABLE` |
| 同上 | **その他の状態不正**（§16.7 の統合ルールに従い細部は `context`） | `STORE_INVALID_STATE` |
| `domains/storeMeta/services/processingLease.ts`（`acquireProcessing`） | 有効 lease 競合・runId 不一致 | `STORE_PROCESSING_LEASE_CONFLICT` |
| `domains/storeMeta/services/processingLease.ts` | `processing.kind` と要求 kind の不一致 | `STORE_PROCESSING_KIND_MISMATCH`（確定一覧） |
| `domains/storeMeta/callables/openStore.ts` / `closeStore.ts` | status 前提不満足 | `STORE_NOT_RUNNING` / `STORE_INVALID_STATE` 等 |

### 12.3 トーナメント（代表）

| 代表ファイル | 代表分岐（例） | 割り当て errorKey の例 |
|--------------|----------------|-------------------------|
| `domains/tournament_activeTournament/callables/addon.ts` | addon 不許可・重複 addon | `TOURNAMENT_ADDON_NOT_ALLOWED`, `TOURNAMENT_ADDON_ALREADY_DONE` |
| `domains/tournament_activeTournament/callables/registerForTournament.ts` | 終了済み・未登録状態 | `TOURNAMENT_ALREADY_ENDED`, `TOURNAMENT_NOT_REGISTERED` |
| `domains/tournament_createTournament/services/enqueueTournamentTasksCore.ts` | スケジュール・営業日不整合 | `TOURNAMENT_SCHEDULE_NO_BUSINESS_DAY`, `TOURNAMENT_SCHEDULE_AMBIGUOUS`（export 外 `functionEntry` は対応表 §export 外を参照） |

### 12.4 マッピング表の運用

- **同一意味の重複キー禁止**（§16.4）。差分は `context.reason`。
- 行単位の完全固定は **別添**で継続更新する。§12.1–12.3 の代表例は **最低限 changeSpec 本文で固定する着手点**であり、**実装レビュー時の確認起点**とする（網羅の最終形は別添に委ねる）。

---

## 13. 15 件の catch 補強方針（フィールド指示付き）

**前提**: 一次抽出（`auditLogopsCatch.cjs --missing-only --suspect`）と二次確認済み。**想定内 `HttpsError` には新規 `logOpsError` を付けない**。**二重ログ禁止**（`placeOrderByUser` の `appendItem` 経路）。

**`functionEntry`**: いずれも **対応表の export 名**（§4 の対応表）。**`service`**: 対応表の列に従い、実装ではマップ解決（§7.4）。

**分類の判断軸**は **`errorSource`（および `external_api` 時の `sourceProduct` 等）** とする。**`failureType` は本表では扱わない**（新規に渡さない。差分仕様 §5.5）。

| # | 判定 | file | line | `functionEntry` | `operation`（例） | `errorSource`（想定） | `sourceProduct` 補助 |
|---|------|------|------|-----------------|---------------------|----------------------|----------------------|
| 1 | 追加推奨 | `domains/bills/callables/getBillPreviewTotals.ts` | 173 | `getBillPreviewTotals` | `previewTotalsCatch` | `function_common` | なし |
| 2 | 条件付き | `domains/itemOrder/callables/placeOrderByUser.ts` | 176 | `placeOrderByUser` | `placeOrderCatch` | `function_common` | なし（**非 `HttpsError` のみ**ログ。`HttpsError` は再throw のみ） |
| 3 | 追加推奨 | `domains/storeMeta/callables/closeStoreTerminal.ts` | 79 | `closeStoreTerminal` | `acquireProcessingClose` | `function_common` | なし |
| 4 | 追加推奨 | `domains/storeMeta/callables/continueBusinessTerminal.ts` | 149 | `continueBusinessTerminal` | `cloudTasksCreateTask` | **`external_api`**（Cloud Tasks `createTask` 失敗） | **`cloud_tasks` を補助指定（推奨）** |
| 5 | 追加推奨 | `domains/storeMeta/callables/createInitialStateDocCallable.ts` | 47 | `createInitialStateDocCallable` | `createInitialStateDoc` | `function_common` | なし |
| 6 | 追加推奨 | `domains/storeMeta/callables/initializeStoreConfigCallable.ts` | 143 | `initializeStoreConfigCallable` | `initStoreMetaConfig` | `function_common` | なし |
| 7 | 追加推奨 | `domains/storeMeta/callables/openStoreTerminal.ts` | 63 | `openStoreTerminal` | `acquireProcessingOpen` | `function_common` | なし |
| 8 | 追加推奨 | `domains/storeMeta/callables/updateUnclockedAttendanceWithAuth.ts` | 121 | `updateUnclockedAttendanceWithAuth` | `passwordClockOutUpdate` | `function_common` | なし |
| 9 | 保留 | `domains/storeMeta/services/applyCloseSnapshot.ts` | 189 | `applyCloseSnapshot` | — | — | **ログ追加は必須としない**（内側 `getCurrentBusinessDateKeyOrThrow` で既に `logOpsError` 済みのため） |
| 10 | 追加推奨 | `domains/storeMeta/services/getCloseIntegrityData.ts` | 48 | `getCloseIntegrityData` | `closeIntegrityAggregate` | `function_common` | なし |
| 11 | 追加推奨 | `domains/storeMeta/services/getUnclockedStaffForClose.ts` | 57 | `getUnclockedStaffForClose` | `unclockedStaffQuery` | `function_common` | なし |
| 12 | 追加推奨 | `domains/storeMeta/services/getUnclosedTournamentsForClose.ts` | 174 | `getUnclosedTournamentsForClose` | `unclosedTournamentsQuery` | `function_common` | なし |
| 13 | 追加推奨 | `domains/storeMeta/services/getUnsettledBillsForClose.ts` | 93 | `getUnsettledBillsForClose` | `unsettledBillsQuery` | `function_common` | なし |
| 14 | 追加推奨 | `shared/devices/callables/updateDeviceOptions.ts` | 89 | `updateDeviceOptions` | `updateDeviceOptionsCatch` | `function_common` | なし |
| 15 | 追加推奨 | `shared/devices/callables/updateDeviceRole.ts` | 61 | `updateDeviceRole` | `updateDeviceRoleCatch` | `function_common` | なし |

**注（#4 Cloud Tasks）**  
Cloud Tasks `createTask` 失敗は **`errorSource = external_api`** とし、**`sourceProduct` に `cloud_tasks` を補助指定**する。

**別件（15 件以外）**: `applyCloseSnapshotCore` 内の `console.warn` は §18 保留。

---

## 14. 変更対象ファイル一覧（カテゴリ別）

### 14.1 必須（共通基盤）

| パス | 理由 |
|------|------|
| `functions/src/shared/logging/logOpsError.ts` | 引数・payload 拡張、§9 のルール適用（ビルド出力: `functions/lib/shared/logging/logOpsError.js`） |
| `functions/src/shared/logging/functionCustomError.ts`（新規） | 専用エラー型（ビルド出力: `functions/lib/shared/logging/functionCustomError.js`） |
| **対応表マップ（新規・ファイル名未確定）** | `functionEntry_service_対応表.md` を **コードから参照**するためのマップ（§7.4）。**`serviceByFunctionEntry.ts` 等は実装案の俗称にすぎない** |
| **分類・payload 補助（新規・ファイル名未確定）** | `errorSource` / external 材料の正規化（§7.1） |

### 14.2 呼び出し側（既存 `logOpsError` 呼び出しの段階的更新）

本 changeSpec で**変更するファイル**内の既存 `logOpsError` 呼び出しでは、**`failureType` を削除してよい**。**未変更のファイル**に残る `failureType` は今回そのまま許容する（コードベース全体からの除去は後続タスク）。

- **全会計系**: `functions/src/domains/bills/**`
- **店舗開閉・close_process**: `functions/src/domains/storeMeta/**` の該当 callable / service
- **トーナメント**: `functions/src/domains/tournament_activeTournament/**`, `functions/src/domains/tournament_createTournament/**`
- **外部 API 多め**: `functions/src/domains/webhook/**`, `functions/src/shared/secrets/**`（必要に応じて）

### 14.3 §13 の catch 補強（明示ファイル）

- `functions/src/domains/bills/callables/getBillPreviewTotals.ts`
- `functions/src/domains/itemOrder/callables/placeOrderByUser.ts`
- `functions/src/domains/storeMeta/callables/closeStoreTerminal.ts`
- `functions/src/domains/storeMeta/callables/continueBusinessTerminal.ts`
- `functions/src/domains/storeMeta/callables/createInitialStateDocCallable.ts`
- `functions/src/domains/storeMeta/callables/initializeStoreConfigCallable.ts`
- `functions/src/domains/storeMeta/callables/openStoreTerminal.ts`
- `functions/src/domains/storeMeta/callables/updateUnclockedAttendanceWithAuth.ts`
- `functions/src/domains/storeMeta/services/applyCloseSnapshot.ts`（保留方針）
- `functions/src/domains/storeMeta/services/getCloseIntegrityData.ts`
- `functions/src/domains/storeMeta/services/getUnclockedStaffForClose.ts`
- `functions/src/domains/storeMeta/services/getUnclosedTournamentsForClose.ts`
- `functions/src/domains/storeMeta/services/getUnsettledBillsForClose.ts`
- `functions/src/shared/devices/callables/updateDeviceOptions.ts`
- `functions/src/shared/devices/callables/updateDeviceRole.ts`

### 14.4 ドキュメント

| パス | 理由 |
|------|------|
| `docs/共通化/flutter/04_仕様書/エラーログ拡張/functionEntry_service_対応表.md` | 新規 export / 新規 `functionEntry` の追記（正の維持） |
| （任意）`errorKey` マッピング表 MD | §12 の別添全行 |

---

## 15. ファイル別変更内容（要約）

| ファイル / 領域 | 変更内容 |
|-----------------|----------|
| `functions/src/shared/logging/logOpsError.ts` | `LogOpsErrorArgs` 拡張、§9 の payload ルール、分類モジュール呼び出し |
| `functions/src/shared/logging/functionCustomError.ts` | クラス定義（新規） |
| 対応表マップ（名称未確定） | 対応表の機械可読コピー、未登録時 `unknown_service` |
| 分類モジュール（名称未確定） | `external_api` shape、`function_common` フォールバック |
| `domains/bills/**` | `FunctionCustomError` 化・§7.2、既存 `logOpsError` に拡張フィールド |
| `domains/storeMeta/**` | 同上 + §13 |
| `domains/tournament_**/**` | 同上（`return { success: false }` は触らない） |
| `webhook/**` | `external_api` 材料の抽出強化 |
| §13 各ファイル | §13 の表に従い `logOpsError` を挿入（**continueBusinessTerminal** は `errorSource = external_api`・`sourceProduct = cloud_tasks` 補助。**`failureType` は渡さない**） |

---

## 16. 検証観点

仕様 **§19** に加え、次を確認する。

- **`errorSource`** が主軸どおり出力されている
- **`service` が対応表と一致**（未登録が連続しない）
- **`function_custom` のときのみ `errorKey` が出る**
- **`external_api` 経路**で `sourceProduct` / `sdkCode` / `httpStatus` / `detailReason` 等が仕様どおり（取得分）
- **§9**: `context` がネストのまま、新規項目が payload 直下、**フラット展開していない**
- **`functionEntry` / `context` の意味づけが意図せず壊れていない**
- **`FunctionCustomError` の境界変換**（§7.2）が仕様どおり
- **ERROR 行数が意図せず増えていない**（二重ログなし）
- `cd functions && npm run build`（`tsc`）成功
- （任意）`npm run audit:logops-catch:suspect` で suspect 件数が期待どおり減少

※ **`failureType` の有無・値の検証は主軸としない**（廃止方向・後続専用タスク）。

---

## 17. 完了条件

1. `logOpsError` が **仕様どおりの payload 直下**を出力でき、**§9 の 4 ルール**を満たす。
2. **`errorSource` / `service`** が、少なくとも **新規・変更した経路**で一貫して出る。
3. **会計 / 店舗開閉 / トーナメント**の **custom 対象箇所**に `FunctionCustomError` と正式 `errorKey` が反映されている（§12 の別添で追跡可能）。
4. **§13 の catch 補強**が表どおり反映されている（保留は文書化）。
5. **対応表**にない `functionEntry` が本番ログに出ていない、または出た場合は **対応表更新 + マップ更新**がセットになっている。

---

## 18. 未対応・保留事項

| 項目 | 内容 |
|------|------|
| **`applyCloseSnapshot` L189** | ログ追加は **必須としない**（§13）。 |
| **`applyCloseSnapshotCore` の `console.warn`** | `logOpsError` 化は **別判断**（15 件 suspect 外）。 |
| **Callable 共通ラッパ** | **初回は導入しない**（§7.3）。全 `onCall` 一括は **保留**。 |
| **対応表マップのファイル名・モジュール分割** | **実装 PR で確定**（§7.4）。 |
| **既存 `logOpsError` 全箇所への拡張フィールド一括付与** | 初回は **変更箇所優先**可。全面は **フォロータスク**。 |
| **errorKey マッピング表の全行** | §12.1–12.3 を起点に **別添で継続更新**。 |
| **`failureType` の完全削除** | **本 changeSpec の対象外**。仕様上は廃止方向。**新規追加・新規参照はしない。** 触れる箇所では可能なら除去。**コードベース全面からの削除は後続専用タスク**（差分仕様 §5.5・§18-14）。 |

---

## 19. 実装順の推奨

1. **`FunctionCustomError` + `logOpsError` 拡張（§9）+ 対応表マップ（§7.4）+ 分類モジュール（§7.1）**（ビルド通過・既存挙動維持）。
2. **1 ドメイン試行**（例: 店舗 `processing` または会計 1 ファイル）で **custom + §7.2 の境界パターン**を確定。
3. **3 業務群へ横展開**（§12 別添を更新）。
4. **`external_api` 材料**の正規化を webhook 等に適用。
5. **§13 catch 補強**（二重ログに注意、**continueBusinessTerminal** は `errorSource = external_api`・`sourceProduct = cloud_tasks`。**新規の `logOpsError` には `failureType` を渡さない**）。
6. **対応表・マップ・changeSpec を同期**（未登録 `functionEntry` ゼロを目標）。

---

## 改訂履歴

| 日付 | 内容 |
|------|------|
| 2026-04-06 | 初版（差分仕様 §17 全体スコープ・対応表正・15 件二次確認反映） |
| 2026-04-06 | 改訂：対応表「コード取り込み」表現の緩和、§9 payload 明確化、§7 責務固定、§12 代表例、§13 フィールド指示、§14 ファイル名の位置づけ |
| 2026-04-06 | 改訂：§12.1 `ACCOUNTING_ACTIVE_STAY_CONFLICT` 説明の限定、§12.2 `getCurrentBusinessDateKeyOrThrow` の key 整理、§13 `failureType` の断定緩和・#4 の `errorSource`/`failureType` 分離、§12.4 表現の弱体化 |
| 2026-04-06 | 改訂：`failureType` を仕様上廃止方向・実装は段階廃止と明記（差分仕様 §5.5 等）。本 changeSpec から **完全削除タスクを対象外**とする。payload / 共通処理 / §13 表 / 検証観点を **`errorSource` 等主軸**に整理。§13 から `failureType` 列を削除 |
| 2026-04-06 | 改訂：差分仕様 §14.1 の主軸と `failureType`（互換）の記述を分離。§6 項目 7・§14.2 に既存呼び出しの `failureType` 削除可否を追記 |
| 2026-03-28 | 改訂：**§4.1** に `src`（編集）と `lib`（`tsc` 生成）の対応を追記。`logOpsError` / 新規 `FunctionCustomError` のパスを現行構成に合わせ、`functionCustomError.ts`（ソース）と `functionCustomError.js`（ビルド出力）を明記 |
| 2026-03-28 | 改訂：前提資料・§14.4 のパスを **`04_仕様書/エラーログ拡張/`** 配下に更新（フォルダ再配置に伴う） |
| 2026-03-28 | 改訂：本ファイルを **`05_changeSpec/changeSpec_エラーログ拡張.md`** に移動（ローディング表示の changeSpec と同階層） |
