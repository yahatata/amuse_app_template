import {
  validatePaymentStatusTransition,
  determineMonthlyPayrollStatus,
} from '../../src/domains/attendance/helpers/paymentStatusHelpers';

describe('paymentStatusHelpers', () => {
  // ─── validatePaymentStatusTransition ───

  describe('validatePaymentStatusTransition', () => {
    it('V-1: unpaid → paid は allowed', () => {
      const r = validatePaymentStatusTransition('unpaid', 'paid');
      expect(r.allowed).toBe(true);
      expect(r.skip).toBe(false);
    });

    it('V-2: unpaid → hold は allowed', () => {
      const r = validatePaymentStatusTransition('unpaid', 'hold');
      expect(r.allowed).toBe(true);
      expect(r.skip).toBe(false);
    });

    it('V-3: hold → paid は allowed', () => {
      const r = validatePaymentStatusTransition('hold', 'paid');
      expect(r.allowed).toBe(true);
      expect(r.skip).toBe(false);
    });

    it('V-4: paid → paid は reject (staff-already-paid)', () => {
      const r = validatePaymentStatusTransition('paid', 'paid');
      expect(r.allowed).toBe(false);
      expect(r.skip).toBe(false);
      expect(r.errorCode).toBe('staff-already-paid');
    });

    it('V-5: paid → hold は reject (staff-already-paid)', () => {
      const r = validatePaymentStatusTransition('paid', 'hold');
      expect(r.allowed).toBe(false);
      expect(r.skip).toBe(false);
      expect(r.errorCode).toBe('staff-already-paid');
    });

    it('V-6: hold → hold は skip', () => {
      const r = validatePaymentStatusTransition('hold', 'hold');
      expect(r.allowed).toBe(false);
      expect(r.skip).toBe(true);
      expect(r.errorCode).toBeUndefined();
    });
  });

  // ─── determineMonthlyPayrollStatus ───

  describe('determineMonthlyPayrollStatus', () => {
    it('D-1: unpaidCount=0, holdCount=0 → "paid"', () => {
      expect(determineMonthlyPayrollStatus(0, 0)).toBe('paid');
    });

    it('D-2: unpaidCount=0, holdCount=3 → "hold"', () => {
      expect(determineMonthlyPayrollStatus(0, 3)).toBe('hold');
    });

    it('D-3: unpaidCount=2, holdCount=0 → "confirmed"', () => {
      expect(determineMonthlyPayrollStatus(2, 0)).toBe('confirmed');
    });

    it('D-4: unpaidCount=1, holdCount=1 → "confirmed"', () => {
      expect(determineMonthlyPayrollStatus(1, 1)).toBe('confirmed');
    });
  });
});
