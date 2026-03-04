# To-Be Config Architecture

## 1. 背景と目的

- 本書は **パターンA固定**（1 Repo -> 店舗ごとに別アプリ + 別 Firebase プロジェクト + 別 Functions デプロイ）を前提とする。
- 1つのテンプレートリポジトリを保守し、店舗追加時は「共通ロジック変更」ではなく「設定追加と対象指定」で展開できる運用を目指す。
- 対象は `docs/config_audit/store_config_classification.md` の全 ID（Build/Deploy/Run）。

## 2. Build / Deploy / Run 定義（パターンA）

- Build: 店舗アプリ成果物（AAB/IPA）に固定される値。
  - `applicationId` / `bundleId`
  - アプリ名 / アイコン
  - Firebase 接続先（`google-services.json` / `GoogleService-Info.plist`）
- Deploy: 店舗 Functions デプロイ時に固定される値。
  - 外部 API キー / Webhook token / 署名鍵
  - Cloud Tasks URL/Queue/SA、region、CRON
  - `firebase deploy --project <storeProject>`
- Run: 店舗運用中に Firestore などで変更する値。
  - 機能フラグ、営業時間、会計ポリシー、運用パラメータ

## 3. パターンAにおける分岐ポイント

1. Build 時分岐（店舗ごとの flavor/scheme）
2. Deploy 時分岐（店舗 Firebase プロジェクト + 秘密値注入）
3. Run 時分岐（`storeMeta/config` の運用値）

この3層を混在させないことを To-Be の基本原則とする。

## 4. SSoT 原則（最重要）

- 会計計算・営業日確定・締め処理の最終決定者は Functions。
  - 根拠: `functions/src/domains/bills/repos/calcBusinessDate.ts`
  - 根拠: `functions/src/domains/bills/callables/verifyPaymentSplit.ts`
- Flutter は表示/入力補助に寄せ、最終判定を持たない。
- 段階展開中も、同一判定ロジックをサーバに集約する。

## 5. To-Be 設定保管場所

- Build
  - `android/app/build.gradle.kts`（`applicationId`）
  - `android/app/google-services.json`
  - `ios/Runner/GoogleService-Info.plist`
  - `android/app/src/main/AndroidManifest.xml` / iOS `Info.plist`
- Deploy
  - Functions params/env（短期）
  - Secret Manager（推奨）
  - `TASKS_*`, `*_URL`, `*_SA`, region
- Run
  - Firestore `storeMeta/config`
  - 店舗運用で変更する値のみを保持

## 6. identity（storeId / tenantId）の扱い

- パターンAでは `storeId` / `tenantId` は「店舗アプリ/店舗プロジェクト単位で固定値」が基本。
- `default-store` / `default-tenant` は開発用の暫定値に限定し、本番残存を禁止する。
- 本番では以下のいずれかで注入する:
  - Build 時 `--dart-define` 等
  - Deploy 時 Functions params/env
  - 必要に応じて `storeMeta/config.identity.*` に記録（運用参照用）

## 7. Secrets 運用方針（Phase0A）

Phase0A では default 削除を採用済み（D-0009）。**環境変数はコマンドまたはコンソールで設定し、env ファイルは使用しない**（テンプレートリポジトリ完成・リリース開始後は絶対に使用しない）。

- 採用: default/fallback 削除。値の設定はコマンドまたはコンソールのみ。
- 将来的に `defineSecret` + Secret Manager へ移行可能。

共通必須条件:
- 平文 default をコードに残さない
- 弱い fallback（`default-*`）を残さない

## 8. `storeMeta/config` スキーマ（運用値）

```yaml
storeMeta/config:
  features:
    dualWriteEnabled: bool
    enqueueSchedulerEnabled: bool
    templateBusinessDateCheck: bool
    settlementAggregatorEnabled: bool
    tableDeviceRegistrationEnabled: bool
  businessDay:
    closeHour: int
    calcBufferMinutes: int
  autoOpenClose:
    enabled: bool
    taskCloseOffsetMinutes: int
    taskOpenOffsetMinutes: int
  billing:
    entranceFee: int
    entranceFeeDescription: string
    chargeEntranceFeeOnReentry: bool
    sideGameChipRate: number
    paymentPolicy:
      categoryPaymentMethods: map<string, string[]>
      pointPriority: string[]
      roundingUnits:
        pointAB: int
        sideGameChip: int
  shift:
    requiredStaffByTimeSlot: [{startHour:int,endHour:int,requiredCount:int}]
    submissionStartDay: int
    submissionEndDay: int
    schedulingStartDay: int
  payroll:
    startDay: int
    endDay: int
```

- 欠損時挙動:
  - 非秘密値: safe default + 警告ログ
  - 秘密値: fallback 禁止、未設定は即エラー

## 9. 読み取り責務／更新責務マトリクス

| 設定群 | To-Be SSoT | 読み取り | 更新 |
|---|---|---|---|
| `features.*` | `storeMeta/config` | Flutter + Functions | Functions（管理者経路） |
| `businessDay.*` | `storeMeta/config` | Functions（必須）+ Flutter（表示） | Functions |
| `autoOpenClose.*` | `storeMeta/config` | Functions | Functions |
| `billing.*` | `storeMeta/config` | Flutter + Functions | Functions |
| `shift.*` / `payroll.*` | `storeMeta/config` | Flutter + Functions | Functions |
| `identity.*` | Build/Deploy 注入値（必要時 Firestore 参照） | Flutter + Functions | Build/Deploy 手順 |
| Secrets | params または Secret Manager | Functions のみ | Deploy 手順 |
| Build 素材 | flavor/scheme 構成 | Build システム | リリース工程 |

## 10. 禁止事項

- Secrets を Firestore に保存しない。
- 機密の平文 default/fallback を置かない。
- 本番で `default-store` / `default-tenant` を残さない。
- 同義値の二重 SSoT を増やさない。
- 正当性計算をクライアントに委譲しない。

## 11. 運用原則

- 店舗単位更新を標準化する（1店舗先行 -> 問題なければ横展開）。
- Functions 更新は `--project` 指定を必須にし、意図しない全店反映を防ぐ。
- 互換期間中は safe default とロールバックを明示し、期間終了時に旧参照を撤去する。

## 12. 根拠参照

- `docs/config_audit/store_config_classification.md`
- `docs/config_audit/store_config_followup_checkpoints.md`
- `functions/src/domains/bills/repos/calcBusinessDate.ts`
- `functions/src/domains/bills/callables/verifyPaymentSplit.ts`
- `functions/src/domains/webhook/callables/lineWebhook.ts`
- `functions/src/domains/webhook/services/lineMessaging.ts`
- `functions/src/domains/user/services/qrCodeUtils.ts`
