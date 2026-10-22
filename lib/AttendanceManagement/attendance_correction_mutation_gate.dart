/// 勤怠修正 approve/reject の同一画面 mutation lock（CLN-E5）。
/// approve 中の reject、reject 中の approve、二重 tap を UI 側で防ぐ。
class AttendanceCorrectionMutationGate {
  bool _locked = false;

  bool get isLocked => _locked;

  /// 取得できたときだけ true。既に lock 中なら false（action を走らせない）。
  bool tryAcquire() {
    if (_locked) return false;
    _locked = true;
    return true;
  }

  void release() {
    _locked = false;
  }
}

/// [action] を単一 lock で実行する。取得失敗時は null（二重実行しない）。
/// 成功・失敗どちらでも [AttendanceCorrectionMutationGate.release] する。
Future<T?> runAttendanceCorrectionMutation<T>({
  required AttendanceCorrectionMutationGate gate,
  required Future<T> Function() action,
}) async {
  if (!gate.tryAcquire()) return null;
  try {
    return await action();
  } finally {
    gate.release();
  }
}
