# QRコード出勤・退勤まわりの確認結果

## 1. 名前表示について（QRスキャン後にスタッフ名のみ表示したい）

### 現状

- **QRコードの内容**（`functions/src/domains/user/services/qrCodeUtils.ts` の `generateQRData`）  
  - `uid`, `loginId`, `timestamp`, `token`, `type` のみ。**名前（fullName）は含まれていない**。
- **アプリ側**（`lib/AttendanceManagement/qrScanPage.dart`）  
  - スキャン後に「QRコードデータ:」として **生のJSON文字列** を表示。  
  - スタッフ情報としては「スタッフID: $_extractedStaffId」（＝QRの `uid`）のみ表示。

### 結論：QRデータを変えずに名前表示は可能

- QRからは **`uid`** が取れている（`attendanceService.extractStaffIdFromQR` が `qrDataMap['uid']` を返している）。
- Firestore の **`staffs` コレクションはドキュメントID = `uid`** で保存されている（`createStaffByApp.ts` の `staffs.doc(uid).set(...)`）。
- したがって、**QRのデータ構造を変えずに**、アプリ側で `staffs/{uid}` を1件取得し、その `fullName` を表示する実装にすれば、**スタッフ名のみ表示**できる。
- **QRコードデータを変える必要はない。**

### 実装イメージ（名前表示のみ・変更案）

- スキャン成功後、`_extractedStaffId`（＝uid）を使って Firestore `staffs/{uid}` を取得。
- 取得したドキュメントの `fullName` を表示し、現在の「QRコードデータ:」の生JSON表示はやめる（または名前＋必要最小限の情報に変更）。

---

## 2. 「スタッフが見つかりません」になる理由の整理

### アプリで「スタッフが見つかりません」が出る条件

- `lib/AttendanceManagement/attendanceService.dart` の `_handleFirebaseFunctionsException` で、  
  **Functions のエラーコードが `not-found` のとき** に  
  `Exception('スタッフが見つかりません: ${e.message}')` に変換して表示している。

```dart
case 'not-found':
  return Exception('スタッフが見つかりません: ${e.message}');
```

つまり、**バックエンドのいずれかの Callable が `HttpsError('not-found', ...)` を投げた場合**にこの文言になる。

### 出勤・退勤で使っている Callable

- **出勤**：`clockIn`（`functions/src/domains/attendance/callables/clockIn.ts`）
- **退勤**：`clockOut`（`functions/src/domains/attendance/callables/clockOut.ts`）

いずれも **`not-found` は投げていない**。

- `clockIn`: `unauthenticated`, `permission-denied`, `invalid-argument`, および catch 時の `internal` のみ。
- `clockOut`: 同様に `not-found` なし。勤怠がない場合は `success: false` と `code: 'no-unclocked-attendance'` を返す。

したがって、**現在の clockIn / clockOut の実装だけを見る限り、「スタッフが見つかりません」は出勤・退勤のメイン処理からは出ない**。

### 「not-found」を投げている可能性がある箇所

- **updateClockOutRecord** / **updateManualClockOutRecord**  
  - `attendances` の `docId` で取得したドキュメントが存在しない場合に  
    `HttpsError('not-found', 'Attendance record not found')` を投げる。  
  - メッセージは「Attendance record not found」だが、アプリ側は **コードが `not-found` なら一律「スタッフが見つかりません」** と表示する。
- **updateStaffBankInfo**  
  - スタッフドキュメントが無い場合に `HttpsError('not-found', 'スタッフが見つかりません')` を投げる。  
  - QR出勤フローでは通常呼ばれない。

### 想定される原因（出勤で「スタッフが見つかりません」と出る場合）

1. **実際には別の Callable が呼ばれている**  
   - 例：退勤で `docId` 指定の `updateClockOutRecord` / `updateManualClockOutRecord` が呼ばれ、存在しない `docId` を渡している場合、`not-found` となり「スタッフが見つかりません」と表示される。
2. **デバイス未登録・権限不足**  
   - `clockIn` / `clockOut` ではデバイスが見つからない・非アクティブ・権限なしのとき **`permission-denied`** を投げ、アプリでは「権限がありません」と表示される。  
   - ユーザーが「スタッフが見つかりません」と認識している可能性もあるため、**実際の画面の文言**を確認した方がよい。
3. **Firestore の staffs のドキュメントIDと QR の uid の不一致**  
   - 仕様上は `staffs` は **ドキュメントID = スタッフの uid**（`createStaffByApp` / `createStaffAccount` いずれも `.doc(uid).set(...)`）。  
   - ただし、**そのスタッフが別の方法（手動や別スクリプト）で作成され、ドキュメントIDが uid と異なる**場合、`clockIn` は `staffs.doc(staffId).get()` で存在しなくなる。  
   - その場合、現在の `clockIn` は **not-found は投げず**、`staffName = 'Unknown'` として出勤記録は作成する。  
   - つまり「スタッフが見つかりません」が **clockIn から直接出ることはない**が、**別 Callable（上記の退勤系）や、過去バージョン・別デプロイの実装**から `not-found` が出ている可能性はある。

### 推奨する確認事項

1. **表示されている正確なメッセージ**  
   - 「スタッフが見つかりません」か、「権限がありません」か、それとも別の文言か。
2. **Firestore の staffs ドキュメント**  
   - 該当スタッフの **ドキュメントID** が、QRコードに含まれる **uid**（例: `Ubd1dbd818a35314555ae3e9a958f78d7`）と **完全に同一**かどうか。
3. **Functions のログ**  
   - 出勤ボタン押下時に、どの Callable（`clockIn` / `clockOut` / `updateClockOutRecord` / その他）が実行され、どのエラーコードで終了しているか。
4. **退勤処理**  
   - QRスキャン後の退勤では `clockOut(staffId)` が呼ばれ、`staffId` で未退勤の attendance を検索している。  
   - ここでは `staffs` を直接読んでおらず、`not-found` は出さない。  
   - 一方、**手動退勤や別画面から「docId 指定」で退勤している**場合は、`updateClockOutRecord` / `updateManualClockOutRecord` が使われ、存在しない docId で `not-found` →「スタッフが見つかりません」となり得る。

---

## 3. 退勤処理の確認結果

- **clockOut**（QRスキャン後の退勤で使用）  
  - `staffId` または `docId` を受け取り、  
    - `docId` あり → `attendances.doc(docId)` を取得、存在しなければ `success: false, code: 'no-unclocked-attendance'` を返す（**not-found は投げない**）。  
    - `staffId` のみ → 当日営業日・`clockOut == null` の attendance を検索し、見つからなければ同様に `success: false`。  
  - スタッフの存在は `staffs.doc(staffId)` ではチェックしていない。  
- **updateClockOutRecord / updateManualClockOutRecord**  
  - `docId` で attendance を取得し、**存在しない場合に `not-found` を投げる**。  
  - アプリではこのコードが `not-found` のとき「スタッフが見つかりません」と表示される。

---

## 4. まとめ

| 項目 | 結論 |
|------|------|
| **名前表示** | QRデータを変えずに、**uid で Firestore `staffs/{uid}` を取得して `fullName` を表示する**実装で対応可能。QRのデータ構造変更は不要。 |
| **「スタッフが見つかりません」** | 現在の **clockIn / clockOut の実装からは `not-found` は返していない**。表示される場合は、(1) 別 Callable（退勤の docId 指定系）の `not-found` が「スタッフが見つかりません」に変換されている、(2) 実際は「権限がありません」など別メッセージの可能性。**正確な表示文言・Firestore の doc ID・Functions ログ**の確認を推奨。 |
| **退勤** | QRからの退勤は `clockOut(staffId)` で、`not-found` は返さない。docId 指定の退勤系 Callable では、存在しない docId のときに `not-found` となり、アプリで「スタッフが見つかりません」と表示され得る。 |

以上、先行しての確認結果です。実装変更は行っていません。
