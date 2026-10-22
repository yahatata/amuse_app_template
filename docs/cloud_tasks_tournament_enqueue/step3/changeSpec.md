# Step 3 changeSpec：scheduledTournament 編集処理への version/taskSync 対応

## 1. 概要

### 1.1 目的

`spec.md` 2.4 に基づき、scheduledTournament の **編集時** に `schedulePlanVersion` のインクリメントと `taskSyncNeeded` を条件付きで設定する。

- 予定変更（startAt/regEndAt）があった場合のみ version++ と taskSyncNeeded=true を設定し、コストを抑制する
- taskIndex は編集処理内で直接更新しない（責務は enqueue 側に寄せる）

### 1.2 スコープ

- **対象**：`updateTournamentTemplate.ts`、`updateTournamentRecurrence.ts`
- **非対象**：controlHook、endTournament、api.pause、api.resume、setRankingData、setPrizeData、deleteTournamentRecurrence（後述の判定に基づく）

---

## 2. Step 4 で用いる regEndAt 再計算仕様（A1）

### 2.1 regEndAt の算出仕様（Step 4 の責務）

**Step 3 では regEndAt の再計算は行わない**。以下は Step 4 enqueue が差分判定・再投入判断を行う際に用いる仕様。

| 項目 | 内容 |
|------|------|
| 算出元 | `plannedRegistAt` と同一。`startAt` + `blindTemplate` 由来の duration 合計 |
| 計算式 | `regEndAt = startAt + totalDurationSec` |
| totalDurationSec | `blindTemplates/{blindStructureId}` の `levels` に対し、`lateRegUntilLev+1` のレベルが始まる直前までの level の `duration`（分）の合計を秒に変換した値。`hasBreakAfter` の break を含む |
| 必要データ | `startAt`（scheduledTournament）、`template.blindStructure` or `template.blindStructureId`、`blindTemplates/{id}` の `levels`, `lateRegUntilLev`, `breakDuration` |
| 関係 | `scheduledTournament.regEndAt` = `views/runtime.plannedRegistAt` と整合。作成時は同一値でセットされる |

**Step 3 の責務**：blindStructure 変更時に `taskSyncNeeded=true` を立てる。regEndAt の再計算と「変化したか」の判定は Step 4 に委譲する。

---

## 3. 現状（As-Is）

### 3.1 updateTournamentTemplate.ts

| 項目 | 内容 |
|------|------|
| 処理 | 選択された scheduledTournaments の `snapshot` と `updatedAt` を更新 |
| 更新内容 | テンプレートの名前・エントリー料・blindStructure・賞金率等を snapshot に反映 |
| 時刻への影響 | 本処理では `startAt`/`regEndAt` や views/runtime は更新しない。blindStructure 変更時は regEndAt が変わりうるが、現状は再計算・更新していない |

### 3.2 updateTournamentRecurrence.ts

| 項目 | 内容 |
|------|------|
| 処理 | 選択された scheduledTournaments を更新 |
| 更新内容 | templateId/snapshot（テンプレート変更時）、startAt（startTime 変更時）、status: 'cancelled'（isActive === false 時） |
| 時刻への影響 | startTime 変更で startAt 更新。cancelled 時は enqueue 対象外 |

### 3.3 その他（対象外）

controlHook、endTournament、api.pause、api.resume、setRankingData、setPrizeData、deleteTournamentRecurrence は予定変更に該当しないため対象外。deleteTournamentRecurrence は Step 4 で enqueue クエリに isArchived フィルタを追加する方針。

---

## 4. version++ / taskSyncNeeded 判定表（B7）

Step 3 の責務は「regEndAt 差分の精密判定をしない。blindStructure 変更時は taskSyncNeeded を立てて Step 4 に委譲する」とする。実装者が迷わないよう、以下の表で条件を固定する。

| 更新イベント | startAt 変化 | Step 3 で version++ | Step 3 で taskSyncNeeded | taskSyncReason |
|--------------|--------------|---------------------|--------------------------|----------------|
| updateTournamentTemplate（blindStructure 変更あり） | - | - | true | `regEndAtChangedByTemplate` |
| updateTournamentTemplate（blindStructure 変更なし） | - | - | - | - |
| updateTournamentRecurrence（startAt 変更） | ✓ | ✓ | true | `startAtChanged` |
| updateTournamentRecurrence（template 変更） | - | - | true | `regEndAtChangedByTemplate` |
| updateTournamentRecurrence（cancelled のみ） | - | - | false（明示的に落とす） | - |

**補足**：regEndAt の「変化あり/なし」の分岐は Step 4 で判断する。Step 3 では blindStructure 変更・template 変更を検知した時点で taskSyncNeeded を立てる。

---

## 5. コスト設計（B6）

**採用方針：案B（安い・保守寄り）**

| 項目 | 内容 |
|------|------|
| 採用案 | **案B**：updateTournamentTemplate および updateTournamentRecurrence の template 変更時は **taskSyncNeeded=true のみ** 付与。version は上げない |
| 理由 | 各 tournament の read ＋ regEndAt 再計算＋比較を行うと読み取りが増える。コスト重視のため、Step 4 enqueue に再計算と planHash 更新を委譲する |
| Step 4 の責務 | 対象 tournament（taskSyncNeeded=true 含む）を見て、新 regEndAt を再計算。planHash で差分があれば taskIndex 更新・Cloud Tasks 投入。**enqueue 成功（taskIndex 更新完了）時に taskSyncNeeded=false を設定する**（解除責務は Step 4 に固定） |
| 将来の最適化 | 案C（対象件数が N 件以下なら案A で精密判定、超えたら案B）は任意 |

**updateTournamentRecurrence の startAt 変更時のみ** version++ を行う（当処理内で変更を確定できるため）。

---

## 6. 計算不能時のフォールバック（B2）

Step 3 では regEndAt の再計算を行わないため、B2 のフォールバック（計算不能時）は **発生しない**。Step 4 で再計算を行う際に、blindTemplate 取得失敗等の異常系があれば Step 4 の changeSpec で扱う。

---

## 7. 型の統一（B4）

| フィールド | 型 | 備考 |
|------------|-----|------|
| schedulePlanUpdatedAt | **Timestamp** | `Timestamp.now()` を使用。Step 2 と統一。Date は使わない。**テンプレ変更（taskSyncNeeded のみ）では schedulePlanUpdatedAt は更新しない**（version++ しないため） |
| updatedAt | 既存どおり | 本ステップでは触らない。将来的な統一は別ステップ |

---

## 8. taskSyncReason の語彙（B5）

運用・分析・デバッグのため、最小集合に固定する。

| 語彙 | 意味 |
|------|------|
| `regEndAtChangedByTemplate` | blindStructure 変更を検知した理由コード。**実際の差分確定は Step 4**（Step 3 では再計算しないため「変化する可能性」を示す） |
| `startAtChanged` | startAt が変化した（定期開催の startTime 変更など）。確定 |
| `cancelled` | 使用しない（cancelled 時は taskSyncNeeded=false を立てるのみ） |

---

## 9. 変更内容（ファイル単位）

### 9.1 updateTournamentTemplate.ts（案B 採用）

| 変更種別 | 内容 |
|----------|------|
| import 追加 | なし（Timestamp は使用しない。schedulePlanUpdatedAt は更新しない） |
| 更新オブジェクト拡張 | **taskSyncNeeded=true のみ** 付与。version++ は行わない |

**変更後**:
```typescript
batch.update(tournamentRef, {
  snapshot: filteredSnapshotData,
  updatedAt: new Date(),
  taskSyncNeeded: true,
});
```

**補足**：案B のため、regEndAt の差分判定は行わない。Step 4 の enqueue が taskSyncNeeded=true の tournament を読み、regEndAt を再計算して planHash で再投入要否を判定する。

**blindStructure が updateData に含まれない場合**：名前・エントリー料等のみの変更で regEndAt は変わらない。この場合は taskSyncNeeded も更新しない（既存の batch.update に何も追加しない）。**blindStructure が updateData に含まれる場合** のみ、上記のとおり taskSyncNeeded=true を付与する。

**実装の判定**：`updateData.blindStructure !== undefined` のときのみ、batch.update に `taskSyncNeeded: true` を追加する。名前・エントリー料等のみの変更では追加しない。

### 9.2 updateTournamentRecurrence.ts（条件付き version++）

| 変更種別 | 内容 |
|----------|------|
| import 追加 | `FieldValue`, `Timestamp` を `firebase-admin/firestore` から import |
| 条件分岐 | startAt 変更時のみ version++。template 変更時は taskSyncNeeded のみ。cancelled のみのときは taskSyncNeeded=false を明示 |

**本 changeSpec の採用**：updateTournamentRecurrence の version/taskSync 設定ロジックを以下とする。

| 条件 | version++ | schedulePlanUpdatedAt | taskSyncNeeded | taskSyncReason |
|------|-----------|------------------------|----------------|----------------|
| startTime 変更あり | ✓ | ✓ | true | `['startAtChanged']` |
| newTemplateData あり（テンプレート変更） | - | 更新しない | true | `['regEndAtChangedByTemplate']` |
| 上記両方 | ✓ | ✓ | true | `['startAtChanged']`（主因のみで可） |
| cancelled のみ（上記どちらもなし） | - | - | **false（明示的に落とす）** | - |

```typescript
// version++ と taskSync を設定する条件
const hasStartAtChange = startTime !== undefined;
const hasTemplateChange = newTemplateData !== null;
const hasScheduleChange = hasStartAtChange || hasTemplateChange;

if (hasScheduleChange) {
  if (hasStartAtChange) {
    tournamentUpdateData.schedulePlanVersion = FieldValue.increment(1);
    tournamentUpdateData.schedulePlanUpdatedAt = Timestamp.now();
    tournamentUpdateData.taskSyncReason = ['startAtChanged'];
  } else {
    tournamentUpdateData.taskSyncReason = ['regEndAtChangedByTemplate'];
  }
  tournamentUpdateData.taskSyncNeeded = true;
} else if (isActive === false) {
  // cancelled のみ：taskSyncNeeded を明示的に false に落とす（ノイズ削減）
  tournamentUpdateData.taskSyncNeeded = false;
}
```

**cancelled 時**：`hasScheduleChange === false` かつ `isActive === false` のとき、`taskSyncNeeded: false` を明示的に設定する。既に true が立っていた場合も消せるため、同期対象が溜まり続けるのを防ぐ。

**cancelled 時の reason/version の扱い（重要）**：`taskSyncNeeded: false` のみを書き込む。`taskSyncReason` と `schedulePlanVersion` は**消さない**（過去の値が残存）。Step 4 で `taskSyncReason` を参照して分岐する設計にすると事故るため、enqueue 対象判定は `taskSyncNeeded` を主ゲートとすること。

**version++ の連続について**：startAt 変更が複数回続けて起きた場合、version は連続で上がる。これは想定通り。変更だけでタスク未投入（Step 4 待ち）なのに version だけ増える状況は発生しうるが、運用上は問題ない（Step 4 が planHash で再投入要否を正しく判定する）。

---

## 10. 既存データ・後方互換（B8）

| 項目 | 内容 |
|------|------|
| schedulePlanVersion 未設定 | `FieldValue.increment(1)` は未設定を 0 とみなし、1 を設定する（Step 8 は本プロジェクトではスキップ） |
| 既存ドキュメント | 本ステップの変更は追加フィールドのみ。既存の更新ロジックは変更しない |

---

## 11. 検証方法・テスト観点（B9）

### 11.1 ビルド・型チェック

```bash
cd functions && npm run build
```

### 11.2 テスト観点（Step 3 で追加すべき最小限）

| 観点 | 内容 |
|------|------|
| updateTournamentTemplate | blindStructure 変更時 → taskSyncNeeded=true が設定される |
| updateTournamentTemplate | blindStructure 変更なし（名前等のみ）→ taskSyncNeeded は更新されない |
| updateTournamentRecurrence | startAt 変更時 → schedulePlanVersion++、taskSyncNeeded=true、taskSyncReason に `startAtChanged` が含まれる |
| updateTournamentRecurrence | cancelled のみ（isActive=false、他変更なし）→ taskSyncNeeded=false が明示的に設定される |
| updateTournamentRecurrence | template 変更時 → taskSyncNeeded=true が設定される（version++ は本実装では行わない方針なら、その旨をアサート） |

### 11.3 既存テスト

- tournament 関連の既存テストが存在する場合は実行し、失敗しないことを確認

---

## 12. チェックリスト

- [ ] updateTournamentTemplate.ts：blindStructure 変更時のみ taskSyncNeeded=true を追加
- [ ] updateTournamentRecurrence.ts：startAt 変更時に version++、schedulePlanUpdatedAt、taskSyncNeeded=true、taskSyncReason を追加
- [ ] updateTournamentRecurrence.ts：template 変更時に taskSyncNeeded=true を追加（version++、schedulePlanUpdatedAt は更新しない）
- [ ] updateTournamentRecurrence.ts：cancelled のみのときに taskSyncNeeded=false を明示的に設定
- [ ] schedulePlanUpdatedAt は version++ 時のみ Timestamp.now() で更新（Date 禁止）
- [ ] taskSyncReason は `regEndAtChangedByTemplate`, `startAtChanged` のいずれかに限定
- [ ] `npm run build` が成功する
- [ ] 上記テスト観点を満たすテストを追加・実行する
