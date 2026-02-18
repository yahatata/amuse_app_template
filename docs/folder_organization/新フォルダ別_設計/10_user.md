# 新フォルダ別設計：user

## 5.1 ドメイン定義（短く）

ユーザー・認証・来店を担当するドメイン。auth（LINE カスタムトークン発行）、user（アカウント作成・QR 生成・検証）、userLogin（入店状態取得・QR/手動入店）を統合する。04 の「user＝ユーザー・認証・来店」に該当。

**主に扱うデータ/コレクション**
- users, activeStays, users/{uid}/visitLogs
- Firebase Auth, Storage（QR 画像）。helpers/billsApi（createBillWithActiveStay）。lib/devicePermissions
- utils から移行：logUtils（users ログサブコレクション）, qrCodeUtils, lineAuth

---

## 5.2 フォルダ構成（確定）

| フォルダ | 役割 |
|----------|------|
| callables/ | 認証（getFirebaseCustomToken）、アカウント作成・QR 生成・検証、入店状態取得・QR/手動入店の onCall 入口。registerDevice/updateDeviceOptions/updateDeviceRole は **shared/devices** に配置（08 確定） |
| services/ | logUtils（addLogEntry, initializeUserLogs）, qrCodeUtils（generateQRData, verifyQRData, saveQRCodeToStorage 等）, lineAuth（verifyLineIdToken）。**qrCodeUtils は user に配置**（08 確定） |

---

## 5.3 移動一覧（from → to）

| 現在パス | 新パス | 種別 | 備考（互換/注意点） |
|----------|--------|------|---------------------|
| auth/index.ts | domains/user の再構成 | — | getFirebaseCustomToken のみ |
| auth/getFirebaseCustomToken.ts | domains/user/callables/getFirebaseCustomToken.ts | callable | onRequest。utils/lineAuth → domains/user/services に変更 |
| user/index.ts | 同上 | — | 4 callable を callables に統合 |
| user/createUserByApp.ts | domains/user/callables/createUserByApp.ts | callable |  |
| user/createUserAccount.ts | domains/user/callables/createUserAccount.ts | callable |  |
| user/generateQRCode.ts | domains/user/callables/generateQRCode.ts | callable |  |
| user/verifyQRCode.ts | domains/user/callables/verifyQRCode.ts | callable |  |
| userLogin/index.ts | 同上 | — | 3 callable を callables に統合 |
| userLogin/getUserStatus.ts | domains/user/callables/getUserStatus.ts | callable |  |
| userLogin/processVisitByQR.ts | domains/user/callables/processVisitByQR.ts | callable | helpers/billsApi → domains/bills/repos。utils/qrCodeUtils → domains/user/services |
| userLogin/manualCheckIn.ts | domains/user/callables/manualCheckIn.ts | callable | 同上 |
| utils/logUtils.ts | domains/user/services/logUtils.ts | service | addLogEntry, initializeUserLogs。sideGame, itemOrder, callables/setRankingData から参照。import パスを domains/user/services に更新 |
| utils/qrCodeUtils.ts | domains/user/services/qrCodeUtils.ts | service | user, userLogin, staff から参照。**domains/user に配置**（08 確定） |
| utils/lineAuth.ts | domains/user/services/lineAuth.ts | service | auth/getFirebaseCustomToken が参照 |
| callables/registerDevice.ts | shared/devices/callables/registerDevice.ts | callable | **shared/devices** に配置（08 確定）。user には含めない |
| callables/updateDeviceOptions.ts | shared/devices/callables/updateDeviceOptions.ts | callable | 同上 |
| callables/updateDeviceRole.ts | shared/devices/callables/updateDeviceRole.ts | callable | 同上 |

---

## 5.4 index.ts 変更方針

- **ルート index**：auth, user, userLogin の export を `export * from "./domains/user"` に集約。関数名は維持。
- **domains/user/index.ts**：callables を re-export（getFirebaseCustomToken, createUserByApp, createUserAccount, generateQRCode, verifyQRCode, getUserStatus, processVisitByQR, manualCheckIn）。registerDevice/updateDeviceOptions/updateDeviceRole は **shared/devices** に移すため user の index からは export しない。services は原則 export しないが、他ドメイン（sideGame, itemOrder, callables/setRankingData, staff）が logUtils を参照するため、必要に応じて export または直接パス指定で import。
- **utils/lineAuth** への import パスを移行先（domains/user/services）から参照できるようにする。

---

## 5.5 検証手順（07 に準拠）

- **必須**：移管後に TypeScript ビルドが成功すること。userLogin が domains/bills/repos（createBillWithActiveStay）を参照できること。sideGame, itemOrder, callables が logUtils を domains/user/services から参照できること。
- **失敗時**：当該ドメイン移管範囲で切り戻し。

---

## 5.6 未確定事項・検討事項（棚卸しから反映）

- **registerDevice, updateDeviceOptions, updateDeviceRole**：**shared/devices** に配置（08 確定）。05_入口一覧を shared/devices / callables に更新する。
- **qrCodeUtils**：**domains/user/services** に配置（08 確定）。staff は domains/user/services から参照する。
- **calculateFirestoreSize**（callables）：**shared/firebase** に配置（08 確定）。05_入口一覧を shared/firebase に更新する。
- **changeSpec**：user 移管時の changeSpec で、auth/getFirebaseCustomToken.ts の移動と index の export パス付け替えを記載する。userLogin と user を domains/user/callables に統合し、ルート index の export を domains/user に集約する。registerDevice 等は shared/devices 移管時にルート index の export を shared/devices 経由に変更する。
- **05_入口一覧**：移行実施後、getFirebaseCustomToken を「user / callables」に更新。getUserStatus, processVisitByQR, manualCheckIn, createUserByApp, createUserAccount, generateQRCode, verifyQRCode を user/callables に記載する。
