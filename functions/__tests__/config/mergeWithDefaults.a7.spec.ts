import { mergeWithDefaults } from '../../src/shared/config/configLoader';
import { validatePointConfigFromStoreConfig } from '../../src/shared/config/validatePointConfig';
import { a7StoreConfigDocument } from '../helpers/a7StoreConfig';

describe('mergeWithDefaults A-7 fields', () => {
  it('pointSettings / balancePaymentSettings / categoryOrder を通過させる', () => {
    const merged = mergeWithDefaults(a7StoreConfigDocument());
    expect(merged.pointSettings?.pointA?.enabled).toBe(true);
    expect(merged.sideGameChipSettings?.enabled).toBe(true);
    expect(merged.billing?.paymentPolicy?.categoryOrder).toEqual([
      'extraCost',
      'sideGameChip',
      'tournaments',
      'items',
    ]);
    expect(
      merged.billing?.paymentPolicy?.balancePaymentSettings?.pointA?.usageUnit,
    ).toBe(1);
    expect(merged.tournament?.rankingRewardPointTypes).toEqual(['pointA']);

    const validated = validatePointConfigFromStoreConfig(merged);
    expect(validated.pointPriority).toContain('pointA');
  });
});
