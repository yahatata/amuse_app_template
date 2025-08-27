import 'package:flutter/material.dart';

class TableSeatCell extends StatelessWidget {
  final int seatNo;
  final String? userId;
  final String? pokerName;
  final bool isOccupied;

  const TableSeatCell({
    super.key,
    required this.seatNo,
    this.userId,
    this.pokerName,
    required this.isOccupied,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: BoxDecoration(
        color: _getSeatColor(),
        borderRadius: BorderRadius.circular(4),
        border: Border.all(
          color: _getBorderColor(),
          width: 1,
        ),
      ),
      child: Center(
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            // 座席番号
            Text(
              seatNo.toString(),
              style: TextStyle(
                fontSize: 10,
                fontWeight: FontWeight.bold,
                color: _getTextColor(),
              ),
            ),
            const SizedBox(height: 2),
            // ユーザー情報または空席表示
            if (isOccupied && userId != null) ...[
              Icon(
                Icons.person,
                size: 12,
                color: _getTextColor(),
              ),
              Text(
                pokerName != null ? _getShortPokerName(pokerName!) : _getShortUserId(userId!),
                style: TextStyle(
                  fontSize: 8,
                  color: _getTextColor(),
                ),
                textAlign: TextAlign.center,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
              ),
            ] else ...[
              Icon(
                Icons.event_seat,
                size: 12,
                color: _getTextColor(),
              ),
              Text(
                '空席',
                style: TextStyle(
                  fontSize: 8,
                  color: _getTextColor(),
                ),
                textAlign: TextAlign.center,
              ),
            ],
          ],
        ),
      ),
    );
  }

  Color _getSeatColor() {
    if (isOccupied) {
      return Colors.blue.withOpacity(0.8);
    } else {
      return Colors.grey.withOpacity(0.1);
    }
  }

  Color _getBorderColor() {
    if (isOccupied) {
      return Colors.blue;
    } else {
      return Colors.grey.withOpacity(0.3);
    }
  }

  Color _getTextColor() {
    if (isOccupied) {
      return Colors.white;
    } else {
      return Colors.grey[600]!;
    }
  }

  String _getShortUserId(String userId) {
    // userIdから短縮名を生成（例: "user123" -> "123"）
    if (userId.startsWith('user')) {
      return userId.substring(4);
    }
    return userId.length > 3 ? userId.substring(0, 3) : userId;
  }

  String _getShortPokerName(String pokerName) {
    if (pokerName.length <= 6) return pokerName;
    return '${pokerName.substring(0, 6)}...';
  }
}
