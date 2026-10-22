# Demo past-attendance tools

営業デモ用に、**デモ日より前**の正常な退勤済み `attendances` を安全に投入するツール。  
Admin「全スタッフ勤怠」／Staff LINE 勤怠カレンダーの見栄え用（D02-G02 / G03）。

思想・ガードは `tools/demo/analytics/` に合わせている。

## 目的

- デモ日確定後に、過去日の勤怠ダミーを dry-run → 承認 → `--apply` で投入できること
- 表示上自然な件数（3スタッフ × パターン8件）を用意すること

## 対象

- `attendances/{autoId}` のみ（direct Admin SDK write）
- フィールドは現行 `createAttendance` に可能な限り揃える
- `weekday` / `weekStartDate` / `paymentPeriodKey` は apply 後の `attendanceOnWrite` に任せる

## 対象外（このツールでは作らない・触らない）

- **当日勤怠**（デモ日当日）
- **shifts**（通常 UI で手作業）
- **attendanceLogs**（今回省略）
- **breaks** サブコレクション（今回は休憩なし）
- **staffs** 本体の更新
- **payroll** 実行・確定
- その他コレクション

## 必要な staff 設定

専用デモスタッフ **3名** の UID（`staffs/{uid}`）を明示指定する。  
**name 検索禁止。UID をコードへ hardcode しない。**

1. 例をコピーしてローカル専用ファイルを作る（git 管理外）:

```bash
cp staffs.example.json staffs.local.json
# staffs.local.json の UID を実デモスタッフに置換
```

2. または CLI:

```bash
--staff-ids uidA,uidB,uidC
```

`staffs.local.json` は `.gitignore` 対象。実 UID をリポジトリに残さないこと。

事前検証（write 時・offline 以外）:

- `staffs/{uid}` が存在する
- `status !== retired`
- dry-run で **uid + fullName** を表示

## 生成パターン

デモ日を `D` として:

| 日 | スタッフ |
|----|----------|
| D-4 | A, B, C |
| D-2 | A, C |
| D-1 | A, B, C |

合計 **8件**。すべて退勤済み・手動・休憩なし・深夜帯なし。

時刻例（JST）:

- A: 17:00–21:30
- B: 17:15–21:45
- C: 17:30–21:50

## Dry-run（推奨・書込なし）

### Offline（DB不要・構文／計画検証）

```bash
cd tools/demo/attendance
node generate_demo_attendance.js --demo-day 2026-09-20 --staff-file staffs.example.json

node write_demo_attendance.js --demo-day 2026-09-20 --staff-file staffs.example.json --offline
```

### 実 staff 検証付き dry-run（読取のみ・書込なし）

```bash
node write_demo_attendance.js \
  --demo-day 2026-09-20 \
  --staff-file staffs.local.json
```

ADC で `amuse-app-template` に接続し、staff 存在／retired 拒否／衝突照会（読取）まで行う。  
**Firestore への書込は行わない。**

## Apply（人間承認後のみ）

```bash
node write_demo_attendance.js \
  --demo-day 2026-09-20 \
  --staff-file staffs.local.json \
  --apply
```

適用前ガード:

1. project = `amuse-app-template`
2. emulator 拒否
3. staff validation
4. plan assert
5. collision（1件でも既存なら全体停止）
6. batch `create`（merge/overwrite 禁止）
7. read-back
8. `out/manifest_*.json` 保存

## Cleanup

```bash
# dry-run
node cleanup_demo_attendance.js --manifest out/manifest_YYYY-MM-DD_....json

# 削除（manifest 記載 doc のみ）
node cleanup_demo_attendance.js --manifest out/manifest_YYYY-MM-DD_....json --apply
```

## 安全策

- dry-run がデフォルト（`--apply` なしでは書かない）
- project ID 固定
- emulator では apply／通常実行拒否
- デモ日当日・未来日・demo-day 以降は生成しない
- `(staffId, date)` 衝突で全体停止
- 指定 staff 以外へ書かない
- `attendances` 以外を書かない
- dry-run で全件一覧（uid / fullName / date / clockIn / clockOut / actualWorkMinutes）

## デモ運用上の前提

- **当日勤怠・shift はこのツールでは作らない**（通常 UI）
- **attendanceLogs は作らない**
- 投入データは `payrollStatus: unreflected` のため給与候補に載り得る → **デモ中に payroll execute / confirm しない**

## Files

| file | role |
|------|------|
| `staffs.example.json` | UID プレースホルダ例（実UIDなし） |
| `generate_demo_attendance.js` | offline plan 生成 |
| `write_demo_attendance.js` | guarded writer（default dry-run） |
| `cleanup_demo_attendance.js` | manifest 指定削除（default dry-run） |
| `lib/` | helpers / plan / assert |
| `out/` | planned JSON / manifest（gitignore） |
