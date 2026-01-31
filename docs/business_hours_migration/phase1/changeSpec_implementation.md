# Phase1: state doc導入 - 実装詳細仕様書

## 概要

Phase1では、単一状態ドキュメント（`storeMeta/currentBusinessDay`）を導入し、Functions側で現在営業日を取得するためのヘルパー関数と、手動開店/閉店機能を実装する。

## 実装タスク

### 1. `storeMeta/currentBusinessDay`ドキュメントの作成

#### 1.1 初期ドキュメント作成スクリプト

**ファイル**: `functions/src/scripts/createInitialStateDoc.ts`（新規作成）

**実装内容**:
- Firestoreに`storeMeta/currentBusinessDay`ドキュメントを作成するローカルスクリプト
- 初期状態:
  ```typescript
  {
    status: 'closed',
    currentBusinessDateKey: null,
    lastClosedBusinessDateKey: null,
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    source: 'initial',
    lastError: null
  }
  ```
- 既に存在する場合はスキップ（冪等性）

**実行方法（ローカルスクリプト方式）**:
- Node.jsスクリプトとして実装（`ts-node`または`tsx`で実行）
- **前提条件**:
  - Firebase Admin SDKの認証情報が設定されている（環境変数`GOOGLE_APPLICATION_CREDENTIALS`またはデフォルト認証）
  - Firebase Admin SDKが初期化されている（`admin.initializeApp()`）
- **実行コマンド例**:
  ```bash
  # functionsディレクトリで実行
  npx ts-node src/scripts/createInitialStateDoc.ts
  # または
  npx tsx src/scripts/createInitialStateDoc.ts
  ```
- **注意事項**:
  - 本番環境では、適切な権限を持つアカウントで実行すること
  - 開発環境では、Firebase Emulatorを使用する場合は、エミュレータ接続設定が必要

#### 1.2 Firestore Rulesの更新

**ファイル**: `firestore.rules`

**実装内容**:
- `storeMeta/currentBusinessDay`ドキュメントのみに限定してルールを追加
- 読み取り: 全ユーザー許可（UIがsnapshot購読するため）
  - 必要に応じて`staff`/`admin`に限定することも可能（最終判断はユーザー）
- 書き込み: Functions経由のみ（UIからの直接書き込み禁止）
- 例（既存の`firestore.rules`構造に合わせて追加）:
  ```javascript
  // storeMeta/currentBusinessDay コレクション
  match /storeMeta/currentBusinessDay {
    // 読み取り: 全ユーザー許可（UIがsnapshot購読するため）
    // 必要に応じて request.auth != null や staff/admin チェックに変更可能
    allow read: if true;
    // 書き込み: Functions経由のみ（UIからの直接書き込み禁止）
    allow write: if false; // Functionsはadmin権限で実行されるため
  }
  
  // storeMeta/currentBusinessDay/logs サブコレクション
  match /storeMeta/currentBusinessDay/logs/{logId} {
    // 読み取り: 全ユーザー許可（必要に応じて制限可能）
    allow read: if true;
    // 書き込み: Functions経由のみ
    allow write: if false;
  }
  ```
- **注意事項**:
  - `storeMeta`配下の他のドキュメントには影響を与えない（`currentBusinessDay`のみに限定）
  - 既存の`firestore.rules`の構造（`match /{collection}/{id}`形式）に合わせて追加する

---

### 2. `getCurrentBusinessDateKeyOrThrow()`関数の実装

#### 2.1 関数定義

**ファイル**: `functions/src/helpers/stateDoc/getCurrentBusinessDateKeyOrThrow.ts`（新規作成）

**関数シグネチャ**:
```typescript
/**
 * storeMeta/currentBusinessDayから現在営業日を取得する
 * 
 * @returns 現在営業日（YYYY-MM-DD形式）
 * @throws HttpsError 'failed-precondition' - state docが存在しない、またはstatusが'closed'/'error'でcurrentBusinessDateKeyがnullの場合
 */
export async function getCurrentBusinessDateKeyOrThrow(): Promise<string>
```

**実装ロジック**:
1. `getFirestore()`でFirestoreインスタンスを取得
2. `storeMeta/currentBusinessDay`ドキュメントを取得
3. ドキュメントが存在しない場合:
   - `HttpsError('failed-precondition', 'storeMeta/currentBusinessDay document does not exist. Please run initialization script.')`をthrow
4. ドキュメントが存在する場合:
   - `data.status`を確認
   - `status === 'running'` かつ `currentBusinessDateKey !== null` の場合:
     - `currentBusinessDateKey`を返す
   - それ以外の場合（`status === 'closed'` または `status === 'error'` または `currentBusinessDateKey === null`）:
     - `HttpsError('failed-precondition', `Store is not running. Current status: ${status}, currentBusinessDateKey: ${currentBusinessDateKey}`)`をthrow

**エラーハンドリング**:
- Firestoreエラー（ネットワークエラー等）は`HttpsError('internal', ...)`に変換
- ログ出力: `logger.error('getCurrentBusinessDateKeyOrThrow failed', { error: ... })`
- **loggerのインポート**: `import { logger } from 'firebase-functions';`

#### 2.2 エクスポート

**ファイル**: `functions/src/helpers/stateDoc/index.ts`（新規作成、または既存のindex.tsに追加）

```typescript
export { getCurrentBusinessDateKeyOrThrow } from './getCurrentBusinessDateKeyOrThrow';
```

---

### 3. 手動開店/閉店機能の実装

#### 3.1 手動開店関数（`openStore`）

**ファイル**: `functions/src/callables/storeManagement/open/openStore.ts`（新規作成）

**関数シグネチャ**:
```typescript
export const openStore = onCall(async (request) => {
  // 実装
});
```

**実装内容**:

1. **認証・権限チェック**:
   - `request.auth`が存在することを確認（未認証の場合は`HttpsError('unauthenticated', ...)`をthrow）
   - `getCallerDeviceByUid(request.auth.uid)`でデバイス情報を取得
   - デバイスが存在し、`isActive(device.status)`が`true`であることを確認
   - `device.role === 'admin'`であることを確認（管理者のみ実行可能）

2. **リクエストデータの取得・バリデーション**:
   - `request.data`から`businessDateKey`（オプション）を取得
   - `businessDateKey`が指定されている場合:
     - 形式チェック: `YYYY-MM-DD`形式の文字列であることを確認（正規表現: `/^\d{4}-\d{2}-\d{2}$/`）
   - `businessDateKey`が指定されていない場合:
     - **サーバ基準のJST日付キー（暦日）を生成**
     - **重要**: Phase1の`openStore`は営業時間を参照しない。よって`businessDateKey`は「JSTの暦日」として生成して良い
     - 生成手順:
       - `new Date()`で現在時刻（UTC）を取得
       - JST（UTC+9）に変換: `const jstOffset = 9 * 60; // 9時間を分に変換` → `const jstTime = now.getTime() + jstOffset * 60000;` → `const jstDate = new Date(jstTime);`
       - `YYYY-MM-DD`形式に整形: `jstDate.toISOString().split('T')[0]`
     - **既存ヘルパーの確認**: 既存コードにJST日付キー生成のヘルパー関数がある場合は、それを使用する（例: `createClockInRecord.ts`の38-42行目に類似実装あり）
     - 既存ヘルパーがない場合は、新規に小さな純関数を用意する方針（ただしコードは書かない、実装時に判断）

3. **state docの更新（トランザクション）**:
   - `getFirestore().runTransaction()`を使用
   - トランザクション内:
     - `storeMeta/currentBusinessDay`ドキュメントを取得
     - 現在の`status`を確認
     - `status === 'closed'`または`status === 'error'`の場合のみ更新を実行
     - `status === 'running'`の場合は`HttpsError('failed-precondition', 'Store is already running')`をthrow
     - 更新内容:
       ```typescript
       {
         status: 'running',
         currentBusinessDateKey: businessDateKey, // 決定した営業日キー
         lastClosedBusinessDateKey: doc.data()?.lastClosedBusinessDateKey || null, // 既存値を維持
         updatedAt: admin.firestore.FieldValue.serverTimestamp(),
         source: 'manual',
         lastError: null // エラー状態から復旧する場合はクリア
       }
       ```

4. **エラーハンドリング**:
   - トランザクションエラー時:
     - **重要**: Phase1では、トランザクション失敗時に`status`を`'error'`に更新する方針を撤回する
     - 理由: Phase1はstate doc更新のみであり、tx失敗時に同一経路でerror更新しようとしても失敗する可能性が高い
     - **対応方針**:
       - state docの`status`は変更しない（best-effort）
       - `logger.error()`でエラーを記録: `logger.error('openStore failed', { uid: request.auth.uid, businessDateKey, error: ... })`
       - 可能なら`storeMeta/currentBusinessDay/logs`サブコレクションへの「失敗ログ追加（add）」を**トランザクションとは別のwrite**で試みる（失敗しても致命ではない、と明記）
       - 失敗ログの内容:
         ```typescript
         {
           type: 'open',
           businessDateKey: businessDateKey,
           trigger: 'manual',
           failedStep: 'open:setStateDoc',
           errorCode: error instanceof HttpsError ? error.code : 'internal',
           errorMessage: error instanceof Error ? error.message : String(error),
           causeHint: 'Transaction failed',
           createdAt: admin.firestore.Timestamp.now(),
           context: null
         }
         ```
   - **注意**: 「status=errorにする」のは、将来PhaseXで「複数ステップの部分成功が起きた」場合に限定する（Phase1の範囲外）

6. **戻り値**:
   ```typescript
   {
     success: true,
     businessDateKey: string,
     status: 'running'
   }
   ```

#### 3.2 手動閉店関数（`closeStore`）

**ファイル**: `functions/src/callables/storeManagement/close/closeStore.ts`（新規作成）

**関数シグネチャ**:
```typescript
export const closeStore = onCall(async (request) => {
  // 実装
});
```

**実装内容**:

1. **認証・権限チェック**:
   - `openStore`と同様（管理者のみ実行可能）

2. **state docの更新（トランザクション）**:
   - `getFirestore().runTransaction()`を使用
   - トランザクション内:
     - `storeMeta/currentBusinessDay`ドキュメントを取得
     - 現在の`status`と`currentBusinessDateKey`を確認
     - `status === 'running'`かつ`currentBusinessDateKey !== null`の場合のみ更新を実行
     - `status === 'closed'`の場合は`HttpsError('failed-precondition', 'Store is already closed')`をthrow
     - 更新内容:
       ```typescript
       {
         status: 'closed',
         lastClosedBusinessDateKey: doc.data()?.currentBusinessDateKey || null, // 現在のcurrentBusinessDateKeyを保存
         currentBusinessDateKey: null,
         updatedAt: admin.firestore.FieldValue.serverTimestamp(),
         source: 'manual',
         lastError: null // エラー状態から復旧する場合はクリア
       }
       ```

3. **エラーハンドリング**:
   - トランザクションエラー時:
     - **重要**: Phase1では、トランザクション失敗時に`status`を`'error'`に更新する方針を撤回する
     - 理由: Phase1はstate doc更新のみであり、tx失敗時に同一経路でerror更新しようとしても失敗する可能性が高い
     - **対応方針**:
       - state docの`status`は変更しない（best-effort）
       - `logger.error()`でエラーを記録: `logger.error('closeStore failed', { uid: request.auth.uid, error: ... })`
       - 可能なら`storeMeta/currentBusinessDay/logs`サブコレクションへの「失敗ログ追加（add）」を**トランザクションとは別のwrite**で試みる（失敗しても致命ではない、と明記）
       - 失敗ログの内容:
         ```typescript
         {
           type: 'close',
           businessDateKey: doc.data()?.currentBusinessDateKey || null,
           trigger: 'manual',
           failedStep: 'close:setStateDoc',
           errorCode: error instanceof HttpsError ? error.code : 'internal',
           errorMessage: error instanceof Error ? error.message : String(error),
           causeHint: 'Transaction failed',
           createdAt: admin.firestore.Timestamp.now(),
           context: null
         }
         ```
   - **注意**: 「status=errorにする」のは、将来PhaseXで「複数ステップの部分成功が起きた」場合に限定する（Phase1の範囲外）

5. **戻り値**:
   ```typescript
   {
     success: true,
     lastClosedBusinessDateKey: string,
     status: 'closed'
   }
   ```

#### 3.3 callable関数のエクスポート

**ファイル**: `functions/src/callables/index.ts`

```typescript
export { openStore } from './storeManagement/open/openStore';
export { closeStore } from './storeManagement/close/closeStore';
```

**注意事項**:
- `storeManagement`フォルダ配下に、開店用（`open/`）と閉店用（`close/`）のフォルダを分けて格納する
- 今後、開店/閉店に関連する追加の関数も、それぞれのフォルダ内に格納する

---

### 4. `createBillWithActiveStay.ts`の修正

**ファイル**: `functions/src/helpers/billsApi/createBillWithActiveStay.ts`

**修正内容**:
- 98行目の`calcBusinessDate(now)`を`getCurrentBusinessDateKeyOrThrow()`に置き換え
- インポートを追加:
  ```typescript
  import { getCurrentBusinessDateKeyOrThrow } from '../stateDoc/getCurrentBusinessDateKeyOrThrow';
  ```
  - **注意**: 実際のimportパスは、`functions/src/helpers/stateDoc/`の配置を確認してから決定する
  - 現在のファイル位置: `functions/src/helpers/billsApi/createBillWithActiveStay.ts`
  - 相対パス: `../stateDoc/getCurrentBusinessDateKeyOrThrow`（`stateDoc`フォルダが`helpers`直下に作成される場合）
  - 実装時に実際のファイル構造を確認し、必要に応じて調整する
- 修正箇所:
  ```typescript
  // 修正前
  const businessDate = calcBusinessDate(now);
  
  // 修正後
  const businessDate = await getCurrentBusinessDateKeyOrThrow();
  ```

**注意事項**:
- `getCurrentBusinessDateKeyOrThrow()`は`async`関数のため、`await`が必要
- エラーハンドリング: `getCurrentBusinessDateKeyOrThrow()`が`HttpsError('failed-precondition', ...)`をthrowした場合、そのまま上位に伝播させる（店舗が閉店中の場合は伝票作成を拒否する）

---

## 型定義

### state docの型定義

**ファイル**: `functions/src/helpers/stateDoc/types.ts`（新規作成）

```typescript
export interface CurrentBusinessDayDoc {
  status: 'closed' | 'running' | 'error';
  currentBusinessDateKey: string | null;
  lastClosedBusinessDateKey: string | null;
  updatedAt: admin.firestore.Timestamp;
  source: string;
  lastError: {
    code: string;
    message: string;
    failedStep: string;
    at: admin.firestore.Timestamp;
    context?: any;
  } | null;
}

export interface StateDocLogEntry {
  type: 'open' | 'close';
  businessDateKey: string | null;
  trigger: 'manual' | 'auto';
  failedStep: string;
  errorCode: string;
  errorMessage: string;
  causeHint: string | null;
  createdAt: admin.firestore.Timestamp;
  context: any | null;
}
```

---

## テスト観点

### 1. `getCurrentBusinessDateKeyOrThrow()`のテスト

- state docが存在しない場合: `failed-precondition`エラーをthrow
- `status === 'running'`かつ`currentBusinessDateKey !== null`の場合: `currentBusinessDateKey`を返す
- `status === 'closed'`の場合: `failed-precondition`エラーをthrow
- `status === 'error'`の場合: `failed-precondition`エラーをthrow
- `currentBusinessDateKey === null`の場合: `failed-precondition`エラーをthrow

### 2. `openStore`のテスト

- 未認証の場合: `unauthenticated`エラーをthrow
- 管理者以外の場合: `permission-denied`エラーをthrow
- `status === 'closed'`の場合: 正常に開店
- `status === 'running'`の場合: `failed-precondition`エラーをthrow
- `businessDateKey`が指定されている場合: 指定されたキーを使用
- `businessDateKey`が指定されていない場合: サーバ基準のJST日付キー（暦日）を生成
- トランザクションエラー時: `status`は変更せず、`logger.error()`で記録（best-effortで`logs`にも記録を試みる）
- **UI snapshot反映**: 開店成功後、UIで`storeMeta/currentBusinessDay`をsnapshot購読している場合、`currentBusinessDateKey`が即座に反映されることを確認

### 3. `closeStore`のテスト

- 未認証の場合: `unauthenticated`エラーをthrow
- 管理者以外の場合: `permission-denied`エラーをthrow
- `status === 'running'`かつ`currentBusinessDateKey !== null`の場合: 正常に閉店
- `status === 'closed'`の場合: `failed-precondition`エラーをthrow
- トランザクションエラー時: `status`は変更せず、`logger.error()`で記録（best-effortで`logs`にも記録を試みる）
- **UI snapshot反映**: 閉店成功後、UIで`storeMeta/currentBusinessDay`をsnapshot購読している場合、`currentBusinessDateKey`が`null`に即座に反映されることを確認

### 4. `createBillWithActiveStay.ts`の修正テスト

- `getCurrentBusinessDateKeyOrThrow()`が正常に動作する場合: `businessDate`が正しく設定される
- `getCurrentBusinessDateKeyOrThrow()`が`failed-precondition`エラーをthrowした場合: エラーが上位に伝播される

---

## 実装順序

1. 型定義の作成（`types.ts`）
2. `getCurrentBusinessDateKeyOrThrow()`の実装
3. 初期ドキュメント作成スクリプトの実装
4. `openStore`の実装
5. `closeStore`の実装
6. `createBillWithActiveStay.ts`の修正
7. Firestore Rulesの更新
8. テスト実装

---

## 参照資料

- [Step0: 最終仕様](../step0_final_spec.md)
- [Step3: state docと自動開閉店の設計](../step3_state_doc_and_scheduling.md)
- [Step4: 改修実装チェックリスト](../step4_migration_plan_checklist.md)
