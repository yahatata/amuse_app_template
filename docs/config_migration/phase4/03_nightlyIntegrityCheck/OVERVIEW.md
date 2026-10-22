# 03: nightlyIntegrityCheck 改修 — 変更方針の概要

**※ 現時点での方針。実装時に変更の可能性あり。**

---

## 1. 目的

- 既存の nightlyIntegrityCheck を廃止または unused 化し、**閉店処理の一環**として整合性確認を行う新規処理を用意する
- 確認結果をユーザーに UI で出力する

---

## 2. 方針（案）

### 2.1 既存 nightlyIntegrityCheck の扱い

- 既存ファイルを **unused_function_lib に移動**するか、**名前変更**して区別する
- **新規ファイル**を閉店処理用として作成する

### 2.2 新規処理の役割

閉店処理の一環として、以下を確認し、結果を UI に出力する。

| 確認項目 | 内容 | 動作 |
|----------|------|------|
| 未 close のトーナメント | close 処理ができていないトーナメントがないか | 検出し、ユーザーに表示 |
| 未退勤のスタッフ | 退勤していないスタッフがいないか | **警告のみ**。強制退勤は行わない。閉店処理後の退勤も許可する |

### 2.3 UI

- 閉店処理フロー内に、上記確認結果を表示する UI を実装する
- 未 close トーナメント・未退勤スタッフがあれば一覧表示し、操作・対応を促す

### 2.4 起動方法

- スケジューラ（STORE_CLOSE_HOUR ベース）ではなく、**閉店処理の一環**として呼び出す
- 閉店処理完了前のチェックとして実行

### 2.5 対象ファイル（想定）

- `functions/src/domains/analytics/scheduler/nightlyIntegrityCheck.ts` → unused に移動 または 名前変更
- 新規: 閉店処理用の整合性チェック関数・Callable
- **Dart**: 閉店処理 UI に確認結果表示を追加

---

## 3. タスク進め方

- [TASK_EXECUTION_POLICY.md](./TASK_EXECUTION_POLICY.md) … 各項目完了後の確認チェックポイント、4 の UI はユーザーと並走する旨

## 4. 参照

- [SPEC.md](./SPEC.md) … 詳細仕様書（確定版）
- [TASK_EXECUTION_POLICY.md](./TASK_EXECUTION_POLICY.md) … タスク進め方
- [NIGHTLY_INTEGRITY_CHECK.md](../NIGHTLY_INTEGRITY_CHECK.md) … 既存仕様（bills/activeStays/analyticsMonthly の整合性チェック）
- 閉店処理フロー（storeMeta 関連）
