import { getFirestore } from 'firebase-admin/firestore';

export interface LogEntry {
  entryId: string;
  appliedAt: Date;
  category: 'income' | 'expense' | 'purchase';
  amountDelta: number;
  reasonType: 'accounting' | 'tournamentId' | 'sideGame' | 'manual' | 'adjustment';
  actor?: string;
  isReversal?: boolean;
  reversesEntryId?: string;
}

/**
 * ユーザーのログサブコレクションにエントリを追加する
 * @param userId ユーザーID
 * @param logType ログタイプ（sideGameChipLogs のみ。通貨型は pointLogs を利用）
 * @param entry ログエントリ（entryIdは自動生成）
 */
export async function addLogEntry(
  userId: string,
  logType: 'sideGameChipLogs',
  entry: Omit<LogEntry, 'entryId'>
): Promise<void> {
  const db = getFirestore();
  const today = new Date().toISOString().split('T')[0];
  
  // 8文字の一意IDを生成（英数字）
  const entryId = Math.random().toString(36).substring(2, 10);
  
  const logEntry: LogEntry = {
    ...entry,
    entryId,
  };
  
  const logRef = db
    .collection('users')
    .doc(userId)
    .collection(logType)
    .doc(today);
  
  // ドキュメントが存在しない場合は作成、存在する場合は更新
  const logDoc = await logRef.get();
  
  if (!logDoc.exists) {
    await logRef.set({
      logs: {
        [entryId]: logEntry,
      },
      createdAt: new Date(),
      updatedAt: new Date(),
    });
  } else {
    await logRef.update({
      [`logs.${entryId}`]: logEntry,
      updatedAt: new Date(),
    });
  }
  
  console.log(`ログエントリ追加完了: ${logType}/${today}/${entryId}`);
}

/**
 * ユーザー作成時にログサブコレクションを初期化する
 * A-7: 通貨型は pointLogs（フラット）を利用するため pointALogs/pointBLogs は初期化しない。
 * sideGameChipLogs のみ従来どおり当日空ドキュメントを用意する（購入明細等のレガシー形式用）。
 */
export async function initializeUserLogs(userId: string): Promise<void> {
  const db = getFirestore();
  const today = new Date().toISOString().split('T')[0];
  const userRef = db.collection('users').doc(userId);

  const logRef = userRef.collection('sideGameChipLogs').doc(today);
  const logDoc = await logRef.get();

  if (!logDoc.exists) {
    await logRef.set({
      logs: {},
      createdAt: new Date(),
      updatedAt: new Date(),
    });
  }
}
