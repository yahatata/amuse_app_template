# Phase4.2: 給与計算システム改修

**最終更新**: 2026-03-04

---

## 目的

給与計算を**手動主導**とし、スケジューラーは**補助**とする。管理者が勤怠を確認した上で計算対象を選択し、計算・確定・支払い管理まで一貫して行えるシステムに改修する。

---

## 前提条件

- **Phase4.1 完了**が前提（attendances の actualWorkMinutes / nightWorkMinutes、payrollReflectedAt 等）
- 既存の storeMeta/config の payroll.startDay / payroll.endDay は期間計算に継続利用

---

## ドキュメント構成

| ファイル | 内容 |
|----------|------|
| [00_OVERVIEW.md](./00_OVERVIEW.md) | 改修の概要（スコープ・主要機能・データモデル・依存関係） |
| [01_TOBE_DETAILED_SPEC.md](./01_TOBE_DETAILED_SPEC.md) | 詳細 To-Be 仕様（画面・UI・計算フロー・データモデル・実装時の注意） |
| [02_REVIEW_AND_OPEN_ITEMS.md](./02_REVIEW_AND_OPEN_ITEMS.md) | レビュー結果サマリ・対応済み事項・未決事項・実装時チェックリスト |

---

## 改修スコープ（要約）

| 領域 | 内容 |
|------|------|
| **UI** | adminHome から遷移。給与計算専用メニュー。計算用タブ・計算結果タブの 2 タブ構成 |
| **計算フロー** | 対象 attendances を属性別表示→チェック選択→計算実行→確定で再計算不可 |
| **データモデル** | monthlyPayroll 見直し、storeMeta/payrollConfig 新規、通知コレクション新規 |
| **スケジューラー** | 通知・確認のみ。**計算実行は行わない** |
