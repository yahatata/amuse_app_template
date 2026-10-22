# Phase1 タスク一覧

## 着手前の必須確認

Phase0B の決定事項を必ず確認してから着手すること。

- [PHASE0B_DECISIONS_FOR_LATER_PHASES.md](../PHASE0B_DECISIONS_FOR_LATER_PHASES.md)
- [phase0B/STOREMETA_CONFIG_SPEC.md](../phase0B/STOREMETA_CONFIG_SPEC.md)
- [phase0B/PHASE0B_COMPLETED_AND_DECISIONS.md](../phase0B/PHASE0B_COMPLETED_AND_DECISIONS.md)

---

## サマリ版

| # | タスク | 成果物 | 所要目安 |
|---|--------|--------|----------|
| 1 | スキーマの最終確定 | [PHASE1_CONFIG_SCHEMA.md](./PHASE1_CONFIG_SCHEMA.md) | 約 2 時間 | ✅ 完了 |
| 2 | 型・許容値・デフォルトの定義 | PHASE1_CONFIG_SCHEMA.md（追記） | 約 2 時間 | ✅ 完了 |
| 3 | 欠損時・フォールバックの挙動定義 | [PHASE1_FALLBACK_BEHAVIOR.md](./PHASE1_FALLBACK_BEHAVIOR.md) | 約 1 時間 | ✅ 完了 |
| 4 | Functions・Flutter 取得層の実装 | コード: `functions/src/shared/config/`, `lib/services/store_config_service.dart` | 約 6 時間 | ✅ 完了 |
| 5 | 更新経路の設計 | [PHASE1_UPDATE_PATH_DESIGN.md](./PHASE1_UPDATE_PATH_DESIGN.md) | 約 2 時間 | ✅ 完了 |
| 6 | Flutter 参照責務の整理 | PHASE1_UPDATE_PATH_DESIGN.md（追記）または README | 約 1 時間 | ✅ 完了 |
| 7 | ロールバック観点の文書化 | [PHASE1_ROLLBACK.md](./PHASE1_ROLLBACK.md) | 約 1 時間 | ✅ 完了 |
| 8 | CHANGE_LOG / DECISION_LOG 更新 | 更新済みログ | 約 1 時間 | ✅ 完了 |

---

## 詳細版

### タスク 1: スキーマの最終確定

| 項目 | 内容 |
|------|------|
| 目的 | Phase0B 決定事項と tobe_config_architecture を踏まえ、storeMeta/config のスキーマを確定する |
| 作業内容 | Phase0B 項目（D-10, R-10, R-11/R-12, D-04, calcBufferMinutes）に加え、features, billing の拡張（entranceFee 等）, shift, payroll をスキーマに含めるか決定する |
| 成果物 | [PHASE1_CONFIG_SCHEMA.md](./PHASE1_CONFIG_SCHEMA.md) |
| 参照 | phase0B/STOREMETA_CONFIG_SPEC, tobe_config_architecture, store_config_classification |

---

### タスク 2: 型・許容値・デフォルトの定義

| 項目 | 内容 |
|------|------|
| 目的 | 各キーの型・許容値・必須/任意を明確にし、defaults.ts との整合を取る |
| 作業内容 | ① TypeScript 型定義を確定 ② 許容値の範囲・バリデーションルールを記載 ③ defaults.ts に未定義があれば追加 |
| 成果物 | PHASE1_CONFIG_SCHEMA.md（型・許容値セクションを追記）、defaults.ts の必要更新 |
| 参照 | functions/src/shared/config/defaults.ts |

---

### タスク 3: 欠損時・フォールバックの挙動定義

| 項目 | 内容 |
|------|------|
| 目的 | ①→②→③ のフォールバックロジックと、欠損時の挙動（エラーにしない）を文書化する |
| 作業内容 | ① 未存在と失敗の挙動の区別 ② フォールバック／読み取り失敗時のログ仕様 ③ 不正値時の扱い |
| 成果物 | [PHASE1_FALLBACK_BEHAVIOR.md](./PHASE1_FALLBACK_BEHAVIOR.md) |
| 参照 | PHASE0B_DECISIONS_FOR_LATER_PHASES（読み取り優先度） |

---

### タスク 4: Functions・Flutter 取得層の実装

| 項目 | 内容 |
|------|------|
| 目的 | storeMeta/config を読み、優先度 ①→②→③ でフォールバックする取得層を Functions と Flutter の両方に実装する |
| 作業内容 | **Functions**: ① Firestore から storeMeta/config を読む共通関数 ② 未存在時・読み取り失敗時いずれも defaults.ts にフォールバック（D-0020）③ フォールバック時に `config_fallback`、読み取り失敗時に `config_read_error` + `config_fallback` のログを出力。**Flutter**: ① storeMeta/config を snapshot で購読する StoreConfigService ② 未存在時はデフォルトにフォールバック、失敗時は最後の成功値を維持 ③ 同様のログ出力 |
| 成果物 | `functions/src/shared/config/configLoader.ts`、`lib/services/store_config_service.dart`、`lib/services/store_config_defaults.dart` |
| 参照 | STOREMETA_CONFIG_SPEC, defaults.ts, [PHASE1_FALLBACK_BEHAVIOR](./PHASE1_FALLBACK_BEHAVIOR.md) |

---

### タスク 5: 更新経路の設計

| 項目 | 内容 |
|------|------|
| 目的 | storeMeta/config の更新を誰がどの経路で行うかを設計する |
| 作業内容 | ① 管理者 callable 経由とする方針の確定 ② 認可条件（管理者のみ等）③ 更新可能なフィールド範囲 ④ CLI/Firebase Console からの投入手順 |
| 成果物 | [PHASE1_UPDATE_PATH_DESIGN.md](./PHASE1_UPDATE_PATH_DESIGN.md) |
| 備考 | 実装（callable の作成）は Phase1 で行うか、設計のみとするかは別途判断 |

---

### タスク 6: Flutter 参照責務の整理

| 項目 | 内容 |
|------|------|
| 目的 | Flutter が storeMeta/config を購読・表示用途に限定する方針を整理する |
| 作業内容 | ① 確定ロジックを持たないことの確認 ② StoreMetaService への config 購読追加の要否 ③ SSoT 原則の適用範囲 |
| 成果物 | PHASE1_UPDATE_PATH_DESIGN.md または README への追記 |

---

### タスク 7: ロールバック観点の文書化

| 項目 | 内容 |
|------|------|
| 目的 | config 取得層のロールバック手順と観点を 1 ページで説明可能にする |
| 作業内容 | ① 旧 env/定数への fallback を移行期間限定で維持する方針 ② 問題発生時の切り戻し手順 |
| 成果物 | [PHASE1_ROLLBACK.md](./PHASE1_ROLLBACK.md) |

---

### タスク 8: CHANGE_LOG / DECISION_LOG 更新

| 項目 | 内容 |
|------|------|
| 目的 | Phase1 完了の記録と、必要なら Decision の補足を行う |
| 作業内容 | ① Phase1 完了エントリを CHANGE_LOG に追加 ② 必要なら DECISION_LOG に補足エントリ |
| 成果物 | CHANGE_LOG.md, DECISION_LOG.md |

---

## 最小チェックリスト（Done 条件）

- [x] スキーマと許容値が確定した
- [x] 取得層（①→②→③ フォールバック）が実装された
- [x] 欠損時挙動が文書化された
- [x] 更新責務が Functions に寄ることを設計した
- [x] Flutter の参照責務を限定した
- [x] ロールバック観点を記載した
- [x] Phase2 で ID 単位移行ができる最小基盤がある（Phase2 完了 ✅）
- [x] CHANGE_LOG / DECISION_LOG を更新した
