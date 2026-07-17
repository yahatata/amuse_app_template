/**
 * Phase 4-1: 入店・会計開始の移行済みガード
 */
import { HttpsError } from 'firebase-functions/v2/https';
import { getFirestore } from 'firebase-admin/firestore';
import { assertUserNotMigrated } from '../../src/domains/user/helpers/assertUserNotMigrated';
import { createBillWithActiveStay } from '../../src/domains/bills/repos/createBillWithActiveStay';

describe('Phase 4-1 migrated visit/accounting guards', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('assertUserNotMigrated', () => {
    it('allows line user and non-migrated store_managed', () => {
      expect(() => assertUserNotMigrated({userType: 'line'})).not.toThrow();
      expect(() =>
        assertUserNotMigrated({userType: 'store_managed', isMigrated: false})
      ).not.toThrow();
    });

    it('rejects store_managed with isMigrated true as USER_MIGRATED', () => {
      try {
        assertUserNotMigrated({userType: 'store_managed', isMigrated: true});
        fail('expected throw');
      } catch (e) {
        expect(e).toBeInstanceOf(HttpsError);
        expect((e as HttpsError).details).toEqual(
          expect.objectContaining({errorKey: 'USER_MIGRATED'})
        );
      }
    });
  });

  describe('createBillWithActiveStay', () => {
    it('rejects migrated store_managed user before creating bill', async () => {
      const db = getFirestore();
      jest.spyOn(db, 'collection').mockImplementation((name: string) => {
        if (name === 'users') {
          return {
            doc: () => ({
              get: async () => ({
                exists: true,
                data: () => ({
                  userType: 'store_managed',
                  isMigrated: true,
                }),
              }),
            }),
          } as any;
        }
        throw new Error(`unexpected collection before guard: ${name}`);
      });

      await expect(
        createBillWithActiveStay({
          billId: 'bill-1',
          userId: 'migrated-user-create-bill',
          idempotencyKey: 'idem-1',
        })
      ).rejects.toMatchObject({
        details: expect.objectContaining({errorKey: 'USER_MIGRATED'}),
      });
    });
  });
});
