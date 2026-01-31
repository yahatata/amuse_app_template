# Phase1: state doc導入 - 人間確認用仕様書

## 概要

Phase1では、単一状態ドキュメント（`storeMeta/currentBusinessDay`）を導入し、Functions側で現在営業日を取得するためのヘルパー関数と、手動開店/閉店機能を実装します。

## 実装内容

### 1. `storeMeta/currentBusinessDay`ドキュメントの作成

#### 1.1 初期ドキュメント作成スクリプトの作成

**新規作成ファイル**: `functions/src/scripts/createInitialStateDoc.ts`

**実装内容**:
- Firestoreに`storeMeta/currentBusinessDay`というドキュメントを作成するスクリプトを作成します
- 初期状態として以下のフィールドを設定します:
  - `status`: `'closed'`（閉店中）
  - `currentBusinessDateKey`: `null`（現在営業日は未設定）
  - `lastClosedBusinessDateKey`: `null`（最後に閉店した営業日は未設定）
  - `updatedAt`: サーバー時刻（作成時刻）
  - `source`: `'initial'`（初期化による作成であることを示す）
  - `lastError`: `null`（エラー情報なし）
- 既にドキュメントが存在する場合は何もせず終了します（冪等性を保証）

**実行方法**: 
- 手動で実行するスクリプトとして実装します
- 初回デプロイ時や、手動で初期化が必要な場合に実行します

#### 1.2 Firestore Rulesの更新

**修正ファイル**: `firestore.rules`

**実装内容**:
- `storeMeta/currentBusinessDay`ドキュメントの読み取りは全ユーザーに許可します
- 書き込みはFunctions経由のみとし、UIからの直接書き込みは禁止します（運用事故防止のため）
- これにより、UIは`storeMeta/currentBusinessDay`をsnapshot購読して現在営業日を取得できますが、直接更新することはできません

---

### 2. `getCurrentBusinessDateKeyOrThrow()`関数の実装

#### 2.1 関数の作成

**新規作成ファイル**: `functions/src/helpers/stateDoc/getCurrentBusinessDateKeyOrThrow.ts`

**実装内容**:
- `storeMeta/currentBusinessDay`ドキュメントから現在営業日（`currentBusinessDateKey`）を取得する関数を作成します
- この関数は、Functions側で「現在営業日」を取得する際に使用します
- 戻り値: 現在営業日（`YYYY-MM-DD`形式の文字列）
- エラー時の挙動:
  - ドキュメントが存在しない場合: エラーをthrow（初期化が必要であることを示す）
  - `status`が`'closed'`または`'error'`の場合: エラーをthrow（店舗が営業中でないことを示す）
  - `currentBusinessDateKey`が`null`の場合: エラーをthrow（営業日が設定されていないことを示す）
- 正常時は`status === 'running'`かつ`currentBusinessDateKey !== null`の場合のみ、`currentBusinessDateKey`を返します

#### 2.2 エクスポート設定

**新規作成ファイル**: `functions/src/helpers/stateDoc/index.ts`（または既存のindex.tsに追加）

**実装内容**:
- `getCurrentBusinessDateKeyOrThrow`関数をエクスポートし、他のファイルから使用できるようにします

---

### 3. 手動開店/閉店機能の実装

#### 3.1 手動開店関数（`openStore`）の作成

**新規作成ファイル**: `functions/src/callables/storeManagement/open/openStore.ts`

**実装内容**:
- 管理者が手動で店舗を開店するためのCloud Functionを作成します
- 認証・権限チェック:
  - 認証済みユーザーであることを確認します
  - 管理者権限（`device.role === 'admin'`）を持つデバイスからのみ実行可能とします
- 営業日キーの決定:
  - リクエストで`businessDateKey`が指定されている場合: 指定されたキーを使用します（管理者がダイアログで選択した場合）
  - リクエストで`businessDateKey`が指定されていない場合: サーバー基準のJST日付キー（`YYYY-MM-DD`形式）を自動生成します
  - **注意**: `calcBusinessDate`は使用しません（予定/任意日時のみ使用するため）
- state docの更新:
  - Firestoreのトランザクションを使用して、`storeMeta/currentBusinessDay`ドキュメントを更新します
  - 更新内容:
    - `status`: `'closed'` → `'running'`（営業中に変更）
    - `currentBusinessDateKey`: 決定した営業日キーを設定
    - `source`: `'manual'`（手動による更新であることを示す）
    - `updatedAt`: サーバー時刻（更新時刻）
    - `lastError`: `null`にクリア（エラー状態から復旧する場合）
  - 既に`status === 'running'`の場合はエラーを返します（二重開店を防止）
- エラーハンドリング:
  - トランザクションが失敗した場合:
    - `status`を`'error'`に設定します
    - `lastError`にエラー情報（エラーコード、メッセージ、失敗したステップ名、失敗時刻、コンテキスト）を記録します
    - `storeMeta/currentBusinessDay/logs`サブコレクションに詳細ログを追加します
- 戻り値: 開店成功時は`{ success: true, businessDateKey: string, status: 'running' }`を返します

#### 3.2 手動閉店関数（`closeStore`）の作成

**新規作成ファイル**: `functions/src/callables/storeManagement/close/closeStore.ts`

**実装内容**:
- 管理者が手動で店舗を閉店するためのCloud Functionを作成します
- 認証・権限チェック:
  - `openStore`と同様に、管理者権限を持つデバイスからのみ実行可能とします
- state docの更新:
  - Firestoreのトランザクションを使用して、`storeMeta/currentBusinessDay`ドキュメントを更新します
  - 更新内容:
    - `status`: `'running'` → `'closed'`（閉店中に変更）
    - `lastClosedBusinessDateKey`: 現在の`currentBusinessDateKey`を保存（次回開店時の参考情報として使用）
    - `currentBusinessDateKey`: `null`に設定（営業日をクリア）
    - `source`: `'manual'`（手動による更新であることを示す）
    - `updatedAt`: サーバー時刻（更新時刻）
    - `lastError`: `null`にクリア（エラー状態から復旧する場合）
  - 既に`status === 'closed'`の場合はエラーを返します（二重閉店を防止）
- エラーハンドリング:
  - トランザクションが失敗した場合:
    - `status`を`'error'`に設定します
    - `lastError`にエラー情報を記録します
    - `storeMeta/currentBusinessDay/logs`サブコレクションに詳細ログを追加します
- 戻り値: 閉店成功時は`{ success: true, lastClosedBusinessDateKey: string, status: 'closed' }`を返します

#### 3.3 callable関数のエクスポート設定

**修正ファイル**: `functions/src/callables/index.ts`

**実装内容**:
- `openStore`と`closeStore`関数をエクスポートし、他のファイルから使用できるようにします
- エクスポートパス:
  - `openStore`: `./storeManagement/open/openStore`
  - `closeStore`: `./storeManagement/close/closeStore`
- **フォルダ構成**:
  - `functions/src/callables/storeManagement/`フォルダを作成します
  - その配下に`open/`フォルダと`close/`フォルダを作成します
  - 開店関連の関数は`open/`フォルダ内に、閉店関連の関数は`close/`フォルダ内に格納します
  - 今後、開店/閉店に関連する追加の関数も、それぞれのフォルダ内に格納していきます

---

### 4. `createBillWithActiveStay.ts`の修正

**修正ファイル**: `functions/src/helpers/billsApi/createBillWithActiveStay.ts`

**修正内容**:
- 伝票作成時に営業日を計算する処理を修正します
- **修正前**: `calcBusinessDate(now)`を使用して営業日を計算していました
- **修正後**: `getCurrentBusinessDateKeyOrThrow()`を使用して、state docから現在営業日を取得します
- これにより、伝票作成時は常に「現在営業日」（state docの`currentBusinessDateKey`）を使用するようになります
- エラー時の挙動:
  - `getCurrentBusinessDateKeyOrThrow()`がエラーをthrowした場合（店舗が閉店中の場合など）、そのエラーをそのまま上位に伝播させます
  - これにより、店舗が閉店中の場合は伝票作成を拒否します

**修正箇所**:
- 98行目付近: `const businessDate = calcBusinessDate(now);`を`const businessDate = await getCurrentBusinessDateKeyOrThrow();`に変更
- インポート文に`getCurrentBusinessDateKeyOrThrow`を追加

---

## 実装後の動作

### 正常系

1. **初期化**:
   - `createInitialStateDoc.ts`を実行すると、`storeMeta/currentBusinessDay`ドキュメントが作成され、`status: 'closed'`の状態になります

2. **開店**:
   - 管理者が`openStore` Cloud Functionを呼び出すと、`status`が`'running'`に変更され、`currentBusinessDateKey`が設定されます
   - これにより、`getCurrentBusinessDateKeyOrThrow()`が正常に現在営業日を返せるようになります

3. **伝票作成**:
   - `createBillWithActiveStay.ts`が`getCurrentBusinessDateKeyOrThrow()`を呼び出し、state docから現在営業日を取得します
   - 取得した営業日を`bills`コレクションの`businessDate`フィールドに格納します

4. **閉店**:
   - 管理者が`closeStore` Cloud Functionを呼び出すと、`status`が`'closed'`に変更され、`currentBusinessDateKey`が`null`になります
   - これにより、`getCurrentBusinessDateKeyOrThrow()`がエラーをthrowするようになり、伝票作成が拒否されます

### エラー系

1. **店舗が閉店中の伝票作成**:
   - `getCurrentBusinessDateKeyOrThrow()`がエラーをthrowし、伝票作成が拒否されます
   - エラーメッセージには「店舗が営業中でない」旨が含まれます

2. **開店処理の失敗**:
   - トランザクションが失敗した場合、`status`が`'error'`に設定され、`lastError`にエラー情報が記録されます
   - `storeMeta/currentBusinessDay/logs`サブコレクションに詳細ログが追加されます
   - 管理者はエラー情報を確認して、手動で復旧できます

3. **閉店処理の失敗**:
   - 開店処理と同様に、エラー情報が`lastError`と`logs`に記録されます

---

## 実装順序

1. 型定義の作成（state docの構造を定義）
2. `getCurrentBusinessDateKeyOrThrow()`関数の実装（現在営業日を取得する関数）
3. 初期ドキュメント作成スクリプトの実装（初回セットアップ用）
4. `openStore`関数の実装（手動開店機能）
5. `closeStore`関数の実装（手動閉店機能）
6. `createBillWithActiveStay.ts`の修正（伝票作成時の営業日取得方法を変更）
7. Firestore Rulesの更新（UIからの直接書き込みを禁止）
8. テスト実装（各機能の動作確認）

---

## 注意事項

- **現段階では、手動開店/閉店はstate docの更新のみを行います**
  - 将来的に、ターミナル処理（例: レジスターの開閉、照明の制御など）を統合する予定ですが、Phase1ではstate docの更新のみを実装します
- **`calcBusinessDate`は使用しません**
  - 開店時の`currentBusinessDateKey`決定には`calcBusinessDate`を使用せず、サーバー基準のJST日付キーまたは管理者が選択した日付キーを使用します
  - `calcBusinessDate`は予定/任意日時の営業日算出のみに使用します（Phase2以降で実装）
- **トランザクションによる一貫性保証**
  - state docの更新は必ずトランザクションで行います
  - これにより、複数のリクエストが同時に実行された場合でも、一貫性が保証されます

---

## 参照資料

- [Step0: 最終仕様](../step0_final_spec.md) - 全体の仕様と方針
- [Step3: state docと自動開閉店の設計](../step3_state_doc_and_scheduling.md) - state docの詳細設計
- [Step4: 改修実装チェックリスト](../step4_migration_plan_checklist.md) - 実装時のチェック項目
