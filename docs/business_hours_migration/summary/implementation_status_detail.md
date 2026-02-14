# 営業時間移行 実装状況詳細（Phase/Step 別）

簡潔サマリの根拠となる、Phase・Step ごとの実装状況と、未実装としない理由をまとめたドキュメントです。

---

## 1. Phase0（準備・仕様）

| ドキュメント | 内容 | 実装状況 |
|-------------|------|----------|
| step0_final_spec.md | 最終仕様 | 仕様確定済み（コード改修の前段） |
| step1_collection_analysis.md | コレクション分析 | 分析完了 |
| step2_query_display_files.md | 取得・表示ファイル洗い出し | 完了 |
| step3_state_doc_and_scheduling.md | state doc・スケジューリング設計 | 完了 |
| step4_migration_plan_checklist.md | 改修チェックリスト | チェックリストとして完了 |

---

## 2. Phase1: state doc 導入

- **implementation_summary**: 実装完了（型定義、getCurrentBusinessDateKeyOrThrow、手動開店/閉店、createBillWithActiveStay 修正、Firestore Rules、terminalHomePage の開閉店管理 UI）。
- **未実装としない点**: 認証・権限チェックは「一時的に無効化」されており、実装自体は存在。本番では有効化が必要である旨がドキュメントに明記されている。

---

## 3. Phase2: businessHoursMonthlyMap 導入

- **implementation_summary**: calcBusinessDate の businessHoursMonthlyMap 参照、OK/NONE/AMBIGUOUS、Dart 側 AMBIGUOUS ダイアログ、各 Callable の対応まで完了。
- **未実装としない点**: バッファ時間を Firestore の globalConstant から取得する機能は TODO だが、固定値（70 分）で代替実装済み。

---

## 4. Phase3: UI 改修（当日画面）

- **implementation_summary**: accountingPage、order_history_popup、tournament_history_popup、order_management_page の storeMeta/currentBusinessDay 購読・閉店時表示・前日計算など完了。

---

## 5. Phase4: UI 改修（予定・任意日時）

- **implementation_summary**: accountingHistoryPage、postAccountingAdjustmentsPage、accountingEditDialog、scheduled_tournament_list_page 等の businessDate フィルタ・営業日キー生成・日付バー・「すべて表示」など完了。

---

## 6. Phase5: 自動開閉店（補助機能）

- **implementation_summary**: weeklyPlanner、closeAssessmentTask、openAssessmentTask、state doc 初期化フィールド追加、環境変数分離・時間計算修正まで完了。

---

## 7. Phase6 Step1: storeMeta 購読・AppBar 表示

- **implementation_summary**: StoreMetaService シングルトン、複数ページ（terminalHomePage、tournament_home_page、table_detail_page、order_management_page、side_game_table_home）での営業状態表示が完了。

---

## 8. Phase6 Step2: 閉店処理の具体処理

- **implementation_summary**: getUnsettledBillsForClose、applyCloseSnapshot、finalizeUnsettledBillAfterAccounting、システム設定の「未会計 bills の移管」、未会計の会計ページ（UnsettledAccountingPage）・会計完了時の finalize 呼び出しまで完了。

---

## 9. Phase6 Step3: 閉店・開店ターミナル

- **implementation_changes**: closeStoreTerminal、openStoreTerminal、processingLease、computeDisplayAmount、closeRuns/unsettledBills 記録、terminalHomePage の閉店/開店フロー・完了ダイアログまで完了。実コードに closeStoreTerminal.ts / openStoreTerminal.ts が存在。

---

## 10. Phase6 Step4: assessment に基づく UI

- **changeSpec_implementation / spec**: StoreMetaData 拡張（closeAssessment / openAssessment / manualOverride 等）、強警告ゲート・Banner・開閉店管理ダイアログの §6・§7 出し分け、他画面の強警告表示、日付表示部の warning、lastError 表示などが仕様化されている。
- **実装**: StoreMetaService の latestData、store_strong_warning_ui、store_assessment_utils、terminalHomePage の StoreStrongWarningOverlay・開閉店管理ダイアログ、他画面の StoreStrongWarningWrapper 等が実コードに存在。

---

## 11. Phase6 Step6.1: 仕様との照合・修正

- **spec_summary**: 開閉店管理ダイアログ本文の §6・§7 出し分け、閉店中「開店処理が必要です」、lastError 表示、他画面の onCloseStore/onBusinessContinue、他画面の日付表示（getDateWarningLabel）、failed-precondition 文言・強警告ゲート文言・next_day_started の null 時文言などが「実装漏れ」として列挙されていた。
- **verification_report**: 上記が changeSpec Task 1–8 として漏れなく実コードに反映されていることを確認済み。よって Step6.1 の実装漏れは解消済みと判断。

---

## 12. 営業継続（1–8 時間・Callable）

- **仕様**: Phase6 Step4 spec §8。強警告時に「営業継続」を選択し、閉店時間の目安 1–8 時間を選び、manualOverride（close_skip）設定＋closeAssessment 更新＋指定時間後の closeAssessmentTask enqueue を 1 操作で実行する。
- **実装**: `functions/src/storeManagement/continueBusinessTerminal.ts` が存在し、requireAdmin・intendedBusinessDateKey・hours（1–8）のバリデーション・manualOverride 書き込み・closeAssessment 更新・Cloud Tasks enqueue を実装。Flutter 側は terminalHomePage の `_onBusinessContinue` で 1–8 時間選択ダイアログを表示し、continueBusinessTerminal Callable を呼び出している。  
- **未実装としない点**: spec_summary では「意図的に未実装・別 Step 想定」とされていたが、のちに Callable と UI が実装されているため、未実装とはしない。

---

## 13. Phase6.5: store_management 権限拡張

- **spec**: role が terminal でも options.store_management === true なら営業管理操作を実行可能とする。requireAdmin を「営業管理可能」判定に変更、openStore/closeStore/cleanupActiveStaysOnClose の権限チェックを hasStoreManagementPermission に統一。
- **実装**: `functions/src/lib/devicePermissions.ts` に hasStoreManagementPermission、`requireAdmin.ts` で isActive + hasStoreManagementPermission、openStore/closeStore/cleanupActiveStaysOnClose で同様の利用が実コードに存在。Flutter は既存の store_management オプションで表示制御済みのため変更不要と spec に記載されており、その通り。

---

## 14. 未実装だが「未実装としない」とするもの

| 項目 | 理由 |
|------|------|
| deferred_tasks: attendances / attendanceCorrectionRequests への businessDate 追加 | 保留として明記。ユーザーから明確に指示された時にのみ実装する旨が README・deferred_tasks に記載。 |
| Phase6 Step7: エラー表示の詳細整備（エラー一覧・ユーザー向け文言・復旧 UI） | error_ui_future_work.md で「今後実装が必要となる可能性がある」「現時点では実装タスクとしては確定していない」と記載。将来検討として未実装とはしない。 |

---

## 15. 確認したドキュメント一覧

- README.md, deferred_tasks.md, step0_final_spec.md, step4_migration_plan_checklist.md  
- automatic_store_assessment_spec.md  
- phase1–5 の implementation_summary  
- phase6/step1–step4 の implementation_summary / implementation_changes / changeSpec_implementation / spec  
- phase6/step6.1 の spec_summary, changeSpec, verification_report  
- phase6/step7 の error_ui_future_work.md  
- phase6.5 の spec.md  

上記および実コード（lib/ の該当ファイル、functions/src の storeManagement / close_process / tasks / scheduler 等）を照合した結果、本詳細に記載のとおりとしている。
