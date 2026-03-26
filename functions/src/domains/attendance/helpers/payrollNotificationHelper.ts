/**
 * 通知作成ヘルパー
 *
 * 参照: 07_NOTIFICATION_SCHEDULER_SPEC §1-6, §3-4, §5-3
 */

import { FieldValue } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions';
import { logOpsError } from '../../../shared/logging/logOpsError';
import { PAYROLL_NOTIFICATION_TEMPLATES } from './payrollNotificationTemplates';

export interface CreateNotificationOptions {
  docId?: string;
  typeOverride?: string;
}

/**
 * テンプレートのパラメータを展開する（Firestore 非依存の純粋関数）
 */
export function expandTemplate(
  template: string,
  params: Record<string, string>
): string {
  let result = template;
  for (const [key, value] of Object.entries(params)) {
    result = result.replace(new RegExp(`\\{${key}\\}`, 'g'), value);
  }
  return result;
}

/**
 * スケジューラー経由の冪等キーを生成する
 */
export function buildSchedulerIdempotencyKey(
  triggerType: string,
  paymentPeriodKey: string,
  dateStr: string
): string {
  return `${triggerType}_${paymentPeriodKey}_${dateStr}`;
}

/**
 * イベント駆動の冪等キーを生成する
 */
export function buildEventIdempotencyKey(
  triggerType: string,
  identifier: string
): string {
  return `${triggerType}_${identifier}`;
}

/**
 * 通知ドキュメントを作成する
 */
export async function createPayrollNotification(
  db: FirebaseFirestore.Firestore,
  triggerType: string,
  params: Record<string, string>,
  options?: CreateNotificationOptions
): Promise<void> {
  const template = PAYROLL_NOTIFICATION_TEMPLATES[triggerType];
  if (!template) {
    logOpsError({
      message: 'createPayrollNotification: unknown triggerType',
      failureType: 'business',
      functionEntry: 'createPayrollNotification',
      context: { triggerType },
    });
    return;
  }

  const title = expandTemplate(template.title, params);
  const body = expandTemplate(template.body, params);
  const type = options?.typeOverride ?? template.type;

  const docData = {
    type,
    operationCategory: 'payroll',
    triggerType,
    title,
    body,
    isRead: false,
    isFlagged: false,
    createdAt: FieldValue.serverTimestamp(),
    targetDeviceIds: null,
  };

  const notificationsRef = db.collection('notifications');

  if (options?.docId) {
    await notificationsRef.doc(options.docId).set(docData);
  } else {
    await notificationsRef.add(docData);
  }

  logger.info('createPayrollNotification: created', { triggerType, docId: options?.docId ?? 'auto' });
}
