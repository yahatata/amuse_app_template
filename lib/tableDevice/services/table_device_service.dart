import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:cloud_functions/cloud_functions.dart';
import 'package:intl/intl.dart';

import 'package:amuse_app_template/core/errors/errors.dart';
import 'package:amuse_app_template/core/utils/functions_client.dart';
import 'package:amuse_app_template/models/device.dart';
import 'package:amuse_app_template/services/device_options.dart';
import 'package:amuse_app_template/services/device_service.dart';
import 'package:amuse_app_template/services/store_config_defaults.dart';
import 'package:amuse_app_template/services/store_config_service.dart';
import 'package:amuse_app_template/services/store_meta_service.dart';
import 'package:amuse_app_template/tableDevice/models/table_device_home_state.dart';

/// TableDevice Callable 失敗の利用者向け文言。
///
/// raw `message` / `toString()` は使わず D-1 [mapCallableError] に委譲する。
String formatTableDeviceFunctionsError(Object error) {
  return mapCallableError(error).message;
}

class TableDeviceTournamentCandidate {
  const TableDeviceTournamentCandidate({
    required this.tournamentId,
    required this.tournamentName,
    required this.status,
    required this.startAt,
  });

  final String tournamentId;
  final String tournamentName;
  final String status;
  final Timestamp startAt;
}

class TableDeviceService {
  TableDeviceService({
    FirebaseFirestore? firestore,
    DeviceService? deviceService,
    FirebaseFunctions? functions,
  }) : _firestore = firestore ?? FirebaseFirestore.instance,
       _deviceService = deviceService ?? DeviceService(),
       _functions = functions ?? FunctionsClient.instance;

  final FirebaseFirestore _firestore;
  final DeviceService _deviceService;
  final FirebaseFunctions _functions;

  Future<Device?> getCurrentDevice() => _deviceService.getCurrentDevice();

  Future<String?> getCurrentTableId() async {
    final device = await _deviceService.getCurrentDevice();
    return device?.getTableIdForOption(DeviceOptionKeys.tableDeviceTable);
  }

  Future<List<TableDeviceTournamentCandidate>> getRegisterableTournaments(
    String tableId,
  ) async {
    final currentBusinessDateKey = await _resolveCurrentBusinessDateKey();
    final query = await _firestore
        .collection('scheduledTournaments')
        .where('businessDate', isEqualTo: currentBusinessDateKey)
        .orderBy('startAt')
        .get();

    final candidates = <TableDeviceTournamentCandidate>[];
    for (final doc in query.docs) {
      final data = doc.data();
      final status = data['status'] as String?;
      final startAt = data['startAt'] as Timestamp?;
      if (status == null ||
          !const ['scheduled', 'running', 'registered', 'paused'].contains(status) ||
          startAt == null) {
        continue;
      }

      final tableSeatDoc = await _firestore
          .collection('scheduledTournaments')
          .doc(doc.id)
          .collection('tablesSeat')
          .doc(tableId)
          .get();
      if (tableSeatDoc.exists && tableSeatDoc.data()?['isEnabled'] != false) {
        continue;
      }

      final snapshot = data['snapshot'] as Map<String, dynamic>? ?? {};
      candidates.add(
        TableDeviceTournamentCandidate(
          tournamentId: doc.id,
          tournamentName: snapshot['name'] as String? ?? doc.id,
          status: status,
          startAt: startAt,
        ),
      );
    }

    return candidates;
  }

  Future<void> registerTableToTournament({
    required String tableId,
    required String tournamentId,
  }) async {
    final callable = _functions.httpsCallable('registerTableToTournament');
    await callable.call({
      'tableId': tableId,
      'tournamentId': tournamentId,
    });
  }

  Future<void> unregisterTableFromTournament({
    required String tableId,
    required String tournamentId,
    bool force = false,
    String? passcode,
  }) async {
    final callable = _functions.httpsCallable('unregisterTableFromTournament');
    await callable.call({
      'tableId': tableId,
      'tournamentId': tournamentId,
      'force': force,
      if (passcode != null) 'passcode': passcode,
    });
  }

  Future<void> registerTableToSideGame({
    required String tableId,
    required String gameName,
    bool allowOverride = false,
  }) async {
    final callable = _functions.httpsCallable('registerTableToSideGame');
    await callable.call({
      'tableId': tableId,
      'gameName': gameName,
      'allowOverride': allowOverride,
    });
  }

  Future<void> unregisterTableFromSideGame({
    required String tableId,
    bool force = false,
    String? passcode,
  }) async {
    final callable = _functions.httpsCallable('unregisterTableFromSideGame');
    await callable.call({
      'tableId': tableId,
      'force': force,
      if (passcode != null) 'passcode': passcode,
    });
  }

  Future<int> getTournamentOccupiedSeatCount({
    required String tournamentId,
    required String tableId,
  }) async {
    final tableSeatDoc = await _firestore
        .collection('scheduledTournaments')
        .doc(tournamentId)
        .collection('tablesSeat')
        .doc(tableId)
        .get();
    if (!tableSeatDoc.exists || tableSeatDoc.data()?['isEnabled'] == false) {
      return 0;
    }
    final seats = tableSeatDoc.data()?['seats'] as Map<String, dynamic>? ?? {};
    return _countOccupiedSeatIds(seats);
  }

  Future<int> getSideGameOccupiedSeatCount(String tableId) async {
    final sideGameDoc = await _firestore.collection('sideGame').doc(tableId).get();
    if (!sideGameDoc.exists || sideGameDoc.data()?['active'] != true) {
      return 0;
    }
    final seats = sideGameDoc.data()?['seats'] as Map<String, dynamic>? ?? {};
    return _countOccupiedSeatIds(seats);
  }

  String getForceClearPasscode() {
    return StoreConfigService.instance.latestData?.tableDeviceForceClearPasscode ??
        kDefaultTableDeviceForceClearPasscode;
  }

  /// Callable 失敗の利用者向け文言（D-1）。raw message / toString は出さない。
  String formatFunctionsError(Object error) {
    return formatTableDeviceFunctionsError(error);
  }

  Stream<TableDeviceHomeState> watchHomeState(String? tableId) {
    if (tableId == null) {
      return Stream<TableDeviceHomeState>.value(TableDeviceHomeState.unbound);
    }

    return _firestore
        .collection('tables')
        .doc(tableId)
        .snapshots()
        .asyncMap((snapshot) => _resolveHomeState(tableId, snapshot));
  }

  Future<TableDeviceHomeState> _resolveHomeState(
    String tableId,
    DocumentSnapshot<Map<String, dynamic>> tableSnapshot,
  ) async {
    final storeConfig = StoreConfigService.instance.latestData;
    final registrationEnabled =
        storeConfig?.tableDeviceRegistrationEnabled ??
        kDefaultTableDeviceRegistrationEnabled;
    final sideGameTypes = storeConfig?.sideGameTypes ?? kDefaultSideGameTypes;

    if (!tableSnapshot.exists) {
      return TableDeviceHomeState(
        kind: TableDeviceHomeKind.inconsistent,
        tableId: tableId,
        tableName: tableId,
        registrationEnabled: registrationEnabled,
        message: '卓情報を確認できませんでした。画面を更新して再度お試しください。',
      );
    }

    final data = tableSnapshot.data() ?? <String, dynamic>{};
    final tableStatus = data['status'] as String?;
    final tableName = data['name'] as String?;
    final tournamentDetail =
        data['tournamentDetail'] is Map<String, dynamic>
            ? data['tournamentDetail'] as Map<String, dynamic>
            : data['tournamentDetail'] is Map
            ? Map<String, dynamic>.from(data['tournamentDetail'] as Map)
            : null;

    String? tournamentStatus;
    String? tournamentBusinessDate;
    bool? sideGameActive;

    if (tableStatus == 'tournament' && tournamentDetail != null) {
      final tournamentId = tournamentDetail['tournamentId'] as String?;
      if (tournamentId != null && tournamentId.isNotEmpty) {
        final tournamentDoc = await _firestore
            .collection('scheduledTournaments')
            .doc(tournamentId)
            .get();
        if (tournamentDoc.exists) {
          final tournamentData = tournamentDoc.data() ?? <String, dynamic>{};
          tournamentStatus = tournamentData['status'] as String?;
          tournamentBusinessDate =
              tournamentData['businessDate'] as String?;
        }
      }
    } else if (tableStatus != null && sideGameTypes.contains(tableStatus)) {
      final sideGameDoc = await _firestore.collection('sideGame').doc(tableId).get();
      if (sideGameDoc.exists) {
        sideGameActive = sideGameDoc.data()?['active'] == true;
      } else {
        sideGameActive = false;
      }
    }

    return TableDeviceHomeStateResolver.resolve(
      tableId: tableId,
      tableName: tableName,
      tableStatus: tableStatus,
      tournamentDetail: tournamentDetail,
      sideGameTypes: sideGameTypes,
      registrationEnabled: registrationEnabled,
      currentBusinessDateKey: await _resolveCurrentBusinessDateKey(),
      tournamentStatus: tournamentStatus,
      tournamentBusinessDate: tournamentBusinessDate,
      sideGameActive: sideGameActive,
    );
  }

  Future<String> _resolveCurrentBusinessDateKey() async {
    final meta = StoreMetaService.instance.latestData;
    if (meta != null &&
        meta.isRunning &&
        meta.currentBusinessDateKey != null &&
        meta.currentBusinessDateKey!.isNotEmpty) {
      return meta.currentBusinessDateKey!;
    }

    final doc = await _firestore.collection('storeMeta').doc('currentBusinessDay').get();
    final data = doc.data();
    final status = data?['status'] as String?;
    final currentBusinessDateKey = data?['currentBusinessDateKey'] as String?;
    if (status == 'running' &&
        currentBusinessDateKey != null &&
        currentBusinessDateKey.isNotEmpty) {
      return currentBusinessDateKey;
    }

    return DateFormat('yyyy-MM-dd').format(DateTime.now());
  }

  int _countOccupiedSeatIds(Map<String, dynamic> seats) {
    return seats.entries.where((entry) {
      if (!entry.key.endsWith('UserId') && !entry.key.endsWith('OkibakeEntryId')) {
        return false;
      }
      final value = entry.value;
      if (value is! String) {
        return false;
      }
      final normalized = value.trim();
      return normalized.isNotEmpty &&
          normalized != 'null' &&
          normalized != 'undefined';
    }).length;
  }
}
