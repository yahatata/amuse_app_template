# 02: nightlyRecalculateBalanceDue — 変更方針の概要

**※ 現時点での方針。実装時に変更の可能性あり。**

---

## 1. 目的

- 現状の夜間再計算（analyticsMonthly.net.balanceDueIncl）の扱いを整理する
- 本プロジェクトでは実装せず、管理用別プロジェクトへ移管する

---

## 2. 方針（案）

### 2.1 実施頻度・運用

- **実施頻度**: 毎日ではなく **週 1 回** とする（コスト軽減）
- **エラー時**: 保守運用チームへ警告を出す

### 2.2 実装先

- **本プロジェクト**: 実装しない
- **管理用別プロジェクト**: そちらで実施する予定
- 本プロジェクトでは `runNightlyRecalculateBalanceDue` を **unused_function_lib に移動**する

### 2.3 対象ファイル（想定）

- `functions/src/domains/analytics/scheduler/nightlyRecalculateBalanceDue.ts` → `unused_function_lib/` に移動
- `functions/src/domains/analytics/index.ts` から該当 export を削除

---

## 3. 参照

- [NIGHTLY_RECALCULATE_BALANCE_DUE.md](../NIGHTLY_RECALCULATE_BALANCE_DUE.md) … 処理内容の詳細（別プロジェクト実装時の参考）
