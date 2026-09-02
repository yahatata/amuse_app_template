import 'dart:io';

import 'package:amuse_app_template/user_actions/side_game_dialog_layout.dart';
import 'package:amuse_app_template/user_actions/user_action_home.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  testWidgets('content maxHeight shrinks when keyboard inset is present',
      (tester) async {
    tester.view.physicalSize = const Size(400, 800);
    tester.view.devicePixelRatio = 1.0;
    addTearDown(tester.view.reset);

    late double withoutKeyboard;
    await tester.pumpWidget(
      MaterialApp(
        home: Builder(
          builder: (context) {
            withoutKeyboard = sideGameAlertDialogContentMaxHeight(context);
            return const SizedBox.shrink();
          },
        ),
      ),
    );

    tester.view.viewInsets = const FakeViewPadding(bottom: 300);
    late double withKeyboard;
    await tester.pumpWidget(
      MaterialApp(
        home: Builder(
          builder: (context) {
            withKeyboard = sideGameAlertDialogContentMaxHeight(context);
            return const SizedBox.shrink();
          },
        ),
      ),
    );

    expect(withKeyboard, lessThan(withoutKeyboard));
    expect(withKeyboard, greaterThanOrEqualTo(96));
  });

  testWidgets('small viewport + tall content does not overflow', (tester) async {
    tester.view.physicalSize = const Size(320, 480);
    tester.view.devicePixelRatio = 1.0;
    tester.view.viewInsets = const FakeViewPadding(bottom: 280);
    addTearDown(tester.view.reset);

    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(
          body: Builder(
            builder: (context) {
              return AlertDialog(
                title: const Text('chip引き出し'),
                content: SideGameDialogScrollableContent(
                  key: const Key('sg-b1-scroll'),
                  maxWidth: 300,
                  maxHeight: sideGameAlertDialogContentMaxHeight(context),
                  child: Column(
                    children: [
                      const TextField(
                        decoration: InputDecoration(labelText: '引き出すchip額'),
                      ),
                      ...List.generate(
                        12,
                        (i) => SizedBox(height: 48, child: Text('row $i')),
                      ),
                    ],
                  ),
                ),
                actions: const [
                  TextButton(onPressed: null, child: Text('引き出す')),
                ],
              );
            },
          ),
        ),
      ),
    );
    await tester.pump();

    expect(tester.takeException(), isNull);
    expect(find.text('引き出す'), findsOneWidget);
    expect(find.byType(TextField), findsOneWidget);
    expect(find.byKey(const Key('sg-b1-scroll')), findsOneWidget);
    expect(
      find.descendant(
        of: find.byKey(const Key('sg-b1-scroll')),
        matching: find.byType(SingleChildScrollView),
      ),
      findsOneWidget,
    );
  });

  testWidgets('deposit-shaped actions remain reachable on a short viewport',
      (tester) async {
    tester.view.physicalSize = const Size(360, 520);
    tester.view.devicePixelRatio = 1.0;
    addTearDown(tester.view.reset);

    await tester.pumpWidget(
      const MaterialApp(
        home: Scaffold(
          body: AlertDialog(
            title: Text('chip預入'),
            content: SideGameDialogScrollableContent(
              maxWidth: 300,
              maxHeight: 160,
              child: SizedBox(height: 400, child: Text('預入本文')),
            ),
            actions: [
              TextButton(onPressed: null, child: Text('キャンセル')),
              TextButton(onPressed: null, child: Text('預入のみ')),
              TextButton(onPressed: null, child: Text('預入と退席')),
            ],
          ),
        ),
      ),
    );
    await tester.pump();

    expect(tester.takeException(), isNull);
    expect(find.text('預入のみ'), findsOneWidget);
    expect(find.text('預入と退席'), findsOneWidget);
  });

  test('B2 withdraw wording and B3 leave-close wiring stay', () {
    final withdraw =
        File('lib/user_actions/side_game_chip_withdraw_popup.dart').readAsStringSync();
    final deposit =
        File('lib/user_actions/side_game_chip_deposit_popup.dart').readAsStringSync();
    final purchase =
        File('lib/user_actions/side_game_chip_purchase_popup.dart').readAsStringSync();

    expect(withdraw.contains("labelText: '引き出すchip額'"), isTrue);
    expect(withdraw.contains("child: const Text('引き出す')"), isTrue);
    expect(withdraw.contains('引き出し確定'), isFalse);
    expect(withdraw.contains("httpsCallable('withdrawChip')"), isTrue);
    expect(withdraw.contains('SideGameDialogScrollableContent'), isTrue);

    expect(deposit.contains('closeUserActionMenuOnLeaveSuccess'), isTrue);
    expect(deposit.contains('SideGameDialogScrollableContent'), isTrue);
    expect(deposit.contains("httpsCallable('depositChip')"), isTrue);

    expect(purchase.contains('height: 400'), isFalse);
    expect(purchase.contains('sideGameAlertDialogContentMaxHeight'), isTrue);
  });

  testWidgets('showUserActionHome renders on a normal viewport', (tester) async {
    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(
          body: Builder(
            builder: (context) => TextButton(
              onPressed: () => showUserActionHome(
                context: context,
                sourcePage: 'StayingUsersListPage',
                user: const {'pokerName': 'Alice', 'userId': 'u1'},
              ),
              child: const Text('open-menu'),
            ),
          ),
        ),
      ),
    );
    await tester.tap(find.text('open-menu'));
    await tester.pumpAndSettle();

    expect(tester.takeException(), isNull);
    expect(find.text('Alice'), findsOneWidget);
    expect(find.byType(KeyboardSafeDialogBody), findsOneWidget);
  });

  testWidgets('showUserActionHome does not overflow on a small viewport',
      (tester) async {
    tester.view.physicalSize = const Size(800, 480);
    tester.view.devicePixelRatio = 1.0;
    addTearDown(tester.view.reset);

    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(
          body: Builder(
            builder: (context) => TextButton(
              onPressed: () => showUserActionHome(
                context: context,
                sourcePage: 'StayingUsersListPage',
                user: const {'pokerName': 'Alice', 'userId': 'u1'},
              ),
              child: const Text('open-menu'),
            ),
          ),
        ),
      ),
    );
    await tester.tap(find.text('open-menu'));
    await tester.pumpAndSettle();

    expect(tester.takeException(), isNull);
    expect(find.text('Alice'), findsOneWidget);
  });

  testWidgets(
      'showUserActionHome does not overflow with keyboard inset',
      (tester) async {
    tester.view.physicalSize = const Size(1024, 768);
    tester.view.devicePixelRatio = 1.0;
    addTearDown(tester.view.reset);

    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(
          body: Builder(
            builder: (context) => TextButton(
              onPressed: () => showUserActionHome(
                context: context,
                sourcePage: 'StayingUsersListPage',
                user: const {'pokerName': 'Alice', 'userId': 'u1'},
              ),
              child: const Text('open-menu'),
            ),
          ),
        ),
      ),
    );
    await tester.tap(find.text('open-menu'));
    await tester.pumpAndSettle();

    tester.view.viewInsets = const FakeViewPadding(bottom: 360);
    await tester.pump();

    expect(tester.takeException(), isNull);
    expect(find.text('Alice'), findsOneWidget);
  });

  testWidgets(
      'parent menu stays mounted under child dialog + keyboard without overflow',
      (tester) async {
    tester.view.physicalSize = const Size(1024, 768);
    tester.view.devicePixelRatio = 1.0;
    addTearDown(tester.view.reset);

    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(
          body: Builder(
            builder: (context) => TextButton(
              onPressed: () {
                showDialog<void>(
                  context: context,
                  builder: (_) => Dialog(
                    child: KeyboardSafeDialogBody(
                      maxWidth: 520,
                      child: Column(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          const Text('操作メニュー'),
                          ...List.generate(
                            8,
                            (i) => SizedBox(
                              height: 72,
                              child: Text('tile $i'),
                            ),
                          ),
                        ],
                      ),
                    ),
                  ),
                );
                showDialog<void>(
                  context: context,
                  builder: (_) => const AlertDialog(
                    title: Text('chip預入'),
                    content: TextField(
                      decoration: InputDecoration(labelText: '預入額'),
                    ),
                  ),
                );
              },
              child: const Text('open-stack'),
            ),
          ),
        ),
      ),
    );
    await tester.tap(find.text('open-stack'));
    await tester.pumpAndSettle();

    tester.view.viewInsets = const FakeViewPadding(bottom: 300);
    await tester.pump();

    expect(tester.takeException(), isNull);
    expect(find.text('操作メニュー'), findsOneWidget);
    expect(find.text('chip預入'), findsOneWidget);
    expect(find.byType(TextField), findsOneWidget);
  });

  test('B3 parent keep-open on child dialogs is unchanged', () {
    final home =
        File('lib/user_actions/user_action_home.dart').readAsStringSync();
    expect(home.contains('親メニューは開いたまま子ダイアログを重ねる'), isTrue);
    expect(home.contains('KeyboardSafeDialogBody'), isTrue);
    expect(home.contains('shouldCloseUserActionMenuAfterLeave'), isTrue);
    expect(home.contains('closeUserActionMenuOnLeaveSuccess: true'), isTrue);
  });
}
