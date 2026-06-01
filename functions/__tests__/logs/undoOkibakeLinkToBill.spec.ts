import {
  resolveBillLinkedUserIdFromLinkPayload,
} from '../../src/domains/logs/services/undoOkibakeLinkToBill';

describe('resolveBillLinkedUserIdFromLinkPayload', () => {
  it('payload.userId を優先する', () => {
    expect(
      resolveBillLinkedUserIdFromLinkPayload({
        userId: 'user-a',
        after: { linkedUserId: 'user-b' },
      }),
    ).toBe('user-a');
  });

  it('userId が無いとき after.linkedUserId を使う', () => {
    expect(
      resolveBillLinkedUserIdFromLinkPayload({
        after: { linkedUserId: 'user-b' },
      }),
    ).toBe('user-b');
  });
});
