# Phase6.5 仕様書: 営業管理操作の権限拡張（store_management オプション）

## 1. 目的

- **現状**: 営業管理に係る操作（開閉店・未会計取得/付与・閉店/開店ターミナル・閉店時クリーンアップ等）は、デバイスの `role === 'admin'` の端末のみ実行可能である。
- **変更後**: `role` が `terminal` であっても、オプション `store_management: true` が付与されている端末は、上記の営業管理操作を **admin と同様に** 実行可能とする。

対象は Phase1 および Phase6 Step2・Step3 で導入した「admin のみ実施可能」としている営業管理関連の操作すべてとする。Flutter 側では、店舗の営業管理用に既に用意されている **`store_management` オプション**（`DeviceOptionKeys.storeManagement`）を「営業管理可能」の判定に用いる。Phase6 Step4 の強警告における「admin 端末／非 admin 端末」の表示分岐も、既存の「role == admin または options.store_management == true」のパターンで「営業管理可能端末／不可端末」として扱う。

### 前提（本 Phase で確定）

- **1 uid = 1 端末**: 仕様上、`devices` コレクションでは **uid で一意**（1 uid に 1 端末）を前提とする。実装は `where('uid','==',uid).limit(2).get()` で取得し、**0 件の場合は permission-denied**、**2 件以上の場合はデータ不整合とみなし permission-denied**、1 件だけの場合のみ次へ進む（「先頭 1 件」で進めると事故時の挙動が非決定的になるため、複数は許容しない）。
- **admin と options**: `role === 'admin'` の端末は **options を参照しない**（無条件に営業管理可能）。`hasStoreManagementPermission` では admin のとき `true` を返し、options には触れない。
- **role の運用**: 本 Phase では `role` は **admin / terminal の 2 種のみ**運用する前提とする。欠損や想定外の値の場合は「営業管理可能」とみなさず、permission-denied とする（安全側）。
- **options.store_management の更新経路**: `devices.options.store_management` が権限昇格になるため、**admin のみが設定可能**である前提とする（例: `updateDeviceOptions` Callable および Firestore Security Rules で担保）。

---

## 2. 権限の定義

### 2.1 「営業管理可能」の判定

次の**すべて**を満たす端末を **営業管理可能** とする。

1. **有効性**: `devices/{id}.status === 'active'`（未設定の場合は `devicePermissions.ts` の `isActive` と同様に `"active"` とみなす）。それ以外（例: blocked, retired）の場合は拒否する。
2. **権限**: 次のいずれか。
   - `devices/{id}.role === 'admin'`（このとき **options は参照しない**。無条件に営業管理可能。）
   - または `devices/{id}.role === 'terminal'` かつ `devices/{id}.options.store_management === true`

`role` が `admin` でも `terminal` でもない、または `options` 欠損等で上記を満たさない場合は **拒否**（安全側）。

オプションキーは Firestore 上では `store_management`（スネーク_case）とする。これは **既に Flutter に用意されている** `lib/services/device_options.dart` の `DeviceOptionKeys.storeManagement = 'store_management'`（営業管理用オプション）と同一である。

**運用ルール（Functions 側）**: 本 Phase で触る営業管理系の権限チェックは、**常に「isActive(device.status) かつ hasStoreManagementPermission(device)」の両方を満たすこと**を要求する。`hasStoreManagementPermission` は権限のみを判定し、有効性（status）は呼び出し元または requireAdmin 内で `isActive` を参照する。各 Callable／requireAdmin の仕様はこのルールの適用例である。

### 2.2 対象外

以下は本 Phase の対象外とする。

- `getAccountingHistory`（会計履歴取得・admin のみ）: 営業管理ではなく会計管理のため変更しない。
- `migrateTodaysBills` / `updateStaffBankInfo` / `updateStaffHourlyWage` 等の admin 専用 Callable。
- `updateDeviceOptions`（デバイスオプション変更・admin のみ）。
- シフトまわり（`shift/helpers.ts` の `requireAdminDevice`、`shift/finalizeDay.ts` 等）: 営業管理とは別ドメインのため変更しない。
- `createInitialStateDocCallable`: 現状権限チェックなしのため、本 Phase では触れない。

---

## 3. 修正箇所の網羅（実コードに基づく一覧）

以下はすべて実コードを確認したうえで列挙している。

### 3.1 Functions（バックエンド）

| # | ファイル | 現状の権限チェック | device.status / isActive | 備考 |
|---|----------|-------------------|--------------------------|------|
| 1 | `functions/src/close_process/requireAdmin.ts` | `devices` を `uid` 一致かつ `role === 'admin'` で検索。1件もなければ `permission-denied`。 | **参照していない** | getUnsettledBillsForClose, applyCloseSnapshot, finalizeUnsettledBillAfterAccounting, closeStoreTerminal, openStoreTerminal が利用。 |
| 2 | `functions/src/storeManagement/openStore.ts` | `getCallerDeviceByUid(callerUid)` 取得後、`!device \|\| !isActive(device.status)` で弾き、続けて `device.role !== 'admin'` で拒否。 | **isActive を参照している** | requireAdmin は使っていない。 |
| 3 | `functions/src/storeManagement/closeStore.ts` | 上記 openStore と同様。 | **isActive を参照している** | 同上。 |
| 4 | `functions/src/close_process/cleanupActiveStaysOnClose.ts` | `devices` を `uid` 一致かつ `role === 'admin'` で検索。empty なら `permission-denied`。 | **参照していない** | requireAdmin は使っておらず、自前でクエリ。 |

**実コード確認結果**: openStore / closeStore は `devicePermissions.isActive(device.status)` で有効性を確認している。requireAdmin と cleanupActiveStaysOnClose は **status を参照していない**。Phase6.5 では、営業管理系の全 Callable で「権限＋有効性（isActive）」を揃えるため、**requireAdmin 内で isActive をチェックする**ことと、**cleanup では getCallerDeviceByUid 利用時に isActive も判定する**ことを仕様で統一する。

### 3.2 Functions の共通ヘルパー

| # | ファイル | 役割 | 修正内容 |
|---|----------|------|----------|
| 5 | `functions/src/lib/devicePermissions.ts` | `getCallerDeviceByUid`, `hasRequiredOption`, `isActive` を提供。 | 「営業管理可能」判定用の `hasStoreManagementPermission(device: DeviceDoc): boolean` を追加する。 |

### 3.3 Flutter（アプリ）— 既存の store_management オプションを使用

**前提**: 店舗の営業管理用に、既に **`store_management`** オプションが用意されている。

- **定義**: `lib/services/device_options.dart` の `DeviceOptionKeys.storeManagement = 'store_management'`。ラベル「営業管理」、説明「営業時間・開店・閉店など店舗の営業状態の管理操作が可能になります。」で `DeviceOptionKeys.all` にも含まれる。
- **Firestore**: デバイスドキュメントの `options` に `store_management: true` を付与すると、その端末は営業管理操作が可能であることを示す。

| # | ファイル | 現状 | 修正要否 |
|---|----------|------|----------|
| - | `lib/services/device_options.dart` | `storeManagement = 'store_management'` が既に定義済み。 | **変更不要**。既存のオプションをそのまま「営業管理可能」の判定に用いる。 |
| - | `lib/services/device_service.dart` | `isAdmin()` は `device?.role == 'admin'` のみ。他に営業管理専用のメソッドはない。 | **変更不要**。営業管理可能かどうかは「role == admin または options.store_management == true」で判定する。新規メソッド（例: canManageStore）は追加しない。既存の store_management オプションを正とする。 |
| - | `lib/Home/terminalHomePage.dart` | 開閉店管理ボタン（AppBar）: `_isAdminDevice \|\| _deviceOptions[DeviceOptionKeys.storeManagement] == true`。テスト用「営業管理」ボタン: `showStoreManagementButton = _isAdminDevice \|\| _deviceOptions[DeviceOptionKeys.storeManagement] == true`。 | **変更不要**。既に store_management 付き terminal でボタンが表示され、Callable 側を修正すれば permission-denied にならない。 |

**結論（3.3）**: Flutter では **`canManageStore()` のような新規メソッドは追加しない**。営業管理可能かどうかは、既存の **`store_management` オプション**（と role == admin）で判定する。terminalHomePage は既にそのパターンで表示制御しているため、**Phase6.5 で Flutter の修正は不要**。バックエンド（Functions）の権限拡張のみ行う。

その他、システム設定画面の「未会計billsの移管」カードや未会計の会計ページ（UnsettledAccountingPage）は、バックエンドの getUnsettledBillsForClose / applyCloseSnapshot / finalizeUnsettledBillAfterAccounting の権限のみに依存しており、フロントで admin 専用の表示制御はしていない（実コード確認済み）。したがって **Functions の権限拡張だけで**、store_management 付き terminal からも利用可能になる。

---

## 4. 具体的な修正仕様

**エラー文言の統一**: 本 Phase で対象とする営業管理系 Callable（§3.1 および §5 で列挙する、requireAdmin を利用する Callable と openStore / closeStore / cleanupActiveStaysOnClose）が `permission-denied` を返す場合、メッセージは **「営業管理の権限がありません」** に統一する（現状の「管理者権限がありません」「管理者権限が必要です」を置き換える）。

### 4.1 `functions/src/lib/devicePermissions.ts`

**追加する関数**

- 関数名: `hasStoreManagementPermission(device: DeviceDoc): boolean`
- 戻り値（**権限のみ**。有効性 status は呼び出し元で `isActive` を参照すること）:  
  - `device.role === 'admin'` のとき **options を参照せず** `true`  
  - `device.role === 'terminal'` かつ `hasRequiredOption(device.options, 'store_management')` のとき `true`  
  - 上記以外（role 欠損・想定外値・terminal で store_management が true でない）は `false`
- オプションキーは文字列 `'store_management'` を使用（Firestore の `options` のキーと一致）。

**既存**: `hasRequiredOption` はそのまま利用。`DeviceDoc` の `status` は `devicePermissions.ts` では `data?.status ?? "active"` で、`isActive(status)` は `(status ?? "active") === "active"` である（実コードどおり）。

---

### 4.2 `functions/src/close_process/requireAdmin.ts`

**名前と役割**: 関数名は **`requireAdmin` のまま**とする。Phase6.5 以降は「**営業管理可能であること**（admin または terminal＋store_management）を要求する」共通ヘルパーとして扱う。コメント・ドキュメントでその旨を明記すること。

**現状（要約）**

- `db.collection('devices').where('uid', '==', uid).where('role', '==', 'admin').limit(1).get()`
- `deviceQuery.empty` なら `HttpsError('permission-denied', '管理者権限がありません')`
- **status / isActive は参照していない**（実コード確認済み）

**変更後**

1. `uid`（認証された caller の uid）に紐づくデバイスを取得する。  
   - クエリ: `db.collection('devices').where('uid', '==', uid).limit(2).get()` で取得し、**0 件なら permission-denied**、**2 件以上ならデータ不整合として permission-denied**、**1 件だけなら**次へ進む。
2. 取得結果が empty: `HttpsError('permission-denied', '営業管理の権限がありません')`（文言は **営業管理に統一**。§4 末尾のエラー文言方針に合わせる）。
3. 1 件取れた場合: doc から `role`, `options`, `status` を取得し、**有効性** `isActive(device.status)` と **権限** `hasStoreManagementPermission(device)` の**両方**を確認する。  
   - `!isActive(device.status)` または `!hasStoreManagementPermission(device)` なら `HttpsError('permission-denied', '営業管理の権限がありません')`。  
   - 両方満たせば通過。
4. device の組み立てでは `devicePermissions.ts` の `DeviceDoc` と同様に `status: data?.status ?? "active"` とする（実コードの getCallerDeviceByUid に合わせる）。  
5. `requireAdmin` は `getCallerDeviceByUid` に依存せず、引数 `db` で `devices` を 1 件取得し、自前で device を組み立てる。

**実装イメージ（requireAdmin 内）**

- `const snap = await db.collection('devices').where('uid', '==', uid).limit(2).get();`
- `if (snap.empty || snap.size > 1) throw new HttpsError('permission-denied', '営業管理の権限がありません');`
- `const doc = snap.docs[0]; const data = doc.data();`
- `const device = { id: doc.id, role: data?.role ?? 'terminal', options: data?.options ?? {}, status: data?.status ?? 'active' };`
- `if (!isActive(device.status) || !hasStoreManagementPermission(device)) throw new HttpsError('permission-denied', '営業管理の権限がありません');`

**import**: `hasStoreManagementPermission` と `isActive` を `devicePermissions.ts` から import（`getFirestore` に依存しない関数のみ）。

---

### 4.3 `functions/src/storeManagement/openStore.ts`

**現状**

- `const device = await getCallerDeviceByUid(callerUid);`
- `if (device.role !== 'admin') { throw new HttpsError('permission-denied', '管理者権限が必要です'); }`

**変更後**

- `getCallerDeviceByUid` と **既存の `!device || !isActive(device.status)` チェックはそのまま**維持する（有効性は既に確認済み）。
- 判定を `hasStoreManagementPermission(device)` に変更:  
  - `if (!hasStoreManagementPermission(device)) { throw new HttpsError('permission-denied', '営業管理の権限がありません'); }`  
  - エラー文言は **「営業管理の権限がありません」に統一**（§4 エラー文言方針）。

**import の追加**: `hasStoreManagementPermission` を `../lib/devicePermissions` から import。

---

### 4.4 `functions/src/storeManagement/closeStore.ts`

**現状**

- `const device = await getCallerDeviceByUid(callerUid);`
- `if (device.role !== 'admin') { throw new HttpsError('permission-denied', '管理者権限が必要です'); }`

**変更後**

- openStore と同様に、**既存の `!device || !isActive(device.status)` はそのまま**、`hasStoreManagementPermission(device)` が `false` のときに `permission-denied`。エラー文言は「営業管理の権限がありません」に統一。
- `hasStoreManagementPermission` を `../lib/devicePermissions` から import。

---

### 4.5 `functions/src/close_process/cleanupActiveStaysOnClose.ts`

**現状**

- `db.collection('devices').where('uid', '==', adminId).where('role', '==', 'admin').limit(1).get()`（ここでの **adminId は実装上の変数名で、実態は request.auth.uid＝caller の uid**。仕様書では以下 callerUid または uid と表記する。）
- `deviceQuery.empty` なら `permission-denied`。

**変更後**

- **getCallerDeviceByUid(callerUid)** を使用する（callerUid = request.auth.uid）。openStore / closeStore と同様に **有効性（isActive）と権限（hasStoreManagementPermission）の両方**を確認する。  
  - `const callerUid = request.auth.uid;` のうえで `const device = await getCallerDeviceByUid(callerUid);`  
  - `if (!device || !isActive(device.status) || !hasStoreManagementPermission(device)) throw new HttpsError('permission-denied', '営業管理の権限がありません');`  
- 現状の自前クエリ（uid + role==admin）は廃止し、devicePermissions のヘルパーに統一する。エラー文言は「営業管理の権限がありません」に統一。
- **import**: `getCallerDeviceByUid`, `hasStoreManagementPermission`, `isActive` を `../lib/devicePermissions` から import。

---

### 4.6 Flutter（`lib/Home/terminalHomePage.dart` 等）— 変更不要

- **営業管理可能**の判定は、既存の **`store_management` オプション** を用いる。新規メソッド（`canManageStore()` 等）は追加しない。
- 開閉店管理ボタン（AppBar）は既に `_isAdminDevice || _deviceOptions[DeviceOptionKeys.storeManagement] == true` で表示している（1082–1083 行付近）。
- テスト用「営業管理」ボタンも `showStoreManagementButton = _isAdminDevice || _deviceOptions[DeviceOptionKeys.storeManagement] == true` で表示している。
- バックエンドを Phase6.5 のとおりに修正すれば、store_management 付き terminal からも getUnsettledBillsForClose / closeStoreTerminal / openStoreTerminal 等が通るため、**Flutter 側の追加修正は不要**。

---

## 5. requireAdmin を利用している Callable（変更不要・一括で効く）

以下の Callable は `requireAdmin(db, adminId)` を呼んでいるだけなので、**requireAdmin の実装変更だけで** store_management 付き terminal から実行可能になる。各ファイルの修正は不要。

- `functions/src/close_process/getUnsettledBillsForClose.ts`
- `functions/src/close_process/applyCloseSnapshot.ts`
- `functions/src/close_process/finalizeUnsettledBillAfterAccounting.ts`
- `functions/src/storeManagement/closeStoreTerminal.ts`
- `functions/src/storeManagement/openStoreTerminal.ts`

---

## 6. テスト・検証

- **単体テスト**: `requireAdmin` をモックまたは db 注入でテストする場合、  
  - `role: 'admin'` の device → 通過  
  - `role: 'terminal'`, `options: { store_management: true }` の device → 通過  
  - `role: 'terminal'`, `options: {}` または `store_management: false` → permission-denied  
  を確認する。
- **既存テスト**: `functions/__tests__/close_process/step3.spec.ts` や `functions/__tests__/storeManagement/step3.spec.ts` では、`devices` に `role: 'admin'` を設定している。store_management 付き terminal で通過するケースを追加する場合は、`role: 'terminal'`, `options: { store_management: true }` の device で同様のシナリオを実行する。
- **手動確認**: 端末で `role: 'terminal'` かつ `options.store_management: true` のデバイスを用意し、開閉店管理から閉店・開店、未会計の会計、システム設定の「未会計billsの移管」が permission-denied にならないことを確認する。

---

## 7. Phase6 Step4 との関係

- Phase6 Step4 の仕様では「admin 端末」「非 admin 端末」で強警告の表示・解除操作の有無が分かれる。
- 本 Phase の適用後は、**「営業管理可能端末」（admin または store_management 付き terminal）** が解除操作を持ち、それ以外が「管理端末または管理者に依頼してください」となるようにするのが一貫している。
- Step4 を実装する際、Flutter 側で**営業管理の解除操作を表示するかどうか**の判定には、既存の **`store_management` オプション** を用いる。つまり `_isAdminDevice || _deviceOptions[DeviceOptionKeys.storeManagement] == true` のパターン（または `device?.role == 'admin' || device?.options[DeviceOptionKeys.storeManagement] == true`）を使う。`canManageStore()` のような新規メソッドは追加せず、既存オプションで統一する。

---

## 8. まとめ（修正ファイル一覧）

**Flutter**: 既に **`store_management` オプション**（`DeviceOptionKeys.storeManagement`）が用意されており、terminalHomePage で開閉店管理ボタン等の表示に利用されている。**Phase6.5 では Flutter の修正は不要**。営業管理可能の判定は既存オプションに統一し、`canManageStore()` 等の新規メソッドは追加しない。

**Functions（修正が必要なファイルのみ）**:

| 種別 | ファイル | 修正内容 |
|------|----------|----------|
| Functions | `functions/src/lib/devicePermissions.ts` | `hasStoreManagementPermission(device)` を追加（既存の `store_management` オプションを参照）。 |
| Functions | `functions/src/close_process/requireAdmin.ts` | uid で device 1 件取得に変更し、**isActive(device.status) && hasStoreManagementPermission(device)** の両方を満たす場合に通過、それ以外は permission-denied。 |
| Functions | `functions/src/storeManagement/openStore.ts` | 既存の isActive チェックは維持。`device.role !== 'admin'` を `!hasStoreManagementPermission(device)` に変更。 |
| Functions | `functions/src/storeManagement/closeStore.ts` | 同上。 |
| Functions | `functions/src/close_process/cleanupActiveStaysOnClose.ts` | 自前クエリを廃止し、**getCallerDeviceByUid(uid)** で device を取得。**isActive(device.status) && hasStoreManagementPermission(device)** の両方を満たす場合にのみ通過、それ以外は permission-denied。 |

**Flutter**: 変更なし（既に store_management オプションでボタン表示・判定済み）。

以上により、`role: 'terminal'` かつ `options.store_management === true` の端末が、admin と同様に営業管理操作を実行できるようになる。

---

## 9. 修正箇所と具体的な修正仕様の再まとめ（3.3 認識反映後）

### 認識の整理

- **store_management**: 店舗の営業管理用に **既に用意されている** オプション（`DeviceOptionKeys.storeManagement = 'store_management'`）。Flutter では開閉店管理ボタン等の表示に既に使用されている。
- **営業管理可能**の判定は、**この既存オプション**（と role == admin）で行う。`canManageStore()` のような新規メソッドは追加しない。

### 修正が必要な箇所（網羅）

| 対象 | ファイル | 修正要否 | 内容 |
|------|----------|----------|------|
| Functions 共通 | `functions/src/lib/devicePermissions.ts` | **要** | 既存の `store_management` オプションを参照する `hasStoreManagementPermission(device)` を追加。 |
| Functions | `functions/src/close_process/requireAdmin.ts` | **要** | uid で device 取得。**isActive(device.status) && hasStoreManagementPermission(device)** の両方を満たす場合に通過。複数件の場合は不整合として permission-denied。 |
| Functions | `functions/src/storeManagement/openStore.ts` | **要** | 既存の isActive は維持。`device.role !== 'admin'` を `!hasStoreManagementPermission(device)` に変更。 |
| Functions | `functions/src/storeManagement/closeStore.ts` | **要** | 同上。 |
| Functions | `functions/src/close_process/cleanupActiveStaysOnClose.ts` | **要** | getCallerDeviceByUid(callerUid) で device 取得。**isActive(device.status) && hasStoreManagementPermission(device)** の両方を満たす場合に通過。 |
| Flutter | `lib/services/device_options.dart` | 不要 | 既に store_management 定義済み。 |
| Flutter | `lib/services/device_service.dart` | 不要 | 新規メソッドは追加しない。既存オプションで判定。 |
| Flutter | `lib/Home/terminalHomePage.dart` | 不要 | 既に `_isAdminDevice \|\| _deviceOptions[DeviceOptionKeys.storeManagement] == true` で表示済み。 |

### 具体的な修正仕様（実装時に参照）

1. **devicePermissions.ts**  
   - `hasStoreManagementPermission(device: DeviceDoc): boolean` を追加。  
   - 戻り値: `device.role === 'admin' || (device.role === 'terminal' && hasRequiredOption(device.options, 'store_management'))`。オプションキーは既存と一致させるため `'store_management'`。

2. **requireAdmin.ts**  
   - クエリを `where('uid','==',uid).limit(2)` に変更（`where('role','==','admin')` を削除）。0 件または 2 件以上なら permission-denied、1 件だけ取得した doc から `role`, `options`, `status` を組み立て、**isActive(device.status)** と **hasStoreManagementPermission(device)** の両方が true なら通過、それ以外は permission-denied（文言は「営業管理の権限がありません」）。

3. **openStore.ts / closeStore.ts**  
   - 既存の `!device || !isActive(device.status)` は維持。`if (device.role !== 'admin')` を `if (!hasStoreManagementPermission(device))` に変更。エラー文言は「営業管理の権限がありません」に統一。  
   - `hasStoreManagementPermission` を devicePermissions から import。

4. **cleanupActiveStaysOnClose.ts**  
   - 自前クエリを廃止し、**getCallerDeviceByUid(callerUid)**（callerUid = request.auth.uid）で device を取得。`!device || !isActive(device.status) || !hasStoreManagementPermission(device)` のとき permission-denied（「営業管理の権限がありません」）。  
   - devicePermissions から `getCallerDeviceByUid`, `hasStoreManagementPermission`, `isActive` を import。

5. **Flutter**  
   - 変更なし。Phase6 Step4 実装時も、営業管理の解除操作の有無は既存の「`_isAdminDevice || _deviceOptions[DeviceOptionKeys.storeManagement] == true`」で判定する。

---

## 変更点サマリ（実コード確認に基づく仕様書修正）

- **前提の明文化**: 「1 uid = 1 端末」「admin は options を参照しない」「role は admin / terminal の 2 種のみ運用」を本文の前提として追記。0 件時は permission-denied、**複数件取得時はデータ不整合として permission-denied**（先頭 1 件は使わない）。想定外 role や options 欠損は拒否（安全側）。**options.store_management の更新経路**は admin のみが設定可能である前提を 1 行追記した。
- **営業管理可能の定義**: 「有効性（status === 'active'）＋権限（admin または terminal＋store_management）」の両方を満たすことを必須にし、admin の場合は options を参照しない旨を 2.1 に追記した。
- **device.status / isActive の扱い**: 実コードで requireAdmin と cleanup は status を参照しておらず、openStore / closeStore のみ isActive を参照している事実を 3.1 の表と説明に反映。営業管理系で「権限＋有効性」を統一するため、requireAdmin 内で isActive をチェックする仕様に変更し、cleanup では getCallerDeviceByUid 利用時に isActive も判定するよう 4.2・4.5 に明記した。
- **requireAdmin の名前と役割**: 関数名は requireAdmin のまま、Phase6.5 以降は「営業管理可能であることを要求する」ヘルパーとして扱う旨を 4.2 に追記した。
- **エラー文言の統一**: 対象を「本 Phase で対象とする営業管理系 Callable（§3.1 および §5 列挙）」と明記し、そのすべてで「営業管理の権限がありません」に統一する旨を §4 冒頭に記載した。
- **hasStoreManagementPermission**: admin のとき options を参照しないこと、および想定外 role / 欠損時は false とすることを 4.1 に追記。DeviceDoc の status と isActive の実コード仕様（data?.status ?? "active"、(status ?? "active") === "active"）を 4.1 に記載した。
- **§2.1 運用ルール**: 「営業管理系の権限チェックは常に isActive && hasStoreManagementPermission とする」を 1 箇所のルールとして §2.1 末尾に追記し、各ファイル仕様はその適用例であることを明示した。
- **§8 修正ファイル一覧**: requireAdmin を「uid で 1 件取得 + isActive(status) && hasStoreManagementPermission」、cleanup を「getCallerDeviceByUid(uid) + isActive(status) && hasStoreManagementPermission」と明記し、isActive の入れ忘れを防いだ。
- **adminId と uid**: cleanup の説明で、実装の adminId は request.auth.uid（caller の uid）を指す旨を注記し、仕様書では callerUid/uid と表記することを 4.5 に追記した。
- **§9 の具体的な修正仕様**: requireAdmin で isActive を必須にしたこと、cleanup で getCallerDeviceByUid(callerUid)＋isActive＋hasStoreManagementPermission に統一したこと、エラー文言の対象範囲を明記したことを反映した。
