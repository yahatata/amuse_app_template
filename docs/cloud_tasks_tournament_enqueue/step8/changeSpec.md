# Step 8 changeSpec：既存データ・オンライン移行

## 1. 本ステップの実施方針

### 1.1 実施しない（スキップ）

**本ステップは実装を行わない。**

| 項目 | 内容 |
|------|------|
| 方針 | Step 8 の実装をスキップする |
| 理由 | リリース前アプリのため、既存の scheduledTournament は運用側で削除する。オンライン移行が不要 |
| 影響 | enqueueTournamentTasksCore への schedulePlanVersion 初期化ロジック追加を行わない |

### 1.2 前提条件

- 本番投入前（または本番運用開始前）に、既存の scheduledTournament ドキュメントを運用側で削除する
- Step 2 以降に作成される scheduledTournament のみが存在する前提で運用する
- したがって、schedulePlanVersion 未設定のドキュメントは本番では存在しない想定

### 1.3 現状実装の扱い

| 項目 | 内容 |
|------|------|
| enqueueTournamentTasksCore | `doc.schedulePlanVersion ?? 0` による未設定時のフォールバックは**維持**（防御的コーディングとして有効） |
| controlHook | `tournamentData.schedulePlanVersion ?? 0` による比較は**維持**（同上） |
| 追加実装 | needsMigration 判定や schedulePlanVersion の 1 への更新ロジックは**追加しない** |

---

## 2. 他ドキュメントとの整合

本スキップ方針に合わせ、以下を参照すること。

- **modification_list.md**：Step 8 セクションに「本プロジェクトではスキップ」の注記あり
- **step2, step3, step4, step6, step7**：Step 8 への言及を「スキップ」前提で更新済み
