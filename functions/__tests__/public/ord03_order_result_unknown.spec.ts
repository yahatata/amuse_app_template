/**
 * ORD-03 / CLN-R3: orderAllItems の result_unknown 安全契約（静的）
 * - loading/busy は finally で解除
 * - result_unknown で pendingOrder 保持・再タップ再送なし
 * - 失敗断定文言を使わない（文言本体は liff_errors.spec）
 */
// @ts-nocheck
const fs = require('fs');
const path = require('path');

const USER_HTML = fs.readFileSync(
  path.join(__dirname, '../../../public/user/index.html'),
  'utf8',
);

function sliceOrderAllItems() {
  const start = USER_HTML.indexOf('window.orderAllItems = async () =>');
  expect(start).toBeGreaterThanOrEqual(0);
  const end = USER_HTML.indexOf('function formatHistoryStatusLabel', start);
  expect(end).toBeGreaterThan(start);
  return USER_HTML.slice(start, end);
}

describe('ORD-03 orderAllItems result_unknown contracts', () => {
  let orderAllItems;

  beforeAll(() => {
    orderAllItems = sliceOrderAllItems();
  });

  it('uses placeOrderByUser + classifyPlaceOrderOutcome', () => {
    expect(orderAllItems).toContain("httpsCallable(functions, 'placeOrderByUser')");
    expect(orderAllItems).toContain('classifyPlaceOrderOutcome');
    expect(orderAllItems).toContain('expectedNonce: clientNonce');
  });

  it('result_unknown uses ORDER_RESULT_UNKNOWN (not failure assertion)', () => {
    expect(orderAllItems).toContain("pendingOrder.state = 'result_unknown'");
    expect(orderAllItems).toContain('LE.MESSAGES.ORDER_RESULT_UNKNOWN');
    expect(orderAllItems).toContain('// result_unknown:');
    expect(orderAllItems).not.toMatch(
      /pendingOrder\.state = 'result_unknown'[\s\S]{0,200}ORDER_FAIL/,
    );
  });

  it('finally clears submitting busy even on result_unknown', () => {
    const finallyAt = orderAllItems.indexOf('} finally {');
    expect(finallyAt).toBeGreaterThanOrEqual(0);
    const finallyBlock = orderAllItems.slice(finallyAt);
    expect(finallyBlock).toContain('isOrderSubmitting = false');
    expect(finallyBlock).toContain('setCartModalOrderBusy(false)');
    // result_unknown 分岐は finally より前（dialog 後に finally が走る）
    const unknownAt = orderAllItems.indexOf("pendingOrder.state = 'result_unknown'");
    expect(unknownAt).toBeGreaterThanOrEqual(0);
    expect(finallyAt).toBeGreaterThan(unknownAt);
  });

  it('result_unknown keeps lock: early return on re-entry + button stays disabled', () => {
    expect(orderAllItems).toContain("pendingOrder.state === 'result_unknown'");
    expect(orderAllItems).toContain('await window.AppDialogs.showAppAlert(LE.MESSAGES.ORDER_RESULT_UNKNOWN)');
    // 再入時はアラートして return（新しい placeOrderByUser を送らない）
    const earlyGuard = orderAllItems.indexOf(
      "if (pendingOrder && pendingOrder.state === 'result_unknown')",
    );
    expect(earlyGuard).toBeGreaterThanOrEqual(0);
    const earlyBlock = orderAllItems.slice(earlyGuard, earlyGuard + 250);
    expect(earlyBlock).toContain('return;');
    expect(earlyBlock).not.toContain('placeOrderByUser');

    const finallyBlock = orderAllItems.slice(orderAllItems.indexOf('} finally {'));
    expect(finallyBlock).toContain("pendingOrder.state === 'result_unknown'");
    expect(finallyBlock).toContain('orderBtn.disabled = true');
  });

  it('does not auto-retry placeOrderByUser after result_unknown', () => {
    // result_unknown 分岐内に placeOrderByUser 再呼び出しがない
    const unknownIdx = orderAllItems.indexOf("pendingOrder.state = 'result_unknown'");
    const finallyIdx = orderAllItems.indexOf('} finally {', unknownIdx);
    const unknownBranch = orderAllItems.slice(unknownIdx, finallyIdx);
    expect(unknownBranch).not.toContain('placeOrderByUser(');
    expect(unknownBranch).not.toContain('await placeOrderByUser');
  });
});
