import 'package:cloud_firestore/cloud_firestore.dart';

/// 会計前修正ダイアログ向けの明細スナップショット。
class BillLineItemsForEdit {
  const BillLineItemsForEdit({
    required this.extraCosts,
    required this.tournaments,
    required this.items,
    required this.sideGameChips,
  });

  final List<Map<String, dynamic>> extraCosts;
  final Map<String, Map<String, dynamic>> tournaments;
  final List<Map<String, dynamic>> items;
  final List<Map<String, dynamic>> sideGameChips;
}

List<Map<String, dynamic>> mapExtrasDocsToExtraCosts(
  Iterable<Map<String, dynamic>> extrasDocs,
) {
  return extrasDocs
      .map(
        (extra) => {
          'name': extra['name'] ?? '',
          'price': (extra['amountIncl'] as num?)?.toInt() ?? 0,
        },
      )
      .toList();
}

List<Map<String, dynamic>> mapItemDocsToEditItems(
  Iterable<Map<String, dynamic>> itemDocs,
) {
  return itemDocs
      .where((item) => (item['voided'] as bool?) != true)
      .map(
        (item) => {
          'name': item['name'] ?? '',
          'price': (item['unitPriceIncl'] as num?)?.toInt() ?? 0,
          'quantity': (item['quantity'] as num?)?.toInt() ?? 1,
        },
      )
      .toList();
}

Map<String, Map<String, dynamic>> mapTournamentDocsToEditTournaments(
  Iterable<MapEntry<String, Map<String, dynamic>>> tournamentDocs,
) {
  final tournaments = <String, Map<String, dynamic>>{};

  for (final entry in tournamentDocs) {
    final data = entry.value;
    final entryFeeIncl = (data['entryFeeIncl'] as num?)?.toInt() ?? 0;
    final entryCount = (data['entryCount'] as num?)?.toInt() ?? 0;
    final reentryFeeIncl = (data['reentryFeeIncl'] as num?)?.toInt() ?? 0;
    final reentryCount = (data['reentryCount'] as num?)?.toInt() ?? 0;
    final addonFeeIncl = (data['addonFeeIncl'] as num?)?.toInt() ?? 0;
    final addonCount = (data['addonCount'] as num?)?.toInt() ?? 0;
    final totalFee =
        entryFeeIncl * entryCount +
        reentryFeeIncl * reentryCount +
        addonFeeIncl * addonCount;

    tournaments[entry.key] = {
      'entryFee': totalFee,
      'tournamentName': data['templateName'] ?? '',
    };
  }

  return tournaments;
}

List<Map<String, dynamic>> mapSideGameChipDocsToEditChips(
  Iterable<Map<String, dynamic>> chipDocs,
) {
  return chipDocs
      .where((chip) => chip['action'] == 'purchase')
      .map(
        (chip) => {
          'name': chip['name'] ?? '',
          'price': (chip['amountIncl'] as num?)?.toInt() ?? 0,
        },
      )
      .toList();
}

BillLineItemsForEdit buildBillLineItemsForEdit({
  required Iterable<Map<String, dynamic>> extrasDocs,
  required Iterable<MapEntry<String, Map<String, dynamic>>> tournamentDocs,
  required Iterable<Map<String, dynamic>> itemDocs,
  required Iterable<Map<String, dynamic>> sideGameChipDocs,
}) {
  return BillLineItemsForEdit(
    extraCosts: mapExtrasDocsToExtraCosts(extrasDocs),
    tournaments: mapTournamentDocsToEditTournaments(tournamentDocs),
    items: mapItemDocsToEditItems(itemDocs),
    sideGameChips: mapSideGameChipDocsToEditChips(sideGameChipDocs),
  );
}

Future<BillLineItemsForEdit> loadBillLineItemsForEdit(
  FirebaseFirestore firestore,
  String billId,
) async {
  final billRef = firestore.collection('bills').doc(billId);

  final results = await Future.wait([
    billRef.collection('extras').get(),
    billRef.collection('tournaments').get(),
    billRef.collection('items').get(),
    billRef.collection('sideGameChips').get(),
  ]);

  final extrasSnapshot = results[0];
  final tournamentsSnapshot = results[1];
  final itemsSnapshot = results[2];
  final sideGameChipsSnapshot = results[3];

  return buildBillLineItemsForEdit(
    extrasDocs: extrasSnapshot.docs.map((doc) => doc.data()),
    tournamentDocs: tournamentsSnapshot.docs.map(
      (doc) => MapEntry(doc.id, doc.data()),
    ),
    itemDocs: itemsSnapshot.docs.map((doc) => doc.data()),
    sideGameChipDocs: sideGameChipsSnapshot.docs.map((doc) => doc.data()),
  );
}
