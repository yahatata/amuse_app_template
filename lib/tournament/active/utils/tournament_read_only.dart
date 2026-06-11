import 'package:flutter/material.dart';

/// ended / force_ended のトーナメントは閲覧のみ。
bool isTournamentReadOnlyStatus(String? status) {
  return status == 'ended' || status == 'force_ended';
}

String tournamentReadOnlyBannerMessage(String? status) {
  if (status == 'force_ended') {
    return 'このトーナメントは強制終了済みです。結果と履歴のみ確認できます。';
  }
  return 'このトーナメントは終了済みです。結果と履歴のみ確認できます。';
}

/// 終了済みトーナメント画面の上部バナー。
class TournamentReadOnlyBanner extends StatelessWidget {
  const TournamentReadOnlyBanner({
    super.key,
    required this.status,
  });

  final String? status;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: Colors.blueGrey.shade50,
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Icon(Icons.info_outline, color: Colors.blueGrey.shade700, size: 20),
            const SizedBox(width: 8),
            Expanded(
              child: Text(
                tournamentReadOnlyBannerMessage(status),
                style: TextStyle(
                  color: Colors.blueGrey.shade800,
                  fontSize: 13,
                  height: 1.35,
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
