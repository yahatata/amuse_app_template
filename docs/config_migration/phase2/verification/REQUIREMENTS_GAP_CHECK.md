# Phase2 実装漏れ確認結果（Task 2② 成果物）

作成日: 2026-03-06  
参照元: PHASE2_REQUIREMENTS_LIST.md, PHASE2_ID_REQUIREMENTS_CHECKLIST.md, ALL_ID_STATUS.md, README.md, 実コード

---

## 本ドキュメントの目的

Task 1 で作成した要件一覧（PHASE2_REQUIREMENTS_LIST.md）と、Task 2① で作成した ID ごとのチェックリスト（PHASE2_ID_REQUIREMENTS_CHECKLIST.md）を、実際の実装（コード・ドキュメント）と照合し、**実装が漏れているもの・漏れている可能性があるもの**をまとめる。

---

## 確認方法

| 確認対象 | 確認方法 |
|----------|----------|
| configLoader.ts / defaults.ts / types.ts | ファイル全文を確認 |
| store_config_service.dart / store_config_defaults.dart | ファイル全文を確認 |
| globalConstant.dart | ファイル全文を確認（削除対象・残存対象の照合） |
| 旧参照 12 ファイル（styles.ts, paymentSplitCalculator.ts 等） | キーワード検索で旧ハードコード残存を確認 |
| public/staff/config.js | ファイル全文を確認 |
| tobe_config_architecture.md | 読み取り優先度セクションを確認 |
| phase2/ 内全ドキュメント | 取得失敗時の挙動・切り戻し手順の記録有無を確認 |

---

## 1. 実装完了が確認できた項目

### 1-1. Functions コア基盤（configLoader / defaults / types）

| 確認項目 | 結果 |
|----------|------|
| `getStoreConfig()` が storeMeta/config → defaults.ts の優先度で読み取る | ✅ 実装済み |
| `config_fallback` warn ログ（未存在時） | ✅ 実装済み |
| `config_read_error` error ログ（読み取り失敗時） | ✅ 実装済み |
| 構造化ログ形式 | ✅ 実装済み |
| リトライ後に throw（MAX_RETRIES=2） | ✅ 実装済み |
| `buildFromDefaults()` が全フィールドを網羅 | ✅ 実装済み |
| `mergeWithDefaults()` がフィールド単位でバリデーション+フォールバック | ✅ 実装済み |
| types.ts に全 8 ドメインの型定義 | ✅ 実装済み |
| defaults.ts に全フィールドのデフォルト値 | ✅ 実装済み |

### 1-2. Flutter 基盤（StoreConfigService）

| 確認項目 | 結果 |
|----------|------|
| storeMeta/config を snapshot で購読 | ✅ 実装済み |
| 未存在時に defaults にフォールバック | ✅ 実装済み |
| 読み取り失敗時に最後の成功値を維持 | ✅ 実装済み |
| store_config_defaults.dart に全フィールドのデフォルト値 | ✅ 実装済み |

### 1-3. 旧参照の差し替え（Functions 12 ファイル）

| ファイル | 旧参照 | 差し替え済み |
|----------|--------|-------------|
| styles.ts | BUSINESS_HOURS_STYLES 定数 | ✅ → getStoreConfig() |
| paymentSplitCalculator.ts | SIDE_GAME_CHIP_EXCHANGE_RATE 等 | ✅ → defaults.ts import + 引数渡し |
| accounting.ts | SIDE_GAME_CHIP_EXCHANGE_RATE | ✅ → getStoreConfig() |
| getBillPreviewTotals.ts | SIDE_GAME_CHIP_EXCHANGE_RATE | ✅ → getStoreConfig() |
| snapshots.ts | SIDE_GAME_CHIP_EXCHANGE_RATE | ✅ → getStoreConfig() 経由 |
| verifyPaymentSplit.ts | DEFAULT_POINT_PRIORITY | ✅ → getStoreConfig() |
| finalizeDay.ts | getRequiredStaffByTimeSlot ローカル | ✅ → getStoreConfig() |
| helpers.ts | ハードコード配列 | ✅ → getStoreConfig() / 引数渡し |
| weeklyPlanner.ts | process.env 3 箇所 | ✅ → getStoreConfig() |
| calcBusinessDateHelpers.ts | `return 70` | ✅ → getStoreConfig() |
| lineWebhook.ts | defineString("LINE_PLAN") | ✅ → getStoreConfig() |
| confirmShiftRequest.ts | defineString LINE_PLAN | ✅ → getStoreConfig() |

### 1-4. globalConstant.dart クリーンアップ

| 確認項目 | 結果 |
|----------|------|
| Phase2 移行対象の全定数が削除されている | ✅ |
| Phase4 / 非 config 定数が残っている | ✅ |

### 1-5. Web（config.js）

| 確認項目 | 結果 |
|----------|------|
| linePlan の Firestore 読み取り関数 `loadLinePlanFromFirestore()` が追加 | ✅ |
| isShiftRequestEnabled が linePlan に依存する関数形式 | ✅ |

### 1-6. 状態記録

| 確認項目 | 結果 |
|----------|------|
| ALL_ID_STATUS で全 ID に状態が付与されている | ✅ |
| CHANGE_LOG に Phase2 エントリ（CM-Phase2-001）が存在 | ✅ |
| Gate-4 通過の記載あり（tsc --noEmit パス、flutter analyze エラー 0） | ✅ |

---

## 2. 実装が漏れている項目（確定）

以下は、要件として明記されているが実装（ドキュメント記録を含む）が存在しないことが確認できた項目。

### 2-1. 各 ID の取得失敗時の挙動設計が未記録

**要件**: PHASE2_REQUIREMENTS_LIST.md §C ステップ 4、PHASE1_ROLLBACK §2.2  
**内容**: 各 ID について「storeMeta/config の取得に失敗した場合の挙動」を設計し記録する

**現状**:
- configLoader.ts の**実装レベル**では、全フィールドについて「未存在時・読み取り失敗時いずれも defaults にフォールバック」（D-0020）という**統一的な挙動**が実装されている
- 各 ID の per_id ファイルに「本設定も当該方針に従う」旨を記録する必要がある（D-05 は記録済み、他 ID は Task 4 で追記）

**影響度**: 中（実装自体は安全側に倒れているが、設計記録がないため運用時に判断根拠が不足する）

---

### 2-2. 各 ID の切り戻し手順が未記録

**要件**: PHASE2_REQUIREMENTS_LIST.md §C ステップ 5、PHASE1_ROLLBACK §2.2  
**内容**: 各 ID について「問題発生時の切り戻し手順」を記録する

**現状**:
- CHANGE_LOG には「コードデプロイで差し替え前状態へ戻す。旧 fallback は維持しない（D-0015）」という**一括方針**のみ
- ID ごとに「この設定に問題があった場合の具体的な切り戻し手順」を記録したドキュメントが**存在しない**

**影響度**: 中（未リリースアプリのため緊急性は低いが、運用開始後に必要になる）

---

### 2-3. tobe_config_architecture.md の読み取り優先度に不整合

**要件**: PHASE2_REQUIREMENTS_LIST.md §D-7「tobe_config_architecture の読み取り優先度を ①→② のみに更新」

**現状**:
- §8「読み取り優先度」セクション: ①→② のみと記載し、「③ は Phase2 で削除済み」と注記 → ✅ 正しい
- §8「欠損時挙動」セクション: ①→② でフォールバックと記載（未存在時・読み取り失敗時いずれも。D-0020 反映）→ ✅ 対応済み

**影響度**: 低（ドキュメント内の記述不整合。対応済み）

---

## 3. 実装漏れの可能性がある項目（要調査）

以下は、テスト失敗分析やコード確認の過程で検出された、実装に問題がある可能性がある項目。Task 4 で詳細調査が必要。

### 3-1. Firestore への undefined 書き込み（営業日関連）

**関連 ID**: CALC_BUFFER（営業日取得全般）  
**検出元**: VERIFICATION_TASK_ORDER.md「テスト側に問題があると断定できない項目」§1

**現象**: `postEventRefund.spec.ts` 等で `eventBusinessDate` が undefined、`cancel_restore_startAt.spec.ts` で `businessDate` が undefined として Firestore に書き込まれエラーになる

**懸念**:
- `calcBusinessDate()` が async 化された際、呼び出し元で `await` が漏れている or 戻り値の展開（`.businessDate` プロパティへのアクセス）が不適切な箇所がある可能性
- 営業日が取得できなかった場合に undefined のまま Firestore write される可能性

**Task 4 での確認観点**: `calcBusinessDate()` の全呼び出し箇所で `await` が正しくされているか、戻り値 `BusinessDateResult` の `.businessDate` を適切に参照しているか

---

### 3-2. applyCloseSnapshot の結果が空

**関連 ID**: CALC_BUFFER / 営業日関連  
**検出元**: VERIFICATION_TASK_ORDER.md「テスト側に問題があると断定できない項目」§2

**現象**: `step3.spec.ts` 等で `result.updatedBillIds` が空配列

**懸念**: Phase2 の営業日取得変更（async 化）が close 処理の内部ロジックと整合しているかどうか不明

**Task 4 での確認観点**: applyCloseSnapshot 内部で営業日を取得する処理が正しく await されているか

---

### 3-3. appendItem のエラーコード変更

**関連 ID**: R-11/R-12（会計）  
**検出元**: VERIFICATION_TASK_ORDER.md「テスト側に問題があると断定できない項目」§3

**現象**: テストが `failed-precondition` を期待するが `invalid-argument` が返る

**懸念**: Phase2 の会計ポリシー config 化に伴い、バリデーション順序やエラーコードが変わった可能性

**Task 4 での確認観点**: status が settled/settling の場合のエラーコードが仕様上どちらが正しいか

---

### 3-4. 集計結果のプロパティ参照エラー（aggregator）

**関連 ID**: R-11/R-12（会計）  
**検出元**: VERIFICATION_TASK_ORDER.md「テスト側に問題があると断定できない項目」§4

**現象**: `aggregator.spec.ts` で `grossIncl` プロパティが undefined

**懸念**: 集計結果の構造が Phase2 変更で変わった可能性

**Task 4 での確認観点**: 集計結果オブジェクトの構造が期待どおりか

---

### 3-5. public/staff/config.js の `loadLinePlanFromFirestore()` 呼び出し

**関連 ID**: D-04（linePlan Web）

**現状**: `loadLinePlanFromFirestore()` 関数は定義されているが、この関数が Firebase 初期化後に**呼び出されているかどうか**は config.js 内では確認できない（呼び出し元の HTML/JS ファイルの調査が必要）

**懸念**: 関数が定義されているだけで呼ばれていない場合、常にデフォルト値（`"communication"`）が使われる

**Task 4 での確認観点**: `loadLinePlanFromFirestore` を呼び出している箇所が存在するか

---

## 4. 実装漏れなしと判断した項目

以下の要件は、実装・ドキュメントの両方で充足が確認できた。

| 要件 | 根拠 |
|------|------|
| Z-3: 旧参照の即削除 | 12 ファイルの旧ハードコード削除を確認。globalConstant.dart のクリーンアップ確認 |
| Z-4: defaults.ts 唯一ソース | TS ファイル内の直書きが削除され、defaults.ts のみにデフォルト値が存在 |
| Z-5: ログ仕様 | configLoader.ts に config_fallback / config_read_error が構造化ログで実装 |
| Z-7: ゲート通過 | tsc --noEmit パス、flutter analyze エラー 0 が CHANGE_LOG に記録 |
| A-1〜A-5: 全参照差し替え | 上記 §1-3, 1-4, 1-5 で確認 |
| B: スコープ外 ID の状態記録 | ALL_ID_STATUS で全 ID に状態付与を確認 |

---

## 5. サマリ

### 確定した漏れ（3 件）

| # | 内容 | 影響度 | 対応方針 |
|---|------|--------|----------|
| 2-1 | ID ごとの取得失敗時の挙動設計が未記録 | 中 | Task 4 の各 ID 検証時に設計・記録する |
| 2-2 | ID ごとの切り戻し手順が未記録 | 中 | Task 4 の各 ID 検証時に記録する |
| 2-3 | tobe_config_architecture.md の欠損時挙動に ③ が残っている | 低 | ✅ 対応済み |

### 要調査（5 件）

| # | 内容 | 影響度 | 対応方針 |
|---|------|--------|----------|
| 3-1 | Firestore への undefined 書き込み（営業日） | 高 | Task 4 で calcBusinessDate 呼び出し全箇所を確認 |
| 3-2 | applyCloseSnapshot の結果が空 | 中 | Task 4 で close 処理を確認 |
| 3-3 | appendItem のエラーコード変更 | 低 | Task 4 で仕様を確認 |
| 3-4 | aggregator の構造変更 | 低 | Task 4 で集計結果構造を確認 |
| 3-5 | config.js の loadLinePlanFromFirestore 呼び出し有無 | 中 | Task 4 で呼び出し元を確認 |
