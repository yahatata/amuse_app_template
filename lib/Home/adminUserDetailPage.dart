import 'package:amuse_app_template/Home/home_list_load_errors.dart';
import 'package:amuse_app_template/services/active_stays_service.dart';
import 'package:amuse_app_template/user/balance_display.dart';
import 'package:amuse_app_template/user/user_type_display.dart';
import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter/material.dart';

/// 店舗運用向けユーザー詳細（参照専用）。
///
/// `users/{userId}` を Stream 購読し、表示中は常に最新を反映する。
/// 一覧からの [initialData] がある場合は初回待ちなしで即描画する。
class AdminUserDetailPage extends StatelessWidget {
  const AdminUserDetailPage({
    super.key,
    required this.userId,
    this.initialData,
  });

  final String userId;
  final Map<String, dynamic>? initialData;

  /// `birthMonthDay`（MMDD 想定）を現場向け表示に整形。不正・欠落は「未設定」。
  String _formatBirthday(dynamic value) {
    final raw = value?.toString().trim() ?? '';
    if (raw.isEmpty) return '未設定';
    if (RegExp(r'^\d{4}$').hasMatch(raw)) {
      final month = int.parse(raw.substring(0, 2));
      final day = int.parse(raw.substring(2, 4));
      if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
        return '$month月$day日';
      }
    }
    return raw;
  }

  @override
  Widget build(BuildContext context) {
    return StreamBuilder<DocumentSnapshot<Map<String, dynamic>>>(
      stream: FirebaseFirestore.instance
          .collection('users')
          .doc(userId)
          .snapshots(),
      builder: (context, snapshot) {
        final streamData = snapshot.data?.data();
        final data = streamData ??
            (initialData != null
                ? Map<String, dynamic>.from(initialData!)
                : null);

        final pokerName =
            data == null ? 'ユーザー詳細' : displayOrUnset(data['pokerName']);

        return Scaffold(
          appBar: AppBar(
            title: Text(pokerName),
            backgroundColor: Colors.blue[600],
            foregroundColor: Colors.white,
          ),
          body: _buildBody(snapshot, data),
        );
      },
    );
  }

  Widget _buildBody(
    AsyncSnapshot<DocumentSnapshot<Map<String, dynamic>>> snapshot,
    Map<String, dynamic>? data,
  ) {
    if (snapshot.hasError && data == null) {
      return const Center(
        child: Padding(
          padding: EdgeInsets.all(24),
          child: Text(
            kHomeUserDetailLoadFailedMessage,
            textAlign: TextAlign.center,
          ),
        ),
      );
    }

    if (data == null) {
      if (snapshot.connectionState == ConnectionState.waiting) {
        return const Center(child: CircularProgressIndicator());
      }
      return const Center(child: Text('ユーザーが見つかりません'));
    }

    // ドキュメント削除などで stream が「存在しない」になった場合
    if (snapshot.hasData && snapshot.data?.exists == false) {
      return const Center(child: Text('ユーザーが見つかりません'));
    }

    final enabledIds = enabledBalanceIdsFromStoreConfig();

    return SingleChildScrollView(
      padding: const EdgeInsets.all(16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          if (snapshot.hasError)
            const Padding(
              padding: EdgeInsets.only(bottom: 12),
              child: Text(
                kHomeUserDetailRealtimeFailedMessage,
                style: TextStyle(color: Colors.red),
              ),
            ),          Card(
            elevation: 4,
            child: Padding(
              padding: const EdgeInsets.all(16),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      CircleAvatar(
                        radius: 30,
                        backgroundColor: Colors.blue[100],
                        child: Icon(
                          Icons.person,
                          size: 30,
                          color: Colors.blue[600],
                        ),
                      ),
                      const SizedBox(width: 16),
                      Expanded(
                        child: Text(
                          displayOrUnset(data['pokerName']),
                          style: const TextStyle(
                            fontSize: 24,
                            fontWeight: FontWeight.bold,
                          ),
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 16),
                  _buildInfoRow('ポーカーネーム', displayOrUnset(data['pokerName'])),
                  _buildInfoRow('誕生日', _formatBirthday(data['birthMonthDay'])),
                  _buildStayStatusRow(),
                  _buildInfoRow(
                    '最終来店日時',
                    formatUserTimestamp(data['lastCheckInAt']),
                  ),
                ],
              ),
            ),
          ),
          const SizedBox(height: 16),
          Card(
            elevation: 4,
            child: Padding(
              padding: const EdgeInsets.all(16),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Text(
                    '所持残高',
                    style: TextStyle(
                      fontSize: 18,
                      fontWeight: FontWeight.bold,
                    ),
                  ),
                  const SizedBox(height: 8),
                  if (enabledIds.isEmpty)
                    const Text('表示可能な残高がありません')
                  else
                    // 名前は省略せず全表示し、数値列は最長名幅に揃えて左寄せ
                    Table(
                      columnWidths: const {
                        0: IntrinsicColumnWidth(),
                        1: FlexColumnWidth(),
                      },
                      defaultVerticalAlignment:
                          TableCellVerticalAlignment.middle,
                      children: [
                        for (final id in enabledIds)
                          TableRow(
                            children: [
                              Padding(
                                padding: const EdgeInsets.only(
                                  top: 4,
                                  bottom: 4,
                                  right: 12,
                                ),
                                child: Text(
                                  '${balanceDisplayName(id)}:',
                                  style: const TextStyle(
                                    fontWeight: FontWeight.w500,
                                  ),
                                ),
                              ),
                              Padding(
                                padding:
                                    const EdgeInsets.symmetric(vertical: 4),
                                child: Text(
                                  formatBalanceFieldDisplay(data, id),
                                  style: const TextStyle(
                                    color: Colors.black87,
                                  ),
                                ),
                              ),
                            ],
                          ),
                      ],
                    ),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }

  /// 入店状況は [ActiveStaysService]（`isActive == true`）を正本とする。
  Widget _buildStayStatusRow() {
    return StreamBuilder<QuerySnapshot>(
      stream: ActiveStaysService.instance.stream,
      builder: (context, snapshot) {
        String status;
        Color? valueColor;
        if (snapshot.hasError) {
          status = '取得失敗';
        } else if (snapshot.connectionState == ConnectionState.waiting &&
            !snapshot.hasData) {
          status = '確認中…';
        } else {
          final activeIds =
              snapshot.data?.docs.map((d) => d.id).toSet() ?? {};
          final isInStore = isUserInActiveStaySet(userId, activeIds);
          status = adminStayStatusLabel(isInStore);
          valueColor = isInStore ? Colors.green : Colors.red;
        }
        return _buildInfoRow('入店状況', status, valueColor: valueColor);
      },
    );
  }

  Widget _buildInfoRow(
    String label,
    String value, {
    Color? valueColor,
  }) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 4),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.center,
        children: [
          SizedBox(
            width: 140,
            child: Text(
              '$label:',
              maxLines: 1,
              softWrap: false,
              overflow: TextOverflow.ellipsis,
              style: const TextStyle(fontWeight: FontWeight.w500),
            ),
          ),
          Expanded(
            child: Text(
              value,
              maxLines: 1,
              softWrap: false,
              overflow: TextOverflow.ellipsis,
              style: TextStyle(
                color: valueColor ?? Colors.black87,
                fontWeight:
                    valueColor != null ? FontWeight.w500 : FontWeight.normal,
              ),
            ),
          ),
        ],
      ),
    );
  }
}
