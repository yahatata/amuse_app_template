# テスト側の問題 修正方針

テスト側に問題があると断言できる失敗テストについて、修正方針をまとめたドキュメント。

---

## 1. 認証（auth）未設定

### 対象

以下の callable テストは `auth: null` を渡しているが、実装は `request.auth` を必須としている。

| ファイル | 該当テスト数 |
|----------|--------------|
| addon.spec.ts | 5 |
| depositTip.spec.ts | 2 |
| withdrawTip.spec.ts | 2 |
| assignSeatToPlayer.spec.ts | 3 |
| bustAndExit.spec.ts | 5 |
| bustAndReentry.spec.ts | 4 |
| bulkAddon.spec.ts | 3 |
| reseatAllPlayers.spec.ts | 2 |

### 原因

- `mockRequest` で `auth: null` を渡している
- callable の冒頭で `if (!request.auth) throw new HttpsError('unauthenticated', '認証が必要です')` となり、認証より先に失敗する

### 修正方針

1. **`auth` を有効な値に変更する**
   - `auth: null` → `auth: { uid: 'admin-xxx' }` など、callable が期待する uid を渡す

2. **呼び出し元 uid に対応するデバイスを登録する**
   - callable は `getCallerDeviceByUid(auth.uid)` でデバイスを参照する
   - テストの `beforeEach` または各テスト内で、`devices` コレクションに該当 uid のドキュメントを作成する
   - `getCallerDeviceByUid` は `devices.where("uid", "==", uid)` で検索するため、`.add()` で uid フィールド付きドキュメントを作成する（`.doc(id).set()` の場合は uid を必ず含める）

3. **operationId を data に追加する**
   - addon, bustAndExit, bustAndReentry, assignSeatToPlayer, reseatAllPlayers は `operationId` が必須
   - bulkAddon は operationId が optional のため不要

4. **共通ヘルパの追加**

   ```ts
   async function createAdminDevice(uid: string) {
     await db.collection('devices').add({
       uid,
       role: 'admin',
       status: 'active',
       name: 'Test Admin Device',
       createdAt: admin.firestore.FieldValue.serverTimestamp(),
     });
   }
   ```

4. **各テストでの適用パターン**
   - callable を呼ぶ前に `await createAdminDevice(adminId)` を実行
   - `mockRequest` を `auth: { uid: adminId }` に変更
   - adminId はテストごとにユニークにしてもよい（例: `admin_test_addon_001`）

### 注意

- `assignSeatToPlayer` は `operationId` が必須の可能性あり。スキーマを確認して `data` に含める
- `bulkAddon` は複数 userId を扱うため、呼び出し元 uid（admin）と処理対象 userId を分けて考える

---

## 2. accounting.spec.ts の paymentMethodsByAmount 不足

### 対象

- テスト: `meta.paymentMethodsByCategory が保存されること`
- エラー: `支払い方法が指定されていません`（invalid-argument）

### 原因

- テストは `paymentMethodsByCategory` のみを `data` に渡している
- 実装は `normalizedPaymentMethods` を `paymentMethodsByAmount` から導出しており、`paymentMethodsByAmount` が空だとエラーになる

### 修正方針

1. `meta.paymentMethodsByCategory が保存されること` の `mockRequest.data` に `paymentMethodsByAmount` を追加する

2. **修正例**

   ```ts
   const mockRequest = {
     auth: { uid: adminId },
     data: {
       billId,
       clientNonce,
       paymentMethodsByAmount: {     // 追加
         cash: 2000,
       },
       paymentMethodsByCategory,
     },
   };
   ```

3. 既存の happy path と同じように `paymentMethodsByAmount` を渡しつつ、`paymentMethodsByCategory` が保存されることを検証する形にする

---

## 3. cancel_restore_startAt.spec.ts のセットアップ不足

### 対象

- テスト: C-1（startAt 編集）、C-3（旧 planHash と不一致で no-op）
- ログ: `skipping recurrence with missing/invalid storeId/tenantId`、`device has no name`

### 原因

1. **recurrence の storeId/tenantId**
   - `generateRecurringTournaments` が recurrence の `storeId` / `tenantId` を検証している
   - テストで作成する recurrence ドキュメントに `storeId` / `tenantId` が無い、または不正

2. **デバイスの name**
   - `getCallerDeviceByUid` で `name` が無いと警告が出る（動作は継続）
   - テストで作成する device に `name` が無い

### 修正方針

1. **storeId/tenantId に default-store / default-tenant を使わない**
   - `isProductionRuntime()` が true の環境（Jest 等）では `validateStoreTenantForProduction` が `default-store` / `default-tenant` を拒否する
   - テストでは `storeId: 'test-store-cancel-restore'`, `tenantId: 'test-tenant-cancel-restore'` など別の値を使う

2. **recurrence / scheduledTournament に storeId/tenantId をセットする**
   - `createTournamentRecurrence` や `scheduledTournament` 作成時に上記の storeId/tenantId をセットする
   - `generateRecurringTournamentsCore` の `validateStoreTenantForProduction` やプロダクション判定の挙動を確認し、テスト環境でスキップされないようにする

3. **デバイスに name を追加**
   - device 作成時の `add` / `set` に `name: 'Test Admin Device'` を追加
   - `createAdminDevice` 相当のヘルパを使う場合は、そのヘルパに `name` を含める

4. **実装の依存関係**
   - `generateRecurringTournamentsCore` が `isProductionRuntime()` で分岐している場合は、テスト時はプロダクションでない前提で動くか確認する
   - 必要であれば、テスト用の storeId/tenantId が許容されるようモックや環境変数で調整する

---

## 4. 修正の実施順序

推奨順序:

1. **認証・デバイス系（8ファイル）**  
   addon, depositTip, withdrawTip, assignSeatToPlayer, bustAndExit, bustAndReentry, bulkAddon, reseatAllPlayers

2. **accounting.spec.ts**  
   `paymentMethodsByAmount` の追加

3. **cancel_restore_startAt.spec.ts**  
   storeId/tenantId と device の `name` のセットアップ

---

## 5. 参照

- `accounting.spec.ts`、`cancelAccounting.spec.ts` などは既に `createAdminDevice` と `auth: { uid }` を正しく使用している
- `devicePermissions.ts` の `getCallerDeviceByUid` は `devices` を `uid` で検索する
- `devicePermissions.ts` の `isActive` は `status` が未設定の場合も `"active"` として扱う（`?? "active"`）
