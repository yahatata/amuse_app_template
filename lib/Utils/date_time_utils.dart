import 'package:intl/intl.dart';

/// 日本時間（UTC+9）基準の時間処理ユーティリティ
class DateTimeUtils {
  /// 日本時間のオフセット（分）
  static const int jstOffsetMinutes = 9 * 60;
  
  /// 日本時間のオフセット（ミリ秒）
  static const int jstOffsetMilliseconds = jstOffsetMinutes * 60 * 1000;
  
  /// 現在の日本時間を取得
  static DateTime getCurrentJST() {
    final now = DateTime.now();
    final utc = now.toUtc();
    return utc.add(Duration(milliseconds: jstOffsetMilliseconds));
  }
  
  /// 日本時間での今日の開始（00:00:00）を取得
  static DateTime getTodayStartJST() {
    final jstNow = getCurrentJST();
    return DateTime(jstNow.year, jstNow.month, jstNow.day);
  }
  
  /// 日本時間での昨日の開始（00:00:00）を取得
  static DateTime getYesterdayStartJST() {
    final today = getTodayStartJST();
    return today.subtract(const Duration(days: 1));
  }
  
  /// 日本時間での明日の開始（00:00:00）を取得
  static DateTime getTomorrowStartJST() {
    final today = getTodayStartJST();
    return today.add(const Duration(days: 1));
  }
  
  /// 日本時間での今週の開始（月曜日 00:00:00）を取得
  static DateTime getThisWeekStartJST() {
    final today = getTodayStartJST();
    final weekday = today.weekday;
    final mondayOffset = weekday == 1 ? 0 : weekday - 1;
    return today.subtract(Duration(days: mondayOffset));
  }
  
  /// 日本時間での今週の終了（日曜日 23:59:59）を取得
  static DateTime getThisWeekEndJST() {
    final weekStart = getThisWeekStartJST();
    return weekStart.add(const Duration(days: 7)).subtract(const Duration(seconds: 1));
  }
  
  /// 日本時間での明日から7日間の開始（明日 00:00:00）を取得
  static DateTime getNext7DaysStartJST() {
    return getTomorrowStartJST();
  }
  
  /// 日本時間での明日から7日間の終了（7日後 23:59:59）を取得
  static DateTime getNext7DaysEndJST() {
    final start = getTomorrowStartJST();
    return start.add(const Duration(days: 7)).subtract(const Duration(seconds: 1));
  }
  
  /// UTCのDateTimeを日本時間に変換
  static DateTime utcToJST(DateTime utcDateTime) {
    return utcDateTime.add(Duration(milliseconds: jstOffsetMilliseconds));
  }
  
  /// 日本時間のDateTimeをUTCに変換
  static DateTime jstToUTC(DateTime jstDateTime) {
    return jstDateTime.subtract(Duration(milliseconds: jstOffsetMilliseconds));
  }
  
  /// ISO文字列を日本時間のDateTimeに変換
  static DateTime parseISOToJST(String isoString) {
    final utc = DateTime.parse(isoString);
    return utcToJST(utc);
  }
  
  /// 日本時間のDateTimeを読みやすい文字列にフォーマット
  static String formatJSTForDisplay(DateTime jstDateTime) {
    final now = getCurrentJST();
    final today = getTodayStartJST();
    final yesterday = getYesterdayStartJST();
    final tomorrow = getTomorrowStartJST();
    
    String datePrefix;
    if (jstDateTime.isAtSameMomentAs(today)) {
      datePrefix = '今日';
    } else if (jstDateTime.isAtSameMomentAs(yesterday)) {
      datePrefix = '昨日';
    } else if (jstDateTime.isAtSameMomentAs(tomorrow)) {
      datePrefix = '明日';
    } else {
      // 月/日の形式
      datePrefix = '${jstDateTime.month}/${jstDateTime.day}';
    }
    
    // 時間の形式（HH:MM）
    final timeString = '${jstDateTime.hour.toString().padLeft(2, '0')}:${jstDateTime.minute.toString().padLeft(2, '0')}';
    
    return '$datePrefix $timeString';
  }
  
  /// 日本時間のDateTimeを詳細な文字列にフォーマット
  static String formatJSTDetailed(DateTime jstDateTime) {
    final formatter = DateFormat('yyyy年M月d日(E) HH:mm', 'ja_JP');
    return formatter.format(jstDateTime);
  }
  
  /// 期間フィルタリング用の比較関数（既に日本時間のDateTime用）
  static bool isSameDayJST(DateTime date1, DateTime date2) {
    final jst1 = utcToJST(date1);
    final jst2 = utcToJST(date2);
    return jst1.year == jst2.year && 
           jst1.month == jst2.month && 
           jst1.day == jst2.day;
  }
  
  /// 期間フィルタリング用の比較関数（既に日本時間のDateTime用）
  static bool isSameDayJSTAlready(DateTime jstDate1, DateTime jstDate2) {
    return jstDate1.year == jstDate2.year && 
           jstDate1.month == jstDate2.month && 
           jstDate1.day == jstDate2.day;
  }
  
  /// 期間フィルタリング用の日付範囲チェック（既に日本時間のDateTime用）
  static bool isInDateRangeJSTAlready(DateTime jstTarget, DateTime jstStart, DateTime jstEnd) {
    return jstTarget.isAfter(jstStart.subtract(const Duration(seconds: 1))) && 
           jstTarget.isBefore(jstEnd.add(const Duration(seconds: 1)));
  }
  
  /// 期間フィルタリング用の日付範囲チェック
  static bool isInDateRangeJST(DateTime target, DateTime start, DateTime end) {
    final jstTarget = utcToJST(target);
    final jstStart = utcToJST(start);
    final jstEnd = utcToJST(end);
    
    return jstTarget.isAfter(jstStart.subtract(const Duration(seconds: 1))) && 
           jstTarget.isBefore(jstEnd.add(const Duration(seconds: 1)));
  }
}
