/// 利用者向けに表示してよいエラー情報。
///
/// Functions の raw message / exception.toString() は含めない。
class UserFacingError {
  final String message;
  final String? errorKey;
  final String? code;
  final UserFacingErrorSource source;

  const UserFacingError({
    required this.message,
    this.errorKey,
    this.code,
    this.source = UserFacingErrorSource.unknown,
  });
}

enum UserFacingErrorSource {
  callable,
  softFail,
  unknown,
}
