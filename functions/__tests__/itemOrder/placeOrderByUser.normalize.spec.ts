/**
 * placeOrderByUser 正規化ヘルパの単体テスト（Emulator 不要）
 */

import {
  buildOrderRequestFingerprint,
  normalizePlaceOrderByUserItems,
  validateClientNonce,
  MAX_ORDER_QUANTITY_PER_LINE,
} from '../../src/domains/itemOrder/helpers/normalizePlaceOrderByUserItems';

describe('normalizePlaceOrderByUserItems helpers', () => {
  it('validateClientNonce accepts flutter-like nonce', () => {
    expect(validateClientNonce('menu_1710000000000_food')).toBe('menu_1710000000000_food');
  });

  it('fingerprint is order-independent of input row order after normalize', () => {
    const a = normalizePlaceOrderByUserItems([
      { menuItemId: 'b', quantity: 1 },
      { menuItemId: 'a', quantity: 2 },
    ]);
    const b = normalizePlaceOrderByUserItems([
      { menuItemId: 'a', quantity: 2 },
      { menuItemId: 'b', quantity: 1 },
    ]);
    expect(buildOrderRequestFingerprint(a)).toBe(buildOrderRequestFingerprint(b));
  });

  it('rejects over max quantity', () => {
    expect(() =>
      normalizePlaceOrderByUserItems([
        { menuItemId: 'a', quantity: MAX_ORDER_QUANTITY_PER_LINE + 1 },
      ]),
    ).toThrow();
  });
});
