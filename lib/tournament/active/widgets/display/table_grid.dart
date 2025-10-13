import 'package:flutter/material.dart';
import 'package:amuse_app_template/tournament/active/models/table_seats.dart';
import 'table_seat_cell.dart';

class TableGrid extends StatelessWidget {
  final Map<String, TableSeats> tableSeats;
  final Function(String tableId)? onTableTap;

  const TableGrid({
    super.key,
    required this.tableSeats,
    this.onTableTap,
  });

  @override
  Widget build(BuildContext context) {
    final tableIds = tableSeats.keys.toList()..sort();
    
    return GridView.builder(
      padding: const EdgeInsets.all(16),
      gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
        crossAxisCount: 2,
        childAspectRatio: 1.2,
        crossAxisSpacing: 16,
        mainAxisSpacing: 16,
      ),
      itemCount: tableIds.length,
      itemBuilder: (context, index) {
        final tableId = tableIds[index];
        final tableSeat = tableSeats[tableId]!;
        
        return _buildTableCard(context, tableId, tableSeat);
      },
    );
  }

  Widget _buildTableCard(BuildContext context, String tableId, TableSeats tableSeat) {
    return Card(
      elevation: 4,
      child: InkWell(
        onTap: () => onTableTap?.call(tableId),
        borderRadius: BorderRadius.circular(8),
        child: Padding(
          padding: const EdgeInsets.all(12),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              // テーブルヘッダー
              Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  Text(
                    'テーブル $tableId',
                    style: const TextStyle(
                      fontSize: 16,
                      fontWeight: FontWeight.bold,
                    ),
                  ),
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                    decoration: BoxDecoration(
                      color: _getTableStatusColor(tableSeat),
                      borderRadius: BorderRadius.circular(12),
                    ),
                    child: Text(
                      '${tableSeat.occupiedSeatCount}/${tableSeat.totalSeatCount}',
                      style: const TextStyle(
                        color: Colors.white,
                        fontSize: 12,
                        fontWeight: FontWeight.bold,
                      ),
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 8),
              
              // 座席グリッド
              Expanded(
                child: GridView.builder(
                  physics: const NeverScrollableScrollPhysics(),
                  gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
                    crossAxisCount: 3,
                    childAspectRatio: 1.0,
                    crossAxisSpacing: 4,
                    mainAxisSpacing: 4,
                  ),
                  itemCount: tableSeat.totalSeatCount,
                  itemBuilder: (context, index) {
                    final seatNo = index + 1;
                    final userId = tableSeat.getUserIdAtSeat(seatNo);
                    final pokerName = tableSeat.getPokerNameAtSeat(seatNo);
                    
                    return TableSeatCell(
                      seatNo: seatNo,
                      userId: userId,
                      pokerName: pokerName,
                      isOccupied: tableSeat.isSeatOccupied(seatNo),
                    );
                  },
                ),
              ),
              
              // 更新時刻
              Container(
                width: double.infinity,
                padding: const EdgeInsets.all(4),
                child: Text(
                  '更新: ${_formatTime(tableSeat.updatedAt)}',
                  style: TextStyle(
                    fontSize: 10,
                    color: Colors.grey[600],
                  ),
                  textAlign: TextAlign.center,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Color _getTableStatusColor(TableSeats tableSeat) {
    final occupancyRate = tableSeat.occupiedSeatCount / tableSeat.totalSeatCount;
    
    if (occupancyRate >= 0.8) {
      return Colors.red; // ほぼ満席
    } else if (occupancyRate >= 0.5) {
      return Colors.orange; // 半分以上
    } else {
      return Colors.green; // 空席あり
    }
  }

  String _formatTime(DateTime dateTime) {
    return '${dateTime.hour.toString().padLeft(2, '0')}:${dateTime.minute.toString().padLeft(2, '0')}';
  }
}
