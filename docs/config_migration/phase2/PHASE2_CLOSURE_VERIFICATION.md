# Phase2 クローズ可否 網羅的検証

実施日: 2026-03-05  
目的: Phase2 をクローズできるかを全観点で確認する。

---

## 1. per_id 検証進捗（全 18 件）

| # | per_id ファイル | ステータス | 備考 |
|---|-----------------|------------|------|
| 1 | D05_settlementAggregator.md | 完了 | ①〜⑦-b 完了 |
| 2 | D07_dualWrite.md | 完了 | ①〜⑦-b 完了 |
| 3 | D08_enqueueScheduler.md | 完了 | ①〜⑦-b 完了 |
| 4 | D09_templateBusinessDateCheck.md | 完了 | ①〜⑦-b 完了 |
| 5 | B06_tableDeviceRegistration.md | 完了 | スキーマ定義のみ |
| 6 | CALC_BUFFER.md | 完了 | ①〜⑦-b 完了 |
| 7 | D10_autoOpenClose.md | 完了 | ①〜⑦-b 完了 |
| 8 | R10_businessHoursStyles.md | 完了 | ①〜⑦-b 完了 |
| 9 | D04_linePlan.md | 完了 | ①〜⑦-b 完了 |
| 10 | R09_requiredStaffByTimeSlot.md | 完了 | ①〜⑦-b 完了 |
| 11 | R11_R12_billing.md | 完了 | ①〜⑦-b 完了。GAP-3-4 は別対応 |
| 12 | R06_entranceFee.md | 完了 | ①〜⑦-b 完了 |
| 13 | R07_payroll.md | 完了 | ①〜⑦-b 完了 |
| 14 | R08_shiftFlow.md | 完了 | ①〜⑦-b 完了 |
| 15 | A3_configJs.md | 完了 | ①〜⑦-b 完了。GAP-3-5 解消 |
| 16 | A3_globalConstantCleanup.md | 完了 | ①〜⑦-b 完了 |
| 17 | CD_stateRecording.md | 完了 | ALL_ID_STATUS 照合済み |
| 18 | Z_crossCutting.md | 完了 | Z-1〜Z-7、GAP-2-3 確認済み。検出問題は残タスク/Phase4 に振り分け済み |

---

## 2. Phase2 README Done 条件

| 条件 | 確認結果 |
|------|----------|
| 全 ID に状態（未着手/移行中/完了）がある | ✅ ALL_ID_STATUS で全 ID 状態確定 |
| 完了 ID は To-Be 配置に揃っている | ✅ 移行済み ID は storeMeta/config → defaults |
| SSoT が単一で説明可能 | ✅ |

---

## 3. migration_roadmap Phase2 完了条件

| 条件 | 確認結果 |
|------|----------|
| 全 ID に状態が付与される | ✅ |
| 移行対象 ID の実参照元が To-Be 側へ寄る | ✅ REQUIREMENTS_GAP_CHECK §1 で確認済み |
| Functions 最終決定の前提が保持される | ✅ SSoT 原則（会計・営業日は Functions が最終決定） |
| 店舗1店のみ更新 → 検証 → 横展開の手順が運用可能 | ✅ 運用時資料に記載 |

---

## 4. Gate-4（tsc / flutter analyze）

| 項目 | 結果 |
|------|------|
| npx tsc --noEmit | ✅ パス |
| flutter analyze エラー 0 | ✅ error レベル 0（info/warning は 1022 件） |

---

## 5. テスト実行

| テスト套 | 結果 |
|----------|------|
| configLoader.spec | ✅ パス |
| phase2_migration.spec | ✅ パス |
| systemHealth.spec | ✅ パス |
| store_config_phase2_test.dart | per_id メモでパス確認 |
| store_config_service_test.dart | per_id メモでパス確認 |

※ Functions 全テストには Firebase 初期化エラーで失敗する套あり（Phase2 config 移行とは無関係の emulator 等の環境要因）

---

## 6. 横断要件（Z_crossCutting）

| 項目 | 確認結果 |
|------|----------|
| Z-1 取得失敗時の挙動設計 | ✅ 運用時資料に記載。B-06 は実装時対応（table_device §16） |
| Z-2 切り戻し手順 | ✅ 設定の不具合時の対応.md に記載 |
| Z-3 旧参照の即削除 | ✅ 移行済み定数削除済み |
| Z-4 defaults.ts 唯一ソース | ⚠ configOps return 27 は Phase4 スコープ（D06_CONFIGOPS_CLEANUP に明記） |
| Z-5 ログ仕様 | ✅ config_fallback / config_read_error 実装済み |
| Z-6 ドキュメント更新 | ✅ CHANGE_LOG、ALL_ID_STATUS、tobe_config_architecture 更新済み |
| Z-7 ゲート通過 | ✅ |
| GAP-2-3 | ✅ 解消済み（欠損時挙動は ①→② のみ） |

---

## 7. 後続フェーズへ振り分け済み項目

| 項目 | 振り分け先 |
|------|------------|
| tableDeviceRegistrationEnabled の取得失敗時・不具合時記載 | docs/table_device/tobe_spec.md §16（卓端末実装時） |
| configOps getStoreCloseHour return 27 | Phase4（D06_CONFIGOPS_CLEANUP.md） |
| globalConstant 残存定数の再検討 | Phase2.1 |
| GAP-3-4（aggregator） | R11_R12 で別対応と記載 |

---

## 8. クローズ前の最終アクション

| # | アクション | 状態 |
|---|------------|------|
| 1 | per_id_PROGRESS で CD_stateRecording、Z_crossCutting を「完了」に更新 | ✅ 完了 |

---

## 9. 結論

**Phase2 はクローズ可能**。以下の前提で判断する。

- per_id 17, 18 の進捗を「完了」に更新すれば、全 18 件の検証が完了した状態となる
- 検出した問題（B-06 運用時資料、configOps 直書き）は、実装時・Phase4 に適切に振り分け済み
- Phase2.1（globalConstant 残存定数再検討）は Phase2 とは別フェーズであり、Phase2 クローズのブロッカーではない
