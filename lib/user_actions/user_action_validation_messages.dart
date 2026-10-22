// UserAction ローカルvalidation向けの安全な固定文言（確認のみID向け）。
//
// 実装用語（templateId / 識別子 / 伝票ID 等）を店舗スタッフ向け業務表現に揃える。
// バリデーション条件そのものは変更しない。

const String kUserActionUserIdMissingMessage =
    'ユーザー情報を確認できませんでした。画面を更新してください。';

const String kUserActionBillIdMissingMessage =
    '伝票情報を確認できませんでした。画面を更新してください。';

const String kUserActionSideGameInfoMissingMessage =
    'サイドゲーム情報を確認できませんでした。画面を更新してください。';

const String kUserActionTournamentTemplateMissingMessage =
    'トーナメント情報を確認できませんでした。画面を更新してください。';

const String kUserActionUserInfoInsufficientMessage =
    'ユーザー情報を確認できませんでした。画面を更新してください。';

const String kUserActionTournamentInfoInsufficientMessage =
    'トーナメント情報を確認できませんでした。画面を更新してください。';
