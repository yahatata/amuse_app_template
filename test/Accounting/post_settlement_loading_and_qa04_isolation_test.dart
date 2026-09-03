import 'dart:io';

import 'package:flutter_test/flutter_test.dart';

/// ACC-04 / QA-04 cleanup: static reachability + loading rule regression guards.
void main() {
  group('QA-04 Terminal isolation', () {
    test('terminalHomePage から冪等再送確認 entry が消えている', () {
      final source = File('lib/Home/terminalHomePage.dart').readAsStringSync();
      expect(source.contains('会計後操作 冪等再送確認'), isFalse);
      expect(
        source.contains(
          "import 'package:amuse_app_template/Accounting/postSettlementIdempotencyReplayPage.dart'",
        ),
        isFalse,
      );
      expect(source.contains('PostSettlementIdempotencyReplayPage('), isFalse);
      // 業務の会計後操作入口は残す
      expect(source.contains('PostSettlementOperationsPage'), isTrue);
      expect(source.contains("'会計後操作'"), isTrue);
    });

    test('冪等再送 QA page source is deleted', () {
      expect(
        File('lib/Accounting/postSettlementIdempotencyReplayPage.dart')
            .existsSync(),
        isFalse,
      );
    });

    test('PostSettlementIdempotencyReplayPage is not rewired in Terminal', () {
      final source = File('lib/Home/terminalHomePage.dart').readAsStringSync();
      expect(source.contains('PostSettlementIdempotencyReplayPage'), isFalse);
      expect(
        source.contains('postSettlementIdempotencyReplayPage.dart'),
        isFalse,
      );
      expect(source.contains('会計後操作 冪等再送確認'), isFalse);
    });
  });

  group('ACC-04 post-settlement mutation loading rule', () {
    test('detail / refund / collection がボタン内スピナーではなく全面オーバーレイを使う', () {
      final detail =
          File('lib/Accounting/postSettlementOperationDetailPage.dart')
              .readAsStringSync();
      final refund =
          File('lib/Accounting/postSettlementRefundDialog.dart').readAsStringSync();
      final collection =
          File('lib/Accounting/postSettlementCollectionDialog.dart')
              .readAsStringSync();

      for (final entry in {
        'detail': detail,
        'refund': refund,
        'collection': collection,
      }.entries) {
        expect(
          entry.value.contains('Positioned.fill'),
          isTrue,
          reason: '${entry.key}: fullscreen/dialog overlay Positioned.fill',
        );
        expect(
          entry.value.contains('AbsorbPointer'),
          isTrue,
          reason: '${entry.key}: lock via AbsorbPointer',
        );
        expect(
          entry.value.contains('Colors.black.withValues(alpha: 0.35)'),
          isTrue,
          reason: '${entry.key}: black translucent overlay',
        );
      }

      // ボタン内 16x16 CPI パターンを live 実行ボタンから排除
      expect(
        detail.contains('width: 16,\n                    height: 16,\n                    child: CircularProgressIndicator'),
        isFalse,
      );
      expect(refund.contains("child: CircularProgressIndicator(strokeWidth: 2)"), isFalse);
      expect(
        collection.contains("child: CircularProgressIndicator(strokeWidth: 2)"),
        isFalse,
      );
    });
  });
}
