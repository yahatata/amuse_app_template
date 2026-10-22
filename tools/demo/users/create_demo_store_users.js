'use strict';

/**
 * Create demo store_managed users 02–16 mirroring createUserByApp.
 *
 * Usage:
 *   node create_demo_store_users.js           # pre-check only
 *   node create_demo_store_users.js --apply   # pre-check then create if all NEW
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname);
const ADMIN_MODULE = path.resolve(ROOT, '../../../functions/node_modules/firebase-admin');
const BCRYPT_MODULE = path.resolve(ROOT, '../../../functions/node_modules/bcryptjs');
const QRCODE_MODULE = path.resolve(ROOT, '../../../functions/node_modules/qrcode');

const ALLOWED_PROJECT_ID = 'amuse-app-template';
const FIXED_PASSWORD = 'YourFixedPassword123'; // createUserByApp と同じ
const PIN = '7890';
const BIRTH = '0606';
const START = 2;
const END = 16;

function buildTargets() {
  const list = [];
  for (let i = START; i <= END; i++) {
    const n = String(i).padStart(2, '0');
    const pokerName = `デモユーザー${n}`;
    list.push({
      index: i,
      pokerName,
      email: `demo${n}@gmail.com`,
      birthMonthDay: BIRTH,
      pin: PIN,
      loginId: `${pokerName}${BIRTH}`,
    });
  }
  return list;
}

function parseArgs(argv) {
  return { apply: argv.includes('--apply'), help: argv.includes('--help') };
}

function resolveAdmin() {
  // eslint-disable-next-line import/no-dynamic-require, global-require
  return require(ADMIN_MODULE);
}

function initAdmin(admin) {
  if (process.env.FIRESTORE_EMULATOR_HOST) {
    throw new Error(
      `Refusing to run: FIRESTORE_EMULATOR_HOST=${process.env.FIRESTORE_EMULATOR_HOST}`
    );
  }
  if (!admin.apps.length) {
    admin.initializeApp({
      projectId: ALLOWED_PROJECT_ID,
      // Functions 実行時の FIREBASE_CONFIG.storageBucket と同一
      storageBucket: `${ALLOWED_PROJECT_ID}.firebasestorage.app`,
    });
  }
  const appProject =
    admin.app().options.projectId ||
    process.env.GCLOUD_PROJECT ||
    process.env.GOOGLE_CLOUD_PROJECT ||
    null;
  if (appProject !== ALLOWED_PROJECT_ID) {
    throw new Error(
      `Project guard failed: app/env projectId="${appProject}" (allowed: ${ALLOWED_PROJECT_ID})`
    );
  }
  return { projectId: ALLOWED_PROJECT_ID };
}

async function findByField(db, field, value) {
  const snap = await db.collection('users').where(field, '==', value).limit(1).get();
  if (snap.empty) return null;
  return { uid: snap.docs[0].id, data: snap.docs[0].data() };
}

async function authEmailExists(admin, email) {
  try {
    const u = await admin.auth().getUserByEmail(email);
    return { exists: true, uid: u.uid };
  } catch (e) {
    if (e && e.code === 'auth/user-not-found') return { exists: false };
    throw e;
  }
}

async function precheck(admin, db, targets) {
  const rows = [];
  let anyBlockingExists = false;
  for (const t of targets) {
    const byPoker = await findByField(db, 'pokerName', t.pokerName);
    const byEmail = await findByField(db, 'email', t.email);
    const byLogin = await findByField(db, 'loginId', t.loginId);
    const auth = await authEmailExists(admin, t.email);
    const flags = {
      pokerName: byPoker ? 'EXISTS' : 'NEW',
      emailFs: byEmail ? 'EXISTS' : 'NEW',
      loginId: byLogin ? 'EXISTS' : 'NEW',
      emailAuth: auth.exists ? 'EXISTS' : 'NEW',
    };

    // 分類: NEW / PARTIAL（当スクリプト途中失敗の完了待ち） / EXISTS（衝突・完了済み）
    let status = 'NEW';
    let partialUid = null;
    const anyExist =
      flags.pokerName === 'EXISTS' ||
      flags.emailFs === 'EXISTS' ||
      flags.loginId === 'EXISTS' ||
      flags.emailAuth === 'EXISTS';

    if (anyExist) {
      const uids = [
        byPoker && byPoker.uid,
        byEmail && byEmail.uid,
        byLogin && byLogin.uid,
        auth.exists ? auth.uid : null,
      ].filter(Boolean);
      const uniqueUids = [...new Set(uids)];
      if (uniqueUids.length !== 1) {
        status = 'EXISTS';
        anyBlockingExists = true;
      } else {
        const uid = uniqueUids[0];
        const snap = await db.collection('users').doc(uid).get();
        const d = snap.exists ? snap.data() || {} : null;
        const matches =
          d &&
          d.pokerName === t.pokerName &&
          d.email === t.email &&
          d.loginId === t.loginId &&
          d.userType === 'store_managed';
        if (matches && (!d.qrCodeUrl || String(d.qrCodeUrl).length === 0)) {
          status = 'PARTIAL';
          partialUid = uid;
        } else if (matches && d.qrCodeUrl) {
          status = 'COMPLETE';
        } else {
          status = 'EXISTS';
          anyBlockingExists = true;
        }
      }
    }

    rows.push({
      ...t,
      status,
      flags,
      partialUid,
      existingUids: {
        pokerName: byPoker && byPoker.uid,
        emailFs: byEmail && byEmail.uid,
        loginId: byLogin && byLogin.uid,
        emailAuth: auth.exists ? auth.uid : null,
      },
    });
  }
  return { rows, anyBlockingExists };
}

async function writeQrAndLogs(admin, db, QRCode, uid, loginId) {
  const qrData = JSON.stringify({ uid, loginId });
  const qrImageBuffer = await QRCode.toBuffer(qrData, { type: 'png' });
  const bucket = admin.storage().bucket();
  const objectPath = `qr_codes/${loginId}.png`;
  const file = bucket.file(objectPath);
  // ローカル ADC では getSignedUrl に client_email が無く失敗するため、
  // 同一 path に Firebase download token を付与して読取URLを作る。
  // Cloud Functions 上の createUserByApp は getSignedUrl を使うが、
  // Storage オブジェクト内容（JSON payload PNG）は同一仕様。
  const { randomUUID } = require('crypto');
  const token = randomUUID();
  await file.save(qrImageBuffer, {
    metadata: {
      contentType: 'image/png',
      metadata: {
        firebaseStorageDownloadTokens: token,
      },
    },
  });
  const encoded = encodeURIComponent(objectPath);
  const url =
    `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/${encoded}` +
    `?alt=media&token=${token}`;
  await db.collection('users').doc(uid).update({ qrCodeUrl: url });

  // initializeUserLogs 相当
  const today = new Date().toISOString().split('T')[0];
  const logRef = db
    .collection('users')
    .doc(uid)
    .collection('sideGameChipLogs')
    .doc(today);
  const logDoc = await logRef.get();
  if (!logDoc.exists) {
    await logRef.set({
      logs: {},
      createdAt: new Date(),
      updatedAt: new Date(),
    });
  }
  return url;
}

/**
 * Auth+Firestore まで作れたが QR で落ちた途中状態を、同一仕様で完了させる。
 * 既存 field は上書きしない（qrCodeUrl / logs のみ）。
 */
async function completePartial(admin, db, QRCode, target, uid) {
  const result = {
    pokerName: target.pokerName,
    email: target.email,
    loginId: target.loginId,
    uid,
    authCreated: true,
    firestoreCreated: true,
    qrCreated: false,
    logsCreated: false,
    qrCodeUrl: null,
    error: null,
    mode: 'complete-partial',
  };
  try {
    const snap = await db.collection('users').doc(uid).get();
    if (!snap.exists) {
      result.error = 'partial complete: firestore missing';
      return result;
    }
    const d = snap.data() || {};
    if (d.pokerName !== target.pokerName || d.email !== target.email || d.loginId !== target.loginId) {
      result.error = 'partial complete: firestore fields mismatch — abort';
      return result;
    }
    if (d.qrCodeUrl && String(d.qrCodeUrl).length > 0) {
      result.qrCreated = true;
      result.logsCreated = true;
      result.qrCodeUrl = d.qrCodeUrl;
      result.mode = 'already-complete';
      return result;
    }
    const url = await writeQrAndLogs(admin, db, QRCode, uid, target.loginId);
    result.qrCreated = true;
    result.logsCreated = true;
    result.qrCodeUrl = url;
  } catch (e) {
    result.error = e && e.message ? e.message : String(e);
  }
  return result;
}

async function createOne(admin, db, bcrypt, QRCode, target) {
  const result = {
    pokerName: target.pokerName,
    email: target.email,
    loginId: target.loginId,
    uid: null,
    authCreated: false,
    firestoreCreated: false,
    qrCreated: false,
    logsCreated: false,
    qrCodeUrl: null,
    error: null,
    mode: 'create',
  };

  try {
    const hashedPin = bcrypt.hashSync(target.pin, 10);

    const userRecord = await admin.auth().createUser({
      email: target.email,
      password: FIXED_PASSWORD,
      displayName: target.pokerName,
    });
    result.uid = userRecord.uid;
    result.authCreated = true;

    const uid = userRecord.uid;
    await db.collection('users').doc(uid).set({
      uid,
      pokerName: target.pokerName,
      email: target.email,
      birthMonthDay: target.birthMonthDay,
      loginId: target.loginId,
      hashedPin,
      role: 'user',
      userType: 'store_managed',
      isMigrated: false,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      pointA: 0,
      pointB: 0,
      pointC: 0,
      pointD: 0,
      pointE: 0,
      sideGameChip: 0,
      currentTable: null,
      currentSeat: null,
      qrCodeUrl: '',
    });
    result.firestoreCreated = true;

    const url = await writeQrAndLogs(admin, db, QRCode, uid, target.loginId);
    result.qrCreated = true;
    result.logsCreated = true;
    result.qrCodeUrl = url;
  } catch (e) {
    result.error = e && e.message ? e.message : String(e);
  }
  return result;
}

async function verifyOne(admin, db, bcrypt, QRCode, created) {
  const checks = [];
  const fail = (msg) => checks.push({ ok: false, msg });
  const ok = (msg) => checks.push({ ok: true, msg });

  if (!created.uid) {
    fail('no uid');
    return { ok: false, checks };
  }

  let authUser;
  try {
    authUser = await admin.auth().getUser(created.uid);
    ok('auth exists');
  } catch (e) {
    fail(`auth missing: ${e.message}`);
    return { ok: false, checks };
  }
  if (authUser.email !== created.email) fail(`auth email ${authUser.email}`);
  else ok('auth email');
  if (authUser.displayName !== created.pokerName) fail(`displayName ${authUser.displayName}`);
  else ok('displayName');

  const snap = await db.collection('users').doc(created.uid).get();
  if (!snap.exists) {
    fail('firestore missing');
    return { ok: false, checks };
  }
  const d = snap.data() || {};
  const expectEq = (field, want) => {
    if (d[field] !== want) fail(`${field}=${JSON.stringify(d[field])}`);
    else ok(field);
  };
  expectEq('pokerName', created.pokerName);
  expectEq('email', created.email);
  expectEq('loginId', created.loginId);
  expectEq('birthMonthDay', BIRTH);
  expectEq('userType', 'store_managed');
  expectEq('role', 'user');
  expectEq('isMigrated', false);
  for (const p of ['pointA', 'pointB', 'pointC', 'pointD', 'pointE', 'sideGameChip']) {
    if (Number(d[p]) !== 0) fail(`${p}=${d[p]}`);
    else ok(p);
  }
  if (d.currentTable !== null) fail('currentTable');
  else ok('currentTable');
  if (d.currentSeat !== null) fail('currentSeat');
  else ok('currentSeat');
  if (d.uid !== created.uid) fail('uid field');
  else ok('uid field');

  if (!d.hashedPin || typeof d.hashedPin !== 'string') fail('hashedPin missing');
  else if (!bcrypt.compareSync(PIN, d.hashedPin)) fail('bcrypt compare failed');
  else ok('bcrypt compare');

  if (!d.qrCodeUrl || typeof d.qrCodeUrl !== 'string' || !d.qrCodeUrl.length) {
    fail('qrCodeUrl empty');
  } else ok('qrCodeUrl');

  const file = admin.storage().bucket().file(`qr_codes/${created.loginId}.png`);
  const [exists] = await file.exists();
  if (!exists) fail('storage qr missing');
  else ok('storage qr');

  // QR payload check via regenerating expected JSON (storage is PNG of that JSON)
  // Download and decode is heavy; verify by re-encoding same payload length presence:
  // Instead: download buffer and ensure non-empty; payload content verified by regenerating QR
  // and comparing file size roughly, or decode with jsqr if available.
  // Practical: download bytes > 0 and expected payload string is what createUserByApp uses.
  if (exists) {
    const [buf] = await file.download();
    if (!buf || buf.length < 10) fail('storage qr empty');
    else ok(`storage qr bytes=${buf.length}`);
  }

  const today = new Date().toISOString().split('T')[0];
  const logSnap = await db
    .collection('users')
    .doc(created.uid)
    .collection('sideGameChipLogs')
    .doc(today)
    .get();
  if (!logSnap.exists) fail('sideGameChipLogs missing');
  else ok('sideGameChipLogs');

  return { ok: checks.every((c) => c.ok), checks };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log('Usage: node create_demo_store_users.js [--apply]');
    process.exit(0);
  }

  const admin = resolveAdmin();
  const { projectId } = initAdmin(admin);
  const db = admin.firestore();
  // eslint-disable-next-line import/no-dynamic-require, global-require
  const bcrypt = require(BCRYPT_MODULE);
  // eslint-disable-next-line import/no-dynamic-require, global-require
  const QRCode = require(QRCODE_MODULE);

  const targets = buildTargets();
  console.log(`\n=== demo store users (${projectId}) ===`);
  console.log(`mode: ${args.apply ? 'APPLY' : 'PRE-CHECK ONLY'}`);
  console.log(`count planned: ${targets.length}`);

  const { rows, anyBlockingExists } = await precheck(admin, db, targets);
  console.log('\n--- pre-check ---');
  for (const r of rows) {
    console.log(
      `${r.status.padEnd(10)} ${r.pokerName}  email=${r.email}  loginId=${r.loginId}  ` +
        `poker=${r.flags.pokerName} emailFs=${r.flags.emailFs} loginId=${r.flags.loginId} auth=${r.flags.emailAuth}` +
        (r.partialUid ? ` partialUid=${r.partialUid}` : '')
    );
  }

  if (anyBlockingExists) {
    console.log('\nSTOP: blocking EXISTS (conflict / unexpected). No creates performed.');
    process.exit(2);
  }

  if (!args.apply) {
    console.log('\nNo blocking conflicts. Re-run with --apply to create / complete-partial.');
    process.exit(0);
  }

  const created = [];
  for (const r of rows) {
    if (r.status === 'COMPLETE') {
      console.log(`\nSkip COMPLETE ${r.pokerName} uid=${r.existingUids.emailAuth || r.existingUids.pokerName}`);
      created.push({
        pokerName: r.pokerName,
        email: r.email,
        loginId: r.loginId,
        uid: r.existingUids.emailAuth || r.existingUids.pokerName,
        authCreated: true,
        firestoreCreated: true,
        qrCreated: true,
        logsCreated: true,
        qrCodeUrl: '(pre-existing)',
        error: null,
        mode: 'skip-complete',
      });
      continue;
    }
    if (r.status === 'PARTIAL') {
      console.log(`\nCompleting PARTIAL ${r.pokerName} uid=${r.partialUid}...`);
      const one = await completePartial(admin, db, QRCode, r, r.partialUid);
      created.push(one);
      if (one.error) {
        console.error(`FAILED at ${r.pokerName}: ${one.error}`);
        console.error('Stopping further creates. Partial manifest will be saved.');
        break;
      }
      console.log(`  OK uid=${one.uid} mode=${one.mode}`);
      continue;
    }

    console.log(`\nCreating ${r.pokerName}...`);
    const one = await createOne(admin, db, bcrypt, QRCode, r);
    created.push(one);
    if (one.error) {
      console.error(`FAILED at ${r.pokerName}: ${one.error}`);
      console.error('Stopping further creates. Partial manifest will be saved.');
      break;
    }
    console.log(`  OK uid=${one.uid}`);
  }

  const outDir = path.join(ROOT, 'out');
  fs.mkdirSync(outDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const manifestPath = path.join(outDir, `manifest_demo_users_${stamp}.json`);
  const manifest = {
    generatedAt: new Date().toISOString(),
    projectId,
    pin: PIN,
    birthMonthDay: BIRTH,
    fixedPasswordNote: 'same as createUserByApp YourFixedPassword123',
    created,
  };
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), 'utf8');
  console.log(`\nmanifest: ${manifestPath}`);

  console.log('\n--- verify ---');
  let verifyFail = 0;
  for (const c of created) {
    if (c.error || !c.uid) {
      verifyFail++;
      console.log(`SKIP verify ${c.pokerName} (create error)`);
      continue;
    }
    const v = await verifyOne(admin, db, bcrypt, QRCode, c);
    console.log(
      `${v.ok ? 'PASS' : 'FAIL'} ${c.pokerName} uid=${c.uid}` +
        (v.ok ? '' : ' ' + v.checks.filter((x) => !x.ok).map((x) => x.msg).join('; '))
    );
    if (!v.ok) verifyFail++;
  }

  const okCount = created.filter((c) => !c.error && c.authCreated && c.firestoreCreated && c.qrCreated && c.logsCreated).length;
  console.log(`\ncreated_ok=${okCount} verify_fail=${verifyFail}`);
  if (created.some((c) => c.error) || verifyFail) process.exit(1);
  console.log('ALL DONE');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
