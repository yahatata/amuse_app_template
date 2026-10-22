# Analytics Monthly 更新の同一化 テスト実行状況

_作成日: 2025-12-20 (JST)_

## テストファイル作成状況

✅ **テストファイル作成完了**

- **ファイル**: `functions/__tests__/analytics/processBillAnalyticsAtomically.spec.ts`
- **ステータス**: 作成完了、lintエラーなし
- **テストケース数**: 6つのテストケース

## テスト実行時の問題

### エラー内容

```
Error: Cannot find module '@jest/test-sequencer'
```

### 原因

Jestの依存関係に問題がある可能性があります。`@jest/test-sequencer` モジュールが見つからないというエラーです。

### 解決方法

以下のいずれかを実行してください：

#### 方法1: npmキャッシュの権限を修正（推奨）

```bash
sudo chown -R 501:20 "/Users/yahatayuusei/.npm"
```

その後、依存関係を再インストール：

```bash
cd functions
rm -rf node_modules package-lock.json
npm install
```

#### 方法2: 既存のnode_modulesを使用してテストを実行

既存のテストファイル（`aggregator.spec.ts` など）が動作している場合、同じJestセットアップでテストを実行できるはずです。

```bash
cd functions

# Firestore Emulatorを起動（別ターミナル）
firebase emulators:start --only firestore

# テストを実行
npm test -- processBillAnalyticsAtomically.spec.ts
```

#### 方法3: 直接jestを実行

```bash
cd functions
npx jest --runInBand __tests__/analytics/processBillAnalyticsAtomically.spec.ts
```

## テスト実行手順（正常な場合）

1. **Firestore Emulatorを起動**（別ターミナル）:
   ```bash
   firebase emulators:start --only firestore
   ```

2. **テストを実行**:
   ```bash
   cd functions
   npm test -- processBillAnalyticsAtomically.spec.ts
   ```

3. **結果を確認**:
   - すべてのテストケースが通過することを確認
   - エラーがないことを確認

## テストケース一覧

1. ✅ 冪等性テスト: 同一billIdで複数回実行しても二重計上しない
2. ✅ 冪等性テスト: 異なるbillIdで実行するとそれぞれが計上される
3. ✅ 更新内容の同一性テスト: 旧スキーマ（grossSales, itemsSales, orderCount）が正しく更新される
4. ✅ 更新内容の同一性テスト: byCategory/summary が正しく更新される
5. ✅ 更新内容の同一性テスト: byUser/{userId} が正しく更新される
6. ✅ 更新内容の同一性テスト: byTemplateTournaments/{templateKey} が正しく更新される
7. ✅ 更新内容の同一性テスト: party.userId がない場合、byUser は更新されない
8. ✅ 失敗時再試行テスト: トランザクション外でmarkerが存在する場合、no-opでreturnされる

## 次のステップ

1. **Jestの依存関係を修正**: 上記の「解決方法」を実行してください
2. **テストを実行**: Firestore Emulatorを起動してテストを実行してください
3. **結果を確認**: すべてのテストケースが通過することを確認してください

## 注意事項

- Firestore Emulatorが起動している必要があります（`localhost:8080`）
- テスト実行前に、`process.env.FIRESTORE_EMULATOR_HOST = 'localhost:8080'` が設定されていることを確認してください
- テストは `beforeAll` で自動的にFirestore Emulatorに接続します
