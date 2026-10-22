# Phase4: UI改修（予定・任意日時） - 実装詳細仕様書

## 概要

Phase4では、日付選択UIや予定・任意日時のデータを表示するUIを改修し、`storeMeta/currentBusinessDay`から`currentBusinessDateKey`を取得するか、現在の日時が属する日付を`businessDate`として使用してクエリするように変更する。データが既に`businessDate`フィールドを持っているため、`calcBusinessDate` Cloud Functionは不要である。

## 実装タスク

### 0. Phase4の対象範囲

**Phase4の対象**:
- **日付選択画面（billsコレクション）**（ユーザーが日付を選択するUI）
  - `lib/Accounting/accountingHistoryPage.dart` - 日付選択画面（初期化時に一度だけ`storeMeta/currentBusinessDay`を取得）
  - `lib/Accounting/postAccountingAdjustmentsPage.dart` - 日付選択画面（初期化時に一度だけ`storeMeta/currentBusinessDay`を取得）
- **日付選択画面（scheduledTournamentsコレクション）**（営業時間内のトーナメントを取得）
  - `lib/Accounting/accountingEditDialog.dart` - `scheduledTournaments`の範囲クエリ（`STORE_CLOSE_HOUR`を使用して営業時間を計算）
- **予定・任意日時**（`scheduledTournaments`コレクションの表示）
  - `lib/tournament/scheduling/pages/scheduled_tournament_list_page.dart` - 営業日ベースの表示に変更する場合は`businessDate`でフィルタリング
  - `lib/tournament/scheduling/pages/scheduled_tournament_in_calendar_page.dart` - 営業日ベースの表示に変更する場合は`businessDate`でフィルタリング
  - `lib/tournament/pages/tournament_select_page.dart` - 営業日ベースの表示に変更する場合は`businessDate`でフィルタリング（ただし、このページは`terminalHomePage.dart`で使用されているため、削除対象外）

**Phase4の対象外**:
- **当日画面**（Phase3で対応済み）
- **attendancesコレクション**（保留中、`deferred_tasks.md`参照）
- **attendanceCorrectionRequestsコレクション**（保留中、`deferred_tasks.md`参照）

---

### 1. `lib/Accounting/accountingHistoryPage.dart`の改修

#### 1.1 現状確認

**ファイル**: `lib/Accounting/accountingHistoryPage.dart`

**現状**:
- `_getBusinessDate()`メソッド（29-40行目）で`GlobalConstants.STORE_CLOSE_HOUR`を直接使用
- `_selectedDate`は`DateTime`型で、ユーザーが`showDatePicker`で選択（210-222行目）
- 49行目で`_selectedDate.toIso8601String().split('T')[0]`を使用して`YYYY-MM-DD`形式に変換してクエリ
- 初期化時（24行目）は`_getBusinessDate()`を使用

**課題**:
- 初期化時に`GlobalConstants.STORE_CLOSE_HOUR`を直接使用している
- 選択値は`DateTime`だが、`YYYY-MM-DD`形式に変換してクエリしているため、`calcBusinessDate`は不要（そのままクエリ可能）

#### 1.2 実装内容

**修正箇所**:
1. **`_getBusinessDate()`メソッドの削除**（29-40行目）
2. **初期化時に`storeMeta/currentBusinessDay`を取得（一度だけ）**
   - 初期化時に一度だけ`storeMeta/currentBusinessDay`を取得（snapshot購読は不要）
   - `status === 'running'`かつ`currentBusinessDateKey !== null`の場合は、`currentBusinessDateKey`を`DateTime`に変換して`_selectedDate`に設定
   - 閉店中の場合は、現在の日時が属する日付を`businessDate`として使用（`DateFormat('yyyy-MM-dd').format(DateTime.now())`）
3. **日付選択時の処理は変更不要**
   - 選択値は`DateTime`だが、`YYYY-MM-DD`形式に変換してクエリしているため、`calcBusinessDate`は不要（そのままクエリ可能）

**実装パターン**:
```dart
@override
void initState() {
  super.initState();
  _initializeSelectedDate();
  _loadAccountingHistory();
}

Future<void> _initializeSelectedDate() async {
  try {
    final stateDoc = await FirebaseFirestore.instance
        .collection('storeMeta')
        .doc('currentBusinessDay')
        .get();
    
    final stateData = stateDoc.data() as Map<String, dynamic>?;
    final status = stateData?['status'] as String?;
    final currentBusinessDateKey = stateData?['currentBusinessDateKey'] as String?;
    
    String businessDateKey;
    if (status == 'running' && currentBusinessDateKey != null) {
      businessDateKey = currentBusinessDateKey;
    } else {
      // 閉店中の場合は、現在の日時が属する日付をbusinessDateとして使用
      businessDateKey = DateFormat('yyyy-MM-dd').format(DateTime.now());
    }
    
    setState(() {
      _selectedDate = DateTime.parse(businessDateKey);
    });
  } catch (e) {
    // エラー時は現在日時を使用
    setState(() {
      _selectedDate = DateTime.now();
    });
  }
}
```

**注意事項**:
- 初期化時のみ`storeMeta/currentBusinessDay`を取得（snapshot購読は不要）
- 日付選択時（`_selectDate()`）は、選択された`DateTime`を`YYYY-MM-DD`形式に変換してそのままクエリ（`calcBusinessDate`不要）

---

### 2. `lib/Accounting/postAccountingAdjustmentsPage.dart`の改修

#### 2.1 現状確認

**ファイル**: `lib/Accounting/postAccountingAdjustmentsPage.dart`

**現状**:
- `_getBusinessDate()`メソッド（37-48行目）で`GlobalConstants.STORE_CLOSE_HOUR`を直接使用
- `_selectedDate`は`DateTime`型で、ユーザーが`showDatePicker`で選択（137-150行目）
- 60行目で`_formatBusinessDate(_selectedDate)`を使用して`YYYY-MM-DD`形式に変換してクエリ
- 初期化時（32行目）は`_getBusinessDate()`を使用

**課題**:
- `accountingHistoryPage.dart`と同様の課題

#### 2.2 実装内容

**修正箇所**:
- `accountingHistoryPage.dart`と同様の修正

**実装パターン**:
- `accountingHistoryPage.dart`と同様のパターンを使用

---

### 3. `lib/Accounting/accountingEditDialog.dart`の改修

#### 3.1 現状確認

**ファイル**: `lib/Accounting/accountingEditDialog.dart`

**現状**:
- `_getBusinessDate()`メソッド（55-67行目）で`GlobalConstants.STORE_CLOSE_HOUR`を直接使用
- `_loadAvailableOptions()`メソッド（70-142行目）で`STORE_CLOSE_HOUR`を使用して営業時間を計算
- `scheduledTournaments`の範囲クエリ（91-95行目）で`startAt`を使用

**課題**:
- `STORE_CLOSE_HOUR`を直接使用して営業時間を計算している
- `scheduledTournaments`コレクションには`businessDate`フィールドが追加されている（Phase2で実装済み）ため、`businessDate`で直接フィルタリング可能

#### 3.2 実装内容

**修正箇所**:
1. **`_getBusinessDate()`メソッドの削除**（55-67行目）
2. **`_loadAvailableOptions()`メソッドの修正**（70-142行目）
   - `STORE_CLOSE_HOUR`を使用した営業時間計算を削除
   - `storeMeta/currentBusinessDay`を取得して`currentBusinessDateKey`を取得
   - 閉店中の場合は、現在の日時が属する日付を`businessDate`として使用
   - `scheduledTournaments`のクエリを`businessDate`でフィルタリング（`where('businessDate', isEqualTo: businessDateKey)`）

**実装パターン**:
```dart
Future<void> _loadAvailableOptions() async {
  // storeMeta/currentBusinessDayを取得してcurrentBusinessDateKeyを取得
  final stateDoc = await FirebaseFirestore.instance
      .collection('storeMeta')
      .doc('currentBusinessDay')
      .get();
  
  final stateData = stateDoc.data() as Map<String, dynamic>?;
  final status = stateData?['status'] as String?;
  final currentBusinessDateKey = stateData?['currentBusinessDateKey'] as String?;
  
  String businessDateKey;
  if (status == 'running' && currentBusinessDateKey != null) {
    businessDateKey = currentBusinessDateKey;
  } else {
    // 閉店中の場合は、現在の日時が属する日付をbusinessDateとして使用
    businessDateKey = DateFormat('yyyy-MM-dd').format(DateTime.now());
  }
  
  // businessDateでフィルタリング
  final tournamentsSnapshot = await _firestore
      .collection('scheduledTournaments')
      .where('businessDate', isEqualTo: businessDateKey)
      .get();
  
  setState(() {
    _availableTournaments = tournamentsSnapshot.docs.map((doc) {
      final data = doc.data();
      return {
        'id': doc.id,
        'templateName': data['snapshot']?['name'] ?? data['snapshot']?['templateName'] ?? '',
        'entryFee': data['snapshot']?['entryFee'] ?? 0,
      };
    }).toList();
  });
  
  // ... メニューアイテムの取得（既存のまま）
}
```

**注意事項**:
- `businessDate`フィールドで直接フィルタリング（`calcBusinessDate`不要）
- `startAt`の範囲クエリは削除

---

### 4. `lib/tournament/scheduling/pages/scheduled_tournament_list_page.dart`の改修

#### 4.1 現状確認

**ファイル**: `lib/tournament/scheduling/pages/scheduled_tournament_list_page.dart`

**現状**:
- `_getTournamentsStream()`メソッド（497-570行目）で`startAt`を使用してフィルタリング
- 期間選択（`yesterday`, `today`, `thisWeek`, `all`）に応じて`startAt`の範囲クエリを使用
- `scheduledTournaments`コレクションには`businessDate`フィールドが追加されている（Phase2で実装済み）

**課題**:
- `startAt`でフィルタリングしているが、`businessDate`フィールドで直接フィルタリング可能
- 期間選択に応じて、営業日キー列を生成する必要がある

#### 4.2 実装内容

**修正箇所**:
1. **`_getTournamentsStream()`メソッドの修正**（497-570行目）
   - `startAt`の範囲クエリを削除
   - `storeMeta/currentBusinessDay`を取得して今日の`businessDate`を取得
   - 閉店中の場合は、現在の日時が属する日付を今日として使用
   - 期間選択に応じて、今日を起点に営業日キー列を生成（`DateTime`加算で前日/翌日を計算）
   - `businessDate`でフィルタリング（`whereIn`を使用、最大10要素まで）

**実装パターン**:
```dart
Stream<QuerySnapshot> _getTournamentsStream() {
  // キャッシュにストリームがある場合はそれを返す
  if (_streamCache.containsKey(_selectedPeriod)) {
    return _streamCache[_selectedPeriod]!;
  }
  
  // storeMeta/currentBusinessDayを取得して今日のbusinessDateを取得
  return FirebaseFirestore.instance
      .collection('storeMeta')
      .doc('currentBusinessDay')
      .snapshots()
      .asyncMap((stateSnapshot) async {
    String todayBusinessDateKey;
    
    if (stateSnapshot.exists) {
      final stateData = stateSnapshot.data() as Map<String, dynamic>?;
      final status = stateData?['status'] as String?;
      final currentBusinessDateKey = stateData?['currentBusinessDateKey'] as String?;
      
      if (status == 'running' && currentBusinessDateKey != null) {
        todayBusinessDateKey = currentBusinessDateKey;
      } else {
        // 閉店中の場合は、現在の日時が属する日付を今日として使用
        todayBusinessDateKey = DateFormat('yyyy-MM-dd').format(DateTime.now());
      }
    } else {
      // state docが存在しない場合は、現在の日時が属する日付を今日として使用
      todayBusinessDateKey = DateFormat('yyyy-MM-dd').format(DateTime.now());
    }
    
    // 期間に応じた営業日キー列を生成
    List<String> businessDateKeys = [];
    
    switch (_selectedPeriod) {
      case 'yesterday':
        // 前日の営業日キーを生成
        final todayDate = DateTime.parse(todayBusinessDateKey);
        final yesterdayDate = todayDate.subtract(const Duration(days: 1));
        businessDateKeys = [DateFormat('yyyy-MM-dd').format(yesterdayDate)];
        break;
        
      case 'today':
        // 当日の営業日キー
        businessDateKeys = [todayBusinessDateKey];
        break;
        
      case 'thisWeek':
        // 今後7日分の営業日キー列を生成
        final todayDate = DateTime.parse(todayBusinessDateKey);
        for (int i = 0; i < 7; i++) {
          final date = todayDate.add(Duration(days: i));
          businessDateKeys.add(DateFormat('yyyy-MM-dd').format(date));
        }
        break;
        
      case 'all':
      default:
        // 7日前以降の営業日キー列を生成（範囲が広い場合は範囲クエリを検討）
        final todayDate = DateTime.parse(todayBusinessDateKey);
        final sevenDaysAgoDate = todayDate.subtract(const Duration(days: 7));
        // 7日前から今日までの営業日キー列を生成（最大10要素まで）
        for (int i = 0; i <= 7 && businessDateKeys.length < 10; i++) {
          final date = sevenDaysAgoDate.add(Duration(days: i));
          businessDateKeys.add(DateFormat('yyyy-MM-dd').format(date));
        }
        break;
    }
    
    // businessDateでフィルタリング（whereInを使用、最大10要素まで）
    Query query = _firestore
        .collection('scheduledTournaments')
        .where('isArchived', isEqualTo: false);
    
    if (businessDateKeys.isNotEmpty) {
      if (businessDateKeys.length <= 10) {
        query = query.where('businessDate', whereIn: businessDateKeys);
      } else {
        // 10要素を超える場合は、最初の10要素のみ使用（または複数クエリに分割）
        query = query.where('businessDate', whereIn: businessDateKeys.take(10).toList());
      }
    }
    
    query = query.orderBy('businessDate', descending: false);
    query = query.limit(100);
    
    return query.snapshots();
  });
}
```

**注意事項**:
- `whereIn`は最大10要素までなので、10要素を超える場合は複数クエリに分割するか、範囲クエリを検討
- 期間選択に応じて、今日を起点に営業日キー列を生成（`DateTime`加算で前日/翌日を計算）
- `businessDate`フィールドで直接フィルタリング（`calcBusinessDate`不要）

---

### 5. `lib/tournament/scheduling/pages/scheduled_tournament_in_calendar_page.dart`の改修

#### 5.1 現状確認

**ファイル**: `lib/tournament/scheduling/pages/scheduled_tournament_in_calendar_page.dart`

**現状**:
- `_loadTournaments()`メソッド（32-106行目）で`startAt`の範囲クエリを使用（46-51行目）
- カレンダー表示用で、前月〜次の次の月の範囲でトーナメントを取得
- 日付ごとにトーナメントを分類（80行目で`dateKey`を生成）
- `scheduledTournaments`コレクションには`businessDate`フィールドが追加されている（Phase2で実装済み）

**課題**:
- `startAt`で範囲クエリしているが、`businessDate`フィールドで直接分類可能
- `storeMeta/currentBusinessDay`から取得する必要はない（現在の日付が属する月のカレンダーをデフォルトで表示すれば良い）

#### 5.2 実装内容

**修正箇所**:
1. **`_loadTournaments()`メソッドの修正**（32-106行目）
   - `startAt`の範囲クエリを削除
   - 全件取得してからクライアント側で`businessDate`フィールドで分類
   - カレンダーの日付に`businessDate`が一致するトーナメントを表示

**実装パターン**:
```dart
Future<void> _loadTournaments() async {
  setState(() {
    _isLoading = true;
  });

  try {
    // 全件取得してからクライアント側でbusinessDateで分類
    final snapshot = await FirebaseFirestore.instance
        .collection('scheduledTournaments')
        .where('isArchived', isEqualTo: false)
        .get();

    // 日付ごとにトーナメントを分類（businessDateを使用）
    final Map<String, List<Map<String, dynamic>>> tournamentsByDate = {};
    
    for (var doc in snapshot.docs) {
      final data = doc.data();
      final businessDate = data['businessDate'] as String?;
      
      if (businessDate == null) {
        continue; // businessDateが無い場合はスキップ
      }
      
      final startAt = (data['startAt'] as Timestamp).toDate();
      final startAtJST = DateTimeUtils.utcToJST(startAt);
      
      if (!tournamentsByDate.containsKey(businessDate)) {
        tournamentsByDate[businessDate] = [];
      }
      
      tournamentsByDate[businessDate]!.add({
        'id': doc.id,
        'name': data['snapshot']?['name'] ?? '名称未設定',
        'startAt': startAtJST,
        'snapshot': data['snapshot'],
      });
    }

    setState(() {
      _tournaments = tournamentsByDate;
      _isLoading = false;
    });
  } catch (e, stackTrace) {
    debugPrint('=== トーナメント読み込みエラー ===');
    debugPrint('エラー: $e');
    debugPrint('スタックトレース: $stackTrace');
    if (mounted) {
      setState(() {
        _isLoading = false;
      });
    }
  }
}
```

**注意事項**:
- カレンダー表示では範囲が広いため、全件取得してからクライアント側で`businessDate`で分類する方が効率的
- `businessDate`が無い場合はスキップ（Phase2で追加されたフィールドのため、古いデータには存在しない可能性がある）
- `storeMeta/currentBusinessDay`から取得する必要はない（現在の日付が属する月のカレンダーをデフォルトで表示すれば良い）

---

### 6. `lib/tournament/pages/tournament_select_page.dart`の改修

#### 6.1 現状確認

**ファイル**: `lib/tournament/pages/tournament_select_page.dart`

**現状**:
- `_buildTournamentList()`メソッド（90-121行目）で`startAt`でソート（93-95行目）
- `scheduledTournaments`コレクションには`businessDate`フィールドが追加されている（Phase2で実装済み）
- `terminalHomePage.dart`で使用されている（69行目、104行目）ため、削除対象外

**課題**:
- 営業日ベースの表示に変更する場合は、`businessDate`でフィルタリングする必要がある

#### 6.2 実装内容

**修正箇所**:
1. **`_buildTournamentList()`メソッドの修正**（90-121行目）
   - 営業日ベースの表示に変更する場合は、`businessDate`でフィルタリング
   - `storeMeta/currentBusinessDay`を取得して`currentBusinessDateKey`を取得
   - 閉店中の場合は、現在の日時が属する日付を`businessDate`として使用
   - `where('businessDate', isEqualTo: businessDateKey)`を使用

**実装パターン**:
```dart
Widget _buildTournamentList(List<String> statuses) {
  return StreamBuilder<DocumentSnapshot>(
    stream: FirebaseFirestore.instance
        .collection('storeMeta')
        .doc('currentBusinessDay')
        .snapshots(),
    builder: (context, stateSnapshot) {
      if (!stateSnapshot.hasData) {
        return const Center(child: CircularProgressIndicator());
      }
      
      final stateData = stateSnapshot.data?.data() as Map<String, dynamic>?;
      final status = stateData?['status'] as String?;
      final currentBusinessDateKey = stateData?['currentBusinessDateKey'] as String?;
      
      String businessDateKey;
      if (status == 'running' && currentBusinessDateKey != null) {
        businessDateKey = currentBusinessDateKey;
      } else {
        // 閉店中の場合は、現在の日時が属する日付をbusinessDateとして使用
        businessDateKey = DateFormat('yyyy-MM-dd').format(DateTime.now());
      }
      
      return StreamBuilder<QuerySnapshot>(
        stream: _firestore
            .collection('scheduledTournaments')
            .where('businessDate', isEqualTo: businessDateKey)
            .orderBy('startAt', descending: false)
            .snapshots(),
        builder: (context, snapshot) {
          // ... 既存の表示ロジック
        },
      );
    },
  );
}
```

**注意事項**:
- `businessDate`フィールドで直接フィルタリング（`calcBusinessDate`不要）
- `startAt`でソートは維持（営業日内でのソート）
- このページは`terminalHomePage.dart`で使用されているため、削除対象外

---

## 実装のポイント

### 1. 日付選択画面の初期化

**実装方法**:
- 初期化時に一度だけ`storeMeta/currentBusinessDay`を取得（snapshot購読は不要）
- `status === 'running'`かつ`currentBusinessDateKey !== null`の場合は、`currentBusinessDateKey`を`DateTime`に変換して`_selectedDate`に設定
- 閉店中の場合は、現在の日時が属する日付を`businessDate`として使用
- 日付選択時（`_selectDate()`）は、選択された`DateTime`を`YYYY-MM-DD`形式に変換してそのままクエリ（`calcBusinessDate`不要）

**注意事項**:
- 選択値が営業日文字列（`YYYY-MM-DD`）のため、`calcBusinessDate`は不要（そのままクエリ可能）
- 閉店中でも画面は表示可能（現在の日時が属する日付を`businessDate`として使用）

### 2. 予定・任意日時の表示

**実装方法**:
- `scheduledTournaments`コレクションの`businessDate`フィールドで直接フィルタリング
- `calcBusinessDate` Cloud Functionは不要（データが既に`businessDate`を持っているため）

**注意事項**:
- `scheduledTournaments`コレクションには`businessDate`フィールドが追加されている（Phase2で実装済み）
- `businessDate`フィールドで直接フィルタリング可能
- `startAt`の範囲クエリは削除

### 3. 期間表示のクエリ戦略

**実装方法**:
- **パターンA**: `businessDate`フィールドで範囲クエリ（`where('businessDate', '>=', startKey).where('businessDate', '<=', endKey)`）
- **パターンB**: キー配列（`whereIn`分割、複数クエリ）※`whereIn`制約（最大10要素）に注意

**選択基準**:
- 期間が短い場合（10営業日以内）: パターンB（`whereIn`）
- 期間が長い場合（10営業日超）: パターンA（範囲クエリ）またはパターンB（`whereIn`分割）

---

## 作成・修正ファイル一覧

### 修正ファイル（Dart側）
1. `lib/Accounting/accountingHistoryPage.dart` - `_getBusinessDate()`の削除、初期化時に一度だけ`storeMeta/currentBusinessDay`を取得
2. `lib/Accounting/postAccountingAdjustmentsPage.dart` - `_getBusinessDate()`の削除、初期化時に一度だけ`storeMeta/currentBusinessDay`を取得
3. `lib/Accounting/accountingEditDialog.dart` - `_getBusinessDate()`の削除、`_loadAvailableOptions()`の修正（`businessDate`でフィルタリング）
4. `lib/tournament/scheduling/pages/scheduled_tournament_list_page.dart` - `_getTournamentsStream()`の修正（`businessDate`でフィルタリング）
5. `lib/tournament/scheduling/pages/scheduled_tournament_in_calendar_page.dart` - `_loadTournaments()`の修正（`businessDate`で分類）
6. `lib/tournament/pages/tournament_select_page.dart` - `_buildTournamentList()`の修正（`businessDate`でフィルタリング）

---

## 実装の注意事項

### 1. `businessDate`フィールドの使用

- `scheduledTournaments`コレクションには`businessDate`フィールドが追加されている（Phase2で実装済み）
- `businessDate`フィールドで直接フィルタリング可能（`calcBusinessDate` Cloud Functionは不要）
- 古いデータには`businessDate`が存在しない可能性があるため、`businessDate`が無い場合はスキップする処理が必要

### 2. 日付選択画面の初期化

- 初期化時に一度だけ`storeMeta/currentBusinessDay`を取得（snapshot購読は不要）
- 閉店中の場合は、現在の日時が属する日付を`businessDate`として使用
- 日付選択時は、選択された`DateTime`を`YYYY-MM-DD`形式に変換してそのままクエリ（`calcBusinessDate`不要）

### 3. 期間表示のクエリ戦略

- `whereIn`は最大10要素までなので、10要素を超える場合は複数クエリに分割するか、範囲クエリを検討
- 期間が長い場合は、範囲クエリ（パターンA）を検討

### 4. 閉店中の扱い

- 閉店中でも画面は表示可能（現在の日時が属する日付を`businessDate`として使用）
- `storeMeta/currentBusinessDay`の`status === 'closed'`または`currentBusinessDateKey === null`の場合は、現在の日時が属する日付を使用

---

## 実装順序

1. `lib/Accounting/accountingHistoryPage.dart`の改修
2. `lib/Accounting/postAccountingAdjustmentsPage.dart`の改修
3. `lib/Accounting/accountingEditDialog.dart`の改修
4. `lib/tournament/scheduling/pages/scheduled_tournament_list_page.dart`の改修
5. `lib/tournament/scheduling/pages/scheduled_tournament_in_calendar_page.dart`の改修
6. `lib/tournament/pages/tournament_select_page.dart`の改修
7. 動作確認（日付選択画面の初期化、営業日ベースの表示）

---

## 実装後の動作

### 正常系

1. **日付選択画面の初期化**:
   - 初期化時に一度だけ`storeMeta/currentBusinessDay`を取得
   - `status === 'running'`かつ`currentBusinessDateKey !== null`の場合は、`currentBusinessDateKey`を`DateTime`に変換して`_selectedDate`に設定
   - 閉店中の場合は、現在の日時が属する日付を`businessDate`として使用
   - クエリを実行してデータを表示

2. **日付選択時**:
   - ユーザーが`showDatePicker`で日付を選択
   - 選択された`DateTime`を`YYYY-MM-DD`形式に変換してそのままクエリ（`calcBusinessDate`不要）

3. **予定・任意日時の表示**:
   - `scheduledTournaments`コレクションの`businessDate`フィールドで直接フィルタリング
   - `calcBusinessDate` Cloud Functionは不要（データが既に`businessDate`を持っているため）

### エラー系

1. **state docが存在しない場合**:
   - 現在の日時が属する日付を`businessDate`として使用
   - エラーとして扱わない（正常な状態）

---

## 次のステップ

1. Phase5: 自動開閉店の実装
2. Phase6: テスト・検証
