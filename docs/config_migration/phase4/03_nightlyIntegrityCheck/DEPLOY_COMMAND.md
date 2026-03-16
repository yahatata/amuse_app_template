# Phase4 03: 更新・新規作成した関数のデプロイコマンド

## 対象関数

| 関数名 | 種別 |
|--------|------|
| `getUnclockedStaffForClose` | 新規 |
| `getUnclosedTournamentsForClose` | 新規 |
| `getCloseIntegrityData` | 新規 |
| `closeStoreTerminal` | 更新（forceClose, markUnclockedAndForceEnd 追加） |
| `updateUnclockedAttendanceWithAuth` | 新規（パスワード認証付き退勤打刻） |

**注**: 未退勤一覧の取得は Firestore の snapshot（クライアント直接購読）を使用するため、`getUnclockedAttendancesList` Callable は不要です。

## デプロイコマンド

上記5つの関数のみをデプロイする場合:

```bash
cd functions && npm run build && cd .. && firebase deploy --only "functions:getUnclockedStaffForClose,functions:getUnclosedTournamentsForClose,functions:getCloseIntegrityData,functions:closeStoreTerminal,functions:updateUnclockedAttendanceWithAuth"
```

または、`firestore.indexes.json` に attendances のインデックスを追加している場合は、インデックスも同時にデプロイする場合:

```bash
cd functions && npm run build && cd .. && firebase deploy --only "functions:getUnclockedStaffForClose,functions:getUnclosedTournamentsForClose,functions:getCloseIntegrityData,functions:closeStoreTerminal,functions:updateUnclockedAttendanceWithAuth,firestore:indexes"
```

## 環境変数（updateUnclockedAttendanceWithAuth 用）

未退勤一覧から退勤打刻する際の簡易パスワードを設定する:

```
UNCLOCKED_ATTENDANCE_EDIT_PASSWORD=任意のパスワード
```

Firebase Functions の環境変数として設定すること（`firebase functions:config:set` または `.env` / Secret Manager 等）。

## 注意

- 初回デプロイ時や他関数に依存がある場合は、`firebase deploy --only functions` で全関数をデプロイする方が安全な場合があります。
