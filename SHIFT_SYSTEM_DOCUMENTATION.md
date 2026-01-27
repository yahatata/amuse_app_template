# シフト管理システム 実装ドキュメント

## 概要

このドキュメントは、シフト管理システムのUI、内部ロジック、データ構造を詳細にまとめたものです。DB接続やCloud Functions導入のための設計資料として使用します。

---

## 1. システム構成

### 1.1 ページ構成

```
AdminHomePage
  └─ ShiftMenuPage (シフトメニュー)
      ├─ ShiftHomePage (シフトカレンダー/確定ページ)
      ├─ ShiftDraftPage (シフトドラフト)
      └─ BusinessDayEditPage (営業日編集) ※準備中
```

### 1.2 主要ファイル

| ファイル名 | 役割 |
|-----------|------|
| `shiftMenuPage.dart` | シフトメニュー画面（3つのボタン） |
| `shiftHomePage.dart` | シフト確定用カレンダー画面（メイン画面） |
| `shiftDraftPage.dart` | シフトドラフト画面（申請承認・中間確定） |
| `shiftDateDialog.dart` | 日付ダイアログ（カレンダーセルの編集） |
| `businessDayEditPage.dart` | 営業日編集画面（準備中） |

---

## 2. データ構造

### 2.1 コアデータモデル

#### ShiftDayData（1日のシフトデータ）
```dart
class ShiftDayData {
  final DateTime date;                    // 日付
  final BusinessHours businessHours;     // 営業時間
  final bool isSufficient;                // 必要十分フラグ
  final bool isInterimConfirmed;          // 中間確定済みフラグ
  final bool isFinalized;                  // 最終確定済みフラグ
  final List<ShiftAssignment> assignments; // シフト割当リスト
  final int pendingRequestCount;           // 未処理申請数
}
```

**DB設計案:**
```typescript
// Firestore Collection: shiftDays
{
  date: Timestamp,              // 日付（YYYY-MM-DD形式で保存）
  businessHours: {
    openMinute: number,         // 開店時刻（0:00からの分数）
    closeMinute: number,        // 閉店時刻（0:00からの分数）
    isClosed: boolean           // 店休日フラグ
  },
  isSufficient: boolean,        // 必要十分フラグ
  isInterimConfirmed: boolean, // 中間確定済み
  isFinalized: boolean,         // 最終確定済み
  assignments: Array<{         // シフト割当
    staffId: string,
    staffName: string,
    startMinute: number,
    endMinute: number
  }>,
  pendingRequestCount: number,  // 未処理申請数
  createdAt: Timestamp,
  updatedAt: Timestamp
}
```

#### ShiftAssignment（シフト割当）
```dart
class ShiftAssignment {
  final String staffId;         // スタッフID
  final String staffName;       // スタッフ名
  final int startMinute;        // 開始時刻（0:00からの分数）
  final int endMinute;          // 終了時刻（0:00からの分数）
}
```

#### BusinessHours（営業時間）
```dart
class BusinessHours {
  final int openMinute;         // 開店時刻（0:00からの分数）
  final int closeMinute;        // 閉店時刻（0:00からの分数）
  final bool isClosed;          // 店休日フラグ
}
```

#### ShiftRequest（シフト申請）
```dart
class ShiftRequest {
  final String requestId;       // 申請ID
  final String staffId;         // スタッフID
  final String staffName;       // スタッフ名
  final String date;            // 日付（YYYY-MM-DD形式）
  final int startMinute;        // 希望開始時刻
  final int endMinute;          // 希望終了時刻
  final String status;          // ステータス（pending/approved/rejected）
  final int originalStartMinute; // 元の開始時刻（編集前）
  final int originalEndMinute;  // 元の終了時刻（編集前）
}
```

**DB設計案:**
```typescript
// Firestore Collection: shiftRequests
{
  requestId: string,            // 申請ID（自動生成）
  staffId: string,              // スタッフID
  staffName: string,            // スタッフ名
  date: string,                 // 日付（YYYY-MM-DD）
  startMinute: number,          // 希望開始時刻
  endMinute: number,            // 希望終了時刻
  status: 'pending' | 'approved' | 'rejected',
  originalStartMinute: number,  // 元の開始時刻
  originalEndMinute: number,    // 元の終了時刻
  createdAt: Timestamp,
  updatedAt: Timestamp
}
```

#### RecruitmentTimeSlot（募集時間帯）
```dart
class RecruitmentTimeSlot {
  final int startMinute;        // 開始時刻
  final int endMinute;          // 終了時刻
}
```

---

## 3. 主要機能とロジック

### 3.1 ShiftHomePage（シフトカレンダー/確定ページ）

#### 機能概要
- カレンダー表示（当月・次月）
- 日付ごとのシフト情報表示
- 3つのタブ（情報、不足日集計、募集作成）
- 最終確定機能

#### 主要ロジック

**1. 空き時間帯検出（`_findGapTimeSlots`）**
```dart
List<({int start, int end})> _findGapTimeSlots(ShiftDayData dayData)
```
- 営業時間内で、シフト割当が存在しない時間帯を検出
- 1時間単位でチェック
- 返り値: `({int start, int end})` のリスト

**2. スタッフ不足時間帯検出（`_findInsufficientTimeSlots`）**
```dart
List<({int start, int end, int required, int current})> _findInsufficientTimeSlots(ShiftDayData dayData)
```
- 営業時間内で、`GlobalConstants.requiredStaffByTimeSlot`で設定された時間帯の必要人数に満たない時間帯を検出
- 返り値: `({int start, int end, int required, int current})` のリスト

**3. 不足日集計（`_calculateInsufficientDays`）**
```dart
void _calculateInsufficientDays()
```
- 次月のデータから、必要十分フラグがOFFの日を抽出
- 最終確定済みは除外
- 結果を`_insufficientDays`リストに保存

**4. 最終確定（`_finalizeShift`）**
```dart
void _finalizeShift(String dateKey)
```
- 指定日のシフトを最終確定
- `isFinalized = true`に設定

#### UI構成

**カレンダー表示:**
- 当月: 最終確定済みの日を表示（グレーアウト）
- 次月: 編集可能な日を表示
  - 左上: 必要十分フラグ（チェックボックス、操作不可）
  - 右上: 状態フラグ（中間/未処理/最終）
  - 中央: 日付
  - 下部: 未承認申請数（オレンジバッジ）

**タブ構成:**
1. **情報タブ**: 選択日の詳細情報
   - 営業時間
   - 必要十分フラグ
   - シフト割当リスト
   - 空き時間帯・スタッフ不足時間帯の表示
   - 最終確定ボタン

2. **不足日集計タブ**: 不足日の一覧と募集作成
   - 不足日集計ボタン
   - 不足日リスト（チェックボックス付き）
   - 募集時間帯スライダー
   - 募集送信ボタン

3. **募集作成タブ**: 選択した不足日の募集作成

### 3.2 ShiftDraftPage（シフトドラフト）

#### 機能概要
- 次月のシフト申請一覧表示
- 申請の承認・却下
- 申請時間の編集
- 中間確定機能
- 必要十分フラグの手動設定

#### 主要ロジック

**1. 申請承認（`_approveRequest`）**
```dart
void _approveRequest(String requestId, String dateKey)
```
- 申請を承認し、シフト割当に追加
- 申請のステータスを`approved`に変更

**2. 申請却下（`_rejectRequest`）**
```dart
void _rejectRequest(String requestId, String dateKey)
```
- 申請を却下
- 申請のステータスを`rejected`に変更

**3. 中間確定（`_confirmInterim`）**
```dart
void _confirmInterim(String dateKey)
```
- 指定日のシフトを中間確定
- `isInterimConfirmed = true`に設定

**4. 必要十分フラグ手動設定**
```dart
void _toggleSufficientManual(String dateKey)
```
- 手動で必要十分フラグをON/OFF
- 自動判定とは独立して動作

#### UI構成

**日付スクロール:**
- 横スクロール可能な日付リスト
- 選択中の日付をハイライト

**申請カード:**
- スタッフ名
- 申請時間（RangeSliderで編集可能）
- 申請時間（黄色の非操作スライダー）
- 割当時間（操作可能なRangeSlider）
- 承認・却下ボタン
- 必要十分チェックボックス（手動）

**説明文:**
- 「必要十分チェック：不足日の募集などに使う判断材料。警告（スタッフ不足時間帯）がない日には自動でチェックされますが、管理者の裁量で手動チェックも可能」

### 3.3 ShiftDateDialog（日付ダイアログ）

#### 機能概要
- カレンダーセルをタップした際に表示される編集ダイアログ
- シフト割当の追加・削除・編集
- 必要十分フラグの設定

#### 主要ロジック

**1. 自動判定（`_updateDayData`）**
```dart
void _updateDayData()
```
- 空き時間帯・スタッフ不足時間帯を検出
- 警告がない場合、自動で`isSufficient = true`に設定
- 手動チェック済みの場合は、自動判定をスキップ

**2. 手動チェック（`_toggleSufficient`）**
```dart
void _toggleSufficient(bool? value)
```
- 手動で必要十分フラグをON/OFF
- `_isManuallyChecked = true`を設定して、自動判定を無効化

**3. シフト割当削除（`_deleteAssignment`）**
```dart
void _deleteAssignment(int index)
```
- 指定インデックスのシフト割当を削除
- 自動判定を再実行

**4. シフト割当時間更新（`_updateAssignmentTime`）**
```dart
void _updateAssignmentTime(int index, int startMinute, int endMinute)
```
- 指定インデックスのシフト割当時間を更新
- 自動判定を再実行

#### UI構成

**ヘッダー:**
- 日付表示
- 閉じるボタン

**情報セクション:**
- 営業時間
- 未処理申請数（あれば表示）
- 必要十分チェックボックス

**シフト割当リスト:**
- スタッフ名
- 時間表示（編集可能）
- 削除ボタン

**警告表示:**
- 空き時間帯（オレンジ）
- スタッフ不足時間帯（赤）

**最終確定ボタン:**
- 中間確定済みの場合のみ表示

---

## 4. ビジネスロジック

### 4.1 必要十分フラグの自動判定

**条件:**
- 空き時間帯がない（`gapSlots.isEmpty`）
- スタッフ不足時間帯がない（`insufficientSlots.isEmpty`）

**動作:**
- 上記条件を満たす場合、自動で`isSufficient = true`
- 手動チェック済みの場合は、自動判定をスキップ

**実装箇所:**
- `ShiftHomePage._generateMonthData()`: モックデータ生成時
- `ShiftDateDialog._updateDayData()`: ダイアログ内で編集時

### 4.2 不足日集計

**条件:**
- 必要十分フラグがOFF（`!isSufficient`）
- 最終確定済みでない（`!isFinalized`）
- 店休日でない（`!isClosed`）

**実装:**
```dart
void _calculateInsufficientDays() {
  // 次月のデータを取得
  // 条件を満たす日を抽出
  // _insufficientDaysリストに追加
}
```

### 4.3 状態フラグ

**isInterimConfirmed（中間確定済み）:**
- シフト割当が存在する場合、自動で`true`
- ドラフトページで手動設定可能

**isFinalized（最終確定済み）:**
- 最終確定ボタンを押した場合、`true`
- 最終確定後は編集不可

### 4.4 時間の表現

**分数形式:**
- すべての時刻は0:00からの分数で表現
- 例: 540 = 09:00, 1320 = 22:00, 1440 = 24:00

**変換関数:**
- `formatMinutes(int minutes)`: 分数を"HH:mm"形式に変換
- `parseTime(String time)`: "HH:mm"形式を分数に変換

---

## 5. DB接続設計

### 5.1 Firestoreコレクション設計

#### shiftDays（シフト日データ）
```
/shiftDays/{dateKey}
  - date: Timestamp
  - businessHours: {
      openMinute: number,
      closeMinute: number,
      isClosed: boolean
    }
  - isSufficient: boolean
  - isInterimConfirmed: boolean
  - isFinalized: boolean
  - assignments: Array<{
      staffId: string,
      staffName: string,
      startMinute: number,
      endMinute: number
    }>
  - pendingRequestCount: number
  - createdAt: Timestamp
  - updatedAt: Timestamp
```

**インデックス:**
- `date` (昇順)
- `isFinalized` (昇順)
- `isInterimConfirmed` (昇順)

#### shiftRequests（シフト申請）
```
/shiftRequests/{requestId}
  - requestId: string
  - staffId: string
  - staffName: string
  - date: string (YYYY-MM-DD)
  - startMinute: number
  - endMinute: number
  - status: 'pending' | 'approved' | 'rejected'
  - originalStartMinute: number
  - originalEndMinute: number
  - createdAt: Timestamp
  - updatedAt: Timestamp
```

**インデックス:**
- `date` (昇順)
- `status` (昇順)
- `staffId` (昇順)

#### businessDays（営業日設定）
```
/businessDays/{dateKey}
  - date: string (YYYY-MM-DD)
  - openMinute: number
  - closeMinute: number
  - isClosed: boolean
  - createdAt: Timestamp
  - updatedAt: Timestamp
```

### 5.2 Cloud Functions設計

#### 1. シフト申請承認
```typescript
// functions/src/shift/approveShiftRequest.ts
export const approveShiftRequest = functions.https.onCall(async (data, context) => {
  const { requestId, dateKey } = data;
  
  // 1. 申請を取得
  // 2. 申請を承認状態に更新
  // 3. shiftDaysにシフト割当を追加
  // 4. pendingRequestCountを減算
  // 5. 必要十分フラグを自動判定
});
```

#### 2. シフト最終確定
```typescript
// functions/src/shift/finalizeShift.ts
export const finalizeShift = functions.https.onCall(async (data, context) => {
  const { dateKey } = data;
  
  // 1. shiftDaysのisFinalizedをtrueに設定
  // 2. 確定済みシフトを別コレクションにコピー（履歴保存）
});
```

#### 3. 不足日集計
```typescript
// functions/src/shift/calculateInsufficientDays.ts
export const calculateInsufficientDays = functions.https.onCall(async (data, context) => {
  const { monthKey } = data; // YYYY-MM形式
  
  // 1. 指定月のshiftDaysを取得
  // 2. 必要十分フラグがOFFの日を抽出
  // 3. 最終確定済みを除外
  // 4. 日付リストを返す
});
```

#### 4. 募集通知送信
```typescript
// functions/src/shift/sendRecruitmentNotifications.ts
export const sendRecruitmentNotifications = functions.https.onCall(async (data, context) => {
  const { dateKeys, timeSlots } = data;
  
  // 1. 各日付・時間帯の募集通知を作成
  // 2. スタッフに通知を送信（FCM等）
  // 3. 募集データを保存
});
```

#### 5. 必要十分フラグ自動判定
```typescript
// functions/src/shift/updateSufficientFlag.ts
export const updateSufficientFlag = functions.https.onCall(async (data, context) => {
  const { dateKey } = data;
  
  // 1. shiftDaysを取得
  // 2. 空き時間帯・スタッフ不足時間帯を検出
  // 3. 警告がない場合、isSufficient = trueに設定
  // 4. 手動チェック済みの場合はスキップ
});
```

#### 6. トリガー関数（自動実行）

**シフト割当変更時の自動判定:**
```typescript
// functions/src/shift/onShiftAssignmentChanged.ts
export const onShiftAssignmentChanged = functions.firestore
  .document('shiftDays/{dateKey}')
  .onUpdate(async (change, context) => {
    const newData = change.after.data();
    const dateKey = context.params.dateKey;
    
    // 1. 空き時間帯・スタッフ不足時間帯を検出
    // 2. 警告がない場合、isSufficient = trueに設定
    // 3. 手動チェック済みの場合はスキップ
  });
```

**申請承認時の自動更新:**
```typescript
// functions/src/shift/onRequestApproved.ts
export const onRequestApproved = functions.firestore
  .document('shiftRequests/{requestId}')
  .onUpdate(async (change, context) => {
    const newData = change.after.data();
    const oldData = change.before.data();
    
    if (newData.status === 'approved' && oldData.status !== 'approved') {
      // 1. shiftDaysにシフト割当を追加
      // 2. pendingRequestCountを減算
      // 3. 必要十分フラグを自動判定
    }
  });
```

### 5.3 セキュリティルール

```javascript
// Firestore Security Rules
match /shiftDays/{dateKey} {
  allow read: if request.auth != null;
  allow write: if request.auth != null && 
    get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role == 'admin';
}

match /shiftRequests/{requestId} {
  allow read: if request.auth != null;
  allow create: if request.auth != null && 
    request.resource.data.staffId == request.auth.uid;
  allow update: if request.auth != null && 
    (request.resource.data.staffId == request.auth.uid ||
     get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role == 'admin');
}
```

---

## 6. 実装のポイント

### 6.1 Firestore接続（完了）

すべてのデータはFirestoreから取得されます。`ShiftRepository`クラスを通じてFirestoreの読み書きを行います。
- `shift_repository.dart`: Repository層（Firestore read + Callable write）
- `ShiftHomePage`: Firestoreからシフトデータを読み込み、`finalizeDay`/`finalizeMonth`で書き込み
- `ShiftDraftPage`: Firestoreからpending requestsを読み込み、`interimConfirmRequests`で書き込み
- `ShiftDateDialog`: `setSufficientOverride`で必要十分フラグを設定

### 6.2 状態管理

現在は`setState`で状態管理していますが、DB接続時は以下のような状態管理ライブラリの導入を検討：
- Provider
- Riverpod
- Bloc

### 6.3 リアルタイム更新

Firestoreの`snapshots()`を使用して、リアルタイムでデータを更新：
```dart
StreamBuilder<QuerySnapshot>(
  stream: FirebaseFirestore.instance
    .collection('shiftDays')
    .where('date', isGreaterThanOrEqualTo: startDate)
    .where('date', isLessThanOrEqualTo: endDate)
    .snapshots(),
  builder: (context, snapshot) {
    // UI更新
  },
)
```

### 6.4 エラーハンドリング

DB接続時は、以下のエラーハンドリングが必要：
- ネットワークエラー
- 権限エラー
- データ不整合
- オフライン対応

---

## 7. 今後の拡張予定

### 7.1 営業日編集機能
- `BusinessDayEditPage`の実装
- 営業時間の一括設定
- 店休日の設定

### 7.2 シフト申請機能（スタッフ側）
- スタッフがシフト申請できる画面
- 申請履歴の確認

### 7.3 通知機能
- 申請承認時の通知
- 募集通知
- シフト確定通知

### 7.4 レポート機能
- シフト実績の集計
- スタッフ別の勤務時間集計
- 不足日の統計

---

## 8. 技術スタック

- **フレームワーク**: Flutter
- **言語**: Dart
- **状態管理**: setState
- **DB**: Firestore（実装済み）
- **Functions**: Cloud Functions for Firebase（実装済み）
- **認証**: Firebase Authentication（DeviceService経由で実装済み）
- **Repository**: `shift_repository.dart`（Firestore read + Callable write）

---

## 9. 注意事項

1. **時間の表現**: すべて分数形式（0:00からの分数）で統一
3. **日付キー**: `YYYY-MM-DD`形式の文字列を使用
4. **手動チェック**: 自動判定と手動チェックは独立して動作する

---

## 10. 詳細なロジック実装

### 10.1 空き時間帯検出アルゴリズム

```dart
List<({int start, int end})> _findGapTimeSlots(ShiftDayData dayData) {
  final List<({int start, int end})> gapSlots = [];
  
  if (dayData.businessHours.isClosed) return gapSlots;
  
  final openMinutes = dayData.businessHours.openMinute;
  final closeMinutes = dayData.businessHours.closeMinute;
  
  // 営業時間を1時間単位でチェック
  for (int hourStart = openMinutes; hourStart < closeMinutes; hourStart += 60) {
    final hourEnd = hourStart + 60;
    
    // この1時間に勤務しているスタッフがいるかチェック
    bool hasStaff = false;
    for (final assignment in dayData.assignments) {
      if (assignment.startMinute < hourEnd && assignment.endMinute > hourStart) {
        hasStaff = true;
        break;
      }
    }
    
    // スタッフがいない時間帯を記録
    if (!hasStaff) {
      gapSlots.add((start: hourStart, end: hourEnd));
    }
  }
  
  return gapSlots;
}
```

### 10.2 スタッフ不足時間帯検出アルゴリズム

```dart
List<({int start, int end, int required, int current})> _findInsufficientTimeSlots(ShiftDayData dayData) {
  if (dayData.businessHours.isClosed) {
    return [];
  }

  final openMinutes = dayData.businessHours.openMinute;
  final closeMinutes = dayData.businessHours.closeMinute;
  
  final insufficientSlots = <({int start, int end, int required, int current})>[];

  // 時間帯別の必要人数設定を取得（GlobalConstants.requiredStaffByTimeSlot）
  final requiredSlots = GlobalConstants.requiredStaffByTimeSlot;
  if (requiredSlots.isNotEmpty) {
    // 各設定された時間帯についてチェック
    for (final slot in requiredSlots) {
      final startHour = slot['startHour']!;
      final endHour = slot['endHour']!;
      final requiredCount = slot['requiredCount']!;
      
      // 時間を分に変換（例: 19 → 1140分 = 19:00）
      final slotStartMinutes = startHour * 60;
      final slotEndMinutes = endHour * 60;
      
      // 営業時間と重ならない場合はスキップ
      if (slotEndMinutes <= openMinutes || slotStartMinutes >= closeMinutes) {
        continue;
      }

      // この時間帯に勤務しているスタッフ数をカウント（1時間単位でチェック）
      for (int hour = startHour; hour < endHour; hour++) {
        final hourStartMinutes = hour * 60;
        final hourEndMinutes = (hour + 1) * 60;
        
        // 営業時間と重なる部分を計算
        final hourCheckStart = hourStartMinutes > openMinutes ? hourStartMinutes : openMinutes;
        final hourCheckEnd = hourEndMinutes < closeMinutes ? hourEndMinutes : closeMinutes;
        
        // 営業時間と重ならない場合はスキップ
        if (hourCheckStart >= hourCheckEnd) {
          continue;
        }

        // この1時間に勤務しているスタッフ数をカウント
        int currentCount = 0;
        for (final assignment in dayData.assignments) {
          // 割当時間とこの1時間が重なっているかチェック
          if (assignment.startMinute < hourEndMinutes && assignment.endMinute > hourStartMinutes) {
            currentCount++;
          }
        }

        // 必要人数に足りない場合は不足時間帯として記録
        if (currentCount < requiredCount) {
          insufficientSlots.add((
            start: hourStartMinutes,
            end: hourEndMinutes,
            required: requiredCount,
            current: currentCount,
          ));
        }
      }
    }
  }

  // 時刻順にソート
  insufficientSlots.sort((a, b) => a.start.compareTo(b.start));

  return insufficientSlots;
}
```

**注意:** 現在は`GlobalConstants.requiredStaffByTimeSlot`から時間帯別の必要人数を取得していますが、この設定が空の場合は不足時間帯は検出されません。

### 10.3 RangeSliderの実装（シフトドラフトページ）

シフトドラフトページでは、申請時間と割当時間をRangeSliderで編集できます。

**申請時間スライダー（黄色、非操作）:**
- 申請された元の時間を表示
- 編集不可（視覚的な参考用）

**割当時間スライダー（操作可能）:**
- 管理者が調整可能
- 営業時間内で制限
- 変更時に自動保存

**実装のポイント:**
- スライダーのトラック幅を動的に計算
- 時間の表示位置を正確に配置
- 2時間間隔のティック表示

### 10.4 カレンダー表示の実装

**カレンダーセル:**
- Stackレイアウトで複数の要素を重ねて表示
- Positionedウィジェットで各要素の位置を指定
- 当月と次月で表示内容を切り替え

**状態表示:**
- 最終確定済み: グレーアウト
- 中間確定済み: 通常表示
- 未処理: 通常表示

**未承認申請バッジ:**
- `pendingRequestCount > 0`の場合に表示
- オレンジ色のバッジ
- カレンダーセルの下部に配置

---

## 11. データフロー

### 11.1 シフト申請から確定までの流れ

```
1. スタッフがシフト申請
   └─> shiftRequestsコレクションに追加（status: 'pending'）

2. 管理者がドラフトページで申請を確認
   └─> 申請時間を調整可能（RangeSlider）

3. 管理者が申請を承認
   └─> shiftRequestsのstatusを'approved'に更新
   └─> shiftDaysにシフト割当を追加
   └─> pendingRequestCountを減算

4. 管理者が中間確定
   └─> shiftDaysのisInterimConfirmedをtrueに設定

5. 管理者が最終確定
   └─> shiftDaysのisFinalizedをtrueに設定
   └─> 編集不可になる
```

### 11.2 必要十分フラグの更新フロー

```
1. シフト割当が変更される
   └─> _updateDayData()が呼ばれる

2. 空き時間帯・スタッフ不足時間帯を検出
   └─> _findGapTimeSlots()
   └─> _findInsufficientTimeSlots()

3. 警告がないかチェック
   └─> hasWarnings = gapSlots.isNotEmpty || insufficientSlots.isNotEmpty

4. 手動チェック済みか確認
   └─> if (!_isManuallyChecked)

5. 自動判定を適用
   └─> isSufficient = !hasWarnings
```

---

## 12. UI/UXの詳細

### 12.1 カラースキーム

- **オレンジ**: 空き時間帯、未承認申請
- **赤**: スタッフ不足時間帯、エラー
- **青**: 通常の情報表示
- **グレー**: 最終確定済み、無効な状態
- **黄色**: 申請時間（参考表示）

### 12.2 レスポンシブ対応

- カレンダーは画面サイズに応じて調整
- タブはスワイプで切り替え可能
- ダイアログは画面の90%の高さに制限

### 12.3 アニメーション

- タブの展開/折りたたみアニメーション
- カレンダーセルのタップ時のフィードバック
- スライダーのドラッグ時のスムーズな動き

---

## 13. パフォーマンス最適化

### 13.1 データ読み込み

- 月単位でデータを読み込む（全データを一度に読み込まない）
- 必要な日付のデータのみを取得

### 13.2 計算の最適化

- 空き時間帯・スタッフ不足時間帯の検出は、必要時のみ実行
- キャッシュを活用して再計算を避ける

### 13.3 UIの最適化

- ListView.builderを使用して、表示される項目のみを構築
- 画像やアイコンのキャッシュ

---

## 14. テストケース

### 14.1 ユニットテスト

- 空き時間帯検出のテスト
- スタッフ不足時間帯検出のテスト
- 必要十分フラグの自動判定テスト

### 14.2 統合テスト

- シフト申請から確定までのフロー
- 不足日集計のテスト
- 募集通知送信のテスト

---

## 15. 設定値（GlobalConstants）

### 15.1 時間帯別の必要人数設定

```dart
static const List<Map<String, int>> requiredStaffByTimeSlot = [
  {'startHour': 19, 'endHour': 22, 'requiredCount': 2}, // 19:00~22:00に2人必要
  {'startHour': 10, 'endHour': 12, 'requiredCount': 3}, // 10:00~12:00に3人必要
];
```

**説明:**
- `startHour`: 開始時刻（0-23の整数）
- `endHour`: 終了時刻（0-23の整数、`startHour`より大きい値）
- `requiredCount`: 必要人数

**使用箇所:**
- `_findInsufficientTimeSlots()`: スタッフ不足時間帯の検出
- この設定が空の場合、スタッフ不足時間帯は検出されない

**DB設計案:**
```typescript
// Firestore Collection: shiftSettings
{
  requiredStaffByTimeSlot: Array<{
    startHour: number,
    endHour: number,
    requiredCount: number
  }>,
  updatedAt: Timestamp
}
```

### 15.2 シフト要請機能の有効/無効

```dart
static bool get isShiftRequestEnabled {
  return linePlan != 'communication';
}
```

**説明:**
- LINEプランが`communication`の場合は無効
- `light`または`standard`の場合は有効

---

## 16. エラーハンドリングとバリデーション

### 16.1 データバリデーション

**シフト割当のバリデーション:**
- 開始時刻 < 終了時刻
- 営業時間内であること
- スタッフIDが有効であること

**申請のバリデーション:**
- 開始時刻 < 終了時刻
- 営業時間内であること
- 過去の日付でないこと

### 16.2 エラーケース

1. **ネットワークエラー**
   - オフライン時の処理
   - リトライロジック

2. **権限エラー**
   - 管理者権限の確認
   - 適切なエラーメッセージ表示

3. **データ不整合**
   - 日付の重複チェック
   - 時刻の整合性チェック

---

## 17. パフォーマンス考慮事項

### 17.1 データ読み込み

- 月単位でデータを読み込む（全データを一度に読み込まない）
- 必要な日付のデータのみを取得
- ページネーションの実装

### 17.2 計算の最適化

- 空き時間帯・スタッフ不足時間帯の検出は、必要時のみ実行
- キャッシュを活用して再計算を避ける
- バッチ処理の検討

### 17.3 UIの最適化

- ListView.builderを使用して、表示される項目のみを構築
- 画像やアイコンのキャッシュ
- 不要な再描画を避ける

---

## 18. セキュリティ考慮事項

### 18.1 認証・認可

- Firebase Authenticationを使用
- 管理者権限の確認
- スタッフは自分の申請のみ編集可能

### 18.2 データ保護

- 個人情報の保護
- シフト情報の機密性
- 適切なセキュリティルール

---

## 19. テスト戦略

### 19.1 ユニットテスト

- 空き時間帯検出のテスト
- スタッフ不足時間帯検出のテスト
- 必要十分フラグの自動判定テスト
- 時間変換関数のテスト

### 19.2 統合テスト

- シフト申請から確定までのフロー
- 不足日集計のテスト
- 募集通知送信のテスト
- DB接続のテスト

### 19.3 E2Eテスト

- ユーザー操作のシミュレーション
- UIの動作確認
- エラーケースの確認

---

## 20. 移行計画（モックからDB接続へ）✅ 完了

### 20.1 段階的移行（完了）

1. **Phase 1: データ読み込み** ✅
   - Firestoreからデータを読み込む（`ShiftRepository.getShiftDaysForMonths`）
   - `ShiftHomePage`でシフトデータを読み込み
   - `ShiftDraftPage`でpending requestsを読み込み

2. **Phase 2: データ書き込み** ✅
   - Firestoreにデータを書き込む（Cloud Functions経由）
   - `finalizeDay`/`finalizeMonth`: シフト確定
   - `interimConfirmRequests`: 中間確定
   - `setSufficientOverride`: 必要十分フラグ設定

3. **Phase 3: リアルタイム更新** （部分的に実装済み）
   - `ShiftRepository.watchShiftDaysForMonth`: リアルタイム購読機能あり
   - 現状は手動リロードを採用

4. **Phase 4: Cloud Functions導入** ✅
   - すべての書き込み操作はCloud Functions経由
   - 自動判定ロジックはCloud Functions側で実装
   - 不足日集計・募集作成もCloud Functions経由

### 20.2 実装済み機能

- ✅ `ShiftRepository`: Repository層の実装
- ✅ `ShiftHomePage`: Firestore接続完了
- ✅ `ShiftDraftPage`: Firestore接続完了
- ✅ `ShiftDateDialog`: Firestore接続完了
- ✅ エラーハンドリング・ローディング状態の表示

---

## 21. 参考資料

- Flutter公式ドキュメント: https://flutter.dev/docs
- Firestore公式ドキュメント: https://firebase.google.com/docs/firestore
- Cloud Functions for Firebase公式ドキュメント: https://firebase.google.com/docs/functions
- Material Designガイドライン: https://material.io/design
