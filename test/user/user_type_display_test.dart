import 'package:amuse_app_template/user/user_type_display.dart';
import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  group('userTypeLabel', () {
    test('line → LINE', () {
      expect(userTypeLabel('line'), 'LINE');
    });

    test('store_managed → 店舗管理', () {
      expect(userTypeLabel('store_managed'), '店舗管理');
    });

    test('未設定・不正 → 種別未設定', () {
      expect(userTypeLabel(null), '種別未設定');
      expect(userTypeLabel(''), '種別未設定');
      expect(userTypeLabel('unknown'), '種別未設定');
      expect(userTypeLabel(1), '種別未設定');
    });
  });

  group('isMigratedStoreManagedUser', () {
    test('店舗管理かつ true のみ除外対象', () {
      expect(
        isMigratedStoreManagedUser({
          'userType': 'store_managed',
          'isMigrated': true,
        }),
        isTrue,
      );
      expect(
        isMigratedStoreManagedUser({
          'userType': 'store_managed',
          'isMigrated': false,
        }),
        isFalse,
      );
      expect(
        isMigratedStoreManagedUser({'userType': 'line', 'isMigrated': true}),
        isFalse,
      );
      expect(isMigratedStoreManagedUser({}), isFalse);
    });
  });

  group('resolveLoginId / display helpers', () {
    test('loginId / loginID を取得', () {
      expect(resolveLoginId({'loginId': 'abc'}), 'abc');
      expect(resolveLoginId({'loginID': 'XYZ'}), 'XYZ');
      expect(resolveLoginId({'loginId': '  a  '}), 'a');
      expect(resolveLoginId({}), '');
    });

    test('残高・日時の欠落は未設定', () {
      expect(formatUserBalance(null), '未設定');
      expect(formatUserBalance(1200), '1,200');
      expect(formatUserTimestamp(null), '未設定');
      final ts = Timestamp.fromDate(DateTime(2026, 7, 15, 10, 5));
      expect(formatUserTimestamp(ts), contains('2026-07-15'));
    });

    test('displayOrUnset', () {
      expect(displayOrUnset(null), '未設定');
      expect(displayOrUnset(''), '未設定');
      expect(displayOrUnset(' bob '), 'bob');
    });
  });

  group('admin user list visibility + stay status', () {
    final rows = [
      {
        'id': 'u1',
        'pokerName': 'Alice',
        'userType': 'line',
        'loginId': 'alice01',
      },
      {
        'id': 'u2',
        'pokerName': 'Bob',
        'userType': 'store_managed',
        'isMigrated': false,
        'loginID': 'bob02',
      },
      {
        'id': 'u3',
        'pokerName': 'Carol',
        'userType': 'store_managed',
        'isMigrated': true,
        'loginId': 'carol03',
      },
      {
        'id': 'u4',
        'pokerName': 'NoType',
        'loginId': 'notype',
      },
    ];

    test('showMigratedStoreManaged で移行済みを含められる', () {
      final filtered = filterAdminUserListRows(
        rows: rows,
        searchQuery: '',
        showMigratedStoreManaged: true,
      );
      expect(filtered.map((e) => e['pokerName']), [
        'Alice',
        'Bob',
        'Carol',
        'NoType',
      ]);
    });

    test('initialBalanceSetAt 表示トグル（未設定 / 設定済み）', () {
      final balanceRows = [
        {
          'id': 'u1',
          'pokerName': 'Unset',
          'userType': 'line',
        },
        {
          'id': 'u2',
          'pokerName': 'Set',
          'userType': 'line',
          'initialBalanceSetAt': Timestamp.fromDate(DateTime(2026, 7, 1)),
        },
      ];
      expect(hasInitialUserBalanceSet(balanceRows[0]), isFalse);
      expect(hasInitialUserBalanceSet(balanceRows[1]), isTrue);
      expect(
        matchesInitialBalanceSetDisplayFilter(
          balanceRows[0],
          showOnlySetUsers: false,
        ),
        isTrue,
      );
      expect(
        matchesInitialBalanceSetDisplayFilter(
          balanceRows[1],
          showOnlySetUsers: false,
        ),
        isFalse,
      );
      expect(
        matchesInitialBalanceSetDisplayFilter(
          balanceRows[0],
          showOnlySetUsers: true,
        ),
        isFalse,
      );
      expect(
        matchesInitialBalanceSetDisplayFilter(
          balanceRows[1],
          showOnlySetUsers: true,
        ),
        isTrue,
      );

      final unsetOnly = balanceRows
          .where(
            (r) => matchesInitialBalanceSetDisplayFilter(
              r,
              showOnlySetUsers: false,
            ),
          )
          .toList();
      expect(
        filterAdminUserListRows(
          rows: unsetOnly,
          searchQuery: '',
        ).map((e) => e['pokerName']),
        ['Unset'],
      );
    });

    test('初期ポイント候補は移行済み店舗管理を除外する', () {
      final candidateRows = [
        {
          'id': 'u1',
          'pokerName': 'ActiveStore',
          'userType': 'store_managed',
          'isMigrated': false,
        },
        {
          'id': 'u2',
          'pokerName': 'MigratedStore',
          'userType': 'store_managed',
          'isMigrated': true,
          'migratedToUserId': 'line1',
        },
        {
          'id': 'u3',
          'pokerName': 'LineUser',
          'userType': 'line',
        },
      ];
      final unsetOnly = candidateRows
          .where(
            (r) => matchesInitialBalanceSetDisplayFilter(
              r,
              showOnlySetUsers: false,
            ),
          )
          .toList();
      expect(
        filterAdminUserListRows(rows: unsetOnly, searchQuery: '')
            .map((e) => e['pokerName']),
        ['ActiveStore', 'LineUser'],
      );
    });

    test('検索しても移行済みは出ない', () {
      final filtered = filterAdminUserListRows(
        rows: rows,
        searchQuery: 'carol',
      );
      expect(filtered, isEmpty);
      final byLogin = filterAdminUserListRows(
        rows: rows,
        searchQuery: 'carol03',
      );
      expect(byLogin, isEmpty);
    });

    test('pokerName のみ検索（loginId は対象外）', () {
      expect(
        filterAdminUserListRows(rows: rows, searchQuery: 'Ali')
            .single['pokerName'],
        'Alice',
      );
      expect(
        filterAdminUserListRows(rows: rows, searchQuery: 'bob02'),
        isEmpty,
      );
    });

    test('検索順位: 完全一致 → 前方一致 → 部分一致（各グループ内は通常順）', () {
      final searchRows = [
        {'id': 'a', 'pokerName': 'まんじゅうや', 'userType': 'line'},
        {'id': 'b', 'pokerName': 'や', 'userType': 'line'},
        {'id': 'c', 'pokerName': 'やはた', 'userType': 'line'},
        {'id': 'd', 'pokerName': 'やはたゆうき', 'userType': 'line'},
      ];
      expect(
        filterAdminUserListRows(rows: searchRows, searchQuery: 'や')
            .map((e) => e['pokerName'])
            .toList(),
        ['や', 'やはた', 'やはたゆうき', 'まんじゅうや'],
      );
    });

    test('完全一致', () {
      expect(
        pokerNameSearchMatch('や', 'や'),
        AdminUserPokerNameSearchMatch.exact,
      );
      expect(
        pokerNameSearchMatch('やはた', 'や'),
        AdminUserPokerNameSearchMatch.prefix,
      );
    });

    test('漢字は読み仮名なし・文字列一致のみ', () {
      expect(
        pokerNameSearchMatch('八木', 'や'),
        AdminUserPokerNameSearchMatch.none,
      );
      expect(
        pokerNameSearchMatch('八木', '八'),
        AdminUserPokerNameSearchMatch.prefix,
      );
      final kanjiRows = [
        {'id': 'k1', 'pokerName': '八木', 'userType': 'line'},
        {'id': 'k2', 'pokerName': '八木太郎', 'userType': 'line'},
      ];
      expect(
        filterAdminUserListRows(rows: kanjiRows, searchQuery: '八')
            .map((e) => e['pokerName'])
            .toList(),
        ['八木', '八木太郎'],
      );
    });

    test('通常表示順は検索なし時に pokerName 昇順', () {
      final orderRows = [
        {'id': 'z', 'pokerName': 'zzz', 'userType': 'line'},
        {'id': 'a', 'pokerName': 'aaa', 'userType': 'line'},
        {'id': 'm', 'pokerName': 'mmm', 'userType': 'line'},
      ];
      expect(
        filterAdminUserListRows(rows: orderRows, searchQuery: '')
            .map((e) => e['pokerName'])
            .toList(),
        ['aaa', 'mmm', 'zzz'],
      );
    });

    test('userType 未設定は表示継続', () {
      expect(isVisibleOnAdminUserList(rows[3]), isTrue);
    });

    test('入店状況ラベルと activeStay 集合判定', () {
      expect(adminStayStatusLabel(true), '入店中');
      expect(adminStayStatusLabel(false), '未入店');

      final active = {'u1', 'u2'};
      expect(isUserInActiveStaySet('u1', active), isTrue);
      expect(isUserInActiveStaySet('u4', active), isFalse);

      // 表のケース相当
      expect(adminStayStatusLabel(isUserInActiveStaySet('u1', active)), '入店中');
      expect(adminStayStatusLabel(isUserInActiveStaySet('u4', {})), '未入店');
      expect(adminStayStatusLabel(isUserInActiveStaySet('u2', active)), '入店中');
      expect(adminStayStatusLabel(isUserInActiveStaySet('u2', {})), '未入店');
    });
  });

  group('migration eligibility helpers', () {
    test('移行元は store_managed かつ isMigrated == false のみ', () {
      expect(
        isEligibleMigrationSource({
          'userType': 'store_managed',
          'isMigrated': false,
        }),
        isTrue,
      );
      expect(
        isEligibleMigrationSource({
          'userType': 'store_managed',
          'isMigrated': true,
        }),
        isFalse,
      );
      expect(
        isEligibleMigrationSource({'userType': 'line', 'isMigrated': false}),
        isFalse,
      );
    });

    test('移行先は line のみ', () {
      expect(isEligibleMigrationTarget({'userType': 'line'}), isTrue);
      expect(
        isEligibleMigrationTarget({'userType': 'store_managed'}),
        isFalse,
      );
    });

    test('readUserBalanceInt', () {
      expect(readUserBalanceInt(10), 10);
      expect(readUserBalanceInt(10.6), 11);
      expect(readUserBalanceInt(null), 0);
    });
  });

  group('migration list filter behavior', () {
    /// 画面と同じ: 適格性 → filterAdminUserListRows（pokerName 一致度順）。
    List<Map<String, dynamic>> filterSources(
      List<Map<String, dynamic>> rows,
      String query,
    ) {
      final eligible = rows
          .where(isEligibleMigrationSource)
          .map((r) => Map<String, dynamic>.from(r))
          .toList();
      return filterAdminUserListRows(
        rows: eligible,
        searchQuery: query,
        showMigratedStoreManaged: true,
      );
    }

    List<Map<String, dynamic>> filterTargets(
      List<Map<String, dynamic>> rows,
      String query,
    ) {
      final eligible = rows
          .where(isEligibleMigrationTarget)
          .map((r) => Map<String, dynamic>.from(r))
          .toList();
      return filterAdminUserListRows(
        rows: eligible,
        searchQuery: query,
        showMigratedStoreManaged: true,
      );
    }

    final rows = [
      {
        'id': 's1',
        'pokerName': 'Src',
        'userType': 'store_managed',
        'isMigrated': false,
        'loginId': 'src01',
      },
      {
        'id': 's2',
        'pokerName': 'Migrated',
        'userType': 'store_managed',
        'isMigrated': true,
        'loginId': 'old01',
      },
      {
        'id': 't1',
        'pokerName': 'LineUser',
        'userType': 'line',
        'loginId': 'line01',
      },
      {
        'id': 's3',
        'pokerName': 'まんじゅうや',
        'userType': 'store_managed',
        'isMigrated': false,
      },
      {
        'id': 's4',
        'pokerName': 'や',
        'userType': 'store_managed',
        'isMigrated': false,
      },
      {
        'id': 's5',
        'pokerName': 'やはた',
        'userType': 'store_managed',
        'isMigrated': false,
      },
      {
        'id': 's6',
        'pokerName': 'やはたゆうき',
        'userType': 'store_managed',
        'isMigrated': false,
      },
      {
        'id': 't2',
        'pokerName': '八木',
        'userType': 'line',
      },
    ];

    test('移行元は未移行店舗管理のみ', () {
      expect(
        filterSources(rows, '').map((e) => e['pokerName']).toList(),
        ['Src', 'まんじゅうや', 'や', 'やはた', 'やはたゆうき'],
      );
    });

    test('移行先は LINE のみ', () {
      expect(
        filterTargets(rows, '').map((e) => e['pokerName']).toList(),
        ['LineUser', '八木'],
      );
    });

    test('loginId では一致しない', () {
      expect(filterSources(rows, 'src01'), isEmpty);
      expect(filterTargets(rows, 'line01'), isEmpty);
    });

    test('移行元検索: 完全一致 → 前方一致 → 部分一致', () {
      expect(
        filterSources(rows, 'や').map((e) => e['pokerName']).toList(),
        ['や', 'やはた', 'やはたゆうき', 'まんじゅうや'],
      );
    });

    test('移行先検索: pokerName のみ・漢字は漢字入力時のみ', () {
      expect(
        filterTargets(rows, 'Line').single['pokerName'],
        'LineUser',
      );
      expect(filterTargets(rows, 'や'), isEmpty);
      expect(filterTargets(rows, '八').single['pokerName'], '八木');
    });
  });
}
