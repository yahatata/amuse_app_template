/**
 * A-6 向け: 既存 users に userType / isMigrated を一回限り補完するスクリプト。
 *
 * 通常アプリ・Functions・Rules からは参照しない。手動実行のみ。
 *
 * 補正ルール:
 * - docId === LINE_USER_DOC_ID → userType = "line"（isMigrated は付けない）
 * - それ以外 → userType = "store_managed"
 * - store_managed かつ isMigrated !== true → isMigrated = false
 *   （既に true の場合は変更しない）
 * - 上記以外のフィールドは一切触らない
 *
 * Dry Run（Firestore 更新なし）:
 *   cd functions && npx ts-node scripts/fixUserTypeForA6.ts
 *
 * 実更新:
 *   cd functions && npx ts-node scripts/fixUserTypeForA6.ts --apply
 *
 * 前提: project amuse-app-template 向けに Firebase Admin が初期化できること
 * （gcloud ADC / GOOGLE_APPLICATION_CREDENTIALS 等）
 */
import * as admin from 'firebase-admin';

const PROJECT_ID = 'amuse-app-template';
const LINE_USER_DOC_ID = 'Ubd1dbd818a35314555ae3e9a958f78d7';
const USER_TYPE_LINE = 'line';
const USER_TYPE_STORE_MANAGED = 'store_managed';

type PlannedUpdate = {
  docId: string;
  currentUserType: unknown;
  nextUserType: string | null;
  currentIsMigrated: unknown;
  nextIsMigrated: boolean | null;
  /** true = フィールド更新あり */
  willUpdate: boolean;
  skipReason?: string;
};

function formatValue(value: unknown): string {
  if (value === undefined) return '(unset)';
  if (value === null) return 'null';
  return JSON.stringify(value);
}

function planUpdate(docId: string, data: FirebaseFirestore.DocumentData): PlannedUpdate {
  const currentUserType = data.userType;
  const currentIsMigrated = data.isMigrated;

  const targetUserType =
    docId === LINE_USER_DOC_ID ? USER_TYPE_LINE : USER_TYPE_STORE_MANAGED;

  let nextUserType: string | null = null;
  if (currentUserType !== targetUserType) {
    nextUserType = targetUserType;
  }

  let nextIsMigrated: boolean | null = null;
  if (targetUserType === USER_TYPE_STORE_MANAGED) {
    // true は維持。欠落・非 boolean・false 以外の不正値は false に揃える。
    if (currentIsMigrated === true) {
      // no-op
    } else if (currentIsMigrated !== false) {
      nextIsMigrated = false;
    }
  }
  // line: isMigrated は追加しない（既存値があっても本スクリプトでは削除しない）

  const willUpdate = nextUserType !== null || nextIsMigrated !== null;
  return {
    docId,
    currentUserType,
    nextUserType,
    currentIsMigrated,
    nextIsMigrated,
    willUpdate,
    skipReason: willUpdate ? undefined : 'already compliant',
  };
}

function buildPatch(plan: PlannedUpdate): Record<string, unknown> | null {
  if (!plan.willUpdate) return null;
  const patch: Record<string, unknown> = {};
  if (plan.nextUserType !== null) {
    patch.userType = plan.nextUserType;
  }
  if (plan.nextIsMigrated !== null) {
    patch.isMigrated = plan.nextIsMigrated;
  }
  return patch;
}

async function main(): Promise<void> {
  const apply = process.argv.includes('--apply');
  const mode = apply ? 'APPLY' : 'DRY_RUN';

  if (admin.apps.length === 0) {
    admin.initializeApp({projectId: PROJECT_ID});
  }

  const db = admin.firestore();
  const snapshot = await db.collection('users').get();

  const plans: PlannedUpdate[] = snapshot.docs.map((doc) =>
    planUpdate(doc.id, doc.data()),
  );

  const toUpdate = plans.filter((p) => p.willUpdate);
  const unchanged = plans.filter((p) => !p.willUpdate);

  console.log(`=== fixUserTypeForA6 (${mode}) ===`);
  console.log(`projectId: ${PROJECT_ID}`);
  console.log(`users total: ${plans.length}`);
  console.log(`update targets: ${toUpdate.length}`);
  console.log(`unchanged: ${unchanged.length}`);
  console.log('');

  if (toUpdate.length === 0) {
    console.log('No documents need updates.');
  } else {
    console.log(
      [
        'docId',
        'currentUserType',
        'nextUserType',
        'currentIsMigrated',
        'nextIsMigrated',
      ].join('\t'),
    );
    for (const p of toUpdate) {
      console.log(
        [
          p.docId,
          formatValue(p.currentUserType),
          p.nextUserType === null ? '(no change)' : JSON.stringify(p.nextUserType),
          formatValue(p.currentIsMigrated),
          p.nextIsMigrated === null
            ? '(no change)'
            : JSON.stringify(p.nextIsMigrated),
        ].join('\t'),
      );
    }
  }

  let updatedUsers = 0;
  let setLine = 0;
  let setStoreManaged = 0;
  let setIsMigratedFalse = 0;
  let errors = 0;

  if (apply) {
    console.log('');
    console.log('Applying updates...');
    for (const doc of snapshot.docs) {
      const plan = planUpdate(doc.id, doc.data());
      const patch = buildPatch(plan);
      if (!patch) continue;
      try {
        await doc.ref.update(patch);
        updatedUsers += 1;
        if (plan.nextUserType === USER_TYPE_LINE) setLine += 1;
        if (plan.nextUserType === USER_TYPE_STORE_MANAGED) setStoreManaged += 1;
        if (plan.nextIsMigrated === false) setIsMigratedFalse += 1;
      } catch (error) {
        errors += 1;
        console.error(`ERROR updating ${doc.id}:`, error);
      }
    }
  } else {
    for (const p of toUpdate) {
      if (p.nextUserType === USER_TYPE_LINE) setLine += 1;
      if (p.nextUserType === USER_TYPE_STORE_MANAGED) setStoreManaged += 1;
      if (p.nextIsMigrated === false) setIsMigratedFalse += 1;
    }
    console.log('');
    console.log('Dry run only. Re-run with --apply to write.');
  }

  console.log('');
  console.log('=== summary ===');
  console.log(`mode: ${mode}`);
  console.log(`users scanned: ${plans.length}`);
  console.log(
    apply
      ? `updated users: ${updatedUsers}`
      : `would update users: ${toUpdate.length}`,
  );
  console.log(
    `${apply ? 'set' : 'would set'} userType=line: ${setLine}`,
  );
  console.log(
    `${apply ? 'set' : 'would set'} userType=store_managed: ${setStoreManaged}`,
  );
  console.log(
    `${apply ? 'set' : 'would set'} isMigrated=false: ${setIsMigratedFalse}`,
  );
  console.log(`unchanged: ${unchanged.length}`);
  console.log(`errors: ${errors}`);
}

main().catch((error) => {
  console.error('fixUserTypeForA6 failed:', error);
  process.exit(1);
});
