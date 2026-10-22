import 'package:flutter_test/flutter_test.dart';
import 'package:amuse_app_template/StaffDate/shift_draft_selection.dart';

void main() {
  const idOct1A = 'staff-a_2026-10-01';
  const idOct1B = 'staff-b_2026-10-01';
  const idOct2A = 'staff-a_2026-10-02';

  final pendingOct1 = pendingRequestIdsOnDate([
    (requestId: idOct1A, status: 'pending'),
    (requestId: idOct1B, status: 'pending'),
  ]);
  final pendingOct2 = pendingRequestIdsOnDate([
    (requestId: idOct2A, status: 'pending'),
  ]);

  group('selectedRequestIdsForDate', () {
    test('10/2 selected then viewing 10/1 yields empty selection', () {
      final selected = {idOct2A};

      expect(
        selectedRequestIdsForDate(
          selectedRequestIds: selected,
          pendingRequestIdsOnDate: pendingOct1,
        ),
        isEmpty,
      );
      expect(
        selectedCountForDate(
          selectedRequestIds: selected,
          pendingRequestIdsOnDate: pendingOct1,
        ),
        0,
      );
    });

    test('10/1 one selected yields count 1', () {
      final selected = {idOct1A};

      expect(
        selectedCountForDate(
          selectedRequestIds: selected,
          pendingRequestIdsOnDate: pendingOct1,
        ),
        1,
      );
    });

    test('same 10/1 two selected yields count 2', () {
      final selected = {idOct1A, idOct1B};

      expect(
        selectedCountForDate(
          selectedRequestIds: selected,
          pendingRequestIdsOnDate: pendingOct1,
        ),
        2,
      );
    });

    test('stale other-day id in state is excluded from current date', () {
      final selected = {idOct1A, idOct2A};

      expect(
        selectedRequestIdsForDate(
          selectedRequestIds: selected,
          pendingRequestIdsOnDate: pendingOct1,
        ),
        {idOct1A},
      );
      expect(
        selectedCountForDate(
          selectedRequestIds: selected,
          pendingRequestIdsOnDate: pendingOct1,
        ),
        1,
      );
    });

    test('date tab switch clears selection when modeled as empty set', () {
      // Page clears _selectedRequestIds on _selectDate; after switch nothing selected.
      expect(
        selectedCountForDate(
          selectedRequestIds: {},
          pendingRequestIdsOnDate: pendingOct1,
        ),
        0,
      );
    });
  });

  group('buildInterimConfirmSelectionsForDate', () {
    test('same-day two selections produce two payload entries', () {
      final selected = {idOct1A, idOct1B};
      final allocations = {
        idOct1A: (startMinute: 19 * 60, endMinute: 22 * 60),
        idOct1B: (startMinute: 18 * 60, endMinute: 21 * 60),
      };

      final selections = buildInterimConfirmSelectionsForDate(
        selectedRequestIds: selected,
        pendingRequestIdsOnDate: pendingOct1,
        allocationByRequestId: allocations,
      );

      expect(selections, hasLength(2));
      expect(selections.map((s) => s['requestId']), containsAll([idOct1A, idOct1B]));
      expect(selections.firstWhere((s) => s['requestId'] == idOct1A)['startMinute'], 19 * 60);
      expect(selections.firstWhere((s) => s['requestId'] == idOct1B)['endMinute'], 21 * 60);
    });

    test('stale other-day id is not included in confirm payload', () {
      final selected = {idOct1A, idOct2A};
      final allocations = {
        idOct1A: (startMinute: 19 * 60, endMinute: 22 * 60),
        idOct2A: (startMinute: 10 * 60, endMinute: 18 * 60),
      };

      final selections = buildInterimConfirmSelectionsForDate(
        selectedRequestIds: selected,
        pendingRequestIdsOnDate: pendingOct1,
        allocationByRequestId: allocations,
      );

      expect(selections, hasLength(1));
      expect(selections.single['requestId'], idOct1A);
    });
  });

  group('pendingRequestIdsOnDate', () {
    test('ignores non-pending requests', () {
      final ids = pendingRequestIdsOnDate([
        (requestId: idOct1A, status: 'pending'),
        (requestId: idOct1B, status: 'interim_confirmed'),
      ]);

      expect(ids, {idOct1A});
    });
  });
}
