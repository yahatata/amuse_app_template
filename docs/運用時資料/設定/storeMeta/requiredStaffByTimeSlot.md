# storeMeta/requiredStaffByTimeSlot（廃止）

> **Deprecated（Phase 3）**  
> 正本は `storeMeta/businessStyles` に移行済みです。  
> 本ドキュメントは旧構造の参照用です。運用・実装では `businessStyles` を参照してください。

## 旧パス

`storeMeta/requiredStaffByTimeSlot`（単一ドキュメント）

## 現行正本

`storeMeta/businessStyles`（version 2）

各 styleId の `requiredStaffByTimeSlot` 配列に時間帯別必要人数を保持します。

```text
storeMeta/businessStyles
  version: 2
  styles:
    weekday:
      requiredStaffByTimeSlot: [{ startHour, endHour, requiredCount }]
    closed:
      requiredStaffByTimeSlot: []  # 常に空
```

## 読み取り（現行）

- **Functions**: `getBusinessStyles` / `getRequiredStaffByTimeSlot()`（businessStyles 経由）
- **Flutter**: `BusinessStylesService` / `RequiredStaffByTimeSlotService`（facade）

旧 doc への fallback はありません。

## 書き込み（現行）

- `saveRequiredStaffByTimeSlotCallable` → `storeMeta/businessStyles` のみ更新
- `initializeStoreConfigCallable` → 旧 doc は**作成しない**

## 中央管理アプリ

同期キーは `businessStyles` への移行を TODO（`docs/運用時資料/設定/storeMeta/中央管理アプリ連携.md` 参照）。

## 関連資料

- `docs/config_migration/phase1/PHASE1_CONFIG_SCHEMA.md`（businessStyles セクション）
- `docs/残タスク整理/11_requiredStaffByTimeSlot方針/02_changeSpec.md`（移行仕様）
