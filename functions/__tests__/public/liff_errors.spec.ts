/**
 * Phase L1: public/js/liff_errors.js 共通エラー基盤
 * raw / token をテスト出力へ出さないこと。
 */
const LiffErrors = require('../../../public/js/liff_errors.js');

const {
  MESSAGES,
  createStageError,
  resolveUserFacingError,
  mapCallableError,
  mapSoftFailResponse,
  mapLiffInitError,
  mapAuthError,
  isCallableSuccessResponse,
  getCallableFailureInfo,
  isFirebaseCustomTokenShape,
} = LiffErrors;

function assertNoSecret(resolved: { message: string }, secrets: string[]) {
  for (const secret of secrets) {
    expect(resolved.message).not.toContain(secret);
    expect(JSON.stringify(resolved)).not.toContain(secret);
  }
}

describe('liff_errors (Phase L1)', () => {
  describe('raw遮断', () => {
    it('Error message / stack / details を表示モデルへ含めない', () => {
      const error = new Error('secret-token');
      (error as any).stack = 'secret-stack';
      (error as any).details = { uid: 'secret-uid' };
      (error as any).message = 'secret-message';

      const resolved = resolveUserFacingError({ error });
      assertNoSecret(resolved, [
        'secret-token',
        'secret-stack',
        'secret-uid',
        'secret-message',
      ]);
      expect(resolved).not.toHaveProperty('stack');
      expect(resolved).not.toHaveProperty('details');
      expect(resolved).not.toHaveProperty('error');
    });

    it('各 LIFF/Auth stage で raw が混入しない', () => {
      const stages = [
        'liff.sdk_missing',
        'liff.init',
        'auth.id_token',
        'auth.custom_token',
        'auth.custom_token_malformed',
        'auth.signin',
        'auth.timeout',
        'auth.no_user',
        'staff.login_race',
        'staff.reg_check',
      ];
      for (const stage of stages) {
        const cause = new Error('secret-cause-' + stage);
        (cause as any).stack = 'secret-stack-' + stage;
        const resolved = resolveUserFacingError({
          error: createStageError(stage, cause),
        });
        assertNoSecret(resolved, [
          'secret-cause-' + stage,
          'secret-stack-' + stage,
        ]);
        expect(resolved.message.length).toBeGreaterThan(0);
      }
    });
  });

  describe('success判定', () => {
    it('success === true のみ成功', () => {
      expect(isCallableSuccessResponse({ success: true })).toBe(true);
      expect(isCallableSuccessResponse({ success: false })).toBe(false);
      expect(isCallableSuccessResponse({})).toBe(false);
      expect(isCallableSuccessResponse({ success: 'true' })).toBe(false);
      expect(isCallableSuccessResponse({ success: 1 })).toBe(false);
      expect(isCallableSuccessResponse(null)).toBe(false);
      expect(isCallableSuccessResponse('ok')).toBe(false);
    });

    it('getCallableFailureInfo が soft-fail / malformed を区別', () => {
      expect(getCallableFailureInfo({ success: false, errorKey: 'X' }).kind).toBe(
        'soft-fail'
      );
      expect(getCallableFailureInfo({}).kind).toBe('malformed');
      expect(getCallableFailureInfo(null).kind).toBe('malformed');
      expect(getCallableFailureInfo({ success: 'true' }).kind).toBe('malformed');
      expect(getCallableFailureInfo({ success: true }).kind).toBe('success');
    });

    it('mapSoftFailResponse が data.message を表示に使わない', () => {
      const resolved = mapSoftFailResponse({
        success: false,
        message: 'secret-backend-message',
        error: 'secret-backend-error',
      });
      assertNoSecret(resolved, ['secret-backend-message', 'secret-backend-error']);
    });
  });

  describe('custom token shape', () => {
    it('非空 string の firebaseToken のみ成功', () => {
      expect(isFirebaseCustomTokenShape({ firebaseToken: 'token' })).toBe(true);
      expect(isFirebaseCustomTokenShape({ firebaseToken: '' })).toBe(false);
      expect(isFirebaseCustomTokenShape({ firebaseToken: '   ' })).toBe(false);
      expect(isFirebaseCustomTokenShape({})).toBe(false);
      expect(isFirebaseCustomTokenShape({ firebaseToken: 123 })).toBe(false);
      expect(isFirebaseCustomTokenShape(null)).toBe(false);
    });
  });

  describe('解決順', () => {
    it('errorKey が code より優先', () => {
      const resolved = resolveUserFacingError({
        errorKey: 'USER_AUTH_CUSTOM_TOKEN_FAILED',
        code: 'unavailable',
      });
      expect(resolved.message).toBe(MESSAGES.AUTH_CUSTOM_TOKEN);
    });

    it('code が operation より優先', () => {
      const resolved = resolveUserFacingError({
        code: 'unavailable',
        operation: 'liff_init',
      });
      expect(resolved.message).toBe(MESSAGES.NETWORK);
    });

    it('operation が最終共通より優先', () => {
      const resolved = resolveUserFacingError({ operation: 'liff_init' });
      expect(resolved.message).toBe(MESSAGES.LIFF_INIT);
    });

    it('該当なしは最終共通', () => {
      const resolved = resolveUserFacingError({});
      expect(resolved.message).toBe(MESSAGES.PROCESS);
    });

    it('operation+errorKey が errorKey 単独より優先（同一キーでも compound を評価）', () => {
      const resolved = resolveUserFacingError({
        operation: 'auth',
        errorKey: 'USER_AUTH_CUSTOM_TOKEN_FAILED',
        code: 'permission-denied',
      });
      expect(resolved.message).toBe(MESSAGES.AUTH_CUSTOM_TOKEN);
      expect(resolved.message).not.toBe(MESSAGES.PERMISSION);
    });

    it('code が stage より優先: auth.signin + unavailable → 通信', () => {
      const cause = Object.assign(new Error('wrapped'), { code: 'unavailable' });
      const resolved = resolveUserFacingError({
        error: createStageError('auth.signin', cause),
      });
      expect(resolved.message).toBe(MESSAGES.NETWORK);
      expect(resolved.kind).toBe('network');
    });

    it('code が stage より優先: auth.signin + permission-denied → 権限', () => {
      const cause = Object.assign(new Error('wrapped'), {
        code: 'permission-denied',
      });
      const resolved = resolveUserFacingError({
        error: createStageError('auth.signin', cause),
      });
      expect(resolved.message).toBe(MESSAGES.PERMISSION);
      expect(resolved.kind).toBe('permission');
    });

    it('code が stage より優先: auth.signin + deadline-exceeded → timeout', () => {
      const cause = Object.assign(new Error('wrapped'), {
        code: 'deadline-exceeded',
      });
      const resolved = resolveUserFacingError({
        error: createStageError('auth.signin', cause),
      });
      expect(resolved.message).toBe(MESSAGES.TIMEOUT);
      expect(resolved.kind).toBe('timeout');
    });

    it('codeなし stage auth.signin → Auth stage文言', () => {
      const resolved = resolveUserFacingError({
        error: createStageError('auth.signin'),
      });
      expect(resolved.message).toBe(MESSAGES.AUTH_SIGNIN);
    });

    it('codeなし stage custom_token_malformed → malformed文言', () => {
      const resolved = resolveUserFacingError({
        error: createStageError('auth.custom_token_malformed'),
      });
      expect(resolved.message).toBe(MESSAGES.MALFORMED);
    });

    it('unknown → fallback', () => {
      expect(resolveUserFacingError({}).message).toBe(MESSAGES.PROCESS);
    });
  });

  describe('code mapping', () => {
    it('主要 code を承認済み文言へマップ', () => {
      expect(mapCallableError({ code: 'unavailable' }).message).toBe(
        MESSAGES.NETWORK
      );
      expect(mapCallableError({ code: 'permission-denied' }).message).toBe(
        MESSAGES.PERMISSION
      );
      expect(mapCallableError({ code: 'unauthenticated' }).message).toBe(
        MESSAGES.AUTH_NO_USER
      );
      expect(mapCallableError({ code: 'deadline-exceeded' }).message).toBe(
        MESSAGES.TIMEOUT
      );
      expect(mapCallableError({ code: 'functions/unavailable' }).message).toBe(
        MESSAGES.NETWORK
      );
      expect(mapCallableError({ code: 'something-else' }).message).toBe(
        MESSAGES.PROCESS
      );
    });
  });

  describe('LIFF / Auth stage', () => {
    it('SDK missing', () => {
      expect(mapLiffInitError(createStageError('liff.sdk_missing')).message).toBe(
        MESSAGES.LIFF_SDK
      );
      expect(mapLiffInitError(createStageError('liff.sdk_missing')).action).toBe(
        null
      );
    });

    it('LIFF init', () => {
      expect(mapLiffInitError(createStageError('liff.init')).message).toBe(
        MESSAGES.LIFF_INIT
      );
    });

    it('ID token / custom token / malformed / signin / timeout / no_user', () => {
      expect(mapAuthError(createStageError('auth.id_token')).message).toBe(
        MESSAGES.AUTH_ID_TOKEN
      );
      expect(mapAuthError(createStageError('auth.custom_token')).message).toBe(
        MESSAGES.AUTH_CUSTOM_TOKEN
      );
      expect(
        mapAuthError(createStageError('auth.custom_token_malformed')).message
      ).toBe(MESSAGES.MALFORMED);
      expect(mapAuthError(createStageError('auth.signin')).message).toBe(
        MESSAGES.AUTH_SIGNIN
      );
      expect(mapAuthError(createStageError('auth.timeout')).message).toBe(
        MESSAGES.TIMEOUT
      );
      expect(mapAuthError(createStageError('auth.no_user')).message).toBe(
        MESSAGES.AUTH_NO_USER
      );
    });

    it('staff login race / reg check', () => {
      expect(
        resolveUserFacingError({
          error: createStageError('staff.login_race'),
        }).message
      ).toBe(MESSAGES.STAFF_LOGIN_RACE);
      expect(
        resolveUserFacingError({
          error: createStageError('staff.reg_check'),
        }).message
      ).toBe(MESSAGES.STAFF_REG_CHECK);
    });
  });
});

describe('liff_errors (Phase L2)', () => {
  const {
    isGetUserStatusShape,
    isGenerateQRCodeShape,
    normalizeStayStatus,
    isStayActionAllowed,
  } = LiffErrors;

  describe('getUserStatus shape', () => {
    it('success true + user.isStaying boolean → valid', () => {
      expect(
        isGetUserStatusShape({
          success: true,
          user: { isStaying: true },
        })
      ).toBe(true);
      expect(
        isGetUserStatusShape({
          success: true,
          user: { isStaying: false },
        })
      ).toBe(true);
    });

    it('user欠損 / isStaying不正 / success false / null → invalid', () => {
      expect(isGetUserStatusShape({ success: true })).toBe(false);
      expect(isGetUserStatusShape({ success: true, user: {} })).toBe(false);
      expect(
        isGetUserStatusShape({ success: true, user: { isStaying: 'true' } })
      ).toBe(false);
      expect(isGetUserStatusShape({ success: false, user: { isStaying: true } })).toBe(
        false
      );
      expect(isGetUserStatusShape(null)).toBe(false);
    });
  });

  describe('generateQRCode shape', () => {
    it('正常 → valid', () => {
      expect(
        isGenerateQRCodeShape({
          qrCode: 'base64data',
          qrCodeUrl: 'https://example.invalid/qr.png',
          expiresAt: Date.now() + 60000,
        })
      ).toBe(true);
    });

    it('空・欠損・型不正・null → invalid', () => {
      expect(
        isGenerateQRCodeShape({
          qrCode: '',
          qrCodeUrl: 'https://example.invalid/qr.png',
          expiresAt: 1,
        })
      ).toBe(false);
      expect(
        isGenerateQRCodeShape({
          qrCodeUrl: 'https://example.invalid/qr.png',
          expiresAt: 1,
        })
      ).toBe(false);
      expect(
        isGenerateQRCodeShape({
          qrCode: 'x',
          qrCodeUrl: 'https://example.invalid/qr.png',
          expiresAt: 'soon',
        })
      ).toBe(false);
      expect(isGenerateQRCodeShape(null)).toBe(false);
      expect(isGenerateQRCodeShape({ data: { qrCode: 'x' } })).toBe(false);
    });
  });

  describe('operation mapping', () => {
    it('registration check → MSG-USER-STATUS-FETCH', () => {
      expect(
        resolveUserFacingError({ operation: 'user_registration_check' }).message
      ).toBe(MESSAGES.USER_STATUS_FETCH);
    });

    it('create user + already-exists → pokerName重複', () => {
      expect(
        mapCallableError(
          { code: 'already-exists' },
          { operation: 'create_user_account' }
        ).message
      ).toBe(MESSAGES.USER_POKERNAME_DUP);
    });

    it('create user + 共通codeは operation で上書きしない', () => {
      expect(
        mapCallableError(
          { code: 'unavailable' },
          { operation: 'create_user_account' }
        ).message
      ).toBe(MESSAGES.NETWORK);
      expect(
        mapCallableError(
          { code: 'permission-denied' },
          { operation: 'create_user_account' }
        ).message
      ).toBe(MESSAGES.PERMISSION);
      expect(
        mapCallableError(
          { code: 'deadline-exceeded' },
          { operation: 'create_user_account' }
        ).message
      ).toBe(MESSAGES.TIMEOUT);
      expect(
        mapCallableError(
          { code: 'unauthenticated' },
          { operation: 'create_user_account' }
        ).message
      ).toBe(MESSAGES.AUTH_NO_USER);
    });

    it('create user + 未知code / codeなし → MSG-USER-REGISTER-FAIL', () => {
      expect(
        mapCallableError(
          { code: 'not-a-known-code' },
          { operation: 'create_user_account' }
        ).message
      ).toBe(MESSAGES.USER_REGISTER_FAIL);
      expect(
        resolveUserFacingError({ operation: 'create_user_account' }).message
      ).toBe(MESSAGES.USER_REGISTER_FAIL);
    });

    it('create user + unavailable → common network', () => {
      expect(
        mapCallableError(
          { code: 'unavailable' },
          { operation: 'create_user_account' }
        ).message
      ).toBe(MESSAGES.NETWORK);
    });

    it('checkin soft-fail → MSG-CHECKIN-FETCH', () => {
      expect(
        mapSoftFailResponse(
          { success: false },
          { operation: 'get_user_status' }
        ).message
      ).toBe(MESSAGES.CHECKIN_FETCH);
    });

    it('QR / profile / balance operations', () => {
      expect(resolveUserFacingError({ operation: 'qr_display' }).message).toBe(
        MESSAGES.QR_LOAD
      );
      expect(resolveUserFacingError({ operation: 'generate_qr' }).message).toBe(
        MESSAGES.QR_GENERATE
      );
      expect(resolveUserFacingError({ operation: 'profile_load' }).message).toBe(
        MESSAGES.PROFILE_LOAD
      );
      expect(
        resolveUserFacingError({ operation: 'balance_config' }).message
      ).toBe(MESSAGES.BALANCE_CONFIG);
    });
  });

  describe('raw遮断 L2', () => {
    it('registration / QR error message・UID・QR値・stack を出さない', () => {
      const reg = mapCallableError(
        {
          message: 'secret-reg-message',
          stack: 'secret-reg-stack',
          code: 'internal',
        },
        { operation: 'create_user_account' }
      );
      assertNoSecret(reg, ['secret-reg-message', 'secret-reg-stack']);

      const qr = mapCallableError(
        {
          message: 'secret-qr-token-value',
          stack: 'secret-qr-stack',
        },
        { operation: 'generate_qr' }
      );
      assertNoSecret(qr, ['secret-qr-token-value', 'secret-qr-stack']);

      const withUid = resolveUserFacingError({
        operation: 'user_registration_check',
        error: Object.assign(new Error('x'), {
          details: { uid: 'secret-uid-xyz' },
        }),
      });
      assertNoSecret(withUid, ['secret-uid-xyz']);
    });
  });

  describe('priority L2', () => {
    it('code が operation より優先', () => {
      expect(
        resolveUserFacingError({
          operation: 'create_user_account',
          code: 'unavailable',
        }).message
      ).toBe(MESSAGES.NETWORK);
    });

    it('errorKey が code より優先', () => {
      expect(
        resolveUserFacingError({
          operation: 'get_user_status',
          errorKey: 'USER_VISIT_STATUS_FETCH_FAILED',
          code: 'unavailable',
        }).message
      ).toBe(MESSAGES.CHECKIN_FETCH);
    });

    it('operation+errorKey が最優先', () => {
      expect(
        resolveUserFacingError({
          operation: 'generate_qr',
          errorKey: 'USER_VISIT_QR_GENERATE_FAILED',
          code: 'permission-denied',
        }).message
      ).toBe(MESSAGES.QR_GENERATE);
    });
  });

  describe('unknown stay state', () => {
    it('failure相当は unknown、依存操作は true のみ許可', () => {
      expect(normalizeStayStatus(undefined)).toBe('unknown');
      expect(normalizeStayStatus(null)).toBe('unknown');
      expect(normalizeStayStatus(true)).toBe(true);
      expect(normalizeStayStatus(false)).toBe(false);
      expect(isStayActionAllowed(true)).toBe(true);
      expect(isStayActionAllowed(false)).toBe(false);
      expect(isStayActionAllowed('unknown')).toBe(false);
      expect(isStayActionAllowed(undefined)).toBe(false);
    });
  });
});

describe('liff_errors (Phase L3)', () => {
  const {
    isGetMenuItemsShape,
    isPlaceOrderByUserShape,
    isGetUserOrderHistoryShape,
    normalizeOrderItemsForRequest,
    buildOrderFingerprint,
    createClientNonce,
    classifyPlaceOrderOutcome,
    matchPendingOrderInHistory,
    ORDER_CONFIRMED_FAILURE_KEYS,
  } = LiffErrors;

  function sampleOrderSuccess(nonce: string, reused = false) {
    return {
      success: true,
      data: {
        billId: 'bill_1',
        clientNonce: nonce,
        reused,
        items: [
          {
            itemId: 'item_1',
            menuItemId: 'menu_1',
            name: 'Beer',
            quantity: 2,
            unitPrice: 500,
            totalPrice: 1000,
            status: 'preparing',
            orderedAt: '2026-08-07T00:00:00.000Z',
          },
        ],
        itemsCount: 1,
        totalQuantity: 2,
        totalAmount: 1000,
      },
    };
  }

  describe('承認済み文言', () => {
    it('L3 MESSAGES が承認文言と一致', () => {
      expect(MESSAGES.MENU_LOAD_FAIL).toBe(
        'メニューを取得できませんでした。再試行してください。'
      );
      expect(MESSAGES.MENU_CATEGORY_EMPTY).toBe(
        'このカテゴリーにはメニューがありません'
      );
      expect(MESSAGES.CART_EMPTY).toBe('カートが空です');
      expect(MESSAGES.ORDER_NOT_STAYING).toBe('入店後に注文できます。');
      expect(MESSAGES.ORDER_STAY_UNKNOWN).toBe(
        '入店状況を確認できませんでした。再試行してください。'
      );
      expect(MESSAGES.ORDER_BILL_UNAVAILABLE).toBe(
        '現在は注文できません。入店状況を確認してください。'
      );
      expect(MESSAGES.ORDER_AUTH).toBe(
        'ログイン情報を確認できませんでした。ページを再読み込みしてください。'
      );
      expect(MESSAGES.ORDER_ITEM_BAD).toBe(
        '現在注文できない商品が含まれています。カートを確認してください。'
      );
      expect(MESSAGES.ORDER_ITEM_SOLD_OUT).toBe(
        '売り切れの商品が含まれています。カートを確認してください。'
      );
      expect(MESSAGES.ORDER_QUANTITY_INVALID).toBe(
        '商品の数量は、1商品につき1〜99個で指定してください。'
      );
      expect(MESSAGES.ORDER_NONCE_REQUIRED).toBe(
        '注文を送信できませんでした。ページを再読み込みしてください。'
      );
      expect(MESSAGES.ORDER_NONCE_CONFLICT).toBe(
        '注文内容を確認できませんでした。ページを再読み込みしてください。'
      );
      expect(MESSAGES.ORDER_SUCCESS).toBe('注文を受け付けました。');
      expect(MESSAGES.ORDER_FAIL).toBe('注文を送信できませんでした。');
      expect(MESSAGES.ORDER_RESULT_UNKNOWN).toBe(
        '注文が受け付けられたか確認できません。注文履歴を確認するか、店員にお尋ねください。'
      );
      expect(MESSAGES.ORDER_HISTORY_FAIL).toBe(
        '注文履歴を取得できませんでした。再試行してください。'
      );
      expect(MESSAGES.ORDER_HISTORY_EMPTY).toBe('本日の注文履歴はありません');
    });
  });

  describe('menu validator', () => {
    const ok = {
      success: true,
      data: [
        {
          id: 'm1',
          name: 'Beer',
          category: 'drink',
          price: 500,
          isArchive: false,
          isSoldOut: false,
        },
      ],
    };
    it('正常', () => expect(isGetMenuItemsShape(ok)).toBe(true));
    it('success false', () =>
      expect(isGetMenuItemsShape({ success: false, data: [] })).toBe(false));
    it('data 非 array', () =>
      expect(isGetMenuItemsShape({ success: true, data: {} })).toBe(false));
    it('price 不正', () =>
      expect(
        isGetMenuItemsShape({
          success: true,
          data: [{ id: 'm', name: 'a', category: 'c', price: 'x', isArchive: false, isSoldOut: false }],
        })
      ).toBe(false));
  });

  describe('order validator / classify', () => {
    it('正常・reused', () => {
      expect(isPlaceOrderByUserShape(sampleOrderSuccess('n1'), 'n1')).toBe(true);
      expect(isPlaceOrderByUserShape(sampleOrderSuccess('n1', true), 'n1')).toBe(true);
    });
    it('nonce 不一致は invalid', () => {
      expect(isPlaceOrderByUserShape(sampleOrderSuccess('n1'), 'other')).toBe(false);
    });
    it('itemsCount 不一致', () => {
      const bad = sampleOrderSuccess('n1');
      bad.data.itemsCount = 9;
      expect(isPlaceOrderByUserShape(bad, 'n1')).toBe(false);
    });
    it('確定失敗 errorKey', () => {
      for (const key of Object.keys(ORDER_CONFIRMED_FAILURE_KEYS)) {
        const r = classifyPlaceOrderOutcome({
          error: { code: 'failed-precondition', details: { errorKey: key } },
          expectedNonce: 'n',
        });
        expect(r.outcome).toBe('confirmed_failure');
        assertNoSecret(r.resolved, ['secret', 'stack', key === 'ORDER_UNAUTHENTICATED' ? 'uid' : 'billId']);
      }
    });
    it('ORDER_INTERNAL_ERROR は結果不明', () => {
      const r = classifyPlaceOrderOutcome({
        error: { code: 'internal', details: { errorKey: 'ORDER_INTERNAL_ERROR' } },
      });
      expect(r.outcome).toBe('result_unknown');
      expect(r.resolved.message).toBe(MESSAGES.ORDER_RESULT_UNKNOWN);
    });
    it('unavailable / timeout は結果不明', () => {
      expect(
        classifyPlaceOrderOutcome({ error: { code: 'unavailable' } }).outcome
      ).toBe('result_unknown');
      expect(
        classifyPlaceOrderOutcome({ error: { code: 'deadline-exceeded' } }).outcome
      ).toBe('result_unknown');
    });
    it('malformed success は結果不明', () => {
      expect(
        classifyPlaceOrderOutcome({
          data: { success: true, data: { billId: 'b' } },
          expectedNonce: 'n',
        }).outcome
      ).toBe('result_unknown');
    });
    it('共通 network は place_order operation 文言に隠れない（結果不明へ）', () => {
      const r = classifyPlaceOrderOutcome({ error: { code: 'unavailable' } });
      expect(r.resolved.message).toBe(MESSAGES.ORDER_RESULT_UNKNOWN);
      expect(r.resolved.message).not.toBe(MESSAGES.ORDER_FAIL);
    });
  });

  describe('history validator / pending match', () => {
    const hist = {
      success: true,
      data: {
        businessDate: '2026-08-07',
        orders: [
          {
            id: 'bill_1',
            billId: 'bill_1',
            status: 'open',
            items: [
              {
                itemId: 'i1',
                menuItemId: 'm1',
                name: 'Beer',
                quantity: 2,
                unitPrice: 500,
                totalPrice: 1000,
                status: 'preparing',
                voided: false,
                orderedAt: '2026-08-07T00:00:00.000Z',
                clientNonce: 'nonce-a',
              },
            ],
            itemCount: 1,
            totalPrice: 1000,
          },
        ],
        totalCount: 1,
        totalAmount: 1000,
      },
    };
    it('正常', () => expect(isGetUserOrderHistoryShape(hist)).toBe(true));
    it('0件', () =>
      expect(
        isGetUserOrderHistoryShape({
          success: true,
          data: { businessDate: '2026-08-07', orders: [], totalCount: 0, totalAmount: 0 },
        })
      ).toBe(true));
    it('status null item', () => {
      const h = JSON.parse(JSON.stringify(hist));
      h.data.orders[0].items[0].status = null;
      expect(isGetUserOrderHistoryShape(h)).toBe(true);
    });
    it('pending 全一致', () => {
      const m = matchPendingOrderInHistory(hist, {
        clientNonce: 'nonce-a',
        items: [{ menuItemId: 'm1', quantity: 2 }],
      });
      expect(m.matched).toBe(true);
    });
    it('pending 部分一致は matched false', () => {
      const m = matchPendingOrderInHistory(hist, {
        clientNonce: 'nonce-a',
        items: [
          { menuItemId: 'm1', quantity: 2 },
          { menuItemId: 'm2', quantity: 1 },
        ],
      });
      expect(m.matched).toBe(false);
      expect(m.partial).toBe(true);
    });
  });

  describe('nonce / fingerprint', () => {
    it('生成・fingerprint 安定', () => {
      const a = normalizeOrderItemsForRequest([
        { menuItemId: 'b', quantity: 1 },
        { menuItemId: 'a', quantity: 2 },
      ]);
      const b = normalizeOrderItemsForRequest([
        { menuItemId: 'a', quantity: 2 },
        { menuItemId: 'b', quantity: 1 },
      ]);
      expect(a.ok && b.ok).toBe(true);
      expect(buildOrderFingerprint(a.items)).toBe(buildOrderFingerprint(b.items));
      expect(createClientNonce().length).toBeGreaterThan(10);
    });
    it('数量不正', () => {
      expect(normalizeOrderItemsForRequest([{ menuItemId: 'a', quantity: 0 }]).ok).toBe(
        false
      );
      expect(normalizeOrderItemsForRequest([{ menuItemId: 'a', quantity: 100 }]).ok).toBe(
        false
      );
    });
    it('合算', () => {
      const r = normalizeOrderItemsForRequest([
        { menuItemId: 'a', quantity: 2 },
        { menuItemId: 'a', quantity: 3 },
      ]);
      expect(r.ok).toBe(true);
      expect(r.items).toEqual([{ menuItemId: 'a', quantity: 5 }]);
    });
  });

  describe('errorKey mapping raw遮断', () => {
    it('ORDER_* 表示に raw が混入しない', () => {
      const keys = [
        'ORDER_UNAUTHENTICATED',
        'ORDER_NONCE_REQUIRED',
        'ORDER_NONCE_CONFLICT',
        'ORDER_ACTIVE_BILL_NOT_FOUND',
        'ORDER_BILL_NOT_OPEN',
        'ORDER_ITEM_NOT_FOUND',
        'ORDER_ITEM_SOLD_OUT',
        'ORDER_ITEM_UNAVAILABLE',
        'ORDER_QUANTITY_INVALID',
        'ORDER_PRICE_INVALID',
        'ORDER_INTERNAL_ERROR',
      ];
      for (const key of keys) {
        const resolved = resolveUserFacingError({
          operation: 'place_order_by_user',
          errorKey: key,
          error: { message: 'secret-msg', stack: 'secret-stack', details: { uid: 'u' } },
        });
        assertNoSecret(resolved, ['secret-msg', 'secret-stack', 'uid']);
        expect(resolved.message.length).toBeGreaterThan(0);
      }
    });
  });
});

describe('liff_errors (Phase L4)', () => {
  const {
    isGetTodayTournamentsShape,
    isGetUpcomingTournamentsShape,
    isRegisterForTournamentShape,
    classifyRegisterForTournamentOutcome,
    getTournamentRegistrationBlockReason,
    getTournamentRegisterButtonShortLabel,
    getTournamentRegistrationGuard,
    createTournamentRegistrationPending,
    transitionTournamentRegistrationPending,
    resolveTournamentPendingFromFreshList,
    normalizeStayStatus,
    createClientNonce,
    TOURNAMENT_CONFIRMED_FAILURE_KEYS,
  } = LiffErrors;

  const futureIso = new Date(Date.now() + 60 * 60 * 1000).toISOString();
  const pastIso = new Date(Date.now() - 60 * 60 * 1000).toISOString();

  function sampleItem(overrides: Record<string, unknown> = {}) {
    return {
      id: 'tour_1',
      name: 'Night',
      templateId: 'tpl_1',
      startAt: futureIso,
      regEndAt: futureIso,
      status: 'scheduled',
      entryFee: 1000,
      startStack: 10000,
      isReentry: false,
      maxReentries: null,
      reentryFee: 0,
      isAddon: false,
      addonLimitPerPlayer: null,
      addonFee: 0,
      blindLevelDurationText: '20分',
      isRegisteredByCurrentUser: false,
      ...overrides,
    };
  }

  function sampleToday(items = [sampleItem()], overrides: Record<string, unknown> = {}) {
    return {
      success: true,
      data: items,
      count: items.length,
      liffSettings: { liffRegistrationEnabled: true, liffCalendarEnabled: true },
      message: 'ok',
      ...overrides,
    };
  }

  function sampleUpcoming(items = [sampleItem({ isRegisteredByCurrentUser: undefined })], overrides: Record<string, unknown> = {}) {
    const cleaned = items.map((it) => {
      const copy = { ...it };
      delete (copy as any).isRegisteredByCurrentUser;
      return copy;
    });
    return {
      success: true,
      tournaments: cleaned,
      count: cleaned.length,
      liffSettings: { liffRegistrationEnabled: true, liffCalendarEnabled: true },
      message: 'ok',
      ...overrides,
    };
  }

  function sampleRegister(nonce: string, tournamentId = 'tour_1', overrides: Record<string, unknown> = {}) {
    return {
      success: true,
      data: {
        tournamentId,
        templateId: 'tpl_1',
        clientNonce: nonce,
        reused: false,
        registrationStatus: 'waiting',
        waiting: true,
        registeredAt: futureIso,
        billId: 'bill_1',
        entryFee: 1000,
        tournamentName: 'Night',
        pokerName: 'Ace',
        ...overrides,
      },
    };
  }

  describe('承認済み文言', () => {
    it('TOUR_* が指定文言と完全一致', () => {
      expect(MESSAGES.TOUR_LIST_LOAD_FAILED).toBe(
        'トーナメント情報を取得できませんでした。再試行してください。',
      );
      expect(MESSAGES.TOUR_TODAY_EMPTY).toBe('本日のトーナメント予定はありません。');
      expect(MESSAGES.TOUR_UPCOMING_EMPTY).toBe('今後のトーナメントはありません。');
      expect(MESSAGES.TOUR_CALENDAR_DATE_EMPTY).toBe(
        '選択した日のトーナメント予定はありません。',
      );
      expect(MESSAGES.TOUR_AUTH_FAILED).toBe(
        'ログイン情報を確認できませんでした。ページを再読み込みしてください。',
      );
      expect(MESSAGES.TOUR_NOT_STAYING).toBe('入店後に参加登録できます。');
      expect(MESSAGES.TOUR_STAY_UNKNOWN).toBe(
        '入店状況を確認できませんでした。再試行してください。',
      );
      expect(MESSAGES.TOUR_PENDING_LOCK).toBe(
        '参加登録の結果を確認できません。再度操作せず、参加状態を確認してください。',
      );
      expect(MESSAGES.TOUR_REGISTRATION_RESULT_UNKNOWN).toBe(
        '参加登録が受け付けられたか確認できません。トーナメント一覧を確認するか、店員にお尋ねください。',
      );
      expect(MESSAGES.TOUR_REGISTRATION_SUCCESS).toBe('参加登録が完了しました。');
      expect(MESSAGES.TOUR_OKIBAKE_CONFLICT).toBe(
        '店舗で登録済みのため、LINEからは参加登録できません。',
      );
      expect(MESSAGES.TOUR_BTN_SUBMITTING).toBe('登録中…');
      expect(MESSAGES.TOUR_BTN_PAUSED).toBe('受付停止中');
    });
  });

  describe('today validator', () => {
    it('正常1件 / 0件', () => {
      expect(isGetTodayTournamentsShape(sampleToday())).toBe(true);
      expect(isGetTodayTournamentsShape(sampleToday([]))).toBe(true);
    });

    it('malformed を弾く', () => {
      expect(isGetTodayTournamentsShape({ ...sampleToday(), success: false })).toBe(false);
      expect(isGetTodayTournamentsShape({ data: [], count: 0 })).toBe(false);
      expect(isGetTodayTournamentsShape({ ...sampleToday(), data: null })).toBe(false);
      expect(isGetTodayTournamentsShape({ ...sampleToday(), data: {} })).toBe(false);
      expect(isGetTodayTournamentsShape({ ...sampleToday(), count: 2 })).toBe(false);
      expect(
        isGetTodayTournamentsShape(sampleToday([sampleItem({ status: '' })])),
      ).toBe(false);
      expect(
        isGetTodayTournamentsShape(sampleToday([sampleItem({ startAt: 'not-a-date' })])),
      ).toBe(false);
      expect(
        isGetTodayTournamentsShape(sampleToday([sampleItem({ entryFee: -1 })])),
      ).toBe(false);
      expect(
        isGetTodayTournamentsShape(
          sampleToday([sampleItem({ isRegisteredByCurrentUser: 'yes' as any })]),
        ),
      ).toBe(false);
      expect(
        isGetTodayTournamentsShape(sampleToday([sampleItem({ id: '' })])),
      ).toBe(false);
    });
  });

  describe('upcoming / calendar validator', () => {
    it('正常1件 / 0件', () => {
      expect(isGetUpcomingTournamentsShape(sampleUpcoming())).toBe(true);
      expect(isGetUpcomingTournamentsShape(sampleUpcoming([]))).toBe(true);
    });

    it('tournaments 欠損を空扱いにしない', () => {
      expect(
        isGetUpcomingTournamentsShape({
          success: true,
          count: 0,
          liffSettings: { liffRegistrationEnabled: true, liffCalendarEnabled: true },
        }),
      ).toBe(false);
      expect(
        isGetUpcomingTournamentsShape({
          success: true,
          tournaments: 'x',
          count: 0,
          liffSettings: { liffRegistrationEnabled: true, liffCalendarEnabled: true },
        }),
      ).toBe(false);
      expect(
        isGetUpcomingTournamentsShape(
          sampleUpcoming([sampleItem({ entryFee: '1000' as any })]),
        ),
      ).toBe(false);
    });
  });

  describe('register validator', () => {
    it('正常初回 / reused', () => {
      expect(isRegisterForTournamentShape(sampleRegister('n1'), { tournamentId: 'tour_1', clientNonce: 'n1' })).toBe(true);
      expect(
        isRegisterForTournamentShape(sampleRegister('n1', 'tour_1', { reused: true }), {
          tournamentId: 'tour_1',
          clientNonce: 'n1',
        }),
      ).toBe(true);
    });

    it('不一致・malformed を弾く', () => {
      expect(
        isRegisterForTournamentShape(sampleRegister('n1'), {
          tournamentId: 'other',
          clientNonce: 'n1',
        }),
      ).toBe(false);
      expect(
        isRegisterForTournamentShape(sampleRegister('n1'), {
          tournamentId: 'tour_1',
          clientNonce: 'other',
        }),
      ).toBe(false);
      expect(isRegisterForTournamentShape({ success: false, data: {} })).toBe(false);
      expect(isRegisterForTournamentShape({ data: {} })).toBe(false);
      expect(isRegisterForTournamentShape({ success: true })).toBe(false);
      expect(
        isRegisterForTournamentShape(sampleRegister('n1', 'tour_1', { reused: 'yes' as any }), {
          tournamentId: 'tour_1',
          clientNonce: 'n1',
        }),
      ).toBe(false);
      expect(
        isRegisterForTournamentShape(
          sampleRegister('n1', 'tour_1', { registrationStatus: 'seated' }),
          { tournamentId: 'tour_1', clientNonce: 'n1' },
        ),
      ).toBe(false);
      expect(
        isRegisterForTournamentShape(sampleRegister('n1', 'tour_1', { waiting: false }), {
          tournamentId: 'tour_1',
          clientNonce: 'n1',
        }),
      ).toBe(false);
      expect(
        isRegisterForTournamentShape(sampleRegister('n1', 'tour_1', { entryFee: 10.5 }), {
          tournamentId: 'tour_1',
          clientNonce: 'n1',
        }),
      ).toBe(false);
      expect(
        isRegisterForTournamentShape(
          sampleRegister('n1', 'tour_1', { registeredAt: 'bad' }),
          { tournamentId: 'tour_1', clientNonce: 'n1' },
        ),
      ).toBe(false);
      expect(
        isRegisterForTournamentShape(sampleRegister('n1', 'tour_1', { billId: '' }), {
          tournamentId: 'tour_1',
          clientNonce: 'n1',
        }),
      ).toBe(false);
    });
  });

  describe('errorKey mapping', () => {
    const cases: Array<[string, string]> = [
      ['TOURNAMENT_UNAUTHENTICATED', MESSAGES.TOUR_AUTH_FAILED],
      ['TOURNAMENT_NONCE_REQUIRED', MESSAGES.TOUR_NONCE_REQUIRED],
      ['TOURNAMENT_NONCE_CONFLICT', MESSAGES.TOUR_NONCE_CONFLICT],
      ['TOURNAMENT_LIFF_REGISTRATION_DISABLED', MESSAGES.TOUR_LIFF_REGISTRATION_DISABLED],
      ['TOURNAMENT_INVALID_STATE', MESSAGES.TOUR_INVALID_STATE],
      ['TOURNAMENT_CANCELLED', MESSAGES.TOUR_CANCELLED],
      ['TOURNAMENT_ENDED', MESSAGES.TOUR_ENDED],
      ['TOURNAMENT_PAUSED', MESSAGES.TOUR_PAUSED],
      ['TOURNAMENT_REGISTRATION_CLOSED', MESSAGES.TOUR_REGISTRATION_CLOSED],
      ['TOURNAMENT_NOT_TODAY', MESSAGES.TOUR_NOT_TODAY],
      ['TOURNAMENT_ALREADY_REGISTERED', MESSAGES.TOUR_ALREADY_REGISTERED],
      ['TOURNAMENT_PARTICIPANT_CONFLICT_WITH_OKIBAKE', MESSAGES.TOUR_OKIBAKE_CONFLICT],
      ['TOURNAMENT_ACTIVE_BILL_NOT_FOUND', MESSAGES.TOUR_NOT_STAYING],
      ['TOURNAMENT_BILL_NOT_OPEN', MESSAGES.TOUR_NOT_STAYING],
      ['TOURNAMENT_FEE_INVALID', MESSAGES.TOUR_FEE_INVALID],
    ];

    it('業務 errorKey → 承認済み文言', () => {
      for (const [key, msg] of cases) {
        const resolved = resolveUserFacingError({
          operation: 'register_for_tournament',
          errorKey: key,
        });
        expect(resolved.message).toBe(msg);
      }
    });

    it('list internal は一覧失敗、register internal は結果不明', () => {
      expect(
        resolveUserFacingError({
          operation: 'get_today_tournaments',
          errorKey: 'TOURNAMENT_INTERNAL_ERROR',
        }).message,
      ).toBe(MESSAGES.TOUR_LIST_LOAD_FAILED);
      expect(
        resolveUserFacingError({
          operation: 'get_upcoming_tournaments_calendar',
          errorKey: 'TOURNAMENT_INTERNAL_ERROR',
        }).message,
      ).toBe(MESSAGES.TOUR_LIST_LOAD_FAILED);
      expect(
        resolveUserFacingError({
          operation: 'register_for_tournament',
          errorKey: 'TOURNAMENT_INTERNAL_ERROR',
        }).message,
      ).toBe(MESSAGES.TOUR_REGISTRATION_RESULT_UNKNOWN);
    });

    it('read 共通 code を operation 文言で潰さない', () => {
      expect(
        resolveUserFacingError({
          operation: 'get_today_tournaments',
          code: 'unavailable',
        }).message,
      ).toBe(MESSAGES.NETWORK);
      expect(
        resolveUserFacingError({
          operation: 'get_upcoming_tournaments',
          code: 'deadline-exceeded',
        }).message,
      ).toBe(MESSAGES.TIMEOUT);
      expect(
        resolveUserFacingError({
          operation: 'get_upcoming_tournaments_calendar',
          code: 'permission-denied',
        }).message,
      ).toBe(MESSAGES.PERMISSION);
      expect(
        resolveUserFacingError({
          operation: 'get_today_tournaments',
          code: 'unauthenticated',
        }).message,
      ).toBe(MESSAGES.AUTH_NO_USER);
    });
  });

  describe('outcome classification', () => {
    it('success / reused', () => {
      const r = classifyRegisterForTournamentOutcome({
        data: sampleRegister('n1'),
        expectedTournamentId: 'tour_1',
        expectedNonce: 'n1',
      });
      expect(r.outcome).toBe('success');
      expect(r.resolved.message).toBe(MESSAGES.TOUR_REGISTRATION_SUCCESS);

      const reused = classifyRegisterForTournamentOutcome({
        data: sampleRegister('n1', 'tour_1', { reused: true }),
        expectedTournamentId: 'tour_1',
        expectedNonce: 'n1',
      });
      expect(reused.outcome).toBe('success');
      expect(reused.resolved.message).toBe(MESSAGES.TOUR_REGISTRATION_SUCCESS);
    });

    it('confirmed failure keys', () => {
      for (const key of Object.keys(TOURNAMENT_CONFIRMED_FAILURE_KEYS)) {
        if (key === 'USER_MIGRATED' || key === 'INVALID_USER_TYPE') continue;
        const r = classifyRegisterForTournamentOutcome({
          error: { code: 'failed-precondition', details: { errorKey: key } },
          expectedTournamentId: 'tour_1',
          expectedNonce: 'n1',
        });
        expect(r.outcome).toBe('confirmed_failure');
      }
    });

    it('result unknown: network/timeout/internal/malformed/mismatch', () => {
      expect(
        classifyRegisterForTournamentOutcome({ error: { code: 'unavailable' } }).outcome,
      ).toBe('result_unknown');
      expect(
        classifyRegisterForTournamentOutcome({ error: { code: 'deadline-exceeded' } })
          .outcome,
      ).toBe('result_unknown');
      expect(
        classifyRegisterForTournamentOutcome({
          error: { code: 'internal', details: { errorKey: 'TOURNAMENT_INTERNAL_ERROR' } },
        }).outcome,
      ).toBe('result_unknown');
      expect(
        classifyRegisterForTournamentOutcome({
          data: sampleRegister('n1'),
          expectedTournamentId: 'tour_1',
          expectedNonce: 'other',
        }).outcome,
      ).toBe('result_unknown');
      expect(
        classifyRegisterForTournamentOutcome({
          data: sampleRegister('n1'),
          expectedTournamentId: 'other',
          expectedNonce: 'n1',
        }).outcome,
      ).toBe('result_unknown');
      expect(
        classifyRegisterForTournamentOutcome({
          error: { code: 'aborted', details: { errorKey: 'TOURNAMENT_WEIRD' } },
        }).outcome,
      ).toBe('result_unknown');
      expect(
        classifyRegisterForTournamentOutcome({
          error: { code: 'unavailable' },
        }).resolved.message,
      ).toBe(MESSAGES.TOUR_REGISTRATION_RESULT_UNKNOWN);
    });
  });

  describe('stay / block reason / button', () => {
    it('stay 三態', () => {
      expect(normalizeStayStatus(true)).toBe(true);
      expect(normalizeStayStatus(false)).toBe(false);
      expect(normalizeStayStatus(undefined)).toBe('unknown');
      expect(
        getTournamentRegistrationBlockReason(sampleItem(), false, {
          liffRegistrationEnabled: true,
        }),
      ).toBe(MESSAGES.TOUR_NOT_STAYING);
      expect(
        getTournamentRegistrationBlockReason(sampleItem(), 'unknown', {
          liffRegistrationEnabled: true,
        }),
      ).toBe(MESSAGES.TOUR_STAY_UNKNOWN);
      expect(
        getTournamentRegistrationBlockReason(sampleItem(), true, {
          liffRegistrationEnabled: true,
        }),
      ).toBeNull();
    });

    it('status / deadline / registered', () => {
      expect(
        getTournamentRegistrationBlockReason(
          sampleItem({ isRegisteredByCurrentUser: true }),
          true,
          { liffRegistrationEnabled: true },
        ),
      ).toBe(MESSAGES.TOUR_ALREADY_REGISTERED);
      expect(
        getTournamentRegistrationBlockReason(sampleItem({ status: 'paused' }), true, {
          liffRegistrationEnabled: true,
        }),
      ).toBe(MESSAGES.TOUR_PAUSED);
      expect(
        getTournamentRegistrationBlockReason(sampleItem({ status: 'ended' }), true, {
          liffRegistrationEnabled: true,
        }),
      ).toBe(MESSAGES.TOUR_ENDED);
      expect(
        getTournamentRegistrationBlockReason(sampleItem({ status: 'cancelled' }), true, {
          liffRegistrationEnabled: true,
        }),
      ).toBe(MESSAGES.TOUR_CANCELLED);
      expect(
        getTournamentRegistrationBlockReason(sampleItem({ regEndAt: pastIso }), true, {
          liffRegistrationEnabled: true,
        }),
      ).toBe(MESSAGES.TOUR_REGISTRATION_CLOSED);
      expect(
        getTournamentRegistrationBlockReason(sampleItem({ status: 'running' }), true, {
          liffRegistrationEnabled: true,
        }),
      ).toBeNull();
      expect(
        getTournamentRegistrationBlockReason(sampleItem({ status: 'weird' }), true, {
          liffRegistrationEnabled: true,
        }),
      ).toBe(MESSAGES.TOUR_INVALID_STATE);
    });

    it('button short labels', () => {
      expect(
        getTournamentRegisterButtonShortLabel(sampleItem(), { submitting: true }),
      ).toBe(MESSAGES.TOUR_BTN_SUBMITTING);
      expect(
        getTournamentRegisterButtonShortLabel(
          sampleItem({ isRegisteredByCurrentUser: true }),
        ),
      ).toBe(MESSAGES.TOUR_BTN_REGISTERED);
      expect(getTournamentRegisterButtonShortLabel(sampleItem({ status: 'paused' }))).toBe(
        MESSAGES.TOUR_BTN_PAUSED,
      );
      expect(getTournamentRegisterButtonShortLabel(sampleItem({ status: 'ended' }))).toBe(
        MESSAGES.TOUR_BTN_ENDED,
      );
      expect(
        getTournamentRegisterButtonShortLabel(sampleItem({ status: 'cancelled' })),
      ).toBe(MESSAGES.TOUR_BTN_CANCELLED);
      expect(
        getTournamentRegisterButtonShortLabel(sampleItem({ regEndAt: pastIso })),
      ).toBe(MESSAGES.TOUR_BTN_CLOSED);
      expect(getTournamentRegisterButtonShortLabel(sampleItem())).toBe(
        MESSAGES.TOUR_BTN_REGISTER,
      );
    });
  });

  describe('nonce / pending state', () => {
    it('生成・遷移・pending lock', () => {
      const nonce = createClientNonce();
      expect(typeof nonce).toBe('string');
      expect(nonce.length).toBeGreaterThan(8);

      const pending = createTournamentRegistrationPending('tour_1', nonce, 1);
      expect(pending.state).toBe('submitting');
      expect(getTournamentRegistrationGuard(pending, true).blockReason).toBe('busy');
      expect(getTournamentRegistrationGuard(pending, false).blockReason).toBe('busy');

      const success = transitionTournamentRegistrationPending(pending, 'success');
      expect(success.pending).toBeNull();
      expect(success.discardNonce).toBe(true);

      const fail = transitionTournamentRegistrationPending(pending, 'confirmed_failure');
      expect(fail.pending).toBeNull();

      const unknown = transitionTournamentRegistrationPending(pending, 'result_unknown');
      expect(unknown.pending?.state).toBe('result_unknown');
      expect(unknown.pending?.clientNonce).toBe(nonce);
      expect(unknown.discardNonce).toBe(false);
      expect(getTournamentRegistrationGuard(unknown.pending, false).blockReason).toBe(
        'pending_lock',
      );
      expect(getTournamentRegistrationGuard(unknown.pending, false).allowNewNonce).toBe(
        false,
      );
    });

    it('pending confirmation from fresh list only', () => {
      const pending = {
        tournamentId: 'tour_1',
        clientNonce: 'n1',
        state: 'result_unknown',
        startedAt: 1,
      };
      expect(
        resolveTournamentPendingFromFreshList(pending, [sampleItem()], {
          fromStaleCache: true,
        }).cleared,
      ).toBe(false);
      expect(
        resolveTournamentPendingFromFreshList(pending, [
          sampleItem({ id: 'other', isRegisteredByCurrentUser: true }),
        ]).cleared,
      ).toBe(false);
      expect(
        resolveTournamentPendingFromFreshList(pending, [
          sampleItem({ isRegisteredByCurrentUser: false }),
        ]).cleared,
      ).toBe(false);
      const cleared = resolveTournamentPendingFromFreshList(pending, [
        sampleItem({ isRegisteredByCurrentUser: true }),
      ]);
      expect(cleared.cleared).toBe(true);
      expect(cleared.pending).toBeNull();
      expect(resolveTournamentPendingFromFreshList(pending, null as any).cleared).toBe(
        false,
      );
    });
  });

  describe('raw遮断 L4', () => {
    it('表示モデルに raw / id 類を含めない', () => {
      const resolved = resolveUserFacingError({
        operation: 'register_for_tournament',
        errorKey: 'TOURNAMENT_NONCE_CONFLICT',
        error: {
          message: 'secret-msg',
          stack: 'secret-stack',
          details: {
            errorKey: 'TOURNAMENT_NONCE_CONFLICT',
            tournamentId: 'tour_secret',
            billId: 'bill_secret',
            uid: 'uid_secret',
            clientNonce: 'nonce_secret',
          },
        },
      });
      assertNoSecret(resolved, [
        'secret-msg',
        'secret-stack',
        'tour_secret',
        'bill_secret',
        'uid_secret',
        'nonce_secret',
      ]);
      expect(resolved.message).toBe(MESSAGES.TOUR_NONCE_CONFLICT);
      expect(JSON.stringify(resolved)).not.toContain('Firestore');
    });
  });
});

describe('liff_errors (Phase L5 staff)', () => {
  const {
    MESSAGES,
    resolveUserFacingError,
    isGenerateQRCodeShape,
    isGenerateStaffQRCodeShape,
    isCreateStaffAccountShape,
    isReactivateStaffAccountShape,
    classifyCreateStaffOutcome,
    classifyReactivateStaffOutcome,
    createClientNonce,
    getStaffMutationGuard,
    createStaffMutationPending,
    transitionStaffMutationPending,
    normalizeStaffDocStatus,
    isStaffProfileDataShape,
  } = LiffErrors as any;

  const nonce = '11111111-2222-4333-8444-555555555555';

  function createSuccess(overrides: Record<string, unknown> = {}) {
    const data = {
      clientNonce: nonce,
      reused: false,
      alreadyRegistered: false,
      staffStatus: 'active',
      ...overrides,
    };
    return {
      success: true,
      data,
      clientNonce: data.clientNonce,
      reused: data.reused,
      alreadyRegistered: data.alreadyRegistered,
      staffStatus: data.staffStatus,
      ...(overrides.qrCode ? { qrCode: overrides.qrCode } : {}),
      ...(overrides.qrCodeUrl ? { qrCodeUrl: overrides.qrCodeUrl } : {}),
      ...(typeof overrides.expiresAtMs === 'number'
        ? { expiresAt: overrides.expiresAtMs, expiresAtMs: overrides.expiresAtMs }
        : {}),
    };
  }

  function reactivateSuccess(overrides: Record<string, unknown> = {}) {
    const data = {
      clientNonce: nonce,
      reused: false,
      alreadyRegistered: false,
      staffStatus: 'active',
      ...overrides,
    };
    return {
      success: true,
      data,
      clientNonce: data.clientNonce,
      reused: data.reused,
      alreadyRegistered: data.alreadyRegistered,
      staffStatus: data.staffStatus,
    };
  }

  function staffQrSuccess(overrides: Record<string, unknown> = {}) {
    const expiresAtMs = 1_700_000_000_000;
    return {
      success: true,
      qrCode: 'data:image/png;base64,abc',
      qrCodeUrl: 'https://example.com/qr.png',
      expiresAt: expiresAtMs,
      expiresAtMs,
      type: 'staff',
      data: {
        uid: 'staff_uid',
        loginId: 'S001',
        timestamp: expiresAtMs - 600_000,
        token: 'tok',
        type: 'staff',
      },
      ...overrides,
    };
  }

  describe('承認済み文言', () => {
    it('create / reactivate / profile / QR 文言が完全一致', () => {
      expect(MESSAGES.STAFF_REG_SUCCESS).toBe('スタッフ登録が完了しました。');
      expect(MESSAGES.STAFF_ALREADY_REGISTERED).toBe('すでにスタッフ登録済みです。');
      expect(MESSAGES.STAFF_REG_FAILED).toBe('スタッフ登録できませんでした。');
      expect(MESSAGES.STAFF_REG_RESULT_UNKNOWN).toBe(
        'スタッフ登録の結果を確認できません。再度操作せず、登録状態を確認してください。',
      );
      expect(MESSAGES.STAFF_REACTIVATION_REQUIRED).toBe('スタッフの再登録が必要です。');
      expect(MESSAGES.STAFF_REG_NONCE_REQUIRED).toBe(
        'スタッフ登録を送信できませんでした。ページを再読み込みしてください。',
      );
      expect(MESSAGES.STAFF_REG_NONCE_CONFLICT).toBe(
        'スタッフ登録の内容を確認できませんでした。ページを再読み込みしてください。',
      );
      expect(MESSAGES.STAFF_NAME_KANA_DUPLICATE).toBe(
        '同じ氏名のスタッフがすでに登録されています。店員または管理者に確認してください。',
      );
      expect(MESSAGES.STAFF_INVALID_ARGUMENT).toBe('入力内容を確認してください。');
      expect(MESSAGES.STAFF_REACTIVATION_SUCCESS).toBe('スタッフの再登録が完了しました。');
      expect(MESSAGES.STAFF_REACTIVATION_FAILED).toBe('スタッフの再登録ができませんでした。');
      expect(MESSAGES.STAFF_REACTIVATION_RESULT_UNKNOWN).toBe(
        'スタッフの再登録結果を確認できません。再度操作せず、登録状態を確認してください。',
      );
      expect(MESSAGES.STAFF_REACTIVATION_NONCE_REQUIRED).toBe(
        '再登録を送信できませんでした。ページを再読み込みしてください。',
      );
      expect(MESSAGES.STAFF_REACTIVATION_NONCE_CONFLICT).toBe(
        '再登録の内容を確認できませんでした。ページを再読み込みしてください。',
      );
      expect(MESSAGES.STAFF_NOT_FOUND_REACTIVATE).toBe(
        'スタッフ情報が見つかりません。スタッフ登録を行ってください。',
      );
      expect(MESSAGES.STAFF_NOT_FOUND_QR).toBe(
        'スタッフ情報が見つからないため、QRコードを表示できません。',
      );
      expect(MESSAGES.STAFF_AUTH_FAILED).toBe(
        'ログイン情報を確認できませんでした。ページを再読み込みしてください。',
      );
      expect(MESSAGES.STAFF_PROFILE_NOT_FOUND).toBe('スタッフ情報が見つかりません。');
      expect(MESSAGES.STAFF_PROFILE_LOAD_FAILED).toBe(
        'プロフィール情報を取得できませんでした。再試行してください。',
      );
      expect(MESSAGES.STAFF_QR_LOAD_FAILED).toBe('QRコードを表示できませんでした。再試行してください。');
      expect(MESSAGES.STAFF_QR_REFRESH_FAILED).toBe(
        'QRコードを更新できませんでした。しばらくしてから再度お試しください。',
      );
      expect(MESSAGES.STAFF_QR_EXPIRED).toBe('QRコードの有効期限が切れました。更新してください。');
      expect(MESSAGES.STAFF_QR_COOLDOWN).toBe('しばらく待ってから更新してください。');
      expect(MESSAGES.STAFF_QR_RETIRED).toBe('スタッフの再登録後にQRコードを利用できます。');
      expect(MESSAGES.STAFF_QR_INVALID_TYPE).toBe(
        'QRコードを表示できませんでした。ページを再読み込みしてください。',
      );
    });
  });

  describe('mapper', () => {
    it('errorKey / operation+errorKey を解決する', () => {
      expect(
        resolveUserFacingError({
          operation: 'create_staff_account',
          errorKey: 'STAFF_UNAUTHENTICATED',
        }).message,
      ).toBe(MESSAGES.STAFF_AUTH_FAILED);
      expect(
        resolveUserFacingError({
          operation: 'create_staff_account',
          errorKey: 'STAFF_REGISTRATION_NONCE_REQUIRED',
        }).message,
      ).toBe(MESSAGES.STAFF_REG_NONCE_REQUIRED);
      expect(
        resolveUserFacingError({
          operation: 'create_staff_account',
          errorKey: 'STAFF_REGISTRATION_NONCE_CONFLICT',
        }).message,
      ).toBe(MESSAGES.STAFF_REG_NONCE_CONFLICT);
      expect(
        resolveUserFacingError({
          operation: 'create_staff_account',
          errorKey: 'STAFF_REACTIVATION_REQUIRED',
        }).message,
      ).toBe(MESSAGES.STAFF_REACTIVATION_REQUIRED);
      expect(
        resolveUserFacingError({
          operation: 'reactivate_staff_account',
          errorKey: 'STAFF_NOT_RETIRED',
        }).message,
      ).toBe(MESSAGES.STAFF_ALREADY_REGISTERED);
      expect(
        resolveUserFacingError({
          operation: 'reactivate_staff_account',
          errorKey: 'STAFF_NOT_FOUND',
        }).message,
      ).toBe(MESSAGES.STAFF_NOT_FOUND_REACTIVATE);
      expect(
        resolveUserFacingError({
          operation: 'generate_staff_qr',
          errorKey: 'STAFF_NOT_FOUND',
        }).message,
      ).toBe(MESSAGES.STAFF_NOT_FOUND_QR);
      expect(
        resolveUserFacingError({
          operation: 'create_staff_account',
          errorKey: 'STAFF_NAME_KANA_ALREADY_EXISTS',
        }).message,
      ).toBe(MESSAGES.STAFF_NAME_KANA_DUPLICATE);
      expect(
        resolveUserFacingError({
          operation: 'create_staff_account',
          errorKey: 'STAFF_INVALID_ARGUMENT',
        }).message,
      ).toBe(MESSAGES.STAFF_INVALID_ARGUMENT);
      expect(
        resolveUserFacingError({
          operation: 'create_staff_account',
          errorKey: 'STAFF_INTERNAL_ERROR',
        }).message,
      ).toBe(MESSAGES.STAFF_REG_RESULT_UNKNOWN);
      expect(
        resolveUserFacingError({
          operation: 'reactivate_staff_account',
          errorKey: 'STAFF_INTERNAL_ERROR',
        }).message,
      ).toBe(MESSAGES.STAFF_REACTIVATION_RESULT_UNKNOWN);
      expect(
        resolveUserFacingError({
          operation: 'reactivate_staff_account',
          errorKey: 'STAFF_REACTIVATION_NONCE_REQUIRED',
        }).message,
      ).toBe(MESSAGES.STAFF_REACTIVATION_NONCE_REQUIRED);
      expect(
        resolveUserFacingError({
          operation: 'reactivate_staff_account',
          errorKey: 'STAFF_REACTIVATION_NONCE_CONFLICT',
        }).message,
      ).toBe(MESSAGES.STAFF_REACTIVATION_NONCE_CONFLICT);
      expect(
        resolveUserFacingError({
          operation: 'generate_staff_qr',
          errorKey: 'STAFF_RETIRED',
        }).message,
      ).toBe(MESSAGES.STAFF_QR_RETIRED);
      expect(
        resolveUserFacingError({
          operation: 'generate_staff_qr',
          errorKey: 'QR_INVALID_TYPE',
        }).message,
      ).toBe(MESSAGES.STAFF_QR_INVALID_TYPE);
      expect(
        resolveUserFacingError({
          operation: 'generate_staff_qr',
          errorKey: 'QR_INTERNAL_ERROR',
        }).message,
      ).toBe(MESSAGES.STAFF_QR_REFRESH_FAILED);
      expect(
        resolveUserFacingError({
          operation: 'staff_qr_display',
          errorKey: 'QR_INTERNAL_ERROR',
        }).message,
      ).toBe(MESSAGES.STAFF_QR_LOAD_FAILED);
      expect(
        resolveUserFacingError({
          operation: 'create_staff_account',
          errorKey: 'UNKNOWN_STAFF_KEY_XYZ',
        }).message,
      ).toBe(MESSAGES.STAFF_REG_FAILED);
    });
  });

  describe('create validator', () => {
    it('new success / alreadyRegistered / reused', () => {
      expect(isCreateStaffAccountShape(createSuccess(), { clientNonce: nonce })).toBe(true);
      expect(
        isCreateStaffAccountShape(createSuccess({ alreadyRegistered: true }), {
          clientNonce: nonce,
        }),
      ).toBe(true);
      expect(
        isCreateStaffAccountShape(createSuccess({ reused: true }), { clientNonce: nonce }),
      ).toBe(true);
    });

    it('malformed を拒否', () => {
      expect(
        isCreateStaffAccountShape(createSuccess(), { clientNonce: 'other-nonce' }),
      ).toBe(false);
      expect(isCreateStaffAccountShape({ success: false, data: {} }, { clientNonce: nonce })).toBe(
        false,
      );
      expect(
        isCreateStaffAccountShape(
          { success: true, clientNonce: nonce, reused: true, alreadyRegistered: false },
          { clientNonce: nonce },
        ),
      ).toBe(false);
      expect(
        isCreateStaffAccountShape(createSuccess({ staffStatus: 'retired' }), {
          clientNonce: nonce,
        }),
      ).toBe(false);
      expect(
        isCreateStaffAccountShape(createSuccess({ reused: 'yes' as any }), {
          clientNonce: nonce,
        }),
      ).toBe(false);
      expect(
        isCreateStaffAccountShape(createSuccess({ alreadyRegistered: 'yes' as any }), {
          clientNonce: nonce,
        }),
      ).toBe(false);
      expect(
        isCreateStaffAccountShape(createSuccess({ qrCode: '' }), { clientNonce: nonce }),
      ).toBe(false);
      expect(
        isCreateStaffAccountShape(
          createSuccess({ expiresAtMs: 1, expiresAt: 2 }),
          { clientNonce: nonce },
        ),
      ).toBe(false);
    });
  });

  describe('reactivate validator', () => {
    it('success / reused / malformed', () => {
      expect(isReactivateStaffAccountShape(reactivateSuccess(), { clientNonce: nonce })).toBe(
        true,
      );
      expect(
        isReactivateStaffAccountShape(reactivateSuccess({ reused: true }), {
          clientNonce: nonce,
        }),
      ).toBe(true);
      expect(
        isReactivateStaffAccountShape(reactivateSuccess(), { clientNonce: 'x' }),
      ).toBe(false);
      expect(
        isReactivateStaffAccountShape(reactivateSuccess({ staffStatus: 'retired' }), {
          clientNonce: nonce,
        }),
      ).toBe(false);
      expect(
        isReactivateStaffAccountShape({ success: true, data: null }, { clientNonce: nonce }),
      ).toBe(false);
    });
  });

  describe('QR validator', () => {
    it('staff strict / user L2 regression', () => {
      expect(isGenerateStaffQRCodeShape(staffQrSuccess())).toBe(true);
      expect(isGenerateQRCodeShape(staffQrSuccess())).toBe(true);
      expect(
        isGenerateQRCodeShape({
          qrCode: 'x',
          qrCodeUrl: 'https://u',
          expiresAt: 1,
        }),
      ).toBe(true);
      expect(isGenerateStaffQRCodeShape({
        qrCode: 'x',
        qrCodeUrl: 'https://u',
        expiresAt: 1,
      })).toBe(false);
      expect(isGenerateStaffQRCodeShape(staffQrSuccess({ success: false }))).toBe(false);
      expect(isGenerateStaffQRCodeShape(staffQrSuccess({ qrCode: '' }))).toBe(false);
      expect(
        isGenerateStaffQRCodeShape(staffQrSuccess({ expiresAt: Number.NaN, expiresAtMs: Number.NaN })),
      ).toBe(false);
      expect(isGenerateStaffQRCodeShape(staffQrSuccess({ type: 'user' }))).toBe(false);
      expect(
        isGenerateStaffQRCodeShape(
          staffQrSuccess({
            data: {
              uid: 'u',
              loginId: 'l',
              timestamp: 1,
              token: 't',
              type: 'user',
            },
          }),
        ),
      ).toBe(false);
    });
  });

  describe('outcome', () => {
    it('create confirmed / unknown / success', () => {
      expect(
        classifyCreateStaffOutcome({
          data: createSuccess(),
          expectedNonce: nonce,
        }).outcome,
      ).toBe('success');
      expect(
        classifyCreateStaffOutcome({
          data: createSuccess({ alreadyRegistered: true }),
          expectedNonce: nonce,
        }).resolved.message,
      ).toBe(MESSAGES.STAFF_ALREADY_REGISTERED);
      expect(
        classifyCreateStaffOutcome({
          data: createSuccess({ reused: true }),
          expectedNonce: nonce,
        }).resolved.message,
      ).toBe(MESSAGES.STAFF_REG_SUCCESS);
      expect(
        classifyCreateStaffOutcome({
          error: { code: 'failed-precondition', details: { errorKey: 'STAFF_REACTIVATION_REQUIRED' } },
          expectedNonce: nonce,
        }).outcome,
      ).toBe('confirmed_failure');
      expect(
        classifyCreateStaffOutcome({
          error: { code: 'already-exists', details: { errorKey: 'STAFF_NAME_KANA_ALREADY_EXISTS' } },
          expectedNonce: nonce,
        }).outcome,
      ).toBe('confirmed_failure');
      expect(
        classifyCreateStaffOutcome({
          error: { code: 'unavailable' },
          expectedNonce: nonce,
        }).outcome,
      ).toBe('result_unknown');
      expect(
        classifyCreateStaffOutcome({
          error: { code: 'internal', details: { errorKey: 'STAFF_INTERNAL_ERROR' } },
          expectedNonce: nonce,
        }).outcome,
      ).toBe('result_unknown');
      expect(
        classifyCreateStaffOutcome({
          data: createSuccess(),
          expectedNonce: 'mismatch',
        }).outcome,
      ).toBe('result_unknown');
      expect(
        classifyCreateStaffOutcome({
          error: { code: 'aborted', details: { errorKey: 'WEIRD_KEY' } },
          expectedNonce: nonce,
        }).outcome,
      ).toBe('result_unknown');
    });

    it('reactivate confirmed / unknown', () => {
      expect(
        classifyReactivateStaffOutcome({
          data: reactivateSuccess(),
          expectedNonce: nonce,
        }).outcome,
      ).toBe('success');
      expect(
        classifyReactivateStaffOutcome({
          error: { code: 'failed-precondition', details: { errorKey: 'STAFF_NOT_RETIRED' } },
          expectedNonce: nonce,
        }).outcome,
      ).toBe('confirmed_failure');
      expect(
        classifyReactivateStaffOutcome({
          error: { code: 'deadline-exceeded' },
          expectedNonce: nonce,
        }).outcome,
      ).toBe('result_unknown');
    });
  });

  describe('nonce / pending', () => {
    it('guard と state 遷移', () => {
      const n1 = createClientNonce();
      expect(typeof n1).toBe('string');
      expect(n1.length).toBeGreaterThan(8);
      let pending = createStaffMutationPending(n1);
      expect(pending.state).toBe('submitting');
      expect(getStaffMutationGuard(pending, false).allowNewNonce).toBe(false);
      pending = transitionStaffMutationPending(pending, 'result_unknown');
      expect(getStaffMutationGuard(pending, false).blockReason).toBe('pending_lock');
      expect(getStaffMutationGuard(null, false).allowNewNonce).toBe(true);
      expect(getStaffMutationGuard(null, true).blockReason).toBe('busy');
    });
  });

  describe('staff status / profile shape', () => {
    it('normalize / profile shape', () => {
      expect(normalizeStaffDocStatus({ status: 'retired' })).toBe('retired');
      expect(normalizeStaffDocStatus({})).toBe('active');
      expect(normalizeStaffDocStatus({ status: 'active' })).toBe('active');
      expect(isStaffProfileDataShape({ fullName: '<script>x</script>' })).toBe(true);
      expect(isStaffProfileDataShape(null)).toBe(false);
      expect(isStaffProfileDataShape([])).toBe(false);
    });
  });

  describe('raw遮断 L5', () => {
    it('表示モデルに raw / nonce / uid を含めない', () => {
      const resolved = resolveUserFacingError({
        operation: 'create_staff_account',
        errorKey: 'STAFF_REGISTRATION_NONCE_CONFLICT',
        error: {
          message: 'secret-msg',
          stack: 'secret-stack',
          details: {
            errorKey: 'STAFF_REGISTRATION_NONCE_CONFLICT',
            clientNonce: 'nonce_secret',
            uid: 'uid_secret',
            token: 'tok_secret',
          },
        },
      });
      assertNoSecret(resolved, [
        'secret-msg',
        'secret-stack',
        'nonce_secret',
        'uid_secret',
        'tok_secret',
      ]);
      expect(resolved.message).toBe(MESSAGES.STAFF_REG_NONCE_CONFLICT);
    });
  });
});


describe('liff_errors (Phase L6 staff shift)', () => {
  const {
    isGetShiftsShape,
    isSubmitShiftRequestsShape,
    normalizeShiftSubmitPayloadItems,
    classifySubmitShiftRequestsOutcome,
    getShiftSubmitGuard,
    createShiftSubmitPending,
    transitionShiftSubmitPending,
    matchShiftSubmitPayloadInGetShifts,
    createClientNonce,
    SHIFT_SUBMIT_CONFIRMED_FAILURE_KEYS,
  } = LiffErrors;

  const samplePayload = [
    { dateKey: '2026-09-01', startMinute: 600, endMinute: 720 },
    { dateKey: '2026-09-02', startMinute: 660, endMinute: 780 },
  ];

  function okSubmit(overrides: Record<string, unknown> = {}) {
    return {
      success: true,
      data: {
        clientNonce: 'nonce-1',
        reused: false,
        yearMonth: '2026-09',
        submittedCount: 2,
        createdCount: 2,
        updatedCount: 0,
        requests: [
          {
            requestId: 'u_2026-09-01',
            dateKey: '2026-09-01',
            status: 'pending',
            startMinute: 600,
            endMinute: 720,
          },
          {
            requestId: 'u_2026-09-02',
            dateKey: '2026-09-02',
            status: 'pending',
            startMinute: 660,
            endMinute: 780,
          },
        ],
        ...overrides,
      },
    };
  }

  function okGetShifts(shifts: any[]) {
    return { success: true, data: { shifts, count: shifts.length } };
  }

  describe('承認済み文言', () => {
    it('主要SHIFT文言が完全一致', () => {
      expect(MESSAGES.SHIFT_SUBMIT_SUCCESS).toBe('シフト希望を提出しました。');
      expect(MESSAGES.SHIFT_SUBMIT_FAILED).toBe(
        'シフト希望を提出できませんでした。再度お試しください。',
      );
      expect(MESSAGES.SHIFT_SUBMIT_RESULT_UNKNOWN).toBe(
        'シフト希望の提出結果を確認できません。再度操作せず、提出状況を確認してください。',
      );
      expect(MESSAGES.SHIFT_AUTH_FAILED).toBe(MESSAGES.STAFF_AUTH_FAILED);
      expect(MESSAGES.SHIFT_SUBMITTED_EMPTY).toBe('提出済みのシフト希望はありません。');
      expect(MESSAGES.SHIFT_CONFIRMED_EMPTY).toBe('確定しているシフトはありません。');
    });
  });

  describe('mapper', () => {
    it.each([
      ['SHIFT_UNAUTHENTICATED', MESSAGES.SHIFT_AUTH_FAILED],
      ['SHIFT_SUBMIT_NONCE_REQUIRED', MESSAGES.SHIFT_SUBMIT_NONCE_REQUIRED],
      ['SHIFT_SUBMIT_NONCE_CONFLICT', MESSAGES.SHIFT_SUBMIT_NONCE_CONFLICT],
      ['SHIFT_INVALID_ARGUMENT', MESSAGES.SHIFT_INVALID_ARGUMENT],
      ['SHIFT_NOT_NEXT_MONTH', MESSAGES.SHIFT_NOT_NEXT_MONTH],
      ['SHIFT_REQUEST_NOT_EDITABLE', MESSAGES.SHIFT_REQUEST_NOT_EDITABLE],
      ['SHIFT_REQUEST_ALREADY_CONFIRMED', MESSAGES.SHIFT_REQUEST_ALREADY_CONFIRMED],
      ['SHIFT_MONTH_FINALIZED', MESSAGES.SHIFT_MONTH_FINALIZED],
      ['SHIFT_SCHEDULING_PERIOD_RESTRICTED', MESSAGES.SHIFT_SCHEDULING_PERIOD_RESTRICTED],
      ['SHIFT_DATE_NOT_INSUFFICIENT', MESSAGES.SHIFT_DATE_NOT_INSUFFICIENT],
      ['SHIFT_BUSINESS_HOURS_UNAVAILABLE', MESSAGES.SHIFT_BUSINESS_HOURS_UNAVAILABLE],
      ['SHIFT_BUSINESS_DAY_CLOSED', MESSAGES.SHIFT_BUSINESS_DAY_CLOSED],
      ['SHIFT_TIME_OUTSIDE_BUSINESS_HOURS', MESSAGES.SHIFT_TIME_OUTSIDE_BUSINESS_HOURS],
    ])('%s maps correctly', (errorKey, message) => {
      expect(
        resolveUserFacingError({ operation: 'submit_shift_requests', errorKey }).message,
      ).toBe(message);
    });

    it('SHIFT_INTERNAL_ERROR submit → result unknown wording', () => {
      expect(
        resolveUserFacingError({
          operation: 'submit_shift_requests',
          errorKey: 'SHIFT_INTERNAL_ERROR',
        }).message,
      ).toBe(MESSAGES.SHIFT_SUBMIT_RESULT_UNKNOWN);
    });

    it('read op internal uses load failed', () => {
      expect(
        resolveUserFacingError({
          operation: 'get_submitted_shifts',
          errorKey: 'SHIFT_INTERNAL_ERROR',
        }).message,
      ).toBe(MESSAGES.SHIFT_SUBMITTED_LOAD_FAILED);
    });

    it('STAFF_RETIRED via submit compound', () => {
      expect(
        resolveUserFacingError({
          operation: 'submit_shift_requests',
          errorKey: 'STAFF_RETIRED',
        }).message,
      ).toBe(MESSAGES.STAFF_REACTIVATION_REQUIRED);
    });

    it('unknown key falls back without leaking secrets', () => {
      const resolved = resolveUserFacingError({
        operation: 'submit_shift_requests',
        errorKey: 'SHIFT_UNKNOWN_KEY_XYZ',
        error: { message: 'raw-secret', stack: 'stk' },
      });
      assertNoSecret(resolved, ['raw-secret', 'stk', 'SHIFT_UNKNOWN_KEY_XYZ']);
    });
  });

  describe('submit validator', () => {
    it('accepts normal and reused', () => {
      expect(
        isSubmitShiftRequestsShape(okSubmit(), {
          clientNonce: 'nonce-1',
          shifts: samplePayload,
        }),
      ).toBe(true);
      expect(
        isSubmitShiftRequestsShape(okSubmit({ reused: true }), {
          clientNonce: 'nonce-1',
          shifts: samplePayload,
        }),
      ).toBe(true);
    });

    it('rejects nonce mismatch / missing data / bad yearMonth / count mismatch', () => {
      expect(
        isSubmitShiftRequestsShape(okSubmit(), { clientNonce: 'other', shifts: samplePayload }),
      ).toBe(false);
      expect(isSubmitShiftRequestsShape({ success: true })).toBe(false);
      expect(
        isSubmitShiftRequestsShape(okSubmit({ yearMonth: '2026/09' }), {
          clientNonce: 'nonce-1',
          shifts: samplePayload,
        }),
      ).toBe(false);
      expect(
        isSubmitShiftRequestsShape(okSubmit({ submittedCount: 1 }), {
          clientNonce: 'nonce-1',
          shifts: samplePayload,
        }),
      ).toBe(false);
      expect(
        isSubmitShiftRequestsShape(okSubmit({ createdCount: 1, updatedCount: 0 }), {
          clientNonce: 'nonce-1',
          shifts: samplePayload,
        }),
      ).toBe(false);
    });

    it('rejects invalid status / payload set mismatch / bad minutes', () => {
      const badStatus = okSubmit();
      (badStatus.data as any).requests[0].status = 'confirmed';
      expect(
        isSubmitShiftRequestsShape(badStatus, {
          clientNonce: 'nonce-1',
          shifts: samplePayload,
        }),
      ).toBe(false);

      expect(
        isSubmitShiftRequestsShape(okSubmit(), {
          clientNonce: 'nonce-1',
          shifts: [{ dateKey: '2026-09-99', startMinute: 600, endMinute: 720 }],
        }),
      ).toBe(false);

      const badMin = okSubmit();
      (badMin.data as any).requests[0].startMinute = 800;
      (badMin.data as any).requests[0].endMinute = 700;
      expect(
        isSubmitShiftRequestsShape(badMin, {
          clientNonce: 'nonce-1',
        }),
      ).toBe(false);
    });

    it('normalize sorts and rejects duplicates', () => {
      const n = normalizeShiftSubmitPayloadItems([
        { dateKey: '2026-09-02', startMinute: 600, endMinute: 720 },
        { dateKey: '2026-09-01', startMinute: 600, endMinute: 720 },
      ]);
      expect(n!.map((x: any) => x.dateKey)).toEqual(['2026-09-01', '2026-09-02']);
      expect(
        normalizeShiftSubmitPayloadItems([
          { dateKey: '2026-09-01', startMinute: 600, endMinute: 720 },
          { dateKey: '2026-09-01', startMinute: 660, endMinute: 780 },
        ]),
      ).toBeNull();
    });
  });

  describe('getShifts validator', () => {
    const item = {
      requestId: 'r1',
      dateKey: '2026-09-01',
      date: '2026-09-01',
      startMinute: 600,
      endMinute: 720,
      start: '10:00',
      end: '12:00',
      confirmed: null,
      requestStatus: 'pending',
      source: 'pending_request',
    };

    it('accepts normal and empty', () => {
      expect(isGetShiftsShape(okGetShifts([item]))).toBe(true);
      expect(isGetShiftsShape(okGetShifts([]))).toBe(true);
    });

    it('rejects count mismatch / malformed / legacy top-level', () => {
      expect(isGetShiftsShape({ success: true, data: { shifts: [item], count: 0 } })).toBe(false);
      expect(
        isGetShiftsShape(okGetShifts([{ ...item, source: 'weird' }])),
      ).toBe(false);
      expect(
        isGetShiftsShape({ success: true, shifts: [item] }),
      ).toBe(false);
      expect(
        isGetShiftsShape(okGetShifts([{ ...item, dateKey: 'bad' }])),
      ).toBe(false);
      expect(
        isGetShiftsShape(okGetShifts([{ ...item, confirmed: 'yes' }])),
      ).toBe(false);
    });
  });

  describe('outcome', () => {
    it('success / confirmed / unknown', () => {
      expect(
        classifySubmitShiftRequestsOutcome({
          data: okSubmit(),
          expectedNonce: 'nonce-1',
          expectedShifts: samplePayload,
        }).outcome,
      ).toBe('success');

      expect(
        classifySubmitShiftRequestsOutcome({
          error: { details: { errorKey: 'SHIFT_MONTH_FINALIZED' } },
        }).outcome,
      ).toBe('confirmed_failure');

      expect(
        classifySubmitShiftRequestsOutcome({
          error: { details: { errorKey: 'SHIFT_INTERNAL_ERROR' } },
        }).outcome,
      ).toBe('result_unknown');

      expect(
        classifySubmitShiftRequestsOutcome({
          error: { code: 'unavailable' },
        }).outcome,
      ).toBe('result_unknown');

      expect(
        classifySubmitShiftRequestsOutcome({
          data: okSubmit({ clientNonce: 'mismatch' }),
          expectedNonce: 'nonce-1',
          expectedShifts: samplePayload,
        }).outcome,
      ).toBe('result_unknown');

      expect(SHIFT_SUBMIT_CONFIRMED_FAILURE_KEYS.SHIFT_DATE_NOT_INSUFFICIENT).toBe(true);
    });
  });

  describe('nonce / pending', () => {
    it('guard and transitions', () => {
      const n1 = createClientNonce();
      expect(n1).toBeTruthy();
      expect(String(n1)).not.toMatch(/^\d+$/);
      let pending = createShiftSubmitPending(n1, samplePayload);
      expect(getShiftSubmitGuard(pending, false).allowNewNonce).toBe(false);
      pending = transitionShiftSubmitPending(pending, 'result_unknown');
      expect(getShiftSubmitGuard(pending, false)).toEqual({
        allowNewNonce: false,
        blockReason: 'pending_lock',
      });
      expect(getShiftSubmitGuard(null, false).allowNewNonce).toBe(true);
    });
  });

  describe('fresh confirmation', () => {
    it('all match clears; mismatch / fail / stale keep', () => {
      const shifts = samplePayload.map((p) => ({
        requestId: `u_${p.dateKey}`,
        dateKey: p.dateKey,
        date: p.dateKey,
        startMinute: p.startMinute,
        endMinute: p.endMinute,
        start: 'x',
        end: 'y',
        confirmed: null,
        requestStatus: 'pending',
        source: 'pending_request',
      }));
      expect(
        matchShiftSubmitPayloadInGetShifts(okGetShifts(shifts), samplePayload).matched,
      ).toBe(true);

      expect(
        matchShiftSubmitPayloadInGetShifts(okGetShifts(shifts.slice(0, 1)), samplePayload)
          .matched,
      ).toBe(false);

      const wrongTime = shifts.map((s, i) =>
        i === 0 ? { ...s, startMinute: 999, endMinute: 1000 } : s,
      );
      expect(
        matchShiftSubmitPayloadInGetShifts(okGetShifts(wrongTime), samplePayload).matched,
      ).toBe(false);

      expect(
        matchShiftSubmitPayloadInGetShifts(okGetShifts(shifts), samplePayload, {
          fromStaleCache: true,
        }).matched,
      ).toBe(false);

      const assignment = shifts.map((s) => ({
        ...s,
        source: 'assignment',
        requestStatus: null,
        confirmed: true,
      }));
      expect(
        matchShiftSubmitPayloadInGetShifts(okGetShifts(assignment), samplePayload).matched,
      ).toBe(true);
    });
  });

  describe('raw遮断 L6', () => {
    it('表示モデルに raw / nonce / uid を含めない', () => {
      const resolved = resolveUserFacingError({
        operation: 'submit_shift_requests',
        errorKey: 'SHIFT_SUBMIT_NONCE_CONFLICT',
        error: {
          message: 'secret-msg',
          stack: 'secret-stack',
          details: {
            errorKey: 'SHIFT_SUBMIT_NONCE_CONFLICT',
            clientNonce: 'nonce_secret',
            uid: 'uid_secret',
          },
        },
      });
      assertNoSecret(resolved, [
        'secret-msg',
        'secret-stack',
        'nonce_secret',
        'uid_secret',
      ]);
      expect(resolved.message).toBe(MESSAGES.SHIFT_SUBMIT_NONCE_CONFLICT);
    });
  });
});

describe('liff_errors (Phase L7 staff attendance)', () => {
  const {
    MESSAGES,
    resolveUserFacingError,
    isGetStaffAttendanceShape,
    isCheckAttendanceCorrectionShape,
    isCreateAttendanceCorrectionShape,
    classifySubmitAttendanceCorrectionOutcome,
    getAttendanceCorrectionGuard,
    createAttendanceCorrectionPending,
    transitionAttendanceCorrectionPending,
    resolveAttendanceCorrectionPendingFromFreshCheck,
  } = LiffErrors;

  function sampleAttendanceResponse(overrides: Record<string, unknown> = {}) {
    return {
      success: true,
      data: {
        year: 2026,
        month: 8,
        attendances: [
          {
            attendanceId: 'att-1',
            date: '2026-08-10',
            clockIn: '2026-08-10T09:00:00.000Z',
            clockOut: '2026-08-10T18:00:00.000Z',
            breakMinutes: 60,
            actualWorkMinutes: 480,
            nightWorkMinutes: 0,
            isOnBreak: false,
            isManual: false,
            closedStoreWithoutClockOut: false,
          },
        ],
        count: 1,
        ...overrides,
      },
    };
  }

  function sampleCheckResponse(overrides: Record<string, unknown> = {}) {
    return {
      success: true,
      data: {
        exists: false,
        date: '2026-08-10',
        status: null,
        requestId: null,
        ...overrides,
      },
    };
  }

  function sampleSubmitResponse(overrides: Record<string, unknown> = {}) {
    return {
      success: true,
      data: {
        clientNonce: 'nonce-1',
        reused: false,
        requestId: 'staff_2026-08-10',
        date: '2026-08-10',
        status: 'pending',
        ...overrides,
      },
    };
  }

  it('承認済み文言が存在する', () => {
    expect(MESSAGES.ATT_HISTORY_LOAD_FAILED).toBe('勤怠履歴を取得できませんでした。再試行してください。');
    expect(MESSAGES.ATT_HISTORY_EMPTY_DAY).toBe('この日の勤怠記録はありません。');
    expect(MESSAGES.ATT_PAGE_LOAD_FAILED).toBe('勤怠情報を取得できませんでした。再試行してください。');
    expect(MESSAGES.ATT_CORRECTION_SUCCESS).toBe('勤怠修正を申請しました。');
    expect(MESSAGES.ATT_CORRECTION_RESULT_UNKNOWN).toBe('勤怠修正申請の結果を確認できません。再度操作せず、申請状況を確認してください。');
    expect(MESSAGES.ATT_CORRECTION_ALREADY_EXISTS).toBe('この日の勤怠修正はすでに申請されています。');
  });

  it('attendance validator: normal/empty/malformed', () => {
    expect(isGetStaffAttendanceShape(sampleAttendanceResponse(), { year: 2026, month: 8 })).toBe(true);
    expect(isGetStaffAttendanceShape(sampleAttendanceResponse({ attendances: [], count: 0 }), { year: 2026, month: 8 })).toBe(true);
    expect(isGetStaffAttendanceShape(sampleAttendanceResponse({ count: 9 }), { year: 2026, month: 8 })).toBe(false);
    expect(isGetStaffAttendanceShape(sampleAttendanceResponse(), { year: 2025, month: 8 })).toBe(false);
    expect(isGetStaffAttendanceShape(sampleAttendanceResponse(), { year: 2026, month: 7 })).toBe(false);
    expect(isGetStaffAttendanceShape(sampleAttendanceResponse({
      attendances: [{ ...sampleAttendanceResponse().data.attendances[0], date: '2026-13-10' }],
    }), { year: 2026, month: 8 })).toBe(false);
    expect(isGetStaffAttendanceShape({ success: true, attendances: [] }, { year: 2026, month: 8 })).toBe(false);
  });

  it('checkExisting validator: exists/no-exists/malformed', () => {
    expect(isCheckAttendanceCorrectionShape(sampleCheckResponse(), { date: '2026-08-10' })).toBe(true);
    expect(isCheckAttendanceCorrectionShape(sampleCheckResponse({ exists: true, status: 'pending', requestId: 'r1' }), { date: '2026-08-10' })).toBe(true);
    expect(isCheckAttendanceCorrectionShape(sampleCheckResponse({ exists: true, status: 'approved', requestId: 'r2' }), { date: '2026-08-10' })).toBe(true);
    expect(isCheckAttendanceCorrectionShape(sampleCheckResponse({ exists: true, status: 'rejected', requestId: 'r3' }), { date: '2026-08-10' })).toBe(true);
    expect(isCheckAttendanceCorrectionShape(sampleCheckResponse({ exists: false, status: 'pending', requestId: null }), { date: '2026-08-10' })).toBe(false);
    expect(isCheckAttendanceCorrectionShape(sampleCheckResponse({ exists: true, status: null, requestId: 'r1' }), { date: '2026-08-10' })).toBe(false);
    expect(isCheckAttendanceCorrectionShape(sampleCheckResponse({ exists: true, status: 'pending', requestId: null }), { date: '2026-08-10' })).toBe(false);
    expect(isCheckAttendanceCorrectionShape(sampleCheckResponse(), { date: '2026-08-11' })).toBe(false);
  });

  it('submit validator: normal/reused/malformed', () => {
    expect(isCreateAttendanceCorrectionShape(sampleSubmitResponse(), { clientNonce: 'nonce-1', date: '2026-08-10' })).toBe(true);
    expect(isCreateAttendanceCorrectionShape(sampleSubmitResponse({ reused: true }), { clientNonce: 'nonce-1', date: '2026-08-10' })).toBe(true);
    expect(isCreateAttendanceCorrectionShape(sampleSubmitResponse(), { clientNonce: 'nonce-x', date: '2026-08-10' })).toBe(false);
    expect(isCreateAttendanceCorrectionShape(sampleSubmitResponse(), { clientNonce: 'nonce-1', date: '2026-08-11' })).toBe(false);
    expect(isCreateAttendanceCorrectionShape(sampleSubmitResponse({ status: 'approved' }), { clientNonce: 'nonce-1', date: '2026-08-10' })).toBe(false);
    expect(isCreateAttendanceCorrectionShape(sampleSubmitResponse({ requestId: '' }), { clientNonce: 'nonce-1', date: '2026-08-10' })).toBe(false);
  });

  it('attendance mapper: operation aware', () => {
    expect(resolveUserFacingError({ operation: 'get_attendance_history', errorKey: 'ATTENDANCE_INTERNAL_ERROR' }).message)
      .toBe(MESSAGES.ATT_HISTORY_LOAD_FAILED);
    expect(resolveUserFacingError({ operation: 'check_attendance_correction', errorKey: 'ATTENDANCE_CORRECTION_CHECK_INTERNAL_ERROR' }).message)
      .toBe(MESSAGES.ATT_CORRECTION_STATUS_LOAD_FAILED);
    expect(resolveUserFacingError({ operation: 'submit_attendance_correction', errorKey: 'ATTENDANCE_CORRECTION_NONCE_CONFLICT' }).message)
      .toBe(MESSAGES.ATT_CORRECTION_NONCE_CONFLICT);
    expect(resolveUserFacingError({ operation: 'submit_attendance_correction', errorKey: 'STAFF_RETIRED' }).message)
      .toBe(MESSAGES.STAFF_REACTIVATION_REQUIRED);
  });

  it('correction outcome: success/confirmed_failure/result_unknown', () => {
    expect(classifySubmitAttendanceCorrectionOutcome({
      data: sampleSubmitResponse(),
      expectedNonce: 'nonce-1',
      expectedDate: '2026-08-10',
    }).outcome).toBe('success');
    expect(classifySubmitAttendanceCorrectionOutcome({
      error: { code: 'failed-precondition', details: { errorKey: 'ATTENDANCE_CORRECTION_ALREADY_EXISTS' } },
      expectedNonce: 'nonce-1',
      expectedDate: '2026-08-10',
    }).outcome).toBe('confirmed_failure');
    expect(classifySubmitAttendanceCorrectionOutcome({
      error: { code: 'internal', details: { errorKey: 'ATTENDANCE_CORRECTION_INTERNAL_ERROR' } },
      expectedNonce: 'nonce-1',
      expectedDate: '2026-08-10',
    }).outcome).toBe('result_unknown');
    expect(classifySubmitAttendanceCorrectionOutcome({
      error: { code: 'unavailable' },
      expectedNonce: 'nonce-1',
      expectedDate: '2026-08-10',
    }).outcome).toBe('result_unknown');
    expect(classifySubmitAttendanceCorrectionOutcome({
      data: sampleSubmitResponse({ clientNonce: 'mismatch' }),
      expectedNonce: 'nonce-1',
      expectedDate: '2026-08-10',
    }).outcome).toBe('result_unknown');
  });

  it('nonce guard and pending state transitions', () => {
    const pending = createAttendanceCorrectionPending('nonce-1', '2026-08-10', { date: '2026-08-10' }, 1);
    expect(getAttendanceCorrectionGuard(pending, false).allowNewNonce).toBe(false);
    expect(getAttendanceCorrectionGuard(pending, false).blockReason).toBe('busy');
    const unknown = transitionAttendanceCorrectionPending(pending, 'result_unknown');
    expect(unknown.pending.state).toBe('result_unknown');
    expect(getAttendanceCorrectionGuard(unknown.pending, false).blockReason).toBe('pending_lock');
    expect(transitionAttendanceCorrectionPending(pending, 'success').pending).toBeNull();
  });

  it('fresh confirmation resolver', () => {
    const pending = {
      clientNonce: 'nonce-1',
      date: '2026-08-10',
      payload: {},
      state: 'result_unknown',
      startedAt: 1,
    };
    const ok = resolveAttendanceCorrectionPendingFromFreshCheck(
      pending,
      { exists: true, date: '2026-08-10', status: 'pending', requestId: 'r1' },
      { preflightExistsWasFalse: true, fromStaleCache: false },
    );
    expect(ok.cleared).toBe(true);
    const stale = resolveAttendanceCorrectionPendingFromFreshCheck(
      pending,
      { exists: true, date: '2026-08-10', status: 'pending', requestId: 'r1' },
      { preflightExistsWasFalse: true, fromStaleCache: true },
    );
    expect(stale.cleared).toBe(false);
    const fail = resolveAttendanceCorrectionPendingFromFreshCheck(
      pending,
      { exists: false, date: '2026-08-10', status: null, requestId: null },
      { preflightExistsWasFalse: true, fromStaleCache: false },
    );
    expect(fail.cleared).toBe(false);
  });
});
