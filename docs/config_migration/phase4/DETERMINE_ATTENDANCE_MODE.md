# Phase4: スタッフ打刻（determineAttendanceMode）改修 詳細仕様

## 1. 概要

スタッフの出勤・退勤打刻ロジックを改修し、**STORE_CLOSE_HOUR を廃止**する。  
出勤と退勤を分離し、例外時は管理者認証による解消を必須とする。

---

## 2. 方針

- **STORE_CLOSE_HOUR を使用しない**
- スタッフ打刻を「出勤」と「退勤」に明確に分離
- 例外時（下記）はエラー/警告を表示し、**管理者デバイス**または**管理者のみが知っているパスワード**で解消する必要がある
- 例外に当てはまらなければ通常処理

---

## 3. 例外と通常処理

### 3.1 例外（エラー/警告を表示し、管理者認証で解消）

| 条件 | 内容 | 解消方法 |
|------|------|----------|
| 出勤時: 退勤されていない attendance が既に存在する | 未退勤の出勤記録が残っている状態での新規出勤 | 管理者デバイスまたは管理者パスワードで解消を許可 |

**補足**: 退勤時の「出勤からの経過時間が一定時間を超える」による例外は**廃止**。長時間勤務も通常の退勤処理で対応する。

### 3.2 通常処理

- 上記の例外に当てはまらない場合は、通常どおり出勤/退勤を処理する

---

## 4. 判定ロジック（STORE_CLOSE_HOUR 廃止後）

**出勤の判定**

- staffId で attendances を検索し、clockOut == null のドキュメントが存在するか確認
- 存在する → **例外**（未退勤の attendance あり）。管理者認証を要求
- 存在しない → 通常の出勤処理（createClockInRecord）

**退勤の判定**

- staffId + clockOut == null で attendances を検索
- 0件 → エラー（退勤対象なし）
- 1件 → 通常の退勤処理（updateClockOutRecord）。**経過時間による例外は廃止**
- 2件以上 → データ異常。管理者認証で解消

---

## 5. 管理者認証

- **管理者デバイス**: role == 'admin' のデバイスからの打刻
- **管理者パスワード**: 管理者のみが知っているパスワードを入力して解消を許可

実装時に認証フロー・セキュリティを詳細化する。

---

## 6. 対象ファイル（実装時）

- `functions/src/domains/attendance/callables/determineAttendanceMode.ts`
- 必要に応じて `createClockInRecord.ts`, `updateClockOutRecord.ts` の改修
- Dart: `lib/AttendanceManagement/attendanceService.dart`, `qrScanPage.dart` 等（例外表示・管理者認証 UI）

---

## 7. 関連

- D-06（STORE_CLOSE_HOUR）の Phase0B 対象から Phase4 実装により解消
- attendances は営業日と必ずしも結びつけない（暦日ベースで運用可）
