# A-2 詳細: freeze / frozen — 非採用方針

## ステータス

**方針決定済（2026-06-25）** — 現行機能としては採用しない。コード上の整理は別タスクで実施予定。

---

## 決定事項

| 項目 | 方針 |
|------|------|
| `freeze`（boolean フィールド） | **採用しない**。新規の業務意味付け・UI・ガードは作らない |
| `frozen`（旧疑似 status） | **採用しない**。Firestore の `status` 値としても使わない |
| 一時停止の業務表現 | **`status: 'paused'`** を正とする（`pauseTournament` / `resumeTournament`、LIFF・CF の参加制限は既存実装） |

`freeze` / `frozen` は設計・実装の対象から外す。作成経路からの `freeze` 引数・フィールド保存は **2026-06-25 に削除済み**。残る整理対象は旧 `to_be_deleted` 等。

---

## 背景（コード調査サマリ）

### `freeze` と `frozen` は別概念だった

- **`freeze`** … `scheduledTournaments.freeze`（boolean）。**2026-06-25 以降、新規作成時には保存しない**（`createScheduledTournament` / 定期生成経路から削除済み）。既存ドキュメントに残る値は読み取られない
- **`frozen`** … 削除済み Callable（`getScheduledTournaments_to_be_deleted.ts`）が `freeze === true` のとき `status: 'frozen'` として返していた**疑似ステータス**。現行 LIFF は `doc.status` をそのまま返す

### 現行で効いている status 制御（参考）

`freeze` とは無関係。一時停止は `paused` で既に実装済み。

| 層 | 例 |
|----|-----|
| LIFF 一覧 | `cancelled` は一覧から除外（`mapScheduledTournamentsForLiff`） |
| LIFF 参加 UI | `ended` / `paused` / 締切 / 未入店等（`getRegistrationBlockReason`） |
| `registerForTournament` | `cancelled` / `ended` / `paused` / 締切 / 営業日 |
| Flutter 卓画面 | `ended` / `force_ended` のみ閲覧専用（`isTournamentReadOnlyStatus`） |

---

## A-2 としての残作業

本件（freeze / frozen）について **業務定義・新規実装の検討は不要**。クローズ。

コード整理（旧 `to_be_deleted` の `frozen` 疑似 status 等）は **別途指示後** に実施する。

---

## 参照コード（整理状況）

| 箇所 | 状態 |
|------|------|
| `createScheduledTournament.ts` | **削除済**（引数・Firestore 保存なし） |
| `createTournamentRecurrence.ts` / `generateRecurringTournamentsCore.ts` | **削除済** |
| `tournament_service.dart` 等 Flutter 呼び出し | **削除済** |
| `to_be_deleted/getScheduledTournaments_to_be_deleted.ts` | 未整理（旧 `frozen` 疑似 status） |

一時停止の正本実装:

- `functions/src/domains/tournament_activeTournament/callables/api.pause.ts`
- `functions/src/domains/tournament_activeTournament/callables/registerForTournament.ts`
- `public/user/index.html` — `getRegistrationBlockReason`
