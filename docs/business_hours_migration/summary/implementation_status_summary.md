# 営業時間移行ドキュメント 実装状況サマリ（簡潔版）

`docs/business_hours_migration` 配下のドキュメントを漏れなく確認し、**実装が終わっていない機能・画面・処理**の有無を調査した結果です。

---

## 結論（簡潔）

- **実装が終わっていないと判断した機能・画面・処理はありません。**
- 代替実装で賄っているもの、保留・将来検討として「未実装としない」としているものは下記のとおり除外して判断しています。
- 本番運用前に確認を推奨する項目が 1 件あります（Phase1 の認証・権限チェックの有効化）。

---

## 判断の前提

以下のいずれかに該当するものは **「実装が終わっていない」とはしていません**。

1. **代替手段で実装されているもの**  
   - 例: バッファ時間を Firestore ではなく固定値で実装している（Phase2）。
2. **のちのドキュメントで「実装しない」または「保留・別 Step」と明確になっているもの**  
   - 例: `deferred_tasks.md` の attendances / attendanceCorrectionRequests への businessDate 追加（保留）。  
   - 例: Phase6 Step7 のエラー表示の詳細整備（将来検討・タスク未確定）。  
   - 例: 営業継続は「別 Step 想定」と書かれていたが、のちに Callable・UI ともに実装済み。

---

## 実装状況の要約

| 区分 | 状態 | 備考 |
|------|------|------|
| Phase0（Step0–4） | 完了 | 仕様・分析・チェックリスト |
| Phase1（state doc 導入） | 完了 | 認証は一時無効化（後述） |
| Phase2（businessHoursMonthlyMap） | 完了 | バッファは固定値で代替 |
| Phase3（当日画面 UI） | 完了 | — |
| Phase4（予定・任意日時 UI） | 完了 | — |
| Phase5（自動開閉店・認定処理） | 完了 | — |
| Phase6 Step1（storeMeta 購読・AppBar 表示） | 完了 | — |
| Phase6 Step2（未会計移管・未会計の会計） | 完了 | — |
| Phase6 Step3（閉店/開店ターミナル） | 完了 | closeStoreTerminal / openStoreTerminal |
| Phase6 Step4（assessment に基づく UI） | 完了 | 強警告・ゲート・Banner・開閉店管理ダイアログ等 |
| Phase6 Step6.1（仕様との照合・修正） | 完了 | changeSpec Task 1–8 反映済み（verification_report） |
| 営業継続（1–8 時間・Callable） | 完了 | continueBusinessTerminal + Flutter ダイアログ |
| Phase6.5（store_management 権限拡張） | 完了 | hasStoreManagementPermission・requireAdmin 等 |
| 保留（deferred_tasks） | 未実装だが除外 | attendances / attendanceCorrectionRequests の businessDate 追加。ユーザー指示時のみ実装。 |
| Phase6 Step7（エラー表示の詳細整備） | 将来検討 | タスク未確定。未実装とはしない。 |

---

## 本番運用前の確認推奨（1 件）

- **Phase1 の認証・権限チェック**  
  - 現状: 開店/閉店の管理者権限チェックが一時的に無効化されている（Phase1 implementation_summary 記載）。  
  - 推奨: 本番環境では必ず有効化すること。

---

## 参照

- **機能ごとの仕様（コードを知らない人向け）**: [feature_specification_for_non_technical_readers.md](./feature_specification_for_non_technical_readers.md)
- 詳細な Phase/Step ごとの実装状況: [implementation_status_detail.md](./implementation_status_detail.md)
- 保留タスク: [../deferred_tasks.md](../deferred_tasks.md)
- 将来検討（Step7）: [../phase6/step7/error_ui_future_work.md](../phase6/step7/error_ui_future_work.md)
