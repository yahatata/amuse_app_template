# ChangeSpec（P1-09）

## 目的 / 関連文書
- **目的**: 
  - Flutter側の読み取り処理を `todaysBills` から `bills` コレクション＋サブコレクション対応へ移行する。
  - `getOpenBills` のレスポンス形式変更（`todaysBillsId` → `billId`）に対応する。
  - `activeStays` をアプリ全体で1本だけの単一長寿命リスナーで購読する仕組みを導入する（P1-13の内容を統合）。**各画面が `FirebaseFirestore.instance.collection('activeStays').where(...).snapshots()` を直接呼ぶ形は禁止**とし、`ActiveStaysService` 経由のみで購読する前提とする。
  - 既存のUI動作を維持しつつ、内部実装のみを新スキーマ対応に変更する。
- **参照**: 
  - `api_contract.md` §2.7 読み取り系API（`getUserOrderHistory`, `verifyPaymentSplit`, `getOpenBills`）
  - `modification_plan.md` P1-09行、P1-13行
  - `schema_plan.md` `/bills/{billId}` スキーマ、`/activeStays/{uid}` スキーマ
  - `active_stays_plan.md` §3.1 Flutter での利用
  - `helper_api_plan.md` §2 整合ポイントと責務分担

## 変更概要（What）

### 対象ファイル一覧（漏れなく抽出）

※ 本 ChangeSpec の「`todaysBills` を参照しているファイル一覧」は、`grep -R "todaysBills" lib/` の結果に基づいて抽出している。今後、新たに `todaysBills` 参照が追加された場合は、同様の `grep` で再確認し、本 ChangeSpec のスコープに含めること。

#### 1. `todaysBills` コレクションを直接参照しているファイル（7ファイル）
- `lib/Accounting/accountingPage.dart`: `todaysBills` から `open` と `settled` の伝票を取得（`_loadActiveBills`, `_loadSettledBills`）
- `lib/user_actions/bust_and_reentry_popup.dart`: `todaysBills` からユーザーのトーナメント情報を取得（`reentryCount` 取得）
- `lib/user_actions/addon_popup.dart`: `todaysBills` からトーナメント情報を取得（`addonCount` チェック）
- `lib/user_actions/bulk_addon_popup.dart`: `todaysBills` からトーナメント情報を取得（複数ユーザーの `addonCount` チェック）
- `lib/tournament/active/widgets/dialogs/register_participants_dialog.dart`: `todaysBills` から参加者リストを取得（全件取得）
- `lib/tournament/active/services/tournament_data_service.dart`: `todaysBills` からユーザー情報を取得（`pokerName`, `createdAt` 取得、旧形式boolean対応）
- `lib/sideGame/pages/side_game_table_home.dart`: `todaysBills` から参加者リストを取得（全件取得）

#### 2. P1-08で更新されたFunctionsを使用しているファイル（3ファイル、`billId` 対応が必要）
- `lib/Home/stayingUsersListPage.dart`: `getOpenBills` を使用（`todaysBillsId` → `billId` への対応が必要）
- `lib/OrderView/MenuView/menuListPage.dart`: `getOpenBills` を使用（`todaysBillsId` → `billId` への対応が必要）
- `lib/Accounting/accountingPage.dart`: `verifyPaymentSplit` を使用（既にP1-08対応済み、変更不要）

#### 3. 新規作成ファイル（`activeStays` リスナー統合）
- `lib/services/active_stays_service.dart`: `activeStays` をアプリ全体で1本だけの単一長寿命リスナーで購読する共通サービス（シングルトン）。内部に単一の Firestore リスナーを1つだけ持ち、それを全画面に共有する。各画面が `FirebaseFirestore.instance.collection('activeStays').where(...).snapshots()` を直接呼ぶ形は禁止とし、本サービス経由のみで購読する（P1-13の内容を統合）。

### 更新ファイル詳細

#### 1. `lib/Accounting/accountingPage.dart`
**変更内容**:
- `_loadActiveBills()`: `todaysBills` クエリを `bills` クエリに変更
  - `collection('todaysBills')` → `collection('bills')`
  - `where('date', isEqualTo: businessDate)` → `where('businessDate', isEqualTo: businessDate)`
  - `where('status', isEqualTo: 'open')` は維持
  - レスポンス形式のマッピング（`party.userId`, `party.pokerName`, `place.table`, `place.seat` など）
- `_loadSettledBills()`: `todaysBills` クエリを `bills` クエリに変更
  - `collection('todaysBills')` → `collection('bills')`
  - `where('date', isEqualTo: businessDate)` → `where('businessDate', isEqualTo: businessDate)`
  - `where('status', isEqualTo: 'settled')` は維持
  - `orderBy('accountingCompletedAt', descending: true)` → `orderBy('ops.accountingCompletedAt', descending: true)` に統一（会計完了時刻の正は `ops.accountingCompletedAt` とする）
  - レスポンス形式のマッピング（`amounts.grandTotalRounded` を `totalPrice` として使用）
- カテゴリ別金額計算ロジック: 会計画面の一覧では、従来通り bill のリストと totalPrice（= settled の場合は `amounts.grandTotalRounded`）を表示する。各伝票ごとに「現在の合計金額を計算」ボタン（例：詳細計算 など）を追加し、ユーザーがこのボタンを押したときにだけ、対象の bill 1件について、`getBillPreviewTotals` Cloud Function を呼び出してカテゴリ別金額と合計を取得し、ダイアログ or 下部シート等で表示する。**この「現在の合計金額」表示は UI補助用途のみ**であり、金額の正は `amounts.*`（確定済み伝票のサマリ）および `verifyPaymentSplit`（サーバ側の再集計結果）にある。**注**: 当初の ChangeSpec では「`getBillPreviewTotals` のような専用 Functions はまだ導入しない」としていたが、実装時に前倒しして導入し、テストまで完了している。
- `verifyPaymentSplit` の使用: 既にP1-08対応済みのため変更不要

#### 2. `lib/user_actions/bust_and_reentry_popup.dart`
**変更内容**:
- `todaysBills` からトーナメント情報を取得する処理を `bills` サブコレクションから取得するように変更
  - `activeStays/{userId}` から `billId` を取得（存在チェックは本処理側の責務）
  - `/bills/{billId}/tournaments/{tournamentId}` から `reentryCount` を取得
  - `todaysBills.tournaments[tournamentId].reentryCount` → `/bills/{billId}/tournaments/{tournamentId}.reentryCount`

#### 3. `lib/user_actions/addon_popup.dart`
**変更内容**:
- `todaysBills` からトーナメント情報を取得する処理を `bills` サブコレクションから取得するように変更
  - `activeStays/{userId}` から `billId` を取得（存在チェックは本処理側の責務）
  - `/bills/{billId}/tournaments/{tournamentId}` から `addonCount` を取得
  - `todaysBills.tournaments[tournamentId].addonCount` → `/bills/{billId}/tournaments/{tournamentId}.addonCount`

#### 4. `lib/user_actions/bulk_addon_popup.dart`
**変更内容**:
- `todaysBills` からトーナメント情報を取得する処理を `bills` サブコレクションから取得するように変更
  - 各ユーザーについて `activeStays/{userId}` から `billId` を取得（存在チェックは本処理側の責務）
  - `/bills/{billId}/tournaments/{tournamentId}` から `addonCount` を取得
  - `todaysBills.tournaments[tournamentId].addonCount` → `/bills/{billId}/tournaments/{tournamentId}.addonCount`

#### 5. `lib/tournament/active/widgets/dialogs/register_participants_dialog.dart`
**変更内容**:
- `todaysBills` から参加者リストを取得する処理を `activeStays` から取得するように変更
  - `StreamBuilder` で `collection('todaysBills').where('status', isEqualTo: 'open').snapshots()` を使用している場合は、`ActiveStaysService.instance.stream` を使用する（各画面が直接 Firestore を呼ぶ形は禁止）
  - `todaysBills.pokerName` → `activeStays.pokerName`
  - `todaysBills.userId` → `activeStays.uid`（ドキュメントID）

#### 6. `lib/tournament/active/services/tournament_data_service.dart`
**変更内容**:
- `getWaitingPlayers()` メソッド内の `todaysBills` 参照を `activeStays` 参照に変更
  - 旧形式（boolean）対応部分: `todaysBills` から `activeStays` に変更
  - `todaysBills.pokerName` → `activeStays.pokerName`
  - `todaysBills.createdAt` → `activeStays.startedAt`
  - `todaysBills.userId` → `activeStays.uid`（ドキュメントID）

#### 7. `lib/sideGame/pages/side_game_table_home.dart`
**変更内容**:
- `todaysBills` から参加者リストを取得する処理を `activeStays` から取得するように変更
  - `collection('todaysBills').get()` → `ActiveStaysService.instance.stream` を使用する（各画面が直接 Firestore を呼ぶ形は禁止）
  - `todaysBills.pokerName` → `activeStays.pokerName`
  - `todaysBills.userId` → `activeStays.uid`（ドキュメントID）

#### 8. `lib/Home/stayingUsersListPage.dart`
**変更内容**:
- `getOpenBills` のレスポンス形式変更に対応
  - `todaysBillsId` → `billId` への変更に対応（既にP1-08で `billId` が返却されるため、フィールド名を変更）
  - レスポンス形式は既に `billId` になっているため、フィールドアクセスを `billId` に統一

#### 9. `lib/OrderView/MenuView/menuListPage.dart`
**変更内容**:
- `getOpenBills` のレスポンス形式変更に対応
  - `todaysBillsId` → `billId` への変更に対応（既にP1-08で `billId` が返却されるため、フィールド名を変更）
  - レスポンス形式は既に `billId` になっているため、フィールドアクセスを `billId` に統一

#### 10. `lib/services/active_stays_service.dart`（新規作成）
**変更内容**:
- `activeStays` をアプリ全体で1本だけの単一長寿命リスナーで購読する共通サービスを実装（シングルトン、P1-13の内容を統合）
- 内部で Firestore の `snapshots()` を1回だけ呼び出し、その結果を `StreamController` を使ってアプリ全体で共有する
- 直近の `QuerySnapshot` を `_latestSnapshot` にキャッシュし、新規購読者には最初にキャッシュ済みの最新スナップショットを即座に流し、その後にリアルタイム更新を流す
- UI 側は `ActiveStaysService.instance.stream` を購読するだけにする（シングルトンインスタンス経由）
- 独自の再接続ロジックは不要。Firestore の内部リトライに任せる
- 各画面が `FirebaseFirestore.instance.collection('activeStays').where(...).snapshots()` を直接呼ぶ形は禁止とし、本サービス経由のみで購読する

### 新規ファイル
- `lib/services/active_stays_service.dart`: `activeStays` をアプリ全体で1本だけの単一長寿命リスナーで購読する共通サービス（シングルトン、P1-13の内容を統合）。`ActiveStaysService.instance.stream` 経由で購読する。
- `functions/src/accounting/getBillPreviewTotals.ts`: 会計開始前のプレビュー情報（カテゴリ別金額など）を取得する Cloud Function（実装時に前倒しして導入、テスト: `functions/__tests__/accounting/getBillPreviewTotals.spec.ts`）

### 呼び出し元影響範囲
- **Flutter側**: 
  - 既存のUI動作は維持（内部実装のみ変更）
  - `getOpenBills` の `billId` 変更に対応（`todaysBillsId` → `billId`）
  - `activeStays` リスナーの導入により、リアルタイム更新が可能になる
- **Functions側**:
  - 変更なし（既にP1-08で対応済み）

## 実装詳細（How）

### 1. `todaysBills` → `bills` クエリ移行

#### 1.1 `accountingPage.dart` の `_loadActiveBills()`
**Before (todaysBills)**:
```dart
final querySnapshot = await _firestore
    .collection('todaysBills')
    .where('date', isEqualTo: businessDate)
    .where('status', isEqualTo: 'open')
    .get();
```

**After (bills)**:
```dart
final querySnapshot = await _firestore
    .collection('bills')
    .where('businessDate', isEqualTo: businessDate)
    .where('status', isEqualTo: 'open')
    .get();
```

**レスポンス形式のマッピング**:
- `doc.id` → `id`（既存のまま）
- `data['userId']` → `data['party']['userId']` または `party.userId`
- `data['pokerName']` → `data['party']['pokerName']` または `party.pokerName`
- `data['currentTable']` → `data['place']['table']` または `place.table`
- `data['currentSeat']` → `data['place']['seat']` または `place.seat`
- `data['totalPrice']`:
  - 一覧表示では、`amounts.*` がまだ確定していない `open` 伝票について 4サブコレのフルスキャンは行わず、必要に応じて簡易的な参考値（または非表示）とする。
  - 厳密なカテゴリ別金額＋合計は「現在の合計金額を計算」ボタン押下時にのみ、`/bills/{billId}/extras` / `items` / `sideGameChips` / `tournaments` の4サブコレクションを読み、その場で計算してダイアログ等に表示する。金額の正は `amounts.*` および `verifyPaymentSplit` にある。

#### 1.2 `accountingPage.dart` の `_loadSettledBills()`
**Before (todaysBills)**:
```dart
final querySnapshot = await _firestore
    .collection('todaysBills')
    .where('date', isEqualTo: businessDate)
    .where('status', isEqualTo: 'settled')
    .orderBy('accountingCompletedAt', descending: true)
    .get();
```

**After (bills)**:
```dart
final querySnapshot = await _firestore
    .collection('bills')
    .where('businessDate', isEqualTo: businessDate)
    .where('status', isEqualTo: 'settled')
    .orderBy('ops.accountingCompletedAt', descending: true)
    .get();
```

**レスポンス形式のマッピング**:
- `doc.id` → `id`（既存のまま）
- `data['totalPrice']` → `data['amounts']['grandTotalRounded']` または `amounts.grandTotalRounded`
- その他のフィールドは `_loadActiveBills()` と同様

#### 1.3 カテゴリ別金額計算ロジック（`accountingPage.dart`）
**Before (todaysBills)**:
```dart
// 一覧表示時に常にカテゴリ別金額を計算
final List<dynamic> extraCost = bill['extraCost'] as List<dynamic>? ?? [];
final List<dynamic> items = bill['items'] as List<dynamic>? ?? [];
final List<dynamic> sideGameChip = bill['sideGameChip'] as List<dynamic>? ?? [];
final Map<String, dynamic> tournaments = bill['tournaments'] as Map<String, dynamic>? ?? {};

int extraCostAmount = 0;
for (var cost in extraCost) {
  if (cost is Map<String, dynamic>) {
    extraCostAmount += (cost['price'] as num?)?.toInt() ?? 0;
  }
}
```

**After (bills)**:
```dart
// 一覧表示時は従来通り bill のリストと totalPrice のみ表示
// 各伝票ごとに「現在の合計金額を計算」ボタンを追加

// ボタン押下時に対象 bill 1件分だけサブコレクションを読み取る
Future<void> _showCategoryBreakdownDialog(String billId) async {
  final billRef = _firestore.collection('bills').doc(billId);

  // extras サブコレクション
  final extrasSnapshot = await billRef.collection('extras').get();
  int extraCostAmount = extrasSnapshot.docs.fold(0, (sum, doc) {
    return sum + ((doc.data()['amountIncl'] as num?)?.toInt() ?? 0);
  });

  // items サブコレクション
  final itemsSnapshot = await billRef.collection('items').get();
  int itemsAmount = itemsSnapshot.docs.fold(0, (sum, doc) {
    return sum + ((doc.data()['totalPriceIncl'] as num?)?.toInt() ?? 0);
  });

  // sideGameChips サブコレクション（action='purchase'のみ）
  final sideGameChipsSnapshot = await billRef.collection('sideGameChips').get();
  int sideGameChipAmount = sideGameChipsSnapshot.docs
      .where((doc) => doc.data()['action'] == 'purchase')
      .fold(0, (sum, doc) {
        return sum + ((doc.data()['amountIncl'] as num?)?.toInt() ?? 0);
      });

  // tournaments サブコレクション
  final tournamentsSnapshot = await billRef.collection('tournaments').get();
  int tournamentsAmount = tournamentsSnapshot.docs.fold(0, (sum, doc) {
    final data = doc.data();
    return sum +
        ((data['entryFeeIncl'] as num?)?.toInt() ?? 0) * ((data['entryCount'] as num?)?.toInt() ?? 0) +
        ((data['reentryFeeIncl'] as num?)?.toInt() ?? 0) * ((data['reentryCount'] as num?)?.toInt() ?? 0) +
        ((data['addonFeeIncl'] as num?)?.toInt() ?? 0) * ((data['addonCount'] as num?)?.toInt() ?? 0);
  });

  // ダイアログ or 下部シートで表示
  // この表示は UI補助用途のみ。金額の正は amounts.* および verifyPaymentSplit にある
}
```

**注意**: 
- P1-09では、一覧の描画そのものは `bills` 本体のフィールドを中心に行う。重い集計（4サブコレクション読取り）は `getBillPreviewTotals` Cloud Function に委譲する。
- この「現在の合計金額」表示は UI補助用途のみであり、金額の正は `amounts.*`（確定済み伝票のサマリ）および `verifyPaymentSplit`（サーバ側の再集計結果）にある。
- **`getBillPreviewTotals` は実装時に前倒しして導入し、テストまで完了している**。当初の ChangeSpec では「将来の検討事項」としていたが、実装の都合上、P1-09 のスコープ内で導入した。

### 2. `todaysBills` → `activeStays` 移行（参加者リスト取得）

#### 2.1 `register_participants_dialog.dart` の `_loadAvailableParticipants()`
**Before (todaysBills)**:
```dart
// StreamBuilder で直接 Firestore を呼ぶ
StreamBuilder<QuerySnapshot>(
  stream: FirebaseFirestore.instance
      .collection('todaysBills')
      .where('status', isEqualTo: 'open')
      .snapshots(),
  builder: (context, snapshot) {
    // ...
  },
)
```

**After (activeStays)**:
```dart
// ActiveStaysService 経由で購読（各画面が直接 Firestore を呼ぶ形は禁止）
StreamBuilder<QuerySnapshot>(
  stream: ActiveStaysService.instance.stream,
  builder: (context, snapshot) {
    final activeStays = snapshot.data?.docs ?? [];
    final participants = <Map<String, dynamic>>[];
    
    for (final doc in activeStays) {
      final data = doc.data() as Map<String, dynamic>;
      final pokerName = data['pokerName'] as String?;
      final uid = doc.id; // activeStays のドキュメントID = uid
      
      if (pokerName != null && uid.isNotEmpty) {
        participants.add({
          'userId': uid,
          'pokerName': pokerName,
        });
      }
    }
    // ...
  },
)
```

#### 2.2 `tournament_data_service.dart` の `getWaitingPlayers()`
**Before (todaysBills)**:
```dart
final todayBillsQuery = await _firestore
    .collection('todaysBills')
    .where('userId', isEqualTo: userId)
    .where('status', isEqualTo: 'open')
    .limit(1)
    .get();

if (todayBillsQuery.docs.isNotEmpty) {
  final todayBillsData = todayBillsQuery.docs.first.data();
  final pokerName = todayBillsData['pokerName'] as String? ?? 'ユーザー$userId';
  final joinedAt = todayBillsData['createdAt']?.toDate() ?? DateTime.now().subtract(const Duration(minutes: 15));
  
  final waitingPlayer = WaitingPlayer(
    userId: userId,
    displayName: pokerName,
    joinedAt: joinedAt,
  );
  waitingPlayers.add(waitingPlayer);
}
```

**After (activeStays)**:
```dart
final activeStayDoc = await _firestore
    .collection('activeStays')
    .doc(userId)
    .get();

if (activeStayDoc.exists && activeStayDoc.data()?['isActive'] == true) {
  final activeStayData = activeStayDoc.data()!;
  final pokerName = activeStayData['pokerName'] as String? ?? 'ユーザー$userId';
  final startedAt = activeStayData['startedAt']?.toDate() ?? DateTime.now().subtract(const Duration(minutes: 15));
  
  final waitingPlayer = WaitingPlayer(
    userId: userId,
    displayName: pokerName,
    joinedAt: startedAt,
  );
  waitingPlayers.add(waitingPlayer);
}
```

#### 2.3 `side_game_table_home.dart` の `_loadAvailableParticipants()`
**変更内容**: `register_participants_dialog.dart` と同様に `ActiveStaysService.instance.stream` を使用するように変更（各画面が直接 Firestore を呼ぶ形は禁止）

### 3. `todaysBills` → `bills` サブコレクション移行（トーナメント情報取得）

#### 3.1 `bust_and_reentry_popup.dart` のトーナメント情報取得
**Before (todaysBills)**:
```dart
final todayBillsQuery = await FirebaseFirestore.instance
    .collection('todaysBills')
    .where('userId', isEqualTo: userId)
    .where('status', isEqualTo: 'open')
    .limit(1)
    .get();

if (todayBillsQuery.docs.isNotEmpty) {
  final todayBillsData = todayBillsQuery.docs.first.data();
  final tournaments = todayBillsData['tournaments'] as Map<String, dynamic>? ?? {};
  userTournamentData = tournaments[tournamentId];
  
  if (userTournamentData != null) {
    currentReentryCount = userTournamentData['reentryCount'] as int? ?? 0;
  }
}
```

**After (bills)**:
```dart
// activeStays から billId を取得
final activeStayDoc = await FirebaseFirestore.instance
    .collection('activeStays')
    .doc(userId)
    .get();

if (activeStayDoc.exists && activeStayDoc.data()?['isActive'] == true) {
  final billId = activeStayDoc.data()!['billId'] as String?;
  
  if (billId != null) {
    // bills サブコレクションからトーナメント情報を取得
    final tournamentDoc = await FirebaseFirestore.instance
        .collection('bills')
        .doc(billId)
        .collection('tournaments')
        .doc(tournamentId)
        .get();
    
    if (tournamentDoc.exists) {
      final tournamentData = tournamentDoc.data()!;
      currentReentryCount = tournamentData['reentryCount'] as int? ?? 0;
      userTournamentData = tournamentData;
    }
  }
}
```

#### 3.2 `addon_popup.dart` のトーナメント情報取得
**変更内容**: `bust_and_reentry_popup.dart` と同様に、`activeStays` から `billId` を取得し、`/bills/{billId}/tournaments/{tournamentId}` から `addonCount` を取得

#### 3.3 `bulk_addon_popup.dart` のトーナメント情報取得
**変更内容**: 複数ユーザーについて、各ユーザーの `activeStays/{userId}` から `billId` を取得し、`/bills/{billId}/tournaments/{tournamentId}` から `addonCount` を取得

### 4. `getOpenBills` レスポンス形式変更対応

#### 4.1 `stayingUsersListPage.dart` の `_fetch()`
**変更内容**: 
- レスポンスの `billId` フィールドを使用（既にP1-08で `billId` が返却されるため、フィールドアクセスを確認）
- `todaysBillsId` というフィールド名が残っていないか確認し、あれば `billId` に変更

#### 4.2 `menuListPage.dart` の `_showOrderDialog()`
**変更内容**: 
- レスポンスの `billId` フィールドを使用（既にP1-08で `billId` が返却されるため、フィールドアクセスを確認）
- `todaysBillsId` というフィールド名が残っていないか確認し、あれば `billId` に変更

### 5. `activeStays` 単一長寿命リスナー導入（P1-13統合）

#### 5.1 `lib/services/active_stays_service.dart`（新規作成）
**仕様**:
- `ActiveStaysService` は直近の `QuerySnapshot` を `_latestSnapshot` などのフィールドにキャッシュする。
- 新しく `ActiveStaysService.instance.stream` を購読した画面には、最初にキャッシュ済みの最新スナップショットを即座に流し、その後にリアルタイムの更新を流す。
- これにより、画面遷移直後でも「activeStays の現時点の一覧」が即座に描画される。

**実装内容**:
```dart
import 'package:cloud_firestore/cloud_firestore.dart';
import 'dart:async';

/// activeStays をアプリ全体で1本だけの単一長寿命リスナーで購読するサービス（シングルトン）
/// 内部で Firestore の snapshots() を1回だけ呼び出し、その結果を StreamController を使って
/// アプリ全体で共有する。各画面が直接 Firestore を呼ぶ形は禁止。
class ActiveStaysService {
  final FirebaseFirestore _firestore = FirebaseFirestore.instance;
  StreamSubscription<QuerySnapshot>? _subscription;
  final StreamController<QuerySnapshot> _streamController = StreamController<QuerySnapshot>.broadcast();
  
  /// 直近の QuerySnapshot をキャッシュ（新規購読者に即座に返すため）
  QuerySnapshot? _latestSnapshot;
  
  /// シングルトンインスタンス（static getter）
  static final ActiveStaysService _instance = ActiveStaysService._();
  static ActiveStaysService get instance => _instance;
  
  ActiveStaysService._() {
    _initializeListener();
  }
  
  /// 内部で Firestore リスナーを1本だけ張る
  void _initializeListener() {
    _subscription = _firestore
        .collection('activeStays')
        .where('isActive', isEqualTo: true)
        .snapshots()
        .listen(
          (snapshot) {
            _latestSnapshot = snapshot;
            _streamController.add(snapshot);
          },
          onError: (error) {
            // Firestore の内部リトライに任せる（独自の再接続ロジックは不要）
            _streamController.addError(error);
          },
        );
  }
  
  /// UI 側が購読する Stream
  /// - 新しい購読者にはまず最新スナップショットを 1 回返し、
  ///   その後にリアルタイム更新を流す。
  Stream<QuerySnapshot> get stream async* {
    if (_latestSnapshot != null) {
      yield _latestSnapshot!;
    }
    yield* _streamController.stream;
  }
  
  /// リスナーのキャンセル（アプリ終了時など）
  void dispose() {
    _subscription?.cancel();
    _streamController.close();
  }
}
```

**使用例**:
```dart
// StreamBuilder で使用（各画面は ActiveStaysService.instance.stream を購読するだけ）
StreamBuilder<QuerySnapshot>(
  stream: ActiveStaysService.instance.stream,
  builder: (context, snapshot) {
    if (snapshot.hasError) {
      return Text('エラー: ${snapshot.error}');
    }
    if (snapshot.connectionState == ConnectionState.waiting) {
      return CircularProgressIndicator();
    }
    
    final activeStays = snapshot.data?.docs ?? [];
    return ListView.builder(
      itemCount: activeStays.length,
      itemBuilder: (context, index) {
        final doc = activeStays[index];
        final data = doc.data() as Map<String, dynamic>;
        return ListTile(
          title: Text(data['pokerName'] ?? ''),
          subtitle: Text('Bill ID: ${data['billId']}'),
        );
      },
    );
  },
)
```

**禁止事項**:
- 各画面が `FirebaseFirestore.instance.collection('activeStays').where('isActive', isEqualTo: true).snapshots()` を直接呼ぶ形は禁止
- `ActiveStaysService` 経由のみで購読すること

### 書込み先
- 読み取り専用のため、書込みなし

### 冪等性
- 読み取り専用のため、冪等性の考慮不要

### デュアルライト
- 読み取り専用のため、デュアルライトの考慮不要

### 権限境界
- **Functions側**: 変更なし（既にP1-08で対応済み）
- **Client側**: 既存の権限チェックを維持
  - `activeStays` の読み取りは認証済みユーザー全員可（`active_stays_plan.md` §4 セキュリティルール）
  - `bills` の読み取りは既存のルールを維持

### 競合解決
- 読み取り専用のため、競合解決の考慮不要

### インデックス・ルール・監視
- **`bills` 用インデックス**: 
  - `(businessDate ASC, status ASC, ops.accountingCompletedAt DESC)` が必要（`accountingPage.dart` の `_loadSettledBills()` で使用）
  - 既存のインデックスに追加するか、新規作成する必要がある
- **`activeStays` 用インデックス**: 
  - `(isActive ASC, startedAt ASC)` が必要（在席一覧のソート用、既存のインデックスを確認）
- **Firestore ルール**: 既存のルールを維持（変更不要）

### ログ/メトリクス
- `activeStays` リスナーのエラーをログに記録（Firestore の内部リトライに任せるため、独自の再接続ロジックは不要）
- サブコレクション取得のパフォーマンスを監視（必要に応じて）

### 例外（エラーハンドリング）
- **Firestore エラー**: 既存のエラーハンドリングを維持
- **`activeStays` 不存在**: `activeStays/{userId}` が存在しない場合は、`billId` が取得できないため、適切なエラーメッセージを表示
- **サブコレクション取得エラー**: サブコレクションの取得に失敗した場合は、既存のエラーハンドリングを維持

## 仕様差分（Before→After）

### `accountingPage.dart` の仕様変更

**Before (todaysBills)**:
- `todaysBills` から `date` + `status` でフィルタ
- `totalPrice` は `todaysBills.totalPrice` を使用
- カテゴリ別金額は `todaysBills` の配列形式から計算

**After (bills)**:
- `bills` から `businessDate` + `status` でフィルタ
- 一覧表示時の `totalPrice` は「UI上の参考値」であり、P1-09では 4つのサブコレクションを全件読み込んで厳密計算することはしない。`amounts.grandTotalRounded` が存在する確定済み伝票の場合はそれを使用し、`open` 伝票については必要に応じて簡易的な参考値（または非表示）とする
- 会計完了時刻の正は `ops.accountingCompletedAt` とし、settled一覧のソートもこれに合わせる
- 厳密なカテゴリ別金額＋合計は「現在の合計金額を計算」ボタン押下時の `_showCategoryBreakdownDialog(billId)` 内でのみ、4サブコレクションを読んで計算する
- 金額の「正」としては `amounts.*` と `verifyPaymentSplit` の結果を信用し、一覧側の `totalPrice` はあくまで補助的な表示（必要であれば簡易集計 or 表示なし）である
- P1-09では、一覧の描画そのものは `bills` 本体のフィールドを中心に行う。重い集計（4サブコレクション読取り）は `_showCategoryBreakdownDialog` の中に閉じ込める

### 参加者リスト取得の仕様変更

**Before (todaysBills)**:
- `todaysBills` から全件取得または `userId` でフィルタ
- `todaysBills.pokerName`, `todaysBills.userId` を使用

**After (activeStays)**:
- `activeStays` から `isActive == true` でフィルタ
- `activeStays.pokerName`, `activeStays.uid`（ドキュメントID）を使用

### トーナメント情報取得の仕様変更

**Before (todaysBills)**:
- `todaysBills` から `userId` + `status='open'` でフィルタ
- `todaysBills.tournaments[tournamentId]` から情報を取得

**After (bills)**:
- `activeStays/{userId}` から `billId` を取得
- `/bills/{billId}/tournaments/{tournamentId}` から情報を取得

### `getOpenBills` レスポンス形式変更

**Before (todaysBills)**:
- レスポンスに `todaysBillsId` フィールドが含まれる

**After (bills)**:
- レスポンスに `billId` フィールドが含まれる（P1-08で既に変更済み）

### `activeStays` リスナー導入（P1-13統合）

**Before (P1-09以前)**:
- `activeStays` の読み取りは都度クエリで取得
- 各画面が個別に `FirebaseFirestore.instance.collection('activeStays').where(...).snapshots()` を呼ぶ

**After (P1-09)**:
- `activeStays` をアプリ全体で1本だけの単一長寿命リスナーで購読（`ActiveStaysService` が内部で管理）
- 各画面は `ActiveStaysService.instance.stream` を購読するだけ（シングルトンインスタンス経由）
- 各画面が `FirebaseFirestore.instance.collection('activeStays').where(...).snapshots()` を直接呼ぶ形は禁止
- `ActiveStaysService` は直近の `QuerySnapshot` をキャッシュし、新規購読者には最初にキャッシュ済みの最新スナップショットを即座に流し、その後にリアルタイム更新を流す
- 画面遷移直後でも「activeStays の現時点の一覧」が即座に描画される
- リアルタイム更新が可能になる
- Firestore の内部リトライに任せる（独自の再接続ロジックは不要）

## テスト

### 単体テスト（各ファイル）

#### `accountingPage.dart`
- **happy path**: 
  - 正常な `bills` クエリ（`open` 伝票取得）
  - 正常な `bills` クエリ（`settled` 伝票取得、`ops.accountingCompletedAt` でソート）
  - 「現在の合計金額を計算」ボタン押下時のサブコレクションからのカテゴリ別金額計算
- **エラーハンドリング**: 
  - `bills` クエリエラー
  - サブコレクション取得エラー
- **レスポンス形式**: 
  - `party.userId`, `party.pokerName`, `place.table`, `place.seat` のマッピング確認
  - `amounts.grandTotalRounded` のマッピング確認
  - `ops.accountingCompletedAt` でのソート確認

#### `bust_and_reentry_popup.dart`, `addon_popup.dart`, `bulk_addon_popup.dart`
- **happy path**: 
  - `activeStays` から `billId` 取得
  - `/bills/{billId}/tournaments/{tournamentId}` から情報取得
- **エラーハンドリング**: 
  - `activeStays` 不存在
  - `billId` 未設定
  - トーナメント情報不存在

#### `register_participants_dialog.dart`, `tournament_data_service.dart`, `side_game_table_home.dart`
- **happy path**: 
  - `activeStays` から参加者リスト取得
  - `isActive == true` フィルタ確認
- **エラーハンドリング**: 
  - `activeStays` クエリエラー

#### `stayingUsersListPage.dart`, `menuListPage.dart`
- **happy path**: 
  - `getOpenBills` の `billId` フィールドを使用
- **レスポンス形式**: 
  - `billId` フィールドの存在確認

#### `active_stays_service.dart`（新規）
- **happy path**: 
  - 正常なストリーム購読（アプリ全体で1本だけのリスナー）
  - 複数画面から同じ Stream を購読できること
  - リアルタイム更新の確認
- **エラーハンドリング**: 
  - Firestore の内部リトライに任せる（独自の再接続ロジックは不要）
  - エラー時の適切な処理

### 統合テスト
- **`activeStays` リスナー**: 
  - アプリ起動時の購読確認（1本だけのリスナー）
  - 複数画面から同じ Stream を購読できること（`ActiveStaysService.instance.stream` 経由）
  - 新規購読者にキャッシュ済みの最新スナップショットが即座に流れること
  - リアルタイム更新の確認
  - Firestore の内部リトライ動作確認
- **サブコレクション取得**: 
  - パフォーマンス確認（ボタン押下時に対象 bill 1件分だけのサブコレクション取得時間）
  - エラーハンドリング確認

### 手動テスト（3〜4手順程度）
1. 会計画面で `bills` から伝票一覧が正しく表示されることを確認（`ops.accountingCompletedAt` でソート）
2. 会計画面で「現在の合計金額を計算」ボタンを押下し、サブコレクションからカテゴリ別金額が正しく計算・表示されることを確認
3. トーナメント操作（Bust&リエントリー、Addon）で `bills` サブコレクションから情報が正しく取得されることを確認
4. `activeStays` リスナーでリアルタイム更新が反映されることを確認（複数画面から同じ Stream を購読、画面遷移直後でも最新スナップショットが即座に表示されること）

## ドキュメント更新
- **`README.md`**: P1-09完了を追記、実装内容とテスト結果を記載
- **`modification_plan.md`**: P1-09の状態を「完了」に更新、P1-13の状態も「完了」に更新（統合のため）、仕様差分を詳細に追記
- **`changelog.md`**: P1-09完了エントリを追加、実装ファイル一覧とテスト結果を記載
- **`test_plan.md`**: P1-09テスト観点を「実施済み」に更新、テストケース詳細を追記
- **`api_contract.md`**: 最終更新日を更新（API契約自体は変更なし）

## 依存関係
- **P1-08 (読み取り Functions)**: 完了済み ✅
- **P1-13 (Flutter リスナー)**: P1-09に統合 ✅
  - P1-13（Flutter リスナー：`activeStays` 単一長寿命リスナー導入）は、本 P1-09 の一部として実装する。
  - P1-13単体の実装タスクは存在せず、P1-09完了時に P1-13 も完了扱いとする。

## 注意事項
- **レスポンス形式の互換性**: 既存のUI動作を維持するため、レスポンス形式は可能な限り維持する
- **サブコレクション取得のパフォーマンス**: 「現在の合計金額を計算」ボタン押下時に対象 bill 1件分だけサブコレクションを読み取るため、一覧表示時のパフォーマンスへの影響は最小限
- **`activeStays` リスナーの管理**: **`activeStays` のリスナーは `ActiveStaysService` の内部で1本だけ張る**。各画面が `FirebaseFirestore.instance.collection('activeStays').where(...).snapshots()` を直接呼ぶ形は禁止。Firestore の内部リトライに任せる（独自の再接続ロジックは不要）
- **`billId` 変更対応**: `getOpenBills` のレスポンス形式変更（`todaysBillsId` → `billId`）に対応する必要がある
- **`activeStays` 不存在時の処理**: `activeStays/{userId}` が存在しない場合は、適切なエラーメッセージを表示する
- **カテゴリ別金額計算の位置づけ**: この「現在の合計金額」表示は UI補助用途のみであり、金額の正は `amounts.*`（確定済み伝票のサマリ）および `verifyPaymentSplit`（サーバ側の再集計結果）にある。**`getBillPreviewTotals` は実装時に前倒しして導入し、テストまで完了している**（当初の ChangeSpec では「将来の検討事項」としていたが、実装の都合上、P1-09 のスコープ内で導入した）
- **トーナメント関連画面のN×アクセス懸念**: 
  - 対象ファイル: `lib/user_actions/bulk_addon_popup.dart`, `lib/user_actions/bust_and_reentry_popup.dart`, `lib/user_actions/addon_popup.dart`
  - 現仕様では、これらの画面でユーザー数が多い場合、各ユーザーについて `activeStays/{userId}` → `billId` → `/bills/{billId}/tournaments/{tournamentId}` の順に読み取るため、ユーザー数に比例したクエリ数になる
  - 現時点では仕様として許容するが、今後参加者数が増加した場合には、`activeStays` のキャッシュ、batched reads / 集約クエリなどによる負荷軽減を検討する

## P1-13統合の判断理由

P1-13で予定していた「`activeStays` を単一長寿命リスナーで購読する仕組みを導入」をP1-09に統合する理由：

1. **実装の一貫性**: `activeStays` の読み取り処理を `todaysBills` から移行する際に、同時にリスナーを導入することで、実装の一貫性が保たれる
2. **手間の削減**: P1-09とP1-13を分離して実装すると、`activeStays` の読み取り処理を2回変更する必要があり、手間が増える
3. **テストの効率化**: リスナーの導入と読み取り処理の移行を同時にテストすることで、テストの効率が向上する
4. **依存関係の明確化**: P1-13はP1-09に依存しているため、統合することで依存関係が明確になる

**P1-13単体の実装タスクは存在せず、P1-09完了時に P1-13 も完了扱いとする。**

## 将来の検討事項
- **サブコレクション取得の最適化**: 複数サブコレクションの取得を並列化することで、パフォーマンスを向上させる
- **`getBillPreviewTotals` APIの導入**: ~~会計前の合計金額を取得するAPIを導入することで、クライアント側集計ロジックを削減する~~ → **実装時に前倒しして導入済み**（`functions/src/accounting/getBillPreviewTotals.ts`、テスト: `functions/__tests__/accounting/getBillPreviewTotals.spec.ts`）
- **トーナメント関連画面の負荷軽減**: 参加者数が増加した場合には、`activeStays` のキャッシュ、batched reads / 集約クエリなどによる負荷軽減を検討する（対象: `bulk_addon_popup.dart`, `bust_and_reentry_popup.dart`, `addon_popup.dart`）

