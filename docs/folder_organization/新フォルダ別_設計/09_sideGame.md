# 新フォルダ別設計：sideGame

## 5.1 ドメイン定義（短く）

サイドゲーム・チップ・席を担当するドメイン。参加登録・退席・チップ預入・チップ引出の onCall 入口 4 本。callables/index が re-export しており、index は sideGame フォルダに存在しない。

**主に扱うデータ/コレクション**
- sideGame, bills/place, activeStays, users（sideGameChip）, bills/sideGameChips, todaysBills
- helpers/billsApi（getActiveBillByUser, appendSideGameChip, updatePlace）。utils/logUtils。lib/devicePermissions

---

## 5.2 フォルダ構成（確定）

| フォルダ | 役割 |
|----------|------|
| callables/ | 参加登録・退席・チップ預入・チップ引出の onCall 入口（4 本） |

---

## 5.3 移動一覧（from → to）

| 現在パス | 新パス | 種別 | 備考（互換/注意点） |
|----------|--------|------|---------------------|
| sideGame/registerForSideGame.ts | domains/sideGame/callables/registerForSideGame.ts | callable | helpers/billsApi → domains/bills/repos。lib/devicePermissions → shared/devices（08 確定） |
| sideGame/leaveSeat.ts | domains/sideGame/callables/leaveSeat.ts | callable | 同上 |
| sideGame/depositTip.ts | domains/sideGame/callables/depositTip.ts | callable | utils/logUtils → domains/user/services に変更 |
| sideGame/withdrawTip.ts | domains/sideGame/callables/withdrawTip.ts | callable | 同上 |
| callables/debugSideGame.ts | domains/sideGame/callables/debugSideGame.ts | callable |  |

---

## 5.4 index.ts 変更方針

- **ルート index**：callables 経由の export を維持。移行後は `export * from "./domains/sideGame"` を追加し、callables/index の sideGame への re-export を削除または domains/sideGame に差し替え。関数名は維持。
- **domains/sideGame/index.ts**：callables 5 本を re-export。
- **callables/index** の sideGame への **import パス** を `domains/sideGame/callables` に更新する。

---

## 5.5 検証手順（07 に準拠）

- **必須**：移管後に TypeScript ビルドが成功すること。bills/repos、user/services の参照ができること。
- **失敗時**：当該ドメイン移管範囲で切り戻し。

---

## 5.6 未確定事項・検討事項（棚卸しから反映）

- **設計**：sideGame ドメイン設計で、helpers/billsApi → domains/bills/repos、lib/devicePermissions → shared/devices、utils/logUtils → domains/user/services の import パスに更新する（08 確定）。
- **changeSpec**：sideGame 移管時に、**callables/index** の sideGame への **import パス** を `domains/sideGame/callables` に更新する。export 名は変更しない。
- **05_入口一覧**：移行先確定後、registerForSideGame, leaveSeat, withdrawTip, depositTip, debugSideGame の配置を「sideGame/callables」に更新する。
