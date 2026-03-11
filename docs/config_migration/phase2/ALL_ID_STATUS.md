# 全 ID 状態一覧（Phase2 完了時点）

更新日: 2026-03-05

## Run 項目（storeMeta/config）

| ID | 設定名 | Phase2 状態 | SSoT |
|----|--------|------------|------|
| R-01 | (storeMeta/config 既存) | ✅ 完了 | storeMeta/config → defaults |
| R-02 | (storeMeta/config 既存) | ✅ 完了 | storeMeta/config → defaults |
| R-03 | (storeMeta/config 既存) | ✅ 完了 | storeMeta/config → defaults |
| R-04 | (storeMeta/config 既存) | ✅ 完了 | storeMeta/config → defaults |
| R-05 | (storeMeta/config 既存) | ✅ 完了 | storeMeta/config → defaults |
| R-06 | entranceFee / entranceFeeDescription / chargeEntranceFeeOnReentry | ✅ 完了 | storeMeta/config → defaults |
| R-07 | payrollStartDay / payrollEndDay | ✅ 完了 | storeMeta/config → defaults |
| R-08 | shiftSubmissionStartDay / shiftSubmissionEndDay / shiftSchedulingStartDay | ✅ 完了 | storeMeta/config → defaults |
| R-09 | requiredStaffByTimeSlot | ✅ 完了 | storeMeta/requiredStaffByTimeSlot（別 doc）→ defaults |
| R-10 | businessHoursStyles | ✅ 完了 | storeMeta/config → defaults |
| R-11 | sideGameChipExchangeRate / sideGameChipRoundingUnit | ✅ 完了 | storeMeta/config → defaults |
| R-12 | categoryPaymentMethods / pointPriority / pointABRoundingUnit | ✅ 完了 | storeMeta/config → defaults |

## Deploy 項目（process.env / defineString）

| ID | 設定名 | Phase2 状態 | SSoT |
|----|--------|------------|------|
| D-01 | (Phase0A 完了) | ✅ 完了 | Secret Manager |
| D-02 | LINE_CHANNEL_ACCESS_TOKEN 等 | ✅ 完了 | Deploy（process.env 維持） |
| D-03 | RICHMENU_ID 各種 | ✅ 完了 | Deploy（defineString 維持） |
| D-04 | linePlan | ✅ 完了 | storeMeta/config → defaults |
| D-05 | ENABLE_SETTLEMENT_AGGREGATOR | ✅ 完了 | storeMeta/config → defaults |
| D-06 | STORE_CLOSE_HOUR | Phase4 | Phase4 で廃止 |
| D-07 | WRITE_TODAYS_BILLS_IN_PARALLEL | ✅ 完了 | storeMeta/config → defaults |
| D-08 | ENQUEUE_SCHEDULER_ENABLED | ✅ 完了 | storeMeta/config → defaults |
| D-09 | TEMPLATE_BUSINESSDATE_CHECK | ✅ 完了 | storeMeta/config → defaults |
| D-10 | ENABLE_AUTO_OPEN_CLOSE / TASK_CLOSE_OFFSET / TASK_OPEN_OFFSET | ✅ 完了 | storeMeta/config → defaults |
| D-11 | Cloud Tasks queue / location | ✅ 完了 | Deploy（process.env 維持） |
| D-12 | (Phase0A 完了) | ✅ 完了 | Secret Manager |
| D-13 | (Phase0A 完了) | ✅ 完了 | Secret Manager |
| D-14 | region | ✅ 完了 | Deploy（defineString 維持） |
| D-15 | CRON 設定 | ✅ 完了 | Deploy（process.env で上書き可能） |

## Build 項目（Flutter 定数）

| ID | 設定名 | Phase2 状態 | SSoT |
|----|--------|------------|------|
| B-01 | schemaVersion | ✅ 完了 | Build（Flutter 定数維持） |
| B-02 | menuCategories | ✅ 完了 | Build（Flutter 定数維持） |
| B-03 | sideGameTypes | ✅ 完了 | Build（Flutter 定数維持） |
| B-04 | tournament 設定各種 | ✅ 完了 | Build（Flutter 定数維持） |
| B-05 | pointTypes | ✅ 完了 | Build（Flutter 定数維持） |
| B-06 | TABLE_DEVICE_REGISTRATION_ENABLED | ✅ 完了 | storeMeta/config → defaults |
| B-07 | ADMIN_CREATED_SHIFT_ID | ✅ 完了 | Build（Flutter 定数維持） |

## 特殊

| ID | 設定名 | Phase2 状態 | SSoT |
|----|--------|------------|------|
| CALC_BUSINESS_DATE_BUFFER_MINUTES | 営業日境界バッファ | ✅ 完了 | storeMeta/config → defaults |

## サマリ

- **全 ID**: 全て状態確定済み
- **storeMeta/config 移行完了**: D-04, D-05, D-07, D-08, D-09, D-10, R-06〜R-12, B-06, CALC_BUFFER
- **Deploy 維持**: D-02, D-03, D-11, D-14, D-15
- **Secret Manager**: D-01, D-12, D-13（Phase0A 完了）
- **Build 維持**: B-01〜B-05, B-07
- **Phase4 送り**: D-06（STORE_CLOSE_HOUR）
- **未着手/移行中**: なし
