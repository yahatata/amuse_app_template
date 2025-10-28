/// 売上ダッシュボード用Repository
/// 
/// 責務: Firestore analyticsMonthly スキーマからのデータ取得・整形
/// 参照フィールド: analyticsMonthly/{YYYY-MM} およびそのサブコレクション
/// 遅延ロード: あり（HOME画面は月次Docのみ、詳細画面でサブコレクション取得）

import 'package:cloud_firestore/cloud_firestore.dart';
import '../models/analytics_models.dart';

class AnalyticsRepository {
  final FirebaseFirestore _firestore = FirebaseFirestore.instance;

  /// 月次Doc（1件）取得
  /// 参照パス: analyticsMonthly/{YYYY-MM}
  /// 使用フィールド: grossSales, orderCount, avgOrderValue, itemsSales, sideGameChipSales, tournamentsSales, extraCostSales, dailySales, paymentTotals
  /// 戻り値の構造: MonthlyDoc（完全な月次データ）
  Future<MonthlyDoc?> fetchMonthlyDoc(String yyyymm) async {
    try {
      final doc = await _firestore
          .collection('analyticsMonthly')
          .doc(yyyymm)
          .get();
      
      if (!doc.exists) return null;
      return MonthlyDoc.fromFirestore(doc);
    } catch (e) {
      throw Exception('月次データの取得に失敗しました: $e');
    }
  }

  /// 指定年（YYYY）に存在する月次Docをすべて取得（1〜12のうち存在分）
  /// 参照パス: analyticsMonthly/{YYYY-01} 〜 analyticsMonthly/{YYYY-12}
  /// 使用フィールド: grossSales, orderCount, avgOrderValue, paymentTotals
  /// 戻り値の構造: List<MonthlyDoc>（12ヶ月分、データなしの月は空のMonthlyDoc）
  Future<List<MonthlyDoc>> fetchYearlyMonthlyDocs(String yyyy) async {
    try {
      final months = <String>[];
      for (int month = 1; month <= 12; month++) {
        months.add('$yyyy-${month.toString().padLeft(2, '0')}');
      }

      final futures = months.map((month) => fetchMonthlyDoc(month));
      final results = await Future.wait(futures);
      
      // 12ヶ月分のデータを作成（データなしの月は空のMonthlyDoc）
      final yearlyDocs = <MonthlyDoc>[];
      for (int i = 0; i < 12; i++) {
        final monthId = months[i];
        final doc = results[i];
        
        if (doc != null) {
          yearlyDocs.add(doc);
        } else {
          // データなしの月は空のMonthlyDocを作成
          yearlyDocs.add(MonthlyDoc(
            monthId: monthId,
            grossSales: 0,
            orderCount: 0,
            avgOrderValue: 0.0,
            itemsSales: 0,
            sideGameChipSales: 0,
            tournamentsSales: 0,
            extraCostSales: 0,
            dailySales: {},
            paymentTotals: {},
            createdAt: DateTime.now(),
            updatedAt: DateTime.now(),
          ));
        }
      }
      
      return yearlyDocs;
    } catch (e) {
      throw Exception('年間データの取得に失敗しました: $e');
    }
  }

  /// 当月 days/* をまとめて取得し、日付昇順で返す
  /// 参照パス: analyticsMonthly/{YYYY-MM}/days/{YYYY-MM-DD}
  /// 使用フィールド: byPaymentMethod, itemsSales, sideGameChipSales, extraCostSales, tournamentsSales, grossSales, orderCount
  /// 戻り値の構造: List<DailyDoc>（日付昇順）
  Future<List<DailyDoc>> fetchMonthlyDays(String yyyymm) async {
    try {
      final snapshot = await _firestore
          .collection('analyticsMonthly')
          .doc(yyyymm)
          .collection('days')
          .orderBy('__name__')
          .get();

      return snapshot.docs
          .map((doc) => DailyDoc.fromFirestore(doc))
          .toList();
    } catch (e) {
      throw Exception('日次データの取得に失敗しました: $e');
    }
  }

  /// byCategory/summary を取得（商品別 上位N抽出は呼び出し側）
  /// 参照パス: analyticsMonthly/{YYYY-MM}/byCategory/summary
  /// 使用フィールド: totals, orderCounts, itemSales
  /// 戻り値の構造: CategorySummaryDoc（カテゴリ別集計・商品別売上）
  Future<CategorySummaryDoc?> fetchCategorySummary(String yyyymm) async {
    try {
      final doc = await _firestore
          .collection('analyticsMonthly')
          .doc(yyyymm)
          .collection('byCategory')
          .doc('summary')
          .get();
      
      if (!doc.exists) return null;
      return CategorySummaryDoc.fromFirestore(doc);
    } catch (e) {
      throw Exception('カテゴリサマリーの取得に失敗しました: $e');
    }
  }

  /// byTemplateTournaments/* を一覧取得
  /// 参照パス: analyticsMonthly/{YYYY-MM}/byTemplateTournaments/{templateId}
  /// 使用フィールド: templateName, totals, daily
  /// 戻り値の構造: List<TemplateTournamentDoc>（テンプレート別売上・日別データ）
  Future<List<TemplateTournamentDoc>> fetchTemplateTournamentDocs(String yyyymm) async {
    try {
      final snapshot = await _firestore
          .collection('analyticsMonthly')
          .doc(yyyymm)
          .collection('byTemplateTournaments')
          .get();

      return snapshot.docs
          .map((doc) => TemplateTournamentDoc.fromFirestore(doc))
          .toList();
    } catch (e) {
      throw Exception('トーナメントテンプレートデータの取得に失敗しました: $e');
    }
  }

  /// 現在の年月を取得（YYYY-MM形式）
  String getCurrentYearMonth() {
    final now = DateTime.now();
    return '${now.year}-${now.month.toString().padLeft(2, '0')}';
  }

  /// 現在の年を取得（YYYY形式）
  String getCurrentYear() {
    return DateTime.now().year.toString();
  }

  /// 日付文字列から年月を取得（YYYY-MM形式）
  String getYearMonthFromDate(DateTime date) {
    return '${date.year}-${date.month.toString().padLeft(2, '0')}';
  }

  /// 年月文字列から年を取得（YYYY形式）
  String getYearFromYearMonth(String yyyymm) {
    return yyyymm.split('-')[0];
  }

  /// 直近6ヶ月の総売上データを取得（最小限の読み取り）
  /// 参照パス: analyticsMonthly/{YYYY-MM}（直近6ヶ月分）
  /// 使用フィールド: grossSales のみ
  /// 戻り値の構造: List<Map<String, dynamic>>（月次ID、総売上、月名）
  Future<List<Map<String, dynamic>>> fetchLastSixMonthsGrossSales() async {
    try {
      final now = DateTime.now();
      final months = <String>[];
      
      // 直近6ヶ月の月次IDを生成
      for (int i = 5; i >= 0; i--) {
        final date = DateTime(now.year, now.month - i);
        final yyyymm = '${date.year}-${date.month.toString().padLeft(2, '0')}';
        months.add(yyyymm);
      }

      final futures = months.map((month) async {
        final doc = await _firestore
            .collection('analyticsMonthly')
            .doc(month)
            .get();
        
        if (!doc.exists) return null;
        
        final data = doc.data();
        return {
          'monthId': month,
          'grossSales': data?['grossSales'] ?? 0,
          'monthName': _getMonthName(month),
        };
      });
      
      final results = await Future.wait(futures);
      // 存在するドキュメントのみを返す（nullを除外）
      final validResults = results.where((item) => item != null).cast<Map<String, dynamic>>().toList();
      
      // デバッグ用ログ
      print('取得した月次データ: ${validResults.map((e) => '${e['monthId']}: ${e['grossSales']}').join(', ')}');
      
      return validResults;
    } catch (e) {
      throw Exception('直近6ヶ月データの取得に失敗しました: $e');
    }
  }

  /// 月次IDから月名を取得（例: "2025-09" → "9月"）
  String _getMonthName(String yyyymm) {
    final parts = yyyymm.split('-');
    final month = int.parse(parts[1]);
    return '$month月';
  }
}
