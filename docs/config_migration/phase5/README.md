# Phase5 README

## 目的（案）

Phase2.1 で一旦保留とした `B-05 pointTypes` について、仕様の決定および実装を行うフェーズとする。

**※ 本 README および phase5 配下のドキュメントは現時点で案ベースであり、将来的に変更・追記される。**

---

## Phase5 のスコープ（案）

### B-05 pointTypes

`pointTypes` は以下を満たす改修が必要であるが、Phase2.1 では対応 scope が大きいため Phase5 に繰り延べとする。

| 観点 | 内容（案） |
|------|------------|
| **改修の必要性** | ポイント名称変更・config 化等の改修が必要 |
| **影響範囲** | ポイント名称を反映させるべき URL・TS ファイルの記載が多数存在。漏れなく修正するため、仕様整理と一括実装が必要 |
| **可変性** | 現状 3 種類（pointA, pointB, sideGameChip）で固定。種類数を可変にする、あるいは増やす必要性が検討対象 |
| **方針** | 仕様の決定も修正も Phase5 で行う。Phase2.1 では放置（後回し） |

---

## 関連ドキュメント

- `docs/config_migration/phase2.1/B05_pointTypes/README.md` … B-05 の現状整理・参照ファイル一覧
- `lib/globalConstant.dart` … 現状の pointTypes 定義
- `docs/config_audit/store_config_classification.md` … 設定分類

---

## 本 Phase の状態

- **ステータス**: 未着手
- **実施時期**: 未定
- **上記内容は案であり、Phase5 実施時に再検討・確定する**
