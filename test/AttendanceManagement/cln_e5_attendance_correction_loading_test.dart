import 'dart:io';

import 'package:amuse_app_template/AttendanceManagement/attendance_correction_mutation_gate.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  group('CLN-E5 attendance correction mutation lock', () {
    test('approve/reject share one lock: second acquire fails', () {
      final gate = AttendanceCorrectionMutationGate();
      expect(gate.tryAcquire(), isTrue);
      expect(gate.isLocked, isTrue);
      expect(gate.tryAcquire(), isFalse);
    });

    test('success releases lock', () async {
      final gate = AttendanceCorrectionMutationGate();
      var ran = 0;
      final result = await runAttendanceCorrectionMutation<String>(
        gate: gate,
        action: () async {
          ran += 1;
          expect(gate.isLocked, isTrue);
          return 'ok';
        },
      );
      expect(result, 'ok');
      expect(ran, 1);
      expect(gate.isLocked, isFalse);
    });

    test('failure also releases lock', () async {
      final gate = AttendanceCorrectionMutationGate();
      await expectLater(
        runAttendanceCorrectionMutation<void>(
          gate: gate,
          action: () async {
            throw StateError('callable failed');
          },
        ),
        throwsA(isA<StateError>()),
      );
      expect(gate.isLocked, isFalse);
    });

    test('locked mutation does not run a second action', () async {
      final gate = AttendanceCorrectionMutationGate();
      var firstStarted = false;
      var secondRan = 0;

      final first = runAttendanceCorrectionMutation<void>(
        gate: gate,
        action: () async {
          firstStarted = true;
          await Future<void>.delayed(const Duration(milliseconds: 30));
        },
      );
      await Future<void>.delayed(const Duration(milliseconds: 5));
      expect(firstStarted, isTrue);

      final second = await runAttendanceCorrectionMutation<int>(
        gate: gate,
        action: () async {
          secondRan += 1;
          return 1;
        },
      );
      expect(second, isNull);
      expect(secondRan, 0);

      await first;
      expect(gate.isLocked, isFalse);
    });
  });

  group('CLN-E5 page wiring', () {
    final src = File(
      'lib/AttendanceManagement/attendanceCorrectionRequestsPage.dart',
    ).readAsStringSync();

    test('fullscreen overlay + AbsorbPointer for mutation', () {
      expect(src.contains('if (_isMutating)'), isTrue);
      expect(src.contains('AbsorbPointer'), isTrue);
      expect(src.contains('Colors.black.withValues(alpha: 0.35)'), isTrue);
      expect(src.contains('CircularProgressIndicator()'), isTrue);
      expect(src.contains('canPop: !_isMutating'), isTrue);
    });

    test('reject confirmation happens before lock', () {
      final rejectStart = src.indexOf('Future<void> _rejectRequest');
      final dialogCall = src.indexOf('_showRejectionReasonDialog()', rejectStart);
      final lockCall = src.indexOf('_runLockedMutation', rejectStart);
      expect(dialogCall, greaterThan(rejectStart));
      expect(lockCall, greaterThan(dialogCall));
    });

    test('callable names and payload keys are unchanged', () {
      expect(src.contains("'approveAttendanceCorrectionRequest'"), isTrue);
      expect(src.contains("'rejectAttendanceCorrectionRequest'"), isTrue);
      expect(src.contains("'requestId': requestId"), isTrue);
      expect(src.contains("'adminUserId': adminUserId"), isTrue);
      expect(src.contains("'adminUserName': adminUserName"), isTrue);
      expect(src.contains("'rejectionReason': rejectionReason.trim()"), isTrue);
      expect(src.contains("_loadCorrectionRequests()"), isTrue);
    });

    test('approve and reject buttons disable while mutating', () {
      expect(src.contains('onPressed: _isMutating'), isTrue);
      expect(src.contains("_approveRequest(request['id'])"), isTrue);
      expect(src.contains("_rejectRequest(request['id'])"), isTrue);
    });
  });
}
