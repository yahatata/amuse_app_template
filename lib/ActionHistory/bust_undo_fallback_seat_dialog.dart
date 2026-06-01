import 'package:flutter/material.dart';

import 'bust_undo_seat_selection_error.dart';

/// Bust undo で元席が埋まっている場合に、戻し先の空席を1つ選ばせる。
Future<Map<String, dynamic>?> showBustUndoFallbackSeatDialog(
  BuildContext context,
  BustUndoSeatSelectionRequired selection,
) {
  if (selection.availableSeats.isEmpty) {
    return showDialog<Map<String, dynamic>?>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Bust 取消不可'),
        content: const Text('空席がないため、Bust取消できません。'),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(context).pop(null),
            child: const Text('閉じる'),
          ),
        ],
      ),
    );
  }

  return showDialog<Map<String, dynamic>?>(
    context: context,
    builder: (context) {
      return AlertDialog(
        title: const Text('戻し先の空席を選択'),
        content: SizedBox(
          width: double.maxFinite,
          child: ListView.separated(
            shrinkWrap: true,
            itemCount: selection.availableSeats.length,
            separatorBuilder: (_, __) => const Divider(height: 1),
            itemBuilder: (context, index) {
              final seat = selection.availableSeats[index];
              return ListTile(
                title: Text(formatBustUndoFallbackSeatLabel(seat)),
                onTap: () => Navigator.of(context).pop(bustUndoFallbackSeatPayload(seat)),
              );
            },
          ),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(context).pop(null),
            child: const Text('キャンセル'),
          ),
        ],
      );
    },
  );
}

String buildBustUndoFallbackSeatConfirmMessage({
  required String actionDisplayName,
  required String targetDisplay,
  required Map<String, dynamic> fallbackSeat,
}) {
  final seatLabel = formatBustUndoFallbackSeatLabel(fallbackSeat);
  return '元の席は使用中のため、以下の席に復帰します。\n\n'
      '操作: $actionDisplayName\n'
      '対象: $targetDisplay\n'
      '戻し先: $seatLabel';
}

/// 席選択後、復帰席を確認してから Bust 取消を実行する。
Future<bool> showBustUndoFallbackSeatConfirmDialog(
  BuildContext context, {
  required String actionDisplayName,
  required String targetDisplay,
  required Map<String, dynamic> fallbackSeat,
}) {
  final message = buildBustUndoFallbackSeatConfirmMessage(
    actionDisplayName: actionDisplayName,
    targetDisplay: targetDisplay,
    fallbackSeat: fallbackSeat,
  );

  return showDialog<bool>(
    context: context,
    builder: (context) => AlertDialog(
      title: const Text('戻し先席の確認'),
      content: Text(message),
      actions: [
        TextButton(
          onPressed: () => Navigator.of(context).pop(false),
          child: const Text('キャンセル'),
        ),
        ElevatedButton(
          onPressed: () => Navigator.of(context).pop(true),
          child: const Text('この席で復帰'),
        ),
      ],
    ),
  ).then((value) => value ?? false);
}
