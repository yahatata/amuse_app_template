/**
 * storeMeta/currentBusinessDay 初期ドキュメント作成スクリプト
 * 
 * 実行方法:
 *   npx ts-node src/scripts/createInitialStateDoc.ts
 *   または
 *   npx tsx src/scripts/createInitialStateDoc.ts
 * 
 * 前提条件:
 *   - Firebase Admin SDKの認証情報が設定されている（環境変数GOOGLE_APPLICATION_CREDENTIALSまたはデフォルト認証）
 *   - Firebase Admin SDKが初期化されている
 */

import * as admin from 'firebase-admin';
import { logOpsError } from "../../../shared/logging/logOpsError";

// Firebase Admin SDKの初期化
if (!admin.apps.length) {
  admin.initializeApp();
}

const db = admin.firestore();

async function createInitialStateDoc() {
  try {
    const docRef = db.collection('storeMeta').doc('currentBusinessDay');
    const doc = await docRef.get();

    if (doc.exists) {
      console.log('storeMeta/currentBusinessDay document already exists. Skipping creation.');
      return;
    }

    const initialState = {
      status: 'closed' as const,
      currentBusinessDateKey: null,
      lastClosedBusinessDateKey: null,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      source: 'initial',
      lastError: null,
    };

    await docRef.set(initialState);
    console.log('storeMeta/currentBusinessDay document created successfully.');
  } catch (error) {
    logOpsError({
      message: 'Failed to create initial state doc:',
      failureType: 'internal',
      functionEntry: 'unknown',
      cause: error,
    });
    process.exit(1);
  }
}

// スクリプト実行
createInitialStateDoc()
  .then(() => {
    console.log('Script completed successfully.');
    process.exit(0);
  })
  .catch((error) => {
    logOpsError({
      message: 'Script failed:',
      failureType: 'internal',
      functionEntry: 'unknown',
      cause: error,
    });
    process.exit(1);
  });
