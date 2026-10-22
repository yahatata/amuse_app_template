import 'package:amuse_app_template/UserLogin/userCheckInPage.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  group('OkibakeLoginPromptData', () {
    test('link_prompt の entries をパースできる', () {
      final data = OkibakeLoginPromptData.fromMap({
        'mode': 'link_prompt',
        'count': 1,
        'entries': [
          {
            'tournamentId': 't1',
            'okibakeEntryId': 'e1',
            'entryStatus': 'registered',
            'billLinkStatus': 'unlinked',
            'temporaryDisplayName': '置きバケA',
          }
        ],
      });

      expect(data.isLinkPrompt, isTrue);
      expect(data.hasTargets, isTrue);
      expect(data.entries.length, 1);
      expect(data.entries.first.label, '置きバケA');
    });

    test('count 欠損時は entries 長で補完される', () {
      final data = OkibakeLoginPromptData.fromMap({
        'mode': 'notice_only',
        'entries': [
          {
            'tournamentId': 't1',
            'okibakeEntryId': 'e1',
            'entryStatus': 'registered',
            'billLinkStatus': 'unlinked',
          }
        ],
      });

      expect(data.count, 1);
      expect(data.isNoticeOnly, isTrue);
    });
  });
}
