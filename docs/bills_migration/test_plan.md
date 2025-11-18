# テスト計画

_最終更新: 2025-11-10 (JST)_

## 目的
- `bills` 移行に伴う機能・データ整合性・分析結果の品質を保証する。
- フェーズごとに必要な検証観点を明確化し、進捗に応じて追記・更新する。

## テスト分類
- **単体テスト**: Cloud Functions 新規モジュール／ヘルパのロジック検証。
- **統合テスト**: Firestore エミュレータを用いた書き込み → トリガ動作 → サマリ反映の確認。
- **エンドツーエンド**: Flutter クライアントと Functions の連携確認、実機テストを含む。
- **リグレッション**: Analytics・ダッシュボードの数値一致を確認する再計算テスト。

## フェーズ0（準備）テスト観点
- スキーマ定義・ルールの静的チェック（`businessDate`, `sideGameChips` など命名整合）。
- 新トリガ・ヘルパの単体テスト雛形作成。
- Analytics 差分計算ロジックのテストデータセット準備。

### 最小テスト追加（スキーマ確定に伴う）
- **updatePlace の LWW 挙動**: 複数端末から同時に `bills.place.*` を更新した場合、`serverTimestamp()`（受信時刻）を優先して LWW で競合解決されること。ユニットテストで検証。
- **payments の冪等性**:
  - 同一 `providerTxnId` で二重送信時に二重登録されないこと（docID 一意制約で検出）。
  - `providerTxnId` がある場合、`idempotencyKey` と不一致だと `invalid-argument` になること。
- **events の冪等性**: 同一 `eventId`（= `idempotencyKey`）で二重送信しても no-op（前回レスポンス相当）であること。副作用なし、`updatedAt` 変更なし。

## 共通テスト環境ポリシー（Firestore/Emulator）

- Admin SDK は **[DEFAULT] アプリ**に統一する（実装コードは `getFirestore()` 引数なしを前提とするため）。
  - 初期化: `admin.initializeApp({ projectId })`
  - 取得:   `const db = getFirestore()`（引数なし）
  - 事故防止: `beforeAll` で `expect(admin.apps[0]?.name).toBe('[DEFAULT]')` を入れて検知してもよい。

- **名前付きアプリを使わない**（`initializeApp(config, 'app-xxx')` を禁止）。実装と食い違うと「The default Firebase app does not exist」や意図しないプロジェクト参照で落ちる。

- Emulator 使用時は必ず `process.env.FIRESTORE_EMULATOR_HOST = 'localhost:8080'` を設定する。

- 並列実行による競合を避けるため、結合テストは `--runInBand` で単一ワーカー実行とする（npm script で強制）。

- `beforeEach` は `testEnv.clearFirestore()` を必須化し、テスト間のデータ残存を防ぐ。

- `afterAll` は以下を必須化:
  - `await testEnv.cleanup()`（存在する場合）
  - `await Promise.all(admin.apps.map(a => a.delete()))`
  - `delete process.env.FIRESTORE_EMULATOR_HOST`

- テスト中に「存在しない可能性のある doc」に対しては `update()` を使わず、**`set({...}, { merge: true })` を原則**とする（例：`bills.place.*` の設定）。

- 期待値の整合: 単価×数量の合計を厳密に計算し、例示（A=500円×(1+2)、B=300円×1 ⇒ 合計 1800円）のような誤期待値を禁止。

- 将来、マルチアプリ対応が必要になった場合は実装側で `getDb(app?)` ヘルパを導入して一本化し、**テストも同ヘルパに従う**（現時点は [DEFAULT] 方針を維持）。

### Firestore テストセットアップ雛形

```typescript
beforeAll(async () => {
  process.env.FIRESTORE_EMULATOR_HOST = 'localhost:8080';
  if (admin.apps.length) {
    await Promise.all(admin.apps.map(a => a.delete()));
  }
  admin.initializeApp({ projectId: 'test-project-bills' }); // [DEFAULT]
  db = getFirestore(); // 引数なし
  // 任意: 早期検知
  // expect(admin.apps[0]?.name).toBe('[DEFAULT]');
});

afterAll(async () => {
  if (typeof testEnv?.cleanup === 'function') {
    await testEnv.cleanup();
  }
  if (admin.apps.length) {
    await Promise.all(admin.apps.map(a => a.delete()));
  }
  delete process.env.FIRESTORE_EMULATOR_HOST;
});

beforeEach(async () => {
  await testEnv.clearFirestore();
});
```

## フェーズ1（並走）テスト観点
- **入店フロー（`createBillWithActiveStay`）**: 冪等性（同一 `idempotencyKey` で再実行時は既存docを返却、`updatedAt` 変更なし）、重複入店チェック（既に `activeStays/{uid}` が存在する場合は `failed-precondition`）、デュアルライト（`WRITE_TODAYS_BILLS_IN_PARALLEL` フラグON時は `todaysBills` にスケルトン複写、失敗時も `bills` への書込みは成功）。
  - **実施済みテスト（P1-01完了）**:
    - 単体テスト（`calcBusinessDate.spec.ts`）: 9件全て成功
      - STORE_CLOSE_HOUR=27/9 の境界テスト、デフォルト値テスト、24-48指定の正規化テスト
    - 統合テスト（`createBillWithActiveStay.spec.ts`）: 10件全て成功
      - happy path、invalid-argument（3件）、failed-precondition（重複入店）、idempotent-replay、idempotent-replay（ハッシュ不一致）、businessDate サーバ専任、DualWrite ON/OFF（2件）
    - 詳細は `p1_01_test_summary.md` を参照
- **注文フロー（`appendItem`）**: 強い冪等性（時間窓なし、expiresAt廃止、同一 `clientNonce` で再実行時は並行送信でも作成は1回のみ、片方は `reused: true`、親updatedAtはリプレイで変更されない）、サーバ側メニュー情報正規化（クライアントのname/category/priceは無視、menuItemIdから解決）、デュアルライト（`WRITE_TODAYS_BILLS_IN_PARALLEL` フラグON時は `todaysBills.items` 配列に行追加、金額は更新しない、三分岐ログ: success/failed/skipped を厳密一致で検証）、`orders/_TodaysOrders` スキーマ確定（Chips除外、1種類=1doc、`bills.place.table`/`bills.place.seat` を同梱、ordersキーは `bill.businessDate` をSSoTとして生成）。テストは本書の「共通テスト環境ポリシー」に準拠し、[DEFAULT] アプリ + `getFirestore()`（引数なし）を強制する。
  - **実施済みテスト（P1-02完了）**:
    - 単体テスト（`resolveMenuItem.spec.ts`）: 4件全て成功
    - 統合テスト（`getActiveBillByUser.spec.ts`, `appendItem.spec.ts`, `placeOrder.spec.ts`, `placeOrderByUser.spec.ts`）: 41件全て成功
    - 詳細は `p1_02_test_results_summary.md` を参照
  - **実施済みテスト（P1-02.1完了）**:
    - 統合テスト（`appendItem.dualwrite-failure.spec.ts`）: 6件全て成功（DualWrite失敗耐性、三分岐ログ厳密一致検証）
    - 統合テスト（`appendItem.concurrent.spec.ts`）: 2件全て成功（並行競合）
    - 統合テスト（`appendItem.mismatch.spec.ts`）: 2件全て成功（requestHash不一致）
    - 統合テスト（`appendItem.parallel-replay.spec.ts`）: 1件全て成功（並行リプレイ）
    - 統合テスト（`placeOrder.boundary-dates.spec.ts`）: 12件全て成功（境界日付、年跨ぎ・月跨ぎ・うるう年・平年・閉店時刻差分）
    - 統合テスト（`businessDate.immutability.spec.ts`）: 1件スキップ（P1-06/P1-11へ移管）
    - 詳細は `p1_02_test_results_summary.md` を参照

### DualWrite ログ契約仕様

| 状態 | logger メソッド | メッセージ | keys(厳密) |
|------|------------------|-------------|-------------|
| success | info  | `dualWrite appendItem ok` | op, billId, itemId, dualWriteResult |
| failed  | warn  | `dualWrite appendItem failed` | op, billId, itemId, dualWriteResult, reason |
| skipped | info  | `dualWrite appendItem skipped` | op, billId, itemId, dualWriteResult |

上記のログフォーマットはすべてのappendItem処理で統一されることを保証する。
各テストは `appendItem.dualwrite-failure.spec.ts` にて厳密一致検証を行う。

- 入店 → 注文 → 会計確定 → 返金イベントまでを新旧コレクションで比較。
- 会計確定トリガが Top50 圧縮を発動するケース (itemsSnapshot >700KB)。
- イベントトリガが netSales/balanceDue ガード条件に違反した場合 `failed-precondition` を返すこと。
- `/payments` の byMethod で許容リスト外キーを送信した際に `invalid-argument` が返ること。
- 冪等リプレイで既存レスポンスを返すケースで親 `updatedAt` が変化しないこと。
- `/events` トリガの冪等性と `originBusinessDate` / `eventBusinessDate` の反映確認。
- `activeStays` の onSnapshot / 即時削除 / 閉店クリーンアップ連携の確認。
- 深夜跨ぎ（`storeCloseHour` 境界）で `businessDate` が正しく割り当てられること。
- 部分返金イベントで `postEvents`・`paymentsSummary`・`analyticsDaily(originBusinessDate)` が正しい差分になること。
- 二重実行（同一 `idempotencyKey`）で副作用が発生しないこと。
- 並行更新（`items` 追加と `status -> settled`）が競合しても確定トリガが再集計し整合すること。
- 親ドキュメントの `itemsSnapshot` が 1MB 未満を維持すること（名称・カテゴリ・数量・税込額のみ）。
- 注文時（`appendItem`）に `orders/{YYYYMMDD}/_TodaysOrders/{orderId}` に `bills.place.table`, `bills.place.seat` が同梱されること。
- 座席移動（`updatePlace`）後に注文した場合、最新の `bills.place.*` が `_TodaysOrders` に反映されること。
- Flutter UI の読み取り専用制御、`activeStays` 長寿命リスナーの再接続回数（≤5/日）。
- Analytics／閉店バッチで旧ロジックとの差分が無いことを nightly ログで記録。

## フェーズ2（撤去）テスト観点
- `todaysBills` write deny 後のクライアント／Functions のエラー検知とリカバリ。
- 監視で `todaysBills` read/write = 0 を 7 日連続確認。
- バックアップデータの検証、削除後に再計算した Analytics が migration 前後で一致すること。
- 直近 30 日分の再計算ジョブ実行と結果検収。

## テストデータ管理
- テストケースごとに入力データを整理し、再現性を高める。
- 返金・追加徴収・Void・深夜跨ぎ・トーナメント・サイドゲーム・座席移動（`bills.place.*` 更新）を網羅する。

## 受け入れ基準（Done 定義）
- Analytics: 新旧操作で `analyticsMonthly` の数値差分が ±0（遡及イベントを含む）。
- 信頼性: 会計確定トリガ成功率 ≥ 99.9%、リトライでも差分が二重反映されない。
- 性能: 閉店バッチは 1 伝票につき親ドキュメント 1 リードのみ。`activeStays` リスナーの張り直し ≤ 5 回/日。
- コスト: `activeStays` ストリームを単一購読に統一し、不要な再購読を抑制。
- 運用: `todaysBills` read/write = 0 を 7 日連続監視で確認後、旧コレ削除へ進む。

## 今後のタスク
- フェーズ0完了後に各観点をテストケース単位で具体化し、本書に追記。
- 実装変更でテスト対象が増えた場合は即時更新する。
