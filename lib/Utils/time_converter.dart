import 'package:flutter/material.dart';

/// 時間変換ユーティリティ
/// 
/// UIの内部表現は minutes（int）に統一し、表示のみ "HH:MM" 形式に変換する。
/// これにより、DBとUIが同じ単位で動き、変換関数が散らからず、
/// gap検出・slider・編集のロジックが単純になる。
/// 深夜跨ぎも自然に扱える（例: 22:00-02:00 = 1320-1440）。

/// minutes（int）を "HH:MM" 形式の文字列に変換
/// 
/// 例:
/// - formatMinutes(540) -> "09:00"
/// - formatMinutes(1320) -> "22:00"
/// - formatMinutes(1440) -> "24:00"（24:00は1440分として扱う）
String formatMinutes(int minutes) {
  final hours = minutes ~/ 60;
  final mins = minutes % 60;
  return '${hours.toString().padLeft(2, '0')}:${mins.toString().padLeft(2, '0')}';
}

/// "HH:MM" 形式の文字列を minutes（int）に変換
/// 
/// 例:
/// - parseMinutes("09:00") -> 540
/// - parseMinutes("22:00") -> 1320
/// - parseMinutes("24:00") -> 1440（24:00は1440分として扱う）
/// 
/// 24:xx は禁止（24:00のみ許可）
int parseMinutes(String timeStr) {
  final parts = timeStr.split(':');
  final hours = int.parse(parts[0]);
  final minutes = int.parse(parts[1]);
  
  if (hours == 24 && minutes == 0) {
    return 1440; // 24:00は1440分として扱う
  }
  
  if (hours >= 24) {
    throw ArgumentError('Invalid time: $timeStr (24:xx is not allowed except 24:00)');
  }
  
  return hours * 60 + minutes;
}

/// TimeOfDay を minutes（int）に変換
int timeOfDayToMinutes(TimeOfDay time) {
  return time.hour * 60 + time.minute;
}

/// minutes（int）を TimeOfDay に変換
/// 
/// 24:00（1440分）の場合は 23:59 として扱う
TimeOfDay minutesToTimeOfDay(int minutes) {
  if (minutes >= 1440) {
    return const TimeOfDay(hour: 23, minute: 59);
  }
  return TimeOfDay(hour: minutes ~/ 60, minute: minutes % 60);
}

