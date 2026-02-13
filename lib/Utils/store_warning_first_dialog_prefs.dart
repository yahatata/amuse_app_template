import 'package:shared_preferences/shared_preferences.dart';
import 'package:amuse_app_template/utils/store_assessment_utils.dart';

/// Phase6 Step4: 非 store management 端末の「初回のみダイアログ」判定（changeSpec §3.6）
/// 永続キー: storeId + warningType + targetBusinessDateKey。表示した時点で保存する。

const String _keyPrefix = 'store_strong_warning_first_dialog_';
const String _storeId = 'storeMeta_currentBusinessDay';

String _prefsKey(StrongWarningType type, String targetBusinessDateKey) {
  final typeStr = switch (type) {
    StrongWarningType.needs_manual_close => 'needs_manual_close',
    StrongWarningType.next_day_started_strong => 'next_day_started_strong',
    StrongWarningType.already_running_different_date => 'already_running_different_date',
  };
  return '${_keyPrefix}${_storeId}_${typeStr}_$targetBusinessDateKey';
}

/// 初回ダイアログを表示した時点で呼ぶ。dismiss を待たない。
Future<void> markStrongWarningFirstDialogShown(
  StrongWarningType type,
  String targetBusinessDateKey,
) async {
  final prefs = await SharedPreferences.getInstance();
  await prefs.setBool(_prefsKey(type, targetBusinessDateKey), true);
}

/// 既に初回ダイアログを表示済みなら true（2回目以降は Banner のみ）
Future<bool> hasStrongWarningFirstDialogBeenShown(
  StrongWarningType type,
  String targetBusinessDateKey,
) async {
  final prefs = await SharedPreferences.getInstance();
  return prefs.getBool(_prefsKey(type, targetBusinessDateKey)) == true;
}
