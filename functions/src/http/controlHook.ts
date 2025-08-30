import { Request, Response } from 'express';
import { logger } from 'firebase-functions';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';

/**
 * Cloud Tasks からの HTTP リクエストを受け付けるエンドポイント
 * トーナメントの自動開始とレイトレジ締切を処理
 */
export const controlHook = async (req: Request, res: Response) => {
  try {
    // リクエストの検証
    if (req.method !== 'POST') {
      logger.warn('controlHook: Invalid method', { method: req.method });
      res.status(405).json({ error: 'Method not allowed' });
      return;
    }

    // Cloud Tasks からの認証トークンを検証（一時的に簡素化）
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      logger.warn('controlHook: Missing or invalid authorization header');
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    // 認証ヘッダーが存在することを確認（詳細な検証は後で実装）
    logger.info('controlHook: Received authenticated request', { 
      hasAuthHeader: !!authHeader,
      authHeaderLength: authHeader.length
    });

    const { action, tournamentId, rev } = req.body;

    // 必須パラメータの検証
    if (!action || !tournamentId || rev === undefined) {
      logger.warn('controlHook: Missing required parameters', { 
        action, 
        tournamentId,
        rev
      });
      res.status(400).json({ 
        error: 'Missing required parameters: action, tournamentId, rev' 
      });
      return;
    }

    // action の検証
    if (!['start', 'regist'].includes(action)) {
      logger.warn('controlHook: Invalid action', { action });
      res.status(400).json({ 
        error: 'Invalid action. Must be "start" or "regist"' 
      });
      return;
    }

    logger.info('controlHook: Processing task', { 
      action, 
      tournamentId,
      rev
    });

    const db = getFirestore();
    const now = Timestamp.now();

    // トランザクションで処理
    await db.runTransaction(async (transaction) => {
      const tournamentRef = db.collection('scheduledTournaments').doc(tournamentId);
      const runtimeRef = db.collection('scheduledTournaments').doc(tournamentId).collection('views').doc('runtime');

      // 現在の状態を取得
      const [tournamentDoc, runtimeDoc] = await Promise.all([
        transaction.get(tournamentRef),
        transaction.get(runtimeRef)
      ]);

      if (!tournamentDoc.exists || !runtimeDoc.exists) {
        throw new Error(`Tournament or runtime document not found: ${tournamentId}`);
      }

      const tournamentData = tournamentDoc.data()!;
      const runtimeData = runtimeDoc.data()!;

      if (action === 'start') {
        // Rev一致チェック
        const currentStartRev = runtimeData.startRev || 1;
        if (rev < currentStartRev) {
          logger.info('controlHook: Ignoring old start task', { 
            tournamentId, 
            taskRev: rev, 
            currentRev: currentStartRev 
          });
          return; // 古いタスクは無視
        }
        if (rev > currentStartRev) {
          logger.warn('controlHook: Unexpected future start task', { 
            tournamentId, 
            taskRev: rev, 
            currentRev: currentStartRev 
          });
          return; // 未来のタスクは警告して無視
        }

        // 開始処理：未開始の場合のみ実行
        if (tournamentData.status === 'scheduled' && !runtimeData.startedAt) {
          transaction.update(tournamentRef, {
            status: 'running',
            updatedAt: now
          });

          transaction.update(runtimeRef, {
            status: 'running',
            startedAt: now,
            updatedAt: now
          });

          logger.info('controlHook: Tournament started', { tournamentId });
        } else {
          logger.info('controlHook: Tournament already started or not scheduled', { 
            tournamentId, 
            currentStatus: tournamentData.status,
            hasStartedAt: !!runtimeData.startedAt
          });
        }
      } else if (action === 'regist') {
        // Rev一致チェック
        const currentRegistRev = runtimeData.registRev || 1;
        if (rev < currentRegistRev) {
          logger.info('controlHook: Ignoring old regist task', { 
            tournamentId, 
            taskRev: rev, 
            currentRev: currentRegistRev 
          });
          return; // 古いタスクは無視
        }
        if (rev > currentRegistRev) {
          logger.warn('controlHook: Unexpected future regist task', { 
            tournamentId, 
            taskRev: rev, 
            currentRev: currentRegistRev 
          });
          return; // 未来のタスクは警告して無視
        }

        // レジスト確定処理：未確定の場合のみ実行
        if (tournamentData.status === 'running' && !runtimeData.registAt) {
          transaction.update(tournamentRef, {
            status: 'registered',
            updatedAt: now
          });

          transaction.update(runtimeRef, {
            status: 'registered',
            registAt: now,
            updatedAt: now
          });

          logger.info('controlHook: Registration closed', { tournamentId });
        } else {
          logger.info('controlHook: Registration already closed or not running', { 
            tournamentId, 
            currentStatus: tournamentData.status,
            hasRegistAt: !!runtimeData.registAt
          });
        }
      }
    });

    res.status(200).json({ 
      success: true, 
      message: `Task ${action} processed for tournament ${tournamentId}`
    });

  } catch (error) {
    logger.error('controlHook: Error processing request', error);
    res.status(500).json({ 
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
};
