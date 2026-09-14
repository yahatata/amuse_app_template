'use strict';

/**
 * One-shot: initial rehearsal cleanup for sales-demo apply test.
 * Project: amuse-app-template only.
 *
 * Usage:
 *   node tools/demo/rehearsal_cleanup_for_sales_demo.js
 *   node tools/demo/rehearsal_cleanup_for_sales_demo.js --apply
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname);
const REPO = path.resolve(ROOT, '../..');
const ADMIN_MODULE = path.resolve(REPO, 'functions/node_modules/firebase-admin');
const ALLOWED_PROJECT_ID = 'amuse-app-template';

const ST_ID = 'ZBJsZA8FyfiRkFWFlKlt';
const TEMPLATE_ID = '2K3tPF1eDABNyXpoGjXe';
const U286 = 'U286d9ad523afd49a7aa0490b4de534ee';
const U286_REHEARSAL_BILL = '89e802eb-6710-44b8-b210-2d1847e44d4e';
const BUSINESS_DATE = '2026-09-14';

const CHECKIN_MANIFEST = path.join(
  ROOT,
  'checkin/out/manifest_checkin_2026-09-14T02-44-53-244Z.json'
);
const ATTENDANCE_MANIFEST = path.join(
  ROOT,
  'attendance/out/manifest_staff_line_2026-09-14_2026-09-14T03-38-42-936Z.json'
);

function parseArgs(argv) {
  return { apply: argv.includes('--apply'), help: argv.includes('--help') };
}

function resolveAdmin() {
  // eslint-disable-next-line import/no-dynamic-require, global-require
  return require(ADMIN_MODULE);
}

function initAdmin(admin) {
  if (process.env.FIRESTORE_EMULATOR_HOST) {
    throw new Error(`Refusing: FIRESTORE_EMULATOR_HOST set`);
  }
  if (!admin.apps.length) {
    admin.initializeApp({ projectId: ALLOWED_PROJECT_ID });
  }
  const appProject =
    admin.app().options.projectId ||
    process.env.GCLOUD_PROJECT ||
    process.env.GOOGLE_CLOUD_PROJECT ||
    null;
  if (appProject !== ALLOWED_PROJECT_ID) {
    throw new Error(`Project guard failed: ${appProject}`);
  }
  process.env.GCLOUD_PROJECT = ALLOWED_PROJECT_ID;
  process.env.GOOGLE_CLOUD_PROJECT = ALLOWED_PROJECT_ID;
  return { projectId: ALLOWED_PROJECT_ID };
}

async function deleteDocTree(ref) {
  const cols = await ref.listCollections();
  for (const col of cols) {
    const snap = await col.get();
    for (const doc of snap.docs) {
      await deleteDocTree(doc.ref);
    }
  }
  await ref.delete();
}

async function emptyCollectionParent(ref) {
  const cols = await ref.listCollections();
  for (const col of cols) {
    const snap = await col.get();
    for (const doc of snap.docs) {
      await deleteDocTree(doc.ref);
    }
  }
  const parent = await ref.get();
  if (parent.exists) await ref.delete();
}

async function cancelCloudTask(taskName) {
  if (!taskName || typeof taskName !== 'string') return { skipped: true };
  if (!taskName.includes(`/${ST_ID}-`)) {
    return { skipped: true, reason: 'taskName not ST-scoped' };
  }
  try {
    // eslint-disable-next-line import/no-dynamic-require, global-require
    const { CloudTasksClient } = require(path.resolve(
      REPO,
      'functions/node_modules/@google-cloud/tasks'
    ));
    const client = new CloudTasksClient();
    await client.deleteTask({ name: taskName });
    return { deleted: true, taskName };
  } catch (e) {
    const msg = e && e.message ? e.message : String(e);
    // already gone is OK
    if (/NOT_FOUND|not found|5 NOT_FOUND/i.test(msg)) {
      return { deleted: false, alreadyGone: true, taskName, msg };
    }
    return { deleted: false, error: msg, taskName };
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(
      'Usage: node tools/demo/rehearsal_cleanup_for_sales_demo.js [--apply]'
    );
    process.exit(0);
  }

  const admin = resolveAdmin();
  const { projectId } = initAdmin(admin);
  const db = admin.firestore();
  const mode = args.apply ? 'APPLY' : 'DRY-RUN';
  console.log(`\n=== rehearsal cleanup (${projectId}) mode=${mode} ===`);

  const checkin = JSON.parse(fs.readFileSync(CHECKIN_MANIFEST, 'utf8'));
  const attendance = JSON.parse(fs.readFileSync(ATTENDANCE_MANIFEST, 'utf8'));
  if (checkin.projectId && checkin.projectId !== ALLOWED_PROJECT_ID) {
    throw new Error('checkin manifest project mismatch');
  }
  if (attendance.projectId && attendance.projectId !== ALLOWED_PROJECT_ID) {
    throw new Error('attendance manifest project mismatch');
  }

  // ---- validate targets ----
  const stRef = db.collection('scheduledTournaments').doc(ST_ID);
  const stSnap = await stRef.get();
  if (stSnap.exists) {
    const st = stSnap.data() || {};
    if (st.templateId !== TEMPLATE_ID) {
      throw new Error(
        `ST templateId mismatch: ${st.templateId} != ${TEMPLATE_ID}`
      );
    }
    if (st.businessDate !== BUSINESS_DATE) {
      throw new Error(`ST businessDate mismatch: ${st.businessDate}`);
    }
  }

  const tmpl = await db.collection('tournamentTemplates').doc(TEMPLATE_ID).get();
  if (!tmpl.exists) {
    throw new Error('template missing — abort (must remain)');
  }

  const u286BillRef = db.collection('bills').doc(U286_REHEARSAL_BILL);
  const u286Bill = await u286BillRef.get();
  if (u286Bill.exists) {
    const b = u286Bill.data() || {};
    if (b.party?.userId !== U286) {
      throw new Error('U286 bill party.userId mismatch — abort');
    }
    if (b.businessDate !== BUSINESS_DATE) {
      throw new Error('U286 bill businessDate mismatch — abort');
    }
  }

  // plan
  const plan = {
    stExists: stSnap.exists,
    checkinBills: checkin.created.map((c) => ({
      pokerName: c.pokerName,
      uid: c.uid,
      billId: c.billId,
    })),
    u286Bill: U286_REHEARSAL_BILL,
    attendanceDocs: attendance.created.map((c) => c.docId),
    analyticsMonth: '2026-09',
    tasks: [],
  };

  if (stSnap.exists) {
    const tasks = await stRef.collection('taskIndex').get();
    for (const t of tasks.docs) {
      plan.tasks.push({
        id: t.id,
        taskName: t.data()?.taskName || null,
        enqueueState: t.data()?.enqueueState || null,
      });
    }
  }

  console.log('\n--- plan ---');
  console.log(JSON.stringify(plan, null, 2));

  if (!args.apply) {
    console.log('\nDry-run only. Re-run with --apply to delete.');
    return;
  }

  // A-1 Cloud Tasks (ST-scoped only)
  console.log('\n[A-1] Cloud Tasks');
  for (const t of plan.tasks) {
    const r = await cancelCloudTask(t.taskName);
    console.log('  task', t.id, r);
  }

  // A-1 ST tree
  console.log('\n[A-1] scheduledTournament tree');
  if (stSnap.exists) {
    await deleteDocTree(stRef);
    console.log(`  deleted scheduledTournaments/${ST_ID}`);
  } else {
    console.log('  already missing');
  }
  const tmpl2 = await db.collection('tournamentTemplates').doc(TEMPLATE_ID).get();
  if (!tmpl2.exists) throw new Error('FATAL: template disappeared');
  console.log('  template retained OK');

  // A-2 demo users 02-16 bills + stays
  console.log('\n[A-2] demo users check-in bills');
  for (const row of plan.checkinBills) {
    const billRef = db.collection('bills').doc(row.billId);
    const billSnap = await billRef.get();
    if (billSnap.exists) {
      const b = billSnap.data() || {};
      if (b.party?.userId && b.party.userId !== row.uid) {
        throw new Error(
          `STOP: bill ${row.billId} party.userId=${b.party.userId} != ${row.uid}`
        );
      }
      await deleteDocTree(billRef);
      console.log(`  deleted bill ${row.pokerName} ${row.billId}`);
    } else {
      console.log(`  bill missing ${row.billId}`);
    }
    const stayRef = db.collection('activeStays').doc(row.uid);
    const staySnap = await stayRef.get();
    if (staySnap.exists) {
      const s = staySnap.data() || {};
      if (s.billId && s.billId !== row.billId) {
        throw new Error(
          `STOP: activeStay ${row.uid} billId=${s.billId} != manifest ${row.billId}`
        );
      }
      await stayRef.delete();
      console.log(`  deleted activeStay ${row.uid}`);
    }
    // todaysBills variants
    for (const id of [row.billId, `${BUSINESS_DATE}_${row.billId}`]) {
      const tb = db.collection('todaysBills').doc(id);
      if ((await tb.get()).exists) {
        await tb.delete();
        console.log(`  deleted todaysBills/${id}`);
      }
    }
  }

  // A-3 U286 rehearsal bill + stay
  console.log('\n[A-3] U286 rehearsal bill/stay');
  if ((await u286BillRef.get()).exists) {
    await deleteDocTree(u286BillRef);
    console.log(`  deleted bill ${U286_REHEARSAL_BILL}`);
  } else {
    console.log('  U286 rehearsal bill already missing');
  }
  const u286Stay = db.collection('activeStays').doc(U286);
  if ((await u286Stay.get()).exists) {
    const s = (await u286Stay.get()).data() || {};
    if (s.billId && s.billId !== U286_REHEARSAL_BILL) {
      throw new Error(
        `STOP: U286 activeStay billId=${s.billId} != expected rehearsal bill`
      );
    }
    await u286Stay.delete();
    console.log('  deleted U286 activeStay');
  }
  for (const id of [U286_REHEARSAL_BILL, `${BUSINESS_DATE}_${U286_REHEARSAL_BILL}`]) {
    const tb = db.collection('todaysBills').doc(id);
    if ((await tb.get()).exists) {
      await tb.delete();
      console.log(`  deleted todaysBills/${id}`);
    }
  }

  // A-4 attendance
  console.log('\n[A-4] attendance 3');
  for (const docId of plan.attendanceDocs) {
    const ref = db.collection('attendances').doc(docId);
    const snap = await ref.get();
    if (!snap.exists) {
      console.log(`  missing ${docId}`);
      continue;
    }
    const d = snap.data() || {};
    if (d.staffId !== U286) {
      throw new Error(`STOP: attendance ${docId} staffId=${d.staffId}`);
    }
    await ref.delete();
    console.log(`  deleted attendances/${docId}`);
  }

  // A-5 analytics month empty
  console.log('\n[A-5] analyticsMonthly/2026-09 full empty');
  const monthRef = db.doc('analyticsMonthly/2026-09');
  await emptyCollectionParent(monthRef);
  console.log('  emptied analyticsMonthly/2026-09');

  console.log('\nINITIAL CLEANUP APPLY DONE');
}

main().catch((e) => {
  console.error(e && e.stack ? e.stack : e);
  process.exit(1);
});
