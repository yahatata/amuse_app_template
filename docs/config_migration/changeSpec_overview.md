# ChangeSpec Overview（Config Migration）

## 1. スコープ

- 変えるもの
  - 運用前提を **パターンA固定**（1 Repo -> 店舗別アプリ + 店舗別 Firebase + 店舗別 Functions）に統一
  - 設定置き場の統一方針（Build/Deploy/Run）
  - `storeMeta/config` ベースの Run-time 設定戦略
  - Secrets 管理方針（平文 default 廃止）
  - Top10 を含む全 ID の段階移行方針
- 変えないもの（本 Overview 時点）
  - 具体実装コード
  - データ移行スクリプト詳細
  - 画面単位の微細 UI 仕様

## 2. 変更の柱

### 2.1 Secrets 統一

- 機密は平文 default/fallback を禁止する。
- 管理方式: Phase0A では default なしを採用済み（D-0009）。**環境変数はコマンドまたはコンソールで設定し、env ファイルは使用しない**（リリース開始後は絶対に使用しない）。
- 対象例: `LINE_CHANNEL_ACCESS_TOKEN`, `QR_SECRET_KEY`。

### 2.2 `storeMeta/config` 導入

- Run-time 設定の保管先を一本化。**単一ドキュメント** `storeMeta/config` に集約。
- 読み取り優先度: ① storeMeta/config ② `functions/src/shared/config/defaults.ts` ③ 各 TS 内直書き。未設定時はエラーにしない。
- 詳細: `docs/config_migration/phase0B/STOREMETA_CONFIG_SPEC.md`

### 2.3 ConfigLoader / FeatureGate 整理

- Functions: 判定用の最終値を取得（SSoT）。
- Flutter: 表示/入力補助向け読み取り（確定判定は持たない）。

### 2.4 Top10 設定の Run-time 化

- Top10 は先行バッチとして実施。
- ただし対象全体は classification 全 ID とし、Top10完了後に残りIDを同様手順で移行する。

### 2.5 ID駆動の全量移行

- 母集団: `docs/config_audit/store_config_classification.md` の B/D/R 全 ID
- 各 ID の処理ステップ
  1. 現SSoTとTo-Be SSoTを確定
  2. 読み取り責務/更新責務を確定
  3. 互換期間（fallback有無）を決定
  4. 実装・検証・ログ更新
  5. 旧参照の削除（または期限付き非推奨化）

### 2.6 二重管理解消（先行）

- `globalConstant` の設定用途を縮退。
- TS 側定数/環境変数との同義重複を整理。
- Run-time 化の前提条件として先行実施。

### 2.7 環境差分の分離

- `region`、Queue/URL/SA、CRON は店舗差分から分離し Deploy 環境差分として管理。

### 2.8 パターンA運用の明確化

- リポジトリは1つ、成果物とデプロイ対象は店舗単位で分離する。
- Flutter は flavor/scheme で店舗別成果物を生成する。
- Functions は `firebase deploy --project <storeProject>` で店舗ごとに反映する。

## 3. 影響範囲

- Flutter
  - `globalConstant` 依存箇所、`StoreMetaService` 利用画面、`DeviceService` キャッシュ周辺
  - flavor/scheme、`applicationId`/`bundleId`、アプリ名、アイコン
- Functions
  - bills/storeMeta/shift/tournament/webhook/user ドメイン
  - env/params/secret の取得ロジック
- Firebase 設定
  - Firestore（`storeMeta/config`）
  - Secret Manager / Functions params
  - プロジェクト alias / `--project` 運用
  - Build 素材（`firebase_options.dart`, `google-services.json` 等）
- 運用
  - 店舗追加手順、設定更新手順、緊急停止手順、ロールバック運用

## 4. 互換性方針

- 移行期間中（Phase2）
  - 未リリースアプリのため、旧 env/旧定数への fallback は持たない。差し替え完了したら即削除。詳細は [phase1/PHASE1_ROLLBACK.md](./phase1/PHASE1_ROLLBACK.md)。
  - 秘密値は fallback を禁止。
- 欠損時
  - `storeMeta/config` 欠損は安全側 default と警告ログ（秘密値除く）。
- ロールバック
  - 設定戻し（Run-time）とデプロイ戻し（Deploy）を分離して運用可能にする。
  - ID単位で切り戻し可能にする。
  - 店舗単位で切り戻し可能にする（`TARGET_STORES` 運用）。

## 5. 実行ゲート（移行順制御）

- Gate-1: Secrets 是正完了（平文 default/fallback なし）
- Gate-2: 対象 ID の重複 SSoT 解消
  - Phase1/2 着手前に `docs/config_migration/PHASE0B_DECISIONS_FOR_LATER_PHASES.md` を確認すること
- Gate-3: `storeMeta/config` 読み取り/更新基盤が利用可能（Phase1 完了 ✅）
- Gate-4: 回帰観点を満たした ID のみ完了へ遷移（Phase2 全 ID 完了 ✅ — tsc/flutter analyze パス）

## 6. テスト方針（高レベル）

- 営業日境界の一致（Functions 判定を正）
- 会計計算一致（`verifyPaymentSplit` で整合）
- 開閉店自動化（offset/flag の反映）
- 段階フラグ（on/off）即時性
- 権限/キャッシュ整合（`devices.role` と local cache）
- 全 ID の状態管理（未着手/移行中/完了）が更新されていること

## 7. 運用変更

- 増える作業
  - Secret の登録/更新管理
  - `storeMeta/config` の変更管理
  - 店舗追加時の flavor/scheme・Firebase プロジェクト・Functions 対象設定
- 減る作業
  - 軽微な運用変更での再ビルド/再デプロイ頻度
- 注意点
  - Run-time 値の更新権限は管理者経路へ限定
  - 本番で `default-store/default-tenant` を残さない

## 8. 進捗管理ルール

- Changeごとに classification ID を必ず紐付ける。
- `Top10` と `残ID` を別レーンで管理するが、完了判定は全 ID ベースで行う。

## 9. 実装単位の標準ステップ（簡易）

1. 対象 ID を宣言する
2. Before（現保存先/参照先）を確定する
3. After（To-Be保存先/参照先）を確定する
4. 互換期間・fallback・ロールバックを確定する
5. 実装する
6. 回帰確認する
7. Change/Decision ログ更新、ID状態更新

## 10. 根拠参照

- `docs/config_audit/store_config_classification.md`
- `docs/config_audit/store_config_followup_checkpoints.md`
- `functions/src/domains/bills/repos/calcBusinessDate.ts`
- `functions/src/domains/bills/callables/verifyPaymentSplit.ts`
- `functions/src/domains/webhook/callables/lineWebhook.ts`
- `functions/src/domains/user/services/qrCodeUtils.ts`
- `lib/services/store_meta_service.dart`
- `public/staff/config.js`

## 11. 作業時差分確認メモ

- 本ドキュメントは新規作成のみ。
- 作業完了時確認:
  - `git diff --name-only`: `docs/table_device/tobe_spec.md`（既存変更）
  - `git status --short`: `M docs/table_device/tobe_spec.md`、`?? docs/config_audit/`、`?? docs/config_migration/`
  - 本タスクでコード変更は実施していない。
