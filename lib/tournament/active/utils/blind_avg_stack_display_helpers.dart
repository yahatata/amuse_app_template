import 'package:intl/intl.dart';

/// views/main.avgStack をブラインドタイマー表示用文字列に変換する。
String formatBlindAvgStack(dynamic avgStack) {
  if (avgStack is int) {
    return NumberFormat('#,###').format(avgStack);
  }
  if (avgStack is num) {
    return NumberFormat('#,###').format(avgStack.toInt());
  }
  return '-';
}
