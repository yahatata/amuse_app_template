import 'package:amuse_app_template/user/balance_display.dart';
import 'package:amuse_app_template/user/point_ids.dart';
import 'package:flutter/material.dart';

/// 支払い方法選択ダイアログ（A-7: 有効残高は config 表示名）
class PaymentMethodDialog extends StatelessWidget {
  final Function(String) onSelected;

  const PaymentMethodDialog({super.key, required this.onSelected});

  @override
  Widget build(BuildContext context) {
    final enabled = enabledBalanceIdsFromStoreConfig();
    return AlertDialog(
      title: const Text('支払い方法を選択'),
      content: SingleChildScrollView(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            _buildPaymentMethodTile(
              context,
              icon: Icons.attach_money,
              title: balanceDisplayName('cash'),
              paymentMethod: 'cash',
              color: Colors.green,
            ),
            const Divider(),
            _buildPaymentMethodTile(
              context,
              icon: Icons.credit_card,
              title: balanceDisplayName('credit_card'),
              paymentMethod: 'credit_card',
              color: Colors.blue,
            ),
            const Divider(),
            _buildPaymentMethodTile(
              context,
              icon: Icons.qr_code,
              title: balanceDisplayName('electronic_money'),
              paymentMethod: 'electronic_money',
              color: Colors.orange,
            ),
            for (final id in enabled) ...[
              const Divider(),
              _buildPaymentMethodTile(
                context,
                icon: id == kSideGameChipId ? Icons.casino : Icons.star,
                title: balanceDisplayName(id),
                paymentMethod: id,
                color: id == kSideGameChipId ? Colors.teal : Colors.purple,
              ),
            ],
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
