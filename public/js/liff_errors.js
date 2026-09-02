/**
 * LINE ミニアプリ共通エラー基盤（Phase L1 + L2 + L3 + L4）
 *
 * - 利用者表示には承認済み文言のみを使う
 * - error.message / stack / details / token / UID は表示モデルに含めない
 * - success は boolean true のみ
 * - browser: window.LiffErrors / Node(Jest): module.exports
 */
(function (root, factory) {
  var api = factory();
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
  if (typeof root !== 'undefined') {
    root.LiffErrors = api;
  }
})(typeof window !== 'undefined' ? window : typeof global !== 'undefined' ? global : this, function () {
  'use strict';

  var MESSAGES = {
    PROCESS: '処理に失敗しました。時間をおいてもう一度お試しください。',
    NETWORK: '通信できません。接続を確認して再度お試しください。',
    PERMISSION: 'この操作を行う権限がありません。',
    TIMEOUT: '処理に時間がかかっています。もう一度お試しください。',
    MALFORMED: '処理結果を確認できませんでした。もう一度お試しください。',
    RETRY: '再試行',
    RELOAD: '画面を更新して再度お試しください。',
    LIFF_SDK: 'LINEミニアプリを起動できませんでした。LINEアプリから開き直してください。',
    LIFF_INIT: 'アプリの起動に失敗しました。再試行してください。',
    LIFF_LOGIN: 'ログインが完了していません。もう一度お試しください。',
    LIFF_EXTERNAL: 'このブラウザでは利用できません。LINEアプリから開いてください。',
    AUTH_ID_TOKEN: 'ログイン情報を取得できませんでした。再試行してください。',
    AUTH_CUSTOM_TOKEN: '認証の準備に失敗しました。通信環境を確認して再試行してください。',
    AUTH_SIGNIN: '認証処理を完了できませんでした。再試行してください。',
    AUTH_NO_USER: '認証状態を確認できませんでした。再試行してください。',
    STAFF_LOGIN_RACE: 'ログイン処理を完了できませんでした。再試行してください。',
    STAFF_REG_CHECK: 'スタッフ情報を確認できませんでした。再試行してください。',
    // Phase L2
    USER_STATUS_FETCH: '登録状態を確認できませんでした。再試行してください。',
    USER_REGISTER_OK: '登録が完了しました。',
    USER_REGISTER_FAIL: '登録に失敗しました。再度お試しください。',
    USER_POKERNAME_DUP: 'このpokerNameは既に使われています。別の名前を入力してください。',
    USER_PIN_INVALID: 'PINは4桁の数字で入力してください。',
    CHECKIN_FETCH: '入店状況を確認できませんでした。再試行してください。',
    CHECKIN_UNKNOWN: '確認できません',
    QR_LOAD: 'QRコードを表示できませんでした。再試行してください。',
    QR_GENERATE: 'QRコードを更新できませんでした。しばらくしてから再度お試しください。',
    QR_AUTH: 'ログイン情報を確認できませんでした。再試行してください。',
    QR_NO_USER: 'ユーザー情報が見つかりません。登録が完了しているか確認してください。',
    PROFILE_LOAD: 'プロフィール情報を取得できませんでした。再試行してください。',
    PROFILE_MISSING: 'ユーザー情報が見つかりません。登録が完了しているか確認してください。',
    BALANCE_CONFIG: '残高の表示設定を取得できませんでした。',
    BALANCE_CORRUPT: 'データ不整合',
    // Phase L3（承認済み・句読点含め固定）
    MENU_LOAD_FAIL: 'メニューを取得できませんでした。再試行してください。',
    MENU_CATEGORY_EMPTY: 'このカテゴリーにはメニューがありません',
    CART_EMPTY: 'カートが空です',
    ORDER_NOT_STAYING: '入店後に注文できます。',
    ORDER_STAY_UNKNOWN: '入店状況を確認できませんでした。再試行してください。',
    ORDER_BILL_UNAVAILABLE: '現在は注文できません。入店状況を確認してください。',
    ORDER_AUTH: 'ログイン情報を確認できませんでした。ページを再読み込みしてください。',
    ORDER_ITEM_BAD: '現在注文できない商品が含まれています。カートを確認してください。',
    ORDER_ITEM_SOLD_OUT: '売り切れの商品が含まれています。カートを確認してください。',
    ORDER_QUANTITY_INVALID: '商品の数量は、1商品につき1〜99個で指定してください。',
    ORDER_NONCE_REQUIRED: '注文を送信できませんでした。ページを再読み込みしてください。',
    ORDER_NONCE_CONFLICT: '注文内容を確認できませんでした。ページを再読み込みしてください。',
    ORDER_SUCCESS: '注文を受け付けました。',
    ORDER_FAIL: '注文を送信できませんでした。',
    ORDER_RESULT_UNKNOWN:
      '注文が受け付けられたか確認できません。注文履歴を確認するか、店員にお尋ねください。',
    ORDER_HISTORY_FAIL: '注文履歴を取得できませんでした。再試行してください。',
    ORDER_HISTORY_EMPTY: '本日の注文履歴はありません',
    // Phase L4 tournament（承認済み・句読点含め完全一致）
    TOUR_LIST_LOAD_FAILED: 'トーナメント情報を取得できませんでした。再試行してください。',
    TOUR_TODAY_EMPTY: '本日のトーナメント予定はありません。',
    TOUR_UPCOMING_EMPTY: '今後のトーナメントはありません。',
    TOUR_CALENDAR_DATE_EMPTY: '選択した日のトーナメント予定はありません。',
    TOUR_AUTH_FAILED: 'ログイン情報を確認できませんでした。ページを再読み込みしてください。',
    TOUR_NOT_STAYING: '入店後に参加登録できます。',
    TOUR_STAY_UNKNOWN: '入店状況を確認できませんでした。再試行してください。',
    TOUR_REGISTRATION_NOT_STARTED: '参加受付はまだ開始されていません。',
    TOUR_REGISTRATION_CLOSED: '参加受付は終了しました。',
    TOUR_PAUSED: '現在、参加受付を一時停止しています。',
    TOUR_ENDED: 'このトーナメントは終了しました。',
    TOUR_CANCELLED: 'このトーナメントは中止されました。',
    TOUR_NOT_TODAY: 'このトーナメントには本日参加登録できません。',
    TOUR_LIFF_REGISTRATION_DISABLED: 'このトーナメントはLINEから参加登録できません。',
    TOUR_INVALID_STATE: '現在、このトーナメントには参加登録できません。',
    TOUR_ALREADY_REGISTERED: 'すでに参加登録済みです。',
    TOUR_OKIBAKE_CONFLICT: '店舗で登録済みのため、LINEからは参加登録できません。',
    TOUR_NONCE_REQUIRED: '参加登録を送信できませんでした。ページを再読み込みしてください。',
    TOUR_NONCE_CONFLICT: '参加登録の内容を確認できませんでした。ページを再読み込みしてください。',
    TOUR_REGISTRATION_SUCCESS: '参加登録が完了しました。',
    TOUR_REGISTRATION_FAILED: '参加登録できませんでした。',
    TOUR_REGISTRATION_RESULT_UNKNOWN:
      '参加登録が受け付けられたか確認できません。トーナメント一覧を確認するか、店員にお尋ねください。',
    TOUR_PENDING_LOCK:
      '参加登録の結果を確認できません。再度操作せず、参加状態を確認してください。',
    TOUR_FEE_INVALID:
      '参加費を確認できないため、参加登録できません。店員にお尋ねください。',
    TOUR_BTN_REGISTER: '参加登録',
    TOUR_BTN_SUBMITTING: '登録中…',
    TOUR_BTN_REGISTERED: '参加済み',
    TOUR_BTN_CLOSED: '受付終了',
    TOUR_BTN_PAUSED: '受付停止中',
    TOUR_BTN_ENDED: '終了',
    TOUR_BTN_CANCELLED: '中止',
    // Phase L5 staff（承認済み・句読点含め完全一致）
    STAFF_REG_SUCCESS: 'スタッフ登録が完了しました。',
    STAFF_ALREADY_REGISTERED: 'すでにスタッフ登録済みです。',
    STAFF_REG_FAILED: 'スタッフ登録できませんでした。',
    STAFF_REG_RESULT_UNKNOWN:
      'スタッフ登録の結果を確認できません。再度操作せず、登録状態を確認してください。',
    STAFF_REACTIVATION_REQUIRED: 'スタッフの再登録が必要です。',
    STAFF_REG_NONCE_REQUIRED:
      'スタッフ登録を送信できませんでした。ページを再読み込みしてください。',
    STAFF_REG_NONCE_CONFLICT:
      'スタッフ登録の内容を確認できませんでした。ページを再読み込みしてください。',
    STAFF_NAME_KANA_DUPLICATE:
      '同じ氏名のスタッフがすでに登録されています。店員または管理者に確認してください。',
    STAFF_INVALID_ARGUMENT: '入力内容を確認してください。',
    STAFF_REACTIVATION_SUCCESS: 'スタッフの再登録が完了しました。',
    STAFF_REACTIVATION_FAILED: 'スタッフの再登録ができませんでした。',
    STAFF_REACTIVATION_RESULT_UNKNOWN:
      'スタッフの再登録結果を確認できません。再度操作せず、登録状態を確認してください。',
    STAFF_REACTIVATION_NONCE_REQUIRED:
      '再登録を送信できませんでした。ページを再読み込みしてください。',
    STAFF_REACTIVATION_NONCE_CONFLICT:
      '再登録の内容を確認できませんでした。ページを再読み込みしてください。',
    STAFF_NOT_FOUND_REACTIVATE:
      'スタッフ情報が見つかりません。スタッフ登録を行ってください。',
    STAFF_NOT_FOUND_QR:
      'スタッフ情報が見つからないため、QRコードを表示できません。',
    STAFF_AUTH_FAILED:
      'ログイン情報を確認できませんでした。ページを再読み込みしてください。',
    STAFF_PROFILE_NOT_FOUND: 'スタッフ情報が見つかりません。',
    STAFF_PROFILE_LOAD_FAILED:
      'プロフィール情報を取得できませんでした。再試行してください。',
    STAFF_QR_LOAD_FAILED: 'QRコードを表示できませんでした。再試行してください。',
    STAFF_QR_REFRESH_FAILED:
      'QRコードを更新できませんでした。しばらくしてから再度お試しください。',
    STAFF_QR_EXPIRED: 'QRコードの有効期限が切れました。更新してください。',
    STAFF_QR_COOLDOWN: 'しばらく待ってから更新してください。',
    STAFF_QR_RETIRED: 'スタッフの再登録後にQRコードを利用できます。',
    STAFF_QR_INVALID_TYPE:
      'QRコードを表示できませんでした。ページを再読み込みしてください。',
    STAFF_BTN_REGISTER: 'スタッフ登録',
    STAFF_BTN_REGISTER_BUSY: '登録中…',
    STAFF_BTN_REACTIVATE: '再登録する',
    STAFF_BTN_REACTIVATE_BUSY: '再登録中…',
    STAFF_BTN_QR_REFRESH: 'QRコードを更新',
    STAFF_BTN_QR_BUSY: '更新中…',
    STAFF_QR_EXPIRED_SHORT: '有効期限切れ',
    STAFF_QR_LOADING: 'QRコードを読み込んでいます…',
    // Phase L6 staff shift（承認済み・句読点含め完全一致）
    SHIFT_SUBMIT_SUCCESS: 'シフト希望を提出しました。',
    SHIFT_SUBMIT_FAILED: 'シフト希望を提出できませんでした。再度お試しください。',
    SHIFT_SUBMIT_RESULT_UNKNOWN:
      'シフト希望の提出結果を確認できません。再度操作せず、提出状況を確認してください。',
    SHIFT_SUBMIT_NONCE_REQUIRED:
      'シフト希望を送信できませんでした。ページを再読み込みしてください。',
    SHIFT_SUBMIT_NONCE_CONFLICT:
      'シフト希望の内容を確認できませんでした。ページを再読み込みしてください。',
    SHIFT_INVALID_ARGUMENT: '入力内容を確認してください。',
    SHIFT_EMPTY_INPUT: 'シフト希望を入力してください。',
    SHIFT_TIME_REQUIRED: '開始時刻と終了時刻を入力してください。',
    SHIFT_TIME_ORDER_INVALID: '終了時刻は開始時刻より後に設定してください。',
    SHIFT_NOT_NEXT_MONTH: 'シフト希望は翌月分のみ提出できます。',
    SHIFT_REQUEST_ALREADY_CONFIRMED:
      'このシフトはすでに確定されているため変更できません。',
    SHIFT_REQUEST_NOT_EDITABLE: 'このシフト希望は現在変更できません。',
    SHIFT_MONTH_FINALIZED:
      '翌月のシフトはすでに確定されているため、シフト希望を変更できません。',
    SHIFT_SCHEDULING_PERIOD_RESTRICTED:
      '現在はシフト希望を追加・変更できません。',
    SHIFT_DATE_NOT_INSUFFICIENT: '現在この日はシフト希望を追加・変更できません。',
    SHIFT_BUSINESS_HOURS_UNAVAILABLE:
      '営業時間を確認できませんでした。再試行してください。',
    SHIFT_BUSINESS_DAY_CLOSED:
      'この日は店休日のため、シフト希望を提出できません。',
    SHIFT_TIME_OUTSIDE_BUSINESS_HOURS:
      '営業時間内でシフト時間を指定してください。',
    SHIFT_AUTH_FAILED:
      'ログイン情報を確認できませんでした。ページを再読み込みしてください。',
    SHIFT_SUBMITTED_LOAD_FAILED:
      '提出済みのシフト希望を取得できませんでした。再試行してください。',
    SHIFT_SUBMITTED_EMPTY: '提出済みのシフト希望はありません。',
    SHIFT_CONFIRMED_LOAD_FAILED:
      '確定シフトを取得できませんでした。再試行してください。',
    SHIFT_CONFIRMED_EMPTY: '確定しているシフトはありません。',
    SHIFT_PENDING_STATUS_LOAD_FAILED:
      'シフト希望の提出状況を確認できませんでした。再試行してください。',
    SHIFT_PAGE_LOAD_FAILED:
      'シフト情報を取得できませんでした。再試行してください。',
    SHIFT_BTN_SUBMIT: 'シフト希望を提出',
    SHIFT_BTN_SUBMITTING: '提出中…',
    SHIFT_LOADING_PAGE: 'シフト情報を読み込んでいます…',
    SHIFT_LOADING_CONFIRMED: '確定シフトを読み込んでいます…',
    SHIFT_LOADING_SUBMITTED: 'シフト希望を読み込んでいます…',
    SHIFT_LOADING_BH: '営業時間を確認しています…',
    SHIFT_CLOSED_DAY_SHORT: '店休日',
    // Phase L7 staff attendance（承認済み文言）
    ATT_HISTORY_LOAD_FAILED: '勤怠履歴を取得できませんでした。再試行してください。',
    ATT_HISTORY_EMPTY_DAY: 'この日の勤怠記録はありません。',
    ATT_HISTORY_EMPTY_MONTH: 'この月の勤怠記録はありません。',
    ATT_PAGE_LOAD_FAILED: '勤怠情報を取得できませんでした。再試行してください。',
    ATT_CORRECTION_SUCCESS: '勤怠修正を申請しました。',
    ATT_CORRECTION_FAILED: '勤怠修正を申請できませんでした。再度お試しください。',
    ATT_CORRECTION_RESULT_UNKNOWN:
      '勤怠修正申請の結果を確認できません。再度操作せず、申請状況を確認してください。',
    ATT_CORRECTION_NONCE_REQUIRED:
      '勤怠修正申請を送信できませんでした。ページを再読み込みしてください。',
    ATT_CORRECTION_NONCE_CONFLICT:
      '勤怠修正申請の内容を確認できませんでした。ページを再読み込みしてください。',
    ATT_CORRECTION_ALREADY_EXISTS: 'この日の勤怠修正はすでに申請されています。',
    ATT_CORRECTION_STATUS_LOAD_FAILED:
      '勤怠修正の申請状況を確認できませんでした。再試行してください。',
    ATT_INVALID_ARGUMENT: '入力内容を確認してください。',
    ATT_LOADING_PAGE: '勤怠情報を読み込んでいます…',
    ATT_LOADING_HISTORY: '勤怠履歴を読み込んでいます…',
    ATT_LOADING_CORRECTION_STATUS: '申請状況を確認しています…',
    ATT_BTN_SUBMIT: '勤怠修正を申請',
    ATT_BTN_SUBMITTING: '申請中…',
  };

  var CODE_MESSAGES = {
    unavailable: MESSAGES.NETWORK,
    'permission-denied': MESSAGES.PERMISSION,
    unauthenticated: MESSAGES.AUTH_NO_USER,
    'deadline-exceeded': MESSAGES.TIMEOUT,
    internal: MESSAGES.PROCESS,
    'invalid-argument': MESSAGES.MALFORMED,
    'failed-precondition': MESSAGES.PROCESS,
    'not-found': MESSAGES.PROCESS,
    'already-exists': MESSAGES.PROCESS,
  };

  /** stage → 表示（承認済みのみ） */
  var STAGE_CATALOG = {
    'liff.sdk_missing': {
      message: MESSAGES.LIFF_SDK,
      action: null,
      kind: 'liff',
    },
    'liff.init': {
      message: MESSAGES.LIFF_INIT,
      action: 'retry',
      kind: 'liff',
    },
    'liff.login': {
      message: MESSAGES.LIFF_LOGIN,
      action: 'retry',
      kind: 'liff',
    },
    'liff.external': {
      message: MESSAGES.LIFF_EXTERNAL,
      action: null,
      kind: 'liff',
    },
    'auth.id_token': {
      message: MESSAGES.AUTH_ID_TOKEN,
      action: 'retry',
      kind: 'auth',
    },
    'auth.custom_token': {
      message: MESSAGES.AUTH_CUSTOM_TOKEN,
      action: 'retry',
      kind: 'auth',
    },
    'auth.custom_token_malformed': {
      message: MESSAGES.MALFORMED,
      action: 'retry',
      kind: 'malformed',
    },
    'auth.signin': {
      message: MESSAGES.AUTH_SIGNIN,
      action: 'retry',
      kind: 'auth',
    },
    'auth.timeout': {
      message: MESSAGES.TIMEOUT,
      action: 'retry',
      kind: 'timeout',
    },
    'auth.no_user': {
      message: MESSAGES.AUTH_NO_USER,
      action: 'retry',
      kind: 'auth',
    },
    'staff.login_race': {
      message: MESSAGES.STAFF_LOGIN_RACE,
      action: 'retry',
      kind: 'auth',
    },
    'staff.reg_check': {
      message: MESSAGES.STAFF_REG_CHECK,
      action: 'retry',
      kind: 'unknown',
    },
    'init.timeout': {
      message: MESSAGES.TIMEOUT,
      action: 'retry',
      kind: 'timeout',
    },
    'init.generic': {
      message: MESSAGES.LIFF_INIT,
      action: 'retry',
      kind: 'unknown',
    },
  };

  /** operation 共通 */
  var OPERATION_MESSAGES = {
    liff_init: MESSAGES.LIFF_INIT,
    auth: MESSAGES.AUTH_SIGNIN,
    staff_reg_check: MESSAGES.STAFF_REG_CHECK,
    user_registration_check: MESSAGES.USER_STATUS_FETCH,
    create_user_account: MESSAGES.USER_REGISTER_FAIL,
    get_user_status: MESSAGES.CHECKIN_FETCH,
    qr_display: MESSAGES.QR_LOAD,
    generate_qr: MESSAGES.QR_GENERATE,
    profile_load: MESSAGES.PROFILE_LOAD,
    balance_config: MESSAGES.BALANCE_CONFIG,
    get_menu_items: MESSAGES.MENU_LOAD_FAIL,
    order_stay_check: MESSAGES.ORDER_STAY_UNKNOWN,
    place_order_by_user: MESSAGES.ORDER_FAIL,
    get_user_order_history: MESSAGES.ORDER_HISTORY_FAIL,
    get_today_tournaments: MESSAGES.TOUR_LIST_LOAD_FAILED,
    get_upcoming_tournaments: MESSAGES.TOUR_LIST_LOAD_FAILED,
    get_upcoming_tournaments_calendar: MESSAGES.TOUR_LIST_LOAD_FAILED,
    tournament_stay_check: MESSAGES.TOUR_STAY_UNKNOWN,
    register_for_tournament: MESSAGES.TOUR_REGISTRATION_FAILED,
    get_staff_status: MESSAGES.STAFF_REG_CHECK,
    create_staff_account: MESSAGES.STAFF_REG_FAILED,
    reactivate_staff_account: MESSAGES.STAFF_REACTIVATION_FAILED,
    get_staff_profile: MESSAGES.STAFF_PROFILE_LOAD_FAILED,
    staff_qr_display: MESSAGES.STAFF_QR_LOAD_FAILED,
    generate_staff_qr: MESSAGES.STAFF_QR_REFRESH_FAILED,
    get_shift_page_data: MESSAGES.SHIFT_PAGE_LOAD_FAILED,
    get_shift_business_hours: MESSAGES.SHIFT_BUSINESS_HOURS_UNAVAILABLE,
    get_shift_pending_status: MESSAGES.SHIFT_PENDING_STATUS_LOAD_FAILED,
    get_submitted_shifts: MESSAGES.SHIFT_SUBMITTED_LOAD_FAILED,
    get_confirmed_shifts: MESSAGES.SHIFT_CONFIRMED_LOAD_FAILED,
    submit_shift_requests: MESSAGES.SHIFT_SUBMIT_FAILED,
    get_attendance_page: MESSAGES.ATT_PAGE_LOAD_FAILED,
    get_attendance_history: MESSAGES.ATT_HISTORY_LOAD_FAILED,
    check_attendance_correction: MESSAGES.ATT_CORRECTION_STATUS_LOAD_FAILED,
    submit_attendance_correction: MESSAGES.ATT_CORRECTION_FAILED,
  };

  /** errorKey */
  var ERROR_KEY_MESSAGES = {
    USER_AUTH_CUSTOM_TOKEN_FAILED: MESSAGES.AUTH_CUSTOM_TOKEN,
    USER_VISIT_STATUS_FETCH_FAILED: MESSAGES.CHECKIN_FETCH,
    USER_VISIT_QR_GENERATE_FAILED: MESSAGES.QR_GENERATE,
    USER_VISIT_QR_GENERATE_TRANSACTION_FAILED: MESSAGES.QR_GENERATE,
    ORDER_UNAUTHENTICATED: MESSAGES.ORDER_AUTH,
    ORDER_NONCE_REQUIRED: MESSAGES.ORDER_NONCE_REQUIRED,
    ORDER_NONCE_CONFLICT: MESSAGES.ORDER_NONCE_CONFLICT,
    ORDER_ACTIVE_BILL_NOT_FOUND: MESSAGES.ORDER_BILL_UNAVAILABLE,
    ORDER_BILL_NOT_OPEN: MESSAGES.ORDER_BILL_UNAVAILABLE,
    ORDER_ITEM_NOT_FOUND: MESSAGES.ORDER_ITEM_BAD,
    ORDER_ITEM_UNAVAILABLE: MESSAGES.ORDER_ITEM_BAD,
    ORDER_PRICE_INVALID: MESSAGES.ORDER_ITEM_BAD,
    ORDER_ITEM_SOLD_OUT: MESSAGES.ORDER_ITEM_SOLD_OUT,
    ORDER_QUANTITY_INVALID: MESSAGES.ORDER_QUANTITY_INVALID,
    ORDER_INTERNAL_ERROR: MESSAGES.ORDER_RESULT_UNKNOWN,
    TOURNAMENT_UNAUTHENTICATED: MESSAGES.TOUR_AUTH_FAILED,
    TOURNAMENT_NONCE_REQUIRED: MESSAGES.TOUR_NONCE_REQUIRED,
    TOURNAMENT_NONCE_CONFLICT: MESSAGES.TOUR_NONCE_CONFLICT,
    TOURNAMENT_LIFF_REGISTRATION_DISABLED: MESSAGES.TOUR_LIFF_REGISTRATION_DISABLED,
    TOURNAMENT_INVALID_STATE: MESSAGES.TOUR_INVALID_STATE,
    TOURNAMENT_CANCELLED: MESSAGES.TOUR_CANCELLED,
    TOURNAMENT_ENDED: MESSAGES.TOUR_ENDED,
    TOURNAMENT_PAUSED: MESSAGES.TOUR_PAUSED,
    TOURNAMENT_REGISTRATION_CLOSED: MESSAGES.TOUR_REGISTRATION_CLOSED,
    TOURNAMENT_NOT_TODAY: MESSAGES.TOUR_NOT_TODAY,
    TOURNAMENT_ALREADY_REGISTERED: MESSAGES.TOUR_ALREADY_REGISTERED,
    TOURNAMENT_PARTICIPANT_CONFLICT_WITH_OKIBAKE: MESSAGES.TOUR_OKIBAKE_CONFLICT,
    TOURNAMENT_ACTIVE_BILL_NOT_FOUND: MESSAGES.TOUR_NOT_STAYING,
    TOURNAMENT_BILL_NOT_OPEN: MESSAGES.TOUR_NOT_STAYING,
    TOURNAMENT_FEE_INVALID: MESSAGES.TOUR_FEE_INVALID,
    TOURNAMENT_INTERNAL_ERROR: MESSAGES.TOUR_REGISTRATION_RESULT_UNKNOWN,
    STAFF_UNAUTHENTICATED: MESSAGES.STAFF_AUTH_FAILED,
    STAFF_REGISTRATION_NONCE_REQUIRED: MESSAGES.STAFF_REG_NONCE_REQUIRED,
    STAFF_REGISTRATION_NONCE_CONFLICT: MESSAGES.STAFF_REG_NONCE_CONFLICT,
    STAFF_REACTIVATION_REQUIRED: MESSAGES.STAFF_REACTIVATION_REQUIRED,
    STAFF_NAME_KANA_ALREADY_EXISTS: MESSAGES.STAFF_NAME_KANA_DUPLICATE,
    STAFF_INVALID_ARGUMENT: MESSAGES.STAFF_INVALID_ARGUMENT,
    STAFF_INTERNAL_ERROR: MESSAGES.STAFF_REG_RESULT_UNKNOWN,
    STAFF_REACTIVATION_NONCE_REQUIRED: MESSAGES.STAFF_REACTIVATION_NONCE_REQUIRED,
    STAFF_REACTIVATION_NONCE_CONFLICT: MESSAGES.STAFF_REACTIVATION_NONCE_CONFLICT,
    STAFF_NOT_RETIRED: MESSAGES.STAFF_ALREADY_REGISTERED,
    STAFF_NOT_FOUND: MESSAGES.STAFF_PROFILE_NOT_FOUND,
    STAFF_RETIRED: MESSAGES.STAFF_QR_RETIRED,
    STAFF_NOT_ACTIVE: MESSAGES.STAFF_PROFILE_NOT_FOUND,
    SHIFT_UNAUTHENTICATED: MESSAGES.SHIFT_AUTH_FAILED,
    SHIFT_SUBMIT_NONCE_REQUIRED: MESSAGES.SHIFT_SUBMIT_NONCE_REQUIRED,
    SHIFT_SUBMIT_NONCE_CONFLICT: MESSAGES.SHIFT_SUBMIT_NONCE_CONFLICT,
    SHIFT_INVALID_ARGUMENT: MESSAGES.SHIFT_INVALID_ARGUMENT,
    SHIFT_NOT_NEXT_MONTH: MESSAGES.SHIFT_NOT_NEXT_MONTH,
    SHIFT_REQUEST_NOT_EDITABLE: MESSAGES.SHIFT_REQUEST_NOT_EDITABLE,
    SHIFT_REQUEST_ALREADY_CONFIRMED: MESSAGES.SHIFT_REQUEST_ALREADY_CONFIRMED,
    SHIFT_MONTH_FINALIZED: MESSAGES.SHIFT_MONTH_FINALIZED,
    SHIFT_SCHEDULING_PERIOD_RESTRICTED: MESSAGES.SHIFT_SCHEDULING_PERIOD_RESTRICTED,
    SHIFT_DATE_NOT_INSUFFICIENT: MESSAGES.SHIFT_DATE_NOT_INSUFFICIENT,
    SHIFT_BUSINESS_HOURS_UNAVAILABLE: MESSAGES.SHIFT_BUSINESS_HOURS_UNAVAILABLE,
    SHIFT_BUSINESS_DAY_CLOSED: MESSAGES.SHIFT_BUSINESS_DAY_CLOSED,
    SHIFT_TIME_OUTSIDE_BUSINESS_HOURS: MESSAGES.SHIFT_TIME_OUTSIDE_BUSINESS_HOURS,
    SHIFT_INTERNAL_ERROR: MESSAGES.SHIFT_SUBMIT_RESULT_UNKNOWN,
    ATTENDANCE_UNAUTHENTICATED: MESSAGES.STAFF_AUTH_FAILED,
    ATTENDANCE_INVALID_ARGUMENT: MESSAGES.ATT_INVALID_ARGUMENT,
    ATTENDANCE_INTERNAL_ERROR: MESSAGES.ATT_PAGE_LOAD_FAILED,
    ATTENDANCE_CORRECTION_NONCE_REQUIRED: MESSAGES.ATT_CORRECTION_NONCE_REQUIRED,
    ATTENDANCE_CORRECTION_NONCE_CONFLICT: MESSAGES.ATT_CORRECTION_NONCE_CONFLICT,
    ATTENDANCE_CORRECTION_ALREADY_EXISTS: MESSAGES.ATT_CORRECTION_ALREADY_EXISTS,
    ATTENDANCE_CORRECTION_INTERNAL_ERROR: MESSAGES.ATT_CORRECTION_RESULT_UNKNOWN,
    ATTENDANCE_CORRECTION_CHECK_INTERNAL_ERROR: MESSAGES.ATT_CORRECTION_STATUS_LOAD_FAILED,
    STAFF_RETIRED: MESSAGES.STAFF_REACTIVATION_REQUIRED,
    STAFF_NOT_ACTIVE: MESSAGES.STAFF_PROFILE_NOT_FOUND,
    QR_UNAUTHENTICATED: MESSAGES.STAFF_AUTH_FAILED,
    QR_INVALID_TYPE: MESSAGES.STAFF_QR_INVALID_TYPE,
    QR_INTERNAL_ERROR: MESSAGES.STAFF_QR_REFRESH_FAILED,
    USER_NOT_FOUND: MESSAGES.STAFF_QR_LOAD_FAILED,
  };

  /**
   * operation + errorKey
   * key 形式: `${operation}::${errorKey}`
   */
  var OPERATION_ERROR_KEY_MESSAGES = {
    'auth::USER_AUTH_CUSTOM_TOKEN_FAILED': MESSAGES.AUTH_CUSTOM_TOKEN,
    'get_user_status::USER_VISIT_STATUS_FETCH_FAILED': MESSAGES.CHECKIN_FETCH,
    'generate_qr::USER_VISIT_QR_GENERATE_FAILED': MESSAGES.QR_GENERATE,
    'generate_qr::USER_VISIT_QR_GENERATE_TRANSACTION_FAILED': MESSAGES.QR_GENERATE,
    'get_today_tournaments::TOURNAMENT_INTERNAL_ERROR': MESSAGES.TOUR_LIST_LOAD_FAILED,
    'get_upcoming_tournaments::TOURNAMENT_INTERNAL_ERROR': MESSAGES.TOUR_LIST_LOAD_FAILED,
    'get_upcoming_tournaments_calendar::TOURNAMENT_INTERNAL_ERROR':
      MESSAGES.TOUR_LIST_LOAD_FAILED,
    'register_for_tournament::TOURNAMENT_INTERNAL_ERROR':
      MESSAGES.TOUR_REGISTRATION_RESULT_UNKNOWN,
    'create_staff_account::STAFF_INTERNAL_ERROR': MESSAGES.STAFF_REG_RESULT_UNKNOWN,
    'reactivate_staff_account::STAFF_INTERNAL_ERROR':
      MESSAGES.STAFF_REACTIVATION_RESULT_UNKNOWN,
    'reactivate_staff_account::STAFF_NOT_FOUND': MESSAGES.STAFF_NOT_FOUND_REACTIVATE,
    'generate_staff_qr::STAFF_NOT_FOUND': MESSAGES.STAFF_NOT_FOUND_QR,
    'staff_qr_display::STAFF_NOT_FOUND': MESSAGES.STAFF_NOT_FOUND_QR,
    'generate_staff_qr::STAFF_RETIRED': MESSAGES.STAFF_QR_RETIRED,
    'staff_qr_display::STAFF_RETIRED': MESSAGES.STAFF_QR_RETIRED,
    'generate_staff_qr::QR_INTERNAL_ERROR': MESSAGES.STAFF_QR_REFRESH_FAILED,
    'staff_qr_display::QR_INTERNAL_ERROR': MESSAGES.STAFF_QR_LOAD_FAILED,
    'get_staff_profile::STAFF_NOT_FOUND': MESSAGES.STAFF_PROFILE_NOT_FOUND,
    'submit_shift_requests::SHIFT_INTERNAL_ERROR': MESSAGES.SHIFT_SUBMIT_RESULT_UNKNOWN,
    'submit_shift_requests::STAFF_RETIRED': MESSAGES.STAFF_REACTIVATION_REQUIRED,
    'submit_shift_requests::STAFF_NOT_ACTIVE': MESSAGES.STAFF_PROFILE_NOT_FOUND,
    'get_submitted_shifts::SHIFT_INTERNAL_ERROR': MESSAGES.SHIFT_SUBMITTED_LOAD_FAILED,
    'get_confirmed_shifts::SHIFT_INTERNAL_ERROR': MESSAGES.SHIFT_CONFIRMED_LOAD_FAILED,
    'get_shift_pending_status::SHIFT_INTERNAL_ERROR':
      MESSAGES.SHIFT_PENDING_STATUS_LOAD_FAILED,
    'get_shift_page_data::SHIFT_INTERNAL_ERROR': MESSAGES.SHIFT_PAGE_LOAD_FAILED,
    'get_shift_business_hours::SHIFT_INTERNAL_ERROR':
      MESSAGES.SHIFT_BUSINESS_HOURS_UNAVAILABLE,
    'get_attendance_history::ATTENDANCE_INTERNAL_ERROR': MESSAGES.ATT_HISTORY_LOAD_FAILED,
    'get_attendance_page::ATTENDANCE_INTERNAL_ERROR': MESSAGES.ATT_PAGE_LOAD_FAILED,
    'check_attendance_correction::ATTENDANCE_CORRECTION_CHECK_INTERNAL_ERROR':
      MESSAGES.ATT_CORRECTION_STATUS_LOAD_FAILED,
    'submit_attendance_correction::ATTENDANCE_INVALID_ARGUMENT': MESSAGES.ATT_INVALID_ARGUMENT,
    'submit_attendance_correction::ATTENDANCE_CORRECTION_INTERNAL_ERROR':
      MESSAGES.ATT_CORRECTION_RESULT_UNKNOWN,
  };

  /**
   * operation + code（業務 code が汎用 CODE より文脈が明確な場合）
   * createUserAccount の already-exists は pokerName 重複のみ（Functions 実コード確認済み）
   * invalid-argument は項目特定不可のため登録一般失敗へ
   */
  var OPERATION_CODE_MESSAGES = {
    'create_user_account::already-exists': MESSAGES.USER_POKERNAME_DUP,
    'create_user_account::invalid-argument': MESSAGES.USER_REGISTER_FAIL,
    'place_order_by_user::unauthenticated': MESSAGES.ORDER_AUTH,
    'register_for_tournament::unauthenticated': MESSAGES.TOUR_AUTH_FAILED,
    'create_staff_account::unauthenticated': MESSAGES.STAFF_AUTH_FAILED,
    'reactivate_staff_account::unauthenticated': MESSAGES.STAFF_AUTH_FAILED,
    'generate_staff_qr::unauthenticated': MESSAGES.STAFF_AUTH_FAILED,
    'staff_qr_display::unauthenticated': MESSAGES.STAFF_AUTH_FAILED,
    'submit_shift_requests::unauthenticated': MESSAGES.SHIFT_AUTH_FAILED,
    'get_submitted_shifts::unauthenticated': MESSAGES.SHIFT_AUTH_FAILED,
    'get_confirmed_shifts::unauthenticated': MESSAGES.SHIFT_AUTH_FAILED,
  };

  /** 書込み0件が契約上保証される確定失敗 errorKey */
  var ORDER_CONFIRMED_FAILURE_KEYS = {
    ORDER_UNAUTHENTICATED: true,
    ORDER_NONCE_REQUIRED: true,
    ORDER_NONCE_CONFLICT: true,
    ORDER_ACTIVE_BILL_NOT_FOUND: true,
    ORDER_BILL_NOT_OPEN: true,
    ORDER_ITEM_NOT_FOUND: true,
    ORDER_ITEM_SOLD_OUT: true,
    ORDER_ITEM_UNAVAILABLE: true,
    ORDER_QUANTITY_INVALID: true,
    ORDER_PRICE_INVALID: true,
  };

  var TOURNAMENT_CONFIRMED_FAILURE_KEYS = {
    TOURNAMENT_UNAUTHENTICATED: true,
    TOURNAMENT_NONCE_REQUIRED: true,
    TOURNAMENT_NONCE_CONFLICT: true,
    TOURNAMENT_LIFF_REGISTRATION_DISABLED: true,
    TOURNAMENT_INVALID_STATE: true,
    TOURNAMENT_CANCELLED: true,
    TOURNAMENT_ENDED: true,
    TOURNAMENT_PAUSED: true,
    TOURNAMENT_REGISTRATION_CLOSED: true,
    TOURNAMENT_NOT_TODAY: true,
    TOURNAMENT_ALREADY_REGISTERED: true,
    TOURNAMENT_PARTICIPANT_CONFLICT_WITH_OKIBAKE: true,
    TOURNAMENT_ACTIVE_BILL_NOT_FOUND: true,
    TOURNAMENT_BILL_NOT_OPEN: true,
    TOURNAMENT_FEE_INVALID: true,
    USER_MIGRATED: true,
    INVALID_USER_TYPE: true,
  };

  var STAFF_CREATE_CONFIRMED_FAILURE_KEYS = {
    STAFF_UNAUTHENTICATED: true,
    STAFF_REGISTRATION_NONCE_REQUIRED: true,
    STAFF_REGISTRATION_NONCE_CONFLICT: true,
    STAFF_REACTIVATION_REQUIRED: true,
    STAFF_NAME_KANA_ALREADY_EXISTS: true,
    STAFF_INVALID_ARGUMENT: true,
    USER_MIGRATED: true,
    INVALID_USER_TYPE: true,
  };

  var STAFF_REACTIVATE_CONFIRMED_FAILURE_KEYS = {
    STAFF_UNAUTHENTICATED: true,
    STAFF_REACTIVATION_NONCE_REQUIRED: true,
    STAFF_REACTIVATION_NONCE_CONFLICT: true,
    STAFF_NOT_RETIRED: true,
    STAFF_NOT_FOUND: true,
    STAFF_NAME_KANA_ALREADY_EXISTS: true,
    STAFF_INVALID_ARGUMENT: true,
    USER_MIGRATED: true,
    INVALID_USER_TYPE: true,
  };

  var SHIFT_SUBMIT_CONFIRMED_FAILURE_KEYS = {
    SHIFT_UNAUTHENTICATED: true,
    SHIFT_SUBMIT_NONCE_REQUIRED: true,
    SHIFT_SUBMIT_NONCE_CONFLICT: true,
    SHIFT_INVALID_ARGUMENT: true,
    SHIFT_NOT_NEXT_MONTH: true,
    SHIFT_REQUEST_NOT_EDITABLE: true,
    SHIFT_REQUEST_ALREADY_CONFIRMED: true,
    SHIFT_MONTH_FINALIZED: true,
    SHIFT_SCHEDULING_PERIOD_RESTRICTED: true,
    SHIFT_DATE_NOT_INSUFFICIENT: true,
    SHIFT_BUSINESS_HOURS_UNAVAILABLE: true,
    SHIFT_BUSINESS_DAY_CLOSED: true,
    SHIFT_TIME_OUTSIDE_BUSINESS_HOURS: true,
    STAFF_RETIRED: true,
    STAFF_NOT_ACTIVE: true,
  };

  var ATTENDANCE_CORRECTION_CONFIRMED_FAILURE_KEYS = {
    ATTENDANCE_UNAUTHENTICATED: true,
    ATTENDANCE_INVALID_ARGUMENT: true,
    ATTENDANCE_CORRECTION_NONCE_REQUIRED: true,
    ATTENDANCE_CORRECTION_NONCE_CONFLICT: true,
    ATTENDANCE_CORRECTION_ALREADY_EXISTS: true,
    STAFF_RETIRED: true,
    STAFF_NOT_ACTIVE: true,
  };

  var MAX_ORDER_QUANTITY_PER_LINE = 99;
  var MAX_ORDER_LINE_ITEMS = 50;

  function normalizeCode(raw) {
    if (raw == null) return null;
    var value = String(raw).trim();
    if (!value) return null;
    if (value.charAt(0) === '[' && value.charAt(value.length - 1) === ']') {
      value = value.slice(1, -1).trim();
    }
    var slash = value.lastIndexOf('/');
    if (slash >= 0 && slash < value.length - 1) {
      value = value.slice(slash + 1).trim();
    }
    if (!value) return null;
    return value.toLowerCase();
  }

  function makeResolved(message, action, kind) {
    var retryLabel = action === 'retry' || action === 'reload' ? MESSAGES.RETRY : null;
    return {
      message: message,
      action: action == null ? null : action,
      retryLabel: retryLabel,
      kind: kind || 'unknown',
    };
  }

  function createStageError(stage, cause) {
    var err = new Error(String(stage || 'init.generic'));
    err.name = 'LiffStageError';
    err.liffStage = String(stage || 'init.generic');
    if (cause !== undefined) {
      err.liffCause = cause;
    }
    return err;
  }

  function getStage(error, options) {
    if (options && options.stage) return String(options.stage);
    if (error && error.liffStage) return String(error.liffStage);
    return null;
  }

  function extractErrorKey(error, options) {
    if (options && options.errorKey) return String(options.errorKey);
    if (!error || typeof error !== 'object') return null;
    if (error.errorKey) return String(error.errorKey);
    var details = error.details;
    if (details && typeof details === 'object' && details.errorKey) {
      return String(details.errorKey);
    }
    return null;
  }

  function extractCode(error, options) {
    if (options && options.code) return normalizeCode(options.code);
    if (!error || typeof error !== 'object') return null;
    if (error.code) return normalizeCode(error.code);
    if (error.liffCause && typeof error.liffCause === 'object' && error.liffCause.code) {
      return normalizeCode(error.liffCause.code);
    }
    return null;
  }

  function kindForCode(code) {
    if (code === 'unavailable') return 'network';
    if (code === 'permission-denied') return 'permission';
    if (code === 'deadline-exceeded') return 'timeout';
    if (code === 'unauthenticated') return 'auth';
    if (code === 'invalid-argument') return 'malformed';
    if (code === 'already-exists') return 'unknown';
    return 'unknown';
  }

  function resolveFromCatalogs(options) {
    options = options || {};
    var error = options.error;
    var operation = options.operation ? String(options.operation) : null;
    var errorKey = extractErrorKey(error, options);
    var code = extractCode(error, options);
    var stage = getStage(error, options);

    // 解決順:
    // operation+errorKey → errorKey → operation+code → code → stage → operation → fallback
    if (operation && errorKey) {
      var compoundKey = operation + '::' + errorKey;
      if (OPERATION_ERROR_KEY_MESSAGES[compoundKey]) {
        return makeResolved(OPERATION_ERROR_KEY_MESSAGES[compoundKey], 'retry', 'unknown');
      }
    }

    if (errorKey && ERROR_KEY_MESSAGES[errorKey]) {
      var keyKind = 'unknown';
      if (
        errorKey === 'ORDER_INTERNAL_ERROR' ||
        errorKey === 'TOURNAMENT_INTERNAL_ERROR' ||
        errorKey === 'STAFF_INTERNAL_ERROR' ||
        errorKey === 'SHIFT_INTERNAL_ERROR'
      ) {
        keyKind = 'result_unknown';
      } else if (
        ORDER_CONFIRMED_FAILURE_KEYS[errorKey] ||
        TOURNAMENT_CONFIRMED_FAILURE_KEYS[errorKey] ||
        STAFF_CREATE_CONFIRMED_FAILURE_KEYS[errorKey] ||
        STAFF_REACTIVATE_CONFIRMED_FAILURE_KEYS[errorKey] ||
        SHIFT_SUBMIT_CONFIRMED_FAILURE_KEYS[errorKey]
      ) {
        keyKind = 'confirmed_failure';
      }
      return makeResolved(ERROR_KEY_MESSAGES[errorKey], 'retry', keyKind);
    }

    if (operation && code) {
      var opCodeKey = operation + '::' + code;
      if (OPERATION_CODE_MESSAGES[opCodeKey]) {
        return makeResolved(OPERATION_CODE_MESSAGES[opCodeKey], 'retry', kindForCode(code));
      }
    }

    if (code && CODE_MESSAGES[code]) {
      return makeResolved(CODE_MESSAGES[code], 'retry', kindForCode(code));
    }

    if (stage && STAGE_CATALOG[stage]) {
      var stageEntry = STAGE_CATALOG[stage];
      return makeResolved(stageEntry.message, stageEntry.action, stageEntry.kind);
    }

    if (operation && OPERATION_MESSAGES[operation]) {
      return makeResolved(OPERATION_MESSAGES[operation], 'retry', 'unknown');
    }

    return makeResolved(MESSAGES.PROCESS, 'retry', 'unknown');
  }

  function resolveUserFacingError(options) {
    return resolveFromCatalogs(options || {});
  }

  function mapCallableError(error, options) {
    options = options || {};
    return resolveUserFacingError({
      error: error,
      operation: options.operation,
      errorKey: options.errorKey,
      code: options.code || (error && error.code),
      audience: options.audience,
    });
  }

  function mapSoftFailResponse(data, options) {
    options = options || {};
    var info = getCallableFailureInfo(data);
    if (info.kind === 'malformed') {
      return makeResolved(MESSAGES.MALFORMED, 'retry', 'malformed');
    }
    return resolveUserFacingError({
      operation: options.operation,
      errorKey: info.errorKey || undefined,
      code: info.code || undefined,
      audience: options.audience,
    });
  }

  function mapLiffInitError(error, options) {
    options = options || {};
    var stage = getStage(error, options) || 'liff.init';
    return resolveUserFacingError({
      error: error,
      stage: stage,
      operation: options.operation || 'liff_init',
      audience: options.audience,
    });
  }

  function mapAuthError(error, options) {
    options = options || {};
    var stage = getStage(error, options) || 'auth.signin';
    return resolveUserFacingError({
      error: error,
      stage: stage,
      operation: options.operation || 'auth',
      audience: options.audience,
    });
  }

  function isCallableSuccessResponse(data) {
    return (
      data != null &&
      typeof data === 'object' &&
      !Array.isArray(data) &&
      data.success === true
    );
  }

  function getCallableFailureInfo(data) {
    if (data == null || typeof data !== 'object' || Array.isArray(data)) {
      return { kind: 'malformed' };
    }
    if (!Object.prototype.hasOwnProperty.call(data, 'success')) {
      return { kind: 'malformed' };
    }
    if (data.success === true) {
      return { kind: 'success' };
    }
    if (data.success !== false) {
      return { kind: 'malformed' };
    }
    var info = { kind: 'soft-fail' };
    if (typeof data.errorKey === 'string' && data.errorKey.trim()) {
      info.errorKey = data.errorKey.trim();
    }
    if (typeof data.code === 'string' && data.code.trim()) {
      info.code = normalizeCode(data.code);
    }
    return info;
  }

  function isFirebaseCustomTokenShape(data) {
    return (
      data != null &&
      typeof data === 'object' &&
      !Array.isArray(data) &&
      typeof data.firebaseToken === 'string' &&
      data.firebaseToken.trim().length > 0
    );
  }

  /**
   * getUserStatus 成功 shape
   * success === true かつ user.isStaying が boolean
   */
  function isGetUserStatusShape(data) {
    if (!isCallableSuccessResponse(data)) return false;
    if (data.user == null || typeof data.user !== 'object' || Array.isArray(data.user)) {
      return false;
    }
    return typeof data.user.isStaying === 'boolean';
  }

  /**
   * generateQRCode 成功 shape（user L2: success なしでも可）
   * 現行 Functions は qrCode / qrCodeUrl / expiresAt を返す
   */
  function isGenerateQRCodeShape(data) {
    if (data == null || typeof data !== 'object' || Array.isArray(data)) {
      return false;
    }
    if (typeof data.qrCode !== 'string' || data.qrCode.trim().length === 0) {
      return false;
    }
    if (typeof data.qrCodeUrl !== 'string' || data.qrCodeUrl.trim().length === 0) {
      return false;
    }
    if (typeof data.expiresAt !== 'number' || !Number.isFinite(data.expiresAt)) {
      return false;
    }
    return true;
  }

  /**
   * staff generateQRCode 成功 shape（L5-A: success / type / expiresAtMs 必須）
   * user L2 の isGenerateQRCodeShape は壊さない
   */
  function isGenerateStaffQRCodeShape(data) {
    if (!isGenerateQRCodeShape(data)) return false;
    if (data.success !== true) return false;
    if (data.type !== 'staff') return false;
    if (typeof data.expiresAtMs !== 'number' || !Number.isFinite(data.expiresAtMs)) {
      return false;
    }
    if (data.expiresAt !== data.expiresAtMs) return false;
    var payload = data.data;
    if (payload == null || typeof payload !== 'object' || Array.isArray(payload)) {
      return false;
    }
    if (payload.type !== 'staff') return false;
    if (typeof payload.uid !== 'string' || !payload.uid) return false;
    if (typeof payload.loginId !== 'string' || !payload.loginId) return false;
    if (typeof payload.timestamp !== 'number' || !Number.isFinite(payload.timestamp)) {
      return false;
    }
    if (typeof payload.token !== 'string' || !payload.token) return false;
    return true;
  }

  function isOptionalStaffQrFieldConsistent(source) {
    if (!source || typeof source !== 'object') return true;
    if (source.qrCode !== undefined) {
      if (typeof source.qrCode !== 'string' || source.qrCode.trim().length === 0) {
        return false;
      }
    }
    if (source.qrCodeUrl !== undefined) {
      if (typeof source.qrCodeUrl !== 'string' || source.qrCodeUrl.trim().length === 0) {
        return false;
      }
    }
    var hasMs = source.expiresAtMs !== undefined;
    var hasAt = source.expiresAt !== undefined;
    if (hasMs) {
      if (typeof source.expiresAtMs !== 'number' || !Number.isFinite(source.expiresAtMs)) {
        return false;
      }
    }
    if (hasAt) {
      if (typeof source.expiresAt !== 'number' || !Number.isFinite(source.expiresAt)) {
        return false;
      }
    }
    if (hasMs && hasAt && source.expiresAt !== source.expiresAtMs) {
      return false;
    }
    return true;
  }

  /**
   * createStaffAccount 成功 shape
   * @param {object} data
   * @param {{ clientNonce: string }} expected
   */
  function isCreateStaffAccountShape(data, expected) {
    expected = expected || {};
    if (!isCallableSuccessResponse(data)) return false;
    var nested =
      data.data != null && typeof data.data === 'object' && !Array.isArray(data.data)
        ? data.data
        : null;
    var clientNonce =
      nested && typeof nested.clientNonce === 'string'
        ? nested.clientNonce
        : typeof data.clientNonce === 'string'
          ? data.clientNonce
          : null;
    if (!clientNonce || clientNonce !== expected.clientNonce) return false;
    var reused = nested && typeof nested.reused === 'boolean' ? nested.reused : data.reused;
    var alreadyRegistered =
      nested && typeof nested.alreadyRegistered === 'boolean'
        ? nested.alreadyRegistered
        : data.alreadyRegistered;
    var staffStatus =
      nested && typeof nested.staffStatus === 'string'
        ? nested.staffStatus
        : data.staffStatus;
    if (typeof reused !== 'boolean') return false;
    if (typeof alreadyRegistered !== 'boolean') return false;
    if (staffStatus !== 'active') return false;
    if (!isOptionalStaffQrFieldConsistent(nested || {})) return false;
    if (!isOptionalStaffQrFieldConsistent(data)) return false;
    return true;
  }

  /**
   * reactivateStaffAccount 成功 shape
   * @param {object} data
   * @param {{ clientNonce: string }} expected
   */
  function isReactivateStaffAccountShape(data, expected) {
    expected = expected || {};
    if (!isCallableSuccessResponse(data)) return false;
    var nested =
      data.data != null && typeof data.data === 'object' && !Array.isArray(data.data)
        ? data.data
        : null;
    var clientNonce =
      nested && typeof nested.clientNonce === 'string'
        ? nested.clientNonce
        : typeof data.clientNonce === 'string'
          ? data.clientNonce
          : null;
    if (!clientNonce || clientNonce !== expected.clientNonce) return false;
    var reused = nested && typeof nested.reused === 'boolean' ? nested.reused : data.reused;
    var staffStatus =
      nested && typeof nested.staffStatus === 'string'
        ? nested.staffStatus
        : data.staffStatus;
    if (typeof reused !== 'boolean') return false;
    if (staffStatus !== 'active') return false;
    if (!isOptionalStaffQrFieldConsistent(nested || {})) return false;
    if (!isOptionalStaffQrFieldConsistent(data)) return false;
    return true;
  }

  /** 入店状態: true | false | 'unknown' */
  function normalizeStayStatus(value) {
    if (value === true) return true;
    if (value === false) return false;
    return 'unknown';
  }

  function isStayActionAllowed(status) {
    return normalizeStayStatus(status) === true;
  }

  function isNonEmptyString(value) {
    return typeof value === 'string' && value.trim().length > 0;
  }

  function isFiniteNumber(value) {
    return typeof value === 'number' && Number.isFinite(value);
  }

  function isPositiveInt(value) {
    return typeof value === 'number' && Number.isInteger(value) && value >= 1;
  }

  function isGetMenuItemsShape(data) {
    if (!isCallableSuccessResponse(data)) return false;
    if (!Array.isArray(data.data)) return false;
    for (var i = 0; i < data.data.length; i++) {
      var item = data.data[i];
      if (item == null || typeof item !== 'object' || Array.isArray(item)) return false;
      if (!isNonEmptyString(item.id) && !isNonEmptyString(item.menuItemDocId)) return false;
      if (typeof item.name !== 'string') return false;
      if (typeof item.category !== 'string') return false;
      if (!isFiniteNumber(item.price)) return false;
      if (typeof item.isArchive !== 'boolean') return false;
      if (typeof item.isSoldOut !== 'boolean') return false;
    }
    return true;
  }

  function isPlaceOrderByUserItemShape(item) {
    if (item == null || typeof item !== 'object' || Array.isArray(item)) return false;
    if (!isNonEmptyString(item.itemId)) return false;
    if (!isNonEmptyString(item.menuItemId)) return false;
    if (typeof item.name !== 'string') return false;
    if (!isPositiveInt(item.quantity)) return false;
    if (!isFiniteNumber(item.unitPrice) || item.unitPrice < 0) return false;
    if (!isFiniteNumber(item.totalPrice) || item.totalPrice < 0) return false;
    if (typeof item.status !== 'string') return false;
    if (typeof item.orderedAt !== 'string') return false;
    return true;
  }

  function isPlaceOrderByUserShape(data, expectedNonce) {
    if (!isCallableSuccessResponse(data)) return false;
    var d = data.data;
    if (d == null || typeof d !== 'object' || Array.isArray(d)) return false;
    if (!isNonEmptyString(d.billId)) return false;
    if (!isNonEmptyString(d.clientNonce)) return false;
    if (expectedNonce != null && d.clientNonce !== expectedNonce) return false;
    if (typeof d.reused !== 'boolean') return false;
    if (!Array.isArray(d.items)) return false;
    if (!Number.isInteger(d.itemsCount) || d.itemsCount < 0) return false;
    if (!Number.isInteger(d.totalQuantity) || d.totalQuantity < 0) return false;
    if (!isFiniteNumber(d.totalAmount) || d.totalAmount < 0) return false;
    if (d.itemsCount !== d.items.length) return false;
    for (var i = 0; i < d.items.length; i++) {
      if (!isPlaceOrderByUserItemShape(d.items[i])) return false;
    }
    return true;
  }

  function isHistoryItemShape(item) {
    if (item == null || typeof item !== 'object' || Array.isArray(item)) return false;
    if (!isNonEmptyString(item.itemId)) return false;
    if (typeof item.menuItemId !== 'string') return false;
    if (typeof item.name !== 'string') return false;
    if (!isFiniteNumber(item.quantity)) return false;
    if (!isFiniteNumber(item.unitPrice)) return false;
    if (!isFiniteNumber(item.totalPrice)) return false;
    if (!(item.status === null || typeof item.status === 'string')) return false;
    if (typeof item.voided !== 'boolean') return false;
    if (!(item.orderedAt === null || typeof item.orderedAt === 'string')) return false;
    if (
      !(
        item.clientNonce === null ||
        item.clientNonce === undefined ||
        typeof item.clientNonce === 'string'
      )
    ) {
      return false;
    }
    return true;
  }

  function isGetUserOrderHistoryShape(data) {
    if (!isCallableSuccessResponse(data)) return false;
    var d = data.data;
    if (d == null || typeof d !== 'object' || Array.isArray(d)) return false;
    if (!isNonEmptyString(d.businessDate)) return false;
    if (!Array.isArray(d.orders)) return false;
    if (!Number.isInteger(d.totalCount) || d.totalCount < 0) return false;
    if (!isFiniteNumber(d.totalAmount)) return false;
    for (var i = 0; i < d.orders.length; i++) {
      var order = d.orders[i];
      if (order == null || typeof order !== 'object' || Array.isArray(order)) return false;
      if (!isNonEmptyString(order.id) && !isNonEmptyString(order.billId)) return false;
      if (typeof order.status !== 'string') return false;
      if (!Array.isArray(order.items)) return false;
      if (!Number.isInteger(order.itemCount) || order.itemCount < 0) return false;
      if (!isFiniteNumber(order.totalPrice)) return false;
      for (var j = 0; j < order.items.length; j++) {
        if (!isHistoryItemShape(order.items[j])) return false;
      }
    }
    return true;
  }

  function normalizeOrderItemsForRequest(rawItems) {
    if (!Array.isArray(rawItems) || rawItems.length === 0) {
      return { ok: false, errorKey: 'ORDER_QUANTITY_INVALID', items: [] };
    }
    var merged = {};
    for (var i = 0; i < rawItems.length; i++) {
      var raw = rawItems[i];
      if (!raw || typeof raw !== 'object') {
        return { ok: false, errorKey: 'ORDER_QUANTITY_INVALID', items: [] };
      }
      var menuItemId =
        typeof raw.menuItemId === 'string' ? raw.menuItemId.trim() : '';
      var quantity = raw.quantity;
      if (!menuItemId) {
        return { ok: false, errorKey: 'ORDER_ITEM_NOT_FOUND', items: [] };
      }
      if (
        typeof quantity !== 'number' ||
        !Number.isFinite(quantity) ||
        !Number.isInteger(quantity) ||
        quantity < 1 ||
        quantity > MAX_ORDER_QUANTITY_PER_LINE
      ) {
        return { ok: false, errorKey: 'ORDER_QUANTITY_INVALID', items: [] };
      }
      merged[menuItemId] = (merged[menuItemId] || 0) + quantity;
    }
    var items = Object.keys(merged)
      .sort()
      .map(function (id) {
        return { menuItemId: id, quantity: merged[id] };
      });
    for (var j = 0; j < items.length; j++) {
      if (items[j].quantity > MAX_ORDER_QUANTITY_PER_LINE) {
        return { ok: false, errorKey: 'ORDER_QUANTITY_INVALID', items: [] };
      }
    }
    if (items.length > MAX_ORDER_LINE_ITEMS) {
      return { ok: false, errorKey: 'ORDER_QUANTITY_INVALID', items: [] };
    }
    return { ok: true, items: items };
  }

  function buildOrderFingerprint(normalizedItems) {
    var payload = (normalizedItems || []).map(function (it) {
      return { menuItemId: it.menuItemId, quantity: it.quantity };
    });
    return JSON.stringify(payload);
  }

  function createClientNonce() {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID();
    }
    if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
      var bytes = new Uint8Array(16);
      crypto.getRandomValues(bytes);
      bytes[6] = (bytes[6] & 0x0f) | 0x40;
      bytes[8] = (bytes[8] & 0x3f) | 0x80;
      var hex = [];
      for (var i = 0; i < bytes.length; i++) {
        hex.push((bytes[i] + 0x100).toString(16).slice(1));
      }
      return (
        hex.slice(0, 4).join('') +
        '-' +
        hex.slice(4, 6).join('') +
        '-' +
        hex.slice(6, 8).join('') +
        '-' +
        hex.slice(8, 10).join('') +
        '-' +
        hex.slice(10, 16).join('')
      );
    }
    return 'nonce_' + String(Date.now()) + '_' + String(Math.random()).slice(2, 12);
  }

  function isOrderResultUnknownCode(code) {
    var c = normalizeCode(code);
    return (
      c === 'unavailable' ||
      c === 'deadline-exceeded' ||
      c === 'internal' ||
      c === 'unknown' ||
      c === 'cancelled' ||
      c === 'canceled'
    );
  }

  /**
   * placeOrderByUser 結果分類
   * @returns {{ outcome: 'success'|'confirmed_failure'|'result_unknown', resolved: object, data?: object }}
   */
  function classifyPlaceOrderOutcome(options) {
    options = options || {};
    var expectedNonce = options.expectedNonce;
    var data = options.data;
    var error = options.error;

    if (data != null) {
      if (isPlaceOrderByUserShape(data, expectedNonce)) {
        return {
          outcome: 'success',
          resolved: makeResolved(MESSAGES.ORDER_SUCCESS, null, 'success'),
          data: data,
        };
      }
      // success 風だが shape / nonce 不一致 → 結果不明
      if (isCallableSuccessResponse(data) || getCallableFailureInfo(data).kind === 'malformed') {
        return {
          outcome: 'result_unknown',
          resolved: makeResolved(MESSAGES.ORDER_RESULT_UNKNOWN, null, 'result_unknown'),
        };
      }
      var soft = getCallableFailureInfo(data);
      if (soft.kind === 'soft-fail') {
        var softKey = soft.errorKey || null;
        if (softKey && ORDER_CONFIRMED_FAILURE_KEYS[softKey]) {
          return {
            outcome: 'confirmed_failure',
            resolved: resolveUserFacingError({
              operation: 'place_order_by_user',
              errorKey: softKey,
              code: soft.code,
            }),
          };
        }
        if (softKey === 'ORDER_INTERNAL_ERROR') {
          return {
            outcome: 'result_unknown',
            resolved: makeResolved(MESSAGES.ORDER_RESULT_UNKNOWN, null, 'result_unknown'),
          };
        }
        return {
          outcome: 'result_unknown',
          resolved: makeResolved(MESSAGES.ORDER_RESULT_UNKNOWN, null, 'result_unknown'),
        };
      }
    }

    if (error) {
      var errorKey = extractErrorKey(error, options);
      var code = extractCode(error, options);
      if (errorKey && ORDER_CONFIRMED_FAILURE_KEYS[errorKey]) {
        return {
          outcome: 'confirmed_failure',
          resolved: resolveUserFacingError({
            operation: 'place_order_by_user',
            errorKey: errorKey,
            code: code,
            error: error,
          }),
        };
      }
      if (errorKey === 'ORDER_INTERNAL_ERROR' || isOrderResultUnknownCode(code)) {
        return {
          outcome: 'result_unknown',
          resolved: makeResolved(MESSAGES.ORDER_RESULT_UNKNOWN, null, 'result_unknown'),
        };
      }
      // errorKey なし・未知 → 結果不明（断定失敗にしない）
      if (!errorKey) {
        return {
          outcome: 'result_unknown',
          resolved: makeResolved(MESSAGES.ORDER_RESULT_UNKNOWN, null, 'result_unknown'),
        };
      }
      // 既知でない errorKey も不明扱い
      return {
        outcome: 'result_unknown',
        resolved: makeResolved(MESSAGES.ORDER_RESULT_UNKNOWN, null, 'result_unknown'),
      };
    }

    return {
      outcome: 'result_unknown',
      resolved: makeResolved(MESSAGES.ORDER_RESULT_UNKNOWN, null, 'result_unknown'),
    };
  }

  function isIsoDateTimeString(value) {
    if (typeof value !== 'string' || !value.trim()) return false;
    var t = Date.parse(value);
    return Number.isFinite(t);
  }

  function isLiffTournamentItemShape(item, options) {
    options = options || {};
    if (item == null || typeof item !== 'object' || Array.isArray(item)) return false;
    if (!isNonEmptyString(item.id)) return false;
    if (typeof item.name !== 'string') return false;
    if (typeof item.templateId !== 'string') return false;
    if (!isNonEmptyString(item.startAt) || !isIsoDateTimeString(item.startAt)) return false;
    if (!isNonEmptyString(item.regEndAt) || !isIsoDateTimeString(item.regEndAt)) return false;
    if (typeof item.status !== 'string' || !item.status.trim()) return false;
    if (!isFiniteNumber(item.entryFee) || item.entryFee < 0) return false;
    if (!isFiniteNumber(item.startStack)) return false;
    if (typeof item.isReentry !== 'boolean') return false;
    if (
      !(
        item.maxReentries === null ||
        (typeof item.maxReentries === 'number' && Number.isFinite(item.maxReentries))
      )
    ) {
      return false;
    }
    if (!isFiniteNumber(item.reentryFee) || item.reentryFee < 0) return false;
    if (typeof item.isAddon !== 'boolean') return false;
    if (
      !(
        item.addonLimitPerPlayer === null ||
        (typeof item.addonLimitPerPlayer === 'number' &&
          Number.isFinite(item.addonLimitPerPlayer))
      )
    ) {
      return false;
    }
    if (!isFiniteNumber(item.addonFee) || item.addonFee < 0) return false;
    if (typeof item.blindLevelDurationText !== 'string') return false;
    if (options.requireRegistrationFlag === true) {
      if (typeof item.isRegisteredByCurrentUser !== 'boolean') return false;
    } else if (
      item.isRegisteredByCurrentUser !== undefined &&
      typeof item.isRegisteredByCurrentUser !== 'boolean'
    ) {
      return false;
    }
    return true;
  }

  function isLiffSettingsShape(settings) {
    if (settings == null || typeof settings !== 'object' || Array.isArray(settings)) {
      return false;
    }
    if (typeof settings.liffRegistrationEnabled !== 'boolean') return false;
    if (typeof settings.liffCalendarEnabled !== 'boolean') return false;
    return true;
  }

  function isGetTodayTournamentsShape(data) {
    if (!isCallableSuccessResponse(data)) return false;
    if (!Array.isArray(data.data)) return false;
    if (!Number.isInteger(data.count) || data.count < 0) return false;
    if (data.count !== data.data.length) return false;
    if (!isLiffSettingsShape(data.liffSettings)) return false;
    // 一覧フィルタと見出しを揃えるための営業日キー（yyyy-MM-dd）
    if (!isYyyyMmDd(data.targetBusinessDate)) return false;
    for (var i = 0; i < data.data.length; i++) {
      if (!isLiffTournamentItemShape(data.data[i], { requireRegistrationFlag: true })) {
        return false;
      }
    }
    return true;
  }

  function isGetUpcomingTournamentsShape(data) {
    if (!isCallableSuccessResponse(data)) return false;
    if (!Array.isArray(data.tournaments)) return false;
    if (!Number.isInteger(data.count) || data.count < 0) return false;
    if (data.count !== data.tournaments.length) return false;
    if (!isLiffSettingsShape(data.liffSettings)) return false;
    for (var i = 0; i < data.tournaments.length; i++) {
      if (!isLiffTournamentItemShape(data.tournaments[i], { requireRegistrationFlag: false })) {
        return false;
      }
    }
    return true;
  }

  function isRegisterForTournamentShape(data, expected) {
    expected = expected || {};
    if (!isCallableSuccessResponse(data)) return false;
    var d = data.data;
    if (d == null || typeof d !== 'object' || Array.isArray(d)) return false;
    if (!isNonEmptyString(d.tournamentId)) return false;
    if (expected.tournamentId != null && d.tournamentId !== expected.tournamentId) {
      return false;
    }
    if (!isNonEmptyString(d.templateId)) return false;
    if (!isNonEmptyString(d.clientNonce)) return false;
    if (expected.clientNonce != null && d.clientNonce !== expected.clientNonce) {
      return false;
    }
    if (typeof d.reused !== 'boolean') return false;
    if (d.registrationStatus !== 'waiting') return false;
    if (d.waiting !== true) return false;
    if (!isIsoDateTimeString(d.registeredAt)) return false;
    if (!isNonEmptyString(d.billId)) return false;
    if (!isFiniteNumber(d.entryFee) || d.entryFee < 0 || !Number.isInteger(d.entryFee)) {
      return false;
    }
    if (typeof d.tournamentName !== 'string') return false;
    if (typeof d.pokerName !== 'string') return false;
    return true;
  }

  /**
   * registerForTournament 結果分類
   * @returns {{ outcome: 'success'|'confirmed_failure'|'result_unknown', resolved: object, data?: object }}
   */
  function classifyRegisterForTournamentOutcome(options) {
    options = options || {};
    var expectedTournamentId = options.expectedTournamentId;
    var expectedNonce = options.expectedNonce;
    var data = options.data;
    var error = options.error;

    if (data != null) {
      if (
        isRegisterForTournamentShape(data, {
          tournamentId: expectedTournamentId,
          clientNonce: expectedNonce,
        })
      ) {
        return {
          outcome: 'success',
          resolved: makeResolved(MESSAGES.TOUR_REGISTRATION_SUCCESS, null, 'success'),
          data: data,
        };
      }
      if (isCallableSuccessResponse(data) || getCallableFailureInfo(data).kind === 'malformed') {
        return {
          outcome: 'result_unknown',
          resolved: makeResolved(
            MESSAGES.TOUR_REGISTRATION_RESULT_UNKNOWN,
            null,
            'result_unknown',
          ),
        };
      }
      var soft = getCallableFailureInfo(data);
      if (soft.kind === 'soft-fail') {
        var softKey = soft.errorKey || null;
        if (softKey && TOURNAMENT_CONFIRMED_FAILURE_KEYS[softKey]) {
          return {
            outcome: 'confirmed_failure',
            resolved: resolveUserFacingError({
              operation: 'register_for_tournament',
              errorKey: softKey,
              code: soft.code,
            }),
          };
        }
        return {
          outcome: 'result_unknown',
          resolved: makeResolved(
            MESSAGES.TOUR_REGISTRATION_RESULT_UNKNOWN,
            null,
            'result_unknown',
          ),
        };
      }
    }

    if (error) {
      var errorKey = extractErrorKey(error, options);
      var code = extractCode(error, options);
      if (errorKey && TOURNAMENT_CONFIRMED_FAILURE_KEYS[errorKey]) {
        return {
          outcome: 'confirmed_failure',
          resolved: resolveUserFacingError({
            operation: 'register_for_tournament',
            errorKey: errorKey,
            code: code,
            error: error,
          }),
        };
      }
      if (errorKey === 'TOURNAMENT_INTERNAL_ERROR' || isOrderResultUnknownCode(code)) {
        return {
          outcome: 'result_unknown',
          resolved: makeResolved(
            MESSAGES.TOUR_REGISTRATION_RESULT_UNKNOWN,
            null,
            'result_unknown',
          ),
        };
      }
      if (!errorKey) {
        return {
          outcome: 'result_unknown',
          resolved: makeResolved(
            MESSAGES.TOUR_REGISTRATION_RESULT_UNKNOWN,
            null,
            'result_unknown',
          ),
        };
      }
      return {
        outcome: 'result_unknown',
        resolved: makeResolved(
          MESSAGES.TOUR_REGISTRATION_RESULT_UNKNOWN,
          null,
          'result_unknown',
        ),
      };
    }

    return {
      outcome: 'result_unknown',
      resolved: makeResolved(MESSAGES.TOUR_REGISTRATION_RESULT_UNKNOWN, null, 'result_unknown'),
    };
  }

  function getStaffMutationDataFields(data) {
    var nested =
      data && data.data != null && typeof data.data === 'object' && !Array.isArray(data.data)
        ? data.data
        : null;
    return {
      alreadyRegistered:
        nested && typeof nested.alreadyRegistered === 'boolean'
          ? nested.alreadyRegistered
          : data && typeof data.alreadyRegistered === 'boolean'
            ? data.alreadyRegistered
            : false,
      reused:
        nested && typeof nested.reused === 'boolean'
          ? nested.reused
          : data && typeof data.reused === 'boolean'
            ? data.reused
            : false,
    };
  }

  /**
   * createStaffAccount 結果分類
   * @returns {{ outcome: 'success'|'confirmed_failure'|'result_unknown', resolved: object, data?: object }}
   */
  function classifyCreateStaffOutcome(options) {
    options = options || {};
    var expectedNonce = options.expectedNonce;
    var data = options.data;
    var error = options.error;

    if (data != null) {
      if (isCreateStaffAccountShape(data, { clientNonce: expectedNonce })) {
        var fields = getStaffMutationDataFields(data);
        var successMsg = fields.alreadyRegistered
          ? MESSAGES.STAFF_ALREADY_REGISTERED
          : MESSAGES.STAFF_REG_SUCCESS;
        return {
          outcome: 'success',
          resolved: makeResolved(successMsg, null, 'success'),
          data: data,
          alreadyRegistered: fields.alreadyRegistered,
          reused: fields.reused,
        };
      }
      if (isCallableSuccessResponse(data) || getCallableFailureInfo(data).kind === 'malformed') {
        return {
          outcome: 'result_unknown',
          resolved: makeResolved(MESSAGES.STAFF_REG_RESULT_UNKNOWN, null, 'result_unknown'),
        };
      }
      var softCreate = getCallableFailureInfo(data);
      if (softCreate.kind === 'soft-fail') {
        var softCreateKey = softCreate.errorKey || null;
        if (softCreateKey && STAFF_CREATE_CONFIRMED_FAILURE_KEYS[softCreateKey]) {
          return {
            outcome: 'confirmed_failure',
            errorKey: softCreateKey,
            resolved: resolveUserFacingError({
              operation: 'create_staff_account',
              errorKey: softCreateKey,
              code: softCreate.code,
            }),
          };
        }
        return {
          outcome: 'result_unknown',
          resolved: makeResolved(MESSAGES.STAFF_REG_RESULT_UNKNOWN, null, 'result_unknown'),
        };
      }
    }

    if (error) {
      var createErrorKey = extractErrorKey(error, options);
      var createCode = extractCode(error, options);
      if (createErrorKey && STAFF_CREATE_CONFIRMED_FAILURE_KEYS[createErrorKey]) {
        return {
          outcome: 'confirmed_failure',
          errorKey: createErrorKey,
          resolved: resolveUserFacingError({
            operation: 'create_staff_account',
            errorKey: createErrorKey,
            code: createCode,
            error: error,
          }),
        };
      }
      if (createErrorKey === 'STAFF_INTERNAL_ERROR' || isOrderResultUnknownCode(createCode)) {
        return {
          outcome: 'result_unknown',
          resolved: makeResolved(MESSAGES.STAFF_REG_RESULT_UNKNOWN, null, 'result_unknown'),
        };
      }
      return {
        outcome: 'result_unknown',
        resolved: makeResolved(MESSAGES.STAFF_REG_RESULT_UNKNOWN, null, 'result_unknown'),
      };
    }

    return {
      outcome: 'result_unknown',
      resolved: makeResolved(MESSAGES.STAFF_REG_RESULT_UNKNOWN, null, 'result_unknown'),
    };
  }

  /**
   * reactivateStaffAccount 結果分類
   */
  function classifyReactivateStaffOutcome(options) {
    options = options || {};
    var expectedNonce = options.expectedNonce;
    var data = options.data;
    var error = options.error;

    if (data != null) {
      if (isReactivateStaffAccountShape(data, { clientNonce: expectedNonce })) {
        var reactivateFields = getStaffMutationDataFields(data);
        return {
          outcome: 'success',
          resolved: makeResolved(MESSAGES.STAFF_REACTIVATION_SUCCESS, null, 'success'),
          data: data,
          reused: reactivateFields.reused,
        };
      }
      if (isCallableSuccessResponse(data) || getCallableFailureInfo(data).kind === 'malformed') {
        return {
          outcome: 'result_unknown',
          resolved: makeResolved(
            MESSAGES.STAFF_REACTIVATION_RESULT_UNKNOWN,
            null,
            'result_unknown',
          ),
        };
      }
      var softRe = getCallableFailureInfo(data);
      if (softRe.kind === 'soft-fail') {
        var softReKey = softRe.errorKey || null;
        if (softReKey && STAFF_REACTIVATE_CONFIRMED_FAILURE_KEYS[softReKey]) {
          return {
            outcome: 'confirmed_failure',
            errorKey: softReKey,
            resolved: resolveUserFacingError({
              operation: 'reactivate_staff_account',
              errorKey: softReKey,
              code: softRe.code,
            }),
          };
        }
        return {
          outcome: 'result_unknown',
          resolved: makeResolved(
            MESSAGES.STAFF_REACTIVATION_RESULT_UNKNOWN,
            null,
            'result_unknown',
          ),
        };
      }
    }

    if (error) {
      var reErrorKey = extractErrorKey(error, options);
      var reCode = extractCode(error, options);
      if (reErrorKey && STAFF_REACTIVATE_CONFIRMED_FAILURE_KEYS[reErrorKey]) {
        return {
          outcome: 'confirmed_failure',
          errorKey: reErrorKey,
          resolved: resolveUserFacingError({
            operation: 'reactivate_staff_account',
            errorKey: reErrorKey,
            code: reCode,
            error: error,
          }),
        };
      }
      if (reErrorKey === 'STAFF_INTERNAL_ERROR' || isOrderResultUnknownCode(reCode)) {
        return {
          outcome: 'result_unknown',
          resolved: makeResolved(
            MESSAGES.STAFF_REACTIVATION_RESULT_UNKNOWN,
            null,
            'result_unknown',
          ),
        };
      }
      return {
        outcome: 'result_unknown',
        resolved: makeResolved(
          MESSAGES.STAFF_REACTIVATION_RESULT_UNKNOWN,
          null,
          'result_unknown',
        ),
      };
    }

    return {
      outcome: 'result_unknown',
      resolved: makeResolved(MESSAGES.STAFF_REACTIVATION_RESULT_UNKNOWN, null, 'result_unknown'),
    };
  }

  function getStaffMutationGuard(pending, busy) {
    if (pending && pending.state === 'result_unknown') {
      return { allowNewNonce: false, blockReason: 'pending_lock' };
    }
    if (busy === true || (pending && pending.state === 'submitting')) {
      return { allowNewNonce: false, blockReason: 'busy' };
    }
    return { allowNewNonce: true, blockReason: null };
  }

  function createStaffMutationPending(clientNonce, nowMs) {
    return {
      clientNonce: clientNonce,
      state: 'submitting',
      startedAt: typeof nowMs === 'number' ? nowMs : Date.now(),
    };
  }

  function transitionStaffMutationPending(pending, nextState) {
    if (!pending || typeof pending !== 'object') return null;
    return {
      clientNonce: pending.clientNonce,
      state: nextState,
      startedAt: pending.startedAt,
    };
  }

  function isYyyyMm(value) {
    return typeof value === 'string' && /^\d{4}-\d{2}$/.test(value);
  }

  function isYyyyMmDd(value) {
    return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value);
  }

  function isIsoTimestampOrNull(value) {
    if (value === null) return true;
    if (typeof value !== 'string' || !value.trim()) return false;
    var t = Date.parse(value);
    return Number.isFinite(t);
  }

  function isAttendanceDateValid(value) {
    if (!isYyyyMmDd(value)) return false;
    var parts = value.split('-');
    var y = Number(parts[0]);
    var m = Number(parts[1]);
    var d = Number(parts[2]);
    var utc = new Date(Date.UTC(y, m - 1, d));
    return (
      utc.getUTCFullYear() === y &&
      utc.getUTCMonth() === m - 1 &&
      utc.getUTCDate() === d
    );
  }

  function isGetStaffAttendanceItemShape(item) {
    if (item == null || typeof item !== 'object' || Array.isArray(item)) return false;
    if (!isNonEmptyString(item.attendanceId)) return false;
    if (!isAttendanceDateValid(item.date)) return false;
    if (!isIsoTimestampOrNull(item.clockIn)) return false;
    if (!isIsoTimestampOrNull(item.clockOut)) return false;
    if (!isFiniteNumber(item.breakMinutes) || item.breakMinutes < 0) return false;
    if (
      !(
        item.actualWorkMinutes === null ||
        (isFiniteNumber(item.actualWorkMinutes) && item.actualWorkMinutes >= 0)
      )
    ) {
      return false;
    }
    if (
      !(
        item.nightWorkMinutes === null ||
        (isFiniteNumber(item.nightWorkMinutes) && item.nightWorkMinutes >= 0)
      )
    ) {
      return false;
    }
    if (typeof item.isOnBreak !== 'boolean') return false;
    if (typeof item.isManual !== 'boolean') return false;
    if (typeof item.closedStoreWithoutClockOut !== 'boolean') return false;
    return true;
  }

  function isGetStaffAttendanceShape(data, expected) {
    expected = expected || {};
    if (!isCallableSuccessResponse(data)) return false;
    if (data.data == null || typeof data.data !== 'object' || Array.isArray(data.data)) {
      return false;
    }
    var d = data.data;
    if (!Number.isInteger(d.year)) return false;
    if (!Number.isInteger(d.month) || d.month < 1 || d.month > 12) return false;
    if (expected.year != null && d.year !== expected.year) return false;
    if (expected.month != null && d.month !== expected.month) return false;
    if (!Array.isArray(d.attendances)) return false;
    if (!Number.isInteger(d.count) || d.count < 0) return false;
    if (d.count !== d.attendances.length) return false;
    for (var i = 0; i < d.attendances.length; i++) {
      if (!isGetStaffAttendanceItemShape(d.attendances[i])) return false;
    }
    return true;
  }

  function isCheckAttendanceCorrectionShape(data, expected) {
    expected = expected || {};
    if (!isCallableSuccessResponse(data)) return false;
    if (data.data == null || typeof data.data !== 'object' || Array.isArray(data.data)) {
      return false;
    }
    var d = data.data;
    if (typeof d.exists !== 'boolean') return false;
    if (!isAttendanceDateValid(d.date)) return false;
    if (expected.date != null && d.date !== expected.date) return false;

    if (d.exists) {
      if (!(d.status === 'pending' || d.status === 'approved' || d.status === 'rejected')) {
        return false;
      }
      if (!isNonEmptyString(d.requestId)) return false;
    } else {
      if (d.status !== null) return false;
      if (d.requestId !== null) return false;
    }
    return true;
  }

  function isCreateAttendanceCorrectionShape(data, expected) {
    expected = expected || {};
    if (!isCallableSuccessResponse(data)) return false;
    if (data.data == null || typeof data.data !== 'object' || Array.isArray(data.data)) {
      return false;
    }
    var d = data.data;
    if (!isNonEmptyString(d.clientNonce)) return false;
    if (expected.clientNonce != null && d.clientNonce !== expected.clientNonce) return false;
    if (typeof d.reused !== 'boolean') return false;
    if (!isNonEmptyString(d.requestId)) return false;
    if (!isAttendanceDateValid(d.date)) return false;
    if (expected.date != null && d.date !== expected.date) return false;
    if (d.status !== 'pending') return false;
    return true;
  }

  function isNonNegInt(value) {
    return typeof value === 'number' && Number.isInteger(value) && value >= 0;
  }

  function isShiftMinute(value) {
    return (
      typeof value === 'number' &&
      Number.isInteger(value) &&
      Number.isFinite(value) &&
      value >= 0 &&
      value <= 1440
    );
  }

  function isGetShiftsItemShape(item) {
    if (item == null || typeof item !== 'object' || Array.isArray(item)) return false;
    if (!isNonEmptyString(item.requestId)) return false;
    if (!isYyyyMmDd(item.dateKey)) return false;
    if (item.date !== undefined && !isYyyyMmDd(item.date)) return false;
    if (!isShiftMinute(item.startMinute) || !isShiftMinute(item.endMinute)) return false;
    if (item.startMinute >= item.endMinute) return false;
    if (item.start !== undefined && typeof item.start !== 'string') return false;
    if (item.end !== undefined && typeof item.end !== 'string') return false;
    if (
      !(
        item.confirmed === true ||
        item.confirmed === false ||
        item.confirmed === null
      )
    ) {
      return false;
    }
    if (!(item.requestStatus === 'pending' || item.requestStatus === null)) {
      return false;
    }
    if (!(item.source === 'assignment' || item.source === 'pending_request')) {
      return false;
    }
    return true;
  }

  /**
   * getShifts 正式 shape（top-level shifts のみの legacy は拒否）
   */
  function isGetShiftsShape(data) {
    if (!isCallableSuccessResponse(data)) return false;
    var nested = data.data;
    if (nested == null || typeof nested !== 'object' || Array.isArray(nested)) return false;
    if (!Array.isArray(nested.shifts)) return false;
    if (!isNonNegInt(nested.count)) return false;
    if (nested.count !== nested.shifts.length) return false;
    for (var i = 0; i < nested.shifts.length; i++) {
      if (!isGetShiftsItemShape(nested.shifts[i])) return false;
    }
    return true;
  }

  function normalizeShiftSubmitPayloadItems(rawShifts) {
    if (!Array.isArray(rawShifts) || rawShifts.length === 0) return null;
    var seen = {};
    var items = [];
    for (var i = 0; i < rawShifts.length; i++) {
      var row = rawShifts[i];
      if (row == null || typeof row !== 'object' || Array.isArray(row)) return null;
      var dateKey =
        typeof row.dateKey === 'string'
          ? row.dateKey.trim()
          : typeof row.date === 'string'
            ? row.date.trim()
            : '';
      if (!isYyyyMmDd(dateKey)) return null;
      if (seen[dateKey]) return null;
      seen[dateKey] = true;
      var startMinute = row.startMinute;
      var endMinute = row.endMinute;
      if (!isShiftMinute(startMinute) || !isShiftMinute(endMinute)) return null;
      if (startMinute >= endMinute) return null;
      items.push({ dateKey: dateKey, startMinute: startMinute, endMinute: endMinute });
    }
    items.sort(function (a, b) {
      if (a.dateKey < b.dateKey) return -1;
      if (a.dateKey > b.dateKey) return 1;
      return 0;
    });
    return items;
  }

  function isSubmitShiftRequestsShape(data, expected) {
    expected = expected || {};
    if (!isCallableSuccessResponse(data)) return false;
    var nested = data.data;
    if (nested == null || typeof nested !== 'object' || Array.isArray(nested)) return false;
    if (typeof nested.clientNonce !== 'string' || !nested.clientNonce) return false;
    if (
      expected.clientNonce != null &&
      nested.clientNonce !== expected.clientNonce
    ) {
      return false;
    }
    if (typeof nested.reused !== 'boolean') return false;
    if (!isYyyyMm(nested.yearMonth)) return false;
    if (!isNonNegInt(nested.submittedCount)) return false;
    if (!isNonNegInt(nested.createdCount)) return false;
    if (!isNonNegInt(nested.updatedCount)) return false;
    if (!Array.isArray(nested.requests)) return false;
    if (nested.submittedCount !== nested.requests.length) return false;
    if (nested.createdCount + nested.updatedCount !== nested.submittedCount) return false;

    var responseDates = {};
    for (var i = 0; i < nested.requests.length; i++) {
      var r = nested.requests[i];
      if (r == null || typeof r !== 'object' || Array.isArray(r)) return false;
      if (!isNonEmptyString(r.requestId)) return false;
      if (!isYyyyMmDd(r.dateKey)) return false;
      if (responseDates[r.dateKey]) return false;
      responseDates[r.dateKey] = true;
      if (r.status !== 'pending') return false;
      if (!isShiftMinute(r.startMinute) || !isShiftMinute(r.endMinute)) return false;
      if (r.startMinute >= r.endMinute) return false;
    }

    var expectedItems = expected.shifts
      ? normalizeShiftSubmitPayloadItems(expected.shifts)
      : null;
    if (expectedItems) {
      if (expectedItems.length !== nested.requests.length) return false;
      for (var e = 0; e < expectedItems.length; e++) {
        var exp = expectedItems[e];
        var found = null;
        for (var j = 0; j < nested.requests.length; j++) {
          if (nested.requests[j].dateKey === exp.dateKey) {
            found = nested.requests[j];
            break;
          }
        }
        if (!found) return false;
        if (found.startMinute !== exp.startMinute || found.endMinute !== exp.endMinute) {
          return false;
        }
      }
    }
    return true;
  }

  function classifySubmitShiftRequestsOutcome(options) {
    options = options || {};
    var expectedNonce = options.expectedNonce;
    var expectedShifts = options.expectedShifts;
    var data = options.data;
    var error = options.error;

    if (data != null) {
      if (
        isSubmitShiftRequestsShape(data, {
          clientNonce: expectedNonce,
          shifts: expectedShifts,
        })
      ) {
        return {
          outcome: 'success',
          resolved: makeResolved(MESSAGES.SHIFT_SUBMIT_SUCCESS, null, 'success'),
          data: data,
        };
      }
      if (isCallableSuccessResponse(data) || getCallableFailureInfo(data).kind === 'malformed') {
        return {
          outcome: 'result_unknown',
          resolved: makeResolved(
            MESSAGES.SHIFT_SUBMIT_RESULT_UNKNOWN,
            null,
            'result_unknown',
          ),
        };
      }
      var soft = getCallableFailureInfo(data);
      if (soft.kind === 'soft-fail') {
        var softKey = soft.errorKey || null;
        if (softKey && SHIFT_SUBMIT_CONFIRMED_FAILURE_KEYS[softKey]) {
          return {
            outcome: 'confirmed_failure',
            errorKey: softKey,
            resolved: resolveUserFacingError({
              operation: 'submit_shift_requests',
              errorKey: softKey,
              code: soft.code,
            }),
          };
        }
        return {
          outcome: 'result_unknown',
          resolved: makeResolved(
            MESSAGES.SHIFT_SUBMIT_RESULT_UNKNOWN,
            null,
            'result_unknown',
          ),
        };
      }
    }

    if (error) {
      var errorKey = extractErrorKey(error, options);
      var code = extractCode(error, options);
      if (errorKey && SHIFT_SUBMIT_CONFIRMED_FAILURE_KEYS[errorKey]) {
        var resolved =
          errorKey === 'STAFF_RETIRED'
            ? makeResolved(MESSAGES.STAFF_REACTIVATION_REQUIRED, 'retry', 'confirmed_failure')
            : errorKey === 'STAFF_NOT_ACTIVE'
              ? makeResolved(MESSAGES.STAFF_PROFILE_NOT_FOUND, 'retry', 'confirmed_failure')
              : resolveUserFacingError({
                  operation: 'submit_shift_requests',
                  errorKey: errorKey,
                  code: code,
                  error: error,
                });
        return {
          outcome: 'confirmed_failure',
          errorKey: errorKey,
          resolved: resolved,
        };
      }
      if (errorKey === 'SHIFT_INTERNAL_ERROR' || isOrderResultUnknownCode(code)) {
        return {
          outcome: 'result_unknown',
          resolved: makeResolved(
            MESSAGES.SHIFT_SUBMIT_RESULT_UNKNOWN,
            null,
            'result_unknown',
          ),
        };
      }
      return {
        outcome: 'result_unknown',
        resolved: makeResolved(
          MESSAGES.SHIFT_SUBMIT_RESULT_UNKNOWN,
          null,
          'result_unknown',
        ),
      };
    }

    return {
      outcome: 'result_unknown',
      resolved: makeResolved(MESSAGES.SHIFT_SUBMIT_RESULT_UNKNOWN, null, 'result_unknown'),
    };
  }

  function classifySubmitAttendanceCorrectionOutcome(options) {
    options = options || {};
    var expectedNonce = options.expectedNonce;
    var expectedDate = options.expectedDate;
    var data = options.data;
    var error = options.error;

    if (data != null) {
      if (
        isCreateAttendanceCorrectionShape(data, {
          clientNonce: expectedNonce,
          date: expectedDate,
        })
      ) {
        return {
          outcome: 'success',
          resolved: makeResolved(MESSAGES.ATT_CORRECTION_SUCCESS, null, 'success'),
          data: data,
        };
      }
      if (isCallableSuccessResponse(data) || getCallableFailureInfo(data).kind === 'malformed') {
        return {
          outcome: 'result_unknown',
          resolved: makeResolved(MESSAGES.ATT_CORRECTION_RESULT_UNKNOWN, null, 'result_unknown'),
        };
      }
      var soft = getCallableFailureInfo(data);
      if (soft.kind === 'soft-fail') {
        var softKey = soft.errorKey || null;
        if (softKey && ATTENDANCE_CORRECTION_CONFIRMED_FAILURE_KEYS[softKey]) {
          return {
            outcome: 'confirmed_failure',
            errorKey: softKey,
            resolved: resolveUserFacingError({
              operation: 'submit_attendance_correction',
              errorKey: softKey,
              code: soft.code,
            }),
          };
        }
        return {
          outcome: 'result_unknown',
          resolved: makeResolved(MESSAGES.ATT_CORRECTION_RESULT_UNKNOWN, null, 'result_unknown'),
        };
      }
    }

    if (error) {
      var errorKey = extractErrorKey(error, options);
      var code = extractCode(error, options);
      if (errorKey && ATTENDANCE_CORRECTION_CONFIRMED_FAILURE_KEYS[errorKey]) {
        return {
          outcome: 'confirmed_failure',
          errorKey: errorKey,
          resolved: resolveUserFacingError({
            operation: 'submit_attendance_correction',
            errorKey: errorKey,
            code: code,
            error: error,
          }),
        };
      }
      if (errorKey === 'ATTENDANCE_CORRECTION_INTERNAL_ERROR' || isOrderResultUnknownCode(code)) {
        return {
          outcome: 'result_unknown',
          resolved: makeResolved(MESSAGES.ATT_CORRECTION_RESULT_UNKNOWN, null, 'result_unknown'),
        };
      }
      return {
        outcome: 'result_unknown',
        resolved: makeResolved(MESSAGES.ATT_CORRECTION_RESULT_UNKNOWN, null, 'result_unknown'),
      };
    }

    return {
      outcome: 'result_unknown',
      resolved: makeResolved(MESSAGES.ATT_CORRECTION_RESULT_UNKNOWN, null, 'result_unknown'),
    };
  }

  function getAttendanceCorrectionGuard(pending, busy) {
    if (pending && pending.state === 'result_unknown') {
      return { allowNewNonce: false, blockReason: 'pending_lock' };
    }
    if (busy === true || (pending && pending.state === 'submitting')) {
      return { allowNewNonce: false, blockReason: 'busy' };
    }
    return { allowNewNonce: true, blockReason: null };
  }

  function createAttendanceCorrectionPending(clientNonce, date, payload, nowMs) {
    return {
      clientNonce: clientNonce,
      date: date,
      payload: payload || null,
      state: 'submitting',
      startedAt: typeof nowMs === 'number' ? nowMs : Date.now(),
    };
  }

  function transitionAttendanceCorrectionPending(pending, outcome) {
    if (!pending || typeof pending !== 'object') {
      return { pending: null, discardNonce: true };
    }
    if (outcome === 'success' || outcome === 'confirmed_failure') {
      return { pending: null, discardNonce: true };
    }
    return {
      pending: {
        clientNonce: pending.clientNonce,
        date: pending.date,
        payload: pending.payload || null,
        state: 'result_unknown',
        startedAt: pending.startedAt,
      },
      discardNonce: false,
    };
  }

  function resolveAttendanceCorrectionPendingFromFreshCheck(pending, freshData, options) {
    options = options || {};
    if (!pending || pending.state !== 'result_unknown') {
      return { cleared: false, pending: pending || null };
    }
    if (options.preflightExistsWasFalse !== true) {
      return { cleared: false, pending: pending };
    }
    if (options.fromStaleCache === true) {
      return { cleared: false, pending: pending };
    }
    if (
      !isCheckAttendanceCorrectionShape(
        { success: true, data: freshData },
        { date: pending.date },
      )
    ) {
      return { cleared: false, pending: pending };
    }
    if (
      freshData.exists === true &&
      (freshData.status === 'pending' ||
        freshData.status === 'approved' ||
        freshData.status === 'rejected') &&
      isNonEmptyString(freshData.requestId)
    ) {
      return { cleared: true, pending: null };
    }
    return { cleared: false, pending: pending };
  }

  function getShiftSubmitGuard(pending, busy) {
    if (pending && pending.state === 'result_unknown') {
      return { allowNewNonce: false, blockReason: 'pending_lock' };
    }
    if (busy === true || (pending && pending.state === 'submitting')) {
      return { allowNewNonce: false, blockReason: 'busy' };
    }
    return { allowNewNonce: true, blockReason: null };
  }

  function createShiftSubmitPending(clientNonce, payload, nowMs) {
    return {
      clientNonce: clientNonce,
      state: 'submitting',
      payload: payload || null,
      startedAt: typeof nowMs === 'number' ? nowMs : Date.now(),
    };
  }

  function transitionShiftSubmitPending(pending, nextState) {
    if (!pending || typeof pending !== 'object') return null;
    return {
      clientNonce: pending.clientNonce,
      state: nextState,
      payload: pending.payload || null,
      startedAt: pending.startedAt,
    };
  }

  /**
   * fresh getShifts items と payload の全件一致確認。
   * pending_request または同一時刻の assignment を成功とみなす（管理者即 interim 対応）。
   * fromStaleCache=true では解除しない。
   */
  function matchShiftSubmitPayloadInGetShifts(getShiftsData, payloadItems, options) {
    options = options || {};
    if (options.fromStaleCache === true) {
      return { matched: false, reason: 'stale_cache' };
    }
    var items = normalizeShiftSubmitPayloadItems(payloadItems);
    if (!items) return { matched: false, reason: 'bad_payload' };
    if (!isGetShiftsShape(getShiftsData)) {
      return { matched: false, reason: 'bad_shape' };
    }
    var shifts = getShiftsData.data.shifts;
    for (var i = 0; i < items.length; i++) {
      var want = items[i];
      var found = false;
      for (var j = 0; j < shifts.length; j++) {
        var s = shifts[j];
        if (s.dateKey !== want.dateKey) continue;
        if (s.startMinute !== want.startMinute || s.endMinute !== want.endMinute) continue;
        if (s.source === 'pending_request' && s.requestStatus === 'pending') {
          found = true;
          break;
        }
        if (s.source === 'assignment' && s.confirmed === true) {
          found = true;
          break;
        }
      }
      if (!found) {
        return { matched: false, reason: 'missing_or_mismatch', dateKey: want.dateKey };
      }
    }
    return { matched: true };
  }

  /**
   * staff status: not_found | active | retired | unknown
   * status 未設定は active（Functions normalize と一致）
   */
  function normalizeStaffDocStatus(data) {
    if (data && data.status === 'retired') return 'retired';
    return 'active';
  }

  /**
   * client 補助: profile doc が描画可能な object か
   */
  function isStaffProfileDataShape(data) {
    return data != null && typeof data === 'object' && !Array.isArray(data);
  }

  /**
   * client 補助: 参加不可理由（承認済み文言）。null なら参加可能（client側）。
   * stay: true | false | 'unknown'
   * LIFF OFF は呼び出し側でボタン非表示が正。ここは補助。
   */
  function getTournamentRegistrationBlockReason(tournament, stayStatus, options) {
    options = options || {};
    if (!tournament || typeof tournament !== 'object') {
      return MESSAGES.TOUR_INVALID_STATE;
    }
    var status = typeof tournament.status === 'string' ? tournament.status : '';
    if (status === 'ended' || status === 'force_ended') {
      return MESSAGES.TOUR_ENDED;
    }
    if (status === 'cancelled' || status === 'canceled') {
      return MESSAGES.TOUR_CANCELLED;
    }
    if (tournament.isRegisteredByCurrentUser === true) {
      return MESSAGES.TOUR_ALREADY_REGISTERED;
    }
    if (status === 'paused') {
      return MESSAGES.TOUR_PAUSED;
    }
    if (status === 'registered') {
      return MESSAGES.TOUR_REGISTRATION_CLOSED;
    }
    var regEndAt = tournament.regEndAt;
    if (typeof regEndAt === 'string' && regEndAt) {
      var endMs = Date.parse(regEndAt);
      if (Number.isFinite(endMs) && endMs <= Date.now()) {
        return MESSAGES.TOUR_REGISTRATION_CLOSED;
      }
    }
    if (status && status !== 'scheduled' && status !== 'running') {
      return MESSAGES.TOUR_INVALID_STATE;
    }
    if (options.liffRegistrationEnabled === false) {
      return MESSAGES.TOUR_LIFF_REGISTRATION_DISABLED;
    }
    var stay = normalizeStayStatus(stayStatus);
    if (stay === false) {
      return MESSAGES.TOUR_NOT_STAYING;
    }
    if (stay === 'unknown') {
      return MESSAGES.TOUR_STAY_UNKNOWN;
    }
    return null;
  }

  function getTournamentRegisterButtonShortLabel(tournament, options) {
    options = options || {};
    if (options.submitting === true) {
      return MESSAGES.TOUR_BTN_SUBMITTING;
    }
    if (!tournament || typeof tournament !== 'object') {
      return MESSAGES.TOUR_BTN_REGISTER;
    }
    var status = typeof tournament.status === 'string' ? tournament.status : '';
    if (tournament.isRegisteredByCurrentUser === true) {
      return MESSAGES.TOUR_BTN_REGISTERED;
    }
    if (status === 'ended' || status === 'force_ended') {
      return MESSAGES.TOUR_BTN_ENDED;
    }
    if (status === 'cancelled' || status === 'canceled') {
      return MESSAGES.TOUR_BTN_CANCELLED;
    }
    if (status === 'paused') {
      return MESSAGES.TOUR_BTN_PAUSED;
    }
    if (status === 'registered') {
      return MESSAGES.TOUR_BTN_CLOSED;
    }
    var regEndAt = tournament.regEndAt;
    if (typeof regEndAt === 'string' && regEndAt) {
      var endMs = Date.parse(regEndAt);
      if (Number.isFinite(endMs) && endMs <= Date.now()) {
        return MESSAGES.TOUR_BTN_CLOSED;
      }
    }
    return MESSAGES.TOUR_BTN_REGISTER;
  }

  /**
   * 参加登録 pending / nonce 状態（pure）
   * @returns {{ allowNewNonce: boolean, blockReason: null|'busy'|'pending_lock' }}
   */
  function getTournamentRegistrationGuard(pending, busy) {
    if (pending && pending.state === 'result_unknown') {
      return { allowNewNonce: false, blockReason: 'pending_lock' };
    }
    if (busy === true || (pending && pending.state === 'submitting')) {
      return { allowNewNonce: false, blockReason: 'busy' };
    }
    return { allowNewNonce: true, blockReason: null };
  }

  function createTournamentRegistrationPending(tournamentId, clientNonce, nowMs) {
    return {
      tournamentId: tournamentId,
      clientNonce: clientNonce,
      state: 'submitting',
      startedAt: typeof nowMs === 'number' ? nowMs : Date.now(),
    };
  }

  /**
   * success / confirmed_failure → pending 破棄
   * result_unknown → nonce 保持
   */
  function transitionTournamentRegistrationPending(pending, outcome) {
    if (!pending) {
      return { pending: null, discardNonce: true };
    }
    if (outcome === 'success' || outcome === 'confirmed_failure') {
      return { pending: null, discardNonce: true };
    }
    return {
      pending: {
        tournamentId: pending.tournamentId,
        clientNonce: pending.clientNonce,
        state: 'result_unknown',
        startedAt: pending.startedAt,
      },
      discardNonce: false,
    };
  }

  /**
   * result_unknown 後、fresh server list の isRegisteredByCurrentUser でのみ解除可。
   * staleCache=true の一覧では解除しない。
   */
  function resolveTournamentPendingFromFreshList(pending, tournaments, options) {
    options = options || {};
    if (!pending || pending.state !== 'result_unknown') {
      return { cleared: false, pending: pending || null };
    }
    if (options.fromStaleCache === true) {
      return { cleared: false, pending: pending };
    }
    if (!Array.isArray(tournaments)) {
      return { cleared: false, pending: pending };
    }
    for (var i = 0; i < tournaments.length; i++) {
      var t = tournaments[i];
      if (
        t &&
        t.id === pending.tournamentId &&
        t.isRegisteredByCurrentUser === true
      ) {
        return { cleared: true, pending: null };
      }
    }
    return { cleared: false, pending: pending };
  }

  /**
   * 履歴 items の clientNonce と pending の全商品一致を確認
   */
  function matchPendingOrderInHistory(historyData, pending) {
    if (!pending || !pending.clientNonce || !Array.isArray(pending.items)) {
      return { matched: false };
    }
    if (!isGetUserOrderHistoryShape(historyData)) {
      return { matched: false };
    }
    var found = [];
    var orders = historyData.data.orders;
    for (var i = 0; i < orders.length; i++) {
      var items = orders[i].items || [];
      for (var j = 0; j < items.length; j++) {
        if (items[j].clientNonce === pending.clientNonce) {
          found.push(items[j]);
        }
      }
    }
    if (found.length === 0) {
      return { matched: false };
    }
    var pendingMap = {};
    for (var p = 0; p < pending.items.length; p++) {
      pendingMap[pending.items[p].menuItemId] = pending.items[p].quantity;
    }
    var foundMap = {};
    for (var f = 0; f < found.length; f++) {
      var mid = found[f].menuItemId || '';
      foundMap[mid] = (foundMap[mid] || 0) + (found[f].quantity || 0);
    }
    var pendingKeys = Object.keys(pendingMap).sort();
    var foundKeys = Object.keys(foundMap).sort();
    if (pendingKeys.length !== foundKeys.length) {
      return { matched: false, partial: true };
    }
    for (var k = 0; k < pendingKeys.length; k++) {
      if (pendingKeys[k] !== foundKeys[k]) {
        return { matched: false, partial: true };
      }
      if (pendingMap[pendingKeys[k]] !== foundMap[pendingKeys[k]]) {
        return { matched: false, partial: true };
      }
    }
    return { matched: true, items: found };
  }

  return {
    MESSAGES: MESSAGES,
    MAX_ORDER_QUANTITY_PER_LINE: MAX_ORDER_QUANTITY_PER_LINE,
    MAX_ORDER_LINE_ITEMS: MAX_ORDER_LINE_ITEMS,
    ORDER_CONFIRMED_FAILURE_KEYS: ORDER_CONFIRMED_FAILURE_KEYS,
    TOURNAMENT_CONFIRMED_FAILURE_KEYS: TOURNAMENT_CONFIRMED_FAILURE_KEYS,
    STAFF_CREATE_CONFIRMED_FAILURE_KEYS: STAFF_CREATE_CONFIRMED_FAILURE_KEYS,
    STAFF_REACTIVATE_CONFIRMED_FAILURE_KEYS: STAFF_REACTIVATE_CONFIRMED_FAILURE_KEYS,
    SHIFT_SUBMIT_CONFIRMED_FAILURE_KEYS: SHIFT_SUBMIT_CONFIRMED_FAILURE_KEYS,
    ATTENDANCE_CORRECTION_CONFIRMED_FAILURE_KEYS: ATTENDANCE_CORRECTION_CONFIRMED_FAILURE_KEYS,
    createStageError: createStageError,
    resolveUserFacingError: resolveUserFacingError,
    mapCallableError: mapCallableError,
    mapSoftFailResponse: mapSoftFailResponse,
    mapLiffInitError: mapLiffInitError,
    mapAuthError: mapAuthError,
    isCallableSuccessResponse: isCallableSuccessResponse,
    getCallableFailureInfo: getCallableFailureInfo,
    isFirebaseCustomTokenShape: isFirebaseCustomTokenShape,
    isGetUserStatusShape: isGetUserStatusShape,
    isGenerateQRCodeShape: isGenerateQRCodeShape,
    isGenerateStaffQRCodeShape: isGenerateStaffQRCodeShape,
    isCreateStaffAccountShape: isCreateStaffAccountShape,
    isReactivateStaffAccountShape: isReactivateStaffAccountShape,
    isGetMenuItemsShape: isGetMenuItemsShape,
    isPlaceOrderByUserShape: isPlaceOrderByUserShape,
    isGetUserOrderHistoryShape: isGetUserOrderHistoryShape,
    isGetTodayTournamentsShape: isGetTodayTournamentsShape,
    isGetUpcomingTournamentsShape: isGetUpcomingTournamentsShape,
    isRegisterForTournamentShape: isRegisterForTournamentShape,
    isLiffTournamentItemShape: isLiffTournamentItemShape,
    isStaffProfileDataShape: isStaffProfileDataShape,
    isGetShiftsShape: isGetShiftsShape,
    isGetShiftsItemShape: isGetShiftsItemShape,
    isSubmitShiftRequestsShape: isSubmitShiftRequestsShape,
    isGetStaffAttendanceShape: isGetStaffAttendanceShape,
    isGetStaffAttendanceItemShape: isGetStaffAttendanceItemShape,
    isCheckAttendanceCorrectionShape: isCheckAttendanceCorrectionShape,
    isCreateAttendanceCorrectionShape: isCreateAttendanceCorrectionShape,
    normalizeShiftSubmitPayloadItems: normalizeShiftSubmitPayloadItems,
    normalizeStayStatus: normalizeStayStatus,
    isStayActionAllowed: isStayActionAllowed,
    normalizeStaffDocStatus: normalizeStaffDocStatus,
    normalizeOrderItemsForRequest: normalizeOrderItemsForRequest,
    buildOrderFingerprint: buildOrderFingerprint,
    createClientNonce: createClientNonce,
    classifyPlaceOrderOutcome: classifyPlaceOrderOutcome,
    classifyRegisterForTournamentOutcome: classifyRegisterForTournamentOutcome,
    classifyCreateStaffOutcome: classifyCreateStaffOutcome,
    classifyReactivateStaffOutcome: classifyReactivateStaffOutcome,
    classifySubmitShiftRequestsOutcome: classifySubmitShiftRequestsOutcome,
    classifySubmitAttendanceCorrectionOutcome: classifySubmitAttendanceCorrectionOutcome,
    getTournamentRegistrationBlockReason: getTournamentRegistrationBlockReason,
    getTournamentRegisterButtonShortLabel: getTournamentRegisterButtonShortLabel,
    getTournamentRegistrationGuard: getTournamentRegistrationGuard,
    createTournamentRegistrationPending: createTournamentRegistrationPending,
    transitionTournamentRegistrationPending: transitionTournamentRegistrationPending,
    resolveTournamentPendingFromFreshList: resolveTournamentPendingFromFreshList,
    getStaffMutationGuard: getStaffMutationGuard,
    createStaffMutationPending: createStaffMutationPending,
    transitionStaffMutationPending: transitionStaffMutationPending,
    getShiftSubmitGuard: getShiftSubmitGuard,
    createShiftSubmitPending: createShiftSubmitPending,
    transitionShiftSubmitPending: transitionShiftSubmitPending,
    matchShiftSubmitPayloadInGetShifts: matchShiftSubmitPayloadInGetShifts,
    getAttendanceCorrectionGuard: getAttendanceCorrectionGuard,
    createAttendanceCorrectionPending: createAttendanceCorrectionPending,
    transitionAttendanceCorrectionPending: transitionAttendanceCorrectionPending,
    resolveAttendanceCorrectionPendingFromFreshCheck:
      resolveAttendanceCorrectionPendingFromFreshCheck,
    matchPendingOrderInHistory: matchPendingOrderInHistory,
  };
});
