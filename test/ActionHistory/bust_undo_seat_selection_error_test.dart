import 'package:cloud_functions/cloud_functions.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:amuse_app_template/ActionHistory/bust_undo_fallback_seat_dialog.dart';
import 'package:amuse_app_template/ActionHistory/bust_undo_seat_selection_error.dart';

void main() {
  test('extractBustUndoSeatSelectionRequired が errorKey を判別する', () {
    final error = FirebaseFunctionsException(
      code: 'failed-precondition',
      message: '元の席が埋まっています。戻し先の空席を選択してください。',
      details: {
        'errorKey': 'TOURNAMENT_BUST_UNDO_SEAT_SELECTION_REQUIRED',
        'tournamentId': 't-1',
        'operationLogId': 'op-1',
        'participantType': 'okibake',
        'originalSeat': {'tableId': 'table-a', 'seatKey': 'seat02', 'seatNumber': 2},
        'availableSeats': [
          {'tableId': 'table-a', 'seatKey': 'seat03', 'seatNumber': 3},
        ],
      },
    );

    final parsed = extractBustUndoSeatSelectionRequired(error);
    expect(parsed, isNotNull);
    expect(parsed!.tournamentId, 't-1');
    expect(parsed.availableSeats.length, 1);
    expect(formatBustUndoFallbackSeatLabel(parsed.availableSeats.first), 'table-a / 席 3');
  });

  test('buildBustUndoFallbackSeatConfirmMessage は戻し先席確認用の文言を返す', () {
    final message = buildBustUndoFallbackSeatConfirmMessage(
      actionDisplayName: 'バースト（置きバケ）',
      targetDisplay: 'オキバケA',
      fallbackSeat: {
        'tableId': 'table-a',
        'seatNumber': 3,
      },
    );

    expect(message, contains('元の席は使用中'));
    expect(message, contains('バースト（置きバケ）'));
    expect(message, contains('オキバケA'));
    expect(message, contains('table-a / 席 3'));
    expect(message, isNot(contains('本当に取り消しますか')));
  });
}
