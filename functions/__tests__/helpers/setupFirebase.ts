/**
 * Jest グローバルセットアップ（setupFiles）
 *
 * 全テストスイートの前に実行:
 * - エミュレータホストのデフォルト設定
 * - Firebase Admin の事前初期化（callable を import する spec で、devicePermissions 等が
 *   モジュールロード時に getFirestore() を呼ぶため、import 前に app が必要）
 *
 * 各テストの beforeAll で projectId を変える場合は、既存 app を delete して再初期化する。
 */

import * as admin from 'firebase-admin';

if (!process.env.FIRESTORE_EMULATOR_HOST) {
  process.env.FIRESTORE_EMULATOR_HOST = 'localhost:8081';
}

if (!process.env.GCLOUD_PROJECT) {
  process.env.GCLOUD_PROJECT = 'test-default';
}

if (!admin.apps.length) {
  admin.initializeApp({ projectId: 'test-default' });
}
