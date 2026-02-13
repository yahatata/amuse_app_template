# Phase6 Step2 実装サマリ（未会計billsの移管UI／closeSnapshot付与）

実装内容を具体コードも含めて漏れなくまとめたドキュメントです。

---

## 0. 実装完了サマリ（Step2 完了）

- **完了日**: 2025年2月
- **含まれる範囲**:
  1. **未会計billsの移管**: システム設定画面の「未会計billsの移管」→ 取得・一覧・closeSnapshot 付与・結果表示・再試行（本ドキュメント §1〜§9 で詳述）。
  2. **未会計の会計**: ターミナルホームの「未会計の会計」→ 未会計の会計ページ（タブ: 日付ごと／ユーザー別）→ ユーザー別の未会計bills一覧（営業日表示）→ 会計ページで会計完了 → finalizeUnsettledBillAfterAccounting（§10 で詳述）。
- **UI 仕様（未会計の会計ページ）**:
  - タブ「日付ごと」「ユーザー別」のラベル色は白系（`labelColor: Colors.white`, `unselectedLabelColor: Colors.white70`）。
  - ユーザー別で選択したユーザーの未会計bills一覧では、各カードに **pokerName** と **営業日（businessDate）** を表示する。請求書IDは表示しない（会計遷移・後処理のため billId は内部で保持）。

---

## 1. 概要

- **目的**: 当日営業日かつ未会計（`status in ['open','in_progress','settling']`）の bills に、閉店時ラベル（`closeSnapshot`）を手動で付与するUIとバックエンドを追加する。
- **仕様**: `docs/business_hours_migration/phase6/step2/change_spec.md` に準拠。
- **既存への配慮**: 既存の「閉店クリーンアップ」「settledBills移管」等は変更せず、closeSnapshot は監査・運用用ラベルであり、`status` や appendItem/startAccounting 等の既存ガードには影響しない。

---

## 2. 実装一覧

| 種別 | ファイル | 内容 |
|------|----------|------|
| 新規 | `functions/src/close_process/getUnsettledBillsForClose.ts` | 未会計bills取得 Callable |
| 新規 | `functions/src/close_process/applyCloseSnapshot.ts` | closeSnapshot 付与 Callable |
| 新規 | `functions/src/close_process/finalizeUnsettledBillAfterAccounting.ts` | 未会計bill 会計完了後処理 Callable |
| 変更 | `functions/src/close_process/index.ts` | 上記3関数の export 追加 |
| 変更 | `lib/Home/systemSettingsPage.dart` | カード・ダイアログ・Callable 呼び出しの追加 |
| 新規 | `lib/Accounting/unsettledAccountingPage.dart` | 未会計の会計ページ（タブ・ユーザー別一覧・bills一覧・営業日表示） |
| 変更 | `lib/Accounting/accountingPage.dart` | closeSnapshot.unresolved 除外、forUnsettledBillId/UserId 対応、会計完了時に finalize 呼び出し |
| 変更 | `lib/Home/terminalHomePage.dart` | 「未会計の会計」入口ボタン追加 |

---

## 3. バックエンド（Cloud Functions）

### 3.1 `getUnsettledBillsForClose.ts`（新規）

**役割**: 当日営業日で未会計の bills を取得し、表示用の `pokerName` / `displayAmount` / `createdAt` を server-side で算出して返す。取得のみで bills / activeStays の書き換えは行わない。

**主な仕様**:
- 認証必須。`devices` で `uid` 一致かつ `role == 'admin'` のときのみ実行可能。
- 営業日は `getCurrentBusinessDateKeyOrThrow()` で取得。
- `bills` は `businessDate == 当日` かつ `status in ['open','in_progress','settling']` で取得。
- `displayAmount` は `getBillPreviewTotals` と同様に extras / items / sideGameChips (action=='purchase') / tournaments の合計を算出。

**返却形式**:
```ts
{ success: true, data: [{ billId, pokerName, displayAmount, createdAt }] }
```
`createdAt` は ISO 文字列。

**具体コード（抜粋）**:

```typescript
// ファイル先頭〜インポート
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { getFirestore } from 'firebase-admin/firestore';
import { getCurrentBusinessDateKeyOrThrow } from '../helpers/stateDoc/getCurrentBusinessDateKeyOrThrow';

const SIDE_GAME_CHIP_EXCHANGE_RATE = 10.0;

/** 1 bill の表示用金額をサブコレクションから算出（getBillPreviewTotals と同様のロジック） */
async function computeDisplayAmount(
  db: ReturnType<typeof getFirestore>,
  billId: string
): Promise<number> {
  const billRef = db.collection('bills').doc(billId);
  const [extrasSnap, itemsSnap, sideGameChipsSnap, tournamentsSnap] = await Promise.all([
    billRef.collection('extras').get(),
    billRef.collection('items').get(),
    billRef.collection('sideGameChips').where('action', '==', 'purchase').get(),
    billRef.collection('tournaments').get(),
  ]);
  // extras: amountIncl 合計 / items: voided 除外し totalPriceIncl または unitPriceIncl*quantity
  // sideGameChips: amountIncl 合計 / tournaments: entryFee*entryCount + reentry + addon
  let extraCostMonetary = 0;
  // ... (略: 各サブコレクションを加算)
  return extraCostMonetary + itemsMonetary + sideGameChipMonetary + tournamentsMonetary;
}

export const getUnsettledBillsForClose = onCall(async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', '認証が必要です');
  const adminId = request.auth.uid;
  const db = getFirestore();
  const deviceQuery = await db.collection('devices')
    .where('uid', '==', adminId).where('role', '==', 'admin').limit(1).get();
  if (deviceQuery.empty) throw new HttpsError('permission-denied', '管理者権限がありません');

  const businessDate = await getCurrentBusinessDateKeyOrThrow();
  const billsSnap = await db.collection('bills')
    .where('businessDate', '==', businessDate)
    .where('status', 'in', ['open', 'in_progress', 'settling'])
    .get();

  const data = [];
  for (const doc of billsSnap.docs) {
    const d = doc.data();
    const billId = doc.id;
    const createdAtIso = d.createdAt?.toDate?.()?.toISOString?.() ?? '';
    const displayAmount = await computeDisplayAmount(db, billId);
    data.push({
      billId,
      pokerName: d.party?.pokerName ?? '',
      displayAmount,
      createdAt: createdAtIso,
      status: d.status,
      businessDate: d.businessDate,
    });
  }
  return { success: true, data };
});
```

---

### 3.2 `applyCloseSnapshot.ts`（新規）

**役割**: 指定された `billIds` に対して、bills に `closeSnapshot` を付与する。既に `closeSnapshot` が存在する場合はスキップ（`already_marked`）。部分成功を許容し、`updatedBillIds` / `skipped` / `updatedCount` を返す。

**主な仕様**:
- 認証必須。管理者（devices の role admin）のみ許可。
- 入力: `{ billIds: string[] }`（空配列は invalid-argument）。
- 営業日は `getCurrentBusinessDateKeyOrThrow()` で取得。
- 各 bill について:
  - 存在しなければ `not_found`
  - `businessDate` が当日でなければ `businessDate_mismatch`
  - `status` が open / in_progress / settling でなければ `status_mismatch`
  - 既に `closeSnapshot` があれば `already_marked` でスキップ（上書きしない）
- 更新内容: `closeSnapshot: { lastCloseRunId: 'step2-manual', markedAt, closedBusinessDate, unresolved: true }` と `updatedAt`。

**返却形式**:
```ts
{
  success: true,
  updatedBillIds: string[],
  skipped: Array<{ billId: string; reason: string }>,
  updatedCount: number
}
```

**具体コード（抜粋）**:

```typescript
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { getFirestore } from 'firebase-admin/firestore';
import * as admin from 'firebase-admin';
import { getCurrentBusinessDateKeyOrThrow } from '../helpers/stateDoc/getCurrentBusinessDateKeyOrThrow';

const ALLOWED_STATUSES = ['open', 'in_progress', 'settling'] as const;
const LAST_CLOSE_RUN_ID_STEP2 = 'step2-manual';

export const applyCloseSnapshot = onCall(async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', '認証が必要です');
  // 管理者チェック（devices.uid + role admin）
  const billIds = request.data?.billIds;
  if (!Array.isArray(billIds) || billIds.length === 0) {
    throw new HttpsError('invalid-argument', 'billIds は空でない配列である必要があります');
  }

  const closedBusinessDate = await getCurrentBusinessDateKeyOrThrow();
  const updatedBillIds: string[] = [];
  const skipped: Array<{ billId: string; reason: string }> = [];
  const now = admin.firestore.FieldValue.serverTimestamp();

  for (const billId of billIds) {
    if (typeof billId !== 'string' || !billId.trim()) {
      skipped.push({ billId: String(billId), reason: 'invalid_bill_id' });
      continue;
    }
    const billRef = db.collection('bills').doc(billId);
    let billSnap: admin.firestore.DocumentSnapshot;
    try { billSnap = await billRef.get(); } catch (e) {
      skipped.push({ billId, reason: 'not_found' }); continue;
    }
    if (!billSnap.exists) { skipped.push({ billId, reason: 'not_found' }); continue; }

    const billData = billSnap.data()!;
    const businessDate = billData.businessDate as string | undefined;
    const status = billData.status as string | undefined;
    const existingCloseSnapshot = billData.closeSnapshot;

    if (businessDate !== closedBusinessDate) {
      skipped.push({ billId, reason: 'businessDate_mismatch' }); continue;
    }
    if (!status || !ALLOWED_STATUSES.includes(status as any)) {
      skipped.push({ billId, reason: 'status_mismatch' }); continue;
    }
    if (existingCloseSnapshot && typeof existingCloseSnapshot === 'object') {
      skipped.push({ billId, reason: 'already_marked' }); continue;
    }

    try {
      await billRef.update({
        closeSnapshot: {
          lastCloseRunId: LAST_CLOSE_RUN_ID_STEP2,
          markedAt: now,
          closedBusinessDate,
          unresolved: true,
        },
        updatedAt: now,
      });
      updatedBillIds.push(billId);
    } catch (e) {
      skipped.push({ billId, reason: `update_failed: ${e instanceof Error ? e.message : String(e)}` });
    }
  }

  return { success: true, updatedBillIds, skipped, updatedCount: updatedBillIds.length };
});
```

---

### 3.3 `close_process/index.ts`（変更）

**変更内容**: 新規2 Callable の export を追加。

```typescript
export { resetAllTables } from './resetAllTables';
export { resetAllSideGames } from './resetAllSideGames';
export { cleanupActiveStaysOnClose } from './cleanupActiveStaysOnClose';
export { getUnsettledBillsForClose } from './getUnsettledBillsForClose';
export { applyCloseSnapshot } from './applyCloseSnapshot';
```

メインの `functions/src/index.ts` で `export * from "./close_process"` されているため、デプロイ時に `getUnsettledBillsForClose` と `applyCloseSnapshot` が Callable として登録される。

---

## 4. フロントエンド（Flutter: systemSettingsPage.dart）

### 4.1 追加・変更箇所一覧

| 箇所 | 内容 |
|------|------|
| import | `intl` の追加（入店日時フォーマット用） |
| UI | 「未会計billsの移管」Card の追加（閉店クリーンアップの次） |
| 注意事項 | 未会計billsの移管の説明1行を追加 |
| メソッド | `_openUnsettledBillsFlow` / `_showUnsettledBillsListDialog` / `_formatIsoToDisplay` / `_executeApplyCloseSnapshot` / `_showApplyCloseSnapshotResultDialog` を追加 |

---

### 4.2 import の追加

```dart
import 'package:intl/intl.dart';
```

---

### 4.3 「未会計billsの移管」カード（閉店クリーンアップの直下）

```dart
// 未会計billsの移管（Phase6 Step2）
Card(
  child: ListTile(
    leading: const Icon(Icons.receipt_long, color: Colors.brown),
    title: const Text('未会計billsの移管'),
    subtitle: const Text('当日営業日の未会計伝票に閉店時ラベル（closeSnapshot）を付与します'),
    trailing: _isProcessing
        ? const SizedBox(
            width: 20,
            height: 20,
            child: CircularProgressIndicator(strokeWidth: 2),
          )
        : const Icon(Icons.arrow_forward_ios),
    onTap: _isProcessing ? null : _openUnsettledBillsFlow,
  ),
),
```

---

### 4.4 注意事項テキストへの追記

```dart
'• 未会計billsの移管: 当日営業日の未会計伝票に閉店時ラベル（closeSnapshot）を付与\n'
```
（既存の「閉店クリーンアップ」の説明の直後に1行追加）

---

### 4.5 未会計bills取得〜一覧表示: `_openUnsettledBillsFlow`

- 認証チェック → 未ログインなら `_showErrorDialog` で終了。
- `_isProcessing = true` にし、ローディングダイアログ「未会計伝票を取得中...」を表示。
- `getUnsettledBillsForClose` を引数なしで呼び出し。
- 成功時: `result.data['data']` が空なら「未会計の伝票はありません」のみ表示（確定ボタンなし）。1件以上なら `_showUnsettledBillsListDialog(list)` で一覧表示。
- 失敗時: `result.data['error']` または catch で `_showErrorDialog`。UNAUTHENTICATED / PERMISSION_DENIED の場合は認証エラーメッセージ。
- `finally` で `_isProcessing = false`。

```dart
Future<void> _openUnsettledBillsFlow() async {
  final user = _auth.currentUser;
  if (user == null) {
    _showErrorDialog('認証が必要です。ログインしてから再度お試しください。');
    return;
  }
  setState(() => _isProcessing = true);
  showDialog(
    context: context,
    barrierDismissible: false,
    builder: (BuildContext context) => const AlertDialog(
      content: Row(
        children: [
          CircularProgressIndicator(),
          SizedBox(width: 16),
          Text('未会計伝票を取得中...'),
        ],
      ),
    ),
  );
  try {
    final callable = _functions.httpsCallable('getUnsettledBillsForClose');
    final result = await callable.call();
    if (!mounted) return;
    Navigator.of(context).pop(); // ローディングを閉じる
    if (result.data['success'] != true) {
      _showErrorDialog(result.data['error'] ?? '未会計伝票の取得に失敗しました');
      return;
    }
    final data = result.data['data'] as List<dynamic>? ?? [];
    if (data.isEmpty) {
      showDialog(
        context: context,
        builder: (BuildContext ctx) => AlertDialog(
          title: const Text('未会計billsの移管'),
          content: const Text('未会計の伝票はありません。'),
          actions: [
            TextButton(onPressed: () => Navigator.of(ctx).pop(), child: const Text('OK')),
          ],
        ),
      );
      return;
    }
    final list = data.map((e) => Map<String, dynamic>.from(e as Map)).toList();
    _showUnsettledBillsListDialog(list);
  } catch (e) {
    debugPrint('getUnsettledBillsForClose error: $e');
    if (mounted) Navigator.of(context).pop();
    if (e.toString().contains('UNAUTHENTICATED') || e.toString().contains('PERMISSION_DENIED')) {
      _showErrorDialog('認証エラー: ログインしてから再度お試しください。');
    } else {
      _showErrorDialog('未会計伝票の取得に失敗しました: $e');
    }
  } finally {
    if (mounted) setState(() => _isProcessing = false);
  }
}
```

---

### 4.6 一覧ダイアログ: `_showUnsettledBillsListDialog`

- タイトル「未会計billsの移管」。
- 本文: 「N件の未会計伝票があります。全件に閉店時ラベルを付与します。」＋ 各伝票1行（`pokerName` / 金額 / 入店日時）。金額は `displayAmount` を int/double に応じて `¥...` 表示。入店日時は `_formatIsoToDisplay(createdAt)` で `yyyy/MM/dd HH:mm` 形式。
- アクション: 「キャンセル」（ダイアログを閉じる）、「全件確定」（一覧の全 `billId` で `_executeApplyCloseSnapshot(billIds)` を呼び、ダイアログを閉じてから実行）。

```dart
void _showUnsettledBillsListDialog(List<Map<String, dynamic>> list) {
  showDialog(
    context: context,
    builder: (BuildContext ctx) {
      return AlertDialog(
        title: const Text('未会計billsの移管'),
        content: SizedBox(
          width: double.maxFinite,
          child: SingleChildScrollView(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text('${list.length}件の未会計伝票があります。全件に閉店時ラベルを付与します。', style: const TextStyle(fontSize: 12)),
                const SizedBox(height: 12),
                ...list.map((e) {
                  final createdAt = e['createdAt'] as String?;
                  final dispDate = createdAt != null && createdAt.isNotEmpty
                      ? _formatIsoToDisplay(createdAt)
                      : '—';
                  final amount = e['displayAmount'];
                  final amountStr = amount is int ? '¥$amount' : (amount is double ? '¥${amount.toStringAsFixed(0)}' : (amount?.toString() ?? '—'));
                  return Padding(
                    padding: const EdgeInsets.only(bottom: 8),
                    child: Text(
                      '${e['pokerName'] ?? '—'}  $amountStr  入店: $dispDate',
                      style: const TextStyle(fontSize: 13),
                    ),
                  );
                }),
              ],
            ),
          ),
        ),
        actions: [
          TextButton(onPressed: () => Navigator.of(ctx).pop(), child: const Text('キャンセル')),
          ElevatedButton(
            onPressed: () {
              final billIds = list.map((e) => e['billId'] as String?).whereType<String>().toList();
              Navigator.of(ctx).pop();
              _executeApplyCloseSnapshot(billIds);
            },
            style: ElevatedButton.styleFrom(backgroundColor: Colors.brown, foregroundColor: Colors.white),
            child: const Text('全件確定'),
          ),
        ],
      );
    },
  );
}
```

---

### 4.7 入店日時フォーマット: `_formatIsoToDisplay`

```dart
static String _formatIsoToDisplay(String iso) {
  try {
    final dt = DateTime.parse(iso);
    return DateFormat('yyyy/MM/dd HH:mm').format(dt);
  } catch (_) {
    return iso;
  }
}
```

---

### 4.8 closeSnapshot 付与実行: `_executeApplyCloseSnapshot`

- `billIds` が空なら何もしない。未ログインなら `_showErrorDialog` で終了。
- `_isProcessing = true`、ローディング「閉店時ラベルを付与中...」表示。
- `applyCloseSnapshot` を `{ billIds }` で呼び出し。
- 成功時: `updatedBillIds` と `skipped` をパースし、`_showApplyCloseSnapshotResultDialog(updatedBillIds, skipped)` を表示。
- 失敗時: `_showErrorDialog`。認証・権限エラー時は既存と同様のメッセージ。
- `finally` で `_isProcessing = false`。

```dart
Future<void> _executeApplyCloseSnapshot(List<String> billIds) async {
  if (billIds.isEmpty) return;
  final user = _auth.currentUser;
  if (user == null) {
    _showErrorDialog('認証が必要です。ログインしてから再度お試しください。');
    return;
  }
  setState(() => _isProcessing = true);
  showDialog(
    context: context,
    barrierDismissible: false,
    builder: (BuildContext context) => const AlertDialog(
      content: Row(
        children: [
          CircularProgressIndicator(),
          SizedBox(width: 16),
          Text('閉店時ラベルを付与中...'),
        ],
      ),
    ),
  );
  try {
    final callable = _functions.httpsCallable('applyCloseSnapshot');
    final result = await callable.call({'billIds': billIds});
    if (!mounted) return;
    Navigator.of(context).pop();
    if (result.data['success'] != true) {
      _showErrorDialog(result.data['error'] ?? '閉店時ラベルの付与に失敗しました');
      return;
    }
    final updatedBillIds = List<String>.from(result.data['updatedBillIds'] ?? []);
    final skippedRaw = result.data['skipped'] as List<dynamic>? ?? [];
    final skipped = skippedRaw.map((e) => Map<String, String>.from(e as Map)).toList();
    _showApplyCloseSnapshotResultDialog(updatedBillIds, skipped);
  } catch (e) {
    debugPrint('applyCloseSnapshot error: $e');
    if (mounted) Navigator.of(context).pop();
    if (e.toString().contains('UNAUTHENTICATED') || e.toString().contains('PERMISSION_DENIED')) {
      _showErrorDialog('認証エラー: ログインしてから再度お試しください。');
    } else {
      _showErrorDialog('閉店時ラベルの付与に失敗しました: $e');
    }
  } finally {
    if (mounted) setState(() => _isProcessing = false);
  }
}
```

---

### 4.9 結果ダイアログと再試行: `_showApplyCloseSnapshotResultDialog`

- タイトル「移管結果」。
- 本文: 「完了: N件」＋ スキップがある場合は「スキップ:」と各 `billId … reason` を表示。
- アクション: 「閉じる」は常に表示。`skipped` のうち `reason != 'already_marked'` のものがある場合のみ「再試行」を表示。再試行時はその billId のみを `_executeApplyCloseSnapshot(ids)` に渡す。

```dart
void _showApplyCloseSnapshotResultDialog(List<String> updatedBillIds, List<Map<String, String>> skipped) {
  final retryable = skipped.where((e) => e['reason'] != 'already_marked').toList();
  showDialog(
    context: context,
    builder: (BuildContext ctx) {
      return AlertDialog(
        title: const Text('移管結果'),
        content: SingleChildScrollView(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text('完了: ${updatedBillIds.length}件', style: const TextStyle(fontWeight: FontWeight.bold)),
              if (skipped.isNotEmpty) ...[
                const SizedBox(height: 8),
                const Text('スキップ:', style: TextStyle(fontWeight: FontWeight.bold)),
                ...skipped.map((e) => Padding(
                  padding: const EdgeInsets.only(left: 8, top: 4),
                  child: Text('${e['billId'] ?? '—'} … ${e['reason'] ?? '—'}', style: const TextStyle(fontSize: 12)),
                )),
              ],
            ],
          ),
        ),
        actions: [
          TextButton(onPressed: () => Navigator.of(ctx).pop(), child: const Text('閉じる')),
          if (retryable.isNotEmpty)
            ElevatedButton(
              onPressed: () {
                Navigator.of(ctx).pop();
                final ids = retryable.map((e) => e['billId'] ?? '').where((s) => s.isNotEmpty).toList();
                _executeApplyCloseSnapshot(ids);
              },
              style: ElevatedButton.styleFrom(backgroundColor: Colors.orange, foregroundColor: Colors.white),
              child: const Text('再試行'),
            ),
        ],
      );
    },
  );
}
```

---

## 5. API・データ形式の整理

| Callable | 入力 | 返却（success: true 時） |
|----------|------|---------------------------|
| `getUnsettledBillsForClose` | なし | `{ success: true, data: [{ billId, userId, pokerName, displayAmount, createdAt, ... }], returnedCount, truncated }` |
| `applyCloseSnapshot` | `{ billIds: string[] }` 必須、`{ amountsByBillId?: Record<string, number> }` 推奨（無いと missing_amount） | `{ success: true, updatedBillIds, skipped, updatedCount, usersIncremented?, usersUpdateFailed? }` |

**skipped の reason 一覧**: `not_found` / `businessDate_mismatch` / `status_mismatch` / `already_marked` / `invalid_closeSnapshot_shape` / `invalid_bill_id` / `txn_failed` / `missing_amount` / `missing_user_id`。UI では再試行対象は `txn_failed` のみ（データ不備・上書き不可は除外）。

---

## 6. 既存機能への配慮

- **既存 Card・処理**: 閉店クリーンアップ、settledBills移管、全テーブルリセット等は一切変更・削除していない。
- **共通状態**: `_isProcessing` と `_showErrorDialog` を流用しており、処理中は他操作を無効化し、認証・権限エラーは既存と同様に表示する。
- **closeSnapshot の意味**: 監査・運用用ラベルであり、`status` や appendItem / startAccounting 等の既存ガードには影響しない。既に closeSnapshot が付いている bill は `already_marked` でスキップし、上書きしない。

---

## 7. デプロイ・動作確認のポイント

- **Functions**: `firebase deploy --only functions` で `getUnsettledBillsForClose` と `applyCloseSnapshot` が Callable として公開される。
- **アプリ**: システム設定画面で「未会計billsの移管」カードが表示され、管理者でログインした端末からのみ取得・確定・再試行が行える。
- **0件**: 未会計が0件の場合は「未会計の伝票はありません」のみ表示され、確定ボタンは出さない。

---

## 8. 今回の修正（レビュー対応・堅牢化）

ChangeSpec とレビュー指摘に合わせて以下の修正を実施した。既存仕様（closeSnapshot は監査ラベル、status に影響しない）は維持している。

### CRITICAL

- **applyCloseSnapshot: db の利用**  
  `getFirestore()` で取得した `db` を一貫して使用（元から定義済みのため、requireAdmin 利用に合わせて明示的に維持）。
- **applyCloseSnapshot: 管理者チェック**  
  `devices` で `uid` 一致かつ `role == 'admin'` の 1 件検索を必須化。共通ヘルパー `requireAdmin(db, uid)` を新規追加（`close_process/requireAdmin.ts`）し、`getUnsettledBillsForClose` と `applyCloseSnapshot` の両方で利用して重複を排除。

### HARDEN（堅牢化）

- **HARDEN-A（Firestore 例外の区別）**  
  `get()` の例外を `not_found` と混同しないよう、トランザクション化に伴い廃止。トランザクション内の read 失敗は `txn_failed` として skipped に格納し、詳細はログのみ出力。
- **HARDEN-B（closeSnapshot 存在判定の強化）**  
  「既に付与済み」とするのは、`closeSnapshot.unresolved === true` または `closeSnapshot.lastCloseRunId` が string で存在する場合のみ。それ以外の object（例: `{}`）は `invalid_closeSnapshot_shape` でスキップし、上書きしない。再試行対象に含まれる。
- **HARDEN-C（レース耐性・transaction 化）**  
  bill ごとに `db.runTransaction` で read → 判定 → update を原子実行。同時実行での二重更新を防止。トランザクション失敗時は `txn_failed` で skipped、詳細はログのみ。
- **HARDEN-D（getUnsettledBillsForClose の並列化と上限）**  
  `computeDisplayAmount` を `Promise.all(docs.map(...))` で並列実行。返却件数上限を 100 件に設定し、超過分は切り捨て。レスポンスに `returnedCount` と `truncated` を追加（Flutter は無視しても動作）。
- **HARDEN-E（Flutter の例外分岐）**  
  `e.toString().contains('UNAUTHENTICATED')` に頼らず、`FirebaseFunctionsException` を先に catch し、`e.code == 'unauthenticated' || e.code == 'permission-denied'` で認証・権限エラーを判定。

### CLEANUP

- **未使用定数**  
  `getUnsettledBillsForClose.ts` の `SIDE_GAME_CHIP_EXCHANGE_RATE` を削除。
- **applyCloseSnapshot の失敗理由**  
  トランザクション失敗時はレスポンスに `reason: 'txn_failed'` のみ返し、詳細は `console.warn` でログ出力のみ。

### 互換性・挙動の変更

- **getUnsettledBillsForClose**  
  - 返却に `returnedCount` と `truncated` を追加。既存クライアントは `data` のみ参照すれば従来どおり動作。
  - 未会計が 100 件を超える場合は最大 100 件のみ返し、`truncated: true` となる。
- **applyCloseSnapshot**  
  - `skipped.reason` に `invalid_closeSnapshot_shape` と `txn_failed` を追加。`update_failed: ...` はトランザクション化に伴い `txn_failed` に統一。
  - 再試行対象は従来どおり「`already_marked` 以外」のため、上記 2 つも再試行可能。

### 変更ファイル一覧（今回の修正）

| ファイル | 内容 |
|----------|------|
| `functions/src/close_process/requireAdmin.ts` | 新規。管理者チェック共通化 |
| `functions/src/close_process/applyCloseSnapshot.ts` | requireAdmin 利用、transaction 化、closeSnapshot 妥当性判定、txn_failed |
| `functions/src/close_process/getUnsettledBillsForClose.ts` | requireAdmin 利用、並列化、上限 100 件、returnedCount/truncated、未使用定数削除 |
| `lib/Home/systemSettingsPage.dart` | FirebaseFunctionsException の code による認証・権限エラー分岐 |
| `docs/.../implementation_summary.md` | 本節および API まわりの記述更新 |

---

## 9. 追加仕様（displayAmountAtMark・users 集計）

既存仕様（closeSnapshot は監査ラベルで status 等に影響しない、既存 closeSnapshot は上書きしない）は変更していない。

- **getUnsettledBillsForClose の返却拡張**  
  各要素に `userId`（`bills.party.userId`、無い場合は `''`）を追加。
- **applyCloseSnapshot の入力拡張**  
  `amountsByBillId?: Record<string, number>` を追加。Flutter は取得一覧の displayAmount から構築して必ず渡す。無い/不正な bill は `missing_amount` でスキップ（致命エラーにはしない）。
- **closeSnapshot の拡張**  
  `displayAmountAtMark: number` を追加。値は `amountsByBillId[billId]` をそのまま使用（apply 側で再計算しない）。
- **users 集計**  
  closeSnapshot を新規付与できた bill について、`bill.party.userId` で `users/{userId}.unsettledBillsCount` を increment。同一 userId は件数で集約してから一括 update。userId が無い/空の bill は closeSnapshot 付与も行わず `missing_user_id` でスキップ。users の update 失敗時は `usersUpdateFailed: string[]` を返却（success は true のまま）。
- **skipped.reason の追加**  
  `missing_amount`（金額が無い/不正）、`missing_user_id`（party.userId が無い/空）。既存の already_marked / invalid_closeSnapshot_shape 等は維持。
- **Flutter**  
  一覧から `amountsByBillId` を組み立てて applyCloseSnapshot に渡す。結果ダイアログで missing_amount / missing_user_id を分かりやすく表示し、再試行対象からは除外（txn_failed のみ再試行）。`usersUpdateFailed` があれば「ユーザー集計更新に失敗した userId」を表示。

---

## 10. 未会計の会計フロー（Step2 完了に含まれる追加実装）

closeSnapshot 付与済み（未会計ラベル付き）の bills を、専用画面から会計し、会計完了後にラベルを解除するフローを実装している。

### 10.1 導線

1. **ターミナルホーム**（`lib/Home/terminalHomePage.dart`）に「未会計の会計」ボタンを追加。タップで `UnsettledAccountingPage` を開く。
2. **未会計の会計ページ**（`lib/Accounting/unsettledAccountingPage.dart`）:
   - **タブ1「日付ごと」**: Step3 以降で実装するため枠のみ（説明テキスト表示）。
   - **タブ2「ユーザー別」**: `users` を `unsettledBillsCount >= 1` で取得し、カードで pokerName と未会計件数を表示。タブラベルは白系（`labelColor: Colors.white`, `unselectedLabelColor: Colors.white70`）。
   - ユーザーをタップすると、そのユーザーの未会計 bills を Firestore から取得（`bills` で `party.userId` 一致かつ `status in ['open','settling']` かつ `closeSnapshot.unresolved == true`）。一覧の各カードには **pokerName** と **営業日（businessDate）** を表示する（請求書IDは表示しない。会計遷移・後処理のため billId は内部で保持）。
   - カードタップで `AccountingPage(forUnsettledBillId: billId, forUnsettledUserId: userId)` に遷移。
3. **会計ページ**（`lib/Accounting/accountingPage.dart`）:
   - 通常の会計管理一覧では、`closeSnapshot.unresolved === true` の bill は対象外とするフィルタを適用（未会計ラベル付きは「未会計の会計」からのみ扱う）。
   - `forUnsettledBillId` / `forUnsettledUserId` が渡されている場合は該当 bill の会計を行い、会計完了時に `finalizeUnsettledBillAfterAccounting` を呼び出す。
4. **finalizeUnsettledBillAfterAccounting**（`functions/src/close_process/finalizeUnsettledBillAfterAccounting.ts`）:
   - 入力: `{ billId: string }`。管理者（requireAdmin）必須。
   - 処理: `bills/{billId}.closeSnapshot.unresolved` を `false` に更新、`users/{userId}.unsettledBillsCount` を 1 減らす。
   - 会計完了後の後処理のみを行い、通常の completeAccountingV2 とは別に呼ばれる。

### 10.2 未会計の会計ページの表示仕様（確定）

- **タブ**: 「日付ごと」「ユーザー別」のラベル色は白（選択時 `Colors.white`、未選択時 `Colors.white70`）。
- **ユーザー別 → 未会計bills一覧**: 各カードの title に pokerName、subtitle に **営業日**（`businessDate` を `YYYY/MM/DD` 形式で表示。例: `2025-02-09` → `2025/02/09`）。請求書IDは表示しない（billId は遷移・finalize 用に保持）。

### 10.3 変更ファイル一覧（未会計の会計フロー）

| ファイル | 内容 |
|----------|------|
| `lib/Accounting/unsettledAccountingPage.dart` | 新規。タブ・ユーザー一覧・未会計bills一覧（営業日表示）・AccountingPage への遷移 |
| `lib/Accounting/accountingPage.dart` | 未会計対象の除外、forUnsettledBillId/UserId 受け取り、会計完了時に finalize 呼び出し |
| `lib/Home/terminalHomePage.dart` | 「未会計の会計」ボタンで UnsettledAccountingPage を開く |
| `functions/src/close_process/finalizeUnsettledBillAfterAccounting.ts` | 新規。会計完了後の closeSnapshot.unresolved → false、unsettledBillsCount デクリメント |
| `functions/src/close_process/index.ts` | finalizeUnsettledBillAfterAccounting の export 追加 |

以上が Phase6 Step2 の実装内容の具体コードを含めたまとめです。
