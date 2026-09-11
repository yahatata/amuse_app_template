# D02-D01 demo analytics tools

営業デモ用 `analyticsMonthly` 投入ツール。  
正本仕様: `docs/営業デモ準備/D02-D01_2025-09再利用仕様.md`

## Files

| file | role |
|------|------|
| `source_2025-09.json` | 再利用元（monthly / days / byCategory のみ。PII・byUser なし） |
| `normalize_demo_analytics.js` | 正規化のみ（DBなし） |
| `write_demo_analytics.js` | guarded Admin writer（**default dry-run**） |
| `lib/` | helpers / normalize / assert |

## Dry-run（推奨・書込なし）

```bash
cd tools/demo/analytics
node write_demo_analytics.js --target-month 2026-09 --demo-day 2026-09-20
```

## Apply（人間承認後のみ）

```bash
node write_demo_analytics.js --target-month 2026-09 --demo-day 2026-09-20 --apply
```

Guards:

- `projectId` は `amuse-app-template` のみ
- 書込 path は `analyticsMonthly/{targetMonth}` 配下（days / byCategory/summary）のみ
- 既存月 doc がある場合は停止（merge/上書き禁止）
- assert 失敗時は apply 禁止
- Emulator (`FIRESTORE_EMULATOR_HOST`) では実行拒否

## Normalize only

```bash
node normalize_demo_analytics.js --target-month 2026-09 --demo-day 2026-09-20 --out out/normalized.json
```

## Rollback

自動削除は実装しない。apply 時に `out/planned_paths_*.txt` を保存するので、必要な場合はそこに列挙された analytics path のみを人手で削除する。
