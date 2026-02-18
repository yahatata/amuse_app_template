/**
 * Analytics Monthly 更新用共通関数
 * 
 * 1つの bill に対する analyticsMonthly 更新を原子的に実行する。
 * トランザクション内で marker チェック・作成、事前読み取り、更新を実施する。
 */

import * as admin from 'firebase-admin';
import { logger } from 'firebase-functions';
import { addToMonthlyIndex } from './addToMonthlyIndex';
import { addToDailySummary } from './addToDailySummary';
import { addToByCategory } from './addToByCategory';
import { addToByTemplateTournaments } from './addToByTemplateTournaments';
import { addToByUser } from './addToByUser';

/**
 * 1つの bill に対する analyticsMonthly 更新を原子的に実行
 * 
 * 処理内容:
 * 1. トランザクション内で marker をチェック（存在するなら no-op return）
 * 2. analyticsMonthly の必要参照を tx.get で事前読み取り
 * 3. 旧スキーマ更新: addToMonthlyIndex/addToDailySummary/addToByCategory/addToByTemplateTournaments/addToByUser を呼ぶ
 * 4. marker を作成（トランザクション内で必ず実施、tx.create を使用）
 * 
 * @param db Firestore インスタンス
 * @param params 更新パラメータ
 * @param params.month 月次キー（YYYY-MM 形式）
 * @param params.businessDate 営業日（YYYY-MM-DD 形式）
 * @param params.billId 伝票ID（bills コレクションのドキュメントID、docId）
 * @param params.billData bills 親ドキュメントのデータ（categoryBreakdown, paymentTotals, itemsSnapshot, tournamentsSnapshot, party 等を含む）
 * @returns Promise<void>
 */
export async function processBillAnalyticsAtomically(
  db: FirebaseFirestore.Firestore,
  params: {
    month: string;
    businessDate: string;
    billId: string;
    billData: any;
  }
): Promise<void> {
  const { month, businessDate, billId, billData } = params;

  // 参照を準備
  const monthlyRef = db.collection('analyticsMonthly').doc(month);
  const dailyRef = monthlyRef.collection('days').doc(businessDate);
  const byCategoryRef = monthlyRef.collection('byCategory').doc('summary');
  const markerRef = monthlyRef.collection('aggregationMarkers').doc(billId);

  const userId = billData.party?.userId;
  const byUserRef = userId ? monthlyRef.collection('byUser').doc(userId) : undefined;

  // トーナメントテンプレート用の参照を準備
  const tournamentsSnapshot = billData.tournamentsSnapshot || {};
  const templateKeys = Object.keys(tournamentsSnapshot).filter(key => {
    const tournamentData = tournamentsSnapshot[key];
    return tournamentData && typeof tournamentData === 'object';
  });
  const templateRefs = templateKeys.map(key => 
    monthlyRef.collection('byTemplateTournaments').doc(key)
  );

  // トランザクション開始
  await db.runTransaction(async (tx) => {
    // --- READ phase ---
    
    // 1. marker チェック（存在するなら早期 return）
    const markerDoc = await tx.get(markerRef);
    if (markerDoc.exists) {
      logger.info('processBillAnalyticsAtomically: marker already exists, skipping', {
        billId,
        month,
        businessDate,
        markerPath: markerRef.path,
      });
      return;  // 既に処理済み → no-op
    }

    logger.info('processBillAnalyticsAtomically: starting analytics update', {
      billId,
      month,
      businessDate,
    });

    // 2. analytics 関連ドキュメントを事前読み取り（read→write順を守る）
    const reads = [
      tx.get(monthlyRef),
      tx.get(dailyRef),
      tx.get(byCategoryRef),
      ...(byUserRef ? [tx.get(byUserRef)] : []),
      ...templateRefs.map(ref => tx.get(ref)),
    ];
    const results = await Promise.all(reads);

    const monthlyDoc = results[0];
    const dailyDoc = results[1];
    const byCategoryDoc = results[2];
    let idx = 3;
    const byUserDoc = byUserRef ? results[idx++] : undefined;
    const templateDocs = results.slice(idx);

    // --- WRITE phase ---
    
    // 3. 旧スキーマ更新（既存の addTo* 関数を使用）
    const monthlyIndexInfo = await addToMonthlyIndex(tx, month, billData, businessDate, monthlyDoc);
    const dailySummaryInfo = await addToDailySummary(tx, month, businessDate, billData, dailyDoc);
    const byCategoryInfo = await addToByCategory(tx, month, billData, byCategoryDoc);
    const byTemplateTournamentsInfos = await addToByTemplateTournaments(tx, month, businessDate, billData, templateDocs);
    const byUserInfo = byUserDoc ? await addToByUser(tx, month, businessDate, billData, byUserDoc) : null;

    // 4. marker 作成（トランザクション内で必ず実施、初回のみ作成を保証）
    // tx.create を使用する（既存ドキュメントが存在する場合にエラーになるため、「初回のみ作成」という意図を明確に表現）
    // 上記の tx.get(markerRef) で存在確認済みで、存在する場合は早期 return しているため、
    // この時点では marker が存在しないことが保証されているため、tx.create は必ず成功する
    tx.create(markerRef, {
      billId,
      businessDate,
      processedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    // 5. すべての更新内容を1つのログに集約
    const allUpdates: Record<string, any> = {
      [monthlyIndexInfo.collection]: {
        [monthlyIndexInfo.documentId]: {
          isNewDocument: monthlyIndexInfo.isNewDocument,
          updatedFields: monthlyIndexInfo.updatedFields,
        },
      },
      [`${dailySummaryInfo.collection}/${dailySummaryInfo.subcollection}`]: {
        [dailySummaryInfo.documentId]: {
          isNewDocument: dailySummaryInfo.isNewDocument,
          updatedFields: dailySummaryInfo.updatedFields,
        },
      },
      [`${byCategoryInfo.collection}/${byCategoryInfo.subcollection}`]: {
        [byCategoryInfo.documentId]: {
          isNewDocument: byCategoryInfo.isNewDocument,
          updatedFields: byCategoryInfo.updatedFields,
        },
      },
    };

    // byTemplateTournaments の更新内容を追加
    if (byTemplateTournamentsInfos.length > 0) {
      const tournamentsUpdates: Record<string, any> = {};
      byTemplateTournamentsInfos.forEach((info) => {
        tournamentsUpdates[info.documentId] = {
          templateKey: info.templateKey,
          templateName: info.templateName,
          isNewDocument: info.isNewDocument,
          updatedFields: info.updatedFields,
        };
      });
      allUpdates[`${byTemplateTournamentsInfos[0].collection}/${byTemplateTournamentsInfos[0].subcollection}`] = tournamentsUpdates;
    }

    // byUser の更新内容を追加
    if (byUserInfo) {
      allUpdates[`${byUserInfo.collection}/${byUserInfo.subcollection}`] = {
        [byUserInfo.documentId]: {
          userId: byUserInfo.userId,
          pokerName: byUserInfo.pokerName,
          isNewDocument: byUserInfo.isNewDocument,
          updatedFields: byUserInfo.updatedFields,
        },
      };
    }

    // marker の作成情報を追加
    allUpdates[`${monthlyIndexInfo.collection}/aggregationMarkers`] = {
      [billId]: {
        billId,
        businessDate,
        processedAt: 'serverTimestamp()',
      },
    };

    // 1つのログにすべての更新内容を出力
    logger.info('processBillAnalyticsAtomically: analyticsMonthly updates', {
      billId,
      month,
      businessDate,
      updates: allUpdates,
    });
  });

  logger.info('processBillAnalyticsAtomically: analytics update completed', {
    billId,
    month,
    businessDate,
  });
}
