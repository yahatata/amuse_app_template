import 'package:flutter/material.dart';

/// 支払い方法選択ダイアログ
/// 会計開始時に支払い方法を選択するためのダイアログ
class PaymentMethodDialog extends StatelessWidget {
  final Function(String) onSelected;

  const PaymentMethodDialog({super.key, required this.onSelected});

  @override
  Widget build(BuildContext context) {
    return AlertDialog(
      title: const Text('支払い方法を選択'),
      content: SingleChildScrollView(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            _buildPaymentMethodTile(
              context,
              icon: Icons.attach_money,
              title: '現金',
              paymentMethod: 'cash',
              color: Colors.green,
            ),
            const Divider(),
            _buildPaymentMethodTile(
              context,
              icon: Icons.credit_card,
              title: 'クレジットカード',
              paymentMethod: 'credit_card',
              color: Colors.blue,
            ),
            const Divider(),
            _buildPaymentMethodTile(
              context,
              icon: Icons.qr_code,
              title: '電子マネー',
              paymentMethod: 'electronic_money',
              color: Colors.orange,
            ),
            const Divider(),
            _buildPaymentMethodTile(
              context,
              icon: Icons.star,
              title: 'ポイントA',
              paymentMethod: 'pointA',
              color: Colors.purple,
            ),
            const Divider(),
            _buildPaymentMethodTile(
              context,
              icon: Icons.stars,
              title: 'ポイントB',
              paymentMethod: 'pointB',
              color: Colors.deepPurple,
            ),
            const Divider(),
            _buildPaymentMethodTile(
              context,
              icon: Icons.casino,
              title: 'サイドゲームチップ',
              paymentMethod: 'sideGameChip',
              color: Colors.teal,
            ),
          ],
        ),
      ),
      actions: [
        TextButton(
          onPressed: () => Navigator.of(context).pop(),
          child: const Text('キャンセル'),
        ),
      ],
    );
  }

  Widget _buildPaymentMethodTile(
    BuildContext context, {
    required IconData icon,
    required String title,
    required String paymentMethod,
    required Color color,
  }) {
    return ListTile(
      leading: Icon(icon, color: color, size: 32),
      title: Text(
        title,
        style: const TextStyle(fontSize: 16, fontWeight: FontWeight.bold),
      ),
      onTap: () {
        onSelected(paymentMethod);
      },
      trailing: const Icon(Icons.arrow_forward_ios, size: 16),
      contentPadding: const EdgeInsets.symmetric(vertical: 4, horizontal: 8),
    );
  }
}
