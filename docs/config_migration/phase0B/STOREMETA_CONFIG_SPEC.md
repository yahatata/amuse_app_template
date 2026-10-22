# storeMeta/config 仕様書

作成日: 2026-03-04  
参照: [PHASE0B_BEFORE_AFTER_DECISION.md](./PHASE0B_BEFORE_AFTER_DECISION.md), [tobe_config_architecture.md](../tobe_config_architecture.md)

---

## 1. ドキュメント構成方針

- **単一ドキュメント**: 共通設定は `storeMeta/config` 1 ドキュメントに集約
- **パス**: 店舗ごとに Firebase プロジェクトを持つため、`storeMeta/config` で店舗単位に識別される
- **R-09（requiredStaffByTimeSlot）**: storeMeta/requiredStaffByTimeSlot として別ドキュメント分離済み。詳細は docs/運用時資料/設定/storeMeta/requiredStaffByTimeSlot.md 参照

---

## 2. 読み取り優先度（Functions 側）

設定取得時の優先順位は以下とする。**未設定時はエラーにせず、下位の値を使用する**（新規店舗・新規設定の先行投入時に他店舗でエラーにならないため）。

| 優先度 | 取得先 | 説明 |
|--------|--------|------|
| ① | storeMeta/config | Firestore に値があればそれを使用 |
| ② | `functions/src/shared/config/defaults.ts` | ① が無い場合のデフォルト値集約ファイル |
| ③ | 各 TS ファイル内の直書き | ② も無い場合の最終フォールバック（② と同値にする） |

**運用ルール**: Phase1 で defaults.ts を唯一のソースとする方針を採用（D-0015）。デフォルト値の変更は defaults.ts のみで行う。各 TS 内の直書きは Phase2 で削除済み。

**フォールバック**: 未存在時・読み取り失敗時ともに ②→③ にフォールバック。Functions は defaults を返す、Flutter は最後の成功値を維持。詳細は [phase1/PHASE1_FALLBACK_BEHAVIOR.md](../phase1/PHASE1_FALLBACK_BEHAVIOR.md)、[運用時資料/設定/.../README.md](../../運用時資料/設定/storeMeta/configによる設定の詳細/README.md)。

---

## 3. デフォルト値集約ファイル

- **パス**: `functions/src/shared/config/defaults.ts`
- **役割**: 全設定のデフォルト値と、各設定の「何のための設定か」をコメントで記載
- **目的**: 管理・確認の容易さ。新規設定追加時の参照先としても使用

---

## 4. 共通 config に入れる項目

| ID | 設定キー | 用途（簡潔） |
|----|----------|--------------|
| D-05, D-07, D-08, D-09, B-06 | `features.*` | 機能フラグ（dualWrite, enqueueScheduler, templateBusinessDateCheck, settlementAggregator, tableDeviceRegistration） |
| D-10 | `autoOpenClose.enabled` | 自動開閉店の有効/無効 |
| D-10 | `autoOpenClose.taskCloseOffsetMinutes` | 閉店認定タスクの発火オフセット（閉店時刻からの分） |
| D-10 | `autoOpenClose.taskOpenOffsetMinutes` | 開店認定タスクの発火オフセット（開店時刻からの分） |
| 補足 | `businessDay.calcBufferMinutes` | 営業日境界計算時のバッファ（分） |
| R-10 | `businessHoursStyles` | 営業スタイル定義（weekday, weekendHoliday, event, allDay, closed） |
| R-06 | `billing.entranceFee` | 入店料（円） |
| R-06 | `billing.entranceFeeDescription` | 入店料の説明文 |
| R-06 | `billing.chargeEntranceFeeOnReentry` | 再入店時に入店料を取るか |
| R-11, R-12 | `billing.sideGameChipRate` | サイドゲームチップ 1 枚あたりの円換算レート |
| R-11, R-12 | `billing.paymentPolicy.categoryPaymentMethods` | カテゴリ別の利用可能な支払い方法 |
| R-11, R-12 | `billing.paymentPolicy.pointPriority` | ポイント使用の優先順位 |
| R-11, R-12 | `billing.paymentPolicy.roundingUnits` | pointAB / sideGameChip の丸め単位 |
| D-04 | `linePlan` | LINE プラン種別（communication / light / standard） |
| R-08 | `shift.submissionStartDay`, `submissionEndDay`, `schedulingStartDay` | シフト提出・組む期間の日付 |
| R-09 | `storeMeta/requiredStaffByTimeSlot`（別 doc） | 時間帯別の必要スタッフ数 |
| R-07 | `payroll.startDay`, `payroll.endDay` | 給与締め日 |

---

## 5. 共通 config に入れない項目

| ID/項目 | 理由 |
|---------|------|
| D-06: STORE_CLOSE_HOUR | Phase4 で廃止。determineAttendanceMode は出勤/退勤分離、夜間ジョブは閉店処理/Cloud Task 起動 |
| identity (storeId / tenantId) | **不要**。店舗ごとに Firebase プロジェクトを作成するため |

---

## 6. 更新経路（Phase1 整備済み）

- **主**: 詳細設定ページ（AdminHomePage→詳細設定）から initializeStoreConfigCallable 経由で初期投入
- **副**: 開発者による Firebase CLI/Console からの投入
- 詳細: [phase1/PHASE1_UPDATE_PATH_DESIGN.md](../phase1/PHASE1_UPDATE_PATH_DESIGN.md)

---

## 7. スキーマ（YAML 形式）

詳細スキーマは [phase1/PHASE1_CONFIG_SCHEMA.md](../phase1/PHASE1_CONFIG_SCHEMA.md) を参照。

```yaml
# storeMeta/config
features:
  dualWriteEnabled: bool
  enqueueSchedulerEnabled: bool
  templateBusinessDateCheck: bool
  settlementAggregatorEnabled: bool
  tableDeviceRegistrationEnabled: bool

autoOpenClose:
  enabled: bool
  taskCloseOffsetMinutes: int
  taskOpenOffsetMinutes: int

businessDay:
  calcBufferMinutes: int

businessHoursStyles:
  weekday: { styleId, openMinute, closeMinute, isClosed }
  weekendHoliday: { ... }
  event: { ... }
  allDay: { ... }
  closed: { ... }

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

linePlan: string             # 'communication' | 'light' | 'standard'

shift:
  submissionStartDay: int
  submissionEndDay: int
  schedulingStartDay: int
  # requiredStaffByTimeSlot は storeMeta/requiredStaffByTimeSlot に分離済み

payroll:
  startDay: int
  endDay: int
```

---

## 8. 参照

- `functions/src/shared/config/defaults.ts`
- [phase1/PHASE1_FALLBACK_BEHAVIOR.md](../phase1/PHASE1_FALLBACK_BEHAVIOR.md)（フォールバック時のログ仕様）
- `docs/config_migration/tobe_config_architecture.md`
- `docs/config_migration/phase0B/PHASE0B_BEFORE_AFTER_DECISION.md`
