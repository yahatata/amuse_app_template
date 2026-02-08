/**
 * 開店認定処理（HTTP Functions）
 * 
 * 処理内容:
 * - 前回の閉店処理が正常に完了しているか確認（storeMetaのみで判定、ドキュメント走査なし）
 * - businessHoursMonthlyMap参照や「前営業日＝前日」計算は行わない
 * - lastClosedBusinessDateKey と intendedBusinessDateKey の厳密整合は Phase5 では要求しない
 * - 認定結果のstate docへの記録
 * 
 * 認定結果:
 * - ready_to_open: 開店条件を満たしている
 * - needs_manual_open: 手動開店が必要
 * - already_running: 既に営業中
 * - skipped: スキップ（許容範囲外など）
 */

import { onRequest } from 'firebase-functions/v2/https';
import { getFirestore } from 'firebase-admin/firestore';
import { Timestamp } from 'firebase-admin/firestore';

export const openAssessmentTask = onRequest(
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

      if (payload.action !== 'open_assessment') {
        res.status(400).json({ error: 'Invalid action' });
        return;
      }

      const db = getFirestore();
      const now = new Date();
      const jstNow = new Date(now.getTime() + 9 * 60 * 60 * 1000);  // UTC+9
      const serverNowJst = jstNow;

      // idempotencyKeyの生成
      const idempotencyKey = `open_assessment_${payload.intendedBusinessDateKey}_${payload.scheduledAt}`;

      // トランザクション内で認定処理を実行
      await db.runTransaction(async (transaction) => {
        const stateDocRef = db.collection('storeMeta').doc('currentBusinessDay');
        const stateDoc = await transaction.get(stateDocRef);

        if (!stateDoc.exists) {
          throw new Error('storeMeta/currentBusinessDay が見つかりません');
        }

        const stateData = stateDoc.data()!;
        const openAssessment = stateData.openAssessment as any;

        // 冪等性チェック
        if (openAssessment?.idempotencyKey === idempotencyKey) {
          console.log(`既に同じidempotencyKeyで更新済みです: ${idempotencyKey}`);
          return;  // no-op
        }

        // businessDateKeyの許容範囲検証
        const d = new Date(serverNowJst);
        d.setHours(0, 0, 0, 0);
        const todayKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
        const tomorrowKey = new Date(d);
        tomorrowKey.setDate(tomorrowKey.getDate() + 1);
        const tomorrowKeyStr = `${tomorrowKey.getFullYear()}-${String(tomorrowKey.getMonth() + 1).padStart(2, '0')}-${String(tomorrowKey.getDate()).padStart(2, '0')}`;

        if (payload.intendedBusinessDateKey !== todayKey && payload.intendedBusinessDateKey !== tomorrowKeyStr) {
          // 許容範囲外
          transaction.update(stateDocRef, {
            openAssessment: {
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
        const lastError = stateData.lastError as any;
        const manualOverride = stateData.manualOverride as any;

        // 既に営業中か確認
        if (status === 'running' && currentBusinessDateKey === payload.intendedBusinessDateKey) {
          transaction.update(stateDocRef, {
            openAssessment: {
              idempotencyKey,
              intendedBusinessDateKey: payload.intendedBusinessDateKey,
              decidedAt: Timestamp.now(),
              result: 'already_running',
              blockers: [],
              source: 'task',
              scheduledAt: payload.scheduledAt,
            },
          });
          return;
        }

        // 営業中に別日付の開店が走ることを防止
        if (status === 'running' && currentBusinessDateKey !== payload.intendedBusinessDateKey) {
          transaction.update(stateDocRef, {
            openAssessment: {
              idempotencyKey,
              intendedBusinessDateKey: payload.intendedBusinessDateKey,
              decidedAt: Timestamp.now(),
              result: 'skipped',
              blockers: ['already_running_different_date'],
              source: 'task',
              scheduledAt: payload.scheduledAt,
            },
          });
          return;
        }

        // 開店条件の確認（storeMetaのみで判定）
        // 注意: businessHoursMonthlyMap参照や「前営業日＝前日」計算は行わない
        // lastClosedBusinessDateKey と intendedBusinessDateKey の厳密整合は Phase5 では要求しない
        let result: string;
        const blockers: string[] = [];
        let lastSuppressedAt: Timestamp | undefined;
        let suppressedByOverride: boolean | undefined;

        if (status === 'closed' || status === 'error') {
          // 前回の閉店処理が正常に完了しているか確認（storeMetaのみで判定）
          if (status !== 'closed') {
            blockers.push('status_not_closed');
          }
          if (!lastClosedBusinessDateKey) {
            blockers.push('lastClosedBusinessDateKey_missing');
          }
          if (lastError !== null) {
            blockers.push('lastError_exists');
          }

          if (blockers.length === 0) {
            result = 'ready_to_open';
          } else {
            result = 'needs_manual_open';
          }
        } else {
          result = 'skipped';
        }

        // manualOverrideの確認
        if (
          manualOverride &&
          manualOverride.type === 'open_skip' &&
          manualOverride.intendedBusinessDateKey === payload.intendedBusinessDateKey &&
          manualOverride.overrideUntil.toMillis() >= now.getTime()
        ) {
          lastSuppressedAt = Timestamp.now();
          suppressedByOverride = true;
          // resultは維持（needs_manual_openのまま）
        }

        // 認定結果の更新
        transaction.update(stateDocRef, {
          openAssessment: {
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
      console.error('開店認定処理でエラーが発生しました:', error);
      res.status(500).json({ error: error.message });
    }
  }
);
