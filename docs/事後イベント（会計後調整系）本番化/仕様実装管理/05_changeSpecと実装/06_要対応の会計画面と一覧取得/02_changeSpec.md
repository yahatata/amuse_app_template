# 02_changeSpec

## 1. このファイルの役割

Step06（要対応の会計画面と一覧取得）で行う変更を、仕様書 [04_仕様書/06_要対応の会計画面と一覧取得.md](/Users/yahatayuusei/Documents/GitHub/amuse_app_template/docs/事後イベント（会計後調整系）本番化/仕様実装管理/04_仕様書/06_要対応の会計画面と一覧取得.md) と上流 [16_未会計一部未徴収会計後イベントの接続方針.md](/Users/yahatayuusei/Documents/GitHub/amuse_app_template/docs/事後イベント（会計後調整系）本番化/仕様実装管理/03.1_前提再設計/step3.11_未決論点の再決定/16_未会計一部未徴収会計後イベントの接続方針.md) を踏まえて、changeSpec として確定する。

## 2. 変更目的

`terminalHome` の「未会計の会計」メニューを **「要対応の会計」** に改名し、閉店持ち越し未会計と会計後要対応（追加徴収 / 要返金）を 1 画面で扱う。Step01〜05 で整備した親 doc field（`closeSummary` / `postSettlementState`）から判定する読み取りモデルを実装し、各カードから適切な primary action 導線につなげる。

## 3. スコープ / 非対象

### 3.1 スコープ

#### 3.1.1 一覧画面の本実装

- 既存 `lib/Accounting/unsettledAccountingPage.dart` を **`lib/Accounting/requireSpecialAttentionPage.dart` にリネーム** + 中身を全面刷新（論点 1 案 A）
- 旧 import を全置換
- 新 AppBar title `要対応の会計`
- タブ: `日付ごと` / `ユーザー別` 両方を本実装
- カテゴリフィルタ: `すべて` / `未会計` / `追加徴収` / `要返金`
- 内部カード種別 3 種を実装
- 共通 view model 11 fields を導出
- 一覧取得は 3 種別を別 query で取得し client-side merge

#### 3.1.2 primary action 導線の callable 切替（論点 2 案 B）

- `carryover_unsettled` → `resume_accounting`: 既存 `AccountingPage` 流用（変更なし）
- `post_settlement_collection_pending` → `collect`: **新 dialog `PostSettlementCollectionDialog` を新設、`recordPostSettlementCollection` callable をたたく**
- `post_settlement_refund_pending` → `refund`: **新 dialog `PostSettlementRefundDialog` を新設、`recordPostSettlementRefund` callable をたたく**
- 旧 dialog (`RefundProcessingDialog` / `postAccountingRefundDialog`) は touch しない（併存）

#### 3.1.3 `terminalHomePage` メニューラベル変更

- L1490 `'未会計の会計'` → `'要対応の会計'`
- destination を新画面に切替

#### 3.1.4 Flutter widget / unit test

- 共通 view model 判定ロジックの unit test
- 一覧画面 widget test（filter 切替 / カード表示 / 件数内訳）
- 新 dialog の widget test（callable 呼び出し）

#### 3.1.5 ドキュメント整備

- 01〜08 + README + 00_全体進行管理 を完成させる

### 3.2 非対象

- `bills` 保存 schema の追加変更 → 既存で十分（Step01〜05 で確定済）
- `analyticsMonthly` 集計 → Step07
- reopen 実行フローの内部処理 → Step05 で実装済
- 旧 callable (`processRefund` / `postEventAdjustment` / `postEventReopen`) の改修 / 廃止 → 後続 step
- 既存 dialog (`RefundProcessingDialog` / `postAccountingRefundDialog` 等) の touch → 併存維持
- `users.unsettledBillsCount` counter の touch → 既存挙動維持
- migration / backfill → 行わない（未リリース前提）
- Firestore security rules の整理 → 後続

## 4. 主要決定事項（ユーザー確認済）

### 4.1 ファイル分割方針 → 案 A（rename + 刷新）

- `lib/Accounting/unsettledAccountingPage.dart` → `lib/Accounting/requireSpecialAttentionPage.dart` にリネーム
- class 名 `UnsettledAccountingPage` → `RequireSpecialAttentionPage`
- 内部実装を全面刷新（既存の `_buildTabByDate` プレースホルダ / `_buildTabByUser` 実装は廃棄、新規ロジックに差し替え）
- import 箇所: `terminalHomePage.dart` のみ（grep で確認済）

### 4.2 primary action 導線の callable 切替範囲 → 案 B（一覧 + callable 切替）

- 新 dialog 2 つ追加
  - `lib/Accounting/postSettlementCollectionDialog.dart`（`recordPostSettlementCollection` callable）
  - `lib/Accounting/postSettlementRefundDialog.dart`（`recordPostSettlementRefund` callable）
- これらは要対応一覧画面の primary action ボタンからのみ起動
- 旧 dialog (`RefundProcessingDialog` / `postAccountingRefundDialog`) は他の経路（既存 `AccountingPage` 内の事後操作 等）からは引き続き使われる

### 4.3 ユーザー別カード件数内訳 → 案 A（client-side 集計）

- 3 種別 query 結果を client-side で `userId` ごとに集計
- counter 増設はしない

### 4.4 `closeSummary` 読み出し → 案 A（旧 `closeSnapshot` は読まない）

- 新画面では `closeSummary.unresolved` のみ読む
- `closeSnapshot` は applyCloseSnapshot で dual-write 維持されているが、Step06 の新画面では読まない

### 4.5 `carryover_unsettled` の status 範囲 → 案 A（仕様書通り）

- `status=open` のみ
- `status=settling` は要対応一覧から除外

### 4.6 `userDisplayName` の source → 案 A（`bills.party.pokerName`）

- bill 単位で確定している pokerName を view model `userDisplayName` に使用
- `users/{userId}.displayName` は touch しない

## 5. 設計詳細

### 5.1 共通 view model

#### 5.1.1 dataclass 定義（Flutter）

```dart
enum BillCardType {
  carryoverUnsettled,
  postSettlementCollectionPending,
  postSettlementRefundPending,
}

enum PrimaryActionType {
  resumeAccounting,
  collect,
  refund,
}

class BillRequireAttentionViewModel {
  final String billId;
  final BillCardType cardType;
  final String displayLabel; // '未会計' / '追加徴収' / '要返金'
  final String businessDate; // bill.businessDate （元売上の営業日）
  final String displayTitle; // pokerName / id
  final int displayAmountIncl;
  final PrimaryActionType primaryActionType;
  final String sortDate; // 仕様書 §10.2 の cardType ごとに使い分け
  final String? badgeText;
  final String userId;
  final String userDisplayName;

  // 元 bill の生データへの参照（primary action 時の遷移用）
  final Map<String, dynamic> rawBill;
}
```

#### 5.1.2 cardType 判定ロジック

```dart
BillCardType? classifyBill(Map<String, dynamic> bill) {
  final status = bill['status'] as String?;
  final closeSummary = bill['closeSummary'] as Map<String, dynamic>?;
  final pss = bill['postSettlementState'] as Map<String, dynamic>?;

  // carryover_unsettled
  if (status == 'open' && closeSummary?['unresolved'] == true) {
    return BillCardType.carryoverUnsettled;
  }
  // post_settlement_*_pending
  if (status == 'post_settlement_pending' && pss != null) {
    final type = pss['requiredActionType'] as String?;
    final incl = (pss['requiredActionIncl'] as num?)?.toInt() ?? 0;
    if (incl > 0) {
      if (type == 'collection') return BillCardType.postSettlementCollectionPending;
      if (type == 'refund') return BillCardType.postSettlementRefundPending;
    }
  }
  return null; // 対象外
}
```

仕様書 §14.4「同じ bill が同時に複数 cardType に分類されない」は `if/return` の優先順位（`status` で先に分岐）で自然に保証される。

#### 5.1.3 sortDate 計算（仕様書 §10.2）

```dart
String computeSortDate(BillCardType cardType, Map<String, dynamic> bill) {
  switch (cardType) {
    case BillCardType.carryoverUnsettled:
      final closeSummary = bill['closeSummary'] as Map<String, dynamic>?;
      final closedBd = closeSummary?['closedBusinessDate'] as String?;
      if (closedBd != null && closedBd.isNotEmpty) return closedBd;
      return bill['businessDate'] as String? ?? '';
    case BillCardType.postSettlementCollectionPending:
    case BillCardType.postSettlementRefundPending:
      return bill['businessDate'] as String? ?? '';
  }
}
```

#### 5.1.4 displayAmountIncl 計算（仕様書 §12.1）

```dart
int computeDisplayAmountIncl(BillCardType cardType, Map<String, dynamic> bill) {
  switch (cardType) {
    case BillCardType.carryoverUnsettled:
      final closeSummary = bill['closeSummary'] as Map<String, dynamic>?;
      return (closeSummary?['displayAmountAtMark'] as num?)?.toInt() ?? 0;
    case BillCardType.postSettlementCollectionPending:
    case BillCardType.postSettlementRefundPending:
      final pss = bill['postSettlementState'] as Map<String, dynamic>?;
      return (pss?['requiredActionIncl'] as num?)?.toInt() ?? 0;
  }
}
```

#### 5.1.5 primaryActionType 計算（仕様書 §12.2）

```dart
PrimaryActionType computePrimaryAction(BillCardType cardType) {
  switch (cardType) {
    case BillCardType.carryoverUnsettled:
      return PrimaryActionType.resumeAccounting;
    case BillCardType.postSettlementCollectionPending:
      return PrimaryActionType.collect;
    case BillCardType.postSettlementRefundPending:
      return PrimaryActionType.refund;
  }
}
```

#### 5.1.6 displayLabel（仕様書 §8.1）

```dart
String computeDisplayLabel(BillCardType cardType) {
  switch (cardType) {
    case BillCardType.carryoverUnsettled: return '未会計';
    case BillCardType.postSettlementCollectionPending: return '追加徴収';
    case BillCardType.postSettlementRefundPending: return '要返金';
  }
}
```

### 5.2 一覧取得

#### 5.2.1 query 構成（仕様書 §13）

3 種別を別 query で取得し client-side でマージ:

```dart
// query 1: carryover_unsettled
firestore.collection('bills')
  .where('status', isEqualTo: 'open')
  .where('closeSummary.unresolved', isEqualTo: true)
  .snapshots();

// query 2: post_settlement_collection_pending
firestore.collection('bills')
  .where('status', isEqualTo: 'post_settlement_pending')
  .where('postSettlementState.requiredActionType', isEqualTo: 'collection')
  .snapshots();

// query 3: post_settlement_refund_pending
firestore.collection('bills')
  .where('status', isEqualTo: 'post_settlement_pending')
  .where('postSettlementState.requiredActionType', isEqualTo: 'refund')
  .snapshots();
```

`requiredActionIncl > 0` は client-side で filter（Firestore composite index 削減）。

#### 5.2.2 Firestore composite index 要件

- `(status ASC, closeSummary.unresolved ASC)`
- `(status ASC, postSettlementState.requiredActionType ASC)`

`firestore.indexes.json` に追加（既存に同等 index あれば再利用）。

#### 5.2.3 stream merge 方針

- 各 query を `StreamBuilder` ではなく `combineLatestStream`（手書き）で 3 streams を結合
- もしくは `StreamGroup.merge` (`async` package) を使い、3 streams を union → 全件を `BillRequireAttentionViewModel` に変換 → filter / sort
- 採用: 3 streams を `Stream<List<BillRequireAttentionViewModel>>` に組み立てる helper を作る

### 5.3 画面構造

#### 5.3.1 AppBar

- title: `要対応の会計`
- 配色: 既存 `Colors.brown[700]` 等を踏襲

#### 5.3.2 上部フィルタ chips（または segmented control）

- `すべて` / `未会計` / `追加徴収` / `要返金`
- デフォルト: `すべて`

#### 5.3.3 タブ

- `日付ごと` / `ユーザー別`

#### 5.3.4 タブ1: `日付ごと`

- フィルタ適用後の `BillRequireAttentionViewModel` 一覧を `sortDate` で grouping
- `sortDate` 降順
- 各 group: `sortDate` の見出し + bill カード一覧
- bill カード: `displayLabel` バッジ / `displayTitle` / `displayAmountIncl` / primary action ボタン

#### 5.3.5 タブ2: `ユーザー別`

- フィルタ適用後の `BillRequireAttentionViewModel` を `userId` で grouping
- 各 user カード:
  - `userDisplayName`
  - `総件数`
  - `未会計 x件` / `追加徴収 x件` / `要返金 x件`
- user カード tap → そのユーザーの bills 一覧画面に遷移
- bills 一覧画面 = タブ1 と同じ bill カード形式

### 5.4 primary action 導線

#### 5.4.1 `resume_accounting` (既存)

- bill カードの「会計を再開する」ボタン tap
- 既存 `AccountingPage(billId: ...)` に遷移
- `startAccounting` callable を経由して accounting 進行

#### 5.4.2 `collect` (新 dialog)

新 dialog `lib/Accounting/postSettlementCollectionDialog.dart`:

- 引数: `billId`, `cycleNo`, `targetAdjustmentId`（要対応 adjustment の ID）
- 入力欄:
  - `amountIncl`: 数値入力（`postSettlementState.requiredActionIncl` を初期値に）
  - `methodBreakdown`: 1 method の入力（cash 固定でも OK）
  - `executedAt`: 現在時刻 default
  - `cashflowBusinessDate`: 任意入力
  - `note`: 任意
- ボタン: 「徴収する」/ 「キャンセル」
- callable: `recordPostSettlementCollection` を呼ぶ
- 成功時: SnackBar 表示 → 一覧画面に戻る（自動更新）

#### 5.4.3 `refund` (新 dialog)

`postSettlementCollectionDialog.dart` と同型の `lib/Accounting/postSettlementRefundDialog.dart`:

- callable: `recordPostSettlementRefund`
- ボタン: 「返金する」/ 「キャンセル」
- 他は collection と同じ shape

### 5.5 件数内訳ロジック

```dart
class UserAttentionCounts {
  final int total;
  final int carryover;
  final int collection;
  final int refund;
  
  factory UserAttentionCounts.from(List<BillRequireAttentionViewModel> userBills) {
    final c = userBills.where((b) => b.cardType == BillCardType.carryoverUnsettled).length;
    final col = userBills.where((b) => b.cardType == BillCardType.postSettlementCollectionPending).length;
    final ref = userBills.where((b) => b.cardType == BillCardType.postSettlementRefundPending).length;
    return UserAttentionCounts(total: userBills.length, carryover: c, collection: col, refund: ref);
  }
}
```

仕様書 §11.3「フィルタ適用中でも、少なくとも当該ユーザーが持つ要対応件数内訳はカードに表示する」に対応:
- カード本体: フィルタ適用前の **全要対応件数** を `UserAttentionCounts` から表示
- カード tap で開く bill 一覧: フィルタ適用後の bill のみ

### 5.6 既存ファイル変更

#### 5.6.1 `lib/Home/terminalHomePage.dart`

- import 追加: `import 'package:amuse_app_template/Accounting/requireSpecialAttentionPage.dart';`
- import 削除: `import 'package:amuse_app_template/Accounting/unsettledAccountingPage.dart';`
- L1490 の menu entry を更新:
  ```dart
  (
    label: '要対応の会計',
    destination: const RequireSpecialAttentionPage(),
    optionKeys: [DeviceOptionKeys.accounting],
  ),
  ```

#### 5.6.2 `lib/Accounting/unsettledAccountingPage.dart`

- ファイル削除（rename 操作で `requireSpecialAttentionPage.dart` に内容を移動 + 全面刷新）

### 5.7 新規ファイル

| ファイル | 役割 |
|---|---|
| `lib/Accounting/requireSpecialAttentionPage.dart` | 要対応の会計画面（旧 `unsettledAccountingPage.dart` から rename） |
| `lib/Accounting/requireSpecialAttention/billRequireAttentionViewModel.dart` | 共通 view model dataclass + 判定ロジック |
| `lib/Accounting/requireSpecialAttention/userAttentionCounts.dart` | ユーザー別件数集計 |
| `lib/Accounting/postSettlementCollectionDialog.dart` | `recordPostSettlementCollection` callable をたたく dialog |
| `lib/Accounting/postSettlementRefundDialog.dart` | `recordPostSettlementRefund` callable をたたく dialog |
| `test/Accounting/requireSpecialAttention/billRequireAttentionViewModelTest.dart` | view model unit test |
| `test/Accounting/requireSpecialAttentionPageTest.dart` | 画面 widget test |

### 5.8 firestore.indexes.json への追加

```json
{
  "collectionGroup": "bills",
  "queryScope": "COLLECTION",
  "fields": [
    { "fieldPath": "status", "order": "ASCENDING" },
    { "fieldPath": "closeSummary.unresolved", "order": "ASCENDING" }
  ]
},
{
  "collectionGroup": "bills",
  "queryScope": "COLLECTION",
  "fields": [
    { "fieldPath": "status", "order": "ASCENDING" },
    { "fieldPath": "postSettlementState.requiredActionType", "order": "ASCENDING" }
  ]
}
```

既存 index と重複していないか確認する。

## 6. 実装順

1. `01_現状確認と影響範囲.md` の最終確認（既に完成）
2. `02_changeSpec.md`（このファイル）の最終化
3. 共通 view model dataclass + 判定ロジック を実装
4. view model unit test
5. 一覧画面 `requireSpecialAttentionPage.dart` を実装（旧 `unsettledAccountingPage.dart` を rename + 全面刷新）
6. `terminalHomePage.dart` の import / menu label を更新
7. 新 dialog 2 つ (`postSettlementCollectionDialog.dart` / `postSettlementRefundDialog.dart`) を実装
8. firestore.indexes.json 更新（必要なら）
9. Flutter widget test
10. Functions の既存テスト不変性を再確認（Step01〜05 リグレッション pass）
11. build / lint
12. ドキュメント完成（03〜08）

## 7. データ変更

### 7.1 新規 collection / doc

なし（仕様書 §15「要対応一覧都合で新しい共通正本 collection を作らない」）

### 7.2 既存 doc 更新

なし（読み取り専用）

### 7.3 firestore.indexes.json 更新

§5.8 のとおり 2 index を追加（既存と重複していなければ）

## 8. UI / API 変更

### 8.1 UI 変更

- `terminalHome` メニュー: ラベル変更
- 新画面: `要対応の会計`
- 旧画面: 削除（rename）

### 8.2 API 変更

- 新 callable は呼ばない（既存 callable `recordPostSettlementCollection` / `recordPostSettlementRefund` / `startAccounting` を流用）
- API 仕様変更なし

## 9. リスク

### 9.1 既存画面の rename による import 切れ

- `unsettledAccountingPage.dart` を削除すると import 元 (`terminalHomePage.dart`) が壊れる
- 対策: rename と import 更新を同 commit で行う（順序: 新ファイル作成 → terminalHomePage.dart 切替 → 旧ファイル削除）

### 9.2 firestore.indexes.json 更新の Emulator / 本番 deploy 影響

- 新 index が deploy されないと query が動かない
- 対策: changeSpec で必要 index を明示、deploy 手順を `08_実機確認手順.md` に記載

### 9.3 stream merge の race condition

- 3 streams を combine する際の更新順序により bills が一時的に重複や欠落する可能性
- 対策: 各 stream を `Map<String, BillVM>` で保持し、最新値で merge → race を吸収

### 9.4 新 dialog の callable 呼び出し失敗時のハンドリング

- callable で `failed-precondition` 等が返った場合の UI フィードバック
- 対策: try/catch で SnackBar / Dialog エラー表示、`finally` で loading 解除（`flutter-loading-display.mdc` cursor rule 準拠）

### 9.5 旧画面 / 旧 callable との混乱

- Step06 では新画面のみ `recordPostSettlement*` を呼ぶ
- 既存 `RefundProcessingDialog` 等は他画面（AccountingPage 等）からは引き続き旧 callable を呼ぶ
- 対策: 影響範囲を明確化し、`07_後続ステップへの伝達事項.md` で旧経路廃止を future として記載

## 10. 後方互換性

- 旧 callable / trigger 未変更
- 既存 dialog 未変更（併存）
- `users.unsettledBillsCount` counter 未変更
- `bills` 親 doc field 未変更
- `closeSnapshot` field は applyCloseSnapshot で dual-write 維持

## 11. 完了条件

- 全 changeSpec 内容を `03_仕様書トレース確認.md` に展開し、「完了」状態にする
- build / lint / 新 Flutter test / Functions 既存テストリグレッション すべて pass
- `06_確認結果サマリ.md` で確認結果を残す
- `07_後続ステップへの伝達事項.md` で Step07 / 旧経路廃止 への引き継ぎを残す
- `08_実機確認手順.md` で実機確認シナリオを残す
- `00_全体進行管理.md` の Step06 行を「完了」に更新
