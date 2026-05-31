import * as admin from 'firebase-admin';

import { logOpsError, logOpsSuccess } from '../../../shared/logging/logOpsError';
import { DEFAULT_TAX_REPORTING_BEHAVIOR } from '../config/defaults';

if (!admin.apps.length) {
  admin.initializeApp();
}

const db = admin.firestore();

async function initReportingConfig() {
  try {
    const behaviorRef = db.collection('storeMeta').doc('taxReportingBehavior');
    const behaviorDoc = await behaviorRef.get();
    if (behaviorDoc.exists) {
      console.log('storeMeta/taxReportingBehavior already exists. Skipping.');
    } else {
      await behaviorRef.set({
        ...DEFAULT_TAX_REPORTING_BEHAVIOR,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      console.log('storeMeta/taxReportingBehavior created with defaults.');
    }

    const groupRef = db.collection('storeMeta').doc('reportingGroupConfig');
    const groupDoc = await groupRef.get();
    if (groupDoc.exists) {
      console.log('storeMeta/reportingGroupConfig already exists. Skipping.');
    } else {
      await groupRef.set({
        groups: [],
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      console.log('storeMeta/reportingGroupConfig created with empty groups.');
    }

    logOpsSuccess({
      message: 'initReportingConfig 成功',
      functionEntry: 'initReportingConfig',
      operation: 'initDocs',
      context: {
        taxReportingBehavior: behaviorDoc.exists ? 'skipped' : 'created',
        reportingGroupConfig: groupDoc.exists ? 'skipped' : 'created',
      },
    });

    console.log('initReportingConfig completed successfully.');
  } catch (error) {
    logOpsError({
      message: 'initReportingConfig failed',
      functionEntry: 'initReportingConfig',
      operation: 'initDocsMainCatch',
      cause: error,
    });
    process.exit(1);
  }
}

initReportingConfig()
  .then(() => {
    process.exit(0);
  })
  .catch((error) => {
    logOpsError({
      message: 'Script failed:',
      functionEntry: 'initReportingConfig',
      operation: 'scriptTopLevelCatch',
      cause: error,
    });
    process.exit(1);
  });
