# Phase0A Task6 changeSpec

作成日: 2026-03-04  
対象分類: D-01 / D-12 / D-13  
関連タスク: Task6（実装）, Task7（検証）, Task8（Runbook・Phase3 実施）, Task9（ログ更新）

---

## 1. 目的

Phase0A の実装タスク（Task6）として、以下を同時に達成する。

- D-01: `LINE_CHANNEL_ACCESS_TOKEN` の平文 default を完全撤去する。
- D-12: `QR_SECRET_KEY` の弱い fallback（`default-secret-key`）を撤去する。
- D-13: 本番経路で `default-store` / `default-tenant` が使われる経路を遮断する。
- 併せて、リリース後は env ファイルに依存しない運用（コマンド/コンソール設定）と実装を整合させる。

---

## 2. スコープ

| 種別 | 対象 |
|------|------|
| 修正（Functions） | `functions/src/domains/webhook/callables/lineWebhook.ts` |
| 修正（Functions） | `functions/src/domains/webhook/services/lineMessaging.ts` |
| 修正（Functions） | `functions/src/domains/user/services/qrCodeUtils.ts` |
| 修正（Functions） | `functions/src/domains/tournament_createTournament/callables/createScheduledTournament.ts` |
| 修正（Functions） | `functions/src/domains/tournament_createTournament/callables/createTournamentRecurrence.ts` |
| 修正（Functions） | `functions/src/domains/tournament_createTournament/services/enqueueTournamentTasksCore.ts` |
| 修正（Functions） | `functions/src/domains/tournament_createTournament/services/generateRecurringTournamentsCore.ts` |
| 修正（Flutter） | `lib/tournament/active/tournament_service.dart` |
| 修正（Flutter） | `lib/tournament/scheduling/pages/create_tournament_from_calendar_page.dart` |
| 修正（Flutter） | `lib/tournament/scheduling/pages/scheduled_tournament_list_page.dart` |
| 修正（テスト） | `functions/__tests__/tournament_createTournament/*` を中心に `default-store/default-tenant` fixture を全面見直し |

### 非対象（Task6時点）

- Secret Manager への全面移行（`defineSecret` 化）は本タスクの必須要件ではない。
- Firestore スキーマの大規模再設計は行わない。
- 運用 Runbook 詳細化は Phase3 で実施する（Task8 は Phase3 実施）。

---

## 3. 完了条件（Task6 Done）

- コード上に D-01/D-12 の平文 default / fallback が残っていない。
- 本番経路で `default-store/default-tenant` が生成・伝播・fallback されない。
- Dart 側でも `default-store/default-tenant` の明示送信/暗黙デフォルトが消えている。
- 既存データ影響（旧データに default が残存）の扱いが実装/運用で明文化されている。

---

## 4. 実装方針（共通）

### 4.1 本番判定

Functions 側で共通判定を導入する（新規 helper 推奨）。

- 例: `isProductionRuntime = process.env.FUNCTIONS_EMULATOR !== 'true'`
- 本番判定時のみ「未設定は throw」「default-store/default-tenant はエラー」を適用する。

### 4.2 エラーポリシー

- Security/identity 必須値欠損は `HttpsError('failed-precondition', ...)` を基本とする。
- 既存インターフェースが boolean 戻り値の場合（`sendLinePushMessage` など）は、ログ + `false` で返すか throw へ寄せるかを統一する（Task6内で決定）。

### 4.3 互換

- 互換期間は設けない（既存方針）。
- ただし既存データに default 値が残る可能性があるため、「先にデータ補正」または「本番ガード導入順序調整」を行う。

---

## 5. As-Is / To-Be（ファイル別）

## 5.1 D-01（LINE_CHANNEL_ACCESS_TOKEN）

### A) `lineWebhook.ts`

- As-Is
  - `defineString("LINE_CHANNEL_ACCESS_TOKEN", { default: "<平文>" })`
  - `.value()` で取得
- To-Be
  - LINE トークンの `defineString` 定義を削除
  - `process.env.LINE_CHANNEL_ACCESS_TOKEN` 参照に統一
  - 本番で未設定なら `logger.error` + 500（または throw）で停止

### B) `lineMessaging.ts`

- As-Is
  - `defineString(... default: "<平文>")`
  - `.value()` で取得、欠損時 `return false`
- To-Be
  - LINE トークン `defineString` 定義を削除
  - `process.env.LINE_CHANNEL_ACCESS_TOKEN` 参照
  - 欠損時の挙動を webhook 側と方針統一

---

## 5.2 D-12（QR_SECRET_KEY）

### `qrCodeUtils.ts`

- As-Is
  - `process.env.QR_SECRET_KEY || "default-secret-key"`
- To-Be
  - fallback 削除（`process.env.QR_SECRET_KEY` のみ）
  - 本番で未設定なら throw
  - 影響先（QR生成/検証6経路）が同じ挙動で失敗することを確認

---

## 5.3 D-13（default-store/default-tenant）

### A) `createScheduledTournament.ts`
- As-Is: Zod `.default("default-store")` / `.default("default-tenant")`
- To-Be:
  - default を外す（推奨）
  - `storeId` / `tenantId` を必須化し、本番で `default-*` を明示禁止

### B) `createTournamentRecurrence.ts`
- As-Is: 同上
- To-Be: 同上

### C) `enqueueTournamentTasksCore.ts`
- As-Is: `const storeId = doc.storeId ?? 'default-store'`
- To-Be:
  - fallback 削除
  - 本番で `doc.storeId` 欠損/`default-store` は failed 扱い（ログ + 処理停止）

### D) `generateRecurringTournamentsCore.ts`
- As-Is: `d.data().storeId || "default-store"` で store 集約
- To-Be:
  - fallback 削除
  - storeId 欠損データは本番でエラー対象として収集（skip + error log も可）

### E) `lib/tournament/active/tournament_service.dart`
- As-Is: 引数 default が `default-store/default-tenant`（複数箇所）
- To-Be:
  - 引数を `required` 化（またはアプリ設定から解決して必ず埋める）
  - default 文字列を削除

### F) `lib/tournament/scheduling/pages/create_tournament_from_calendar_page.dart`
- As-Is: payload に `'storeId': 'default-store'`, `'tenantId': 'default-tenant'`
- To-Be:
  - 明示 default 送信を削除
  - 正式な store/tenant 供給元から渡す

### G) `lib/tournament/scheduling/pages/scheduled_tournament_list_page.dart`
- As-Is: デバッグ requestData で default を埋めている
- To-Be:
  - default 埋め込みを削除
  - service 呼び出しに正規 store/tenant を明示渡し

---

## 6. 追加で必須な確認（漏れ防止）

## 6.1 既存データ影響確認（必須）

対象コレクション:

- `scheduledTournaments`
- `tournamentRecurrences`

確認項目:

- `storeId == "default-store"` の件数
- `tenantId == "default-tenant"` の件数
- `storeId` / `tenantId` 欠損件数

結論別対応:

- 件数 0: そのまま本番ガード有効化
- 件数 > 0: 補正バッチ（手動/スクリプト）後に本番ガード有効化

## 6.2 テスト影響確認（必須）

`functions/__tests__/tournament_createTournament/` の fixture で `default-store/default-tenant` を使っているため、以下を更新する。

- テスト入力を `test-store` / `test-tenant` 等へ置換
- 「本番で default を拒否する」ケースを追加
- 「未設定時失敗」ケースを追加

---

## 7. 実装順序（推奨）

1. 共通 helper（本番判定・ID検証）を追加  
2. D-01 / D-12 を先に修正  
3. D-13 Functions 側4ファイルを修正  
4. Dart 側3ファイルを修正  
5. テスト修正  
6. 既存データ補正（必要時）  
7. lint/test 実行  

---

## 8. 受け入れテスト項目（Task7入力）

- D-01:
  - 本番想定で `LINE_CHANNEL_ACCESS_TOKEN` 未設定時に失敗
  - 設定済みで webhook/push が通る
- D-12:
  - 本番想定で `QR_SECRET_KEY` 未設定時に失敗
  - 設定済みで QR 生成/検証が通る
- D-13:
  - 本番想定で `default-store/default-tenant` が入力された場合に失敗
  - 正式 store/tenant 入力で tournament 作成/recurrence 生成/enqueue が通る

---

## 9. リスクと回避策

| リスク | 内容 | 回避策 |
|-------|------|--------|
| 既存データ停止 | 旧 default 値の既存データで本番処理が落ちる | ガード前にデータ補正件数を確認 |
| Dart 側取りこぼし | UI から暗黙 default が送信される | Dart 3ファイルの default 送信を削除し、required化 |
| テスト劣化 | fixture が旧仕様依存 | 先に fixture 更新 + 失敗系ケース追加 |
| 運用ミス | 環境変数未設定で障害 | Phase3 で Runbook 作成・デプロイ前チェックを必須化 |

---

## 10. コード以外で同時に必要な修正

Task6 実装と同時に最低限必要:

- Task7 用の検証チェックリスト更新（未設定失敗/設定成功ケース）
- Phase3 で Runbook 作成（環境変数再設定手順等）
- 既存データ補正計画の明文化（実施有無・責任者・タイミング）

Task6 完了後（Task9）:

- `CHANGE_LOG.md` に D-01/D-12/D-13 の実装結果を追記
- `DECISION_LOG.md` に必要なら補足（本番ガード仕様、既存データ補正判断）

---

## 11. 実装前チェック（着手ゲート）

- [ ] 本 changeSpec の対象ファイル一覧に漏れがないことを確認した
- [ ] 既存データ補正の有無を決めた
- [ ] テスト更新方針（fixture置換 + 失敗ケース追加）を決めた
- [ ] リリース後 env ファイル不使用方針と矛盾しないことを確認した

---

## 12. 補足（今回の最重要ポイント）

本タスクの難所は D-13。  
Functions 4ファイルだけ直しても、Dart 側が `default-store/default-tenant` を送り続けると意味がない。  
さらに既存データに default 値が残っていると、本番ガード導入で障害化する。  
そのため、**Functions + Dart + テスト + 既存データ確認**を1セットで完了させること。

