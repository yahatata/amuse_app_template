# 決定記録

_最終更新: 2025-11-10 (JST)_

| 日付 | 事項 | 内容 | 関連ファイル | フォローアップ |
| --- | --- | --- | --- | --- |
| 2025-11-10 | データモデル分割 | `todaysBills` / `settledBills` を廃止し、`bills`＋サブコレクション＋`activeStays` に統合する方針を確定。 | `README.md`, `modification_plan.md` | フェーズ0でスキーマ詳細化 |
| 2025-11-10 | ヘルパ設計 | 共通ヘルパ層を先に整備し、既存コードの差し替え起点とする。 | `modification_plan.md` | P0-02 実装時に詳細策定 |
| 2025-11-10 | Analytics 必須要素 | 遡及イベントは `originBusinessDate` / `eventBusinessDate` を必須フィールドとして実装。 | `test_plan.md` | トリガ実装時にテストケース追加 |
| 2025-11-10 | 記録保持 | `bills` を会計記録の唯一の正とし、`settledBills` / `accountingHistory` は廃止予定。 | `modification_plan.md` | P2-03 以降で撤去 |
| 2025-11-10 | 店舗分離方針 | storeId は利用せず、プロジェクト／DB 分離でマルチ店舗を吸収する。 | `README.md` | フェーズ0でインデックス確認 |
| 2025-11-10 | 税処理方針 | 内税運用を継続し、税額は確定時に逆算して固定化する。 | `modification_plan.md`, `test_plan.md` | トリガ設計で共通サービス化 |
| 2025-11-10 | activeStays 保持期間 | 会計確定トリガで即時削除しつつ、TTL (48h) と夜間掃除で冗長化する。 | `modification_plan.md`, `risk_and_mitigation.md` | P0-05, P0-07 で詳細化 |
