import 'package:amuse_app_template/services/store_meta_service.dart';

/// Phase6 Step4: 営業状態 assessment に基づく強警告判定・日付差計算（changeSpec §3.2, §3.3）
/// spec §4 優先順位、§4.1 next_day_started 強/弱、§6・§7 決定表に準拠

/// 強警告の種別（changeSpec §3.6 永続キー用）
enum StrongWarningType {
  needs_manual_close,
  next_day_started_strong,
  already_running_different_date,
}

/// 最上位 1 件の強警告情報（表示用）
class StrongWarningInfo {
  final StrongWarningType type;
  final String message;
  final String targetBusinessDateKey;

  const StrongWarningInfo({
    required this.type,
    required this.message,
    required this.targetBusinessDateKey,
  });
}

/// 弱警告情報（store management 端末のみ表示）
class WeakWarningInfo {
  final String message;
  final String intendedBusinessDateKey;
  final String currentBusinessDateKey;

  const WeakWarningInfo({
    required this.message,
    required this.intendedBusinessDateKey,
    required this.currentBusinessDateKey,
  });
}

/// YYYY-MM-DD を UTC の日付に変換。パース不能なら null（changeSpec §3.2）
/// 端末ローカル DateTime.parse は使わない。
DateTime? parseDateKeyToUtcDate(String? dateKey) {
  if (dateKey == null || dateKey.isEmpty) return null;
  final parts = dateKey.split('-');
  if (parts.length != 3) return null;
  try {
    final y = int.parse(parts[0]);
    final m = int.parse(parts[1]);
    final d = int.parse(parts[2]);
    if (m < 1 || m > 12 || d < 1 || d > 31) return null;
    return DateTime.utc(y, m, d);
  } catch (_) {
    return null;
  }
}

/// 日差。current - intended。パース不能なら null（判定不能→弱扱い）
int? diffDays(String? currentBusinessDateKey, String? intendedBusinessDateKey) {
  final currentUtc = parseDateKeyToUtcDate(currentBusinessDateKey);
  final intendedUtc = parseDateKeyToUtcDate(intendedBusinessDateKey);
  if (currentUtc == null || intendedUtc == null) return null;
  return currentUtc.difference(intendedUtc).inDays;
}

/// next_day_started の事故疑いシグナル: diffDays==1 → 強、それ以外 → 弱（spec §4.1）
bool isNextDayStartedStrong(StoreMetaData meta) {
  final close = meta.closeAssessment;
  if (close == null || close.result != 'next_day_started') return false;
  final d = diffDays(meta.currentBusinessDateKey, close.intendedBusinessDateKey);
  return d == 1;
}

/// 表示抑制: 当該 assessment の suppressedByOverride が true なら表示しない（changeSpec §3.1）
bool _closeSuppressed(StoreMetaData meta) =>
    meta.closeAssessment?.suppressedByOverride == true;
bool _openSuppressed(StoreMetaData meta) =>
    meta.openAssessment?.suppressedByOverride == true;

/// 最上位 1 件の強警告を取得。なければ null。error は別枠のため強警告には含めない。
StrongWarningInfo? getTopStrongWarning(StoreMetaData meta) {
  // 2. needs_manual_close（suppressed でない）
  if (!_closeSuppressed(meta)) {
    final close = meta.closeAssessment;
    if (close?.result == 'needs_manual_close') {
      final intended = close!.intendedBusinessDateKey ?? '';
      final hasActiveStays = close.blockers.contains('activeStaysNotEmpty');
      final msg = hasActiveStays
          ? '閉店時間を過ぎています。$intended の閉店処理を実行するか、営業継続を選択してください。滞在中有のため、閉店処理の前にご確認ください。'
          : '閉店時間を過ぎています。$intended の閉店処理を実行するか、営業継続を選択してください。';
      return StrongWarningInfo(
        type: StrongWarningType.needs_manual_close,
        message: msg,
        targetBusinessDateKey: intended,
      );
    }
  }

  // 3. next_day_started（強のみ。弱は強警告として返さない）
  if (!_closeSuppressed(meta)) {
    final close = meta.closeAssessment;
    if (close?.result == 'next_day_started' && isNextDayStartedStrong(meta)) {
      final intended = close!.intendedBusinessDateKey ?? '';
      final current = meta.currentBusinessDateKey ?? '';
      const msg = '閉店対象日と現在営業日が異なります。閉店が未実施のまま営業中です。管理者は閉店対象日の閉店処理を実行してください。';
      return StrongWarningInfo(
        type: StrongWarningType.next_day_started_strong,
        message: '閉店対象日: $intended。現在営業日: $current。$msg',
        targetBusinessDateKey: intended,
      );
    }
  }

  // 4. already_running_different_date
  if (!_openSuppressed(meta)) {
    final open = meta.openAssessment;
    if (open?.result == 'skipped' && open!.hasBlockerAlreadyRunningDifferentDate) {
      final current = meta.currentBusinessDateKey ?? '';
      final intended = open.intendedBusinessDateKey ?? '';
      return StrongWarningInfo(
        type: StrongWarningType.already_running_different_date,
        message: '閉店対象日（現在営業日）: $current。開店認定対象日: $intended。$current の閉店が未実施の可能性があります。管理者は閉店処理を実行してください。',
        targetBusinessDateKey: current,
      );
    }
  }

  return null;
}

/// next_day_started で弱のときの弱警告（store management 端末のみ表示用）
WeakWarningInfo? getNextDayStartedWeakWarning(StoreMetaData meta) {
  if (_closeSuppressed(meta)) return null;
  final close = meta.closeAssessment;
  if (close?.result != 'next_day_started') return null;
  if (isNextDayStartedStrong(meta)) return null; // 強は強警告で扱う
  final intended = close!.intendedBusinessDateKey ?? '';
  final current = meta.currentBusinessDateKey;
  // §10: currentBusinessDateKey が null のときは専用文言
  final String message = current == null || current.isEmpty
      ? '現在営業日は取得できません。閉店対象日$intended の閉店処理をご確認ください。'
      : '閉店対象日: $intended。現在営業日: $current。誤タスクの可能性があります。念のため閉店処理をご確認ください。';
  return WeakWarningInfo(
    message: message,
    intendedBusinessDateKey: intended,
    currentBusinessDateKey: current ?? '',
  );
}

/// 閉店中で開店処理が必要な場合に true（§9.1: 日付表示部に「開店処理が必要です」を表示する条件）
bool shouldShowOpenNeeded(StoreMetaData meta) {
  if (!meta.isClosed) return false;
  final open = meta.openAssessment;
  if (open == null || open.suppressedByOverride) return false;
  final result = open.result;
  return result == 'ready_to_open' || result == 'needs_manual_open';
}

/// 日付表示部の warning 用: needs_manual_close / next_day_started / already_running_different_date の短い文言
String? getDateWarningLabel(StoreMetaData meta) {
  if (!_closeSuppressed(meta)) {
    final close = meta.closeAssessment;
    if (close?.result == 'needs_manual_close') {
    final intended = close!.intendedBusinessDateKey ?? '';
      return '閉店未実施（$intended）';
    }
    if (close?.result == 'next_day_started') {
      final intended = close!.intendedBusinessDateKey ?? '';
      return '閉店未実施（$intended）';
    }
  }
  if (!_openSuppressed(meta)) {
    final open = meta.openAssessment;
    if (open?.result == 'skipped' && open!.hasBlockerAlreadyRunningDifferentDate) {
      final current = meta.currentBusinessDateKey ?? '';
      return '閉店未実施疑い（$current）';
    }
  }
  return null;
}
