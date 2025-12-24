# P1-01 テスト実行ガイド

_最終更新: 2025-11-10 (JST)_

## 概要

P1-01（入店フロー）のテストを実行するために必要な環境構築と実行手順を説明します。

## 必要な作業（順序通りに実施）

### 1. 必要なパッケージのインストール

#### 1.1 現在の状態確認

```bash
cd functions
cat package.json | grep -E "jest|@firebase/rules-unit-testing|@types/jest"
```

現在、以下のパッケージが**不足**しています：
- `jest`（テストランナー）
- `@types/jest`（TypeScript型定義）
- `@firebase/rules-unit-testing`（Firestore Emulator統合）
- `ts-jest`（TypeScript用Jest設定、オプション）

#### 1.2 パッケージのインストール

```bash
cd functions
npm install --save-dev jest @types/jest @firebase/rules-unit-testing ts-jest
```

**確認コマンド**:
```bash
npm list jest @types/jest @firebase/rules-unit-testing ts-jest
```

### 2. Jest設定ファイルの作成

#### 2.1 `functions/jest.config.js` を作成

```javascript
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/__tests__'],
  testMatch: ['**/__tests__/**/*.spec.ts'],
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json'],
  transform: {
    '^.+\\.ts$': 'ts-jest',
  },
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/**/*.d.ts',
  ],
  setupFilesAfterEnv: [],
  testTimeout: 30000, // Firestore Emulator の起動待ち時間を考慮
};
```

#### 2.2 `functions/tsconfig.dev.json` の確認・作成

テスト用のTypeScript設定が必要な場合：

```json
{
  "extends": "./tsconfig.json",
  "compilerOptions": {
    "outDir": "lib",
    "rootDir": ".",
    "types": ["jest", "node"]
  },
  "include": [
    "src/**/*",
    "__tests__/**/*"
  ]
}
```

### 3. package.json にテストスクリプトを追加

#### 3.1 `functions/package.json` の `scripts` セクションに追加

```json
{
  "scripts": {
    "test": "jest",
    "test:watch": "jest --watch",
    "test:coverage": "jest --coverage",
    "test:billsApi": "jest __tests__/helpers/billsApi",
    "test:calcBusinessDate": "jest __tests__/helpers/billsApi/calcBusinessDate.spec.ts",
    "test:createBill": "jest __tests__/helpers/billsApi/createBillWithActiveStay.spec.ts"
  }
}
```

### 4. Firestore Emulator のセットアップ

#### 4.1 Firebase CLI のインストール確認

```bash
firebase --version
```

未インストールの場合：
```bash
npm install -g firebase-tools
firebase login
```

#### 4.2 Firestore Emulator の起動

**ターミナル1（Emulator起動）**:
```bash
cd /Users/yahatayuusei/Documents/GitHub/amuse_app_template
firebase emulators:start --only firestore
```

**確認ポイント**:
- `Firestore Emulator running at localhost:8080` が表示されること
- エラーが発生しないこと

**注意**: Emulatorは**別ターミナルで起動したまま**にしておく必要があります。

#### 4.3 環境変数の設定（自動設定される場合あり）

Firestore Emulator が起動すると、通常は自動的に `FIRESTORE_EMULATOR_HOST=localhost:8080` が設定されますが、明示的に設定する場合：

```bash
export FIRESTORE_EMULATOR_HOST=localhost:8080
```

### 5. テストの実行

#### 5.1 単体テスト（calcBusinessDate）の実行

```bash
cd functions
npm run test:calcBusinessDate
```

または：
```bash
npm test -- __tests__/helpers/billsApi/calcBusinessDate.spec.ts
```

#### 5.2 統合テスト（createBillWithActiveStay）の実行

**前提**: Firestore Emulator が起動していること

```bash
cd functions
npm run test:createBill
```

または：
```bash
npm test -- __tests__/helpers/billsApi/createBillWithActiveStay.spec.ts
```

#### 5.3 すべてのテストを実行

```bash
cd functions
npm test
```

### 6. トラブルシューティング

#### 6.1 エラー: `Cannot find module '@firebase/rules-unit-testing'`

**原因**: パッケージがインストールされていない

**解決策**:
```bash
cd functions
npm install --save-dev @firebase/rules-unit-testing
```

#### 6.2 エラー: `FIRESTORE_EMULATOR_HOST is not set`

**原因**: Firestore Emulator が起動していない、または環境変数が設定されていない

**解決策**:
1. Firestore Emulator を起動（別ターミナル）
2. 環境変数を設定: `export FIRESTORE_EMULATOR_HOST=localhost:8080`

#### 6.3 エラー: `admin.initializeApp() called multiple times`

**原因**: テスト間で admin SDK が複数回初期化されている

**解決策**: テストファイルの `beforeAll` / `afterAll` で適切にクリーンアップする（既に実装済み）

#### 6.4 エラー: `TypeError: Cannot read property 'firestore' of undefined`

**原因**: `testEnv` が正しく初期化されていない

**解決策**: 
- `initializeTestEnvironment` が完了するまで待つ
- `await` を忘れていないか確認

#### 6.5 テストがタイムアウトする

**原因**: Firestore Emulator の起動待ち時間が不足

**解決策**: `jest.config.js` の `testTimeout` を増やす（既に30000msに設定済み）

#### 6.6 テストデータが残っている

**原因**: `beforeEach` のクリーンアップが失敗している

**解決策**: 
- Firestore Emulator を再起動
- 手動でデータをクリア: Firestore Emulator UI（http://localhost:4000）から削除

### 7. テスト結果の確認

#### 7.1 成功時の出力例

```
PASS  __tests__/helpers/billsApi/calcBusinessDate.spec.ts
  calcBusinessDate
    STORE_CLOSE_HOUR=27（翌日の3:00 JST）
      ✓ 02:59 JST → 前日の営業日 (5ms)
      ✓ 03:00 JST → 当日の営業日 (2ms)
      ✓ 03:01 JST → 当日の営業日 (1ms)
    STORE_CLOSE_HOUR=9（当日の9:00 JST）
      ✓ 08:59 JST → 前日の営業日 (2ms)
      ✓ 09:00 JST → 当日の営業日 (1ms)
      ✓ 09:01 JST → 当日の営業日 (1ms)

Test Suites: 1 passed, 1 total
Tests:       6 passed, 6 total
```

#### 7.2 失敗時の確認ポイント

1. **エラーメッセージを確認**
   - どのテストが失敗したか
   - エラーの種類（TypeError, AssertionError 等）

2. **Firestore Emulator の状態確認**
   - Emulator が起動しているか
   - ポート8080が使用されているか: `lsof -i :8080`

3. **テストデータの確認**
   - Firestore Emulator UI（http://localhost:4000）でデータを確認
   - 予期しないデータが残っていないか

### 8. テスト実行のワークフロー（推奨順序）

#### ステップ1: 環境準備
```bash
# 1. パッケージインストール
cd functions
npm install --save-dev jest @types/jest @firebase/rules-unit-testing ts-jest

# 2. Jest設定ファイル作成（上記の内容をコピー）
# 3. package.json にテストスクリプト追加（上記の内容をコピー）
```

#### ステップ2: Firestore Emulator 起動
```bash
# 別ターミナルで実行（起動したままにする）
cd /Users/yahatayuusei/Documents/GitHub/amuse_app_template
firebase emulators:start --only firestore
```

#### ステップ3: 単体テスト実行
```bash
# ターミナル1（Emulator起動中）とは別のターミナルで実行
cd functions
npm run test:calcBusinessDate
```

#### ステップ4: 統合テスト実行
```bash
# ターミナル1（Emulator起動中）とは別のターミナルで実行
cd functions
npm run test:createBill
```

#### ステップ5: すべてのテスト実行
```bash
cd functions
npm test
```

### 9. 継続的なテスト実行（開発中）

#### 9.1 ウォッチモード

```bash
cd functions
npm run test:watch
```

ファイル変更を検知して自動的にテストを再実行します。

#### 9.2 カバレッジレポート

```bash
cd functions
npm run test:coverage
```

カバレッジレポートが `coverage/` ディレクトリに生成されます。

### 10. CI/CD での実行（将来）

GitHub Actions 等で自動実行する場合の設定例：

```yaml
# .github/workflows/test.yml
name: Tests
on: [push, pull_request]
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2
      - uses: actions/setup-node@v2
        with:
          node-version: '22'
      - run: cd functions && npm install
      - run: firebase emulators:start --only firestore &
      - run: cd functions && npm test
```

## チェックリスト

テスト実行前に以下を確認してください：

- [ ] `jest`, `@types/jest`, `@firebase/rules-unit-testing`, `ts-jest` がインストールされている
- [ ] `jest.config.js` が作成されている
- [ ] `package.json` にテストスクリプトが追加されている
- [ ] Firestore Emulator が起動している（別ターミナル）
- [ ] `FIRESTORE_EMULATOR_HOST=localhost:8080` が設定されている（自動設定される場合あり）
- [ ] TypeScript のビルドが成功する: `npm run build`

## 参考リンク

- [Jest 公式ドキュメント](https://jestjs.io/docs/getting-started)
- [Firebase Emulator 公式ドキュメント](https://firebase.google.com/docs/emulator-suite)
- [@firebase/rules-unit-testing 公式ドキュメント](https://firebase.google.com/docs/rules/unit-tests)

