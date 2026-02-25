# Step 3 実装サマリ

## 概要

changeSpec Step 3 に従い、`updateTournamentTemplate` と `updateTournamentRecurrence` に taskSyncNeeded / schedulePlanVersion / taskSyncReason の条件付き設定を追加した。

---

## 1. テスト観点

| # | 対象 | 観点 | 期待結果 | 検証 |
|---|------|------|----------|------|
| 1 | updateTournamentTemplate | blindStructure 変更時 | taskSyncNeeded=true | ✓ |
| 2 | updateTournamentTemplate | blindStructure 変更なし（名前等のみ） | taskSyncNeeded は更新されない | ✓ |
| 3 | updateTournamentRecurrence | startAt 変更時 | schedulePlanVersion++, taskSyncNeeded=true, taskSyncReason: startAtChanged | ✓ |
| 4 | updateTournamentRecurrence | cancelled のみ | taskSyncNeeded=false が明示的に設定 | ✓ |
| 5 | updateTournamentRecurrence | template 変更時 | taskSyncNeeded=true（version++、schedulePlanUpdatedAt は更新しない） | ✓ |

---

## 2. 変更ファイル

### 2.1 updateTournamentTemplate.ts

| 項目 | 内容 |
|------|------|
| 変更種別 | batch.update への条件付きフィールド追加 |
| 条件 | `updateData.blindStructure !== undefined` のときのみ |
| 追加フィールド | `taskSyncNeeded: true` |
| 備考 | 名前・エントリー料・アddon 等のみの変更では taskSyncNeeded を含めない |

**該当コード**:
```typescript
batch.update(tournamentRef, {
  snapshot: filteredSnapshotData,
  updatedAt: new Date(),
  ...(updateData.blindStructure !== undefined && { taskSyncNeeded: true }),
});
```

### 2.2 updateTournamentRecurrence.ts

| 項目 | 内容 |
|------|------|
| import 追加 | `FieldValue`, `Timestamp` from `firebase-admin/firestore` |
| 条件分岐 | hasStartAtChange / hasTemplateChange / cancelled のみ の3パターン |

**ロジック**:

| 条件 | version++ | schedulePlanUpdatedAt | taskSyncNeeded | taskSyncReason |
|------|-----------|------------------------|----------------|----------------|
| startTime 変更あり | ✓ | ✓ | true | `['startAtChanged']` |
| newTemplateData あり | - | 更新しない | true | `['regEndAtChangedByTemplate']` |
| 両方 | ✓ | ✓ | true | `['startAtChanged']` |
| cancelled のみ | - | - | **false** | - |

**cancelled 時（重要）**：`taskSyncNeeded: false` のみを書き込む。`taskSyncReason` と `schedulePlanVersion` は**消さない**（既存値が残る）。Step 4 では `taskSyncNeeded` を主ゲートとして使用し、`taskSyncReason` による分岐を避けること（`taskSyncNeeded=false` なのに古い reason が残っているケースがあるため）。

---

## 3. 作成・更新したドキュメント・テスト

| ファイル | 種別 | 説明 |
|----------|------|------|
| `docs/cloud_tasks_tournament_enqueue/step3/test_perspectives.md` | 新規 | テスト観点一覧 |
| `functions/__tests__/tournament_createTournament/step3_taskSyncNeeded.spec.ts` | 新規 | Step 3 Emulator テスト |
| `docs/cloud_tasks_tournament_enqueue/step3/implementation_summary.md` | 新規 | 本サマリ |

---

## 4. テスト結果

### 4.1 Step 3 テスト（5件）

```
PASS __tests__/tournament_createTournament/step3_taskSyncNeeded.spec.ts
  Step 3: taskSyncNeeded / version++ 条件付き設定
    ✓ 観点1: blindStructure 変更時 → taskSyncNeeded=true が設定される
    ✓ 観点2: blindStructure 変更なし（名前等のみ）→ taskSyncNeeded は更新されない
    ✓ 観点3: startAt 変更時 → schedulePlanVersion++, taskSyncNeeded=true, taskSyncReason: startAtChanged
    ✓ 観点4: cancelled のみ（isActive=false、他変更なし）→ taskSyncNeeded=false が明示的に設定される
    ✓ 観点5: template 変更時 → taskSyncNeeded=true（version++, schedulePlanUpdatedAt は更新しない）
```

### 4.2 tournament_createTournament 全テスト（13件）

```
Test Suites: 3 passed, 3 total
Tests:       13 passed, 13 total
```

- step3_taskSyncNeeded.spec.ts: 5 passed
- step1_emulator_verification.spec.ts: 3 passed
- step1_no_enqueue_regression.spec.ts: 5 passed

### 4.3 ビルド

```
cd functions && npm run build
Exit code: 0
```

---

## 5. 後方互換・既存機能への影響

- 既存ロジック（snapshot 更新、startAt 更新、status 更新）は変更していない
- `batch.update` への追加フィールドのみで、既存の更新処理は維持
- schedulePlanVersion 未設定時は `FieldValue.increment(1)` により 1 が設定される（Step 8 はスキップのため、未設定 doc は本番では存在しない想定）
- 既存 tournament 関連テストはすべて成功

---

## 6. 実行コマンド

```bash
# ビルド
cd functions && npm run build

# Step 3 テストのみ
npm test -- __tests__/tournament_createTournament/step3_taskSyncNeeded.spec.ts

# tournament_createTournament 全テスト
npm test -- __tests__/tournament_createTournament/
```

**前提**: Firestore Emulator を起動しておく（`firebase emulators:start --only firestore`）
