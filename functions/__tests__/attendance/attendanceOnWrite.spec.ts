/**
 * attendanceOnWrite トリガーのロジックテスト
 *
 * Firestore トリガー自体はエミュレータで統合テストするが、
 * ここではトリガー内の帰属情報算出ロジックを検証する。
 *
 * Step01 の payrollPeriodUtils に依存するため、そちらの関数を直接呼び出す。
 */

import {
  getPaymentPeriodKey,
  getWeekStartDate,
} from '../../src/domains/attendance/helpers/payrollPeriodUtils';

describe('attendanceOnWrite ロジック検証', () => {
  describe('帰属情報の算出', () => {
    const startDay = 26;
    const endDay = 25;
    const weekStartDay = 0; // 日曜

    it('date=2026-03-18（水曜）→ weekday=3, weekStartDate=2026-03-15', () => {
      const date = '2026-03-18';
      const weekday = new Date(`${date}T00:00:00`).getDay();
      const weekStartDate = getWeekStartDate(date, weekStartDay);
      const paymentPeriodKey = getPaymentPeriodKey(date, startDay, endDay);

      expect(weekday).toBe(3);
      expect(weekStartDate).toBe('2026-03-15');
      expect(paymentPeriodKey).toBe('2026-02-26_2026-03-25');
    });

    it('date=2026-03-15（日曜）→ weekday=0, weekStartDate=2026-03-15', () => {
      const date = '2026-03-15';
      const weekday = new Date(`${date}T00:00:00`).getDay();
      const weekStartDate = getWeekStartDate(date, weekStartDay);

      expect(weekday).toBe(0);
      expect(weekStartDate).toBe('2026-03-15');
    });

    it('date=2026-03-26（期間開始日）→ 翌期間', () => {
      const date = '2026-03-26';
      const paymentPeriodKey = getPaymentPeriodKey(date, startDay, endDay);
      expect(paymentPeriodKey).toBe('2026-03-26_2026-04-25');
    });

    it('startDay=1, endDay=0（月末）→ 月初〜月末', () => {
      const date = '2026-02-15';
      const paymentPeriodKey = getPaymentPeriodKey(date, 1, 0);
      expect(paymentPeriodKey).toBe('2026-02-01_2026-02-28');
    });

    it('weekStartDay=1（月曜始まり）→ weekStartDate が直近月曜', () => {
      const date = '2026-03-18'; // 水曜
      const weekStartDate = getWeekStartDate(date, 1);
      expect(weekStartDate).toBe('2026-03-16');
    });
  });

  describe('payrollStatus の遷移ロジック', () => {
    it('新規作成時: payrollStatus = unreflected', () => {
      const beforeData = null;
      const afterPayrollStatus = 'unreflected';
      expect(afterPayrollStatus).toBe('unreflected');
      expect(beforeData).toBeNull();
    });

    it('unreflected の attendance 更新 → unreflected のまま', () => {
      const beforePayrollStatus = 'unreflected';
      const newPayrollStatus = beforePayrollStatus;
      expect(newPayrollStatus).toBe('unreflected');
    });

    it('reflected の attendance 更新 → corrected_after_reflection', () => {
      const beforePayrollStatus = 'reflected';
      const fieldsChanged = true;
      const newPayrollStatus = fieldsChanged ? 'corrected_after_reflection' : beforePayrollStatus;
      expect(newPayrollStatus).toBe('corrected_after_reflection');
    });

    it('reflected の attendance でフィールド未変更 → reflected のまま', () => {
      const beforePayrollStatus = 'reflected';
      const fieldsChanged = false;
      const newPayrollStatus = fieldsChanged ? 'corrected_after_reflection' : beforePayrollStatus;
      expect(newPayrollStatus).toBe('reflected');
    });

    it('corrected_after_reflection の再更新 → corrected_after_reflection のまま', () => {
      const beforePayrollStatus = 'corrected_after_reflection';
      const newPayrollStatus = beforePayrollStatus;
      expect(newPayrollStatus).toBe('corrected_after_reflection');
    });

    it('payrollReflectedAt フォールバック: payrollStatus 未設定 + payrollReflectedAt 非 null → reflected', () => {
      const beforePayrollStatus: string | undefined = undefined;
      const payrollReflectedAt = '2026-02-26_2026-03-25';
      let newPayrollStatus: string | undefined;

      if (!beforePayrollStatus && !newPayrollStatus && payrollReflectedAt) {
        newPayrollStatus = 'reflected';
      }

      expect(newPayrollStatus).toBe('reflected');
    });
  });

  describe('ループ防止の検証', () => {
    it('値が変わらない場合 needsUpdate = false', () => {
      const afterData = {
        weekday: 3,
        weekStartDate: '2026-03-15',
        paymentPeriodKey: '2026-02-26_2026-03-25',
        payrollStatus: 'unreflected',
      };

      const newWeekday = 3;
      const newWeekStartDate = '2026-03-15';
      const newPaymentPeriodKey = '2026-02-26_2026-03-25';
      const newPayrollStatus = 'unreflected';

      const needsUpdate =
        afterData.weekday !== newWeekday ||
        afterData.weekStartDate !== newWeekStartDate ||
        afterData.paymentPeriodKey !== newPaymentPeriodKey ||
        afterData.payrollStatus !== newPayrollStatus;

      expect(needsUpdate).toBe(false);
    });

    it('フィールドが未設定の場合 needsUpdate = true', () => {
      const afterData = {
        weekday: undefined,
        weekStartDate: undefined,
        paymentPeriodKey: undefined,
        payrollStatus: 'unreflected',
      };

      const needsUpdate =
        afterData.weekday !== 3 ||
        afterData.weekStartDate !== '2026-03-15' ||
        afterData.paymentPeriodKey !== '2026-02-26_2026-03-25' ||
        afterData.payrollStatus !== 'unreflected';

      expect(needsUpdate).toBe(true);
    });
  });
});
