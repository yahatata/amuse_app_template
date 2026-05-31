# storeMeta/config による設定の詳細

本フォルダには、Firestore `storeMeta/config` で管理する各設定項目の運用時説明書を格納する。

## 横断資料

| ドキュメント | 内容 |
|--------------|------|
| [取得失敗時の挙動設計](../取得失敗時の挙動設計.md) | 設定ごとの取得失敗時挙動（読めるがフィールド未存在 / 読めない の切り分け） |
| [設定の不具合時の対応](../設定の不具合時の対応.md) | 設定ごとの不具合発生時の切り戻し手順 |

## 取得失敗時の挙動（全設定共通・実装概要）

**読めるがフィールドが存在しない場合**: **必ずデフォルト値を適用する**。  
**読めない場合（Firestore 障害等）**: 設定ごとに「デフォルトを正とする」か「画面にエラー表示してユーザーに選択させる」かを選択。詳細は [取得失敗時の挙動設計](../取得失敗時の挙動設計.md) を参照。

- **実装**: Functions は `configLoader.ts` で、未存在時および読み取り失敗時（リトライ後も失敗）に `defaults.ts` の値を返す（D-0020）。Flutter は `StoreConfigService` で、読み取り失敗時は最後の成功値を維持。
- **ログ**: フォールバック時は `config_fallback`（warn）、読み取り失敗時は `config_read_error`（error）を出力。

## 各ファイルの構成

各設定ファイルには以下を記載する。

| 項目 | 説明 |
|------|------|
| 設定の説明 | その設定が何であるか |
| 何を設定するのか | 設定する値の意味 |
| 現状持ちうる値 | 許容値・型・例 |
| その設定により何が変わるのか | 設定変更時の挙動・影響範囲 |
| 影響を受けるファイル一覧 | ts / dart 別、LINE / App 別 |

## ファイル一覧

| ファイル | 対応 ID | 説明 |
|----------|---------|------|
| `features.md` | D-05, D-07, D-08, D-09, B-06, 新規 | 機能フラグ（`reportingAggregatorEnabled` を追加） |
| `autoOpenClose.md` | D-10 | 自動開閉店 |
| `businessDay_calcBufferMinutes.md` | CALC_BUFFER | 営業日境界バッファ |
| `businessHoursStyles.md` | R-10 | 営業時間スタイル |
| `billing_entranceFee.md` | R-06 | 入店料関連 |
| `billing_sideGameChipRate.md` | R-11/R-12 | チップ換算レート |
| `billing_paymentPolicy.md` | R-11/R-12, 新規 | 支払いポリシー（`roundingUnits` を追加） |
| `linePlan.md` | D-04 | LINE プラン種別 |
| `shift.md` | R-08, R-09 | シフト運用 |
| `payroll.md` | R-07 | 給与締め |
| `menuCategories.md` | B-02 | メニューカテゴリ |
| `sideGameTypes.md` | B-03 | サイドゲーム種別 |
| `tournament.md` | B-04 | トーナメント設定 |

※ 各ファイルの詳細内容は Phase2 検証 Task 4 の確認完了時に追記・更新する。
