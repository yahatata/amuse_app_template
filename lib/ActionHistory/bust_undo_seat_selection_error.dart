import 'package:cloud_functions/cloud_functions.dart';

class BustUndoSeatSelectionRequired {
  final String tournamentId;
  final String operationLogId;
  final String participantType;
  final Map<String, dynamic> originalSeat;
  final List<Map<String, dynamic>> availableSeats;

  const BustUndoSeatSelectionRequired({
    required this.tournamentId,
    required this.operationLogId,
    required this.participantType,
    required this.originalSeat,
    required this.availableSeats,
  });

  factory BustUndoSeatSelectionRequired.fromDetails(Map<dynamic, dynamic> details) {
    final availableRaw = details['availableSeats'];
    final availableSeats = <Map<String, dynamic>>[];
    if (availableRaw is List) {
      for (final item in availableRaw) {
        if (item is Map) {
          availableSeats.add(Map<String, dynamic>.from(item));
        }
      }
    }

    return BustUndoSeatSelectionRequired(
      tournamentId: details['tournamentId']?.toString() ?? '',
      operationLogId: details['operationLogId']?.toString() ?? '',
      participantType: details['participantType']?.toString() ?? 'normal',
      originalSeat: details['originalSeat'] is Map
          ? Map<String, dynamic>.from(details['originalSeat'] as Map)
          : const {},
      availableSeats: availableSeats,
    );
  }
}

BustUndoSeatSelectionRequired? extractBustUndoSeatSelectionRequired(Object error) {
  if (error is! FirebaseFunctionsException) return null;
  final details = error.details;
  if (details is! Map) return null;
  final detailsMap = Map<dynamic, dynamic>.from(details);
  if (detailsMap['errorKey'] != 'TOURNAMENT_BUST_UNDO_SEAT_SELECTION_REQUIRED') {
    return null;
  }
  return BustUndoSeatSelectionRequired.fromDetails(detailsMap);
}

String formatBustUndoFallbackSeatLabel(Map<String, dynamic> seat) {
  final tableId = seat['tableName']?.toString() ?? seat['tableId']?.toString() ?? '';
  final seatNumber = seat['seatNumber'];
  if (seatNumber is num) {
    return '$tableId / 席 ${seatNumber.toInt()}';
  }
  final seatKey = seat['seatKey']?.toString() ?? '';
  return '$tableId / $seatKey';
}

Map<String, dynamic> bustUndoFallbackSeatPayload(Map<String, dynamic> seat) {
  final payload = <String, dynamic>{
    'tableId': seat['tableId']?.toString() ?? '',
    'seatKey': seat['seatKey']?.toString() ?? '',
  };
  final seatNumber = seat['seatNumber'];
  if (seatNumber is num) {
    payload['seatNumber'] = seatNumber.toInt();
  }
  return payload;
}
