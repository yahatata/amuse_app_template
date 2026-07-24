# A-6 changeSpec：導入時の既存ユーザーデータ紐付け

> 概要: A-6で完成したFunctions、Flutter、ガード、テスト、確認結果の実装仕様
> 主な目的: A-6の完成実装と実装上の判断を再現可能な形で正本管理する
> 正本区分: md正本
> 対象: 実装者、レビュー担当者、保守担当者
> 更新区分: 変更時
> 参照元: `詳細仕様.md`; `概要.md`
> 参照先: `詳細_背景と検討事項.md`; [A-7 changeSpec](../A-7_ポイントタイプ変更/changeSpec.md)

## 1. 文書情報

| 項目 | 内容 |
|------|------|
| タスクID | A-6 |
| タスク名 | 導入時の既存ユーザーデータ紐付け |
| 作成日 | 2026-07-15 |
| 最終更新日 | 2026-07-24 |
| ステータス | 実装・自動テスト・実機確認完了 |
| 本書の位置づけ | 完成した実装仕様・実装内容の正本 |

### 正本仕様書（再検討しない）

| 文書 | パス |
|------|------|
| 概要 | [概要.md](./概要.md) |
| 詳細仕様（要求正本） | [詳細仕様.md](./詳細仕様.md) |
| 背景調査（正本ではない） | [詳細_背景と検討事項.md](./詳細_背景と検討事項.md) |

### 優先順位

1. `詳細仕様.md`
2. `概要.md`
3. 本 changeSpec（実装詳細）
4. 現行コード（現状把握用。仕様と矛盾する場合は仕様を正とする）

---

## 2. 目的

新規店舗導入時に、既存台帳上の現在残高（`pointA` / `pointB` / `sideGameChip`）を新システムへ引き継ぎ、LINE 非利用ユーザーを店舗管理ユーザーとして継続管理し、後日 LINE 利用開始時に残高のみを LINEユーザーへ移行できるようにする。

---

## 3. 前提・要求仕様参照

要求仕様の要約は繰り返さない。実装時は [詳細仕様.md](./詳細仕様.md) を正本とする。

特に固定する要点:

- `userType: "line" | "store_managed"`
- 店舗管理のみ `isMigrated` / `migratedToUserId` / `migratedAt`
- 初期残高は上書き・再設定可・3項目必須
- 移行履歴は `balanceMigrationLogs` のみ（`point*Logs` へは書かない）
- 後日 LINE 化は別 uid 作成＋残高上書き（Auth/ドキュメント統合なし）
- CSV・本番互換フォールバック・店舗運用向け一括補正は作らない

### A-7 実装による追記（2026-07-24）

A-7 Phase 5 で A-6 Callable/UI を拡張した。本書の A-6 完成時記述（3 残高・`validateBalanceTriple`）は履歴として残し、**現行コードの正本は A-7 changeSpec** とする。

| 項目 | A-6 完成時 | A-7 以降（現行） |
|------|-----------|------------------|
| ユーザー残高 | `pointA` / `pointB` / `sideGameChip` | `pointA`〜`pointE` + `sideGameChip` |
| 初期残高検証 | `validateBalanceTriple`（3 キー） | `validateInitialBalancesPatch`（有効 ID のみ）等。移行は `validateBalanceSet`（6 キー） |
| 初期残高 UI/更新 | 3 項目固定 | config で有効な通貨型 + 有効 chip のみ。無効残高は 0 上書きしない |
| LINE 移行 | 3 残高コピー | 標準 6 残高すべてコピー（UI は有効分中心） |
| 移行ログ | `balanceMigrationLogs` のみ | 同左。`pointLogs` へは書かない |

---

## 4. 変更概要

| 区分 | 内容 |
|------|------|
| 登録 | `createUserAccount` / `createUserByApp` に種別フィールド付与。`createUserByApp` に admin device 必須化 |
| Callable 新規 | `setInitialUserBalances` / `migrateStoreManagedUserToLine` |
| 共通 helper 新規 | `assertUserNotMigrated` 等 |
| ガード | 入店・会計開始・トーナメント登録/着席・chip・置きバケ紐付け等で `isMigrated: true` 拒否 |
| Flutter | Adminホーム: ユーザー一覧・詳細。詳細設定: 初期ポイント設定 / 後日LINE化 |
| Rules | 既存の `users/{userId}/{logCollection=**}` で読取許可・クライアント書込禁止を満たすため変更なし |
| ログ | `logOpsError` / `logOpsSuccess` + `serviceByFunctionEntry` 登録 |
| 開発データ補正 | `fixUserTypeForA6.ts` をdry-run既定の一回限りの開発用スクリプトとして使用 |

---

## 5. 変更対象ファイル

### 5-1. 新規

| ファイル | 内容 |
|----------|------|
| `functions/src/domains/user/types/userType.ts` | `UserType` / migration 定数 |
| `functions/src/domains/user/helpers/assertUserNotMigrated.ts` | `isMigrated === true` 拒否 |
| `functions/src/domains/user/helpers/validateBalanceTriple.ts` | 3 残高の整数検証（A-7 以降は新経路で `validateBalanceSet` / `validateInitialBalancesPatch` を使用。本ファイルはレガシー参照可） |
| `functions/src/domains/user/helpers/assertUserFreeForMigration.ts` | 進行中業務検査 |
| `functions/src/domains/user/callables/setInitialUserBalances.ts` | 初期残高設定 |
| `functions/src/domains/user/callables/migrateStoreManagedUserToLine.ts` | 後日 LINE 化 |
| `functions/__tests__/user/setInitialUserBalances.spec.ts` | テスト |
| `functions/__tests__/user/migrateStoreManagedUserToLine.spec.ts` | テスト |
| `functions/__tests__/user/assertUserFreeForMigration.spec.ts` | 移行前業務ガードのテスト |
| `functions/__tests__/user/a6_emulator_integration.spec.ts` | Emulator統合テスト |
| `functions/__tests__/user/createUserAccount.spec.ts` | LINEユーザー種別付与テスト |
| `functions/__tests__/user/createUserByApp.spec.ts` | 店舗管理ユーザー種別・admin権限テスト |
| `functions/__tests__/user/phase4_1_migratedVisitGuards.spec.ts` | 入店・伝票ガード横断テスト |
| `functions/__tests__/user/phase4_2_migratedTournamentGuards.spec.ts` | トーナメントガード横断テスト |
| `functions/__tests__/user/phase4_3_migratedSideGameChipGuards.spec.ts` | サイドゲーム・チップガード横断テスト |
| `functions/__tests__/user/phase4_4_migratedOkibakeGuards.spec.ts` | 置きバケガード横断テスト |
| `functions/scripts/fixUserTypeForA6.ts` | 既存開発データへユーザー種別を設定するdry-run既定の一回限りの補正 |
| `lib/Home/adminInitialBalancePage.dart` | 初期ポイント設定の対象ユーザー選択Route |
| `lib/Home/adminInitialPointSettingPage.dart` | 選択ユーザー1名の初期ポイント設定Route |
| `lib/Home/adminStoreManagedToLineMigrationPage.dart` | 後日LINE化UI |
| `lib/Home/adminUserListPage.dart` | 管理者ユーザー一覧 |
| `lib/Home/adminUserDetailPage.dart` | 管理者ユーザー詳細 |
| `lib/user/user_type_display.dart` | ユーザー表示・検索・候補適格性helper |
| `lib/user/a6_callable_errors.dart` | A-6 Callableエラー表示 |
| `test/user/user_type_display_test.dart` | 表示・検索・候補適格性テスト |
| `test/user/a6_callable_errors_test.dart` | 入力・エラー表示テスト |

### 5-2. 変更

| ファイル | 変更内容 |
|----------|----------|
| `functions/src/domains/user/callables/createUserAccount.ts` | `userType: "line"` を set に追加。`isMigrated` は書かない |
| `functions/src/domains/user/callables/createUserByApp.ts` | admin device 必須化 + `userType: "store_managed"` + `isMigrated: false` |
| `functions/src/domains/user/index.ts` | 新 Callable export |
| `functions/src/shared/logging/serviceByFunctionEntry.ts` | 新 functionEntry 登録 |
| `functions/src/domains/user/callables/manualCheckIn.ts` | `assertUserNotMigrated` |
| `functions/src/domains/user/callables/processVisitByQR.ts` | 同上 |
| `functions/src/domains/bills/repos/createBillWithActiveStay.ts` | 入店前ガード |
| `functions/src/domains/bills/callables/accounting.ts`（startAccounting 経路） | `party.userId` に対しガード |
| `functions/src/domains/sideGame/callables/depositChip.ts` | ガード |
| `functions/src/domains/sideGame/callables/withdrawChip.ts` | ガード |
| `functions/src/domains/sideGame/callables/registerForSideGame.ts` | ガード |
| `functions/src/domains/tournament_activeTournament/callables/registerForTournament.ts` | ガード |
| `functions/src/domains/tournament_activeTournament/callables/registerParticipants.ts` | 各 userId ガード |
| `functions/src/domains/tournament_activeTournament/callables/assignSeatToPlayer.ts` | ガード |
| `functions/src/domains/tournament_activeTournament/callables/createOkibakeTemporaryEntry.ts` | `linkedUserId` がある場合ガード |
| `functions/src/domains/tournament_activeTournament/callables/updateOkibakeTemporaryEntryLinkedUser.ts` | ガード |
| `functions/src/domains/tournament_activeTournament/callables/linkOkibakeTemporaryEntryToBill.ts` | ガード |
| `functions/src/domains/tournament_activeTournament/callables/setRankingData.ts` | 付与対象 uid ガード |
| `lib/Home/adminHomePage.dart` | 「ユーザー一覧」を追加 |
| `lib/pages/admin_detail_settings_page.dart` | 「初期ポイント設定」「店舗管理ユーザーからLINEユーザーへの移行」を追加 |
| `lib/tournament/active/widgets/dialogs/okibake_link_user_picker_dialog.dart` | 移行済み除外 + 管理者一覧と同じpokerName検索 |
| `test/tournament/active/okibake_link_candidate_sort_test.dart` | 置きバケ候補除外・検索テスト |
| `functions/__tests__/callables/manualCheckIn.spec.ts` | ユーザー種別・移行済み拒否テストを更新 |
| `functions/__tests__/callables/processVisitByQR.spec.ts` | ユーザー種別・移行済み拒否テストを更新 |
| `functions/__tests__/callables/accounting.spec.ts` | 会計開始ガードテストを更新 |
| `functions/__tests__/callables/updateOkibakeTemporaryEntryLinkedUser.spec.ts` | 置きバケ紐付けガードテストを更新 |
| `functions/__tests__/sideGame/depositChip.spec.ts` | 移行済み拒否テストを更新 |
| `functions/__tests__/sideGame/withdrawChip.spec.ts` | 移行済み拒否テストを更新 |

### 5-3. 参照のみ（変更不要または Soft）

| ファイル | 理由 |
|----------|------|
| `getFirebaseCustomToken.ts` | 認証据え置き |
| `logUtils.ts` | `balanceMigrationLogs` は使わない |
| `requireAdmin.ts` | A-6 採否対象だが、採用しない（§14） |
| `firestore.rules` | 既存の再帰ワイルドカードで要件を満たすため変更不要 |
| `chip_point_logs_page.dart` / `profile_popup.dart` | 履歴参照 |
| `stayingUsersListPage.dart` | `activeStays` 起点。入店ガードで間接対応 |
| `leaveSeat` / `addon` / `bust*` / `placeOrder` | 既存セッション継続。新規対象化の入口ではない |

---

## 6. データモデル変更

### 6-1. `users/{uid}` 追加フィールド

| フィールド | 型 | 必須 | 保持する種別 | 作成時 | 更新条件 |
|------------|----|------|--------------|--------|----------|
| `userType` | `"line" \| "store_managed"` | 必須（A-6 以降の新規） | 両方 | 登録 Callable が設定 | 変更しない（恒久） |
| `isMigrated` | `boolean` | 店舗管理のみ必須 | `store_managed` のみ | `false` | 後日 LINE 化で `true` のみ（戻さない） |
| `migratedToUserId` | `string` | `isMigrated: true` のとき必須 | `store_managed` のみ | 未設定 | 後日 LINE 化時に移行先 uid |
| `migratedAt` | `Timestamp` | `isMigrated: true` のとき必須 | `store_managed` のみ | 未設定 | 後日 LINE 化時 serverTimestamp |
| `initialBalanceSetAt` | `Timestamp` | 任意（未設定＝未設定） | 両方 | 未設定 | `setInitialUserBalances` 成功時に更新 |

既存フィールド（`pointA` / `pointB` / `sideGameChip` / `pokerName` 等）の意味は変更しない。

**確定: `migratedFromUserId` は移行先に追加しない。**

双方向追跡は次で足りるため、同一情報の二重保持を避ける。

- 移行元: `migratedToUserId`
- 移行先: `balanceMigrationLogs.sourceUserId`（`migrationType: store_managed_to_line`）

### 6-2. 不正な組み合わせと扱い

| 状態 | 扱い |
|------|------|
| `userType` 欠落 | A-6 対象操作はすべて **`INVALID_USER_TYPE` で拒否**。フォールバック・自動補正・推測判定は実装しない（詳細仕様 §16） |
| `userType: "line"` かつ `isMigrated` 存在 | 書き込み禁止。読取時は無視してよいが、新規書込経路では付けない |
| `isMigrated: true` かつ `migratedToUserId` / `migratedAt` 欠落 | 不正。後日 LINE 化 tx で必ず同時書込。単体テストで担保 |
| `isMigrated: false` かつ `migratedToUserId` 存在 | 不正。書込しない |
| `userType: "store_managed"` かつ `isMigrated` 欠落 | 新規作成では不可。既存テストは手動で `false` 付与。操作時は `INVALID_USER_TYPE` |

読取前提（A-6 実装後の新規ユーザー）: `userType` は常に存在する。店舗管理は常に `isMigrated` を持つ。

### 6-3. `users/{targetUserId}/balanceMigrationLogs/{migrationId}`

移行履歴（証跡）の必須・任意項目は次のみとする。操作者・操作端末を示すフィールドは保存しない。

```ts
{
  migrationType: "initial_import" | "store_managed_to_line";
  sourceUserId?: string; // store_managed_to_line のみ。initial_import では omit
  balances: {
    pointA: number;
    pointB: number;
    sideGameChip: number;
  };
  createdAt: Timestamp; // Functions 側で serverTimestamp。クライアントから受け取らない
  note?: string;        // 入力がある場合のみ。trim 後空なら omit。最大 200 文字
}
```

| フィールド | 型 | 必須 | 備考 |
|------------|----|------|------|
| `migrationType` | `"initial_import" \| "store_managed_to_line"` | 必須 | |
| `sourceUserId` | `string` | `store_managed_to_line` のみ | **`initial_import` ではフィールド自体を omit**（null を書かない） |
| `balances` | `{ pointA; pointB; sideGameChip }` | 必須 | 設定後の最終値 |
| `createdAt` | `Timestamp` | 必須 | `FieldValue.serverTimestamp()` |
| `note` | `string` | 任意 | trim 後空なら omit。最大 **200 文字** |

| 項目 | 決定 |
|------|------|
| `migrationId` | Firestore `doc().id`（自動 ID）。クライアント指定不可 |
| 操作者 / 端末フィールド | **保存しない**（`createdByUid` / `actorDeviceId` / `executedBy` 等を新設しない） |
| `clientNonce` | 移行ログの必須項目には含めない。冪等が必要な場合は別ドキュメント（例: `balanceMigrationIdempotency`）で操作制御する |
| クライアント直接 write | **禁止**（Callable のみ） |
| update / delete | **禁止**（追記のみ） |
| read | 現行 `users` と同様、開発用に read 可（`firestore.rules`）。書込は false |

変更前残高は保存しない（要求どおり）。

管理者個人アカウントではなく admin 端末の Firebase Auth で操作するため、`request.auth.uid` をログに保存しても個人操作者は特定できない。認証 uid は Callable の権限判定にのみ使用し、本サブコレクションへは複製しない。

---

## 7. ユーザー登録変更

### 7-1. LIFF（`createUserAccount`）

- `userType: "line"` を `.set` に追加
- `isMigrated` / `migratedToUserId` / `migratedAt` は書かない
- 他フィールド・冪等スキップ挙動は現状維持

### 7-2. 店舗端末（`createUserByApp`）

- `userType: "store_managed"`
- `isMigrated: false`
- **admin device 必須化を A-6 に含める（採用）**

#### 権限追加の判断

| 選択肢 | 内容 |
|--------|------|
| A | A-6 と同時に admin device 必須化 |
| B | 別タスクに分離 |

**採用: A**

根拠:

- 現行は `request.auth` も device も見ていない
- `createStaffByApp` は既に admin 必須。ユーザー作成の方が同等以上に危険
- A-6 で店舗管理ユーザーを正式種別にする以上、作成入口の権限欠落を残すと導入フロー自体が危険

パターン（`createStaffByApp` と同型）:

```ts
if (!request.auth) throw unauthenticated;
const device = await getCallerDeviceByUid(request.auth.uid);
if (!device || !isActive(device.status)) throw permission-denied;
if (device.role !== 'admin') throw permission-denied;
```

---

## 8. 初期残高設定 Callable

### 8-1. 名称

`setInitialUserBalances`

### 8-2. 権限

admin device のみ（§14 採用パターン）。

### 8-3. リクエスト

```ts
{
  targetUserId: string;          // 必須
  balances: {
    pointA: number;
    pointB: number;
    sideGameChip: number;
  };                              // 3 項目すべて必須
  note?: string;                  // 任意、最大 200 文字
  clientNonce?: string;           // 任意。ある場合は冪等キーに使用
  confirmOverwrite: true;         // 必須リテラル。UI 確認済
}
```

### 8-4. レスポンス

```ts
{
  success: true;
  targetUserId: string;
  balances: { pointA; pointB; sideGameChip };
  initialBalanceSetAt: string; // ISO または Callable が Timestamp を返す場合はクライアントで表示
  migrationId: string;
  reused?: boolean;            // clientNonce 冪等ヒット時
}
```

### 8-5. 対象ユーザー条件

- `users/{targetUserId}` が存在
- `userType` が `"line"` または `"store_managed"`（欠落・不正は `INVALID_USER_TYPE`）
- `store_managed` かつ `isMigrated === true` は **拒否**（移行済みに対する初期残高設定は不可）

現在残高が非ゼロでも拒否しない。再設定可。

### 8-6. 入力検証

- `balances` の各値が `Number.isInteger(n) && n >= 0`
- 負数・小数・欠落・非数 → `INVALID_BALANCE`
- `note` が 200 超 → `INVALID_ARGUMENT`
- `confirmOverwrite !== true` → `CONFIRMATION_REQUIRED`

### 8-7. 更新（同一 Firestore transaction）

1. `users/{targetUserId}` を read
2. （任意）`clientNonce` がある場合:  
   `users/{targetUserId}/balanceMigrationIdempotency/{clientNonce}` を確認。既存なら balances 一致なら reused 成功、不一致なら失敗
3. update:
   - `pointA` / `pointB` / `sideGameChip` = 指定値
   - `initialBalanceSetAt` = serverTimestamp
4. `balanceMigrationLogs` に create（証跡フィールドのみ）:
   - `migrationType: "initial_import"`
   - `sourceUserId` omit
   - `balances`
   - `createdAt`（serverTimestamp）
   - `note`（入力がある場合のみ）
5. （任意）冪等用に `balanceMigrationIdempotency/{clientNonce}` を set。これは移行証跡ではない

部分成功禁止: 残高だけ・ログだけの成功を許さない。

### 8-8. 運用ログ

- 成功: `logOpsSuccess`（`functionEntry: setInitialUserBalances`, context: targetUserId, migrationId）
- 失敗: `logOpsError`（予期せぬもの）。業務拒否は `HttpsError` + `details.errorKey`
- 既存共通ログが認証 uid 等を自動記録する場合はそのまま利用してよい
- A-6 専用に `createdByUid` / `actorDeviceId` / `executedBy` を新設しない

---

## 9. 後日 LINE 化 Callable

### 9-1. 名称

`migrateStoreManagedUserToLine`

### 9-2. 権限

admin device のみ。

### 9-3. リクエスト

```ts
{
  sourceUserId: string;
  targetUserId: string;
  note?: string;
  clientNonce?: string;
  confirmSamePerson: true;   // UI で同一人物確認済
  confirmOverwrite: true;    // 移行先上書き確認済
}
```

同一人物確認は **UI 確認 + `confirmSamePerson: true` 必須** とする（追加の秘密値は不要）。

### 9-4. レスポンス

```ts
{
  success: true;
  sourceUserId: string;
  targetUserId: string;
  balances: { pointA; pointB; sideGameChip };
  migrationId: string;
  migratedAt: ...;
  reused?: boolean;
}
```

### 9-5. 移行元条件

- 存在すること
- `userType === "store_managed"`
- `isMigrated === false`

### 9-6. 移行先条件

- 存在すること
- `userType === "line"`
- `sourceUserId !== targetUserId`
- 3 残高がすべて 0 であることは **必須にしない**
- 非ゼロでも拒否しない（UI で上書き確認）

### 9-7. 進行中業務の検査

**要求:** 後日 LINE 化では、移行元・移行先の双方について、進行中または未完了の業務データが存在しないこと。

helper: `assertUserFreeForMigration(uid)` を双方に実行する。一つでも該当すれば移行を拒否する。

#### 9-7-1. コード調査結果（業務ドメインと現行の紐付け）

| ドメイン | 現行の主な状態保持 | 備考 |
|----------|-------------------|------|
| 入店 | `activeStays/{uid}`（`isActive`） | 入店の正本 |
| 会計・注文 | `bills`（`party.userId`, `status`） | `placeOrder` 等は open 系 bill 前提 |
| 会計後未完了 | `bills.status === 'post_settlement_pending'` 等 | 精算後調整の未完了 |
| トーナメント | `tablesSeat/waiting`・席・`views`。登録は **activeStay 必須**（`registerForTournament` / `registerParticipants`） | 着席時は `users.currentTable` / `currentSeat` も更新されうる |
| サイドゲーム | 卓 `seats.seatNUserId`。登録は **activeStay 必須**（`registerForSideGame`） | 入店解消が先 |
| チップ入出金 | active bill 前提（`getActiveBillByUser`） | 入店/伝票に従属 |
| 置きバケ | `okibakeTemporaryEntries.linkedUserId` | bill 未リンク等の進行中があり得る |
| 卓・席 | `users.currentTable` / `users.currentSeat` | 着席中の直接フラグ |

#### 9-7-2. Functions 拒否条件（採用・双方に適用）

| # | 検査 | 条件 | errorKey |
|---|------|------|----------|
| 1 | 入店中 | `activeStays/{uid}` が存在し `isActive === true` | `USER_HAS_ACTIVE_STAY` |
| 2 | 未精算・会計処理中伝票 | `bills` で `party.userId == uid` かつ `status in ('open','in_progress','settling')` が1件以上 | `USER_HAS_UNSETTLED_BILL` |
| 3 | 会計後未完了 | `bills` で `party.userId == uid` かつ `status === 'post_settlement_pending'` が1件以上 | `USER_HAS_POST_SETTLEMENT_PENDING` |
| 4 | 卓・席紐付け | `users.currentTable != null` または `users.currentSeat != null` | `USER_HAS_ACTIVE_TABLE_SEAT` |
| 5 | 未完了トーナメント参加 | **当日営業日**かつ未終了の `scheduledTournaments`（status が ended/cancelled/force_ended/canceled 以外）について、`tablesSeat/waiting.waiting[uid]` が存在する、またはいずれかの卓席に当該 uid が着席している。過去営業日の未終了残留は対象外 | `USER_HAS_ACTIVE_TOURNAMENT` |
| 6 | サイドゲーム着席 | 現行サイドゲーム卓ドキュメントのいずれかの `seats.seat*UserId === uid` | `USER_HAS_SIDE_GAME_SEAT` |
| 7 | 置きバケ進行中リンク | collectionGroup `okibakeTemporaryEntries` で `linkedUserId === uid`、`billLinkStatus in ('unlinked','pending_review')`、`entryStatus !== 'voided'` | `USER_HAS_PENDING_OKIBAKE_LINK` |

#### 9-7-3. ドメイン別カバー

| ドメイン | カバーする拒否条件 |
|----------|-------------------|
| 入店 | #1 |
| 未精算会計・注文中 | #2（注文は open 系 bill に載る） |
| 会計後未完了 | #3 |
| トーナメント（待機・着席・未完了） | #1（登録に activeStay 必須）+ #4 + #5 |
| サイドゲーム | #1（登録に activeStay 必須）+ #6 |
| チップ操作中の前提 | #1 / #2 |
| 置きバケ紐付け | #7 |
| currentTable / currentSeat | #4 |

複合query・collection走査は **tx前**に実行する。tx内では `activeStays` と `users.currentTable/currentSeat` を再読取して主要なレースを抑止する。

- トーナメント: `getBusinessDateForAttendance` で現在営業日を取得し、その営業日の未終了トーナメントだけ待機・着席を走査
- サイドゲーム: 現在の `sideGame` 席を走査
- 置きバケ: collectionGroup queryで未解消リンクを検査し、過去営業日の `pending_review` も拒否

#### 9-7-4. UIでの扱い

Firestoreを重複走査するUI preflightは実装しない。最終正本はFunctions（`migrateStoreManagedUserToLine`）側の拒否とし、該当時は返却された `errorKey` を具体的な日本語メッセージへ変換して表示する。

実行ボタンは、移行元・移行先の両方が選択済みで、同一人物確認が済んだ場合だけ有効にする。進行中業務の有無は実行時にFunctionsが判定する。

### 9-8. 更新（同一 Firestore transaction）

順序（すべて同一 tx）:

1. source / target を get。条件再検証（`isMigrated === false`、`userType`）
2. （任意）冪等: 既に `source.isMigrated === true` かつ `migratedToUserId === targetUserId` → 成功 reused（残高・ログは触らない）
3. 既に migrated だが別 target → `USER_ALREADY_MIGRATED`
4. target へ `pointA/B/sideGameChip` = source の現在値で上書き
5. target 配下 `balanceMigrationLogs` に create（証跡フィールドのみ）:
   - `migrationType: "store_managed_to_line"`
   - `sourceUserId`
   - `balances`（上書き後）
   - `createdAt`（serverTimestamp）
   - `note`（入力がある場合のみ）
6. source を update:  
   `isMigrated: true`, `migratedToUserId: targetUserId`, `migratedAt: serverTimestamp`  
   ※ source 残高は **クリアしない**（履歴参照用に保持）
7. 対応関係の保持: 移行元 `migratedToUserId` + 移行先ログ `sourceUserId`。**移行先へ `migratedFromUserId` は書かない**（§6-1 確定）
8. （任意）冪等用ドキュメント。移行証跡には操作者・端末フィールドを書かない

途中失敗は tx ロールバック。部分成功なし。

### 9-9. pokerName

Callable 内で pokerName を変更しない。新旧同一 pokerName は登録時の全体一意制約により通常発生しない。万一同一でも残高移行自体は拒否しない（UI で差分表示）。

### 9-10. 運用ログ

- 成功: `logOpsSuccess`（`functionEntry: migrateStoreManagedUserToLine`, context: sourceUserId, targetUserId, migrationId）
- 失敗: `logOpsError`（予期せぬもの）。業務拒否は `HttpsError` + `details.errorKey`
- 既存共通ログが認証 uid 等を自動記録する場合はそのまま利用してよい
- A-6 専用に `createdByUid` / `actorDeviceId` / `executedBy` を新設せず、移行証跡へも複製しない

---

## 10. 移行済みユーザーの業務ガード

### 10-1. 共通 helper

`assertUserNotMigrated(userId | userData)`:

- `userType` 欠落または不正 → `INVALID_USER_TYPE`（フォールバック・推測なし。確定）
- `userType === "store_managed" && isMigrated === true` →  
  `HttpsError('failed-precondition', '...', { errorKey: 'USER_MIGRATED' })`

A-6 対象操作（初期残高・後日 LINE 化・§10-2 の業務ガード）では、上記を共通適用する。

### 10-2. Functions — 拒否必須

| Callable / helper | 備考 |
|-------------------|------|
| `manualCheckIn` | 入店 |
| `processVisitByQR` | 入店 |
| `createBillWithActiveStay` | 二重防波堤 |
| `depositChip` / `withdrawChip` | |
| `registerForSideGame` | |
| `registerForTournament` | |
| `registerParticipants` | 各 uid |
| `assignSeatToPlayer` | |
| `createOkibakeTemporaryEntry` | linkedUserId 時 |
| `updateOkibakeTemporaryEntryLinkedUser` | |
| `linkOkibakeTemporaryEntryToBill` | |
| `startAccounting`（accounting.ts） | party.userId |
| `setRankingData`（賞品付与） | 移行済みへの付与防止 |
| `setInitialUserBalances` | 対象外 |
| `migrateStoreManagedUserToLine` | 移行元条件で自然に拒否 |

### 10-3. Soft / 変更不要

| 経路 | 分類 |
|------|------|
| `addon` / `bust*` / `leaveSeat` / `placeOrder` | 既存セッション継続。入口は入店・登録で遮断済み |
| `generateQRCode` | 入店入口（`manualCheckIn` / `processVisitByQR` / `createBillWithActiveStay`）で遮断済みのため追加ガードなし |
| `getUserStatus` / 履歴 UI | 過去参照可 |
| 会計完了系で既に settling 中の bill | 移行前検査で拒否済み想定 |

### 10-4. UI — 非表示・選択不可

| 画面 | 対応 |
|------|------|
| okibake link picker | `isMigrated == true` 除外 |
| 管理者ユーザー一覧 | 移行済み店舗管理ユーザーを常に除外 |
| 後日 LINE 化の移行元候補 | `store_managed && !isMigrated` のみ |
| 初期ポイントの対象候補 | 移行済み除外 |

`stayingUsersListPage` は activeStays 起点のため、Functions ガード正本で十分。

---

## 11. 管理者向けユーザー一覧・詳細

### 11-1. 方針

**新規ページ**（既存一覧は入店中専用のため流用しない）。

入口: `AdminHomePage` → 「ユーザー一覧」。

### 11-2. 一覧表示項目

- `pokerName`
- 入店状況（`activeStays` のactiveドキュメントを正本に「入店中」「未入店」）

### 11-3. 詳細表示項目

- `pokerName`
- `birthMonthDay`（店舗向けに月日表示）
- 入店状況
- `lastCheckInAt`
- `pointA` / `pointB` / `sideGameChip`

店舗向け表示では「残高」ではなく「ポイント」と表記する。`loginId`、uid、email、`userType`、`migratedToUserId` 等の内部情報は表示しない。

初期ポイント設定・後日LINE化ボタンは置かない。

### 11-4. 検索・取得

`users` をStream購読し、Flutter側で `pokerName` を検索する。検索対象に `loginId` は含めない。検索結果は完全一致、前方一致、部分一致の順にし、各グループ内は通常の `pokerName` 昇順を維持する。

入店状況は `ActiveStaysService` のactive一覧と結合し、N+1読取を避ける。

アクセス制御: Adminホーム配下に置く。画面は参照専用で、書込系操作は持たない。

### 11-5. 移行済みの扱い

- 移行済み店舗管理ユーザーは常に一覧から除外する
- 移行済み表示トグルは設けない

---

## 12. 初期ポイント設定画面

| 項目 | 内容 |
|------|------|
| 入口 | 詳細設定 → 初期ポイント設定 |
| Route | `AdminInitialBalancePage`（対象選択）→ `AdminInitialPointSettingPage`（設定） |
| 選択 | `pokerName` のみ検索。完全一致 → 前方一致 → 部分一致。移行済み除外 |
| 候補表示 | カードUI。ユーザー名のみ表示し、`loginId`・uid等は非表示 |
| 表示切替 | 初期表示は未設定のみ。トグル「設定済みユーザーのみ表示」で設定済みだけに切替 |
| 設定画面表示 | 現在の3ポイント、`initialBalanceSetAt` |
| 入力 | 3ポイント（必須）、note（任意） |
| 検証 | クライアントで整数・>=0。最終は CF |
| 初回/再設定 | `initialBalanceSetAt` 有無で文言切替。再設定時は「上書き」警告を強調 |
| 確認 | 現在ポイント → 設定後ポイントを並べたDialog。確定で `confirmOverwrite: true` |
| ロック | `_isLoading` + `AbsorbPointer`（既存 Flutter ルール） |
| 成功 | SnackBar + ユーザー再読込。戻った選択画面の状態も更新 |
| 失敗 | SnackBar（errorKey 日本語マップ） |

---

## 13. 後日 LINE 化画面

| 項目 | 内容 |
|------|------|
| 入口 | 詳細設定 → 店舗管理ユーザーから LINEユーザーへの移行 |
| 画面上部 | 目的と3段階の操作手順を表示 |
| 移行元 | `store_managed && !isMigrated` のみ。`pokerName` 検索 |
| 移行先 | `userType == line` のみ。`pokerName` 検索 |
| 検索順位 | 完全一致 → 前方一致 → 部分一致。`loginId` は検索しない |
| 候補一覧 | 常時表示しない。検索欄フォーカス／入力中だけ展開 |
| 候補カード | ユーザー名のみ。`loginId`・uid・`userType` は非表示 |
| 選択後 | 選択カードと「変更」を表示 |
| 比較 | 両方選択後だけ、ユーザー名・移行元の現在ポイント・移行先の現在ポイント・移行後ポイントを表示 |
| 進行中業務 | Functionsで最終判定。拒否時はerrorKey対応メッセージを表示 |
| 確認 | Checkbox「同一人物であることを確認」→ 最終Confirm Dialogで上書きを確認 |
| 送信 | `confirmSamePerson` / `confirmOverwrite` 両方 true |
| 成功 | 旧ユーザーが移行済みになったこと・新ユーザーのポイントを表示 |
| 二重タップ | AbsorbPointer |
| エラー | Functions の errorKey に対応する具体メッセージ。再実行は検査クリア後に可能 |

---

## 14. 権限

### 比較

| ヘルパー | 判定 | A-6 適合 |
|----------|------|----------|
| `requireActiveAdminCaller` | `devices.uid` + `role==admin` + active | **適合** |
| `getCallerDeviceByUid` + `role==admin` + `isActive` | 同上（createStaffByApp / retireStaff と同型） | **適合・採用パターン** |
| `assertAdminDevice(installationId, uid)` | installationId 必須 | UI が installationId を送る必要あり。新規に増やしたくない |
| `requireAdmin` | store_management（admin **または** terminal+営業管理） | **不適合**（要求は admin device のみ） |

### 採用

A-6 新規 Callable および `createUserByApp` は:

```text
request.auth 必須
getCallerDeviceByUid(uid)
isActive(device.status)
device.role === "admin"
```

完成実装では新しい権限helperを作らず、各Callableで `getCallerDeviceByUid` + `isActive` + `role === "admin"` を直接適用した。

`request.auth.uid` は上記の **権限判定にのみ** 使用する。admin 端末の Auth uid であり個人操作者を表さないため、`balanceMigrationLogs` をはじめとする A-6 の永続データへは保存・複製しない。

---

## 15. Firestore Rules

**変更不要。**

既存の次の再帰ワイルドカードが `balanceMigrationLogs` と `balanceMigrationIdempotency` にも適用される。

```text
users/{userId}/{logCollection=**}
```

既存ルールでread可・client write不可となっており、A-6の要件を満たす。書込はAdmin SDKを使うCallableだけが行う。A-6では `firestore.rules` の変更・デプロイを行わない。

read許可範囲の見直しはA-6スコープ外とする。

---

## 16. エラー仕様

`HttpsError` + `details.errorKey`（A-3 `retireStaff` と同系）。

| errorKey | HTTP | 条件 |
|----------|------|------|
| `UNAUTHENTICATED` | unauthenticated | auth なし |
| `PERMISSION_DENIED` | permission-denied | admin device 以外 |
| `INVALID_ARGUMENT` | invalid-argument | 必須欠落・note 長すぎ等 |
| `CONFIRMATION_REQUIRED` | invalid-argument | confirm* が true でない |
| `INVALID_BALANCE` | invalid-argument | 負数・小数・非整数・欠落 |
| `TARGET_USER_NOT_FOUND` | not-found | 初期残高の対象なし |
| `SOURCE_USER_NOT_FOUND` | not-found | 移行元なし |
| `SOURCE_USER_NOT_STORE_MANAGED` | failed-precondition | 移行元が店舗管理ユーザーでない |
| `TARGET_USER_NOT_LINE` | failed-precondition | 移行先が line でない |
| `INVALID_USER_TYPE` | failed-precondition | userType 不正・欠落 |
| `USER_ALREADY_MIGRATED` | failed-precondition | 移行元が既に migrated |
| `USER_MIGRATED` | failed-precondition | 業務操作対象が migrated |
| `USER_HAS_ACTIVE_STAY` | failed-precondition | 入店中 |
| `USER_HAS_UNSETTLED_BILL` | failed-precondition | open/in_progress/settling |
| `USER_HAS_POST_SETTLEMENT_PENDING` | failed-precondition | 会計後未完了 |
| `USER_HAS_ACTIVE_TABLE_SEAT` | failed-precondition | currentTable/Seat |
| `USER_HAS_ACTIVE_TOURNAMENT` | failed-precondition | 未完了トーナメント参加 |
| `USER_HAS_SIDE_GAME_SEAT` | failed-precondition | サイドゲーム着席 |
| `USER_HAS_PENDING_OKIBAKE_LINK` | failed-precondition | 置きバケ進行中リンク |
| `IDEMPOTENCY_CONFLICT` | aborted | 同一 nonce で別 payload |
| `INTERNAL` | internal | 予期せぬ失敗 |

メッセージは日本語短文。詳細は `details` に uid 等を載せてよい。

---

## 17. 冪等性・トランザクション

| リスク | 対策 |
|--------|------|
| 二重タップ | UI AbsorbPointer + CF 側 tx |
| Callable 再送（初期残高） | 任意 `clientNonce` → idempotency doc。無しなら毎回新規ログ（再設定仕様のため許容） |
| Callable 再送（移行） | 同一 source→同一 target 済みなら reused 成功 |
| 同時初期設定 | tx 直列化。最後の書込が勝つ（再設定許可と整合） |
| 同時移行 | tx 内で `isMigrated` 再読取。先勝ちのみ成功 |
| 移行中の残高変動 | tx 内の source/target 残高 read を正とする |
| 移行中の入店 | 進行中検査 + tx。レースは検査と tx の間に入店されるとまずいため、**検査の主要条件（activeStay）を tx 内で再確認** |
| ログのみ／残高のみ | 禁止。単一 tx |

---

## 18. テスト仕様

### 18-1. `setInitialUserBalances`

- LINE / 店舗管理への初回設定
- 3 項目すべて 0
- 正の整数
- 負数・小数・欠落拒否
- 再設定で `initialBalanceSetAt` 更新・ログ追加
- 現在残高非ゼロへの上書き成功
- `balanceMigrationLogs` に `initial_import`、sourceUserId なし
- `pointALogs` が増えないこと
- admin 以外拒否
- 移行済み店舗管理拒否
- ユーザー不存在
- clientNonce 冪等

### 18-2. `migrateStoreManagedUserToLine`

- 正常移行（先残高 0 / 非ゼロ）
- 移行元 LINE拒否 / 移行先店舗管理拒否
- 再移行拒否（別 target）/ 同一 target reused
- 不存在
- `userType` 欠落 → `INVALID_USER_TYPE`
- 進行中業務（§9-7-2 の各条件）で拒否
- 現在営業日の未終了トーナメント参加は拒否し、過去営業日の未終了残留は許可
- ログ `store_managed_to_line` + sourceUserId（移行先に `migratedFromUserId` が無いこと）
- 移行ログに `createdByUid` / 操作端末フィールドが無いこと
- source `isMigrated` 更新
- 移行後 `manualCheckIn` / `depositChip` が `USER_MIGRATED`
- admin 以外拒否
- 部分成功なし（tx）

### 18-3. 登録

- `createUserAccount` → `userType: line`、`isMigrated` 無し
- `createUserByApp` → `store_managed` + `isMigrated: false` + admin 必須

### 18-4. UI（手動チェックリスト）

- ユーザー一覧・詳細の店舗向け表示、入店中／未入店
- `loginId`・uid等の内部情報非表示
- 初期ポイントの選択Route／設定Route
- カードUI、設定済みユーザー切替、移行済み除外
- `pokerName` のみの完全一致／前方一致／部分一致検索
- 後日LINE化の説明、候補展開、選択カード、比較表示
- 確認ダイアログ
- 二重タップ防止
- エラー表示

### 18-5. 完了結果

- Functions単体テスト: 完了
- 移行済みユーザーの業務ガード横断テスト: 完了
- Firebase Emulator統合テスト: 完了
- Flutter helperテスト: 完了
- 実機確認: 完了

---

## 19. 実装順序と完了結果

1. 型・定数・`assertUserNotMigrated` / `validateBalanceTriple`
2. `createUserAccount` / `createUserByApp`（フィールド＋権限）
3. `setInitialUserBalances` + 単体テスト
4. `assertUserFreeForMigration` + `migrateStoreManagedUserToLine` + 単体テスト
5. 業務ガード横展開（入店 → 会計 → トーナメント/chip/置きバケ → setRankingData）
6. Rules変更不要を確認 + `serviceByFunctionEntry`
7. Flutter: Adminホームのユーザー一覧・詳細
8. Flutter: 詳細設定メニュー + 初期ポイント設定の選択Route／設定Route
9. Flutter: 後日LINE化UI
10. okibake pickerの移行済み除外・検索統一
11. 手動テスト・実機確認・正本文書更新

上記はすべて完了した。

---

## 20. 対象外

詳細仕様 §15 に加え、本 changeSpec でも次を実施しない。

- `point*Logs` への移行記録
- Auth / ドキュメント統合
- CSV
- 店舗運用向けのユーザー一括補正・一括移行機能
- 会計ログ不足の是正
- `ART-304` 作成
- rules の read 全許可見直し
- 移行先への `migratedFromUserId` 追加

---

## 21. 未決事項

**なし。**（旧 U-01〜U-04 は本改訂で確定または対象外として削除）

---

## 22. 実機確認（デプロイ後）

**ステータス: 完了（2026-07-17）**

次のA-6主要導線を実機で確認済み。

1. LINEユーザー・店舗管理ユーザーの種別付与
2. 初期ポイント設定（初回・再設定）
3. Adminホームのユーザー一覧・ユーザー詳細
4. 店舗管理ユーザーからLINEユーザーへの後日LINE化
5. 移行済み店舗管理ユーザーの候補除外・業務拒否
6. 後日LINE化の進行中業務ガードとエラー表示
