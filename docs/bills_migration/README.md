# Bills Migration プロジェクト

## サマリー
- 目的: `todaysBills` / `settledBills` を廃止し、単一の `bills` 親ドキュメント＋サブコレクション、滞在管理用 `activeStays` へ統合する。
- 基本原則:
  - 営業中の変更はサブコレクションのみを更新し、親ドキュメントは軽微な状態更新に限定する。
  - 会計確定時のスナップショット（`amounts` や `categoryBreakdown` 等）は **Cloud Functions のみが書き込む**。
  - 返金・追加徴収などの事後処理は `/events` に追記し、親サマリと Analytics を差分更新する。
  - 閉店バッチは親ドキュメントのスナップショットのみを参照し、1 伝票あたり 1 リードに抑える。

```
/bills/{billId}
  ├─ items/{itemId}
  ├─ extras/{extraId}
  ├─ payments/{paymentId}
  ├─ sideGameChips/{chipId}
  ├─ tournaments/{tplId}
  └─ events/{eventId}
/activeStays/{uid}
```

## 目的
- `todaysBills` と `settledBills` を統合し、`bills` コレクション＋サブコレクション構成へ移行する。
- 滞在管理データを `activeStays` で分離し、営業中の読み取りコストを削減する。
- 会計スナップショット・事後イベント・分析処理を Cloud Functions に集約し、責務を明確化する。

## 対象範囲
- Firestore データモデル（`bills` 親ドキュメント、各サブコレクション、`activeStays`）の設計とルール・インデックス整備。
- Cloud Functions（書き込みアダプタ、会計確定トリガ、イベント差分、Analytics 更新）の改修。
- Flutter クライアントの読み取り／書き込みロジック刷新。
- デュアルライト期間の制御、閉店バッチ・再計算バッチの移行。

## 運用ガイドライン
- 計画・テスト・決定事項は本ディレクトリ内で管理し、更新のたびに内容を追記する。
- 履歴を残すため、既存記述は極力保持し、追記／更新した旨を `changelog.md` に記録する。
- 新しい要件が判明したら `modification_plan.md` に反映し、テストが増えた場合は `test_plan.md` を更新する。
- 重要な判断や仕様確定は `decision_log.md` に日付付きで残す。
- リスクと対応策は `risk_and_mitigation.md` に整理し、状況が変わったら更新する。

## フォルダ構成
- `todaysBills_operations_summary.md`: 現行実装の参照用サマリ（**旧仕様の参照専用**）
- `modification_plan.md`: フェーズ別の改修タスクと進捗管理
- `test_plan.md`: フェーズ／領域ごとの検証計画
- `decision_log.md`: 意思決定の記録
- `risk_and_mitigation.md`: リスクと対策の一覧
- `changelog.md`: ドキュメント更新履歴

## 記載ルール
- 時刻は基本的に日本時間（JST, UTC+9）で統一。
- ファイルやモジュールを参照する際はプロジェクト内の絶対パスを用いる。
- 箇条書きで簡潔に整理しつつ、必要十分な背景を明記する。
