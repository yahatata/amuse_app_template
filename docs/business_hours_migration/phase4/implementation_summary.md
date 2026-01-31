# Phase4: UI改修（予定・任意日時） - 実装完了サマリー

## 実装日時
2025年1月27日

## 実装内容

### 1. 概要

Phase4では、日付選択UIや予定・任意日時のデータを表示するUIを改修し、`storeMeta/currentBusinessDay`から`currentBusinessDateKey`を取得するか、現在の日時が属する日付を`businessDate`として使用してクエリするように変更した。データが既に`businessDate`フィールドを持っているため、`calcBusinessDate` Cloud Functionは不要である。

また、`scheduled_tournament_list_page.dart`では、営業日ベースの表示に変更し、日付バーの表示、「すべて表示」ボタンの実装、クエリの10件制限などの追加機能を実装した。

### 2. 対象ファイル

以下の7つのファイルを修正：

1. `lib/Accounting/accountingHistoryPage.dart` - 会計履歴画面（日付選択）
2. `lib/Accounting/postAccountingAdjustmentsPage.dart` - 会計調整画面（日付選択）
3. `lib/Accounting/accountingEditDialog.dart` - 会計編集ダイアログ（`scheduledTournaments`のクエリ）
4. `lib/tournament/scheduling/pages/scheduled_tournament_list_page.dart` - スケジュール済みトーナメント一覧（営業日ベースの表示、日付バー、「すべて表示」ボタン）
5. `lib/tournament/scheduling/pages/scheduled_tournament_in_calendar_page.dart` - スケジュール済みトーナメント（カレンダー表示）
6. `lib/tournament/pages/tournament_select_page.dart` - トーナメント選択画面
7. `lib/tournament/scheduling/pages/create_tournament_from_calendar_page.dart` - カレンダーからトーナメント作成画面

### 3. 実装詳細

#### 3.1 `lib/Accounting/accountingHistoryPage.dart`（修正）

**変更内容**:
- `_getBusinessDate()`メソッドを削除（`GlobalConstants.STORE_CLOSE_HOUR`を直接使用していた部分）
- 初期化時に`storeMeta/currentBusinessDay`を一度だけ取得する`_initializeSelectedDate()`メソッドを追加（27-61行目）
- `status === 'running'`かつ`currentBusinessDateKey !== null`の場合は、`currentBusinessDateKey`を`DateTime`に変換して`_selectedDate`に設定
- 閉店中の場合は、現在の日時が属する日付を`businessDate`として使用（`DateFormat('yyyy-MM-dd').format(DateTime.now())`）
- 日付選択時の処理は変更不要（選択値は`DateTime`だが、`YYYY-MM-DD`形式に変換してクエリしているため、`calcBusinessDate`は不要）

**実装パターン**:
```dart
@override
void initState() {
  super.initState();
  _initializeSelectedDate();
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
    
    if (mounted) {
      setState(() {
        _selectedDate = DateTime.parse(businessDateKey);
      });
      _loadAccountingHistory();
    }
  } catch (e) {
    // エラー時は現在日時を使用
    if (mounted) {
      setState(() {
        _selectedDate = DateTime.now();
      });
      _loadAccountingHistory();
    }
  }
}
```

**注意事項**:
- 初期化時のみ`storeMeta/currentBusinessDay`を取得（snapshot購読は不要）
- 日付選択時（`_selectDate()`）は、選択された`DateTime`を`YYYY-MM-DD`形式に変換してそのままクエリ（`calcBusinessDate`不要）
- `intl`パッケージの`DateFormat`を使用

---

#### 3.2 `lib/Accounting/postAccountingAdjustmentsPage.dart`（修正）

**変更内容**:
- `_getBusinessDate()`メソッドを削除（`GlobalConstants.STORE_CLOSE_HOUR`を直接使用していた部分）
- 初期化時に`storeMeta/currentBusinessDay`を一度だけ取得する`_initializeSelectedDate()`メソッドを追加（36-70行目）
- `accountingHistoryPage.dart`と同様の実装パターン

**実装パターン**:
- `accountingHistoryPage.dart`と同様

**注意事項**:
- 初期化時のみ`storeMeta/currentBusinessDay`を取得（snapshot購読は不要）
- 日付選択時は、選択された`DateTime`を`YYYY-MM-DD`形式に変換してそのままクエリ（`calcBusinessDate`不要）

---

#### 3.3 `lib/Accounting/accountingEditDialog.dart`（修正）

**変更内容**:
- `_loadAvailableOptions()`メソッドを修正（55-125行目）
- `storeMeta/currentBusinessDay`を取得して`currentBusinessDateKey`を取得（57-72行目）
- `scheduledTournaments`のクエリを`businessDate`でフィルタリング（75-78行目）
- `GlobalConstants`のインポートを削除し、`intl`パッケージを追加

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
  
  // トーナメントデータを処理
}
```

**注意事項**:
- `GlobalConstants`のインポートを削除（`STORE_CLOSE_HOUR`の使用を削除）
- `intl`パッケージの`DateFormat`を使用

---

#### 3.4 `lib/tournament/scheduling/pages/scheduled_tournament_list_page.dart`（大幅な改修）

**変更内容**:

##### 3.4.1 データ構造の変更
- `_convertSnapshotToTournaments`メソッドに`businessDate`フィールドを追加（725-741行目）
  - `'businessDate': data['businessDate'] as String? ?? ''`を追加

##### 3.4.2 クエリロジックの変更
- 「今後7日（thisWeek）」の営業日キー生成ロジックを修正（669-676行目）
  - 変更前: 当日を含めて7日分（i=0から6まで）
  - 変更後: 明日から7日後まで（i=1から7まで）
- 「7日前以降（all）」の営業日キー生成ロジックを修正（678-688行目）
  - 変更前: 7日前から今日まで（8日分）
  - 変更後: 7日前から昨日まで（7日分）
- クエリ時の10件制限ロジックを修正（677-682行目）
  - 変更前: `limit(10)`
  - 変更後: `limit(11)`（11件目が存在するかチェックするため）
  - 「すべて表示」が無効な場合は`limit(11)`、有効な場合は`limit(1000)`
- ソート順を修正（667-675行目）
  - `thisWeek`: `orderBy('businessDate', ascending: true)` → `orderBy('startAt', ascending: true)`
  - `all`: `orderBy('businessDate', descending: true)` → `orderBy('startAt', descending: true)`

##### 3.4.3 トーナメント取得ロジックの変更
- `_getCurrentTournaments`メソッドを修正（565-585行目）
  - `today`と`yesterday`の場合は全件返す
  - `thisWeek`と`all`で「すべて表示」が無効かつ11件以上の場合、先頭10件のみ返す
- `_hasMoreTournaments`メソッドを追加（587-599行目）
  - 11件目が存在するかどうかを判定（「すべて表示」ボタンの表示判定に使用）

##### 3.4.4 UI表示ロジックの変更
- 日付バー表示機能を追加
  - `_buildDateHeader`メソッドを追加（1203-1240行目）
    - 営業日を「YYYY年M月d日(E)」形式で表示するウィジェット
  - `ListView.builder`を修正（293-357行目）
    - `thisWeek`と`all`の場合のみ、前のトーナメントと`businessDate`が異なる場合に日付バーを表示
- 「すべて表示」ボタンを追加（293-357行目）
  - `itemCount`に「すべて表示」ボタンも含める（`tournaments.length + (hasMore ? 1 : 0)`）
  - `itemBuilder`内で、最後のアイテム（`index == tournaments.length`）の場合に「すべて表示」ボタンを返す
  - ボタンを押したら、`_showAllTournaments[_selectedPeriod] = true`を設定し、ストリームキャッシュをクリア

##### 3.4.5 時刻表示の修正
- `convertTimestamp`関数を修正（718-723行目）
  - `toDate().toUtc().toIso8601String()`を使用して、UTCのISO文字列として保存
  - これにより、`_formatDateTime`メソッドで`DateTimeUtils.parseISOToJST`を使用した際に、UTCのISO文字列を正しくJSTに変換できる

##### 3.4.6 表示順序の修正
- `_convertSnapshotToTournaments`メソッドのソートロジックを修正（775-794行目）
  - `thisWeek`: `startAt`昇順（過去から）
  - `all`: `startAt`降順（新しいものから）

**実装パターン**:
```dart
// 営業日キー生成（thisWeek）
case 'thisWeek':
  // 明日から7日後までの営業日キー列を生成（当日を含めない）
  final todayDate = DateTime.parse(todayBusinessDateKey);
  for (int i = 1; i <= 7; i++) {
    final date = todayDate.add(Duration(days: i));
    businessDateKeys.add(DateFormat('yyyy-MM-dd').format(date));
  }
  break;

// 営業日キー生成（all）
case 'all':
  // 昨日以前～7日前の営業日キー列を生成
  final todayDate = DateTime.parse(todayBusinessDateKey);
  final sevenDaysAgoDate = todayDate.subtract(const Duration(days: 7));
  // 7日前から昨日までの営業日キー列を生成
  for (int i = 0; i < 7; i++) {
    final date = sevenDaysAgoDate.add(Duration(days: i));
    businessDateKeys.add(DateFormat('yyyy-MM-dd').format(date));
  }
  break;

// クエリの10件制限
if (!showAll) {
  query = query.limit(11); // 11件目が存在するかチェックするため
} else {
  query = query.limit(1000); // 「すべて表示」の場合は大きな値に設定
}

// 日付バーの表示
if (shouldShowDateHeaders && 
    currentBusinessDate != previousBusinessDate && 
    currentBusinessDate.isNotEmpty) {
  return Column(
    children: [
      _buildDateHeader(currentBusinessDate),
      _buildTournamentCard(context, tournament),
    ],
  );
}

// 「すべて表示」ボタンの表示
if (hasMore && index == tournaments.length) {
  return ElevatedButton.icon(
    onPressed: () {
      setState(() {
        _showAllTournaments[_selectedPeriod] = true;
        _streamCache.remove(_selectedPeriod);
        _processingPeriods.remove(_selectedPeriod);
      });
    },
    icon: const Icon(Icons.expand_more),
    label: const Text('すべて表示'),
  );
}
```

**注意事項**:
- 月跨ぎでも正しく動作する（`DateTime.add()`と`DateTime.subtract()`は月を跨いでも正しく動作）
- クエリ時に`limit(11)`を使用して、11件目が存在するかどうかを判定
- 日付バーは`thisWeek`と`all`のみ表示（`today`と`yesterday`は表示しない）
- 「すべて表示」ボタンは`thisWeek`と`all`で11件目が存在する場合のみ表示

---

#### 3.5 `lib/tournament/scheduling/pages/scheduled_tournament_in_calendar_page.dart`（修正）

**変更内容**:
- `_loadTournaments()`メソッドを修正（32-116行目）
- `startAt`の範囲クエリを削除
- 全件取得してからクライアント側で`businessDate`で分類（40-44行目）
- `businessDate`が無い場合はスキップ（55-57行目）
- `businessDate`を使用して日付ごとにトーナメントを分類（48-99行目）

**実装パターン**:
```dart
Future<void> _loadTournaments() async {
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
    
    // トーナメントデータを処理
    tournamentsByDate[businessDate]!.add({...});
  }
}
```

**注意事項**:
- `startAt`の範囲クエリを削除し、全件取得してからクライアント側で分類
- `businessDate`が無い場合はスキップ

---

#### 3.6 `lib/tournament/pages/tournament_select_page.dart`（修正）

**変更内容**:
- `_buildTournamentList()`メソッドを修正（91-147行目）
- `storeMeta/currentBusinessDay`をsnapshot購読する`StreamBuilder`を追加（92-96行目）
- `currentBusinessDateKey`と`status`を取得（102-104行目）
- 閉店時のフォールバック処理を追加（106-112行目）
  - `status === 'running'`かつ`currentBusinessDateKey !== null`の場合: `currentBusinessDateKey`を使用
  - それ以外（閉店中）の場合: 現在の日時が属する日付（`DateFormat('yyyy-MM-dd').format(DateTime.now())`）を使用
- `scheduledTournaments`のクエリで`businessDate`でフィルタリング（115-119行目）
- `intl`パッケージを追加

**実装パターン**:
```dart
StreamBuilder<DocumentSnapshot>(
  stream: FirebaseFirestore.instance
      .collection('storeMeta')
      .doc('currentBusinessDay')
      .snapshots(),
  builder: (context, stateSnapshot) {
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
        // トーナメントリストを表示
      },
    );
  },
)
```

**注意事項**:
- `storeMeta/currentBusinessDay`をsnapshot購読（リアルタイム更新）
- 閉店中でもデータを表示可能（現在の日時が属する日付を使用）

---

#### 3.7 `lib/tournament/scheduling/pages/create_tournament_from_calendar_page.dart`（修正）

**変更内容**:
- `_loadTournaments()`メソッドを修正（32-118行目）
- `startAt`の範囲クエリを削除
- 全件取得してからクライアント側で`businessDate`で分類（41-45行目）
- `businessDate`が無い場合はスキップ（55-57行目）
- `businessDate`を使用して日付ごとにトーナメントを分類（48-100行目）

**実装パターン**:
- `scheduled_tournament_in_calendar_page.dart`と同様

**注意事項**:
- `startAt`の範囲クエリを削除し、全件取得してからクライアント側で分類
- `businessDate`が無い場合はスキップ

---

### 4. 作成・修正ファイル一覧

#### 修正ファイル（Dart側）
1. `lib/Accounting/accountingHistoryPage.dart` - 初期化時に`storeMeta/currentBusinessDay`を一度だけ取得、`_getBusinessDate()`の削除
2. `lib/Accounting/postAccountingAdjustmentsPage.dart` - 初期化時に`storeMeta/currentBusinessDay`を一度だけ取得、`_getBusinessDate()`の削除
3. `lib/Accounting/accountingEditDialog.dart` - `scheduledTournaments`のクエリを`businessDate`でフィルタリング、`GlobalConstants`のインポート削除
4. `lib/tournament/scheduling/pages/scheduled_tournament_list_page.dart` - 営業日ベースの表示、日付バー、「すべて表示」ボタン、クエリの10件制限、時刻表示の修正、表示順序の修正
5. `lib/tournament/scheduling/pages/scheduled_tournament_in_calendar_page.dart` - `businessDate`でフィルタリング
6. `lib/tournament/pages/tournament_select_page.dart` - `businessDate`でフィルタリング
7. `lib/tournament/scheduling/pages/create_tournament_from_calendar_page.dart` - `businessDate`でフィルタリング

#### 修正ファイル（Firestoreインデックス）
1. `firestore.indexes.json` - `scheduledTournaments`コレクションに新しいインデックスを追加
   - `isArchived` (ASC) + `businessDate` (DESC) + `startAt` (DESC)

---

### 5. 実装のポイント

1. **`storeMeta/currentBusinessDay`の取得**:
   - 日付選択画面（`accountingHistoryPage.dart`、`postAccountingAdjustmentsPage.dart`）: 初期化時に一度だけ取得（snapshot購読は不要）
   - トーナメント選択画面（`tournament_select_page.dart`）: snapshot購読（リアルタイム更新）
   - 会計編集ダイアログ（`accountingEditDialog.dart`）: メソッド呼び出し時に取得

2. **`businessDate`でのフィルタリング**:
   - すべての`scheduledTournaments`のクエリで`businessDate`フィールドを使用
   - `startAt`の範囲クエリを削除し、`businessDate`で直接フィルタリング

3. **営業日キー生成ロジック**:
   - 「今後7日（thisWeek）」: 明日から7日後まで（当日を含めない）
   - 「7日前以降（all）」: 7日前から昨日まで（今日を含めない）
   - 月跨ぎでも正しく動作（`DateTime.add()`と`DateTime.subtract()`を使用）

4. **クエリの10件制限**:
   - デフォルトで`limit(11)`を使用して、11件目が存在するかどうかを判定
   - 11件目が存在する場合、先頭10件のみ表示し、「すべて表示」ボタンを表示
   - 「すべて表示」が押下された場合、`limit(1000)`で全件取得

5. **日付バーの表示**:
   - `thisWeek`と`all`のみ表示（`today`と`yesterday`は表示しない）
   - 前のトーナメントと`businessDate`が異なる場合に表示
   - 「YYYY年M月d日(E)」形式で表示

6. **時刻表示の修正**:
   - `convertTimestamp`関数で`toDate().toUtc().toIso8601String()`を使用して、UTCのISO文字列として保存
   - `_formatDateTime`メソッドで`DateTimeUtils.parseISOToJST`を使用して、UTCのISO文字列を正しくJSTに変換

7. **表示順序の修正**:
   - `thisWeek`: `startAt`昇順（過去から）
   - `all`: `startAt`降順（新しいものから）

---

### 6. 実装の現状とchangeSpecとの差分

#### 6.1 `calcBusinessDate` Cloud Functionの使用
- **changeSpec**: `calcBusinessDate` Cloud Functionは不要（データが既に`businessDate`フィールドを持っているため）
- **実装**: changeSpec通りに実装（`calcBusinessDate` Cloud Functionは使用していない）

#### 6.2 初期化時の`storeMeta/currentBusinessDay`取得
- **changeSpec**: 初期化時に一度だけ取得（snapshot購読は不要）
- **実装**: changeSpec通りに実装（`accountingHistoryPage.dart`、`postAccountingAdjustmentsPage.dart`）

#### 6.3 `scheduled_tournament_list_page.dart`の追加機能
- **changeSpec**: 営業日ベースの表示に変更する場合は`businessDate`でフィルタリング
- **実装**: changeSpec通りに実装し、さらに以下の機能を追加：
  - 日付バーの表示（`thisWeek`と`all`のみ）
  - 「すべて表示」ボタンの実装（11件目が存在する場合のみ表示）
  - クエリの10件制限（`limit(11)`を使用して11件目が存在するかチェック）
  - 営業日キー生成ロジックの修正（`thisWeek`は明日から7日後まで、`all`は7日前から昨日まで）
  - 時刻表示の修正（UTCのISO文字列として保存）
  - 表示順序の修正（`thisWeek`は昇順、`all`は降順）

#### 6.4 `create_tournament_from_calendar_page.dart`の修正
- **changeSpec**: 記載なし（後から追加された要件）
- **実装**: `scheduled_tournament_in_calendar_page.dart`と同様に、`businessDate`でフィルタリングするように修正

---

### 7. 発見した問題と修正

#### 7.1 Firestoreインデックスエラー（「7日前以降」タブ）

**問題**:
- 「7日前以降（all）」タブでインデックスエラーが発生
- クエリ: `isArchived` (ASC) + `businessDate` (DESC) + `startAt` (DESC) のインデックスが必要

**修正内容**:
- `firestore.indexes.json`に新しいインデックスを追加
  - `isArchived` (ASC) + `businessDate` (DESC) + `startAt` (DESC)
- インデックスをデプロイ

**修正前**:
```json
{
  "collectionGroup": "scheduledTournaments",
  "fields": [
    {"fieldPath": "isArchived", "order": "ASCENDING"},
    {"fieldPath": "businessDate", "order": "DESCENDING"},
    {"fieldPath": "startAt", "order": "ASCENDING"}
  ]
}
```

**修正後**:
```json
{
  "collectionGroup": "scheduledTournaments",
  "fields": [
    {"fieldPath": "isArchived", "order": "ASCENDING"},
    {"fieldPath": "businessDate", "order": "DESCENDING"},
    {"fieldPath": "startAt", "order": "DESCENDING"}
  ]
}
```

#### 7.2 「すべて表示」ボタンの固定表示問題

**問題**:
- 「すべて表示」ボタンが画面下部に固定されていた（スクロールしても表示され続けている状態）

**修正内容**:
- `ListView.builder`の`itemBuilder`内で「すべて表示」ボタンを返すように変更
- `itemCount`に「すべて表示」ボタンも含める（`tournaments.length + (hasMore ? 1 : 0)`）
- これにより、ボタンがトーナメントカードのリストの一部として扱われ、スクロール可能になった

**修正前**:
```dart
return Column(
  children: [
    Expanded(
      child: ListView.builder(...),
    ),
    if (hasMore) Container(...), // 固定表示
  ],
);
```

**修正後**:
```dart
return ListView.builder(
  itemCount: tournaments.length + (hasMore ? 1 : 0),
  itemBuilder: (context, index) {
    if (hasMore && index == tournaments.length) {
      return ElevatedButton.icon(...); // スクロール可能
    }
    // トーナメントカードを表示
  },
);
```

---

### 8. 次のステップ

1. 動作確認（日付選択、データの表示内容の正確性、リアルタイム更新の動作）
2. エラーハンドリングの確認（`storeMeta/currentBusinessDay`が存在しない場合、`status === 'error'`の場合）
3. パフォーマンスの確認（メモリリーク、不要な再取得、クエリの効率）
4. エッジケースの確認（月末/年末の繰り上がり、タイムゾーン、ネットワークエラー、月跨ぎ）
5. 既存機能の動作確認（トーナメント作成、会計調整、日付選択）
6. 「すべて表示」ボタンの動作確認（11件目が存在する場合の表示、ボタン押下時の全件取得）

---

## 確認観点

### コード確認で完了した項目
1. `storeMeta/currentBusinessDay`の取得実装（初期化時またはsnapshot購読）
2. `currentBusinessDateKey`と`status`の取得
3. 閉店時の処理（フォールバック）
4. `businessDate`でのフィルタリング
5. 不要なメソッド/コードの削除（`_getBusinessDate()`、`GlobalConstants.STORE_CLOSE_HOUR`の直接使用）
6. 営業日キー生成ロジック（`thisWeek`は明日から7日後まで、`all`は7日前から昨日まで）
7. クエリの10件制限（`limit(11)`を使用）
8. 日付バーの表示（`thisWeek`と`all`のみ）
9. 「すべて表示」ボタンの実装（11件目が存在する場合のみ表示）
10. 時刻表示の修正（UTCのISO文字列として保存）
11. 表示順序の修正（`thisWeek`は昇順、`all`は降順）
12. Firestoreインデックスの追加

### 動作確認が必要な項目
1. 日付選択の動作（初期化時の日付設定、日付選択時のデータ取得）
2. データの表示内容の正確性（`businessDate`でのフィルタリングが正しく動作しているか）
3. リアルタイム更新の動作（`tournament_select_page.dart`のsnapshot購読）
4. エラーハンドリングの動作（`storeMeta/currentBusinessDay`が存在しない場合、`status === 'error'`の場合）
5. パフォーマンス（メモリリーク、不要な再取得、クエリの効率）
6. エッジケース（月末/年末の繰り上がり、タイムゾーン、ネットワークエラー、月跨ぎ）
7. 既存機能の動作確認（トーナメント作成、会計調整、日付選択）
8. 「すべて表示」ボタンの動作確認（11件目が存在する場合の表示、ボタン押下時の全件取得）
9. 日付バーの表示確認（`thisWeek`と`all`で正しく表示されるか、`today`と`yesterday`で表示されないか）
10. クエリの10件制限の動作確認（デフォルトで10件に制限されているか、11件目が存在する場合に「すべて表示」ボタンが表示されるか）

詳細な確認観点については、実装完了時の確認観点まとめを参照してください。
