import 'package:amuse_app_template/tournament/active/utils/blind_timer_display_helpers.dart';
import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  group('Reentry display', () {
    test('isReentry=false → Reentry: 不可', () {
      expect(
        formatBlindReentryCondition({'isReentry': false}),
        'Reentry: 不可',
      );
    });

    test('isReentry=true + maxReentries=2 + feeあり', () {
      expect(
        formatBlindReentryCondition({
          'isReentry': true,
          'maxReentries': 2,
          'reentryFee': 1000,
        }),
        'Reentry: 上限2回 / ¥1,000',
      );
    });

    test('isReentry=true + maxReentries=null + feeあり', () {
      expect(
        formatBlindReentryCondition({
          'isReentry': true,
          'maxReentries': null,
          'reentryFee': 2000,
        }),
        'Reentry: 無制限 / ¥2,000',
      );
    });

    test('maxReentries=0 → Reentry: 不可', () {
      expect(
        formatBlindReentryCondition({
          'isReentry': true,
          'maxReentries': 0,
          'reentryFee': 1000,
        }),
        'Reentry: 不可',
      );
    });

    test('fee欠損時は費用部分を省略', () {
      expect(
        formatBlindReentryCondition({
          'isReentry': true,
          'maxReentries': 2,
        }),
        'Reentry: 上限2回',
      );
    });

    test('maxReentriesPerPlayer は参照しない', () {
      expect(
        formatBlindReentryCondition({
          'isReentry': true,
          'maxReentries': 2,
          'maxReentriesPerPlayer': 99,
          'reentryFee': 500,
        }),
        'Reentry: 上限2回 / ¥500',
      );
    });

    test('可能な場合に「可 / 」が付かない', () {
      final formatted = formatBlindReentryCondition({
        'isReentry': true,
        'maxReentries': 2,
        'reentryFee': 1000,
      });

      expect(formatted, isNot(contains('可 / ')));
      expect(formatted, 'Reentry: 上限2回 / ¥1,000');
    });
  });

  group('Addon display', () {
    test('isAddon=false → Addon: 不可', () {
      expect(
        formatBlindAddonCondition({'isAddon': false}),
        'Addon: 不可',
      );
    });

    test('isAddon=true + limit/fee/stackあり', () {
      expect(
        formatBlindAddonCondition({
          'isAddon': true,
          'addonLimitPerPlayer': 1,
          'addonFee': 2000,
          'addonStack': 10000,
        }),
        'Addon: 上限1回 / ¥2,000 / +10,000',
      );
    });

    test('limit欠損時は上限部分を省略', () {
      expect(
        formatBlindAddonCondition({
          'isAddon': true,
          'addonFee': 2000,
          'addonStack': 10000,
        }),
        'Addon: ¥2,000 / +10,000',
      );
    });

    test('fee欠損時は費用部分を省略', () {
      expect(
        formatBlindAddonCondition({
          'isAddon': true,
          'addonLimitPerPlayer': 1,
          'addonStack': 10000,
        }),
        'Addon: 上限1回 / +10,000',
      );
    });

    test('stack欠損時はスタック部分を省略', () {
      expect(
        formatBlindAddonCondition({
          'isAddon': true,
          'addonLimitPerPlayer': 1,
          'addonFee': 2000,
        }),
        'Addon: 上限1回 / ¥2,000',
      );
    });

    test('isAddon=true で詳細欠損時も Addon: 可', () {
      expect(
        formatBlindAddonCondition({'isAddon': true}),
        'Addon: 可',
      );
    });

    test('条件情報がある場合に「可 / 」が付かない', () {
      final formatted = formatBlindAddonCondition({
        'isAddon': true,
        'addonLimitPerPlayer': 1,
        'addonFee': 2000,
        'addonStack': 10000,
      });

      expect(formatted, isNot(contains('可 / ')));
      expect(formatted, 'Addon: 上限1回 / ¥2,000 / +10,000');
    });
  });

  group('Prize display', () {
    test('prizePool を含めて表示データを返す', () {
      final display = parseBlindPrizeDisplay({
        'prizeReceiverCount': 3,
        'prizePool': 100000,
        '1stPrize': 50000,
        '2stPrize': 30000,
        '3stPrize': 20000,
      });

      expect(display, isNotNull);
      expect(display!.prizeReceiverCount, 3);
      expect(display.prizePool, 100000);
      expect(display.ranks, hasLength(3));
      expect(display.ranks.first.amount, 50000);
    });

    test('確定済みデータあり → 表示データを返す', () {
      final display = parseBlindPrizeDisplay({
        'prizeReceiverCount': 3,
        '1stPrize': 50000,
        '2stPrize': 30000,
        '3stPrize': 20000,
      });

      expect(display, isNotNull);
      expect(display!.prizeReceiverCount, 3);
      expect(display.ranks, hasLength(3));
      expect(display.ranks.first.amount, 50000);
    });

    test('prizeReceiverCount 欠損 → 非表示', () {
      expect(parseBlindPrizeDisplay({'1stPrize': 50000}), isNull);
    });

    test('prizeReceiverCount=0 → 非表示', () {
      expect(
        parseBlindPrizeDisplay({
          'prizeReceiverCount': 0,
          '1stPrize': 50000,
        }),
        isNull,
      );
    });

    test('prize値欠損 → 存在する範囲のみ', () {
      final display = parseBlindPrizeDisplay({
        'prizeReceiverCount': 3,
        '1stPrize': 50000,
      });

      expect(display, isNotNull);
      expect(display!.ranks, hasLength(1));
      expect(display.ranks.single.rank, 1);
    });

    test('全 prize 欠損 → 非表示', () {
      expect(
        parseBlindPrizeDisplay({'prizeReceiverCount': 2}),
        isNull,
      );
    });

    test('入賞人数表示を返す', () {
      expect(formatBlindPrizeReceiverCount(3), '入賞：3人');
    });

    test('プライズプール表示を返す', () {
      expect(formatBlindPrizePoolLine(50000), 'プライズプール: 50,000');
      expect(formatBlindPrizePoolLine(null), 'プライズプール: -');
    });

    test('Prize 欄の金額は ¥ なし', () {
      expect(formatBlindPrizeAmount(4200), '4,200');
    });

    test('同額の連続順位をまとめる', () {
      final groups = groupBlindPrizeRanksForDisplay([
        const BlindPrizeRank(rank: 5, amount: 1000),
        const BlindPrizeRank(rank: 6, amount: 800),
        const BlindPrizeRank(rank: 7, amount: 800),
        const BlindPrizeRank(rank: 8, amount: 500),
      ]);

      expect(groups, hasLength(3));
      expect(groups[1].startRank, 6);
      expect(groups[1].endRank, 7);
      expect(groups[1].amount, 800);
      expect(formatBlindPrizeRankLabel(6, 7), '6-7st');
      expect(formatBlindPrizeRankLabel(5, 5), '5st');
    });

    test('同額でも順位が連続しない場合はまとめない', () {
      final groups = groupBlindPrizeRanksForDisplay([
        const BlindPrizeRank(rank: 1, amount: 800),
        const BlindPrizeRank(rank: 3, amount: 800),
      ]);

      expect(groups, hasLength(2));
      expect(groups[0].endRank, 1);
      expect(groups[1].startRank, 3);
    });

    test('金額リストは12行以下なら1ページ', () {
      final groups = List<BlindPrizeRankGroup>.generate(
        12,
        (index) => BlindPrizeRankGroup(
          startRank: index + 1,
          endRank: index + 1,
          amount: 1000,
        ),
      );

      expect(blindPrizeRankListPageCount(groups.length), 1);
      expect(
        visibleBlindPrizeRankGroupsForPage(groups, 0),
        hasLength(12),
      );
    });

    test('金額リストは13行以上でページ分割する', () {
      final groups = List<BlindPrizeRankGroup>.generate(
        25,
        (index) => BlindPrizeRankGroup(
          startRank: index + 1,
          endRank: index + 1,
          amount: 1000,
        ),
      );

      expect(blindPrizeRankListPageCount(groups.length), 3);
      expect(
        visibleBlindPrizeRankGroupsForPage(groups, 0).first.startRank,
        1,
      );
      expect(
        visibleBlindPrizeRankGroupsForPage(groups, 0).last.startRank,
        12,
      );
      expect(
        visibleBlindPrizeRankGroupsForPage(groups, 1).first.startRank,
        13,
      );
      expect(
        visibleBlindPrizeRankGroupsForPage(groups, 1).last.startRank,
        24,
      );
      expect(
        visibleBlindPrizeRankGroupsForPage(groups, 2),
        hasLength(1),
      );
      expect(
        visibleBlindPrizeRankGroupsForPage(groups, 2).first.startRank,
        25,
      );
      expect(
        visibleBlindPrizeRankGroupsForPage(groups, 3).first.startRank,
        1,
      );
    });

    test('金額リスト行の同一判定', () {
      final groups = [
        const BlindPrizeRankGroup(startRank: 1, endRank: 1, amount: 1000),
        const BlindPrizeRankGroup(startRank: 2, endRank: 2, amount: 800),
      ];
      final sameGroups = [
        const BlindPrizeRankGroup(startRank: 1, endRank: 1, amount: 1000),
        const BlindPrizeRankGroup(startRank: 2, endRank: 2, amount: 800),
      ];
      final differentGroups = [
        const BlindPrizeRankGroup(startRank: 1, endRank: 1, amount: 1000),
        const BlindPrizeRankGroup(startRank: 2, endRank: 2, amount: 700),
      ];

      expect(blindPrizeRankGroupsEqual(groups, sameGroups), isTrue);
      expect(blindPrizeRankGroupsEqual(groups, differentGroups), isFalse);
    });
  });

  group('Registration display', () {
    const registrationOffsetSec = 660;
    final startAt = DateTime(2026, 5, 27, 5, 56);
    final regEndAt = startAt.add(const Duration(seconds: registrationOffsetSec));
    final startedAt = startAt.add(const Duration(seconds: 2));

    String format({
      int? registrationOffsetSecValue,
      int? tournamentElapsedSec,
      String? status,
      DateTime? registAt,
    }) {
      return formatBlindRegistrationStatus(
        registrationOffsetSec: registrationOffsetSecValue,
        tournamentElapsedSec: tournamentElapsedSec,
        status: status,
        registAt: registAt,
      );
    }

    test('startAt/regEndAt から registrationOffsetSec が 660 秒になる', () {
      expect(
        calculateBlindRegistrationOffsetSec(
          startAt: startAt,
          regEndAt: regEndAt,
        ),
        registrationOffsetSec,
      );
    });

    test('startedAt が2秒遅れても registrationOffsetSec は 660 秒のまま', () {
      expect(
        calculateBlindRegistrationOffsetSec(
          startAt: startAt,
          regEndAt: regEndAt,
        ),
        registrationOffsetSec,
      );
      expect(startedAt.difference(startAt).inSeconds, 2);
    });

    test('tournamentElapsedSec=60 のとき レジスト残りは 10:00', () {
      expect(
        format(
          registrationOffsetSecValue: registrationOffsetSec,
          tournamentElapsedSec: 60,
        ),
        '10:00',
      );
    });

    test('tournamentElapsedSec=360 のとき レジスト残りは 05:00', () {
      expect(
        format(
          registrationOffsetSecValue: registrationOffsetSec,
          tournamentElapsedSec: 360,
        ),
        '05:00',
      );
    });

    test('tournamentElapsedSec=659 のとき レジスト残りは 00:01', () {
      expect(
        format(
          registrationOffsetSecValue: registrationOffsetSec,
          tournamentElapsedSec: 659,
        ),
        '00:01',
      );
    });

    test('tournamentElapsedSec=660 のとき レジスト済み', () {
      expect(
        format(
          registrationOffsetSecValue: registrationOffsetSec,
          tournamentElapsedSec: 660,
        ),
        kBlindRegistrationClosedLabel,
      );
    });

    test('tournamentElapsedSec > 660 のとき レジスト済み', () {
      expect(
        format(
          registrationOffsetSecValue: registrationOffsetSec,
          tournamentElapsedSec: 700,
        ),
        kBlindRegistrationClosedLabel,
      );
    });

    test('status == registered → レジスト済み', () {
      expect(
        format(
          registrationOffsetSecValue: registrationOffsetSec,
          tournamentElapsedSec: 60,
          status: 'registered',
        ),
        kBlindRegistrationClosedLabel,
      );
    });

    test('registAt != null → レジスト済み', () {
      expect(
        format(
          registrationOffsetSecValue: registrationOffsetSec,
          tournamentElapsedSec: 60,
          registAt: startedAt.add(const Duration(minutes: 5)),
        ),
        kBlindRegistrationClosedLabel,
      );
    });

    test('startAt 欠損時は -', () {
      expect(
        calculateBlindRegistrationOffsetSec(
          startAt: null,
          regEndAt: regEndAt,
        ),
        isNull,
      );
      expect(
        format(
          registrationOffsetSecValue: null,
          tournamentElapsedSec: 60,
        ),
        '-',
      );
    });

    test('regEndAt 欠損時は -', () {
      expect(
        calculateBlindRegistrationOffsetSec(
          startAt: startAt,
          regEndAt: null,
        ),
        isNull,
      );
      expect(
        format(
          registrationOffsetSecValue: null,
          tournamentElapsedSec: 60,
        ),
        '-',
      );
    });

    test('tournamentElapsedSec が算出できない場合は -', () {
      expect(
        format(
          registrationOffsetSecValue: registrationOffsetSec,
          tournamentElapsedSec: null,
        ),
        '-',
      );
    });

    test('pause中は pausedAt 相当の elapsedSec で表示が止まる', () {
      final pausedAt = startedAt.add(const Duration(seconds: 360));
      final runningNow = startedAt.add(const Duration(seconds: 500));

      final pausedElapsed = calculateTournamentElapsedSec(
        startedAt: startedAt,
        evaluationTime: resolveBlindTournamentEvaluationTime(
          status: 'paused',
          pausedAt: pausedAt,
          now: runningNow,
        ),
        shiftSec: 0,
      );
      final runningElapsed = calculateTournamentElapsedSec(
        startedAt: startedAt,
        evaluationTime: resolveBlindTournamentEvaluationTime(
          status: 'running',
          pausedAt: pausedAt,
          now: runningNow,
        ),
        shiftSec: 0,
      );

      expect(pausedElapsed, 360);
      expect(runningElapsed, 500);
      expect(
        format(
          registrationOffsetSecValue: registrationOffsetSec,
          tournamentElapsedSec: pausedElapsed,
        ),
        '05:00',
      );
      expect(
        format(
          registrationOffsetSecValue: registrationOffsetSec,
          tournamentElapsedSec: runningElapsed,
        ),
        '02:40',
      );
    });

    test('regEndAt - now の壁時計差分に依存しない', () {
      final wallNow = regEndAt.subtract(const Duration(minutes: 10));
      final wallClockRemaining =
          regEndAt.difference(wallNow).inSeconds;

      expect(wallClockRemaining, 600);
      expect(
        format(
          registrationOffsetSecValue: registrationOffsetSec,
          tournamentElapsedSec: 60,
        ),
        '10:00',
      );
    });

    test('Next Break 5:00 と Regist 10:00 で差分が休憩5分として揃う', () {
      const breakRemainingSec = 300;
      const elapsedSec = 360;

      expect(
        format(
          registrationOffsetSecValue: registrationOffsetSec,
          tournamentElapsedSec: elapsedSec,
        ),
        '05:00',
      );
      expect(
        registrationOffsetSec - elapsedSec - breakRemainingSec,
        0,
      );
    });

    test('残り時間が 5分 → 05:00', () {
      expect(
        formatBlindRegistrationRemainingSec(300),
        '05:00',
      );
    });

    test('残り時間が 4分59秒 → 04:59', () {
      expect(
        formatBlindRegistrationRemainingSec(299),
        '04:59',
      );
    });

    test('parseBlindRegEndAt は Timestamp を変換する', () {
      expect(
        parseBlindRegEndAt(Timestamp.fromDate(regEndAt)),
        regEndAt,
      );
    });

    test('calculateTournamentElapsedSec は shiftSec を差し引く', () {
      final evaluationTime = startedAt.add(const Duration(seconds: 100));

      expect(
        calculateTournamentElapsedSec(
          startedAt: startedAt,
          evaluationTime: evaluationTime,
          shiftSec: 10,
        ),
        90,
      );
    });
  });
}
