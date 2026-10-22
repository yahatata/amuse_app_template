# P0-04 実装サマリ

_最終更新: 2025-11-10 (JST)_

## 実装内容

### 1. Analytics Aggregator スケルトンコード
- **ディレクトリ**: `functions/src/analytics/aggregator/`
- **ファイル**:
  - `types.ts`: 型定義（BillDoc, EventDoc, MonthlyDailyDelta, WriteContext）
  - `markers.ts`: aggregationMarkers の読み書き（冪等性制御）
  - `delta.ts`: Settlement/Event 用 delta 計算
  - `writer.ts`: 月次/日次 doc への書き込み、eventsLog 追加
  - `index.ts`: エントリポイント（enqueueSettlement, enqueueEvent）

### 2. テスト
- **ファイル**: `functions/__tests__/analytics/aggregator.spec.ts`
- **ケース**:
  - Settlement: 親 1 リード → 月/日 doc increment、マーカー作成、2回目 no-op
  - Event (refund 3,000): events/refunds/cashflow/net 増減確認、eventsLog 追記、2回目 no-op

### 3. ドキュメント
- `analytics_plan.md`: 命名整合ポリシー、マッピング表、balanceDueIncl 方針、UI互換維持を追記
- `ui_compatibility_plan.md`: 既存参照箇所調査、互換アダプタ実装案、段階的切替計画

## 重要な設計決定

1. **net.balanceDueIncl は nightly 再計算の結果が"正"**
   - Settlement/Event の逐次集計では更新しない
   - コメントで明記済み

2. **originBusinessDate を基準キー**
   - 当日・後日イベントの区別は origin で吸収

3. **返金・追徴は unattributed に集約**
   - `ALLOW_EVENT_ATTRIBUTION` が false の場合（デフォルト）

4. **UI互換維持**
   - 既存表示の見た目/数値を維持
   - Feature Flag `USE_ANALYTICS_V2_READS` で段階的切替

## 次のステップ

- P0-05: Active Stays 詳細設計
- P0-06: ツール/運用要件整理
- P0-07: Active Stays スキーマ確定
- P0-08: API 契約ドキュメント化
- P0-09: バックアップ手順整備

## 注意事項

- コードはスケルトンのみ。実装詳細は Phase1 で詰める。
- テストは最小ケースのみ。Phase1 で拡充予定。
- UI互換アダプタは Phase1 で実装開始。
