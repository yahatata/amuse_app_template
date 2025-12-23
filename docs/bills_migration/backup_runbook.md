# バックアップ手順書

_最終更新: 2025-11-10 (JST)_

## 0. 目的
- 移行開始前（Phase1開始前）に、旧コレクション（`todaysBills`, `settledBills`, `accountingHistory`）をエクスポートし、バックアップを取得する。
- 移行中・移行後のデータ不整合や削除時の復旧に備える。
- P2-03（退避）で使用するエクスポート手順の事前整備。

## 1. エクスポート対象コレクション

### 1.1 必須エクスポート対象
| コレクション名 | 説明 | 削除予定フェーズ |
| --- | --- | --- |
| `todaysBills` | 当日伝票データ（営業中） | Phase2（P2-04） |
| `settledBills` | 確定済み伝票データ | Phase2（P2-04） |
| `accountingHistory` | 会計履歴データ | Phase2（P2-04） |

### 1.2 参考エクスポート対象（任意）
- `analyticsMonthly`: 移行前後の整合性確認用（削除予定なし）
- `analyticsDaily`: 移行前後の整合性確認用（削除予定なし）

## 2. エクスポート方法

### 2.1 Firestore Export API（推奨）
- **方法**: `gcloud firestore export` コマンドまたは Firestore Admin API
- **形式**: Cloud Storage (GCS) へのエクスポート（JSON形式）
- **利点**: 
  - 全データを一括エクスポート可能
  - インデックス情報も含む
  - 自動的にGCSに保存される

#### 2.1.1 gcloud CLI での実行例
```bash
# プロジェクトIDを設定
export PROJECT_ID="amuse-app-template"

# GCSバケット名を設定（事前に作成が必要）
export BUCKET_NAME="gs://${PROJECT_ID}-firestore-backups"

# エクスポート実行（全コレクション）
gcloud firestore export ${BUCKET_NAME}/backup-$(date +%Y%m%d-%H%M%S) \
  --project=${PROJECT_ID}

# 特定コレクションのみエクスポート（コレクションID指定）
gcloud firestore export ${BUCKET_NAME}/backup-$(date +%Y%m%d-%H%M%S) \
  --collection-ids=todaysBills,settledBills,accountingHistory \
  --project=${PROJECT_ID}
```

#### 2.1.2 Firestore Admin API での実行例（Cloud Functions経由）
```typescript
import { getFirestore } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';

// エクスポート実行（callable function として実装可能）
export const exportFirestoreBackup = onCall(async (request, context) => {
  // 管理者権限チェック
  if (!context.auth || !isAdmin(context.auth.uid)) {
    throw new HttpsError('permission-denied', '管理者権限が必要です');
  }

  const db = getFirestore();
  const bucketName = 'amuse-app-template-firestore-backups';
  const outputUriPrefix = `gs://${bucketName}/backup-${Date.now()}`;

  // エクスポート実行
  const operation = await db.exportDocuments({
    outputUriPrefix,
    collectionIds: ['todaysBills', 'settledBills', 'accountingHistory'],
  });

  return {
    success: true,
    operationName: operation.name,
    outputUriPrefix,
  };
});
```

### 2.2 BigQuery へのエクスポート（分析用）
- **方法**: Firestore → BigQuery への自動エクスポート設定
- **用途**: 分析・集計・検証用
- **注意**: リアルタイム同期ではなく、定期エクスポート（日次推奨）

#### 2.2.1 BigQuery エクスポート設定
```bash
# BigQuery データセット作成
bq mk --dataset --location=asia-northeast1 ${PROJECT_ID}:firestore_backups

# Firestore → BigQuery エクスポート設定（Cloud Console から設定推奨）
# または gcloud コマンド:
gcloud firestore databases export-to-bigquery \
  --database="(default)" \
  --bigquery-dataset=firestore_backups \
  --collection-ids=todaysBills,settledBills,accountingHistory \
  --project=${PROJECT_ID}
```

## 3. 保存先と命名規則

### 3.1 GCS バケット構成
```
gs://{PROJECT_ID}-firestore-backups/
  ├── backup-{YYYYMMDD}-{HHMMSS}/          # フルエクスポート
  │   ├── all_namespaces/
  │   │   └── all_kinds/
  │   │       ├── all_namespaces_all_kinds.export_metadata
  │   │       └── output-{N}.avro
  │   └── firestore_export/
  └── backup-{YYYYMMDD}-{HHMMSS}-collections/  # 特定コレクションのみ
      └── (同上)
```

### 3.2 命名規則
- **フルエクスポート**: `backup-{YYYYMMDD}-{HHMMSS}`
- **コレクション指定**: `backup-{YYYYMMDD}-{HHMMSS}-collections`
- **移行前バックアップ**: `backup-pre-migration-{YYYYMMDD}-{HHMMSS}`

### 3.3 保存期間
- **移行前バックアップ**: 移行完了後30日間保持（最低限）
- **推奨**: 移行完了後90日間保持（P2-06 Analytics再計算検証完了まで）

## 4. 実行タイミング

### 4.1 移行開始前（P0-09完了時点）
- **必須**: Phase1開始の**直前**に実行
- **タイミング**: 営業終了後、新データ書き込み開始前
- **推奨時刻**: `STORE_CLOSE_HOUR:00 JST` 以降（営業終了確認後）

### 4.2 定期バックアップ（移行期間中）
- **頻度**: 週次（Phase1期間中）
- **目的**: デュアルライト中のデータ整合性確認用
- **実行**: 自動化（Cloud Scheduler）または手動

### 4.3 最終バックアップ（P2-03）
- **タイミング**: P2-02（読み取り停止確認）完了後、P2-04（削除）実行前
- **目的**: 削除前の最終バックアップ

## 5. 検証方法

### 5.1 エクスポート完了確認
```bash
# GCSバケット内のファイル確認
gsutil ls -l gs://${PROJECT_ID}-firestore-backups/backup-*/

# エクスポートメタデータ確認
gsutil cat gs://${PROJECT_ID}-firestore-backups/backup-*/all_namespaces/all_kinds/all_namespaces_all_kinds.export_metadata
```

### 5.2 データ整合性確認
- **ドキュメント数**: エクスポート前後のドキュメント数を比較
- **主要フィールド**: サンプルドキュメントの主要フィールドを確認
- **コレクション存在確認**: 対象コレクションが全てエクスポートされていることを確認

#### 5.2.1 検証スクリプト例
```typescript
// functions/src/scripts/verifyBackup.ts
import { getFirestore } from 'firebase-admin/firestore';

export async function verifyBackup(backupPath: string): Promise<{
  todaysBillsCount: number;
  settledBillsCount: number;
  accountingHistoryCount: number;
}> {
  const db = getFirestore();
  
  // エクスポート前のドキュメント数を取得
  const [todaysBills, settledBills, accountingHistory] = await Promise.all([
    db.collection('todaysBills').count().get(),
    db.collection('settledBills').count().get(),
    db.collection('accountingHistory').count().get(),
  ]);

  return {
    todaysBillsCount: todaysBills.data().count,
    settledBillsCount: settledBills.data().count,
    accountingHistoryCount: accountingHistory.data().count,
  };
}
```

## 6. 復旧手順（必要に応じて）

### 6.1 インポート方法
```bash
# GCSからFirestoreへインポート
gcloud firestore import gs://${PROJECT_ID}-firestore-backups/backup-{YYYYMMDD}-{HHMMSS} \
  --project=${PROJECT_ID}
```

### 6.2 注意事項
- **インポートは全データを上書き**: 既存データが削除されるため、実行前に確認必須
- **インデックス再作成**: インポート後、インデックスが自動的に再作成される
- **セキュリティルール**: インポート後、セキュリティルールを再確認

## 7. 自動化（オプション）

### 7.1 Cloud Scheduler での定期実行
```typescript
// functions/src/scripts/scheduledBackup.ts
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { getFirestore } from 'firebase-admin/firestore';

export const scheduledBackup = onSchedule(
  {
    schedule: '0 3 * * 0', // 毎週日曜 3:00 JST
    timeZone: 'Asia/Tokyo',
  },
  async (event) => {
    const db = getFirestore();
    const bucketName = 'amuse-app-template-firestore-backups';
    const outputUriPrefix = `gs://${bucketName}/backup-weekly-${Date.now()}`;

    const operation = await db.exportDocuments({
      outputUriPrefix,
      collectionIds: ['todaysBills', 'settledBills', 'accountingHistory'],
    });

    console.log('Scheduled backup started:', operation.name);
  }
);
```

### 7.2 実行前チェックリスト
- [ ] GCSバケットが作成済み
- [ ] バケットへの書き込み権限が設定済み
- [ ] エクスポート対象コレクションが正しく指定されている
- [ ] 保存先パスの命名規則に従っている
- [ ] エクスポート実行時刻が営業終了後であることを確認

## 8. トラブルシューティング

### 8.1 エクスポート失敗
- **原因**: 権限不足、バケット不存在、コレクション名誤り
- **対応**: Cloud Logging でエラーログを確認し、権限・設定を再確認

### 8.2 エクスポート時間が長い
- **原因**: データ量が多い、ネットワーク遅延
- **対応**: コレクション単位で分割エクスポート、または非同期実行

### 8.3 インポート時のエラー
- **原因**: スキーマ不一致、権限不足
- **対応**: エクスポートメタデータを確認し、Firestore Admin API の権限を確認

## 9. 関連ドキュメント
- `modification_plan.md`: P0-09（バックアップ手順整備）、P2-03（退避）、P2-04（削除）
- `risk_and_mitigation.md`: データ損失リスクと対策

## 10. 実装ファイル（将来）
- `functions/src/scripts/scheduledBackup.ts`: 定期バックアップ実行（オプション）
- `functions/src/scripts/verifyBackup.ts`: バックアップ検証（オプション）
- `functions/src/callables/exportFirestoreBackup.ts`: 手動エクスポート実行（オプション）

