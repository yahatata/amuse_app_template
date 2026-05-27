import 'package:flutter/material.dart';

class TableSeatCell extends StatelessWidget {
  final int seatNo;
  final String? userId;
  final String? pokerName;
  final bool isOccupied;

  /// 置きバケ席など userId が無い占有席でも表示を分けられるようにする。
  final bool isOkibakeSeat;

  const TableSeatCell({
    super.key,
    required this.seatNo,
    this.userId,
    this.pokerName,
    required this.isOccupied,
    this.isOkibakeSeat = false,
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
            Text(
              seatNo.toString(),
              style: TextStyle(
                fontSize: 10,
                fontWeight: FontWeight.bold,
                color: _getTextColor(),
              ),
            ),
            const SizedBox(height: 2),
            if (isOccupied) ...[
              Icon(
                isOkibakeSeat ? Icons.face_retouching_natural : Icons.person,
                size: 12,
                color: _getTextColor(),
              ),
              Text(
                pokerName != null && pokerName!.isNotEmpty
                    ? _getShortPokerName(pokerName!)
                    : (userId != null ? _getShortUserId(userId!) : '—'),
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
      return isOkibakeSeat
          ? Colors.teal.withValues(alpha: 0.85)
          : Colors.blue.withValues(alpha: 0.8);
    }
    return Colors.grey.withValues(alpha: 0.1);
  }

  Color _getBorderColor() {
    if (isOccupied) {
      return isOkibakeSeat ? Colors.teal : Colors.blue;
    }
    return Colors.grey.withValues(alpha: 0.3);
  }

  Color _getTextColor() {
    if (isOccupied) {
      return Colors.white;
    }
    return Colors.grey[600]!;
  }

  String _getShortUserId(String userId) {
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
