# storeMeta/payrollConfig による設定の詳細

本フォルダには、Firestore `storeMeta/payrollConfig` で管理する各設定項目の運用時説明書を格納する。

給与**期間**（締めの開始日・終了日）は `storeMeta/config` の `payroll` が SSOT である。本ドキュメントは支給日・計算ロジック・通知時刻など、給与計算フェーズ（phase4.3）で追加・分離された設定を扱う。期間まわりは [config 側の payroll.md](../configによる設定の詳細/payroll.md) を参照すること。

## 横断資料

| ドキュメント | 内容 |
|--------------|------|
| [取得失敗時の挙動設計](../../取得失敗時の挙動設計.md) | storeMeta/config 向けの設計。payrollConfig は実装パターンが同様（下記） |
| [設定の不具合時の対応](../../設定の不具合時の対応.md) | 設定不具合時の切り戻し手順（共通方針） |

## 取得失敗時の挙動（payrollConfig・実装概要）

**ドキュメント未存在**: `getPayrollConfig` が `payrollConfigDefaults.ts` の値を返す。`config_fallback`（warn、`reason: document_missing`）。

**読み取り失敗（リトライ後も失敗）**: 同上でデフォルト返却。`config_read_error`（error）に続き `config_fallback`（warn、`reason: read_error_after_retries`）。

**ドキュメントは読めるがフィールド欠落・不正値**: フィールドごとにデフォルトへフォールバック。`config_fallback`（warn、`configKey: payrollConfig.<field>`）。

**Flutter**: `PayrollConfigService` が `storeMeta/payrollConfig` を購読し、パース失敗時はフィールドごとに `payroll_config_defaults.dart` と同値を適用。読み取りエラー時は最後の成功スナップショットを維持する（`StoreConfigService` と同パターン）。

## 設定変更の遡及について

- **計算に関わる項目**（週開始曜日、割増率、端数、`calcVersion` など）: 次回の給与計算 run 開始時に `payrollRuns` へ **snapshot** として固定される。既に確定済みの run は旧 snapshot のまま。
- **通知・スケジューラー項目**（`schedulerNotificationHour`, `reminderStartDaysAfterPeriodEnd`）: snapshot 対象外。変更は次回のスケジューラー実行から反映。

詳細は `docs/config_migration/phase4_3/specs/02_CONFIG_SPEC.md` セクション 8〜9。

## 各ファイルの構成

各設定ファイルには以下を記載する。

| 項目 | 説明 |
|------|------|
| 設定の説明 | その設定が何であるか |
| 何を設定するのか | 設定する値の意味 |
| 現状持ちうる値 | 許容値・型・例（ローダー実装に準拠） |
| その設定により何が変わるのか | 設定変更時の挙動・影響範囲 |
| 影響を受けるファイル一覧 | 主要な ts / dart |

## ファイル一覧

| ファイル | 内容 |
|----------|------|
| `payment_window.md` | 支給日（`paymentDayOfMonth` / `paymentMonthOffset`、旧 `paymentDate`） |
| `candidates_bulk_anomaly.md` | 候補件数上限、一括支払い登録、想定レンジ（異常検知予定） |
| `calc_control.md` | 法定週・法定時間外の週上限・法定休日曜日・計算バージョン |
| `premium_rates.md` | 深夜・時間外・60h超・法定休日の割増率 |
| `rounding.md` | 端数処理（方式・円単位） |
| `scheduler_notifications.md` | 通知配信時刻・リマインド開始日 |

仕様の一次情報: `docs/config_migration/phase4_3/specs/02_CONFIG_SPEC.md`。
