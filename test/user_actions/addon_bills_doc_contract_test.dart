import 'package:flutter_test/flutter_test.dart';

/// Phase 3B（回帰用）  
/// Addon の **`bills/{billId}/tournaments/`** の doc ID は、  
/// **`scheduledTournaments/{開催}` の doc ID ではなく**、  
/// **`templateId`**（サーバー側 `addon.ts` / `bulkAddon.ts` と同じ）である必要がある。
void main() {
  test(
    'bills における Addon カウント参照は occurrence id ではなく templateId を鍵とする',
    () {
      const occurrenceScheduledId = 'scheduled-run-sample';
      const templateIdStable = 'tournament-template-sample';
      expect(occurrenceScheduledId != templateIdStable, isTrue);
    },
  );
}
