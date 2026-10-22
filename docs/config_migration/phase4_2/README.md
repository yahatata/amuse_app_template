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
| [03_DEVELOPMENT_SEQUENCE.md](./03_DEVELOPMENT_SEQUENCE.md) | 開発順序概要（ステップ分割・実施順序） |
| [CHANGESPEC_AGGREGATION.md](./CHANGESPEC_AGGREGATION.md) | changeSpec 作成時点での変更内容集約（各 Step の修正全容） |
| [per_step/](./per_step/) | 各ステップごとの実施内容（STEP_PLAN、SPEC、changeSpec） |

---

## 改修スコープ（要約）

| 領域 | 内容 |
|------|------|
| **UI** | adminHome から遷移。給与計算専用メニュー。計算用タブ・計算結果タブの 2 タブ構成 |
| **計算フロー** | 対象 attendances を属性別表示→チェック選択→計算実行→確定で再計算不可 |
| **データモデル** | monthlyPayroll 見直し、storeMeta/payrollConfig 新規、通知コレクション新規 |
| **スケジューラー** | 通知・確認のみ。**計算実行は行わない** |

---

## 現状

### 確定済み

- **00_OVERVIEW** / **01_TOBE_DETAILED_SPEC** にて、改修方針・スコープ・画面・データモデル・計算フロー・支払い管理・通知・実装時の注意が整理済み
- **01_TOBE** の【確定】/【要詰め】の区別が明確
- **03_DEVELOPMENT_SEQUENCE** にて、Step01〜09 の実施順序と方針を定義済み
- **per_step/** 配下に各ステップの `STEP_PLAN.md` を用意し、「概要」「懸念・判断が必要な項目」「詳細」「完了条件」を記載済み

### 進行中

- **Step01**: 仕様確定・changeSpec 作成済み。実装・テストが未着手

### 未着手

- Step02〜09 の**仕様確定**（判断が必要な項目の決定、ファイル作成）
- Step02〜09 の **changeSpec** の作成
- 全 Step の実装・テスト

### 未決事項

- 02_REVIEW_AND_OPEN_ITEMS および 01_TOBE の「決まっていないこと一覧」を参照
- 各 `STEP_PLAN.md` の「懸念・確定できていない仕様等」は、ステップごとの仕様確定時に順次詰める想定

---

## 今後の進め方

### 基本ルール

1. **ステップごとに仕様確定を先に実施**し、その後 changeSpec を作成する。
2. **仕様確定で作成・更新したファイルは、必ずレビュー承認を得てから** changeSpec 作成に進む。
3. **仕様確定を行う際は、必ず前のステップでの変更を漏れなく確認し、整合性を検証する。**

### 各ステップの実施フロー

```
1. 仕様確定
   - 前ステップの変更・決定内容を確認し、整合性をチェック
   - 当該ステップの STEP_PLAN.md の「懸念・判断が必要な項目」を決定
   - 決定結果を反映した仕様ファイル（例: SPEC.md, API_CONTRACT.md 等）を作成・更新
   - レビュー依頼

2. レビュー
   - 作成・更新した仕様ファイルをレビュー
   - 承認後に次の工程へ進む

3. changeSpec 作成
   - 確定済み仕様に基づき changeSpec を作成

4. 実装・テスト
   - changeSpec に従い実装し、確認・テストを実施
```

### 整合性確認のポイント（仕様確定時）

- 前ステップで追加・変更したデータモデル・型定義・API との整合
- 前ステップで決めた用語・フィールド名・キーの一貫性
- 01_TOBE_DETAILED_SPEC および 02_REVIEW_AND_OPEN_ITEMS との矛盾の有無

### 参照先

| 工程 | 参照ドキュメント |
|------|------------------|
| ステップ順序・方針 | 03_DEVELOPMENT_SEQUENCE |
| 各ステップの詳細 | per_step/stepXX/STEP_PLAN.md |
| 全体仕様・未決事項 | 01_TOBE_DETAILED_SPEC, 02_REVIEW_AND_OPEN_ITEMS |
