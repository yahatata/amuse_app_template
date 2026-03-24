/**
 * payrollNotificationHelper / payrollNotificationTemplates の単体テスト
 *
 * 参照: 07_NOTIFICATION_SCHEDULER_SPEC §1-6, §3-4, §5-3
 */

import {
  expandTemplate,
  buildSchedulerIdempotencyKey,
  buildEventIdempotencyKey,
} from '../../src/domains/attendance/helpers/payrollNotificationHelper';
import { PAYROLL_NOTIFICATION_TEMPLATES } from '../../src/domains/attendance/helpers/payrollNotificationTemplates';

describe('payrollNotificationHelper', () => {
  describe('expandTemplate', () => {
    it('単一パラメータを置換する', () => {
      const result = expandTemplate('Hello {name}!', { name: 'World' });
      expect(result).toBe('Hello World!');
    });

    it('複数パラメータを置換する', () => {
      const result = expandTemplate(
        '{periodStart}〜{periodEnd} の給与計算が可能です。',
        { periodStart: '2026-02-26', periodEnd: '2026-03-25' }
      );
      expect(result).toBe('2026-02-26〜2026-03-25 の給与計算が可能です。');
    });

    it('同一パラメータが複数箇所に出現する場合', () => {
      const result = expandTemplate('{x} and {x}', { x: 'A' });
      expect(result).toBe('A and A');
    });

    it('未使用パラメータはそのまま残る', () => {
      const result = expandTemplate('{a} {b}', { a: 'OK' });
      expect(result).toBe('OK {b}');
    });
  });

  describe('buildSchedulerIdempotencyKey', () => {
    it('正しい冪等キーを生成する', () => {
      const key = buildSchedulerIdempotencyKey(
        'payroll_calc_remind',
        '2026-02-26_2026-03-25',
        '2026-04-01'
      );
      expect(key).toBe('payroll_calc_remind_2026-02-26_2026-03-25_2026-04-01');
    });
  });

  describe('buildEventIdempotencyKey', () => {
    it('runId ベースのキーを生成する', () => {
      const key = buildEventIdempotencyKey('payroll_run_completed', 'run123');
      expect(key).toBe('payroll_run_completed_run123');
    });

    it('attendanceId + timestamp ベースのキーを生成する', () => {
      const key = buildEventIdempotencyKey('payroll_attendance_corrected', 'att456_1711000000000');
      expect(key).toBe('payroll_attendance_corrected_att456_1711000000000');
    });
  });

  describe('PAYROLL_NOTIFICATION_TEMPLATES', () => {
    it('9種のテンプレートが定義されている', () => {
      expect(Object.keys(PAYROLL_NOTIFICATION_TEMPLATES)).toHaveLength(9);
    });

    it.each([
      'payroll_period_start',
      'payroll_calc_remind',
      'payroll_confirm_remind',
      'payroll_run_completed',
      'payroll_run_completed_with_errors',
      'payroll_run_failed',
      'payroll_payment_overdue',
      'payroll_hold_reminder',
      'payroll_attendance_corrected',
    ])('%s が存在し type/title/body を持つ', (key) => {
      const tmpl = PAYROLL_NOTIFICATION_TEMPLATES[key];
      expect(tmpl).toBeDefined();
      expect(tmpl.type).toBeTruthy();
      expect(tmpl.title).toBeTruthy();
      expect(tmpl.body).toBeTruthy();
    });

    it('payroll_period_start テンプレートのパラメータ展開', () => {
      const tmpl = PAYROLL_NOTIFICATION_TEMPLATES.payroll_period_start;
      const body = expandTemplate(tmpl.body, {
        periodStart: '2026-02-26',
        periodEnd: '2026-03-25',
      });
      expect(body).toContain('2026-02-26');
      expect(body).toContain('2026-03-25');
    });

    it('payroll_hold_reminder テンプレートのパラメータ展開', () => {
      const tmpl = PAYROLL_NOTIFICATION_TEMPLATES.payroll_hold_reminder;
      const body = expandTemplate(tmpl.body, { holdCount: '3' });
      expect(body).toContain('3');
    });
  });
});
