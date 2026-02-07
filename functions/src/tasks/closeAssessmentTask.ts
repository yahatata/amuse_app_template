/**
 * 閉店認定処理（HTTP Functions）
 * 
 * 処理内容:
 * - 閉店時間超過の確認
 * - ブロッカーの検出（activeStays where isActive == true limit 1で存在確認）
 * - 認定結果のstate docへの記録
 * 
 * 認定結果:
 * - needs_manual_close: 閉店時間超過、手動閉店が必要
 * - needs_manual_close_suppressed: manualOverrideにより抑制された
 * - already_closed: 既に閉店済み
 * - next_day_started: 次営業日が開始している
 * - skipped: スキップ（許容範囲外など）
 */

import { onRequest } from 'firebase-functions/v2/https';
import { getFirestore } from 'firebase-admin/firestore';
import { Timestamp } from 'firebase-admin/firestore';

export const closeAssessmentTask = onRequest(
  {
    region: 'us-central1',
  },
  async (req, res) => {
    try {
      const payload = req.body as {
        action: string;
        intendedBusinessDateKey: string;
        scheduledAt: string;
      };

      if (payload.action !== 'close_assessment') {
        res.status(400).json({ error: 'Invalid action' });
        return;
      }

      const db = getFirestore();
      const now = new Date();
      const jstNow = new Date(now.getTime() + 9 * 60 * 60 * 1000);  // UTC+9
      const serverNowJst = jstNow;

      // idempotencyKeyの生成
      const idempotencyKey = `close_assessment_${payload.intendedBusinessDateKey}_${payload.scheduledAt}`;

      // トランザクション内で認定処理を実行
      await db.runTransaction(async (transaction) => {
        const stateDocRef = db.collection('storeMeta').doc('currentBusinessDay');
        const stateDoc = await transaction.get(stateDocRef);

        if (!stateDoc.exists) {
          throw new Error('storeMeta/currentBusinessDay が見つかりません');
        }

        const stateData = stateDoc.data()!;
        const closeAssessment = stateData.closeAssessment as any;

        // 冪等性チェック
        if (closeAssessment?.idempotencyKey === idempotencyKey) {
          console.log(`既に同じidempotencyKeyで更新済みです: ${idempotencyKey}`);
          return;  // no-op
        }

        // businessDateKeyの許容範囲検証
        const d = new Date(serverNowJst);
        d.setHours(0, 0, 0, 0);
        const todayKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
        const yesterdayKey = new Date(d);
        yesterdayKey.setDate(yesterdayKey.getDate() - 1);
        const yesterdayKeyStr = `${yesterdayKey.getFullYear()}-${String(yesterdayKey.getMonth() + 1).padStart(2, '0')}-${String(yesterdayKey.getDate()).padStart(2, '0')}`;

        if (payload.intendedBusinessDateKey !== todayKey && payload.intendedBusinessDateKey !== yesterdayKeyStr) {
          // 許容範囲外
          transaction.update(stateDocRef, {
            closeAssessment: {
              idempotencyKey,
              intendedBusinessDateKey: payload.intendedBusinessDateKey,
              decidedAt: Timestamp.now(),
              result: 'skipped',
              blockers: ['date_out_of_range'],
              source: 'task',
              scheduledAt: payload.scheduledAt,
            },
          });
          return;
        }

        const status = stateData.status as string;
        const currentBusinessDateKey = stateData.currentBusinessDateKey as string | null;
        const lastClosedBusinessDateKey = stateData.lastClosedBusinessDateKey as string | null;
        const manualOverride = stateData.manualOverride as any;

        // 既に閉店済みか確認
        if (status === 'closed' && lastClosedBusinessDateKey === payload.intendedBusinessDateKey) {
          transaction.update(stateDocRef, {
            closeAssessment: {
              idempotencyKey,
              intendedBusinessDateKey: payload.intendedBusinessDateKey,
              decidedAt: Timestamp.now(),
              result: 'already_closed',
              blockers: [],
              source: 'task',
              scheduledAt: payload.scheduledAt,
            },
          });
          return;
        }

        // 次営業日が開始しているか確認
        if (status === 'running' && currentBusinessDateKey !== payload.intendedBusinessDateKey) {
          transaction.update(stateDocRef, {
            closeAssessment: {
              idempotencyKey,
              intendedBusinessDateKey: payload.intendedBusinessDateKey,
              decidedAt: Timestamp.now(),
              result: 'next_day_started',
              blockers: [],
              source: 'task',
              scheduledAt: payload.scheduledAt,
            },
          });
          return;
        }

        // manualOverrideの確認
        let result: string;
        let lastSuppressedAt: Timestamp | undefined;
        let suppressedByOverride: boolean | undefined;

        if (
          manualOverride &&
          manualOverride.type === 'close_skip' &&
          manualOverride.intendedBusinessDateKey === payload.intendedBusinessDateKey &&
          manualOverride.overrideUntil.toMillis() >= now.getTime()
        ) {
          result = 'needs_manual_close_suppressed';
          lastSuppressedAt = Timestamp.now();
          suppressedByOverride = true;
        } else if (status === 'running' && currentBusinessDateKey === payload.intendedBusinessDateKey) {
          result = 'needs_manual_close';
        } else {
          result = 'skipped';
        }

        // blockersの判定
        const blockers: string[] = [];
        if (result === 'needs_manual_close' || result === 'needs_manual_close_suppressed') {
          // activeStays where isActive == true limit 1 を取得し、存在すれば blockers に activeStaysNotEmpty を追加
          const activeStaysSnapshot = await db
            .collection('activeStays')
            .where('isActive', '==', true)
            .limit(1)
            .get();
          if (!activeStaysSnapshot.empty) {
            blockers.push('activeStaysNotEmpty');
          }
        }

        // 認定結果の更新
        transaction.update(stateDocRef, {
          closeAssessment: {
            idempotencyKey,
            intendedBusinessDateKey: payload.intendedBusinessDateKey,
            decidedAt: Timestamp.now(),
            result,
            blockers,
            source: 'task',
            scheduledAt: payload.scheduledAt,
            ...(lastSuppressedAt && { lastSuppressedAt }),
            ...(suppressedByOverride !== undefined && { suppressedByOverride }),
          },
        });
      });

      res.status(200).json({ success: true });
    } catch (error: any) {
      console.error('閉店認定処理でエラーが発生しました:', error);
      res.status(500).json({ error: error.message });
    }
  }
);
