import 'package:amuse_app_template/tournament/active/pages/blind_timer_page.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  group('initializeBlindTimerServerTimeOffset', () {
    test('calls getServerOffset', () async {
      var called = false;

      await initializeBlindTimerServerTimeOffset(
        getServerOffset: () async {
          called = true;
          return const Duration(seconds: 1);
        },
        logWarning: (_) {},
      );

      expect(called, isTrue);
    });

    test('does not throw when getServerOffset throws', () async {
      await initializeBlindTimerServerTimeOffset(
        getServerOffset: () async => throw Exception('network error'),
        logWarning: (_) {},
      );
    });

    test('logs when offset is null', () async {
      final messages = <String>[];

      await initializeBlindTimerServerTimeOffset(
        getServerOffset: () async => null,
        logWarning: messages.add,
      );

      expect(messages, hasLength(1));
      expect(messages.first, contains('server time offset unavailable'));
    });
  });
}
