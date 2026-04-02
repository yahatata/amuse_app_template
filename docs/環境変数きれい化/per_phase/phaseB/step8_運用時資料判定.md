# phaseB ステップ8: 運用時資料の必要性判定

判定日: 2026-04-01

## 1. 判定結果

- phaseBの実装範囲について、**新規の運用時資料作成は不要**と判定。

## 2. 判定理由

- phaseBで実装したのは主に基盤コード（`schedulerConfig` v2、`schedulerSupervisor` core、`targetScope` / payload / ログ / replan request）であり、
  この時点では運用者が実施する新規の定常手順を増やしていない。
- phaseBでは安全側の方針として、`schedulerSupervisor` の本番切替（export有効化・旧onSchedule停止）を行っていない。
  そのため、運用フローの実質変更は phaseC 側で発生する。
- 既存の導入時資料で扱っている「プロジェクト紐付け」「リリース前後確認」の観点と矛盾する変更は今回含まれない。

## 3. 参照した既存資料

- `docs/運用時資料/導入時設定/fireBase紐付け/3レイヤー整合_設計方針.md`
- `docs/運用時資料/導入時設定/fireBase紐付け/リリース前後チェックリスト.md`

## 4. 将来の更新トリガー（phaseBでは未実施）

以下は phaseC 以降で実施される場合、運用時資料の更新を再判定する。

- `schedulerSupervisor` の本番export有効化
- 旧 `onSchedule` の無効化 / 削除
- `schedulerExecutionLogsByCloudTask` を使った監視導線の運用明文化
- `enqueueTournamentTasksReplanRequests` の運用確認手順（必要時）
