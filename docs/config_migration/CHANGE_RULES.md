# CHANGE RULES（Config Migration）

## 1. 定義（Build / Deploy / Run）

- Build: 配布物固定の設定（Firebase接続先、`applicationId`、ラベル/アイコン）
- Deploy: 関数デプロイ固定（Secrets、IAM/Queue/URL、region、CRON）
- Run: 店舗運用で変更（機能フラグ、営業時間、運用パラメータ）
- 前提: 1 Repo を保守し、店舗ごとに別成果物/別デプロイを行う（パターンA固定）

## 2. SSoT 原則

- 会計・営業日・締め処理の最終決定は Functions。
- Flutter は表示/入力補助に限定する。
- 対応リスク: クライアント/サーバ計算ズレ。

## 3. 追加ルール（重要）

- **Duplicate-first ルール**
  - 同義設定が複数層にある場合、先に重複を整理してから移行する。
  - 対応リスク: 無駄な Run-time 化、参照先の分裂。
- **Runtime-gate ルール**
  - Run-time 化のPR/変更は「対象IDの重複参照解消証跡」を必須とする。
  - 対応リスク: 移行後の計算不整合。
- **Inventory-coverage ルール**
  - `store_config_classification.md` の全IDを管理対象にし、進捗状態を必ず付与する。
  - 対応リスク: 対象漏れ。

## 4. 禁止事項

- Secrets を Firestore に保存しない。
- 機密の平文 default/fallback を置かない。
- 同義設定の二重 SSoT を追加しない。
- `region` など環境差分を店舗差分に混ぜない。
- 重複が残る状態で Run-time 化しない。
- 本番で `default-store` / `default-tenant` を残さない。

## 5. 標準手順

1. 事前影響調査（対象ID、現SSoT、参照元、更新元、fallback）
2. Decision Log 更新（採用理由・代替案）
3. 実装（小分け、互換期間明示）
4. Change Log 記録（ID紐付け、互換性、戻し方）
5. 回帰確認（最低要件 + ID状態更新）
6. 店舗対象を明示（単店舗更新 or 全店舗更新）

## 6. 安全策

- 後方互換: 非秘密値のみ、期限付き fallback を許容。
- 緊急停止: Run-time フラグで即時停止可能に設計。
- ロールバック: 設定戻しとデプロイ戻しを分離。
- 段階展開: 店舗1店先行 -> 問題なければ横展開を基本とする。

## 7. レビュー/テスト最低要件

- レビュー
  - 対象IDが明示されているか
  - 参照元/更新元/SSoTが一貫しているか
  - Secrets が露出していないか
- テスト
  - 営業日境界
  - 会計一致
  - 自動開閉店
  - 権限・キャッシュ整合

## 8. 優先度原則

1. Secrets 是正
2. 二重管理の掃除（SSoT単一化）
3. Run-time 化
4. 最終整理（deprecate掃除）

## 9. 根拠（2ソース要約）

- `docs/config_audit/store_config_classification.md`
  - Secrets default、二重管理、全ID一覧
- `docs/config_audit/store_config_followup_checkpoints.md`
  - `storeMeta/config` 未実装、region 散在、`--dart-define` 実装未確認

## 10. 作業時差分確認メモ

- 本ドキュメントは新規作成からの更新のみ。
- 作業完了時確認:
  - `git diff --name-only`: `docs/table_device/tobe_spec.md`（既存変更）
  - `git status --short`: `M docs/table_device/tobe_spec.md`、`?? docs/config_audit/`、`?? docs/config_migration/`
  - 本タスクでコード変更はなし。
