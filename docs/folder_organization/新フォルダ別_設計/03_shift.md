# 新フォルダ別設計：shift

## 5.1 ドメイン定義（短く）

シフト・営業時間・募集を担当するドメイン。**営業日・営業時間の作成・編集**は shared/businessHours（新規カテゴリ）に分離し、シフト・募集専用の入口と内部モジュールのみ shift に残す（08_意思決定ログに shared/businessHours 追加を記録）。

**主に扱うデータ/コレクション**
- shifts（および shifts/{ym}/days）, shiftRequests, shiftRecruitments
- devices（読）, staffs（読）, businessHoursMonthlyMap（読。initShiftDaysForMonth で参照。shared/businessHours 移行後はそちらから参照）

---

## 5.2 フォルダ構成（確定）

| フォルダ | 役割 |
|----------|------|
| callables/ | シフト日次作成・中間確認・日次アサイン・確定・充足オーバーライド・不足日数計算・募集作成・募集通知の onCall 入口（9 本） |
| services/ | helpers（デバイス・staffs・shifts の読書、バリデーション）。staff からも参照。**基本的に services**。純粋に repos（書き込み等のみ）とする処理のみ repos に振り分け（08 確定） |

- **shared/businessHours** に移るもの（本設計の対象外だが依存関係として記載）：initBusinessHoursForMonth, generateBusinessHoursForMonthFromStyles, generateBusinessHoursForYearFromStyles, setBusinessHoursManualForDay, scheduleGenerateNextYearBusinessHours, businessHoursCore, styles, holidayHelper, japanese-holidays.d.ts。initShiftDaysForMonth は shift に残し、shared/businessHours の API（businessHoursCore の syncBusinessHoursToShifts 等）を参照する。

---

## 5.3 移動一覧（from → to）

| 現在パス | 新パス | 種別 | 備考（互換/注意点） |
|----------|--------|------|---------------------|
| shift/index.ts | domains/shift の再構成 | — | 9 入口のみ re-export（営業時間関連 5 は shared/businessHours へ） |
| shift/initShiftDaysForMonth.ts | domains/shift/callables/initShiftDaysForMonth.ts | callable | businessHoursCore 等は shared/businessHours から参照 |
| shift/interimConfirmRequests.ts | domains/shift/callables/interimConfirmRequests.ts | callable |  |
| shift/updateDayAssignments.ts | domains/shift/callables/updateDayAssignments.ts | callable |  |
| shift/finalizeDay.ts | domains/shift/callables/finalizeDay.ts | callable |  |
| shift/finalizeMonth.ts | domains/shift/callables/finalizeMonth.ts | callable |  |
| shift/setSufficientOverride.ts | domains/shift/callables/setSufficientOverride.ts | callable |  |
| shift/calculateInsufficientDays.ts | domains/shift/callables/calculateInsufficientDays.ts | callable |  |
| shift/createRecruitments.ts | domains/shift/callables/createRecruitments.ts | callable |  |
| shift/sendRecruitmentNotification.ts | domains/shift/callables/sendRecruitmentNotification.ts | callable | utils/lineMessaging → domains/webhook/services 参照に変更 |
| shift/helpers.ts | domains/shift/services/helpers.ts | service | staff が import。基本的に services（08 確定）。純粋 I/O のみの場合は repos に分離可 |

---

## 5.4 index.ts 変更方針

- **ルート index**：**shift を export する**（08 で確定）。移行後は `export * from "./domains/shift"` を追加し、shift の 9 入口がデプロイ対象に含まれるようにする。
- **domains/shift/index.ts**：callables 9 本を re-export。helpers は原則 export しないが、staff から参照するため必要に応じて export または staff が直接パス指定で import。
- **staff** の shift/helpers への import を `domains/shift/services` に更新する。

---

## 5.5 検証手順（07 に準拠）

- **必須**：移管後に TypeScript ビルドが成功すること。staff から shift の services 参照ができること。
- **失敗時**：当該ドメイン移管範囲で切り戻し。

---

## 5.6 未確定事項・検討事項（棚卸しから反映）

- **08_意思決定ログ**：**shared/businessHours** を新規カテゴリとして追加済み。**ルート index に shift を export する**ことを 08 で確定済み。
- **changeSpec**：shared/businessHours 移管時と shift 移管時に、**staff** の shift/helpers への **import パス** を `domains/shift/services` に更新する。営業時間関連 5 入口と 4 内部ファイルは shared/businessHours への import パスに更新する。ルート index に `export * from "./domains/shift"` を追加する。
- **05_入口一覧**：移行実施後、shift 配下 9 入口の配置を「shift/callables」に更新する。
